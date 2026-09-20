/*
 * One whole advance must equal uneven slices of the same advance.
 *
 * This is the invariant every exact-time result in the engine rests on, and it
 * is the one a new mechanic is most likely to break — not by being wrong, but
 * by dating something at the END of an advance rather than at the instant the
 * condition actually became true. A stop dated at the caller's chosen
 * granularity is a stop that moves when the caller changes their mind about
 * how finely to step.
 *
 * Ken and Gyō give it two new ways to fail at once, because they carry two
 * clocks with different loads — so an implementation that settled progress at
 * every step, or that matched progress positionally, would accumulate a
 * difference that a single advance never sees.
 *
 * Six things have to agree, and they are the six the ticket names:
 *
 *   Current Aura                the reserve after the interval
 *   allocations and density     what is on the body
 *   condition and progress      the activity itself, clock by clock
 *   stop timestamp and cause    including WHICH clock ran out
 *   Item factors and focus      the boundary, after any loss
 *   emitted events              the same list, in the same order
 */

import { describe, expect, it } from "vitest";

import { startKen } from "../character/nen/ken";
import { startGyo } from "../character/nen/gyo";
import { startShu } from "../character/nen/shu";
import {
  emptyNenActivityRuntime,
  findNenActivity,
  type NenActivityRuntime,
} from "../character/foundation/nen/runtime";
import { SHU_BODY_NODE } from "../character/foundation/nen/principles/shu";
import { GYO_BODY_SITE_PREFIX } from "../character/foundation/nen/principles/gyo";
import {
  advanceCharacterTime,
  characterTemporalState,
} from "../character/time";
import type { CharacterTimeActivity } from "../character/time";
import { gameTimeIntervalOf } from "../time/interval";
import type { Character } from "../character/types";
import type { NenState } from "../character/foundation/nen/types";

import { createTestCharacter } from "./fixtures/character";
import { standardAwakenedNen } from "./fixtures/nen";


const STRONG = { con: 20, vit: 20, dex: 22 } as const;
const T0 = 1_000_000_000;
const SECOND = 1000;
const SELF = { type: "character", id: "subject" } as const;

const AWAKE: CharacterTimeActivity = { initial: { mode: "ordinary-waking" } };

const HAND = `${GYO_BODY_SITE_PREFIX}extremity:upper-right`;
const ARM = `${GYO_BODY_SITE_PREFIX}upper-limb:right`;
const EDGES = [[ARM, HAND]] as const;


function subject(rank = 3): Character {
  const base = standardAwakenedNen();

  return createTestCharacter({
    id: "subject",
    attributes: STRONG,
    aura: { current: 40_000, allocations: [] },
    wakefulness: { hoursAwake: 2 },
    nen: {
      ...base,
      mastery: {
        ...base.mastery,
        ten: rank,
        ren: rank,
        ken: rank,
        gyo: rank,
        shu: rank,
      } as NenState["mastery"],
    },
  });
}


function runtimeFor(character: Character): NenActivityRuntime {
  return emptyNenActivityRuntime(`nen:${character.id}`, T0);
}


function advance(
  character: Character,
  runtime: NenActivityRuntime,
  from: number,
  to: number,
) {
  const result = advanceCharacterTime({
    character,
    temporalState: characterTemporalState(from),
    interval: gameTimeIntervalOf(from, to - from),
    activity: AWAKE,
    activeEffects: { nenActivities: runtime },
  });

  if (!result.success) {
    throw new Error(
      "Expected the advance to resolve: " +
        result.errors.map((one) => one.code).join(", "),
    );
  }

  return result.payload;
}


/*
 * The same interval, walked in one step and in uneven ones.
 *
 * Deliberately uneven — 3, 11, 2, 19 — because equal steps hide the class of
 * bug where a residual is carried once per step: with equal steps the residual
 * is the same every time and can cancel, and with uneven ones it cannot.
 */
function walked(
  character: Character,
  runtime: NenActivityRuntime,
  slices: readonly number[],
) {
  let at = T0;
  let carried = runtime;
  let state = character;
  const events: unknown[] = [];

  for (const seconds of slices) {
    const to = at + seconds * SECOND;
    const step = advance(state, carried, at, to);

    carried = step.nenActivities?.runtime ?? carried;
    state = step.character;
    events.push(...(step.nenActivities?.events ?? []));
    at = to;
  }

  return { runtime: carried, character: state, events, at };
}


function comparable(runtime: NenActivityRuntime) {
  return runtime.activities.map((one) => ({
    id: one.id,
    condition: one.condition,
    endedAt: one.endedAt,
    committed: one.funding.committed,
    stop: one.stop === null
      ? null
      : { cause: one.stop.cause, at: one.stop.at, detail: one.stop.detail },
    progress: (one.progress ?? []).map((entry) => ({
      clockId: entry.clockId,
      spent: Number(entry.fullLoadEquivalentSeconds.toFixed(9)),
    })),
  }));
}


describe("a Ken advance is the same however the time is chopped", () => {
  /*
   * Ken III at full containment: Cken 3000, Ren III access 3000, so a 3000
   * Ken runs at load 1 on both clocks. Containment III is 150 seconds and
   * Output III is 300, so it expires on containment at t+150.
   */
  const character = subject(3);

  const running = () => {
    const started = startKen(runtimeFor(character), {
      activityId: "ken-1",
      source: SELF,
      selectedOutput: 3000,
      at: T0,
      nen: character.nen,
      attributes: character.attributes,
      currentAura: character.aura.current,
    });

    if (!started.success) throw new Error("expected Ken to start");

    return started.payload.runtime;
  };

  it("agrees on the activity, the stop instant and the clock that ran out", () => {
    const whole = advance(character, running(), T0, T0 + 200 * SECOND);
    const sliced = walked(character, running(), [3, 11, 2, 19, 41, 7, 117]);

    expect(comparable(sliced.runtime))
      .toEqual(comparable(whole.nenActivities!.runtime));

    const stopped = findNenActivity(sliced.runtime, "ken-1")!;

    expect(stopped.stop!.cause).toBe("expired");
    expect(stopped.stop!.at).toBe(T0 + 150 * SECOND);
    expect(stopped.stop!.detail).toContain("containment");
  });

  it("agrees on Current Aura", () => {
    const whole = advance(character, running(), T0, T0 + 200 * SECOND);
    const sliced = walked(character, running(), [3, 11, 2, 19, 41, 7, 117]);

    expect(sliced.character.aura.current)
      .toBeCloseTo(whole.character.aura.current, 6);
  });

  it("agrees on the events that were emitted", () => {
    const whole = advance(character, running(), T0, T0 + 200 * SECOND);
    const sliced = walked(character, running(), [3, 11, 2, 19, 41, 7, 117]);

    expect(sliced.events).toEqual(whole.nenActivities!.events);
  });

  it("stops at the same instant when the OTHER clock binds", () => {
    /* Ken X, Ren III: containment unlimited, so Output III's 300s binds. */
    const lopsided = createTestCharacter({
      id: "subject",
      attributes: STRONG,
      aura: { current: 40_000, allocations: [] },
      wakefulness: { hoursAwake: 2 },
      nen: {
        ...standardAwakenedNen(),
        mastery: {
          ...standardAwakenedNen().mastery,
          ten: 5,
          ren: 3,
          ken: 10,
        } as NenState["mastery"],
      },
    });

    const open = () => {
      const started = startKen(runtimeFor(lopsided), {
        activityId: "ken-1",
        source: SELF,
        selectedOutput: 3000,
        at: T0,
        nen: lopsided.nen,
        attributes: lopsided.attributes,
        currentAura: lopsided.aura.current,
      });

      if (!started.success) throw new Error("expected Ken to start");

      return started.payload.runtime;
    };

    const whole = advance(lopsided, open(), T0, T0 + 400 * SECOND);
    const sliced = walked(lopsided, open(), [13, 97, 5, 201, 84]);

    expect(comparable(sliced.runtime))
      .toEqual(comparable(whole.nenActivities!.runtime));
    expect(findNenActivity(sliced.runtime, "ken-1")!.stop!.detail)
      .toContain("output");
  });
});


describe("a Gyō advance is the same however the time is chopped", () => {
  /*
   * Gyō III at the rank's maximum shift: the containment clock carries double
   * the strain, so it runs out in half the time the same Ken would — and the
   * exact instant has to survive being walked to unevenly.
   */
  const character = subject(3);

  const running = () => {
    const started = startGyo(runtimeFor(character), {
      activityId: "gyo-1",
      source: SELF,
      selectedOutput: 3000,
      selectedShift: 0.3,
      focus: { kind: "reinforcement", sites: [HAND, ARM], edges: EDGES as never },
      at: T0,
      nen: character.nen,
      attributes: character.attributes,
      currentAura: character.aura.current,
    });

    if (!started.success) {
      throw new Error(
        "expected Gyō to start: " +
          started.errors.map((one) => one.code).join(", "),
      );
    }

    return started.payload.runtime;
  };

  it("agrees on everything, including the doubled strain's expiry", () => {
    const whole = advance(character, running(), T0, T0 + 200 * SECOND);
    const sliced = walked(character, running(), [1, 2, 3, 5, 8, 13, 21, 34, 113]);

    expect(comparable(sliced.runtime))
      .toEqual(comparable(whole.nenActivities!.runtime));

    const stopped = findNenActivity(sliced.runtime, "gyo-1")!;

    /* Containment 150s at load 2 is 75 seconds. */
    expect(stopped.stop!.at).toBe(T0 + 75 * SECOND);
    expect(stopped.stop!.cause).toBe("expired");
  });

  it("preserves the focus in the payload right up to the stop", () => {
    const sliced = walked(character, running(), [1, 2, 3, 5, 8, 13, 21, 34, 113]);
    const stopped = findNenActivity(sliced.runtime, "gyo-1")!;

    expect(stopped.requested.payload)
      .toEqual({
        kind: "reinforcement",
        selectedShift: 0.3,
        focus: [HAND, ARM],
      });
  });
});


describe("a Shū advance is the same however the time is chopped", () => {
  /*
   * Shū runs on nothing of its own, so the thing being tested is that it does
   * not quietly acquire a clock: it must still be active after an interval
   * that ended everything else.
   */
  const character = subject(3);

  const running = () => {
    const ken = startKen(runtimeFor(character), {
      activityId: "ken-1",
      source: SELF,
      selectedOutput: 3000,
      at: T0,
      nen: character.nen,
      attributes: character.attributes,
      currentAura: character.aura.current,
    });

    if (!ken.success) throw new Error("expected Ken to start");

    const shu = startShu(ken.payload.runtime, {
      activityId: "shu-1",
      source: SELF,
      at: T0,
      nen: character.nen,
      selection: ["sword-1"],
      conductivity: { "sword-1": 0.5 },
      contactEdges: [{ from: SHU_BODY_NODE, to: "sword-1" }],
    });

    if (!shu.success) {
      throw new Error(
        "expected Shū to start: " +
          shu.errors.map((one) => one.code).join(", "),
      );
    }

    return shu.payload.runtime;
  };

  it("agrees on both activities and on Current Aura", () => {
    const whole = advance(character, running(), T0, T0 + 200 * SECOND);
    const sliced = walked(character, running(), [7, 23, 2, 61, 107]);

    expect(comparable(sliced.runtime))
      .toEqual(comparable(whole.nenActivities!.runtime));
    expect(sliced.character.aura.current)
      .toBeCloseTo(whole.character.aura.current, 6);
  });

  it("outlives the Ken it was extending, having no clock of its own", () => {
    const sliced = walked(character, running(), [7, 23, 2, 61, 107]);

    expect(findNenActivity(sliced.runtime, "ken-1")!.condition).toBe("ended");
    expect(findNenActivity(sliced.runtime, "shu-1")!.condition).toBe("active");
    expect(findNenActivity(sliced.runtime, "shu-1")!.progress).toEqual([]);
  });
});
