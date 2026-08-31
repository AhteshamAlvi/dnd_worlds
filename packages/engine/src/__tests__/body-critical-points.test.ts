/*
 * Anatomical Point resolution, evaluation and validation.
 *
 * Deliberately exercised over arbitrary data-driven anatomy rather than only
 * the standard two-limb humanoid, because the resolution engine must not
 * encode any assumption about how many limbs a creature has.
 *
 * The evaluation half is where the real content is. Four categories that
 * resolve INDEPENDENTLY from one final damage number is the whole model, and
 * most of these tests exist to prove that none of them is quietly an
 * else-branch of another.
 */

import { describe, expect, it } from "vitest";

import { createAnatomy } from "../character/foundation/body/anatomy/creation";
import type { BodyPartDefinition } from "../character/foundation/body/anatomy/types";
import { TEST_PART_PHYSICALS } from "./fixtures/body";
import {
  applyWeakMultiplier,
  evaluateCritical,
  evaluateFatal,
  evaluateJoint,
  hasCategory,
  resolveCriticalPoints,
  resolveThreshold,
} from "../character/foundation/body/critical-points/resolution";
import {
  WEAK_DAMAGE_MULTIPLIER,
} from "../character/foundation/body/critical-points/types";
import type {
  CriticalPointInstance,
  SpecialPointDefinition,
} from "../character/foundation/body/critical-points/types";
import {
  validateCriticalPointData,
  validateResolvedCriticalPoints,
  validateSpecialPointDefinitions,
} from "../character/foundation/body/critical-points/validation";

const DEFINITIONS: readonly BodyPartDefinition[] = [
  { id: "torso", name: "Torso", description: "Test torso.", tags: [], ...TEST_PART_PHYSICALS },
  { id: "head", name: "Head", description: "Test head.", tags: [], ...TEST_PART_PHYSICALS },
  { id: "arm", name: "Arm", description: "Test arm.", tags: [], ...TEST_PART_PHYSICALS },
  { id: "hand", name: "Hand", description: "Test hand.", tags: [], ...TEST_PART_PHYSICALS },
  { id: "leg", name: "Leg", description: "Test leg.", tags: [], ...TEST_PART_PHYSICALS },
];

const BRAIN: SpecialPointDefinition = {
  id: "brain",
  name: "Brain",
  description: "Test brain.",
  categories: ["fatal", "critical"],
  placement: { kind: "per-part", selector: { types: ["head"] } },
};

const SHOULDER: SpecialPointDefinition = {
  id: "shoulder",
  name: "Shoulder",
  description: "Test shoulder.",
  categories: ["joint"],
  jointDesignation: { kind: "host" },
  placement: { kind: "per-part", selector: { types: ["arm"] } },
};

const WRIST: SpecialPointDefinition = {
  id: "wrist",
  name: "Wrist",
  description: "Test wrist.",
  categories: ["joint"],
  jointDesignation: { kind: "child-of-host", selector: { types: ["hand"] } },
  placement: { kind: "per-part", selector: { types: ["arm"] } },
};

const HIP: SpecialPointDefinition = {
  id: "hip",
  name: "Hip",
  description: "Test hip.",
  categories: ["joint"],
  jointDesignation: { kind: "host" },
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

/** A bare instance for testing evaluation without resolving anatomy. */
function point(
  categories: CriticalPointInstance["categories"],
  overrides: Partial<CriticalPointInstance> = {},
): CriticalPointInstance {
  return {
    id: "test:host-1",
    definitionId: "test",
    categories,
    hostPartId: "host-1",
    weakMultiplier: WEAK_DAMAGE_MULTIPLIER,
    ...overrides,
  };
}


describe("resolution over arbitrary anatomy", () => {
  it("a 4-armed creature yields 4 Shoulder instances", () => {
    const resolved = resolveCriticalPoints(torsoWithArms(4), DEFINITIONS, [
      SHOULDER,
    ]);

    expect(resolved.points.map((p) => p.id).sort()).toEqual([
      "shoulder:arm-1",
      "shoulder:arm-2",
      "shoulder:arm-3",
      "shoulder:arm-4",
    ]);
  });

  it("a legless creature yields no Hip instances", () => {
    expect(
      resolveCriticalPoints(torsoWithArms(2), DEFINITIONS, [HIP]).points,
    ).toEqual([]);
  });

  it("body-part-self placement makes the matching BodyPart itself the target", () => {
    const selfPoint: SpecialPointDefinition = {
      id: "neck",
      name: "Neck",
      description: "Test neck.",
      categories: ["fatal", "critical"],
      placement: { kind: "body-part-self", selector: { types: ["head"] } },
    };

    const anatomy = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
      { id: "head-1", type: "head", attachment: { parentId: "torso-1" } },
    ]);

    const resolved = resolveCriticalPoints(anatomy, DEFINITIONS, [selfPoint]);

    expect(resolved.points[0]?.hostPartId).toBe("head-1");
  });

  /*
   * Every point has exactly one host. Shared placement — one instance spanning
   * several hosts — is gone, and with it the question a caller could not
   * answer: when a Spine straddles the Upper and Lower Body, which one did you
   * hit? Anatomy spanning regions authors one point per region instead.
   */
  it("gives every instance exactly one host", () => {
    const resolved = resolveCriticalPoints(torsoWithArms(3), DEFINITIONS, [
      SHOULDER,
      BRAIN,
      HIP,
    ]);

    for (const instance of resolved.points) {
      expect(typeof instance.hostPartId).toBe("string");
    }
  });
});


describe("joint designation", () => {
  const armWithHand = createAnatomy([
    { id: "torso-1", type: "torso", attachment: null },
    { id: "arm-1", type: "arm", attachment: { parentId: "torso-1" } },
    { id: "hand-1", type: "hand", attachment: { parentId: "arm-1" } },
  ]);

  it("designates the host itself for a host-designated Joint", () => {
    const resolved = resolveCriticalPoints(armWithHand, DEFINITIONS, [SHOULDER]);

    expect(resolved.points[0]?.designatedPartId).toBe("arm-1");
  });

  /*
   * The asymmetry that makes jointDesignation a field rather than an
   * assumption: a Wrist sits ON the Arm but governs the Hand, so its threshold
   * is a percentage of the Hand's Maximum BP. Reading it off the host would
   * make small extremities absurdly durable for being attached to something
   * large.
   */
  it("designates a child for a child-designated Joint", () => {
    const resolved = resolveCriticalPoints(armWithHand, DEFINITIONS, [WRIST]);

    expect(resolved.points[0]?.hostPartId).toBe("arm-1");
    expect(resolved.points[0]?.designatedPartId).toBe("hand-1");
  });

  it("designates each limb's own child rather than the first match", () => {
    const twoArms = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
      { id: "arm-1", type: "arm", attachment: { parentId: "torso-1" } },
      { id: "hand-1", type: "hand", attachment: { parentId: "arm-1" } },
      { id: "arm-2", type: "arm", attachment: { parentId: "torso-1" } },
      { id: "hand-2", type: "hand", attachment: { parentId: "arm-2" } },
    ]);

    const resolved = resolveCriticalPoints(twoArms, DEFINITIONS, [WRIST]);

    expect(
      resolved.points.map((p) => [p.id, p.designatedPartId]).sort(),
    ).toEqual([
      ["wrist:arm-1", "hand-1"],
      ["wrist:arm-2", "hand-2"],
    ]);
  });

  /*
   * A Wrist on an Arm whose Hand is gone governs nothing, and that is a fact
   * about the body rather than an error. The instance still exists as a
   * target; it simply has no Joint threshold to fail.
   */
  it("designates nothing when the child is absent", () => {
    const resolved = resolveCriticalPoints(torsoWithArms(1), DEFINITIONS, [
      WRIST,
    ]);

    expect(resolved.points[0]?.designatedPartId).toBeUndefined();
  });
});


describe("thresholds", () => {
  /*
   * Thresholds always round UP, because a threshold is a MINIMUM REQUIRED
   * amount of damage. Rounding down would make every point quietly easier to
   * break than its stated percentage.
   */
  it("rounds up, always", () => {
    expect(resolveThreshold(8, 0.10)).toBe(1); // 0.8
    expect(resolveThreshold(8, 0.30)).toBe(3); // 2.4
    expect(resolveThreshold(8, 0.50)).toBe(4); // 4.0
    expect(resolveThreshold(14, 0.30)).toBe(5); // 4.2
    expect(resolveThreshold(4, 0.30)).toBe(2); // 1.2
  });

  /*
   * On small anatomy several tiers land on the same integer. Intended rather
   * than an artefact: a part with little structure has little room between
   * hurt and ruined.
   */
  it("collapses tiers on small anatomy", () => {
    const lowerBody = [0.10, 0.30, 0.50].map((f) => resolveThreshold(4, f));
    expect(lowerBody).toEqual([1, 2, 2]);

    const neck = [0.10, 0.30, 0.50].map((f) => resolveThreshold(2, f));
    expect(neck).toEqual([1, 1, 1]);
  });
});


describe("Weak", () => {
  it("multiplies by 1.5 by default", () => {
    expect(applyWeakMultiplier(point(["weak"]), 4)).toBe(6);
  });

  it("leaves a point that is not Weak alone", () => {
    expect(applyWeakMultiplier(point(["critical"]), 4)).toBe(4);
  });

  it("honours a definition's own multiplier", () => {
    expect(applyWeakMultiplier(point(["weak"], { weakMultiplier: 3 }), 4)).toBe(
      12,
    );
  });
});


describe("Critical tiers", () => {
  const brain = point(["fatal", "critical"]);

  /*
   * Head Maximum BP 8 gives tiers at 1, 3 and 4. The chances are FRACTIONS —
   * one-third and one-half — and the thresholds are PERCENTAGES of Maximum BP.
   * They are different quantities and 1/3 is not 30%.
   */
  it.each([
    [0, "none", "none", false],
    [1, "minor", "one-third", false],
    [2, "minor", "one-third", false],
    [3, "major", "one-half", false],
    [4, "destruction", "guaranteed", true],
    [8, "destruction", "guaranteed", true],
  ])(
    "%i damage on an 8 BP host -> %s",
    (damage, tier, chance, destroyed) => {
      const outcome = evaluateCritical(brain, 8, damage);

      expect(outcome.tier).toBe(tier);
      expect(outcome.injuryChance).toBe(chance);
      expect(outcome.destroyed).toBe(destroyed);
    },
  );

  it("returns no tier for a point that is not Critical", () => {
    const outcome = evaluateCritical(point(["weak"]), 8, 8);

    expect(outcome.tier).toBe("none");
    expect(outcome.destroyed).toBe(false);
  });

  it("reports the thresholds it used", () => {
    expect(evaluateCritical(brain, 10, 0).thresholds).toEqual({
      minor: 1,
      major: 3,
      destruction: 5,
    });
  });
});


describe("Fatal", () => {
  /*
   * Half the containing part's Maximum BP, which makes targeted attacks far
   * deadlier than attrition and is meant to. A Brain hit for 4 kills a
   * character whose Head still has 4 of its 8 BP: destroying a brain is death,
   * and it should not require destroying the skull around it first.
   */
  it("fires at half the containing Maximum BP", () => {
    const brain = point(["fatal", "critical"]);

    expect(evaluateFatal(brain, 8, 3).fatal).toBe(false);
    expect(evaluateFatal(brain, 8, 4).fatal).toBe(true);
    expect(evaluateFatal(brain, 8, 4).threshold).toBe(4);
  });

  it("never fires for a point that is not Fatal", () => {
    expect(evaluateFatal(point(["critical"]), 8, 8).fatal).toBe(false);
  });
});


describe("Joint", () => {
  it("fires at 30% of the DESIGNATED part's Maximum BP", () => {
    const wrist = point(["joint"], { designatedPartId: "hand-1" });

    // Hand Maximum BP 4 -> ceil(1.2) = 2, regardless of the Arm hosting it.
    expect(evaluateJoint(wrist, 4, 1).failed).toBe(false);
    expect(evaluateJoint(wrist, 4, 2).failed).toBe(true);
    expect(evaluateJoint(wrist, 4, 2).threshold).toBe(2);
  });

  it("never fires for a point that is not a Joint", () => {
    expect(evaluateJoint(point(["weak"]), 4, 4).failed).toBe(false);
  });
});


describe("the four categories are independent", () => {
  /*
   * The load-bearing property of the whole model. A Human Neck is Fatal,
   * Critical, Joint and Weak on a 2 BP part, so every threshold is 1 — and one
   * point of final damage triggers all of them at once. Nothing here is an
   * else-branch of anything else.
   */
  it("lets one hit trigger every category a Neck carries", () => {
    const neck = point(["fatal", "critical", "joint", "weak"], {
      designatedPartId: "neck-1",
    });

    const damage = Math.round(applyWeakMultiplier(neck, 1));

    expect(evaluateCritical(neck, 2, damage).destroyed).toBe(true);
    expect(evaluateFatal(neck, 2, damage).fatal).toBe(true);
    expect(evaluateJoint(neck, 2, damage).failed).toBe(true);
  });

  it("lets a Joint fail without any Critical or Fatal consequence", () => {
    const shoulder = point(["joint"], { designatedPartId: "arm-1" });

    expect(evaluateJoint(shoulder, 14, 5).failed).toBe(true);
    expect(evaluateCritical(shoulder, 14, 5).tier).toBe("none");
    expect(evaluateFatal(shoulder, 14, 5).fatal).toBe(false);
  });

  it("lets a Critical Point be destroyed without being Fatal", () => {
    const eye = point(["critical", "weak"]);

    expect(evaluateCritical(eye, 8, 4).destroyed).toBe(true);
    expect(evaluateFatal(eye, 8, 4).fatal).toBe(false);
  });
});


describe("definition validation", () => {
  const base = {
    id: "test",
    name: "Test",
    description: "Test point.",
    placement: { kind: "per-part" as const, selector: { types: ["arm"] } },
  };

  it("accepts the authored roster", () => {
    expect(
      validateSpecialPointDefinitions([BRAIN, SHOULDER, WRIST, HIP]).valid,
    ).toBe(true);
  });

  /*
   * A point with no categories resolves into instances, appears in the roster,
   * accepts a hit, and then does nothing that hitting the BodyPart directly
   * would not already have done. It is a label, not a target.
   */
  it("rejects a point declaring no categories", () => {
    const result = validateSpecialPointDefinitions([
      { ...base, categories: [] },
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("no-categories");
  });

  it("rejects a Joint with nothing to govern", () => {
    const result = validateSpecialPointDefinitions([
      { ...base, categories: ["joint"] },
    ]);

    expect(result.issues.map((i) => i.code)).toContain(
      "joint-without-designation",
    );
  });

  it("rejects a designation on a point that is not a Joint", () => {
    const result = validateSpecialPointDefinitions([
      {
        ...base,
        categories: ["critical"],
        jointDesignation: { kind: "host" },
      },
    ]);

    expect(result.issues.map((i) => i.code)).toContain(
      "designation-without-joint",
    );
  });

  it("rejects a Weak multiplier on a point that is not Weak", () => {
    const result = validateSpecialPointDefinitions([
      { ...base, categories: ["critical"], weakMultiplier: 2 },
    ]);

    expect(result.issues.map((i) => i.code)).toContain(
      "weak-multiplier-without-weak",
    );
  });

  it.each([0, -1, Number.NaN])("rejects a Weak multiplier of %p", (m) => {
    const result = validateSpecialPointDefinitions([
      { ...base, categories: ["weak"], weakMultiplier: m },
    ]);

    expect(result.issues.map((i) => i.code)).toContain(
      "invalid-weak-multiplier",
    );
  });

  it("rejects a duplicate category", () => {
    const result = validateSpecialPointDefinitions([
      { ...base, categories: ["weak", "weak"] },
    ]);

    expect(result.issues.map((i) => i.code)).toContain("duplicate-category");
  });

  it("rejects duplicate definition ids", () => {
    const result = validateSpecialPointDefinitions([BRAIN, BRAIN]);

    expect(result.issues.map((i) => i.code)).toContain(
      "duplicate-special-point-id",
    );
  });
});


describe("resolved-instance validation", () => {
  const anatomy = torsoWithArms(2);

  it("accepts points resolved from the anatomy they describe", () => {
    const resolved = resolveCriticalPoints(anatomy, DEFINITIONS, [SHOULDER]);

    expect(validateResolvedCriticalPoints(resolved, anatomy).valid).toBe(true);
  });

  it("detects a host that is not in the anatomy", () => {
    const resolved = resolveCriticalPoints(torsoWithArms(4), DEFINITIONS, [
      SHOULDER,
    ]);

    const result = validateResolvedCriticalPoints(resolved, anatomy);

    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("unknown-host-part");
  });

  it("passes full consistency validation on a complete body", () => {
    const armWithHand = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
      { id: "arm-1", type: "arm", attachment: { parentId: "torso-1" } },
      { id: "hand-1", type: "hand", attachment: { parentId: "arm-1" } },
    ]);

    const resolved = resolveCriticalPoints(armWithHand, DEFINITIONS, [WRIST]);

    const result = validateCriticalPointData(resolved, armWithHand, DEFINITIONS, [
      WRIST,
    ]);

    expect(result.valid).toBe(true);
  });
});


describe("hasCategory", () => {
  it("reads flags rather than an exclusive tag", () => {
    const neck = point(["fatal", "critical", "joint", "weak"]);

    expect(hasCategory(neck, "fatal")).toBe(true);
    expect(hasCategory(neck, "weak")).toBe(true);
    expect(hasCategory(point(["weak"]), "joint")).toBe(false);
  });
});
