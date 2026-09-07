/* Deterministic resolution for universal d20 checks. Randomness is supplied. */

import {
  createTraceNode,
  type EngineTrace,
  type TraceInput,
  type TraceNode,
} from "../infrastructure/trace";
import type { EngineError } from "../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../infrastructure/result";
import {
  collectApplicableCheckModifiers,
  sumCheckBaseContributions,
  sumCheckModifiers,
} from "./modifiers";
import type {
  CheckBaseContribution,
  CheckDiceInput,
  CheckDiceResolution,
  CheckModifierContribution,
  CheckRequest,
  CheckResolution,
  FixedCheckRequest,
  FixedCheckResolution,
  OpposedCheckRequest,
  OpposedCheckResolution,
} from "./types";

function retainedIndexFor(
  rolls: readonly number[],
  advantage: number,
): number {
  if (advantage === 0) return 0;

  let retainedIndex = 0;

  for (let index = 1; index < rolls.length; index += 1) {
    const retained = rolls[retainedIndex];
    const candidate = rolls[index];

    if (retained === undefined || candidate === undefined) continue;

    if (
      (advantage > 0 && candidate > retained) ||
      (advantage < 0 && candidate < retained)
    ) {
      retainedIndex = index;
    }
  }

  return retainedIndex;
}

/**
 * How many d20s a signed advantage level requires.
 *
 * Declared once and read by both the request validator and the resolver
 * below. They used to agree by coincidence — validation.ts computed it inline
 * and resolution.ts only documented it in a comment — which meant a caller
 * that skipped validation, as every sensory resolver does, reached a resolver
 * that trusted a rule nothing had enforced.
 */
export function expectedRollCount(advantage: number): number {
  return 1 + Math.abs(advantage);
}


function findCheckDiceIssues(
  input: CheckDiceInput,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!Number.isInteger(input.advantage)) {
    errors.push({
      code: "checks.dice.advantage.invalid",
      message: "A check's advantage level must be a whole number.",
      audience: "developer",
      required: "integer",
      actual: String(input.advantage),
    });
  }

  if (!Array.isArray(input.rolls) || input.rolls.length === 0) {
    errors.push({
      code: "checks.dice.empty",
      message: "A check requires at least one supplied d20 roll.",
      audience: "developer",
      required: "one or more d20 rolls",
      actual: Array.isArray(input.rolls) ? "none" : String(input.rolls),
    });

    return errors;
  }

  if (
    Number.isInteger(input.advantage) &&
    input.rolls.length !== expectedRollCount(input.advantage)
  ) {
    errors.push({
      code: "checks.dice.count.mismatch",
      message: "The number of supplied d20 rolls does not match the advantage level.",
      audience: "developer",
      required: String(expectedRollCount(input.advantage)),
      actual: String(input.rolls.length),
    });
  }

  input.rolls.forEach((roll, index) => {
    if (!Number.isInteger(roll) || roll < 1 || roll > 20) {
      errors.push({
        code: "checks.dice.roll.invalid",
        message: `Supplied d20 roll ${index + 1} is not a face of a d20.`,
        audience: "developer",
        required: "integer 1..20",
        actual: String(roll),
      });
    }
  });

  return errors;
}


function diceFailureTrace(input: CheckDiceInput): EngineTrace {
  return {
    root: createTraceNode({
      id: "checks.dice",
      label: "Resolve d20 Pool",
      formula: "supplied rolls rejected before resolution",
      inputs: {
        advantage: {
          value: Number.isFinite(input.advantage) ? input.advantage : 0,
        },
        supplied: {
          value: Array.isArray(input.rolls) ? input.rolls.length : 0,
        },
      },
      output: 0,
    }),
  };
}


function asFailure(
  trace: EngineTrace,
  errors: readonly EngineError[],
): ReturnType<typeof engineFailure> {
  const [first, ...rest] = errors as NonEmptyArray<EngineError>;

  return engineFailure(trace, [first, ...rest]);
}


/**
 * Selects the d20 retained by a signed advantage pool.
 *
 * The caller supplies exactly 1 + abs(advantage) rolls. Positive advantage
 * keeps the highest; negative advantage keeps the lowest. Equal dice retain
 * the earliest supplied die so resolution is deterministic.
 *
 * Malformed input returns a failure rather than throwing. It used to throw a
 * RangeError on an empty pool, which made "no dice were supplied" — an
 * ordinary thing for a host to get wrong — the one input in the check system
 * that could not be reported alongside every other validation error, and the
 * only one a caller had to write a try/catch for.
 */
export function resolveCheckDice(
  input: CheckDiceInput,
): EngineResult<CheckDiceResolution> {
  const issues = findCheckDiceIssues(input);

  if (issues.length > 0) return asFailure(diceFailureTrace(input), issues);

  const retainedIndex = retainedIndexFor(input.rolls, input.advantage);
  const retainedRoll = input.rolls[retainedIndex];

  if (retainedRoll === undefined) {
    /* Unreachable: a non-empty pool always retains one of its own entries. */
    return asFailure(diceFailureTrace(input), [{
      code: "checks.dice.empty",
      message: "A check requires at least one supplied d20 roll.",
      audience: "developer",
      required: "one or more d20 rolls",
      actual: "none",
    }]);
  }

  const resolution: CheckDiceResolution = {
    advantage: input.advantage,
    rolls: [...input.rolls],
    retainedIndex,
    retainedRoll,
    mode: input.advantage > 0
      ? "highest"
      : input.advantage < 0
        ? "lowest"
        : "single",
  };

  return engineSuccess(resolution, { root: createDiceTraceNode(resolution) });
}

function addTraceInput(
  inputs: Record<string, TraceInput>,
  desiredKey: string,
  amount: number,
): void {
  let key = desiredKey;
  let suffix = 2;

  while (inputs[key] !== undefined) {
    key = `${desiredKey} (${suffix})`;
    suffix += 1;
  }

  inputs[key] = { value: amount };
}

function createDiceTraceNode(dice: CheckDiceResolution): TraceNode {
  const inputs: Record<string, TraceInput> = {
    advantage: { value: dice.advantage },
  };

  dice.rolls.forEach((roll, index) => {
    inputs[`d20.${index + 1}`] = { value: roll };
  });

  return createTraceNode({
    id: "checks.dice",
    label: "Resolve d20 Pool",
    formula: dice.mode === "highest"
      ? "retain highest supplied d20"
      : dice.mode === "lowest"
        ? "retain lowest supplied d20"
        : "retain supplied d20",
    inputs,
    output: dice.retainedRoll,
  });
}

function createModifierTraceNode(
  baseContributions: readonly CheckBaseContribution[],
  modifiers: readonly CheckModifierContribution[],
): TraceNode {
  const inputs: Record<string, TraceInput> = {};

  for (const contribution of baseContributions) {
    const prefix = contribution.source === undefined
      ? "base"
      : `${contribution.source.type}:${contribution.source.id}`;

    addTraceInput(inputs, `${prefix}.${contribution.id}`, contribution.amount);
  }

  for (const modifier of modifiers) {
    addTraceInput(
      inputs,
      `${modifier.channel}.${modifier.source.type}:${modifier.source.id}`,
      modifier.amount,
    );
  }

  const output = sumCheckBaseContributions(baseContributions) +
    sumCheckModifiers(modifiers);

  return createTraceNode({
    id: "checks.modifiers",
    label: "Resolve Check Modifier",
    formula: "sum governing contributions and applicable sourced modifiers",
    inputs,
    output,
  });
}

/** Resolves one check total without interpreting success or failure. */
export function resolveCheck(
  request: CheckRequest,
): EngineResult<CheckResolution> {
  const diceResult = resolveCheckDice(request.dice);

  if (!diceResult.success) return diceResult;

  const dice = diceResult.payload;
  const applicableModifiers = collectApplicableCheckModifiers(
    request.modifiers,
    request.scope,
  );
  const baseModifierTotal = sumCheckBaseContributions(
    request.baseContributions,
  );
  const situationalModifierTotal = sumCheckModifiers(applicableModifiers);
  const finalModifier = baseModifierTotal + situationalModifierTotal;
  const total = dice.retainedRoll + finalModifier;

  const trace = createTraceNode({
    id: "checks.resolve",
    label: "Resolve Check",
    formula: "retained d20 + final modifier",
    inputs: {
      retainedD20: { value: dice.retainedRoll },
      finalModifier: { value: finalModifier },
    },
    output: total,
    children: [
      createDiceTraceNode(dice),
      createModifierTraceNode(
        request.baseContributions,
        applicableModifiers,
      ),
    ],
  });

  return engineSuccess({
    scope: request.scope,
    dice,
    baseContributions: [...request.baseContributions],
    applicableModifiers,
    baseModifierTotal,
    situationalModifierTotal,
    finalModifier,
    total,
    trace,
  }, { root: trace });
}

/** Resolves one check against a fixed difficulty. */
export function resolveFixedCheck(
  request: FixedCheckRequest,
): EngineResult<FixedCheckResolution> {
  const checkResult = resolveCheck(request.check);

  if (!checkResult.success) return checkResult;

  const check = checkResult.payload;
  const tiePolicy = request.tiePolicy ?? "succeeds";
  const margin = check.total - request.difficulty;
  const tied = margin === 0;
  const success = margin > 0 || (tied && tiePolicy === "succeeds");

  const trace = createTraceNode({
    id: "checks.fixed",
    label: "Resolve Fixed Check",
    formula: "check total - difficulty",
    inputs: {
      checkTotal: { value: check.total },
      difficulty: { value: request.difficulty },
    },
    output: margin,
    children: [check.trace],
  });

  return engineSuccess({
    check,
    difficulty: request.difficulty,
    margin,
    success,
    tied,
    tiePolicy,
    trace,
  }, { root: trace });
}

/** Resolves two complete checks and preserves both sides of the contest. */
export function resolveOpposedCheck(
  request: OpposedCheckRequest,
): EngineResult<OpposedCheckResolution> {
  const initiatorResult = resolveCheck(request.initiator);

  if (!initiatorResult.success) return initiatorResult;

  const opponentResult = resolveCheck(request.opponent);

  if (!opponentResult.success) return opponentResult;

  const initiator = initiatorResult.payload;
  const opponent = opponentResult.payload;
  const margin = initiator.total - opponent.total;
  const tied = margin === 0;
  const winner = margin > 0
    ? "initiator"
    : margin < 0
      ? "opponent"
      : request.tiesFavor;

  const trace = createTraceNode({
    id: "checks.opposed",
    label: "Resolve Opposed Check",
    formula: "initiator total - opponent total",
    inputs: {
      initiatorTotal: { value: initiator.total },
      opponentTotal: { value: opponent.total },
    },
    output: margin,
    children: [initiator.trace, opponent.trace],
  });

  return engineSuccess({
    initiator,
    opponent,
    margin,
    tied,
    winner,
    tiesFavor: request.tiesFavor,
    trace,
  }, { root: trace });
}

