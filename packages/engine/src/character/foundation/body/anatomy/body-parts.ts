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
 *   Volume                                60.00 L
 *   Surface Area                       16,900 cm2  (1.69 m2)
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
 * Those totals give the Basic Human Standard its two derived constants:
 *
 *   Mean density                  1.033 kg/L   (62.00 / 60.00)
 *   Surface-area-to-volume ratio  28.17 m^-1   (1.69 m2 / 0.060 m3)
 *
 * The surface partition is calibrated from the adult Lund-Browder anatomical
 * percentages, adapted to this engine's combined Arm and Leg definitions —
 * Lund-Browder splits a limb across upper, lower and extremity segments where
 * the table below carries one Arm and one Leg, so those percentages are summed
 * into the combined part rather than reinvented.
 *
 * Surface Area is EXTERNAL area only. Attachment cross-sections between
 * connected parts are excluded, which is why the eight figures sum to a body's
 * skin rather than to the surface of eight free-floating solids.
 *
 * body-reference-standard.test.ts asserts all six directly against this
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
      volumeL: 3.35,
      surfaceAreaCm2: 1183,
      massKg: 3.65,
      structuralCapacity: 8,
      intrinsicPhysicalForce: 1,
      heightContribution: 1.0,
      /* 0 = inferior, 1 = superior. */
      heightAxisSign: 1,
    },
    sensitivity: {
      bulkVolume: 0.15,
      adiposityVolume: 0.04,
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
      volumeL: 0.55,
      surfaceAreaCm2: 338,
      massKg: 0.58,
      structuralCapacity: 2,
      intrinsicPhysicalForce: 1,
      heightContribution: 1.0,
      /* 0 = inferior, 1 = superior. */
      heightAxisSign: 1,
    },
    sensitivity: {
      bulkVolume: 0.6,
      adiposityVolume: 0.08,
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
      volumeL: 20.15,
      surfaceAreaCm2: 2873,
      massKg: 19.82,
      structuralCapacity: 10,
      intrinsicPhysicalForce: 1,
      heightContribution: 1.0,
      /* 0 = inferior, 1 = superior. */
      heightAxisSign: 1,
    },
    sensitivity: {
      bulkVolume: 0.85,
      adiposityVolume: 0.22,
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
      volumeL: 6.95,
      surfaceAreaCm2: 2535,
      massKg: 6.85,
      structuralCapacity: 4,
      intrinsicPhysicalForce: 1,
      heightContribution: 1.0,
      /* 0 = pelvis/inferior, 1 = superior. */
      heightAxisSign: 1,
    },
    sensitivity: {
      bulkVolume: 0.9,
      adiposityVolume: 0.24,
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
      volumeL: 2.37,
      surfaceAreaCm2: 1183,
      massKg: 2.56,
      structuralCapacity: 14,
      intrinsicPhysicalForce: 1,
      heightContribution: 0,
      /* 0 = shoulder, 1 = wrist. Inert: contributes no Height. */
      heightAxisSign: 1,
    },
    sensitivity: {
      bulkVolume: 1.0,
      adiposityVolume: 0.12,
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
      volumeL: 0.32,
      surfaceAreaCm2: 422.5,
      massKg: 0.36,
      structuralCapacity: 4,
      intrinsicPhysicalForce: 1,
      heightContribution: 0,
      /* 0 = wrist, 1 = fingertips. Inert: contributes no Height. */
      heightAxisSign: 1,
    },
    sensitivity: {
      bulkVolume: 0.5,
      adiposityVolume: 0.04,
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
      volumeL: 11.05,
      surfaceAreaCm2: 2788.5,
      massKg: 11.8,
      structuralCapacity: 16,
      intrinsicPhysicalForce: 1,
      heightContribution: 1.0,
      /* 0 = hip, 1 = ankle, so its axis runs downward. */
      heightAxisSign: -1,
    },
    sensitivity: {
      bulkVolume: 1.0,
      adiposityVolume: 0.15,
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
      volumeL: 0.76,
      surfaceAreaCm2: 591.5,
      massKg: 0.83,
      structuralCapacity: 4,
      intrinsicPhysicalForce: 1,
      heightContribution: 0.28,
      /* 0 = ankle, 1 = toe, so its axis runs downward. */
      heightAxisSign: -1,
    },
    sensitivity: {
      bulkVolume: 0.45,
      adiposityVolume: 0.05,
      muscularityMass: 0.15,
      muscularityStructural: 0.25,
      muscularityForce: 0.25,
    },
  },
} as const satisfies Record<string, BodyPartDefinition>;

/*
 * Shape validation for authored Body content.
 *
 * These domains carry no Effects and no Requirements, so they used to pass
 * `declaresNoRules` — an honest statement that was also a hole: a BodyPart
 * with a negative Volume or a Reference Form whose parts attach to nothing
 * carries no rules to check and is still content nothing downstream can
 * resolve.
 *
 * What is checked here is SHAPE and TOPOLOGY, both of which are properties of
 * the definition alone: required fields, numeric ranges, duplicate slots, an
 * attachment graph that is connected and rooted. What is deliberately absent
 * is anything needing another catalog — a Reference Form naming a BodyPart
 * type registered a moment later is legal, and that reference is checked after
 * every catalog has loaded.
 */
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}


function isFinitePositive(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}


function isFiniteAtLeastZero(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}


/**
 * One BodyPart definition's physical shape.
 *
 * Every reference figure is a real measurement and every one of them divides,
 * multiplies or sums into the Body pipeline, so a zero or a negative is not an
 * extreme value — it is a body part with no size, which drives Structural
 * Capacity negative and is quietly rescued by a floor somewhere downstream
 * into a part that ignores its own definition.
 *
 * The two that may legitimately be zero say so: a decorative horn generates no
 * force, and an Arm contributes none of its length to height.
 */
export function findBodyPartDefinitionStructuralIssues(
  definition: unknown,
): readonly string[] {
  const part = recordOf(definition);

  if (part === undefined) return [];

  const issues: string[] = [];

  const tags = part["tags"];

  if (!Array.isArray(tags)) {
    issues.push("needs a list of tags.");
  } else {
    if (tags.some((tag) => typeof tag !== "string" || tag.trim() === "")) {
      issues.push("has a tag that is not a name.");
    }

    /*
     * A repeated tag is not harmless. Tags are membership, and every consumer
     * of them asks "does this part have X" — so a duplicate means the author
     * meant two different tags and wrote one twice, or believed repetition
     * carried weight. Neither is what the list does.
     */
    const seen = new Set<unknown>();

    for (const tag of tags) {
      if (seen.has(tag)) {
        issues.push(`lists the tag "${String(tag)}" more than once.`);
      }

      seen.add(tag);
    }
  }

  const reference = recordOf(part["reference"]);

  if (reference === undefined) {
    issues.push("needs reference measurements.");
  } else {
    const POSITIVE = [
      "lengthCm",
      "volumeL",
      "surfaceAreaCm2",
      "massKg",
      "structuralCapacity",
    ] as const;

    for (const field of POSITIVE) {
      if (!isFinitePositive(reference[field])) {
        issues.push(`has a reference ${field} that is not a positive measurement.`);
      }
    }

    /* Zero is meaningful for both: no force of its own, no vertical extent. */
    if (!isFiniteAtLeastZero(reference["intrinsicPhysicalForce"])) {
      issues.push("has a reference intrinsicPhysicalForce below zero or non-finite.");
    }

    const height = reference["heightContribution"];

    if (!isFiniteAtLeastZero(height) || (height as number) > 1) {
      issues.push("has a heightContribution outside 0..1.");
    }

    /*
     * Exactly 1 or -1, never 0 and never a magnitude.
     *
     * The sign says which way the part's own longitudinal axis runs against
     * the body's vertical, and it is deliberately NOT folded into
     * heightContribution as a signed number — see HeightAxisSign. A 0 here
     * would be a direction that points nowhere, and any other value would be
     * a second, silent scaling of a contribution that already has one.
     */
    const axis = reference["heightAxisSign"];

    if (axis !== 1 && axis !== -1) {
      issues.push(
        `has a heightAxisSign of ${String(axis)}, which must be 1 or -1.`,
      );
    }
  }

  const sensitivity = recordOf(part["sensitivity"]);

  if (sensitivity === undefined) {
    issues.push("needs morphology sensitivities.");

    return issues;
  }

  for (const field of [
    "bulkVolume",
    "adiposityVolume",
    "muscularityMass",
    "muscularityForce",
  ] as const) {
    if (!isFiniteAtLeastZero(sensitivity[field])) {
      issues.push(`has a ${field} sensitivity below zero or non-finite.`);
    }
  }

  const structural = sensitivity["muscularityStructural"];

  if (!isFiniteAtLeastZero(structural) || (structural as number) > 1) {
    issues.push("has a muscularityStructural sensitivity outside 0..1.");
  }

  return issues;
}


const BODY_PART_REGISTRY = createRegistry<BodyPartDefinition>(
  "Body Part",
  BODY_PART_DEFINITIONS,
  findBodyPartDefinitionStructuralIssues,
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


/**
 * What can be wrong with the BodyPart catalog itself.
 *
 * These domains had no catalog check while they had no rules to check. They
 * have real shape validators now, and the registry runs the same one over
 * AUTHORED content that the barrier runs over registered content — so this is
 * how the engine's own catalog is held to the rules it imposes on a host.
 */
export function findBodyPartCatalogIssues(): readonly string[] {
  return BODY_PART_REGISTRY.findCatalogIssues();
}
