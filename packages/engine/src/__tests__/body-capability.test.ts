/*
 * Accessibility and effectiveness.
 *
 * The suite exists mostly to defend one distinction: accessibility is binary
 * and effectiveness is numerical, and no test here should ever be able to pass
 * by treating them as one scale. A Hand behind a destroyed Shoulder is
 * accessible at 37.5% effectiveness — never "37.5% accessible", because that
 * state does not exist.
 */

import { describe, expect, it } from "vitest";

import { createAnatomy } from "../character/foundation/body/anatomy/creation";
import { setBodyPartState } from "../character/foundation/body/anatomy/modification";
import { resolveBodyPoints } from "../character/foundation/body/body-points/resolution";
import {
  JOINT_DOWNSTREAM_EFFECTIVENESS_MULTIPLIER,
  resolveBodyCapability,
} from "../character/foundation/body/capability";
import { resolveCriticalPoints } from "../character/foundation/body/critical-points/resolution";
import { resolveMorphology } from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import type { Anatomy, BodyPartDefinition } from "../character/foundation/body/anatomy/types";
import type { SpecialPointDefinition } from "../character/foundation/body/critical-points/types";
import { TEST_PART_PHYSICALS } from "./fixtures/body";

/* Structural Capacity 4 keeps Maximum BP at 4, so BP fractions are quarters. */
const DEFINITIONS: readonly BodyPartDefinition[] = [
  { id: "torso", name: "Torso", description: "Test torso.", tags: [], ...TEST_PART_PHYSICALS },
  { id: "arm", name: "Arm", description: "Test arm.", tags: [], ...TEST_PART_PHYSICALS },
  { id: "hand", name: "Hand", description: "Test hand.", tags: [], ...TEST_PART_PHYSICALS },
  { id: "finger", name: "Finger", description: "Test finger.", tags: [], ...TEST_PART_PHYSICALS },
];

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

const NEUTRAL_SOURCE = { global: NEUTRAL_MORPHOLOGY, local: {} };

function limb(): Anatomy {
  return createAnatomy([
    { id: "torso-1", type: "torso", attachment: null },
    { id: "arm-1", type: "arm", attachment: { parentId: "torso-1" } },
    { id: "hand-1", type: "hand", attachment: { parentId: "arm-1" } },
    { id: "finger-1", type: "finger", attachment: { parentId: "hand-1" } },
  ]);
}

function withIntegrity(
  anatomy: Anatomy,
  integrityByPartId: Readonly<Record<string, number>>,
): Anatomy {
  return {
    parts: anatomy.parts.map((part) =>
      integrityByPartId[part.id] !== undefined
        ? { ...part, integrity: integrityByPartId[part.id]! }
        : part,
    ),
  };
}

function capability(
  anatomy: Anatomy,
  destroyedJointPointIds: readonly string[] = [],
  inaccessibility: readonly { sourceId: string; partId: string }[] = [],
) {
  const morphology = resolveMorphology(
    {
      species: NEUTRAL_SOURCE,
      age: NEUTRAL_SOURCE,
      character: NEUTRAL_SOURCE,
      strengthDevelopmentMuscularity: 1,
      effectLayers: [],
    },
    anatomy.parts.map((part) => part.id),
  );

  return resolveBodyCapability({
    anatomy,
    points: resolveCriticalPoints(anatomy, DEFINITIONS, [SHOULDER, WRIST]),
    destroyedJointPointIds,
    bodyPoints: resolveBodyPoints({
      anatomy,
      definitions: DEFINITIONS,
      morphologyByPartId: morphology,
      effectiveScale: 1,
      constitution: 10,
    }),
    inaccessibility,
  });
}


describe("an undamaged body", () => {
  it("is accessible and fully effective throughout", () => {
    const resolved = capability(limb());

    for (const part of resolved.parts) {
      expect(part.accessible).toBe(true);
      expect(part.inaccessibleReasons).toEqual([]);
      expect(part.effectiveness).toBe(1);
      expect(part.destroyedUpstreamJoints).toBe(0);
    }
  });
});


describe("BP fraction alone", () => {
  /*
   * Damage below a Joint's destruction threshold already matters, which is
   * precisely why Joints need no 10% or 50% tier of their own. A hurt limb is
   * a less effective limb through the ordinary BP fraction, and nothing extra
   * had to be invented to say so.
   */
  it("sets effectiveness with no Joint involved at all", () => {
    const resolved = capability(withIntegrity(limb(), { "arm-1": 0.75 }));

    expect(resolved.byPartId["arm-1"]?.bpFraction).toBeCloseTo(0.75, 10);
    expect(resolved.byPartId["arm-1"]?.effectiveness).toBeCloseTo(0.75, 10);
    expect(resolved.byPartId["arm-1"]?.accessible).toBe(true);
  });
});


describe("a destroyed Joint", () => {
  /*
   * Two separate consequences, and they land on different parts. The
   * designated Arm becomes UNUSABLE; the Hand hanging off it stays usable and
   * gets weaker. A hand on a dead arm can still grip — it just cannot do much.
   */
  it("makes its designated part inaccessible and does not cascade that", () => {
    const resolved = capability(limb(), ["shoulder:arm-1"]);

    expect(resolved.byPartId["arm-1"]?.accessible).toBe(false);
    expect(resolved.byPartId["arm-1"]?.inaccessibleReasons).toEqual([
      "shoulder:arm-1",
    ]);

    expect(resolved.byPartId["hand-1"]?.accessible).toBe(true);
    expect(resolved.byPartId["finger-1"]?.accessible).toBe(true);
  });

  it("halves effectiveness for everything downstream", () => {
    const resolved = capability(limb(), ["shoulder:arm-1"]);

    expect(resolved.byPartId["hand-1"]?.destroyedUpstreamJoints).toBe(1);
    expect(resolved.byPartId["hand-1"]?.effectiveness).toBeCloseTo(0.5, 10);
    expect(resolved.byPartId["finger-1"]?.effectiveness).toBeCloseTo(0.5, 10);
  });

  it("leaves parts that are not downstream untouched", () => {
    const resolved = capability(limb(), ["shoulder:arm-1"]);

    expect(resolved.byPartId["torso-1"]?.destroyedUpstreamJoints).toBe(0);
    expect(resolved.byPartId["torso-1"]?.effectiveness).toBe(1);
    expect(resolved.byPartId["torso-1"]?.accessible).toBe(true);
  });
});


describe("effectiveness is BP fraction THEN the Joint penalty", () => {
  /*
   * The worked example, verbatim: a Hand at 3 of 4 BP behind one destroyed
   * upstream Joint is 0.75 x 0.50 = 0.375. It is not 37.5% accessible; there
   * is no such state. It is accessible, and it is weak.
   */
  it("resolves a 3/4 BP Hand behind a destroyed Joint to 37.5%", () => {
    const resolved = capability(
      withIntegrity(limb(), { "hand-1": 0.75 }),
      ["shoulder:arm-1"],
    );

    const hand = resolved.byPartId["hand-1"];

    expect(hand?.bpFraction).toBeCloseTo(0.75, 10);
    expect(hand?.effectiveness).toBeCloseTo(0.375, 10);
    expect(hand?.accessible).toBe(true);
  });

  /*
   * Multiplicative, and specifically not the two alternatives that would give
   * a plausible-looking number here.
   */
  it("multiplies rather than subtracting or taking the worst", () => {
    const resolved = capability(
      withIntegrity(limb(), { "hand-1": 0.6 }),
      ["shoulder:arm-1"],
    );

    const effectiveness = resolved.byPartId["hand-1"]!.effectiveness;

    expect(effectiveness).toBeCloseTo(0.3, 10);
    expect(effectiveness).not.toBeCloseTo(0.1, 10); // 0.60 - 0.50
    expect(effectiveness).not.toBeCloseTo(0.6, 10); // max(0.60, 0.50)
  });
});


describe("several destroyed upstream Joints", () => {
  /*
   * 0.50 per applicable destroyed Joint, stacking multiplicatively. Two
   * independent control failures on one pathway are two failures rather than
   * one worse one.
   *
   * A Shoulder designating the Arm and a Wrist designating the Hand both sit
   * upstream of the Finger, so it takes both penalties.
   */
  it("applies 0.50^N to a part below both", () => {
    const resolved = capability(
      withIntegrity(limb(), { "finger-1": 0.8 }),
      ["shoulder:arm-1", "wrist:arm-1"],
    );

    const finger = resolved.byPartId["finger-1"];

    expect(finger?.destroyedUpstreamJoints).toBe(2);
    expect(finger?.effectiveness).toBeCloseTo(0.2, 10); // 0.80 x 0.25
  });

  it("counts only the Joints actually upstream of a given part", () => {
    const resolved = capability(limb(), ["shoulder:arm-1", "wrist:arm-1"]);

    // The Hand is below the Shoulder but IS the Wrist's designated part.
    expect(resolved.byPartId["hand-1"]?.destroyedUpstreamJoints).toBe(1);
    expect(resolved.byPartId["hand-1"]?.accessible).toBe(false);

    expect(resolved.byPartId["arm-1"]?.destroyedUpstreamJoints).toBe(0);
  });

  it("matches the constant it documents", () => {
    expect(JOINT_DOWNSTREAM_EFFECTIVENESS_MULTIPLIER).toBe(0.5);
  });
});


describe("inaccessibility has many causes and one shape", () => {
  /*
   * The reason accessibility is not derived from Joints alone. Frostbite,
   * paralysis, restraint and sealing make a limb unusable for reasons that
   * have nothing in common with a broken shoulder and no reason to agree on a
   * percentage.
   */
  it("accepts external sources and names them", () => {
    const resolved = capability(limb(), [], [
      { sourceId: "condition:frostbite", partId: "hand-1" },
    ]);

    expect(resolved.byPartId["hand-1"]?.accessible).toBe(false);
    expect(resolved.byPartId["hand-1"]?.inaccessibleReasons).toEqual([
      "condition:frostbite",
    ]);
  });

  it("leaves effectiveness alone — an unusable part is not a weak one", () => {
    const resolved = capability(
      withIntegrity(limb(), { "hand-1": 0.75 }),
      [],
      [{ sourceId: "condition:restrained", partId: "hand-1" }],
    );

    expect(resolved.byPartId["hand-1"]?.accessible).toBe(false);
    expect(resolved.byPartId["hand-1"]?.effectiveness).toBeCloseTo(0.75, 10);
  });

  it("collects every reason rather than only the first", () => {
    const resolved = capability(limb(), ["wrist:arm-1"], [
      { sourceId: "condition:frozen", partId: "hand-1" },
    ]);

    expect(resolved.byPartId["hand-1"]?.inaccessibleReasons).toEqual([
      "wrist:arm-1",
      "condition:frozen",
    ]);
  });
});


describe("departed anatomy", () => {
  it.each(["suppressed", "archived-removed"] as const)(
    "reports %s parts as unusable with zero effectiveness",
    (state) => {
      const resolved = capability(setBodyPartState(limb(), "hand-1", state));

      const hand = resolved.byPartId["hand-1"];

      expect(hand?.accessible).toBe(false);
      expect(hand?.effectiveness).toBe(0);
      expect(hand?.inaccessibleReasons).toContain(`state:${state}`);
    },
  );
});
