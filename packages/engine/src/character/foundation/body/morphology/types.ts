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
import type { BodyPartId } from "../anatomy/types";


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

  readonly local: Readonly<Record<BodyPartId, Partial<BodyMorphology>>>;
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
 * `effectLayers` is empty until the Body Effect vocabulary exists. Each entry
 * is one already-combined layer, so callers decide what counts as a layer and
 * this file only multiplies them.
 */
export interface MorphologyResolutionInput {
  readonly species: MorphologySource;
  readonly age: MorphologySource;
  readonly character: MorphologySource;

  readonly strengthDevelopmentMuscularity: number;

  readonly effectLayers: readonly MorphologySource[];
}
