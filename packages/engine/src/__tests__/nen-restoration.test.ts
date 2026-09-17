/*
 * ZET-1D — sleep and a blackout are ONE restoration.
 *
 * Eight continuous qualifying hours restore the reserve, once. Sleeping starts
 * that process; collapsing while awake starts the same one through a blackout;
 * falling asleep inside a recovery continues it rather than beginning a second.
 * A character already asleep does not collapse at all — they are already
 * inside the process a collapse would start.
 *
 * The streak the character carries is the only clock. The collapse recovery's
 * stored hours mirror it and it completes where the reserve is restored, so
 * there is never a second timer to reconcile.
 *
 * Working numbers, standard human at CON 20 / VIT 20 / DEX 22: R 2,500,
 * Maximum Aura 50,000.
 */

import { describe, expect, it } from "vitest";

import { settleNenCollapse } from "../character/nen";
import { uncontainedCollapse } from "../character/foundation/aura/leakage";
import { deriveAuraRegeneration } from "../character/foundation/aura/recovery";
import { QUALIFYING_SLEEP_HOURS } from "../character/foundation/body/endurance";
import {
  advanceCharacterTime,
  characterTemporalState,
  type CharacterTimeActivity,
} from "../character/time";
import { gameTimeIntervalOf, hoursToDuration } from "../time/interval";
import type { Character } from "../character/types";
import type { NenState } from "../character/foundation/nen/types";

import { createTestCharacter } from "./fixtures/character";
import {
  abruptAwakenedNen,
  awakeningContext,
  standardAwakenedNen,
} from "./fixtures/nen";

const STRONG = { con: 20, vit: 20, dex: 22 } as const;
const MAX = 50_000;
const T0 = 1_000_000_000;
const MINUTE = 60_000;
const HOUR = hoursToDuration(1);

const AWAKE: CharacterTimeActivity = { initial: { mode: "ordinary-waking" } };
const ASLEEP: CharacterTimeActivity = { initial: { mode: "sleep" } };


function expectSuccess<T>(result: { success: boolean; payload?: T; errors?: readonly { code: string }[] }): T {
  if (!result.success) {
    throw new Error("Expected success: " + (result.errors ?? []).map((error) => error.code).join(", "));
  }

  return result.payload as T;
}

function subject(options: {
  nen?: NenState;
  current?: number;
  hoursAwake?: number;
  streak?: number;
} = {}): Character {
  return createTestCharacter({
    id: "subject",
    attributes: STRONG,
    aura: { current: options.current ?? 10_000, allocations: [] },
    wakefulness: {
      hoursAwake: options.hoursAwake ?? 6,
      consecutiveSleepHours: options.streak ?? 0,
    },
    nen: options.nen ?? standardAwakenedNen(),
  });
}

const R = deriveAuraRegeneration(subject().attributes);

/* Uncontained, so an awake one bleeds out and collapses within minutes. */
const leaking = (current = 300) => subject({ nen: abruptAwakenedNen(), current });

function collapsedNen(at: number): NenState {
  return expectSuccess(settleNenCollapse(
    awakeningContext({ nen: abruptAwakenedNen(), operationId: "op-collapse" }),
    { collapse: uncontainedCollapse(at) },
  )).state;
}

function advanceFor(
  character: Character,
  startedAt: number,
  durationMs: number,
  activity: CharacterTimeActivity = AWAKE,
) {
  return advanceCharacterTime({
    character,
    temporalState: characterTemporalState(startedAt),
    interval: gameTimeIntervalOf(startedAt, durationMs),
    activity,
  });
}

function advanced(...args: Parameters<typeof advanceFor>) {
  return expectSuccess(advanceFor(...args));
}

const of = <T extends { readonly kind: string }>(events: readonly T[], kind: string): readonly T[] =>
  events.filter((one) => one.kind === kind);

/** Advance in slices, persisting the character through JSON between each. */
function sliced(character: Character, slices: readonly [number, CharacterTimeActivity][]) {
  let current = character;
  let at = T0;
  const auraEvents: { kind: string; at: number }[] = [];
  const awakeningEvents: { readonly kind: string }[] = [];

  for (const [length, activity] of slices) {
    const step = advanced(current, at, length, activity);

    current = JSON.parse(JSON.stringify(step.character)) as Character;
    at += length;
    auraEvents.push(...step.aura.events.filter((one) => one.kind !== "interval-end" && one.kind !== "activity-changed"));
    awakeningEvents.push(...(step.awakening?.events ?? []));
  }

  return { character: current, at, auraEvents, awakeningEvents };
}


/* ── One process, however it starts ─────────────────────────────────────── */

describe("sleep and a blackout are the same restoration", () => {
  it("starts it with ordinary sleep, and restores the reserve once at eight hours", () => {
    const night = advanced(subject({ current: 1000 }), T0, hoursToDuration(10), ASLEEP);

    expect(of(night.aura.events, "sleep-completed").map((one) => one.at))
      .toEqual([T0 + hoursToDuration(QUALIFYING_SLEEP_HOURS)]);
    expect(night.character.aura.current).toBe(MAX);
    expect(night.wakefulness.consecutiveSleepHours).toBe(QUALIFYING_SLEEP_HOURS);
    expect(night.aura.balance.recoveryBySource.filter((one) => one.source === "sleep-completion")).toHaveLength(1);
    expect(night.character.nen.awakening.collapseRecovery).toBeNull();
  });

  it("starts the same one at the exact instant an awake character collapses", () => {
    const result = advanced(leaking(), T0, hoursToDuration(12));
    const collapse = result.aura.collapse!;

    expect(collapse.at).toBeGreaterThan(T0);
    expect(result.character.nen.awakening.collapseRecovery).toMatchObject({ beganAt: collapse.at });
    expect(of(result.aura.events, "sleep-completed").map((one) => one.at))
      .toEqual([collapse.at + hoursToDuration(QUALIFYING_SLEEP_HOURS)]);
    expect(result.character.nen.awakening.collapseRecovery!.completedAt)
      .toBe(collapse.at + hoursToDuration(QUALIFYING_SLEEP_HOURS));
  });

  it("continues, rather than restarts, when a collapsed character is put to sleep", () => {
    const first = advanced(leaking(), T0, hoursToDuration(3));
    const collapse = first.aura.collapse!;
    const recovery = first.character.nen.awakening.collapseRecovery!;
    const rest = advanced(first.character, T0 + hoursToDuration(3), hoursToDuration(9), ASLEEP);

    const completesAt = collapse.at + hoursToDuration(QUALIFYING_SLEEP_HOURS);

    expect(rest.character.nen.awakening.collapseRecovery).toMatchObject({
      id: recovery.id,
      beganAt: collapse.at,
      accumulatedSleepHours: QUALIFYING_SLEEP_HOURS,
      completedAt: completesAt,
    });
    expect(of(rest.aura.events, "sleep-completed").map((one) => one.at)).toEqual([completesAt]);
    expect(rest.character.nen.awakening.suppression.map((one) => one.kind)).toEqual(["involuntary-zetsu"]);
    expect(of(rest.awakening!.events, "nen-collapse-recovery-started")).toHaveLength(0);
    expect(of(rest.aura.events, "collapse")).toHaveLength(0);
  });

  /*
   * The rule that keeps the two from ever running side by side: a sleeper who
   * empties is already restoring, so nothing new begins.
   */
  it("never collapses a character who empties while asleep", () => {
    const night = advanced(leaking(1000), T0, hoursToDuration(10), ASLEEP);

    expect(night.aura.collapse).toBeNull();
    expect(of(night.aura.events, "collapse")).toHaveLength(0);
    expect(night.character.nen.awakening.collapseRecovery).toBeNull();
    expect(night.character.nen.awakening.suppression).toEqual([]);
    expect(night.awakening).toBeUndefined();

    /* And the one restoration still pays out at eight hours. */
    expect(of(night.aura.events, "sleep-completed").map((one) => one.at))
      .toEqual([T0 + hoursToDuration(QUALIFYING_SLEEP_HOURS)]);
  });

  /*
   * A stored recovery beside a streak the character had already built: one
   * clock, so the recovery ends where the restoration does — three hours in,
   * not eight.
   */
  it("completes a stored recovery at the shared boundary, not on a clock of its own", () => {
    const character = subject({
      nen: collapsedNen(T0 - hoursToDuration(5)),
      current: 1000,
      streak: 5,
    });

    const result = advanced(character, T0, hoursToDuration(6));
    const completesAt = T0 + hoursToDuration(3);

    expect(of(result.aura.events, "sleep-completed").map((one) => one.at)).toEqual([completesAt]);
    expect(result.character.nen.awakening.collapseRecovery).toMatchObject({
      accumulatedSleepHours: QUALIFYING_SLEEP_HOURS,
      completedAt: completesAt,
    });
    expect(result.character.aura.current).toBeGreaterThan(0);
  });

  it("ends the blackout at completion while an independent sleep goes on", () => {
    const first = advanced(leaking(), T0, hoursToDuration(2));
    const collapse = first.aura.collapse!;
    const completesAt = collapse.at + hoursToDuration(QUALIFYING_SLEEP_HOURS);

    /* Asleep from here: the blackout ends at completion, the sleep does not. */
    const night = advanced(first.character, T0 + hoursToDuration(2), hoursToDuration(12), ASLEEP);
    const afterwards = advanced(night.character, T0 + hoursToDuration(14), HOUR, ASLEEP);

    expect(night.character.nen.awakening.collapseRecovery!.completedAt).toBe(completesAt);
    expect(night.wakefulness.hoursAwake).toBe(0);
    expect(afterwards.wakefulness.consecutiveSleepHours).toBe(QUALIFYING_SLEEP_HOURS);
    expect(of(afterwards.aura.events, "sleep-completed")).toHaveLength(0);

    /* Waking afterwards ends the sleep, and nothing restarts. */
    const up = advanced(afterwards.character, T0 + hoursToDuration(15), HOUR);

    expect(up.wakefulness.consecutiveSleepHours).toBe(0);
    expect(up.character.nen.awakening.collapseRecovery!.completedAt).toBe(completesAt);
  });

  it("lets waking reset an ordinary sleep, and never a mandatory recovery", () => {
    const character = subject({ current: 1000 });
    const dozed = advanced(character, T0, hoursToDuration(3), ASLEEP);
    const woken = advanced(dozed.character, T0 + hoursToDuration(3), HOUR);

    expect(dozed.wakefulness.consecutiveSleepHours).toBe(3);
    expect(woken.wakefulness.consecutiveSleepHours).toBe(0);
    expect(of(woken.aura.events, "sleep-completed")).toHaveLength(0);

    /* A collapsed character called "awake" is unconscious regardless. */
    const collapsed = advanced(leaking(), T0, hoursToDuration(2));
    const collapse = collapsed.aura.collapse!;
    const insisting = advanced(collapsed.character, T0 + hoursToDuration(2), hoursToDuration(8), AWAKE);

    expect(insisting.character.nen.awakening.collapseRecovery!.completedAt)
      .toBe(collapse.at + hoursToDuration(QUALIFYING_SLEEP_HOURS));
  });
});


describe("the restoration is subdivision-invariant and never duplicated", () => {
  /* Awake into a collapse, then sleeping through and past the restoration. */
  const plan = (slice: number): readonly [number, CharacterTimeActivity][] => {
    const slices: [number, CharacterTimeActivity][] = [];

    for (let elapsed = 0; elapsed < hoursToDuration(14); elapsed += slice) {
      const length = Math.min(slice, hoursToDuration(14) - elapsed);

      slices.push([length, elapsed < hoursToDuration(2) ? AWAKE : ASLEEP]);
    }

    return slices;
  };

  it("produces the same state, Aura, events and timestamps however it is sliced", () => {
    const character = leaking();
    const whole = advanced(character, T0, hoursToDuration(14), {
      initial: { mode: "ordinary-waking" },
      changes: [{ at: T0 + hoursToDuration(2), activity: { mode: "sleep" } }],
    });

    const stepped = sliced(character, plan(37 * MINUTE));

    expect(stepped.at).toBe(T0 + hoursToDuration(14));
    expect(stepped.character.nen).toEqual(whole.character.nen);
    expect(stepped.character.wakefulness).toEqual(whole.character.wakefulness);
    expect(stepped.character.aura.current).toBeCloseTo(whole.character.aura.current, 6);

    const wholeEvents = whole.aura.events
      .filter((one) => one.kind !== "interval-end" && one.kind !== "activity-changed");

    expect(stepped.auraEvents.map((one) => [one.kind, one.at]))
      .toEqual(wholeEvents.map((one) => [one.kind, one.at]));
    expect(stepped.awakeningEvents.map((one) => one.kind))
      .toEqual(whole.awakening!.events.map((one) => one.kind));
  });

  it("emits one of each restoration event, sliced or whole", () => {
    const character = leaking();
    const whole = advanced(character, T0, hoursToDuration(14), {
      initial: { mode: "ordinary-waking" },
      changes: [{ at: T0 + hoursToDuration(2), activity: { mode: "sleep" } }],
    });
    const stepped = sliced(character, plan(45 * MINUTE));

    for (const events of [whole.aura.events, stepped.auraEvents]) {
      expect(of(events, "collapse")).toHaveLength(1);
      expect(of(events, "sleep-completed")).toHaveLength(1);
    }

    for (const events of [whole.awakening!.events, stepped.awakeningEvents]) {
      expect(of(events, "nen-collapse")).toHaveLength(1);
      expect(of(events, "nen-involuntary-zetsu-applied")).toHaveLength(1);
      expect(of(events, "nen-collapse-recovery-started")).toHaveLength(1);
      expect(of(events, "nen-collapse-recovery-completed")).toHaveLength(1);
    }

    expect(stepped.character.nen.awakening.suppression).toHaveLength(1);
  });
});
