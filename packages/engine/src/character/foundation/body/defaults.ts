/*
 * The standard humanoid Body — a character at exactly the reference
 * morphology, using the standard humanoid Anatomy content.
 *
 * Built from body-points/morphology.ts's reference constants rather than
 * literal numbers, so "STANDARD_BODY sits exactly at reference morphology"
 * is true by construction and the 100-aggregate-BP regression can't silently
 * drift if those constants ever change.
 */

import {
  REFERENCE_ADIPOSITY,
  REFERENCE_HEIGHT_CM,
  REFERENCE_MASS_KG,
  REFERENCE_MUSCULARITY,
} from "./body-points/morphology";
import { STANDARD_HUMANOID_ANATOMY } from "./anatomy/standard-humanoid";
import type { Body } from "./types";

export const STANDARD_BODY: Body = {
  heightCm: REFERENCE_HEIGHT_CM,
  massKg: REFERENCE_MASS_KG,
  build: {
    muscularity: REFERENCE_MUSCULARITY,
    adiposity: REFERENCE_ADIPOSITY,
  },
  anatomy: STANDARD_HUMANOID_ANATOMY,
};
