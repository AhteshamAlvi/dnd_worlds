/*
 * Elapsed intervals — the unit every time-dependent mechanic consumes.
 *
 * A GameTimeInterval is a HALF-OPEN span of authoritative world time with its
 * own elapsed duration carried alongside. Carrying the duration looks
 * redundant next to two timestamps, and the redundancy is the point: it is
 * checked, so an interval whose elapsed disagrees with its endpoints is
 * rejected here rather than silently charging a character for the wrong number
 * of hours somewhere three domains away.
 *
 *
 * WHY THE SHAPE EXISTS AT ALL
 * ---------------------------
 *
 * Before this, mechanics took a bare number of hours. That could not answer
 * the questions the model actually needs answered:
 *
 *   WHEN did this happen — an upkeep that ran out mid-interval has an exact
 *   shutdown timestamp, and "1.5" is not one.
 *
 *   HAS IT ALREADY BEEN APPLIED — a character's stored state records the
 *   moment it was last committed, and only an interval starting exactly there
 *   can be applied to it. A duration cannot be checked against anything.
 *
 *   DID EVERY DOMAIN GET THE SAME SPAN — Aura, wakefulness and timed effects
 *   are handed one interval rather than each being told a number of hours,
 *   which is what stops two of them disagreeing about how long the night was.
 *
 * The Time domain owns this shape and imports nothing from the domains that
 * consume it. The dependency runs one way, always.
 */

import type { EngineError } from "../infrastructure/diagnostics";
import type { EngineResult, NonEmptyArray } from "../infrastructure/result";
import { createTraceNode } from "../infrastructure/trace";

import { GAME_MILLISECONDS_PER_HOUR } from "./duration";
import type { GameDuration, GameTimestamp } from "./types";


/**
 * A span of authoritative world time that something has crossed.
 *
 * `elapsed` is always `endedAt - startedAt`. A zero-length interval is legal
 * and means no time passed; a negative one is not, because time does not run
 * backwards and a mechanic handed one would refund Aura it never spent.
 */
export interface GameTimeInterval {
  readonly startedAt: GameTimestamp;
  readonly endedAt: GameTimestamp;
  readonly elapsed: GameDuration;
}


function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}


/** Every way an interval can be malformed, judged together. */
export function findGameTimeIntervalIssues(
  interval: GameTimeInterval,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  for (const [name, value] of [
    ["startedAt", interval.startedAt],
    ["endedAt", interval.endedAt],
    ["elapsed", interval.elapsed],
  ] as const) {
    if (finite(value)) continue;

    errors.push({
      code: "time.interval.value.invalid",
      message: `A game-time interval's ${name} must be a finite number.`,
      audience: "developer",
      required: "finite number",
      actual: typeof value === "number" ? String(value) : String(value),
    });
  }

  if (errors.length > 0) return errors;

  if (interval.endedAt < interval.startedAt) {
    errors.push({
      code: "time.interval.reversed",
      message: "A game-time interval cannot end before it started.",
      audience: "developer",
      required: `endedAt >= ${interval.startedAt}`,
      actual: interval.endedAt,
      resolution:
        "World time never moves backward. Re-derive the interval from the clock rather than constructing it by hand.",
    });
  }

  /*
   * The redundancy check. An interval whose elapsed does not match its
   * endpoints would charge a mechanic for a span it did not cross, and every
   * consumer downstream trusts one or the other without knowing which.
   */
  if (interval.elapsed !== interval.endedAt - interval.startedAt) {
    errors.push({
      code: "time.interval.elapsed.mismatch",
      message:
        "A game-time interval's elapsed duration must equal endedAt minus startedAt.",
      audience: "developer",
      required: interval.endedAt - interval.startedAt,
      actual: interval.elapsed,
    });
  }

  return errors;
}


/** Build an interval from two timestamps, deriving the elapsed duration. */
export function gameTimeInterval(
  startedAt: GameTimestamp,
  endedAt: GameTimestamp,
): GameTimeInterval {
  return { startedAt, endedAt, elapsed: endedAt - startedAt };
}


/** Build an interval forward from a timestamp by a duration. */
export function gameTimeIntervalOf(
  startedAt: GameTimestamp,
  elapsed: GameDuration,
): GameTimeInterval {
  return { startedAt, endedAt: startedAt + elapsed, elapsed };
}


export function validateGameTimeInterval(
  interval: GameTimeInterval,
): EngineResult<GameTimeInterval> {
  const errors = findGameTimeIntervalIssues(interval);

  const traceNode = createTraceNode({
    id: "time.interval.validate",
    label: "Validate a game-time interval",
    formula: "elapsed === endedAt - startedAt; endedAt >= startedAt",
    inputs: {
      startedAt: {
        value: finite(interval.startedAt)
          ? interval.startedAt
          : String(interval.startedAt),
      },
      endedAt: {
        value: finite(interval.endedAt)
          ? interval.endedAt
          : String(interval.endedAt),
      },
      elapsed: {
        value: finite(interval.elapsed)
          ? interval.elapsed
          : String(interval.elapsed),
      },
    },
    output: errors.length === 0,
  });

  if (errors.length > 0) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  }

  return {
    success: true,
    payload: interval,
    trace: { root: traceNode },
    warnings: [],
  };
}


/**
 * An interval's length in hours.
 *
 * Every continuous rate in the engine is quoted per hour, and this is the one
 * conversion between the clock's milliseconds and that. A second copy of the
 * divisor somewhere else is a second chance to be out by sixty.
 */
export function intervalHours(interval: GameTimeInterval): number {
  return interval.elapsed / GAME_MILLISECONDS_PER_HOUR;
}


/** Milliseconds from an hour count, for placing a boundary on the timeline. */
export function hoursToDuration(hours: number): GameDuration {
  return hours * GAME_MILLISECONDS_PER_HOUR;
}


/** Whether a timestamp falls inside the interval, start inclusive. */
export function intervalContains(
  interval: GameTimeInterval,
  at: GameTimestamp,
): boolean {
  return at >= interval.startedAt && at <= interval.endedAt;
}
