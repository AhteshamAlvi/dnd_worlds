/*
 * Body Point morphology resolution.
 *
 * Morphology adjusts a BodyPart's template Base BP according to the
 * character's physical dimensions and body composition.
 *
 * The universal morphology dimensions are:
 *
 * - height;
 * - mass;
 * - muscularity;
 * - adiposity.
 *
 * These dimensions are intentionally resolved as one coherent model rather
 * than as four unrelated bonuses.
 *
 * Height establishes frame size.
 *
 * Muscularity and adiposity describe body composition relative to that frame.
 *
 * Expected mass is then derived from height and build. Actual mass is compared
 * against that expected mass so that unusually high or low mass can matter
 * without counting the same physical tissue multiple times.
 *
 * No rounding occurs anywhere in morphology. Rounding belongs to the final
 * Maximum-BP stage in body-points/resolution.ts.
 */

import type {
  Body,
} from "../types";
import type {
  Anatomy,
  BodyPart,
  BodyPartDefinition,
  MorphologySensitivity,
} from "../anatomy/types";
import type {
  BodyPartMorphologyFactors,
  MorphologyContext,
  ResolvedBodyPartMorphology,
  ResolvedMorphology,
} from "./types";


/*
 * Standard morphology reference.
 *
 * A character at exactly these values, using a BodyPartDefinition whose
 * sensitivities follow the standard humanoid data, receives neutral morphology
 * factors of 1.
 */
export const REFERENCE_HEIGHT_CM = 165;
export const REFERENCE_MASS_KG = 62;

export const REFERENCE_MUSCULARITY = 1;
export const REFERENCE_ADIPOSITY = 1;


/*
 * Calibration weights used to estimate expected body mass from build.
 *
 * These are mechanical calibration values, not literal biological percentages.
 *
 * Together at reference build:
 *
 * 0.45
 * + 0.35 × 1
 * + 0.20 × 1
 * = 1
 */
export const STRUCTURAL_MASS_WEIGHT = 0.45;
export const MUSCULAR_MASS_WEIGHT = 0.35;
export const ADIPOSE_MASS_WEIGHT = 0.20;


/*
 * Height exponent used when estimating expected mass.
 *
 * Expected mass scales with height squared rather than linearly or cubically.
 * This provides a useful humanoid size relationship without allowing stature
 * alone to overwhelm the BP system.
 */
export const EXPECTED_MASS_HEIGHT_EXPONENT = 2;


/*
 * Exponent used to soften unexplained residual mass.
 *
 * 0.5 is equivalent to taking the square root.
 *
 * Example:
 *
 * actual mass = 120% of expected mass
 *
 * residual mass ratio  = 1.20
 * residual mass factor = sqrt(1.20)
 *                      ≈ 1.095
 *
 * Thus a 20% unexplained mass difference does not automatically create a 20%
 * BP difference.
 */
export const RESIDUAL_MASS_EXPONENT = 0.5;


/*
 * Only the morphology-relevant portion of Body is required here.
 *
 * Anatomy is deliberately supplied separately because callers may resolve BP
 * against temporary/resolved Anatomy rather than the character's permanently
 * stored Anatomy.
 */
export type BodyMorphologyInput = Pick<
  Body,
  "heightCm" | "massKg" | "build"
>;


/*
 * Calculates the normalized height ratio.
 *
 * Reference:
 *
 * 165 / 165 = 1
 */
export function getHeightRatio(
  heightCm: number,
): number {
  return heightCm / REFERENCE_HEIGHT_CM;
}


/*
 * Calculates the build contribution used when estimating expected mass.
 *
 * muscularity = 1
 * adiposity   = 1
 *
 * produces:
 *
 * 0.45 + 0.35 + 0.20
 * = 1
 */
export function getBuildMassFactor(
  muscularity: number,
  adiposity: number,
): number {
  return (
    STRUCTURAL_MASS_WEIGHT +
    MUSCULAR_MASS_WEIGHT * muscularity +
    ADIPOSE_MASS_WEIGHT * adiposity
  );
}


/*
 * Calculates the expected mass of a character given height and build.
 *
 * Formula:
 *
 * expectedMass =
 *
 *   referenceMass
 *   × heightRatio²
 *   × buildMassFactor
 *
 * This is the primary mechanism that prevents height, muscularity, adiposity,
 * and total mass from independently rewarding the same physical tissue.
 */
export function getExpectedMassKg(
  heightRatio: number,
  buildMassFactor: number,
): number {
  return (
    REFERENCE_MASS_KG *
    Math.pow(
      heightRatio,
      EXPECTED_MASS_HEIGHT_EXPONENT,
    ) *
    buildMassFactor
  );
}


/*
 * Calculates how heavy or light the character is relative to the mass already
 * predicted by height, muscularity, and adiposity.
 *
 * 1
 * → exactly expected mass
 *
 * > 1
 * → heavier than expected
 *
 * < 1
 * → lighter than expected
 */
export function getResidualMassRatio(
  actualMassKg: number,
  expectedMassKg: number,
): number {
  return actualMassKg / expectedMassKg;
}


/*
 * Softens the residual-mass ratio before individual BodyPart sensitivity is
 * applied.
 *
 * Formula:
 *
 * residualMassFactor = residualMassRatio^0.5
 */
export function getResidualMassFactor(
  residualMassRatio: number,
): number {
  return Math.pow(
    residualMassRatio,
    RESIDUAL_MASS_EXPONENT,
  );
}


/*
 * Resolves character-wide morphology values once.
 *
 * These values are shared by every BodyPart and therefore should not be
 * recalculated independently for every part.
 */
export function resolveMorphologyContext(
  input: BodyMorphologyInput,
): MorphologyContext {
  const heightRatio =
    getHeightRatio(input.heightCm);

  const buildMassFactor =
    getBuildMassFactor(
      input.build.muscularity,
      input.build.adiposity,
    );

  const expectedMassKg =
    getExpectedMassKg(
      heightRatio,
      buildMassFactor,
    );

  const residualMassRatio =
    getResidualMassRatio(
      input.massKg,
      expectedMassKg,
    );

  const residualMassFactor =
    getResidualMassFactor(
      residualMassRatio,
    );

  return {
    heightRatio,
    buildMassFactor,
    expectedMassKg,
    residualMassRatio,
    residualMassFactor,
  };
}


/*
 * Applies a generic sensitivity to a normalized morphology factor.
 *
 * Formula:
 *
 * 1 + sensitivity × (factor - 1)
 *
 * Examples:
 *
 * sensitivity = 0
 * factor      = 1.5
 *
 * result = 1
 *
 *
 * sensitivity = 1
 * factor      = 1.5
 *
 * result = 1.5
 *
 *
 * sensitivity = 0.5
 * factor      = 1.5
 *
 * result = 1.25
 *
 * This generalized form allows unusual BodyPart definitions to use fractional
 * or greater-than-one sensitivities without requiring special engine logic.
 */
export function applyMorphologySensitivity(
  factor: number,
  sensitivity: number,
): number {
  return (
    1 +
    sensitivity * (factor - 1)
  );
}


/*
 * Resolves the height contribution for one BodyPart.
 */
export function resolveHeightFactor(
  context: MorphologyContext,
  sensitivity: MorphologySensitivity,
): number {
  return applyMorphologySensitivity(
    context.heightRatio,
    sensitivity.height,
  );
}


/*
 * Resolves residual mass contribution for one BodyPart.
 *
 * Importantly, this does NOT use raw body mass. It uses only the residual mass
 * left after height, muscularity, and adiposity have already explained the
 * expected weight of the body.
 */
export function resolveMassFactor(
  context: MorphologyContext,
  sensitivity: MorphologySensitivity,
): number {
  return applyMorphologySensitivity(
    context.residualMassFactor,
    sensitivity.mass,
  );
}


/*
 * Resolves muscularity contribution for one BodyPart.
 *
 * Muscularity is centered on the reference value of 1.
 *
 * Formula:
 *
 * 1 + muscularitySensitivity × (muscularity - 1)
 */
export function resolveMuscularityFactor(
  muscularity: number,
  sensitivity: MorphologySensitivity,
): number {
  return applyMorphologySensitivity(
    muscularity / REFERENCE_MUSCULARITY,
    sensitivity.muscularity,
  );
}


/*
 * Resolves adiposity contribution for one BodyPart.
 *
 * Adiposity is centered on the reference value of 1.
 */
export function resolveAdiposityFactor(
  adiposity: number,
  sensitivity: MorphologySensitivity,
): number {
  return applyMorphologySensitivity(
    adiposity / REFERENCE_ADIPOSITY,
    sensitivity.adiposity,
  );
}


/*
 * Resolves all morphology factors for one BodyPartDefinition.
 *
 * The complete morphology multiplier is multiplicative:
 *
 * height
 * × residual mass
 * × muscularity
 * × adiposity
 */
export function resolveBodyPartMorphologyFactors(
  input: BodyMorphologyInput,
  definition: BodyPartDefinition,
  context: MorphologyContext,
): BodyPartMorphologyFactors {
  const height =
    resolveHeightFactor(
      context,
      definition.morphologySensitivity,
    );

  const mass =
    resolveMassFactor(
      context,
      definition.morphologySensitivity,
    );

  const muscularity =
    resolveMuscularityFactor(
      input.build.muscularity,
      definition.morphologySensitivity,
    );

  const adiposity =
    resolveAdiposityFactor(
      input.build.adiposity,
      definition.morphologySensitivity,
    );

  const combinedMultiplier =
    height *
    mass *
    muscularity *
    adiposity;

  return {
    height,
    mass,
    muscularity,
    adiposity,
    combinedMultiplier,
  };
}


/*
 * Resolves morphology for one actual BodyPart instance.
 *
 * BodyPart instance data determines which definition applies.
 * The definition supplies template Base BP and sensitivities.
 *
 * No rounding occurs.
 */
export function resolveBodyPartMorphology(
  input: BodyMorphologyInput,
  part: BodyPart,
  definition: BodyPartDefinition,
  context: MorphologyContext,
): ResolvedBodyPartMorphology {
  const factors =
    resolveBodyPartMorphologyFactors(
      input,
      definition,
      context,
    );

  const morphologyAdjustedBaseBP =
    definition.baseBP *
    factors.combinedMultiplier;

  return {
    partId: part.id,
    type: part.type,

    templateBaseBP:
      definition.baseBP,

    factors,

    morphologyAdjustedBaseBP,
  };
}


/*
 * Creates a reusable definition lookup.
 *
 * Duplicate definition IDs should already have been rejected by
 * anatomy/validation.ts.
 */
function createDefinitionMap(
  definitions: readonly BodyPartDefinition[],
): ReadonlyMap<string, BodyPartDefinition> {
  return new Map(
    definitions.map(
      (definition) => [
        definition.id,
        definition,
      ],
    ),
  );
}


/*
 * Resolves morphology for every BodyPart in the supplied Anatomy.
 *
 * The Anatomy supplied here should normally be the current Resolved Anatomy,
 * not necessarily Body.anatomy.
 *
 * This allows temporary transformations to participate naturally:
 *
 * stored Anatomy
 * + temporary Anatomy modifications
 * → Resolved Anatomy
 * → morphology resolution
 *
 * The function assumes that Anatomy and BodyPartDefinitions have already passed
 * validation. An unknown BodyPart type therefore represents an invalid engine
 * state and causes an error rather than being silently omitted.
 */
export function resolveMorphology(
  input: BodyMorphologyInput,
  anatomy: Anatomy,
  definitions: readonly BodyPartDefinition[],
): ResolvedMorphology {
  const context =
    resolveMorphologyContext(input);

  const definitionsById =
    createDefinitionMap(definitions);

  const parts =
    anatomy.parts.map(
      (part): ResolvedBodyPartMorphology => {
        const definition =
          definitionsById.get(part.type);

        if (definition === undefined) {
          throw new Error(
            `Cannot resolve morphology for BodyPart "${part.id}": ` +
            `unknown BodyPartDefinition "${part.type}".`,
          );
        }

        return resolveBodyPartMorphology(
          input,
          part,
          definition,
          context,
        );
      },
    );

  return {
    context,
    parts,
  };
}