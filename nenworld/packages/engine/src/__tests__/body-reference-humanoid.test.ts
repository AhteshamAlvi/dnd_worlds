/*
 * Tests the standard humanoid content end to end: a character at exactly the
 * reference morphology (165cm, 62kg, muscularity 1, adiposity 1, CON 10, no
 * modifiers) must resolve to exactly 100 aggregate Maximum BP, with every
 * per-part maximum matching the calibrated table. This is the headline
 * regression for the whole Body foundation — every other test exercises
 * mechanics in isolation, but this one pins the one number every other
 * number was calibrated against.
 *
 * Also pins the standard Anatomy topology and the standard Critical Point
 * set, since both are content that could silently drift.
 */

import { describe, expect, it } from "vitest";

import { validateAnatomyData } from "../character/foundation/body/anatomy/validation";
import { STANDARD_BODY_PART_DEFINITIONS } from "../character/foundation/body/content/body-part-definitions";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/content/anatomy";
import { STANDARD_SPECIAL_POINT_DEFINITIONS } from "../character/foundation/body/content/special-point-definitions";
import { STANDARD_BODY } from "../character/foundation/body/defaults";
import {
  REFERENCE_ADIPOSITY,
  REFERENCE_HEIGHT_CM,
  REFERENCE_MASS_KG,
  REFERENCE_MUSCULARITY,
  resolveMorphology,
} from "../character/foundation/body/body-points/morphology";
import { resolveBodyPoints } from "../character/foundation/body/body-points/resolution";
import {
  resolveCriticalPoints,
} from "../character/foundation/body/critical-points/resolution";
import {
  validateCriticalPointData,
  validateSpecialPointDefinitions,
} from "../character/foundation/body/critical-points/validation";

const REFERENCE_CONSTITUTION = 10;

describe("STANDARD_BODY", () => {
  it("sits exactly at the reference morphology", () => {
    expect(STANDARD_BODY.heightCm).toBe(REFERENCE_HEIGHT_CM);
    expect(STANDARD_BODY.massKg).toBe(REFERENCE_MASS_KG);
    expect(STANDARD_BODY.build.muscularity).toBe(REFERENCE_MUSCULARITY);
    expect(STANDARD_BODY.build.adiposity).toBe(REFERENCE_ADIPOSITY);
    expect(STANDARD_BODY.anatomy).toBe(STANDARD_HUMANOID_ANATOMY);
  });
});

describe("standard humanoid Anatomy", () => {
  const ids = STANDARD_HUMANOID_ANATOMY.parts.map((part) => part.id);

  it("has exactly the expected 12 BodyPart instances", () => {
    expect(ids.sort()).toEqual(
      [
        "arm-1",
        "arm-2",
        "foot-1",
        "foot-2",
        "hand-1",
        "hand-2",
        "head-1",
        "leg-1",
        "leg-2",
        "lower-body-1",
        "neck-1",
        "upper-body-1",
      ].sort(),
    );
  });

  it("starts every part at zero damage", () => {
    for (const part of STANDARD_HUMANOID_ANATOMY.parts) {
      expect(part.damage).toBe(0);
    }
  });

  it("has upper-body-1 as the only root", () => {
    const roots = STANDARD_HUMANOID_ANATOMY.parts.filter(
      (part) => part.attachment === null,
    );

    expect(roots.map((part) => part.id)).toEqual(["upper-body-1"]);
  });

  it("uses the permanent Upper Body / Lower Body names, never Chest/Torso", () => {
    const upperBody = STANDARD_HUMANOID_ANATOMY.parts.find(
      (part) => part.id === "upper-body-1",
    );
    const lowerBody = STANDARD_HUMANOID_ANATOMY.parts.find(
      (part) => part.id === "lower-body-1",
    );

    expect(upperBody?.name).toBe("Upper Body");
    expect(lowerBody?.name).toBe("Lower Body");

    for (const part of STANDARD_HUMANOID_ANATOMY.parts) {
      expect(part.name).not.toMatch(/chest|torso/i);
    }
  });

  it("wires the locked topology", () => {
    const parentOf = (id: string) =>
      STANDARD_HUMANOID_ANATOMY.parts.find((part) => part.id === id)
        ?.attachment?.parentId;

    expect(parentOf("upper-body-1")).toBeUndefined();
    expect(parentOf("neck-1")).toBe("upper-body-1");
    expect(parentOf("head-1")).toBe("neck-1");
    expect(parentOf("lower-body-1")).toBe("upper-body-1");
    expect(parentOf("arm-1")).toBe("upper-body-1");
    expect(parentOf("arm-2")).toBe("upper-body-1");
    expect(parentOf("hand-1")).toBe("arm-1");
    expect(parentOf("hand-2")).toBe("arm-2");
    expect(parentOf("leg-1")).toBe("lower-body-1");
    expect(parentOf("leg-2")).toBe("lower-body-1");
    expect(parentOf("foot-1")).toBe("leg-1");
    expect(parentOf("foot-2")).toBe("leg-2");
  });

  it("passes Anatomy + definition validation", () => {
    const result = validateAnatomyData(
      STANDARD_HUMANOID_ANATOMY,
      STANDARD_BODY_PART_DEFINITIONS,
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });
});

describe("reference humanoid Body Points", () => {
  const morphology = resolveMorphology(
    STANDARD_BODY,
    STANDARD_BODY.anatomy,
    STANDARD_BODY_PART_DEFINITIONS,
  );

  const bodyPoints = resolveBodyPoints(
    STANDARD_BODY.anatomy,
    morphology,
    REFERENCE_CONSTITUTION,
    STANDARD_BODY_PART_DEFINITIONS,
  );

  const maximumBPByType = new Map<string, number[]>();
  for (const part of bodyPoints.parts) {
    const existing = maximumBPByType.get(part.type) ?? [];
    existing.push(part.maximumBP);
    maximumBPByType.set(part.type, existing);
  }

  it("resolves every part to the calibrated table", () => {
    expect(maximumBPByType.get("head")).toEqual([8]);
    expect(maximumBPByType.get("neck")).toEqual([4]);
    expect(maximumBPByType.get("upper-body")).toEqual([8]);
    expect(maximumBPByType.get("lower-body")).toEqual([4]);
    expect(maximumBPByType.get("arm")).toEqual([14, 14]);
    expect(maximumBPByType.get("hand")).toEqual([5, 5]);
    expect(maximumBPByType.get("leg")).toEqual([14, 14]);
    expect(maximumBPByType.get("foot")).toEqual([5, 5]);
  });

  it("resolves to exactly 100 aggregate Maximum BP — the headline regression", () => {
    expect(bodyPoints.aggregateMaximumBP).toBe(100);
  });

  it("destroys nothing at zero damage", () => {
    expect(bodyPoints.destroyedPartIds).toEqual([]);
    for (const part of bodyPoints.parts) {
      expect(part.destroyed).toBe(false);
      expect(part.currentBP).toBe(part.maximumBP);
    }
  });
});

describe("standard Special Point content", () => {
  it("passes definition validation", () => {
    const result = validateSpecialPointDefinitions(
      STANDARD_SPECIAL_POINT_DEFINITIONS,
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("resolves to exactly the 20 expected instances over the standard Anatomy", () => {
    const resolved = resolveCriticalPoints(
      STANDARD_HUMANOID_ANATOMY,
      STANDARD_BODY_PART_DEFINITIONS,
      STANDARD_SPECIAL_POINT_DEFINITIONS,
    );

    const ids = resolved.points.map((point) => point.id).sort();

    expect(ids).toEqual(
      [
        "brain:head-1",
        "heart:upper-body-1",
        "neck:neck-1",
        "face:head-1",
        "upper-organs:upper-body-1",
        "lower-organs:lower-body-1",
        "groin:lower-body-1",
        "spine:shared:lower-body-1,upper-body-1",
        "shoulder:arm-1",
        "shoulder:arm-2",
        "elbow:arm-1",
        "elbow:arm-2",
        "wrist:hand-1",
        "wrist:hand-2",
        "hip:leg-1",
        "hip:leg-2",
        "knee:leg-1",
        "knee:leg-2",
        "ankle:foot-1",
        "ankle:foot-2",
      ].sort(),
    );
    expect(ids).toHaveLength(20);
  });

  it("passes full resolved-instance and consistency validation", () => {
    const resolved = resolveCriticalPoints(
      STANDARD_HUMANOID_ANATOMY,
      STANDARD_BODY_PART_DEFINITIONS,
      STANDARD_SPECIAL_POINT_DEFINITIONS,
    );

    const result = validateCriticalPointData(
      STANDARD_HUMANOID_ANATOMY,
      STANDARD_BODY_PART_DEFINITIONS,
      STANDARD_SPECIAL_POINT_DEFINITIONS,
      resolved,
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
