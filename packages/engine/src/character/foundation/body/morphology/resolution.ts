/*
 * Resolving morphology for a BodyPart.
 *
 * Pure arithmetic over already-assembled layers. Where those layers come from
 * — Species content, an age curve, character state, Effects — is the caller's
 * concern; this file only knows how layers combine.
 */

import { NEUTRAL_MORPHOLOGY } from "../types";
import type { BodyMorphology } from "../types";
import type { BodyPartId } from "../anatomy/types";
import type { MorphologyResolutionInput, MorphologySource } from "./types";

const MORPHOLOGY_DIMENSIONS = [
  "length",
  "bulk",
  "muscularity",
  "adiposity",
] as const satisfies readonly (keyof BodyMorphology)[];


/*
 * Combines contributions that sit in the SAME layer, by adding deviations.
 *
 *   1 + Sum(contribution - 1)
 *
 * Two +20% bonuses make 1.40 rather than 1.44. Stacked bonuses of a kind stay
 * linear, which keeps a long list of small modifiers from compounding into
 * something nobody predicted.
 */
export function combineWithinLayer(
  contributions: readonly Partial<BodyMorphology>[],
): BodyMorphology {
  const combined = {} as { -readonly [K in keyof BodyMorphology]: number };

  for (const dimension of MORPHOLOGY_DIMENSIONS) {
    let total = 1;

    for (const contribution of contributions) {
      const value = contribution[dimension];

      if (value === undefined) continue;

      total += value - 1;
    }

    combined[dimension] = total;
  }

  return combined;
}


/*
 * Combines DIFFERENT layers, by multiplying.
 *
 * A Species that is 30% broader than the Human reference and an individual who
 * is 20% broader than their own kind are making two independent claims, and
 * the body is 1.56 times broader, not 1.50.
 */
export function multiplyLayers(
  layers: readonly BodyMorphology[],
): BodyMorphology {
  const product = {} as { -readonly [K in keyof BodyMorphology]: number };

  for (const dimension of MORPHOLOGY_DIMENSIONS) {
    let total = 1;

    for (const layer of layers) {
      total *= layer[dimension];
    }

    product[dimension] = total;
  }

  return product;
}


/*
 * One source's effective morphology for one BodyPart: its global values with
 * that part's local values layered on within the same source.
 */
function sourceMorphologyFor(
  source: MorphologySource,
  partId: BodyPartId,
): BodyMorphology {
  const local = source.local[partId];

  if (local === undefined) return source.global;

  return combineWithinLayer([source.global, local]);
}


/*
 * Resolves the morphology of one BodyPart through the full layer stack.
 *
 * Strength development enters as its own single-dimension layer rather than
 * being folded into the character's own muscularity, so that innate build and
 * bought development stay separately inspectable — a character sheet can say
 * "1.2 naturally, 1.57 from training" instead of one opaque 1.89.
 */
export function resolvePartMorphology(
  input: MorphologyResolutionInput,
  partId: BodyPartId,
): BodyMorphology {
  const strengthDevelopment: BodyMorphology = {
    ...NEUTRAL_MORPHOLOGY,
    muscularity: input.strengthDevelopmentMuscularity,
  };

  return multiplyLayers([
    sourceMorphologyFor(input.species, partId),
    sourceMorphologyFor(input.age, partId),
    sourceMorphologyFor(input.character, partId),
    strengthDevelopment,
    ...input.effectLayers.map(
      (layer) => sourceMorphologyFor(layer, partId),
    ),
  ]);
}


/*
 * Resolves morphology for every named BodyPart.
 */
export function resolveMorphology(
  input: MorphologyResolutionInput,
  partIds: readonly BodyPartId[],
): Readonly<Record<BodyPartId, BodyMorphology>> {
  const resolved: Record<BodyPartId, BodyMorphology> = {};

  for (const partId of partIds) {
    resolved[partId] = resolvePartMorphology(input, partId);
  }

  return resolved;
}
