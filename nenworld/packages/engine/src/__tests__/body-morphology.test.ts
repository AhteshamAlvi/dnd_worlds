/*
 * Tests morphology resolution: reference neutrality, zero-sensitivity parts
 * being unmoved by height/mass, and — the mechanism the whole model exists
 * for — that height, muscularity, adiposity, and total mass never reward the
 * same physical tissue twice. Residual mass is measured against *expected*
 * mass (from height + build), not raw actual mass, specifically so that a
 * heavier build doesn't also get credited as "unexplained" extra mass.
 */

import { describe, expect, it } from "vitest";

import {
  ADIPOSE_MASS_WEIGHT,
  MUSCULAR_MASS_WEIGHT,
  REFERENCE_ADIPOSITY,
  REFERENCE_HEIGHT_CM,
  REFERENCE_MASS_KG,
  REFERENCE_MUSCULARITY,
  STRUCTURAL_MASS_WEIGHT,
  getBuildMassFactor,
  getExpectedMassKg,
  getHeightRatio,
  getResidualMassFactor,
  getResidualMassRatio,
  resolveBodyPartMorphologyFactors,
  resolveMorphology,
  resolveMorphologyContext,
} from "../character/foundation/body/body-points/morphology";
import type { BodyMorphologyInput } from "../character/foundation/body/body-points/morphology";
import { createAnatomy } from "../character/foundation/body/anatomy/creation";
import type { BodyPartDefinition } from "../character/foundation/body/anatomy/types";

const REFERENCE_INPUT: BodyMorphologyInput = {
  heightCm: REFERENCE_HEIGHT_CM,
  massKg: REFERENCE_MASS_KG,
  build: { muscularity: REFERENCE_MUSCULARITY, adiposity: REFERENCE_ADIPOSITY },
};

const FULLY_SENSITIVE: BodyPartDefinition = {
  id: "torso",
  tags: [],
  baseBP: 10,
  morphologySensitivity: { height: 1, mass: 1, muscularity: 1, adiposity: 1 },
};

const ZERO_SENSITIVITY: BodyPartDefinition = {
  id: "head",
  tags: [],
  baseBP: 8,
  morphologySensitivity: { height: 0, mass: 0, muscularity: 1, adiposity: 1 },
};

describe("reference morphology", () => {
  it("resolves every factor to exactly 1 at reference height/mass/build", () => {
    const context = resolveMorphologyContext(REFERENCE_INPUT);
    const factors = resolveBodyPartMorphologyFactors(
      REFERENCE_INPUT,
      FULLY_SENSITIVE,
      context,
    );

    expect(factors.height).toBe(1);
    expect(factors.mass).toBe(1);
    expect(factors.muscularity).toBe(1);
    expect(factors.adiposity).toBe(1);
    expect(factors.combinedMultiplier).toBe(1);
  });

  it("getBuildMassFactor(1, 1) is exactly 1 by the calibration weights", () => {
    expect(getBuildMassFactor(REFERENCE_MUSCULARITY, REFERENCE_ADIPOSITY)).toBe(1);
    expect(STRUCTURAL_MASS_WEIGHT + MUSCULAR_MASS_WEIGHT + ADIPOSE_MASS_WEIGHT).toBe(1);
  });

  it("getHeightRatio(165) is exactly 1", () => {
    expect(getHeightRatio(REFERENCE_HEIGHT_CM)).toBe(1);
  });
});

describe("zero-sensitivity parts", () => {
  it("are unmoved by height or mass changes", () => {
    const tallerHeavier: BodyMorphologyInput = {
      heightCm: 200,
      massKg: 120,
      build: { muscularity: 1, adiposity: 1 },
    };

    const context = resolveMorphologyContext(tallerHeavier);
    const factors = resolveBodyPartMorphologyFactors(
      tallerHeavier,
      ZERO_SENSITIVITY,
      context,
    );

    expect(factors.height).toBe(1);
    expect(factors.mass).toBe(1);
  });
});

describe("no double-counting between build and residual mass", () => {
  it("mass exactly at the expected value gives a residual factor of 1, at any height/build", () => {
    const heightRatio = getHeightRatio(180);
    const buildMassFactor = getBuildMassFactor(1.4, 0.8);
    const expectedMassKg = getExpectedMassKg(heightRatio, buildMassFactor);

    const residualRatio = getResidualMassRatio(expectedMassKg, expectedMassKg);
    expect(residualRatio).toBe(1);
    expect(getResidualMassFactor(residualRatio)).toBe(1);
  });

  it("+20% mass over expected produces sqrt(1.2), not a raw 1.2", () => {
    const factor = getResidualMassFactor(1.2);
    expect(factor).toBeCloseTo(Math.sqrt(1.2), 10);
    expect(factor).not.toBeCloseTo(1.2, 2);
  });

  it("raising muscularity alone, at fixed actual mass, lowers the residual factor", () => {
    // Same character, same actual mass — but a higher stated muscularity
    // raises *expected* mass, so the same actual mass now looks less
    // "unexplained." If this weren't true, muscularity would be silently
    // rewarded twice: once directly, once via residual mass.
    const heightRatio = getHeightRatio(REFERENCE_HEIGHT_CM);
    const actualMassKg = 70;

    const lowMuscleExpected = getExpectedMassKg(heightRatio, getBuildMassFactor(1, 1));
    const highMuscleExpected = getExpectedMassKg(heightRatio, getBuildMassFactor(1.5, 1));

    const lowMuscleResidual = getResidualMassFactor(
      getResidualMassRatio(actualMassKg, lowMuscleExpected),
    );
    const highMuscleResidual = getResidualMassFactor(
      getResidualMassRatio(actualMassKg, highMuscleExpected),
    );

    expect(highMuscleResidual).toBeLessThan(lowMuscleResidual);
  });

  it("a taller character at their own expected mass gets no extra residual bonus", () => {
    const shortHeightRatio = getHeightRatio(150);
    const tallHeightRatio = getHeightRatio(210);
    const buildMassFactor = getBuildMassFactor(1, 1);

    const shortExpected = getExpectedMassKg(shortHeightRatio, buildMassFactor);
    const tallExpected = getExpectedMassKg(tallHeightRatio, buildMassFactor);

    expect(getResidualMassFactor(getResidualMassRatio(shortExpected, shortExpected))).toBe(1);
    expect(getResidualMassFactor(getResidualMassRatio(tallExpected, tallExpected))).toBe(1);
  });

  it("two characters at similar total mass but different build resolve differently", () => {
    const context1 = resolveMorphologyContext({
      heightCm: REFERENCE_HEIGHT_CM,
      massKg: 70,
      build: { muscularity: 1.5, adiposity: 0.5 },
    });

    const context2 = resolveMorphologyContext({
      heightCm: REFERENCE_HEIGHT_CM,
      massKg: 70,
      build: { muscularity: 0.5, adiposity: 1.5 },
    });

    expect(context1.residualMassFactor).not.toBeCloseTo(context2.residualMassFactor, 6);
  });
});

describe("resolveMorphology over a full Anatomy", () => {
  it("throws for a BodyPart of an unknown type", () => {
    const anatomy = createAnatomy([{ id: "ghost-1", type: "wing", attachment: null }]);

    expect(() =>
      resolveMorphology(REFERENCE_INPUT, anatomy, [FULLY_SENSITIVE]),
    ).toThrow();
  });

  it("applies no rounding at any stage", () => {
    const anatomy = createAnatomy([{ id: "torso-1", type: "torso", attachment: null }]);
    const oddInput: BodyMorphologyInput = {
      heightCm: 171,
      massKg: 68.3,
      build: { muscularity: 1.13, adiposity: 0.87 },
    };

    const result = resolveMorphology(oddInput, anatomy, [FULLY_SENSITIVE]);
    const part = result.parts[0]!;

    // A value with meaningful decimal precision surviving to the output is
    // itself the evidence that nothing rounded early.
    expect(Number.isInteger(part.morphologyAdjustedBaseBP)).toBe(false);
  });
});
