/*
 * How many targets an action may have.
 *
 *
 * WHY ZERO IS A FIRST-CLASS ANSWER
 *
 * The assumption worth killing early is "an attack has a target". A punch
 * thrown at the ground has no target and is still an attack. A stance has no
 * target. An En sphere has no target. A wall of flame put across a corridor
 * has no target. Meanwhile a heal genuinely cannot proceed without a
 * recipient, and quietly letting it resolve against nobody would be worse than
 * refusing it.
 *
 * Both of those are the same rule with different numbers, so cardinality is a
 * minimum and a maximum and every case falls out of it: none (0,0), optional
 * (0,1), exactly one (1,1), one or more (1,null), any number (0,null).
 *
 * `maximum` is null rather than Infinity so an unbounded profile survives
 * serialization, matching DistanceInterval for the same reason.
 *
 * There is deliberately no "multiple" target that contains other targets. A
 * selection is a flat list. Nesting would make "how many targets does this
 * have" a tree walk, and every consumer would answer it slightly differently.
 */

import type { EngineError } from "../infrastructure/diagnostics";


export interface TargetCardinality {
  readonly minimum: number;
  readonly maximum: number | null;
}


export const NO_TARGETS: TargetCardinality = { minimum: 0, maximum: 0 };

export const OPTIONAL_TARGET: TargetCardinality = { minimum: 0, maximum: 1 };

export const EXACTLY_ONE_TARGET: TargetCardinality = {
  minimum: 1,
  maximum: 1,
};

export const ONE_OR_MORE_TARGETS: TargetCardinality = {
  minimum: 1,
  maximum: null,
};

export const ANY_NUMBER_OF_TARGETS: TargetCardinality = {
  minimum: 0,
  maximum: null,
};


export function findTargetCardinalityIssues(
  cardinality: TargetCardinality,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (
    !Number.isInteger(cardinality.minimum) ||
    cardinality.minimum < 0
  ) {
    errors.push({
      code: "targeting.cardinality.minimum.invalid",
      message: "A target minimum must be a non-negative integer.",
      audience: "developer",
      required: "integer >= 0",
      actual: String(cardinality.minimum),
    });
  }

  if (cardinality.maximum !== null) {
    if (
      !Number.isInteger(cardinality.maximum) ||
      cardinality.maximum < 0
    ) {
      errors.push({
        code: "targeting.cardinality.maximum.invalid",
        message: "A target maximum must be a non-negative integer, or null for unbounded.",
        audience: "developer",
        required: "integer >= 0, or null",
        actual: String(cardinality.maximum),
      });
    } else if (
      Number.isInteger(cardinality.minimum) &&
      cardinality.maximum < cardinality.minimum
    ) {
      errors.push({
        code: "targeting.cardinality.inverted",
        message: "A target maximum is below its minimum.",
        audience: "developer",
        required: `maximum >= ${cardinality.minimum}`,
        actual: String(cardinality.maximum),
      });
    }
  }

  return errors;
}


export function permitsNoTargets(cardinality: TargetCardinality): boolean {
  return cardinality.minimum === 0;
}


export function requiresTargets(cardinality: TargetCardinality): boolean {
  return cardinality.minimum > 0;
}
