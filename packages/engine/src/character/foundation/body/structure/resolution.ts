/*
 * Resolving Structural Capacity.
 *
 * One formula, and most of the interest is in what is missing from it:
 *
 *   MuscularityStructuralFactor = 1 + ((Muscularity - 1) x sensitivity)
 *
 *   StructuralCapacity = ReferenceStructuralCapacity
 *                      x EffectiveScale^2
 *                      x MuscularityStructuralFactor
 *
 * Scale enters SQUARED, where Size and Mass take the cube. That is not a
 * calibration choice — it is the difference between volume and cross-section.
 * Doubling every linear dimension multiplies volume by eight but the
 * load-bearing cross-section only by four, and it is cross-section that
 * carries force and resists destruction. This single exponent is why a
 * proportionally ordinary Giant is enormously strong without any Species
 * authoring a Strength bonus, and equally why it is proportionally *weaker*
 * than a Human for its own mass. Square-cube, as it is for real animals.
 *
 * SC responds to exactly two things: Effective Scale and Muscularity. It is
 * NOT touched by Length, Bulk, Adiposity, CON, or STR.
 *
 * That exclusion is the load-bearing part. Length and Bulk make a body large;
 * Adiposity makes it heavy; none of them makes it strong. A creature can
 * therefore be enormous and structurally feeble, which a model where size
 * implies capacity cannot express. Age reaches SC only upstream, through Age
 * Scale and Age Muscularity, never as a multiplier of its own.
 *
 * Muscularity's structural response is LINEAR while Strength doubles per tier.
 * That gap is deliberate and is closed elsewhere, by a separate exponential
 * force response — see the Muscularity Force Factor. Without the split,
 * reaching high Strength would demand physically absurd Muscularity and
 * therefore absurd Mass.
 */

import { createBodyPartDefinitionMap } from "../selectors";
import { NEUTRAL_MORPHOLOGY } from "../types";
import type { BodyMorphology } from "../types";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
  BodyPartMorphologySensitivity,
} from "../anatomy/types";
import type {
  ResolvedBodyStructuralCapacity,
  ResolvedPartStructuralCapacity,
} from "./types";


/*
 * How much more (or less) Structural Capacity Muscularity gives this part.
 *
 *   1 + ((Muscularity - 1) x MuscularityStructuralSensitivity)
 *
 * Linear, and bounded by validation to a sensitivity within [0, 1]. Above 1
 * this expression crosses zero at legal low Muscularity — at s = 1.5,
 * M = 0.3 gives -0.05 — and the part gets negative Structural Capacity, Body
 * Points and Strength Points. Rejected as a validation failure rather than
 * clamped, because a silent clamp would hide anatomy authored wrong.
 */
export function resolveMuscularityStructuralFactor(
  morphology: BodyMorphology,
  sensitivity: BodyPartMorphologySensitivity,
): number {
  return 1 + ((morphology.muscularity - 1) * sensitivity.muscularityStructural);
}


/*
 * Resolves one BodyPart's Structural Capacity.
 *
 * Takes reference SC and sensitivity as plain values rather than a whole
 * definition, so the arithmetic stays testable against invented anatomy.
 */
export function resolvePartStructuralCapacity(
  partId: BodyPartId,
  referenceStructuralCapacity: number,
  sensitivity: BodyPartMorphologySensitivity,
  morphology: BodyMorphology,
  effectiveScale: number,
): ResolvedPartStructuralCapacity {
  const muscularityStructuralFactor = resolveMuscularityStructuralFactor(
    morphology,
    sensitivity,
  );

  return {
    partId,

    structuralCapacity:
      referenceStructuralCapacity *
      effectiveScale *
      effectiveScale *
      muscularityStructuralFactor,

    muscularityStructuralFactor,
  };
}


/*
 * Resolves the Structural Capacity of a whole body.
 *
 * Only active anatomy participates, for the same reason it does in
 * measurements: a suppressed or severed part is not there to bear anything.
 *
 * Note that this is CURRENT structural capacity — what the body has. It is not
 * the Reference Form Anatomical Capacity that Strength normalizes against,
 * which is a sum over the anatomy the form is SUPPOSED to have and never
 * shrinks from damage. Conflating the two is the bug that makes amputation
 * cancel itself out, so they are computed from different inputs on purpose.
 */
export function resolveBodyStructuralCapacity(
  anatomy: Anatomy,
  definitions: readonly BodyPartDefinition[],
  morphologyByPartId: Readonly<Record<BodyPartId, BodyMorphology>>,
  effectiveScale: number,
): ResolvedBodyStructuralCapacity {
  const definitionsById = createBodyPartDefinitionMap(definitions);

  const parts: ResolvedPartStructuralCapacity[] = [];
  const byPartId: Record<BodyPartId, ResolvedPartStructuralCapacity> = {};

  for (const part of anatomy.parts) {
    if (part.state !== "active") continue;

    const definition = definitionsById.get(part.type);

    /*
     * Anatomy is assumed validated, so an unknown type is an invalid engine
     * state. Same convention as selectBodyParts and the measurement resolvers.
     */
    if (definition === undefined) {
      throw new Error(
        `Cannot resolve Structural Capacity for BodyPart "${part.id}": ` +
        `unknown BodyPartDefinition "${part.type}".`,
      );
    }

    const resolved = resolvePartStructuralCapacity(
      part.id,
      definition.reference.structuralCapacity,
      definition.sensitivity,
      morphologyByPartId[part.id] ?? NEUTRAL_MORPHOLOGY,
      effectiveScale,
    );

    parts.push(resolved);
    byPartId[part.id] = resolved;
  }

  return {
    parts,
    byPartId,

    totalStructuralCapacity: parts.reduce(
      (total, part) => total + part.structuralCapacity,
      0,
    ),
  };
}
