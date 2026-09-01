/*
 * Size and Mass as physical inputs to base AGI and DEX.
 *
 * The rule this suite defends: the number is a creature's actual physical
 * base, not a penalty layered on top of one. A Giant does not have AGI 10 with
 * a -4 modifier; a Giant has AGI 6.
 */

import { describe, expect, it } from "vitest";

import {
  MASS_BURDEN_SENSITIVITY,
  REFERENCE_BODY_MASS_KG,
  REFERENCE_BODY_SIZE_L,
  SIZE_BURDEN_SENSITIVITY,
  applyPhysicalScaleSteps,
  resolveLinearSizeRatio,
  resolvePhysicalScaleSteps,
  resolveRawPhysicalScaleBurden,
} from "../character/foundation/attributes/physical";

const raw = resolveRawPhysicalScaleBurden;
const steps = resolvePhysicalScaleSteps;
const agi = (stored: number, sizeL: number, massKg: number) =>
  applyPhysicalScaleSteps(stored, steps(sizeL, massKg));


describe("the reference body", () => {
  it("carries no burden at all", () => {
    expect(REFERENCE_BODY_SIZE_L).toBe(60);
    expect(REFERENCE_BODY_MASS_KG).toBe(62);

    expect(raw(60, 62)).toBe(0);
    expect(steps(60, 62)).toBe(0);
    expect(agi(10, 60, 62)).toBe(10);
  });

  /*
   * Size is a volume and volume goes as the cube of length, so it converts to
   * a linear ratio first. Comparing a volume ratio directly against a mass
   * ratio would count the same growth twice.
   */
  it("converts volume to a linear ratio", () => {
    expect(resolveLinearSizeRatio(60)).toBeCloseTo(1, 10);
    expect(resolveLinearSizeRatio(60 * 8)).toBeCloseTo(2, 10);
    expect(resolveLinearSizeRatio(60 * 1000)).toBeCloseTo(10, 10);
  });
});


describe("the Scale-10 Giant", () => {
  it("resolves to exactly four steps and AGI 6", () => {
    expect(raw(60_000, 62_000)).toBeCloseTo(4.1524, 4);
    expect(steps(60_000, 62_000)).toBe(4);
    expect(agi(10, 60_000, 62_000)).toBe(6);
  });

  /*
   * The 2:1 weighting collapses to 1.25 per doubling of height for a
   * proportional creature: mass scales as the cube, so its 0.25 contributes
   * 0.75 and the two sum to 1.25. Height governs; disproportionate mass still
   * costs on its own.
   */
  it("costs 1.25 raw burden per doubling of height when proportional", () => {
    for (const linear of [2, 4, 8]) {
      const size = 60 * linear ** 3;
      const mass = 62 * linear ** 3;

      expect(raw(size, mass)).toBeCloseTo(1.25 * Math.log2(linear), 10);
    }

    expect(SIZE_BURDEN_SENSITIVITY + 3 * MASS_BURDEN_SENSITIVITY).toBe(1.25);
  });
});


describe("ordinary humans keep their AGI", () => {
  /*
   * The cliff this design exists to avoid. Quantizing the RESULT rather than
   * the burden would put every human above 62 kg at AGI 9, making the Standard
   * Human the only one who gets their stored score.
   */
  it.each([
    ["70 kg", 68, 70],
    ["80 kg", 77, 80],
    ["95 kg", 92, 95],
    ["120 kg", 116, 120],
    ["200 cm tall", 60 * (200 / 165) ** 3, 62 * (200 / 165) ** 3],
  ])("leaves a %s human at stored AGI", (_label, sizeL, massKg) => {
    expect(Math.abs(raw(sizeL, massKg))).toBeLessThan(0.5);
    expect(agi(10, sizeL, massKg)).toBe(10);
  });

  /*
   * And the opposite hole, which truncating toward zero would open: a 327 kg
   * human carries a raw burden just under 1.0 and would pay nothing.
   * Rounding lands the first step where it belongs.
   */
  it.each([
    ["150 kg", 145, 150],
    ["200 kg", 194, 200],
    ["230 cm tall", 60 * (230 / 165) ** 3, 62 * (230 / 165) ** 3],
  ])("charges a %s body one step", (_label, sizeL, massKg) => {
    expect(steps(sizeL, massKg)).toBe(1);
    expect(agi(10, sizeL, massKg)).toBe(9);
  });
});


describe("small creatures", () => {
  /*
   * Symmetrical and deliberately not clamped at zero. Something smaller and
   * lighter than the Standard Human is more agile for it.
   */
  it("receives a negative burden", () => {
    expect(raw(3, 3)).toBeLessThan(0);
    expect(steps(3, 3)).toBeLessThan(0);
    expect(agi(10, 3, 3)).toBeGreaterThan(10);
  });

  it("mirrors the large case at equal magnitude", () => {
    const half = raw(60 / 8, 62 / 8);
    const twice = raw(60 * 8, 62 * 8);

    expect(half).toBeCloseTo(-twice, 10);
  });
});


describe("degenerate input", () => {
  it("treats a body with no size or mass as unburdened rather than infinite", () => {
    expect(raw(0, 62)).toBe(0);
    expect(raw(60, 0)).toBe(0);
  });
});
