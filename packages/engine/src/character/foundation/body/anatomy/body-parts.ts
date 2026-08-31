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
 * The authored numbers are the Basic Human Standard. They are real physical
 * measurements — a Human Leg really is 81 cm and 11.8 kg — and they sum
 * exactly to the reference body:
 *
 *   Size                                60.00 L
 *   Mass                                62.00 kg
 *   Structural Capacity                    100
 *   Height (signed vertical span)       165 cm
 *   Sum(refSC x muscularityStructural)   76.30
 *
 * The Height figure is a signed vertical span, not a sum of contributions.
 * Each part's `heightAxisSign` says which way its own 0..1 axis travels, and
 * the connection coordinates authored in standard-humanoid.ts place the parts
 * relative to one another; Height is then the total vertical extent of the
 * result. That distinction is load-bearing. Under an unsigned longest-path
 * rule the two Legs chain through the pelvis into each other and a Human
 * measures 176 cm; with signs, crossing the pelvis into the opposite Leg
 * returns to the same lower coordinate rather than adding another 88 cm.
 *
 * body-reference-standard.test.ts asserts all five directly against this
 * table, so a typo here fails immediately rather than surfacing later as a
 * character who weighs the wrong amount.
 *
 * There is one durability/force number per part and it is
 * `reference.structuralCapacity`. The pre-refactor `baseBP` column is gone:
 * two independently authored numbers for "how tough" and "how strong" could
 * disagree, and they did — the old table read Neck 4 against reference SC 2
 * and Leg 14 against 16, while both columns summed to 100 and hid it.
 */

import { createRegistry } from "../../../../infrastructure/registry";
import type { BodyPartDefinition, BodyPartTypeId } from "./types";

export const BODY_PART_DEFINITIONS = {
  head: {
    id: "head",
    name: "Head",
    description: "The skull and its contents.",
    tags: ["core"],
    reference: {
      lengthCm: 22,
      sizeL: 3.35,
      massKg: 3.65,
      structuralCapacity: 8,
      intrinsicPhysicalForce: 1,
      heightContribution: 1.0,
      /* 0 = inferior, 1 = superior. */
      heightAxisSign: 1,
    },
    sensitivity: {
      bulkSize: 0.15,
      adipositySize: 0.04,
      muscularityMass: 0.05,
      muscularityStructural: 0.05,
      muscularityForce: 0.05,
    },
  },
  neck: {
    id: "neck",
    name: "Neck",
    description: "Connects Head to Upper Body.",
    tags: ["core"],
    reference: {
      lengthCm: 6,
      sizeL: 0.55,
      massKg: 0.58,
      structuralCapacity: 2,
      intrinsicPhysicalForce: 1,
      heightContribution: 1.0,
      /* 0 = inferior, 1 = superior. */
      heightAxisSign: 1,
    },
    sensitivity: {
      bulkSize: 0.6,
      adipositySize: 0.08,
      muscularityMass: 0.2,
      muscularityStructural: 0.4,
      muscularityForce: 0.4,
    },
  },
  "upper-body": {
    id: "upper-body",
    name: "Upper Body",
    description: "Chest and upper torso, housing the Heart.",
    tags: ["core", "torso"],
    reference: {
      lengthCm: 31,
      sizeL: 20.15,
      massKg: 19.82,
      structuralCapacity: 10,
      intrinsicPhysicalForce: 1,
      heightContribution: 1.0,
      /* 0 = inferior, 1 = superior. */
      heightAxisSign: 1,
    },
    sensitivity: {
      bulkSize: 0.85,
      adipositySize: 0.22,
      muscularityMass: 0.3,
      muscularityStructural: 0.75,
      muscularityForce: 0.75,
    },
  },
  "lower-body": {
    id: "lower-body",
    name: "Lower Body",
    description: "Abdomen and pelvis.",
    tags: ["core", "torso"],
    reference: {
      lengthCm: 18,
      sizeL: 6.95,
      massKg: 6.85,
      structuralCapacity: 4,
      intrinsicPhysicalForce: 1,
      heightContribution: 1.0,
      /* 0 = pelvis/inferior, 1 = superior. */
      heightAxisSign: 1,
    },
    sensitivity: {
      bulkSize: 0.9,
      adipositySize: 0.24,
      muscularityMass: 0.25,
      muscularityStructural: 0.8,
      muscularityForce: 0.8,
    },
  },
  arm: {
    id: "arm",
    name: "Arm",
    description: "An upper limb, from shoulder to wrist.",
    tags: ["limb", "upper-limb"],
    reference: {
      lengthCm: 55,
      sizeL: 2.37,
      massKg: 2.56,
      structuralCapacity: 14,
      intrinsicPhysicalForce: 1,
      heightContribution: 0,
      /* 0 = shoulder, 1 = wrist. Inert: contributes no Height. */
      heightAxisSign: 1,
    },
    sensitivity: {
      bulkSize: 1.0,
      adipositySize: 0.12,
      muscularityMass: 0.45,
      muscularityStructural: 1.0,
      muscularityForce: 1.0,
    },
  },
  hand: {
    id: "hand",
    name: "Hand",
    description: "The manipulator extremity of an Arm.",
    tags: ["limb", "upper-limb", "extremity", "manipulator"],
    reference: {
      lengthCm: 18,
      sizeL: 0.32,
      massKg: 0.36,
      structuralCapacity: 4,
      intrinsicPhysicalForce: 1,
      heightContribution: 0,
      /* 0 = wrist, 1 = fingertips. Inert: contributes no Height. */
      heightAxisSign: 1,
    },
    sensitivity: {
      bulkSize: 0.5,
      adipositySize: 0.04,
      muscularityMass: 0.15,
      muscularityStructural: 0.3,
      muscularityForce: 0.3,
    },
  },
  leg: {
    id: "leg",
    name: "Leg",
    description: "A lower limb, from hip to ankle.",
    tags: ["limb", "lower-limb", "locomotor"],
    reference: {
      lengthCm: 81,
      sizeL: 11.05,
      massKg: 11.8,
      structuralCapacity: 16,
      intrinsicPhysicalForce: 1,
      heightContribution: 1.0,
      /* 0 = hip, 1 = ankle, so its axis runs downward. */
      heightAxisSign: -1,
    },
    sensitivity: {
      bulkSize: 1.0,
      adipositySize: 0.15,
      muscularityMass: 0.5,
      muscularityStructural: 1.0,
      muscularityForce: 1.0,
    },
  },
  foot: {
    id: "foot",
    name: "Foot",
    description: "The locomotor extremity of a Leg.",
    tags: ["limb", "lower-limb", "extremity", "locomotor"],
    reference: {
      lengthCm: 25,
      sizeL: 0.76,
      massKg: 0.83,
      structuralCapacity: 4,
      intrinsicPhysicalForce: 1,
      heightContribution: 0.28,
      /* 0 = ankle, 1 = toe, so its axis runs downward. */
      heightAxisSign: -1,
    },
    sensitivity: {
      bulkSize: 0.45,
      adipositySize: 0.05,
      muscularityMass: 0.15,
      muscularityStructural: 0.25,
      muscularityForce: 0.25,
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
