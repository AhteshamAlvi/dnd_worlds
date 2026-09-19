/*
 * Ken: the same Output Ren opens, held instead of poured out.
 *
 *   Cken        = P * kenContainmentFraction        10% at I .. 100% at X
 *   Oren        = P * renAccessFraction
 *   OkenMax     = min(Cken, Oren, budget, Aura)     a MINIMUM, never a max
 *   outputLoad      = Oactive / Oren                spends Ren's clock
 *   containmentLoad = Oactive / Cken                spends Ken's own
 *   leakage     = 0, at every rank, with no upkeep and no outward flow
 *
 * The three things this suite exists to defend:
 *
 *   TWO MASTERIES DO NOT CAP EACH OTHER. Ken III with Ren II is Ken III with
 *   a small budget, not Ken II. That distinction is the progression edge KGS-1
 *   removed, and the arithmetic here is what makes it observable: containment
 *   CAPACITY and Output ACCESS are different quantities that happen to be
 *   compared with `min`.
 *
 *   BOTH CLOCKS ARE REAL. A single duration can express one reason to run out,
 *   and Ken has two that bind under different circumstances.
 *
 *   KEN I IS TEN. The same 10% of Physiological Output over the same body is
 *   the same coating at the same density. Ken buys the ability to hold nine
 *   more tenths of it, not a better tenth.
 *
 * Working numbers, standard human at CON 20 / VIT 20 / DEX 22:
 *
 *   P 10,000   R 2,500   Maximum Aura 50,000   surface 16,900 cm2
 */

import { describe, expect, it } from "vitest";

import {
  deriveKenContainmentCapacity,
  deriveKenContainmentFraction,
  deriveKenCoatingDensity,
  deriveKenFullContainmentDurationSeconds,
  KEN_MASTERY_PROFILES,
  reduceKenSelectionTo,
  resolveKenOutputCeiling,
  resolveKenSelection,
} from "../character/foundation/nen/principles/ken";
import { tenSurfaceCoating } from "../character/foundation/nen/principles/ten";
import {
  activeKenActivity,
  adjustKen,
  kenShortfallOutput,
  kenStopCauseFor,
  startKen,
  withKenAccess,
  type StartKenRequest,
} from "../character/nen/ken";
import { startRen } from "../character/nen/ren";
import {
  emptyNenActivityRuntime,
  findNenActivity,
  nenActivityExpiry,
  type NenActivityRuntime,
} from "../character/foundation/nen/runtime";
import { advanceNenActivities } from "../character/nen/runtime";
import {
  advanceCharacterTime,
  characterTemporalState,
} from "../character/time";
import type { CharacterTimeActivity } from "../character/time";
import { gameTimeIntervalOf } from "../time/interval";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import type { Character } from "../character/types";
import type { NenState } from "../character/foundation/nen/types";

import { auraTestMeasurements } from "./fixtures/aura";
import { createTestCharacter } from "./fixtures/character";
import { standardAwakenedNen } from "./fixtures/nen";


const STRONG = { con: 20, vit: 20, dex: 22 } as const;
const P = 10_000;
const T0 = 1_000_000_000;
const SECOND = 1000;
const MINUTE = 60_000;
const SELF = { type: "character", id: "subject" } as const;

const AWAKE: CharacterTimeActivity = { initial: { mode: "ordinary-waking" } };

const MEASUREMENTS = auraTestMeasurements();


function nenWith(
  mastery: Partial<Record<string, number>>,
  extra: Partial<NenState> = {},
): NenState {
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
  ken?: number;
  gyo?: number;
  shu?: number;
  current?: number;
  seals?: NenState["seals"];
} = {}): Character {
  const seals = options.seals;

  return createTestCharacter({
    id: "subject",
    attributes: STRONG,
    aura: { current: options.current ?? 40_000, allocations: [] },
    wakefulness: { hoursAwake: 2 },
    nen: nenWith(
      {
        ten: options.ten ?? 5,
        ren: options.ren ?? 5,
        ken: options.ken ?? 5,
        ...(options.gyo === undefined ? {} : { gyo: options.gyo }),
        ...(options.shu === undefined ? {} : { shu: options.shu }),
      },
      seals === undefined ? {} : { seals },
    ),
  });
}


function runtimeFor(character: Character, at = T0): NenActivityRuntime {
  return emptyNenActivityRuntime(`nen:${character.id}`, at);
}


function request(
  character: Character,
  selectedOutput: number,
  overrides: Partial<StartKenRequest> = {},
): StartKenRequest {
  return {
    activityId: "ken-1",
    source: SELF,
    selectedOutput,
    at: T0,
    nen: character.nen,
    attributes: character.attributes,
    currentAura: character.aura.current,
    ...overrides,
  };
}


function started(
  character: Character,
  selectedOutput: number,
  at = T0,
): NenActivityRuntime {
  const result = startKen(
    runtimeFor(character, at),
    request(character, selectedOutput, { at }),
  );

  if (!result.success) {
    throw new Error(
      "Expected Ken to start: " +
        result.errors.map((error) => error.code).join(", "),
    );
  }

  return result.payload.runtime;
}


/** The three flat facts the adapter reads, from a whole Character. */
function facts(character: Character, currentAura?: number) {
  return {
    nen: character.nen,
    attributes: character.attributes,
    currentAura: currentAura ?? character.aura.current,
  };
}


function codes(
  result: { success: boolean; errors?: readonly { code: string }[] },
): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((one) => one.code);
}


/* ── The pure table ─────────────────────────────────────────────────────── */

describe("Ken's Mastery table", () => {
  it("keeps every containment fraction and full-containment duration", () => {
    expect(Object.values(KEN_MASTERY_PROFILES).map((one) => [
      one.rank,
      one.containmentFraction,
      one.fullContainmentDurationSeconds,
    ])).toEqual([
      [1, 0.1, 30],
      [2, 0.2, 60],
      [3, 0.3, 150],
      [4, 0.4, 300],
      [5, 0.5, 600],
      [6, 0.6, 900],
      [7, 0.7, 1800],
      [8, 0.8, 3600],
      [9, 0.9, 7200],
      [10, 1, null],
    ]);
  });

  it("derives the capacity as a share of Physiological Output", () => {
    for (const rank of [1, 5, 10] as const) {
      expect([rank, deriveKenContainmentCapacity(P, rank)])
        .toEqual([rank, P * deriveKenContainmentFraction(rank)]);
    }
  });

  it("has no physiological containment limit at Mastery X alone", () => {
    expect(deriveKenFullContainmentDurationSeconds(10)).toBeNull();
    expect(deriveKenFullContainmentDurationSeconds(9)).toBe(7200);
  });
});


/* ── min, in every direction ────────────────────────────────────────────── */

describe("the ceiling is the SMALLEST of four things", () => {
  const ceiling = (input: {
    ken: number;
    ren: number;
    budget?: number;
    aura?: number;
  }) =>
    resolveKenOutputCeiling({
      physiologicalOutput: P,
      kenMastery: input.ken,
      renMastery: input.ren,
      sharedOutputRemaining: input.budget ?? P,
      availableAura: input.aura ?? P,
    });

  it("is bound by containment when Ken is the lower of the two", () => {
    const resolved = ceiling({ ken: 3, ren: 8 });

    expect(resolved.success && resolved.payload.ceiling).toBe(3000);
    expect(resolved.success && resolved.payload.limitedBy).toBe("containment");
  });

  it("is bound by Ren access when Ren is the lower of the two", () => {
    const resolved = ceiling({ ken: 8, ren: 2 });

    expect(resolved.success && resolved.payload.ceiling).toBe(2000);
    expect(resolved.success && resolved.payload.limitedBy).toBe("ren-access");
  });

  it("is bound by the shared Output budget when that is smallest", () => {
    const resolved = ceiling({ ken: 8, ren: 8, budget: 1500 });

    expect(resolved.success && resolved.payload.ceiling).toBe(1500);
    expect(resolved.success && resolved.payload.limitedBy).toBe("shared-output");
  });

  it("is bound by available Aura when that is smallest", () => {
    const resolved = ceiling({ ken: 8, ren: 8, aura: 900 });

    expect(resolved.success && resolved.payload.ceiling).toBe(900);
    expect(resolved.success && resolved.payload.limitedBy).toBe("aura");
  });

  /*
   * The mutation this is aimed at. `max` produces a LARGER answer in every
   * asymmetric case, so any test that only ever used equal inputs would pass
   * under both.
   */
  it("is never the largest of them", () => {
    const resolved = ceiling({ ken: 3, ren: 8, budget: 9000, aura: 7000 });

    expect(resolved.success && resolved.payload.ceiling).toBe(3000);
    expect(resolved.success && resolved.payload.ceiling).not.toBe(8000);
    expect(resolved.success && resolved.payload.ceiling).not.toBe(9000);
  });

  it("reports every input it was given, so a trace can show the losers", () => {
    const resolved = ceiling({ ken: 3, ren: 8, budget: 9000, aura: 7000 });

    expect(resolved.success && {
      containment: resolved.payload.containmentCapacity,
      renAccess: resolved.payload.renAccess,
      budget: resolved.payload.sharedOutputRemaining,
      aura: resolved.payload.availableAura,
    }).toEqual({
      containment: 3000,
      renAccess: 8000,
      budget: 9000,
      aura: 7000,
    });
  });
});


describe("Ken and Ren limit each other's OUTPUT and not each other's RANK", () => {
  it("lets Ken III with Ren II hold Ken III's capacity, limited by Ren II", () => {
    const character = subject({ ten: 5, ren: 2, ken: 3 });
    const resolved = resolveKenSelection({
      physiologicalOutput: P,
      kenMastery: 3,
      renMastery: 2,
      sharedOutputRemaining: P,
      availableAura: P,
      requestedOutput: 2000,
    });

    expect(resolved.success && resolved.payload.ceiling.containmentCapacity)
      .toBe(3000);
    expect(resolved.success && resolved.payload.ceiling.ceiling).toBe(2000);

    /* And the containment clock is Ken III's, not Ken II's. */
    expect(resolved.success && resolved.payload.containmentDurationSeconds)
      .toBe(150);

    expect(kenStopCauseFor(character.nen)).toBeNull();
  });

  it("lets Ken II with Ren III be limited by containment instead", () => {
    const resolved = resolveKenSelection({
      physiologicalOutput: P,
      kenMastery: 2,
      renMastery: 3,
      sharedOutputRemaining: P,
      availableAura: P,
      requestedOutput: 2000,
    });

    expect(resolved.success && resolved.payload.ceiling.ceiling).toBe(2000);
    expect(resolved.success && resolved.payload.ceiling.limitedBy)
      .toBe("containment");
    expect(resolved.success && resolved.payload.outputDurationSeconds)
      .toBe(5 * MINUTE / 1000);
  });
});


/* ── Selection ──────────────────────────────────────────────────────────── */

describe("selection is funded in full or refused", () => {
  it("refuses an Output above the ceiling rather than scaling it", () => {
    const character = subject({ ten: 5, ren: 2, ken: 3 });
    const result = startKen(runtimeFor(character), request(character, 2001));

    expect(codes(result)).toContain("nen.ken.ceiling.exceeded");
  });

  it("refuses a zero or negative Output", () => {
    const character = subject();

    expect(codes(startKen(runtimeFor(character), request(character, 0))))
      .toContain("nen.ken.requested_output.invalid");
    expect(codes(startKen(runtimeFor(character), request(character, -1))))
      .toContain("nen.ken.requested_output.invalid");
  });

  it("refuses an Output the reserve cannot cover", () => {
    const character = subject({ ten: 8, ren: 8, ken: 8, current: 1000 });
    const result = startKen(runtimeFor(character), request(character, 2000));

    expect(codes(result)).toContain("nen.ken.ceiling.exceeded");
  });

  it("stores the absolute Output, not a percentage", () => {
    const activity = activeKenActivity(started(subject(), 1234))!;

    expect(activity.requested.aura).toBe(1234);
    expect(activity.funding.committed).toBe(1234);
  });

  it("refuses a second Ken", () => {
    const character = subject();
    const running = started(character, 1000);

    expect(codes(startKen(running, request(character, 500, { activityId: "ken-2" }))))
      .toContain("nen.ken.already_active");
  });
});


describe("a later loss reduces Ken to the greatest amount that still fits", () => {
  it("keeps the Output when nothing changed", () => {
    const character = subject();

    expect(kenShortfallOutput(started(character, 2000), facts(character))).toBe(2000);
  });

  it("reduces to the ceiling when the reserve falls", () => {
    const character = subject();
    const running = started(character, 2000);

    expect(kenShortfallOutput(running, facts(character, 800))).toBe(800);
  });

  it("ends Ken when a prerequisite is sealed away entirely", () => {
    const character = subject();
    const running = started(character, 2000);
    const sealed = subject({ seals: { ren: 0 } });

    expect(kenShortfallOutput(running, facts(sealed))).toBe(0);
  });

  it("reduces rather than refusing, through the pure helper", () => {
    const ceiling = resolveKenOutputCeiling({
      physiologicalOutput: P,
      kenMastery: 5,
      renMastery: 5,
      sharedOutputRemaining: P,
      availableAura: 1200,
    });

    expect(ceiling.success && reduceKenSelectionTo(ceiling.payload, 5000))
      .toBe(1200);
    expect(ceiling.success && reduceKenSelectionTo(ceiling.payload, 900))
      .toBe(900);
  });
});


/* ── Two clocks ─────────────────────────────────────────────────────────── */

describe("Ken runs on two independent clocks", () => {
  it("declares an output clock from Ren and a containment clock from Ken", () => {
    const character = subject({ ten: 5, ren: 5, ken: 5 });
    const activity = activeKenActivity(started(character, 2500))!;

    expect(activity.requested.clocks).toEqual([
      { id: "output", load: 0.5, fullLoadDurationSeconds: 20 * 60 },
      { id: "containment", load: 0.5, fullLoadDurationSeconds: 600 },
    ]);
  });

  it("ends at the EARLIEST of the two, and names which", () => {
    /* Ken V containment 600s at load 0.5 -> 1200s. Ren V output 1200s at 0.5 -> 2400s. */
    const activity = activeKenActivity(started(subject(), 2500))!;

    expect(nenActivityExpiry(activity))
      .toEqual({ at: T0 + 1200 * SECOND, clockId: "containment" });
  });

  it("lets the OTHER clock bind when the ranks are the other way round", () => {
    /* Ken X: containment unlimited. Ren I: 60s at full load. */
    const character = subject({ ten: 5, ren: 1, ken: 10 });
    const activity = activeKenActivity(started(character, 1000))!;

    expect(nenActivityExpiry(activity))
      .toEqual({ at: T0 + 60 * SECOND, clockId: "output" });
  });

  it("runs until stopped when both clocks are unlimited", () => {
    const character = subject({ ten: 10, ren: 10, ken: 10 });
    const activity = activeKenActivity(started(character, 5000))!;

    expect(nenActivityExpiry(activity)).toBeNull();
  });

  it("extends each finite clock proportionally at a lower Output", () => {
    const full = activeKenActivity(started(subject(), 2500))!;
    const half = activeKenActivity(started(subject(), 1250))!;

    expect(nenActivityExpiry(full)!.at - T0).toBe(1200 * SECOND);
    expect(nenActivityExpiry(half)!.at - T0).toBe(2400 * SECOND);
  });

  it("preserves both clocks' progress across an adjustment", () => {
    const character = subject();
    const running = started(character, 2500);

    const advanced = advanceNenActivities(running, {
      to: T0 + 300 * SECOND,
      by: SELF,
    });

    const adjusted = advanced.success
      ? adjustKen(advanced.payload.runtime, {
        activityId: "ken-1",
        selectedOutput: 1250,
        at: T0 + 300 * SECOND,
        by: SELF,
        nen: character.nen,
        attributes: character.attributes,
        currentAura: character.aura.current,
      })
      : undefined;

    const activity = adjusted?.success
      ? findNenActivity(adjusted.payload.runtime, "ken-1")!
      : undefined;

    /* 300s at load 0.5 spent 150 on each clock, and neither was refunded. */
    expect(activity!.progress).toEqual([
      {
        clockId: "output",
        fullLoadEquivalentSeconds: 150,
        resolvedAt: T0 + 300 * SECOND,
      },
      {
        clockId: "containment",
        fullLoadEquivalentSeconds: 150,
        resolvedAt: T0 + 300 * SECOND,
      },
    ]);
  });
});


/* ── The Aura economy ───────────────────────────────────────────────────── */

describe("Ken is fully contained and costs nothing to hold", () => {
  it("declares no upkeep at any rank", () => {
    for (const rank of [1, 5, 10] as const) {
      const character = subject({ ten: rank, ren: rank, ken: rank });
      const activity = activeKenActivity(started(character, 100 * rank))!;

      expect([rank, activity.requested.upkeepPerRound])
        .toEqual([rank, undefined]);
    }
  });

  it("projects a contained access override with nothing escaping", () => {
    const character = subject();
    const running = started(character, 2500);

    const access = withKenAccess(
      { awakened: true, effectiveTenMastery: 5 },
      running,
      character.attributes,
    );

    expect(access.override).toEqual({
      kind: "explicit",
      source: "ken",
      accessFraction: 0.25,
      deliberateInternalAccess: false,
      deliberateExternalAccess: true,
      automaticSurfaceCoating: false,
      uncontained: false,
    });
  });

  it("leaves the access untouched when no Ken is running", () => {
    const character = subject();
    const input = { awakened: true, effectiveTenMastery: 5 } as const;

    expect(withKenAccess(input, runtimeFor(character), character.attributes))
      .toBe(input);
  });

  /*
   * The economy, end to end. Ren at the same Output drains the reserve at
   * Oactive per minute; Ken at the same Output drains none of it, and neither
   * of them recovers, because both are active Nen.
   */
  it("spends no reserve where Ren would have spent Oactive a minute", () => {
    const character = subject({ ten: 5, ren: 5, ken: 5, current: 40_000 });

    const withKen = advanceCharacterTime({
      character,
      temporalState: characterTemporalState(T0),
      interval: gameTimeIntervalOf(T0, 10 * MINUTE),
      activity: AWAKE,
      activeEffects: { nenActivities: started(character, 2500) },
    });

    const renRuntime = startRen(runtimeFor(character), {
      activityId: "ren-1",
      source: SELF,
      selectedOutput: 2500,
      at: T0,
      nen: character.nen,
      attributes: character.attributes,
      currentAura: character.aura.current,
    });

    const withRen = renRuntime.success
      ? advanceCharacterTime({
        character,
        temporalState: characterTemporalState(T0),
        interval: gameTimeIntervalOf(T0, 10 * MINUTE),
        activity: AWAKE,
        activeEffects: { nenActivities: renRuntime.payload.runtime },
      })
      : undefined;

    expect(withKen.success).toBe(true);
    expect(withRen?.success).toBe(true);

    const kenCurrent = withKen.success ? withKen.payload.character.aura.current : 0;
    const renCurrent = withRen?.success ? withRen.payload.character.aura.current : 0;

    /* Ren poured out 25,000 over ten minutes. Ken poured out nothing. */
    expect(renCurrent).toBeLessThan(kenCurrent);
    expect(kenCurrent).toBeCloseTo(40_000, 6);
  });

  it("recovers nothing while it runs, because it is deliberate active Nen", () => {
    const character = subject({ ten: 5, ren: 5, ken: 5, current: 10_000 });

    const advanced = advanceCharacterTime({
      character,
      temporalState: characterTemporalState(T0),
      interval: gameTimeIntervalOf(T0, 5 * MINUTE),
      activity: AWAKE,
      activeEffects: { nenActivities: started(character, 2500) },
    });

    expect(advanced.success && advanced.payload.character.aura.current)
      .toBeCloseTo(10_000, 6);
  });
});


/* ── Placement ──────────────────────────────────────────────────────────── */

describe("Ken places its Output uniformly, and Ken I is Ten", () => {
  const SURFACE_M2 = MEASUREMENTS.totalSurfaceAreaCm2 / 10_000;

  it("spreads Oactive over the whole eligible surface", () => {
    const density = deriveKenCoatingDensity(2500, SURFACE_M2);

    expect(density.success && density.payload).toBeCloseTo(2500 / SURFACE_M2, 9);
  });

  it("gives Ken I exactly the density Ten's coating gives", () => {
    const tenCoating = tenSurfaceCoating(1)!;
    const tenAura = P * tenCoating.outputFraction;

    const kenAura = P * deriveKenContainmentFraction(1);

    expect(kenAura).toBe(tenAura);

    const kenDensity = deriveKenCoatingDensity(kenAura, SURFACE_M2);

    expect(kenDensity.success && kenDensity.payload)
      .toBeCloseTo(tenAura / SURFACE_M2, 9);
  });

  it("refuses a non-positive surface rather than dividing by it", () => {
    expect(codes(deriveKenCoatingDensity(2500, 0)))
      .toContain("nen.ken.density.area.invalid");
    expect(codes(deriveKenCoatingDensity(2500, -1)))
      .toContain("nen.ken.density.area.invalid");
  });
});


/* ── Legality ───────────────────────────────────────────────────────────── */

describe("Ken needs Ten, Ren and Ken all usable", () => {
  it("runs when all three are learned and unsealed", () => {
    expect(kenStopCauseFor(subject().nen)).toBeNull();
  });

  it("is sealed away by any one of them falling to nothing", () => {
    for (const capability of ["ten", "ren", "ken"] as const) {
      expect([capability, kenStopCauseFor(subject({ seals: { [capability]: 0 } }).nen)])
        .toEqual([capability, "sealed"]);
    }
  });

  it("is NOT ended by a partial seal that leaves a usable rank", () => {
    expect(kenStopCauseFor(subject({ seals: { ren: 1 } }).nen)).toBeNull();
  });

  it("stops a running Ken at the interval's opening instant when sealed", () => {
    const character = subject();
    const running = started(character, 2500);
    const sealed = subject({ seals: { ren: 0 } });

    const advanced = advanceCharacterTime({
      character: sealed,
      temporalState: characterTemporalState(T0),
      interval: gameTimeIntervalOf(T0, MINUTE),
      activity: AWAKE,
      activeEffects: { nenActivities: running },
    });

    const activity = advanced.success
      ? findNenActivity(advanced.payload.nenActivities!.runtime, "ken-1")!
      : undefined;

    expect(activity!.condition).toBe("ended");
    expect(activity!.stop!.cause).toBe("sealed");
    expect(activity!.stop!.at).toBe(T0);
    expect(activity!.stop!.resume).toBeNull();
  });
});


describe("a refused Ken changes nothing", () => {
  it("leaves the runtime exactly as it was", () => {
    const character = subject({ ten: 5, ren: 2, ken: 3 });
    const before = runtimeFor(character);
    const snapshot = JSON.stringify(before);

    expect(startKen(before, request(character, 9999)).success).toBe(false);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("leaves a running Ken standing when an adjustment is refused", () => {
    const character = subject();
    const running = started(character, 2500);
    const snapshot = JSON.stringify(running);

    const refused = adjustKen(running, {
      activityId: "ken-1",
      selectedOutput: 99_999,
      at: T0 + SECOND,
      by: SELF,
      nen: character.nen,
      attributes: character.attributes,
      currentAura: character.aura.current,
    });

    expect(refused.success).toBe(false);
    expect(JSON.stringify(running)).toBe(snapshot);
    expect(activeKenActivity(running)!.funding.committed).toBe(2500);
  });
});
