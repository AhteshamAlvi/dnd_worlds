/*
 * Morphology layering — the add-within, multiply-between rule.
 *
 * Distinct from body-morphology.test.ts, which covers the superseded
 * pre-refactor morphology still driving Body Points.
 */

import { describe, expect, it } from "vitest";

import { BODY_PART_DEFINITIONS } from "../character/foundation/body/anatomy/body-parts";
import {
  combineWithinLayer,
  multiplyLayers,
  resolvePartMorphology,
} from "../character/foundation/body/morphology/resolution";
import {
  findMorphologyValueIssues,
  findSensitivityIssues,
} from "../character/foundation/body/morphology/validation";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import type { BodyPartDefinition } from "../character/foundation/body/anatomy/types";
import type {
  MorphologyResolutionInput,
  MorphologySource,
} from "../character/foundation/body/morphology/types";

const NEUTRAL_SOURCE: MorphologySource = {
  global: NEUTRAL_MORPHOLOGY,
  local: {},
};

const NEUTRAL_INPUT: MorphologyResolutionInput = {
  species: NEUTRAL_SOURCE,
  age: NEUTRAL_SOURCE,
  character: NEUTRAL_SOURCE,
  strengthDevelopmentMuscularity: 1,
  effectLayers: [],
};

function withGlobal(
  source: keyof Pick<
    MorphologyResolutionInput,
    "species" | "age" | "character"
  >,
  global: Partial<typeof NEUTRAL_MORPHOLOGY>,
): MorphologyResolutionInput {
  return {
    ...NEUTRAL_INPUT,
    [source]: {
      global: { ...NEUTRAL_MORPHOLOGY, ...global },
      local: {},
    },
  };
}


describe("combining within one layer", () => {
  /*
   * The rule that is easiest to get wrong. +20% and +10% in the same layer is
   * 1.30, not 1.32 — stacked bonuses of a kind stay linear so a long list of
   * small modifiers cannot compound into something nobody predicted.
   */
  it("adds deviations rather than multiplying them", () => {
    const combined = combineWithinLayer([{ bulk: 1.2 }, { bulk: 1.1 }]);

    expect(combined.bulk).toBeCloseTo(1.3, 10);
  });

  it("lets penalties and bonuses cancel", () => {
    expect(
      combineWithinLayer([{ bulk: 1.25 }, { bulk: 0.75 }]).bulk,
    ).toBeCloseTo(1, 10);
  });

  it("leaves unmentioned dimensions neutral", () => {
    const combined = combineWithinLayer([{ bulk: 1.5 }]);

    expect(combined.length).toBeCloseTo(1, 10);
    expect(combined.muscularity).toBeCloseTo(1, 10);
    expect(combined.adiposity).toBeCloseTo(1, 10);
  });

  it("is neutral when there is nothing to combine", () => {
    expect(combineWithinLayer([])).toEqual(NEUTRAL_MORPHOLOGY);
  });
});


describe("combining across layers", () => {
  /*
   * Independent causes compose. A Species 20% broader than the Human
   * reference and an individual 10% broader than their own kind are making two
   * separate claims, and the body is 1.32 times broader.
   */
  it("multiplies layers rather than adding them", () => {
    const product = multiplyLayers([
      { ...NEUTRAL_MORPHOLOGY, bulk: 1.2 },
      { ...NEUTRAL_MORPHOLOGY, bulk: 1.1 },
    ]);

    expect(product.bulk).toBeCloseTo(1.32, 10);
  });

  it("differs from within-layer combination by exactly the cross term", () => {
    const within = combineWithinLayer([{ bulk: 1.2 }, { bulk: 1.1 }]).bulk;
    const across = multiplyLayers([
      { ...NEUTRAL_MORPHOLOGY, bulk: 1.2 },
      { ...NEUTRAL_MORPHOLOGY, bulk: 1.1 },
    ]).bulk;

    expect(across - within).toBeCloseTo(0.02, 10);
  });
});


describe("resolving a BodyPart through the full stack", () => {
  it("leaves a neutral body neutral", () => {
    expect(resolvePartMorphology(NEUTRAL_INPUT, "arm-1")).toEqual(
      NEUTRAL_MORPHOLOGY,
    );
  });

  it("multiplies Species, Age and Character contributions", () => {
    const input: MorphologyResolutionInput = {
      ...NEUTRAL_INPUT,
      species: { global: { ...NEUTRAL_MORPHOLOGY, bulk: 1.2 }, local: {} },
      age: { global: { ...NEUTRAL_MORPHOLOGY, bulk: 1.1 }, local: {} },
      character: { global: { ...NEUTRAL_MORPHOLOGY, bulk: 1.5 }, local: {} },
    };

    expect(resolvePartMorphology(input, "arm-1").bulk).toBeCloseTo(1.98, 10);
  });

  /*
   * Local values layer over global ones within the same source rather than
   * replacing them, so a Species can be broadly heavy-set and separately
   * long-armed without the second statement erasing the first.
   */
  it("layers a source's local values over its own global values", () => {
    const input: MorphologyResolutionInput = {
      ...NEUTRAL_INPUT,
      species: {
        global: { ...NEUTRAL_MORPHOLOGY, bulk: 1.3 },
        local: { "arm-1": { length: 1.4 } },
      },
    };

    const arm = resolvePartMorphology(input, "arm-1");
    const leg = resolvePartMorphology(input, "leg-1");

    expect(arm.bulk).toBeCloseTo(1.3, 10);
    expect(arm.length).toBeCloseTo(1.4, 10);
    expect(leg.length).toBeCloseTo(1, 10);
    expect(leg.bulk).toBeCloseTo(1.3, 10);
  });

  /*
   * Strength development is its own layer so that innate build and bought
   * development stay separately inspectable, and so it is multiplied in
   * exactly once. A second path would double-count every point ever spent.
   */
  it("multiplies Strength development into muscularity alone", () => {
    const input: MorphologyResolutionInput = {
      ...withGlobal("character", { muscularity: 1.2 }),
      strengthDevelopmentMuscularity: 1.5747,
    };

    const resolved = resolvePartMorphology(input, "arm-1");

    expect(resolved.muscularity).toBeCloseTo(1.88964, 10);
    expect(resolved.bulk).toBeCloseTo(1, 10);
    expect(resolved.length).toBeCloseTo(1, 10);
    expect(resolved.adiposity).toBeCloseTo(1, 10);
  });

  it("multiplies effect layers in alongside the rest", () => {
    const input: MorphologyResolutionInput = {
      ...NEUTRAL_INPUT,
      effectLayers: [
        { global: { ...NEUTRAL_MORPHOLOGY, muscularity: 1.25 }, local: {} },
        { global: { ...NEUTRAL_MORPHOLOGY, muscularity: 1.2 }, local: {} },
      ],
    };

    expect(
      resolvePartMorphology(input, "arm-1").muscularity,
    ).toBeCloseTo(1.5, 10);
  });
});


describe("morphology validation", () => {
  it("accepts ordinary positive multipliers", () => {
    expect(findMorphologyValueIssues({ bulk: 0.5, muscularity: 3 })).toEqual([]);
  });

  it("rejects zero, negative and non-finite values", () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(findMorphologyValueIssues({ bulk: value })).toHaveLength(1);
    }
  });
});


describe("sensitivity validation", () => {
  const ALL = Object.values(BODY_PART_DEFINITIONS) as readonly BodyPartDefinition[];

  it("accepts every authored Human BodyPart", () => {
    for (const definition of ALL) {
      expect(findSensitivityIssues(definition)).toEqual([]);
    }
  });

  /*
   * The bound that matters. At sensitivity 1.5 a Muscularity of 0.3 — an
   * ordinary point on an age curve — gives a structural factor of -0.05, and
   * the part acquires negative Structural Capacity, Body Points and Strength
   * Points.
   */
  it("rejects a Muscularity structural sensitivity above 1", () => {
    const arm = BODY_PART_DEFINITIONS.arm;

    const issues = findSensitivityIssues({
      ...arm,
      sensitivity: { ...arm.sensitivity, muscularityStructural: 1.5 },
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      "muscularity-structural-sensitivity-out-of-range",
    ]);
  });

  it("accepts exactly 1, where Human Arms and Legs already sit", () => {
    expect(BODY_PART_DEFINITIONS.arm.sensitivity.muscularityStructural).toBe(1);
    expect(BODY_PART_DEFINITIONS.leg.sensitivity.muscularityStructural).toBe(1);
  });

  it("rejects a negative force sensitivity but allows a large one", () => {
    const arm = BODY_PART_DEFINITIONS.arm;

    expect(
      findSensitivityIssues({
        ...arm,
        sensitivity: { ...arm.sensitivity, muscularityForce: -0.1 },
      }).map((issue) => issue.code),
    ).toEqual(["negative-force-sensitivity"]);

    expect(
      findSensitivityIssues({
        ...arm,
        sensitivity: { ...arm.sensitivity, muscularityForce: 4 },
      }),
    ).toEqual([]);
  });
});
