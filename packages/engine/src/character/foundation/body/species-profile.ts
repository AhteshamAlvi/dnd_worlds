/*
 * The physical baseline a Species hands to the Body resolver.
 *
 * Body resolution is generic. It never asks what Species a character is, and
 * it must never grow a branch like `if (species === "giant")`. A Giant is
 * large because its profile says `standardScale: 10`, and every physical
 * consequence — a 16.5 m body, 62 tonnes, 10,000 Structural Capacity, STR 16 —
 * falls out of the same formulas that resolve a Human. Species supplies data;
 * Body does physics.
 *
 * That is also why mixed ancestry has to collapse into one profile before it
 * reaches Body. Deciding what a half-Giant's standard Scale should be is an
 * ancestry question, and Body has no business answering it.
 */

import type { BodyMorphology } from "./types";
import type { BodyPartId, ReferenceForm } from "./anatomy/types";


/*
 * Species-level physical definition.
 *
 * `standardScale` is the canonical mature proportional size of this Species
 * relative to the Human reference, where a Human is 1. It answers only "how
 * fundamentally large is a normal adult of this kind?" — never how large this
 * particular individual is, and never how old they are. Those are Character
 * Scale and Age Scale, and Effective Scale is the product of all three.
 *
 * Scale is not morphology. A Troll can be fundamentally larger (Scale),
 * long-armed (local Length), thick-set (Bulk) and differently muscled
 * (Muscularity) all at once, and keeping them separate is what lets it be
 * exactly one of those things when that is what the Species calls for.
 *
 * Scale propagates by dimension, not uniformly:
 *
 *   Length  proportional to  Scale
 *   Size    proportional to  Scale cubed
 *   Mass    proportional to  Scale cubed
 *   SC      proportional to  Scale squared
 *
 * so doubling Scale gives twice the height, eight times the mass, and four
 * times the structural capacity.
 *
 * `referenceForm` is the intact anatomy a mature member of this Species is
 * supposed to possess. It is the normalization denominator, which is why a
 * four-armed Species gets no free Strength: its extra Arms raise the numerator
 * and the denominator by the same 36, and it resolves to STR 10 like anyone
 * else while still owning two more Arms' worth of real Strength Points.
 *
 * The Age profile is deliberately absent for now; it arrives with the Age
 * subsystem, along with the anchors and interpolation that turn a character's
 * age into Scale and morphology.
 */
export interface SpeciesBodyProfile {
  readonly standardScale: number;

  readonly referenceForm: ReferenceForm;

  /** Species morphology applied to every BodyPart of this Species. */
  readonly globalMorphology: BodyMorphology;

  /**
   * Species morphology for specific BodyParts, layered over the global values.
   *
   * This is where a Species gets its shape rather than merely its size: long
   * arms, a heavy tail, a thick neck.
   */
  readonly localMorphology: Readonly<
    Record<BodyPartId, Partial<BodyMorphology>>
  >;
}
