/*
 * Tests Body Point resolution: the Constitution ladder, the single rounding
 * step with its minimum-1 floor, the locked additive-before-CON /
 * multiplier-after-CON stage ordering, damage storage and destruction, and
 * the Body Point validators.
 */

import { describe, expect, it } from "vitest";

import { createAnatomy } from "../character/foundation/body/anatomy/creation";
import type { BodyPartDefinition } from "../character/foundation/body/anatomy/types";
import {
  REFERENCE_ADIPOSITY,
  REFERENCE_HEIGHT_CM,
  REFERENCE_MASS_KG,
  REFERENCE_MUSCULARITY,
  resolveMorphology,
} from "../character/foundation/body/body-points/morphology";
import type { BodyMorphologyInput } from "../character/foundation/body/body-points/morphology";
import {
  getConstitutionBPMultiplier,
  resolveBodyPoints,
} from "../character/foundation/body/body-points/resolution";
import { combineBodyPointModifiers } from "../character/foundation/body/body-points/modifiers";
import type { BodyPointModifier } from "../character/foundation/body/body-points/types";
import {
  validateBodyPointModifier,
  validateBodyPointResolution,
} from "../character/foundation/body/body-points/validation";
import { getBodyPartDefinition } from "../character/foundation/body/anatomy/body-parts";
import { TEST_PART_PHYSICALS } from "./fixtures/body";

const NEUTRAL_SENSITIVITY = { height: 0, mass: 0, muscularity: 0, adiposity: 0 };

const DEFINITIONS: readonly BodyPartDefinition[] = [
  { id: "torso", name: "Torso", description: "Test torso.", tags: ["core"], baseBP: 10, morphologySensitivity: NEUTRAL_SENSITIVITY, ...TEST_PART_PHYSICALS },
];

const REFERENCE_INPUT: BodyMorphologyInput = {
  heightCm: REFERENCE_HEIGHT_CM,
  massKg: REFERENCE_MASS_KG,
  build: { muscularity: REFERENCE_MUSCULARITY, adiposity: REFERENCE_ADIPOSITY },
};

function singlePartAnatomy(damage = 0) {
  return {
    parts: [
      { id: "torso-1", type: "torso", attachment: null, damage, recoveryProgress: 0 },
    ],
  };
}

describe("getConstitutionBPMultiplier", () => {
  it.each([
    [5, 0.5],
    [10, 1],
    [15, 2],
    [20, 4],
    [25, 8],
    [30, 16],
    [35, 32],
  ])("CON %i -> ×%s", (con, expected) => {
    expect(getConstitutionBPMultiplier(con)).toBeCloseTo(expected, 10);
  });
});

describe("rounding and the minimum-1 floor", () => {
  it("rounds exactly once, at the very end", () => {
    const anatomy = singlePartAnatomy();
    const morphology = resolveMorphology(REFERENCE_INPUT, anatomy, DEFINITIONS);

    // CON 11 -> ×2^(1/5), an irrational multiplier that only becomes a whole
    // number after the single final rounding step.
    const bodyPoints = resolveBodyPoints(anatomy, morphology, 11, DEFINITIONS);
    const part = bodyPoints.parts[0]!;

    expect(Number.isInteger(part.rawMaximumBP)).toBe(false);
    expect(Number.isInteger(part.maximumBP)).toBe(true);
  });

  it("floors Maximum BP at 1 even for a very low CON", () => {
    const anatomy = singlePartAnatomy();
    const morphology = resolveMorphology(REFERENCE_INPUT, anatomy, DEFINITIONS);

    const bodyPoints = resolveBodyPoints(anatomy, morphology, -100, DEFINITIONS);
    expect(bodyPoints.parts[0]!.maximumBP).toBe(1);
  });
});

describe("stage ordering: additive before CON, multiplier after CON", () => {
  it("does not commute — (base + additive) × con × multiplier, not the reverse", () => {
    const anatomy = singlePartAnatomy();
    const morphology = resolveMorphology(REFERENCE_INPUT, anatomy, DEFINITIONS);

    const modifiers: readonly BodyPointModifier[] = [
      { selector: { all: true }, operation: { kind: "adjust-base-bp", amount: 6 } },
      { selector: { all: true }, operation: { kind: "multiply-bp", multiplier: 2 } },
    ];

    const con = 15; // ×2 multiplier
    const bodyPoints = resolveBodyPoints(anatomy, morphology, con, DEFINITIONS, modifiers);
    const part = bodyPoints.parts[0]!;

    // baseBP 10, morphology-adjusted stays 10 (neutral sensitivity), +6 -> 16,
    // ×2 (CON) -> 32, ×2 (true multiplier) -> 64.
    const wrongOrder = (10 * 2 + 6) * 2; // if additive were applied after CON instead
    const correctOrder = (10 + 6) * 2 * 2;

    expect(part.rawMaximumBP).toBe(correctOrder);
    expect(part.rawMaximumBP).not.toBe(wrongOrder);
    expect(part.resolvedBaseBP).toBe(16);
    expect(part.constitutionScaledBP).toBe(32);
    expect(part.rawMaximumBP).toBe(64);
  });
});

describe("damage storage and destruction", () => {
  it("Current BP = max(0, Maximum BP - damage), and damage is not clamped", () => {
    const anatomy = singlePartAnatomy(3);
    const morphology = resolveMorphology(REFERENCE_INPUT, anatomy, DEFINITIONS);
    const bodyPoints = resolveBodyPoints(anatomy, morphology, 10, DEFINITIONS);
    const part = bodyPoints.parts[0]!;

    expect(part.maximumBP).toBe(10);
    expect(part.damage).toBe(3);
    expect(part.currentBP).toBe(7);
    expect(part.destroyed).toBe(false);
  });

  it("damage exceeding Maximum BP is not clamped, but Current BP floors at 0", () => {
    const anatomy = singlePartAnatomy(999);
    const morphology = resolveMorphology(REFERENCE_INPUT, anatomy, DEFINITIONS);
    const bodyPoints = resolveBodyPoints(anatomy, morphology, 10, DEFINITIONS);
    const part = bodyPoints.parts[0]!;

    expect(part.damage).toBe(999);
    expect(part.currentBP).toBe(0);
    expect(part.destroyed).toBe(true);
  });

  it("reports destroyedPartIds and the correct aggregate total", () => {
    const anatomy = {
      parts: [
        { id: "torso-1", type: "torso", attachment: null, damage: 0, recoveryProgress: 0 },
        { id: "torso-2", type: "torso", attachment: null, damage: 999, recoveryProgress: 0 },
      ],
    };

    const morphology = resolveMorphology(REFERENCE_INPUT, anatomy, DEFINITIONS);
    const bodyPoints = resolveBodyPoints(anatomy, morphology, 10, DEFINITIONS);

    expect(bodyPoints.destroyedPartIds).toEqual(["torso-2"]);
    expect(bodyPoints.aggregateMaximumBP).toBe(20);
  });
});

describe("Body Point validators", () => {
  it("accepts valid resolution inputs", () => {
    const anatomy = singlePartAnatomy();
    const morphology = resolveMorphology(REFERENCE_INPUT, anatomy, DEFINITIONS);

    const result = validateBodyPointResolution(anatomy, morphology, 10, DEFINITIONS);
    expect(result.valid).toBe(true);
  });

  it("rejects a non-finite Constitution", () => {
    const anatomy = singlePartAnatomy();
    const morphology = resolveMorphology(REFERENCE_INPUT, anatomy, DEFINITIONS);

    const result = validateBodyPointResolution(anatomy, morphology, NaN, DEFINITIONS);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "invalid-constitution")).toBe(true);
  });

  it("rejects an invalid multiply-bp operation", () => {
    const anatomy = singlePartAnatomy();
    const morphology = resolveMorphology(REFERENCE_INPUT, anatomy, DEFINITIONS);

    const modifiers: readonly BodyPointModifier[] = [
      { selector: { all: true }, operation: { kind: "multiply-bp", multiplier: 0 } },
    ];

    const result = validateBodyPointResolution(anatomy, morphology, 10, DEFINITIONS, modifiers);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "invalid-bp-multiplier")).toBe(true);
  });

  it("detects morphology/Anatomy coverage mismatches in both directions", () => {
    const anatomy = singlePartAnatomy();
    const morphology = resolveMorphology(REFERENCE_INPUT, anatomy, DEFINITIONS);

    const extraAnatomy = {
      parts: [...anatomy.parts, { id: "torso-2", type: "torso", attachment: null, damage: 0, recoveryProgress: 0 }],
    };
    const missingResult = validateBodyPointResolution(
      extraAnatomy,
      morphology,
      10,
      DEFINITIONS,
    );
    expect(missingResult.issues.some((i) => i.code === "missing-morphology-part")).toBe(true);

    const extraMorphology = {
      ...morphology,
      parts: [
        ...morphology.parts,
        { ...morphology.parts[0]!, partId: "torso-ghost" },
      ],
    };
    const unexpectedResult = validateBodyPointResolution(
      anatomy,
      extraMorphology,
      10,
      DEFINITIONS,
    );
    expect(
      unexpectedResult.issues.some((i) => i.code === "unexpected-morphology-part"),
    ).toBe(true);
  });

  it("rejects additive modifiers that drive resolved Base BP to zero or below", () => {
    const anatomy = singlePartAnatomy();
    const morphology = resolveMorphology(REFERENCE_INPUT, anatomy, DEFINITIONS);

    const modifiers: readonly BodyPointModifier[] = [
      { selector: { all: true }, operation: { kind: "adjust-base-bp", amount: -20 } },
    ];

    const result = validateBodyPointResolution(anatomy, morphology, 10, DEFINITIONS, modifiers);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "invalid-resolved-base-bp")).toBe(true);
  });
});

describe("combining multiple BP modifiers", () => {
  it("sums multiple additive modifiers", () => {
    const result = combineBodyPointModifiers([
      { selector: { all: true }, operation: { kind: "adjust-base-bp", amount: 4 } },
      { selector: { all: true }, operation: { kind: "adjust-base-bp", amount: 2 } },
    ]);

    expect(result.additiveBaseBP).toBe(6);
    expect(result.multiplier).toBe(1);
  });

  it("multiplies multiple true multipliers together", () => {
    const result = combineBodyPointModifiers([
      { selector: { all: true }, operation: { kind: "multiply-bp", multiplier: 1.5 } },
      { selector: { all: true }, operation: { kind: "multiply-bp", multiplier: 2 } },
    ]);

    expect(result.multiplier).toBe(3);
    expect(result.additiveBaseBP).toBe(0);
  });

  it("combines additive and multiplicative stages independently", () => {
    const result = combineBodyPointModifiers([
      { selector: { all: true }, operation: { kind: "adjust-base-bp", amount: 4 } },
      { selector: { all: true }, operation: { kind: "adjust-base-bp", amount: 2 } },
      { selector: { all: true }, operation: { kind: "multiply-bp", multiplier: 1.5 } },
      { selector: { all: true }, operation: { kind: "multiply-bp", multiplier: 2 } },
    ]);

    expect(result.additiveBaseBP).toBe(6);
    expect(result.multiplier).toBe(3);
  });

  it("the worked example from the ticket: Leg Base BP 14, Training +6, Resolved Base BP 20", () => {
    const leg = getBodyPartDefinition("leg")!;
    const anatomy = { parts: [{ id: "leg-1", type: "leg", attachment: null, damage: 0, recoveryProgress: 0 }] };
    const morphology = resolveMorphology(REFERENCE_INPUT, anatomy, [leg]);

    expect(morphology.parts[0]!.morphologyAdjustedBaseBP).toBe(14);

    const modifiers: readonly BodyPointModifier[] = [
      { selector: { all: true }, operation: { kind: "adjust-base-bp", amount: 6 } },
    ];

    const bodyPoints = resolveBodyPoints(anatomy, morphology, 10, [leg], modifiers);
    expect(bodyPoints.parts[0]!.resolvedBaseBP).toBe(20);
  });
});

describe("negative additive modifiers", () => {
  it("a single negative additive modifier is individually valid", () => {
    const modifier: BodyPointModifier = {
      selector: { all: true },
      operation: { kind: "adjust-base-bp", amount: -3 },
    };

    expect(validateBodyPointModifier(modifier).valid).toBe(true);
  });

  it("reduces resolved Base BP when the result stays positive", () => {
    const anatomy = singlePartAnatomy();
    const morphology = resolveMorphology(REFERENCE_INPUT, anatomy, DEFINITIONS);

    const modifiers: readonly BodyPointModifier[] = [
      { selector: { all: true }, operation: { kind: "adjust-base-bp", amount: -3 } },
    ];

    const bodyPoints = resolveBodyPoints(anatomy, morphology, 10, DEFINITIONS, modifiers);
    expect(bodyPoints.parts[0]!.resolvedBaseBP).toBe(7);
  });
});
