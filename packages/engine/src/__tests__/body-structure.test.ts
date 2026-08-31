/*
 * Structural Capacity.
 *
 * Deliberately narrow: one formula, and the tests that matter are mostly about
 * what SC does NOT respond to. Length, Bulk, Adiposity, CON and STR all leave
 * it untouched, and that exclusion is what lets a body be enormous and still
 * feeble — a distinction a model where size implies capacity cannot make.
 *
 * Nothing here touches Body Points. BP still resolves from the transitional
 * `baseBP`, which deliberately disagrees with `reference.structuralCapacity`
 * on five of the eight parts (Neck 4 vs 2, Upper Body 8 vs 10, Hand 5 vs 4,
 * Leg 14 vs 16, Foot 5 vs 4) while both tables still sum to the same
 * whole-body 100. That disagreement is asserted below rather than fixed, so a
 * later phase cannot quietly "correct" one table while the other is in use —
 * and the matching totals are exactly why it would otherwise go unnoticed.
 */

import { describe, expect, it } from "vitest";

import { BODY_PART_DEFINITIONS } from "../character/foundation/body/anatomy/body-parts";
import { setBodyPartState } from "../character/foundation/body/anatomy/modification";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import {
  resolveBodyStructuralCapacity,
  resolveMuscularityStructuralFactor,
  resolvePartStructuralCapacity,
} from "../character/foundation/body/structure/resolution";
import {
  findReferenceStructuralCapacityIssues,
  findStructuralFactorIssues,
  validateStructuralCapacityInputs,
} from "../character/foundation/body/structure/validation";
import { resolveMorphology } from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import type { BodyMorphology } from "../character/foundation/body/types";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "../character/foundation/body/anatomy/types";

const DEFINITIONS = Object.values(
  BODY_PART_DEFINITIONS,
) as readonly BodyPartDefinition[];

const NEUTRAL_SOURCE = { global: NEUTRAL_MORPHOLOGY, local: {} };


/*
 * Uniform morphology across a whole body, through the real morphology
 * pipeline. Strength development is the layer this all eventually runs
 * through, so it is the natural place to put a global Muscularity.
 */
function morphologyAt(
  anatomy: Anatomy,
  muscularity = 1,
  global: BodyMorphology = NEUTRAL_MORPHOLOGY,
): Readonly<Record<BodyPartId, BodyMorphology>> {
  return resolveMorphology(
    {
      species: NEUTRAL_SOURCE,
      age: NEUTRAL_SOURCE,
      character: { global, local: {} },
      strengthDevelopmentMuscularity: muscularity,
      effectLayers: [],
    },
    anatomy.parts.map((part) => part.id),
  );
}


function totalSC(
  anatomy: Anatomy,
  effectiveScale = 1,
  muscularity = 1,
  global: BodyMorphology = NEUTRAL_MORPHOLOGY,
): number {
  return resolveBodyStructuralCapacity(
    anatomy,
    DEFINITIONS,
    morphologyAt(anatomy, muscularity, global),
    effectiveScale,
  ).totalStructuralCapacity;
}


describe("the calibration gate", () => {
  it("gives the neutral Human a total Structural Capacity of 100", () => {
    expect(totalSC(STANDARD_HUMANOID_ANATOMY)).toBeCloseTo(100, 10);
  });

  /*
   * Scale enters SQUARED where Size and Mass take the cube, because it is
   * cross-section that carries force and resists destruction, not volume.
   * A Scale-10 Giant is 1,000 times as heavy and only 100 times as capable —
   * square-cube, as it is for real animals.
   */
  it("gives a Scale-10 fixture a total Structural Capacity of 10,000", () => {
    expect(totalSC(STANDARD_HUMANOID_ANATOMY, 10)).toBeCloseTo(10_000, 6);
  });

  it("squares Scale rather than cubing it", () => {
    expect(totalSC(STANDARD_HUMANOID_ANATOMY, 2)).toBeCloseTo(400, 10);
    expect(totalSC(STANDARD_HUMANOID_ANATOMY, 3)).toBeCloseTo(900, 10);
  });

  /*
   * The whole-body Muscularity structural response. Because the factor is
   * linear, the body's SC is exactly 100 + 76.30 x (M - 1), and that 76.30 is
   * the number Strength advancement is calibrated against.
   */
  it("responds to whole-body Muscularity at exactly 76.30 per point", () => {
    expect(totalSC(STANDARD_HUMANOID_ANATOMY, 1, 2)).toBeCloseTo(176.3, 10);
    expect(totalSC(STANDARD_HUMANOID_ANATOMY, 1, 1.5)).toBeCloseTo(138.15, 10);
    expect(totalSC(STANDARD_HUMANOID_ANATOMY, 1, 0.5)).toBeCloseTo(61.85, 10);
  });

  it("matches the authored sum(refSC x muscularityStructural)", () => {
    const response =
      totalSC(STANDARD_HUMANOID_ANATOMY, 1, 2) -
      totalSC(STANDARD_HUMANOID_ANATOMY, 1, 1);

    expect(response).toBeCloseTo(76.3, 10);
  });
});


describe("what Structural Capacity does not respond to", () => {
  /*
   * The load-bearing exclusion. A body can be long, broad and heavy while
   * remaining structurally feeble; size is not capacity.
   */
  it.each([
    ["length", { ...NEUTRAL_MORPHOLOGY, length: 2 }],
    ["bulk", { ...NEUTRAL_MORPHOLOGY, bulk: 2 }],
    ["adiposity", { ...NEUTRAL_MORPHOLOGY, adiposity: 2 }],
  ])("is unmoved by %s", (_dimension, morphology) => {
    expect(
      totalSC(STANDARD_HUMANOID_ANATOMY, 1, 1, morphology),
    ).toBeCloseTo(100, 10);
  });

  it("is unmoved by all three at once", () => {
    expect(
      totalSC(STANDARD_HUMANOID_ANATOMY, 1, 1, {
        length: 3,
        bulk: 3,
        adiposity: 3,
        muscularity: 1,
      }),
    ).toBeCloseTo(100, 10);
  });

  /*
   * Muscularity is the ONLY morphology dimension that reaches SC, which is
   * precisely why it is the mechanism Strength advancement operates through.
   */
  it("moves only when Muscularity moves", () => {
    const bigAndSoft = totalSC(STANDARD_HUMANOID_ANATOMY, 1, 1, {
      length: 2,
      bulk: 2,
      adiposity: 2,
      muscularity: 1,
    });

    const smallAndBuilt = totalSC(STANDARD_HUMANOID_ANATOMY, 1, 1, {
      length: 0.9,
      bulk: 0.9,
      adiposity: 0.9,
      muscularity: 1.5,
    });

    expect(bigAndSoft).toBeCloseTo(100, 10);
    expect(smallAndBuilt).toBeGreaterThan(bigAndSoft);
  });
});


describe("per-part Structural Capacity", () => {
  it("distributes the Muscularity response by per-part sensitivity", () => {
    const built: BodyMorphology = { ...NEUTRAL_MORPHOLOGY, muscularity: 2 };

    // Arm muscularityStructural 1.00 takes the whole point; Head's 0.05 a sliver.
    expect(
      resolveMuscularityStructuralFactor(
        built,
        BODY_PART_DEFINITIONS.arm.sensitivity,
      ),
    ).toBeCloseTo(2, 10);

    expect(
      resolveMuscularityStructuralFactor(
        built,
        BODY_PART_DEFINITIONS.head.sensitivity,
      ),
    ).toBeCloseTo(1.05, 10);
  });

  it("carries the factor alongside the capacity so a change is inspectable", () => {
    const resolved = resolvePartStructuralCapacity(
      "leg-1",
      16,
      BODY_PART_DEFINITIONS.leg.sensitivity,
      { ...NEUTRAL_MORPHOLOGY, muscularity: 1.5 },
      2,
    );

    expect(resolved.muscularityStructuralFactor).toBeCloseTo(1.5, 10);
    expect(resolved.structuralCapacity).toBeCloseTo(16 * 4 * 1.5, 10);
  });

  /*
   * Zero reference SC is legal. Genuinely inert structure — a decorative
   * crest, a shell plate — can bear nothing, and making that expressible by
   * arithmetic is cheaper than a flag saying the same thing.
   */
  it("permits an inert part with zero reference capacity", () => {
    const resolved = resolvePartStructuralCapacity(
      "crest-1",
      0,
      BODY_PART_DEFINITIONS.head.sensitivity,
      { ...NEUTRAL_MORPHOLOGY, muscularity: 3 },
      5,
    );

    expect(resolved.structuralCapacity).toBe(0);
  });
});


describe("physical presence", () => {
  it("drops severed anatomy from the total", () => {
    let anatomy = STANDARD_HUMANOID_ANATOMY;

    for (const id of ["arm-1", "hand-1", "arm-2", "hand-2"]) {
      anatomy = setBodyPartState(anatomy, id, "archived-removed");
    }

    // 100 - 2 x (14 + 4)
    expect(totalSC(anatomy)).toBeCloseTo(64, 10);
  });

  it("treats suppressed anatomy exactly as absent", () => {
    const suppressed = setBodyPartState(
      STANDARD_HUMANOID_ANATOMY,
      "leg-1",
      "suppressed",
    );

    expect(totalSC(suppressed)).toBeCloseTo(84, 10);
  });

  /*
   * Damage does not lower Structural Capacity. A broken limb still has the
   * structure it has; what damage lowers is how much of that structure is
   * currently usable, which is a different quantity resolved elsewhere.
   */
  it("is unmoved by stored damage", () => {
    const hurt: Anatomy = {
      parts: STANDARD_HUMANOID_ANATOMY.parts.map((part) =>
        part.id === "leg-1" ? { ...part, damage: 15 } : part,
      ),
    };

    expect(totalSC(hurt)).toBeCloseTo(100, 10);
  });

  it("resolves an empty body to zero rather than failing", () => {
    expect(totalSC({ parts: [] })).toBe(0);
  });
});


describe("the transitional Body Point shim", () => {
  /*
   * baseBP and reference.structuralCapacity deliberately DISAGREE per part.
   * BP has not moved onto SC yet, so both tables are live and each is right
   * for its own consumer. Asserting the disagreement keeps a later phase from
   * quietly "correcting" one of them while the other is still in use.
   */
  it("keeps the old BP baseline disagreeing with the new reference SC", () => {
    expect(BODY_PART_DEFINITIONS.neck.baseBP).toBe(4);
    expect(BODY_PART_DEFINITIONS.neck.reference.structuralCapacity).toBe(2);

    expect(BODY_PART_DEFINITIONS.leg.baseBP).toBe(14);
    expect(BODY_PART_DEFINITIONS.leg.reference.structuralCapacity).toBe(16);
  });

  /*
   * The two tables disagree per part while summing to the same whole-body 100.
   * That is not a coincidence — both were calibrated against the same
   * reference body — and it is why the disagreement is survivable: the shim
   * and the new data describe the same Human, just distributed differently
   * across it. It is also why the mismatch is easy to miss, which is the
   * reason to pin it here.
   */
  it("sums both tables to the same body while distributing them differently", () => {
    const bpTotal = STANDARD_HUMANOID_ANATOMY.parts.reduce(
      (total, part) =>
        total +
        (DEFINITIONS.find((d) => d.id === part.type)?.baseBP ?? 0),
      0,
    );

    expect(bpTotal).toBe(100);
    expect(totalSC(STANDARD_HUMANOID_ANATOMY)).toBeCloseTo(100, 10);

    const disagreeing = DEFINITIONS.filter(
      (d) => d.baseBP !== d.reference.structuralCapacity,
    ).map((d) => d.id);

    expect(disagreeing.sort()).toEqual([
      "foot",
      "hand",
      "leg",
      "neck",
      "upper-body",
    ]);
  });
});


describe("Structural Capacity validation", () => {
  it("accepts the standard humanoid", () => {
    expect(
      validateStructuralCapacityInputs(
        STANDARD_HUMANOID_ANATOMY,
        DEFINITIONS,
        morphologyAt(STANDARD_HUMANOID_ANATOMY),
      ),
    ).toEqual({ valid: true, issues: [] });
  });

  it("rejects a negative reference Structural Capacity", () => {
    const definition: BodyPartDefinition = {
      ...BODY_PART_DEFINITIONS.arm,
      reference: {
        ...BODY_PART_DEFINITIONS.arm.reference,
        structuralCapacity: -1,
      },
    };

    expect(
      findReferenceStructuralCapacityIssues(definition)[0]?.code,
    ).toBe("invalid-reference-structural-capacity");
  });

  it("accepts a zero reference Structural Capacity", () => {
    const definition: BodyPartDefinition = {
      ...BODY_PART_DEFINITIONS.arm,
      reference: {
        ...BODY_PART_DEFINITIONS.arm.reference,
        structuralCapacity: 0,
      },
    };

    expect(findReferenceStructuralCapacityIssues(definition)).toEqual([]);
  });

  /*
   * Only reachable once an upstream guarantee has already broken — with the
   * sensitivity bounded to [0, 1] and Muscularity positive, the factor cannot
   * go negative. The check names the consequence rather than letting a
   * negative capacity propagate into Body Points and the Strength solver.
   */
  it("reports a structural factor driven negative by an out-of-range sensitivity", () => {
    const broken: BodyPartDefinition = {
      ...BODY_PART_DEFINITIONS.arm,
      sensitivity: {
        ...BODY_PART_DEFINITIONS.arm.sensitivity,
        muscularityStructural: 1.5,
      },
    };

    const anatomy = {
      parts: STANDARD_HUMANOID_ANATOMY.parts.filter(
        (part) => part.id === "arm-1",
      ),
    };

    const issues = findStructuralFactorIssues(anatomy, [broken], {
      "arm-1": { ...NEUTRAL_MORPHOLOGY, muscularity: 0.3 },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("negative-muscularity-structural-factor");
  });
});
