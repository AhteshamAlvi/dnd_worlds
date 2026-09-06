/*
 * Uncontained leakage — what happens to an awakened character who never
 * learned Ten.
 *
 * This is the state that makes awakening dangerous rather than free. The nodes
 * are open, the unawakened body's pseudo-Chu is gone, nothing is containing
 * anything, and Aura pours out continuously while reinforcing nothing at all.
 * A character in it has zero internal defensive Density, no surface coating,
 * and a reserve running down whether or not they do anything.
 *
 *
 * THE RATE
 * --------
 *
 *   L = A_max / H_wake
 *
 * Scaled by the character's own maximum WAKEFULNESS rather than by a flat
 * fraction, which is what makes the number mean something: an uncontained
 * character empties in exactly as long as they could have stayed awake. The
 * ordinary CON 10 / VIT 10 character has 10 Aura and 48 waking hours, so they
 * leak 10/48 ≈ 0.2083 per hour and hit zero at hour 48 exactly. A far more
 * powerful character has both a bigger reserve and a longer wakefulness limit,
 * and gets proportionally longer — not proportionally to their Aura, which
 * would be centuries.
 *
 * A partially depleted character lasts proportionally less. Half full is
 * twenty-four hours, not forty-eight.
 *
 * Control does not apply. Leakage is not something the character is doing.
 *
 *
 * COLLAPSE IS A BOUNDARY RESULT
 * -----------------------------
 *
 * Reaching zero this way is not simply "0 Aura". The body shuts the nodes on
 * its own: the uncontained state ends, forced Zetsu begins, and the character
 * blacks out. None of that is implemented here — Zetsu is a principle and
 * unconsciousness is a Condition — so what this returns is a typed set of
 * REQUESTS for the systems that own those things. Aura's own part of it, the
 * loss of all usable Output and all defensive Density, follows from the empty
 * reserve and is stated in the requests so nothing has to infer it.
 */

import type { EngineResult } from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";
import { deriveMaximumWakefulHours } from "../body/endurance";


/*
 * What a collapse asks the rest of the engine to do.
 *
 * Closed, so a caller that handles three of the four is a compile error rather
 * than a character who blacked out but kept their Ren up.
 */
export const AURA_COLLAPSE_REQUESTS = [
  "end-uncontained-state",
  "forced-zetsu",
  "blackout",
  "clear-usable-output",
] as const;

export type AuraCollapseRequest = typeof AURA_COLLAPSE_REQUESTS[number];

export const AURA_COLLAPSE_REASONS = ["uncontained-leakage-exhausted"] as const;

export type AuraCollapseReason = typeof AURA_COLLAPSE_REASONS[number];

export interface AuraCollapse {
  readonly reason: AuraCollapseReason;

  /** Hours into the interval at which the reserve reached zero. */
  readonly atHours: number;

  readonly requests: readonly AuraCollapseRequest[];
}

/** Every request an uncontained exhaustion makes. */
export const UNCONTAINED_COLLAPSE_REQUESTS: readonly AuraCollapseRequest[] = [
  "end-uncontained-state",
  "forced-zetsu",
  "blackout",
  "clear-usable-output",
];


export interface UncontainedLeakage {
  readonly maximumAura: number;
  readonly maximumWakefulHours: number;
  readonly ratePerHour: number;

  /** From the supplied Current Aura, at this rate and nothing else. */
  readonly hoursToExhaustion: number;
}


/**
 * The rate an uncontained character loses Aura, and how long they have.
 *
 * `hoursToExhaustion` assumes nothing else is happening — no recovery, no
 * expenditure. It is the projection a GM wants ("how long has this person
 * got"), not a prediction of the next transition, which composes leakage with
 * everything else.
 */
export function deriveUncontainedLeakage(
  maximumAura: number,
  currentAura: number,
): UncontainedLeakage {
  const maximumWakefulHours = deriveMaximumWakefulHours(maximumAura);
  const ratePerHour = maximumAura / maximumWakefulHours;

  return {
    maximumAura,
    maximumWakefulHours,
    ratePerHour,
    hoursToExhaustion: ratePerHour > 0
      ? currentAura / ratePerHour
      : Number.POSITIVE_INFINITY,
  };
}


export interface UncontainedLeakageResult {
  readonly leakage: UncontainedLeakage;
  readonly hours: number;

  /** Before the Current-Aura cap: rate x hours. */
  readonly uncappedAmount: number;

  /** What was actually available to lose. */
  readonly amount: number;
}


/**
 * Resolve how much Aura an interval of uncontained leakage costs.
 *
 * Capped at what is there. A character cannot leak below empty, and the
 * collapse that empties them is reported by the time transition, which is the
 * only thing that knows whether recovery was also running.
 */
export function resolveUncontainedLeakage(
  maximumAura: number,
  currentAura: number,
  hours: number,
): EngineResult<UncontainedLeakageResult> {
  const traceNode = createTraceNode({
    id: "aura.leakage.uncontained",
    label: "Resolve uncontained Aura leakage",
    formula: "leaked = (maximumAura / maximumWakefulHours) * hours",
    inputs: {
      maximumAura: {
        value: Number.isFinite(maximumAura) ? maximumAura : String(maximumAura),
      },
      currentAura: {
        value: Number.isFinite(currentAura) ? currentAura : String(currentAura),
      },
      hours: { value: Number.isFinite(hours) ? hours : String(hours) },
    },
  });

  if (
    !Number.isFinite(maximumAura) ||
    maximumAura < 0 ||
    !Number.isFinite(currentAura) ||
    currentAura < 0
  ) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [{
        code: "aura.leakage.pool.invalid",
        message:
          "Uncontained leakage requires a finite non-negative Aura pool.",
        audience: "developer",
        required: "finite numbers >= 0",
        actual: {
          current: Number.isFinite(currentAura) ? currentAura : String(currentAura),
          maximum: Number.isFinite(maximumAura) ? maximumAura : String(maximumAura),
        },
      }],
    };
  }

  if (!Number.isFinite(hours) || hours < 0) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [{
        code: "aura.leakage.duration.invalid",
        message: "Leakage duration must be a finite non-negative number of hours.",
        audience: "developer",
        required: "finite number >= 0",
        actual: Number.isFinite(hours) ? hours : String(hours),
      }],
    };
  }

  const leakage = deriveUncontainedLeakage(maximumAura, currentAura);
  const uncappedAmount = leakage.ratePerHour * hours;

  traceNode.output = {
    maximumWakefulHours: leakage.maximumWakefulHours,
    ratePerHour: leakage.ratePerHour,
    hoursToExhaustion: leakage.hoursToExhaustion,
    uncappedAmount,
  };

  return {
    success: true,
    payload: {
      leakage,
      hours,
      uncappedAmount,
      amount: Math.min(currentAura, uncappedAmount),
    },
    trace: { root: traceNode },
    warnings: [],
  };
}


/** The collapse an exhausted uncontained character produces. */
export function uncontainedCollapse(atHours: number): AuraCollapse {
  return {
    reason: "uncontained-leakage-exhausted",
    atHours,
    requests: UNCONTAINED_COLLAPSE_REQUESTS,
  };
}
