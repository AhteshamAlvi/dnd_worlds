/*
 * Game-time validation.
 *
 * This module provides engine-facing validation for calendar values and
 * persisted global clock state.
 *
 * Lower-level time modules may still perform defensive assertions at their
 * own boundaries, but externally supplied or persisted time data should be
 * validated here before being accepted into authoritative game state.
 *
 * Every validator here takes caller-supplied or persisted data across a
 * domain boundary (a loaded save file, a host-supplied elapsed-time value),
 * so — matching foundation/body/damage.ts's convention for the same
 * situation — errors are reported to the "developer" audience: these are
 * integration/persistence problems for whoever wired up the clock, not
 * player-facing character validation.
 */

import {
  isValidGameDateTime,
} from "./calendar";

import type {
  GameClockCreation,
  GameClockMode,
  GameClockState,
  GameDateTime,
  GameDuration,
  GameTimestamp,
} from "./types";

import type {
  EngineError,
} from "../infrastructure/diagnostics";

import type {
  EngineResult,
  NonEmptyArray,
} from "../infrastructure/result";

import {
  createTraceNode,
  type TraceNodeInput,
} from "../infrastructure/trace";


/**
 * Validates an absolute game timestamp.
 *
 * GameTimestamp values must:
 *
 * - be finite
 * - be non-negative
 *
 * Negative timestamps would represent moments before the defined calendar
 * epoch and are not supported by the current calendar model.
 */
export function validateGameTimestamp(
  timestamp: GameTimestamp,
): EngineResult<GameTimestamp> {
  const errors: EngineError[] = [];

  if (!Number.isFinite(timestamp)) {
    errors.push({
      code: "time.timestamp.non-finite",
      message: "Game timestamp must be finite.",
      audience: "developer",
      required: "finite number >= 0",
      actual: String(timestamp),
    });
  } else if (timestamp < 0) {
    errors.push({
      code: "time.timestamp.before-epoch",
      message:
        "Game timestamp cannot occur before the calendar epoch.",
      audience: "developer",
      required: "finite number >= 0",
      actual: timestamp,
    });
  }

  return finishValidation(timestamp, errors, {
    id: "time.timestamp.validate",
    label: "Validate game timestamp",
    formula: "timestamp is finite and >= 0",
    inputs: {
      timestamp: {
        value: Number.isFinite(timestamp) ? timestamp : String(timestamp),
      },
    },
  });
}


/**
 * Validates a quantity of elapsed game time.
 *
 * A general GameDuration may be negative because some arithmetic operations,
 * such as elapsedBetween(), intentionally return negative durations when the
 * end timestamp precedes the start timestamp.
 *
 * Therefore this validator only requires durations to be finite.
 */
export function validateGameDuration(
  duration: GameDuration,
): EngineResult<GameDuration> {
  const errors: EngineError[] = [];

  if (!Number.isFinite(duration)) {
    errors.push({
      code: "time.duration.non-finite",
      message: "Game duration must be finite.",
      audience: "developer",
      required: "finite number",
      actual: String(duration),
    });
  }

  return finishValidation(duration, errors, {
    id: "time.duration.validate",
    label: "Validate game duration",
    formula: "duration is finite",
    inputs: {
      duration: {
        value: Number.isFinite(duration) ? duration : String(duration),
      },
    },
  });
}


/**
 * Validates a duration intended specifically for forward advancement.
 *
 * Unlike a general GameDuration, time advancement may not be negative.
 */
export function validateForwardDuration(
  duration: GameDuration,
): EngineResult<GameDuration> {
  const errors: EngineError[] = [];

  if (!Number.isFinite(duration)) {
    errors.push({
      code: "time.duration.non-finite",
      message: "Game duration must be finite.",
      audience: "developer",
      required: "finite number >= 0",
      actual: String(duration),
    });
  } else if (duration < 0) {
    errors.push({
      code: "time.duration.negative-advancement",
      message:
        "A duration used to advance game time cannot be negative.",
      audience: "developer",
      required: "finite number >= 0",
      actual: duration,
    });
  }

  return finishValidation(duration, errors, {
    id: "time.duration.validate_forward",
    label: "Validate forward duration",
    formula: "duration is finite and >= 0",
    inputs: {
      duration: {
        value: Number.isFinite(duration) ? duration : String(duration),
      },
    },
  });
}


/**
 * Validates a calendar-facing game date and time.
 */
export function validateGameDateTime(
  dateTime: GameDateTime,
): EngineResult<GameDateTime> {
  const errors: EngineError[] = [];

  if (!isValidGameDateTime(dateTime)) {
    errors.push({
      code: "time.calendar.invalid-date",
      message:
        "Game date/time does not represent a valid calendar moment.",
      audience: "developer",
      actual: { ...dateTime },
    });
  }

  return finishValidation(dateTime, errors, {
    id: "time.calendar.validate_datetime",
    label: "Validate game date/time",
    formula: "date/time represents a valid calendar moment",
    inputs: {
      dateTime: { value: { ...dateTime } },
    },
  });
}


/**
 * Validates a game-clock mode.
 *
 * This is primarily useful when validating persisted or external data where
 * runtime values may not actually satisfy the TypeScript type.
 */
export function validateGameClockMode(
  mode: GameClockMode,
): EngineResult<GameClockMode> {
  const errors: EngineError[] = [];

  collectModeErrors(mode, errors);

  return finishValidation(mode, errors, {
    id: "time.clock.validate_mode",
    label: "Validate game-clock mode",
    formula: 'mode is "running", "paused", or "combat"',
    inputs: {
      mode: { value: String(mode) },
    },
  });
}


/**
 * Validates a clock time scale.
 *
 * Time scale represents game milliseconds advanced per real millisecond
 * during running mode.
 *
 * Zero is intentionally invalid because stopping automatic advancement is
 * represented explicitly by paused or combat mode rather than by a zero
 * multiplier.
 */
export function validateTimeScale(
  timeScale: number,
): EngineResult<number> {
  const errors: EngineError[] = [];

  collectTimeScaleErrors(timeScale, errors);

  return finishValidation(timeScale, errors, {
    id: "time.clock.validate_time_scale",
    label: "Validate game-clock time scale",
    formula: "timeScale is finite and > 0",
    inputs: {
      timeScale: {
        value: Number.isFinite(timeScale) ? timeScale : String(timeScale),
      },
    },
  });
}


/**
 * Validates real elapsed milliseconds supplied by the host application.
 *
 * Real elapsed time must never be negative because host clock irregularities
 * must not cause the authoritative game timeline to move backwards.
 */
export function validateRealElapsedTime(
  realElapsedMs: number,
): EngineResult<number> {
  const errors: EngineError[] = [];

  if (!Number.isFinite(realElapsedMs)) {
    errors.push({
      code: "time.clock.non-finite-real-elapsed",
      message:
        "Elapsed real time supplied to the game clock must be finite.",
      audience: "developer",
      required: "finite number >= 0",
      actual: String(realElapsedMs),
    });
  } else if (realElapsedMs < 0) {
    errors.push({
      code: "time.clock.negative-real-elapsed",
      message:
        "Elapsed real time supplied to the game clock cannot be negative.",
      audience: "developer",
      required: "finite number >= 0",
      actual: realElapsedMs,
    });
  }

  return finishValidation(realElapsedMs, errors, {
    id: "time.clock.validate_real_elapsed",
    label: "Validate real elapsed time",
    formula: "realElapsedMs is finite and >= 0",
    inputs: {
      realElapsedMs: {
        value: Number.isFinite(realElapsedMs) ? realElapsedMs : String(realElapsedMs),
      },
    },
  });
}


/**
 * Validates the input used to initialize a new global game clock.
 */
export function validateGameClockCreation(
  creation: GameClockCreation,
): EngineResult<GameClockCreation> {
  const errors: EngineError[] = [];

  if (!isValidGameDateTime(creation.startDateTime)) {
    errors.push({
      code: "time.clock.invalid-start-date",
      message:
        "Game clock must begin at a valid calendar date and time.",
      audience: "developer",
      actual: { ...creation.startDateTime },
    });
  }

  if (creation.timeScale !== undefined) {
    collectTimeScaleErrors(creation.timeScale, errors);
  }

  if (creation.mode !== undefined) {
    collectModeErrors(creation.mode, errors);
  }

  return finishValidation(creation, errors, {
    id: "time.clock.validate_creation",
    label: "Validate game-clock creation",
    formula: "startDateTime is valid; timeScale and mode, if given, are valid",
    inputs: {
      startDateTime: { value: { ...creation.startDateTime } },
      timeScale: { value: creation.timeScale ?? null },
      mode: { value: creation.mode ?? null },
    },
  });
}


/**
 * Validates the complete persistent state of the authoritative game clock.
 */
export function validateGameClockState(
  clock: GameClockState,
): EngineResult<GameClockState> {
  const errors: EngineError[] = [];

  collectTimestampErrors(clock.currentTime, "current", errors);
  collectTimestampErrors(clock.campaignStartedAt, "campaign-start", errors);
  collectModeErrors(clock.mode, errors);
  collectTimeScaleErrors(clock.timeScale, errors);

  if (!Number.isFinite(clock.fractionalMs)) {
    errors.push({
      code: "time.clock.non-finite-fraction",
      message:
        "Clock fractional milliseconds must be finite.",
      audience: "developer",
      required: "finite number in [0, 1)",
      actual: String(clock.fractionalMs),
    });
  } else if (
    clock.fractionalMs < 0 ||
    clock.fractionalMs >= 1
  ) {
    errors.push({
      code: "time.clock.invalid-fraction",
      message:
        "Clock fractional milliseconds must be at least 0 and less than 1.",
      audience: "developer",
      required: "finite number in [0, 1)",
      actual: clock.fractionalMs,
    });
  }

  /*
   * The campaign cannot begin after the current authoritative time.
   */
  if (
    Number.isFinite(clock.currentTime) &&
    Number.isFinite(clock.campaignStartedAt) &&
    clock.currentTime < clock.campaignStartedAt
  ) {
    errors.push({
      code: "time.clock.before-campaign-start",
      message:
        "Current game time cannot occur before the campaign start time.",
      audience: "developer",
      required: "currentTime >= campaignStartedAt",
      actual: {
        currentTime: clock.currentTime,
        campaignStartedAt: clock.campaignStartedAt,
      },
    });
  }

  return finishValidation(clock, errors, {
    id: "time.clock.validate_state",
    label: "Validate game-clock state",
    formula: "timestamps, mode, timeScale, and fractionalMs are all valid, and currentTime >= campaignStartedAt",
    inputs: {
      currentTime: {
        value: Number.isFinite(clock.currentTime) ? clock.currentTime : String(clock.currentTime),
      },
      campaignStartedAt: {
        value: Number.isFinite(clock.campaignStartedAt)
          ? clock.campaignStartedAt
          : String(clock.campaignStartedAt),
      },
      mode: { value: String(clock.mode) },
      timeScale: {
        value: Number.isFinite(clock.timeScale) ? clock.timeScale : String(clock.timeScale),
      },
      fractionalMs: {
        value: Number.isFinite(clock.fractionalMs) ? clock.fractionalMs : String(clock.fractionalMs),
      },
    },
  });
}


/**
 * Collects timestamp validation errors without creating an intermediate
 * EngineResult.
 */
function collectTimestampErrors(
  timestamp: GameTimestamp,
  kind: "current" | "campaign-start",
  errors: EngineError[],
): void {
  if (!Number.isFinite(timestamp)) {
    errors.push({
      code:
        kind === "current"
          ? "time.clock.non-finite-current-time"
          : "time.clock.non-finite-campaign-start",
      message:
        kind === "current"
          ? "Current game time must be finite."
          : "Campaign start time must be finite.",
      audience: "developer",
      required: "finite number >= 0",
      actual: String(timestamp),
    });

    return;
  }

  if (timestamp < 0) {
    errors.push({
      code:
        kind === "current"
          ? "time.clock.current-before-epoch"
          : "time.clock.campaign-start-before-epoch",
      message:
        kind === "current"
          ? "Current game time cannot occur before the calendar epoch."
          : "Campaign start time cannot occur before the calendar epoch.",
      audience: "developer",
      required: "finite number >= 0",
      actual: timestamp,
    });
  }
}


/**
 * Collects mode validation errors.
 */
function collectModeErrors(
  mode: GameClockMode,
  errors: EngineError[],
): void {
  if (
    mode !== "running" &&
    mode !== "paused" &&
    mode !== "combat"
  ) {
    errors.push({
      code: "time.clock.invalid-mode",
      message: `Invalid game-clock mode: ${String(mode)}.`,
      audience: "developer",
      required: '"running" | "paused" | "combat"',
      actual: String(mode),
    });
  }
}


/**
 * Collects time-scale validation errors.
 */
function collectTimeScaleErrors(
  timeScale: number,
  errors: EngineError[],
): void {
  if (!Number.isFinite(timeScale)) {
    errors.push({
      code: "time.clock.non-finite-scale",
      message: "Game-clock time scale must be finite.",
      audience: "developer",
      required: "finite number > 0",
      actual: String(timeScale),
    });

    return;
  }

  if (timeScale <= 0) {
    errors.push({
      code: "time.clock.invalid-scale",
      message:
        "Game-clock time scale must be greater than zero.",
      audience: "developer",
      required: "finite number > 0",
      actual: timeScale,
    });
  }
}


/**
 * Produces the engine's standard validation result — the same
 * success/payload/trace/warnings envelope every other validator in the
 * engine returns (see foundation/attributes/validation.ts for the pattern
 * this mirrors).
 */
function finishValidation<T>(
  value: T,
  errors: EngineError[],
  traceInput: TraceNodeInput,
): EngineResult<T> {
  const trace = {
    root: createTraceNode({
      ...traceInput,
      output: errors.length === 0,
    }),
  };

  if (errors.length > 0) {
    return {
      success: false,
      trace,
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  }

  return {
    success: true,
    payload: value,
    trace,
    warnings: [],
  };
}
