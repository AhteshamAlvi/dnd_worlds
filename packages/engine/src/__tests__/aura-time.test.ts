/*
 * Advancing time: the one place every Aura contribution is added up.
 *
 *   A' = clamp(A + recovery - physical - deliberate - upkeep - leakage
 *              - forcedDrain, 0, A_max)
 *
 * The terms interact, which is why they are composed rather than applied one
 * after another: an hour of sleep recovers Aura while wakefulness falls, an
 * hour uncontained bleeds while nothing recovers, and an hour of hard work
 * with Ren up pays physical cost and upkeep from the same reserve.
 *
 * Hours passing cannot be REFUSED, and that is the other property under test.
 * An unaffordable upkeep does not mean the hour failed to happen — the effect
 * dropped. A reserve emptied by leakage does not invalidate the night — the
 * character collapsed. Both come back as typed outcomes on a success.
 */

import { describe, expect, it } from "vitest";

import { advanceAuraTime } from "../character/foundation/aura/time";
import type { AdvanceAuraTimeInput } from "../character/foundation/aura/time";
import { deriveMaximumAura } from "../character/foundation/aura/pool";
import { restedWakefulness } from "../character/foundation/body/endurance";
import { deriveZetsuReplenishmentMultiplier } from "../character/foundation/nen/principles/zetsu";
import type { AuraAccessInput } from "../character/foundation/aura/types";
import type { CharacterAuraState } from "../character/foundation/aura/state";

import {
  auraContext,
  auraTestAttributes,
  UNAWAKENED,
  UNCONTAINED,
  WITH_TEN,
} from "./fixtures/aura";

/* CON 20 / VIT 20: Maximum Aura 50,000, Stamina 20, regeneration 5,000/hour. */
const STRONG = { con: 20, vit: 20, dex: 22 } as const;

const REN_III: AuraAccessInput = {
  ...WITH_TEN,
  override: { kind: "output-access", source: "ren-iii", accessFraction: 0.3 },
};

type Options = Partial<Omit<AdvanceAuraTimeInput, "context">> & {
  readonly attributes?: Parameters<typeof auraTestAttributes>[0];
  readonly access?: AuraAccessInput;
};

function advance(options: Options = {}) {
  const {
    attributes = STRONG,
    access = WITH_TEN,
    state = { current: 0, allocations: [] },
    wakefulness = restedWakefulness(),
    hours = 1,
    activity = { mode: "ordinary-waking" as const },
    ...rest
  } = options;

  return advanceAuraTime({
    state,
    wakefulness,
    context: auraContext({ attributes, access }),
    hours,
    activity,
    ...rest,
  });
}

function succeed(options: Options = {}) {
  const result = advance(options);

  if (!result.success) {
    throw new Error(
      "Expected the interval to resolve: " +
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


describe("an ordinary waking hour", () => {
  const result = succeed({
    state: { current: 25_000, allocations: [] },
    hours: 8,
    activity: { mode: "ordinary-waking" },
  });

  /*
   * Nothing in, nothing out. A model in which merely being awake drains Aura
   * makes every character a clock running down; the cost of time passing is
   * carried by wakefulness, which is a different axis.
   */
  it("neither recovers nor spends anything", () => {
    expect(result.current).toBe(25_000);
    expect(result.currentChange).toBe(0);
    expect(result.balance).toEqual({
      recovery: 0,
      recoveryBySource: [],
      physical: 0,
      deliberate: 0,
      upkeep: 0,
      leakage: 0,
      forcedDrain: 0,
      net: 0,
    });
  });

  it("still accumulates wakefulness", () => {
    expect(result.previousWakefulness).toEqual({ hoursAwake: 0 });
    expect(result.wakefulness).toEqual({ hoursAwake: 8 });
  });
});


describe("the balance keeps every contribution apart", () => {
  const result = succeed({
    state: { current: 40_000, allocations: [] },
    hours: 2,
    activity: { mode: "ordinary-waking", activity: "strenuous" },
    upkeep: [{ id: "ren", source: "ren", baseRate: 100, period: "hour" }],
    discreteDeliberate: 500,
    forcedDrain: 250,
    access: REN_III,
  });

  it("reports each term separately", () => {
    /* Strenuous: 50,000 x 0.001 x 50 x 0.5 x 2 hours. */
    expect(result.balance.physical).toBe(2500);
    expect(result.balance.deliberate).toBe(500);
    expect(result.balance.upkeep).toBe(200);
    expect(result.balance.forcedDrain).toBe(250);
    expect(result.balance.recovery).toBe(0);
    expect(result.balance.leakage).toBe(0);
  });

  it("sums them into the net change it actually applied", () => {
    expect(result.balance.net).toBe(-3450);
    expect(result.current).toBe(36_550);
    expect(result.currentChange).toBe(-3450);
  });

  /*
   * Placing Aura through Output is not spending it. A term for allocation
   * would imply otherwise, so there is not one.
   */
  it("has no term for allocation", () => {
    expect(Object.keys(result.balance).sort()).toEqual([
      "deliberate",
      "forcedDrain",
      "leakage",
      "net",
      "physical",
      "recovery",
      "recoveryBySource",
      "upkeep",
    ]);
  });
});


describe("recovery through an interval", () => {
  it("restores nothing while awake and everything while asleep", () => {
    const awake = succeed({
      state: { current: 10_000, allocations: [] },
      hours: 4,
      activity: { mode: "ordinary-waking" },
    });
    const asleep = succeed({
      state: { current: 10_000, allocations: [] },
      hours: 4,
      activity: { mode: "sleep" },
    });

    expect(awake.balance.recovery).toBe(0);
    expect(asleep.balance.recovery).toBe(20_000);
    expect(asleep.current).toBe(30_000);
  });

  it("names the source of everything it restored", () => {
    const result = succeed({
      state: { current: 10_000, allocations: [] },
      hours: 1,
      activity: { mode: "intentional-rest" },
    });

    expect(result.balance.recoveryBySource).toEqual([
      expect.objectContaining({
        source: "natural-regeneration",
        context: "intentional-rest",
        multiplier: 0.5,
        amount: 2500,
      }),
    ]);
  });

  it("clamps at Maximum Aura however long the night is", () => {
    const result = succeed({
      state: { current: 49_000, allocations: [] },
      hours: 12,
      activity: { mode: "sleep" },
    });

    expect(result.current).toBe(50_000);
    expect(result.balance.recovery).toBe(1000);
  });

  /*
   * Resting behind a Zetsu restores Aura faster and leaves the character
   * exactly as short of sleep. Aura debt and sleep debt are different debts.
   */
  it("lets Zetsu rest restore Aura without touching sleep debt", () => {
    const result = succeed({
      state: { current: 0, allocations: [] },
      wakefulness: { hoursAwake: 30 },
      hours: 4,
      activity: {
        mode: "intentional-rest",
        suppression: {
          source: "zetsu-3",
          multiplier: deriveZetsuReplenishmentMultiplier(3),
          forced: false,
        },
      },
      access: REN_III,
    });

    expect(result.balance.recovery).toBe(30_000);
    expect(result.wakefulness.hoursAwake).toBe(34);
    expect(result.fatigue.components.wakefulnessRaw)
      .toBeGreaterThan(result.previousFatigue.components.wakefulnessRaw);
  });

  it("refuses suppression on a character with no nodes to close", () => {
    expect(errorCodes(advance({
      access: UNAWAKENED,
      activity: {
        mode: "intentional-rest",
        suppression: { source: "zetsu-1", multiplier: 1, forced: false },
      },
    }))).toContain("aura.time.suppression.unawakened");
  });
});


describe("sleep pays down both debts", () => {
  const result = succeed({
    state: { current: 10_000, allocations: [] },
    wakefulness: { hoursAwake: 40 },
    hours: 8,
    activity: { mode: "sleep" },
  });

  it("reduces wakefulness at two hours per hour slept", () => {
    expect(result.wakefulness.hoursAwake).toBe(24);
  });

  it("lowers both Fatigue components at once", () => {
    expect(result.previousFatigue.components.auraDepletion).toBe(3);
    expect(result.fatigue.components.auraDepletion).toBe(0);
    expect(result.fatigue.components.wakefulnessRaw)
      .toBeLessThan(result.previousFatigue.components.wakefulnessRaw);
    expect(result.fatigue.level).toBeLessThan(result.previousFatigue.level);
  });

  it("never drives the sleep debt below zero", () => {
    expect(succeed({
      wakefulness: { hoursAwake: 4 },
      hours: 8,
      activity: { mode: "sleep" },
    }).wakefulness.hoursAwake).toBe(0);
  });
});


describe("intentional rest is not sleep", () => {
  it("recovers Aura and still adds to the sleep debt", () => {
    const result = succeed({
      state: { current: 0, allocations: [] },
      wakefulness: { hoursAwake: 20 },
      hours: 6,
      activity: { mode: "intentional-rest" },
    });

    expect(result.balance.recovery).toBe(15_000);
    expect(result.wakefulness.hoursAwake).toBe(26);
  });

  it("lowers only the depletion half of Fatigue", () => {
    /* Half rate, so refilling 50,000 from empty takes twenty hours of it. */
    const result = succeed({
      state: { current: 0, allocations: [] },
      wakefulness: { hoursAwake: 24 },
      hours: 20,
      activity: { mode: "intentional-rest" },
    });

    expect(result.current).toBe(50_000);
    expect(result.previousFatigue.components.auraDepletion).toBe(5);
    expect(result.fatigue.components.auraDepletion).toBe(0);

    /* And twenty more hours awake, which the other half duly charges for. */
    expect(result.wakefulness.hoursAwake).toBe(44);
    expect(result.fatigue.components.wakefulnessRaw)
      .toBeGreaterThan(result.previousFatigue.components.wakefulnessRaw);
  });
});


describe("sustained activity and discrete actions", () => {
  it("charges an activity level per hour", () => {
    const result = succeed({
      state: { current: 50_000, allocations: [] },
      hours: 3,
      activity: { mode: "ordinary-waking", activity: "moderate" },
    });

    /* 50,000 x 0.001 x 15 x 0.5 x 3. */
    expect(result.balance.physical).toBe(1125);
  });

  it("accepts a raw per-hour load for a caller with a finer figure", () => {
    const named = succeed({
      state: { current: 50_000, allocations: [] },
      activity: { mode: "ordinary-waking", activity: "strenuous" },
    });
    const raw = succeed({
      state: { current: 50_000, allocations: [] },
      activity: { mode: "ordinary-waking", activityLoadPerHour: 50 },
    });

    expect(raw.balance.physical).toBe(named.balance.physical);
  });

  /*
   * An hour described as "strenuous" already includes the swinging. A caller
   * resolving individual blows inside it describes the hour as quieter, and
   * the two never overlap because the caller chooses which to supply.
   */
  it("does not charge sustained and discrete effort for the same work", () => {
    const sustainedOnly = succeed({
      state: { current: 50_000, allocations: [] },
      activity: { mode: "ordinary-waking", activity: "strenuous" },
    });
    const discreteOnly = succeed({
      state: { current: 50_000, allocations: [] },
      activity: { mode: "ordinary-waking" },
      discretePhysical: sustainedOnly.balance.physical,
    });

    expect(discreteOnly.balance.physical).toBe(sustainedOnly.balance.physical);

    const both = succeed({
      state: { current: 50_000, allocations: [] },
      activity: { mode: "ordinary-waking", activity: "strenuous" },
      discretePhysical: 100,
    });

    expect(both.balance.physical).toBe(sustainedOnly.balance.physical + 100);
  });

  it("rejects a nonsense load or contribution", () => {
    expect(errorCodes(advance({
      activity: { mode: "ordinary-waking", activityLoadPerHour: -5 },
    }))).toContain("aura.exertion.load.invalid");

    expect(errorCodes(advance({ discretePhysical: Number.NaN })))
      .toContain("aura.time.contribution.invalid");

    expect(errorCodes(advance({ forcedDrain: -1 })))
      .toContain("aura.time.contribution.invalid");

    expect(errorCodes(advance({ hours: -1 })))
      .toContain("aura.time.duration.invalid");
  });
});


describe("upkeep across an interval", () => {
  it("charges each maintained effect and reports it", () => {
    const result = succeed({
      state: { current: 50_000, allocations: [] },
      hours: 2,
      access: REN_III,
      upkeep: [
        { id: "ren", source: "ren", baseRate: 100, period: "hour" },
        { id: "ken", source: "ken", baseRate: 1, period: "round" },
      ],
    });

    expect(result.balance.upkeep).toBe(200 + 1200);
    expect(result.upkeepCharges.map((charge) => charge.id))
      .toEqual(["ren", "ken"]);
    expect(result.upkeepShutdowns).toEqual([]);
  });

  /*
   * Hours passing is not a request that can be refused. A Ren that ran out of
   * Aura at 03:00 did not fail to happen — it dropped.
   */
  it("shuts an unaffordable effect down rather than failing the interval", () => {
    const result = succeed({
      state: { current: 150, allocations: [] },
      hours: 2,
      access: REN_III,
      upkeep: [{ id: "ren", source: "ren", baseRate: 100, period: "hour" }],
    });

    expect(result.upkeepCharges).toEqual([]);
    expect(result.upkeepShutdowns).toEqual([{
      id: "ren",
      source: "ren",
      reason: "insufficient-aura",
      requiredAura: 200,
      availableAura: 150,
    }]);
    expect(result.balance.upkeep).toBe(0);
    expect(result.current).toBe(150);
  });

  /* Half-paying an upkeep would leave a Ren running on Aura nobody had. */
  it("drops what it cannot afford in full and keeps what it can", () => {
    const result = succeed({
      state: { current: 250, allocations: [] },
      hours: 1,
      access: REN_III,
      upkeep: [
        { id: "cheap", source: "in", baseRate: 200, period: "hour" },
        { id: "dear", source: "ren", baseRate: 400, period: "hour" },
      ],
    });

    expect(result.upkeepCharges.map((charge) => charge.id)).toEqual(["cheap"]);
    expect(result.upkeepShutdowns.map((shutdown) => shutdown.id))
      .toEqual(["dear"]);
    expect(result.current).toBe(50);
  });

  /*
   * Baseline Ten occupies Output and costs nothing, so an awakened character
   * doing nothing pays nothing. Pseudo-Chu likewise.
   */
  it("charges nothing for baseline Ten or pseudo-Chu", () => {
    for (const access of [WITH_TEN, UNAWAKENED]) {
      const result = succeed({
        state: { current: 25_000, allocations: [] },
        hours: 24,
        access,
      });

      expect(result.balance.upkeep).toBe(0);
      expect(result.currentChange).toBe(0);
    }
  });
});


describe("uncontained leakage over time", () => {
  const STANDARD = { con: 10, vit: 10, dex: 10 } as const;

  it("empties a standard full reserve in exactly 48 hours", () => {
    const result = succeed({
      attributes: STANDARD,
      access: UNCONTAINED,
      state: { current: deriveMaximumAura(auraTestAttributes(STANDARD)), allocations: [] },
      hours: 48,
      activity: { mode: "ordinary-waking" },
    });

    expect(result.balance.leakage).toBeCloseTo(10, 10);
    expect(result.current).toBe(0);
    expect(result.collapse).not.toBeNull();
    expect(result.collapse!.atHours).toBeCloseTo(48, 8);
  });

  it("leaves something at 47 hours", () => {
    const result = succeed({
      attributes: STANDARD,
      access: UNCONTAINED,
      state: { current: 10, allocations: [] },
      hours: 47,
      activity: { mode: "ordinary-waking" },
    });

    expect(result.current).toBeGreaterThan(0);
    expect(result.collapse).toBeNull();
  });

  it("collapses a partially depleted character sooner", () => {
    const result = succeed({
      attributes: STANDARD,
      access: UNCONTAINED,
      state: { current: 5, allocations: [] },
      hours: 48,
      activity: { mode: "ordinary-waking" },
    });

    expect(result.collapse).not.toBeNull();
    expect(result.collapse!.atHours).toBeCloseTo(24, 8);
  });

  it("gives a larger pool its own wakefulness limit rather than more", () => {
    const result = succeed({
      access: UNCONTAINED,
      state: { current: 50_000, allocations: [] },
      hours: 120,
      activity: { mode: "ordinary-waking" },
    });

    expect(result.current).toBe(0);
    expect(result.collapse!.atHours).toBeCloseTo(120, 8);
  });

  /* Leakage is not something the character is doing. */
  it("bypasses Control", () => {
    const leaked = [7, 22, 30].map((dex) => succeed({
      attributes: { ...STANDARD, dex },
      access: UNCONTAINED,
      state: { current: 10, allocations: [] },
      hours: 10,
      activity: { mode: "ordinary-waking" },
    }).balance.leakage);

    expect(leaked[0]).toBeCloseTo(leaked[1]!, 12);
    expect(leaked[1]).toBeCloseTo(leaked[2]!, 12);
  });

  it("asks for forced Zetsu and a blackout when it empties them", () => {
    const result = succeed({
      attributes: STANDARD,
      access: UNCONTAINED,
      state: { current: 10, allocations: [] },
      hours: 48,
      activity: { mode: "ordinary-waking" },
    });

    expect(result.collapse!.reason).toBe("uncontained-leakage-exhausted");
    expect([...result.collapse!.requests]).toEqual([
      "end-uncontained-state",
      "forced-zetsu",
      "blackout",
      "clear-usable-output",
    ]);
    expect(result.fatigue.components.auraDepletion).toBe(5);
  });

  /*
   * Collapse is specifically an uncontained death spiral. A character who
   * spent themselves to nothing made a choice and is merely empty.
   */
  it("does not collapse a character who merely spent everything", () => {
    const result = succeed({
      state: { current: 500, allocations: [] },
      activity: { mode: "ordinary-waking" },
      discretePhysical: 500,
    });

    expect(result.current).toBe(0);
    expect(result.collapse).toBeNull();
  });

  it("leaves a contained character alone", () => {
    for (const access of [WITH_TEN, UNAWAKENED]) {
      const result = succeed({
        attributes: STANDARD,
        access,
        state: { current: 10, allocations: [] },
        hours: 48,
        activity: { mode: "ordinary-waking" },
      });

      expect(result.balance.leakage).toBe(0);
      expect(result.collapse).toBeNull();
    }
  });
});


describe("reconciliation and Fatigue across an interval", () => {
  it("reconciles allocations the shrunken reserve cannot support", () => {
    const result = succeed({
      access: REN_III,
      state: {
        current: 2000,
        allocations: [{
          id: "ken",
          coverage: "whole-body",
          placement: "surface",
          aura: 1500,
        }],
      },
      hours: 1,
      activity: { mode: "ordinary-waking", activity: "extreme" },
    });

    /* Extreme: 50,000 x 0.001 x 100 x 0.5 = 2,500, capped by the reserve. */
    expect(result.current).toBe(0);
    expect(result.state.allocations[0]!.aura).toBe(0);
    expect(result.allocationChanges)
      .toEqual([expect.objectContaining({ kind: "reduced" })]);
  });

  it("reports Fatigue before and after", () => {
    const result = succeed({
      state: { current: 50_000, allocations: [] },
      wakefulness: { hoursAwake: 100 },
      hours: 8,
      activity: { mode: "ordinary-waking", activity: "extreme" },
    });

    /* 100 hours of a 120-hour limit is 6.94 raw, on a full reserve. */
    expect(result.previousFatigue.level).toBe(6);

    /* Eight hours of extreme work spends 20,000, adding a depletion band. */
    expect(result.fatigue.components.auraDepletion).toBe(1);
    expect(result.fatigue.level).toBe(9);
    expect(result.fatigue.canFight).toBe(false);
    expect(result.fatigue.wakefulness.hoursAwake).toBe(108);
  });

  it("puts a character past their wakefulness limit into blackout", () => {
    const result = succeed({
      state: { current: 50_000, allocations: [] },
      wakefulness: { hoursAwake: 115 },
      hours: 10,
      activity: { mode: "ordinary-waking" },
    });

    expect(result.wakefulness.hoursAwake).toBe(125);
    expect(result.fatigue.level).toBe(10);
    expect(result.fatigue.state).toBe("blackout");
    expect(result.fatigue.conscious).toBe(false);
  });
});


describe("immutability and determinism", () => {
  const state: CharacterAuraState = {
    current: 20_000,
    allocations: [{
      id: "ken",
      coverage: "whole-body",
      placement: "surface",
      aura: 1000,
    }],
  };

  const wakefulness = { hoursAwake: 12 };

  function run() {
    return advance({
      access: REN_III,
      state,
      wakefulness,
      hours: 3,
      activity: { mode: "ordinary-waking", activity: "moderate" },
      upkeep: [{ id: "ren", source: "ren", baseRate: 50, period: "hour" }],
      forcedDrain: 100,
    });
  }

  it("leaves both stored inputs untouched", () => {
    const auraTaken = JSON.stringify(state);
    const wakeTaken = JSON.stringify(wakefulness);

    run();

    expect(JSON.stringify(state)).toBe(auraTaken);
    expect(JSON.stringify(wakefulness)).toBe(wakeTaken);
  });

  it("returns new objects rather than the ones it was given", () => {
    const result = run();

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.state).not.toBe(state);
    expect(result.payload.wakefulness).not.toBe(wakefulness);
    expect(result.payload.previousWakefulness).toBe(wakefulness);
  });

  it("produces the same answer every time", () => {
    const first = run();
    const second = run();

    expect(first.success && second.success).toBe(true);
    if (!first.success || !second.success) return;

    expect(second.payload).toEqual(first.payload);
  });

  it("explains itself down to each contributing derivation", () => {
    const result = run();

    expect(result.success).toBe(true);
    if (!result.success) return;

    const serialized = JSON.stringify(result.trace.root);

    expect(result.trace.root.id).toBe("aura.time.advance");

    for (const id of [
      "aura.budget.resolve",
      "aura.recovery.apply",
      "aura.control.multiplier",
      "aura.upkeep.derive",
      "body.wakefulness.advance",
    ]) {
      expect([id, serialized.includes(id)]).toEqual([id, true]);
    }
  });

  it("keeps a failed interval's trace as explanatory as a successful one", () => {
    const result = advance({ hours: -1 });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.trace.root.id).toBe("aura.time.advance");
    expect(result.trace.root.output).toBe(false);
  });
});
