/*
 * Spending Aura on effort: physical cost, Aura enhancement, and upkeep.
 *
 * There is one reserve. A punch, a Nen strike and an hour of holding Ren open
 * all come out of the same pool, and what distinguishes them is which
 * efficiency term applies:
 *
 *   physical    scaled by STAMINA, never by Control
 *   deliberate  scaled by CONTROL, never by Stamina
 *   upkeep      deliberate, charged per unit time
 *
 * The two are reported separately all the way out, because "that strike cost
 * 37 Aura" cannot be argued with and cannot be debugged.
 */

import { describe, expect, it } from "vitest";

import {
  PHYSICAL_AURA_COST_COEFFICIENT,
  derivePhysicalAuraCost,
  deriveSustainedActivityAuraCost,
  deriveSustainedPhysicalAuraCost,
  resolveAuraActionCost,
} from "../character/foundation/aura/expenditure";
import {
  deriveAuraUpkeep,
  payAuraUpkeep,
  upkeepRatePerHour,
} from "../character/foundation/aura/upkeep";
import { deriveMaximumAura } from "../character/foundation/aura/pool";
import {
  spendActionAura,
  spendPhysicalAura,
} from "../character/foundation/aura/transitions";
import {
  PHYSICAL_EXERTION_LOADS,
  physicalExertionLoad,
} from "../character/foundation/body/endurance";
import { resolveStamina } from "../character/foundation/attributes/derived/resolution";
import { continuityKey } from "../character/foundation/body/anatomy/types";
import type { CharacterStats } from "../character/foundation/attributes/stats";
import type { AuraAccessInput } from "../character/foundation/aura/types";

import {
  auraContext,
  auraTestAttributes,
  UNAWAKENED,
  WITH_TEN,
} from "./fixtures/aura";

const RIGHT_ARM = continuityKey("upper-limb:right");

/* Ren III, which opens room above the 5% baseline Ten already commits. */
const REN_III: AuraAccessInput = {
  ...WITH_TEN,
  override: { kind: "output-access", source: "ren-iii", accessFraction: 0.3 },
};

function costFor(
  stats: CharacterStats,
  load: number,
): number {
  return derivePhysicalAuraCost(
    deriveMaximumAura(stats),
    load,
    resolveStamina(stats),
  ).cost;
}

function errorCodes(
  result: { success: boolean; errors?: readonly { code: string }[] },
): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((error) => error.code);
}


describe("discrete physical Aura cost", () => {
  const STANDARD = auraTestAttributes();

  it("centralizes the calibration coefficient", () => {
    expect(PHYSICAL_AURA_COST_COEFFICIENT).toBe(0.001);
  });

  /*
   * The reference character: Maximum Aura 10, Stamina 10, multiplier x1.0, so
   * each cost is exactly a tenth of a percent of the pool per unit of load.
   */
  it("hits every exertion level for the standard character", () => {
    const expected: readonly (readonly [string, number])[] = [
      ["negligible", 0],
      ["light", 0.0025],
      ["ordinary-committed", 0.01],
      ["forceful", 0.02],
      ["maximal", 0.04],
      ["desperate-overexertion", 0.08],
    ];

    for (const [level, cost] of expected) {
      const load = PHYSICAL_EXERTION_LOADS[
        level as keyof typeof PHYSICAL_EXERTION_LOADS
      ];

      expect([level, costFor(STANDARD, load)]).toEqual([level, cost]);
    }
  });

  it("scales linearly with Exertion Load", () => {
    expect(costFor(STANDARD, 2)).toBeCloseTo(costFor(STANDARD, 1) * 2, 12);
    expect(costFor(STANDARD, 8)).toBeCloseTo(costFor(STANDARD, 1) * 8, 12);
  });

  it("applies the Stamina multiplier and nothing else", () => {
    const resolved = derivePhysicalAuraCost(1000, 1, 20);

    expect(resolved.staminaMultiplier).toBe(0.5);
    expect(resolved.cost).toBe(1000 * 0.001 * 1 * 0.5);
  });

  /*
   * The shape the whole model is built for. A stronger character's ordinary
   * punch costs vastly more absolute Aura — it is a vastly more destructive
   * punch — while being a smaller share of a much larger reserve.
   */
  it("costs more in absolute Aura and less in percentage as the pool grows", () => {
    const strong = auraTestAttributes({ con: 20, vit: 20 });

    const weakCost = costFor(STANDARD, 1);
    const strongCost = costFor(strong, 1);

    expect(strongCost).toBeGreaterThan(weakCost);
    expect(strongCost).toBe(25);

    expect(strongCost / deriveMaximumAura(strong))
      .toBeLessThan(weakCost / deriveMaximumAura(STANDARD));
  });

  it("keeps the factors that produced it rather than only the answer", () => {
    const resolved = derivePhysicalAuraCost(50_000, 2, 20);

    expect(resolved).toEqual({
      maximumAura: 50_000,
      exertionLoad: 2,
      stamina: 20,
      staminaMultiplier: 0.5,
      coefficient: 0.001,
      cost: 50,
    });
  });

  it("preserves fractional cost rather than rounding it away", () => {
    expect(costFor(STANDARD, physicalExertionLoad("light"))).toBe(0.0025);
  });
});


describe("sustained physical Aura cost", () => {
  const STANDARD = auraTestAttributes();
  const MAX = deriveMaximumAura(STANDARD);

  /*
   * The form the rates were calibrated in: at Stamina 10 the named levels come
   * out as round percentages of Maximum Aura per hour.
   */
  it("resolves to the calibrated percentages at Stamina 10", () => {
    const expected: readonly (readonly [string, number])[] = [
      ["ordinary-waking", 0],
      ["light", 0.005],
      ["moderate", 0.015],
      ["strenuous", 0.05],
      ["extreme", 0.1],
    ];

    for (const [activity, fraction] of expected) {
      const cost = deriveSustainedActivityAuraCost(
        MAX,
        activity as "light",
        10,
        1,
      ).cost;

      expect([activity, cost / MAX]).toEqual([activity, fraction]);
    }
  });

  /* An ordinary day costs nothing. Only wakefulness accumulates. */
  it("charges nothing for ordinary waking, however long it lasts", () => {
    expect(
      deriveSustainedActivityAuraCost(MAX, "ordinary-waking", 10, 100).cost,
    ).toBe(0);
  });

  it("scales with time", () => {
    const oneHour = deriveSustainedActivityAuraCost(MAX, "strenuous", 10, 1);
    const threeHours = deriveSustainedActivityAuraCost(MAX, "strenuous", 10, 3);

    expect(threeHours.cost).toBeCloseTo(oneHour.cost * 3, 12);
  });

  it("uses the same coefficient and Stamina multiplier as a discrete action", () => {
    const sustained = deriveSustainedPhysicalAuraCost(MAX, 4, 20, 1);
    const discrete = derivePhysicalAuraCost(MAX, 4, 20);

    expect(sustained.coefficient).toBe(discrete.coefficient);
    expect(sustained.staminaMultiplier).toBe(discrete.staminaMultiplier);
    expect(sustained.cost).toBe(discrete.cost);
  });
});


describe("composing physical and Aura-enhancement cost", () => {
  const STATS = auraTestAttributes({ con: 20, vit: 20, dex: 10 });

  it("keeps the two components separate", () => {
    const result = resolveAuraActionCost(
      STATS,
      { exertionLoad: 2, baseAuraCost: 100 },
      Number.POSITIVE_INFINITY,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    /* Physical: 50,000 x 0.001 x 2 x 0.5. Deliberate: 100 x 2.9 at DEX 10. */
    expect(result.payload.physical.cost).toBe(50);
    expect(result.payload.deliberate).toEqual({
      baseCost: 100,
      controlMultiplier: 2.9,
      finalCost: 290,
    });
    expect(result.payload.total).toBe(340);
  });

  /*
   * Two efficiency terms, two components, and neither reaches the other. A
   * clumsy character does not tire faster from swinging a sword.
   */
  it("lets Stamina move only the physical half", () => {
    const clumsyStrong = resolveAuraActionCost(
      auraTestAttributes({ con: 20, vit: 20, dex: 10 }),
      { exertionLoad: 2, baseAuraCost: 100 },
      Number.POSITIVE_INFINITY,
    );
    const clumsyWeak = resolveAuraActionCost(
      auraTestAttributes({ con: 20, vit: 10, dex: 10 }),
      { exertionLoad: 2, baseAuraCost: 100 },
      Number.POSITIVE_INFINITY,
    );

    expect(clumsyStrong.success && clumsyWeak.success).toBe(true);
    if (!clumsyStrong.success || !clumsyWeak.success) return;

    expect(clumsyStrong.payload.deliberate!.finalCost)
      .toBe(clumsyWeak.payload.deliberate!.finalCost);
    expect(clumsyStrong.payload.physical.staminaMultiplier)
      .not.toBe(clumsyWeak.payload.physical.staminaMultiplier);
  });

  it("lets Control move only the deliberate half", () => {
    const clumsy = resolveAuraActionCost(
      auraTestAttributes({ con: 20, vit: 20, dex: 10 }),
      { exertionLoad: 2, baseAuraCost: 100 },
      Number.POSITIVE_INFINITY,
    );
    const precise = resolveAuraActionCost(
      auraTestAttributes({ con: 20, vit: 20, dex: 30 }),
      { exertionLoad: 2, baseAuraCost: 100 },
      Number.POSITIVE_INFINITY,
    );

    expect(clumsy.success && precise.success).toBe(true);
    if (!clumsy.success || !precise.success) return;

    expect(precise.payload.physical.cost).toBe(clumsy.payload.physical.cost);
    expect(precise.payload.deliberate!.finalCost).toBe(20);
    expect(clumsy.payload.deliberate!.finalCost).toBe(290);
  });

  /*
   * An unenhanced punch has nothing for Control to scale, and reporting a
   * zero-cost expenditure beside it would imply the character projected
   * something.
   */
  it("reports no deliberate component for an unenhanced action", () => {
    const result = resolveAuraActionCost(
      STATS,
      { exertionLoad: 1 },
      Number.POSITIVE_INFINITY,
    );

    expect(result.success && result.payload.deliberate).toBeNull();
  });

  /*
   * Output is capacity being held, not fuel being burnt. Charging for it would
   * bill a character for standing still in Ren.
   */
  it("checks required Output without spending it", () => {
    const result = resolveAuraActionCost(
      STATS,
      { exertionLoad: 1, baseAuraCost: 10, requiredOutput: 400 },
      3000,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.requiredOutput).toBe(400);
    expect(result.payload.total)
      .toBe(result.payload.physical.cost + result.payload.deliberate!.finalCost);
  });

  it("refuses an action whose required Output is out of reach", () => {
    expect(errorCodes(resolveAuraActionCost(
      STATS,
      { exertionLoad: 1, requiredOutput: 9000 },
      3000,
    ))).toContain("aura.action.required_output.unreachable");
  });

  it("rejects a negative load or base cost", () => {
    expect(errorCodes(resolveAuraActionCost(STATS, { exertionLoad: -1 }, 0)))
      .toContain("aura.exertion.load.invalid");
    expect(errorCodes(resolveAuraActionCost(STATS, { baseAuraCost: -1 }, 0)))
      .toContain("aura.control.base_cost.invalid");
  });
});


describe("paying for an action", () => {
  it("deducts the physical cost and reports it apart from deliberate", () => {
    const result = spendPhysicalAura(
      { current: 5000, allocations: [] },
      auraContext({ attributes: { con: 20, vit: 20 }, access: WITH_TEN }),
      physicalExertionLoad("maximal"),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    /* 50,000 x 0.001 x 4 x 0.5 = 100. */
    expect(result.payload.current).toBe(4900);
    expect(result.payload.balance.physical).toBe(100);
    expect(result.payload.balance.deliberate).toBe(0);
    expect(result.payload.expenditure).toBeUndefined();
  });

  /*
   * Awakening gates deliberate projection, not metabolism. An unawakened
   * character has a real pool and their body burns it the same way.
   */
  it("works before and after awakening, identically", () => {
    const before = spendPhysicalAura(
      { current: 5000, allocations: [] },
      auraContext({ attributes: { con: 20, vit: 20 }, access: UNAWAKENED }),
      2,
    );
    const after = spendPhysicalAura(
      { current: 5000, allocations: [] },
      auraContext({ attributes: { con: 20, vit: 20 }, access: WITH_TEN }),
      2,
    );

    expect(before.success && before.payload.balance.physical).toBe(50);
    expect(after.success && after.payload.balance.physical).toBe(50);
  });

  /* Control describes deliberate projection. A punch is not that. */
  it("charges the same physical cost at every DEX", () => {
    const costs = [7, 22, 30].map((dex) => {
      const result = spendPhysicalAura(
        { current: 5000, allocations: [] },
        auraContext({ attributes: { con: 20, vit: 20, dex }, access: WITH_TEN }),
        2,
      );

      return result.success ? result.payload.balance.physical : null;
    });

    expect(costs).toEqual([50, 50, 50]);
  });

  it("charges both halves of an Aura-enhanced action in one transition", () => {
    const result = spendActionAura(
      { current: 5000, allocations: [] },
      auraContext({
        attributes: { con: 20, vit: 20, dex: 22 },
        access: REN_III,
      }),
      { exertionLoad: 2, baseAuraCost: 200 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.balance.physical).toBe(50);
    expect(result.payload.balance.deliberate).toBe(200);
    expect(result.payload.current).toBe(4750);
    expect(result.payload.expenditure).toEqual({
      baseCost: 200,
      controlMultiplier: 1,
      finalCost: 200,
    });
  });

  /*
   * Two calls could half-succeed: a character who paid the physical cost and
   * then could not afford the Aura has bought nothing and lost something.
   */
  it("leaves the state untouched when the whole action is unaffordable", () => {
    const before = { current: 60, allocations: [] };
    const taken = JSON.stringify(before);

    const result = spendActionAura(
      before,
      auraContext({
        attributes: { con: 20, vit: 20, dex: 22 },
        access: REN_III,
      }),
      { exertionLoad: 2, baseAuraCost: 200 },
    );

    expect(errorCodes(result)).toContain("aura.expenditure.insufficient");
    expect(JSON.stringify(before)).toBe(taken);
  });

  it("reconciles allocations the smaller reserve can no longer support", () => {
    const context = auraContext({
      attributes: { con: 20, vit: 20, dex: 22 },
      access: REN_III,
    });

    const result = spendActionAura(
      {
        current: 2000,
        allocations: [{
          id: "ken",
          coverage: "whole-body",
          placement: "surface",
          aura: 1500,
        }],
      },
      context,
      { exertionLoad: 8 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    /* 50,000 x 0.001 x 8 x 0.5 = 200, leaving 1,800 usable and 1,300 free. */
    expect(result.payload.current).toBe(1800);
    expect(result.payload.state.allocations[0]!.aura).toBeCloseTo(1300, 8);
    expect(result.payload.allocationChanges)
      .toEqual([expect.objectContaining({ kind: "reduced" })]);
  });

  it("refuses an action needing Output the character cannot reach", () => {
    const result = spendActionAura(
      { current: 50_000, allocations: [] },
      auraContext({ attributes: { con: 20, vit: 20 }, access: WITH_TEN }),
      { exertionLoad: 1, requiredOutput: 4000 },
    );

    expect(errorCodes(result))
      .toContain("aura.action.required_output.unreachable");
  });

  it("allows an action that needs Output already placed elsewhere", () => {
    const result = spendActionAura(
      {
        current: 50_000,
        allocations: [{
          id: "ken-arm",
          coverage: "localized",
          placement: "surface",
          continuityKey: RIGHT_ARM,
          aura: 500,
        }],
      },
      auraContext({ attributes: { con: 20, vit: 20 }, access: REN_III }),
      { exertionLoad: 1, requiredOutput: 500 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    /* The 500 held on the arm is untouched; only the swing was paid for. */
    expect(result.payload.state.allocations[0]!.aura).toBe(500);
    expect(result.payload.balance.deliberate).toBe(0);
  });
});


describe("deliberate upkeep", () => {
  const CONTROL = { multiplier: 2 };

  it("scales a per-hour rate by Control and by time", () => {
    const result = deriveAuraUpkeep(
      [{ id: "ren", source: "ren", baseRate: 100, period: "hour" }],
      CONTROL,
      3,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload[0]!.ratePerHour).toBe(200);
    expect(result.payload[0]!.cost).toBe(600);
  });

  it("converts a per-Round rate into the same per-hour arithmetic", () => {
    expect(upkeepRatePerHour(1, "round")).toBe(600);

    const result = deriveAuraUpkeep(
      [{ id: "ko", source: "ko", baseRate: 1, period: "round" }],
      { multiplier: 1 },
      1,
    );

    expect(result.success && result.payload[0]!.cost).toBe(600);
  });

  it("accumulates fractionally over part of an hour", () => {
    const result = deriveAuraUpkeep(
      [{ id: "ren", source: "ren", baseRate: 1, period: "hour" }],
      { multiplier: 1 },
      0.25,
    );

    expect(result.success && result.payload[0]!.cost).toBe(0.25);
  });

  it("deducts an affordable upkeep atomically", () => {
    const result = payAuraUpkeep(
      1000,
      22,
      [{ id: "ren", source: "ren", baseRate: 100, period: "hour" }],
      2,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.total).toBe(200);
    expect(result.payload.current).toBe(800);
  });

  /*
   * A caller asking to pay wanted a transaction. There is no third answer in
   * which two of three effects were paid for.
   */
  it("fails atomically when the reserve cannot cover it", () => {
    const result = payAuraUpkeep(
      50,
      22,
      [{ id: "ren", source: "ren", baseRate: 100, period: "hour" }],
      2,
    );

    expect(errorCodes(result)).toContain("aura.upkeep.insufficient");
  });

  it("rejects malformed commitments", () => {
    expect(errorCodes(deriveAuraUpkeep(
      [{ id: "", source: "ren", baseRate: 1, period: "hour" }],
      CONTROL,
      1,
    ))).toContain("aura.upkeep.id.missing");

    expect(errorCodes(deriveAuraUpkeep(
      [
        { id: "a", source: "ren", baseRate: 1, period: "hour" },
        { id: "a", source: "ken", baseRate: 1, period: "hour" },
      ],
      CONTROL,
      1,
    ))).toContain("aura.upkeep.id.duplicate");

    expect(errorCodes(deriveAuraUpkeep(
      [{ id: "a", source: "ren", baseRate: -1, period: "hour" }],
      CONTROL,
      1,
    ))).toContain("aura.upkeep.rate.invalid");
  });

  /*
   * Baseline Ten occupies Output and costs nothing. A Ten that drained the
   * reserve would make the default state of every awakened character a slow
   * death.
   */
  it("charges nothing when nothing is being maintained", () => {
    const result = deriveAuraUpkeep([], CONTROL, 24);

    expect(result.success && result.payload).toEqual([]);
  });
});
