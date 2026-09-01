/*
 * Morphology layering — the add-within, multiply-between rule.
 *
 * Distinct from body-morphology.test.ts, which covers the superseded
 * pre-refactor morphology still driving Body Points.
 */

import { describe, expect, it } from "vitest";

import { BODY_PART_DEFINITIONS } from "../character/foundation/body/anatomy/body-parts";
import {
  destroyContinuity,
  regenerateContinuity,
} from "../character/foundation/body/continuity";
import type { ContinuityStates } from "../character/foundation/body/continuity";
import { STANDARD_HUMANOID_FORM } from "../character/foundation/body/anatomy/reference-forms";
import {
  STANDARD_HUMANOID_BODY_PART_SPECS,
  STANDARD_HUMANOID_FORM_ID,
} from "../character/foundation/body/anatomy/standard-humanoid";
import { resolveBody } from "../character/foundation/body/resolution";
import { SPECIAL_POINT_DEFINITIONS } from "../character/foundation/body/critical-points/special-points";
import type { BodyPartCreationSpec } from "../character/foundation/body/anatomy/creation";
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
import {
  anatomySlotKey,
  continuityKey,
} from "../character/foundation/body/anatomy/types";
import type { BodyPartDefinition } from "../character/foundation/body/anatomy/types";
import type {
  MorphologyResolutionInput,
  MorphologySource,
} from "../character/foundation/body/morphology/types";

/*
 * Slot keys are built with the constructor, never written by hand.
 *
 * They are form-scoped ("standard-humanoid:arm-1"), and the branding on
 * AnatomySlotKey exists so a raw BodyPart instance id cannot be handed to a
 * slot-keyed map by accident — which is exactly how Body.localMorphology spent
 * this refactor silently inert.
 */
const TEST_FORM = "test-form";

const slot = (slotId: string) => anatomySlotKey(TEST_FORM, slotId);

const NEUTRAL_SOURCE: MorphologySource = {
  global: NEUTRAL_MORPHOLOGY,
  local: {},
};

const NEUTRAL_INPUT: MorphologyResolutionInput = {
  species: NEUTRAL_SOURCE,
  age: NEUTRAL_SOURCE,
  character: NEUTRAL_SOURCE,
  individual: {},
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
    expect(resolvePartMorphology(NEUTRAL_INPUT, slot("arm-1"), continuityKey("arm-1"))).toEqual(
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

    expect(resolvePartMorphology(input, slot("arm-1"), continuityKey("arm-1")).bulk).toBeCloseTo(1.98, 10);
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
        local: { [slot("arm-1")]: { length: 1.4 } },
      },
    };

    const arm = resolvePartMorphology(input, slot("arm-1"), continuityKey("arm-1"));
    const leg = resolvePartMorphology(input, slot("leg-1"), continuityKey("leg-1"));

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

    const resolved = resolvePartMorphology(input, slot("arm-1"), continuityKey("arm-1"));

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
      resolvePartMorphology(input, slot("arm-1"), continuityKey("arm-1")).muscularity,
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


/*
 * What a regenerated limb comes back as.
 *
 * Two things have to be true at once, and they pull in opposite directions:
 *
 *   the limb keeps its own INDIVIDUAL morphology  — it is still this
 *   character's unusually long right arm, not a species-default one
 *
 *   the limb reflects CURRENT GLOBAL development  — including Strength bought
 *   while it was missing
 *
 * Both fall out of where each value lives. Individual morphology is keyed by
 * anatomical POSITION, which outlives the tissue occupying it, so the new
 * instance inherits it by standing in the same slot. Global development lives
 * on the body as a whole and is multiplied in as its own layer, so it reaches
 * whatever anatomy is present at the time.
 *
 * Regeneration therefore reconstructs an anatomical position from the
 * character's current state. It does not restore a snapshot of what that limb
 * was like on the day it was lost.
 */
describe("a regenerated limb", () => {
  const DEFINITION_LIST = Object.values(
    BODY_PART_DEFINITIONS,
  ) as readonly BodyPartDefinition[];

  const SPECIAL_POINTS = Object.values(SPECIAL_POINT_DEFINITIONS);

  const RIGHT_ARM = continuityKey("upper-limb:right");

  /*
   * This character's right arm is 20% longer than an ordinary one, recorded
   * against the IDENTITY rather than against a slot or an instance. That is
   * what makes it survive both regeneration and a change of form.
   */
  const LONG_RIGHT_ARM: ContinuityStates = {
    [RIGHT_ARM]: { morphology: { length: 1.2 } },
  };

  function resolve(
    continuity: ContinuityStates,
    strengthDevelopmentMuscularity: number,
    instanceIdFor?: (part: { readonly slotId: string }) => string,
  ) {
    const result = resolveBody({
      referenceForm: STANDARD_HUMANOID_FORM,
      continuity,
      definitions: DEFINITION_LIST,
      specialPointDefinitions: SPECIAL_POINTS,
      ...(instanceIdFor !== undefined ? { instanceIdFor } : {}),

      morphology: {
        species: NEUTRAL_SOURCE,
        age: NEUTRAL_SOURCE,
        character: NEUTRAL_SOURCE,
        individual: {},
        strengthDevelopmentMuscularity,
        effectLayers: [],
      },

      speciesStandardScale: 1,
      ageScale: 1,
      characterScale: 1,
      constitution: 10,
    });

    if (!result.success) throw new Error("expected the body to resolve");

    return result.payload;
  }

  /* Regeneration produces a NEW instance in the same anatomical position. */
  const regrown = (part: { readonly slotId: string }) =>
    part.slotId === "arm-2" ? "regrown-arm-2" : part.slotId;

  const lengthOf = (
    body: ReturnType<typeof resolve>,
    partId: string,
  ): number | undefined =>
    body.measurements.present.parts.find((part) => part.partId === partId)
      ?.lengthCm;

  it("keeps the individual morphology of the identity it grew back into", () => {
    const original = resolve(LONG_RIGHT_ARM, 1);
    const regenerated = resolve(LONG_RIGHT_ARM, 1, regrown);

    /* 55 cm reference length, 20% longer. */
    expect(lengthOf(original, "arm-2")).toBeCloseTo(66, 6);
    expect(lengthOf(regenerated, "regrown-arm-2")).toBeCloseTo(66, 6);

    /*
     * The instance id genuinely changed, so this is the identity carrying the
     * morphology and not the slot happening to be named the same thing.
     */
    expect(lengthOf(regenerated, "arm-2")).toBeUndefined();

    /* And the other arm is untouched. */
    expect(lengthOf(regenerated, "arm-1")).toBeCloseTo(55, 6);
  });

  it("reflects Strength development bought while it was missing", () => {
    const before = resolve(LONG_RIGHT_ARM, 1);
    const after = resolve(LONG_RIGHT_ARM, 1.5747, regrown);

    const muscularityOf = (
      body: ReturnType<typeof resolve>,
      partId: string,
    ) => body.morphologyByPartId[partId]?.muscularity;

    expect(muscularityOf(before, "arm-2")).toBeCloseTo(1, 10);

    /*
     * The limb was absent while this was bought and still carries it. Global
     * development belongs to the body, not to the instances that happened to
     * exist when it was acquired — which is why it is stored once on Body and
     * never written onto a BodyPart or a continuity record.
     */
    expect(muscularityOf(after, "regrown-arm-2")).toBeCloseTo(1.5747, 10);

    /* Both facts hold at once: current development AND its own length. */
    expect(lengthOf(after, "regrown-arm-2")).toBeCloseTo(66, 6);
  });

  it("comes back from destruction rather than being recreated neutral", () => {
    const destroyed = destroyContinuity(LONG_RIGHT_ARM, RIGHT_ARM);

    const missing = resolve(destroyed, 1.5747);

    /* Destroyed anatomy is instantiated as archived, and takes its hand. */
    expect(
      missing.anatomy.parts.find((part) => part.id === "arm-2")?.state,
    ).toBe("archived-removed");
    expect(
      missing.anatomy.parts.find((part) => part.id === "hand-2")?.state,
    ).toBe("archived-removed");
    expect(lengthOf(missing, "arm-2")).toBeUndefined();

    const regenerated = resolve(
      regenerateContinuity(destroyed, RIGHT_ARM),
      1.5747,
      regrown,
    );

    /*
     * Their own arm, at their current development — not a species-default one,
     * and not the arm they lost.
     */
    expect(lengthOf(regenerated, "regrown-arm-2")).toBeCloseTo(66, 6);
    expect(
      regenerated.morphologyByPartId["regrown-arm-2"]?.muscularity,
    ).toBeCloseTo(1.5747, 10);
  });

  it("resolves the whole body identically whichever instance holds the identity", () => {
    const original = resolve(LONG_RIGHT_ARM, 1.5747);
    const regenerated = resolve(LONG_RIGHT_ARM, 1.5747, regrown);

    expect(regenerated.measurements.present.totalMassKg).toBeCloseTo(
      original.measurements.present.totalMassKg,
      6,
    );
    expect(regenerated.strength.normalizedBodySP).toBeCloseTo(
      original.strength.normalizedBodySP,
      6,
    );
    expect(regenerated.measurements.present.heightCm).toBeCloseTo(
      original.measurements.present.heightCm,
      6,
    );
  });
});
