/*
 * Structural Capacity validation.
 *
 * Two layers already sit upstream of this file and are not repeated here:
 * morphology/validation.ts bounds `muscularityStructural` to [0, 1] and
 * rejects non-positive morphology values, and anatomy/validation.ts covers the
 * per-part schema. This file covers what is only knowable once reference data
 * and a resolved SC are looked at together.
 *
 * The reason it exists at all is that a negative Structural Capacity is not a
 * strange number, it is a category error — SC is what durability and force are
 * both derived from, so a negative one produces negative Body Points and a
 * Strength solver that cannot converge. Better to fail where the cause is
 * visible than three subsystems downstream.
 */

import { createBodyPartDefinitionMap } from "../selectors";
import { resolveMuscularityStructuralFactor } from "./resolution";
import { NEUTRAL_MORPHOLOGY } from "../types";
import type { BodyMorphology } from "../types";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "../anatomy/types";


/*
 * Stable machine-readable categories for Structural Capacity failures.
 */
export type StructureValidationIssueCode =
  | "invalid-reference-structural-capacity"
  | "negative-muscularity-structural-factor";


export interface StructureValidationIssue {
  readonly code: StructureValidationIssueCode;
  readonly message: string;

  readonly partId?: BodyPartId;
  readonly definitionId?: string;
}


export interface StructureValidationResult {
  readonly valid: boolean;
  readonly issues: readonly StructureValidationIssue[];
}


function createValidationResult(
  issues: readonly StructureValidationIssue[],
): StructureValidationResult {
  return {
    valid: issues.length === 0,
    issues,
  };
}


/*
 * Rejects a reference Structural Capacity that cannot found a body.
 *
 * Zero is permitted. Genuinely inert structure — a decorative crest, a shell
 * plate carried rather than borne on — can legitimately bear nothing, and
 * making that expressible is cheaper than a flag saying the same thing.
 * Negative is not: nothing has less than no capacity.
 */
export function findReferenceStructuralCapacityIssues(
  definition: BodyPartDefinition,
): readonly StructureValidationIssue[] {
  const value = definition.reference.structuralCapacity;

  if (!Number.isFinite(value) || value < 0) {
    return [
      {
        code: "invalid-reference-structural-capacity",
        message:
          `BodyPartDefinition "${definition.id}" has reference Structural ` +
          `Capacity ${value}. It must be finite and not negative.`,
        definitionId: definition.id,
      },
    ];
  }

  return [];
}


/*
 * Rejects a body whose Muscularity drives any part's structural factor
 * negative.
 *
 * With `muscularityStructural` correctly bounded to [0, 1] and Muscularity
 * positive, `1 + ((M - 1) x s)` cannot go below 0 — at s = 1 it bottoms out at
 * M itself. So reaching this issue means one of those two upstream guarantees
 * has already been broken, and the check is here to name the consequence
 * rather than to let a negative capacity propagate silently into Body Points
 * and the Strength solver.
 *
 * This is also the precondition the Strength advancement solver relies on for
 * monotonicity, which is why it is asserted rather than assumed.
 */
export function findStructuralFactorIssues(
  anatomy: Anatomy,
  definitions: readonly BodyPartDefinition[],
  morphologyByPartId: Readonly<Record<BodyPartId, BodyMorphology>>,
): readonly StructureValidationIssue[] {
  const definitionsById = createBodyPartDefinitionMap(definitions);

  const issues: StructureValidationIssue[] = [];

  for (const part of anatomy.parts) {
    if (part.state !== "active") continue;

    const definition = definitionsById.get(part.type);

    if (definition === undefined) continue;

    const factor = resolveMuscularityStructuralFactor(
      morphologyByPartId[part.id] ?? NEUTRAL_MORPHOLOGY,
      definition.sensitivity,
    );

    if (!Number.isFinite(factor) || factor < 0) {
      issues.push({
        code: "negative-muscularity-structural-factor",
        message:
          `BodyPart "${part.id}" resolves a Muscularity structural factor of ` +
          `${factor}, which would give it negative Structural Capacity.`,
        partId: part.id,
        definitionId: definition.id,
      });
    }
  }

  return issues;
}


/*
 * Validates that a body's Structural Capacity can be resolved meaningfully.
 */
export function validateStructuralCapacityInputs(
  anatomy: Anatomy,
  definitions: readonly BodyPartDefinition[],
  morphologyByPartId: Readonly<Record<BodyPartId, BodyMorphology>>,
): StructureValidationResult {
  const issues: StructureValidationIssue[] = [];

  for (const definition of definitions) {
    issues.push(...findReferenceStructuralCapacityIssues(definition));
  }

  issues.push(
    ...findStructuralFactorIssues(anatomy, definitions, morphologyByPartId),
  );

  return createValidationResult(issues);
}
