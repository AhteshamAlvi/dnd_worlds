/*
 * Core Body-domain value shapes.
 *
 * Body represents the character's persistent physical organism.
 *
 * Height, Mass and Size are NOT stored here. They resolve from anatomy, Scale
 * and morphology in body/measurements/, because a stored height and a resolved
 * height are two sources that can disagree and one of them is always the wrong
 * one to trust.
 *
 * Anatomy is persistent character state and represents the body parts the
 * character currently physically possesses.
 *
 * Derived values such as resolved Body Points, Current BP, morphology
 * multipliers, and Critical Point instances are not stored here.
 */

import type { Anatomy, BodyPartId } from "./anatomy/types";
import type { AnatomicalPointStates } from "./critical-points/state";


/*
 * Persistent physical state of a character.
 *
 * A neutral adult Human built from this shape resolves to the Basic Human
 * Standard: 165 cm, 62.00 kg, 60.00 L, 100 Structural Capacity.
 *
 * CON is not part of Body. It is an Attribute consumed later during
 * Body-Point resolution.
 */
export interface Body {
  /**
   * How large this individual is relative to an ordinary member of the same
   * Species at the same age. Neutral is 1.
   *
   * This is only one of three factors in Effective Scale — Species Standard
   * Scale and Age Scale are the others, and neither belongs to the character.
   * A Giant child is not "Character Scale 4"; it is a large Species at an
   * early point on its age curve, and this field would still read 1.
   */
  readonly characterScale: number;

  /** This individual's own morphology, applied to every BodyPart. */
  readonly globalMorphology: BodyMorphology;

  /**
   * Per-BodyPart morphology overrides, layered on top of the global values.
   *
   * Keyed by BodyPart instance id, so one Arm can be longer than the other.
   * Absent keys and absent properties simply contribute nothing.
   */
  readonly localMorphology: Readonly<
    Record<BodyPartId, Partial<BodyMorphology>>
  >;

  /**
   * The Muscularity this character has physically developed through Strength
   * advancement, as distinct from the Muscularity they were born with.
   *
   * Strength is not stored. Buying "+1 STR" does not write a number to a
   * sheet: it solves for the Muscularity that doubles this body's normalized
   * Strength Points and persists the result here. Displayed STR then falls out
   * of the physics.
   *
   * Kept separate from `globalMorphology.muscularity` so that advancement can
   * be re-derived, audited, and reasoned about without being tangled up in
   * innate build, Species muscularity, or Traits. Neutral is 1.
   *
   * This is persistent physical development, not an Effect. It is never
   * expressed as modifyBaseBodyMorphology, and progression must not convert it
   * into one — the morphology pipeline multiplies it in exactly once, and a
   * second path would silently double-count it.
   */
  readonly strengthDevelopmentMuscularity: number;

  readonly anatomy: Anatomy;

  /*
   * What has become of this body's Anatomical Points.
   *
   * Point instances are derived from anatomy; what has already happened to
   * them is not derivable from anything, so it is stored. Sparse — an entry
   * exists only for a point something has happened to, and absent means
   * active. See critical-points/state.ts.
   */
  readonly anatomicalPoints: AnatomicalPointStates;
}


/*
 * The four physical morphology dimensions, each a multiplier around 1.
 *
 * Neutral is 1.0 throughout: 0.80 is 20% below the reference body, 1.50 is
 * 50% above. Values must stay positive; there is no universal maximum.
 *
 * Adiposity 1.0 does not mean "no body fat" — it means the ordinary amount
 * already present in the reference body.
 *
 * The four are deliberately independent, because conflating them loses real
 * distinctions. High Bulk with low Muscularity is a large, thick, poorly
 * developed body; low Bulk with high Muscularity is a compact, powerful one.
 * A single "build" score cannot say both.
 *
 * What each dimension actually drives:
 *
 *   length      → Length, and through it Size, Mass and Height
 *   bulk        → Size, Mass, Body Points. Never Structural Capacity.
 *   muscularity → Mass, Structural Capacity, force production
 *   adiposity   → Size, Mass, Body Points. Never Structural Capacity.
 *
 * Only Muscularity reaches Structural Capacity, which is why it is the
 * mechanism Strength advancement operates through. A body can be enormous and
 * still weak: length and bulk make it big, not strong.
 */
export interface BodyMorphology {
  readonly length: number;
  readonly bulk: number;
  readonly muscularity: number;
  readonly adiposity: number;
}


/*
 * Neutral morphology — the Basic Human Standard's own values.
 */
export const NEUTRAL_MORPHOLOGY: BodyMorphology = {
  length: 1,
  bulk: 1,
  muscularity: 1,
  adiposity: 1,
};