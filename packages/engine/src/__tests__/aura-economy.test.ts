/*
 * The Aura economy, driven through the real interval solver.
 *
 * aura-recovery.test.ts checks the recovery TABLE against the resolver that
 * owns it. This file checks that a character actually living through an hour
 * gets those numbers — that the rates compose the way the table says, that the
 * drains stack where they are supposed to stack, and that the things which are
 * meant to cost nothing cost nothing.
 *
 * Everything is in units of R, the revised Regeneration unit: half the rounded
 * VIT curve. VIT 20 rounds to 5,000, so R is 2,500.
 *
 *   net/hour = regeneration
 *            - leakage            2R half-open, 60O uncontained, 0 otherwise
 *            - physicalConsumption  2R while the body is working
 *            - deliberateNenCost
 *            - upkeep
 *            - forcedDrain
 *
 * The three passive outflows are independent and stack. Ten and Zetsu stop
 * LEAKAGE; neither stops the cost of working.
 */

import { describe, expect, it } from "vitest";

import {
  advanceAuraTime,
  COLLAPSE_SUPPRESSION_SOURCE,
  SLEEP_COMPLETION_CONTEXT,
} from "../character/foundation/aura/time";
import type { AdvanceAuraTimeInput } from "../character/foundation/aura/time";
import { deriveAuraRegeneration } from "../character/foundation/aura/recovery";
import {
  HALF_OPEN_LEAKAGE_REGENERATION_MULTIPLE,
  deriveHalfOpenLeakage,
  deriveUncontainedLeakage,
} from "../character/foundation/aura/leakage";
import { PHYSICAL_CONSUMPTION_REGENERATION_MULTIPLE } from "../character/foundation/aura/expenditure";
import { deriveMaximumAura } from "../character/foundation/aura/pool";
import { deriveAuraOutputLimit } from "../character/foundation/aura/output";
import {
  QUALIFYING_SLEEP_HOURS,
  restedWakefulness,
} from "../character/foundation/body/endurance";
import { gameTimeIntervalOf, hoursToDuration } from "../time/interval";
import type { AuraAccessInput } from "../character/foundation/aura/types";
import type { CharacterWakefulnessState } from "../character/foundation/body/endurance";

import {
  auraContext,
  auraTestAttributes,
  REVERTED,
  UNAWAKENED,
  UNCONTAINED,
  WITH_TEN,
  withTen,
} from "./fixtures/aura";

/* CON 20 / VIT 20: 50,000 Maximum Aura, 10,000 Output, R = 2,500. */
const STRONG = { con: 20, vit: 20 } as const;
const R = 2500;
const MAX = 50_000;

/* Uncontained leakage is the Output Capacity every MINUTE. */
const UNCONTAINED_LEAK_PER_HOUR = 60 * 10_000;

const T0 = 1_000_000_000;

const ZETSU: AuraAccessInput = withTen(1, {
  kind: "suppressed",
  source: "zetsu",
});

type Row = {
  readonly label: string;
  readonly access: AuraAccessInput;
  readonly suppressed?: boolean;
};

const ROWS: readonly Row[] = [
  { label: "unawakened", access: UNAWAKENED },
  { label: "zetsu", access: ZETSU, suppressed: true },
  { label: "unmastered ten", access: UNCONTAINED },
  { label: "in ten", access: WITH_TEN },
];

function advance(options: {
  readonly access: AuraAccessInput;
  readonly current?: number;
  readonly hours?: number;
  readonly mode?: "ordinary-waking" | "intentional-rest" | "sleep";
  readonly exerting?: boolean;
  readonly activeNenUse?: boolean;
  readonly suppressed?: boolean;
  readonly wakefulness?: CharacterWakefulnessState;
  readonly attributes?: Parameters<typeof auraTestAttributes>[0];
  readonly upkeep?: AdvanceAuraTimeInput["upkeep"];
}) {
  const result = advanceAuraTime({
    state: { current: options.current ?? 25_000, allocations: [] },
    wakefulness: options.wakefulness ?? restedWakefulness(),
    context: auraContext({
      attributes: options.attributes ?? STRONG,
      access: options.access,
    }),
    interval: gameTimeIntervalOf(T0, hoursToDuration(options.hours ?? 1)),
    activity: {
      mode: options.mode ?? "ordinary-waking",
      ...(options.exerting === true ? { activity: "strenuous" as const } : {}),
      ...(options.activeNenUse === true ? { activeNenUse: true } : {}),
      ...(options.suppressed === true
        ? { suppression: { source: "zetsu", forced: false } }
        : {}),
    },
    ...(options.upkeep === undefined ? {} : { upkeep: options.upkeep }),
  });

  if (!result.success) {
    throw new Error(
      "Expected the interval to resolve: " +
      result.errors.map((error) => error.code).join(", "),
    );
  }

  return result.payload;
}


describe("the units the whole economy is written in", () => {
  it("makes R half the rounded VIT curve", () => {
    expect(deriveAuraRegeneration(auraTestAttributes(STRONG))).toBe(R);
  });

  it("denominates half-open leakage and physical work in R, not in the pool", () => {
    expect(HALF_OPEN_LEAKAGE_REGENERATION_MULTIPLE).toBe(2);
    expect(PHYSICAL_CONSUMPTION_REGENERATION_MULTIPLE).toBe(2);
    expect(deriveHalfOpenLeakage(R).ratePerHour).toBe(2 * R);
  });

  /*
   * And uncontained leakage in OUTPUT, which is the one rate that did not
   * change. It is a different quantity for a different reason — open nodes
   * passing everything they physically can — and a mutation doubling it would
   * make a fresh awakener's five minutes into two and a half.
   */
  it("leaves uncontained leakage at exactly the Output Capacity per minute", () => {
    const leakage = deriveUncontainedLeakage(
      deriveAuraOutputLimit(auraTestAttributes(STRONG)).maximum,
      MAX,
    );

    expect(leakage.ratePerMinute).toBe(10_000);
    expect(leakage.ratePerHour).toBe(UNCONTAINED_LEAK_PER_HOUR);
    expect(leakage.minutesToExhaustion).toBe(5);
  });
});


/*
 * The rate matrix, every row, through the real solver.
 *
 * Each case names the three terms separately rather than only the net, because
 * a net that happens to come out right from two wrong terms is exactly the
 * failure this is guarding against.
 */
describe("the rate matrix", () => {
  const ordinary: Record<string, readonly [number, number, number]> = {
    /* label: [recovery coefficient, leakage, physical] */
    "unawakened": [2, 2 * R, 0],
    "zetsu": [3, 0, 0],
    "unmastered ten": [1, UNCONTAINED_LEAK_PER_HOUR, 0],
    "in ten": [2, 0, 0],
  };

  const physical: Record<string, readonly [number, number, number]> = {
    "unawakened": [1, 2 * R, 2 * R],
    "zetsu": [1, 0, 2 * R],
    "unmastered ten": [1, UNCONTAINED_LEAK_PER_HOUR, 2 * R],
    "in ten": [1, 0, 2 * R],
  };

  const resting: Record<string, readonly [number, number, number]> = {
    "unawakened": [3, 2 * R, 0],
    "zetsu": [4, 0, 0],
    "unmastered ten": [2, UNCONTAINED_LEAK_PER_HOUR, 0],
    "in ten": [3, 0, 0],
  };

  const sleeping: Record<string, readonly [number, number, number]> = {
    "unawakened": [4, 2 * R, 0],
    "zetsu": [4, 0, 0],
    "unmastered ten": [4, UNCONTAINED_LEAK_PER_HOUR, 0],
    "in ten": [4, 0, 0],
  };

  const columns = [
    ["ordinary activity", ordinary, { mode: "ordinary-waking" as const }],
    ["physical activity", physical, { mode: "ordinary-waking" as const, exerting: true }],
    ["intentional rest", resting, { mode: "intentional-rest" as const }],
    ["sleep", sleeping, { mode: "sleep" as const }],
  ] as const;

  for (const [columnName, expectations, options] of columns) {
    for (const row of ROWS) {
      const [coefficient, leakage, physicalCost] = expectations[row.label]!;

      it(`resolves ${row.label} during ${columnName}`, () => {
        const result = advance({
          access: row.access,
          ...(row.suppressed === true ? { suppressed: true } : {}),
          ...options,
          current: MAX,
        });

        /*
         * The first segment's RATES, not the interval's totals.
         *
         * An uncontained character empties in well under an hour and then
         * collapses, which changes every rate from that instant — so totals
         * would be measuring the collapse as much as the row. The rates are
         * what the table states, and they are constant for as long as the
         * segment lasts by construction.
         */
        const segment = result.segments[0]!;

        expect([row.label, columnName, "recovery", segment.recoveryRatePerHour])
          .toEqual([row.label, columnName, "recovery", coefficient * R]);

        expect([row.label, columnName, "leakage", segment.leakageRatePerHour])
          .toEqual([row.label, columnName, "leakage", leakage]);

        expect([row.label, columnName, "physical", segment.physicalRatePerHour])
          .toEqual([row.label, columnName, "physical", physicalCost]);
      });
    }
  }

  /*
   * The calibration the whole ordinary-person case rests on: 2R in, 2R out,
   * and an ordinary day costs them exactly nothing.
   */
  it("nets an unawakened ordinary day to zero", () => {
    const result = advance({ access: UNAWAKENED, hours: 24 });

    expect(result.balance.net).toBeCloseTo(0, 8);
  });

  it("gives a reverted character the same pores and no reinforcement", () => {
    const reverted = advance({ access: REVERTED, current: 0 });
    const never = advance({ access: UNAWAKENED, current: 0 });

    expect(reverted.balance.leakage).toBe(never.balance.leakage);
    expect(reverted.balance.recovery).toBe(never.balance.recovery);
  });

  /*
   * Active Nen is an override on the whole table rather than a fifth row. It
   * zeroes recovery in every state and for every mode, and the drains keep
   * running underneath it.
   */
  it("zeroes recovery under active Nen while the drains continue", () => {
    for (const mode of ["ordinary-waking", "intentional-rest", "sleep"] as const) {
      const result = advance({
        access: UNCONTAINED,
        mode,
        activeNenUse: true,
        current: MAX,
      });

      const segment = result.segments[0]!;

      expect([mode, segment.recoveryRatePerHour]).toEqual([mode, 0]);
      expect([mode, segment.leakageRatePerHour])
        .toEqual([mode, UNCONTAINED_LEAK_PER_HOUR]);
    }
  });

  it("still charges for working the body under active Nen", () => {
    const result = advance({
      access: WITH_TEN,
      activeNenUse: true,
      exerting: true,
      current: MAX,
    });

    expect(result.balance.recovery).toBe(0);
    expect(result.balance.physical).toBe(2 * R);
  });

  it("still charges upkeep under active Nen", () => {
    const result = advance({
      access: withTen(1, {
        kind: "output-access",
        source: "ren-iii",
        accessFraction: 0.3,
      }),
      attributes: { ...STRONG, dex: 22 },
      activeNenUse: true,
      current: MAX,
      upkeep: [{ id: "ren", source: "ren", baseRate: 100, period: "hour" }],
    });

    expect(result.balance.recovery).toBe(0);
    expect(result.balance.upkeep).toBe(100);
  });

  /*
   * Ten is not an activity and never sets the flag. Every learned rank
   * recovers exactly as a contained character does, which is the claim the Ten
   * correction's "Ten costs nothing" rests on from the recovery side.
   */
  it("gives every Ten rank the same recovery", () => {
    const rates = [1, 2, 5, 10].map(
      (rank) => advance({ access: withTen(rank), current: 0 }).balance.recovery,
    );

    expect(new Set(rates).size).toBe(1);
    expect(rates[0]).toBe(2 * R);
  });
});


describe("the drains stack independently", () => {
  /*
   * Two of them at once, on a character who is neither contained nor resting.
   * The old model had half-open pores costing nothing at all, so this hour was
   * a pure gain.
   */
  it("charges an unawakened physical hour both leakage and effort", () => {
    const result = advance({
      access: UNAWAKENED,
      exerting: true,
      current: MAX,
    });

    expect(result.balance.recovery).toBe(R);
    expect(result.balance.leakage).toBe(2 * R);
    expect(result.balance.physical).toBe(2 * R);
    expect(result.balance.net).toBe(-3 * R);
  });

  it("charges an uncontained physical hour both its leak and its effort", () => {
    const segment = advance({
      access: UNCONTAINED,
      exerting: true,
      current: MAX,
    }).segments[0]!;

    expect(segment.leakageRatePerHour).toBe(UNCONTAINED_LEAK_PER_HOUR);
    expect(segment.physicalRatePerHour).toBe(2 * R);
  });

  /*
   * Containment and suppression stop the LEAK. Neither makes the body stop
   * costing something to work.
   */
  it("lets Ten and Zetsu stop the leak and not the effort", () => {
    for (const row of [ROWS[3]!, ROWS[1]!]) {
      const result = advance({
        access: row.access,
        ...(row.suppressed === true ? { suppressed: true } : {}),
        exerting: true,
        current: MAX,
      });

      expect([row.label, result.balance.leakage]).toEqual([row.label, 0]);
      expect([row.label, result.balance.physical])
        .toEqual([row.label, 2 * R]);
    }
  });

  /*
   * And the two leaks are alternatives rather than a sum — a character's nodes
   * are either half-open or open, never both.
   */
  it("never charges both leaks at once", () => {
    const segment = advance({ access: UNCONTAINED, current: MAX }).segments[0]!;

    expect(segment.leakageRatePerHour).toBe(UNCONTAINED_LEAK_PER_HOUR);
    expect(segment.leakageRatePerHour).not.toBe(
      UNCONTAINED_LEAK_PER_HOUR + 2 * R,
    );
  });

  /*
   * Half-open depletion is not a death spiral and must not emit one. An
   * ordinary person drained to nothing by something else keeps their pores and
   * does not black out from having them.
   */
  it("never collapses a half-open character, even at zero", () => {
    const result = advance({
      access: UNAWAKENED,
      current: 0,
      hours: 48,
      exerting: true,
    });

    expect(result.collapse).toBeNull();
    expect(result.balance.leakage).toBeGreaterThan(0);
  });
});


describe("collapse changes the rates from the instant it happens", () => {
  const collapsing = (mode: "ordinary-waking" | "intentional-rest" | "sleep") =>
    advance({
      access: UNCONTAINED,
      mode,
      current: MAX,
      hours: 1,
    });

  it("stops the leak, stops the effort, and pays 3R from the collapse on", () => {
    const result = advance({
      access: UNCONTAINED,
      exerting: true,
      current: MAX,
      hours: 1,
    });

    expect(result.collapse).not.toBeNull();

    const [before, after] = result.segments;

    expect(before!.leakageRatePerHour).toBe(UNCONTAINED_LEAK_PER_HOUR);
    expect(before!.physicalRatePerHour).toBe(2 * R);

    /* And the blackout, which is not exerting and is not bleeding. */
    expect(after!.leakageRatePerHour).toBe(0);
    expect(after!.physicalRatePerHour).toBe(0);
    expect(after!.recoveryRatePerHour).toBe(3 * R);
  });

  it("pays 3R whatever the character was doing beforehand", () => {
    for (const mode of ["ordinary-waking", "intentional-rest", "sleep"] as const) {
      const result = collapsing(mode);

      expect([mode, result.collapse === null]).toEqual([mode, false]);

      const after = result.segments[result.segments.length - 1]!;

      expect([mode, after.recoveryRatePerHour]).toEqual([mode, 3 * R]);
    }
  });

  it("names its own suppression rather than borrowing a Zetsu's", () => {
    const result = advance({
      access: UNCONTAINED,
      current: MAX,
      hours: 1,
    });

    expect(result.balance.recoveryBySource.map((one) => one.context))
      .toContain(COLLAPSE_SUPPRESSION_SOURCE);
  });
});


describe("eight hours of sleep tops the reserve off", () => {
  /*
   * The worked example. CON 13 / VIT 13: 100 Maximum Aura and R = 5, so an
   * unawakened sleeper nets 2R — ten an hour — and reaches roughly 80 by the
   * eighth hour. The completion then fills the rest.
   */
  const ORDINARY = { con: 13, vit: 13 } as const;

  it("reaches about 80 by rate and then fills to 100", () => {
    expect(deriveMaximumAura(auraTestAttributes(ORDINARY))).toBe(100);
    expect(deriveAuraRegeneration(auraTestAttributes(ORDINARY))).toBe(5);

    const result = advance({
      attributes: ORDINARY,
      access: UNAWAKENED,
      current: 0,
      hours: QUALIFYING_SLEEP_HOURS,
      mode: "sleep",
    });

    const byRate = result.balance.recoveryBySource.find(
      (one) => one.source === "natural-regeneration",
    );
    const completion = result.balance.recoveryBySource.find(
      (one) => one.source === "sleep-completion",
    );

    /* 4R in and 2R out over eight hours is a net 80. */
    expect(byRate!.used).toBeCloseTo(4 * 5 * 8, 8);
    expect(completion).toBeDefined();
    expect(completion!.context).toBe(SLEEP_COMPLETION_CONTEXT);
    expect(completion!.used).toBeCloseTo(20, 8);

    expect(result.current).toBe(100);
  });

  it("is reported as its own source rather than as more regeneration", () => {
    const result = advance({
      attributes: ORDINARY,
      access: UNAWAKENED,
      current: 0,
      hours: QUALIFYING_SLEEP_HOURS,
      mode: "sleep",
    });

    expect(result.events.map((event) => event.kind)).toContain("sleep-completed");
  });

  it("does not fire at seven hours, or at a whisker under eight", () => {
    for (const hours of [7, 7.9]) {
      const result = advance({
        attributes: ORDINARY,
        access: UNAWAKENED,
        current: 0,
        hours,
        mode: "sleep",
      });

      expect([hours, result.events.map((one) => one.kind)])
        .toEqual([hours, expect.not.arrayContaining(["sleep-completed"])]);
    }
  });

  it("fires exactly once however long the sleep runs on", () => {
    const result = advance({
      attributes: ORDINARY,
      access: UNAWAKENED,
      current: 0,
      hours: 20,
      mode: "sleep",
    });

    expect(result.events.filter((one) => one.kind === "sleep-completed"))
      .toHaveLength(1);
  });

  /*
   * Eight separate hours have to add up to one night, which is the whole
   * reason the progress is stored rather than derived.
   */
  it("accumulates across chained advances", () => {
    let current = 0;
    let wakefulness = restedWakefulness();
    let completed = 0;

    for (let hour = 0; hour < QUALIFYING_SLEEP_HOURS; hour += 1) {
      const result = advanceAuraTime({
        state: { current, allocations: [] },
        wakefulness,
        context: auraContext({
          attributes: ORDINARY,
          access: UNAWAKENED,
        }),
        interval: gameTimeIntervalOf(
          T0 + hoursToDuration(hour),
          hoursToDuration(1),
        ),
        activity: { mode: "sleep" },
      });

      if (!result.success) throw new Error("Expected the hour to resolve.");

      current = result.payload.current;
      wakefulness = result.payload.wakefulness;
      completed += result.payload.events
        .filter((one) => one.kind === "sleep-completed").length;
    }

    expect(completed).toBe(1);
    expect(current).toBe(100);
    expect(wakefulness.consecutiveSleepHours).toBe(QUALIFYING_SLEEP_HOURS);
  });

  it("is reset by a waking stretch, and the next full night counts again", () => {
    const woken = advance({
      attributes: ORDINARY,
      access: UNAWAKENED,
      current: 0,
      hours: 1,
      wakefulness: { hoursAwake: 0, consecutiveSleepHours: 7 },
    });

    expect(woken.wakefulness.consecutiveSleepHours).toBe(0);
    expect(woken.events.map((one) => one.kind))
      .toEqual(expect.not.arrayContaining(["sleep-completed"]));
  });

  /*
   * Zetsu recovers faster; it does not recover a DIFFERENT way. Sleeping
   * behind one is 4R, exactly as sleeping is — the two do not stack to 8R —
   * and holding one awake earns no completion at all.
   */
  it("does not stack with Zetsu, and does not pay out for a waking one", () => {
    const asleep = advance({
      access: WITH_TEN,
      mode: "sleep",
      current: 0,
    });
    const asleepSuppressed = advance({
      access: ZETSU,
      suppressed: true,
      mode: "sleep",
      current: 0,
    });

    expect(asleepSuppressed.balance.recovery).toBe(asleep.balance.recovery);
    expect(asleepSuppressed.balance.recovery).toBe(4 * R);

    const awakeSuppressed = advance({
      access: ZETSU,
      suppressed: true,
      current: 0,
      hours: 20,
    });

    expect(awakeSuppressed.events.map((one) => one.kind))
      .toEqual(expect.not.arrayContaining(["sleep-completed"]));
  });

  /*
   * A blackout is unconsciousness, and unconsciousness is sleep for this
   * purpose — otherwise a character who collapsed at dusk would wake at dawn
   * with the empty reserve that put them down.
   */
  it("counts a post-collapse blackout as qualifying sleep", () => {
    const result = advance({
      attributes: ORDINARY,
      access: UNCONTAINED,
      current: 100,
      hours: QUALIFYING_SLEEP_HOURS + 1,
    });

    expect(result.collapse).not.toBeNull();
    expect(result.events.map((one) => one.kind)).toContain("sleep-completed");
    expect(result.current).toBe(100);
  });
});
