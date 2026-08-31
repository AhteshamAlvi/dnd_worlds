/*
 * Assessing stature.
 *
 * Every number here is a comparison between two resolutions of the same body:
 * the character as they are, and the ordinary member of their Species at their
 * age. Both go through the real measurement pipeline. Nothing is approximated
 * from Scale alone, because Scale is not the only thing that makes a body
 * tall — long legs do it too, and a band that only watched Character Scale
 * would miss exactly the character who was authored to slip past it.
 */

import { resolveBodyMeasurements } from "../measurements/resolution";
import { resolveMorphology } from "../morphology/resolution";
import { resolveEffectiveScale } from "../scale";
import type { BodyMorphology } from "../types";
import type { Anatomy } from "../anatomy/types";
import type {
  MorphologyResolutionInput,
  MorphologySource,
} from "../morphology/types";
import {
  HEIGHT_NORM_NEUTRALISED_DIMENSIONS,
  MASS_NORM_NEUTRALISED_DIMENSIONS,
} from "./types";
import type {
  StatureAssessment,
  StatureAssessmentInput,
  StatureBand,
  StatureDeviation,
  StatureDimensionAssessment,
  StatureStanding,
} from "./types";


/*
 * The base body is the intact form.
 *
 * Damage, amputation and suppression are not stature, and this mirrors
 * base-mode Strength, which treats the base form as intact for the same
 * reason.
 *
 * Note what this does and does not do. Both sides of every ratio measure the
 * SAME anatomy, so missing parts cancel and an amputee's ratio is unchanged
 * whether or not their state is stripped — the classification was never at
 * risk. What is at risk is the pair of absolute numbers reported alongside it.
 * A legless character measured as-is reports "77 cm against an ordinary 77
 * cm", which is true, useless, and reads as a bug to anyone looking at it.
 * Stripped, they report 165 against 165, which is what a base-body assessment
 * should say.
 */
function asIntact(anatomy: Anatomy): Anatomy {
  return {
    parts: anatomy.parts.map((part) =>
      part.state === "active" ? part : { ...part, state: "active" },
    ),
  };
}


/*
 * Sets specific morphology dimensions back to neutral in one layer, leaving
 * every other dimension and every other layer untouched.
 *
 * Local overrides are stripped of the same dimensions rather than dropped
 * wholesale: a character with long arms and thick legs, assessed for mass, is
 * still long-armed.
 */
function neutralise(
  source: MorphologySource,
  dimensions: readonly (keyof BodyMorphology)[],
): MorphologySource {
  const global = { ...source.global };

  for (const dimension of dimensions) {
    global[dimension] = 1;
  }

  const local: Record<string, Partial<BodyMorphology>> = {};

  for (const [partId, override] of Object.entries(source.local)) {
    const stripped = { ...override };

    for (const dimension of dimensions) {
      delete stripped[dimension];
    }

    local[partId] = stripped;
  }

  return { global, local };
}


function classify(
  ratio: number,
  band: StatureBand,
): { deviation: StatureDeviation; standing: StatureStanding } {
  if (ratio < band.min) {
    return { deviation: "below", standing: "exceptional" };
  }

  if (ratio > band.max) {
    return { deviation: "above", standing: "exceptional" };
  }

  return { deviation: "within", standing: "ordinary" };
}


function assessDimension(
  resolved: number,
  ordinary: number,
  band: StatureBand,
): StatureDimensionAssessment {
  /*
   * A norm of zero means the ordinary member of this Species has no height or
   * no mass, which is not a body. Rather than divide by it, treat the ratio as
   * 1: the band cannot say anything meaningful, and stature validation is the
   * place that should be complaining, not this arithmetic.
   */
  const ratio = ordinary === 0 ? 1 : resolved / ordinary;

  return {
    resolved,
    ordinary,
    ratio,
    band,
    ...classify(ratio, band),
  };
}


/*
 * Assesses one body against its Species' bands.
 *
 * The two norms are different bodies on purpose, and the difference is the
 * whole design:
 *
 *   height norm  this body at Character Scale 1 and neutral Length
 *   mass norm    this body at its OWN scale and length, neutral Bulk/Adiposity
 *
 * The height norm removes size, so the ratio answers "how much bigger is this
 * individual than their kind". The mass norm keeps size, so the ratio answers
 * "how heavy is this individual FOR THEIR OWN FRAME" — which is the only
 * version of the question that does not punish a character for being legally
 * tall. A 195 cm Human is within the height band and weighs proportionally
 * more; their mass ratio is 1.
 *
 * Muscularity is neutralised in neither, so it cancels out of both ratios. See
 * the note in types.ts: Strength advancement is the licensed route to muscular
 * mass and the STR cap already bounds it.
 */
export function assessStature(
  input: StatureAssessmentInput,
): StatureAssessment {
  const anatomy = asIntact(input.anatomy);
  const partIds = anatomy.parts.map((part) => part.id);

  const actualScale = resolveEffectiveScale(
    input.speciesStandardScale,
    input.ageScale,
    input.characterScale,
  );

  const normScale = resolveEffectiveScale(
    input.speciesStandardScale,
    input.ageScale,
    1,
  );

  const measure = (
    morphology: MorphologyResolutionInput,
    effectiveScale: number,
  ) =>
    resolveBodyMeasurements(
      anatomy,
      input.definitions,
      resolveMorphology(morphology, partIds),
      effectiveScale,
    );

  const actual = measure(input.morphology, actualScale);

  const heightNorm = measure(
    {
      ...input.morphology,
      character: neutralise(
        input.morphology.character,
        HEIGHT_NORM_NEUTRALISED_DIMENSIONS,
      ),
    },
    normScale,
  );

  const massNorm = measure(
    {
      ...input.morphology,
      character: neutralise(
        input.morphology.character,
        MASS_NORM_NEUTRALISED_DIMENSIONS,
      ),
    },
    actualScale,
  );

  const height = assessDimension(
    actual.heightCm,
    heightNorm.heightCm,
    input.bands.height,
  );

  const mass = assessDimension(
    actual.totalMassKg,
    massNorm.totalMassKg,
    input.bands.mass,
  );

  return {
    height,
    mass,

    standing:
      height.standing === "exceptional" || mass.standing === "exceptional"
        ? "exceptional"
        : "ordinary",
  };
}
