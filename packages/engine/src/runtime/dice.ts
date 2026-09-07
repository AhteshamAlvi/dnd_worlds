/*
 * Dice are input, not something the engine produces.
 *
 * Nothing here calls Math.random, and no gameplay OUTCOME anywhere in the
 * engine is randomly generated. (The one Math.random in the tree is a UUID
 * fallback in infrastructure/id.ts; it produces an identity, never a result,
 * and decides nothing.) A roll arrives from the caller, identified by what it
 * is FOR, and is validated before any cost commits — so a malformed roll costs the character
 * nothing, exactly like any other invalid operation.
 *
 * The reason is replay. Given one starting state, one operation context, one
 * command and one set of dice, this engine returns the same state, events,
 * changes, warnings, errors and trace. A hidden roll makes that untrue on the
 * first attempt to reproduce a session, and makes a bug report unactionable
 * because the reporter cannot hand over the inputs that produced it.
 *
 * This is deliberately NOT a dice roller. It validates what it is given. What
 * generates the numbers — a host, a VTT, a person with actual dice — is not
 * the engine's business.
 */

import type { EngineError } from "../infrastructure/diagnostics";


/**
 * One roll, named for the thing it decides.
 *
 * `purpose` is what makes a set of dice checkable at all: two d20s in an array
 * are ambiguous, while an attack roll and a Detection roll are not. A required
 * roll that is absent, and a supplied roll nothing asked for, are both errors
 * because both mean the caller and the engine disagree about what is happening.
 */
export interface RuntimeDieRoll {
  readonly purpose: string;

  /** The face rolled. Validated against `sides`. */
  readonly value: number;

  /** The die's size, so the range can be checked rather than assumed. */
  readonly sides: number;
}


/** What an operation needs rolled before it can proceed. */
export interface RuntimeDieRequirement {
  readonly purpose: string;
  readonly sides: number;
}


/**
 * Judge a set of supplied dice against what the operation requires.
 *
 * Every failure mode is reported at once rather than on first error, because a
 * caller wiring up a new operation would otherwise fix four mistakes in four
 * round trips.
 */
export function findDiceIssues(
  supplied: readonly RuntimeDieRoll[],
  required: readonly RuntimeDieRequirement[],
): readonly EngineError[] {
  const errors: EngineError[] = [];
  const byPurpose = new Map<string, RuntimeDieRoll[]>();

  for (const roll of supplied) {
    if (typeof roll.purpose !== "string" || roll.purpose.trim().length === 0) {
      errors.push({
        code: "runtime.dice.purpose.missing",
        message: "Every supplied die must name what it is rolled for.",
        audience: "developer",
        required: "non-empty purpose",
        actual: String(roll.purpose),
      });

      continue;
    }

    const existing = byPurpose.get(roll.purpose);

    if (existing === undefined) byPurpose.set(roll.purpose, [roll]);
    else existing.push(roll);
  }

  /*
   * Two rolls for one purpose is ambiguous, and picking either one would be
   * the engine deciding a gameplay outcome by array order.
   */
  for (const [purpose, rolls] of byPurpose) {
    if (rolls.length > 1) {
      errors.push({
        code: "runtime.dice.duplicate",
        message: `More than one die was supplied for "${purpose}".`,
        audience: "developer",
        required: "one roll per purpose",
        actual: `${rolls.length} rolls`,
      });
    }
  }

  for (const requirement of required) {
    const rolls = byPurpose.get(requirement.purpose);
    const roll = rolls?.[0];

    if (roll === undefined) {
      errors.push({
        code: "runtime.dice.missing",
        message: `This operation requires a die for "${requirement.purpose}".`,
        audience: "developer",
        required: `d${requirement.sides} for ${requirement.purpose}`,
        actual: "absent",
      });

      continue;
    }

    if (!Number.isInteger(roll.value)) {
      errors.push({
        code: "runtime.dice.value.invalid",
        message: `The die for "${requirement.purpose}" must be a finite integer.`,
        audience: "developer",
        required: "integer",
        actual: Number.isFinite(roll.value)
          ? String(roll.value)
          : String(roll.value),
      });

      continue;
    }

    if (roll.sides !== requirement.sides) {
      errors.push({
        code: "runtime.dice.sides.mismatch",
        message: `The die for "${requirement.purpose}" is the wrong size.`,
        audience: "developer",
        required: `d${requirement.sides}`,
        actual: `d${String(roll.sides)}`,
      });

      continue;
    }

    if (roll.value < 1 || roll.value > requirement.sides) {
      errors.push({
        code: "runtime.dice.value.out-of-range",
        message: `The die for "${requirement.purpose}" rolled outside its range.`,
        audience: "developer",
        required: `1..${requirement.sides}`,
        actual: String(roll.value),
      });
    }
  }

  /* A roll nothing asked for means the caller thinks a different operation is
   * happening, which is worth an error rather than a silent discard. */
  const requiredPurposes = new Set(required.map((one) => one.purpose));

  for (const purpose of byPurpose.keys()) {
    if (!requiredPurposes.has(purpose)) {
      errors.push({
        code: "runtime.dice.unexpected",
        message: `Nothing in this operation rolls for "${purpose}".`,
        audience: "developer",
        required: required.map((one) => one.purpose).join(", ") || "no dice",
        actual: purpose,
      });
    }
  }

  return errors;
}


/** The roll for one purpose, once the set has been validated. */
export function dieFor(
  supplied: readonly RuntimeDieRoll[],
  purpose: string,
): RuntimeDieRoll | undefined {
  return supplied.find((roll) => roll.purpose === purpose);
}
