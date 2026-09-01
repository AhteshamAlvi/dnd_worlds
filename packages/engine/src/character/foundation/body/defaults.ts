/*
 * The standard humanoid Body — a character at exactly the reference
 * morphology, using the standard humanoid Anatomy content.
 *
 * Every physical number this body has is derived. There is nothing to author
 * here but neutrality: Scale 1, neutral morphology, no Strength development,
 * and the standard humanoid anatomy. That it resolves to 165 cm, 62.00 kg,
 * 60.00 L and 100 Structural Capacity is a fact about the Basic Human
 * Standard in anatomy/body-parts.ts, not about this file, which is exactly
 * the property the measurement subsystem was built to get.
 */

import { NEUTRAL_MORPHOLOGY } from "./types";
import type { Body } from "./types";

export const STANDARD_BODY: Body = {
  characterScale: 1,
  globalMorphology: NEUTRAL_MORPHOLOGY,
  strengthDevelopmentMuscularity: 1,

  /*
   * Nothing has happened to this body, so it records nothing at all — no
   * anatomy, because anatomy is instantiated from whatever form the character
   * has, and no continuity state, because every identity is intact and
   * unremarkable until something makes it otherwise.
   */
  continuity: {},
  anatomicalPoints: {},
};
