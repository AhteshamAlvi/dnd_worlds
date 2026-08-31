/*
 * Validating authored stature bands.
 *
 * Small file, one interesting rule. The rest is the usual finiteness and
 * ordering checks that stop a typo becoming a character nobody can create.
 */

import type { SpeciesStatureBands, StatureBand } from "./types";


export type StatureValidationIssueCode =
  | "non-finite-stature-bound"
  | "non-positive-stature-bound"
  | "inverted-stature-band"
  | "band-excludes-the-species-norm";


export interface StatureValidationIssue {
  readonly code: StatureValidationIssueCode;
  readonly message: string;

  readonly dimension: "height" | "mass";
}


export interface StatureValidationResult {
  readonly valid: boolean;
  readonly issues: readonly StatureValidationIssue[];
}


function validateBand(
  dimension: "height" | "mass",
  band: StatureBand,
): readonly StatureValidationIssue[] {
  const issues: StatureValidationIssue[] = [];

  for (const [name, value] of [
    ["min", band.min],
    ["max", band.max],
  ] as const) {
    if (!Number.isFinite(value)) {
      issues.push({
        code: "non-finite-stature-bound",
        dimension,
        message: `Stature ${dimension} ${name} must be finite; got ${value}.`,
      });

      continue;
    }

    if (value <= 0) {
      issues.push({
        code: "non-positive-stature-bound",
        dimension,
        message:
          `Stature ${dimension} ${name} is a ratio to the Species norm and ` +
          `must be positive; got ${value}.`,
      });
    }
  }

  if (issues.length > 0) return issues;

  if (band.min > band.max) {
    issues.push({
      code: "inverted-stature-band",
      dimension,
      message:
        `Stature ${dimension} band is inverted: min ${band.min} is above ` +
        `max ${band.max}.`,
    });

    return issues;
  }

  /*
   * The band is a ratio to the ordinary member of the Species, so 1 is that
   * ordinary member by definition. A band excluding it declares every normal
   * adult of the Species exceptional and demands a Trait to be unremarkable —
   * which is not a strict band, it is a Species authored wrong. Almost always
   * it means someone wrote centimetres where a ratio was expected.
   */
  if (band.min > 1 || band.max < 1) {
    issues.push({
      code: "band-excludes-the-species-norm",
      dimension,
      message:
        `Stature ${dimension} band ${band.min}-${band.max} excludes 1, which ` +
        `is the ordinary member of the Species at this age. Bands are ratios ` +
        `to that norm, not absolute centimetres or kilograms.`,
    });
  }

  return issues;
}


export function validateSpeciesStatureBands(
  bands: SpeciesStatureBands,
): StatureValidationResult {
  const issues = [
    ...validateBand("height", bands.height),
    ...validateBand("mass", bands.mass),
  ];

  return {
    valid: issues.length === 0,
    issues,
  };
}
