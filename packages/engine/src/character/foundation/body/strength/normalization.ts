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
 * 2 · POSITION — why Strength is logarithmic
 *
 *   StrengthPosition = 10 + log2(NormalizedBodySP / 100)
 *
 * Each point of Strength is a doubling of real force. The reference Human sits
 * at exactly 100 normalized SP and therefore exactly position 10. Position is
 * NEVER clamped: a creature at 10,000 normalized SP genuinely occupies
 * position 16.64, and throwing that away at the physics layer would make the
 * value useless for comparing two things that both display 16.
 *
 *
 * 3 · DISPLAY — why the cap lives here and nowhere else
 *
 *   DisplayedSTR = clamp(1, 30, floor(StrengthPosition))
 *
 * The 1..30 range is a Stat-surface convention, not a physical fact, so it is
 * applied at the surface and nowhere earlier. Flooring means characters sharing
 * a displayed Strength share a tier without sharing a precise SP.
 *
 * Zero is reserved for one case: a body that produces no force at all. There,
 * position is `null` because log2(0) has no value, but displayed Strength is
 * 0 and NOT null — `derived/resolution.ts` sums ["str","agi","dex","per","wis"]
 * directly and a null would poison the sum, while `deriveStandardModifier` is
 * deliberately unclamped so 0 -> -5 is safe.
 */

import { createBodyPartDefinitionMap } from "../selectors";
import type {
  BodyPartDefinition,
  ReferenceForm,
} from "../anatomy/types";



/*
 * The normalized Strength Points of the Basic Human Standard, and the
 * displayed Strength that corresponds to it. The reference body defines the
 * middle of the scale rather than being placed on it by hand.
 */
export const REFERENCE_NORMALIZED_BODY_SP = 100;
/* One of four independent baseline-10 anchors; see
 * attributes/resolution.ts's STANDARD_MODIFIER_REFERENCE_SCORE. */
export const REFERENCE_STRENGTH_POSITION = 10;

/*
 * The Stat-surface range. `ZERO_STRENGTH` is outside it on purpose: it means
 * "this body produces no force", which is a different statement from "this
 * body is very weak", and 1 is already reserved for the second.
 */
export const MIN_DISPLAYED_STRENGTH = 1;
export const MAX_DISPLAYED_STRENGTH = 30;
export const ZERO_STRENGTH = 0;


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


/*
 * The continuous physical Strength position. Never clamped.
 *
 * `null` for a body producing no force, where the logarithm has no value.
 * Everywhere else this is the honest number, and the character sheet's own
 * limits are somebody else's problem.
 */
export function resolveStrengthPosition(
  normalizedBodySP: number,
): number | null {
  if (!Number.isFinite(normalizedBodySP) || normalizedBodySP <= 0) {
    return null;
  }

  return (
    REFERENCE_STRENGTH_POSITION +
    Math.log2(normalizedBodySP / REFERENCE_NORMALIZED_BODY_SP)
  );
}


/*
 * The Strength that appears on the character sheet.
 *
 * The cap applies HERE and nowhere earlier. A character at position 31.4
 * displays 30 while remaining, physically, at 31.4 — which is what lets
 * advancement refuse correctly at the cap instead of silently succeeding
 * against a number that was clamped before anyone looked at it.
 */
export function resolveDisplayedStrength(
  strengthPosition: number | null,
): number {
  if (strengthPosition === null) return ZERO_STRENGTH;

  return Math.min(
    MAX_DISPLAYED_STRENGTH,
    Math.max(MIN_DISPLAYED_STRENGTH, Math.floor(strengthPosition)),
  );
}
