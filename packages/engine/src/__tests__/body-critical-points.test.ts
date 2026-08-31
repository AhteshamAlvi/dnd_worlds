/*
 * Tests Critical Point resolution and validation over arbitrary, data-driven
 * Anatomy — deliberately not just the standard two-limb humanoid, since the
 * generic resolution engine must not encode any assumption about how many
 * limbs a creature has.
 */

import { describe, expect, it } from "vitest";

import { createAnatomy } from "../character/foundation/body/anatomy/creation";
import type { BodyPartDefinition } from "../character/foundation/body/anatomy/types";
import { TEST_PART_PHYSICALS } from "./fixtures/body";
import {
  applyJointDamageMultiplier,
  createsInjuryOpportunity,
  getSinglePointHostId,
  isCriticalPoint,
  isJointPoint,
  resolveCriticalPoints,
} from "../character/foundation/body/critical-points/resolution";
import type {
  JointPointDefinition,
  ResolvedJointPoint,
  SpecialPointDefinition,
} from "../character/foundation/body/critical-points/types";
import {
  validateResolvedCriticalPoints,
  validateSpecialPointDefinitions,
} from "../character/foundation/body/critical-points/validation";

const NEUTRAL_SENSITIVITY = { height: 0, mass: 0, muscularity: 0, adiposity: 0 };

const DEFINITIONS: readonly BodyPartDefinition[] = [
  { id: "torso", name: "Torso", description: "Test torso.", tags: [], baseBP: 10, morphologySensitivity: NEUTRAL_SENSITIVITY, ...TEST_PART_PHYSICALS },
  { id: "head", name: "Head", description: "Test head.", tags: [], baseBP: 8, morphologySensitivity: NEUTRAL_SENSITIVITY, ...TEST_PART_PHYSICALS },
  { id: "arm", name: "Arm", description: "Test arm.", tags: [], baseBP: 14, morphologySensitivity: NEUTRAL_SENSITIVITY, ...TEST_PART_PHYSICALS },
  { id: "leg", name: "Leg", description: "Test leg.", tags: [], baseBP: 14, morphologySensitivity: NEUTRAL_SENSITIVITY, ...TEST_PART_PHYSICALS },
];

const BRAIN: SpecialPointDefinition = {
  id: "brain",
  name: "Brain",
  description: "Test brain.",
  category: "critical",
  failureConsequence: "death",
  placement: { kind: "per-part", selector: { types: ["head"] } },
};

const SHOULDER: JointPointDefinition = {
  id: "shoulder",
  name: "Shoulder",
  description: "Test shoulder.",
  category: "joint",
  damageMultiplier: 2,
  placement: { kind: "per-part", selector: { types: ["arm"] } },
};

const HIP: SpecialPointDefinition = {
  id: "hip",
  name: "Hip",
  description: "Test hip.",
  category: "joint",
  damageMultiplier: 2,
  placement: { kind: "per-part", selector: { types: ["leg"] } },
};

function torsoWithArms(count: number) {
  return createAnatomy([
    { id: "torso-1", type: "torso", attachment: null },
    ...Array.from({ length: count }, (_, i) => ({
      id: `arm-${i + 1}`,
      type: "arm",
      attachment: { parentId: "torso-1" },
    })),
  ]);
}

describe("resolution over arbitrary anatomy", () => {
  it("a 4-armed creature yields 4 Shoulder instances", () => {
    const anatomy = torsoWithArms(4);
    const resolved = resolveCriticalPoints(anatomy, DEFINITIONS, [SHOULDER]);

    expect(resolved.points).toHaveLength(4);
    expect(resolved.points.map((p) => p.id).sort()).toEqual([
      "shoulder:arm-1",
      "shoulder:arm-2",
      "shoulder:arm-3",
      "shoulder:arm-4",
    ]);
  });

  it("a legless creature yields no Hip instances", () => {
    const anatomy = torsoWithArms(2); // no legs at all
    const resolved = resolveCriticalPoints(anatomy, DEFINITIONS, [HIP]);

    expect(resolved.points).toEqual([]);
  });

  it("a headless creature yields no Brain instance", () => {
    const anatomy = torsoWithArms(2); // no head
    const resolved = resolveCriticalPoints(anatomy, DEFINITIONS, [BRAIN]);

    expect(resolved.points).toEqual([]);
  });

  it("body-part-self placement makes the matching BodyPart itself the target", () => {
    const anatomy = createAnatomy([{ id: "torso-1", type: "torso", attachment: null }]);
    const definition: SpecialPointDefinition = {
      id: "core",
      name: "Core",
      description: "Test core.",
      category: "critical",
      failureConsequence: "death",
      placement: { kind: "body-part-self", selector: { types: ["torso"] } },
    };

    const resolved = resolveCriticalPoints(anatomy, DEFINITIONS, [definition]);
    expect(resolved.points[0]!.hostPartIds).toEqual(["torso-1"]);
  });

  it("shared placement produces one instance spanning every matching host", () => {
    const anatomy = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
      { id: "head-1", type: "head", attachment: { parentId: "torso-1" } },
    ]);

    const definition: SpecialPointDefinition = {
      id: "spine",
      name: "Spine",
      description: "Test spine.",
      category: "semicritical",
      placement: { kind: "shared", selector: { types: ["torso", "head"] } },
    };

    const resolved = resolveCriticalPoints(anatomy, DEFINITIONS, [definition]);
    expect(resolved.points).toHaveLength(1);
    expect(resolved.points[0]!.hostPartIds.slice().sort()).toEqual(["head-1", "torso-1"]);
  });

  it("shared host set id is stable regardless of Anatomy part ordering", () => {
    const definition: SpecialPointDefinition = {
      id: "spine",
      name: "Spine",
      description: "Test spine.",
      category: "semicritical",
      placement: { kind: "shared", selector: { types: ["torso", "head"] } },
    };

    const anatomyA = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
      { id: "head-1", type: "head", attachment: { parentId: "torso-1" } },
    ]);
    const anatomyB = createAnatomy([
      { id: "head-1", type: "head", attachment: null },
      { id: "torso-1", type: "torso", attachment: null },
    ]);

    const resolvedA = resolveCriticalPoints(anatomyA, DEFINITIONS, [definition]);
    const resolvedB = resolveCriticalPoints(anatomyB, DEFINITIONS, [definition]);

    expect(resolvedA.points[0]!.id).toBe(resolvedB.points[0]!.id);
  });
});

describe("SpecialPointDefinition validation", () => {
  it("rejects a Critical definition using shared placement", () => {
    const badBrain: SpecialPointDefinition = {
      ...BRAIN,
      placement: { kind: "shared", selector: { types: ["head"] } },
    };

    const result = validateSpecialPointDefinitions([badBrain]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "invalid-critical-placement")).toBe(true);
  });

  it("rejects a Joint definition not using per-part placement", () => {
    const badShoulder: SpecialPointDefinition = {
      ...SHOULDER,
      placement: { kind: "shared", selector: { types: ["arm"] } },
    };

    const result = validateSpecialPointDefinitions([badShoulder]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "invalid-joint-placement")).toBe(true);
  });

  it("rejects a non-positive Joint damage multiplier", () => {
    const badShoulder: SpecialPointDefinition = { ...SHOULDER, damageMultiplier: 0 };

    const result = validateSpecialPointDefinitions([badShoulder]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "invalid-joint-damage-multiplier")).toBe(true);
  });

  it("rejects duplicate definition ids", () => {
    const result = validateSpecialPointDefinitions([BRAIN, BRAIN]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "duplicate-definition-id")).toBe(true);
  });
});

describe("resolved-instance and consistency validation", () => {
  it("detects a missing resolved point", () => {
    const anatomy = torsoWithArms(2);
    const expected = resolveCriticalPoints(anatomy, DEFINITIONS, [SHOULDER]);

    const stale = { points: expected.points.slice(1) };
    const result = validateResolvedCriticalPoints(anatomy, DEFINITIONS, [SHOULDER], stale);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "missing-resolved-point")).toBe(true);
  });

  it("detects a stale point no longer produced by the current Anatomy", () => {
    const anatomy = torsoWithArms(1);
    const resolved = resolveCriticalPoints(torsoWithArms(2), DEFINITIONS, [SHOULDER]);

    const result = validateResolvedCriticalPoints(anatomy, DEFINITIONS, [SHOULDER], resolved);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "unexpected-resolved-point")).toBe(true);
  });

  it("detects a host mismatch", () => {
    const anatomy = torsoWithArms(1);
    const resolved = resolveCriticalPoints(anatomy, DEFINITIONS, [SHOULDER]);

    const corrupted = {
      points: resolved.points.map((p) => ({ ...p, hostPartIds: ["not-a-real-part"] })),
    };

    const result = validateResolvedCriticalPoints(anatomy, DEFINITIONS, [SHOULDER], corrupted);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        (i) => i.code === "unknown-host" || i.code === "resolved-host-mismatch",
      ),
    ).toBe(true);
  });
});

describe("category behavior", () => {
  it("createsInjuryOpportunity: semicritical and joint yes, critical no", () => {
    const anatomy = torsoWithArms(1);

    const semicritical = resolveCriticalPoints(anatomy, DEFINITIONS, [
      {
        id: "spine",
        name: "Spine",
        description: "Test spine.",
        category: "semicritical",
        placement: { kind: "per-part", selector: { types: ["torso"] } },
      },
    ]).points[0]!;

    const joint = resolveCriticalPoints(anatomy, DEFINITIONS, [SHOULDER]).points[0]!;

    const critical = resolveCriticalPoints(anatomy, DEFINITIONS, [
      {
        id: "core",
        name: "Core",
        description: "Test core.",
        category: "critical",
        failureConsequence: "death",
        placement: { kind: "body-part-self", selector: { types: ["torso"] } },
      },
    ]).points[0]!;

    expect(createsInjuryOpportunity(semicritical)).toBe(true);
    expect(createsInjuryOpportunity(joint)).toBe(true);
    expect(createsInjuryOpportunity(critical)).toBe(false);
  });

  it("isJointPoint / isCriticalPoint type guards discriminate correctly", () => {
    const anatomy = torsoWithArms(1);
    const joint = resolveCriticalPoints(anatomy, DEFINITIONS, [SHOULDER]).points[0]!;

    expect(isJointPoint(joint)).toBe(true);
    expect(isCriticalPoint(joint)).toBe(false);
  });

  it("getSinglePointHostId throws for a shared (multi-host) point", () => {
    const anatomy = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
      { id: "head-1", type: "head", attachment: { parentId: "torso-1" } },
    ]);

    const definition: SpecialPointDefinition = {
      id: "spine",
      name: "Spine",
      description: "Test spine.",
      category: "semicritical",
      placement: { kind: "shared", selector: { types: ["torso", "head"] } },
    };

    const point = resolveCriticalPoints(anatomy, DEFINITIONS, [definition]).points[0]!;

    // getSinglePointHostId only reads hostPartIds; the cast exercises the
    // guard against a shared point without claiming it's really a Critical
    // or Joint instance.
    expect(() =>
      getSinglePointHostId(point as unknown as ResolvedJointPoint),
    ).toThrow();
  });

  it("applyJointDamageMultiplier multiplies penetrating damage by the Joint's multiplier", () => {
    const anatomy = torsoWithArms(1);
    const joint = resolveCriticalPoints(anatomy, DEFINITIONS, [SHOULDER])
      .points[0] as ResolvedJointPoint;

    expect(applyJointDamageMultiplier(joint, 4)).toBe(8);
  });
});
