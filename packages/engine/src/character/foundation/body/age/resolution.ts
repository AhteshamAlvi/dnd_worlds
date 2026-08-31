/*
 * Resolving a character's age against their Species' developmental curve.
 *
 * Pure interpolation. Validity of the profile itself is age/validation.ts's
 * job, and this file assumes it has already been checked — an unsorted or
 * empty anchor list here is a bug upstream, not an input to handle.
 */

import { NEUTRAL_MORPHOLOGY } from "../types";
import type { BodyMorphology } from "../types";
import type { BodyPartId } from "../anatomy/types";
import type { AgeAnchor, ResolvedAge, SpeciesAgeProfile } from "./types";

const MORPHOLOGY_DIMENSIONS = [
  "length",
  "bulk",
  "muscularity",
  "adiposity",
] as const satisfies readonly (keyof BodyMorphology)[];


/*
 * Linear interpolation between two values.
 *
 * `t` is the position between them, already clamped to [0, 1] by the caller.
 */
function lerp(from: number, to: number, t: number): number {
  return from + ((to - from) * t);
}


/*
 * Interpolates one morphology object toward another.
 *
 * Absent dimensions are neutral rather than absent: a Species that authors
 * muscularity at one anchor and nothing at the next is saying muscularity
 * returns to 1, not that it stops existing.
 */
function lerpMorphology(
  from: Partial<BodyMorphology> | undefined,
  to: Partial<BodyMorphology> | undefined,
  t: number,
): BodyMorphology {
  const resolved = {} as { -readonly [K in keyof BodyMorphology]: number };

  for (const dimension of MORPHOLOGY_DIMENSIONS) {
    resolved[dimension] = lerp(
      from?.[dimension] ?? 1,
      to?.[dimension] ?? 1,
      t,
    );
  }

  return resolved;
}


/*
 * Interpolates the per-BodyPart morphology of two anchors.
 *
 * The union of both anchors' keys is walked, so a BodyPart that appears in
 * only one of them still interpolates — toward or away from neutral rather
 * than appearing and vanishing at the anchor boundary.
 */
function lerpLocalMorphology(
  from: AgeAnchor,
  to: AgeAnchor,
  t: number,
): Readonly<Record<BodyPartId, Partial<BodyMorphology>>> {
  const fromLocal = from.localMorphology ?? {};
  const toLocal = to.localMorphology ?? {};

  const partIds = new Set<BodyPartId>([
    ...Object.keys(fromLocal),
    ...Object.keys(toLocal),
  ]);

  const resolved: Record<BodyPartId, Partial<BodyMorphology>> = {};

  for (const partId of partIds) {
    resolved[partId] = lerpMorphology(
      fromLocal[partId],
      toLocal[partId],
      t,
    );
  }

  return resolved;
}


/*
 * Finds the two anchors bracketing an age, and how far between them it sits.
 *
 * Ages outside the authored range clamp to the nearest end. That is what makes
 * "stops growing" and "never senesces" expressible without a special flag: the
 * final anchor simply holds forever.
 */
function bracket(
  anchors: readonly AgeAnchor[],
  age: number,
): {
  readonly from: AgeAnchor;
  readonly to: AgeAnchor;
  readonly t: number;
  readonly fromIndex: number;
} {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];

  if (first === undefined || last === undefined) {
    throw new Error(
      "A Species Age Profile must contain at least one anchor.",
    );
  }

  if (age <= first.age) {
    return { from: first, to: first, t: 0, fromIndex: 0 };
  }

  if (age >= last.age) {
    return {
      from: last,
      to: last,
      t: 0,
      fromIndex: anchors.length - 1,
    };
  }

  for (let index = 1; index < anchors.length; index += 1) {
    const to = anchors[index];
    const from = anchors[index - 1];

    if (from === undefined || to === undefined) continue;

    if (age <= to.age) {
      const span = to.age - from.age;

      return {
        from,
        to,
        t: span === 0 ? 0 : (age - from.age) / span,
        fromIndex: index - 1,
      };
    }
  }

  return { from: last, to: last, t: 0, fromIndex: anchors.length - 1 };
}


/*
 * The life stage in force at an anchor.
 *
 * Stages are sparse: a Species names one where a new phase of life begins and
 * says nothing at the anchors in between, which are there to shape the curve
 * rather than to rename anything. So the stage is carried forward from the
 * most recent anchor that declared one, not read off the bracketing anchor.
 *
 * Without the backward scan, a curve naming "Young" at 0 and "Adult" at 20
 * would report no stage at all for anyone bracketed by an unnamed anchor in
 * between.
 */
function lifeStageAt(
  anchors: readonly AgeAnchor[],
  fromIndex: number,
): string | null {
  for (let index = fromIndex; index >= 0; index -= 1) {
    const anchor = anchors[index];

    if (anchor?.lifeStage !== undefined) return anchor.lifeStage;
  }

  return null;
}


/*
 * Resolves a character's age into physical development.
 *
 * A character with no authored age, or a Species with no age profile, is
 * treated as a mature adult: scale 1, morphology neutral. Absence of data
 * should not silently make a character a child.
 */
export function resolveAge(
  profile: SpeciesAgeProfile | undefined,
  age: number | undefined,
): ResolvedAge {
  if (profile === undefined || age === undefined) {
    return {
      age: age ?? 0,
      scale: 1,
      globalMorphology: NEUTRAL_MORPHOLOGY,
      localMorphology: {},
      lifeStage: null,
    };
  }

  const { from, to, t, fromIndex } = bracket(profile.anchors, age);

  return {
    age,
    scale: lerp(from.scale, to.scale, t),
    globalMorphology: lerpMorphology(from.morphology, to.morphology, t),
    localMorphology: lerpLocalMorphology(from, to, t),

    /*
     * A life stage names the span that begins at an anchor, so it comes from
     * the anchor already reached rather than the one being approached — a
     * 19-year-old is an adolescent, not four-fifths of an adult.
     */
    lifeStage: lifeStageAt(profile.anchors, fromIndex),
  };
}
