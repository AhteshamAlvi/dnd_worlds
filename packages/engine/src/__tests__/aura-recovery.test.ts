/*
 * Getting Aura back, and losing it to an open node.
 *
 * Recovery requires an EXPLICIT context, and the Aura domain never infers one.
 * It does not ask whether the character is resting and it does not know the
 * word Zetsu: what it reads is a wakefulness mode, one of four generic access
 * classes, and two booleans.
 *
 * Everything is expressed in R, the revised Regeneration unit — half the
 * rounded VIT curve — because the table's coefficients are small integers and
 * asserting them as raw numbers would hide which of the two moved.
 *
 * Leakage is the other direction, and there are now TWO of them: half-open
 * pores lose 2R an hour and cannot empty anybody, while an awakened character
 * who never learned Ten bleeds their Output every minute and can.
 */

import { describe, expect, it, vi } from "vitest";

import {
  auraRecoveryColumn,
  deriveAuraRegeneration,
  deriveRawAuraRegeneration,
  recoverAura,
  resolveAuraRecoveryMultiplier,
} from "../character/foundation/aura/recovery";
import { roundToOneSignificantFigure } from "../infrastructure/rounding";
import {
  AURA_COLLAPSE_REQUESTS,
  deriveUncontainedLeakage,
  resolveUncontainedLeakage,
  uncontainedCollapse,
} from "../character/foundation/aura/leakage";
import { createAuraPool, deriveMaximumAura } from "../character/foundation/aura/pool";
import { deriveAuraOutputLimit } from "../character/foundation/aura/output";
import { SECONDS_PER_COMBAT_ROUND } from "../time/duration";
import { resolveAuraAccess } from "../character/foundation/aura/access";
import * as zetsu from "../character/foundation/nen/principles/zetsu";
import { ZETSU_MASTERY_PROFILES } from "../character/foundation/nen/principles/zetsu";
import type { AuraRecoveryAccessClass } from "../character/foundation/aura/types";

import {
  auraTestAttributes,
  UNAWAKENED,
  UNCONTAINED,
  WITH_TEN,
  withTen,
} from "./fixtures/aura";

/* VIT 18 regenerates 700 Aura per hour at a x1.0 context. */
const VIT_18 = auraTestAttributes({ con: 20, vit: 18 });
const MAX_AURA = 20_000;

function recovered(
  current: number,
  context: Parameters<typeof recoverAura>[2],
  hours: number,
): number {
  const result = recoverAura(
    createAuraPool(current, MAX_AURA),
    VIT_18,
    context,
    hours,
  );

  if (!result.success) {
    throw new Error(
      "Expected recovery to resolve: " +
      result.errors.map((error) => error.code).join(", "),
    );
  }

  return result.payload.contribution.used;
}

function errorCodes(
  result: { success: boolean; errors?: readonly { code: string }[] },
): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((error) => error.code);
}


/*
 * The table, row by row, in units of R.
 *
 * VIT 18's curve rounds to 700, so R is 350 and every expectation below is a
 * small multiple of it. Written as coefficients rather than as raw numbers so
 * that a changed unit fails in one place and a changed COEFFICIENT fails in
 * the row that owns it.
 */
describe("the recovery table", () => {
  const R = 350;

  it("halves the rounded curve, and halves it AFTER rounding", () => {
    expect(deriveAuraRegeneration(VIT_18)).toBe(R);

    /* The old resolved figure, which R is exactly half of. */
    expect(roundToOneSignificantFigure(deriveRawAuraRegeneration(VIT_18)))
      .toBe(700);

    /*
     * Halving first would round a different number. VIT 13's curve is ~9.62:
     * rounded then halved is 5, halved then rounded is 5 as well — but VIT 18's
     * is ~661, where rounded-then-halved is 350 and halved-then-rounded is 300.
     */
    const vit18Raw = deriveRawAuraRegeneration(VIT_18);

    expect(roundToOneSignificantFigure(vit18Raw / 2)).not.toBe(R);
  });

  it("gives VIT 13 an R of 5, which the worked examples assume", () => {
    expect(deriveAuraRegeneration(auraTestAttributes({ con: 13, vit: 13 })))
      .toBe(5);
  });

  const rows: readonly (readonly [
    AuraRecoveryAccessClass,
    Record<"ordinary" | "physical" | "rest" | "sleep", number>,
  ])[] = [
    ["half-open", { ordinary: 2, physical: 1, rest: 3, sleep: 4 }],
    ["uncontained", { ordinary: 1, physical: 1, rest: 2, sleep: 4 }],
    ["contained", { ordinary: 2, physical: 1, rest: 3, sleep: 4 }],
    ["suppressed", { ordinary: 3, physical: 1, rest: 4, sleep: 4 }],
  ];

  for (const [accessClass, expected] of rows) {
    const suppression = accessClass === "suppressed"
      ? { suppression: { source: "zetsu", forced: false } }
      : {};

    it(`recovers ${expected.ordinary}R, ${expected.physical}R, ${expected.rest}R and ${expected.sleep}R as ${accessClass}`, () => {
      expect(recovered(
        0,
        { mode: "ordinary-waking", accessClass, ...suppression },
        1,
      )).toBe(expected.ordinary * R);

      expect(recovered(
        0,
        { mode: "ordinary-waking", accessClass, exerting: true, ...suppression },
        1,
      )).toBe(expected.physical * R);

      expect(recovered(
        0,
        { mode: "intentional-rest", accessClass, ...suppression },
        1,
      )).toBe(expected.rest * R);

      expect(recovered(
        0,
        { mode: "sleep", accessClass, ...suppression },
        1,
      )).toBe(expected.sleep * R);
    });
  }

  /*
   * The two shapes the table is worth reading FOR, asserted as relations so
   * they survive a re-tuning of the numbers themselves.
   */
  it("makes working the body cost everyone the same recovery", () => {
    const physical = rows.map(([accessClass, _]) => recovered(
      0,
      {
        mode: "ordinary-waking",
        accessClass,
        exerting: true,
        ...(accessClass === "suppressed"
          ? { suppression: { source: "zetsu", forced: false } }
          : {}),
      },
      1,
    ));

    expect(new Set(physical).size).toBe(1);
  });

  it("makes an uncontained character the worst at recovering, not merely the leakiest", () => {
    const ordinary = (accessClass: AuraRecoveryAccessClass) =>
      recovered(0, { mode: "ordinary-waking", accessClass }, 1);

    expect(ordinary("uncontained")).toBeLessThan(ordinary("contained"));
    expect(ordinary("uncontained")).toBeLessThan(ordinary("half-open"));
  });

  /*
   * A closed system is a closed system. What separates an ordinary person from
   * a character running Ten is the 2R their pores lose, which is leakage.ts's
   * business and not this table's.
   */
  it("treats half-open and contained identically", () => {
    for (const mode of ["ordinary-waking", "intentional-rest", "sleep"] as const) {
      expect(recovered(0, { mode, accessClass: "half-open" }, 1))
        .toBe(recovered(0, { mode, accessClass: "contained" }, 1));
    }
  });

  /* Exertion displaces ordinary waking only; rest and sleep keep their rows. */
  it("keeps the rest and sleep rows when something is moving a still body", () => {
    expect(auraRecoveryColumn("ordinary-waking", true)).toBe("physical");
    expect(auraRecoveryColumn("intentional-rest", true)).toBe("intentional-rest");
    expect(auraRecoveryColumn("sleep", true)).toBe("sleep");

    expect(recovered(
      0,
      { mode: "sleep", accessClass: "contained", exerting: true },
      1,
    )).toBe(4 * R);
  });
});


describe("what overrides the table", () => {
  const R = 350;

  /*
   * Producing Aura and projecting it are the same faculty. This is what makes
   * an indefinite Ren a decision rather than a default.
   */
  it("recovers nothing at all while a Nen activity is running", () => {
    for (const mode of ["ordinary-waking", "intentional-rest", "sleep"] as const) {
      expect(recovered(
        0,
        { mode, accessClass: "contained", activeNenUse: true },
        1,
      )).toBe(0);
    }

    expect(recovered(
      0,
      {
        mode: "ordinary-waking",
        accessClass: "contained",
        activeNenUse: true,
        exerting: true,
      },
      1,
    )).toBe(0);
  });

  it("names active Nen as what produced the zero", () => {
    expect(resolveAuraRecoveryMultiplier({
      mode: "sleep",
      accessClass: "contained",
      activeNenUse: true,
    })).toEqual({ multiplier: 0, context: "active-nen" });
  });

  /*
   * A character whose nodes were slammed shut by collapse is not choosing an
   * activity, so the rate does not depend on what they were doing when the
   * lights went out.
   */
  it("gives forced suppression a flat 3R whatever the character was doing", () => {
    for (const mode of ["ordinary-waking", "intentional-rest", "sleep"] as const) {
      expect(recovered(
        0,
        {
          mode,
          accessClass: "suppressed",
          suppression: { source: "collapse", forced: true },
        },
        1,
      )).toBe(3 * R);
    }

    expect(recovered(
      0,
      {
        mode: "ordinary-waking",
        accessClass: "suppressed",
        exerting: true,
        suppression: { source: "collapse", forced: true },
      },
      1,
    )).toBe(3 * R);
  });

  /*
   * The defect the old model had: Zetsu Mastery supplied x1 through x5, so a
   * Zetsu X in a corridor out-recovered a Zetsu I in bed. Rank buys
   * concealment and the ability to hold the state; it does not buy metabolism.
   */
  it("gives Zetsu no rank-scaled recovery to supply any more", () => {
    const zetsuModule = zetsu as Record<string, unknown>;

    expect(zetsuModule["deriveZetsuReplenishmentMultiplier"]).toBeUndefined();
    expect(zetsuModule["resolveZetsuReplenishment"]).toBeUndefined();

    for (const profile of Object.values(ZETSU_MASTERY_PROFILES)) {
      expect(Object.keys(profile).sort())
        .toEqual(["auraConcealmentModifier", "rank"]);
    }
  });

  it("recovers identically behind a Zetsu I and a Zetsu X", () => {
    const behind = (source: string) => recovered(
      0,
      {
        mode: "intentional-rest",
        accessClass: "suppressed",
        suppression: { source, forced: false },
      },
      1,
    );

    expect(behind("zetsu-1")).toBe(behind("zetsu-10"));
  });

  /*
   * And the replacement rule, stated positively: suppression is worth MORE in
   * bed than in a corridor, which is what the old `max(mode, rank)` destroyed.
   */
  it("makes a Zetsu held in bed worth more than one held in a corridor", () => {
    const held = (mode: "ordinary-waking" | "sleep") => recovered(
      0,
      {
        mode,
        accessClass: "suppressed",
        suppression: { source: "zetsu", forced: false },
      },
      1,
    );

    expect(held("sleep")).toBeGreaterThan(held("ordinary-waking"));
  });
});


describe("recovery, reported and refused", () => {
  it("caps recovery at the Aura actually missing", () => {
    const result = recoverAura(
      createAuraPool(19_800, MAX_AURA),
      VIT_18,
      { mode: "sleep", accessClass: "contained" },
      8,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.pool.current).toBe(MAX_AURA);
    expect(result.payload.contribution.potential).toBe(11_200);
    expect(result.payload.contribution.used).toBe(200);
    expect(result.payload.contribution.discarded).toBe(11_000);
  });

  it("reports what it restored, with provenance", () => {
    const result = recoverAura(
      createAuraPool(0, MAX_AURA),
      VIT_18,
      {
        mode: "intentional-rest",
        accessClass: "suppressed",
        suppression: { source: "zetsu-3", forced: false },
      },
      2,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.contribution).toEqual({
      source: "natural-regeneration",
      context: "zetsu-3",
      ratePerHour: 350,
      multiplier: 4,
      hours: 2,
      potential: 2800,
      used: 2800,
      discarded: 0,
    });
  });

  it("rejects an invalid duration, mode, class or activity fact", () => {
    const pool = createAuraPool(1000, MAX_AURA);

    expect(errorCodes(recoverAura(
      pool,
      VIT_18,
      { mode: "sleep", accessClass: "contained" },
      -1,
    ))).toContain("aura.recovery.duration.invalid");

    expect(errorCodes(recoverAura(
      pool,
      VIT_18,
      { mode: "napping" as "sleep", accessClass: "contained" },
      1,
    ))).toContain("aura.recovery.mode.invalid");

    expect(errorCodes(recoverAura(
      pool,
      VIT_18,
      { mode: "sleep", accessClass: "shut" as AuraRecoveryAccessClass },
      1,
    ))).toContain("aura.recovery.access_class.invalid");

    expect(errorCodes(recoverAura(
      pool,
      VIT_18,
      {
        mode: "sleep",
        accessClass: "contained",
        exerting: "yes" as unknown as boolean,
      },
      1,
    ))).toContain("aura.recovery.activity_fact.invalid");

    expect(errorCodes(recoverAura(
      pool,
      VIT_18,
      {
        mode: "sleep",
        accessClass: "suppressed",
        suppression: { source: " ", forced: false },
      },
      1,
    ))).toContain("aura.recovery.suppression.source.missing");
  });

  /*
   * Two states, not one character. They take different branches, so absorbing
   * the combination would silently pick one.
   */
  it("refuses suppression and active Nen together", () => {
    expect(errorCodes(recoverAura(
      createAuraPool(0, MAX_AURA),
      VIT_18,
      {
        mode: "sleep",
        accessClass: "suppressed",
        activeNenUse: true,
        suppression: { source: "zetsu", forced: false },
      },
      1,
    ))).toContain("aura.recovery.suppression.active_nen.contradictory");
  });

  it("refuses a suppression that disagrees with the class", () => {
    expect(errorCodes(recoverAura(
      createAuraPool(0, MAX_AURA),
      VIT_18,
      {
        mode: "sleep",
        accessClass: "contained",
        suppression: { source: "zetsu", forced: false },
      },
      1,
    ))).toContain("aura.recovery.suppression.class.contradictory");
  });

  it("does not mutate the pool it was given", () => {
    const pool = createAuraPool(1000, MAX_AURA);
    const taken = JSON.stringify(pool);

    recoverAura(pool, VIT_18, { mode: "sleep", accessClass: "contained" }, 4);

    expect(JSON.stringify(pool)).toBe(taken);
  });
});


describe("uncontained leakage", () => {
  /*
   * Scaled by what the body can force OUT rather than by how long it could
   * have stayed awake.
   *
   * This test used to assert 48 hours, from the old `A_max / H_wake` rule. It
   * now asserts five minutes, and the change is deliberate: open nodes with
   * nothing holding them shut bleed at the rate those nodes can pass, and how
   * long somebody can stay awake has nothing to do with node containment.
   * Wakefulness is untouched as a Body and Fatigue concern — it simply no
   * longer decides this.
   */
  const THRESHOLD = auraTestAttributes({ con: 13, vit: 13 });

  it("drains a standard full reserve in five minutes", () => {
    const maximumAura = deriveMaximumAura(THRESHOLD);
    const output = deriveAuraOutputLimit(THRESHOLD).maximum;

    /* The worked example the rule is stated against. */
    expect(maximumAura).toBe(100);
    expect(output).toBe(20);

    const leakage = deriveUncontainedLeakage(output, maximumAura);

    expect(leakage.ratePerMinute).toBe(20);
    expect(leakage.minutesToExhaustion).toBe(5);
    expect(leakage.hoursToExhaustion).toBeCloseTo(5 / 60, 12);
  });

  /*
   * Every rate derived from the one per-minute figure, so an hour of leakage
   * is exactly sixty minutes of it. Computing each from the Output Capacity
   * separately would leave them agreeing only to within rounding, and the
   * interval-invariance guarantee would fail on the difference.
   */
  it("keeps its per-second, per-Round and per-hour rates exactly consistent", () => {
    const leakage = deriveUncontainedLeakage(20, 100);

    expect(leakage.ratePerSecond).toBe(20 / 60);
    expect(leakage.ratePerRound).toBe(20 / 30);
    expect(leakage.ratePerHour).toBe(1200);

    expect(leakage.ratePerSecond * 60).toBeCloseTo(leakage.ratePerMinute, 12);
    expect(leakage.ratePerRound * 30).toBeCloseTo(leakage.ratePerMinute, 12);
    expect(leakage.ratePerMinute * 60).toBeCloseTo(leakage.ratePerHour, 12);
  });

  it("gives a partially depleted character proportionally less time", () => {
    expect(deriveUncontainedLeakage(20, 50).minutesToExhaustion).toBe(2.5);
    expect(deriveUncontainedLeakage(20, 25).minutesToExhaustion).toBe(1.25);
  });

  /*
   * A bigger reserve does NOT buy proportionally more time, and for a new
   * reason: Output Capacity grows with CON on its own curve, so a far more
   * powerful character leaks far faster too.
   */
  it("scales the rate with Output rather than with the reserve", () => {
    const big = auraTestAttributes({ con: 20, vit: 20 });

    const leakage = deriveUncontainedLeakage(
      deriveAuraOutputLimit(big).maximum,
      deriveMaximumAura(big),
    );

    expect(leakage.ratePerMinute).toBe(deriveAuraOutputLimit(big).maximum);
    expect(leakage.minutesToExhaustion).toBeLessThan(60);
  });

  it("does not consult wakefulness at all", () => {
    /*
     * Two characters with the same Output Capacity leak identically, whatever
     * their reserves and therefore whatever their wakefulness limits.
     */
    const left = deriveUncontainedLeakage(20, 100);
    const right = deriveUncontainedLeakage(20, 50_000);

    expect(right.ratePerMinute).toBe(left.ratePerMinute);
    expect(right.ratePerHour).toBe(left.ratePerHour);
  });

  it("caps what it takes at what is there", () => {
    /* 20/minute for six minutes is 120, and there are only 3 to take. */
    const result = resolveUncontainedLeakage(20, 3, 0.1);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.uncappedAmount).toBe(120);
    expect(result.payload.amount).toBe(3);
  });

  it("rejects an invalid pool or duration", () => {
    expect(errorCodes(resolveUncontainedLeakage(20, -1, 1)))
      .toContain("aura.leakage.pool.invalid");
    expect(errorCodes(resolveUncontainedLeakage(20, 5, -1)))
      .toContain("aura.leakage.duration.invalid");
  });

  it("asks for everything a collapse implies, and nothing less", () => {
    expect(uncontainedCollapse(1_234_567)).toEqual({
      reason: "uncontained-leakage-exhausted",
      at: 1_234_567,
      requests: [...AURA_COLLAPSE_REQUESTS],
    });
  });
});


describe("which states actually leak", () => {
  function uncontained(input: Parameters<typeof resolveAuraAccess>[0]): boolean {
    const result = resolveAuraAccess(input);

    if (!result.success) throw new Error("expected access to resolve");

    return result.payload.uncontained;
  }

  /*
   * An ordinary person does not bleed out over two days. Half-open nodes leak,
   * but that leakage is what the pseudo-Chu is MADE of rather than a loss.
   */
  it("spares the unawakened", () => {
    expect(uncontained(UNAWAKENED)).toBe(false);
  });

  it("catches the awakened character who never learned Ten", () => {
    expect(uncontained(UNCONTAINED)).toBe(true);
  });

  it("stops once Ten is learned", () => {
    expect(uncontained(WITH_TEN)).toBe(false);
  });

  /*
   * A deliberate outward flow is what leaves the body while it runs, so it
   * replaces the open-node bleed rather than adding to it — for a character
   * with no Ten as much as for one with Ten.
   */
  it("stops the open-node bleed while an outward flow runs, Ten or no Ten", () => {
    expect(uncontained({
      ...UNCONTAINED,
      override: { kind: "outward-flow", source: "ren-iii", accessFraction: 0.3 },
    })).toBe(false);

    expect(uncontained(withTen(1, { kind: "outward-flow", source: "ren-iii", accessFraction: 0.3 }))).toBe(false);
  });

  /*
   * The case that makes `uncontained` a flag rather than an inference from a
   * missing coating: Chu has no coating and is containing Aura internally.
   */
  it("does not confuse an absent coating with an open wound", () => {
    expect(uncontained(withTen(1, { kind: "internal-access", source: "chu", accessFraction: 0.3 }))).toBe(false);

    expect(uncontained(withTen(1, { kind: "suppressed", source: "zetsu" }))).toBe(false);
  });
});


describe("the Round length is imported, not redeclared", () => {
  /*
   * `AURA_ROUND_SECONDS = 2` used to live in leakage.ts, duplicating
   * time/duration.ts's `SECONDS_PER_COMBAT_ROUND = 2` — whose own comment says
   * that a second copy would be "a second thing to keep in step".
   *
   * A true mutation test rather than an assertion about the current value:
   * the canonical module is replaced with one that says a Round is FOUR
   * seconds, and the per-Round leakage rate has to follow. If Aura ever goes
   * back to writing the number down, this stops changing and fails.
   */
  it("follows the canonical constant when it changes", async () => {
    vi.resetModules();

    vi.doMock("../time/duration", async () => {
      const actual = await vi.importActual<
        typeof import("../time/duration")
      >("../time/duration");

      return { ...actual, SECONDS_PER_COMBAT_ROUND: 4 };
    });

    const mutated = await import("../character/foundation/aura/leakage");

    /* Twice the seconds in a Round is twice the leakage inside one. */
    expect(mutated.deriveUncontainedLeakage(20, 100).ratePerRound)
      .toBeCloseTo(20 / 15, 12);

    vi.doUnmock("../time/duration");
    vi.resetModules();

    const restored = await import("../character/foundation/aura/leakage");

    expect(restored.deriveUncontainedLeakage(20, 100).ratePerRound)
      .toBeCloseTo(20 / 30, 12);
  });

  it("derives the per-Round rate from the per-minute one", () => {
    const leakage = deriveUncontainedLeakage(20, 100);

    expect(leakage.ratePerRound * (60 / SECONDS_PER_COMBAT_ROUND))
      .toBeCloseTo(leakage.ratePerMinute, 12);
  });
});
