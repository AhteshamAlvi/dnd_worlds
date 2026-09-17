/*
 * Ten: a fixed coating, and a leak that Mastery closes.
 *
 * Ten used to scale its coating by Ten Mastery and by how much Output Ren had
 * opened, with a 5% floor underneath, and to leak nothing at every rank. That
 * coupled two principles that are alternatives rather than layers, and gave
 * Mastery a job — coating strength — it no longer has. The rule now is two
 * formulas, neither of which reads Ren:
 *
 *   intendedCoating       = P * 0.10                at every rank
 *   leakagePerHour(m)     = 2R * (10 - m) / 9       2R at I, 0 at X
 *
 * Ten keeps the CONTAINED recovery column and reports its residual leak as a
 * separate contribution, so Ten I breaks even on an ordinary day and Ten X
 * gains 2R.
 *
 * Working numbers, standard human at CON 20 / VIT 20:
 *
 *   Physiological Output P   10,000
 *   Maximum Aura             50,000
 *   Regeneration unit R       2,500
 *   whole body surface       16,900 cm2 (1.69 m2)
 */

import { describe, expect, it } from "vitest";

import { advanceAuraTime } from "../character/foundation/aura/time";
import type { AuraTimeActivity } from "../character/foundation/aura/time";
import { resolveAuraBudget } from "../character/foundation/aura/budget";
import { resolveAuraProfile } from "../character/foundation/aura/resolution";
import {
  deriveFatigue,
  restedWakefulness,
} from "../character/foundation/body/endurance";
import { gameTimeIntervalOf, hoursToDuration } from "../time/interval";
import * as ten from "../character/foundation/nen/principles/ten";
import {
  deriveTenLeakageRegenerationMultiple,
  resolveTenContainment,
  TEN_COATING_OUTPUT_FRACTION,
  tenSurfaceCoating,
} from "../character/foundation/nen/principles/ten";
import type { MasteryRank } from "../character/capabilities/mastery";

import { auraContext, withTen } from "./fixtures/aura";

const STRONG = { con: 20, vit: 20 } as const;
const P = 10_000;
const R = 2500;
const MAX = 50_000;
const T0 = 1_000_000_000;

const RANKS: readonly MasteryRank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function containment(input: {
  physiologicalOutput: number;
  regenerationPerHour: number;
  mastery: number;
}) {
  const result = resolveTenContainment(input);

  if (!result.success) {
    throw new Error(
      "Expected Ten to resolve: " +
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

function advance(options: {
  readonly rank: number;
  readonly current?: number;
  readonly hours?: number;
  readonly activity?: AuraTimeActivity;
  readonly startedAt?: number;
  readonly wakefulness?: ReturnType<typeof restedWakefulness>;
}) {
  const result = advanceAuraTime({
    state: { current: options.current ?? 25_000, allocations: [] },
    wakefulness: options.wakefulness ?? restedWakefulness(),
    context: auraContext({ attributes: STRONG, access: withTen(options.rank) }),
    interval: gameTimeIntervalOf(
      options.startedAt ?? T0,
      hoursToDuration(options.hours ?? 1),
    ),
    activity: options.activity ?? { mode: "ordinary-waking" },
  });

  if (!result.success) {
    throw new Error(
      "Expected the interval to resolve: " +
      result.errors.map((error) => error.code).join(", "),
    );
  }

  return result.payload;
}


/* ── 10.1 Pure behaviour ────────────────────────────────────────────────── */

describe("the coating is 10% of Physiological Output at every rank", () => {
  it("resolves exactly 0.10P for every rank and several P, fractional included", () => {
    for (const physiologicalOutput of [0, 3.3, 20, 137.5, 10_000]) {
      for (const mastery of RANKS) {
        const resolved = containment({
          physiologicalOutput,
          regenerationPerHour: R,
          mastery,
        });

        expect([physiologicalOutput, mastery, resolved.intendedCoating])
          .toEqual([physiologicalOutput, mastery, physiologicalOutput * 0.1]);
      }
    }
  });

  /*
   * The old floor was 5%, and at P = 20 a novice wore 1. The fixed rule gives
   * 2 — which a restored floor, a mastery scale or a Ren share would all move.
   */
  it("has no 5% floor and no mastery scaling", () => {
    expect(TEN_COATING_OUTPUT_FRACTION).toBe(0.1);

    const atOne = containment({ physiologicalOutput: 20, regenerationPerHour: R, mastery: 1 });
    const atTen = containment({ physiologicalOutput: 20, regenerationPerHour: R, mastery: 10 });

    expect(atOne.intendedCoating).toBe(2);
    expect(atTen.intendedCoating).toBe(2);
  });

  /*
   * Ren is not an input. A caller still passing the old field gets exactly the
   * same answer, because nothing reads it.
   */
  it("is identical however much Ren a stale caller claims", () => {
    const base = containment({ physiologicalOutput: P, regenerationPerHour: R, mastery: 4 });

    for (const renAccessFraction of [0, 0.1, 0.5, 1]) {
      const stale = resolveTenContainment({
        physiologicalOutput: P,
        regenerationPerHour: R,
        mastery: 4,
        renAccessFraction,
      } as Parameters<typeof resolveTenContainment>[0]);

      expect(stale.success && stale.payload).toEqual(base);
    }

    for (const mastery of RANKS) {
      expect(tenSurfaceCoating(mastery)!.outputFraction).toBe(0.1);
    }
  });
});


describe("Mastery closes the residual leak", () => {
  it("leaks exactly 2R at Mastery I and nothing at Mastery X", () => {
    expect(containment({ physiologicalOutput: P, regenerationPerHour: R, mastery: 1 }).leakagePerHour)
      .toBe(2 * R);
    expect(containment({ physiologicalOutput: P, regenerationPerHour: R, mastery: 10 }).leakagePerHour)
      .toBe(0);
  });

  /*
   * Exact rationals, not the printed coefficients. 16/9 and 2/9 are what the
   * formula produces; 1.78 and 0.22 are what a rules page shows.
   */
  it("uses the exact rational multiple at every intermediate rank", () => {
    expect(deriveTenLeakageRegenerationMultiple(2)).toBe(16 / 9);
    expect(deriveTenLeakageRegenerationMultiple(9)).toBe(2 / 9);
    expect(deriveTenLeakageRegenerationMultiple(2)).not.toBe(1.78);
    expect(deriveTenLeakageRegenerationMultiple(9)).not.toBe(0.22);

    for (const mastery of RANKS) {
      expect([mastery, deriveTenLeakageRegenerationMultiple(mastery)])
        .toEqual([mastery, (2 * (10 - mastery)) / 9]);

      const resolved = containment({
        physiologicalOutput: P,
        regenerationPerHour: R,
        mastery,
      });

      expect(resolved.leakagePerHour)
        .toBeCloseTo((2 * R * (10 - mastery)) / 9, 9);
    }

    expect(containment({ physiologicalOutput: P, regenerationPerHour: R, mastery: 2 }).leakagePerHour)
      .toBeCloseTo((16 * R) / 9, 9);
  });

  it("carries the same multiple into the projection Aura consumes", () => {
    for (const mastery of RANKS) {
      expect(tenSurfaceCoating(mastery)).toEqual({
        source: "baseline-ten",
        outputFraction: 0.1,
        leakageRegenerationMultiple: deriveTenLeakageRegenerationMultiple(mastery),
      });
    }
  });
});


describe("bad input is refused rather than absorbed", () => {
  const cases: readonly (readonly [string, Parameters<typeof resolveTenContainment>[0], string])[] = [
    ["a negative Physiological Output", { physiologicalOutput: -1, regenerationPerHour: R, mastery: 3 }, "nen.ten.physiological_output.invalid"],
    ["a NaN Physiological Output", { physiologicalOutput: Number.NaN, regenerationPerHour: R, mastery: 3 }, "nen.ten.physiological_output.invalid"],
    ["an infinite Physiological Output", { physiologicalOutput: Number.POSITIVE_INFINITY, regenerationPerHour: R, mastery: 3 }, "nen.ten.physiological_output.invalid"],
    ["a negative R", { physiologicalOutput: P, regenerationPerHour: -1, mastery: 3 }, "nen.ten.regeneration.invalid"],
    ["a NaN R", { physiologicalOutput: P, regenerationPerHour: Number.NaN, mastery: 3 }, "nen.ten.regeneration.invalid"],
    ["Mastery XI", { physiologicalOutput: P, regenerationPerHour: R, mastery: 11 }, "nen.ten.mastery.invalid"],
    ["an unlearned Mastery", { physiologicalOutput: P, regenerationPerHour: R, mastery: 0 }, "nen.ten.mastery.invalid"],
    ["a fractional Mastery", { physiologicalOutput: P, regenerationPerHour: R, mastery: 1.5 }, "nen.ten.mastery.invalid"],
    ["a NaN Mastery", { physiologicalOutput: P, regenerationPerHour: R, mastery: Number.NaN }, "nen.ten.mastery.invalid"],
  ];

  for (const [label, input, code] of cases) {
    it(`refuses ${label}`, () => {
      const result = resolveTenContainment(input);

      expect(result.success).toBe(false);
      expect(errorCodes(result)).toContain(code);
      expect(result.trace.root.output).toBe(false);
    });
  }

  it("projects no coating for a character Ten does not reach", () => {
    expect(tenSurfaceCoating(0)).toBeNull();
    expect(tenSurfaceCoating(11)).toBeNull();
    expect(tenSurfaceCoating(1.5)).toBeNull();
    expect(tenSurfaceCoating(Number.NaN)).toBeNull();
  });

  it("traces the arithmetic when it succeeds", () => {
    const result = resolveTenContainment({ physiologicalOutput: 20, regenerationPerHour: 9, mastery: 1 });

    expect(result.trace.root.id).toBe("nen.ten.containment");
    expect(result.trace.root.output).toMatchObject({
      intendedCoating: 2,
      leakageRegenerationMultiple: 2,
      leakagePerHour: 18,
    });
  });
});


describe("the surface of the file", () => {
  /* A Major Principle: unlock-gated only, with no attribute requirement. */
  it("declares no attribute gate", () => {
    const surface = Object.keys(ten);

    for (const removed of [
      "TEN_MASTERY_PROFILES",
      "getTenMasteryProfile",
      "deriveTenMinimumDex",
      "meetsTenDexRequirement",
    ]) {
      expect(surface).not.toContain(removed);
    }
  });

  it("exports none of the coupled model", () => {
    const surface = Object.keys(ten);

    for (const removed of [
      "resolveTenCoating",
      "TEN_MINIMUM_COATING_OUTPUT_FRACTION",
      "deriveTenContainmentFraction",
      "resolveTenPassiveContainment",
    ]) {
      expect(surface).not.toContain(removed);
    }
  });
});


describe("the coating Ten places", () => {
  function profileAt(mastery: number, current = 40_000) {
    const result = resolveAuraProfile({
      state: { current, allocations: [] },
      ...auraContext({ attributes: STRONG, access: withTen(mastery) }),
    });

    if (!result.success) throw new Error("Expected the profile to resolve.");

    return result.payload;
  }

  /*
   * The canonical surface owner spreads it: every part's share sums back to
   * the resolved coating, at equal density, surface only.
   */
  it("partitions exactly 0.10P over the whole surface at every rank", () => {
    for (const mastery of RANKS) {
      const resolved = profileAt(mastery);

      const total = resolved.distribution.allocations.reduce(
        (sum, allocation) => sum + allocation.aura,
        0,
      );

      expect([mastery, total]).toEqual([mastery, expect.closeTo(1000, 9)]);

      for (const allocation of resolved.distribution.allocations) {
        expect([allocation.source, allocation.coverage, allocation.placement])
          .toEqual(["baseline-ten", "whole-body", "surface"]);
      }

      for (const part of resolved.byBodyPart) {
        expect(part.surface!.density.auraPerSquareMeter).toBeCloseTo(1000 / 1.69, 9);
        expect(part.internal?.aura ?? 0).toBe(0);
      }
    }
  });

  it("is capped by what the reserve can fund, and never charged", () => {
    const budget = resolveAuraBudget(250, auraContext({ attributes: STRONG, access: withTen(10) }));

    expect(budget.success && budget.payload.automaticAura).toBe(250);
    expect(budget.success && budget.payload.pool.current).toBe(250);
  });
});


/* ── 10.2 Time integration ──────────────────────────────────────────────── */

describe("Ten through the real interval solver", () => {
  type Column = readonly [string, AuraTimeActivity, number, number];

  /* [label, activity, recovery coefficient, physical rate] */
  const columns: readonly Column[] = [
    ["ordinary", { mode: "ordinary-waking" }, 2, 0],
    ["physical", { mode: "ordinary-waking", activity: "strenuous" }, 1, 2 * R],
    ["rest", { mode: "intentional-rest" }, 3, 0],
    ["sleep", { mode: "sleep" }, 4, 0],
  ];

  for (const mastery of [1, 2, 5, 9, 10] as const) {
    for (const [label, activity, coefficient, physical] of columns) {
      it(`settles Ten ${mastery} during ${label} term by term`, () => {
        const leak = (2 * R * (10 - mastery)) / 9;
        const result = advance({ rank: mastery, activity });
        const segment = result.segments[0]!;

        expect(result.segments).toHaveLength(1);
        expect(segment.recoveryRatePerHour).toBe(coefficient * R);
        expect(segment.leakageRatePerHour).toBeCloseTo(leak, 9);
        expect(segment.leakageSource).toBe(mastery === 10 ? null : "contained");
        expect(segment.physicalRatePerHour).toBe(physical);
        expect(segment.outwardFlowRatePerHour).toBe(0);
        expect(segment.accessState).toBe("ten");
        expect(segment.netRatePerHour)
          .toBeCloseTo(coefficient * R - leak - physical, 9);

        expect(result.balance.recovery).toBe(coefficient * R);
        expect(result.balance.leakage).toBeCloseTo(leak, 9);
        expect(result.leakageBySource).toEqual({
          halfOpen: 0,
          uncontained: 0,
          contained: expect.closeTo(leak, 9),
        });
        expect(result.balance.physical).toBe(physical);
        expect(result.balance.upkeep).toBe(0);
        expect(result.balance.outwardFlow).toBe(0);
        expect(result.balance.net).toBeCloseTo(coefficient * R - leak - physical, 9);
        expect(result.currentChange).toBeCloseTo(result.balance.net, 9);
        expect(result.unmetDrain).toBe(0);
        expect(result.recovery.discarded).toBe(0);
        expect(result.collapse).toBeNull();

        /* Ten is passive: it never suppresses recovery as active Nen would. */
        expect(result.balance.recoveryBySource[0]!.multiplier).toBe(coefficient);
      });
    }
  }

  it("anchors Ten I at 0, -3R, +R and +2R", () => {
    expect(columns.map(([, activity]) => advance({ rank: 1, activity }).balance.net))
      .toEqual([0, -3 * R, R, 2 * R]);
  });

  it("anchors Ten X at +2R, -R, +3R and +4R", () => {
    expect(columns.map(([, activity]) => advance({ rank: 10, activity }).balance.net))
      .toEqual([2 * R, -R, 3 * R, 4 * R]);
  });

  /*
   * Eight continuous hours still top the reserve off once, after the rates up
   * to that instant are settled — at every rank, leak or no leak.
   */
  it("completes an eight-hour sleep at every rank", () => {
    for (const mastery of RANKS) {
      const result = advance({
        rank: mastery,
        current: 0,
        hours: 9,
        activity: { mode: "sleep" },
      });

      const completed = result.events.filter((event) => event.kind === "sleep-completed");

      expect([mastery, completed.map((event) => event.at)])
        .toEqual([mastery, [T0 + hoursToDuration(8)]]);
      expect([mastery, result.current]).toEqual([mastery, MAX]);

      const leak = (2 * R * (10 - mastery)) / 9;
      const byRate = Math.min(MAX, (4 * R - leak) * 8);
      const topOff = result.balance.recoveryBySource
        .find((one) => one.source === "sleep-completion");

      expect([mastery, topOff?.used ?? 0])
        .toEqual([mastery, expect.closeTo(MAX - byRate, 6)]);
    }
  });
});


describe("Ten leakage reaching zero is ordinary depletion", () => {
  /*
   * Ten I while working: -3R an hour. 5,000 lasts 40 minutes, and the rest of
   * the two hours is spent at zero — clamped, with the shortfall reported —
   * and nobody collapses, blacks out or is shut into a Zetsu.
   */
  const result = advance({
    rank: 1,
    current: 5000,
    hours: 2,
    activity: { mode: "ordinary-waking", activity: "strenuous" },
  });

  it("clamps at zero at the exact instant and reports the shortfall", () => {
    expect(result.current).toBe(0);
    expect(result.events.find((event) => event.kind === "aura-empty")!.at)
      .toBeCloseTo(T0 + hoursToDuration(40 / 60), 3);

    /* Rates keep running after empty; what the pool could not pay is unmet. */
    expect(result.balance.leakage).toBeCloseTo(2 * 2 * R, 6);
    expect(result.balance.physical).toBeCloseTo(2 * 2 * R, 6);
    expect(result.balance.recovery).toBeCloseTo(2 * R, 6);
    expect(result.unmetDrain)
      .toBeCloseTo(result.balance.leakage + result.balance.physical - result.balance.recovery - 5000, 6);
  });

  it("emits no collapse, no forced suppression and no blackout", () => {
    expect(result.collapse).toBeNull();
    expect(result.events.some((event) => event.kind === "collapse")).toBe(false);

    for (const segment of result.segments) {
      expect(segment.accessState).toBe("ten");
      expect(segment.leakageSource).toBe("contained");
    }
  });

  it("recomputes coating funding and depletion Fatigue normally at zero", () => {
    const budget = resolveAuraBudget(0, auraContext({ attributes: STRONG, access: withTen(1) }));

    expect(budget.success && budget.payload.access.automaticSurfaceCoating!.outputFraction).toBe(0.1);
    expect(budget.success && budget.payload.automaticAura).toBe(0);
    expect(budget.success && budget.payload.usableOutput).toBe(0);

    expect(result.fatigue).toEqual(deriveFatigue({
      wakefulness: result.wakefulness,
      maximumAura: MAX,
      depletionFraction: 1,
    }));
  });
});


describe("Ten is subdivision-invariant", () => {
  function chained(options: {
    rank: number;
    current: number;
    activity: AuraTimeActivity;
    steps: number;
    stepHours: number;
  }) {
    let current = options.current;
    let wakefulness = restedWakefulness();
    let at = T0;
    let leakage = 0;
    let unmet = 0;
    const events: { at: number; kind: string }[] = [];

    for (let step = 0; step < options.steps; step += 1) {
      const result = advance({
        rank: options.rank,
        current,
        hours: options.stepHours,
        activity: options.activity,
        startedAt: at,
        wakefulness,
      });

      current = result.current;
      wakefulness = result.wakefulness;
      leakage += result.balance.leakage;
      unmet += result.unmetDrain;
      at += hoursToDuration(options.stepHours);

      for (const event of result.events) {
        if (event.kind === "interval-end") continue;
        events.push({ at: event.at, kind: event.kind });
      }
    }

    return { current, wakefulness, leakage, unmet, events };
  }

  it("agrees across an exact zero boundary", () => {
    const activity: AuraTimeActivity = { mode: "ordinary-waking", activity: "strenuous" };
    const whole = chained({ rank: 1, current: 5000, activity, steps: 1, stepHours: 3 });
    const hourly = chained({ rank: 1, current: 5000, activity, steps: 3, stepHours: 1 });
    const byMinute = chained({ rank: 1, current: 5000, activity, steps: 180, stepHours: 1 / 60 });

    for (const split of [hourly, byMinute]) {
      expect(split.current).toBeCloseTo(whole.current, 6);
      expect(split.leakage).toBeCloseTo(whole.leakage, 6);
      expect(split.unmet).toBeCloseTo(whole.unmet, 6);
      expect(split.events.map((event) => event.kind)).toEqual(whole.events.map((event) => event.kind));

      split.events.forEach((event, index) => {
        expect(event.at).toBeCloseTo(whole.events[index]!.at, 0);
      });
    }
  });

  it("agrees across a completed sleep", () => {
    const activity: AuraTimeActivity = { mode: "sleep" };
    const whole = chained({ rank: 5, current: 0, activity, steps: 1, stepHours: 10 });
    const split = chained({ rank: 5, current: 0, activity, steps: 40, stepHours: 0.25 });

    expect(split.current).toBeCloseTo(whole.current, 6);
    expect(split.leakage).toBeCloseTo(whole.leakage, 6);
    expect(split.wakefulness.consecutiveSleepHours)
      .toBeCloseTo(whole.wakefulness.consecutiveSleepHours ?? 0, 9);

    /*
     * The completion lands at the same eighth hour either way. Only the FIRST
     * report is compared: a night advanced in slices re-reports completion on
     * every slice after the eighth hour, because the capped streak stays at
     * eight. That is a pre-existing sleep-completion reporting defect outside
     * this ticket's scope; the reserve it produces is identical, as above.
     */
    const firstCompletion = (events: readonly { at: number; kind: string }[]) =>
      events.find((event) => event.kind === "sleep-completed")!.at;

    expect(firstCompletion(split.events)).toBeCloseTo(firstCompletion(whole.events), 0);
  });
});
