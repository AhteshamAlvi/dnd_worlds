/*
 * BodyPartDefinition catalog — the reusable kinds of body part a character's
 * Anatomy can be built from.
 *
 * This is content, not mechanics: nothing under anatomy/, body-points/, or
 * critical-points/ imports from this file. Every mechanical function takes
 * `definitions: readonly BodyPartDefinition[]` as a plain parameter, so this
 * catalog is just one source of such an array — see character/catalogs.ts,
 * which exposes it as the "body-part" CatalogDomain alongside Species, Clan,
 * Trait, and the rest.
 *
 * The authored entries below are the standard humanoid parts: canon, present
 * on every boot, never removable — exactly like SPECIES_DEFINITIONS in
 * character/identity/species.ts. A table with a tail, a wing, or any other
 * anatomy the standard humanoid doesn't have adds it the same way a GM adds
 * a homebrew Species: a custom definition registered at runtime (in this
 * app, loaded from worldbuilding/Vault/body-part-vault/*.json), not a change
 * to this file or to any engine mechanics.
 *
 * Base BP values and morphology sensitivities are game-mechanical
 * calibration values, not literal biological proportions, and are free to be
 * tuned without touching engine code — see body-points/morphology.ts for
 * how they're consumed.
 */

import { createRegistry } from "../../../../infrastructure/registry";
import type { BodyPartDefinition, BodyPartTypeId } from "./types";

export const BODY_PART_DEFINITIONS = {
  head: {
    id: "head",
    name: "Head",
    description: "The skull and its contents.",
    tags: ["core"],
    baseBP: 8,
    morphologySensitivity: {
      height: 0,
      mass: 0,
      muscularity: 0,
      adiposity: 0,
    },
  },
  neck: {
    id: "neck",
    name: "Neck",
    description: "Connects Head to Upper Body.",
    tags: ["core"],
    baseBP: 4,
    morphologySensitivity: {
      height: 0,
      mass: 1,
      muscularity: 0.20,
      adiposity: 0.05,
    },
  },
  "upper-body": {
    id: "upper-body",
    name: "Upper Body",
    description: "Chest and upper torso, housing the Heart.",
    tags: ["core", "torso"],
    baseBP: 8,
    morphologySensitivity: {
      height: 1,
      mass: 1,
      muscularity: 0.40,
      adiposity: 0.15,
    },
  },
  "lower-body": {
    id: "lower-body",
    name: "Lower Body",
    description: "Abdomen and pelvis.",
    tags: ["core", "torso"],
    baseBP: 4,
    morphologySensitivity: {
      height: 1,
      mass: 1,
      muscularity: 0.30,
      adiposity: 0.20,
    },
  },
  arm: {
    id: "arm",
    name: "Arm",
    description: "An upper limb, from shoulder to wrist.",
    tags: ["limb", "upper-limb"],
    baseBP: 14,
    morphologySensitivity: {
      height: 1,
      mass: 1,
      muscularity: 0.60,
      adiposity: 0.05,
    },
  },
  hand: {
    id: "hand",
    name: "Hand",
    description: "The manipulator extremity of an Arm.",
    tags: ["limb", "upper-limb", "extremity", "manipulator"],
    baseBP: 5,
    morphologySensitivity: {
      height: 0,
      mass: 0,
      muscularity: 0.10,
      adiposity: 0.02,
    },
  },
  leg: {
    id: "leg",
    name: "Leg",
    description: "A lower limb, from hip to ankle.",
    tags: ["limb", "lower-limb", "locomotor"],
    baseBP: 14,
    morphologySensitivity: {
      height: 1,
      mass: 1,
      muscularity: 0.60,
      adiposity: 0.08,
    },
  },
  foot: {
    id: "foot",
    name: "Foot",
    description: "The locomotor extremity of a Leg.",
    tags: ["limb", "lower-limb", "extremity", "locomotor"],
    baseBP: 5,
    morphologySensitivity: {
      height: 0,
      mass: 0,
      muscularity: 0.10,
      adiposity: 0.02,
    },
  },
} as const satisfies Record<string, BodyPartDefinition>;

const BODY_PART_REGISTRY = createRegistry<BodyPartDefinition>(
  "Body Part",
  BODY_PART_DEFINITIONS,
);

export type KnownBodyPartTypeId = keyof typeof BODY_PART_DEFINITIONS;

export function isKnownBodyPartTypeId(typeId: BodyPartTypeId): boolean {
  return BODY_PART_REGISTRY.isKnownId(typeId);
}

export function getBodyPartDefinition(
  typeId: BodyPartTypeId,
): BodyPartDefinition | undefined {
  return BODY_PART_REGISTRY.get(typeId);
}

export const bodyPartRegistry = BODY_PART_REGISTRY;
