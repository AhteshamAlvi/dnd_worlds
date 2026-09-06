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
  spendPhysicalAura,
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
} from "./fixtures/aura";

const T0 = 1_000_000_000;
const STRONG = { con: 20, vit: 20, dex: 22 } as const;

const REN_III: AuraAccessInput = {
  ...WITH_TEN,
  override: { kind: "output-access", source: "ren-iii", accessFraction: 0.3 },
};

const ZETSU: AuraAccessInput = {
  ...WITH_TEN,
  override: { kind: "suppressed", source: "zetsu" },
};

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
  ["under Ren", REN_III],
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
  /* The body burns Aura moving whether or not it can direct any of it. */
  it("lets physical exertion spend Aura in every state", () => {
    for (const [name, access] of [...CLOSED, ...OPEN]) {
      const result = spendPhysicalAura(STATE, context(access), 2);

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
      { exertionLoad: 1, baseAuraCost: 100 },
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
      { exertionLoad: 2, baseAuraCost: 0 },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.balance.physical).toBe(50);
    expect(result.payload.balance.deliberate).toBe(0);
  });

  it("still charges the physical half of a mixed action when access is open", () => {
    const result = spendActionAura(
      STATE,
      context(REN_III),
      { exertionLoad: 2, baseAuraCost: 100 },
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
    const resolved = resolveAuraAccess(REN_III);

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
      context: context(REN_III),
      interval: gameTimeIntervalOf(T0, hoursToDuration(4)),
      activity: { mode: "ordinary-waking" },
      activityChanges: [{
        at: T0 + hoursToDuration(1),
        activity: {
          mode: "intentional-rest",
          suppression: { source: "zetsu", multiplier: 1, forced: false },
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
      context: context(REN_III),
      interval: gameTimeIntervalOf(T0, hoursToDuration(4)),
      activity: { mode: "ordinary-waking" },
      activityChanges: [{
        at: T0 + hoursToDuration(1),
        activity: {
          mode: "intentional-rest",
          suppression: { source: "zetsu", multiplier: 1, forced: false },
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


describe("uncontained leakage against access", () => {
  it("applies only to the awakened character who never learned Ten", () => {
    const leaked = ([...CLOSED, ...OPEN] as const).map(([name, access]) => {
      const result = advanceAuraTime({
        state: STATE,
        wakefulness: restedWakefulness(),
        context: context(access),
        interval: gameTimeIntervalOf(T0, hoursToDuration(2)),
        activity: { mode: "ordinary-waking" },
      });

      if (!result.success) throw new Error(`${name} failed to resolve`);

      return [name, result.payload.balance.leakage > 0] as const;
    });

    expect(leaked).toEqual([
      ["unawakened", false],
      ["suppressed", false],
      ["with Ten", false],
      ["under Ren", false],
      ["uncontained", true],
    ]);
  });
});
