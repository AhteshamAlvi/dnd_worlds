/*
 * Global game-clock behavior.
 *
 * The game clock is the single authoritative source of in-world time.
 *
 * The clock stores an absolute GameTimestamp and advances it in one of three
 * ways:
 *
 * - running:
 *     real elapsed time × timeScale
 *
 * - paused:
 *     real elapsed time does not advance game time
 *
 * - combat:
 *     real elapsed time does not advance game time; combat advances the clock
 *     explicitly according to its own elapsed-time rules
 *
 * Explicit/manual game-time advancement is independent of clock mode. This
 * allows actions such as travel, rests, downtime, GM-controlled time skips,
 * or combat-time advancement while automatic clock advancement is stopped.
 *
 * This module does not define combat rounds or combat-round duration.
 * Those responsibilities belong to the combat system.
 *
 * This module does not read Date.now(), use timers, or otherwise depend upon
 * wall-clock state. The host application supplies elapsed real milliseconds.
 */

import { fromGameDateTime } from "./calendar";
import {
  gameTimeInterval,
  gameTimeIntervalOf,
  type GameTimeInterval,
} from "./interval";

import type {
  GameClockCreation,
  GameClockMode,
  GameClockState,
  GameDuration,
} from "./types";


/**
 * Creates a new global game clock.
 *
 * The campaign begins at the supplied calendar date rather than at the
 * calendar epoch.
 */
/**
 * A clock advancement, and the span of world time it crossed.
 *
 * `previous` is kept alongside because an advancement that changed nothing —
 * a paused clock, a zero duration — is still a legitimate answer, and a caller
 * comparing the two can see that without inspecting timestamps.
 */
export interface GameClockTransition {
  readonly previous: GameClockState;
  readonly clock: GameClockState;
  readonly interval: GameTimeInterval;
}


export function createGameClock(
  creation: GameClockCreation,
): GameClockState {
  const currentTime = fromGameDateTime(
    creation.startDateTime,
  );

  const timeScale = creation.timeScale ?? 1;
  const mode = creation.mode ?? "running";

  assertValidTimeScale(timeScale);
  assertValidClockMode(mode);

  return {
    currentTime,
    campaignStartedAt: currentTime,
    mode,
    timeScale,
    fractionalMs: 0,
  };
}


/**
 * Advances the game clock according to elapsed real time.
 *
 * This is the primary advancement operation during normal play.
 *
 * Example:
 *
 *   realElapsedMs = 1_000
 *   timeScale     = 60
 *
 * produces:
 *
 *   60_000 game milliseconds
 *
 * Paused and combat clocks ignore real-time advancement.
 */
export function advanceFromRealTime(
  clock: GameClockState,
  realElapsedMs: number,
): GameClockState {
  assertValidRealElapsedTime(realElapsedMs);

  if (clock.mode !== "running") {
    return clock;
  }

  const scaledElapsed =
    realElapsedMs * clock.timeScale +
    clock.fractionalMs;

  const wholeGameMilliseconds =
    Math.floor(scaledElapsed);

  const fractionalMs =
    scaledElapsed - wholeGameMilliseconds;

  if (
    wholeGameMilliseconds === 0 &&
    fractionalMs === clock.fractionalMs
  ) {
    return clock;
  }

  return {
    ...clock,
    currentTime:
      clock.currentTime + wholeGameMilliseconds,
    fractionalMs,
  };
}


/**
 * Advances the clock by an explicit amount of game time.
 *
 * Explicit advancement is independent of the current clock mode.
 *
 * This is suitable for:
 *
 * - rests
 * - travel
 * - downtime
 * - waiting
 * - GM-controlled time skips
 * - combat-controlled elapsed time
 * - other mechanics that explicitly consume game time
 */
export function advanceGameTime(
  clock: GameClockState,
  duration: GameDuration,
): GameClockState {
  return advanceGameClock(clock, duration).clock;
}


/**
 * Advances the clock and reports the interval it crossed.
 *
 * The form every time-dependent mechanic should be driven from. Returning only
 * the new clock, as advanceGameTime does, throws away the one fact the
 * character domains need most: WHICH span of world time just happened. A
 * caller left to reconstruct it by subtracting two timestamps it saved either
 * side of the call can get it wrong, can apply it twice, and has nothing to
 * check a character's last-committed moment against.
 *
 * The interval always begins at the clock's current timestamp, which is what
 * makes "this interval has already been applied to this character" a decidable
 * question rather than a guess.
 *
 * advanceGameTime remains as a thin wrapper, because plenty of callers only
 * want the clock and should not have to reach through a transition for it.
 */
export function advanceGameClock(
  clock: GameClockState,
  duration: GameDuration,
): GameClockTransition {
  assertValidForwardDuration(duration);

  const next: GameClockState = duration === 0
    ? clock
    : { ...clock, currentTime: clock.currentTime + duration };

  return {
    previous: clock,
    clock: next,
    interval: gameTimeIntervalOf(clock.currentTime, duration),
  };
}


/**
 * Advances from real elapsed time and reports the interval it crossed.
 *
 * A paused or combat clock crosses a ZERO-length interval rather than none at
 * all. That distinction matters to the caller: a projection asked to bring a
 * character up to a stopped clock should resolve to "nothing happened", not
 * fail for want of an interval.
 */
export function advanceGameClockFromRealTime(
  clock: GameClockState,
  realElapsedMs: number,
): GameClockTransition {
  const next = advanceFromRealTime(clock, realElapsedMs);

  return {
    previous: clock,
    clock: next,
    interval: gameTimeInterval(clock.currentTime, next.currentTime),
  };
}


/**
 * Changes the rate at which real elapsed time becomes game time.
 *
 * Changing the time scale does not itself advance the clock.
 */
export function setTimeScale(
  clock: GameClockState,
  timeScale: number,
): GameClockState {
  assertValidTimeScale(timeScale);

  if (clock.timeScale === timeScale) {
    return clock;
  }

  return {
    ...clock,
    timeScale,
  };
}


/**
 * Pauses automatic clock advancement.
 *
 * A combat clock cannot be converted directly to paused mode through this
 * operation. Combat should be exited explicitly through leaveCombat().
 */
export function pauseGameClock(
  clock: GameClockState,
): GameClockState {
  if (clock.mode === "combat") {
    throw new Error(
      "Cannot pause the normal game clock while combat mode is active.",
    );
  }

  if (clock.mode === "paused") {
    return clock;
  }

  return {
    ...clock,
    mode: "paused",
  };
}


/**
 * Resumes normal scaled real-time advancement.
 *
 * Combat must be exited explicitly before the normal clock can resume.
 */
export function resumeGameClock(
  clock: GameClockState,
): GameClockState {
  if (clock.mode === "combat") {
    throw new Error(
      "Cannot resume the normal game clock while combat mode is active.",
    );
  }

  if (clock.mode === "running") {
    return clock;
  }

  return {
    ...clock,
    mode: "running",
  };
}


/**
 * Enters combat time.
 *
 * Real elapsed time no longer advances the game clock while combat is active.
 * The combat system is responsible for explicitly advancing the authoritative
 * clock according to its own elapsed-time rules.
 *
 * The configured timeScale is preserved so normal play can resume using the
 * same scale after combat.
 */
export function enterCombat(
  clock: GameClockState,
): GameClockState {
  if (clock.mode === "combat") {
    return clock;
  }

  return {
    ...clock,
    mode: "combat",
  };
}


/**
 * Leaves combat and returns to normal running time.
 *
 * The timeScale that existed before and during combat remains unchanged.
 *
 * The host application should begin a fresh real-time elapsed-time interval
 * after this transition. Real time spent resolving combat must never be passed
 * to advanceFromRealTime() after combat ends.
 */
export function leaveCombat(
  clock: GameClockState,
): GameClockState {
  if (clock.mode !== "combat") {
    return clock;
  }

  return {
    ...clock,
    mode: "running",
  };
}


/**
 * Returns whether automatic real-time advancement is currently active.
 */
export function isGameClockRunning(
  clock: GameClockState,
): boolean {
  return clock.mode === "running";
}


/**
 * Returns whether the game clock is manually paused.
 */
export function isGameClockPaused(
  clock: GameClockState,
): boolean {
  return clock.mode === "paused";
}


/**
 * Returns whether combat-controlled time is active.
 */
export function isCombatTimeActive(
  clock: GameClockState,
): boolean {
  return clock.mode === "combat";
}


/**
 * Ensures that the supplied time scale can be used for forward-running game
 * time.
 *
 * A scale of zero is intentionally rejected because pausing is represented
 * explicitly by GameClockMode rather than by a zero multiplier.
 */
function assertValidTimeScale(
  timeScale: number,
): void {
  if (
    !Number.isFinite(timeScale) ||
    timeScale <= 0
  ) {
    throw new RangeError(
      `Time scale must be a finite number greater than 0. Received: ${timeScale}.`,
    );
  }
}


/**
 * Ensures that elapsed real time is valid.
 *
 * Negative real elapsed time would imply that the host's wall clock moved
 * backwards, which must never move the authoritative game timeline backwards.
 */
function assertValidRealElapsedTime(
  realElapsedMs: number,
): void {
  if (
    !Number.isFinite(realElapsedMs) ||
    realElapsedMs < 0
  ) {
    throw new RangeError(
      `Real elapsed time must be a finite non-negative number. Received: ${realElapsedMs}.`,
    );
  }
}


/**
 * Ensures that explicit duration advancement moves time only forward.
 */
function assertValidForwardDuration(
  duration: GameDuration,
): void {
  if (
    !Number.isFinite(duration) ||
    duration < 0
  ) {
    throw new RangeError(
      `Game-time advancement must be a finite non-negative duration. Received: ${duration}.`,
    );
  }
}


/**
 * Guards against invalid runtime mode values entering from persisted or
 * external state.
 */
function assertValidClockMode(
  mode: GameClockMode,
): void {
  if (
    mode !== "running" &&
    mode !== "paused" &&
    mode !== "combat"
  ) {
    throw new RangeError(
      `Invalid game-clock mode: ${String(mode)}.`,
    );
  }
}