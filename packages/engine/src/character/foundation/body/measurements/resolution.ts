/*
 * Resolving physical measurements from reference data, Scale and morphology.
 *
 * The shape of every measurement is the same: take the authored Basic Human
 * Standard value, scale it geometrically, then apply the morphology factors
 * that dimension actually responds to.
 *
 *   ScaledReferenceLength = ReferenceLength x EffectiveScale
 *   ScaledReferenceSize   = ReferenceSize   x EffectiveScale^3
 *   ScaledReferenceMass   = ReferenceMass   x EffectiveScale^3
 *
 * The exponents are geometry, not calibration. Doubling every linear dimension
 * multiplies volume — and therefore mass at constant density — by eight.
 *
 * Which morphology dimension reaches which measurement is the part that
 * carries meaning, and the asymmetry is deliberate:
 *
 *   Length  responds to length alone
 *   Size    responds to length, bulk and adiposity
 *   Mass    responds to length, bulk, adiposity AND muscularity
 *
 * Muscularity is in Mass but not in Size because muscle is denser than what it
 * replaces. A heavily built character is heavier than a soft one of the same
 * volume rather than larger than them, which is exactly the distinction a
 * single "build" score cannot express.
 *
 * Sensitivities decide how much of each deviation reaches a given part. An Arm
 * has bulkSize 1.00 and a Head has 0.15, so a broadly-built character has
 * substantially thicker arms and a barely larger skull.
 *
 * Internal resolvers return plain values. EngineResult/TraceNode wrapping
 * happens at body/resolution.ts once that exists, matching how attributes/
 * already works.
 */

import { createBodyPartDefinitionMap } from "../selectors";
import { NEUTRAL_MORPHOLOGY } from "../types";
import { resolveHeightCm } from "./height";
import type { BodyMorphology } from "../types";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
  BodyPartMorphologySensitivity,
  BodyPartReference,
} from "../anatomy/types";
import type {
  ResolvedBodyMeasurements,
  ResolvedPartMeasurements,
} from "./types";


/*
 * How much larger Bulk makes this particular part.
 *
 *   1 + ((Bulk - 1) x BulkSizeSensitivity)
 *
 * Linear rather than exponential: bulk is breadth, and breadth accumulates.
 */
export function resolveEffectiveBulk(
  morphology: BodyMorphology,
  sensitivity: BodyPartMorphologySensitivity,
): number {
  return 1 + ((morphology.bulk - 1) * sensitivity.bulkSize);
}


/*
 * How much larger Adiposity makes this particular part.
 *
 *   1 + ((Adiposity - 1) x AdipositySizeSensitivity)
 *
 * Kept separate from bulk because fat and frame do not distribute alike. The
 * Human sensitivities put most adiposity on the torso and almost none on the
 * skull.
 */
export function resolveAdipositySizeFactor(
  morphology: BodyMorphology,
  sensitivity: BodyPartMorphologySensitivity,
): number {
  return 1 + ((morphology.adiposity - 1) * sensitivity.adipositySize);
}


/*
 * How much heavier this part's composition makes it, at unchanged volume.
 *
 *   1 + ((Muscularity - 1) x MuscularityMassSensitivity)
 *     + ((Adiposity   - 1) x AdiposityMassSensitivity)
 *
 * The two contributions ADD rather than multiply. They are two components of
 * one body's composition, not two independent causes, and adding keeps a
 * muscular-and-soft body from compounding into a density nothing could have.
 *
 * Adiposity appears in both this factor and the size factor because fat adds
 * volume and mass at once. Muscularity appears only here.
 */
export function resolveMassCompositionFactor(
  morphology: BodyMorphology,
  sensitivity: BodyPartMorphologySensitivity,
): number {
  return (
    1 +
    ((morphology.muscularity - 1) * sensitivity.muscularityMass) +
    ((morphology.adiposity - 1) * sensitivity.adiposityMass)
  );
}


/*
 * Resolves one BodyPart's Length, Size and Mass.
 *
 * Takes the definition's reference values and sensitivities rather than the
 * definition itself so that the arithmetic stays testable against invented
 * anatomy without needing a registered BodyPartDefinition.
 */
export function resolvePartMeasurements(
  partId: BodyPartId,
  reference: BodyPartReference,
  sensitivity: BodyPartMorphologySensitivity,
  morphology: BodyMorphology,
  effectiveScale: number,
): ResolvedPartMeasurements {
  const scale3 = effectiveScale * effectiveScale * effectiveScale;

  const lengthFactor = morphology.length;

  const effectiveBulk = resolveEffectiveBulk(morphology, sensitivity);

  const adipositySizeFactor = resolveAdipositySizeFactor(
    morphology,
    sensitivity,
  );

  const massCompositionFactor = resolveMassCompositionFactor(
    morphology,
    sensitivity,
  );

  return {
    partId,

    lengthCm: reference.lengthCm * effectiveScale * lengthFactor,

    sizeL:
      reference.sizeL *
      scale3 *
      lengthFactor *
      effectiveBulk *
      adipositySizeFactor,

    massKg:
      reference.massKg *
      scale3 *
      lengthFactor *
      effectiveBulk *
      massCompositionFactor,
  };
}


/*
 * Resolves the physical measurements of a whole body.
 *
 * Only active anatomy participates. A suppressed or archived-removed BodyPart
 * has left the body: it has no volume, no mass, and no place in the vertical
 * geometry.
 *
 * Damage is a separate axis and does not appear here at all. A limb that is
 * badly hurt, paralysed, or stranded behind a destroyed Joint still weighs
 * what it weighs, because it is still attached. Only actually leaving the body
 * removes a part's physical measurements — which is also why a character who
 * loses an arm gets lighter and a character who breaks one does not.
 *
 * `morphologyByPartId` comes from morphology/resolution.ts and is keyed by
 * BodyPart INSTANCE id, so one Arm can be longer than the other. A part with
 * no entry resolves at neutral morphology rather than failing: absent
 * morphology data means "nothing has an opinion about this part", which is
 * exactly neutral.
 */
export function resolveBodyMeasurements(
  anatomy: Anatomy,
  definitions: readonly BodyPartDefinition[],
  morphologyByPartId: Readonly<Record<BodyPartId, BodyMorphology>>,
  effectiveScale: number,
): ResolvedBodyMeasurements {
  const definitionsById = createBodyPartDefinitionMap(definitions);

  const parts: ResolvedPartMeasurements[] = [];
  const byPartId: Record<BodyPartId, ResolvedPartMeasurements> = {};

  const lengthCmByPartId: Record<BodyPartId, number> = {};

  for (const part of anatomy.parts) {
    if (part.state !== "active") continue;

    const definition = definitionsById.get(part.type);

    /*
     * Anatomy is assumed to have passed validation, so an unknown type is an
     * invalid engine state rather than an input to tolerate. Same convention
     * as selectBodyParts.
     */
    if (definition === undefined) {
      throw new Error(
        `Cannot resolve measurements for BodyPart "${part.id}": ` +
        `unknown BodyPartDefinition "${part.type}".`,
      );
    }

    const morphology =
      morphologyByPartId[part.id] ?? NEUTRAL_MORPHOLOGY;

    const measurements = resolvePartMeasurements(
      part.id,
      definition.reference,
      definition.sensitivity,
      morphology,
      effectiveScale,
    );

    parts.push(measurements);
    byPartId[part.id] = measurements;
    lengthCmByPartId[part.id] = measurements.lengthCm;
  }

  return {
    parts,
    byPartId,

    totalSizeL: parts.reduce(
      (total, part) => total + part.sizeL,
      0,
    ),

    totalMassKg: parts.reduce(
      (total, part) => total + part.massKg,
      0,
    ),

    heightCm: resolveHeightCm(
      anatomy,
      definitions,
      lengthCmByPartId,
    ),
  };
}
