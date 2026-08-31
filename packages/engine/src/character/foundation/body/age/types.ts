/*
 * Age as a Species-defined developmental curve.
 *
 * Age has no universal physical meaning, so the engine never interprets a
 * number of years on its own. A 70-year-old Human is elderly, a 70-year-old
 * Dragon may be a hatchling, and a 70-year-old mayfly is a fossil. What age
 * does to a body is a fact about the Species, not about the number.
 *
 * Species therefore author anchors and the engine interpolates between them.
 * Anchors are data — plain numbers at plain ages — rather than formula strings
 * to be evaluated, because a rules engine that evaluates authored expressions
 * has stopped being data-driven and started being a scripting host.
 */

import type { BodyMorphology } from "../types";
import type { BodyPartId } from "../anatomy/types";


/*
 * One authored point on a Species' developmental curve.
 *
 * Every field except `age` is optional and defaults to neutral, so a Species
 * that only changes size with age authors only `scale` and says nothing about
 * morphology.
 *
 * `scale` is the proportional size of a normal member of this Species at this
 * age relative to its own canonical mature size — not relative to a Human. A
 * mature Giant and a mature Human both sit at 1.0; the Giant is larger because
 * its Species Standard Scale is 10.
 */
export interface AgeAnchor {
  readonly age: number;

  /** Proportional size at this age, where mature is 1. */
  readonly scale: number;

  /** Morphology applied to every BodyPart at this age. */
  readonly morphology?: Partial<BodyMorphology>;

  /** Morphology for specific BodyParts at this age. */
  readonly localMorphology?: Readonly<
    Record<BodyPartId, Partial<BodyMorphology>>
  >;

  /** Optional display name for the life stage beginning at this anchor. */
  readonly lifeStage?: string;
}


/*
 * A Species' complete developmental curve.
 *
 * Values before the first anchor hold at the first anchor, and values after
 * the last hold at the last. A Species that stops growing simply stops
 * authoring anchors; one that grows forever keeps adding them; one that never
 * senesces holds a flat mature curve indefinitely.
 *
 * Age-related disease, pathological decline, and similar misfortunes are not
 * age curves. They belong to Traits, Conditions, and diseases — the curve
 * describes ordinary development for a healthy member of the Species.
 */
export interface SpeciesAgeProfile {
  /** Only linear interpolation is supported today. */
  readonly interpolation: "linear";

  /** Ordered by age, strictly ascending, at least one entry. */
  readonly anchors: readonly AgeAnchor[];
}


/*
 * What a character's age resolves to physically.
 *
 * This sits between the Species baseline and the individual's own morphology:
 * Species answers "what kind of body is this", Age answers "what ordinary
 * developmental state is it in", and Character morphology answers "how does
 * this individual differ from that same-age norm".
 */
export interface ResolvedAge {
  readonly age: number;

  readonly scale: number;

  readonly globalMorphology: BodyMorphology;

  readonly localMorphology: Readonly<
    Record<BodyPartId, Partial<BodyMorphology>>
  >;

  readonly lifeStage: string | null;
}
