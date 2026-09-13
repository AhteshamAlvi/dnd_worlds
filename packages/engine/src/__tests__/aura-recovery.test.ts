/*
 * Getting Aura back, and losing it to an open node.
 *
 * The rule that replaced unrestricted replenishment: recovery requires an
 * EXPLICIT context. An ordinary waking hour recovers nothing, and the Aura
 * domain never infers whether the character is resting or asks which principle
 * is suppressing them — suppression arrives as a multiplier something else
 * resolved.
 *
 * Leakage is the other direction, and only one state produces it: an awakened
 * character who never learned Ten, whose open nodes bleed a full reserve in
 * exactly as long as they could have stayed awake.
 */

import { describe, expect, it, vi } from "vitest";

import {
  AURA_RECOVERY_MODE_MULTIPLIERS,
  deriveAuraRegeneration,
  recoverAura,
  resolveAuraRecoveryMultiplier,
} from "../character/foundation/aura/recovery";
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
import { deriveZetsuReplenishmentMultiplier } from "../character/foundation/nen/principles/zetsu";
import type { AuraSuppression } from "../character/foundation/aura/types";

import { auraTestAttributes, UNAWAKENED, UNCONTAINED, WITH_TEN } from "./fixtures/aura";

/* VIT 18 regenerates 700 Aura per hour at a x1.0 context. */
const VIT_18 = auraTestAttributes({ con: 20, vit: 18 });
const MAX_AURA = 20_000;

function zetsu(mastery: 1 | 3 | 10, forced = false): AuraSuppression {
  return {
    source: `zetsu-${mastery}`,
    multiplier: deriveZetsuReplenishmentMultiplier(mastery),
    forced,
  };
}

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


describe("recovery contexts", () => {
  it("keeps the VIT-derived capacity unchanged", () => {
    expect(deriveAuraRegeneration(VIT_18)).toBe(700);
  });

  /*
   * The whole reason unrestricted replenishment had to go. A character who
   * walked around for eight hours used to come back full.
   */
  it("recovers nothing through an ordinary waking hour", () => {
    expect(AURA_RECOVERY_MODE_MULTIPLIERS["ordinary-waking"]).toBe(0);
    expect(recovered(10_000, { mode: "ordinary-waking" }, 8)).toBe(0);
  });

  it("recovers at half rate through intentional rest", () => {
    expect(recovered(10_000, { mode: "intentional-rest" }, 1)).toBe(350);
  });

  it("recovers at full rate through sleep", () => {
    expect(recovered(10_000, { mode: "sleep" }, 1)).toBe(700);
  });

  /*
   * The table says rest plus Zetsu I is x1.0, not x0.5. The suppression
   * multiplier is the resolved answer for that character rather than a bonus
   * on top of the ordinary rest rate.
   */
  it("makes rest behind Zetsu I equal to sleeping", () => {
    expect(recovered(10_000, { mode: "intentional-rest", suppression: zetsu(1) }, 1))
      .toBe(recovered(10_000, { mode: "sleep" }, 1));
  });

  it("scales with higher Zetsu", () => {
    expect(deriveZetsuReplenishmentMultiplier(3)).toBe(1.5);
    expect(deriveZetsuReplenishmentMultiplier(10)).toBe(5);

    expect(recovered(0, { mode: "intentional-rest", suppression: zetsu(3) }, 1))
      .toBe(1050);
    expect(recovered(0, { mode: "intentional-rest", suppression: zetsu(10) }, 1))
      .toBe(3500);
  });

  /* Standing in a corridor holding Zetsu is not rest. */
  it("gives voluntary suppression nothing to work with while awake", () => {
    expect(recovered(10_000, { mode: "ordinary-waking", suppression: zetsu(10) }, 1))
      .toBe(0);
  });

  /*
   * A character whose Aura was slammed shut by collapse is not choosing
   * anything, so forced suppression applies whatever they are doing.
   */
  it("applies forced suppression regardless of mode", () => {
    expect(recovered(
      10_000,
      { mode: "ordinary-waking", suppression: zetsu(1, true) },
      1,
    )).toBe(700);
  });

  it("never lets suppression downgrade someone already asleep", () => {
    const resolved = resolveAuraRecoveryMultiplier({
      mode: "sleep",
      suppression: { source: "weak", multiplier: 0.25, forced: false },
    });

    expect(resolved.multiplier).toBe(1);
    expect(resolved.context).toBe("sleep");
  });

  it("names what produced the multiplier", () => {
    expect(resolveAuraRecoveryMultiplier({ mode: "sleep" }).context)
      .toBe("sleep");
    expect(resolveAuraRecoveryMultiplier({
      mode: "intentional-rest",
      suppression: zetsu(3),
    }).context).toBe("zetsu-3");
  });

  /*
   * Falls out of the table rather than needing a rule: an unawakened character
   * has no suppression to supply, and ordinary waking is x0.
   */
  it("lets an unawakened character recover only by resting or sleeping", () => {
    const access = resolveAuraAccess(UNAWAKENED);

    expect(access.success && access.payload.awakened).toBe(false);

    expect(recovered(10_000, { mode: "ordinary-waking" }, 8)).toBe(0);
    expect(recovered(10_000, { mode: "intentional-rest" }, 8)).toBeGreaterThan(0);
    expect(recovered(10_000, { mode: "sleep" }, 8)).toBeGreaterThan(0);
  });

  it("caps recovery at the Aura actually missing", () => {
    const result = recoverAura(
      createAuraPool(19_800, MAX_AURA),
      VIT_18,
      { mode: "sleep" },
      8,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.pool.current).toBe(MAX_AURA);
    expect(result.payload.contribution.potential).toBe(5600);
    expect(result.payload.contribution.used).toBe(200);
    expect(result.payload.contribution.discarded).toBe(5400);
  });

  it("reports what it restored, with provenance", () => {
    const result = recoverAura(
      createAuraPool(0, MAX_AURA),
      VIT_18,
      { mode: "intentional-rest", suppression: zetsu(3) },
      2,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.contribution).toEqual({
      source: "natural-regeneration",
      context: "zetsu-3",
      ratePerHour: 700,
      multiplier: 1.5,
      hours: 2,
      potential: 2100,
      used: 2100,
      discarded: 0,
    });
  });

  it("rejects an invalid duration, mode or multiplier", () => {
    const pool = createAuraPool(1000, MAX_AURA);

    expect(errorCodes(recoverAura(pool, VIT_18, { mode: "sleep" }, -1)))
      .toContain("aura.recovery.duration.invalid");

    expect(errorCodes(recoverAura(
      pool,
      VIT_18,
      { mode: "napping" as "sleep" },
      1,
    ))).toContain("aura.recovery.mode.invalid");

    expect(errorCodes(recoverAura(
      pool,
      VIT_18,
      {
        mode: "sleep",
        suppression: { source: "broken", multiplier: Number.NaN, forced: false },
      },
      1,
    ))).toContain("aura.recovery.multiplier.invalid");

    expect(errorCodes(recoverAura(
      pool,
      VIT_18,
      { mode: "sleep", suppression: { source: " ", multiplier: 1, forced: false } },
      1,
    ))).toContain("aura.recovery.suppression.source.missing");
  });

  it("does not mutate the pool it was given", () => {
    const pool = createAuraPool(1000, MAX_AURA);
    const taken = JSON.stringify(pool);

    recoverAura(pool, VIT_18, { mode: "sleep" }, 4);

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

  /* Opening Output does not teach containment. */
  it("keeps a Ten-less character leaking even under Ren", () => {
    expect(uncontained({
      ...UNCONTAINED,
      override: { kind: "output-access", source: "ren-iii", accessFraction: 0.3 },
    })).toBe(true);

    expect(uncontained({
      ...WITH_TEN,
      override: { kind: "output-access", source: "ren-iii", accessFraction: 0.3 },
    })).toBe(false);
  });

  /*
   * The case that makes `uncontained` a flag rather than an inference from a
   * missing coating: Chu has no coating and is containing Aura internally.
   */
  it("does not confuse an absent coating with an open wound", () => {
    expect(uncontained({
      ...WITH_TEN,
      override: { kind: "internal-access", source: "chu", accessFraction: 0.3 },
    })).toBe(false);

    expect(uncontained({
      ...WITH_TEN,
      override: { kind: "suppressed", source: "zetsu" },
    })).toBe(false);
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
