/*
 * Ren: an Output the character selects, a flow they pay for, and an endurance
 * that adjustments cannot reset.
 *
 * Ren is the active alternative to Ten, never a layer on it:
 *
 *   Olimit        = P * renMasteryFraction          10% at I .. 100% at X
 *   0 < Oactive  <= Olimit, fully funded
 *   flow          = Oactive / minute                 replaces every leak
 *   recovery      = 0                                it is active Nen
 *   renLoad       = Oactive / Olimit
 *   renExertion   = integral(renLoad dt)             expires at the rank's
 *                                                    full-output duration
 *   raw strike    = Oactive * partSurface / wholeSurface, ONE part
 *
 * Working numbers, standard human at CON 20 / VIT 20 / DEX 22:
 *
 *   P 10,000   R 2,500   Maximum Aura 50,000   surface 16,900 cm2
 *   Hand 422.5 cm2   Arm 1,183 cm2   Foot 591.5 cm2
 */

import { describe, expect, it } from "vitest";

import * as ren from "../character/foundation/nen/principles/ren";
import {
  deriveRenExpenditure,
  deriveRenFullOutputDurationSeconds,
  deriveRenRemainingSeconds,
  resolveRawRenAttackOutput,
  resolveRenSelection,
  REN_MASTERY_PROFILES,
} from "../character/foundation/nen/principles/ren";
import {
  activeRenActivity,
  adjustRen,
  renOutwardFlow,
  resolveRenAttackContribution,
  startRen,
  withRenAccess,
} from "../character/nen/ren";
import type { StartRenRequest } from "../character/nen/ren";
import { stopNenActivity } from "../character/nen/runtime";
import {
  emptyNenActivityRuntime,
  findNenActivity,
  findNenActivityRuntimeIssues,
  nenActivityExpiryAt,
  type NenActivity,
  type NenActivityRuntime,
} from "../character/foundation/nen/runtime";
import { advanceAuraTime } from "../character/foundation/aura/time";
import { resolveAuraBudget } from "../character/foundation/aura/budget";
import {
  advanceCharacterTime,
  characterTemporalState,
  projectCharacterAtTime,
} from "../character/time";
import type { CharacterTimeActivity } from "../character/time";
import { SECONDS_PER_COMBAT_ROUND } from "../time/duration";
import { gameTimeIntervalOf, hoursToDuration } from "../time/interval";
import { restedWakefulness } from "../character/foundation/body/endurance";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import { setBodyPartState } from "../character/foundation/body/anatomy/modification";
import type { Character } from "../character/types";
import type { NenState } from "../character/foundation/nen/types";

import {
  auraContext,
  auraTestMeasurements,
  UNCONTAINED,
  withTen,
} from "./fixtures/aura";
import { createTestCharacter } from "./fixtures/character";
import { standardAwakenedNen } from "./fixtures/nen";

const STRONG = { con: 20, vit: 20, dex: 22 } as const;
const P = 10_000;
const R = 2500;
const MAX = 50_000;
const T0 = 1_000_000_000;
const MINUTE = 60_000;
const SELF = { type: "character", id: "subject" } as const;

const AWAKE: CharacterTimeActivity = { initial: { mode: "ordinary-waking" } };

const BODY = {
  anatomy: STANDARD_HUMANOID_ANATOMY,
  measurements: auraTestMeasurements(),
};


function nenWith(mastery: { ten: number; ren: number }, extra: Partial<NenState> = {}): NenState {
  const base = standardAwakenedNen();

  return {
    ...base,
    mastery: { ...base.mastery, ...mastery } as NenState["mastery"],
    ...extra,
  };
}

function subject(options: {
  ten?: number;
  ren?: number;
  current?: number;
  nen?: NenState;
} = {}): Character {
  return createTestCharacter({
    id: "subject",
    attributes: STRONG,
    aura: { current: options.current ?? 40_000, allocations: [] },
    wakefulness: { hoursAwake: 2 },
    nen: options.nen ?? nenWith({ ten: options.ten ?? 1, ren: options.ren ?? 1 }),
  });
}

function runtimeFor(character: Character, at = T0): NenActivityRuntime {
  return emptyNenActivityRuntime(`nen:${character.id}`, at);
}

function startRequest(
  character: Character,
  selectedOutput: number,
  overrides: Partial<StartRenRequest> = {},
): StartRenRequest {
  return {
    activityId: "ren-1",
    source: SELF,
    selectedOutput,
    at: T0,
    nen: character.nen,
    attributes: character.attributes,
    currentAura: character.aura.current,
    ...overrides,
  };
}

function started(character: Character, selectedOutput: number, at = T0): NenActivityRuntime {
  const result = startRen(runtimeFor(character, at), startRequest(character, selectedOutput, { at }));

  if (!result.success) {
    throw new Error("Expected Ren to start: " + result.errors.map((error) => error.code).join(", "));
  }

  return result.payload.runtime;
}

function advanceFor(
  character: Character,
  runtime: NenActivityRuntime,
  startedAt: number,
  durationMs: number,
  activity: CharacterTimeActivity = AWAKE,
) {
  const result = advanceCharacterTime({
    character,
    temporalState: characterTemporalState(startedAt),
    interval: gameTimeIntervalOf(startedAt, durationMs),
    activity,
    activeEffects: { nenActivities: runtime },
  });

  if (!result.success) {
    throw new Error("Expected the advance to resolve: " + result.errors.map((error) => error.code).join(", "));
  }

  return result.payload;
}

function codes(result: { success: boolean; errors?: readonly { code: string }[] }): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((error) => error.code);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value as object)) deepFreeze(inner);
  }

  return value;
}


/* ── 10.4 Output ceiling and selection ──────────────────────────────────── */

describe("Ren's Mastery tables", () => {
  it("keeps every ceiling, CON gate and full-output duration", () => {
    expect(Object.values(REN_MASTERY_PROFILES).map((one) => [
      one.rank,
      one.accessFraction,
      one.minimumCon,
      one.fullOutputDurationMinutes,
    ])).toEqual([
      [1, 0.1, 12, 1],
      [2, 0.2, 12, 2],
      [3, 0.3, 13, 5],
      [4, 0.4, 13, 10],
      [5, 0.5, 14, 20],
      [6, 0.6, 14, 30],
      [7, 0.7, 15, 60],
      [8, 0.8, 15, 120],
      [9, 0.9, 16, 240],
      [10, 1, 16, null],
    ]);
  });

  it("resolves the exact 10%-100% ceiling at every rank", () => {
    for (let mastery = 1; mastery <= 10; mastery += 1) {
      const result = resolveRenSelection({ physiologicalOutput: P, mastery, selectedOutput: 1 });

      expect(result.success && result.payload.outputLimit).toBe(P * (mastery / 10));
    }
  });

  it("exports none of the Ten-coupled model", () => {
    const surface = Object.keys(ren);

    for (const removed of [
      "resolveRenContainmentEfficiency",
      "deriveRenContainmentAuraLoss",
      "resolveRen",
      "resolveRenEndurance",
    ]) {
      expect(surface).not.toContain(removed);
    }
  });
});


describe("selecting an Output", () => {
  /* Ren III at P = 20: a ceiling of 6. */
  const select = (selectedOutput: number) =>
    resolveRenSelection({ physiologicalOutput: 20, mastery: 3, selectedOutput });

  it("accepts a sub-maximum selection and the exact maximum", () => {
    const partial = select(3);
    const maximum = select(6);

    expect(partial.success && partial.payload).toMatchObject({ activeOutput: 3, load: 0.5, outputLimit: 6 });
    expect(maximum.success && maximum.payload).toMatchObject({ activeOutput: 6, load: 1 });
  });

  it("refuses zero, negative, non-finite and above-ceiling selections", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect([bad, codes(select(bad))]).toEqual([bad, ["nen.ren.selected_output.invalid"]]);
    }

    expect(codes(select(6.0001))).toEqual(["nen.ren.output_limit.exceeded"]);
  });

  it("refuses a malformed ceiling before judging the selection", () => {
    expect(codes(resolveRenSelection({ physiologicalOutput: -1, mastery: 3, selectedOutput: 1 })))
      .toContain("nen.ren.physiological_output.invalid");
    expect(codes(resolveRenSelection({ physiologicalOutput: 20, mastery: 0, selectedOutput: 1 })))
      .toContain("nen.ren.mastery.invalid");
  });

  it("costs exactly 6 a minute, 360 an hour and 0.2 a Round at Oactive 6", () => {
    const expenditure = deriveRenExpenditure(6);

    expect(SECONDS_PER_COMBAT_ROUND).toBe(2);
    expect(expenditure.perMinute).toBe(6);
    expect(expenditure.perHour).toBe(360);
    expect(expenditure.perRound).toBeCloseTo(0.2, 12);
    const maximum = select(6);

    expect(maximum.success && maximum.payload.expenditure).toEqual(expenditure);
  });
});


/* ── 10.5 Endurance arithmetic ──────────────────────────────────────────── */

describe("endurance is full-output-equivalent exertion", () => {
  it("lasts twice as long at 50% load and four times at 25%, ranks I-IX", () => {
    for (let mastery = 1 as number; mastery <= 9; mastery += 1) {
      const full = deriveRenFullOutputDurationSeconds(mastery as 1)!;
      const limit = P * (mastery / 10);

      const half = resolveRenSelection({ physiologicalOutput: P, mastery, selectedOutput: limit / 2 });
      const quarter = resolveRenSelection({ physiologicalOutput: P, mastery, selectedOutput: limit / 4 });

      expect([mastery, half.success && half.payload.maximumDurationSeconds]).toEqual([mastery, full * 2]);
      expect([mastery, quarter.success && quarter.payload.maximumDurationSeconds]).toEqual([mastery, full * 4]);
    }
  });

  it("has no physiological limit at Mastery X", () => {
    expect(deriveRenFullOutputDurationSeconds(10)).toBeNull();
    expect(deriveRenRemainingSeconds(10, 1_000_000, 1)).toBeNull();

    const selection = resolveRenSelection({ physiologicalOutput: P, mastery: 10, selectedOutput: P });

    expect(selection.success && selection.payload.maximumDurationSeconds).toBeNull();
  });

  it("spends the remainder at the current load", () => {
    /* Ren III: 300 s. 100 already spent at load 0.4 leaves 500 wall-clock s. */
    expect(deriveRenRemainingSeconds(3, 100, 0.4)).toBeCloseTo(500, 9);
  });
});


/* ── 10.6 Raw attack projection ─────────────────────────────────────────── */

describe("raw Ren a strike carries", () => {
  const project = (attackingPartIds: readonly string[], body = BODY, activeOutput = 1000) =>
    resolveRawRenAttackOutput({ activeOutput, attackingPartIds, body });

  it("partitions the whole body's shares to exactly one", () => {
    const shares = STANDARD_HUMANOID_ANATOMY.parts.map((part) => {
      const result = project([part.id]);

      return result.success ? result.payload.surfaceShare : 0;
    });

    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 12);
  });

  it("gives a punch the striking hand's share and nothing more", () => {
    const punch = project(["hand-2"]);

    expect(punch.success && punch.payload).toEqual({
      activeOutput: 1000,
      attackingPartId: "hand-2",
      attackingPartSurfaceAreaCm2: 422.5,
      eligibleWholeBodySurfaceAreaCm2: 16_900,
      surfaceShare: 422.5 / 16_900,
      output: 1000 * (422.5 / 16_900),
    });

    /* Not the hand plus its arm, and not the torso behind them. */
    expect(punch.success && punch.payload.output).not.toBeCloseTo(1000 * (422.5 + 1183) / 16_900, 6);
    expect(punch.success && punch.payload.output).toBe(25);
  });

  it("gives a kick the striking foot's share and nothing more", () => {
    const kick = project(["foot-1"]);

    expect(kick.success && kick.payload.output).toBeCloseTo(1000 * (591.5 / 16_900), 12);
    expect(kick.success && kick.payload.output).not.toBeCloseTo(1000 * (591.5 + 2788.5) / 16_900, 6);
  });

  it("keeps left and right apart", () => {
    const left = project(["hand-1"]);
    const right = project(["hand-2"]);

    expect(left.success && left.payload.attackingPartId).toBe("hand-1");
    expect(right.success && right.payload.attackingPartId).toBe("hand-2");

    /* Losing the right hand leaves the left hand's area exactly as it was. */
    const noRightHand = {
      ...BODY,
      anatomy: setBodyPartState(STANDARD_HUMANOID_ANATOMY, "hand-2", "archived-removed"),
    };

    const leftAfter = project(["hand-1"], noRightHand);

    expect(leftAfter.success && leftAfter.payload.attackingPartSurfaceAreaCm2).toBe(422.5);
    expect(leftAfter.success && leftAfter.payload.eligibleWholeBodySurfaceAreaCm2).toBe(16_900 - 422.5);
    expect(codes(project(["hand-2"], noRightHand))).toEqual(["nen.ren.attack.part.ineligible"]);
  });

  it("refuses missing, duplicated, contradictory and unknown parts", () => {
    expect(codes(project([]))).toEqual(["nen.ren.attack.part.count"]);
    expect(codes(project(["hand-2", "hand-2"]))).toEqual(["nen.ren.attack.part.count"]);
    expect(codes(project(["hand-2", "foot-1"]))).toEqual(["nen.ren.attack.part.count"]);
    expect(codes(project([""]))).toEqual(["nen.ren.attack.part.count"]);
    expect(codes(project(["elbow-joint"]))).toEqual(["nen.ren.attack.part.ineligible"]);
    expect(codes(project(["hand-2"], BODY, Number.NaN))).toEqual(["nen.ren.attack.active_output.invalid"]);
    expect(codes(resolveRawRenAttackOutput({
      activeOutput: 1000,
      attackingPartIds: ["hand-2"],
      body: null as unknown as typeof BODY,
    }))).toEqual(["nen.ren.attack.body.invalid"]);
  });

  it("offers nothing to a weapon or object", () => {
    const punch = project(["hand-2"]);

    expect(Object.keys(punch.success ? punch.payload : {}).sort()).toEqual([
      "activeOutput",
      "attackingPartId",
      "attackingPartSurfaceAreaCm2",
      "eligibleWholeBodySurfaceAreaCm2",
      "output",
      "surfaceShare",
    ]);
  });

  it("is zero and unavailable with no Ren running, or after it stops", () => {
    const character = subject({ ren: 1 });
    const idle = resolveRenAttackContribution(runtimeFor(character), { attackingPartIds: ["hand-2"], body: BODY });

    expect(idle.success && idle.payload).toEqual({ available: false, output: 0, projection: null });

    const running = started(character, 1000);
    const live = resolveRenAttackContribution(running, { attackingPartIds: ["hand-2"], body: BODY });

    expect(live.success && live.payload.output).toBe(25);

    const stopped = stopNenActivity(running, { activityId: "ren-1", cause: "cancelled", at: T0 + MINUTE / 2, by: SELF });
    const after = stopped.success
      ? resolveRenAttackContribution(stopped.payload.runtime, { attackingPartIds: ["hand-2"], body: BODY })
      : null;

    expect(after?.success && after.payload.available).toBe(false);
  });
});


/* ── Activation and adjustment ──────────────────────────────────────────── */

describe("starting Ren", () => {
  it("commits the selected Output with a generic, allocation-free, upkeep-free activity", () => {
    const character = subject({ ren: 1 });
    const runtime = started(character, 500);
    const activity = activeRenActivity(runtime)!;

    expect(activity.requested).toEqual({ aura: 500, exertionLoad: 0.5, durationSeconds: 60 });
    expect(activity.funding).toMatchObject({ committed: 500, status: "funded", unmet: 0, allocationIds: [] });
    expect(activity.progress).toEqual({ exertionSeconds: 0, resolvedAt: T0 });
    expect(nenActivityExpiryAt(activity)).toBe(T0 + 2 * MINUTE);
    expect(renOutwardFlow(runtime)).toEqual({ id: "ren-1", source: "ren", output: 500, endsAt: T0 + 2 * MINUTE });
  });

  it("carries no expiry at Mastery X", () => {
    const character = subject({ ten: 10, ren: 10 });
    const activity = activeRenActivity(started(character, 1000))!;

    expect(activity.requested.durationSeconds).toBeUndefined();
    expect(renOutwardFlow(started(character, 1000))!.endsAt).toBeUndefined();
  });

  it("refuses anything that cannot run in full, leaving everything unchanged", () => {
    const character = deepFreeze(subject({ ren: 1, current: 400 }));
    const runtime = deepFreeze(runtimeFor(character));
    const before = JSON.stringify({ character, runtime });

    const cases: readonly (readonly [string, StartRenRequest, string])[] = [
      ["above the ceiling", startRequest(character, 1001), "nen.ren.output_limit.exceeded"],
      ["more than the reserve can fund", startRequest(character, 401), "nen.ren.unfunded"],
      ["zero", startRequest(character, 0), "nen.ren.selected_output.invalid"],
      ["a sealed Ren", startRequest(character, 100, {
        nen: { ...character.nen, seals: { ren: 0 } },
      }), "nen.ren.unavailable.sealed"],
      ["an unlearned Ren", startRequest(character, 100, {
        nen: { ...character.nen, mastery: { ...character.nen.mastery, ren: 0 } },
      }), "nen.ren.unavailable.sealed"],
      ["an invalid reserve", startRequest(character, 100, { currentAura: Number.NaN }), "nen.ren.current_aura.invalid"],
    ];

    for (const [label, request, code] of cases) {
      const result = startRen(runtime, request);

      expect([label, codes(result)]).toEqual([label, [code]]);
    }

    expect(JSON.stringify({ character, runtime })).toBe(before);
  });

  it("refuses a second Ren and an unawakened character", () => {
    const character = subject({ ren: 1 });
    const running = started(character, 100);

    expect(codes(startRen(running, startRequest(character, 100, { activityId: "ren-2" }))))
      .toEqual(["nen.ren.already_active"]);

    const unawakened = createTestCharacter({ id: "subject", attributes: STRONG });

    expect(codes(startRen(runtimeFor(unawakened), startRequest(unawakened, 100))))
      .toEqual(["nen.ren.unavailable.access-lost"]);
  });
});


describe("adjusting Ren", () => {
  /*
   * Ren I, 500 of 1,000 (load 0.5, 120 s from fresh). A minute in, 30 s of
   * exertion is spent. Raising to the full 1,000 leaves 30 s; lowering to 250
   * leaves 120 s. Either way the activity is the same one.
   */
  const character = subject({ ren: 1 });
  const initial = started(character, 500);
  const oneMinute = advanceFor(character, initial, T0, MINUTE);

  const adjust = (selectedOutput: number, runtime = oneMinute.nenActivities!.runtime) =>
    adjustRen(runtime, {
      activityId: "ren-1",
      selectedOutput,
      at: T0 + MINUTE,
      by: SELF,
      nen: character.nen,
      attributes: character.attributes,
      currentAura: oneMinute.character.aura.current,
    });

  it("preserves identity, start and exertion when raising Output", () => {
    const raised = adjust(1000);

    expect(raised.success).toBe(true);
    if (!raised.success) return;

    const before = activeRenActivity(oneMinute.nenActivities!.runtime)!;
    const after = activeRenActivity(raised.payload.runtime)!;

    expect(after.id).toBe(before.id);
    expect(after.startedAt).toBe(T0);
    expect(after.progress).toEqual({ exertionSeconds: 30, resolvedAt: T0 + MINUTE });
    expect(after.funding.committed).toBe(1000);
    expect(nenActivityExpiryAt(after)).toBe(T0 + MINUTE + 30_000);
  });

  it("extends the remaining wall-clock time when lowering Output", () => {
    const lowered = adjust(250);

    expect(lowered.success && nenActivityExpiryAt(activeRenActivity(lowered.payload.runtime)!))
      .toBe(T0 + MINUTE + 120_000);
  });

  it("refuses an illegal or unfundable adjustment and leaves the prior Ren standing", () => {
    const runtime = deepFreeze(oneMinute.nenActivities!.runtime);
    const snapshot = JSON.stringify(runtime);

    expect(codes(adjust(1001, runtime))).toEqual(["nen.ren.output_limit.exceeded"]);
    expect(codes(adjustRen(runtime, {
      activityId: "ren-1",
      selectedOutput: 800,
      at: T0 + MINUTE,
      by: SELF,
      nen: character.nen,
      attributes: character.attributes,
      currentAura: 700,
    }))).toEqual(["nen.ren.unfunded"]);
    expect(codes(adjustRen(runtime, {
      activityId: "not-ren",
      selectedOutput: 100,
      at: T0 + MINUTE,
      by: SELF,
      nen: character.nen,
      attributes: character.attributes,
      currentAura: 10_000,
    }))).toEqual(["nen.ren.not_active"]);

    expect(JSON.stringify(runtime)).toBe(snapshot);
  });

  it("never lets Ten back in across the adjustment", () => {
    const raised = adjust(1000);

    if (!raised.success) throw new Error("Expected the adjustment.");

    const next = advanceFor(oneMinute.character, raised.payload.runtime, T0 + MINUTE, MINUTE);

    expect(next.aura.segments[0]!.startedAt).toBe(T0 + MINUTE);
    expect(next.aura.segments[0]!.outwardFlow).toBe("ren-1");
    expect(next.aura.segments[0]!.outwardFlowRatePerHour).toBe(60_000);
    expect(next.aura.outwardFlowStop).toEqual({ id: "ren-1", source: "ren", reason: "ended", at: T0 + MINUTE + 30_000 });
  });
});


/* ── 10.3-10.5 Through the character-time coordinator ──────────────────── */

describe("Ren replaces Ten for exactly as long as it runs", () => {
  /*
   * Ten I, 40,000 Aura, Ren I at 500 (load 0.5): two minutes of flow at 500 a
   * minute, then Ten I's ordinary break-even for the remaining 58.
   */
  const character = subject({ ten: 1, ren: 1 });
  const result = advanceFor(character, started(character, 500), T0, hoursToDuration(1));

  it("stops at the exact expiry inside a larger advance and resolves the rest under Ten", () => {
    expect(result.aura.outwardFlowStop).toEqual({ id: "ren-1", source: "ren", reason: "ended", at: T0 + 2 * MINUTE });
    expect(result.aura.balance.outwardFlow).toBeCloseTo(1000, 9);
    expect(result.character.aura.current).toBeCloseTo(39_000, 9);

    const stoppedRen = findNenActivity(result.nenActivities!.runtime, "ren-1")!;

    expect(stoppedRen.stop!.cause).toBe("expired");
    expect(stoppedRen.stop!.at).toBe(T0 + 2 * MINUTE);
    expect(stoppedRen.funding.committed).toBe(0);
    expect(stoppedRen.progress!.exertionSeconds).toBeCloseTo(60, 9);
    expect(result.nenActivities!.events.filter((event) => event.kind === "nen-activity-stopped")).toHaveLength(1);
  });

  it("never runs a segment with both the coating and the flow, nor one with neither", () => {
    const [flowing, ...after] = result.aura.segments;

    expect(flowing).toMatchObject({
      startedAt: T0,
      endedAt: T0 + 2 * MINUTE,
      accessState: "override",
      outwardFlow: "ren-1",
      outwardFlowRatePerHour: 30_000,
      leakageSource: null,
      leakageRatePerHour: 0,
      recoveryRatePerHour: 0,
    });

    expect(after[0]!.startedAt).toBe(T0 + 2 * MINUTE);

    for (const segment of after) {
      expect(segment).toMatchObject({
        accessState: "ten",
        outwardFlow: null,
        outwardFlowRatePerHour: 0,
        leakageSource: "contained",
        recoveryRatePerHour: 2 * R,
        leakageRatePerHour: 2 * R,
      });
    }

    expect(result.aura.endingAccess.automaticSurfaceCoating).not.toBeNull();
  });

  it("gives Ten no funding or allocation while Ren is up, and back once it stops", () => {
    const running = started(character, 500);
    const during = resolveAuraBudget(40_000, {
      ...auraContext({ attributes: STRONG, access: withTen(1) }),
      access: withRenAccess(withTen(1), running, character.attributes),
    });

    expect(during.success && during.payload.automatic).toEqual([]);
    expect(during.success && during.payload.automaticAura).toBe(0);
    expect(during.success && during.payload.accessibleOutput).toBeCloseTo(500, 9);

    const afterward = resolveAuraBudget(40_000, auraContext({
      attributes: STRONG,
      access: withRenAccess(withTen(1), result.nenActivities!.runtime, character.attributes),
    }));

    expect(afterward.success && afterward.payload.automaticAura).toBe(1000);
  });

  it("agrees with the same span advanced a minute at a time", () => {
    let current = character;
    let runtime = started(character, 500);
    let at = T0;

    for (let minute = 0; minute < 60; minute += 1) {
      const step = advanceFor(current, runtime, at, MINUTE);

      current = step.character;
      runtime = step.nenActivities!.runtime;
      at += MINUTE;
    }

    expect(current.aura.current).toBeCloseTo(result.character.aura.current, 6);
    expect(findNenActivity(runtime, "ren-1")).toEqual(findNenActivity(result.nenActivities!.runtime, "ren-1"));
    expect(current.wakefulness.hoursAwake).toBeCloseTo(result.character.wakefulness.hoursAwake, 9);
  });

  it("projects exactly what committing produces", () => {
    const projection = projectCharacterAtTime({
      character,
      temporalState: characterTemporalState(T0),
      currentTime: T0 + hoursToDuration(1),
      activity: AWAKE,
      activeEffects: { nenActivities: started(character, 500) },
    });

    expect(projection.success && projection.payload.aura.current).toBe(result.aura.current);
    expect(projection.success && projection.payload.aura.segments).toEqual(result.aura.segments);
  });

  it("restores Ten at the exact instant Ren is cancelled", () => {
    const running = started(character, 500);
    const firstMinute = advanceFor(character, running, T0, MINUTE);
    const cancelled = stopNenActivity(firstMinute.nenActivities!.runtime, {
      activityId: "ren-1",
      cause: "cancelled",
      at: T0 + MINUTE,
      by: SELF,
    });

    if (!cancelled.success) throw new Error("Expected the cancellation.");

    const rest = advanceFor(firstMinute.character, cancelled.payload.runtime, T0 + MINUTE, MINUTE);

    expect(rest.aura.segments.map((segment) => [segment.startedAt, segment.accessState]))
      .toEqual([[T0 + MINUTE, "ten"]]);
    expect(rest.aura.outwardFlowStop).toBeNull();
  });
});


describe("what Ren costs over an interval", () => {
  it("zeroes recovery and charges exactly 60 * Oactive an hour, stationary", () => {
    const character = subject({ ten: 10, ren: 10 });
    const hour = advanceFor(character, started(character, 100), T0, hoursToDuration(1));

    expect(hour.aura.balance).toMatchObject({
      recovery: 0,
      outwardFlow: 6000,
      physical: 0,
      leakage: 0,
      upkeep: 0,
      net: -6000,
    });
  });

  it("adds physical consumption independently when the body works", () => {
    const character = subject({ ten: 10, ren: 10 });
    const hour = advanceFor(character, started(character, 100), T0, hoursToDuration(1), {
      initial: { mode: "ordinary-waking", activity: "strenuous" },
    });

    expect(hour.aura.balance).toMatchObject({
      recovery: 0,
      outwardFlow: 6000,
      physical: 2 * R,
      leakage: 0,
      net: -6000 - 2 * R,
    });
  });

  /*
   * Through the solver directly, on a character with NO containment: the flow
   * replaces the 60P-an-hour open-node bleed rather than stacking on it, and
   * explicit costs stay separately reported.
   */
  it("replaces uncontrolled leakage and leaves explicit costs additive", () => {
    const result = advanceAuraTime({
      state: { current: 40_000, allocations: [] },
      wakefulness: restedWakefulness(),
      context: auraContext({ attributes: STRONG, access: UNCONTAINED }),
      interval: gameTimeIntervalOf(T0, hoursToDuration(1)),
      activity: { mode: "ordinary-waking" },
      outwardFlow: { id: "ren-1", source: "ren", output: 100 },
      upkeep: [{ id: "guard", source: "guard", baseRate: 100, period: "hour" }],
      instantaneous: [{ kind: "deliberate", amount: 250, source: "strike", at: T0 + MINUTE }],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.balance.leakage).toBe(0);
    expect(result.payload.leakageBySource.uncontained).toBe(0);
    expect(result.payload.balance.outwardFlow).toBe(6000);
    expect(result.payload.balance.deliberate).toBe(250);
    expect(result.payload.balance.upkeep).toBeGreaterThan(0);
    expect(result.payload.balance.recovery).toBe(0);
    expect(result.payload.collapse).toBeNull();
  });

  it("charges the flow exactly once — never again as upkeep", () => {
    const character = subject({ ten: 10, ren: 10 });
    const hour = advanceFor(character, started(character, 100), T0, hoursToDuration(1));

    expect(activeRenActivity(started(character, 100))!.requested.upkeepPerRound).toBeUndefined();
    expect(hour.aura.upkeepCharges).toEqual([]);
    expect(character.aura.current - hour.character.aura.current).toBeCloseTo(6000, 9);
  });

  it("refuses a bare outward-flow override that nothing would meter", () => {
    const result = advanceAuraTime({
      state: { current: 40_000, allocations: [] },
      wakefulness: restedWakefulness(),
      context: auraContext({
        attributes: STRONG,
        access: withTen(1, { kind: "outward-flow", source: "ren", accessFraction: 0.1 }),
      }),
      interval: gameTimeIntervalOf(T0, hoursToDuration(1)),
      activity: { mode: "ordinary-waking" },
    });

    expect(codes(result)).toEqual(["aura.outward_flow.unmetered"]);
  });
});


describe("Ren stops at its exact boundaries", () => {
  /*
   * Ren X, unlimited, at 1,000 a minute on a 2,000 reserve: it empties the
   * reserve in two minutes, stops as unfunded there, and Ten X's +2R an hour
   * runs for the remaining 58 — the reserve never goes below zero.
   */
  it("stops Mastery X when the reserve can no longer fund it", () => {
    const character = subject({ ten: 10, ren: 10, current: 2000 });
    const hour = advanceFor(character, started(character, 1000), T0, hoursToDuration(1));

    expect(hour.aura.outwardFlowStop).toEqual({ id: "ren-1", source: "ren", reason: "unfunded", at: T0 + 2 * MINUTE });
    expect(hour.aura.unmetDrain).toBe(0);
    expect(hour.aura.segments.every((segment) => segment.startingAura >= 0 && segment.endingAura >= 0)).toBe(true);
    expect(hour.character.aura.current).toBeCloseTo(2 * R * (58 / 60), 6);

    const stopped = findNenActivity(hour.nenActivities!.runtime, "ren-1")!;

    expect(stopped.stop).toMatchObject({ cause: "unfunded", at: T0 + 2 * MINUTE });
    expect(hour.nenActivities!.events.filter((event) => event.kind === "nen-activity-stopped")).toHaveLength(1);
    expect(hour.aura.events.filter((event) => event.kind === "outward-flow-stopped")).toHaveLength(1);
  });

  /*
   * Ren I at its full 1,000 on exactly 1,000 Aura: expiry and exhaustion are
   * the same instant. One stop, reported once, as the expiry.
   */
  it("stops once when duration and affordability coincide", () => {
    const character = subject({ ten: 1, ren: 1, current: 1000 });
    const hour = advanceFor(character, started(character, 1000), T0, hoursToDuration(1));

    expect(hour.aura.outwardFlowStop).toMatchObject({ reason: "ended", at: T0 + MINUTE });
    expect(hour.aura.events.filter((event) => event.kind === "outward-flow-stopped")).toHaveLength(1);
    expect(hour.nenActivities!.events.filter((event) => event.kind === "nen-activity-stopped")).toHaveLength(1);
    expect(findNenActivity(hour.nenActivities!.runtime, "ren-1")!.stop).toMatchObject({ cause: "expired", at: T0 + MINUTE });
    expect(hour.aura.unmetDrain).toBeCloseTo(0, 6);
  });

  /* Ten I under Ren X: the two ranks are independent. */
  it("stops at suppression, keeps Ten out while it lasts, and lets it back after", () => {
    const character = subject({ ten: 1, ren: 10 });
    const hour = advanceFor(character, started(character, 100), T0, hoursToDuration(1), {
      initial: { mode: "ordinary-waking" },
      changes: [
        { at: T0 + 30 * MINUTE, activity: { mode: "ordinary-waking", suppression: { source: "zetsu", forced: false } } },
        { at: T0 + 45 * MINUTE, activity: { mode: "ordinary-waking" } },
      ],
    });

    expect(hour.aura.outwardFlowStop).toEqual({ id: "ren-1", source: "ren", reason: "access-lost", at: T0 + 30 * MINUTE });
    expect(findNenActivity(hour.nenActivities!.runtime, "ren-1")!.stop).toMatchObject({ cause: "suppressed", at: T0 + 30 * MINUTE });

    const suppressed = hour.aura.segments.filter((segment) => segment.startedAt >= T0 + 30 * MINUTE && segment.endedAt <= T0 + 45 * MINUTE);

    expect(suppressed.length).toBeGreaterThan(0);
    for (const segment of suppressed) {
      /* Suppressed recovery (3R), no flow, no Ten leak — and not Ten's 2R. */
      expect([segment.outwardFlow, segment.leakageSource, segment.recoveryRatePerHour])
        .toEqual([null, null, 3 * R]);
    }

    const resumed = hour.aura.segments.filter((segment) => segment.startedAt >= T0 + 45 * MINUTE);

    expect(resumed.length).toBeGreaterThan(0);
    for (const segment of resumed) {
      expect([segment.accessState, segment.outwardFlow, segment.recoveryRatePerHour])
        .toEqual(["ten", null, 2 * R]);
    }
  });

  it("stops at the opening instant when the character's Nen state no longer permits it", () => {
    const character = subject({ ten: 1, ren: 3 });
    const running = started(character, 100);
    const sealed = { ...character, nen: { ...character.nen, seals: { ren: 0 as const } } };

    const hour = advanceFor(sealed, running, T0, hoursToDuration(1));

    expect(findNenActivity(hour.nenActivities!.runtime, "ren-1")!.stop).toMatchObject({ cause: "sealed", at: T0 });
    expect(hour.aura.segments.every((segment) => segment.outwardFlow === null)).toBe(true);
  });
});


/* ── 10.7 Runtime validation and immutability ───────────────────────────── */

describe("exertion progress is validated before anything moves", () => {
  const character = subject({ ren: 1 });
  const running = started(character, 500);
  const ren = activeRenActivity(running)!;

  const withActivity = (activity: NenActivity, at = running.at): NenActivityRuntime => ({
    ...running,
    at,
    activities: [activity],
  });

  it("refuses negative, non-finite, future, pre-start and over-duration progress", () => {
    const issues = (activity: NenActivity, at?: number) =>
      findNenActivityRuntimeIssues(withActivity(activity, at)).map((issue) => issue.code);

    expect(issues({ ...ren, progress: { exertionSeconds: -1, resolvedAt: T0 } })).toContain("nen.activity.progress.invalid");
    expect(issues({ ...ren, progress: { exertionSeconds: Number.NaN, resolvedAt: T0 } })).toContain("nen.activity.progress.invalid");
    expect(issues({ ...ren, progress: { exertionSeconds: 1, resolvedAt: T0 + MINUTE } })).toContain("nen.activity.progress.future");
    expect(issues({ ...ren, progress: { exertionSeconds: 0, resolvedAt: T0 - 1 } }, T0)).toContain("nen.activity.progress.contradictory");
    expect(issues({ ...ren, progress: { exertionSeconds: 61, resolvedAt: T0 } })).toContain("nen.activity.progress.contradictory");
    expect(issues({ ...ren, requested: { ...ren.requested, exertionLoad: 0 } })).toContain("nen.activity.configuration.invalid");
    expect(issues({ ...ren, requested: { ...ren.requested, exertionLoad: 1.5 } })).toContain("nen.activity.configuration.invalid");
  });

  it("refuses to advance a malformed runtime, and leaves it untouched", () => {
    const character2 = subject({ ren: 1 });
    const bad = deepFreeze(withActivity({ ...ren, progress: { exertionSeconds: -1, resolvedAt: T0 } }));
    const snapshot = JSON.stringify(bad);

    const result = advanceCharacterTime({
      character: character2,
      temporalState: characterTemporalState(T0),
      interval: gameTimeIntervalOf(T0, MINUTE),
      activity: AWAKE,
      activeEffects: { nenActivities: bad },
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(bad)).toBe(snapshot);
  });

  it("normalises an activity with no progress to none as of its start", () => {
    const { progress: _omitted, ...legacy } = ren;

    expect(nenActivityExpiryAt(legacy)).toBe(T0 + 2 * MINUTE);
  });

  it("advances frozen inputs without mutating them", () => {
    const frozenCharacter = deepFreeze(subject({ ren: 1 }));
    const frozenRuntime = deepFreeze(started(frozenCharacter, 500));
    const snapshot = JSON.stringify({ frozenCharacter, frozenRuntime });

    const result = advanceFor(frozenCharacter, frozenRuntime, T0, hoursToDuration(1));

    expect(result.nenActivities!.runtime).not.toBe(frozenRuntime);
    expect(JSON.stringify({ frozenCharacter, frozenRuntime })).toBe(snapshot);
  });
});
