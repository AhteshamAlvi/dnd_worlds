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
 *     explicitly according to round duration
 *
 * Explicit/manual game-time advancement is independent of clock mode. This
 * allows actions such as travel, rests, downtime, or GM-controlled time skips
 * while the automatic clock is paused.
 *
 * This module does not read Date.now(), use timers, or otherwise depend upon
 * wall-clock state. The host application supplies elapsed real milliseconds.
 */

import { fromGameDateTime } from "./calendar";
import { seconds } from "./duration";

import type {
  GameClockCreation,
  GameClockMode,
  GameClockState,
  GameDuration,
} from "./types";


/**
 * Standard combat-round duration.
 *
 * D&D-style combat treats one complete round as six seconds of game time,
 * regardless of how many creatures take turns during that round.
 */
export const COMBAT_ROUND_DURATION: GameDuration = seconds(6);


/**
 * Creates a new global game clock.
 *
 * The campaign begins at the supplied calendar date rather than at the
 * calendar epoch.
 */
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
 * - other mechanics that explicitly consume game time
 */
export function advanceGameTime(
  clock: GameClockState,
  duration: GameDuration,
): GameClockState {
  assertValidForwardDuration(duration);

  if (duration === 0) {
    return clock;
  }

  return {
    ...clock,
    currentTime:
      clock.currentTime + duration,
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
 * Instead, the combat system advances time explicitly as rounds complete.
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
 * Advances combat by one complete round.
 *
 * One round advances the global game clock by six game seconds.
 *
 * Individual creature turns do not each advance the clock by six seconds;
 * their turns occur within the same round interval.
 */
export function advanceCombatRound(
  clock: GameClockState,
): GameClockState {
  assertCombatMode(clock);

  return {
    ...clock,
    currentTime:
      clock.currentTime + COMBAT_ROUND_DURATION,
  };
}


/**
 * Advances combat by multiple complete rounds.
 *
 * This is useful when several rounds are resolved or skipped at once.
 */
export function advanceCombatRounds(
  clock: GameClockState,
  rounds: number,
): GameClockState {
  assertCombatMode(clock);

  if (
    !Number.isInteger(rounds) ||
    rounds < 0
  ) {
    throw new RangeError(
      `Combat rounds must be a non-negative integer. Received: ${rounds}.`,
    );
  }

  if (rounds === 0) {
    return clock;
  }

  return {
    ...clock,
    currentTime:
      clock.currentTime +
      COMBAT_ROUND_DURATION * rounds,
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
 * Ensures that an operation requiring combat time is only performed during
 * combat.
 */
function assertCombatMode(
  clock: GameClockState,
): void {
  if (clock.mode !== "combat") {
    throw new Error(
      "Combat time can only be advanced while the game clock is in combat mode.",
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