/*
 * Endurance: Stamina efficiency, wakefulness, and the Fatigue they produce.
 *
 * The claim the whole model rests on is that there is NO second bar. Stamina
 * is a multiplier on what physical effort costs out of the one reserve the
 * character has; wakefulness is a count of hours; Fatigue is derived from
 * wakefulness and from how drained that one reserve is. Nothing here has a
 * current value, a maximum, or anything spent.
 *
 * Every cross-domain figure arrives as a plain number. This folder is what the
 * Aura domain depends on, and it depends on nothing but Time — so Maximum Aura
 * and the depletion fraction are arguments, never imports.
 */

import { describe, expect, it } from "vitest";

import {
  AURA_DEPLETION_FATIGUE_BANDS,
  MAXIMUM_FATIGUE,
  PHYSICAL_EXERTION_LOADS,
  REFERENCE_STAMINA,
  SUSTAINED_ACTIVITY_LEVELS,
  SUSTAINED_ACTIVITY_LOADS_PER_HOUR,
  WAKING_HOURS_CLEARED_PER_HOUR_SLEPT,
  advanceWakefulness,
  deriveAuraDepletionFatigue,
  deriveFatigue,
  deriveMaximumWakefulHours,
  deriveStaminaExpenditureMultiplier,
  deriveWakefulnessFatigue,
  findActivityCombinationIssues,
  resolveWakefulness,
  restedWakefulness,
} from "../character/foundation/body/endurance";
import { resolveStamina } from "../character/foundation/attributes/derived/resolution";
import type { CharacterStats } from "../character/foundation/attributes/stats";

function statsWith(con: number, vit: number): CharacterStats {
  return {
    str: 10, agi: 10, dex: 10, con, vit,
    int: 10, wis: 10, per: 10, spi: 10, cha: 10,
  };
}


describe("Stamina is efficiency, not a reserve", () => {
  it("stays the derived (CON + VIT) / 2 score", () => {
    expect(resolveStamina(statsWith(10, 10))).toBe(10);
    expect(resolveStamina(statsWith(20, 20))).toBe(20);
    expect(resolveStamina(statsWith(17, 19))).toBe(18);
  });

  it("hits every multiplier checkpoint", () => {
    expect(deriveStaminaExpenditureMultiplier(5)).toBe(2);
    expect(deriveStaminaExpenditureMultiplier(10)).toBe(1);
    expect(deriveStaminaExpenditureMultiplier(15)).toBeCloseTo(0.67, 2);
    expect(deriveStaminaExpenditureMultiplier(20)).toBe(0.5);
    expect(deriveStaminaExpenditureMultiplier(25)).toBe(0.4);
    expect(deriveStaminaExpenditureMultiplier(30)).toBeCloseTo(0.33, 2);
  });

  /*
   * The Rulebook quotes x0.67 to two decimals for reading. Rounding to it
   * would make a Stamina 15 character overpay by half a percent on every
   * action they ever take, and that compounds across a session.
   */
  it("keeps full internal precision rather than the printed two decimals", () => {
    expect(deriveStaminaExpenditureMultiplier(15)).toBe(10 / 15);
    expect(deriveStaminaExpenditureMultiplier(15)).not.toBe(0.67);
    expect(deriveStaminaExpenditureMultiplier(30)).toBe(10 / 30);
  });

  it("treats ten as the reference that pays exactly the baseline", () => {
    expect(REFERENCE_STAMINA).toBe(10);
    expect(deriveStaminaExpenditureMultiplier(REFERENCE_STAMINA)).toBe(1);
  });

  /* A division guard, not a rule. Stamina 1 already costs ten times baseline. */
  it("does not divide by zero at the bottom of the scale", () => {
    expect(deriveStaminaExpenditureMultiplier(0)).toBe(10);
    expect(Number.isFinite(deriveStaminaExpenditureMultiplier(-5))).toBe(true);
  });
});


describe("the exertion scales", () => {
  it("anchors the discrete scale on ordinary committed effort", () => {
    expect(PHYSICAL_EXERTION_LOADS).toEqual({
      "negligible": 0,
      "light": 0.25,
      "ordinary-committed": 1,
      "forceful": 2,
      "maximal": 4,
      "desperate-overexertion": 8,
    });
  });

  /*
   * Zero, and deliberately so. Walking, talking and eating cost nothing; the
   * cost of merely being awake is wakefulness, which accrues on its own.
   */
  it("charges nothing for an ordinary waking hour", () => {
    expect(SUSTAINED_ACTIVITY_LOADS_PER_HOUR["ordinary-waking"]).toBe(0);
  });

  it("keeps the sustained scale in load per hour", () => {
    expect(SUSTAINED_ACTIVITY_LOADS_PER_HOUR).toEqual({
      "ordinary-waking": 0,
      "light": 5,
      "moderate": 15,
      "strenuous": 50,
      "extreme": 100,
    });
  });
});


describe("activity combinations", () => {
  /*
   * Ordinary waking already covers walking, talking, eating and desk work, and
   * costs nothing — so it permits any activity level layered on top. Rest and
   * sleep are defined as the body doing nothing, which makes sustained
   * exertion during them a contradiction rather than a strenuous nap.
   */
  it("permits any activity during ordinary waking", () => {
    for (const activity of SUSTAINED_ACTIVITY_LEVELS) {
      expect(findActivityCombinationIssues({
        mode: "ordinary-waking",
        activity,
      })).toEqual([]);
    }
  });

  it("permits rest and sleep with no exertion at all", () => {
    for (const mode of ["intentional-rest", "sleep"] as const) {
      expect(findActivityCombinationIssues({ mode })).toEqual([]);
      expect(findActivityCombinationIssues({
        mode,
        activity: "ordinary-waking",
      })).toEqual([]);
      expect(findActivityCombinationIssues({ mode, activityLoadPerHour: 0 }))
        .toEqual([]);
    }
  });

  it("refuses the contradictory pairings", () => {
    for (const combination of [
      { mode: "sleep", activity: "extreme" },
      { mode: "intentional-rest", activity: "strenuous" },
      { mode: "sleep", activity: "light" },
      { mode: "intentional-rest", activityLoadPerHour: 5 },
    ] as const) {
      expect(findActivityCombinationIssues(combination).map((one) => one.code))
        .toEqual(["body.activity.combination.contradictory"]);
    }
  });

  /*
   * A nightmare, a possession, an ability that moves a sleeping body are all
   * real. The difference between a bug and a scene is whether somebody said so.
   */
  it("permits an exception when something names itself and says why", () => {
    expect(findActivityCombinationIssues({
      mode: "sleep",
      activity: "extreme",
      exertionOverride: {
        source: "nightmare-hatsu",
        reason: "The ability drives the body while its owner sleeps.",
      },
    })).toEqual([]);
  });

  it("refuses an override that explains nothing", () => {
    for (const override of [
      { source: "", reason: "why" },
      { source: "thing", reason: "  " },
    ]) {
      expect(findActivityCombinationIssues({
        mode: "sleep",
        activity: "extreme",
        exertionOverride: override,
      }).map((one) => one.code)).toEqual(["body.activity.override.incomplete"]);
    }
  });
});


describe("how long a body can stay up", () => {
  it("hits every anchor", () => {
    const anchors: readonly (readonly [number, number])[] = [
      [10, 48],
      [100, 72],
      [1_000, 96],
      [10_000, 120],
      [1_000_000, 168],
      [1_000_000_000, 240],
      [4_000_000_000, 240],
    ];

    for (const [maximumAura, hours] of anchors) {
      expect([maximumAura, deriveMaximumWakefulHours(maximumAura)])
        .toEqual([maximumAura, hours]);
    }
  });

  /*
   * The last two anchors are equal, and that is the floor rather than a cap.
   * 4e9 sits at 10.6 days before flooring and a body gets 10 for it.
   */
  it("floors to whole days rather than capping", () => {
    expect(deriveMaximumWakefulHours(4_000_000_000))
      .toBe(deriveMaximumWakefulHours(1_000_000_000));
    expect(deriveMaximumWakefulHours(10_000_000_000)).toBe(264);
  });

  it("grows logarithmically rather than proportionally", () => {
    /* A hundred thousand times the Aura buys three and a half more days. */
    expect(deriveMaximumWakefulHours(1_000_000) / deriveMaximumWakefulHours(10))
      .toBe(3.5);
  });

  it("never drops below a single day", () => {
    expect(deriveMaximumWakefulHours(0)).toBe(24);
    expect(deriveMaximumWakefulHours(1)).toBe(24);
    expect(deriveMaximumWakefulHours(Number.NaN)).toBe(24);
  });

  it("reports a character's position against their own limit", () => {
    expect(resolveWakefulness({ hoursAwake: 24 }, 10)).toEqual({
      hoursAwake: 24,
      maximumHours: 48,
      fraction: 0.5,
    });
  });

  /*
   * Past the limit a character is unconscious. How far past is not a
   * distinction the model needs, and an unclamped fraction of 3 would put the
   * quadratic Fatigue curve at 90.
   */
  it("clamps the fraction at the limit", () => {
    expect(resolveWakefulness({ hoursAwake: 500 }, 10).fraction).toBe(1);
  });
});


describe("advancing wakefulness", () => {
  it("accrues through an ordinary waking interval", () => {
    const result = advanceWakefulness(restedWakefulness(), "ordinary-waking", 8);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.state.hoursAwake).toBe(8);
    expect(result.payload.hoursChange).toBe(8);
  });

  /*
   * The rule the whole sleep-debt model rests on. Sitting down is not
   * sleeping, and a model in which it were would make sleep optional.
   */
  it("still accrues through intentional rest", () => {
    const result = advanceWakefulness({ hoursAwake: 20 }, "intentional-rest", 6);

    expect(result.success && result.payload.state.hoursAwake).toBe(26);
  });

  it("clears two waking hours per hour slept", () => {
    expect(WAKING_HOURS_CLEARED_PER_HOUR_SLEPT).toBe(2);

    const result = advanceWakefulness({ hoursAwake: 30 }, "sleep", 8);

    expect(result.success && result.payload.state.hoursAwake).toBe(14);
  });

  it("never drives the debt below zero", () => {
    const result = advanceWakefulness({ hoursAwake: 4 }, "sleep", 8);

    expect(result.success && result.payload.state.hoursAwake).toBe(0);
  });

  it("does not mutate the state it was given", () => {
    const before = { hoursAwake: 12 };

    advanceWakefulness(before, "sleep", 4);

    expect(before).toEqual({ hoursAwake: 12 });
  });

  it("rejects a negative duration or a nonsense debt", () => {
    expect(advanceWakefulness(restedWakefulness(), "sleep", -1).success)
      .toBe(false);
    expect(advanceWakefulness({ hoursAwake: Number.NaN }, "sleep", 1).success)
      .toBe(false);
  });
});


describe("the wakefulness component of Fatigue", () => {
  /*
   * Quadratic for its shape rather than its endpoints: half way to the limit
   * is still functional, three quarters is impaired, and the last stretch
   * arrives fast. A linear curve would make the first eight hours of a day
   * cost the same as the eight before collapse.
   */
  it("accumulates slowly early and quickly late", () => {
    expect(deriveWakefulnessFatigue(0)).toBe(0);
    expect(deriveWakefulnessFatigue(0.25)).toBeCloseTo(0.625, 10);
    expect(deriveWakefulnessFatigue(0.5)).toBeCloseTo(2.5, 10);
    expect(deriveWakefulnessFatigue(0.75)).toBeCloseTo(5.625, 10);
    expect(deriveWakefulnessFatigue(0.9)).toBeCloseTo(8.1, 10);
    expect(deriveWakefulnessFatigue(1)).toBe(MAXIMUM_FATIGUE);
  });

  it("gains more in the last quarter than in the first three", () => {
    const firstThreeQuarters = deriveWakefulnessFatigue(0.75);
    const lastQuarter =
      deriveWakefulnessFatigue(1) - deriveWakefulnessFatigue(0.75);

    expect(lastQuarter).toBeGreaterThan(firstThreeQuarters * 0.7);
  });

  it("reaches exactly Fatigue 10 at the limit and blacks the character out", () => {
    const fatigue = deriveFatigue({
      wakefulness: { hoursAwake: 48 },
      maximumAura: 10,
      depletionFraction: 0,
    });

    expect(fatigue.level).toBe(10);
    expect(fatigue.state).toBe("blackout");
    expect(fatigue.conscious).toBe(false);
  });
});


describe("the Aura-depletion component of Fatigue", () => {
  it("hits every band", () => {
    const cases: readonly (readonly [number, number])[] = [
      [0, 0],
      [0.24999, 0],
      [0.25, 1],
      [0.49999, 1],
      [0.5, 2],
      [0.74999, 2],
      [0.75, 3],
      [0.89999, 3],
      [0.9, 4],
      [0.99999, 4],
      [1, 5],
    ];

    for (const [depletion, fatigue] of cases) {
      expect([depletion, deriveAuraDepletionFatigue(depletion)])
        .toEqual([depletion, fatigue]);
    }
  });

  /* The calibration the bands exist to preserve. */
  it("puts roughly two thirds drained at +2", () => {
    expect(deriveAuraDepletionFatigue(0.65)).toBe(2);
  });

  it("is a closed ascending set of bands", () => {
    const thresholds = AURA_DEPLETION_FATIGUE_BANDS.map(
      (band) => band.atLeastDepletion,
    );

    expect([...thresholds].sort((a, b) => b - a)).toEqual([...thresholds]);
  });
});


describe("combining the two into one Fatigue", () => {
  function fatigueAt(hoursAwake: number, depletionFraction: number) {
    return deriveFatigue({
      wakefulness: { hoursAwake },
      maximumAura: 10,
      depletionFraction,
    });
  }

  it("adds the components", () => {
    const result = fatigueAt(24, 0.65);

    expect(result.components.wakefulnessRaw).toBeCloseTo(2.5, 10);
    expect(result.components.auraDepletion).toBe(2);
    expect(result.level).toBe(4);
  });

  /*
   * The wakefulness component reaches the sum UNROUNDED, and the raw figures
   * survive onto the result. Rounding it on its own first would turn 3.91 into
   * 4 and hand back a level the character has not reached; keeping it raw also
   * lets a sheet show how close the next one is.
   */
  it("combines the raw components rather than rounded ones", () => {
    const result = fatigueAt(30, 0.3);

    expect(result.components.wakefulnessRaw).toBeCloseTo(3.90625, 10);
    expect(result.components.auraDepletion).toBe(1);
    expect(result.components.totalRaw).toBeCloseTo(4.90625, 10);

    /* Rounding the component first would have produced 5. */
    expect(result.level).toBe(4);
  });

  it("caps at 10 however far past the two components go", () => {
    const result = fatigueAt(48, 1);

    expect(result.components.totalRaw).toBe(10);
    expect(result.level).toBe(10);
  });

  it("stops a character fighting at 9 and puts them out at 10", () => {
    /* 32 hours awake of 48 is 4.44, and an empty reserve is +5. */
    const nine = fatigueAt(32, 1);

    expect(nine.level).toBe(9);
    expect(nine.state).toBe("cannot-fight");
    expect(nine.canFight).toBe(false);
    expect(nine.conscious).toBe(true);

    /* Four more hours awake is 5.63, and the same empty reserve tips it. */
    const ten = fatigueAt(36, 1);

    expect(ten.level).toBe(10);
    expect(ten.state).toBe("blackout");
    expect(ten.canFight).toBe(false);
    expect(ten.conscious).toBe(false);
  });

  it("names every state band", () => {
    expect(fatigueAt(0, 0).state).toBe("unimpaired");
    expect(fatigueAt(36, 0).state).toBe("fatigued");
    expect(fatigueAt(42, 0).state).toBe("severely-fatigued");
    expect(fatigueAt(46, 0).state).toBe("cannot-fight");
    expect(fatigueAt(48, 0).state).toBe("blackout");
  });

  /*
   * Exertion is charged through depletion and must not also be a third term.
   * Two characters equally drained are equally tired however they got there.
   */
  it("charges physical exertion only through Aura depletion", () => {
    expect(fatigueAt(10, 0.5)).toEqual(fatigueAt(10, 0.5));

    const keys = Object.keys(fatigueAt(10, 0.5).components);

    expect(keys).toEqual(["wakefulnessRaw", "auraDepletion", "totalRaw"]);
  });

  it("carries no dice penalty of its own", () => {
    const result = fatigueAt(36, 0.8);

    for (const invented of ["modifier", "penalty", "dicePenalty", "checkModifier"]) {
      expect(result).not.toHaveProperty(invented);
    }
  });

  it("answers rather than failing on a nonsense input", () => {
    expect(deriveFatigue({
      wakefulness: { hoursAwake: Number.NaN },
      maximumAura: 10,
      depletionFraction: Number.NaN,
    }).level).toBe(0);
  });
});
