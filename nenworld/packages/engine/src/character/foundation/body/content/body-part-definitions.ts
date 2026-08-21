/*
 * Standard humanoid BodyPartDefinition content.
 *
 * This is authored data, not engine mechanics — the generic Anatomy/Body
 * Point machinery elsewhere in body/ knows nothing about "humanoid" and works
 * identically over any other BodyPartDefinition collection a future species
 * or creature might supply.
 *
 * Base BP values and morphology sensitivities are game-mechanical calibration
 * values tuned so the reference humanoid (165cm, 62kg, muscularity 1,
 * adiposity 1) resolves to exactly 100 aggregate Maximum BP — see
 * body-points/morphology.ts for the reference constants and
 * body-reference-humanoid.test.ts for the regression.
 *
 * Tags are deliberately side-agnostic: one "arm" definition serves both
 * arm-1 and arm-2 (see content/anatomy.ts), so laterality such as "left" is
 * not something a definition can express — it belongs on the BodyPart
 * instance's display name only, never on mechanical classification.
 */

import type { BodyPartDefinition } from "../anatomy/types";

export const STANDARD_BODY_PART_DEFINITIONS = [
  {
    id: "head",
    tags: ["core"],
    baseBP: 8,
    morphologySensitivity: {
      height: 0,
      mass: 0,
      muscularity: 0,
      adiposity: 0,
    },
  },
  {
    id: "neck",
    tags: ["core"],
    baseBP: 4,
    morphologySensitivity: {
      height: 0,
      mass: 1,
      muscularity: 0.20,
      adiposity: 0.05,
    },
  },
  {
    id: "upper-body",
    tags: ["core", "torso"],
    baseBP: 8,
    morphologySensitivity: {
      height: 1,
      mass: 1,
      muscularity: 0.40,
      adiposity: 0.15,
    },
  },
  {
    id: "lower-body",
    tags: ["core", "torso"],
    baseBP: 4,
    morphologySensitivity: {
      height: 1,
      mass: 1,
      muscularity: 0.30,
      adiposity: 0.20,
    },
  },
  {
    id: "arm",
    tags: ["limb", "upper-limb"],
    baseBP: 14,
    morphologySensitivity: {
      height: 1,
      mass: 1,
      muscularity: 0.60,
      adiposity: 0.05,
    },
  },
  {
    id: "hand",
    tags: ["limb", "upper-limb", "extremity", "manipulator"],
    baseBP: 5,
    morphologySensitivity: {
      height: 0,
      mass: 0,
      muscularity: 0.10,
      adiposity: 0.02,
    },
  },
  {
    id: "leg",
    tags: ["limb", "lower-limb", "locomotor"],
    baseBP: 14,
    morphologySensitivity: {
      height: 1,
      mass: 1,
      muscularity: 0.60,
      adiposity: 0.08,
    },
  },
  {
    id: "foot",
    tags: ["limb", "lower-limb", "extremity", "locomotor"],
    baseBP: 5,
    morphologySensitivity: {
      height: 0,
      mass: 0,
      muscularity: 0.10,
      adiposity: 0.02,
    },
  },
] as const satisfies readonly BodyPartDefinition[];

export type StandardBodyPartTypeId =
  (typeof STANDARD_BODY_PART_DEFINITIONS)[number]["id"];
