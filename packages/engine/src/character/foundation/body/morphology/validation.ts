/*
 * Morphology validation.
 *
 * Two separate jobs. Authored morphology values must be positive, because a
 * multiplier of zero or less describes no body at all. And BodyPart
 * sensitivities must stay in range, because one of them can turn a perfectly
 * ordinary body inside out.
 */

import type { BodyMorphology } from "../types";
import type { BodyPartDefinition } from "../anatomy/types";

export type MorphologyValidationIssueCode =
  | "invalid-morphology-value"
  | "muscularity-structural-sensitivity-out-of-range"
  | "negative-force-sensitivity"
  | "invalid-sensitivity-value";

export interface MorphologyValidationIssue {
  readonly code: MorphologyValidationIssueCode;
  readonly message: string;
  readonly subjectId?: string;
}

const MORPHOLOGY_DIMENSIONS = [
  "length",
  "bulk",
  "muscularity",
  "adiposity",
] as const satisfies readonly (keyof BodyMorphology)[];

const PLAIN_SENSITIVITIES = [
  "bulkSize",
  "adipositySize",
  "muscularityMass",
] as const;


export function findMorphologyValueIssues(
  morphology: Partial<BodyMorphology>,
  subjectId?: string,
): readonly MorphologyValidationIssue[] {
  const issues: MorphologyValidationIssue[] = [];

  for (const dimension of MORPHOLOGY_DIMENSIONS) {
    const value = morphology[dimension];

    if (value === undefined) continue;

    if (!Number.isFinite(value) || value <= 0) {
      issues.push({
        code: "invalid-morphology-value",
        ...(subjectId === undefined ? {} : { subjectId }),
        message:
          `Morphology ${dimension} is ${value}. ` +
          "Morphology values are multipliers around 1 and must be finite " +
          "and greater than zero.",
      });
    }
  }

  return issues;
}


/*
 * Checks one BodyPart definition's morphology sensitivities.
 *
 * The bound on muscularityStructural is the load-bearing one. Structural
 * Capacity resolves as:
 *
 *   1 + ((Muscularity - 1) x sensitivity)
 *
 * With a sensitivity above 1, that expression crosses zero while Muscularity
 * is still perfectly legal and positive. At sensitivity 1.5, a Muscularity of
 * 0.3 — an infant, a wasting illness, an ordinary point on a Species age curve
 * — yields a factor of -0.05, and the part acquires negative Structural
 * Capacity, negative Body Points, and negative Strength Points.
 *
 * Capping at 1 keeps the factor non-negative for every positive Muscularity.
 * Human Arms and Legs sit at exactly 1, so the bound is reachable and not
 * merely theoretical.
 *
 * Deliberately a validation failure rather than a silent clamp: an authored
 * 1.5 means the author believed something the engine cannot deliver, and
 * quietly flooring it to 1 would hide that.
 *
 * The force sensitivity needs no upper bound. Its factor, 2^((M - 1) x s),
 * stays positive for every finite exponent.
 */
export function findSensitivityIssues(
  definition: BodyPartDefinition,
): readonly MorphologyValidationIssue[] {
  const issues: MorphologyValidationIssue[] = [];
  const { sensitivity } = definition;

  for (const key of PLAIN_SENSITIVITIES) {
    if (!Number.isFinite(sensitivity[key])) {
      issues.push({
        code: "invalid-sensitivity-value",
        subjectId: definition.id,
        message:
          `BodyPart "${definition.id}" has a non-finite ${key} sensitivity.`,
      });
    }
  }

  const structural = sensitivity.muscularityStructural;

  if (!Number.isFinite(structural) || structural < 0 || structural > 1) {
    issues.push({
      code: "muscularity-structural-sensitivity-out-of-range",
      subjectId: definition.id,
      message:
        `BodyPart "${definition.id}" has muscularityStructural ` +
        `${structural}, outside [0, 1]. Above 1, low Muscularity drives ` +
        "Structural Capacity negative and takes Body Points and Strength " +
        "Points with it.",
    });
  }

  const force = sensitivity.muscularityForce;

  if (!Number.isFinite(force) || force < 0) {
    issues.push({
      code: "negative-force-sensitivity",
      subjectId: definition.id,
      message:
        `BodyPart "${definition.id}" has muscularityForce ${force}. ` +
        "Force sensitivity must be finite and non-negative.",
    });
  }

  return issues;
}
