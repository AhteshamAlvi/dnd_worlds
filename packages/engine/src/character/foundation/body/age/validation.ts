/*
 * Validation for authored Species Age Profiles.
 *
 * Age profiles are content, and content arrives from JSON written by hand, so
 * every structural assumption age/resolution.ts makes is checked here rather
 * than trusted. The resolver walks anchors in order and interpolates between
 * neighbours; unsorted or duplicated ages would silently produce a curve that
 * is simply wrong rather than one that fails.
 */

import type { BodyMorphology } from "../types";
import type { SpeciesAgeProfile } from "./types";

export type AgeProfileValidationIssueCode =
  | "empty-age-profile"
  | "invalid-anchor-age"
  | "unordered-anchor-ages"
  | "duplicate-anchor-age"
  | "invalid-anchor-scale"
  | "invalid-anchor-morphology";

export interface AgeProfileValidationIssue {
  readonly code: AgeProfileValidationIssueCode;
  readonly message: string;

  /** Index of the offending anchor, where the issue concerns one. */
  readonly anchorIndex?: number;
}

const MORPHOLOGY_DIMENSIONS = [
  "length",
  "bulk",
  "muscularity",
  "adiposity",
] as const satisfies readonly (keyof BodyMorphology)[];


/*
 * A morphology value is a multiplier around 1, so zero and negative values are
 * not merely unusual, they are meaningless: a BodyPart of zero length has no
 * size, no mass, and no structural capacity, and a negative one has less than
 * none.
 */
function findMorphologyIssues(
  morphology: Partial<BodyMorphology> | undefined,
  anchorIndex: number,
  label: string,
): readonly AgeProfileValidationIssue[] {
  if (morphology === undefined) return [];

  const issues: AgeProfileValidationIssue[] = [];

  for (const dimension of MORPHOLOGY_DIMENSIONS) {
    const value = morphology[dimension];

    if (value === undefined) continue;

    if (!Number.isFinite(value) || value <= 0) {
      issues.push({
        code: "invalid-anchor-morphology",
        anchorIndex,
        message:
          `${label} ${dimension} at anchor ${anchorIndex} is ${value}. ` +
          "Morphology values must be finite and greater than zero.",
      });
    }
  }

  return issues;
}


export function findAgeProfileIssues(
  profile: SpeciesAgeProfile,
): readonly AgeProfileValidationIssue[] {
  const issues: AgeProfileValidationIssue[] = [];

  if (profile.anchors.length === 0) {
    issues.push({
      code: "empty-age-profile",
      message:
        "A Species Age Profile must define at least one anchor. " +
        "A Species whose age has no physical effect should author a single " +
        "mature anchor rather than none.",
    });

    return issues;
  }

  let previousAge: number | null = null;

  for (let index = 0; index < profile.anchors.length; index += 1) {
    const anchor = profile.anchors[index];

    if (anchor === undefined) continue;

    if (!Number.isFinite(anchor.age) || anchor.age < 0) {
      issues.push({
        code: "invalid-anchor-age",
        anchorIndex: index,
        message:
          `Anchor ${index} has age ${anchor.age}. ` +
          "Ages must be finite and at least zero.",
      });
    } else if (previousAge !== null) {
      if (anchor.age === previousAge) {
        issues.push({
          code: "duplicate-anchor-age",
          anchorIndex: index,
          message:
            `Anchor ${index} repeats age ${anchor.age}. ` +
            "Two anchors at the same age leave the curve undefined there.",
        });
      } else if (anchor.age < previousAge) {
        issues.push({
          code: "unordered-anchor-ages",
          anchorIndex: index,
          message:
            `Anchor ${index} has age ${anchor.age} after ${previousAge}. ` +
            "Anchors must ascend, because interpolation walks them in order.",
        });
      }
    }

    if (Number.isFinite(anchor.age)) {
      previousAge = anchor.age;
    }

    if (!Number.isFinite(anchor.scale) || anchor.scale <= 0) {
      issues.push({
        code: "invalid-anchor-scale",
        anchorIndex: index,
        message:
          `Anchor ${index} has scale ${anchor.scale}. ` +
          "Scale must be finite and greater than zero.",
      });
    }

    issues.push(
      ...findMorphologyIssues(anchor.morphology, index, "Global"),
    );

    for (const [partId, local] of Object.entries(
      anchor.localMorphology ?? {},
    )) {
      issues.push(
        ...findMorphologyIssues(local, index, `Local (${partId})`),
      );
    }
  }

  return issues;
}
