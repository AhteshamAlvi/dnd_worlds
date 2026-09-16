/*
 * Spending Aura on effort: physical cost, Aura enhancement, and upkeep.
 *
 * There is one reserve. A declared surcharge, a Nen strike and an hour of
 * holding Ren open all come out of the same pool, and what distinguishes them
 * is which efficiency term applies:
 *
 *   physical    the application's OWN declared share of Maximum Aura, scaled
 *               by nothing at all
 *   deliberate  scaled by CONTROL
 *   upkeep      deliberate, charged per unit time
 *
 * They are reported separately all the way out, because "that strike cost 37
 * Aura" cannot be argued with and cannot be debugged.
 *
 * WHAT IS NOT HERE ANY MORE. Bodily effort used to be priced per action, from
 * an exertion tier and a Stamina multiplier against Maximum Aura. It is a
 * continuous rate now — 2R an hour whenever the body is working, integrated by
 * the time solver — so there is no such thing as the Aura cost of a punch, and
 * these suites test that there is no route to one.
 */

import { describe, expect, it } from "vitest";

import {
  derivePhysicalAuraCost,
  resolveAuraActionCost,
} from "../character/foundation/aura/expenditure";
import {
  deriveAuraUpkeep,
  payAuraUpkeep,
  upkeepRatePerHour,
} from "../character/foundation/aura/upkeep";
import { deriveMaximumAura } from "../character/foundation/aura/pool";
import * as transitionModule from "../character/foundation/aura/transitions";
import { spendActionAura } from "../character/foundation/aura/transitions";
import {
  PHYSICAL_EXERTION_LOADS,
  physicalExertionLoad,
} from "../character/foundation/body/endurance";
import { continuityKey } from "../character/foundation/body/anatomy/types";
import type { CharacterStats } from "../character/foundation/attributes/stats";
import type { AuraAccessInput } from "../character/foundation/aura/types";

import {
  auraContext,
  auraTestAttributes,
  UNAWAKENED,
  WITH_TEN,
  withTen,
} from "./fixtures/aura";

const RIGHT_ARM = continuityKey("upper-limb:right");

/* Ren III, which opens room above the 5% baseline Ten already commits. */
const REN_III: AuraAccessInput = withTen(1, { kind: "output-access", source: "ren-iii", accessFraction: 0.3 });

function errorCodes(
  result: { success: boolean; errors?: readonly { code: string }[] },
): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((error) => error.code);
}


describe("the declared physical surcharge", () => {
  const STANDARD = auraTestAttributes();
  const STRONG = auraTestAttributes({ con: 20, vit: 20 });

  /*
   * A_max x p, and nothing else in the expression. No coefficient, no exertion
   * tier, no Stamina — those were the three terms of the removed model, and
   * the whole point of the replacement is that an author names the number.
   */
  it("is the application's own share of Maximum Aura", () => {
    expect(derivePhysicalAuraCost(100, 0.02).cost).toBe(2);
    expect(derivePhysicalAuraCost(deriveMaximumAura(STRONG), 0.02).cost)
      .toBe(deriveMaximumAura(STRONG) * 0.02);
  });

  it("keeps the two factors that produced it, not only the answer", () => {
    expect(derivePhysicalAuraCost(100, 0.02)).toEqual({
      maximumAura: 100,
      rate: 0.02,
      cost: 2,
    });
  });

  it("costs nothing when nothing is declared", () => {
    const result = resolveAuraActionCost(
      STRONG,
      { baseAuraCost: 0 },
      Number.POSITIVE_INFINITY,
    );

    expect(result.success && result.payload.physical.cost).toBe(0);
  });

  it("preserves fractional cost rather than rounding it away", () => {
    expect(derivePhysicalAuraCost(deriveMaximumAura(STANDARD), 0.02).cost)
      .toBeCloseTo(deriveMaximumAura(STANDARD) * 0.02, 12);
  });

  /*
   * Stamina used to discount this, through `M_Stamina = 10 / Stamina`. It does
   * not, and cannot: the multiplier no longer exists, and the rate an author
   * declared is the rate they meant for everybody.
   */
  it("is not discounted by Stamina", () => {
    const tough = auraTestAttributes({ con: 30, vit: 30 });
    const frail = auraTestAttributes({ con: 20, vit: 20 });

    const share = (stats: CharacterStats) => {
      const result = resolveAuraActionCost(
        stats,
        { additionalPhysicalCostRate: 0.02 },
        Number.POSITIVE_INFINITY,
      );

      if (!result.success) throw new Error("Expected the cost to resolve.");

      return result.payload.physical.cost / deriveMaximumAura(stats);
    };

    expect(share(tough)).toBeCloseTo(share(frail), 12);
    expect(share(tough)).toBeCloseTo(0.02, 12);
  });

  /*
   * The removed model, stated as a rule rather than as an absence: no
   * combination of an exertion tier and a Stamina score produces an Aura cost
   * any more. A "maximal" Skill and a "light" one cost the same unless their
   * authors said otherwise.
   */
  it("derives nothing from the exertion tiers, which are classification", () => {
    /*
     * The tiers still exist and still differ. What no longer exists is any way
     * to turn one into Aura: the cost request has no field that would take
     * one, so the strongest statement available is that the vocabulary is
     * intact and disconnected.
     */
    expect(physicalExertionLoad("desperate-overexertion")).toBe(8);
    expect(physicalExertionLoad("light")).toBe(0.25);

    const request = { additionalPhysicalCostRate: 0.001 } as Record<string, unknown>;

    expect(Object.keys(PHYSICAL_EXERTION_LOADS)).not.toContain("rate");
    expect(request["exertionLoad"]).toBeUndefined();

    const resolved = resolveAuraActionCost(
      STRONG,
      { additionalPhysicalCostRate: 0.001 },
      Number.POSITIVE_INFINITY,
    );

    /* The declared rate, and nothing a tier could have added to it. */
    expect(resolved.success && resolved.payload.physical.cost)
      .toBe(deriveMaximumAura(STRONG) * 0.001);
  });
});


describe("composing the surcharge with Aura enhancement", () => {
  const STATS = auraTestAttributes({ con: 20, vit: 20, dex: 10 });

  it("keeps the two components separate", () => {
    const result = resolveAuraActionCost(
      STATS,
      { additionalPhysicalCostRate: 0.001, baseAuraCost: 100 },
      Number.POSITIVE_INFINITY,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    /* Physical: 50,000 x 0.001. Deliberate: 100 x 2.9 at DEX 10. */
    expect(result.payload.physical.cost).toBe(50);
    expect(result.payload.deliberate).toEqual({
      baseCost: 100,
      controlMultiplier: 2.9,
      finalCost: 290,
    });
    expect(result.payload.total).toBe(340);
  });

  it("lets Control move only the deliberate half", () => {
    const clumsy = resolveAuraActionCost(
      auraTestAttributes({ con: 20, vit: 20, dex: 10 }),
      { additionalPhysicalCostRate: 0.001, baseAuraCost: 100 },
      Number.POSITIVE_INFINITY,
    );
    const precise = resolveAuraActionCost(
      auraTestAttributes({ con: 20, vit: 20, dex: 30 }),
      { additionalPhysicalCostRate: 0.001, baseAuraCost: 100 },
      Number.POSITIVE_INFINITY,
    );

    expect(clumsy.success && precise.success).toBe(true);
    if (!clumsy.success || !precise.success) return;

    expect(precise.payload.physical.cost).toBe(clumsy.payload.physical.cost);
    expect(precise.payload.deliberate!.finalCost).toBe(20);
    expect(clumsy.payload.deliberate!.finalCost).toBe(290);
  });

  /*
   * An unenhanced action has nothing for Control to scale, and reporting a
   * zero-cost expenditure beside it would imply the character projected
   * something.
   */
  it("reports no deliberate component for an unenhanced action", () => {
    const result = resolveAuraActionCost(
      STATS,
      { additionalPhysicalCostRate: 0.001 },
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
      {
        additionalPhysicalCostRate: 0.001,
        baseAuraCost: 10,
        requiredOutput: 400,
      },
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
      { additionalPhysicalCostRate: 0.001, requiredOutput: 9000 },
      3000,
    ))).toContain("aura.action.required_output.unreachable");
  });

  it("rejects a negative rate or base cost", () => {
    expect(errorCodes(resolveAuraActionCost(
      STATS,
      { additionalPhysicalCostRate: -1 },
      0,
    ))).toContain("aura.action.physical_rate.invalid");

    expect(errorCodes(resolveAuraActionCost(STATS, { baseAuraCost: -1 }, 0)))
      .toContain("aura.control.base_cost.invalid");
  });
});


describe("paying for an action", () => {
  /*
   * The removed transition, stated as a rule.
   *
   * `spendPhysicalAura(state, context, exertionLoad)` charged a character for
   * one swing. Effort is now paid for by the hour, so there is nothing left
   * for it to do, and leaving it exported would have been an invitation to
   * charge the same effort twice.
   */
  it("has no route for charging a character merely for exerting themselves", () => {
    const transitions = transitionModule as Record<string, unknown>;

    expect(transitions["spendPhysicalAura"]).toBeUndefined();
    expect(transitions["spendActionAura"]).toBeTypeOf("function");
  });

  it("deducts a declared surcharge and reports it apart from deliberate", () => {
    const result = spendActionAura(
      { current: 5000, allocations: [] },
      auraContext({ attributes: { con: 20, vit: 20 }, access: WITH_TEN }),
      { additionalPhysicalCostRate: 0.002 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    /* 50,000 x 0.002 = 100. */
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
    const charge = (access: AuraAccessInput) => spendActionAura(
      { current: 5000, allocations: [] },
      auraContext({ attributes: { con: 20, vit: 20 }, access }),
      { additionalPhysicalCostRate: 0.001 },
    );

    const before = charge(UNAWAKENED);
    const after = charge(WITH_TEN);

    expect(before.success && before.payload.balance.physical).toBe(50);
    expect(after.success && after.payload.balance.physical).toBe(50);
  });

  /* Control describes deliberate projection. A surcharge is not that. */
  it("charges the same surcharge at every DEX", () => {
    const costs = [7, 22, 30].map((dex) => {
      const result = spendActionAura(
        { current: 5000, allocations: [] },
        auraContext({ attributes: { con: 20, vit: 20, dex }, access: WITH_TEN }),
        { additionalPhysicalCostRate: 0.001 },
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
      { additionalPhysicalCostRate: 0.001, baseAuraCost: 200 },
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
      { additionalPhysicalCostRate: 0.001, baseAuraCost: 200 },
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
      { additionalPhysicalCostRate: 0.004 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    /* 50,000 x 0.004 = 200, leaving 1,800 usable and 1,300 free. */
    expect(result.payload.current).toBe(1800);
    expect(result.payload.state.allocations[0]!.aura).toBeCloseTo(1300, 8);
    expect(result.payload.allocationChanges)
      .toEqual([expect.objectContaining({ kind: "reduced" })]);
  });

  it("refuses an action needing Output the character cannot reach", () => {
    const result = spendActionAura(
      { current: 50_000, allocations: [] },
      auraContext({ attributes: { con: 20, vit: 20 }, access: WITH_TEN }),
      { requiredOutput: 4000 },
    );

    expect(errorCodes(result))
      .toContain("aura.action.required_output.unreachable");
  });

  it("allows an action that needs Output already placed elsewhere", () => {
    const result = spendActionAura(
      {
        current: 50_000,
        /* Any standing commitment will do; what matters is that 500 is held. */
        allocations: [{
          id: "coating",
          coverage: "whole-body",
          placement: "surface",
          aura: 500,
        }],
      },
      auraContext({ attributes: { con: 20, vit: 20 }, access: REN_III }),
      { requiredOutput: 500 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    /* The 500 held on the arm is untouched; nothing was charged. */
    expect(result.payload.state.allocations[0]!.aura).toBe(500);
    expect(result.payload.balance.deliberate).toBe(0);
    expect(result.payload.balance.physical).toBe(0);
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

  /* Rounds are two seconds, so an hour holds 1,800 of them. */
  it("converts a per-Round rate into the same per-hour arithmetic", () => {
    expect(upkeepRatePerHour(1, "round")).toBe(1800);

    const result = deriveAuraUpkeep(
      [{ id: "ko", source: "ko", baseRate: 1, period: "round" }],
      { multiplier: 1 },
      1,
    );

    expect(result.success && result.payload[0]!.cost).toBe(1800);
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
