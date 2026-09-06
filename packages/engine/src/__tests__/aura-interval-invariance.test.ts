/*
 * The property the continuous solver exists for.
 *
 *   advance(T) === advance(T / N), applied N times
 *
 * A rules engine may not give a different answer because the GM clicked
 * "advance" once instead of eight times, or because a UI happened to refresh
 * every second. The previous implementation did exactly that: it summed every
 * contribution over the whole submitted span and clamped once, so a character
 * near full who was both recovering and paying upkeep ended somewhere
 * different depending on how the day was chopped up.
 *
 * Each case below is run at 1, 2, 5, 60 and 600 subdivisions and every result
 * must agree. Agreement is to a RELATIVE tolerance rather than exact equality,
 * because binary floating point cannot promise that adding a number six
 * hundred times reproduces adding it once — 1e-9 is roughly a thousandth of a
 * millionth of the Aura values involved, and far below anything the model
 * represents.
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
  gameTimeInterval,
  gameTimeIntervalOf,
  hoursToDuration,
} from "../time/interval";
import type { AuraAccessInput } from "../character/foundation/aura/types";
import type { CharacterAuraState } from "../character/foundation/aura/state";

import { auraContext, UNCONTAINED, WITH_TEN } from "./fixtures/aura";

const T0 = 1_000_000_000;

const REN_III: AuraAccessInput = {
  ...WITH_TEN,
  override: { kind: "output-access", source: "ren-iii", accessFraction: 0.3 },
};

/* CON 20 / VIT 20: Maximum Aura 50,000, Stamina 20, regeneration 5,000/hour. */
const STRONG = { con: 20, vit: 20, dex: 22 } as const;

interface Case {
  readonly hours: number;
  readonly current: number;
  readonly attributes?: { readonly con: number; readonly vit: number; readonly dex: number };
  readonly access?: AuraAccessInput;
  readonly activity?: AuraTimeActivity;
  readonly activityChanges?: readonly AuraActivityChange[];
  readonly upkeep?: readonly AuraUpkeepCommitment[];
  readonly instantaneous?: readonly ScheduledAuraEvent[];
}

/*
 * Run a case in N steps, threading the state forward exactly as a host would.
 *
 * Shutdowns are removed from the commitment list between steps, because that
 * is what a caller holding running effects does when one drops — and NOT doing
 * it would have the subdivided run restart an effect the single run had ended.
 */
function run(scenario: Case, steps: number) {
  const context = auraContext({
    attributes: scenario.attributes ?? STRONG,
    access: scenario.access ?? REN_III,
  });

  let state: CharacterAuraState = {
    current: scenario.current,
    allocations: [],
  };
  let wakefulness = restedWakefulness();
  let upkeep = [...(scenario.upkeep ?? [])];
  let at = T0;

  const totals = { recovery: 0, physical: 0, upkeep: 0, leakage: 0 };
  const shutdowns: string[] = [];
  const eventKinds = new Set<string>();
  const recoveryByContext = new Map<string, number>();
  const chargedHours = new Map<string, number>();
  let collapsed = false;

  /*
   * Sub-interval endpoints are computed from the index rather than accumulated,
   * so a boundary that should coincide exactly with a scheduled timestamp does,
   * and the test measures the solver rather than the harness's own drift.
   */
  const bound = (index: number): number =>
    T0 + hoursToDuration((scenario.hours * index) / steps);

  /*
   * A host driving the clock in small steps carries the activity forward and
   * hands each sub-interval only the changes and events it OWNS —
   * `[startedAt, endedAt)`, so nothing is applied twice at a boundary.
   */
  let activity = scenario.activity ?? { mode: "ordinary-waking" as const };

  for (let index = 0; index < steps; index += 1) {
    at = bound(index);

    const endsAt = bound(index + 1);

    const changes = (scenario.activityChanges ?? []).filter(
      (change) => change.at >= at && change.at < endsAt,
    );

    const events = (scenario.instantaneous ?? []).filter(
      (event) => event.at >= at && event.at < endsAt,
    );

    const result = advanceAuraTime({
      state,
      wakefulness,
      context,
      interval: gameTimeInterval(at, endsAt),
      activity,
      ...(changes.length === 0 ? {} : { activityChanges: changes }),
      ...(events.length === 0 ? {} : { instantaneous: events }),
      upkeep,
    });

    if (!result.success) {
      throw new Error(
        "Expected the interval to resolve: " +
        result.errors.map((error) => error.code).join(", "),
      );
    }

    state = result.payload.state;
    wakefulness = result.payload.wakefulness;

    totals.recovery += result.payload.balance.recovery;
    totals.physical += result.payload.balance.physical;
    totals.upkeep += result.payload.balance.upkeep;
    totals.leakage += result.payload.balance.leakage;

    for (const event of result.payload.events) eventKinds.add(event.kind);

    for (const one of result.payload.balance.recoveryBySource) {
      recoveryByContext.set(
        one.context,
        (recoveryByContext.get(one.context) ?? 0) + one.used,
      );
    }

    for (const charge of result.payload.upkeepCharges) {
      chargedHours.set(
        charge.id,
        (chargedHours.get(charge.id) ?? 0) + charge.hours,
      );
    }

    for (const shutdown of result.payload.upkeepShutdowns) {
      shutdowns.push(shutdown.id);
      upkeep = upkeep.filter(
        (commitment) => commitment.id !== shutdown.id,
      );
    }

    if (result.payload.collapse !== null) collapsed = true;

    /* Carry the activity the sub-interval ended under into the next one. */
    const last = [...changes].sort((left, right) => left.at - right.at).at(-1);

    if (last !== undefined) activity = last.activity;
  }

  return {
    current: state.current,
    hoursAwake: wakefulness.hoursAwake,
    totals,
    shutdowns,
    collapsed,
    eventKinds: [...eventKinds].sort(),
    recoveryByContext,
    chargedHours,
  };
}


function relative(left: number, right: number): number {
  return Math.abs(left - right) / Math.max(1, Math.abs(left));
}

const SUBDIVISIONS = [2, 5, 60, 600] as const;

function expectInvariant(name: string, scenario: Case): void {
  const once = run(scenario, 1);

  for (const steps of SUBDIVISIONS) {
    const many = run(scenario, steps);

    expect([name, steps, relative(once.current, many.current) < 1e-9])
      .toEqual([name, steps, true]);
    expect([name, steps, relative(once.hoursAwake, many.hoursAwake) < 1e-9])
      .toEqual([name, steps, true]);

    for (const term of ["recovery", "physical", "upkeep", "leakage"] as const) {
      expect([name, steps, term, relative(
        once.totals[term],
        many.totals[term],
      ) < 1e-9]).toEqual([name, steps, term, true]);
    }

    /* Discrete outcomes must match EXACTLY, not to a tolerance. */
    expect([name, steps, many.shutdowns]).toEqual([name, steps, once.shutdowns]);
    expect([name, steps, many.collapsed]).toEqual([name, steps, once.collapsed]);

    /*
     * `interval-end` fires once per sub-interval by construction, so it is the
     * one kind a subdivision legitimately produces more of.
     */
    expect([
      name,
      steps,
      many.eventKinds.filter((kind) => kind !== "interval-end"),
    ]).toEqual([
      name,
      steps,
      once.eventKinds.filter((kind) => kind !== "interval-end"),
    ]);

    expect([name, steps, [...many.recoveryByContext.keys()].sort()])
      .toEqual([name, steps, [...once.recoveryByContext.keys()].sort()]);

    for (const [context, used] of once.recoveryByContext) {
      expect([name, steps, context, relative(
        used,
        many.recoveryByContext.get(context) ?? 0,
      ) < 1e-9]).toEqual([name, steps, context, true]);
    }

    expect([name, steps, [...many.chargedHours.keys()].sort()])
      .toEqual([name, steps, [...once.chargedHours.keys()].sort()]);

    for (const [id, hours] of once.chargedHours) {
      expect([name, steps, id, relative(
        hours,
        many.chargedHours.get(id) ?? 0,
      ) < 1e-9]).toEqual([name, steps, id, true]);
    }
  }
}


describe("one advance equals many", () => {
  const cases: Readonly<Record<string, Case>> = {
    "recovery only": {
      hours: 8,
      current: 0,
      activity: { mode: "sleep" },
    },

    "upkeep only": {
      hours: 4,
      current: 50_000,
      upkeep: [{ id: "ren", source: "ren", baseRate: 100, period: "hour" }],
    },

    "recovery plus upkeep": {
      hours: 6,
      current: 20_000,
      activity: { mode: "intentional-rest" },
      upkeep: [{ id: "ren", source: "ren", baseRate: 1000, period: "hour" }],
    },

    "sustained physical activity": {
      hours: 5,
      current: 50_000,
      activity: { mode: "ordinary-waking", activity: "strenuous" },
    },

    "uncontained leakage": {
      hours: 100,
      current: 50_000,
      access: UNCONTAINED,
    },

    "multiple upkeep commitments": {
      hours: 6,
      current: 3000,
      upkeep: [
        { id: "a", source: "a", baseRate: 300, period: "hour", priority: 1 },
        { id: "b", source: "b", baseRate: 500, period: "hour", priority: 0 },
      ],
    },

    "Aura reaching Maximum": {
      hours: 20,
      current: 40_000,
      activity: { mode: "sleep" },
    },

    "Aura reaching zero": {
      hours: 10,
      current: 2000,
      upkeep: [{ id: "ren", source: "ren", baseRate: 1000, period: "hour" }],
    },

    "upkeep shutdown mid-interval": {
      hours: 3,
      current: 150,
      upkeep: [{ id: "ren", source: "ren", baseRate: 100, period: "hour" }],
    },

    "collapse": {
      hours: 200,
      current: 50_000,
      access: UNCONTAINED,
    },

    "wakefulness and sleep": {
      hours: 9,
      current: 10_000,
      activity: { mode: "sleep" },
    },

    "filling while paying upkeep": {
      hours: 12,
      current: 49_000,
      activity: { mode: "sleep" },
      upkeep: [{ id: "ren", source: "ren", baseRate: 400, period: "hour" }],
    },

    /* ── The boundary cases the timeline corrections introduced ──────── */

    "suppression beginning": {
      hours: 8,
      current: 20_000,
      activity: { mode: "ordinary-waking" },
      activityChanges: [{
        at: T0 + hoursToDuration(3),
        activity: {
          mode: "intentional-rest",
          suppression: { source: "zetsu", multiplier: 1, forced: false },
        },
      }],
    },

    "suppression beginning and ending": {
      hours: 8,
      current: 20_000,
      activity: { mode: "ordinary-waking" },
      activityChanges: [
        {
          at: T0 + hoursToDuration(2),
          activity: {
            mode: "intentional-rest",
            suppression: { source: "zetsu", multiplier: 2, forced: false },
          },
        },
        {
          at: T0 + hoursToDuration(5),
          activity: { mode: "ordinary-waking" },
        },
      ],
    },

    /* Leakage running, interrupted, and running again. */
    "leakage interrupted by suppression": {
      hours: 10,
      current: 50_000,
      access: UNCONTAINED,
      activity: { mode: "ordinary-waking" },
      activityChanges: [
        {
          at: T0 + hoursToDuration(2),
          activity: {
            mode: "ordinary-waking",
            suppression: { source: "zetsu", multiplier: 1, forced: true },
          },
        },
        {
          at: T0 + hoursToDuration(6),
          activity: { mode: "ordinary-waking" },
        },
      ],
    },

    "activity changes": {
      hours: 12,
      current: 25_000,
      activity: { mode: "ordinary-waking", activity: "strenuous" },
      activityChanges: [
        {
          at: T0 + hoursToDuration(4),
          activity: { mode: "intentional-rest" },
        },
        { at: T0 + hoursToDuration(6), activity: { mode: "sleep" } },
      ],
    },

    "timed upkeep starting and expiring": {
      hours: 8,
      current: 40_000,
      upkeep: [
        {
          id: "late",
          source: "ren",
          baseRate: 500,
          period: "hour",
          startsAt: T0 + hoursToDuration(2),
        },
        {
          id: "brief",
          source: "ken",
          baseRate: 300,
          period: "hour",
          endsAt: T0 + hoursToDuration(5),
        },
      ],
    },

    "instantaneous events": {
      hours: 6,
      current: 30_000,
      activity: { mode: "intentional-rest" },
      instantaneous: [
        {
          at: T0 + hoursToDuration(1),
          kind: "forced-drain",
          source: "hit",
          amount: 4000,
        },
        {
          at: T0 + hoursToDuration(3.5),
          kind: "physical",
          source: "swing",
          amount: 2000,
        },
        {
          at: T0 + hoursToDuration(5),
          kind: "recovery",
          source: "potion",
          amount: 1500,
        },
      ],
    },

    "multiple simultaneous events": {
      hours: 4,
      current: 1000,
      activity: { mode: "intentional-rest" },
      instantaneous: [
        {
          at: T0 + hoursToDuration(2),
          kind: "forced-drain",
          source: "hit",
          amount: 9000,
        },
        {
          at: T0 + hoursToDuration(2),
          kind: "recovery",
          source: "potion",
          amount: 3000,
        },
        {
          at: T0 + hoursToDuration(2),
          kind: "physical",
          source: "swing",
          amount: 500,
        },
      ],
    },

    /*
     * An event on the very first instant, and one a hair inside the last. Both
     * are owned by the interval; a subdivision must place each in exactly one
     * sub-interval and never in two.
     */
    "events at the interval edges": {
      hours: 6,
      current: 30_000,
      activity: { mode: "sleep" },
      instantaneous: [
        {
          at: T0,
          kind: "forced-drain",
          source: "opening",
          amount: 2000,
        },
        {
          at: T0 + hoursToDuration(6) - 1,
          kind: "forced-drain",
          source: "closing",
          amount: 2000,
        },
      ],
    },
  };

  for (const [name, scenario] of Object.entries(cases)) {
    it(`holds for ${name}`, () => {
      expectInvariant(name, scenario);
    });
  }

  /*
   * The ticket's own worst case. Eight hours resolved one second at a time is
   * 28,800 separate advances, each re-resolving the character from scratch.
   */
  it("survives 28,800 one-second advances", () => {
    const scenario: Case = {
      hours: 8,
      current: 20_000,
      activity: { mode: "sleep" },
      upkeep: [{ id: "ren", source: "ren", baseRate: 100, period: "hour" }],
    };

    const once = run(scenario, 1);
    const everySecond = run(scenario, 8 * 60 * 60);

    expect(relative(once.current, everySecond.current)).toBeLessThan(1e-9);
    expect(relative(once.totals.upkeep, everySecond.totals.upkeep))
      .toBeLessThan(1e-9);
    expect(once.hoursAwake).toBeCloseTo(everySecond.hoursAwake, 8);
  });

  /*
   * Final Fatigue is what a sheet actually shows, and it is a floor of a sum
   * of two curves — so a subdivision error large enough to move it would be a
   * subdivision error a player could see.
   */
  it("reaches the same Fatigue however the day is divided", () => {
    const context = auraContext({ attributes: STRONG, access: REN_III });

    const levels = [1, 4, 96].map((steps) => {
      let state: CharacterAuraState = { current: 50_000, allocations: [] };
      let wakefulness = { hoursAwake: 80 };
      let at = T0;
      let fatigue = 0;

      const step = hoursToDuration(24 / steps);

      for (let index = 0; index < steps; index += 1) {
        const result = advanceAuraTime({
          state,
          wakefulness,
          context,
          interval: gameTimeIntervalOf(at, step),
          activity: { mode: "ordinary-waking", activity: "moderate" },
        });

        if (!result.success) throw new Error("expected the interval to resolve");

        state = result.payload.state;
        wakefulness = result.payload.wakefulness;
        fatigue = result.payload.fatigue.level;
        at += step;
      }

      return fatigue;
    });

    expect(levels[1]).toBe(levels[0]);
    expect(levels[2]).toBe(levels[0]);
  });
});
