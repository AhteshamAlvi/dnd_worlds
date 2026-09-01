/*
 * Tests the whole-body Aura rules: pool validation, output derivation,
 * distribution across the body, resulting density, and replenishment over
 * time. Pool/output/regeneration are all CON/VIT-derived (see "Aura
 * Mathematics" in the Rulebook), so these tests exercise the derivation
 * functions directly rather than asserting hand-picked numbers.
 */

import { describe, expect, it } from "vitest";

import type { Attributes } from "../character/foundation/attributes/types";
import { STANDARD_BODY } from "../character/foundation/body/defaults";
import { calculateAuraDensity } from "../character/foundation/aura/density";
import { distributeAura } from "../character/foundation/aura/distribution";
import {
  deriveAuraOutput,
  deriveAuraOutputLimit,
} from "../character/foundation/aura/output";
import { deriveMaximumAura, validateAuraPool } from "../character/foundation/aura/pool";
import {
  deriveAuraRegeneration,
  replenishAura,
} from "../character/foundation/aura/replenishment";
import type { AuraOutput } from "../character/foundation/aura/types";

// A neutral baseline with only CON/VIT varied, so each test states exactly
// what it depends on.
function attributesWith(con: number, vit: number): Attributes {
  return { agi: 10, dex: 10, con, vit,
    int: 10, wis: 10, per: 10, spi: 10, cha: 10,
  };
}

// distributeAura only cares about the final usable figure; the other two
// fields exist for the Output tab's display, not for distribution.
function outputOf(usableMaximum: number): AuraOutput {
  return {
    physiologicalMaximum: usableMaximum,
    renAccessibleMaximum: usableMaximum,
    usableMaximum,
  };
}

describe("whole-body Aura", () => {
  it("distributes the usable Aura Output across the body", () => {
    const result = distributeAura(outputOf(2000), STANDARD_BODY);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.payload).toEqual({
        aura: 2000,
        surfaceUnits: 100,
      });
    }
  });

  it("calculates Aura density from Aura and Surface Units", () => {
    const result = calculateAuraDensity({
      aura: 2000,
      surfaceUnits: 100,
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.payload.auraPerSurfaceUnit).toBe(20);
    }
  });

  it("supports zero Aura Output", () => {
    const distribution = distributeAura(outputOf(0), STANDARD_BODY);
    expect(distribution.success).toBe(true);
    if (!distribution.success) return;

    const density = calculateAuraDensity(distribution.payload);
    expect(density.success).toBe(true);
    if (density.success) {
      expect(density.payload.auraPerSurfaceUnit).toBe(0);
    }
  });
});

describe("deriveMaximumAura", () => {
  it("gives a baseline (CON 10 / VIT 10) character a small pool", () => {
    expect(deriveMaximumAura(attributesWith(10, 10))).toBe(10);
  });

  it("grows sharply with CON + VIT", () => {
    expect(deriveMaximumAura(attributesWith(20, 18))).toBe(20000);
    expect(deriveMaximumAura(attributesWith(21, 19))).toBe(50000);
  });

  it("rounds to one significant figure", () => {
    const value = deriveMaximumAura(attributesWith(13, 12));
    expect(value).toBe(60);
  });
});

describe("Aura pool", () => {
  it("accepts a valid Aura pool and derives Maximum Aura from CON + VIT", () => {
    const result = validateAuraPool(8000, attributesWith(20, 18));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload).toEqual({ current: 8000, maximum: 20000 });
    }
  });

  it("rejects Current Aura above the derived Maximum Aura", () => {
    const result = validateAuraPool(25000, attributesWith(20, 18));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "aura.pool.current.exceeds_maximum",
            required: 20000,
            actual: 25000,
          }),
        ]),
      );
    }
  });

  it("rejects a negative Current Aura", () => {
    const result = validateAuraPool(-1, attributesWith(20, 18));
    expect(result.success).toBe(false);
  });
});

describe("deriveAuraOutputLimit", () => {
  // Physiological Output Capacity is 2 × the same CON curve Maximum Aura
  // uses, and depends only on CON — VIT plays no part in it.
  it("derives the physiological Output Limit from CON alone", () => {
    expect(deriveAuraOutputLimit(attributesWith(20, 10)).maximum).toBe(10000);
    expect(deriveAuraOutputLimit(attributesWith(20, 30)).maximum).toBe(10000);
  });
});

describe("deriveAuraOutput", () => {
  it("is not manually set — it derives from physiological capacity, Ren access, and Current Aura", () => {
    // CON 20 -> physiological 10,000. Ren access 0.32 -> accessible 3,200.
    // Current Aura 8,000 doesn't bind, so usable == accessible.
    const result = deriveAuraOutput(attributesWith(20, 18), { current: 8000, maximum: 20000 }, 0.32);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload).toEqual({
        physiologicalMaximum: 10000,
        renAccessibleMaximum: 3200,
        usableMaximum: 3200,
      });
    }
  });

  it("caps usable output at Current Aura even when Ren access allows more", () => {
    // Ren access allows 3,200, but only 400 Aura is actually in reserve.
    const result = deriveAuraOutput(attributesWith(20, 18), { current: 400, maximum: 20000 }, 0.32);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.usableMaximum).toBe(400);
    }
  });

  it("zero Ren access means zero usable output regardless of reserve or physiology", () => {
    const result = deriveAuraOutput(attributesWith(20, 18), { current: 8000, maximum: 20000 }, 0);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.usableMaximum).toBe(0);
    }
  });

  it("full Ren access (1.0) makes usable output equal to physiological capacity, minus reserve", () => {
    const result = deriveAuraOutput(attributesWith(20, 18), { current: 50000, maximum: 50000 }, 1);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.usableMaximum).toBe(10000);
    }
  });

  it("rejects a Ren Access Fraction outside 0 through 1", () => {
    const tooHigh = deriveAuraOutput(attributesWith(20, 18), { current: 8000, maximum: 20000 }, 1.5);
    expect(tooHigh.success).toBe(false);
    if (!tooHigh.success) {
      expect(tooHigh.errors[0]).toEqual(
        expect.objectContaining({ code: "aura.output.ren_access.invalid" }),
      );
    }

    const negative = deriveAuraOutput(attributesWith(20, 18), { current: 8000, maximum: 20000 }, -0.1);
    expect(negative.success).toBe(false);
  });

  it("rejects a negative Current Aura", () => {
    const result = deriveAuraOutput(attributesWith(20, 18), { current: -1, maximum: 20000 }, 0.5);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]).toEqual(
        expect.objectContaining({ code: "aura.output.current_aura.invalid" }),
      );
    }
  });
});

describe("deriveAuraRegeneration", () => {
  it("derives Aura Regeneration Capacity from VIT alone", () => {
    expect(deriveAuraRegeneration(attributesWith(10, 18))).toBe(700);
    expect(deriveAuraRegeneration(attributesWith(30, 18))).toBe(700);
  });
});

describe("replenishAura", () => {
  it("restores Aura at the derived rate, capped at what's missing", () => {
    const result = replenishAura(
      { current: 6500, maximum: 20000 },
      attributesWith(20, 18),
      1,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      // Regen for VIT 18 is 700/hour; 6500 + 700 = 7200.
      expect(result.payload.current).toBe(7200);
    }
  });

  it("never pushes Current Aura past Maximum Aura", () => {
    const result = replenishAura(
      { current: 19800, maximum: 20000 },
      attributesWith(20, 18),
      1,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.current).toBe(20000);
    }
  });

  it("is a no-op over zero hours", () => {
    const result = replenishAura(
      { current: 6500, maximum: 20000 },
      attributesWith(20, 18),
      0,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.current).toBe(6500);
    }
  });

  it("rejects a negative duration", () => {
    const result = replenishAura(
      { current: 6500, maximum: 20000 },
      attributesWith(20, 18),
      -1,
    );

    expect(result.success).toBe(false);
  });

  it("rejects an already-invalid pool", () => {
    const result = replenishAura(
      { current: 25000, maximum: 20000 },
      attributesWith(20, 18),
      1,
    );

    expect(result.success).toBe(false);
  });
});
