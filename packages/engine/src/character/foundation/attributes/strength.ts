/*
 * Strength: turning a physical quantity into a Stat.
 *
 * This is the seam between Body and the Attribute ladder, and the split is
 * exact:
 *
 *   BODY        produces normalizedBodySP — a unitless ratio x 100, and stops
 *   ATTRIBUTES  turns that into a position on the 1..30 ladder
 *
 * Everything in this file is a fact about the LADDER, not about physics. The
 * reference position of 10, the doubling per point, the floor, and the 1..30
 * bounds would all change if the ladder changed and none of them would change
 * if the physics did. That is why they live here.
 *
 * Body imports nothing from this module, which is what keeps the dependency
 * one-way — the same property Body already has with Constitution, which
 * arrives as a plain number rather than as an import.
 *
 * These constants and formulas used to live in body/strength/normalization.ts,
 * where they duplicated ATTRIBUTE_MIN and ATTRIBUTE_MAX outright: two copies
 * of one bound that had to agree and nothing making them.
 *
 *
 * WHY STRENGTH IS LOGARITHMIC
 *
 *   StrengthPosition = 10 + log2(normalizedBodySP / 100)
 *
 * Each point of Strength is a doubling of real force. The reference Human sits
 * at exactly 100 normalized SP and therefore exactly position 10.
 *
 * Position is NEVER clamped. A creature at 10,000 normalized SP genuinely
 * occupies position 16.64, and discarding that would make the value useless
 * for comparing two things that both display 16.
 *
 *
 * WHY THE CAP IS ONLY AT THE SURFACE
 *
 *   DisplayedSTR = clamp(ATTRIBUTE_MIN, ATTRIBUTE_MAX, floor(position))
 *
 * The 1..30 range is a Stat convention, not a physical fact, so it applies at
 * the Stat surface and nowhere earlier. Flooring means characters sharing a
 * displayed Strength share a tier without sharing a precise SP.
 *
 * Zero is reserved for exactly one case: a body producing no force at all.
 * There, position is `null` because log2(0) has no value — but displayed
 * Strength is 0 and NOT null, because derived attributes sum STR directly and
 * a null would poison the sum, while deriveStandardModifier is deliberately
 * unclamped so 0 -> -5 is safe.
 */

import { ATTRIBUTE_MAX, ATTRIBUTE_MIN } from "./base";


/*
 * The normalized Strength Points of the Basic Human Standard, and the ladder
 * position that corresponds to it. The reference body defines the middle of
 * the scale rather than being placed on it by hand.
 */
export const REFERENCE_NORMALIZED_BODY_SP = 100;

/* One of four independent baseline-10 anchors; see
 * attributes/resolution.ts's STANDARD_MODIFIER_REFERENCE_SCORE. */
export const REFERENCE_STRENGTH_POSITION = 10;

/*
 * Outside the 1..30 range on purpose: it means "this body produces no force",
 * which is a different statement from "this body is very weak", and 1 is
 * already reserved for the second.
 */
export const ZERO_STRENGTH = 0;


/*
 * The continuous ladder position. Never clamped.
 *
 * `null` for a body producing no force, where the logarithm has no value.
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
 * The Stat a character sheet shows.
 */
export function resolveDisplayedStrength(
  strengthPosition: number | null,
): number {
  if (strengthPosition === null) return ZERO_STRENGTH;

  return Math.min(
    ATTRIBUTE_MAX,
    Math.max(ATTRIBUTE_MIN, Math.floor(strengthPosition)),
  );
}


/*
 * Both, from the one number Body produces.
 */
export function resolveStrength(normalizedBodySP: number): {
  readonly position: number | null;
  readonly displayed: number;
} {
  const position = resolveStrengthPosition(normalizedBodySP);

  return { position, displayed: resolveDisplayedStrength(position) };
}
