/*
 * From Strength Points to a number on a character sheet.
 *
 * Three steps, each of which exists to solve a specific problem.
 *
 *
 * 1 · NORMALIZATION — why extra anatomy is not free Strength
 *
  *   ReferenceFormIntrinsicSP        = sum of IntrinsicMaxSP
 *                                     over the INTACT Reference Form
 *
 *   ReferenceFormAnatomicalCapacity = sum of ReferenceStructuralCapacity
 *                                     over the INTACT Reference Form
 *
 *   NormalizedBodySP = 100 x ReferenceFormIntrinsicSP
 *                          / ReferenceFormAnatomicalCapacity
 *
 * BOTH halves are taken over the intact Reference Form, and the ratio is
 * therefore what that form's anatomy makes of its own reference structure:
 * Scale squared, times a structure-weighted average of the Muscularity and
 * intrinsic-force response. Nothing about what has happened to the character
 * appears anywhere in it.
 *
 * WHAT NORMALIZATION IS FOR
 *
 * Stopping extra ORDINARY anatomy from buying free Strength. A Species whose
 * intact form genuinely has four Arms and four Hands puts 136 in both halves
 * and still normalizes to 100 — it owns two more Arms' worth of real Strength
 * Points and is not a higher Strength tier for it. That invariant needs one
 * anatomy set on both sides, not two.
 *
 * WHAT IT IS NOT FOR, ANY MORE
 *
 * An earlier model took the numerator over currently-present anatomy, so a
 * Human losing both Arms and Hands read 64 over 100 and dropped to STR 9. That
 * conflated two different questions: how strong the character fundamentally
 * is, and how much of their body is available to use. Their remaining muscles
 * did not become weaker when the Arms left.
 *
 * So amputation, suppression, severance and Joint failure no longer touch STR
 * at all. They reduce presentIntrinsicSP — the force actually there — which is
 * resolved alongside this and never inside it. STR describes the strength
 * quality of the intact form; instance history describes how much of that form
 * is left.
 *
 * A consequence worth stating plainly: a form permanently changed to an
 * armless one is STR 10 with far less raw whole-body SP than an ordinary
 * Human. That is not a penalty being healed. There was never a penalty.
 *
 *
 * Position, the 1..30 cap and displayed Strength are NOT here. Body stops at
 * normalizedBodySP; turning that into a ladder position is a fact about the
 * Attribute ladder, and it lives in foundation/attributes/strength.ts. This
 * file used to own both and duplicated ATTRIBUTE_MIN/ATTRIBUTE_MAX to do it.
 */

import { createBodyPartDefinitionMap } from "../selectors";
import type {
  BodyPartDefinition,
  ReferenceForm,
} from "../anatomy/types";


/*
 * The reference point normalization is expressed against. Not the ladder's
 * reference position — that is attributes/strength.ts — just the scale factor
 * that makes an ordinary body read 100 rather than 1.
 */
export const REFERENCE_NORMALIZED_BODY_SP = 100;



/*
 * The capacity the Reference Form is supposed to have.
 *
 * Computed from reference Structural Capacity alone — before Scale,
 * Muscularity, force modifiers, damage, severance or Joint accessibility. It
 * is a property of the body PLAN, so scaling it would make a Giant normalize
 * against a Giant and read as exactly as strong as a Human, which is the
 * opposite of the intent.
 *
 * A part whose type has no definition contributes nothing rather than
 * throwing, because a Reference Form may legitimately outlive a catalog entry
 * — but that is reported by strength/validation.ts rather than passed over in
 * silence.
 */
export function resolveReferenceFormAnatomicalCapacity(
  referenceForm: ReferenceForm,
  definitions: readonly BodyPartDefinition[],
): number {
  const definitionsById = createBodyPartDefinitionMap(definitions);

  return referenceForm.parts.reduce(
    (total, part) =>
      total +
      (definitionsById.get(part.type)?.reference.structuralCapacity ?? 0),
    0,
  );
}


/*
 * Normalizes the intact Reference Form's intrinsic Strength Points against
 * that same form's anatomical capacity.
 *
 * A form with no anatomical capacity at all normalizes to 0 rather than to
 * NaN. Dividing nothing by nothing is not 100% of anything, and a body with no
 * structure produces no force, so 0 is both the safe answer and the true one.
 */
export function resolveNormalizedBodySP(
  referenceFormIntrinsicSP: number,
  referenceFormAnatomicalCapacity: number,
): number {
  if (
    !Number.isFinite(referenceFormAnatomicalCapacity) ||
    referenceFormAnatomicalCapacity <= 0
  ) {
    return 0;
  }

  return (
    REFERENCE_NORMALIZED_BODY_SP *
    (referenceFormIntrinsicSP / referenceFormAnatomicalCapacity)
  );
}
