/*
 * Game-duration construction and arithmetic.
 *
 * A GameDuration represents an amount of elapsed game time measured in
 * milliseconds.
 *
 * This file provides shared helpers for constructing and comparing durations
 * so that individual systems do not need to repeat raw millisecond arithmetic.
 *
 * Calendar-dependent units such as months and years are intentionally excluded
 * because their lengths depend on calendar rules rather than fixed elapsed
 * time.
 */

import type {
  GameDuration,
  GameTimestamp,
} from "./types";


/*
 * The authoritative game-time units.
 *
 * Every system that converts between units reads these. They are exported and
 * prefixed GAME_ rather than kept private because the alternative had already
 * happened twice: calendar.ts carried its own private copy of the same four
 * numbers, and Combat carried its own round length. Two constants that mean
 * the same thing are two constants that can drift, and a mismatch between the
 * calendar's idea of an hour and Aura's would be almost impossible to see.
 */
export const GAME_MILLISECONDS_PER_SECOND = 1_000;
export const GAME_SECONDS_PER_MINUTE = 60;
export const GAME_MINUTES_PER_HOUR = 60;
export const GAME_HOURS_PER_DAY = 24;

export const GAME_MILLISECONDS_PER_MINUTE =
  GAME_MILLISECONDS_PER_SECOND * GAME_SECONDS_PER_MINUTE;

export const GAME_MILLISECONDS_PER_HOUR =
  GAME_MILLISECONDS_PER_MINUTE * GAME_MINUTES_PER_HOUR;

export const GAME_MILLISECONDS_PER_DAY =
  GAME_MILLISECONDS_PER_HOUR * GAME_HOURS_PER_DAY;

export const GAME_SECONDS_PER_HOUR =
  GAME_SECONDS_PER_MINUTE * GAME_MINUTES_PER_HOUR;


/**
 * How much game time one completed Combat Round represents.
 *
 * TWO seconds. Declared here rather than in the Combat module because it is a
 * unit of TIME, and things well below Combat need it: an Aura upkeep rate may
 * be quoted per Round and has to become the per-hour rate the endurance model
 * works in. Foundation cannot import from gameplay, and a second copy of the
 * number would be a second thing to keep in step.
 *
 * gameplay/combat/round.ts re-exports it as COMBAT_ROUND_DURATION_SECONDS,
 * which is the name Combat callers already use.
 */
export const SECONDS_PER_COMBAT_ROUND = 2;

/** Combat Rounds in one hour, for converting per-Round rates to per-hour. */
export const COMBAT_ROUNDS_PER_HOUR =
  GAME_SECONDS_PER_HOUR / SECONDS_PER_COMBAT_ROUND;

export const GAME_MILLISECONDS_PER_COMBAT_ROUND =
  SECONDS_PER_COMBAT_ROUND * GAME_MILLISECONDS_PER_SECOND;


/* Local aliases, so the arithmetic below reads the way it always has. */
const MILLISECONDS_PER_SECOND = GAME_MILLISECONDS_PER_SECOND;
const MILLISECONDS_PER_MINUTE = GAME_MILLISECONDS_PER_MINUTE;
const MILLISECONDS_PER_HOUR = GAME_MILLISECONDS_PER_HOUR;
const MILLISECONDS_PER_DAY = GAME_MILLISECONDS_PER_DAY;


/**
 * Creates a GameDuration from milliseconds.
 */
export function milliseconds(value: number): GameDuration {
  return value;
}


/**
 * Creates a GameDuration from seconds.
 */
export function seconds(value: number): GameDuration {
  return value * MILLISECONDS_PER_SECOND;
}


/**
 * Creates a GameDuration from minutes.
 */
export function minutes(value: number): GameDuration {
  return value * MILLISECONDS_PER_MINUTE;
}


/**
 * Creates a GameDuration from hours.
 */
export function hours(value: number): GameDuration {
  return value * MILLISECONDS_PER_HOUR;
}


/**
 * Creates a GameDuration from 24-hour days.
 *
 * This represents elapsed time only. It does not depend upon month or year
 * boundaries in the world's calendar.
 */
export function days(value: number): GameDuration {
  return value * MILLISECONDS_PER_DAY;
}


/**
 * Returns the elapsed game time from start to end.
 *
 * A negative duration is returned when end occurs before start.
 */
export function elapsedBetween(
  start: GameTimestamp,
  end: GameTimestamp,
): GameDuration {
  return end - start;
}


/**
 * Returns the timestamp reached after adding a duration to a timestamp.
 */
export function addDuration(
  timestamp: GameTimestamp,
  duration: GameDuration,
): GameTimestamp {
  return timestamp + duration;
}


/**
 * Returns the timestamp reached after subtracting a duration from a timestamp.
 */
export function subtractDuration(
  timestamp: GameTimestamp,
  duration: GameDuration,
): GameTimestamp {
  return timestamp - duration;
}


/**
 * Returns the remaining duration until a target timestamp.
 *
 * Once the target has been reached or passed, zero is returned.
 */
export function remainingUntil(
  currentTime: GameTimestamp,
  targetTime: GameTimestamp,
): GameDuration {
  return Math.max(0, targetTime - currentTime);
}


/**
 * Returns whether a target timestamp has been reached or passed.
 */
export function hasExpired(
  currentTime: GameTimestamp,
  expiresAt: GameTimestamp,
): boolean {
  return currentTime >= expiresAt;
}


/**
 * Returns whether a duration has fully elapsed since a starting timestamp.
 */
export function hasDurationElapsed(
  currentTime: GameTimestamp,
  startedAt: GameTimestamp,
  duration: GameDuration,
): boolean {
  return currentTime >= startedAt + duration;
}


/**
 * Returns a duration expressed as milliseconds.
 */
export function toMilliseconds(duration: GameDuration): number {
  return duration;
}


/**
 * Returns a duration expressed as seconds.
 */
export function toSeconds(duration: GameDuration): number {
  return duration / MILLISECONDS_PER_SECOND;
}


/**
 * Returns a duration expressed as minutes.
 */
export function toMinutes(duration: GameDuration): number {
  return duration / MILLISECONDS_PER_MINUTE;
}


/**
 * Returns a duration expressed as hours.
 */
export function toHours(duration: GameDuration): number {
  return duration / MILLISECONDS_PER_HOUR;
}


/**
 * Returns a duration expressed as 24-hour days.
 */
export function toDays(duration: GameDuration): number {
  return duration / MILLISECONDS_PER_DAY;
}