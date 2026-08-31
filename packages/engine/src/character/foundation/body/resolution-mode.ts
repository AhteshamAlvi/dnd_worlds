/*
 * Base and Resolved — the two questions you can ask a body.
 *
 *   Base      what this body IS, intact, as its own permanent self
 *   Resolved  what this body can CURRENTLY express
 *
 * A character who has lost both Arms is a different body in the second sense
 * and the same body in the first, and the distinction decides a price. Their
 * displayed Strength should fall, because a body missing its arms can produce
 * less force. Their cost to buy the next point of Strength should not, because
 * permanent physical development must never become cheaper or dearer through
 * transient misfortune. A character with 400 base normalized Strength Points
 * whose amputated body currently reads 247 still buys the next advancement
 * against 400 x 2 = 800, not 494.
 *
 * There is ONE implementation. The mode selects which sources participate; it
 * never selects between two algorithms. Two code paths that are supposed to
 * agree eventually stop agreeing, and the disagreement surfaces as a character
 * whose Strength changes when nothing about them did.
 *
 * What the mode currently controls:
 *
 *   base      anatomy instance state is IGNORED — every part of the Base
 *             Reference Form is treated as present and intact
 *   resolved  anatomy instance state is HONOURED — suppressed and
 *             archived-removed parts contribute nothing
 *
 * What it will also control, once the Body Effect vocabulary exists: which
 * Effect set feeds Scale, morphology and intrinsic force. Through this phase
 * both sets are empty, so the two modes see the same physical context and
 * differ only in the anatomy they count. That is why the physical context is
 * one value with an optional resolved override rather than two mandatory
 * copies of the same thing — see strength/types.ts.
 *
 * Note what the mode does NOT control: the normalization denominator. The
 * Reference Form Anatomical Capacity is the same in both modes, because it
 * describes what the form is supposed to contain and damage never answers that
 * question. Letting the denominator shrink alongside the numerator is the bug
 * where amputation cancels itself out and a limbless character reads as
 * exactly as strong as an intact one.
 */

export type BodyResolutionMode = "base" | "resolved";

export const BODY_RESOLUTION_MODES = [
  "base",
  "resolved",
] as const satisfies readonly BodyResolutionMode[];


/*
 * Options accepted by every mode-aware Body resolver.
 *
 * An object rather than a bare mode argument, so that Phase 8's additional
 * resolution options arrive as new fields instead of new positional
 * parameters at a dozen call sites.
 */
export interface BodyResolutionOptions {
  readonly mode: BodyResolutionMode;
}
