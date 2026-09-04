/* Deterministic resolution for universal d20 checks. Randomness is supplied. */

import { createTraceNode, type TraceInput, type TraceNode } from "../../infrastructure/trace";
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
 * Selects the d20 retained by a signed advantage pool.
 *
 * The caller supplies exactly 1 + abs(advantage) rolls. Positive advantage
 * keeps the highest; negative advantage keeps the lowest. Equal dice retain
 * the earliest supplied die so resolution is deterministic.
 */
export function resolveCheckDice(input: CheckDiceInput): CheckDiceResolution {
  const retainedIndex = retainedIndexFor(input.rolls, input.advantage);
  const retainedRoll = input.rolls[retainedIndex];

  if (retainedRoll === undefined) {
    throw new RangeError("A check requires at least one supplied d20 roll.");
  }

  return {
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
    id: "gameplay.checks.dice",
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
    id: "gameplay.checks.modifiers",
    label: "Resolve Check Modifier",
    formula: "sum governing contributions and applicable sourced modifiers",
    inputs,
    output,
  });
}

/** Resolves one check total without interpreting success or failure. */
export function resolveCheck(request: CheckRequest): CheckResolution {
  const dice = resolveCheckDice(request.dice);
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
    id: "gameplay.checks.resolve",
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

  return {
    scope: request.scope,
    dice,
    baseContributions: [...request.baseContributions],
    applicableModifiers,
    baseModifierTotal,
    situationalModifierTotal,
    finalModifier,
    total,
    trace,
  };
}

/** Resolves one check against a fixed difficulty. */
export function resolveFixedCheck(
  request: FixedCheckRequest,
): FixedCheckResolution {
  const check = resolveCheck(request.check);
  const tiePolicy = request.tiePolicy ?? "succeeds";
  const margin = check.total - request.difficulty;
  const tied = margin === 0;
  const success = margin > 0 || (tied && tiePolicy === "succeeds");

  const trace = createTraceNode({
    id: "gameplay.checks.fixed",
    label: "Resolve Fixed Check",
    formula: "check total - difficulty",
    inputs: {
      checkTotal: { value: check.total },
      difficulty: { value: request.difficulty },
    },
    output: margin,
    children: [check.trace],
  });

  return {
    check,
    difficulty: request.difficulty,
    margin,
    success,
    tied,
    tiePolicy,
    trace,
  };
}

/** Resolves two complete checks and preserves both sides of the contest. */
export function resolveOpposedCheck(
  request: OpposedCheckRequest,
): OpposedCheckResolution {
  const initiator = resolveCheck(request.initiator);
  const opponent = resolveCheck(request.opponent);
  const margin = initiator.total - opponent.total;
  const tied = margin === 0;
  const winner = margin > 0
    ? "initiator"
    : margin < 0
      ? "opponent"
      : request.tiesFavor;

  const trace = createTraceNode({
    id: "gameplay.checks.opposed",
    label: "Resolve Opposed Check",
    formula: "initiator total - opponent total",
    inputs: {
      initiatorTotal: { value: initiator.total },
      opponentTotal: { value: opponent.total },
    },
    output: margin,
    children: [initiator.trace, opponent.trace],
  });

  return {
    initiator,
    opponent,
    margin,
    tied,
    winner,
    tiesFavor: request.tiesFavor,
    trace,
  };
}

