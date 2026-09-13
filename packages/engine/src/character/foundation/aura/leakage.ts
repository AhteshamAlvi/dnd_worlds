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
 *   L_minute = Physiological Aura Output Capacity
 *
 * Per MINUTE, and scaled by what the body can force OUT rather than by how
 * long it could have stayed awake. Open nodes with nothing holding them shut
 * bleed at the rate those nodes can pass, which is the Output Capacity — the
 * character is, involuntarily, doing the one thing their body is physically
 * capable of doing with Aura, continuously and with no benefit at all.
 *
 * The other figures follow from that one number:
 *
 *   per second          L_minute / 60
 *   per Round           L_minute / (60 / SECONDS_PER_COMBAT_ROUND)
 *   per hour            L_minute x 60
 *
 * The Round length is IMPORTED rather than written down. time/duration.ts owns
 * it — its own comment says a second copy would be a second thing to keep in
 * step — and an `AURA_ROUND_SECONDS = 2` here was exactly that copy.
 *
 * The ordinary CON 13 / VIT 13 character has 100 Maximum Aura and 20 Output,
 * so they leak 20 a minute and are empty in five. A fresh awakener is in
 * immediate, serious trouble, which is the point of the state.
 *
 *
 * WHAT THIS REPLACED, AND WHY
 * ---------------------------
 *
 * This used to be `A_max / H_wake` — the character emptied in exactly as long
 * as they could have stayed awake, which for the same character was 48 hours.
 * That made uncontained leakage a slow background condition rather than an
 * emergency, and it tied an Aura rate to a Body clock with nothing to do with
 * node containment: wakefulness measures physiological strain over time, and
 * how long somebody can stay awake does not decide how fast Aura escapes an
 * open node.
 *
 * Wakefulness is entirely intact as a Body and Fatigue concern. It simply no
 * longer decides this.
 *
 * A partially depleted character lasts proportionally less: half full is two
 * and a half minutes, not twenty-four hours.
 *
 * Control does not apply. Leakage is not something the character is doing.
 *
 * The UNAWAKENED case is not this. Half-open nodes leak too, and what escapes
 * becomes passive pseudo-Chu rather than being lost — see aura/passive.ts. An
 * ordinary person does not bleed out, and nothing here applies to them.
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
import type { GameTimestamp } from "../../../time/types";
import { SECONDS_PER_COMBAT_ROUND } from "../../../time/duration";


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

  /*
   * The exact world time the reserve reached zero.
   *
   * An absolute timestamp rather than an offset into whatever interval
   * happened to contain it. A character who collapsed at 03:41 collapsed at
   * 03:41 whether the GM advanced the night in one step or in eight, and an
   * offset would say something different in each case.
   */
  readonly at: GameTimestamp;

  readonly requests: readonly AuraCollapseRequest[];
}

/** Every request an uncontained exhaustion makes. */
export const UNCONTAINED_COLLAPSE_REQUESTS: readonly AuraCollapseRequest[] = [
  "end-uncontained-state",
  "forced-zetsu",
  "blackout",
  "clear-usable-output",
];


const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;


export interface UncontainedLeakage {
  /** The Physiological Aura Output Capacity the rate IS. */
  readonly physiologicalOutput: number;

  readonly ratePerMinute: number;
  readonly ratePerSecond: number;

  /** Per 2-second Round, so a combat consumer needs no conversion of its own. */
  readonly ratePerRound: number;

  /** The one the time solver integrates. */
  readonly ratePerHour: number;

  /** From the supplied Current Aura, at this rate and nothing else. */
  readonly minutesToExhaustion: number;
  readonly hoursToExhaustion: number;
}


/**
 * The rate an uncontained character loses Aura, and how long they have.
 *
 * Every rate is derived from the ONE per-minute figure rather than computed
 * independently, which is what makes them exactly consistent: an hour of
 * leakage is sixty minutes of leakage and 1,800 Rounds of leakage, to the last
 * bit. Deriving each from the Output Capacity separately would leave them
 * agreeing only to within rounding, and interval invariance would fail on the
 * difference.
 *
 * `hoursToExhaustion` assumes nothing else is happening — no recovery, no
 * expenditure. It is the projection a GM wants ("how long has this person
 * got"), not a prediction of the next transition, which composes leakage with
 * everything else.
 */
export function deriveUncontainedLeakage(
  physiologicalOutput: number,
  currentAura: number,
): UncontainedLeakage {
  const ratePerMinute = physiologicalOutput;

  const minutesToExhaustion = ratePerMinute > 0
    ? currentAura / ratePerMinute
    : Number.POSITIVE_INFINITY;

  return {
    physiologicalOutput,
    ratePerMinute,
    ratePerSecond: ratePerMinute / SECONDS_PER_MINUTE,
    ratePerRound:
      ratePerMinute / (SECONDS_PER_MINUTE / SECONDS_PER_COMBAT_ROUND),
    ratePerHour: ratePerMinute * MINUTES_PER_HOUR,
    minutesToExhaustion,
    hoursToExhaustion: minutesToExhaustion / MINUTES_PER_HOUR,
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
  physiologicalOutput: number,
  currentAura: number,
  hours: number,
): EngineResult<UncontainedLeakageResult> {
  const traceNode = createTraceNode({
    id: "aura.leakage.uncontained",
    label: "Resolve uncontained Aura leakage",
    formula: "leaked = physiologicalOutput * 60 * hours",
    inputs: {
      physiologicalOutput: {
        value: Number.isFinite(physiologicalOutput)
          ? physiologicalOutput
          : String(physiologicalOutput),
      },
      currentAura: {
        value: Number.isFinite(currentAura) ? currentAura : String(currentAura),
      },
      hours: { value: Number.isFinite(hours) ? hours : String(hours) },
    },
  });

  if (
    !Number.isFinite(physiologicalOutput) ||
    physiologicalOutput < 0 ||
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
          "Uncontained leakage requires a finite non-negative Output Capacity and reserve.",
        audience: "developer",
        required: "finite numbers >= 0",
        actual: {
          current: Number.isFinite(currentAura) ? currentAura : String(currentAura),
          physiologicalOutput: Number.isFinite(physiologicalOutput)
            ? physiologicalOutput
            : String(physiologicalOutput),
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

  const leakage = deriveUncontainedLeakage(physiologicalOutput, currentAura);
  const uncappedAmount = leakage.ratePerHour * hours;

  traceNode.output = {
    ratePerMinute: leakage.ratePerMinute,
    ratePerHour: leakage.ratePerHour,
    minutesToExhaustion: leakage.minutesToExhaustion,
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
export function uncontainedCollapse(at: GameTimestamp): AuraCollapse {
  return {
    reason: "uncontained-leakage-exhausted",
    at,
    requests: UNCONTAINED_COLLAPSE_REQUESTS,
  };
}
