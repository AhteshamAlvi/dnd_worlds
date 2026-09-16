/*
 * The Aura timeline: what a caller says happened, and who owns which instant.
 *
 * Every case here is a confident wrong answer the solver used to give. It
 * validated as it went, which meant it validated only what it happened to
 * look at — an unrecognised event kind fell through the dispatch and became a
 * forced drain, a NaN suppression multiplier was silently ignored and a
 * different recovery rate used, and an event timestamped fifty hours before
 * the interval was applied inside it anyway.
 *
 * The other half is OWNERSHIP. An interval owns `[startedAt, endedAt)`, so an
 * event on the endpoint belongs to the next interval beginning there. Two
 * adjacent intervals meet at one timestamp, and an inclusive rule would have
 * both apply the same strike.
 */

import { describe, expect, it } from "vitest";

import { advanceAuraTime } from "../character/foundation/aura/time";
import type {
  AuraActivityChange,
  AuraTimeActivity,
  ScheduledAuraEvent,
} from "../character/foundation/aura/time";
import type { AuraUpkeepCommitment } from "../character/foundation/aura/upkeep";
import { restedWakefulness } from "../character/foundation/body/endurance";
import {
  gameTimeIntervalOf,
  hoursToDuration,
  intervalOwns,
  intervalReaches,
} from "../time/interval";
import type { AuraAccessInput } from "../character/foundation/aura/types";
import type { CharacterAuraState } from "../character/foundation/aura/state";

import {
  auraContext,
  UNAWAKENED,
  UNCONTAINED,
  WITH_TEN,
  withTen,
} from "./fixtures/aura";

const T0 = 1_000_000_000;

/* CON 20 / VIT 20: Maximum Aura 50,000, regeneration 5,000/hour. */
const STRONG = { con: 20, vit: 20, dex: 22 } as const;

/*
 * Uncontained leakage is the Physiological Output Capacity PER MINUTE, and
 * CON 20 gives 10,000 of it — so this character bleeds 10,000 Aura a minute
 * and empties their 50,000 reserve in five.
 *
 * These tests therefore run in ROUNDS rather than hours. They used to run in
 * hours against the old `A_max / H_wake` rate, which gave the same character
 * 416.67/hour and 120 hours to live; at the real rate an hour-long interval
 * would be five minutes of leakage and 115 hours of an empty pool, and every
 * assertion about a rate would be an assertion about a clamp.
 */
const ROUND_HOURS = 2 / 3600;
const LEAK_PER_ROUND = 10_000 / 30;

const REN_III: AuraAccessInput = withTen(1, { kind: "output-access", source: "ren-iii", accessFraction: 0.3 });

const ZETSU = { source: "zetsu", forced: false } as const;

/*
 * A character holding a technique open, which zeroes natural regeneration.
 *
 * Used by the scenarios that are about the SOLVER — how simultaneous events
 * net, where a boundary falls — so the only thing moving the pool is the thing
 * under test rather than a background 2R an hour.
 */
const HOLDING = { mode: "ordinary-waking", activeNenUse: true } as const;
const FORCED_ZETSU = { source: "forced-zetsu", forced: true };

interface Options {
  readonly current?: number;
  readonly hours?: number;
  readonly startedAt?: number;
  readonly access?: AuraAccessInput;
  readonly activity?: AuraTimeActivity;
  readonly activityChanges?: readonly AuraActivityChange[];
  readonly upkeep?: readonly AuraUpkeepCommitment[];
  readonly instantaneous?: readonly ScheduledAuraEvent[];
  readonly state?: CharacterAuraState;
}

function advance(options: Options = {}) {
  const {
    current = 20_000,
    hours = 2,
    startedAt = T0,
    access = UNCONTAINED,
    activity = { mode: "ordinary-waking" as const },
    state = { current, allocations: [] },
    ...rest
  } = options;

  return advanceAuraTime({
    state,
    wakefulness: restedWakefulness(),
    context: auraContext({ attributes: STRONG, access }),
    interval: gameTimeIntervalOf(startedAt, hoursToDuration(hours)),
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

function at(
  hours: number,
  kind: ScheduledAuraEvent["kind"],
  amount: number,
  source: string = kind,
): ScheduledAuraEvent {
  return { at: T0 + hoursToDuration(hours), kind, source, amount };
}


describe("suppression controls leakage", () => {
  it("leaks normally while awakened and uncontained", () => {
    expect(succeed({ hours: 2 * ROUND_HOURS }).balance.leakage)
      .toBeCloseTo(LEAK_PER_ROUND * 2, 8);
  });

  /*
   * Zetsu closes the nodes. Aura was still pouring out of them, and the
   * character could still collapse from it, because leakage was decided once
   * from the resolved access and suppression only ever touched recovery.
   */
  it("stops the instant suppression begins", () => {
    const result = succeed({
      hours: 4 * ROUND_HOURS,
      activityChanges: [{
        at: T0 + hoursToDuration(1 * ROUND_HOURS),
        activity: { mode: "intentional-rest", suppression: ZETSU },
      }],
    });

    expect(result.balance.leakage).toBeCloseTo(LEAK_PER_ROUND * 1, 8);
  });

  it("resumes when suppression lifts and the character is still uncontained", () => {
    const result = succeed({
      hours: 4 * ROUND_HOURS,
      activityChanges: [
        {
          at: T0 + hoursToDuration(1 * ROUND_HOURS),
          activity: { mode: "intentional-rest", suppression: ZETSU },
        },
        {
          at: T0 + hoursToDuration(3 * ROUND_HOURS),
          activity: { mode: "ordinary-waking" },
        },
      ],
    });

    /* One Round before, one Round after, and nothing in the two between. */
    expect(result.balance.leakage).toBeCloseTo(LEAK_PER_ROUND * 2, 8);
  });

  it("prevents leakage from the first instant when already suppressed", () => {
    expect(succeed({
      hours: 8,
      activity: { mode: "intentional-rest", suppression: ZETSU },
    }).balance.leakage).toBe(0);
  });

  /* A character in Zetsu at zero Aura is empty, not collapsing. */
  it("prevents collapse while suppression is active", () => {
    const result = succeed({
      current: 100,
      hours: 200,
      activity: { mode: "ordinary-waking", suppression: FORCED_ZETSU },
    });

    expect(result.collapse).toBeNull();
  });

  it("still recovers, at the suppressed rate, while suppressed", () => {
    const result = succeed({
      current: 0,
      hours: 2,
      activity: {
        mode: "intentional-rest",
        suppression: { source: "zetsu-iii", forced: false },
      },
    });

    /* Suppressed rest is 4R, and R is 2,500 at VIT 20. */
    expect(result.balance.recovery).toBeCloseTo(4 * 2500 * 2, 8);
    expect(result.balance.leakage).toBe(0);
  });

  /*
   * Suppression interrupts; it does not cure. Ending the interval suppressed
   * must not leave the character permanently contained.
   */
  it("does not clear the underlying uncontained state", () => {
    const suppressed = succeed({
      hours: 2 * ROUND_HOURS,
      activity: { mode: "intentional-rest", suppression: ZETSU },
    });

    const after = succeed({
      current: suppressed.current,
      startedAt: T0 + hoursToDuration(2 * ROUND_HOURS),
      hours: 2 * ROUND_HOURS,
    });

    expect(after.balance.leakage).toBeCloseTo(LEAK_PER_ROUND * 2, 8);
  });
});


describe("half-open interval ownership", () => {
  it("names the two questions separately", () => {
    const interval = gameTimeIntervalOf(T0, hoursToDuration(2));

    expect(intervalOwns(interval, T0)).toBe(true);
    expect(intervalOwns(interval, interval.endedAt)).toBe(false);
    expect(intervalReaches(interval, interval.endedAt)).toBe(true);
  });

  it("accepts an event at the opening instant", () => {
    const result = succeed({
      access: WITH_TEN,
      instantaneous: [at(0, "forced-drain", 100)],
    });

    expect(result.balance.forcedDrain).toBe(100);
  });

  it("accepts an event strictly inside", () => {
    expect(succeed({
      access: WITH_TEN,
      instantaneous: [at(1, "forced-drain", 100)],
    }).balance.forcedDrain).toBe(100);
  });

  it("rejects an event at the closing instant", () => {
    expect(errorCodes(advance({
      access: WITH_TEN,
      instantaneous: [at(2, "forced-drain", 100)],
    }))).toContain("aura.timeline.event.outside");
  });

  it("rejects an event that predates the interval", () => {
    expect(errorCodes(advance({
      access: WITH_TEN,
      instantaneous: [at(-1, "forced-drain", 100)],
    }))).toContain("aura.timeline.event.stale");
  });

  /*
   * The reason the rule exists. Two adjacent intervals meet at one timestamp,
   * and an inclusive rule would have both charge the same strike.
   */
  it("applies an endpoint event exactly once across adjacent intervals", () => {
    const boundary = T0 + hoursToDuration(2);

    const event: ScheduledAuraEvent = {
      at: boundary,
      kind: "forced-drain",
      source: "strike",
      amount: 100,
    };

    /* The first interval refuses it outright. */
    expect(errorCodes(advance({
      access: WITH_TEN,
      hours: 2,
      instantaneous: [event],
    }))).toContain("aura.timeline.event.outside");

    /* The second, beginning there, owns it. */
    const second = succeed({
      access: WITH_TEN,
      startedAt: boundary,
      hours: 2,
      instantaneous: [event],
    });

    expect(second.balance.forcedDrain).toBe(100);
  });

  it("holds activity changes to the same rule", () => {
    expect(errorCodes(advance({
      hours: 2,
      activityChanges: [{
        at: T0 + hoursToDuration(2),
        activity: { mode: "sleep" },
      }],
    }))).toContain("aura.timeline.change.outside");

    expect(errorCodes(advance({
      hours: 2,
      activityChanges: [{
        at: T0 - 1,
        activity: { mode: "sleep" },
      }],
    }))).toContain("aura.timeline.change.stale");
  });

  it("refuses two activity changes at the same instant", () => {
    expect(errorCodes(advance({
      hours: 4,
      activityChanges: [
        { at: T0 + hoursToDuration(1), activity: { mode: "sleep" } },
        {
          at: T0 + hoursToDuration(1),
          activity: { mode: "intentional-rest" },
        },
      ],
    }))).toContain("aura.timeline.change.duplicate");
  });

  /*
   * A commitment that began before the interval was already running. Reporting
   * it as starting would have chained advancement announce the same effect at
   * the head of every interval it survived.
   */
  it("emits no start event for an effect that began earlier", () => {
    const result = succeed({
      access: REN_III,
      upkeep: [{
        id: "ren",
        source: "ren",
        baseRate: 10,
        period: "hour",
        startsAt: T0 - hoursToDuration(1),
      }],
    });

    expect(result.events.map((event) => event.kind))
      .not.toContain("upkeep-started");
    expect(result.balance.upkeep).toBeCloseTo(20, 8);
  });

  it("emits a start event for one that begins inside", () => {
    const result = succeed({
      access: REN_III,
      hours: 4,
      upkeep: [{
        id: "ren",
        source: "ren",
        baseRate: 10,
        period: "hour",
        startsAt: T0 + hoursToDuration(1),
      }],
    });

    expect(result.events.map((event) => event.kind))
      .toContain("upkeep-started");
  });

  /* A solver OUTCOME may land on the endpoint; it is a consequence, not an input. */
  it("still reports the pool emptying exactly at the closing instant", () => {
    /*
     * Slightly MORE than two Rounds of leak in the reserve, because an
     * uncontained character regenerates R an hour while they bleed — so two
     * Rounds of leakage no longer lands them exactly on zero. The interval is
     * widened to contain the instant rather than end on it.
     */
    const result = succeed({
      current: LEAK_PER_ROUND * 2,
      hours: 4 * ROUND_HOURS,
    });

    expect(result.events.map((event) => event.kind)).toContain("aura-empty");
    expect(result.collapse).not.toBeNull();
    expect(result.collapse!.at)
      .toBeGreaterThan(T0 + hoursToDuration(2 * ROUND_HOURS));
    expect(result.collapse!.at)
      .toBeLessThan(T0 + hoursToDuration(3 * ROUND_HOURS));
  });
});


describe("timeline validation", () => {
  it("rejects an unknown event kind rather than treating it as a drain", () => {
    expect(errorCodes(advance({
      access: WITH_TEN,
      instantaneous: [{
        at: T0,
        kind: "nonsense" as ScheduledAuraEvent["kind"],
        source: "x",
        amount: 500,
      }],
    }))).toEqual(["aura.timeline.event.kind.invalid"]);
  });

  it("rejects an unnamed event source", () => {
    expect(errorCodes(advance({
      access: WITH_TEN,
      instantaneous: [at(1, "deliberate", 10, "  ")],
    }))).toContain("aura.timeline.event.source.missing");
  });

  it("rejects a non-finite or negative amount", () => {
    expect(errorCodes(advance({
      access: WITH_TEN,
      instantaneous: [at(1, "deliberate", Number.NaN)],
    }))).toContain("aura.timeline.event.amount.invalid");

    expect(errorCodes(advance({
      access: WITH_TEN,
      instantaneous: [at(1, "deliberate", -1)],
    }))).toContain("aura.timeline.event.amount.invalid");
  });

  it("rejects a mode or activity outside its vocabulary", () => {
    expect(errorCodes(advance({
      activity: { mode: "dozing" as AuraTimeActivity["mode"] },
    }))).toContain("aura.activity.mode.invalid");

    expect(errorCodes(advance({
      activity: {
        mode: "ordinary-waking",
        activity: "frantic" as NonNullable<AuraTimeActivity["activity"]>,
      },
    }))).toContain("aura.activity.level.invalid");
  });

  /*
   * Suppression no longer carries a multiplier to be nonsense. What it carries
   * is whether the character CHOSE it, which decides between the suppressed
   * column and the flat forced rate — so a non-boolean there is the same
   * defect in a new place.
   */
  it("rejects a suppression that does not say whether it was chosen", () => {
    expect(errorCodes(advance({
      access: WITH_TEN,
      activity: {
        mode: "sleep",
        suppression: { source: "z", forced: "no" as unknown as boolean },
      },
    }))).toContain("aura.recovery.suppression.forced.invalid");
  });

  /*
   * And the pairing that has no answer. Shut nodes and a running technique
   * take different recovery branches, so a caller asserting both has combined
   * two states rather than described one character.
   */
  it("rejects suppression and active Nen at once", () => {
    expect(errorCodes(advance({
      access: WITH_TEN,
      activity: {
        mode: "sleep",
        activeNenUse: true,
        suppression: { source: "zetsu", forced: false },
      },
    }))).toContain("aura.activity.suppression.active_nen.contradictory");
  });

  it("rejects active Nen on a character who has never awakened", () => {
    expect(errorCodes(advance({
      access: UNAWAKENED,
      activity: { mode: "ordinary-waking", activeNenUse: true },
    }))).toContain("aura.activity.active_nen.unawakened");
  });

  it("rejects an active-Nen fact that is not a boolean", () => {
    expect(errorCodes(advance({
      access: WITH_TEN,
      activity: {
        mode: "ordinary-waking",
        activeNenUse: "yes" as unknown as boolean,
      },
    }))).toContain("aura.activity.active_nen.invalid");
  });

  it("rejects an unnamed suppression", () => {
    expect(errorCodes(advance({
      access: WITH_TEN,
      activity: {
        mode: "sleep",
        suppression: { source: " ", forced: false },
      },
    }))).toContain("aura.recovery.suppression.source.missing");
  });

  it("still rejects suppression on an unawakened character", () => {
    expect(errorCodes(advance({
      access: UNAWAKENED,
      activity: { mode: "sleep", suppression: ZETSU },
    }))).toContain("aura.time.suppression.unawakened");
  });

  it("rejects malformed and duplicate upkeep commitments", () => {
    const codes = errorCodes(advance({
      access: REN_III,
      upkeep: [
        { id: "", source: "", baseRate: 10, period: "hour" },
        { id: "", source: "a", baseRate: 10, period: "hour" },
      ],
    }));

    expect(codes).toContain("aura.upkeep.id.missing");
    expect(codes).toContain("aura.upkeep.source.missing");

    expect(errorCodes(advance({
      access: REN_III,
      upkeep: [
        { id: "a", source: "a", baseRate: 10, period: "hour" },
        { id: "a", source: "b", baseRate: 10, period: "hour" },
      ],
    }))).toContain("aura.upkeep.id.duplicate");
  });

  it("rejects an upkeep window that ends before it starts", () => {
    expect(errorCodes(advance({
      access: REN_III,
      upkeep: [{
        id: "a",
        source: "a",
        baseRate: 1,
        period: "hour",
        startsAt: T0 + hoursToDuration(2),
        endsAt: T0 + hoursToDuration(1),
      }],
    }))).toContain("aura.upkeep.window.reversed");
  });

  it("rejects a non-finite priority", () => {
    expect(errorCodes(advance({
      access: REN_III,
      upkeep: [{
        id: "a",
        source: "a",
        baseRate: 1,
        period: "hour",
        priority: Number.NaN,
      }],
    }))).toContain("aura.upkeep.priority.invalid");
  });

  /* Nothing is half-applied: a refused timeline changes nothing at all. */
  it("does not partially process an invalid timeline", () => {
    const before: CharacterAuraState = { current: 20_000, allocations: [] };
    const taken = JSON.stringify(before);

    const result = advance({
      state: before,
      access: WITH_TEN,
      instantaneous: [
        at(0.5, "forced-drain", 5000),
        at(1, "deliberate", Number.NaN),
      ],
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(before)).toBe(taken);
  });
});


describe("simultaneous events resolve atomically", () => {
  const drain = at(0, "forced-drain", 500, "d");
  const heal = at(0, "recovery", 900, "h");

  /*
   * Neither happened first, so neither may win. Applied one at a time on a
   * pool of 100, drain-then-heal left the character on 900 with 400 unmet, and
   * heal-then-drain left them on 500 with none.
   */
  it("gives the same answer whichever order they are listed in", () => {
    const forward = succeed({
      current: 100,
      hours: 1,
      access: WITH_TEN,
      instantaneous: [drain, heal],
    });
    const reversed = succeed({
      current: 100,
      hours: 1,
      access: WITH_TEN,
      instantaneous: [heal, drain],
    });

    expect(forward.current).toBe(reversed.current);
    expect(forward.unmetDrain).toBe(reversed.unmetDrain);
    expect(forward.balance).toEqual(reversed.balance);
  });

  it("nets recovery against drain before clamping", () => {
    const result = succeed({
      current: 100,
      hours: 1,
      access: WITH_TEN,
      activity: HOLDING,
      instantaneous: [drain, heal],
    });

    /* 100 + 900 = 1,000, less 500, is 500 — and nothing goes unpaid. */
    expect(result.current).toBe(500);
    expect(result.unmetDrain).toBe(0);
  });

  it("still reports unmet drain when the total exceeds what is there", () => {
    const result = succeed({
      current: 100,
      hours: 1,
      access: WITH_TEN,
      activity: HOLDING,
      instantaneous: [at(0, "forced-drain", 900, "d"), at(0, "recovery", 200, "h")],
    });

    expect(result.current).toBe(0);
    expect(result.unmetDrain).toBe(600);
    expect(result.balance.forcedDrain).toBe(900);
  });

  it("reports every contributing source", () => {
    const result = succeed({
      current: 100,
      hours: 1,
      access: WITH_TEN,
      instantaneous: [drain, heal],
    });

    expect(result.balance.recoveryBySource.map((one) => one.context))
      .toContain("h");
    expect(result.events.filter((one) => one.kind === "instantaneous"))
      .toHaveLength(2);
  });

  it("orders the reported events stably", () => {
    const forward = succeed({
      current: 100,
      hours: 1,
      access: WITH_TEN,
      instantaneous: [drain, heal],
    });
    const reversed = succeed({
      current: 100,
      hours: 1,
      access: WITH_TEN,
      instantaneous: [heal, drain],
    });

    expect(forward.events.map((one) => one.detail))
      .toEqual(reversed.events.map((one) => one.detail));
  });

  /* Simultaneous recovery beyond the ceiling shares the discard in proportion. */
  it("splits discarded recovery across simultaneous sources", () => {
    const result = succeed({
      current: 49_000,
      hours: 0.0001,
      access: WITH_TEN,
      activity: HOLDING,
      instantaneous: [
        at(0, "recovery", 1000, "a"),
        at(0, "recovery", 3000, "b"),
      ],
    });

    const byContext = new Map(
      result.balance.recoveryBySource.map((one) => [one.context, one]),
    );

    expect(result.recovery.discarded).toBeCloseTo(3000, 6);
    expect(byContext.get("a")!.discarded).toBeCloseTo(750, 6);
    expect(byContext.get("b")!.discarded).toBeCloseTo(2250, 6);
  });
});


describe("recovery provenance", () => {
  /*
   * Summarising the whole interval under its INITIAL activity produced
   * contributions that were self-contradictory on their face: "multiplier 0,
   * hours 4, restored 10,000" for a character who woke, worked and then slept.
   */
  it("closes one contribution and opens another when the mode changes", () => {
    const result = succeed({
      current: 0,
      hours: 4,
      access: WITH_TEN,
      activity: { mode: "intentional-rest" },
      activityChanges: [{
        at: T0 + hoursToDuration(2),
        activity: { mode: "sleep" },
      }],
    });

    const byContext = new Map(
      result.balance.recoveryBySource.map((one) => [one.context, one]),
    );

    expect([...byContext.keys()].sort())
      .toEqual(["intentional-rest", "sleep"]);
    expect(byContext.get("intentional-rest")).toEqual(expect.objectContaining({
      multiplier: 3,
      hours: 2,
      potential: 3 * 2500 * 2,
    }));
    expect(byContext.get("sleep")).toEqual(expect.objectContaining({
      multiplier: 4,
      hours: 2,
      potential: 4 * 2500 * 2,
    }));
  });

  it("records nothing at all for a state that recovers nothing", () => {
    const result = succeed({
      current: 10_000,
      hours: 4,
      access: WITH_TEN,
      activity: { mode: "ordinary-waking", activeNenUse: true },
    });

    expect(result.balance.recoveryBySource).toEqual([]);
    expect(result.recovery.potential).toBe(0);
  });

  it("opens a new contribution when suppression begins", () => {
    const result = succeed({
      current: 0,
      hours: 4,
      access: WITH_TEN,
      activity: { mode: "intentional-rest" },
      activityChanges: [{
        at: T0 + hoursToDuration(2),
        activity: {
          mode: "intentional-rest",
          suppression: { source: "zetsu-x", forced: false },
        },
      }],
    });

    expect(result.balance.recoveryBySource.map((one) => one.context).sort())
      .toEqual(["intentional-rest", "zetsu-x"]);
  });

  /* A healing potion is not the character's own metabolism. */
  it("keeps an instantaneous recovery's own source", () => {
    const result = succeed({
      current: 0,
      hours: 1,
      access: WITH_TEN,
      activity: HOLDING,
      instantaneous: [at(0.5, "recovery", 500, "healing-potion")],
    });

    expect(result.balance.recoveryBySource).toEqual([
      expect.objectContaining({
        source: "scheduled-event",
        context: "healing-potion",
        potential: 500,
        used: 500,
      }),
    ]);
  });

  it("merges only genuinely identical stretches", () => {
    const result = succeed({
      current: 0,
      hours: 4,
      access: WITH_TEN,
      activity: { mode: "sleep" },
      activityChanges: [
        { at: T0 + hoursToDuration(1), activity: { mode: "sleep" } },
        { at: T0 + hoursToDuration(2), activity: { mode: "sleep" } },
      ],
    });

    expect(result.balance.recoveryBySource).toHaveLength(1);
    expect(result.balance.recoveryBySource[0]!.hours).toBeCloseTo(4, 8);
  });

  it("keeps the summary and the contributions in agreement", () => {
    for (const scenario of [
      { current: 0, hours: 6, activity: { mode: "sleep" as const } },
      {
        current: 49_500,
        hours: 2,
        activity: { mode: "sleep" as const },
        instantaneous: [at(1, "recovery", 900, "potion")],
      },
      {
        current: 0,
        hours: 4,
        activity: { mode: "intentional-rest" as const },
        activityChanges: [{
          at: T0 + hoursToDuration(2),
          activity: { mode: "sleep" as const },
        }],
      },
    ]) {
      const result = succeed({ access: WITH_TEN, ...scenario });
      const { recoveryBySource } = result.balance;

      const sum = (pick: "potential" | "used" | "discarded"): number =>
        recoveryBySource.reduce((total, one) => total + one[pick], 0);

      expect(sum("potential")).toBeCloseTo(result.recovery.potential, 6);
      expect(sum("used")).toBeCloseTo(result.recovery.used, 6);
      expect(sum("discarded")).toBeCloseTo(result.recovery.discarded, 6);

      expect(result.recovery.potential).toBeCloseTo(
        result.recovery.used + result.recovery.discarded,
        6,
      );
      expect(result.balance.recovery).toBeCloseTo(result.recovery.used, 6);

      for (const one of recoveryBySource) {
        expect(one.potential).toBeCloseTo(one.used + one.discarded, 6);
      }
    }
  });
});


describe("upkeep reports what it was actually charged for", () => {
  const RATE = 100;

  function chargeFor(commitment: AuraUpkeepCommitment, hours = 4) {
    const result = succeed({
      current: 50_000,
      hours,
      access: REN_III,
      upkeep: [commitment],
    });

    return { result, charge: result.upkeepCharges[0] };
  }

  it("counts only the hours a late-starting effect was up", () => {
    const { charge } = chargeFor({
      id: "late",
      source: "l",
      baseRate: RATE,
      period: "hour",
      startsAt: T0 + hoursToDuration(3),
    });

    expect(charge!.hours).toBeCloseTo(1, 8);
    expect(charge!.cost).toBeCloseTo(100, 8);
  });

  it("counts only the hours before an expiry", () => {
    const { charge } = chargeFor({
      id: "brief",
      source: "b",
      baseRate: RATE,
      period: "hour",
      endsAt: T0 + hoursToDuration(1.5),
    });

    expect(charge!.hours).toBeCloseTo(1.5, 8);
    expect(charge!.cost).toBeCloseTo(150, 8);
  });

  it("counts the whole interval for an effect that survives it", () => {
    const { charge } = chargeFor({
      id: "steady",
      source: "s",
      baseRate: RATE,
      period: "hour",
    });

    expect(charge!.hours).toBeCloseTo(4, 8);
  });

  it("counts an effect that began before the interval from its start", () => {
    const { charge } = chargeFor({
      id: "earlier",
      source: "e",
      baseRate: RATE,
      period: "hour",
      startsAt: T0 - hoursToDuration(10),
    });

    expect(charge!.hours).toBeCloseTo(4, 8);
  });

  it("counts an effect ending exactly at the closing instant in full", () => {
    const { charge } = chargeFor({
      id: "flush",
      source: "f",
      baseRate: RATE,
      period: "hour",
      endsAt: T0 + hoursToDuration(4),
    });

    expect(charge!.hours).toBeCloseTo(4, 8);
  });

  it("stops counting at an insufficient-Aura shutdown", () => {
    const result = succeed({
      current: 150,
      hours: 2,
      access: REN_III,
      activity: HOLDING,
      upkeep: [{ id: "ren", source: "ren", baseRate: RATE, period: "hour" }],
    });

    expect(result.upkeepCharges[0]!.hours).toBeCloseTo(1.5, 8);
    expect(result.upkeepShutdowns[0]!.at)
      .toBeCloseTo(T0 + hoursToDuration(1.5), 6);
  });

  it("stops counting when deliberate access is lost", () => {
    const result = succeed({
      current: 50_000,
      hours: 4,
      access: REN_III,
      upkeep: [{ id: "ren", source: "ren", baseRate: RATE, period: "hour" }],
      activityChanges: [{
        at: T0 + hoursToDuration(1),
        activity: { mode: "intentional-rest", suppression: ZETSU },
      }],
    });

    expect(result.upkeepCharges[0]!.hours).toBeCloseTo(1, 8);
    expect(result.upkeepShutdowns[0]!.reason).toBe("access-lost");
  });

  /* The invariant the whole field exists to satisfy. */
  it("keeps cost equal to rate times charged hours, always", () => {
    const commitments: readonly AuraUpkeepCommitment[] = [
      { id: "steady", source: "s", baseRate: 50, period: "hour" },
      {
        id: "late",
        source: "l",
        baseRate: 80,
        period: "hour",
        startsAt: T0 + hoursToDuration(1),
      },
      {
        id: "brief",
        source: "b",
        baseRate: 2,
        period: "round",
        endsAt: T0 + hoursToDuration(2),
      },
    ];

    const result = succeed({
      current: 50_000,
      hours: 4,
      access: REN_III,
      upkeep: commitments,
    });

    expect(result.upkeepCharges).toHaveLength(3);

    for (const charge of result.upkeepCharges) {
      const expected = charge.ratePerHour * charge.hours;
      const tolerance = Math.max(1, Math.abs(expected)) * 1e-9;

      expect([charge.id, Math.abs(charge.cost - expected) <= tolerance])
        .toEqual([charge.id, true]);
    }

    expect(
      result.upkeepCharges.reduce((total, one) => total + one.cost, 0),
    ).toBeCloseTo(result.balance.upkeep, 6);
  });
});
