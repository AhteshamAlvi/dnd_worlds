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
import type { AuraTimeActivity } from "../character/foundation/aura/time";
import type { AuraUpkeepCommitment } from "../character/foundation/aura/upkeep";
import { restedWakefulness } from "../character/foundation/body/endurance";
import { gameTimeIntervalOf, hoursToDuration } from "../time/interval";
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
  readonly attributes?: Parameters<typeof auraContext>[0] extends undefined
    ? never
    : { readonly con: number; readonly vit: number; readonly dex: number };
  readonly access?: AuraAccessInput;
  readonly activity?: AuraTimeActivity;
  readonly upkeep?: readonly AuraUpkeepCommitment[];
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
  let collapsed = false;

  const step = hoursToDuration(scenario.hours / steps);

  for (let index = 0; index < steps; index += 1) {
    const result = advanceAuraTime({
      state,
      wakefulness,
      context,
      interval: gameTimeIntervalOf(at, step),
      activity: scenario.activity ?? { mode: "ordinary-waking" },
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

    for (const shutdown of result.payload.upkeepShutdowns) {
      shutdowns.push(shutdown.id);
      upkeep = upkeep.filter(
        (commitment) => commitment.id !== shutdown.id,
      );
    }

    if (result.payload.collapse !== null) collapsed = true;

    at += step;
  }

  return {
    current: state.current,
    hoursAwake: wakefulness.hoursAwake,
    totals,
    shutdowns,
    collapsed,
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

    expect([name, steps, [...many.shutdowns].sort()])
      .toEqual([name, steps, [...once.shutdowns].sort()]);
    expect([name, steps, many.collapsed]).toEqual([name, steps, once.collapsed]);
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
