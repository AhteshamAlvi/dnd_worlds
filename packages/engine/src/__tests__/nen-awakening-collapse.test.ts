/*
 * Leakage, collapse, forced recovery, and the release trap.
 *
 * The leak is integrated by the EXISTING Aura time solver — there is no second
 * clock here, and these tests drive the real one to prove it. What this domain
 * adds is what happens at the boundary the solver finds: the forced Zetsu that
 * stops the bleeding, the eight hours of sleep that undo it, and the guard on
 * lifting the Zetsu afterwards.
 */

import { describe, expect, it } from "vitest";

import {
  advanceNenCollapseRecovery,
  releaseInvoluntaryZetsu,
  settleNenCollapse,
} from "../character/nen/collapse";
import {
  NEN_AURA_RESTORE_REQUEST,
  type NenAwakeningTransitionResult,
} from "../character/nen/protocol";
import {
  LEAKING_CONDITION_ID,
  UNCONSCIOUS_CONDITION_ID,
} from "../character/nen/settlement";
import { isNenUncontained, nenAuraAccessInput } from "../character/nen/access";
import { advanceAuraTime } from "../character/foundation/aura/time";
import { uncontainedCollapse } from "../character/foundation/aura/leakage";
import { deriveAuraOutputLimit } from "../character/foundation/aura/output";
import { deriveMaximumAura } from "../character/foundation/aura/pool";
import { resolveAuraAccess } from "../character/foundation/aura/access";
import { restedWakefulness } from "../character/foundation/body/endurance";
import { gameTimeIntervalOf, hoursToDuration } from "../time/interval";
import { COLLAPSE_RECOVERY_SLEEP_HOURS } from "../character/foundation/nen/awakening/types";
import { collapseRecoveryHoursRemaining } from "../character/foundation/nen/awakening/state";
import type { NenState } from "../character/foundation/nen/types";

import { auraContext, auraTestAttributes } from "./fixtures/aura";
import { abruptAwakenedNen, awakeningContext, AWAKENING_CAPABLE } from "./fixtures/nen";

const T0 = 1_000_000_000;
const MINUTE = 1 / 60;

/* CON 13 / VIT 13: Maximum Aura 100, Physiological Output 20. */
const THRESHOLD = auraTestAttributes({ con: 13, vit: 13 });

function codes(result: NenAwakeningTransitionResult): readonly string[] {
  return result.success ? [] : result.errors.map((error) => error.code);
}

function kinds(result: NenAwakeningTransitionResult): readonly string[] {
  return result.success ? result.payload.events.map((event) => event.kind) : [];
}

function expectState(result: NenAwakeningTransitionResult): NenState {
  if (!result.success) {
    throw new Error(result.errors.map((error) => error.code).join(", "));
  }

  return result.payload.state;
}

/** Advance the REAL Aura solver over a fresh awakener. */
function leak(nen: NenState, hours: number, current: number) {
  const result = advanceAuraTime({
    state: { current, allocations: [] },
    wakefulness: restedWakefulness(),
    context: auraContext({
      attributes: { con: 13, vit: 13 },
      access: nenAuraAccessInput(nen),
    }),
    interval: gameTimeIntervalOf(T0, hoursToDuration(hours)),
    activity: { mode: "ordinary-waking" },
  });

  if (!result.success) {
    throw new Error(result.errors.map((error) => error.code).join(", "));
  }

  return result.payload;
}


describe("the fresh-awakener leak, through the existing timeline", () => {
  /*
   * The worked example the rule is stated against, using the engine's own
   * derived values rather than numbers written into the test.
   */
  it("empties roughly 100 Aura at roughly 20 a minute in five minutes", () => {
    expect(deriveMaximumAura(THRESHOLD)).toBe(100);
    expect(deriveAuraOutputLimit(THRESHOLD).maximum).toBe(20);

    const nen = abruptAwakenedNen(AWAKENING_CAPABLE);

    expect(isNenUncontained(nen)).toBe(true);

    const after = leak(nen, 5 * MINUTE, 100);

    expect(after.current).toBe(0);
    expect(after.collapse).not.toBeNull();
    expect(after.collapse!.at)
      .toBeCloseTo(T0 + hoursToDuration(5 * MINUTE), 6);
  });

  it("preserves interval invariance across the leak", () => {
    const nen = abruptAwakenedNen(AWAKENING_CAPABLE);

    const once = leak(nen, MINUTE, 100);

    let current = 100;

    for (let second = 0; second < 60; second += 1) {
      const step = advanceAuraTime({
        state: { current, allocations: [] },
        wakefulness: restedWakefulness(),
        context: auraContext({
          attributes: { con: 13, vit: 13 },
          access: nenAuraAccessInput(nen),
        }),
        interval: gameTimeIntervalOf(
          T0 + second * 1000,
          hoursToDuration(1 / 3600),
        ),
        activity: { mode: "ordinary-waking" },
      });

      if (!step.success) throw new Error("step failed");

      current = step.payload.current;
    }

    expect(current).toBeCloseTo(once.current, 9);
  });

  it("never takes the reserve below zero", () => {
    const nen = abruptAwakenedNen(AWAKENING_CAPABLE);

    for (const hours of [MINUTE, 5 * MINUTE, 1, 48]) {
      expect(leak(nen, hours, 100).current).toBeGreaterThanOrEqual(0);
    }
  });

  it("emits exactly one collapse however far past empty it runs", () => {
    const nen = abruptAwakenedNen(AWAKENING_CAPABLE);
    const after = leak(nen, 10, 100);

    const collapses = after.events.filter((event) => event.kind === "collapse");

    expect(collapses).toHaveLength(1);
  });

  /*
   * A standard awakener has Ten and is contained. The trap is specific to
   * having open nodes with nothing holding them.
   */
  it("leaves a contained awakener alone", () => {
    const access = resolveAuraAccess(
      nenAuraAccessInput(abruptAwakenedNen(AWAKENING_CAPABLE)),
    );

    expect(access.success && access.payload.uncontained).toBe(true);
  });
});


describe("settling the collapse", () => {
  const nen = abruptAwakenedNen(AWAKENING_CAPABLE);
  const collapse = uncontainedCollapse(T0 + hoursToDuration(5 * MINUTE));

  function settle(state: NenState = nen) {
    return settleNenCollapse(
      awakeningContext({ nen: state, operationId: "op-collapse" }),
      { collapse },
    );
  }

  it("stops the leak, shuts the nodes and starts the eight hours", () => {
    const result = settle();
    const state = expectState(result);

    expect(state.awakening.suppression).toHaveLength(1);
    expect(state.awakening.suppression[0]!.kind).toBe("involuntary-zetsu");
    expect(state.awakening.collapseRecovery?.requiredSleepHours)
      .toBe(COLLAPSE_RECOVERY_SLEEP_HOURS);
    expect(state.awakening.collapseRecovery?.accumulatedSleepHours).toBe(0);
    expect(state.awakening.collapseRecovery?.completedAt).toBeNull();

    expect(isNenUncontained(state)).toBe(false);
    expect(result.success && result.payload.changes.leakageStopped).toBe(true);
  });

  it("asks Character status for unconsciousness and drops the leaking state", () => {
    const result = settle();

    expect(result.success).toBe(true);
    if (!result.success) return;

    const conditions = result.payload.requests
      .filter((request) => "conditionId" in request)
      .map((request) => {
        const typed = request as { kind: string; conditionId: string };

        return [typed.conditionId, typed.kind.endsWith("apply-condition")];
      });

    expect(conditions).toEqual([
      [LEAKING_CONDITION_ID, false],
      [UNCONSCIOUS_CONDITION_ID, true],
    ]);

    for (const request of result.payload.requests) {
      expect(request.to.domain).toBe("character-status");
    }
  });

  it("emits the collapse, the stop, the Zetsu and the recovery, in order", () => {
    expect(kinds(settle())).toEqual([
      "nen-collapse",
      "nen-leakage-stopped",
      "nen-involuntary-zetsu-applied",
      "nen-collapse-recovery-started",
    ]);
  });

  /*
   * Duplicate collapses are refused by the STATE rather than trusted not to
   * arrive: a character who is no longer uncontained cannot have leaked dry.
   */
  it("refuses a second collapse for the same character", () => {
    const collapsed = expectState(settle());

    expect(codes(settle(collapsed)))
      .toContain("nen.awakening.collapse.not-uncontained");
  });

  it("refuses a collapse for a character who is not leaking", () => {
    expect(codes(settleNenCollapse(awakeningContext(), { collapse })))
      .toContain("nen.awakening.collapse.not-awakened");
  });

  it("refuses a malformed collapse", () => {
    expect(codes(settleNenCollapse(
      awakeningContext({ nen }),
      { collapse: { reason: "made-up", at: 0 } as never },
    ))).toContain("nen.awakening.collapse.invalid");
  });
});


describe("the eight hours", () => {
  const collapsed = expectState(settleNenCollapse(
    awakeningContext({
      nen: abruptAwakenedNen(AWAKENING_CAPABLE),
      operationId: "op-collapse",
    }),
    { collapse: uncontainedCollapse(T0) },
  ));

  function sleep(state: NenState, hours: number, at = T0 + 1) {
    return advanceNenCollapseRecovery(
      awakeningContext({ nen: state, operationId: `op-sleep-${hours}-${at}` }),
      { qualifyingSleepHours: hours, maximumAura: 100, at },
    );
  }

  it("cannot complete on fewer than eight hours", () => {
    const partial = sleep(collapsed, 7.9);

    expect(partial.success).toBe(true);
    if (!partial.success) return;

    expect(partial.payload.changes.collapseRecoveryCompleted).toBe(false);
    expect(partial.payload.events).toEqual([]);
    expect(partial.payload.requests).toEqual([]);
    expect(collapseRecoveryHoursRemaining(partial.payload.state.awakening))
      .toBeCloseTo(0.1, 10);
  });

  /*
   * Interruption PAUSES rather than resets. Three hours of sleep happened, and
   * nothing untold them.
   */
  it("accumulates across interruptions", () => {
    const three = expectState(sleep(collapsed, 3));
    const six = expectState(sleep(three, 3, T0 + 2));
    const done = sleep(six, 2, T0 + 3);

    expect(done.success).toBe(true);
    if (!done.success) return;

    expect(done.payload.changes.collapseRecoveryCompleted).toBe(true);
    expect(done.payload.state.awakening.collapseRecovery?.accumulatedSleepHours)
      .toBe(8);
  });

  it("wakes the owner and asks Aura for a full reserve", () => {
    const done = sleep(collapsed, 8);

    expect(done.success).toBe(true);
    if (!done.success) return;

    expect(kinds(done)).toEqual(["nen-collapse-recovery-completed"]);

    const restore = done.payload.requests.find(
      (request) => request.kind === NEN_AURA_RESTORE_REQUEST,
    ) as { requested: number; to: { domain: string } } | undefined;

    expect(restore).toBeDefined();
    expect(restore!.requested).toBe(100);
    expect(restore!.to.domain).toBe("aura");

    const wake = done.payload.requests.find(
      (request) => "conditionId" in request,
    ) as { conditionId: string; kind: string };

    expect(wake.conditionId).toBe(UNCONSCIOUS_CONDITION_ID);
    expect(wake.kind).toContain("remove-condition");
  });

  /*
   * The forced Zetsu was applied at the collapse and has been holding the
   * nodes shut for the whole eight hours — which is the only reason the sleep
   * restored anything. The character wakes inside it.
   */
  it("wakes them still inside the involuntary Zetsu", () => {
    const woken = expectState(sleep(collapsed, 8));

    expect(woken.awakening.suppression).toHaveLength(1);
    expect(woken.awakening.suppression[0]!.kind).toBe("involuntary-zetsu");
    expect(isNenUncontained(woken)).toBe(false);
  });

  it("completes once and refuses to complete again", () => {
    const woken = expectState(sleep(collapsed, 8));

    expect(codes(sleep(woken, 8, T0 + 9)))
      .toContain("nen.awakening.collapse-recovery.already-complete");
  });

  it("grants no Zetsu mastery", () => {
    const woken = expectState(sleep(collapsed, 8));

    expect(woken.mastery.zetsu).toBe(0);
    for (const rank of Object.values(woken.mastery)) expect(rank).toBe(0);
  });

  /*
   * Recovery restores the Aura reserve and nothing else about the character.
   * Body owns the trauma an abrupt awakening left, and eight hours of sleep is
   * not a treatment.
   */
  it("asks nothing of Body and heals no trauma", () => {
    const done = sleep(collapsed, 8);

    expect(done.success).toBe(true);
    if (!done.success) return;

    for (const request of done.payload.requests) {
      expect(request.to.domain).not.toBe("body");
    }
  });

  it("refuses a recovery that is not running", () => {
    expect(codes(sleep(abruptAwakenedNen(AWAKENING_CAPABLE), 8)))
      .toContain("nen.awakening.collapse-recovery.absent");
  });

  it("refuses malformed hours, Maximum Aura or timestamp", () => {
    expect(codes(advanceNenCollapseRecovery(
      awakeningContext({ nen: collapsed }),
      { qualifyingSleepHours: -1, maximumAura: 100, at: T0 },
    ))).toContain("nen.awakening.collapse-recovery.hours.invalid");

    expect(codes(advanceNenCollapseRecovery(
      awakeningContext({ nen: collapsed }),
      { qualifyingSleepHours: 8, maximumAura: Number.NaN, at: T0 },
    ))).toContain("nen.awakening.collapse-recovery.maximum-aura.invalid");

    expect(codes(advanceNenCollapseRecovery(
      awakeningContext({ nen: collapsed }),
      { qualifyingSleepHours: 8, maximumAura: 100, at: Number.NaN },
    ))).toContain("nen.awakening.collapse-recovery.timestamp.invalid");
  });
});


describe("the release trap", () => {
  const collapsed = expectState(settleNenCollapse(
    awakeningContext({
      nen: abruptAwakenedNen(AWAKENING_CAPABLE),
      operationId: "op-collapse",
    }),
    { collapse: uncontainedCollapse(T0) },
  ));

  const woken = expectState(advanceNenCollapseRecovery(
    awakeningContext({ nen: collapsed, operationId: "op-sleep" }),
    { qualifyingSleepHours: 8, maximumAura: 100, at: T0 + 1 },
  ));

  const forcedId = woken.awakening.suppression[0]!.id;

  it("reopens the system and restarts the leak without usable Ten", () => {
    const released = releaseInvoluntaryZetsu(
      awakeningContext({ nen: woken, operationId: "op-release" }),
      { suppressionId: forcedId },
    );

    expect(released.success).toBe(true);
    if (!released.success) return;

    expect(released.payload.state.awakening.suppression).toEqual([]);
    expect(released.payload.changes.leakageStarted).toBe(true);
    expect(isNenUncontained(released.payload.state)).toBe(true);

    expect(kinds(released))
      .toEqual(["nen-involuntary-zetsu-released", "nen-leakage-started"]);

    const applied = released.payload.requests[0] as unknown as {
      conditionId: string;
    };

    expect(applied.conditionId).toBe(LEAKING_CONDITION_ID);
  });

  /*
   * The difference is read from the character's Ten NOW, not from anything
   * recorded when the forced state was applied.
   */
  it("does not restart the trap for somebody who has since learned Ten", () => {
    const withTen: NenState = { ...woken, mastery: { ...woken.mastery, ten: 1 } };

    const released = releaseInvoluntaryZetsu(
      awakeningContext({ nen: withTen, operationId: "op-release-2" }),
      { suppressionId: forcedId },
    );

    expect(released.success).toBe(true);
    if (!released.success) return;

    expect(released.payload.changes.leakageStarted).toBe(false);
    expect(isNenUncontained(released.payload.state)).toBe(false);
    expect(kinds(released)).toEqual(["nen-involuntary-zetsu-released"]);
    expect(released.payload.requests).toEqual([]);
  });

  it("refuses to lift a collapse Zetsu before its recovery completes", () => {
    expect(codes(releaseInvoluntaryZetsu(
      awakeningContext({ nen: collapsed, operationId: "op-early" }),
      { suppressionId: collapsed.awakening.suppression[0]!.id },
    ))).toContain("nen.suppression.involuntary.recovery-incomplete");
  });

  it("refuses a forced state the character is not in", () => {
    expect(codes(releaseInvoluntaryZetsu(
      awakeningContext({ nen: woken }),
      { suppressionId: "no-such-state" },
    ))).toContain("nen.suppression.not-found");
  });

  /* Releasing grants nothing. The character has learned no Zetsu. */
  it("grants no mastery either way", () => {
    const released = expectState(releaseInvoluntaryZetsu(
      awakeningContext({ nen: woken, operationId: "op-release-3" }),
      { suppressionId: forcedId },
    ));

    for (const rank of Object.values(released.mastery)) expect(rank).toBe(0);
  });
});
