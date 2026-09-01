/*
 * Morphology layering.
 *
 * A resolved BodyPart's morphology is the product of every layer that has an
 * opinion about it: Species, Age, the character themselves, their Strength
 * development, and any physical effects acting on them.
 *
 * The distinction that matters, and the one easiest to get wrong:
 *
 *   WITHIN a layer, contributions ADD their deviations from 1.
 *   BETWEEN layers, resolved factors MULTIPLY.
 *
 * So two Traits granting +20% and +10% Bulk make 1.30 in the Trait layer, not
 * 1.32. Adding within a layer keeps a stack of similar bonuses linear and
 * predictable; multiplying between layers keeps genuinely independent causes
 * independent, so that a Giant's Species size and an individual's own build
 * compose rather than compete.
 */

import type { BodyMorphology } from "../types";
import type {
  AnatomySlotKey,
  BodyPartId,
  ContinuityKey,
} from "../anatomy/types";


/*
 * One layer's morphology: values applied to every part, plus overrides for
 * specific ones.
 *
 * Local values layer over global values within the same source rather than
 * replacing them, so a Species can be broadly heavy-set and separately
 * long-armed without the second statement erasing the first.
 */
export interface MorphologySource {
  readonly global: BodyMorphology;

  /*
   * Keyed by ANATOMY SLOT, not by instance.
   *
   * This is what makes regeneration restore the character's own arm rather
   * than a species-default one. Local morphology is a fact about an
   * anatomical position — "this character's left arm is 15% longer" — and
   * positions outlive the tissue occupying them. Keyed by instance, every
   * regrown limb would silently revert to neutral, because the new instance
   * has a new id and would match nothing.
   *
   * Build keys with anatomySlotKey so the form namespace is never dropped.
   */
  readonly local: Readonly<Record<AnatomySlotKey, Partial<BodyMorphology>>>;
}


/*
 * Everything that shapes a body, in resolution order.
 *
 * `strengthDevelopmentMuscularity` is a bare number rather than a source
 * because it is exactly one dimension of one layer: the Muscularity a
 * character has physically built through Strength advancement. It is
 * persistent Body state, not an Effect, and it is multiplied in here exactly
 * once — a second path would double-count every Strength point ever bought.
 *
 * `effectLayers` carries the morphology Body Effects declared, one entry per
 * already-combined layer — body/effects.ts builds one per resolution mode.
 * Callers decide what counts as a layer; this file only multiplies them.
 */
export interface MorphologyResolutionInput {
  readonly species: MorphologySource;
  readonly age: MorphologySource;
  readonly character: MorphologySource;

  /*
   * What is unusual about this particular character's particular anatomy,
   * keyed by CONTINUITY identity rather than by slot.
   *
   * Its own field rather than another MorphologySource because it is keyed
   * differently, and that difference is the point: a Troll's 20%-longer right
   * arm is a fact about their upper-limb:right, so it follows that identity
   * through regeneration and through a change of form, while a Species' local
   * morphology is a fact about a slot in one body plan and does not.
   */
  readonly individual: Readonly<
    Record<ContinuityKey, Partial<BodyMorphology>>
  >;

  readonly strengthDevelopmentMuscularity: number;

  readonly effectLayers: readonly MorphologySource[];
}
