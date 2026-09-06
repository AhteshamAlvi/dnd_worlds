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

import { describe, expect, it } from "vitest";

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
import { resolveAuraAccess } from "../character/foundation/aura/access";
import { deriveZetsuReplenishmentMultiplier } from "../character/foundation/nen/principles/zetsu";
import { deriveMaximumWakefulHours } from "../character/foundation/body/endurance";
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
   * Scaled by the character's own wakefulness limit rather than by a flat
   * fraction, which is what makes the number mean something: an uncontained
   * character empties in exactly as long as they could have stayed awake.
   */
  it("drains a standard full reserve in exactly 48 hours", () => {
    const standard = deriveMaximumAura(auraTestAttributes());

    expect(standard).toBe(10);

    const leakage = deriveUncontainedLeakage(standard, standard);

    expect(leakage.maximumWakefulHours).toBe(48);
    expect(leakage.ratePerHour).toBeCloseTo(10 / 48, 12);
    expect(leakage.ratePerHour).toBeCloseTo(0.2083, 4);
    expect(leakage.hoursToExhaustion).toBe(48);
  });

  it("gives a partially depleted character proportionally less time", () => {
    expect(deriveUncontainedLeakage(10, 5).hoursToExhaustion).toBe(24);
    expect(deriveUncontainedLeakage(10, 2.5).hoursToExhaustion).toBe(12);
  });

  /*
   * A bigger reserve does not buy proportionally more time, because the
   * wakefulness limit it is divided by grew too.
   */
  it("lasts a larger pool exactly its own wakefulness limit", () => {
    const big = deriveMaximumAura(auraTestAttributes({ con: 20, vit: 20 }));

    expect(big).toBe(50_000);

    const leakage = deriveUncontainedLeakage(big, big);

    expect(leakage.maximumWakefulHours).toBe(deriveMaximumWakefulHours(big));
    expect(leakage.hoursToExhaustion).toBe(120);
  });

  it("caps what it takes at what is there", () => {
    const result = resolveUncontainedLeakage(10, 3, 48);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.uncappedAmount).toBe(10);
    expect(result.payload.amount).toBe(3);
  });

  it("rejects an invalid pool or duration", () => {
    expect(errorCodes(resolveUncontainedLeakage(10, -1, 1)))
      .toContain("aura.leakage.pool.invalid");
    expect(errorCodes(resolveUncontainedLeakage(10, 5, -1)))
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
