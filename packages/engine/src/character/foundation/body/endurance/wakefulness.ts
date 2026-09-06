/*
 * Wakefulness — how long the body has been running.
 *
 * The only stored value in the endurance folder, and only because hours awake
 * genuinely cannot be recomputed. Everything else about tiredness derives from
 * this number and from how drained the Aura reserve is.
 *
 *
 * HOW LONG A BODY CAN STAY UP
 * ---------------------------
 *
 *   D_wake = max(1, floor(2 + log10(A_max / 10)))
 *   H_wake = 24 x D_wake
 *
 * Logarithmic in Maximum Aura, which is the point. An ordinary person manages
 * two days; a character with a hundred thousand times the Aura manages seven,
 * not two hundred thousand. Ten times the power buys one more day, and the
 * floor makes that arrive in whole days rather than in fractions nobody can
 * plan around.
 *
 *   A_max            10   100   1,000   10,000   1e6   1e9   4e9
 *   H_wake (hours)   48    72      96      120   168   240   240
 *
 * The last two are equal, and that is the floor doing its job rather than a
 * cap: 4e9 sits at 10.6 days before flooring, and 10 days is what a body gets
 * for it.
 *
 *
 * SLEEP IS THE ONLY THING THAT PAYS THE DEBT
 * ------------------------------------------
 *
 *   H_awake' = max(0, H_awake - 2 x H_sleep)
 *
 * Two waking hours cleared per hour slept, so a full night undoes a long day.
 * Intentional rest recovers Aura and clears nothing — sitting down is not
 * sleeping, and a model in which it were would make sleep optional. Resting
 * behind a Zetsu is the same: it restores Aura faster and leaves the character
 * exactly as short of sleep, unless some future explicit effect says otherwise.
 */

import type { EngineError } from "../../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../../infrastructure/result";
import { createTraceNode } from "../../../../infrastructure/trace";

import type {
  CharacterWakefulnessState,
  ResolvedWakefulness,
  WakefulnessMode,
  WakefulnessTransition,
} from "./types";


/** Days of wakefulness the reference body gets before the Aura term. */
const BASE_WAKEFUL_DAYS = 2;

/** The Maximum Aura the logarithm is measured against. */
const REFERENCE_MAXIMUM_AURA = 10;

const HOURS_PER_DAY = 24;

/*
 * Waking hours cleared per hour of sleep.
 *
 * Centralized for calibration. Two means eight hours of sleep clears sixteen
 * hours awake, so an ordinary day/night cycle roughly breaks even and a short
 * night leaves a debt that accumulates — which is the behaviour the Fatigue
 * curve is built to punish.
 */
export const WAKING_HOURS_CLEARED_PER_HOUR_SLEPT = 2;


/**
 * How many whole days this body can stay awake.
 *
 * Takes Maximum Aura as a plain number. Body does not import the Aura domain;
 * the Aura domain imports this one.
 */
export function deriveMaximumWakefulDays(maximumAura: number): number {
  if (!Number.isFinite(maximumAura) || maximumAura <= 0) return 1;

  return Math.max(
    1,
    Math.floor(
      BASE_WAKEFUL_DAYS +
      Math.log10(maximumAura / REFERENCE_MAXIMUM_AURA),
    ),
  );
}

/** The same figure in hours, which is what everything downstream uses. */
export function deriveMaximumWakefulHours(maximumAura: number): number {
  return deriveMaximumWakefulDays(maximumAura) * HOURS_PER_DAY;
}


/**
 * A character's wakefulness against their own limit.
 *
 * `fraction` is clamped to 1. Past the limit a character is at Fatigue 10 and
 * unconscious; how far past is not a distinction the model needs, and letting
 * the fraction run to 3 would put the quadratic Fatigue curve at 90.
 */
export function resolveWakefulness(
  state: CharacterWakefulnessState,
  maximumAura: number,
): ResolvedWakefulness {
  const maximumHours = deriveMaximumWakefulHours(maximumAura);

  const hoursAwake = Number.isFinite(state.hoursAwake)
    ? Math.max(0, state.hoursAwake)
    : 0;

  return {
    hoursAwake,
    maximumHours,
    fraction: Math.min(1, Math.max(0, hoursAwake / maximumHours)),
  };
}


/**
 * Judge a stored wakefulness value on its own.
 *
 * Split out of `advanceWakefulness` so that every caller holding a stored
 * `hoursAwake` judges it the same way. `advanceAuraTime` used to repair the
 * number instead — `Math.max(0, hoursAwake)` quietly turned a negative into
 * zero and let a NaN through untouched, so the same state the dedicated
 * transition refuses came back out of the Aura solver as a result.
 */
export function findWakefulnessStateIssues(
  state: CharacterWakefulnessState,
): readonly EngineError[] {
  if (Number.isFinite(state.hoursAwake) && state.hoursAwake >= 0) return [];

  return [{
    code: "body.wakefulness.hours_awake.invalid",
    message: "Accumulated waking hours must be a finite non-negative number.",
    audience: "developer",
    required: "finite number >= 0",
    actual: Number.isFinite(state.hoursAwake)
      ? state.hoursAwake
      : String(state.hoursAwake),
  }];
}


/**
 * Advance wakefulness across an interval spent one way.
 *
 * Ordinary waking and intentional rest both ACCRUE. That is the rule the whole
 * sleep-debt model rests on: a character who sits quietly for eight hours has
 * been awake for eight more hours, and only sleep subtracts.
 */
export function advanceWakefulness(
  state: CharacterWakefulnessState,
  mode: WakefulnessMode,
  elapsedHours: number,
): EngineResult<WakefulnessTransition> {
  const traceNode = createTraceNode({
    id: "body.wakefulness.advance",
    label: "Advance wakefulness",
    formula:
      "sleep: max(0, hoursAwake - 2 * hours); otherwise hoursAwake + hours",

    decisionId: "body.fatigue.wakefulness-and-depletion",
    inputs: {
      mode: { value: mode },
      hoursAwake: {
        value: Number.isFinite(state.hoursAwake)
          ? state.hoursAwake
          : String(state.hoursAwake),
      },
      elapsedHours: {
        value: Number.isFinite(elapsedHours)
          ? elapsedHours
          : String(elapsedHours),
      },
    },
  });

  const stateIssues = findWakefulnessStateIssues(state);

  if (stateIssues.length > 0) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: stateIssues as NonEmptyArray<EngineError>,
    };
  }

  if (!Number.isFinite(elapsedHours) || elapsedHours < 0) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [{
        code: "body.wakefulness.duration.invalid",
        message: "Elapsed time must be a finite non-negative number of hours.",
        audience: "developer",
        required: "finite number >= 0",
        actual: Number.isFinite(elapsedHours)
          ? elapsedHours
          : String(elapsedHours),
      }],
    };
  }

  const hoursAwake = mode === "sleep"
    ? Math.max(
      0,
      state.hoursAwake -
      WAKING_HOURS_CLEARED_PER_HOUR_SLEPT * elapsedHours,
    )
    : state.hoursAwake + elapsedHours;

  const next: CharacterWakefulnessState = { hoursAwake };

  traceNode.output = {
    mode,
    previousHoursAwake: state.hoursAwake,
    hoursAwake,
  };

  return {
    success: true,
    payload: {
      mode,
      elapsedHours,
      previous: state,
      state: next,
      hoursChange: hoursAwake - state.hoursAwake,
    },
    trace: { root: traceNode },
    warnings: [],
  };
}
