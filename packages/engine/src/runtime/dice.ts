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
 * Every roll made for one purpose, in the order they were rolled.
 *
 * A SET rather than a roll, because advantage exists. Two d20s in a flat array
 * are ambiguous about which purpose each belongs to; two d20s inside one
 * purpose's set are not ambiguous about anything, and the pair is exactly what
 * advantage and disadvantage need.
 *
 * The order of `values` is the order they were rolled and it is meaningful:
 * a check retains one of them by index, and a GM asking "what did the second
 * die say" is asking about a specific die. The order of the SETS, by contrast,
 * carries no meaning at all — validation must give the same answer however the
 * caller happened to arrange them, and a test pins that.
 */
export interface RuntimeRollSet {
  readonly purpose: string;

  /** The size of every die in this set, so the range can be checked. */
  readonly sides: number;

  /** The faces rolled, in rolled order. */
  readonly values: readonly number[];
}


/**
 * What an operation needs rolled before it can proceed.
 *
 * `count` is what makes a set checkable. Without it the engine cannot tell an
 * advantage pair from an accidental duplicate, and would be deciding by
 * counting whatever arrived — which means a caller who supplied one die too
 * many would silently get advantage they never had.
 */
export interface RuntimeDieRequirement {
  readonly purpose: string;
  readonly sides: number;

  /** How many rolls this purpose needs. One normally; two for advantage. */
  readonly count: number;
}


/** A requirement for a single roll, which is most of them. */
export function requireOneDie(
  purpose: string,
  sides: number,
): RuntimeDieRequirement {
  return { purpose, sides, count: 1 };
}


/**
 * Judge the supplied sets against what the operation requires.
 *
 * Every failure mode is reported at once rather than on first error, because a
 * caller wiring up a new operation would otherwise fix four mistakes in four
 * round trips.
 */
export function findDiceIssues(
  supplied: readonly RuntimeRollSet[],
  required: readonly RuntimeDieRequirement[],
): readonly EngineError[] {
  const errors: EngineError[] = [];
  const byPurpose = new Map<string, RuntimeRollSet[]>();

  /*
   * The REQUIREMENT list is checked first, because a malformed requirement
   * makes every check below meaningless: a d0 or a d2.5 has no valid face, so
   * every roll against it would be reported out of range and the caller would
   * go looking at their dice instead of at their requirement.
   */
  const requiredPurposesSeen = new Set<string>();

  for (const requirement of required) {
    if (
      typeof requirement.purpose !== "string" ||
      requirement.purpose.trim().length === 0
    ) {
      errors.push({
        code: "runtime.dice.requirement.purpose.missing",
        message: "Every required die must name what it is rolled for.",
        audience: "developer",
        required: "non-empty purpose",
        actual: String(requirement.purpose),
      });

      continue;
    }

    if (requiredPurposesSeen.has(requirement.purpose)) {
      errors.push({
        code: "runtime.dice.requirement.duplicate",
        message: `"${requirement.purpose}" is required more than once.`,
        audience: "developer",
        required: "one requirement per purpose",
        actual: requirement.purpose,
      });
    }

    requiredPurposesSeen.add(requirement.purpose);

    if (!Number.isInteger(requirement.sides) || requirement.sides < 1) {
      errors.push({
        code: "runtime.dice.requirement.sides.invalid",
        message: `The die required for "${requirement.purpose}" has no valid faces.`,
        audience: "developer",
        required: "integer >= 1",
        actual: String(requirement.sides),
      });
    }

    if (!Number.isInteger(requirement.count) || requirement.count < 1) {
      errors.push({
        code: "runtime.dice.requirement.count.invalid",
        message: `The requirement for "${requirement.purpose}" asks for an invalid number of rolls.`,
        audience: "developer",
        required: "integer >= 1",
        actual: String(requirement.count),
      });
    }
  }

  if (errors.length > 0) return errors;

  for (const rolls of supplied) {
    if (typeof rolls.purpose !== "string" || rolls.purpose.trim().length === 0) {
      errors.push({
        code: "runtime.dice.purpose.missing",
        message: "Every supplied roll set must name what it is rolled for.",
        audience: "developer",
        required: "non-empty purpose",
        actual: String(rolls.purpose),
      });

      continue;
    }

    const existing = byPurpose.get(rolls.purpose);

    if (existing === undefined) byPurpose.set(rolls.purpose, [rolls]);
    else existing.push(rolls);
  }

  /*
   * Two SETS for one purpose is still ambiguous, and merging them would be the
   * engine inventing advantage. The set is where multiple rolls belong; a
   * second set means the caller thinks two different things are being rolled
   * and has given them the same name.
   */
  for (const [purpose, sets] of byPurpose) {
    if (sets.length > 1) {
      errors.push({
        code: "runtime.dice.duplicate",
        message: `More than one roll set was supplied for "${purpose}".`,
        audience: "developer",
        required: "one roll set per purpose",
        actual: `${sets.length} sets`,
      });
    }
  }

  for (const requirement of required) {
    const sets = byPurpose.get(requirement.purpose);
    const rolls = sets?.[0];

    if (rolls === undefined) {
      errors.push({
        code: "runtime.dice.missing",
        message: `This operation requires dice for "${requirement.purpose}".`,
        audience: "developer",
        required: `${requirement.count} x d${requirement.sides} for ${requirement.purpose}`,
        actual: "absent",
      });

      continue;
    }

    if (!Number.isInteger(rolls.sides) || rolls.sides < 1) {
      errors.push({
        code: "runtime.dice.sides.invalid",
        message: `The dice supplied for "${requirement.purpose}" have no valid faces.`,
        audience: "developer",
        required: "integer >= 1",
        actual: String(rolls.sides),
      });

      continue;
    }

    if (rolls.sides !== requirement.sides) {
      errors.push({
        code: "runtime.dice.sides.mismatch",
        message: `The dice for "${requirement.purpose}" are the wrong size.`,
        audience: "developer",
        required: `d${requirement.sides}`,
        actual: `d${String(rolls.sides)}`,
      });

      continue;
    }

    if (!Array.isArray(rolls.values)) {
      errors.push({
        code: "runtime.dice.values.invalid",
        message: `The rolls for "${requirement.purpose}" are not a list of values.`,
        audience: "developer",
        required: "array of rolled values",
        actual: String(rolls.values),
      });

      continue;
    }

    /*
     * Count is checked before the values are, and separately from "missing".
     * One die short of advantage and no dice at all are different mistakes
     * with different fixes, and a caller that conflates them goes looking for
     * an absent roll that is in fact present.
     */
    if (rolls.values.length !== requirement.count) {
      errors.push({
        code: "runtime.dice.count.mismatch",
        message: `"${requirement.purpose}" requires ${requirement.count} roll(s).`,
        audience: "developer",
        required: String(requirement.count),
        actual: String(rolls.values.length),
      });

      continue;
    }

    rolls.values.forEach((value, index) => {
      if (!Number.isInteger(value)) {
        errors.push({
          code: "runtime.dice.value.invalid",
          message: `Roll ${index + 1} for "${requirement.purpose}" must be a finite integer.`,
          audience: "developer",
          required: "integer",
          actual: String(value),
        });

        return;
      }

      if (value < 1 || value > requirement.sides) {
        errors.push({
          code: "runtime.dice.value.out-of-range",
          message: `Roll ${index + 1} for "${requirement.purpose}" is outside its range.`,
          audience: "developer",
          required: `1..${requirement.sides}`,
          actual: String(value),
        });
      }
    });
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


/** The rolls for one purpose, once the set has been validated. */
export function rollsFor(
  supplied: readonly RuntimeRollSet[],
  purpose: string,
): RuntimeRollSet | undefined {
  return supplied.find((rolls) => rolls.purpose === purpose);
}
