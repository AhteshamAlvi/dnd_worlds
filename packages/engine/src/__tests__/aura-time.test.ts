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

import {
  advanceAuraTime,
  SCHEDULED_AURA_EVENT_KINDS,
} from "../character/foundation/aura/time";
import { deriveUncontainedLeakage } from "../character/foundation/aura/leakage";
import type { AdvanceAuraTimeInput } from "../character/foundation/aura/time";
import { deriveMaximumAura } from "../character/foundation/aura/pool";
import { restedWakefulness } from "../character/foundation/body/endurance";
import {
  gameTimeIntervalOf,
  hoursToDuration,
} from "../time/interval";
import type { GameTimestamp } from "../time/types";
import type { AuraAccessInput } from "../character/foundation/aura/types";
import type { CharacterAuraState } from "../character/foundation/aura/state";

import {
  auraContext,
  auraTestAttributes,
  UNAWAKENED,
  UNCONTAINED,
  WITH_TEN,
  withTen,
} from "./fixtures/aura";

/*
 * CON 20 / VIT 20: Maximum Aura 50,000, Physiological Output 10,000.
 *
 * VIT 20's curve rounds to 5,000, so R — half of it — is 2,500. Every rate in
 * this suite is a small multiple of R, and asserting the multiples rather than
 * the products is what makes a changed UNIT and a changed COEFFICIENT fail in
 * different places.
 */
const STRONG = { con: 20, vit: 20, dex: 22 } as const;

const R = 2500;

/*
 * A character holding a technique open, which is what most of the upkeep and
 * boundary scenarios below actually describe.
 *
 * Active Nen zeroes natural regeneration, and these suites want it zeroed:
 * they are testing the SOLVER — where a boundary falls, what is shed first,
 * how simultaneous events settle — and a background 2R an hour would make
 * every expectation a sum of the thing under test and an unrelated rate. It is
 * not a convenience switch; a character paying Ren upkeep is running an active
 * Nen activity, and the recovery table says such a character recovers nothing.
 */
const HOLDING = { mode: "ordinary-waking", activeNenUse: true } as const;

const REN_III: AuraAccessInput = withTen(1, { kind: "output-access", source: "ren-iii", accessFraction: 0.3 });

/*
 * A fixed campaign instant to hang every interval off, so timestamps in
 * assertions are readable offsets rather than epoch arithmetic.
 */
const T0 = 1_000_000_000;

type Options =
  & Partial<Omit<AdvanceAuraTimeInput, "context" | "interval">>
  & {
    readonly attributes?: Parameters<typeof auraTestAttributes>[0];
    readonly access?: AuraAccessInput;
    readonly hours?: number;
    readonly startedAt?: GameTimestamp;
  };

function advance(options: Options = {}) {
  const {
    attributes = STRONG,
    access = WITH_TEN,
    state = { current: 0, allocations: [] },
    wakefulness = restedWakefulness(),
    hours = 1,
    startedAt = T0,
    activity = { mode: "ordinary-waking" as const },
    ...rest
  } = options;

  return advanceAuraTime({
    state,
    wakefulness,
    context: auraContext({ attributes, access }),
    interval: gameTimeIntervalOf(startedAt, hoursToDuration(hours)),
    activity,
    ...rest,
  });
}

/** One instantaneous event, at an offset in hours from the interval start. */
function at(
  hours: number,
  kind: "deliberate" | "forced-drain" | "recovery",
  amount: number,
  source: string = kind,
) {
  return { at: T0 + hoursToDuration(hours), kind, source, amount } as const;
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
    state: { current: 0, allocations: [] },
    hours: 8,
    activity: { mode: "ordinary-waking" },
  });

  /*
   * An ordinary day RECOVERS, and that is the correction. It used to restore
   * nothing at all, which made a character who did not sleep never recover —
   * so every long scene without a bed was a one-way ratchet. A contained
   * character going about their day now regains 2R an hour, and spends
   * nothing, because merely being awake is not effort.
   */
  it("recovers at 2R an hour and spends nothing", () => {
    expect(result.balance.recovery).toBe(2 * R * 8);
    expect(result.balance.physical).toBe(0);
    expect(result.balance.leakage).toBe(0);
    expect(result.balance.upkeep).toBe(0);
    expect(result.balance.deliberate).toBe(0);
    expect(result.balance.forcedDrain).toBe(0);
  });

  it("still accumulates wakefulness, which recovery does not touch", () => {
    expect(result.previousWakefulness)
      .toEqual({ hoursAwake: 0, consecutiveSleepHours: 0 });
    expect(result.wakefulness)
      .toEqual({ hoursAwake: 8, consecutiveSleepHours: 0 });
  });
});


describe("the balance keeps every contribution apart", () => {
  const result = succeed({
    state: { current: 40_000, allocations: [] },
    hours: 2,
    activity: { mode: "ordinary-waking", activity: "strenuous" },
    upkeep: [{ id: "ren", source: "ren", baseRate: 100, period: "hour" }],
    instantaneous: [at(0.5, "deliberate", 500), at(1, "forced-drain", 250)],
    access: REN_III,
  });

  it("reports each term separately", () => {
    /* Working the body: 2R an hour for two hours, whatever the level. */
    expect(result.balance.physical).toBe(2 * R * 2);
    expect(result.balance.deliberate).toBe(500);
    expect(result.balance.upkeep).toBe(200);
    expect(result.balance.forcedDrain).toBe(250);

    /* And the physical recovery column, which is R rather than 2R. */
    expect(result.balance.recovery).toBe(R * 2);
    expect(result.balance.leakage).toBe(0);
  });

  it("sums them into the net change it actually applied", () => {
    const expected = R * 2 - 2 * R * 2 - 500 - 200 - 250;

    expect(result.balance.net).toBe(expected);
    expect(result.currentChange).toBe(expected);
    expect(result.current).toBe(40_000 + expected);
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
  it("restores twice as much asleep as awake, rather than all or nothing", () => {
    const awake = succeed({
      state: { current: 10_000, allocations: [] },
      hours: 4,
      activity: { mode: "ordinary-waking" },
    });
    const resting = succeed({
      state: { current: 10_000, allocations: [] },
      hours: 4,
      activity: { mode: "intentional-rest" },
    });
    const asleep = succeed({
      state: { current: 10_000, allocations: [] },
      hours: 4,
      activity: { mode: "sleep" },
    });

    expect(awake.balance.recovery).toBe(2 * R * 4);
    expect(resting.balance.recovery).toBe(3 * R * 4);
    expect(asleep.balance.recovery).toBe(4 * R * 4);

    expect(asleep.current).toBe(50_000);
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
        ratePerHour: R,
        multiplier: 3,
        hours: 1,
        potential: 3 * R,
        used: 3 * R,
        discarded: 0,
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

    /*
     * 1,000 was all there was room for, and every point of it arrived before
     * the eight-hour completion boundary — so the top-off, which fires at that
     * boundary, has nothing left to add.
     */
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
        suppression: { source: "zetsu-3", forced: false },
      },
      access: REN_III,
    });

    /* Suppressed rest is 4R, against the 3R an unsuppressed rest earns. */
    expect(result.balance.recovery).toBe(4 * R * 4);
    expect(result.wakefulness.hoursAwake).toBe(34);
    expect(result.fatigue.components.wakefulnessRaw)
      .toBeGreaterThan(result.previousFatigue.components.wakefulnessRaw);
  });

  it("refuses suppression on a character with no nodes to close", () => {
    expect(errorCodes(advance({
      access: UNAWAKENED,
      activity: {
        mode: "intentional-rest",
        suppression: { source: "zetsu-1", forced: false },
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

    expect(result.balance.recovery).toBe(3 * R * 6);
    expect(result.wakefulness.hoursAwake).toBe(26);
  });

  it("lowers only the depletion half of Fatigue", () => {
    /* 3R an hour, so refilling 50,000 from empty takes under seven hours. */
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


describe("working the body costs time, not swings", () => {
  it("charges a flat 2R an hour whenever the body is working", () => {
    const result = succeed({
      state: { current: 50_000, allocations: [] },
      hours: 3,
      activity: { mode: "ordinary-waking", activity: "moderate" },
    });

    expect(result.balance.physical).toBe(2 * R * 3);
  });

  /*
   * The magnitude of the effort buys nothing any more. A "moderate" hour and
   * an "extreme" one cost the same, because what is being modelled is the body
   * running hot rather than how many times it moved — and because the old
   * scaling made a superhuman's ordinary hour cost thousands of times an
   * ordinary person's.
   */
  it("charges the same for every level above ordinary waking", () => {
    const charged = (activity: "light" | "moderate" | "strenuous" | "extreme") =>
      succeed({
        state: { current: 50_000, allocations: [] },
        activity: { mode: "ordinary-waking", activity },
      }).balance.physical;

    expect(new Set([
      charged("light"),
      charged("moderate"),
      charged("strenuous"),
      charged("extreme"),
    ]).size).toBe(1);
  });

  it("charges nothing at all for an ordinary waking hour", () => {
    expect(succeed({
      state: { current: 50_000, allocations: [] },
      activity: { mode: "ordinary-waking" },
    }).balance.physical).toBe(0);
  });

  it("still reads a raw per-hour load as exertion", () => {
    const named = succeed({
      state: { current: 50_000, allocations: [] },
      activity: { mode: "ordinary-waking", activity: "strenuous" },
    });
    const raw = succeed({
      state: { current: 50_000, allocations: [] },
      activity: { mode: "ordinary-waking", activityLoadPerHour: 50 },
    });

    expect(raw.balance.physical).toBe(named.balance.physical);
    expect(raw.balance.physical).toBeGreaterThan(0);
  });

  /*
   * Exertion costs Aura AND costs recovery, and the two are separate terms.
   * A working hour earns R instead of 2R and spends 2R, which nets a
   * contained character R an hour down whoever they are.
   */
  it("halves the recovery as well as adding the cost", () => {
    const working = succeed({
      state: { current: 25_000, allocations: [] },
      activity: { mode: "ordinary-waking", activity: "strenuous" },
    });

    expect(working.balance.recovery).toBe(R);
    expect(working.balance.physical).toBe(2 * R);
    expect(working.balance.net).toBe(-R);
  });

  /*
   * There is no per-action physical charge to double up with. The `physical`
   * scheduled-event kind is gone, which is what makes "charged twice for one
   * swing" unrepresentable rather than merely discouraged.
   */
  it("has no scheduled physical event to charge effort twice", () => {
    expect(SCHEDULED_AURA_EVENT_KINDS).not.toContain("physical");

    expect(errorCodes(advance({
      instantaneous: [at(0.5, "physical" as "deliberate", 100)],
    }))).toContain("aura.timeline.event.kind.invalid");
  });

  it("rejects a nonsense load or contribution", () => {
    expect(errorCodes(advance({
      activity: { mode: "ordinary-waking", activityLoadPerHour: -5 },
    }))).toContain("aura.exertion.load.invalid");

    expect(errorCodes(advance({
      instantaneous: [at(0.5, "deliberate", Number.NaN)],
    }))).toContain("aura.timeline.event.amount.invalid");

    expect(errorCodes(advance({
      instantaneous: [at(0.5, "forced-drain", -1)],
    }))).toContain("aura.timeline.event.amount.invalid");

    /* A backwards interval is the Time domain's refusal, not Aura's. */
    expect(errorCodes(advance({ hours: -1 })))
      .toContain("time.interval.reversed");
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

    expect(result.balance.upkeep).toBe(200 + 3600);
    expect(result.upkeepCharges.map((charge) => charge.id))
      .toEqual(["ren", "ken"]);
    expect(result.upkeepShutdowns).toEqual([]);
  });

  /*
   * The ticket's worked example, and the behaviour that replaced interval-wide
   * affordability. An effect the character can carry for part of the span is
   * carried for that part — it did not fail to happen, it ran and then dropped.
   */
  it("charges an unaffordable effect up to its exact shutdown moment", () => {
    const result = succeed({
      state: { current: 150, allocations: [] },
      hours: 2,
      access: REN_III,
      activity: HOLDING,
      upkeep: [{ id: "ren", source: "ren", baseRate: 100, period: "hour" }],
    });

    expect(result.balance.upkeep).toBeCloseTo(150, 8);
    expect(result.upkeepCharges[0]!.cost).toBeCloseTo(150, 8);

    expect(result.upkeepShutdowns).toHaveLength(1);
    expect(result.upkeepShutdowns[0]).toEqual(expect.objectContaining({
      id: "ren",
      reason: "insufficient-aura",
      ratePerHour: 100,
    }));
    expect(result.upkeepShutdowns[0]!.at)
      .toBeCloseTo(T0 + hoursToDuration(1.5), 6);

    /* And the remaining half hour resolves without it. */
    expect(result.current).toBe(0);
  });

  /*
   * Shedding stops as soon as what remains is sustainable. A contained rest
   * recovers 3R — 7,500 an hour — which cannot carry 20,000 of upkeep and can
   * comfortably carry 4,000.
   */
  it("sheds the lowest priority first and keeps what the balance sustains", () => {
    const result = succeed({
      state: { current: 1000, allocations: [] },
      hours: 4,
      access: REN_III,
      activity: { mode: "intentional-rest" },
      upkeep: [
        { id: "expendable", source: "in", baseRate: 16_000, period: "hour", priority: 0 },
        { id: "essential", source: "ren", baseRate: 4000, period: "hour", priority: 5 },
      ],
    });

    expect(result.upkeepShutdowns.map((shutdown) => shutdown.id))
      .toEqual(["expendable"]);

    /* The survivor is paid for out of incoming recovery, indefinitely. */
    expect(result.current).toBeGreaterThan(0);
    expect(result.upkeepCharges.find((charge) => charge.id === "essential"))
      .toBeDefined();
  });

  /* Equal priorities break by id, never by the order the caller built. */
  it("sheds deterministically when priorities tie", () => {
    const forward = succeed({
      state: { current: 250, allocations: [] },
      hours: 1,
      access: REN_III,
      activity: HOLDING,
      upkeep: [
        { id: "aaa", source: "in", baseRate: 200, period: "hour" },
        { id: "zzz", source: "ren", baseRate: 400, period: "hour" },
      ],
    });
    const reversed = succeed({
      state: { current: 250, allocations: [] },
      hours: 1,
      access: REN_III,
      activity: HOLDING,
      upkeep: [
        { id: "zzz", source: "ren", baseRate: 400, period: "hour" },
        { id: "aaa", source: "in", baseRate: 200, period: "hour" },
      ],
    });

    expect(forward.upkeepShutdowns.map((shutdown) => shutdown.id))
      .toEqual(reversed.upkeepShutdowns.map((shutdown) => shutdown.id));
    expect(forward.upkeepShutdowns[0]!.id).toBe("zzz");
  });

  /*
   * Baseline Ten occupies Output and costs nothing, so an awakened character
   * doing nothing pays nothing. Pseudo-Chu likewise.
   */
  /*
   * Neither is an upkeep commitment, so neither appears in the charges. The
   * reserve still MOVES for both — an ordinary day recovers 2R, and an
   * unawakened character's pores lose 2R against that same 2R — but nothing
   * that moved it was upkeep.
   */
  it("charges nothing for baseline Ten or pseudo-Chu", () => {
    for (const access of [WITH_TEN, UNAWAKENED]) {
      const result = succeed({
        state: { current: 25_000, allocations: [] },
        hours: 24,
        access,
      });

      expect(result.balance.upkeep).toBe(0);
      expect(result.upkeepCharges).toEqual([]);
      expect(result.upkeepShutdowns).toEqual([]);
    }
  });

  /*
   * And the specific claim that used to be made by asserting no net change at
   * all: an ordinary person breaks even. 2R in, 2R out, all day.
   */
  it("leaves an unawakened character exactly where they started", () => {
    const result = succeed({
      state: { current: 25_000, allocations: [] },
      hours: 24,
      access: UNAWAKENED,
    });

    expect(result.balance.recovery).toBe(2 * R * 24);
    expect(result.balance.leakage).toBe(2 * R * 24);
    expect(result.currentChange).toBeCloseTo(0, 8);
  });
});


describe("uncontained leakage over time", () => {
  const STANDARD = { con: 10, vit: 10, dex: 10 } as const;

  /*
   * Minutes, not days.
   *
   * These tests used to assert 48 hours, from the old `A_max / H_wake` rule.
   * The rate is now the Physiological Output Capacity per minute — open nodes
   * bleed at the rate those nodes can pass — and a fresh awakener is in
   * immediate trouble rather than slowly declining.
   *
   * The CON 10 / VIT 10 character has 10 Maximum Aura and 2 Output, so they
   * leak 2 a minute and are empty in five.
   */
  const MINUTE = 1 / 60;

  /*
   * The five minutes is the NO-RECOVERY projection, and the solver takes a
   * shade longer — because an uncontained character still regenerates R an
   * hour while they bleed 60O. The projection is what a GM asks for ("how long
   * has this person got"); the solver composes the leak with everything else,
   * and the two are deliberately not the same number.
   *
   * At CON 10 / VIT 10: 10 Maximum Aura, 2 Output, so 120 an hour out against
   * R = 0.5 an hour in.
   */
  const STANDARD_LEAK_PER_HOUR = 120;
  const STANDARD_R = 0.5;
  const STANDARD_NET = STANDARD_LEAK_PER_HOUR - STANDARD_R;

  it("projects exactly five minutes, and takes slightly longer in practice", () => {
    expect(deriveUncontainedLeakage(2, 10).minutesToExhaustion).toBe(5);

    const result = succeed({
      attributes: STANDARD,
      access: UNCONTAINED,
      state: { current: deriveMaximumAura(auraTestAttributes(STANDARD)), allocations: [] },
      hours: 10 * MINUTE,
      activity: { mode: "ordinary-waking" },
    });

    expect(result.collapse).not.toBeNull();
    const minutes = (result.collapse!.at - T0) / hoursToDuration(1) * 60;

    expect(minutes).toBeCloseTo(60 * 10 / STANDARD_NET, 6);

    /* Which is five minutes and a fraction, not five and a half. */
    expect(minutes).toBeGreaterThan(5);
    expect(minutes).toBeLessThan(5.1);
  });

  it("leaves something at four minutes", () => {
    const result = succeed({
      attributes: STANDARD,
      access: UNCONTAINED,
      state: { current: 10, allocations: [] },
      hours: 4 * MINUTE,
      activity: { mode: "ordinary-waking" },
    });

    expect(result.current).toBeGreaterThan(0);
    expect(result.collapse).toBeNull();
  });

  it("collapses a partially depleted character sooner, proportionally", () => {
    const result = succeed({
      attributes: STANDARD,
      access: UNCONTAINED,
      state: { current: 5, allocations: [] },
      hours: 10 * MINUTE,
      activity: { mode: "ordinary-waking" },
    });

    expect(result.collapse).not.toBeNull();

    const minutes = (result.collapse!.at - T0) / hoursToDuration(1) * 60;

    expect(minutes).toBeCloseTo(60 * 5 / STANDARD_NET, 6);
  });

  /*
   * A larger pool buys NO more time, and for a sharper reason than before:
   * Output Capacity grows with CON on its own curve, and the ratio of reserve
   * to Output is the same five minutes at every power level. A CON 20 / VIT 20
   * character has 50,000 Aura and 10,000 Output — five minutes, exactly like
   * the ordinary one.
   */
  it("gives a far larger pool exactly the same time", () => {
    const ordinary = succeed({
      attributes: STANDARD,
      access: UNCONTAINED,
      state: { current: 10, allocations: [] },
      hours: 10 * MINUTE,
      activity: { mode: "ordinary-waking" },
    });

    const superhuman = succeed({
      access: UNCONTAINED,
      state: { current: 50_000, allocations: [] },
      hours: 10 * MINUTE,
      activity: { mode: "ordinary-waking" },
    });

    expect(superhuman.collapse).not.toBeNull();

    /*
     * Identical to the last significant figure, and not by luck: reserve,
     * Output and Regeneration all scale on curves whose ratios are the same at
     * every power level, so the recovery term shifts both characters by
     * exactly the same proportion.
     */
    expect(superhuman.collapse!.at - T0)
      .toBeCloseTo(ordinary.collapse!.at - T0, -1);
  });

  /* Leakage is not something the character is doing. */
  it("bypasses Control", () => {
    const leaked = [7, 22, 30].map((dex) => succeed({
      attributes: { ...STANDARD, dex },
      access: UNCONTAINED,
      state: { current: 10, allocations: [] },
      hours: MINUTE,
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
      hours: 10 * MINUTE,
      activity: { mode: "ordinary-waking" },
    });

    expect(result.collapse!.reason).toBe("uncontained-leakage-exhausted");
    expect([...result.collapse!.requests]).toEqual([
      "end-uncontained-state",
      "forced-zetsu",
      "blackout",
      "clear-usable-output",
    ]);
    /*
     * The reserve does not stay at zero: forced suppression stops the leak and
     * pays 3R, so the character starts coming back the instant they go down.
     * What is asserted is the collapse, not an empty pool at the end.
     */
    expect(result.current).toBeGreaterThan(0);
  });

  /*
   * Collapse is specifically an uncontained death spiral. A character who
   * spent themselves to nothing made a choice and is merely empty.
   */
  it("does not collapse a character who merely spent everything", () => {
    const result = succeed({
      state: { current: 500, allocations: [] },
      activity: { mode: "ordinary-waking", activeNenUse: true },
      instantaneous: [at(0.5, "deliberate", 500)],
    });

    expect(result.current).toBe(0);
    expect(result.collapse).toBeNull();
  });

  /*
   * The unawakened case is emphatically not this. Half-open nodes leak too,
   * and what escapes becomes pseudo-Chu rather than being lost — so an
   * ordinary person is still there two days later.
   */
  it("leaves a contained character alone", () => {
    for (const access of [WITH_TEN, UNAWAKENED]) {
      const result = succeed({
        attributes: STANDARD,
        access,
        state: { current: 10, allocations: [] },
        hours: 48,
        activity: { mode: "ordinary-waking" },
      });

      expect(result.collapse).toBeNull();
      expect(result.current).toBeGreaterThan(0);
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

    /*
     * Extreme: 50,000 x 0.001 x 100 x 0.5 = 2,500, capped by the reserve.
     *
     * An empty reserve is zero usable Output, so the commitment is RELEASED
     * rather than held at zero. Proportional reduction used to leave it in
     * place at 0 Aura, which was a commitment of nothing that could never come
     * back on its own — reconciliation reduces and removes but never restores,
     * so re-committing is the caller's decision and has to be visible as one.
     */
    expect(result.current).toBe(0);
    expect(result.state.allocations).toEqual([]);
    expect(result.allocationChanges).toEqual([
      expect.objectContaining({
        kind: "removed-budget-exhausted",
        allocationId: "ken",
        reason: "no-capacity",
      }),
    ]);
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


describe("activity combinations reach the solver", () => {
  it("refuses contradictory ordinary inputs", () => {
    expect(errorCodes(advance({
      activity: { mode: "sleep", activity: "extreme" },
    }))).toContain("body.activity.combination.contradictory");

    expect(errorCodes(advance({
      activity: { mode: "intentional-rest", activity: "strenuous" },
    }))).toContain("body.activity.combination.contradictory");
  });

  it("refuses one that appears part-way through", () => {
    expect(errorCodes(advance({
      hours: 4,
      activityChanges: [{
        at: T0 + hoursToDuration(2),
        activity: { mode: "sleep", activity: "extreme" },
      }],
    }))).toContain("body.activity.combination.contradictory");
  });

  it("permits an explicit override", () => {
    const result = succeed({
      state: { current: 50_000, allocations: [] },
      hours: 2,
      activity: {
        mode: "sleep",
        activity: "extreme",
        exertionOverride: {
          source: "nightmare-hatsu",
          reason: "The ability drives the body while its owner sleeps.",
        },
      },
    });

    /* Sleeping, so recovering — and exerting, so paying for it. */
    expect(result.balance.physical).toBeGreaterThan(0);
    expect(result.balance.recovery).toBeGreaterThan(0);
    expect(result.wakefulness.hoursAwake).toBe(0);
  });
});


describe("boundaries inside one interval", () => {
  /*
   * A boundary is calculated, not searched for. Filling exactly half way
   * through a span has to land on the timeline, not at the end of it.
   */
  it("marks the moment the pool fills", () => {
    const result = succeed({
      state: { current: 45_000, allocations: [] },
      hours: 4,
      activity: { mode: "sleep" },
    });

    const full = result.events.find((event) => event.kind === "aura-full");

    /* 4R while asleep is 10,000 an hour, so 5,000 short takes half of one. */
    expect(full).toBeDefined();
    expect(full!.at).toBeCloseTo(T0 + hoursToDuration(0.5), 6);
  });

  it("marks the moment the pool empties", () => {
    const result = succeed({
      state: { current: 2500, allocations: [] },
      hours: 4,
      access: REN_III,
      activity: HOLDING,
      upkeep: [{ id: "ren", source: "ren", baseRate: 1000, period: "hour" }],
    });

    const empty = result.events.find((event) => event.kind === "aura-empty");

    expect(empty).toBeDefined();
    expect(empty!.at).toBeCloseTo(T0 + hoursToDuration(2.5), 6);
  });

  it("starts and expires a timed effect at its own instants", () => {
    const result = succeed({
      state: { current: 50_000, allocations: [] },
      hours: 4,
      access: REN_III,
      upkeep: [{
        id: "ken",
        source: "ken",
        baseRate: 1000,
        period: "hour",
        startsAt: T0 + hoursToDuration(1),
        endsAt: T0 + hoursToDuration(3),
      }],
    });

    /* Two hours of it, and nothing either side. */
    expect(result.balance.upkeep).toBeCloseTo(2000, 8);

    expect(result.events.map((event) => event.kind))
      .toEqual(expect.arrayContaining(["upkeep-started", "upkeep-expired"]));
  });

  it("resolves an instantaneous action at its own timestamp", () => {
    const result = succeed({
      state: { current: 1000, allocations: [] },
      hours: 4,
      activity: { mode: "intentional-rest" },
      instantaneous: [at(2, "forced-drain", 20_000)],
    });

    /*
     * Resting recovers 3R — 7,500 an hour. The drain lands at hour two, by
     * which point there is 16,000 to take it from, so 16,000 of it lands and
     * 4,000 goes unmet; the last two hours then refill. Smeared across the
     * interval it would have emptied the pool at a different moment entirely.
     */
    expect(result.balance.forcedDrain).toBe(20_000);
    expect(result.unmetDrain).toBeCloseTo(4000, 6);
    expect(result.current).toBeCloseTo(3 * R * 2, 6);
  });

  it("reports every segment it cut the interval into", () => {
    const result = succeed({
      state: { current: 45_000, allocations: [] },
      hours: 4,
      activity: { mode: "sleep" },
    });

    expect(result.segments[0]!.startedAt).toBe(T0);
    expect(result.segments.at(-1)!.endedAt)
      .toBeCloseTo(T0 + hoursToDuration(4), 6);

    for (const segment of result.segments) {
      expect(segment.endedAt).toBeGreaterThan(segment.startedAt);
    }
  });
});


describe("recovery is netted before the pool is clamped", () => {
  /*
   * The ticket's worked example, and the case the old whole-interval clamp got
   * wrong: at full Aura, incoming regeneration pays an upkeep indefinitely and
   * the surplus is discarded.
   */
  it("offsets upkeep out of generation while already full", () => {
    const result = succeed({
      state: { current: 50_000, allocations: [] },
      hours: 1,
      access: REN_III,
      activity: { mode: "sleep" },
      upkeep: [{ id: "ren", source: "ren", baseRate: 100, period: "hour" }],
    });

    expect(result.current).toBe(50_000);
    expect(result.recovery.potential).toBe(4 * R);
    expect(result.recovery.used).toBe(100);
    expect(result.recovery.discarded).toBe(4 * R - 100);
    expect(result.balance.upkeep).toBe(100);
  });

  it("reports the drain an empty pool could not pay for", () => {
    const result = succeed({
      state: { current: 100, allocations: [] },
      hours: 2,
      activity: { mode: "ordinary-waking", activity: "extreme" },
    });

    expect(result.current).toBe(0);
    expect(result.unmetDrain).toBeGreaterThan(0);
  });

  /*
   * The terms have to add up to the number they claim to. `net` is the
   * unclamped sum; `currentChange` is what the pool actually did; `unmetDrain`
   * is exactly the difference when it bottomed out.
   */
  it("makes the balance's own terms sum to its net", () => {
    for (const scenario of [
      { state: { current: 30_000, allocations: [] }, hours: 3,
        activity: { mode: "sleep" as const } },
      { state: { current: 100, allocations: [] }, hours: 2,
        activity: { mode: "ordinary-waking" as const, activity: "extreme" as const } },
      { state: { current: 5000, allocations: [] }, hours: 2, access: REN_III,
        upkeep: [{ id: "ren", source: "ren", baseRate: 100, period: "hour" as const }],
        instantaneous: [at(1, "forced-drain", 400)] },
    ]) {
      const result = succeed(scenario);
      const { balance } = result;

      expect(balance.net).toBeCloseTo(
        balance.recovery - balance.physical - balance.deliberate -
        balance.upkeep - balance.leakage - balance.forcedDrain,
        8,
      );

      expect(result.currentChange).toBeCloseTo(
        balance.net + result.unmetDrain,
        8,
      );
    }
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
      instantaneous: [at(1, "forced-drain", 100)],
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
      "time.interval.validate",
      "aura.budget.resolve",
      "aura.control.multiplier",
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


/*
 * Events sharing one instant are not a tiny sequence.
 *
 * The solver already gathered them so the CALLER'S array order could not
 * change the answer; netting them is the same argument applied to the two
 * kinds. Recovery clamped before drains were applied still had one of them
 * going first, and the character paid for it.
 */
describe("simultaneous recovery and drain settle together", () => {
  /*
   * Every scenario here holds a technique open, which zeroes natural
   * regeneration — so the only thing moving the pool is the events under test.
   * A background 2R an hour would make each expectation a sum of the netting
   * rule and an unrelated rate.
   */
  /*
   * The reported case. 49,000 of 50,000, taking 3,000 of each at one instant:
   * the recovery overflows only if the drain that makes room for it is held
   * back until afterwards.
   */
  it("makes an equal heal and drain at one instant cancel out", () => {
    const result = succeed({
      state: { current: 49_000, allocations: [] },
      hours: 1,
      activity: HOLDING,
      instantaneous: [at(0.5, "recovery", 3000), at(0.5, "forced-drain", 3000)],
    });

    expect(result.current).toBe(49_000);
    expect(result.recovery.discarded).toBe(0);
    expect(result.unmetDrain).toBe(0);
    expect(result.balance.recovery).toBe(3000);
    expect(result.balance.forcedDrain).toBe(3000);
  });

  it("reaches the same pool whichever kind the caller listed first", () => {
    const scenario = {
      state: { current: 49_000, allocations: [] },
      hours: 1,
      activity: HOLDING,
    } as const;

    const healFirst = succeed({
      ...scenario,
      instantaneous: [at(0.5, "recovery", 3000), at(0.5, "forced-drain", 3000)],
    });

    const drainFirst = succeed({
      ...scenario,
      instantaneous: [at(0.5, "forced-drain", 3000), at(0.5, "recovery", 3000)],
    });

    expect(drainFirst.current).toBe(healFirst.current);
    expect(drainFirst.recovery.discarded).toBe(healFirst.recovery.discarded);
    expect(drainFirst.unmetDrain).toBe(healFirst.unmetDrain);
  });

  /*
   * Netting is not a licence to exceed the cap or to spend an empty pool. The
   * clamp still happens — once, on the settled figure.
   */
  it("still discards recovery the cap has no room for", () => {
    const result = succeed({
      state: { current: 49_000, allocations: [] },
      hours: 1,
      activity: HOLDING,
      instantaneous: [at(0.5, "recovery", 3000), at(0.5, "forced-drain", 500)],
    });

    expect(result.current).toBe(50_000);
    expect(result.recovery.discarded).toBe(1500);
    expect(result.unmetDrain).toBe(0);
  });

  it("still reports drain the netted pool could not pay for", () => {
    const result = succeed({
      state: { current: 1000, allocations: [] },
      hours: 1,
      activity: HOLDING,
      instantaneous: [at(0.5, "recovery", 500), at(0.5, "forced-drain", 3000)],
    });

    expect(result.current).toBe(0);
    expect(result.recovery.discarded).toBe(0);
    expect(result.unmetDrain).toBe(1500);
  });

  /*
   * Overflow has no owner when two heals arrive together, so it is split in
   * proportion — but only what the drains left over actually overflows.
   */
  it("splits only the surviving overflow across simultaneous heals", () => {
    const result = succeed({
      state: { current: 49_000, allocations: [] },
      hours: 1,
      activity: HOLDING,
      instantaneous: [
        at(0.5, "recovery", 1000, "elixir"),
        at(0.5, "recovery", 3000, "healer"),
        at(0.5, "forced-drain", 2000),
      ],
    });

    expect(result.current).toBe(50_000);
    expect(result.recovery.potential).toBe(4000);
    expect(result.recovery.discarded).toBe(1000);

    const bySource = new Map(
      result.balance.recoveryBySource.map((one) => [one.context, one]),
    );

    expect(bySource.get("elixir")?.discarded).toBeCloseTo(250, 8);
    expect(bySource.get("healer")?.discarded).toBeCloseTo(750, 8);
  });
});


describe("contradictory and malformed inputs are refused", () => {
  /*
   * `activity` and `activityLoadPerHour` are documented as alternatives. The
   * resolver preferred the raw number in silence, so an "extreme" activity
   * supplied alongside a load of 0 cost nothing while still reading back as
   * extreme.
   */
  it("rejects a named activity contradicted by a raw load", () => {
    expect(
      errorCodes(advance({
        activity: {
          mode: "ordinary-waking",
          activity: "extreme",
          activityLoadPerHour: 0,
        },
      })),
    ).toContain("aura.activity.load.contradictory");
  });

  it("rejects the contradiction inside a mid-interval activity change", () => {
    expect(
      errorCodes(advance({
        hours: 2,
        activityChanges: [{
          at: T0 + hoursToDuration(1),
          activity: {
            mode: "ordinary-waking",
            activity: "extreme",
            activityLoadPerHour: 0,
          },
        }],
      })),
    ).toContain("aura.activity.load.contradictory");
  });

  /* Redundant but consistent is a caller being explicit, not a mistake. */
  it("accepts both when the number matches the named level", () => {
    const result = advance({
      activity: {
        mode: "ordinary-waking",
        activity: "extreme",
        activityLoadPerHour: 100,
      },
    });

    expect(errorCodes(result)).toEqual([]);
  });

  /*
   * The solver used to repair stored wakefulness with `Math.max(0, ...)`,
   * which made it the one door into the number that accepted a state
   * advanceWakefulness refuses — and NaN walked straight through onto a
   * successful result.
   */
  it("refuses a non-finite stored wakefulness rather than propagating it", () => {
    expect(errorCodes(advance({ wakefulness: { hoursAwake: Number.NaN } })))
      .toContain("body.wakefulness.hours_awake.invalid");
  });

  it("refuses a negative stored wakefulness rather than repairing it", () => {
    expect(errorCodes(advance({ wakefulness: { hoursAwake: -4 } })))
      .toContain("body.wakefulness.hours_awake.invalid");
  });
});
