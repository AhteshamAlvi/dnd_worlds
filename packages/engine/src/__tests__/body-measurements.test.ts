/*
 * Physical measurements and Height, resolved end to end.
 *
 * body-reference-standard.test.ts asserts the authored table sums to the Basic
 * Human Standard with no resolver involved. This file asserts that the
 * resolver, given that table, actually produces the same body — which is a
 * different claim, and the one that catches a formula applied in the wrong
 * place.
 *
 * The Height cases are the point of the file. Height is the one measurement
 * that is not a sum, and the failure mode it exists to prevent is specific and
 * plausible: an unsigned longest-path traversal walks down one Leg, across the
 * pelvis and down the other, and reports a Human at 176 cm. That number is
 * asserted against explicitly below, because a Height model that merely
 * happens to be right on a symmetrical body tells you nothing.
 */

import { describe, expect, it } from "vitest";

import { BODY_PART_DEFINITIONS } from "../character/foundation/body/anatomy/body-parts";
import { createAnatomy } from "../character/foundation/body/anatomy/creation";
import { setBodyPartState } from "../character/foundation/body/anatomy/modification";
import {
  STANDARD_HUMANOID_ANATOMY,
  STANDARD_HUMANOID_BODY_PART_SPECS,
} from "../character/foundation/body/anatomy/standard-humanoid";
import { HUMAN_AGE_PROFILE } from "../character/foundation/body/age/human-age-profile";
import { resolveAge } from "../character/foundation/body/age/resolution";
import { resolveHeightCm } from "../character/foundation/body/measurements/height";
import {
  resolveAdipositySizeFactor,
  resolveBodyMeasurements,
  resolveEffectiveBulk,
  resolveMassCompositionFactor,
  resolvePartMeasurements,
} from "../character/foundation/body/measurements/resolution";
import {
  findHeightRelevantCycleIssues,
  validateMeasurementInputs,
} from "../character/foundation/body/measurements/validation";
import { resolveMorphology } from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import type { BodyMorphology } from "../character/foundation/body/types";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "../character/foundation/body/anatomy/types";
import type { BodyPartCreationSpec } from "../character/foundation/body/anatomy/creation";

const DEFINITIONS = Object.values(
  BODY_PART_DEFINITIONS,
) as readonly BodyPartDefinition[];

const NEUTRAL_SOURCE = { global: NEUTRAL_MORPHOLOGY, local: {} };


/*
 * Neutral morphology for every part of an anatomy, resolved through the real
 * morphology pipeline rather than hand-built, so these tests break if that
 * pipeline stops producing neutral from neutral inputs.
 */
function neutralMorphology(
  anatomy: Anatomy,
): Readonly<Record<BodyPartId, BodyMorphology>> {
  return resolveMorphology(
    {
      species: NEUTRAL_SOURCE,
      age: NEUTRAL_SOURCE,
      character: NEUTRAL_SOURCE,
      strengthDevelopmentMuscularity: 1,
      effectLayers: [],
    },
    anatomy.parts.map((part) => part.id),
  );
}


function measure(
  anatomy: Anatomy,
  effectiveScale = 1,
  morphology = neutralMorphology(anatomy),
) {
  return resolveBodyMeasurements(
    anatomy,
    DEFINITIONS,
    morphology,
    effectiveScale,
  );
}


describe("the Basic Human Standard, resolved", () => {
  /*
   * The calibration gate. Every factor is 1 at neutral morphology and Scale 1,
   * so the resolver has to hand back the authored table untouched. Anything
   * else means a factor is being applied where it should not be.
   */
  it("resolves the reference Human to 165 cm, 62.00 kg, 60.00 L", () => {
    const resolved = measure(STANDARD_HUMANOID_ANATOMY);

    expect(resolved.heightCm).toBeCloseTo(165, 10);
    expect(resolved.totalMassKg).toBeCloseTo(62, 10);
    expect(resolved.totalSizeL).toBeCloseTo(60, 10);
  });

  it("resolves all twelve parts and keeps the totals agreeing with them", () => {
    const resolved = measure(STANDARD_HUMANOID_ANATOMY);

    expect(resolved.parts).toHaveLength(12);

    expect(
      resolved.parts.reduce((total, part) => total + part.massKg, 0),
    ).toBeCloseTo(resolved.totalMassKg, 10);

    expect(Object.keys(resolved.byPartId)).toHaveLength(12);
    expect(resolved.byPartId["leg-1"]?.lengthCm).toBeCloseTo(81, 10);
  });

  /*
   * The Giant fixture. Scale is geometry: length goes as Scale, volume and
   * mass as Scale cubed. A proportionally ordinary creature ten times as tall
   * is a thousand times as heavy, which is why a Giant needs no authored Size
   * or Mass of its own.
   *
   * Species wiring is deliberately absent — this is an explicit Scale, not a
   * Species profile. Connecting SpeciesBodyProfile to production Character
   * resolution is Phase 8 work.
   */
  it("resolves a Scale-10 fixture to 16.5 m, 62,000 kg, 60,000 L", () => {
    const resolved = measure(STANDARD_HUMANOID_ANATOMY, 10);

    expect(resolved.heightCm).toBeCloseTo(1650, 6);
    expect(resolved.totalMassKg).toBeCloseTo(62_000, 6);
    expect(resolved.totalSizeL).toBeCloseTo(60_000, 6);
  });

  it("scales Length linearly while Size and Mass go as the cube", () => {
    const single = measure(STANDARD_HUMANOID_ANATOMY, 1);
    const doubled = measure(STANDARD_HUMANOID_ANATOMY, 2);

    expect(doubled.heightCm / single.heightCm).toBeCloseTo(2, 10);
    expect(doubled.totalSizeL / single.totalSizeL).toBeCloseTo(8, 10);
    expect(doubled.totalMassKg / single.totalMassKg).toBeCloseTo(8, 10);
  });
});


describe("morphology factors", () => {
  const arm = BODY_PART_DEFINITIONS.arm;
  const head = BODY_PART_DEFINITIONS.head;

  it("distributes Bulk by per-part sensitivity", () => {
    const broad: BodyMorphology = { ...NEUTRAL_MORPHOLOGY, bulk: 1.5 };

    // Arm bulkSize 1.00 takes the whole deviation; Head's 0.15 takes a sliver.
    expect(resolveEffectiveBulk(broad, arm.sensitivity)).toBeCloseTo(1.5, 10);
    expect(resolveEffectiveBulk(broad, head.sensitivity)).toBeCloseTo(1.075, 10);
  });

  it("distributes Adiposity size separately from Bulk", () => {
    const soft: BodyMorphology = { ...NEUTRAL_MORPHOLOGY, adiposity: 2 };

    expect(resolveAdipositySizeFactor(soft, arm.sensitivity)).toBeCloseTo(1.12, 10);
  });

  /*
   * Muscularity and adiposity ADD into mass composition rather than
   * multiplying. They are two components of one body, not two independent
   * causes, and multiplying them would let a muscular-and-soft body reach a
   * density nothing has.
   */
  it("adds the two mass-composition contributions rather than multiplying them", () => {
    const both: BodyMorphology = {
      ...NEUTRAL_MORPHOLOGY,
      muscularity: 2,
      adiposity: 2,
    };

    expect(resolveMassCompositionFactor(both, arm.sensitivity)).toBeCloseTo(
      1 + 0.45 + 0.06,
      10,
    );
  });

  /*
   * The distinction a single "build" score cannot express: muscle is denser
   * than what it replaces, so it makes a body heavier without making it
   * larger.
   */
  it("lets Muscularity reach Mass but never Size", () => {
    const muscular: BodyMorphology = { ...NEUTRAL_MORPHOLOGY, muscularity: 2 };

    const neutral = resolvePartMeasurements(
      "arm-1",
      arm.reference,
      arm.sensitivity,
      NEUTRAL_MORPHOLOGY,
      1,
    );

    const built = resolvePartMeasurements(
      "arm-1",
      arm.reference,
      arm.sensitivity,
      muscular,
      1,
    );

    expect(built.sizeL).toBeCloseTo(neutral.sizeL, 10);
    expect(built.massKg).toBeGreaterThan(neutral.massKg);
    expect(built.massKg).toBeCloseTo(neutral.massKg * 1.45, 10);
  });

  it("treats a part with no morphology entry as neutral rather than failing", () => {
    const resolved = resolveBodyMeasurements(
      STANDARD_HUMANOID_ANATOMY,
      DEFINITIONS,
      {},
      1,
    );

    expect(resolved.totalMassKg).toBeCloseTo(62, 10);
  });
});


describe("Height as a signed vertical span", () => {
  /*
   * The failure this whole model exists to prevent. Foot-1 -> Leg-1 -> Lower
   * Body -> Leg-2 -> Foot-2 is a legal simple path measuring 7 + 81 + 0 + 81 +
   * 7 = 176 cm, and an unsigned longest-path resolver picks it over the
   * correct 165. With signs, crossing the pelvis into the second Leg returns
   * to the coordinate the first Leg already reached.
   */
  it("does not produce the false 176 cm two-Leg path", () => {
    const resolved = measure(STANDARD_HUMANOID_ANATOMY);

    expect(resolved.heightCm).toBeCloseTo(165, 10);
    expect(resolved.heightCm).not.toBeCloseTo(176, 1);
  });

  /*
   * Same body, authored inside out: rooted at a Foot, with every parent/child
   * relationship along the vertical chain reversed. Because each connection
   * records coordinates on both parts, the constraint solves in either
   * direction and the answer cannot depend on which part someone happened to
   * type first.
   */
  it("measures the same body identically when the tree is re-rooted at a Foot", () => {
    const inverted: readonly BodyPartCreationSpec[] = [
      { id: "foot-1", type: "foot", attachment: null },
      {
        id: "leg-1",
        type: "leg",
        attachment: { parentId: "foot-1", parentPosition: 0, childPosition: 1 },
      },
      {
        id: "lower-body-1",
        type: "lower-body",
        attachment: { parentId: "leg-1", parentPosition: 0, childPosition: 0 },
      },
      {
        id: "leg-2",
        type: "leg",
        attachment: {
          parentId: "lower-body-1",
          parentPosition: 0,
          childPosition: 0,
        },
      },
      {
        id: "foot-2",
        type: "foot",
        attachment: { parentId: "leg-2", parentPosition: 1, childPosition: 0 },
      },
      {
        id: "upper-body-1",
        type: "upper-body",
        attachment: {
          parentId: "lower-body-1",
          parentPosition: 1,
          childPosition: 0,
        },
      },
      {
        id: "neck-1",
        type: "neck",
        attachment: {
          parentId: "upper-body-1",
          parentPosition: 1,
          childPosition: 0,
        },
      },
      {
        id: "head-1",
        type: "head",
        attachment: { parentId: "neck-1", parentPosition: 1, childPosition: 0 },
      },
      {
        id: "arm-1",
        type: "arm",
        attachment: {
          parentId: "upper-body-1",
          parentPosition: 1,
          childPosition: 0,
        },
      },
      {
        id: "hand-1",
        type: "hand",
        attachment: { parentId: "arm-1", parentPosition: 1, childPosition: 0 },
      },
      {
        id: "arm-2",
        type: "arm",
        attachment: {
          parentId: "upper-body-1",
          parentPosition: 1,
          childPosition: 0,
        },
      },
      {
        id: "hand-2",
        type: "hand",
        attachment: { parentId: "arm-2", parentPosition: 1, childPosition: 0 },
      },
    ];

    const anatomy = createAnatomy(inverted);

    expect(measure(anatomy).heightCm).toBeCloseTo(165, 10);
  });

  /*
   * A Foot is 25 cm long and 7 cm tall. Height reads a fraction of Length
   * through heightContribution rather than a separate authored height, which
   * is what keeps a Giant's feet growing with the rest of it.
   */
  it("counts only the vertical fraction of a Foot's Length", () => {
    const withoutFeet = createAnatomy(
      STANDARD_HUMANOID_BODY_PART_SPECS.filter(
        (spec) => spec.type !== "foot",
      ) as readonly BodyPartCreationSpec[],
    );

    expect(measure(withoutFeet).heightCm).toBeCloseTo(158, 10);
  });

  it("excludes Arms and Hands from standing Height", () => {
    const withoutArms = createAnatomy(
      STANDARD_HUMANOID_BODY_PART_SPECS.filter(
        (spec) => spec.type !== "arm" && spec.type !== "hand",
      ) as readonly BodyPartCreationSpec[],
    );

    expect(measure(withoutArms).heightCm).toBeCloseTo(165, 10);
  });

  /*
   * Height tracks resolved Length, not reference Length, so a character with
   * long legs is taller without anyone authoring a height.
   */
  it("responds to per-part length morphology", () => {
    const morphology = neutralMorphology(STANDARD_HUMANOID_ANATOMY);

    const longLegs = {
      ...morphology,
      "leg-1": { ...NEUTRAL_MORPHOLOGY, length: 1.1 },
      "leg-2": { ...NEUTRAL_MORPHOLOGY, length: 1.1 },
    };

    expect(
      measure(STANDARD_HUMANOID_ANATOMY, 1, longLegs).heightCm,
    ).toBeCloseTo(165 + 8.1, 10);
  });

  it("returns 0 for a body with no anatomy left", () => {
    expect(resolveHeightCm({ parts: [] }, DEFINITIONS, {})).toBe(0);
  });
});


describe("physical presence state", () => {
  /*
   * Amputation removes a part from the body outright, so its Size and Mass go
   * with it. Height does not move: Arms never contributed any.
   */
  it("drops amputated anatomy from Size and Mass but not from Height", () => {
    let anatomy = STANDARD_HUMANOID_ANATOMY;

    for (const id of ["arm-1", "hand-1", "arm-2", "hand-2"]) {
      anatomy = setBodyPartState(anatomy, id, "archived-removed");
    }

    const resolved = measure(anatomy);

    expect(resolved.parts).toHaveLength(8);
    expect(resolved.totalMassKg).toBeCloseTo(62 - (2 * (2.56 + 0.36)), 10);
    expect(resolved.heightCm).toBeCloseTo(165, 10);
  });

  it("treats suppressed anatomy exactly as absent", () => {
    const suppressed = setBodyPartState(
      STANDARD_HUMANOID_ANATOMY,
      "hand-1",
      "suppressed",
    );

    const removed = setBodyPartState(
      STANDARD_HUMANOID_ANATOMY,
      "hand-1",
      "archived-removed",
    );

    expect(measure(suppressed).totalMassKg).toBeCloseTo(
      measure(removed).totalMassKg,
      10,
    );
  });

  /*
   * Damage is a separate axis entirely. A limb that is badly hurt is still
   * attached, and still weighs what it weighs.
   */
  it("keeps damaged but active anatomy contributing in full", () => {
    const hurt: Anatomy = {
      parts: STANDARD_HUMANOID_ANATOMY.parts.map((part) =>
        part.id === "leg-1" ? { ...part, damage: 12 } : part,
      ),
    };

    expect(measure(hurt).totalMassKg).toBeCloseTo(62, 10);
  });

  /*
   * Removing the Neck disconnects the Head from everything else, leaving two
   * independent vertical structures. The greatest span wins: the 137 cm from
   * the soles to the top of the chest, not the 22 cm Head.
   */
  it("measures disconnected components independently and takes the greatest", () => {
    const decapitated = setBodyPartState(
      STANDARD_HUMANOID_ANATOMY,
      "neck-1",
      "archived-removed",
    );

    expect(measure(decapitated).heightCm).toBeCloseTo(137, 10);
  });
});


describe("measurement preconditions", () => {
  it("accepts the standard humanoid", () => {
    expect(
      validateMeasurementInputs(STANDARD_HUMANOID_ANATOMY, DEFINITIONS, 1),
    ).toEqual({ valid: true, issues: [] });
  });

  it("rejects a Scale that collapses or inverts the body", () => {
    for (const scale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = validateMeasurementInputs(
        STANDARD_HUMANOID_ANATOMY,
        DEFINITIONS,
        scale,
      );

      expect(result.valid).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toContain(
        "invalid-effective-scale",
      );
    }
  });

  it("rejects anatomy whose type has no definition", () => {
    const anatomy = createAnatomy([
      { id: "wing-1", type: "wing", attachment: null },
    ] as readonly BodyPartCreationSpec[]);

    const result = validateMeasurementInputs(anatomy, DEFINITIONS, 1);

    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("unknown-body-part-type");
  });

  /*
   * A cycle has no unique vertical solution — two paths to the same part are
   * two independent assertions about one coordinate. anatomy/validation.ts
   * already rejects this, but Height's correctness rests on it, and an
   * invariant nothing checks is one that quietly stops holding.
   */
  it("reports a Height-relevant cycle", () => {
    const cyclic: Anatomy = {
      parts: [
        {
          id: "a",
          type: "leg",
          attachment: { parentId: "b", parentPosition: 1, childPosition: 0 },
          state: "active",
          integrity: 1,
        },
        {
          id: "b",
          type: "leg",
          attachment: { parentId: "a", parentPosition: 1, childPosition: 0 },
          state: "active",
          integrity: 1,
        },
      ],
    };

    const issues = findHeightRelevantCycleIssues(cyclic);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("height-relevant-cycle");
  });

  it("does not mistake a body with several roots for a cycle", () => {
    const forest = setBodyPartState(
      STANDARD_HUMANOID_ANATOMY,
      "neck-1",
      "archived-removed",
    );

    expect(findHeightRelevantCycleIssues(forest)).toEqual([]);
  });
});


describe("the Human age curve, resolved end to end", () => {
  /*
   * The documented table in human-age-profile.ts, regenerated. These are not
   * authored numbers: they are what the curve and the Basic Human Standard
   * produce together, and the twenty-year-old row landing exactly on the
   * reference body is what makes the rest of the column trustworthy.
   *
   * The twelve-year-old is at Scale 0.89 — 147 cm rather than the 140 cm an
   * earlier 0.85 anchor gave. That anchor forced Bulk to rise from 1.10 at six
   * to 1.13 to reach a believable mass, making a twelve-year-old stockier than
   * a six-year-old.
   */
  it.each([
    [0, 49.5, 1.76],
    [2, 85.8, 8.86],
    [6, 115.5, 20.13],
    [12, 146.85, 41.62],
    [16, 160.05, 56.37],
    [20, 165, 62],
    [40, 165, 62.68],
    [60, 163.35, 59.36],
    [80, 160.05, 51.61],
  ])(
    "resolves a %i-year-old Human to %f cm and %f kg",
    (age, expectedCm, expectedKg) => {
      const resolved = resolveAge(HUMAN_AGE_PROFILE, age);

      const morphology = resolveMorphology(
        {
          species: NEUTRAL_SOURCE,
          age: {
            global: resolved.globalMorphology,
            local: resolved.localMorphology,
          },
          character: NEUTRAL_SOURCE,
          strengthDevelopmentMuscularity: 1,
          effectLayers: [],
        },
        STANDARD_HUMANOID_ANATOMY.parts.map((part) => part.id),
      );

      const measurements = measure(
        STANDARD_HUMANOID_ANATOMY,
        resolved.scale,
        morphology,
      );

      expect(measurements.heightCm).toBeCloseTo(expectedCm, 2);
      expect(measurements.totalMassKg).toBeCloseTo(expectedKg, 2);
    },
  );

  it("puts the mature Human exactly on the reference body", () => {
    const resolved = resolveAge(HUMAN_AGE_PROFILE, 20);

    expect(resolved.scale).toBe(1);
    expect(resolved.globalMorphology).toEqual(NEUTRAL_MORPHOLOGY);
  });
});
