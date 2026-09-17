/*
 * ZET-1C — the collapse-recovery clock, and upkeep that knows its owner.
 *
 *   recovery   character time settles an in-call collapse at its instant,
 *              accumulates the recovery, and completes it at its exact
 *              timestamp — unconscious until then, awake after, the same in
 *              one advance as in many
 *   upkeep     explicit provenance: activity-backed upkeep inherits its
 *              owner's capability, Ability provenance and exemption and ends
 *              with it; standalone upkeep borrows an exemption only through an
 *              Ability source
 *
 * Working numbers, standard human at CON 20 / VIT 20 / DEX 22: R 2,500.
 */

import { describe, expect, it } from "vitest";

import {
  NEN_AURA_RESTORE_REQUEST,
  awakenNenInstinctive,
  releaseForcedZetsu,
  settleNenCollapse,
} from "../character/nen";
import { startZetsu } from "../character/nen/zetsu";
import { startRen } from "../character/nen/ren";
import { projectNenUpkeep } from "../character/nen/upkeep";
import {
  activateNenActivity,
  type NenActivationRequest,
} from "../character/nen/runtime";
import {
  emptyNenActivityRuntime,
  findNenActivity,
  type NenActivityDefinition,
  type NenActivityRuntime,
} from "../character/foundation/nen/runtime";
import type { AuraFundingOutcome } from "../character/foundation/aura/funding";
import { deriveAuraRegeneration } from "../character/foundation/aura/recovery";
import { uncontainedCollapse } from "../character/foundation/aura/leakage";
import type { AuraUpkeepCommitment } from "../character/foundation/aura/upkeep";
import { QUALIFYING_SLEEP_HOURS } from "../character/foundation/body/endurance";
import {
  advanceCharacterTime,
  characterTemporalState,
  type CharacterTimeActivity,
} from "../character/time";
import { gameTimeIntervalOf, hoursToDuration } from "../time/interval";
import type { Character } from "../character/types";
import type { NenState } from "../character/foundation/nen/types";
import { INSTINCTIVE_AWAKENING_MINIMUM_SPI } from "../character/foundation/nen/awakening/calculations";

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
const WORKING: CharacterTimeActivity = { initial: { mode: "ordinary-waking", activity: "moderate" } };
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

function subject(nen: NenState, current = 10_000): Character {
  return createTestCharacter({
    id: "subject",
    attributes: STRONG,
    aura: { current, allocations: [] },
    wakefulness: { hoursAwake: 2, consecutiveSleepHours: 0 },
    nen,
  });
}

const R = deriveAuraRegeneration(subject(standardAwakenedNen()).attributes);

function withMastery(base: NenState, mastery: Partial<Record<"ten" | "ren" | "zetsu", number>>): NenState {
  return { ...base, mastery: { ...base.mastery, ...mastery } as NenState["mastery"] };
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
    { collapse: uncontainedCollapse(T0) },
  )).state;
}

/* Two forced instances: the instinctive one exempts ability-a, the second exempts nothing. */
function twoForcedNen(): NenState {
  const nen = forcedNen();
  const held = nen.awakening.suppression[0]!;

  if (held.kind !== "forced-zetsu") throw new Error("expected a forced Zetsu");

  const other = { type: "gm", id: "second-imposer" } as const;

  return {
    ...nen,
    awakening: {
      ...nen.awakening,
      suppression: [
        held,
        { ...held, id: "second-forced", source: other, release: { rule: "source-authorized", authority: other }, exemptions: [] },
      ],
    },
  };
}

function forcedAndInvoluntaryNen(): NenState {
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

const owned = (id: string, activityId: string, baseRate = 600, extra: Partial<AuraUpkeepCommitment> = {}): AuraUpkeepCommitment => ({
  id, source: `upkeep:${id}`, baseRate, period: "hour", provenance: { kind: "activity", activityId }, ...extra,
});

const standalone = (id: string, source: { type: string; id: string }, extra: Partial<AuraUpkeepCommitment> = {}): AuraUpkeepCommitment => ({
  id, source: `upkeep:${id}`, baseRate: 600, period: "hour", functionsThroughSuppression: true,
  provenance: { kind: "standalone", source }, ...extra,
});

function advanceFor(
  character: Character,
  startedAt: number,
  durationMs: number,
  activity: CharacterTimeActivity = AWAKE,
  effects: { runtime?: NenActivityRuntime; upkeep?: readonly AuraUpkeepCommitment[] } = {},
) {
  return advanceCharacterTime({
    character,
    temporalState: characterTemporalState(startedAt),
    interval: gameTimeIntervalOf(startedAt, durationMs),
    activity,
    activeEffects: {
      ...(effects.runtime === undefined ? {} : { nenActivities: effects.runtime }),
      ...(effects.upkeep === undefined ? {} : { upkeep: effects.upkeep }),
    },
  });
}

function advanced(...args: Parameters<typeof advanceFor>) {
  return expectSuccess(advanceFor(...args));
}

const kinds = <T extends { readonly kind: string }>(events: readonly T[], kind: string): readonly T[] =>
  events.filter((one) => one.kind === kind);


/* ── The collapse-recovery clock ────────────────────────────────────────── */

describe("character time owns the collapse-recovery clock", () => {
  /* An abrupt awakener, uncontained, with 300 Aura: they empty within minutes. */
  const collapsing = () => subject(abruptAwakenedNen(), 300);

  it("advances a stored recovery with no separate call", () => {
    const three = advanced(subject(collapsedNen()), T0, hoursToDuration(3));
    const recovery = three.character.nen.awakening.collapseRecovery!;

    expect(recovery.accumulatedSleepHours).toBeCloseTo(3, 12);
    expect(recovery.completedAt).toBeNull();

    const done = advanced(three.character, T0 + hoursToDuration(3), hoursToDuration(5));

    expect(done.character.nen.awakening.collapseRecovery).toMatchObject({ accumulatedSleepHours: 8, completedAt: T0 + hoursToDuration(8) });
    expect(kinds(done.awakening!.events, "nen-collapse-recovery-completed")).toHaveLength(1);
  });

  it("settles a mid-interval collapse and starts its recovery at the exact collapse instant", () => {
    const result = advanced(collapsing(), T0, hoursToDuration(2));
    const collapse = result.aura.collapse!;
    const awakening = result.character.nen.awakening;

    expect(collapse.at).toBeGreaterThan(T0);
    expect(awakening.collapseRecovery).toMatchObject({ beganAt: collapse.at, completedAt: null });
    expect(awakening.collapseRecovery!.accumulatedSleepHours).toBeCloseTo((T0 + hoursToDuration(2) - collapse.at) / HOUR, 12);
    expect(awakening.suppression.map((one) => [one.kind, one.appliedAt])).toEqual([["involuntary-zetsu", collapse.at]]);
    expect(result.awakening!.requests.map((one) => one.kind)).not.toContain(NEN_AURA_RESTORE_REQUEST);
  });

  it("splits at the exact completion instant, ends unconsciousness there, and tops off once", () => {
    const result = advanced(collapsing(), T0, hoursToDuration(12), WORKING);
    const collapse = result.aura.collapse!;
    const completes = collapse.at + hoursToDuration(8);

    expect(result.character.nen.awakening.collapseRecovery).toMatchObject({ accumulatedSleepHours: 8, completedAt: completes });
    expect(result.aura.segments.some((one) => one.startedAt === completes)).toBe(true);

    /* Unconscious (no effort) until completion, awake and working after it. */
    const before = result.aura.segments.filter((one) => one.startedAt >= collapse.at && one.endedAt <= completes);
    const after = result.aura.segments.filter((one) => one.startedAt >= completes);

    expect(before.every((one) => one.physicalRatePerHour === 0)).toBe(true);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((one) => one.physicalRatePerHour === 2 * R)).toBe(true);

    expect(kinds(result.aura.events, "sleep-completed").map((one) => one.at)).toEqual([completes]);
    expect(result.wakefulness.consecutiveSleepHours).toBe(0);
  });

  it("keeps an actual sleep qualifying straight through completion", () => {
    const partway = advanced(subject(collapsedNen()), T0, hoursToDuration(5)).character;
    const asleep = advanced(partway, T0 + hoursToDuration(5), hoursToDuration(6), ASLEEP);
    const awake = advanced(partway, T0 + hoursToDuration(5), hoursToDuration(6), AWAKE);

    expect(asleep.character.nen.awakening.collapseRecovery!.completedAt).toBe(T0 + hoursToDuration(8));
    expect(asleep.wakefulness.consecutiveSleepHours).toBe(QUALIFYING_SLEEP_HOURS);
    expect(awake.wakefulness.consecutiveSleepHours).toBe(0);
    expect(kinds(asleep.aura.events, "sleep-completed")).toHaveLength(1);
  });

  it("does not count awake involuntary suppression after completion as sleep", () => {
    const done = advanced(subject(collapsedNen()), T0, hoursToDuration(8)).character;
    const later = advanced(done, T0 + hoursToDuration(8), hoursToDuration(10));

    expect(later.character.nen.awakening.suppression.map((one) => one.kind)).toEqual(["involuntary-zetsu"]);
    expect(later.wakefulness.consecutiveSleepHours).toBe(0);
    expect(kinds(later.aura.events, "sleep-completed")).toHaveLength(0);
    expect(later.awakening).toBeUndefined();
  });

  it("agrees between one long advance and uneven slices, in state, Aura, events and timestamps", () => {
    const character = collapsing();
    const span = hoursToDuration(12);
    const whole = advanced(character, T0, span, WORKING);

    let current = character;
    let at = T0;
    const auraEvents: unknown[] = [];
    const awakeningEvents: unknown[] = [];
    const sleepEvents: number[] = [];

    for (const minutes of [7, 50, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 38]) {
      const length = Math.min(minutes * MINUTE, T0 + span - at);

      if (length <= 0) break;

      const step = advanced(current, at, length, WORKING);

      current = JSON.parse(JSON.stringify(step.character)) as Character;
      at += length;
      auraEvents.push(...step.aura.events.filter((one) => one.kind !== "interval-end" && one.kind !== "activity-changed"));
      awakeningEvents.push(...(step.awakening?.events ?? []));
      sleepEvents.push(...kinds(step.aura.events, "sleep-completed").map((one) => one.at));
    }

    expect(at).toBe(T0 + span);
    expect(current.nen).toEqual(whole.character.nen);
    expect(current.wakefulness).toEqual(whole.character.wakefulness);
    expect(current.aura.current).toBeCloseTo(whole.character.aura.current, 6);
    expect(auraEvents.map((one) => (one as { kind: string; at: number }).kind))
      .toEqual(whole.aura.events.filter((one) => one.kind !== "interval-end" && one.kind !== "activity-changed").map((one) => one.kind));
    expect(auraEvents.map((one) => (one as { at: number }).at))
      .toEqual(whole.aura.events.filter((one) => one.kind !== "interval-end" && one.kind !== "activity-changed").map((one) => one.at));
    expect(awakeningEvents).toEqual(whole.awakening!.events);
    expect(sleepEvents).toHaveLength(1);
  });
});


/* ── Upkeep provenance and authorization ────────────────────────────────── */

describe("upkeep inherits and obeys its owner's authorization", () => {
  it("inherits its owner's capability and Ability exemption", () => {
    const nen = forcedNen();
    const runtime = withActivity(runtimeFor(), CAPABLE, "ward", { source: ABILITY_A });
    const hour = advanced(subject(nen), T0, HOUR, AWAKE, { runtime, upkeep: [owned("ward-upkeep", "ward")] });

    expect(hour.aura.upkeepShutdowns).toEqual([]);
    expect(hour.aura.upkeepCharges.map((one) => [one.id, one.hours])).toEqual([["ward-upkeep", 1]]);

    const projection = projectNenUpkeep({
      nen,
      upkeep: [owned("ward-upkeep", "ward")],
      suppliedRuntime: runtime,
      openingRuntime: runtime,
      storedPolicy: { exemptions: "authorized", exemptActivityIds: ["ward"] },
      startedAt: T0,
    });

    expect(projection).toMatchObject({ ok: true, exemptUpkeepIds: ["ward-upkeep"] });
    expect(projection.ok && projection.commitments[0]!.functionsThroughSuppression).toBe(true);
  });

  it("keeps authorized activity-backed upkeep through voluntary Zetsu, charged once beside physical effort", () => {
    const nen = { ...standardAwakenedNen(), mastery: { ...standardAwakenedNen().mastery, zetsu: 1 } } as NenState;
    const runtime = expectSuccess(startZetsu(withActivity(runtimeFor(), CAPABLE, "ward"), { activityId: "z", source: SELF, at: T0, nen })).runtime;
    const hour = advanced(subject(nen), T0, HOUR, WORKING, { runtime, upkeep: [owned("ward-upkeep", "ward")] });

    expect(hour.aura.upkeepShutdowns).toEqual([]);
    expect(hour.aura.upkeepCharges.map((one) => one.id)).toEqual(["ward-upkeep"]);
    expect(hour.aura.balance.net).toBeCloseTo(-(2 * R) - hour.aura.balance.upkeep, 6);
  });

  it("needs both capability and a matching exemption under forced suppression", () => {
    const cases: readonly [string, NenActivityDefinition, { type: string; id: string }][] = [
      ["capable, not exempted", CAPABLE, SELF],
      ["exempted, not capable", INCAPABLE, ABILITY_A],
      ["capable, a Skill sharing the Ability's id", CAPABLE, { type: "skill", id: "ability-a" }],
    ];

    for (const [name, definition, source] of cases) {
      const runtime = withActivity(runtimeFor(), definition, "owner", { source });
      const hour = advanced(subject(forcedNen()), T0, HOUR, AWAKE, { runtime, upkeep: [owned("owner-upkeep", "owner")] });

      expect([name, findNenActivity(hour.nenActivities!.runtime, "owner")!.stop?.cause]).toEqual([name, "suppressed"]);
      expect([name, hour.aura.upkeepCharges.find((one) => one.id === "owner-upkeep")?.hours ?? 0]).toEqual([name, 0]);
    }

    const other = advanced(subject(forcedNen()), T0, HOUR, AWAKE, {
      upkeep: [
        standalone("other", { type: "ability", id: "ability-b" }),
        standalone("incapable", ABILITY_A, { functionsThroughSuppression: false }),
      ],
    });

    expect(other.aura.upkeepShutdowns.map((one) => [one.id, one.reason, one.at]).sort())
      .toEqual([["incapable", "access-lost", T0], ["other", "access-lost", T0]]);

    /* And the projection itself: a capable owner the instance never listed lends nothing. */
    const runtime = withActivity(runtimeFor(), CAPABLE, "ward", { source: SELF });
    const projection = projectNenUpkeep({
      nen: forcedNen(),
      upkeep: [owned("ward-upkeep", "ward")],
      suppliedRuntime: runtime,
      openingRuntime: runtime,
      storedPolicy: { exemptions: "authorized", exemptActivityIds: [] },
      startedAt: T0,
    });

    expect(projection).toMatchObject({ ok: true, exemptUpkeepIds: [] });
  });

  it("requires every simultaneous forced instance to exempt the Ability", () => {
    const hour = advanced(subject(twoForcedNen()), T0, HOUR, AWAKE, { upkeep: [standalone("a-upkeep", ABILITY_A)] });

    expect(hour.aura.upkeepShutdowns.map((one) => [one.id, one.reason, one.at])).toEqual([["a-upkeep", "access-lost", T0]]);

    const single = advanced(subject(forcedNen()), T0, HOUR, AWAKE, { upkeep: [standalone("a-upkeep", ABILITY_A)] });

    expect(single.aura.upkeepShutdowns).toEqual([]);
  });

  it("stops upkeep under involuntary suppression whatever the exemptions", () => {
    const hour = advanced(subject(forcedAndInvoluntaryNen()), T0, HOUR, AWAKE, { upkeep: [standalone("a-upkeep", ABILITY_A)] });

    expect(hour.aura.upkeepShutdowns.map((one) => [one.id, one.reason, one.at])).toEqual([["a-upkeep", "access-lost", T0]]);
  });

  it("requires standalone suppression-capable upkeep to state an Ability source", () => {
    const character = subject(forcedNen());

    expect(codes(advanceFor(character, T0, HOUR, AWAKE, { upkeep: [standalone("skill-upkeep", { type: "skill", id: "ability-a" })] })))
      .toEqual(["character.time.upkeep.provenance.not_ability"]);
    expect(codes(advanceFor(character, T0, HOUR, AWAKE, {
      upkeep: [{ id: "bare", source: "bare", baseRate: 600, period: "hour", functionsThroughSuppression: true }],
    }))).toEqual(["aura.upkeep.provenance.missing"]);
  });
});


describe("upkeep ends with its owner, exactly once", () => {
  it("shuts upkeep down at a collapse and stops its owner there, releasing funding once", () => {
    const runtime = withActivity(runtimeFor(), CAPABLE, "ward", { source: ABILITY_A });
    const result = advanced(subject(abruptAwakenedNen(), 300), T0, hoursToDuration(2), AWAKE, {
      runtime,
      upkeep: [owned("ward-upkeep", "ward", 60)],
    });

    const collapse = result.aura.collapse!;
    const ward = findNenActivity(result.nenActivities!.runtime, "ward")!;

    expect(result.aura.upkeepShutdowns.map((one) => [one.id, one.reason, one.at])).toEqual([["ward-upkeep", "access-lost", collapse.at]]);
    expect(ward.stop).toMatchObject({ cause: "suppressed", at: collapse.at });
    expect(ward.funding.committed).toBe(0);
    expect(result.nenActivities!.events.filter((one) => one.activityId === "ward" && one.kind === "nen-activity-stopped")).toHaveLength(1);
    expect(result.aura.upkeepCharges[0]!.hours).toBeCloseTo((collapse.at - T0) / HOUR, 9);
  });

  it("stops the owner, its sibling upkeep and its composite when the reserve cannot carry one upkeep", () => {
    let runtime = withActivity(runtimeFor(), INCAPABLE, "guard");
    runtime = withActivity(runtime, INCAPABLE, "outer", { constraints: [{ kind: "component", activityId: "guard" }] });

    const upkeep = [
      owned("guard-heavy", "guard", 200_000, { priority: 0 }),
      owned("guard-light", "guard", 10, { priority: 10 }),
      owned("outer-upkeep", "outer", 10, { priority: 10 }),
    ];

    const result = advanced(subject(standardAwakenedNen(), 1000), T0, HOUR, AWAKE, { runtime, upkeep });
    const heavy = result.aura.upkeepShutdowns.find((one) => one.id === "guard-heavy")!;

    expect(heavy.reason).toBe("insufficient-aura");
    expect(result.aura.upkeepShutdowns.map((one) => [one.id, one.reason, one.at]).sort())
      .toEqual([["guard-heavy", "insufficient-aura", heavy.at], ["guard-light", "owner-stopped", heavy.at], ["outer-upkeep", "owner-stopped", heavy.at]].sort());

    const after = result.nenActivities!.runtime;

    expect(findNenActivity(after, "guard")!.stop).toMatchObject({ cause: "unfunded", at: heavy.at });
    expect(findNenActivity(after, "outer")!.stop).toMatchObject({ cause: "collapsed", at: heavy.at });
    expect(result.nenActivities!.events.filter((one) => one.kind === "nen-activity-stopped").map((one) => one.activityId).sort())
      .toEqual(["guard", "outer"]);
  });

  /*
   * A Ren's outward flow and the upkeep it is paying are both closed by one
   * suppression at one instant. The flow stopping IS the owner stopping, so
   * the upkeep ends as its consequence: one shutdown, one stop, one release.
   */
  it("stops an owner once when its flow and its upkeep are closed at the same instant", () => {
    const character = subject(withMastery(standardAwakenedNen(), { ren: 1 }));
    const runtime = expectSuccess(startRen(runtimeFor(), {
      activityId: "ren-1",
      source: SELF,
      selectedOutput: 100,
      at: T0,
      nen: character.nen,
      attributes: character.attributes,
      currentAura: character.aura.current,
    })).runtime;

    const closes = T0 + 20_000;
    const result = advanced(character, T0, MINUTE, {
      initial: { mode: "ordinary-waking" },
      changes: [{ at: closes, activity: { mode: "ordinary-waking", suppression: { source: "test-suppression", forced: false } } }],
    }, { runtime, upkeep: [owned("ren-upkeep", "ren-1", 60)] });

    expect(result.aura.outwardFlowStop).toMatchObject({ id: "ren-1", reason: "access-lost", at: closes });
    /* The flow's stop is the owner's; its upkeep ends as that consequence, reported once. */
    expect(result.aura.upkeepShutdowns.map((one) => [one.id, one.reason, one.at])).toEqual([["ren-upkeep", "owner-stopped", closes]]);

    const stops = result.nenActivities!.events.filter((one) => one.kind === "nen-activity-stopped" && one.activityId === "ren-1");

    expect(stops.map((one) => [one.cause, one.at])).toEqual([["suppressed", closes]]);
    expect(findNenActivity(result.nenActivities!.runtime, "ren-1")!.funding.committed).toBe(0);
  });

  it("charges nothing after its owner expires", () => {
    const runtime = withActivity(runtimeFor(), INCAPABLE, "timed", { requested: { aura: 0, durationSeconds: 1800 } });
    const result = advanced(subject(standardAwakenedNen()), T0, HOUR, AWAKE, { runtime, upkeep: [owned("timed-upkeep", "timed")] });

    expect(result.aura.upkeepCharges.map((one) => [one.id, one.hours])).toEqual([["timed-upkeep", 0.5]]);
    expect(kinds(result.aura.events, "upkeep-expired").map((one) => one.at)).toEqual([T0 + 30 * MINUTE]);
  });

  it("restarts nothing when the suppression lifts", () => {
    const nen = forcedNen();
    const runtime = withActivity(runtimeFor(), CAPABLE, "ward", { source: SELF });
    const upkeep = [owned("ward-upkeep", "ward")];
    const suppressed = advanced(subject(nen), T0, HOUR, AWAKE, { runtime, upkeep });

    const released = expectSuccess(releaseForcedZetsu(
      awakeningContext({ nen, operationId: "op-release" }),
      { suppressionId: nen.awakening.suppression[0]!.id, authorization: GM },
    )).state;

    const character = { ...suppressed.character, nen: released };
    const after = suppressed.nenActivities!.runtime;

    expect(codes(advanceFor(character, T0 + HOUR, HOUR, AWAKE, { runtime: after, upkeep })))
      .toEqual(["character.time.upkeep.owner.stopped"]);

    const later = advanced(character, T0 + HOUR, HOUR, AWAKE, { runtime: after });

    expect(findNenActivity(later.nenActivities!.runtime, "ward")!.condition).toBe("ended");
    expect(later.aura.upkeepCharges).toEqual([]);
  });

  it("refuses malformed or contradictory ownership", () => {
    const character = subject(standardAwakenedNen());
    let runtime = withActivity(runtimeFor(), INCAPABLE, "guard");
    runtime = withActivity(runtime, INCAPABLE, "outer", { constraints: [{ kind: "component", activityId: "guard" }] });

    const cases: readonly [string, readonly AuraUpkeepCommitment[], NenActivityRuntime | undefined, string][] = [
      ["no runtime", [owned("u", "guard")], undefined, "character.time.upkeep.owner.absent"],
      ["absent owner", [owned("u", "nobody")], runtime, "character.time.upkeep.owner.absent"],
      ["capability contradicts owner", [owned("u", "guard", 600, { functionsThroughSuppression: true })], runtime, "character.time.upkeep.capability.contradictory"],
      ["dependencies contradict owner", [{ ...owned("u", "outer"), provenance: { kind: "activity", activityId: "outer", dependsOn: ["elsewhere"] } }], runtime, "character.time.upkeep.owner.contradictory"],
      ["malformed provenance", [{ ...owned("u", "guard"), provenance: { kind: "activity", activityId: "" } }], runtime, "aura.upkeep.provenance.invalid"],
      ["duplicate id", [owned("u", "guard"), owned("u", "outer")], runtime, "aura.upkeep.id.duplicate"],
    ];

    for (const [name, upkeep, supplied, code] of cases) {
      expect([name, codes(advanceFor(character, T0, HOUR, AWAKE, { ...(supplied === undefined ? {} : { runtime: supplied }), upkeep }))])
        .toEqual([name, [code]]);
    }

    const stopped = expectSuccess(advanceCharacterTime({
      character,
      temporalState: characterTemporalState(T0),
      interval: gameTimeIntervalOf(T0, 1),
      activity: AWAKE,
      activeEffects: { nenActivities: withActivity(runtimeFor(), INCAPABLE, "brief", { requested: { aura: 0, durationSeconds: 0.0005 } }) },
    })).nenActivities!.runtime;

    expect(codes(advanceFor(character, T0 + 1, HOUR, AWAKE, { runtime: stopped, upkeep: [owned("u", "brief")] })))
      .toEqual(["character.time.upkeep.owner.stopped"]);
  });
});
