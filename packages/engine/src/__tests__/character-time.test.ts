/*
 * Character time: one interval, three domains, and a sheet that stays current.
 *
 * Three claims are under test.
 *
 * ONE INTERVAL REACHES EVERYTHING. Aura, wakefulness and Fatigue are advanced
 * by the same span from the same coordinator, because the same hours decide
 * all three and three callers each advancing one domain would be three chances
 * to disagree.
 *
 * AN INTERVAL CANNOT BE APPLIED TWICE. A character records when their stored
 * state was last committed, and an advance may only start exactly there. A
 * system with both a live clock and a manual time skip will eventually try to
 * charge the same hour twice; this is what stops it.
 *
 * A PROJECTION EQUALS A COMMIT. What a sheet displays and what persisting
 * would produce are the same arithmetic, run once and thrown away — otherwise
 * a value jumps the moment anything is saved.
 */

import { describe, expect, it } from "vitest";

import {
  advanceCharacterTime,
  characterTemporalState,
  projectCharacterAtTime,
} from "../character/time";
import type { CharacterTimeActivity } from "../character/time";
import { advanceGameClock, createGameClock } from "../time/clock";
import {
  GAME_MILLISECONDS_PER_HOUR,
  SECONDS_PER_COMBAT_ROUND,
  COMBAT_ROUNDS_PER_HOUR,
  GAME_MILLISECONDS_PER_COMBAT_ROUND,
} from "../time/duration";
import { gameTimeInterval, gameTimeIntervalOf, hoursToDuration } from "../time/interval";
import { deriveMaximumAura } from "../character/foundation/aura/pool";
import { restedWakefulness } from "../character/foundation/body/endurance";
import type { Character } from "../character/types";

import { createTestCharacter } from "./fixtures/character";

const T0 = 1_000_000_000;

/* CON 20 / VIT 20: Maximum Aura 50,000, regeneration 5,000/hour. */
const STRONG = { con: 20, vit: 20, dex: 22 } as const;

const SLEEPING: CharacterTimeActivity = { initial: { mode: "sleep" } };
const AWAKE: CharacterTimeActivity = { initial: { mode: "ordinary-waking" } };

function character(overrides: Partial<Character> = {}): Character {
  return createTestCharacter({
    attributes: STRONG,
    aura: { current: 10_000, allocations: [] },
    wakefulness: { hoursAwake: 20 },
    ...overrides,
  });
}

function advance(
  subject: Character,
  hours: number,
  activity: CharacterTimeActivity = AWAKE,
  startedAt = T0,
) {
  return advanceCharacterTime({
    character: subject,
    temporalState: characterTemporalState(startedAt),
    interval: gameTimeIntervalOf(startedAt, hoursToDuration(hours)),
    activity,
  });
}

function succeed(...args: Parameters<typeof advance>) {
  const result = advance(...args);

  if (!result.success) {
    throw new Error(
      "Expected the advance to resolve: " +
      result.errors.map((error) => error.code).join(", "),
    );
  }

  return result.payload;
}

function errorCodes(
  result: { success: boolean; errors?: readonly { code: string }[] },
): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((error) => error.code);
}


describe("the authoritative units", () => {
  it("runs Combat Rounds at two seconds", () => {
    expect(SECONDS_PER_COMBAT_ROUND).toBe(2);
    expect(GAME_MILLISECONDS_PER_COMBAT_ROUND).toBe(2000);
  });

  it("converts Rounds into hours the one way", () => {
    expect(COMBAT_ROUNDS_PER_HOUR).toBe(1800);
    expect(COMBAT_ROUNDS_PER_HOUR * GAME_MILLISECONDS_PER_COMBAT_ROUND)
      .toBe(GAME_MILLISECONDS_PER_HOUR);
  });
});


describe("the clock reports the interval it crossed", () => {
  const clock = createGameClock({
    startDateTime: { year: 1, month: 1, day: 1, hour: 8, minute: 0, second: 0 },
  });

  it("begins the interval at the clock's own current time", () => {
    const transition = advanceGameClock(clock, hoursToDuration(3));

    expect(transition.interval.startedAt).toBe(clock.currentTime);
    expect(transition.interval.endedAt).toBe(transition.clock.currentTime);
    expect(transition.interval.elapsed).toBe(hoursToDuration(3));
  });

  it("crosses a zero-length interval rather than none at all", () => {
    const transition = advanceGameClock(clock, 0);

    expect(transition.clock).toBe(clock);
    expect(transition.interval.elapsed).toBe(0);
  });

  /*
   * A manual skip, ordinary progression and combat time all produce the same
   * shape, which is what lets one coordinator consume all three.
   */
  it("produces the same interval shape for a skip and for combat rounds", () => {
    const skip = advanceGameClock(clock, hoursToDuration(8));
    const rounds = advanceGameClock(
      clock,
      10 * GAME_MILLISECONDS_PER_COMBAT_ROUND,
    );

    expect(skip.interval.elapsed).toBe(hoursToDuration(8));
    expect(rounds.interval.elapsed).toBe(20_000);
    expect(rounds.interval.startedAt).toBe(skip.interval.startedAt);
  });
});


describe("one interval reaches every domain", () => {
  const result = succeed(character(), 8, SLEEPING);

  it("advances Aura, wakefulness and Fatigue together", () => {
    /* Eight hours of sleep at 5,000 an hour, into a 50,000 pool. */
    expect(result.character.aura.current).toBe(50_000);

    /* And sixteen hours of the twenty-hour debt cleared. */
    expect(result.character.wakefulness.hoursAwake).toBe(4);

    expect(result.fatigue.components.auraDepletion).toBe(0);
    expect(result.fatigue.level)
      .toBeLessThan(result.aura.previousFatigue.level);
  });

  it("hands the same interval to each of them", () => {
    expect(result.aura.interval).toEqual(result.interval);
    expect(result.aura.elapsedHours).toBe(8);
  });

  it("moves the temporal state to the interval's end", () => {
    expect(result.previousTemporalState.resolvedAt).toBe(T0);
    expect(result.temporalState.resolvedAt).toBe(result.interval.endedAt);
  });

  it("returns a character ready to persist, leaving the input alone", () => {
    const before = character();
    const taken = JSON.stringify(before);

    const advanced = succeed(before, 4, SLEEPING);

    expect(JSON.stringify(before)).toBe(taken);
    expect(advanced.character).not.toBe(before);
    expect(advanced.character.aura).not.toBe(before.aura);
  });
});


describe("an interval cannot be applied twice", () => {
  it("refuses an interval that starts before the last resolved moment", () => {
    const result = advanceCharacterTime({
      character: character(),
      temporalState: characterTemporalState(T0 + hoursToDuration(4)),
      interval: gameTimeIntervalOf(T0, hoursToDuration(8)),
      activity: AWAKE,
    });

    expect(errorCodes(result)).toContain("character.time.interval.stale");
  });

  it("refuses an interval that leaves a gap after it", () => {
    const result = advanceCharacterTime({
      character: character(),
      temporalState: characterTemporalState(T0),
      interval: gameTimeIntervalOf(T0 + hoursToDuration(1), hoursToDuration(8)),
      activity: AWAKE,
    });

    expect(errorCodes(result)).toContain("character.time.interval.gap");
  });

  it("leaves the character untouched when it refuses", () => {
    const before = character();
    const taken = JSON.stringify(before);

    advanceCharacterTime({
      character: before,
      temporalState: characterTemporalState(T0 + 1),
      interval: gameTimeIntervalOf(T0, hoursToDuration(8)),
      activity: AWAKE,
    });

    expect(JSON.stringify(before)).toBe(taken);
  });

  /* Applied once and then continued from where it ended, which is legal. */
  it("chains cleanly from its own end", () => {
    const first = succeed(character(), 4, SLEEPING);

    const second = advanceCharacterTime({
      character: first.character,
      temporalState: first.temporalState,
      interval: gameTimeIntervalOf(
        first.temporalState.resolvedAt,
        hoursToDuration(4),
      ),
      activity: SLEEPING,
    });

    expect(second.success).toBe(true);
    if (!second.success) return;

    /* And matches doing the eight hours in one go. */
    const whole = succeed(character(), 8, SLEEPING);

    expect(second.payload.character.aura.current)
      .toBeCloseTo(whole.character.aura.current, 6);
    expect(second.payload.character.wakefulness.hoursAwake)
      .toBeCloseTo(whole.character.wakefulness.hoursAwake, 8);
  });

  it("refuses a backwards interval outright", () => {
    const result = advanceCharacterTime({
      character: character(),
      temporalState: characterTemporalState(T0),
      interval: gameTimeInterval(T0, T0 - 1000),
      activity: AWAKE,
    });

    expect(errorCodes(result)).toContain("time.interval.reversed");
  });
});


describe("live projection", () => {
  const subject = character();
  const resolvedAt = T0;
  const now = T0 + hoursToDuration(6);

  function project(at = now) {
    const result = projectCharacterAtTime({
      character: subject,
      temporalState: characterTemporalState(resolvedAt),
      currentTime: at,
      activity: SLEEPING,
    });

    if (!result.success) {
      throw new Error(
        "Expected the projection to resolve: " +
        result.errors.map((error) => error.code).join(", "),
      );
    }

    return result.payload;
  }

  /*
   * The reason projection exists. Stored state is a snapshot from whenever it
   * was last written, and a sheet that showed it would tell a GM opening an
   * NPC after six in-world hours that they are still drained.
   */
  it("shows an un-updated character as they are now", () => {
    const projection = project();

    expect(subject.aura.current).toBe(10_000);
    expect(projection.aura.current).toBe(40_000);
    expect(projection.wakefulness.hoursAwake).toBe(8);
    expect(projection.projected).toBe(true);
  });

  it("never mutates or persists the character", () => {
    const taken = JSON.stringify(subject);

    project();

    expect(JSON.stringify(subject)).toBe(taken);
    expect(subject.aura.current).toBe(10_000);
  });

  /* A display that disagreed with a save would jump the moment anything saved. */
  it("equals committed advancement at the same timestamp", () => {
    const projection = project();
    const committed = succeed(subject, 6, SLEEPING);

    expect(projection.aura.current).toBe(committed.aura.current);
    expect(projection.wakefulness).toEqual(committed.wakefulness);
    expect(projection.fatigue).toEqual(committed.fatigue);
    expect(projection.character.aura).toEqual(committed.character.aura);
  });

  it("resolves to the stored state when nothing has elapsed", () => {
    const projection = project(resolvedAt);

    expect(projection.projected).toBe(false);
    expect(projection.aura.current).toBe(10_000);
    expect(projection.wakefulness).toEqual(subject.wakefulness);
  });

  it("refuses to project backwards", () => {
    const result = projectCharacterAtTime({
      character: subject,
      temporalState: characterTemporalState(T0),
      currentTime: T0 - 1,
      activity: SLEEPING,
    });

    expect(errorCodes(result)).toContain("character.time.projection.backward");
  });

  /*
   * The commit-then-act sequence. A caller resolving an action at a timestamp
   * materialises the elapsed time first and resolves against the projection's
   * character, which is exactly the state the action should see.
   */
  it("hands back the character an action should be resolved against", () => {
    const projection = project();

    expect(projection.character.aura.current).toBe(projection.aura.current);
    expect(projection.character.wakefulness).toEqual(projection.wakefulness);
  });

  /*
   * An NPC nobody has looked at for three in-world days costs nothing until
   * somebody looks, and then costs one calculation rather than three days of
   * ticks.
   */
  it("brings a long-untouched NPC current in one step", () => {
    const npc = character({
      aura: { current: 0, allocations: [] },
      wakefulness: restedWakefulness(),
    });

    const result = projectCharacterAtTime({
      character: npc,
      temporalState: characterTemporalState(T0),
      currentTime: T0 + hoursToDuration(72),
      activity: AWAKE,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    /*
     * Awake and not recovering: still empty, and three days more tired. 72 of
     * a 120-hour limit is 3.6 raw, and an empty reserve is +5.
     */
    expect(result.payload.aura.current).toBe(0);
    expect(result.payload.wakefulness.hoursAwake).toBe(72);
    expect(result.payload.fatigue.level).toBe(8);
    expect(result.payload.fatigue.state).toBe("severely-fatigued");
  });
});


describe("combat time uses the same model", () => {
  /*
   * Ten two-second Rounds is twenty seconds, and an upkeep quoted per Round
   * has to cost the same whether it is charged per Round or as one span.
   */
  it("charges a per-Round upkeep the same across ten Rounds as one span", () => {
    const subject = character({ nen: { ...character().nen, awakened: true } });

    const perSpan = advanceCharacterTime({
      character: subject,
      temporalState: characterTemporalState(T0),
      interval: gameTimeIntervalOf(
        T0,
        10 * GAME_MILLISECONDS_PER_COMBAT_ROUND,
      ),
      activity: AWAKE,
      activeEffects: {
        upkeep: [{ id: "ko", source: "ko", baseRate: 5, period: "round" }],
      },
    });

    expect(perSpan.success).toBe(true);
    if (!perSpan.success) return;

    /* Five Aura a Round, ten Rounds, at a x1.0 Control multiplier. */
    expect(perSpan.payload.aura.balance.upkeep).toBeCloseTo(50, 8);

    let state = subject;
    let temporal = characterTemporalState(T0);
    let charged = 0;

    for (let round = 0; round < 10; round += 1) {
      const step = advanceCharacterTime({
        character: state,
        temporalState: temporal,
        interval: gameTimeIntervalOf(
          temporal.resolvedAt,
          GAME_MILLISECONDS_PER_COMBAT_ROUND,
        ),
        activity: AWAKE,
        activeEffects: {
          upkeep: [{ id: "ko", source: "ko", baseRate: 5, period: "round" }],
        },
      });

      if (!step.success) throw new Error("expected the Round to resolve");

      state = step.payload.character;
      temporal = step.payload.temporalState;
      charged += step.payload.aura.balance.upkeep;
    }

    expect(charged).toBeCloseTo(50, 8);
    expect(state.aura.current)
      .toBeCloseTo(perSpan.payload.character.aura.current, 8);
  });
});


describe("what the coordinator does not do", () => {
  it("never advances or reads the clock", () => {
    const clock = createGameClock({
      startDateTime: {
        year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0,
      },
    });

    const before = clock.currentTime;

    succeed(character(), 8, SLEEPING);

    expect(clock.currentTime).toBe(before);
  });

  it("derives Maximum Aura from the character rather than being told", () => {
    const result = succeed(character(), 1, SLEEPING);

    expect(result.aura.state.current)
      .toBeLessThanOrEqual(deriveMaximumAura({
        agi: 10, dex: 22, con: 20, vit: 20,
        int: 10, wis: 10, per: 10, spi: 10, cha: 10,
      }));
  });
});
