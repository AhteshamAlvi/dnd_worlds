/*
 * Resolving morphology for a BodyPart.
 *
 * Pure arithmetic over already-assembled layers. Where those layers come from
 * — Species content, an age curve, character state, Effects — is the caller's
 * concern; this file only knows how layers combine.
 */

import { NEUTRAL_MORPHOLOGY } from "../types";
import type { BodyMorphology } from "../types";
import { anatomySlotKey } from "../anatomy/types";
import type {
  Anatomy,
  AnatomySlotKey,
  ContinuityKey,
  ReferenceForm,
} from "../anatomy/types";
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
  slotKey: AnatomySlotKey,
): BodyMorphology {
  const local = source.local[slotKey];

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
  slotKey: AnatomySlotKey,
  continuityKey: ContinuityKey,
): BodyMorphology {
  const strengthDevelopment: BodyMorphology = {
    ...NEUTRAL_MORPHOLOGY,
    muscularity: input.strengthDevelopmentMuscularity,
  };

  /*
   * The individual layer is looked up by CONTINUITY identity while every other
   * layer is looked up by slot. Two keyings on purpose: what a Species does to
   * a position belongs to the form, and what is unusual about this person's
   * own anatomy belongs to them and travels with it.
   */
  const individual = combineWithinLayer([
    input.individual[continuityKey] ?? {},
  ]);

  return multiplyLayers([
    sourceMorphologyFor(input.species, slotKey),
    sourceMorphologyFor(input.age, slotKey),
    sourceMorphologyFor(input.character, slotKey),
    individual,
    strengthDevelopment,
    ...input.effectLayers.map(
      (layer) => sourceMorphologyFor(layer, slotKey),
    ),
  ]);
}


/*
 * One thing morphology has to be resolved FOR.
 *
 * `id` is whatever the caller wants the answer keyed by — a BodyPart instance
 * id when resolving present anatomy, a slot id when resolving the intact
 * Reference Form, which has no instances at all.
 *
 * `slotKey` is where the persistent local values are looked up.
 *
 * Keeping the two apart is the whole bridge: persistent morphology belongs to
 * anatomical positions so it survives regeneration, while every physics
 * resolver downstream wants its answers keyed by the thing it is iterating.
 */
export interface MorphologyTarget {
  readonly id: string;
  readonly slotKey: AnatomySlotKey;

  /*
   * The persistent identity standing in this position, so the individual layer
   * can be found. Carried on the target rather than looked up here because
   * only the caller knows which anatomy or form slot produced it.
   */
  readonly continuityKey: ContinuityKey;
}


/*
 * Convenience for the common case: resolve for a body's own instances.
 */
export function morphologyTargetsForAnatomy(
  anatomy: Anatomy,
): readonly MorphologyTarget[] {
  return anatomy.parts.map((part) => ({
    id: part.id,
    slotKey: anatomySlotKey(part.referenceFormId, part.referenceSlotId),
    continuityKey: part.continuityKey,
  }));
}


/*
 * Convenience for the intact Reference Form, which has no instances.
 */
export function morphologyTargetsForReferenceForm(
  referenceForm: ReferenceForm,
): readonly MorphologyTarget[] {
  return referenceForm.parts.map((part) => ({
    id: part.slotId,
    slotKey: anatomySlotKey(referenceForm.id, part.slotId),
    continuityKey: part.continuityKey,
  }));
}


/*
 * Resolves morphology for every requested target.
 */
export function resolveMorphology(
  input: MorphologyResolutionInput,
  targets: readonly MorphologyTarget[],
): Readonly<Record<string, BodyMorphology>> {
  const resolved: Record<string, BodyMorphology> = {};

  for (const target of targets) {
    resolved[target.id] = resolvePartMorphology(
      input,
      target.slotKey,
      target.continuityKey,
    );
  }

  return resolved;
}
