/*
 * The Human body profile, extracted so it can stand in as a default.
 *
 * A character with no Species still has a body — Body is physics, and physics
 * does not wait for ancestry to be authored. Rather than failing resolution or
 * inventing a shapeless default, an unstated Species resolves as the Basic
 * Human Standard, which is the same body every other Species is calibrated
 * against.
 *
 * Lives here rather than in identity/species.ts so that Body never has to
 * import from identity to find its own reference body.
 */

import { STANDARD_HUMANOID_REFERENCE_FORM } from "./anatomy/standard-humanoid";
import { HUMAN_AGE_PROFILE } from "./age/human-age-profile";
import { DEFAULT_ADIPOSE_TISSUE_DENSITY_KG_PER_L } from "./measurements/resolution";
import { HUMAN_STATURE_BANDS } from "./stature/human-stature-bands";
import { NEUTRAL_MORPHOLOGY } from "./types";
import type { SpeciesBodyProfile } from "./species-profile";

export const HUMAN_BODY_PROFILE: SpeciesBodyProfile = {
  standardScale: 1,
  referenceForm: STANDARD_HUMANOID_REFERENCE_FORM,
  globalMorphology: NEUTRAL_MORPHOLOGY,
  localMorphology: {},
  stature: HUMAN_STATURE_BANDS,
  adiposeTissueDensityKgPerL: DEFAULT_ADIPOSE_TISSUE_DENSITY_KG_PER_L,
  ageProfile: HUMAN_AGE_PROFILE,
};
