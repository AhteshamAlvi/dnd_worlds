/*
 * Aura Control: the DEX-derived cost multiplier, and the two curves it is.
 *
 * Control modifies deliberate expenditure COST and nothing else. Everything
 * this suite checks is either the shape of the progression or the boundary of
 * what Control is allowed to have an opinion about.
 *
 * The progression meets at DEX 22, which is perfect mortal control: no Aura
 * wasted, none saved, exactly x1.0. Below it the curve climbs to a floor of
 * x5.0 at DEX 7; above it, it falls forever without ever reaching zero.
 *
 * ROUNDING IS PART OF THE CALCULATION, not display formatting, and the two
 * sides round differently — two significant figures below the pivot, one above
 * — so the resolved multiplier is asserted as an exact number rather than
 * approximately.
 */

import { describe, expect, it } from "vitest";

import {
  applyAuraControl,
  CONTROL_DEX_FLOOR,
  CONTROL_DEX_PIVOT,
  deriveAuraControl,
  deriveAuraControlMultiplier,
  deriveAuraExpenditure,
  deriveRawAuraControlMultiplier,
} from "../character/foundation/aura/control";
import { resolveAuraProfile } from "../character/foundation/aura/resolution";
import { auraContext, UNAWAKENED } from "./fixtures/aura";

/** The resolved multiplier, failing the test rather than the assertion. */
function multiplier(dex: number): number {
  const result = deriveAuraControlMultiplier(dex);

  if (!result.success) {
    throw new Error(
      `Expected DEX ${dex} to resolve a Control multiplier, got: ` +
      result.errors.map((error) => error.code).join(", "),
    );
  }

  return result.payload;
}

function errorCodes(
  result: { success: boolean; errors?: readonly { code: string }[] },
): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((error) => error.code);
}


/*
 * The whole mortal range and the whole ordinary superhuman range, written out.
 *
 * A table rather than a re-derivation of the formula, because a test that
 * recomputes the thing under test only proves the code agrees with itself. The
 * ticket's checkpoints are in here verbatim; the rest are the curve's own
 * answers, and they are here so that changing the exponent breaks something
 * loud instead of shifting fourteen values nobody was looking at.
 */
const RESOLVED_BY_DEX: Readonly<Record<number, number>> = {
  0: 5.0, 1: 5.0, 2: 5.0, 3: 5.0, 4: 5.0, 5: 5.0, 6: 5.0, 7: 5.0,
  8: 4.0, 9: 3.4, 10: 2.9, 11: 2.5, 12: 2.2, 13: 2.0, 14: 1.8,
  15: 1.6, 16: 1.5, 17: 1.4, 18: 1.3, 19: 1.2, 20: 1.1, 21: 1.1,
  22: 1.0,
  23: 0.8, 24: 0.6, 25: 0.5, 26: 0.4, 27: 0.3, 28: 0.3, 29: 0.2, 30: 0.2,
};


describe("the Aura Control progression", () => {
  it("resolves every DEX from 0 through 30 to its tabled multiplier", () => {
    for (const [dex, expected] of Object.entries(RESOLVED_BY_DEX)) {
      expect([Number(dex), multiplier(Number(dex))]).toEqual([
        Number(dex),
        expected,
      ]);
    }
  });

  it("resolves DEX 22 to exactly x1.0", () => {
    expect(multiplier(CONTROL_DEX_PIVOT)).toBe(1);
    expect(deriveRawAuraControlMultiplier(CONTROL_DEX_PIVOT)).toBe(1);
  });

  it("hits the ticket's checkpoints above the mortal range", () => {
    expect(multiplier(36)).toBe(0.09);
    expect(multiplier(40)).toBe(0.06);
    expect(multiplier(50)).toBe(0.03);
  });

  /*
   * The old progression stopped at DEX 30 and reported anything beyond it as
   * unsupported, which made a Giant with superhuman DEX a developer error.
   */
  it("stays defined, positive and falling with no maximum DEX", () => {
    for (const dex of [31, 40, 60, 100, 500, 10_000]) {
      expect(multiplier(dex)).toBeGreaterThan(0);
      expect(Number.isFinite(multiplier(dex))).toBe(true);
    }

    expect(multiplier(100)).toBeLessThan(multiplier(60));
    expect(multiplier(10_000)).toBeLessThan(multiplier(500));
  });

  it("never rises as DEX rises", () => {
    for (let dex = 1; dex <= 200; dex += 1) {
      expect(multiplier(dex)).toBeLessThanOrEqual(multiplier(dex - 1));
    }
  });

  /*
   * Below the floor the curve would run to a vertical asymptote at DEX 2. A
   * character that clumsy wastes five times what an application needs; they
   * are not infinitely wasteful, and they are not an error.
   */
  it("holds the floor's own multiplier below DEX 7", () => {
    for (let dex = 0; dex < CONTROL_DEX_FLOOR; dex += 1) {
      expect(multiplier(dex)).toBe(multiplier(CONTROL_DEX_FLOOR));
    }
  });
});


describe("Control rounding is part of the calculation", () => {
  /*
   * Two significant figures below the pivot. One would flatten DEX 15 through
   * 19 — raw 1.65, 1.51, 1.40, 1.30, 1.21 — into a single answer of x2 for the
   * first and x1 for the rest.
   */
  it("rounds the mortal branch to two significant figures", () => {
    expect(deriveRawAuraControlMultiplier(10)).toBeCloseTo(2.897304, 6);
    expect(multiplier(10)).toBe(2.9);

    expect(deriveRawAuraControlMultiplier(15)).toBeCloseTo(1.648925, 6);
    expect(multiplier(15)).toBe(1.6);
  });

  /*
   * One above it. Two would imply a precision the superhuman curve does not
   * have — and would put x0.27 and x0.28 a DEX point apart.
   */
  it("rounds the superhuman branch to one significant figure", () => {
    expect(deriveRawAuraControlMultiplier(23)).toBeCloseTo(0.769432, 6);
    expect(multiplier(23)).toBe(0.8);

    expect(deriveRawAuraControlMultiplier(27)).toBeCloseTo(0.327906, 6);
    expect(multiplier(27)).toBe(0.3);
  });

  /*
   * Exact doubles, not merely close ones. Dividing out a power of ten leaves
   * 2.9000000000000004, which is not the multiplier the progression specifies
   * and would leak into every cost derived from it.
   */
  it("produces the exact figure, not a value near it", () => {
    expect(Object.is(multiplier(9), 3.4)).toBe(true);
    expect(Object.is(multiplier(10), 2.9)).toBe(true);
    expect(Object.is(multiplier(27), 0.3)).toBe(true);
    expect(Object.is(multiplier(36), 0.09)).toBe(true);
  });
});


describe("a DEX that is not a score", () => {
  it("rejects a non-finite DEX", () => {
    expect(errorCodes(deriveAuraControlMultiplier(Number.NaN)))
      .toContain("aura.control.dex.invalid");
    expect(errorCodes(deriveAuraControlMultiplier(Number.POSITIVE_INFINITY)))
      .toContain("aura.control.dex.invalid");
  });

  it("rejects a fractional DEX", () => {
    expect(errorCodes(deriveAuraControlMultiplier(14.5)))
      .toContain("aura.control.dex.invalid");
  });

  it("rejects a negative DEX", () => {
    expect(errorCodes(deriveAuraControlMultiplier(-3)))
      .toContain("aura.control.dex.invalid");
  });

  it("accepts DEX 0, which is a score", () => {
    expect(deriveAuraControlMultiplier(0).success).toBe(true);
  });
});


describe("applying Control to a cost", () => {
  it("multiplies the Base Cost by the resolved multiplier", () => {
    const result = deriveAuraExpenditure(100, 22);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload).toEqual({
      baseCost: 100,
      controlMultiplier: 1,
      finalCost: 100,
    });
  });

  /*
   * The multiplier is rounded; the Final Cost is not. Continuous-time Nen
   * upkeep spends fractional Aura, and rounding here would make a long
   * maintenance either free or ruinous depending on which way it went.
   */
  it("preserves a fractional Final Cost", () => {
    const result = deriveAuraExpenditure(7, 25);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.finalCost).toBe(3.5);
  });

  it("keeps fractional costs precise through a bad-looking multiplier", () => {
    const result = deriveAuraExpenditure(33, 10);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.controlMultiplier).toBe(2.9);
    expect(result.payload.finalCost).toBeCloseTo(95.7, 10);
  });

  it("charges more below the pivot and less above it", () => {
    const clumsy = deriveAuraExpenditure(100, 10);
    const perfect = deriveAuraExpenditure(100, 22);
    const superhuman = deriveAuraExpenditure(100, 30);

    expect(clumsy.success && clumsy.payload.finalCost).toBe(290);
    expect(perfect.success && perfect.payload.finalCost).toBe(100);
    expect(superhuman.success && superhuman.payload.finalCost).toBe(20);
  });

  it("rejects a negative or non-finite Base Cost", () => {
    expect(errorCodes(deriveAuraExpenditure(-1, 22)))
      .toContain("aura.control.base_cost.invalid");
    expect(errorCodes(deriveAuraExpenditure(Number.NaN, 22)))
      .toContain("aura.control.base_cost.invalid");
  });

  /*
   * applyAuraControl exists so a caller holding a resolved profile charges the
   * multiplier that profile reports rather than re-deriving one. The two paths
   * must agree, or spendAura and deriveAuraExpenditure would quietly differ.
   */
  it("agrees with the DEX-derived path", () => {
    const control = deriveAuraControl(17);
    const derived = deriveAuraExpenditure(250, 17);

    expect(control.success && derived.success).toBe(true);
    if (!control.success || !derived.success) return;

    expect(applyAuraControl(250, control.payload)).toEqual(derived.payload);
  });
});


describe("Control affects cost and nothing else", () => {
  function profileAt(dex: number) {
    const result = resolveAuraProfile({
      state: { current: 10, allocations: [] },
      ...auraContext({ attributes: { dex }, access: UNAWAKENED }),
    });

    if (!result.success) throw new Error("expected a resolvable profile");

    return result.payload;
  }

  it("moves the multiplier and leaves every other figure alone", () => {
    const clumsy = profileAt(7);
    const precise = profileAt(30);

    expect(clumsy.control.multiplier).toBe(5);
    expect(precise.control.multiplier).toBe(0.2);

    expect(precise.pool).toEqual(clumsy.pool);
    expect(precise.output).toEqual(clumsy.output);
    expect(precise.regeneration).toEqual(clumsy.regeneration);
    expect(precise.access).toEqual(clumsy.access);
    expect(precise.distribution).toEqual(clumsy.distribution);
    expect(precise.passiveInternal).toEqual(clumsy.passiveInternal);
    expect(precise.byBodyPart).toEqual(clumsy.byBodyPart);
  });

  /*
   * The flag that used to sit beside the multiplier claimed to answer whether
   * the character may spend Aura deliberately. Control cannot know that;
   * access and the application's own requirements decide it.
   */
  it("carries no permission of its own", () => {
    expect(Object.keys(profileAt(3).control)).toEqual(["multiplier"]);
  });
});
