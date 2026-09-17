/*
 * ZET-1B — what counts as sleep, and what a forced suppression lets run.
 *
 *   sleep        the streak advances only in sleep mode or in qualifying
 *                unconsciousness (a collapse's blackout, a collapse recovery in
 *                progress); suppression alone never advances it
 *   completion   eight uninterrupted qualifying hours top the reserve off ONCE;
 *                waking resets the streak and the latch together
 *   authorization  voluntary Zetsu: capability. Forced: capability AND this
 *                instance's exemption. Involuntary: nothing.
 *
 * Working numbers, standard human at CON 20 / VIT 20 / DEX 22: R 2,500.
 */

import { describe, expect, it } from "vitest";

import {
  NEN_COLLAPSE_RECOVERY_SOURCE,
  advanceNenCollapseRecovery,
  awakenNenInstinctive,
  nenQualifyingUnconsciousness,
  nenStoredSuppressionPolicy,
  releaseForcedZetsu,
  settleNenCollapse,
} from "../character/nen";
import { startZetsu } from "../character/nen/zetsu";
import {
  activateNenActivity,
  advanceNenActivities,
  type NenActivationRequest,
} from "../character/nen/runtime";
import {
  emptyNenActivityRuntime,
  findNenActivity,
  nenActivityPermittedUnderSuppression,
  type NenActivityDefinition,
  type NenActivityRuntime,
} from "../character/foundation/nen/runtime";
import type { AuraFundingOutcome } from "../character/foundation/aura/funding";
import { advanceAuraTime } from "../character/foundation/aura/time";
import { deriveAuraRegeneration } from "../character/foundation/aura/recovery";
import { uncontainedCollapse } from "../character/foundation/aura/leakage";
import { QUALIFYING_SLEEP_HOURS } from "../character/foundation/body/endurance";
import {
  advanceCharacterTime,
  characterTemporalState,
} from "../character/time";
import type { CharacterTimeActivity } from "../character/time";
import { gameTimeIntervalOf, hoursToDuration } from "../time/interval";
import type { Character } from "../character/types";
import type { NenState } from "../character/foundation/nen/types";
import { INSTINCTIVE_AWAKENING_MINIMUM_SPI } from "../character/foundation/nen/awakening/calculations";

import { auraContext, UNCONTAINED } from "./fixtures/aura";
import { createTestCharacter } from "./fixtures/character";
import {
  AWAKENING_CAPABLE,
  abruptAwakenedNen,
  awakeningContext,
  standardAwakenedNen,
} from "./fixtures/nen";

const STRONG = { con: 20, vit: 20, dex: 22 } as const;
const T0 = 1_000_000_000;
const MINUTE = 60_000;
const HOUR = hoursToDuration(1);
const SELF = { type: "character", id: "subject" } as const;
const GM = { type: "gm", id: "table-ruling" } as const;
const ABILITY_A = { type: "ability", id: "ability-a" } as const;

const AWAKE: CharacterTimeActivity = { initial: { mode: "ordinary-waking" } };
const ASLEEP: CharacterTimeActivity = { initial: { mode: "sleep" } };


/* ── Fixtures ───────────────────────────────────────────────────────────── */

function expectSuccess<T>(result: { success: boolean; payload?: T; errors?: readonly { code: string }[] }): T {
  if (!result.success) {
    throw new Error("Expected success: " + (result.errors ?? []).map((error) => error.code).join(", "));
  }

  return result.payload as T;
}

function codes(result: { success: boolean; errors?: readonly { code: string }[] }): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((error) => error.code);
}

function forcedNen(): NenState {
  return expectSuccess(awakenNenInstinctive(
    awakeningContext({
      attributes: { ...AWAKENING_CAPABLE, spi: INSTINCTIVE_AWAKENING_MINIMUM_SPI },
      operationId: "op-inst",
    }),
    {
      method: "instinctive",
      authorization: { grantedBy: GM, reason: "Cornered." },
      naturalAbilityId: "ability-a",
    },
  )).state;
}

function collapsedNen(): NenState {
  return expectSuccess(settleNenCollapse(
    awakeningContext({ nen: abruptAwakenedNen(), operationId: "op-collapse" }),
    { collapse: uncontainedCollapse(0) },
  )).state;
}

/* Recovery complete: awake again, still held in the involuntary Zetsu. */
function wokenNen(): NenState {
  return expectSuccess(advanceNenCollapseRecovery(
    awakeningContext({ nen: collapsedNen(), operationId: "op-sleep" }),
    { qualifyingSleepHours: 8, maximumAura: 50_000, at: 1 },
  )).state;
}

function subject(nen: NenState, current = 1000, hoursAwake = 4): Character {
  return createTestCharacter({
    id: "subject",
    attributes: STRONG,
    aura: { current, allocations: [] },
    wakefulness: { hoursAwake, consecutiveSleepHours: 0 },
    nen,
  });
}

const R = deriveAuraRegeneration(subject(standardAwakenedNen()).attributes);

function advanceFor(
  character: Character,
  startedAt: number,
  durationMs: number,
  activity: CharacterTimeActivity = AWAKE,
  runtime?: NenActivityRuntime,
) {
  return advanceCharacterTime({
    character,
    temporalState: characterTemporalState(startedAt),
    interval: gameTimeIntervalOf(startedAt, durationMs),
    activity,
    ...(runtime === undefined ? {} : { activeEffects: { nenActivities: runtime } }),
  });
}

function advanced(...args: Parameters<typeof advanceFor>) {
  return expectSuccess(advanceFor(...args));
}

interface LoggedEvent {
  readonly kind: string;
  readonly at: number;
}

const completions = <T extends LoggedEvent>(events: readonly T[]): readonly T[] =>
  events.filter((one) => one.kind === "sleep-completed");

/* A host that persists the character between slices, round-tripped as JSON. */
function sliced(character: Character, slices: readonly [number, CharacterTimeActivity][]) {
  let current = character;
  let at = T0;
  const events: LoggedEvent[] = [];

  for (const [durationMs, activity] of slices) {
    const step = advanced(current, at, durationMs, activity);

    current = JSON.parse(JSON.stringify(step.character)) as Character;
    at += durationMs;
    events.push(...step.aura.events.filter((one) => one.kind !== "interval-end" && one.kind !== "activity-changed"));
  }

  return { character: current, events };
}

function funded(requestId: string): AuraFundingOutcome {
  return {
    requestId,
    owner: "aura:subject",
    priority: 0,
    policy: { kind: "require-full" },
    requested: 0,
    authoritativeCost: 0,
    accessibleCapacity: 0,
    funded: 0,
    committed: 0,
    controlDelta: 0,
    unmet: 0,
    usefulAura: 0,
    status: "funded",
  };
}

const CAPABLE: NenActivityDefinition = { id: "test-ward", relations: [], functionsThroughSuppression: true };
const INCAPABLE: NenActivityDefinition = { id: "test-vow", relations: [] };

function withActivity(
  runtime: NenActivityRuntime,
  definition: NenActivityDefinition,
  id: string,
  overrides: Partial<NenActivationRequest> = {},
): NenActivityRuntime {
  return expectSuccess(activateNenActivity(
    runtime,
    {
      activityId: id,
      definitionId: definition.id,
      source: SELF,
      at: runtime.at,
      requested: { aura: 0 },
      priority: 0,
      funding: funded(id),
      ...overrides,
    },
    new Map([[definition.id, definition]]),
  )).runtime;
}

const runtimeFor = (at = T0) => emptyNenActivityRuntime("nen:subject", at);


/* ── Qualifying sleep ───────────────────────────────────────────────────── */

describe("suppression alone never counts as sleep", () => {
  it("does not advance the streak for a conscious forced suppression", () => {
    const day = advanced(subject(forcedNen()), T0, hoursToDuration(10));

    expect(day.wakefulness.consecutiveSleepHours).toBe(0);
    expect(completions(day.aura.events)).toHaveLength(0);
    expect(day.aura.segments[0]!.recoveryRatePerHour).toBe(3 * R);
  });

  it("does advance it for actual sleep under forced suppression", () => {
    const night = advanced(subject(forcedNen()), T0, hoursToDuration(9), ASLEEP);

    expect(night.wakefulness.consecutiveSleepHours).toBe(QUALIFYING_SLEEP_HOURS);
    expect(completions(night.aura.events).map((one) => one.at)).toEqual([T0 + hoursToDuration(8)]);
  });

  it("does not advance it for an awake ordinary Zetsu, and does for a sleeping one", () => {
    const nen = { ...standardAwakenedNen(), mastery: { ...standardAwakenedNen().mastery, zetsu: 1 } } as NenState;
    const zetsu = expectSuccess(startZetsu(runtimeFor(), { activityId: "z", source: SELF, at: T0, nen })).runtime;

    expect(advanced(subject(nen), T0, hoursToDuration(9), AWAKE, zetsu).wakefulness.consecutiveSleepHours).toBe(0);
    expect(completions(advanced(subject(nen), T0, hoursToDuration(9), ASLEEP, zetsu).aura.events)).toHaveLength(1);
  });

  it("counts a collapse's blackout from the exact collapse instant, not before", () => {
    const hours = 12;
    const result = advanced(subject(abruptAwakenedNen(), 300), T0, hoursToDuration(hours));
    const collapse = result.aura.collapse!;

    expect(collapse).not.toBeNull();
    expect(collapse.at).toBeGreaterThan(T0);
    expect(completions(result.aura.events).map((one) => one.at))
      .toEqual([collapse.at + hoursToDuration(QUALIFYING_SLEEP_HOURS)]);

    /* The same character, advanced to one minute short of eight blacked-out hours. */
    const short = advanced(subject(abruptAwakenedNen(), 300), T0, collapse.at - T0 + hoursToDuration(8) - MINUTE);

    expect(completions(short.aura.events)).toHaveLength(0);
    expect(short.wakefulness.consecutiveSleepHours).toBeCloseTo(8 - 1 / 60, 9);
  });

  it("counts a stored collapse recovery in progress as unconsciousness, from a restored character", () => {
    const stored = JSON.parse(JSON.stringify(subject(collapsedNen()))) as Character;

    expect(nenQualifyingUnconsciousness(stored.nen)).toEqual({ source: NEN_COLLAPSE_RECOVERY_SOURCE });

    const result = sliced(stored, Array.from({ length: 8 }, () => [HOUR, AWAKE] as [number, CharacterTimeActivity]));

    expect(result.character.wakefulness.consecutiveSleepHours).toBe(QUALIFYING_SLEEP_HOURS);
    expect(result.events.filter((one) => one.kind === "sleep-completed")).toHaveLength(1);

    /* Character time completed the recovery at hour eight, so the ninth awake hour is not sleep. */
    expect(result.character.nen.awakening.collapseRecovery?.completedAt).toBe(T0 + hoursToDuration(8));
    expect(advanced(result.character, T0 + hoursToDuration(8), HOUR).wakefulness.consecutiveSleepHours).toBe(0);
  });

  it("does not count an awake involuntary suppression after the recovery has completed", () => {
    const nen = wokenNen();

    expect(nenQualifyingUnconsciousness(nen)).toBeNull();

    const day = advanced(subject(nen), T0, hoursToDuration(10));

    expect(day.wakefulness.consecutiveSleepHours).toBe(0);
    expect(completions(day.aura.events)).toHaveLength(0);
  });

  it("refuses a malformed unconsciousness fact", () => {
    const character = subject(standardAwakenedNen());

    expect(codes(advanceAuraTime({
      state: character.aura,
      wakefulness: character.wakefulness,
      context: auraContext({ attributes: STRONG, access: UNCONTAINED }),
      interval: gameTimeIntervalOf(T0, HOUR),
      activity: { mode: "ordinary-waking" },
      qualifyingUnconsciousness: { source: "" },
    }))).toEqual(["aura.time.unconsciousness.invalid"]);
  });
});


/* ── One-time completion ────────────────────────────────────────────────── */

describe("sleep completes once per uninterrupted sleep", () => {
  it("agrees between one eight-hour advance and eight one-hour slices", () => {
    const character = subject(standardAwakenedNen());
    const whole = advanced(character, T0, hoursToDuration(8), ASLEEP);
    const steps = sliced(character, Array.from({ length: 8 }, () => [HOUR, ASLEEP] as [number, CharacterTimeActivity]));

    expect(steps.character.aura).toEqual(whole.character.aura);
    expect(steps.character.wakefulness).toEqual(whole.character.wakefulness);
    expect(steps.events).toEqual(whole.aura.events.filter((one) => one.kind !== "interval-end" && one.kind !== "activity-changed"));
    expect(completions(whole.aura.events)).toHaveLength(1);
  });

  it("emits nothing more on later slices of the same sleep", () => {
    const character = subject(standardAwakenedNen());
    const steps = sliced(character, Array.from({ length: 12 }, () => [HOUR, ASLEEP] as [number, CharacterTimeActivity]));
    const whole = advanced(character, T0, hoursToDuration(12), ASLEEP);

    expect(steps.events.filter((one) => one.kind === "sleep-completed")).toHaveLength(1);
    expect(completions(whole.aura.events)).toHaveLength(1);
    expect(steps.character.aura.current).toBeCloseTo(whole.character.aura.current, 6);
  });

  it("resets progress and the latch together on waking, so a later sleep completes again", () => {
    const character = subject(standardAwakenedNen());
    const plan: [number, CharacterTimeActivity][] = [
      [hoursToDuration(9), ASLEEP],
      [hoursToDuration(1), AWAKE],
      [hoursToDuration(8), ASLEEP],
    ];

    const steps = sliced(character, plan);
    const whole = advanced(character, T0, hoursToDuration(18), {
      initial: { mode: "sleep" },
      changes: [
        { at: T0 + hoursToDuration(9), activity: { mode: "ordinary-waking" } },
        { at: T0 + hoursToDuration(10), activity: { mode: "sleep" } },
      ],
    });

    const expected = [T0 + hoursToDuration(8), T0 + hoursToDuration(18)];

    expect(steps.events.filter((one) => one.kind === "sleep-completed").map((one) => one.at))
      .toEqual(expected);
    expect(completions(whole.aura.events).map((one) => one.at)).toEqual(expected);

    const afterWaking = sliced(character, plan.slice(0, 2)).character;

    expect(afterWaking.wakefulness.consecutiveSleepHours).toBe(0);
  });
});


/* ── Two-layer authorization ────────────────────────────────────────────── */

describe("forced suppression needs capability AND an instance exemption", () => {
  const forcedHour = (runtime: NenActivityRuntime, nen: NenState = forcedNen()) =>
    advanced(subject(nen), T0, HOUR, AWAKE, runtime).nenActivities!.runtime;

  it("stops a capable activity its instance never exempted", () => {
    const after = forcedHour(withActivity(runtimeFor(), CAPABLE, "ward", { source: SELF }));

    expect(findNenActivity(after, "ward")!.stop).toMatchObject({ cause: "suppressed", at: T0 });
  });

  it("stops an exempted Ability's activity that is not capable", () => {
    const after = forcedHour(withActivity(runtimeFor(), INCAPABLE, "vow", { source: ABILITY_A }));

    expect(findNenActivity(after, "vow")!.stop).toMatchObject({ cause: "suppressed", at: T0 });
  });

  it("runs an activity with both layers, and recovers nothing while it does", () => {
    const hour = advanced(subject(forcedNen()), T0, HOUR, AWAKE, withActivity(runtimeFor(), CAPABLE, "ward", { source: ABILITY_A }));

    expect(findNenActivity(hour.nenActivities!.runtime, "ward")!.condition).toBe("active");
    expect([hour.aura.balance.recovery, hour.aura.balance.leakage]).toEqual([0, 0]);
  });

  it("lets involuntary suppression stop it despite both layers", () => {
    const both = collapsedOverForced();
    const after = forcedHour(withActivity(runtimeFor(), CAPABLE, "ward", { source: ABILITY_A }), both);

    expect(both.awakening.suppression.map((one) => one.kind).sort()).toEqual(["forced-zetsu", "involuntary-zetsu"]);
    expect(findNenActivity(after, "ward")!.stop).toMatchObject({ cause: "suppressed", at: T0 });
    expect(nenStoredSuppressionPolicy(both, [])).toEqual({ exemptions: "none" });
  });

  it("refuses exemption data granted by the wrong source or naming the wrong instance", () => {
    const nen = forcedNen();
    const held = nen.awakening.suppression[0]!;

    if (held.kind !== "forced-zetsu") throw new Error("expected a forced Zetsu");

    const forged = (exemption: Partial<typeof held.exemptions[number]>): NenState => ({
      ...nen,
      awakening: {
        ...nen.awakening,
        suppression: [{ ...held, exemptions: [{ ...held.exemptions[0]!, ...exemption }] }],
      },
    });

    const runtime = withActivity(runtimeFor(), CAPABLE, "ward", { source: ABILITY_A });

    expect(codes(advanceFor(subject(forged({ source: { type: "gm", id: "somebody-else" } })), T0, HOUR, AWAKE, runtime)))
      .toContain("nen.awakening.suppression.exemption.source.mismatch");
    expect(codes(advanceFor(subject(forged({ suppressionId: "some-other-instance" })), T0, HOUR, AWAKE, runtime)))
      .toContain("nen.awakening.suppression.exemption.misattached");
  });

  it("stops what the suppression does not permit at its exact boundary, and never restarts it", () => {
    let runtime = runtimeFor(0);
    runtime = withActivity(runtime, CAPABLE, "exempt", { source: ABILITY_A });
    runtime = withActivity(runtime, CAPABLE, "unlisted", { source: ABILITY_A });

    const suppressed = expectSuccess(advanceNenActivities(runtime, {
      to: 60_000,
      by: SELF,
      suppression: { exemptions: "authorized", exemptActivityIds: ["exempt"], since: 25_000 },
    })).runtime;

    expect(findNenActivity(suppressed, "exempt")!.condition).toBe("active");
    expect(findNenActivity(suppressed, "unlisted")!.stop).toMatchObject({ cause: "suppressed", at: 25_000, resume: null });

    const lifted = expectSuccess(advanceNenActivities(suppressed, { to: 120_000, by: SELF })).runtime;

    expect(findNenActivity(lifted, "unlisted")!.condition).toBe("ended");

    /* And through character time: releasing the forced state restores nothing. */
    const nen = forcedNen();
    const ended = forcedHour(withActivity(runtimeFor(), CAPABLE, "ward", { source: SELF }), nen);
    const released = expectSuccess(releaseForcedZetsu(
      awakeningContext({ nen, operationId: "op-release" }),
      { suppressionId: nen.awakening.suppression[0]!.id, authorization: GM },
    )).state;
    const later = advanced(subject(released), T0 + HOUR, HOUR, AWAKE, ended);

    expect(findNenActivity(later.nenActivities!.runtime, "ward")!.condition).toBe("ended");
  });

  it("keeps the runtime policy explicit and refuses contradictory policies", () => {
    const ward = { id: "ward", functionsThroughSuppression: true };

    expect(nenActivityPermittedUnderSuppression(ward, { exemptions: "authorized" })).toBe(true);
    expect(nenActivityPermittedUnderSuppression(ward, { exemptions: "authorized", exemptActivityIds: [] })).toBe(false);
    expect(nenActivityPermittedUnderSuppression({ id: "ward" }, { exemptions: "authorized", exemptActivityIds: ["ward"] })).toBe(false);
    expect(nenActivityPermittedUnderSuppression(ward, { exemptions: "none" })).toBe(false);

    expect(codes(advanceNenActivities(runtimeFor(0), {
      to: 1,
      by: SELF,
      suppression: { exemptions: "none", exemptActivityIds: ["ward"] },
    }))).toEqual(["nen.activity.suppression_policy.contradictory"]);
    expect(codes(advanceNenActivities(runtimeFor(0), {
      to: 1,
      by: SELF,
      suppression: { exemptions: "authorized", exemptActivityIds: [""] },
    }))).toEqual(["nen.activity.suppression_policy.exemptions.invalid"]);
  });
});


/*
 * An instinctive awakener's forced Zetsu — exempting ability-a — with a
 * collapse's involuntary Zetsu and its recovery held at the same time. Both
 * records come from real transitions; the stored state validator accepts the
 * combination.
 */
function collapsedOverForced(): NenState {
  const forced = forcedNen();
  const involuntary = collapsedNen().awakening;

  return {
    ...forced,
    awakening: {
      ...forced.awakening,
      suppression: [...forced.awakening.suppression, ...involuntary.suppression],
      collapseRecovery: involuntary.collapseRecovery,
    },
  };
}
