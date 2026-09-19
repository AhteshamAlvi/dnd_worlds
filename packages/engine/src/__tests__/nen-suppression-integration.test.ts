/*
 * ZET-1A — suppression, as recovery, runtime and composites all see it.
 *
 *   authorization   only an activity EXPLICITLY declared to function through
 *                   suppression survives ordinary or forced suppression; not
 *                   carrying `deliberate-access` authorizes nothing, and an
 *                   involuntary Zetsu permits no exception at all
 *   recovery        authorized active Nen under suppression: gross recovery 0,
 *                   leakage 0, physical 2R when exerting, explicit upkeep added
 *                   once — until it stops, at that exact timestamp
 *   stored state    forced and involuntary suppression on NenState drive
 *                   character-time recovery with no caller literal
 *   composites      replacement collapses dependents exactly as a stop does
 *
 * Working numbers, standard human at CON 20 / VIT 20 / DEX 22: R 2,500.
 */

import { describe, expect, it } from "vitest";

import {
  NEN_FORCED_SUPPRESSION_SOURCE,
  NEN_INVOLUNTARY_SUPPRESSION_SOURCE,
  awakenNenInstinctive,
  nenStoredSuppression,
  settleNenCollapse,
} from "../character/nen";
import {
  ZETSU_SUPPRESSION_SOURCE,
  resolveZetsuAuraConcealment,
  startZetsu,
  stopZetsu,
} from "../character/nen/zetsu";
import {
  activateNenActivity,
  advanceNenActivities,
  stopNenActivity,
  type NenActivationRequest,
} from "../character/nen/runtime";
import {
  committedNenOutput,
  emptyNenActivityRuntime,
  findNenActivity,
  findNenActivityDefinitionIssues,
  type NenActivityDefinition,
  type NenActivityRuntime,
} from "../character/foundation/nen/runtime";
import type { AuraFundingOutcome } from "../character/foundation/aura/funding";
import { advanceAuraTime } from "../character/foundation/aura/time";
import {
  deriveAuraRegeneration,
  recoverAura,
} from "../character/foundation/aura/recovery";
import { createAuraPool } from "../character/foundation/aura/pool";
import type { AuraUpkeepCommitment } from "../character/foundation/aura/upkeep";
import { uncontainedCollapse } from "../character/foundation/aura/leakage";
import { restedWakefulness } from "../character/foundation/body/endurance";
import {
  advanceCharacterTime,
  characterTemporalState,
} from "../character/time";
import type { CharacterTimeActivity } from "../character/time";
import { gameTimeIntervalOf, hoursToDuration } from "../time/interval";
import type { Character } from "../character/types";
import type { NenState } from "../character/foundation/nen/types";
import { INSTINCTIVE_AWAKENING_MINIMUM_SPI } from "../character/foundation/nen/awakening/calculations";

import { auraContext, withTen } from "./fixtures/aura";
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

/* The Ability the instinctive awakening's forced Zetsu exempts. */
const ABILITY_A = { type: "ability", id: "ability-a" } as const;

const AWAKE: CharacterTimeActivity = { initial: { mode: "ordinary-waking" } };
const WORKING: CharacterTimeActivity = { initial: { mode: "ordinary-waking", activity: "moderate" } };


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

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value as object)) deepFreeze(inner);
  }

  return value;
}

function withMastery(base: NenState, mastery: Partial<Record<"ten" | "ren" | "zetsu", number>>): NenState {
  return { ...base, mastery: { ...base.mastery, ...mastery } as NenState["mastery"] };
}

const ORDINARY_NEN = withMastery(standardAwakenedNen(), { ten: 1, ren: 1, zetsu: 1 });

function forcedNen(): NenState {
  return withMastery(expectSuccess(awakenNenInstinctive(
    awakeningContext({
      attributes: { ...AWAKENING_CAPABLE, spi: INSTINCTIVE_AWAKENING_MINIMUM_SPI },
      operationId: "op-inst",
    }),
    {
      method: "instinctive",
      authorization: { grantedBy: GM, reason: "Cornered." },
      naturalAbilityId: "ability-a",
    },
  )).state, { zetsu: 3 });
}

function involuntaryNen(): NenState {
  return withMastery(expectSuccess(settleNenCollapse(
    awakeningContext({ nen: abruptAwakenedNen(), operationId: "op-collapse" }),
    { collapse: uncontainedCollapse(0) },
  )).state, { zetsu: 3 });
}

function subject(nen: NenState = ORDINARY_NEN, current = 10_000): Character {
  return createTestCharacter({
    id: "subject",
    attributes: STRONG,
    aura: { current, allocations: [] },
    wakefulness: { hoursAwake: 2 },
    nen,
  });
}

const R = deriveAuraRegeneration(subject().attributes);

function funded(requestId: string, amount = 0): AuraFundingOutcome {
  return {
    requestId,
    owner: "aura:subject",
    priority: 0,
    policy: { kind: "require-full" },
    requested: amount,
    authoritativeCost: amount,
    accessibleCapacity: amount,
    funded: amount,
    committed: amount,
    controlDelta: 0,
    unmet: 0,
    usefulAura: amount,
    status: "funded",
  };
}

/* Not carrying deliberate-access — and NOT authorized by that. */
const VOW: NenActivityDefinition = { id: "test-vow", relations: [] };

/* Explicitly authorized to function through suppression. */
const WARD: NenActivityDefinition = { id: "test-ward", relations: [], functionsThroughSuppression: true };

function activate(
  runtime: NenActivityRuntime,
  definition: NenActivityDefinition,
  id: string,
  overrides: Partial<NenActivationRequest> = {},
) {
  return activateNenActivity(
    runtime,
    {
      activityId: id,
      definitionId: definition.id,
      source: SELF,
      at: runtime.at,
      requested: { aura: 0 },
      priority: 0,
      funding: funded(`${id}:activation`),
      ...overrides,
    },
    new Map([[definition.id, definition]]),
  );
}

function withActivity(
  runtime: NenActivityRuntime,
  definition: NenActivityDefinition,
  id: string,
  overrides: Partial<NenActivationRequest> = {},
): NenActivityRuntime {
  return expectSuccess(activate(runtime, definition, id, overrides)).runtime;
}

function runtimeFor(at = T0): NenActivityRuntime {
  return emptyNenActivityRuntime("nen:subject", at);
}

function inZetsu(runtime: NenActivityRuntime = runtimeFor()): NenActivityRuntime {
  return expectSuccess(startZetsu(runtime, { activityId: "zetsu-1", source: SELF, at: runtime.at, nen: ORDINARY_NEN })).runtime;
}

function advanceFor(
  character: Character,
  runtime: NenActivityRuntime | undefined,
  startedAt: number,
  durationMs: number,
  activity: CharacterTimeActivity = AWAKE,
  upkeep?: readonly AuraUpkeepCommitment[],
) {
  return advanceCharacterTime({
    character,
    temporalState: characterTemporalState(startedAt),
    interval: gameTimeIntervalOf(startedAt, durationMs),
    activity,
    ...(runtime === undefined && upkeep === undefined
      ? {}
      : {
        activeEffects: {
          ...(runtime === undefined ? {} : { nenActivities: runtime }),
          ...(upkeep === undefined ? {} : { upkeep }),
        },
      }),
  });
}

function advanced(...args: Parameters<typeof advanceFor>) {
  return expectSuccess(advanceFor(...args));
}


/* ── Suppression authorization ──────────────────────────────────────────── */

describe("only explicit authorization functions through suppression", () => {
  it("ends an activity without deliberate-access when it lacks authorization", () => {
    const transition = expectSuccess(startZetsu(withActivity(runtimeFor(), VOW, "vow-1"), {
      activityId: "zetsu-1", source: SELF, at: T0, nen: ORDINARY_NEN,
    }));

    expect(findNenActivity(transition.runtime, "vow-1")!.stop)
      .toMatchObject({ cause: "replaced", at: T0, resume: null });
  });

  it("keeps an explicitly authorized activity running through Zetsu's start", () => {
    const running = inZetsu(withActivity(runtimeFor(), WARD, "ward-1"));

    expect(findNenActivity(running, "ward-1")!).toMatchObject({ condition: "active", functionsThroughSuppression: true });
  });

  it("lets the same authored activity run through forced suppression when its instance exempts it, and ends the unauthorized one", () => {
    const runtime = withActivity(withActivity(runtimeFor(), WARD, "ward-1", { source: ABILITY_A }), VOW, "vow-1");
    const hour = advanced(subject(forcedNen()), runtime, T0, HOUR);

    expect(findNenActivity(hour.nenActivities!.runtime, "ward-1")!.condition).toBe("active");
    expect(findNenActivity(hour.nenActivities!.runtime, "vow-1")!.stop).toMatchObject({ cause: "suppressed", at: T0 });
  });

  it("lets nothing function through involuntary Zetsu", () => {
    const hour = advanced(subject(involuntaryNen()), withActivity(runtimeFor(), WARD, "ward-1"), T0, HOUR);

    expect(findNenActivity(hour.nenActivities!.runtime, "ward-1")!.stop).toMatchObject({ cause: "suppressed", at: T0, resume: null });
    expect(hour.aura.balance.recoveryBySource.map((one) => one.context)).toEqual([NEN_INVOLUNTARY_SUPPRESSION_SOURCE]);
  });

  it("refuses a caller manufacturing suppression plus active Nen without authorization, immutably", () => {
    const character = subject();
    const context = auraContext({ attributes: STRONG, access: withTen(1) });
    const base = deepFreeze({
      state: character.aura,
      wakefulness: restedWakefulness(),
      context,
      interval: gameTimeIntervalOf(T0, HOUR),
    });

    /* Both booleans on the activity: never authorized. */
    expect(codes(advanceAuraTime({
      ...base,
      activity: { mode: "ordinary-waking", activeNenUse: true, suppression: { source: "x", forced: false, exemptions: "authorized" } },
    }))).toContain("aura.activity.suppression.active_nen.contradictory");

    /* A commitment that does not claim the authorization. */
    expect(codes(advanceAuraTime({
      ...base,
      activity: { mode: "ordinary-waking", suppression: { source: "x", forced: false, exemptions: "authorized" } },
      activeNen: { ids: ["vow-1"], functionsThroughSuppression: false },
    }))).toEqual(["aura.activity.suppression.active_nen.contradictory"]);

    /* The authorization under a suppression permitting nothing. */
    expect(codes(advanceAuraTime({
      ...base,
      activity: { mode: "ordinary-waking", suppression: { source: "x", forced: true } },
      activeNen: { ids: ["ward-1"], functionsThroughSuppression: true },
    }))).toEqual(["aura.activity.suppression.active_nen.contradictory"]);

    /* And the recovery context on its own. */
    const pool = createAuraPool(10_000, 50_000);

    expect(codes(recoverAura(pool, STRONG as never, {
      mode: "ordinary-waking",
      accessClass: "suppressed",
      activeNenUse: true,
      activeNenThroughSuppression: true,
      suppression: { source: "x", forced: true, exemptions: "none" },
    }, 1))).toContain("aura.recovery.suppression.exemption.refused");

    expect(codes(recoverAura(pool, STRONG as never, {
      mode: "ordinary-waking",
      accessClass: "suppressed",
      activeNenUse: true,
      suppression: { source: "x", forced: false, exemptions: "authorized" },
    }, 1))).toContain("aura.recovery.suppression.active_nen.contradictory");

    expect(character.aura.current).toBe(10_000);
  });

  it("restarts nothing Zetsu replaced when it ends", () => {
    const running = inZetsu(withActivity(runtimeFor(), VOW, "vow-1"));
    const left = expectSuccess(stopZetsu(running, { activityId: "zetsu-1", at: T0 + MINUTE, by: SELF })).runtime;

    expect(findNenActivity(left, "vow-1")!.condition).toBe("ended");
    expect(advanced(subject(), left, T0 + MINUTE, HOUR).aura.segments.every((one) => one.recoveryRatePerHour === 2 * R)).toBe(true);
  });

  it("refuses a definition claiming authorization while requiring deliberate access", () => {
    expect(findNenActivityDefinitionIssues({ ...WARD, constraints: [{ kind: "deliberate-access" }] }).map((one) => one.code))
      .toEqual(["nen.activity.suppression_declaration.contradictory"]);
    expect(codes(activate(runtimeFor(), WARD, "ward-1", { constraints: [{ kind: "deliberate-access" }] })))
      .toEqual(["nen.activity.suppression_declaration.contradictory"]);
  });
});


/* ── Recovery ───────────────────────────────────────────────────────────── */

describe("authorized active Nen under suppression recovers nothing", () => {
  const underZetsu = () => inZetsu(withActivity(runtimeFor(), WARD, "ward-1"));

  it("is stationary: zero recovery, zero leakage, zero net", () => {
    const hour = advanced(subject(), underZetsu(), T0, HOUR);

    expect([hour.aura.balance.recovery, hour.aura.balance.leakage, hour.aura.balance.physical, hour.aura.balance.net])
      .toEqual([0, 0, 0, 0]);
    expect(hour.aura.segments.map((one) => [one.recoveryRatePerHour, one.leakageRatePerHour, one.accessState]))
      .toEqual([[0, 0, "override"]]);
  });

  it("is physical: zero recovery, zero leakage, 2R consumption, -2R net", () => {
    const hour = advanced(subject(), underZetsu(), T0, HOUR, WORKING);

    expect(hour.aura.balance.recovery).toBe(0);
    expect(hour.aura.balance.leakage).toBe(0);
    expect(hour.aura.balance.physical).toBeCloseTo(2 * R, 6);
    expect(hour.aura.balance.net).toBeCloseTo(-2 * R, 6);
  });

  it("adds explicit authorized upkeep once, and shuts unauthorized upkeep down", () => {
    const upkeep: readonly AuraUpkeepCommitment[] = [
      { id: "ward-upkeep", source: "test-ward", baseRate: 600, period: "hour", functionsThroughSuppression: true, provenance: { kind: "standalone", source: { type: "ability", id: "ability-a" } } },
      { id: "plain-upkeep", source: "test-plain", baseRate: 600, period: "hour" },
    ];
    const hour = advanced(subject(), underZetsu(), T0, HOUR, WORKING, upkeep);

    expect(hour.aura.upkeepCharges.map((one) => one.id)).toEqual(["ward-upkeep"]);
    expect(hour.aura.upkeepShutdowns.map((one) => [one.id, one.reason, one.at])).toEqual([["plain-upkeep", "access-lost", T0]]);
    expect(hour.aura.balance.upkeep).toBeGreaterThan(0);
    expect(hour.aura.balance.net).toBeCloseTo(-(2 * R) - hour.aura.balance.upkeep, 6);
    expect(hour.aura.balance.recovery).toBe(0);
  });

  it("wins over forced suppression's 3R too", () => {
    const hour = advanced(subject(forcedNen()), withActivity(runtimeFor(), WARD, "ward-1", { source: ABILITY_A }), T0, HOUR);

    expect([hour.aura.balance.recovery, hour.aura.balance.leakage]).toEqual([0, 0]);
  });

  it("leaves forced suppression with no authorized activity at 3R", () => {
    const hour = advanced(subject(forcedNen()), runtimeFor(), T0, HOUR);

    expect(hour.aura.balance.recovery).toBeCloseTo(3 * R, 6);
    expect(hour.aura.balance.recoveryBySource.map((one) => one.context)).toEqual([NEN_FORCED_SUPPRESSION_SOURCE]);
  });

  it("leaves ordinary Zetsu with no exceptional activity on its activity table", () => {
    const rows = [
      [AWAKE, 3],
      [WORKING, 1],
      [{ initial: { mode: "intentional-rest" } }, 4],
      [{ initial: { mode: "sleep" } }, 4],
    ] as const;

    for (const [activity, coefficient] of rows) {
      expect(advanced(subject(), inZetsu(), T0, HOUR, activity).aura.balance.recovery).toBeCloseTo(coefficient * R, 6);
    }
  });

  /* Ward lasts 30 minutes; its composite has no end of its own and goes with it. */
  const timed = (base: NenActivityRuntime = runtimeFor()) => {
    const ward = withActivity(base, WARD, "ward-1", { source: ABILITY_A, requested: { aura: 0, clocks: [{ id: "output", load: 1, fullLoadDurationSeconds: 1800 }] } });

    return withActivity(ward, WARD, "ward-composite", {
      source: ABILITY_A,
      constraints: [{ kind: "component", activityId: "ward-1" }],
    });
  };

  it("restores Zetsu's recovery at the exact instant the authorized activity expires", () => {
    const hour = advanced(subject(), inZetsu(timed()), T0, HOUR);

    expect(hour.aura.segments.map((one) => [one.startedAt, one.recoveryRatePerHour]))
      .toEqual([[T0, 0], [T0 + 30 * MINUTE, 3 * R]]);
    expect(findNenActivity(hour.nenActivities!.runtime, "ward-1")!.stop).toMatchObject({ cause: "expired", at: T0 + 30 * MINUTE });
    expect(findNenActivity(hour.nenActivities!.runtime, "ward-composite")!.stop).toMatchObject({ cause: "collapsed", at: T0 + 30 * MINUTE });
    expect(hour.character.aura.current).toBeCloseTo(10_000 + 1.5 * R, 6);
  });

  it("restores forced recovery at the exact instant too", () => {
    const hour = advanced(subject(forcedNen()), timed(), T0, HOUR);

    expect(hour.aura.segments.map((one) => [one.startedAt, one.recoveryRatePerHour]))
      .toEqual([[T0, 0], [T0 + 30 * MINUTE, 3 * R]]);
  });

  it("agrees with the same span advanced in slices", () => {
    const character = subject(ORDINARY_NEN, 2000);
    const whole = advanced(character, inZetsu(timed()), T0, HOUR, WORKING);

    let current = character;
    let runtime = inZetsu(timed());
    let fatigue = whole.aura.previousFatigue;
    const events: unknown[] = [];
    const nenEvents: unknown[] = [];

    /* 10 minutes, then 7-minute slices: the 30-minute expiry falls inside one. */
    for (let at = T0, length = 10 * MINUTE; at < T0 + HOUR; at += length, length = Math.min(7 * MINUTE, T0 + HOUR - at)) {
      const step = advanced(current, runtime, at, length, WORKING);

      current = step.character;
      runtime = step.nenActivities!.runtime;
      fatigue = step.fatigue;
      events.push(...step.aura.events.filter((one) => one.kind !== "interval-end" && one.kind !== "activity-changed"));
      nenEvents.push(...step.nenActivities!.events);
    }

    expect(current.aura.current).toBeCloseTo(whole.character.aura.current, 6);
    expect(current.wakefulness).toEqual(whole.character.wakefulness);
    expect(fatigue).toEqual(whole.fatigue);
    expect(runtime).toEqual(whole.nenActivities!.runtime);
    expect(events).toEqual(whole.aura.events.filter((one) => one.kind !== "interval-end" && one.kind !== "activity-changed"));
    expect(nenEvents).toEqual(whole.nenActivities!.events);
  });

  it("stops authorized activities at a collapse's exact instant, and recovers forced 3R after it", () => {
    /* An abrupt awakener leaks uncontained; active Nen stops recovery, so they empty. */
    const character = subject(abruptAwakenedNen(), 500);
    const hour = advanced(character, withActivity(runtimeFor(), WARD, "ward-1"), T0, HOUR);
    const collapse = hour.aura.collapse!;

    expect(collapse).not.toBeNull();
    expect(findNenActivity(hour.nenActivities!.runtime, "ward-1")!.stop).toMatchObject({ cause: "suppressed", at: collapse.at });

    const after = hour.aura.segments.filter((one) => one.startedAt >= collapse.at);

    expect(after.length).toBeGreaterThan(0);
    expect(after.every((one) => one.recoveryRatePerHour === 3 * R)).toBe(true);
    expect(hour.aura.segments.filter((one) => one.endedAt <= collapse.at).every((one) => one.recoveryRatePerHour === 0)).toBe(true);
  });
});


/* ── Stored suppression ─────────────────────────────────────────────────── */

describe("stored suppression drives recovery on its own", () => {
  it("gives stored forced suppression forced recovery with no activity literal and no runtime", () => {
    const hour = advanced(subject(forcedNen()), undefined, T0, HOUR, { initial: { mode: "intentional-rest" } });

    expect(hour.aura.balance.recovery).toBeCloseTo(3 * R, 6);
    expect(hour.aura.balance.leakage).toBe(0);
    expect(hour.aura.segments.every((one) => one.accessState === "override")).toBe(true);
    expect(hour.aura.balance.recoveryBySource.map((one) => one.context)).toEqual([NEN_FORCED_SUPPRESSION_SOURCE]);
  });

  it("does the same for stored involuntary suppression, with no exemption", () => {
    const hour = advanced(subject(involuntaryNen()), undefined, T0, HOUR, WORKING);

    expect(hour.aura.balance.recovery).toBeCloseTo(3 * R, 6);
    expect(hour.aura.balance.recoveryBySource.map((one) => one.context)).toEqual([NEN_INVOLUNTARY_SUPPRESSION_SOURCE]);
    expect(nenStoredSuppression(involuntaryNen())).toEqual({ source: NEN_INVOLUNTARY_SUPPRESSION_SOURCE, forced: true, exemptions: "none" });
  });

  it("keeps stored provenance distinct from learned Zetsu, with no concealment", () => {
    const sources = new Set([NEN_FORCED_SUPPRESSION_SOURCE, NEN_INVOLUNTARY_SUPPRESSION_SOURCE, ZETSU_SUPPRESSION_SOURCE]);

    expect(sources.size).toBe(3);
    expect(nenStoredSuppression(forcedNen())).toEqual({ source: NEN_FORCED_SUPPRESSION_SOURCE, forced: true, exemptions: "authorized" });
    expect(nenStoredSuppression(ORDINARY_NEN)).toBeNull();
    expect(Object.keys(nenStoredSuppression(forcedNen())!).sort()).toEqual(["exemptions", "forced", "source"]);

    for (const nen of [forcedNen(), involuntaryNen()]) {
      expect(expectSuccess(resolveZetsuAuraConcealment(runtimeFor(), nen))).toEqual({ available: false, modifier: 0 });
    }
  });

  it("refuses manual state that duplicates or contradicts the derived suppression", () => {
    const cases: readonly CharacterTimeActivity[] = [
      { initial: { mode: "ordinary-waking", suppression: { source: NEN_FORCED_SUPPRESSION_SOURCE, forced: true, exemptions: "authorized" } } },
      { initial: { mode: "ordinary-waking", suppression: { source: "zetsu", forced: false } } },
      { initial: { mode: "ordinary-waking" }, changes: [{ at: T0 + MINUTE, activity: { mode: "sleep", suppression: { source: "x", forced: true } } }] },
    ];

    for (const nen of [forcedNen(), involuntaryNen()]) {
      const character = deepFreeze(subject(nen));

      for (const activity of cases) {
        expect(codes(advanceFor(character, undefined, T0, HOUR, activity))).toEqual(["character.time.suppression.contradictory"]);
      }
    }
  });
});


/* ── Composite replacement ──────────────────────────────────────────────── */

describe("replacement collapses composites exactly as a stop does", () => {
  const PART_A: NenActivityDefinition = { id: "part-a", relations: [] };
  const PART_B: NenActivityDefinition = { id: "part-b", relations: [] };
  const PLAIN: NenActivityDefinition = { id: "plain", relations: [] };

  /* A and B, composite C of both, D built on C, and an unrelated E. */
  const assembled = (): NenActivityRuntime => {
    let runtime = runtimeFor(0);
    runtime = withActivity(runtime, PART_A, "a", { funding: funded("a", 10) });
    runtime = withActivity(runtime, PART_B, "b", { funding: funded("b", 20) });
    runtime = withActivity(runtime, PLAIN, "c", {
      funding: funded("c", 30),
      constraints: [{ kind: "component", activityId: "a" }, { kind: "component", activityId: "b" }],
    });
    runtime = withActivity(runtime, PLAIN, "d", { funding: funded("d", 40), constraints: [{ kind: "component", activityId: "c" }] });
    runtime = withActivity(runtime, PLAIN, "e", { funding: funded("e", 50) });

    return deepFreeze(runtime);
  };

  const replacer = (...others: string[]): NenActivityDefinition => ({
    id: "replacer",
    relations: others.map((other) => ({ relation: "replaces" as const, other })),
  });

  const replace = (runtime: NenActivityRuntime, ...others: string[]) =>
    activate(runtime, replacer(...others), "new", { at: 5 });

  it("ends a direct composite, and a transitive one, at the replacement instant", () => {
    const transition = expectSuccess(replace(assembled(), "part-a"));
    const stop = (id: string) => findNenActivity(transition.runtime, id)!;

    expect(["a", "c", "d"].map((id) => [id, stop(id).stop?.cause, stop(id).endedAt, stop(id).funding.committed]))
      .toEqual([["a", "replaced", 5, 0], ["c", "collapsed", 5, 0], ["d", "collapsed", 5, 0]]);
    expect(["b", "e"].map((id) => [id, stop(id).condition, stop(id).funding.committed]))
      .toEqual([["b", "active", 20], ["e", "active", 50]]);
    expect(transition.events.map((one) => [one.kind, one.activityId]))
      .toEqual([["nen-activity-stopped", "a"], ["nen-activity-stopped", "c"], ["nen-activity-stopped", "d"], ["nen-activity-started", "new"]]);
  });

  it("stops a composite once when two of its components are replaced, releasing each commitment once", () => {
    const before = assembled();
    const transition = expectSuccess(replace(before, "part-a", "part-b"));

    expect(transition.consequences.map((one) => [one.id, one.stop?.cause]))
      .toEqual([["a", "replaced"], ["b", "replaced"], ["c", "collapsed"], ["d", "collapsed"]]);
    expect(transition.events.filter((one) => one.activityId === "c")).toHaveLength(1);
    expect(committedNenOutput(before)).toBe(150);
    expect(committedNenOutput(transition.runtime)).toBe(50);
  });

  it("changes nothing when the replacement is refused", () => {
    const before = assembled();
    const snapshot = JSON.stringify(before);

    expect(activate(before, replacer("part-a"), "new", { at: 5, funding: { ...funded("new"), owner: "aura:somebody-else" } }).success).toBe(false);
    expect(activate(before, replacer("part-a"), "new", { at: -1 }).success).toBe(false);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("matches an ordinary stop's composite consequences exactly", () => {
    const replaced = expectSuccess(replace(assembled(), "part-a"));
    const stopped = expectSuccess(stopNenActivity(assembled(), { activityId: "a", cause: "interrupted", at: 5, by: SELF }));

    const shape = (list: readonly { id: string; stop: { cause: string; at: number } | null; endedAt: number | null }[]) =>
      list.filter((one) => one.id !== "a").map((one) => [one.id, one.stop?.cause, one.stop?.at, one.endedAt]);

    expect(shape(replaced.consequences)).toEqual(shape(stopped.consequences));
    expect(shape(stopped.consequences)).toEqual([["c", "collapsed", 5, 5], ["d", "collapsed", 5, 5]]);
  });

  it("dates an advance's composite collapse at the component's own expiry", () => {
    let runtime = runtimeFor(0);
    runtime = withActivity(runtime, PART_A, "a", { requested: { aura: 0, clocks: [{ id: "output", load: 1, fullLoadDurationSeconds: 10 }] } });
    runtime = withActivity(runtime, PLAIN, "c", { constraints: [{ kind: "component", activityId: "a" }] });

    const advancedRuntime = expectSuccess(advanceNenActivities(runtime, { to: 60_000, by: SELF })).runtime;

    expect(findNenActivity(advancedRuntime, "c")!.stop).toMatchObject({ cause: "collapsed", at: 10_000 });
  });
});
