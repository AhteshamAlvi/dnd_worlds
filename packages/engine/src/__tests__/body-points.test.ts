/*
 * Body Point resolution.
 *
 * BP now consumes Structural Capacity rather than an authored Base BP column,
 * which changes what is worth testing. The old suite spent most of its length
 * on a two-stage modifier pipeline (additive before Constitution, multiplicative
 * after) that no longer exists: adding BP directly is gone, because a body that
 * is genuinely tougher should say so through Scale, Bulk or Muscularity and let
 * Structural Capacity carry the consequence into BP, Strength, Mass and Size at
 * once.
 *
 * What replaces it is the arithmetic that actually decides a number now — the
 * Constitution ladder at its new interval, the build factor, and the two floors
 * that keep small anatomy on frail characters from rounding out of existence.
 */

import { describe, expect, it } from "vitest";

import type {
  Anatomy,
  BodyPartDefinition,
} from "../character/foundation/body/anatomy/types";
import {
  ADIPOSITY_BP_CONTRIBUTION,
  BULK_BP_CONTRIBUTION,
  CONSTITUTION_DOUBLING_INTERVAL,
  displayCurrentBP,
  getConstitutionBPMultiplier,
  resolveBodyPoints,
  resolveBuildFactor,
  roundMaximumBP,
} from "../character/foundation/body/body-points/resolution";
import { combineBodyPointModifiers } from "../character/foundation/body/body-points/modifiers";
import type { BodyPointModifier } from "../character/foundation/body/body-points/types";
import {
  validateBodyPointModifier,
  validateBodyPointResolution,
} from "../character/foundation/body/body-points/validation";
import {
  morphologyTargetsForAnatomy,
  resolveMorphology,
} from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import type { BodyMorphology } from "../character/foundation/body/types";
import { TEST_PART_PHYSICALS } from "./fixtures/body";

const NEUTRAL_SOURCE = { global: NEUTRAL_MORPHOLOGY, local: {} };

/*
 * Reference Structural Capacity 20 with every sensitivity at zero, so that
 * Maximum BP is 20 at CON 10 and morphology cannot perturb it. Tests that want
 * morphology to matter author their own sensitivities.
 */
const DEFINITIONS: readonly BodyPartDefinition[] = [
  {
    id: "torso",
    name: "Torso",
    description: "Test torso.",
    tags: ["core"],
    ...TEST_PART_PHYSICALS,
    reference: { ...TEST_PART_PHYSICALS.reference, structuralCapacity: 20 },
  },
];

function anatomy(integrity = 1): Anatomy {
  return {
    parts: [
      { id: "torso-1", type: "torso", attachment: null, referenceFormId: "default", referenceSlotId: "torso-1", state: "active", integrity },
    ],
  };
}

function morphologyFor(
  target: Anatomy,
  character: Partial<BodyMorphology> = {},
) {
  return resolveMorphology(
    {
      species: NEUTRAL_SOURCE,
      age: NEUTRAL_SOURCE,
      character: {
        global: { ...NEUTRAL_MORPHOLOGY, ...character },
        local: {},
      },
      strengthDevelopmentMuscularity: 1,
      effectLayers: [],
    },
    morphologyTargetsForAnatomy(target),
  );
}

function resolve(
  options: {
    readonly integrity?: number;
    readonly constitution?: number;
    readonly effectiveScale?: number;
    readonly character?: Partial<BodyMorphology>;
    readonly definitions?: readonly BodyPartDefinition[];
    readonly modifiers?: readonly BodyPointModifier[];
  } = {},
) {
  const target = anatomy(options.integrity ?? 1);

  return resolveBodyPoints({
    anatomy: target,
    definitions: options.definitions ?? DEFINITIONS,
    morphologyByPartId: morphologyFor(target, options.character),
    effectiveScale: options.effectiveScale ?? 1,
    constitution: options.constitution ?? 10,
    ...(options.modifiers !== undefined ? { modifiers: options.modifiers } : {}),
  });
}

const torso = (result: ReturnType<typeof resolve>) => {
  const part = result.byPartId["torso-1"];

  if (part === undefined) throw new Error("torso-1 did not resolve.");

  return part;
};


describe("the Constitution ladder", () => {
  /*
   * The interval moved from 5 to 2 in this phase, and the reason is a
   * comparison rather than a preference: buying +1 STR solves for a
   * Muscularity that raises whole-body Structural Capacity from 100 to 143.85,
   * a x1.438 durability gain that comes free with a Strength purchase. At an
   * interval of 2, +1 CON is x1.414, so the two points buy about the same
   * toughness. At the old interval of 5 it was x1.149, and one Strength point
   * was worth roughly two and a half Constitution points of durability.
   */
  it("doubles every two points of Constitution", () => {
    expect(CONSTITUTION_DOUBLING_INTERVAL).toBe(2);

    expect(getConstitutionBPMultiplier(10)).toBeCloseTo(1, 10);
    expect(getConstitutionBPMultiplier(12)).toBeCloseTo(2, 10);
    expect(getConstitutionBPMultiplier(8)).toBeCloseTo(0.5, 10);
    expect(getConstitutionBPMultiplier(20)).toBeCloseTo(32, 10);
    expect(getConstitutionBPMultiplier(30)).toBeCloseTo(1024, 10);
  });

  it("buys a point of Constitution at roughly the rate a point of Strength does", () => {
    const perConstitutionPoint = getConstitutionBPMultiplier(11);
    const perStrengthPoint = 143.85 / 100;

    expect(perConstitutionPoint).toBeCloseTo(1.414, 3);
    expect(Math.abs(perConstitutionPoint - perStrengthPoint)).toBeLessThan(0.03);
  });

  it("scales Maximum BP by exactly that multiplier", () => {
    expect(torso(resolve({ constitution: 10 })).maximumBP).toBe(20);
    expect(torso(resolve({ constitution: 12 })).maximumBP).toBe(40);
    expect(torso(resolve({ constitution: 8 })).maximumBP).toBe(10);
  });
});


describe("Maximum BP comes from Structural Capacity", () => {
  it("equals reference SC at neutral morphology, Scale 1 and CON 10", () => {
    const resolved = torso(resolve());

    expect(resolved.structuralCapacity).toBe(20);
    expect(resolved.buildFactor).toBe(1);
    expect(resolved.constitutionMultiplier).toBe(1);
    expect(resolved.maximumBP).toBe(20);
  });

  /*
   * Scale reaches BP squared rather than cubed, because it reaches BP through
   * Structural Capacity and cross-section is what resists destruction. A Giant
   * ten times a Human's size has a hundred times the Body Points, not a
   * thousand.
   */
  it("follows Scale squared, through Structural Capacity", () => {
    expect(torso(resolve({ effectiveScale: 10 })).maximumBP).toBe(2000);
  });

  it("carries no Strength term at all", () => {
    /*
     * Muscularity still reaches BP — but only by raising Structural Capacity
     * first, which is the honest route. With muscularityStructural at 0 on
     * this fixture, it cannot reach BP any other way.
     */
    expect(torso(resolve({ character: { muscularity: 4 } })).maximumBP).toBe(20);
  });
});


describe("the build factor", () => {
  const SENSITIVE: readonly BodyPartDefinition[] = [
    {
      ...DEFINITIONS[0]!,
      sensitivity: {
        ...TEST_PART_PHYSICALS.sensitivity,
        bulkSize: 1,
        adipositySize: 1,
      },
    },
  ];

  /*
   * Bulk and Adiposity are halved and quartered relative to their effect on
   * Size and Mass: a thicker body is harder to destroy, but not in proportion
   * to how much larger it is.
   */
  it("halves Bulk and quarters Adiposity", () => {
    expect(BULK_BP_CONTRIBUTION).toBe(0.5);
    expect(ADIPOSITY_BP_CONTRIBUTION).toBe(0.25);

    const sensitivity = SENSITIVE[0]!.sensitivity;

    expect(
      resolveBuildFactor({ ...NEUTRAL_MORPHOLOGY, bulk: 2 }, sensitivity),
    ).toBeCloseTo(1.5, 10);

    expect(
      resolveBuildFactor({ ...NEUTRAL_MORPHOLOGY, adiposity: 2 }, sensitivity),
    ).toBeCloseTo(1.25, 10);
  });

  /*
   * They ADD inside the factor rather than multiplying, so a body that is both
   * broad and heavy is not compounded twice for one physique.
   */
  it("adds Bulk and Adiposity rather than multiplying them", () => {
    const both = resolveBuildFactor(
      { ...NEUTRAL_MORPHOLOGY, bulk: 2, adiposity: 2 },
      SENSITIVE[0]!.sensitivity,
    );

    expect(both).toBeCloseTo(1.75, 10);
    expect(both).not.toBeCloseTo(1.5 * 1.25, 10);
  });

  it("reaches Maximum BP", () => {
    expect(
      torso(resolve({ definitions: SENSITIVE, character: { bulk: 2 } }))
        .maximumBP,
    ).toBe(30);
  });
});


describe("the two floors", () => {
  it("rounds Maximum BP exactly once, at the very end", () => {
    /*
     * SC 20 x CON 9's 0.7071 is 14.142, which rounds to 14. Rounding any
     * earlier — the multiplier to 0.7, say — would give 14 by luck here and
     * the wrong answer elsewhere.
     */
    expect(torso(resolve({ constitution: 9 })).rawMaximumBP).toBeCloseTo(14.142, 3);
    expect(torso(resolve({ constitution: 9 })).maximumBP).toBe(14);
  });

  /*
   * The Maximum BP floor gets more load-bearing the higher the Constitution
   * interval goes, and at 2 it is genuinely holding weight. A Human Neck has
   * reference SC 2; at CON 4 the multiplier is 0.125 and raw Maximum BP is
   * 0.25, which rounds to zero. A part with zero Maximum BP is destroyed the
   * instant it is created and can never heal, because every fraction of
   * nothing is nothing.
   */
  it("floors Maximum BP at 1 for small anatomy on a frail character", () => {
    const neck: readonly BodyPartDefinition[] = [
      {
        ...DEFINITIONS[0]!,
        reference: { ...TEST_PART_PHYSICALS.reference, structuralCapacity: 2 },
      },
    ];

    const resolved = torso(resolve({ definitions: neck, constitution: 4 }));

    expect(resolved.rawMaximumBP).toBeCloseTo(0.25, 10);
    expect(resolved.maximumBP).toBe(1);
    expect(roundMaximumBP(0.25)).toBe(1);
  });

  /*
   * The Current BP floor exists for the same reason and protects the same
   * thing: 0 is reserved for destruction, which is an anatomy state
   * transition. The tiny-pool guard — Maximum BP 2 at 20% integrity — is 0.4
   * exact BP, and it displays 1 rather than rounding a still-attached part
   * out of existence.
   */
  it("floors displayed Current BP at 1 for an active part", () => {
    const neck: readonly BodyPartDefinition[] = [
      {
        ...DEFINITIONS[0]!,
        reference: { ...TEST_PART_PHYSICALS.reference, structuralCapacity: 2 },
      },
    ];

    const resolved = torso(resolve({ definitions: neck, integrity: 0.2 }));

    expect(resolved.maximumBP).toBe(2);
    expect(resolved.exactCurrentBP).toBeCloseTo(0.4, 10);
    expect(resolved.currentBP).toBe(1);
    expect(displayCurrentBP(0.4)).toBe(1);
  });
});


describe("integrity", () => {
  /*
   * The reason integrity is stored as a fraction rather than as absolute
   * damage. Maximum BP is derived, so it moves whenever Scale, Muscularity,
   * Build or CON moves — and a wound has to survive that without becoming
   * healing or harm. 7/14 growing into 14/28 is the same wound on a bigger
   * body; "7 damage" would have become 21/28, a free 7 points of health.
   */
  it("preserves a wound proportionally when Maximum BP changes", () => {
    const before = torso(resolve({ integrity: 0.5, constitution: 10 }));

    expect(before.maximumBP).toBe(20);
    expect(before.exactCurrentBP).toBe(10);

    const after = torso(resolve({ integrity: 0.5, constitution: 12 }));

    expect(after.maximumBP).toBe(40);
    expect(after.exactCurrentBP).toBe(20);
    expect(after.integrity).toBe(before.integrity);
  });

  it("leaves an undamaged part at full Current BP", () => {
    const resolved = torso(resolve());

    expect(resolved.exactCurrentBP).toBe(resolved.maximumBP);
    expect(resolved.currentBP).toBe(resolved.maximumBP);
  });

  /*
   * Departed anatomy has no Body Points at all rather than Body Points of
   * zero. Absent and destroyed are different from damaged, and the resolver
   * says so by omission — the same way measurements and Structural Capacity
   * do.
   */
  it.each(["suppressed", "archived-removed"] as const)(
    "gives %s anatomy no Body Points at all",
    (state) => {
      const resolved = resolveBodyPoints({
        anatomy: {
          parts: [
            { id: "torso-1", type: "torso", attachment: null, referenceFormId: "default", referenceSlotId: "torso-1", state, integrity: 0 },
          ],
        },
        definitions: DEFINITIONS,
        morphologyByPartId: {},
        effectiveScale: 1,
        constitution: 10,
      });

      expect(resolved.parts).toEqual([]);
      expect(resolved.byPartId["torso-1"]).toBeUndefined();
      expect(resolved.aggregateMaximumBP).toBe(0);
    },
  );
});


describe("destruction resistance modifiers", () => {
  it("multiplies Maximum BP", () => {
    const resolved = torso(
      resolve({
        modifiers: [
          {
            selector: { all: true },
            operation: { kind: "modify-destruction-resistance", multiplier: 1.5 },
          },
        ],
      }),
    );

    expect(resolved.destructionResistance).toBe(1.5);
    expect(resolved.maximumBP).toBe(30);
  });

  it("multiplies several together", () => {
    expect(
      combineBodyPointModifiers([
        {
          selector: { all: true },
          operation: { kind: "modify-destruction-resistance", multiplier: 1.5 },
        },
        {
          selector: { all: true },
          operation: { kind: "modify-destruction-resistance", multiplier: 2 },
        },
      ]).destructionResistance,
    ).toBe(3);
  });

  it("resolves to 1 with no modifiers at all", () => {
    expect(combineBodyPointModifiers([]).destructionResistance).toBe(1);
    expect(torso(resolve()).destructionResistance).toBe(1);
  });

  /*
   * Zero is rejected rather than treated as a legal extreme. It would drive
   * Maximum BP to zero, and the floor would then quietly rescue it to 1 —
   * turning an authoring error into a part that silently ignores the effect
   * placed on it.
   */
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a multiplier of %p",
    (multiplier) => {
      const modifier: BodyPointModifier = {
        selector: { all: true },
        operation: { kind: "modify-destruction-resistance", multiplier },
      };

      const result = validateBodyPointModifier(modifier);

      expect(result.valid).toBe(false);
      expect(result.issues[0]?.code).toBe("invalid-destruction-resistance");
    },
  );
});


describe("Body Point validation", () => {
  it("accepts valid resolution inputs", () => {
    expect(validateBodyPointResolution(anatomy(), 10, DEFINITIONS).valid).toBe(true);
  });

  it("rejects a non-finite Constitution", () => {
    const result = validateBodyPointResolution(anatomy(), Number.NaN, DEFINITIONS);

    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("invalid-constitution");
  });

  it("rejects an unknown BodyPartDefinition", () => {
    const result = validateBodyPointResolution(anatomy(), 10, []);

    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("unknown-body-part-definition");
  });

  it.each([0, -0.5, 1.5, Number.NaN])(
    "rejects an active part carrying integrity %p",
    (integrity) => {
      const result = validateBodyPointResolution(
        anatomy(integrity),
        10,
        DEFINITIONS,
      );

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === "invalid-integrity")).toBe(true);
    },
  );

  it("rejects a departed part still carrying integrity", () => {
    const result = validateBodyPointResolution(
      {
        parts: [
          {
            id: "torso-1",
            type: "torso",
            attachment: null,
            referenceFormId: "default",
            referenceSlotId: "torso-1",
            state: "archived-removed",
            integrity: 0.5,
          },
        ],
      },
      10,
      DEFINITIONS,
    );

    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.code === "destroyed-part-carries-integrity"),
    ).toBe(true);
  });
});
