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
 * The default density of adipose and other soft tissue, in kg per litre.
 *
 * Real adipose tissue sits at roughly 0.90 to 0.92 kg/L, against the ~1.06 of
 * lean tissue and far more for bone. This is the physical constant that makes
 * a fat body lighter for its size than a muscular one without anybody
 * authoring that relationship: the reference Human is 62 kg in 60 L, a density
 * of 1.033, and every litre adiposity adds arrives at 0.9.
 *
 * Species-overridable, because soft tissue is a biological fact rather than a
 * universal one, but authored once per Species instead of once per BodyPart —
 * a creature whose fat differs from its arm fat is a special case, not the
 * normal one.
 */
export const DEFAULT_ADIPOSE_TISSUE_DENSITY_KG_PER_L = 0.9;


/*
 * How much heavier this part's composition makes it, at unchanged volume.
 *
 *   1 + ((Muscularity - 1) x MuscularityMassSensitivity)
 *
 * Muscularity only. Adiposity used to appear here too, with its own authored
 * sensitivity, and that was the mistake: it let a definition claim adiposity
 * adds a lot of volume and very little weight. The Human table did exactly
 * that — a whole-body size response of 0.171 against a mass response of 0.092
 * — so an Adiposity 5 body gained 41 litres and only 23 kg, and read as
 * unremarkable on any mass measure while being obviously obese by volume.
 *
 * Muscularity belongs here and adiposity does not, because they are physically
 * different events. Muscularity is tissue developing inside a volume that
 * already exists, so it is genuinely a density change. Adiposity is new tissue
 * appearing, so its mass is that tissue's volume times what that tissue
 * weighs — see resolveAdiposityMassDelta.
 */
export function resolveMassCompositionFactor(
  morphology: BodyMorphology,
  sensitivity: BodyPartMorphologySensitivity,
): number {
  return 1 + ((morphology.muscularity - 1) * sensitivity.muscularityMass);
}


/*
 * The volume adiposity adds to a part, in litres.
 *
 * Taken against the part's volume BEFORE adiposity — scaled reference size
 * through Length and Bulk — so that adiposity is a proportion of the body it
 * is being added to rather than of the body it produces. A broader frame
 * carries proportionally more fat at the same Adiposity, which is right, and
 * the term stays linear in (Adiposity - 1) instead of compounding with itself.
 *
 * Negative below Adiposity 1: soft tissue is removed rather than added, and
 * the mass leaves with it.
 */
export function resolveAdiposityVolumeDeltaL(
  preAdiposityVolumeL: number,
  morphology: BodyMorphology,
  sensitivity: BodyPartMorphologySensitivity,
): number {
  return (
    preAdiposityVolumeL *
    (morphology.adiposity - 1) *
    sensitivity.adipositySize
  );
}


/*
 * The mass that added soft tissue brings with it.
 *
 * The whole point of the change: tissue cannot appear as volume without
 * weighing something, so there is no second sensitivity that could disagree
 * with the first. Every future Species answers one question about adiposity —
 * how much bulk of soft tissue does this part gain — and its weight follows.
 */
export function resolveAdiposityMassDeltaKg(
  adiposityVolumeDeltaL: number,
  tissueDensityKgPerL: number,
): number {
  return adiposityVolumeDeltaL * tissueDensityKgPerL;
}


export function resolvePartMeasurements(
  partId: BodyPartId,
  reference: BodyPartReference,
  sensitivity: BodyPartMorphologySensitivity,
  morphology: BodyMorphology,
  effectiveScale: number,
  adiposeTissueDensityKgPerL = DEFAULT_ADIPOSE_TISSUE_DENSITY_KG_PER_L,
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

  /*
   * The part's volume before adiposity: everything Scale, Length and Bulk
   * make it, and nothing fat has added yet. Both the size factor and the
   * adiposity mass delta are taken against this, which is what keeps the two
   * consistent by construction — the same litres that appear in Size are the
   * litres that are weighed into Mass.
   */
  const preAdiposityVolumeL =
    reference.sizeL * scale3 * lengthFactor * effectiveBulk;

  const adiposityVolumeDeltaL = resolveAdiposityVolumeDeltaL(
    preAdiposityVolumeL,
    morphology,
    sensitivity,
  );

  return {
    partId,

    lengthCm: reference.lengthCm * effectiveScale * lengthFactor,

    sizeL: preAdiposityVolumeL * adipositySizeFactor,

    /*
     * Lean mass through the multiplicative chain, then adipose tissue ADDED
     * rather than multiplied in. Fat is not a property of the rest of the
     * body; it is extra tissue sitting alongside it, and it weighs what it
     * weighs regardless of how muscular the part underneath happens to be.
     */
    massKg:
      reference.massKg *
        scale3 *
        lengthFactor *
        effectiveBulk *
        massCompositionFactor +
      resolveAdiposityMassDeltaKg(
        adiposityVolumeDeltaL,
        adiposeTissueDensityKgPerL,
      ),
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
  adiposeTissueDensityKgPerL = DEFAULT_ADIPOSE_TISSUE_DENSITY_KG_PER_L,
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
      adiposeTissueDensityKgPerL,
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
