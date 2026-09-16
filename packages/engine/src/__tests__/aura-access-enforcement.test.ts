/*
 * Which Aura operations an access state permits.
 *
 * The asymmetry is the whole rule, and it is easy to get backwards:
 *
 *                              unawakened   awakened   suppressed
 *   physical exertion             yes          yes        yes
 *   involuntary drain             yes          yes        yes
 *   uncontained leakage            n/a      when so       no
 *   deliberate expenditure         NO          yes        NO
 *   deliberate upkeep              NO          yes        NO
 *
 * An unawakened body burns Aura moving around and can absolutely be drained of
 * it; what it cannot do is direct any of it. Suppression closes the nodes and
 * takes away the same two things. Neither was being checked before this: a
 * character in Zetsu could pay for a technique they have no way to project.
 */

import { describe, expect, it } from "vitest";

import {
  drainAura,
  spendActionAura,
  spendAura,
} from "../character/foundation/aura/transitions";
import { payAuraUpkeep } from "../character/foundation/aura/upkeep";
import {
  hasDeliberateAuraAccess,
  resolveAuraAccess,
} from "../character/foundation/aura/access";
import { advanceAuraTime } from "../character/foundation/aura/time";
import { gameTimeIntervalOf, hoursToDuration } from "../time/interval";
import { restedWakefulness } from "../character/foundation/body/endurance";
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
const STRONG = { con: 20, vit: 20, dex: 22 } as const;

/*
 * Ten I with 30% of physiological Output opened for deliberate use, through the
 * generic explicit override. Not Ren: Ren replaces Ten and is metered as an
 * outward flow, and these suites are about budgets and upkeep, not Ren.
 */
const OPEN_III: AuraAccessInput = withTen(1, {
  kind: "explicit",
  source: "open-output-iii",
  accessFraction: 0.3,
  deliberateInternalAccess: false,
  deliberateExternalAccess: true,
  automaticSurfaceCoating: true,
});

const ZETSU: AuraAccessInput = withTen(1, { kind: "suppressed", source: "zetsu" });

const STATE: CharacterAuraState = { current: 20_000, allocations: [] };

function context(access: AuraAccessInput) {
  return auraContext({ attributes: STRONG, access });
}

function errorCodes(
  result: { success: boolean; errors?: readonly { code: string }[] },
): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((error) => error.code);
}

const CLOSED = [
  ["unawakened", UNAWAKENED],
  ["suppressed", ZETSU],
] as const;

const OPEN = [
  ["with Ten", WITH_TEN],
  ["with Output opened", OPEN_III],
  ["uncontained", UNCONTAINED],
] as const;


describe("the predicate the gate is built on", () => {
  it("is closed for the unawakened and the suppressed", () => {
    for (const [, access] of CLOSED) {
      const resolved = resolveAuraAccess(access);

      expect(resolved.success).toBe(true);
      if (!resolved.success) return;

      expect(hasDeliberateAuraAccess(resolved.payload)).toBe(false);
    }
  });

  it("is open once the nodes are and nothing has closed them", () => {
    for (const [, access] of OPEN) {
      const resolved = resolveAuraAccess(access);

      expect(resolved.success).toBe(true);
      if (!resolved.success) return;

      expect(hasDeliberateAuraAccess(resolved.payload)).toBe(true);
    }
  });
});


describe("what access does not gate", () => {
  /*
   * The body burns Aura whether or not it can direct any of it, and a declared
   * physical surcharge is the body's half of a cost rather than the
   * character's projection — so access does not gate it in any state.
   */
  it("lets a declared physical surcharge be paid in every state", () => {
    for (const [name, access] of [...CLOSED, ...OPEN]) {
      const result = spendActionAura(
        STATE,
        context(access),
        { additionalPhysicalCostRate: 0.001 },
      );

      expect([name, result.success]).toEqual([name, true]);
      if (!result.success) continue;

      expect([name, result.payload.balance.physical]).toEqual([name, 50]);
    }
  });

  it("lets involuntary drain work in every state", () => {
    for (const [name, access] of [...CLOSED, ...OPEN]) {
      const result = drainAura(STATE, context(access), 500);

      expect([name, result.success]).toEqual([name, true]);
      if (!result.success) continue;

      expect([name, result.payload.balance.forcedDrain])
        .toEqual([name, 500]);
    }
  });
});


describe("deliberate expenditure", () => {
  it("is refused when the nodes cannot direct anything", () => {
    for (const [name, access] of CLOSED) {
      const result = spendAura(STATE, context(access), 100);

      expect([name, errorCodes(result)])
        .toEqual([name, ["aura.access.deliberate.not_permitted"]]);
    }
  });

  it("is allowed once they can", () => {
    for (const [name, access] of OPEN) {
      const result = spendAura(STATE, context(access), 100);

      expect([name, result.success]).toEqual([name, true]);
    }
  });

  it("leaves the state untouched when it refuses", () => {
    const before: CharacterAuraState = { current: 20_000, allocations: [] };
    const taken = JSON.stringify(before);

    spendAura(before, context(ZETSU), 100);

    expect(JSON.stringify(before)).toBe(taken);
  });

  /*
   * The specific hole the ticket names. Gating on required Output would let a
   * technique that costs Aura but places none through, which is most of them.
   */
  it("cannot be bypassed with a zero or absent required Output", () => {
    for (const request of [
      { baseAuraCost: 100 },
      { baseAuraCost: 100, requiredOutput: 0 },
      { additionalPhysicalCostRate: 0.001, baseAuraCost: 100 },
    ]) {
      expect(errorCodes(spendActionAura(STATE, context(ZETSU), request)))
        .toContain("aura.access.deliberate.not_permitted");
    }
  });

  /* A cost of zero is not an expenditure, and must not be gated as one. */
  it("does not gate an action with no Aura cost at all", () => {
    const result = spendActionAura(
      STATE,
      context(UNAWAKENED),
      { additionalPhysicalCostRate: 0.001, baseAuraCost: 0 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.balance.physical).toBe(50);
    expect(result.payload.balance.deliberate).toBe(0);
  });

  it("still charges the physical half of a mixed action when access is open", () => {
    const result = spendActionAura(
      STATE,
      context(OPEN_III),
      { additionalPhysicalCostRate: 0.001, baseAuraCost: 100 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.balance.physical).toBe(50);
    expect(result.payload.balance.deliberate).toBe(100);
  });
});


describe("deliberate upkeep", () => {
  const COMMITMENT = [{
    id: "ren",
    source: "ren",
    baseRate: 100,
    period: "hour" as const,
  }];

  it("is refused outright when access is closed", () => {
    for (const [name, access] of CLOSED) {
      const resolved = resolveAuraAccess(access);

      expect(resolved.success).toBe(true);
      if (!resolved.success) return;

      expect([name, errorCodes(
        payAuraUpkeep(20_000, 22, COMMITMENT, 1, resolved.payload),
      )]).toEqual([name, ["aura.access.deliberate.not_permitted"]]);
    }
  });

  it("is paid when access is open", () => {
    const resolved = resolveAuraAccess(OPEN_III);

    expect(resolved.success).toBe(true);
    if (!resolved.success) return;

    const result = payAuraUpkeep(20_000, 22, COMMITMENT, 1, resolved.payload);

    expect(result.success && result.payload.total).toBe(100);
  });

  /*
   * Over an interval the answer is different, and both are right. Hours
   * passing cannot be refused, so a Zetsu closing over a running Ren does not
   * invalidate the hour — it drops the Ren.
   */
  it("shuts running effects down rather than refusing the interval", () => {
    const result = advanceAuraTime({
      state: STATE,
      wakefulness: restedWakefulness(),
      context: context(ZETSU),
      interval: gameTimeIntervalOf(T0, hoursToDuration(2)),
      activity: { mode: "ordinary-waking" },
      upkeep: COMMITMENT,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.upkeepShutdowns).toEqual([
      expect.objectContaining({ id: "ren", reason: "access-lost", at: T0 }),
    ]);
    expect(result.payload.balance.upkeep).toBe(0);
  });

  /* Suppression beginning part-way through drops it at that exact moment. */
  it("drops an effect at the instant suppression begins", () => {
    const result = advanceAuraTime({
      state: STATE,
      wakefulness: restedWakefulness(),
      context: context(OPEN_III),
      interval: gameTimeIntervalOf(T0, hoursToDuration(4)),
      activity: { mode: "ordinary-waking" },
      activityChanges: [{
        at: T0 + hoursToDuration(1),
        activity: {
          mode: "intentional-rest",
          suppression: { source: "zetsu", forced: false },
        },
      }],
      upkeep: COMMITMENT,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.upkeepShutdowns[0]).toEqual(
      expect.objectContaining({
        id: "ren",
        reason: "access-lost",
        at: T0 + hoursToDuration(1),
      }),
    );

    /* Charged for the hour it was up, and nothing after. */
    expect(result.payload.balance.upkeep).toBeCloseTo(100, 8);
  });

  it("refuses a deliberate action scheduled after suppression starts", () => {
    const result = advanceAuraTime({
      state: STATE,
      wakefulness: restedWakefulness(),
      context: context(OPEN_III),
      interval: gameTimeIntervalOf(T0, hoursToDuration(4)),
      activity: { mode: "ordinary-waking" },
      activityChanges: [{
        at: T0 + hoursToDuration(1),
        activity: {
          mode: "intentional-rest",
          suppression: { source: "zetsu", forced: false },
        },
      }],
      instantaneous: [{
        at: T0 + hoursToDuration(2),
        kind: "deliberate",
        source: "technique",
        amount: 100,
      }],
    });

    expect(errorCodes(result))
      .toContain("aura.access.deliberate.not_permitted");
  });
});


describe("leakage against access", () => {
  /*
   * TWO leaks, not one, and only the second can collapse anybody. Half-open
   * pores lose 2R an hour whether or not the character ever awakened; open
   * nodes with nothing holding them shut lose the whole Output Capacity every
   * minute. Suppression and containment both stop the bleeding entirely.
   */
  it("bleeds through open nodes only for the awakened character who never learned Ten", () => {
    const leaked = ([...CLOSED, ...OPEN] as const).map(([name, access]) => {
      const result = advanceAuraTime({
        state: STATE,
        wakefulness: restedWakefulness(),
        context: context(access),
        interval: gameTimeIntervalOf(T0, hoursToDuration(2)),
        activity: { mode: "ordinary-waking" },
      });

      if (!result.success) throw new Error(`${name} failed to resolve`);

      const { halfOpen, uncontained, contained } =
        result.payload.leakageBySource;

      return [name, { halfOpen: halfOpen > 0, uncontained: uncontained > 0, contained: contained > 0 }] as const;
    });

    expect(leaked).toEqual([
      /* Half-open pores, which leak — and recover exactly as much. */
      ["unawakened", { halfOpen: true, uncontained: false, contained: false }],
      ["suppressed", { halfOpen: false, uncontained: false, contained: false }],
      /* Ten I's residual: contained leakage, which never collapses anybody. */
      ["with Ten", { halfOpen: false, uncontained: false, contained: true }],
      ["with Output opened", { halfOpen: false, uncontained: false, contained: true }],
      ["uncontained", { halfOpen: false, uncontained: true, contained: false }],
    ]);
  });

  /*
   * And the difference between the two, which the flags above cannot show: the
   * ordinary person is not losing ground, and cannot be collapsed by it.
   */
  it("nets an unawakened character to zero and collapses nobody", () => {
    const result = advanceAuraTime({
      state: STATE,
      wakefulness: restedWakefulness(),
      context: context(UNAWAKENED),
      interval: gameTimeIntervalOf(T0, hoursToDuration(8)),
      activity: { mode: "ordinary-waking" },
    });

    if (!result.success) throw new Error("Expected the interval to resolve.");

    expect(result.payload.balance.leakage)
      .toBeCloseTo(result.payload.balance.recovery, 8);
    expect(result.payload.currentChange).toBeCloseTo(0, 8);
    expect(result.payload.collapse).toBeNull();
  });
});
