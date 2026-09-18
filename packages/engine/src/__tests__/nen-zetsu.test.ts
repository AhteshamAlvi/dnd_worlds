/*
 * Ordinary Zetsu: a deliberate shutdown the runtime can start, stop and carry
 * through time, projected into Aura as generic voluntary suppression.
 *
 *   start      zero cost, zero Output, no upkeep, no duration; ends every
 *              deliberate-access activity at the same instant, for good
 *   running    Output 0, no coating, no leak, no deliberate access, and NOT
 *              active Nen — recovery is the suppressed column:
 *                ordinary 3R   physical R - 2R   rest 4R   sleep 4R
 *   stop       passive state (Ten) returns; nothing Zetsu ended does
 *   concealment  +1 +1 +1 +2 +2 +3 +3 +4 +4 +5, only while it runs, only
 *                against Aura presence, never for a forced state
 *
 * Working numbers, standard human at CON 20 / VIT 20 / DEX 22:
 *
 *   P 10,000   R 2,500   Maximum Aura 50,000
 */

import { describe, expect, it } from "vitest";

import {
  ZETSU_MASTERY_PROFILES,
  deriveZetsuAuraConcealmentModifier,
} from "../character/foundation/nen/principles/zetsu";
import {
  ZETSU_ACTIVITY_DEFINITION,
  activeZetsuActivity,
  resolveZetsuAuraConcealment,
  startZetsu,
  stopZetsu,
  withZetsuAccess,
  zetsuSuppression,
} from "../character/nen/zetsu";
import type { StartZetsuRequest } from "../character/nen/zetsu";
import { activeRenActivity, startRen } from "../character/nen/ren";
import {
  advanceNenCollapseRecovery,
  awakenNenInstinctive,
  nenAuraAccessInput,
  releaseForcedZetsu,
  settleNenCollapse,
} from "../character/nen";
import {
  activateNenActivity,
  resumeNenActivity,
  stopNenActivity,
} from "../character/nen/runtime";
import {
  emptyNenActivityRuntime,
  findNenActivity,
  findNenActivityDefinitionIssues,
  findNenActivityRuntimeIssues,
  type NenActivityDefinition,
  type NenActivityRuntime,
} from "../character/foundation/nen/runtime";
import type { AuraFundingOutcome } from "../character/foundation/aura/funding";
import { resolveAuraAccess } from "../character/foundation/aura/access";
import { resolveAuraBudget } from "../character/foundation/aura/budget";
import { deriveAuraRegeneration } from "../character/foundation/aura/recovery";
import {
  createUnawakenedNenState,
  deriveEffectiveNenMastery,
  isNenPrincipleUnlocked,
} from "../character/foundation/nen/nen";
import { unassignedNenAffinity } from "../character/foundation/nen/nen-type";
import { uncontainedCollapse } from "../character/foundation/aura/leakage";
import {
  advanceCharacterTime,
  characterTemporalState,
  projectCharacterAtTime,
} from "../character/time";
import type { CharacterTimeActivity } from "../character/time";
import { gameTimeIntervalOf, hoursToDuration } from "../time/interval";
import type { Character } from "../character/types";
import type { NenState } from "../character/foundation/nen/types";

import { auraContext, withTen } from "./fixtures/aura";
import { createTestCharacter } from "./fixtures/character";
import {
  AWAKENING_CAPABLE,
  abruptAwakenedNen,
  awakeningContext,
  revertedNen,
  standardAwakenedNen,
} from "./fixtures/nen";
import { INSTINCTIVE_AWAKENING_MINIMUM_SPI } from "../character/foundation/nen/awakening/calculations";

const STRONG = { con: 20, vit: 20, dex: 22 } as const;
const MAX = 50_000;
const T0 = 1_000_000_000;
const MINUTE = 60_000;
const SELF = { type: "character", id: "subject" } as const;
const GM = { type: "gm", id: "table-ruling" } as const;

const AWAKE: CharacterTimeActivity = { initial: { mode: "ordinary-waking" } };


type Mastery = Partial<Record<"ten" | "ren" | "zetsu", number>>;

function withMastery(base: NenState, mastery: Mastery, extra: Partial<NenState> = {}): NenState {
  return {
    ...base,
    mastery: { ...base.mastery, ...mastery } as NenState["mastery"],
    ...extra,
  };
}

function nenWith(mastery: Mastery, extra: Partial<NenState> = {}): NenState {
  return withMastery(standardAwakenedNen(), { ten: 1, ren: 1, zetsu: 1, ...mastery }, extra);
}

function subject(options: { nen?: NenState; current?: number; hoursAwake?: number } = {}): Character {
  return createTestCharacter({
    id: "subject",
    attributes: STRONG,
    aura: { current: options.current ?? 10_000, allocations: [] },
    wakefulness: { hoursAwake: options.hoursAwake ?? 2 },
    nen: options.nen ?? nenWith({}),
  });
}

const R = deriveAuraRegeneration(subject().attributes);

function runtimeFor(at = T0): NenActivityRuntime {
  return emptyNenActivityRuntime("nen:subject", at);
}

function zetsuRequest(nen: NenState, overrides: Partial<StartZetsuRequest> = {}): StartZetsuRequest {
  return { activityId: "zetsu-1", source: SELF, at: T0, nen, ...overrides };
}

function expectSuccess<T>(result: { success: boolean; payload?: T; errors?: readonly { code: string }[] }): T {
  if (!result.success) {
    throw new Error("Expected success: " + (result.errors ?? []).map((error) => error.code).join(", "));
  }

  return result.payload as T;
}

function codes(result: { success: boolean; errors?: readonly { code: string }[] }): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((error) => error.code);
}

function inZetsu(nen: NenState = nenWith({}), runtime = runtimeFor(), at = T0): NenActivityRuntime {
  return expectSuccess(startZetsu(runtime, zetsuRequest(nen, { at }))).runtime;
}

function withRen(character: Character, at = T0): NenActivityRuntime {
  return expectSuccess(startRen(runtimeFor(at), {
    activityId: "ren-1",
    source: SELF,
    selectedOutput: 500,
    at,
    nen: character.nen,
    attributes: character.attributes,
    currentAura: character.aura.current,
  })).runtime;
}

function advanceFor(
  character: Character,
  runtime: NenActivityRuntime,
  startedAt: number,
  durationMs: number,
  activity: CharacterTimeActivity = AWAKE,
) {
  return advanceCharacterTime({
    character,
    temporalState: characterTemporalState(startedAt),
    interval: gameTimeIntervalOf(startedAt, durationMs),
    activity,
    activeEffects: { nenActivities: runtime },
  });
}

function advanced(...args: Parameters<typeof advanceFor>) {
  return expectSuccess(advanceFor(...args));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value as object)) deepFreeze(inner);
  }

  return value;
}

function zeroFunding(requestId: string): AuraFundingOutcome {
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

/*
 * A generic activity needing deliberate access, one authored without it — which
 * authorizes nothing — and one explicitly authorized through suppression.
 */
const SHROUD: NenActivityDefinition = {
  id: "test-shroud",
  relations: [],
  constraints: [{ kind: "deliberate-access" }],
};

const VOW: NenActivityDefinition = { id: "test-vow", relations: [] };

/* Explicitly authorized to function through suppression. */
const WARD: NenActivityDefinition = {
  id: "test-ward",
  relations: [],
  functionsThroughSuppression: true,
};

function withGeneric(runtime: NenActivityRuntime, definition: NenActivityDefinition, id: string): NenActivityRuntime {
  return expectSuccess(activateNenActivity(
    runtime,
    {
      activityId: id,
      definitionId: definition.id,
      source: SELF,
      at: runtime.at,
      requested: { aura: 0 },
      priority: 0,
      funding: zeroFunding(`${id}:activation`),
    },
    new Map([[definition.id, definition]]),
  )).runtime;
}

function forcedNen(): NenState {
  const instinctive = awakenNenInstinctive(
    awakeningContext({
      attributes: { ...AWAKENING_CAPABLE, spi: INSTINCTIVE_AWAKENING_MINIMUM_SPI },
      operationId: "op-inst",
    }),
    {
      method: "instinctive",
      authorization: { grantedBy: GM, reason: "Cornered." },
      naturalAbilityId: "ability-a",
    },
  );

  return withMastery(expectSuccess(instinctive).state, { zetsu: 3 });
}

function involuntaryNen(): NenState {
  const collapsed = settleNenCollapse(
    awakeningContext({ nen: abruptAwakenedNen(), operationId: "op-collapse" }),
    { collapse: uncontainedCollapse(0) },
  );

  return withMastery(expectSuccess(collapsed).state, { zetsu: 3 });
}


/* ── Activation and shutdown ────────────────────────────────────────────── */

describe("entering Zetsu", () => {
  it("starts for an awakened character with effective Zetsu I", () => {
    const transition = expectSuccess(startZetsu(runtimeFor(), zetsuRequest(nenWith({ zetsu: 1 }))));

    expect(transition.after).toMatchObject({
      id: "zetsu-1",
      definitionId: "zetsu",
      condition: "active",
      startedAt: T0,
      source: SELF,
      revokes: ["deliberate-access"],
    });
    expect(transition.events.map((event) => event.kind)).toEqual(["nen-activity-started"]);
    expect(findNenActivityRuntimeIssues(transition.runtime)).toEqual([]);
  });

  it("costs nothing, commits nothing, and has no allocation, upkeep or duration — even at zero Aura", () => {
    const zetsu = activeZetsuActivity(inZetsu(subject({ current: 0 }).nen))!;

    expect(zetsu.requested).toEqual({ aura: 0 });
    expect(zetsu.funding).toMatchObject({ committed: 0, allocationIds: [], unmet: 0, status: "funded" });
    expect(zetsu.constraints).toEqual([]);

    const hour = advanced(subject({ current: 0 }), inZetsu(), T0, hoursToDuration(1));

    expect(hour.aura.balance.upkeep).toBe(0);
    expect(hour.aura.upkeepCharges).toEqual([]);
    expect(findNenActivity(hour.nenActivities!.runtime, "zetsu-1")!.condition).toBe("active");
    expect(hour.character.aura.current).toBeCloseTo(3 * R, 6);
  });

  it("refuses the unawakened, reverted, sealed-to-zero, forced and involuntary", () => {
    const cases: readonly [string, NenState, string][] = [
      ["unawakened", createUnawakenedNenState(unassignedNenAffinity()), "nen.zetsu.unavailable.access-lost"],
      ["reverted", withMastery(revertedNen(), { zetsu: 2 }), "nen.zetsu.unavailable.access-lost"],
      ["unlearned", nenWith({ zetsu: 0 }), "nen.zetsu.unavailable.sealed"],
      ["sealed", nenWith({ zetsu: 5 }, { seals: { zetsu: 0 } }), "nen.zetsu.unavailable.sealed"],
      ["forced", forcedNen(), "nen.zetsu.unavailable.suppressed"],
      ["involuntary", involuntaryNen(), "nen.zetsu.unavailable.suppressed"],
    ];

    for (const [name, nen, code] of cases) {
      const runtime = deepFreeze(runtimeFor());

      expect([name, codes(startZetsu(runtime, zetsuRequest(nen)))]).toEqual([name, [code]]);
    }
  });

  it("refuses malformed runtimes, timestamps, sources, Nen states and mastery before touching anything", () => {
    const nen = nenWith({});
    const character = subject({ nen });
    const running = deepFreeze(withRen(character));
    const snapshot = JSON.stringify(running);

    const hostile: readonly [string, NenActivityRuntime, Partial<StartZetsuRequest> | null][] = [
      ["runtime", { ...running, owner: "" }, {}],
      ["NaN time", running, { at: Number.NaN }],
      ["retrograde time", running, { at: T0 - 1 }],
      ["source", running, { source: { type: "", id: "x" } }],
      ["missing source", running, { source: undefined as never }],
      ["Nen state", running, { nen: null as never }],
      ["mastery", running, { nen: withMastery(nen, { zetsu: 11 }) }],
      ["activity id", running, { activityId: "" }],
      ["request", running, null],
    ];

    for (const [name, runtime, overrides] of hostile) {
      const result = startZetsu(
        runtime,
        overrides === null ? (null as never) : zetsuRequest(nen, overrides),
      );

      expect([name, result.success]).toEqual([name, false]);
    }

    expect(JSON.stringify(running)).toBe(snapshot);
    expect(activeRenActivity(running)?.funding.committed).toBe(500);
  });

  it("ends a running Ren at the same instant, as replaced, with no way back", () => {
    const character = subject();
    /* Ren I at 500 of 1,000 lasts two minutes; this is inside them. */
    const at = T0 + 30_000;
    const running = withRen(character);
    const transition = expectSuccess(startZetsu(running, zetsuRequest(character.nen, { at })));

    const ren = findNenActivity(transition.runtime, "ren-1")!;

    expect(ren).toMatchObject({ condition: "ended", endedAt: at });
    expect(ren.stop).toMatchObject({ cause: "replaced", at, resume: null, by: SELF });
    expect(ren.funding.committed).toBe(0);
    expect(transition.consequences.map((one) => one.id)).toEqual(["ren-1"]);
    expect(transition.events.map((event) => [event.kind, event.activityId, event.at])).toEqual([
      ["nen-activity-stopped", "ren-1", at],
      ["nen-activity-started", "zetsu-1", at],
    ]);

    expect(codes(resumeNenActivity(transition.runtime, {
      activityId: "ren-1",
      at: at + MINUTE,
      by: SELF,
      funding: zeroFunding("ren-1:resume"),
    }))).toEqual(["nen.activity.transition.illegal"]);
  });

  it("refuses to replace a Ren that had already expired, until the runtime is advanced", () => {
    const character = subject();
    const running = deepFreeze(withRen(character));

    expect(codes(startZetsu(running, zetsuRequest(character.nen, { at: T0 + 5 * MINUTE }))))
      .toEqual(["nen.activity.replace.expired"]);

    const caughtUp = advanced(character, running, T0, 5 * MINUTE).nenActivities!.runtime;
    const transition = expectSuccess(startZetsu(caughtUp, zetsuRequest(character.nen, { at: T0 + 5 * MINUTE })));

    expect(findNenActivity(transition.runtime, "ren-1")!.stop?.cause).toBe("expired");
    expect(transition.consequences).toEqual([]);
  });

  it("ends every unauthorized activity atomically, and leaves only an explicitly authorized one", () => {
    const character = subject();
    let runtime = withRen(character);
    runtime = withGeneric(runtime, SHROUD, "shroud-1");
    runtime = withGeneric(runtime, VOW, "vow-1");
    runtime = withGeneric(runtime, WARD, "ward-1");

    const transition = expectSuccess(startZetsu(runtime, zetsuRequest(character.nen)));
    const condition = (id: string) => findNenActivity(transition.runtime, id)!.condition;

    expect([condition("ren-1"), condition("shroud-1"), condition("vow-1"), condition("ward-1"), condition("zetsu-1")])
      .toEqual(["ended", "ended", "ended", "active", "active"]);
    expect(transition.consequences.map((one) => [one.id, one.stop?.cause, one.stop?.resume]))
      .toEqual([["ren-1", "replaced", null], ["shroud-1", "replaced", null], ["vow-1", "replaced", null]]);
  });

  it("leaves every activity and commitment unchanged when the start is refused", () => {
    const sealed = nenWith({ zetsu: 3 }, { seals: { zetsu: 0 } });
    const running = deepFreeze(withGeneric(withRen(subject()), SHROUD, "shroud-1"));
    const snapshot = JSON.stringify(running);

    expect(startZetsu(running, zetsuRequest(sealed)).success).toBe(false);
    expect(JSON.stringify(running)).toBe(snapshot);
    expect(activeRenActivity(running)!.funding.committed).toBe(500);
  });

  it("refuses a second Zetsu", () => {
    const running = inZetsu();

    expect(codes(startZetsu(running, zetsuRequest(nenWith({}), { activityId: "zetsu-2" }))))
      .toEqual(["nen.zetsu.already_active"]);
  });

  it("refuses Ren, or any activity not authorized through suppression, while it runs", () => {
    const character = subject();
    const running = inZetsu(character.nen);

    expect(codes(startRen(running, {
      activityId: "ren-1",
      source: SELF,
      selectedOutput: 500,
      at: T0,
      nen: character.nen,
      attributes: character.attributes,
      currentAura: character.aura.current,
    }))).toEqual(["nen.activity.constraint.revoked"]);

    expect(codes(activateNenActivity(
      running,
      {
        activityId: "shroud-1",
        definitionId: SHROUD.id,
        source: SELF,
        at: T0,
        requested: { aura: 0 },
        priority: 0,
        funding: zeroFunding("shroud-1"),
      },
      new Map([[SHROUD.id, SHROUD]]),
    ))).toEqual(["nen.activity.constraint.revoked"]);

    expect(codes(activateNenActivity(
      running,
      {
        activityId: "vow-1",
        definitionId: VOW.id,
        source: SELF,
        at: T0,
        requested: { aura: 0 },
        priority: 0,
        funding: zeroFunding("vow-1"),
      },
      new Map([[VOW.id, VOW]]),
    ))).toEqual(["nen.activity.suppression.not_permitted"]);

    expect(withGeneric(running, WARD, "ward-1").activities.map((one) => one.condition))
      .toEqual(["active", "active"]);
  });

  it("refuses to resume a suspended deliberate-access activity while it runs", () => {
    const suspended = expectSuccess(stopNenActivity(withGeneric(runtimeFor(), SHROUD, "shroud-1"), {
      activityId: "shroud-1",
      cause: "interrupted",
      at: T0,
      by: GM,
      resume: { authority: GM },
    })).runtime;

    const running = inZetsu(nenWith({}), suspended);

    expect(codes(resumeNenActivity(running, {
      activityId: "shroud-1",
      at: T0 + MINUTE,
      by: GM,
      funding: zeroFunding("shroud-1:resume"),
    }))).toEqual(["nen.activity.constraint.revoked"]);
  });

  it("is refused as a hand-built runtime running beside something it revokes", () => {
    const ren = activeRenActivity(withRen(subject()))!;
    const zetsu = activeZetsuActivity(inZetsu())!;

    expect(findNenActivityRuntimeIssues({ ...runtimeFor(), activities: [ren, zetsu] }).map((one) => one.code))
      .toEqual(["nen.activity.constraint.revoked"]);
  });

  it("declares no deliberate access of its own, and a self-revoking definition is refused", () => {
    expect(findNenActivityDefinitionIssues(ZETSU_ACTIVITY_DEFINITION)).toEqual([]);
    expect(ZETSU_ACTIVITY_DEFINITION.constraints ?? []).toEqual([]);

    expect(findNenActivityDefinitionIssues({
      ...SHROUD,
      revokes: ["deliberate-access"],
    }).map((one) => one.code)).toEqual(["nen.activity.definition.invalid"]);

    expect(findNenActivityDefinitionIssues({
      ...VOW,
      revokes: ["not-a-kind" as never],
    }).map((one) => one.code)).toEqual(["nen.activity.revokes.invalid"]);
  });
});


describe("leaving Zetsu", () => {
  it("may only be cancelled by the source that started it", () => {
    const running = inZetsu();

    expect(codes(stopZetsu(running, { activityId: "zetsu-1", at: T0 + MINUTE, by: GM })))
      .toEqual(["nen.activity.authority.refused"]);
    expect(codes(stopZetsu(running, { activityId: "zetsu-2", at: T0 + MINUTE, by: SELF })))
      .toEqual(["nen.zetsu.not_active"]);

    const stopped = expectSuccess(stopZetsu(running, { activityId: "zetsu-1", at: T0 + MINUTE, by: SELF }));

    expect(stopped.after).toMatchObject({ condition: "ended", endedAt: T0 + MINUTE });
    expect(stopped.after!.stop).toMatchObject({ cause: "cancelled", resume: null });
  });

  it("restores Ten and never restarts the Ren it replaced", () => {
    const character = subject();
    const running = expectSuccess(startZetsu(withRen(character), zetsuRequest(character.nen))).runtime;
    const left = expectSuccess(stopZetsu(running, { activityId: "zetsu-1", at: T0 + MINUTE, by: SELF })).runtime;

    expect(activeRenActivity(left)).toBeUndefined();
    expect(activeZetsuActivity(left)).toBeUndefined();

    const hour = advanced(character, left, T0 + MINUTE, hoursToDuration(1));

    for (const segment of hour.aura.segments) {
      expect([segment.accessState, segment.outwardFlow, segment.recoveryRatePerHour])
        .toEqual(["ten", null, 2 * R]);
    }
  });
});


/* ── Access and time ────────────────────────────────────────────────────── */

describe("the access a running Zetsu projects", () => {
  const character = subject();
  const nenInput = nenAuraAccessInput(character.nen);

  it("closes Output, the coating, the leak and deliberate access", () => {
    const running = inZetsu(character.nen);
    const access = expectSuccess(resolveAuraAccess(withZetsuAccess(nenInput, running)));

    expect(access).toMatchObject({
      accessFraction: 0,
      deliberateInternalAccess: false,
      deliberateExternalAccess: false,
      automaticSurfaceCoating: null,
      containedLeakageRegenerationMultiple: 0,
      uncontained: false,
      outwardFlow: false,
      source: "zetsu",
    });

    const budget = expectSuccess(resolveAuraBudget(40_000, {
      ...auraContext({ attributes: STRONG, access: withTen(1) }),
      access: withZetsuAccess(nenInput, running),
    }));

    expect([budget.accessibleOutput, budget.usableOutput, budget.automaticAura, budget.deliberateBudget])
      .toEqual([0, 0, 0, 0]);
  });

  it("leaves the input untouched when no Zetsu runs, or when a forced state already holds the nodes", () => {
    expect(withZetsuAccess(nenInput, runtimeFor())).toBe(nenInput);

    const forced = nenAuraAccessInput(forcedNen());

    expect(withZetsuAccess(forced, inZetsu())).toBe(forced);
  });

  it("is supplied only by the adapter, as voluntary suppression", () => {
    expect(zetsuSuppression(runtimeFor())).toBeNull();
    expect(zetsuSuppression(inZetsu())).toEqual({
      activityId: "zetsu-1",
      source: SELF,
      suppression: { source: "zetsu", forced: false, exemptions: "authorized" },
      override: { kind: "suppressed", source: "zetsu" },
    });
  });
});


describe("Zetsu across an interval", () => {
  /*
   * Each row, from 10,000 of 50,000 so no boundary is reached in the hour.
   * Sleep counts from a fresh streak and is only one hour, so no top-off.
   */
  const MATRIX = [
    { name: "ordinary", initial: { mode: "ordinary-waking" }, recovery: 3, physical: 0, net: 3 },
    { name: "physical", initial: { mode: "ordinary-waking", activity: "moderate" }, recovery: 1, physical: 2, net: -1 },
    { name: "rest", initial: { mode: "intentional-rest" }, recovery: 4, physical: 0, net: 4 },
    { name: "sleep", initial: { mode: "sleep" }, recovery: 4, physical: 0, net: 4 },
  ] as const;

  for (const row of MATRIX) {
    it(`recovers the suppressed ${row.name} row through the real character-time route`, () => {
      const hour = advanced(subject(), inZetsu(), T0, hoursToDuration(1), { initial: row.initial });

      expect(hour.aura.balance.recovery).toBeCloseTo(row.recovery * R, 6);
      expect(hour.aura.balance.leakage).toBe(0);
      expect(hour.aura.balance.physical).toBeCloseTo(row.physical * R, 6);
      expect(hour.aura.balance.net).toBeCloseTo(row.net * R, 6);
      expect(hour.character.aura.current).toBeCloseTo(10_000 + row.net * R, 6);

      for (const segment of hour.aura.segments) {
        expect([
          segment.recoveryRatePerHour,
          segment.leakageRatePerHour,
          segment.leakageSource,
          segment.physicalRatePerHour,
          segment.outwardFlowRatePerHour,
          segment.accessState,
        ]).toEqual([row.recovery * R, 0, null, row.physical * R, 0, "override"]);
      }

      expect(hour.aura.balance.recoveryBySource.map((one) => [one.source, one.context]))
        .toEqual([["natural-regeneration", "zetsu"]]);
      expect(findNenActivity(hour.nenActivities!.runtime, "zetsu-1")!.condition).toBe("active");
      expect(hour.nenActivities!.runtime.at).toBe(T0 + hoursToDuration(1));
    });
  }

  it("is not counted as active Nen", () => {
    const hour = advanced(subject(), inZetsu(), T0, hoursToDuration(1));

    expect(hour.aura.balance.recovery).toBeGreaterThan(0);
    expect(hour.aura.balance.recoveryBySource.some((one) => one.context === "active-nen")).toBe(false);
  });

  it("tops up a completed sleep once, and never for eight waking hours", () => {
    const character = subject({ current: 1000, hoursAwake: 0 });
    const night = advanced(character, inZetsu(character.nen), T0, hoursToDuration(10), { initial: { mode: "sleep" } });

    expect(night.aura.events.filter((event) => event.kind === "sleep-completed")).toHaveLength(1);
    expect(night.character.aura.current).toBe(MAX);

    const day = advanced(character, inZetsu(character.nen), T0, hoursToDuration(8));

    expect(day.aura.events.filter((event) => event.kind === "sleep-completed")).toHaveLength(0);
    expect(day.aura.balance.recoveryBySource.map((one) => one.source)).toEqual(["natural-regeneration"]);
    expect(day.aura.segments[0]!.recoveryRatePerHour).toBe(3 * R);
  });

  it("agrees with the same span advanced in slices", () => {
    const character = subject({ current: 2000 });
    const span = hoursToDuration(2);
    const activity: CharacterTimeActivity = {
      initial: { mode: "ordinary-waking" },
      changes: [{ at: T0 + 50 * MINUTE, activity: { mode: "ordinary-waking", activity: "moderate" } }],
    };

    const whole = advanced(character, inZetsu(character.nen), T0, span, activity);

    let current = character;
    let runtime = inZetsu(character.nen);
    let fatigue = whole.aura.previousFatigue;
    const accessStates = new Set<string>();
    const auraEvents: unknown[] = [];
    const slice = 15 * MINUTE;

    for (let at = T0; at < T0 + span; at += slice) {
      const changes = (activity.changes ?? []).filter((one) => one.at > at && one.at < at + slice);
      const opening = [...(activity.changes ?? [])].reverse().find((one) => one.at <= at)?.activity ?? activity.initial;
      const step = advanced(current, runtime, at, slice, { initial: opening, changes });

      current = step.character;
      runtime = step.nenActivities!.runtime;
      fatigue = step.fatigue;
      step.aura.segments.forEach((segment) => accessStates.add(segment.accessState));
      auraEvents.push(...step.aura.events.filter((event) => event.kind !== "interval-end" && event.kind !== "activity-changed"));
    }

    expect(current.aura.current).toBeCloseTo(whole.character.aura.current, 6);
    expect(current.wakefulness).toEqual(whole.character.wakefulness);
    expect(runtime).toEqual(whole.nenActivities!.runtime);
    expect(fatigue).toEqual(whole.fatigue);
    expect([...accessStates]).toEqual([...new Set(whole.aura.segments.map((segment) => segment.accessState))]);
    expect(auraEvents).toEqual(
      whole.aura.events.filter((event) => event.kind !== "interval-end" && event.kind !== "activity-changed"),
    );

    const projection = expectSuccess(projectCharacterAtTime({
      character,
      temporalState: characterTemporalState(T0),
      currentTime: T0 + span,
      activity,
      activeEffects: { nenActivities: inZetsu(character.nen) },
    }));

    expect(projection.character.aura).toEqual(whole.character.aura);
    expect(projection.fatigue).toEqual(whole.fatigue);
  });

  it("changes rates at the instant it is left between advances", () => {
    const character = subject();
    const first = advanced(character, inZetsu(character.nen), T0, 30 * MINUTE);
    const left = expectSuccess(stopZetsu(first.nenActivities!.runtime, {
      activityId: "zetsu-1",
      at: T0 + 30 * MINUTE,
      by: SELF,
    })).runtime;
    const second = advanced(first.character, left, T0 + 30 * MINUTE, 30 * MINUTE);

    expect(first.aura.segments.every((one) => one.recoveryRatePerHour === 3 * R)).toBe(true);
    expect(second.aura.segments.map((one) => [one.startedAt, one.accessState, one.recoveryRatePerHour, one.leakageSource]))
      .toEqual([[T0 + 30 * MINUTE, "ten", 2 * R, "contained"]]);
  });

  it("ends at the opening instant when sealed, reverted or externally suppressed — and does not come back", () => {
    const cases: readonly [string, NenState, string][] = [
      ["sealed", nenWith({ zetsu: 4 }, { seals: { zetsu: 0 } }), "sealed"],
      ["reverted", withMastery(revertedNen(), { zetsu: 4 }), "access-lost"],
      ["forced", forcedNen(), "suppressed"],
      ["involuntary", involuntaryNen(), "suppressed"],
    ];

    for (const [name, nen, cause] of cases) {
      const running = inZetsu(nenWith({ zetsu: 4 }));
      const hour = advanced(subject({ nen }), running, T0, hoursToDuration(1), { initial: { mode: "sleep" } });
      const zetsu = findNenActivity(hour.nenActivities!.runtime, "zetsu-1")!;

      expect([name, zetsu.condition, zetsu.stop?.cause, zetsu.endedAt]).toEqual([name, "ended", cause, T0]);
      expect([name, hour.aura.balance.recoveryBySource.some((one) => one.context === "zetsu")]).toEqual([name, false]);
    }

    /* Releasing the forced state restores nothing on its own. */
    const forced = forcedNen();
    const ended = advanced(subject({ nen: forced }), inZetsu(nenWith({ zetsu: 3 })), T0, hoursToDuration(1)).nenActivities!.runtime;
    const released = expectSuccess(releaseForcedZetsu(
      awakeningContext({ nen: forced, operationId: "op-release" }),
      { suppressionId: forced.awakening.suppression[0]!.id, authorization: GM },
    )).state;
    const after = advanced(subject({ nen: released }), ended, T0 + hoursToDuration(1), hoursToDuration(1));

    expect(activeZetsuActivity(after.nenActivities!.runtime)).toBeUndefined();
    expect(after.aura.segments.every((one) => one.accessState !== "override")).toBe(true);
  });

  it("refuses a caller restating the suppression the runtime already supplies", () => {
    const restated = [
      { initial: { mode: "ordinary-waking", suppression: { source: "zetsu", forced: false } } },
      { initial: { mode: "ordinary-waking" }, changes: [{ at: T0 + MINUTE, activity: { mode: "sleep", suppression: { source: "x", forced: true } } }] },
    ] as const satisfies readonly CharacterTimeActivity[];

    for (const activity of restated) {
      expect(codes(advanceFor(subject(), inZetsu(), T0, hoursToDuration(1), activity)))
        .toEqual(["character.time.suppression.contradictory"]);
    }
  });

  it("refuses an unauthorized activity manufactured beside it, rather than inventing its recovery", () => {
    const vow = findNenActivity(withGeneric(runtimeFor(), VOW, "vow-1"), "vow-1")!;
    const zetsu = inZetsu();
    const running = { ...zetsu, activities: [vow, ...zetsu.activities] };

    expect(codes(advanceFor(subject(), running, T0, hoursToDuration(1))))
      .toEqual(["character.time.suppression.active_nen.unresolved"]);
  });

  it("advances frozen inputs without mutating them", () => {
    const character = deepFreeze(subject());
    const running = deepFreeze(inZetsu(character.nen));

    expect(() => advanced(character, running, T0, hoursToDuration(1))).not.toThrow();
  });
});


/* ── Mastery and concealment ────────────────────────────────────────────── */

describe("Zetsu's Aura Concealment", () => {
  const TABLE = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5];

  it("pins all ten values in the principle file", () => {
    expect(Object.values(ZETSU_MASTERY_PROFILES).map((one) => one.auraConcealmentModifier)).toEqual(TABLE);
  });

  it("returns the value for current effective Mastery while ordinary Zetsu runs", () => {
    for (let mastery = 1; mastery <= 10; mastery += 1) {
      const nen = nenWith({ zetsu: mastery });
      const contribution = expectSuccess(resolveZetsuAuraConcealment(inZetsu(nen), nen));

      expect(contribution).toEqual({
        available: true,
        scope: "aura-presence",
        activityId: "zetsu-1",
        source: SELF,
        mastery,
        modifier: TABLE[mastery - 1],
      });
    }
  });

  it("returns nothing when no Zetsu runs, or after it stops", () => {
    const nen = nenWith({ zetsu: 10 });
    const stopped = expectSuccess(stopZetsu(inZetsu(nen), { activityId: "zetsu-1", at: T0, by: SELF })).runtime;

    expect(expectSuccess(resolveZetsuAuraConcealment(runtimeFor(), nen))).toEqual({ available: false, modifier: 0 });
    expect(expectSuccess(resolveZetsuAuraConcealment(stopped, nen))).toEqual({ available: false, modifier: 0 });
  });

  it("gives forced and involuntary Zetsu no learned modifier", () => {
    for (const nen of [forcedNen(), involuntaryNen()]) {
      expect(expectSuccess(resolveZetsuAuraConcealment(runtimeFor(), nen))).toEqual({ available: false, modifier: 0 });
      expect(expectSuccess(resolveZetsuAuraConcealment(inZetsu(nenWith({ zetsu: 3 })), nen)))
        .toEqual({ available: false, modifier: 0 });
    }
  });

  it("lowers under a partial seal, and ends with a seal to zero", () => {
    const running = inZetsu(nenWith({ zetsu: 9 }));
    const partial = nenWith({ zetsu: 9 }, { seals: { zetsu: 5 } });

    expect(expectSuccess(resolveZetsuAuraConcealment(running, partial)))
      .toMatchObject({ available: true, mastery: 5, modifier: 2 });

    const total = nenWith({ zetsu: 9 }, { seals: { zetsu: 0 } });

    expect(expectSuccess(resolveZetsuAuraConcealment(running, total))).toEqual({ available: false, modifier: 0 });
    expect(findNenActivity(advanced(subject({ nen: total }), running, T0, MINUTE).nenActivities!.runtime, "zetsu-1")!.stop?.cause)
      .toBe("sealed");
  });

  it("scopes itself to Aura presence and leaves the Concealment score alone", () => {
    const nen = nenWith({ zetsu: 10 });
    const contribution = expectSuccess(resolveZetsuAuraConcealment(inZetsu(nen), nen));

    expect(contribution.available && contribution.scope).toBe("aura-presence");
    expect(Object.keys(contribution).sort()).toEqual(["activityId", "available", "mastery", "modifier", "scope", "source"]);
    expect(deriveZetsuAuraConcealmentModifier(10)).toBe(5);
  });

  it("refuses a malformed runtime or Nen state", () => {
    expect(resolveZetsuAuraConcealment({ ...runtimeFor(), at: Number.NaN }, nenWith({})).success).toBe(false);
    expect(resolveZetsuAuraConcealment(runtimeFor(), undefined as never).success).toBe(false);
  });
});


/* ── Regression ─────────────────────────────────────────────────────────── */

describe("Zetsu progression is unchanged", () => {
  it("keeps Ren an unlock-only prerequisite, independent of Zetsu Mastery", () => {
    const nen = nenWith({ ren: 1, zetsu: 10 });

    expect(isNenPrincipleUnlocked(nen, "zetsu")).toBe(true);
    expect(deriveEffectiveNenMastery(nen, "zetsu")).toBe(10);
    expect(deriveEffectiveNenMastery(nenWith({ ren: 10, zetsu: 2 }), "zetsu")).toBe(2);
  });

  it("does not let an involuntary Zetsu's recovery depend on ordinary Zetsu", () => {
    const woken = advanceNenCollapseRecovery(
      awakeningContext({ nen: involuntaryNen(), operationId: "op-sleep" }),
      { qualifyingSleepHours: 8, maximumAura: 100, at: 1 },
    );

    expect(woken.success).toBe(true);
  });
});
