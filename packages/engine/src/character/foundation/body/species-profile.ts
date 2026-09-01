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
import type { BodyPartId, ReferenceFormId } from "./anatomy/types";
import type { SpeciesStatureBands } from "./stature/types";
import type { SpeciesAgeProfile } from "./age/types";


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
 * `ageProfile` is the anchors and interpolation that turn a character's age
 * into Scale and morphology. It is optional: a Species whose age has no
 * physical consequence simply omits it and resolves at neutral.
 */
export interface SpeciesBodyProfile {
  readonly standardScale: number;

  /*
   * The body plan a mature member of this Species has, by id.
   *
   * A reference rather than the form itself, so that the same plan can be
   * named by a transformation, a mutation or an Item without going through the
   * Species that happens to use it — and so there is one authoritative copy of
   * what a Human body is arranged like. See anatomy/reference-forms.ts.
   */
  readonly referenceFormId: ReferenceFormId;

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

  /*
   * How far an individual of this Species may differ from that norm before
   * something has to explain it.
   *
   * Authored as ratios to the ordinary same-age member rather than as
   * centimetres and kilograms, so one pair of numbers covers every age and
   * every Scale — see stature/types.ts. A Species that has not thought about
   * it can widen the band; it cannot sensibly omit it, because "no limit" is
   * itself a claim about the Species and should be written down as one.
   */
  readonly stature: SpeciesStatureBands;

  /*
   * What this Species' soft tissue weighs, in kg per litre.
   *
   * The one number that turns adiposity into mass. There is no per-BodyPart
   * adiposity mass sensitivity any more: a definition says how much soft-tissue
   * VOLUME a part gains, and this says what that volume weighs, so the two can
   * never drift into claiming fat that adds bulk without adding weight.
   *
   * Human-calibrated at 0.9 (see DEFAULT_ADIPOSE_TISSUE_DENSITY_KG_PER_L).
   * Species with materially different biology override it; a creature whose
   * fat differs from part to part is a special case that can grow local
   * overrides later rather than making everyone author eight identical numbers
   * today.
   */
  readonly adiposeTissueDensityKgPerL: number;

  /*
   * How this Species develops with age.
   *
   * Optional because age has no universal meaning and a Species may simply not
   * have an opinion: a construct that is built rather than born has no
   * developmental curve, and absent is the honest way to say so. Absent
   * resolves as a mature adult at every age.
   */
  readonly ageProfile?: SpeciesAgeProfile;
}
