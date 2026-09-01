/*
 * Strength validation — the preconditions the advancement solver relies on.
 *
 * The solver searches upward for the Muscularity that doubles a body's
 * normalized Strength, by bracket expansion and binary search. Both steps
 * assume Strength response is NON-DECREASING in Strength-development
 * Muscularity. If that ever stops being true the search does not fail loudly;
 * it converges on the wrong number, which is far worse.
 *
 * Monotonicity follows from four things being true at once:
 *
 *   Muscularity > 0
 *   0 <= MuscularityStructuralSensitivity <= 1
 *   MuscularityForceSensitivity >= 0
 *   intrinsicPhysicalForce >= 0
 *
 * Each is enforced somewhere upstream, and each is asserted again here rather
 * than assumed, because "enforced elsewhere" is a claim that decays.
 *
 * The second check in this file is different in kind: a Base Reference Form
 * can be perfectly valid and still be UNABLE to buy Strength. A form made
 * entirely of inert structure produces no force at all, and a form whose every
 * part is insensitive to Muscularity produces the same force no matter how
 * much is bought. Doubling zero is zero and doubling a constant is
 * unreachable; in both cases advancement must refuse explicitly rather than
 * let the solver exhaust its expansion ceiling and report a numerical failure
 * for what is really a fact about the anatomy.
 */

import { createBodyPartDefinitionMap } from "../selectors";
import { NEUTRAL_MORPHOLOGY } from "../types";
import type { BodyMorphology } from "../types";
import type {
  BodyPartDefinition,
  BodyPartId,
  ReferenceForm,
} from "../anatomy/types";


export type StrengthValidationIssueCode =
  | "non-positive-muscularity"
  | "muscularity-structural-sensitivity-out-of-range"
  | "negative-force-sensitivity"
  | "negative-intrinsic-physical-force"
  | "unknown-reference-form-type"
  | "reference-form-produces-no-force"
  | "reference-form-insensitive-to-strength";


export interface StrengthValidationIssue {
  readonly code: StrengthValidationIssueCode;
  readonly message: string;

  readonly partId?: BodyPartId;
  readonly definitionId?: string;
}


export interface StrengthValidationResult {
  readonly valid: boolean;
  readonly issues: readonly StrengthValidationIssue[];
}


function createValidationResult(
  issues: readonly StrengthValidationIssue[],
): StrengthValidationResult {
  return {
    valid: issues.length === 0,
    issues,
  };
}


/*
 * Asserts the four conditions the solver's monotonicity rests on.
 *
 * Checked against the Reference Form rather than current anatomy, because that
 * is what advancement is priced against.
 */
export function findStrengthMonotonicityIssues(
  referenceForm: ReferenceForm,
  definitions: readonly BodyPartDefinition[],
  morphologyByPartId: Readonly<Record<BodyPartId, BodyMorphology>>,
): readonly StrengthValidationIssue[] {
  const definitionsById = createBodyPartDefinitionMap(definitions);

  const issues: StrengthValidationIssue[] = [];

  for (const part of referenceForm.parts) {
    const definition = definitionsById.get(part.type);

    if (definition === undefined) {
      issues.push({
        code: "unknown-reference-form-type",
        message:
          `Reference Form part "${part.slotId}" references unknown type ` +
          `"${part.type}", so its Strength contribution cannot be resolved.`,
        partId: part.slotId,
        definitionId: part.type,
      });

      continue;
    }

    const morphology = morphologyByPartId[part.slotId] ?? NEUTRAL_MORPHOLOGY;

    if (
      !Number.isFinite(morphology.muscularity) ||
      morphology.muscularity <= 0
    ) {
      issues.push({
        code: "non-positive-muscularity",
        message:
          `BodyPart "${part.slotId}" resolves Muscularity ` +
          `${morphology.muscularity}. Muscularity is a multiplier around 1 ` +
          "and must stay above zero.",
        partId: part.slotId,
      });
    }

    const structural = definition.sensitivity.muscularityStructural;

    if (
      !Number.isFinite(structural) ||
      structural < 0 ||
      structural > 1
    ) {
      issues.push({
        code: "muscularity-structural-sensitivity-out-of-range",
        message:
          `BodyPartDefinition "${definition.id}" has ` +
          `muscularityStructural ${structural}, outside [0, 1]. Above 1 the ` +
          "structural factor turns negative at legal low Muscularity.",
        partId: part.slotId,
        definitionId: definition.id,
      });
    }

    const force = definition.sensitivity.muscularityForce;

    if (!Number.isFinite(force) || force < 0) {
      issues.push({
        code: "negative-force-sensitivity",
        message:
          `BodyPartDefinition "${definition.id}" has muscularityForce ` +
          `${force}. A negative force sensitivity makes Strength fall as ` +
          "Muscularity rises, which the advancement solver cannot search.",
        partId: part.slotId,
        definitionId: definition.id,
      });
    }

    const intrinsic = definition.reference.intrinsicPhysicalForce;

    if (!Number.isFinite(intrinsic) || intrinsic < 0) {
      issues.push({
        code: "negative-intrinsic-physical-force",
        message:
          `BodyPartDefinition "${definition.id}" has intrinsicPhysicalForce ` +
          `${intrinsic}. Zero is legal and means inert structure; negative ` +
          "means the part produces force in reverse.",
        partId: part.slotId,
        definitionId: definition.id,
      });
    }
  }

  return issues;
}


/*
 * Asserts that this Base Reference Form can buy Strength at all.
 *
 * Two distinct failures, kept distinct because they mean different things to
 * whoever has to explain the refusal:
 *
 *   produces no force        every part is inert or has no capacity, so the
 *                            body's Strength is 0 and doubling it stays 0
 *
 *   insensitive to Strength  the parts produce force, but none of them
 *                            responds to Muscularity, so no amount of
 *                            development changes anything
 *
 * A form needs at least one part that has reference capacity, produces force,
 * and responds through muscularityStructural or muscularityForce. All three,
 * because a part failing any one of them contributes a constant to the sum.
 */
export function findStrengthAdvancementCapabilityIssues(
  referenceForm: ReferenceForm,
  definitions: readonly BodyPartDefinition[],
): readonly StrengthValidationIssue[] {
  const definitionsById = createBodyPartDefinitionMap(definitions);

  let producesForce = false;
  let respondsToMuscularity = false;

  for (const part of referenceForm.parts) {
    const definition = definitionsById.get(part.type);

    if (definition === undefined) continue;

    const usable =
      definition.reference.structuralCapacity > 0 &&
      definition.reference.intrinsicPhysicalForce > 0;

    if (!usable) continue;

    producesForce = true;

    if (
      definition.sensitivity.muscularityStructural > 0 ||
      definition.sensitivity.muscularityForce > 0
    ) {
      respondsToMuscularity = true;
    }
  }

  if (!producesForce) {
    return [
      {
        code: "reference-form-produces-no-force",
        message:
          "This Reference Form has no anatomy with both structural capacity " +
          "and intrinsic physical force, so it produces no Strength and " +
          "cannot buy ordinary muscular Strength advancement.",
      },
    ];
  }

  if (!respondsToMuscularity) {
    return [
      {
        code: "reference-form-insensitive-to-strength",
        message:
          "No part of this Reference Form responds to Muscularity, so no " +
          "amount of Strength development can change its Strength.",
      },
    ];
  }

  return [];
}


/*
 * Validates that this body can have Strength advancement solved for it.
 */
export function validateStrengthAdvancementInputs(
  referenceForm: ReferenceForm,
  definitions: readonly BodyPartDefinition[],
  morphologyByPartId: Readonly<Record<BodyPartId, BodyMorphology>>,
): StrengthValidationResult {
  return createValidationResult([
    ...findStrengthMonotonicityIssues(
      referenceForm,
      definitions,
      morphologyByPartId,
    ),
    ...findStrengthAdvancementCapabilityIssues(referenceForm, definitions),
  ]);
}
