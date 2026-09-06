/*
 * The CON/VIT/DEX-derived Aura scalars: pool, output, regeneration.
 *
 * Placement, allocation and density moved to aura-allocation.test.ts when
 * Surface Units were retired — those need a real body to divide by, and these
 * do not need a body at all.
 *
 * Pool/output/regeneration are all CON/VIT-derived (see "Aura Mathematics" in
 * the Rulebook), so these exercise the derivation functions directly rather
 * than asserting hand-picked numbers.
 */

import { describe, expect, it } from "vitest";

import type { Attributes } from "../character/foundation/attributes/types";
import {
  deriveAuraOutput,
  deriveAuraOutputLimit,
} from "../character/foundation/aura/output";
import {
  createAuraPool,
  deriveAuraDepletionFraction,
  deriveMaximumAura,
  validateAuraPool,
} from "../character/foundation/aura/pool";
import {
  deriveAuraRegeneration,
  deriveAuraRegenerationCapacity,
  recoverAura,
} from "../character/foundation/aura/recovery";

// A neutral baseline with only CON/VIT varied, so each test states exactly
// what it depends on.
function attributesWith(con: number, vit: number): Attributes {
  return { agi: 10, dex: 10, con, vit,
    int: 10, wis: 10, per: 10, spi: 10, cha: 10,
  };
}

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
      expect(result.payload).toEqual({
        current: 8000,
        maximum: 20000,
        depletionFraction: 0.6,
      });
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
    const result = deriveAuraOutput(attributesWith(20, 18), createAuraPool(8000, 20000), 0.32);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload).toEqual({
        physiologicalMaximum: 10000,
        accessibleMaximum: 3200,
        usableMaximum: 3200,
      });
    }
  });

  it("caps usable output at Current Aura even when Ren access allows more", () => {
    // Ren access allows 3,200, but only 400 Aura is actually in reserve.
    const result = deriveAuraOutput(attributesWith(20, 18), createAuraPool(400, 20000), 0.32);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.usableMaximum).toBe(400);
    }
  });

  it("zero Ren access means zero usable output regardless of reserve or physiology", () => {
    const result = deriveAuraOutput(attributesWith(20, 18), createAuraPool(8000, 20000), 0);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.usableMaximum).toBe(0);
    }
  });

  it("full Ren access (1.0) makes usable output equal to physiological capacity, minus reserve", () => {
    const result = deriveAuraOutput(attributesWith(20, 18), createAuraPool(50000, 50000), 1);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.usableMaximum).toBe(10000);
    }
  });

  it("rejects a Access Fraction outside 0 through 1", () => {
    const tooHigh = deriveAuraOutput(attributesWith(20, 18), createAuraPool(8000, 20000), 1.5);
    expect(tooHigh.success).toBe(false);
    if (!tooHigh.success) {
      expect(tooHigh.errors[0]).toEqual(
        expect.objectContaining({ code: "aura.output.access_fraction.invalid" }),
      );
    }

    const negative = deriveAuraOutput(attributesWith(20, 18), createAuraPool(8000, 20000), -0.1);
    expect(negative.success).toBe(false);
  });

  it("rejects a negative Current Aura", () => {
    const result = deriveAuraOutput(attributesWith(20, 18), createAuraPool(-1, 20000), 0.5);
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

/*
 * Recovery needs a context now. The unrestricted replenishAura is gone,
 * because it restored Aura at the full VIT rate for any hours it was handed —
 * so an ordinary waking day was a full heal, and rest, sleep and Zetsu were
 * all decoration on top of something already free. The contexts themselves are
 * covered in aura-endurance.test.ts; what is checked here is the capacity and
 * the cap, which are the parts that did not change.
 */
describe("recoverAura", () => {
  it("restores Aura at the derived rate, capped at what's missing", () => {
    const result = recoverAura(
      createAuraPool(6500, 20000),
      attributesWith(20, 18),
      { mode: "sleep" },
      1,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      // Regen for VIT 18 is 700/hour; 6500 + 700 = 7200.
      expect(result.payload.pool.current).toBe(7200);
    }
  });

  it("never pushes Current Aura past Maximum Aura", () => {
    const result = recoverAura(
      createAuraPool(19800, 20000),
      attributesWith(20, 18),
      { mode: "sleep" },
      1,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.pool.current).toBe(20000);
      expect(result.payload.contribution.potential).toBe(700);
      expect(result.payload.contribution.used).toBe(200);
    }
  });

  it("is a no-op over zero hours", () => {
    const result = recoverAura(
      createAuraPool(6500, 20000),
      attributesWith(20, 18),
      { mode: "sleep" },
      0,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.pool.current).toBe(6500);
    }
  });

  it("rejects a negative duration", () => {
    const result = recoverAura(
      createAuraPool(6500, 20000),
      attributesWith(20, 18),
      { mode: "sleep" },
      -1,
    );

    expect(result.success).toBe(false);
  });

  it("rejects an already-invalid pool", () => {
    const result = recoverAura(
      createAuraPool(25000, 20000),
      attributesWith(20, 18),
      { mode: "sleep" },
      1,
    );

    expect(result.success).toBe(false);
  });
});


describe("Aura depletion", () => {
  it("reads 0 at full and 1 at empty", () => {
    expect(deriveAuraDepletionFraction(20000, 20000)).toBe(0);
    expect(deriveAuraDepletionFraction(0, 20000)).toBe(1);
  });

  it("is the missing fraction in between", () => {
    expect(deriveAuraDepletionFraction(5000, 20000)).toBeCloseTo(0.75, 10);
  });

  /*
   * A character who cannot hold Aura is not infinitely depleted. NaN here
   * would propagate into every exhaustion threshold that eventually reads it.
   */
  it("reports 0 rather than NaN when there is no pool at all", () => {
    expect(deriveAuraDepletionFraction(0, 0)).toBe(0);
  });

  it("clamps rather than reporting a pool as over-full or over-empty", () => {
    expect(deriveAuraDepletionFraction(25000, 20000)).toBe(0);
    expect(deriveAuraDepletionFraction(-5, 20000)).toBe(1);
  });

  it("is carried on every pool the derivations produce", () => {
    const recovered = recoverAura(
      createAuraPool(6500, 20000),
      attributesWith(20, 18),
      { mode: "sleep" },
      1,
    );

    expect(recovered.success).toBe(true);
    if (!recovered.success) return;

    expect(recovered.payload.pool.depletionFraction).toBeCloseTo(
      (20000 - 7200) / 20000,
      10,
    );
  });
});


describe("Aura Regeneration Capacity", () => {
  it("wraps the derived rate in the domain's own shape", () => {
    expect(deriveAuraRegenerationCapacity(attributesWith(10, 18))).toEqual({
      perHour: deriveAuraRegeneration(attributesWith(10, 18)),
    });
  });
});
