/*
 * Outward flow — Output deliberately opened and emitted, continuously.
 *
 * The generic shape of "the character is pouring Aura out of their whole body
 * at a chosen Output". Ren is what supplies one today, and nothing here says
 * so: the time solver is handed an id, a provenance label, an Output and an
 * optional end, and integrates exactly that.
 *
 *
 * WHAT A FLOW DOES TO THE INTERVAL
 * --------------------------------
 *
 * While it runs, the character's access is their ordinary access with an
 * `outward-flow` override on it. That override REPLACES whatever the ordinary
 * state was doing with the surface — a coating is set aside, its residual leak
 * stops, and an uncontained character's open-node bleed stops too — because
 * the deliberate flow is what is leaving the body now:
 *
 *   flowPerMinute = output
 *   flowPerHour   = output * 60
 *
 * It is active Nen, so natural recovery is zero for as long as it runs.
 * Physical consumption, upkeep and scheduled costs are independent and still
 * apply.
 *
 * The flow is charged HERE and nowhere else. An activity record describing the
 * same flow carries no upkeep that anything bills, so there is exactly one
 * settlement authority for it.
 *
 *
 * WHEN A FLOW STOPS
 * -----------------
 *
 * At the earliest of:
 *
 *   ended        the supplied end instant — an expiry the caller computed
 *   access-lost  suppression closed the nodes
 *   unfunded     the reserve reached zero with the flow still draining it
 *
 * At that instant the ordinary access comes back, and every rate is resolved
 * again from there for the rest of the interval.
 */

import type { EngineError } from "../../../infrastructure/diagnostics";
import { describeDiagnosticValue } from "../../../infrastructure/diagnostics";
import { GAME_MINUTES_PER_HOUR } from "../../../time/duration";
import type { GameTimeInterval } from "../../../time/interval";
import type { GameTimestamp } from "../../../time/types";


export interface AuraOutwardFlowCommitment {
  /** Which activity the flow belongs to. Reported back on a stop. */
  readonly id: string;

  /** Provenance. Nothing branches on it. */
  readonly source: string;

  /** Output opened and emitted outward, per minute. */
  readonly output: number;

  /*
   * When the flow stops on its own, if it does.
   *
   * Absent for a flow with no physiological limit. The caller computes it;
   * the solver only honours it as a boundary.
   */
  readonly endsAt?: GameTimestamp;
}


export const AURA_OUTWARD_FLOW_STOP_REASONS = [
  "ended",
  "access-lost",
  "unfunded",
] as const;

export type AuraOutwardFlowStopReason =
  typeof AURA_OUTWARD_FLOW_STOP_REASONS[number];


export interface AuraOutwardFlowStop {
  readonly id: string;
  readonly source: string;
  readonly reason: AuraOutwardFlowStopReason;

  /** The exact instant it stopped, however the interval was subdivided. */
  readonly at: GameTimestamp;
}


/** The hourly rate a flow drains, from the one per-minute figure. */
export function outwardFlowRatePerHour(output: number): number {
  return output * GAME_MINUTES_PER_HOUR;
}


/**
 * Everything wrong with a supplied flow, judged against the body it runs in.
 *
 * `physiologicalOutput` bounds it: a flow is a share of the Output the body
 * can pass, and one larger than that is a caller that skipped the principle's
 * own ceiling.
 */
export function findAuraOutwardFlowIssues(
  flow: AuraOutwardFlowCommitment,
  interval: GameTimeInterval,
  physiologicalOutput: number,
): readonly EngineError[] {
  if (flow === null || typeof flow !== "object") {
    return [{
      code: "aura.outward_flow.malformed",
      message: "An outward flow must be an object.",
      audience: "developer",
      required: "AuraOutwardFlowCommitment",
      actual: describeDiagnosticValue(flow),
    }];
  }

  const errors: EngineError[] = [];

  if (typeof flow.id !== "string" || flow.id.trim().length === 0) {
    errors.push({
      code: "aura.outward_flow.id.invalid",
      message: "An outward flow must name the activity it belongs to.",
      audience: "developer",
      required: "non-empty string",
      actual: describeDiagnosticValue(flow.id),
    });
  }

  if (typeof flow.source !== "string" || flow.source.trim().length === 0) {
    errors.push({
      code: "aura.outward_flow.source.invalid",
      message: "An outward flow must name what produced it.",
      audience: "developer",
      required: "non-empty string",
      actual: describeDiagnosticValue(flow.source),
    });
  }

  const output = flow.output;

  if (typeof output !== "number" || !Number.isFinite(output) || output <= 0) {
    errors.push({
      code: "aura.outward_flow.output.invalid",
      message: "An outward flow must emit a finite, positive Output.",
      audience: "developer",
      required: "finite number > 0",
      actual: describeDiagnosticValue(output),
    });
  } else if (output > physiologicalOutput) {
    errors.push({
      code: "aura.outward_flow.output.exceeds_physiological",
      message:
        "An outward flow cannot emit more than the body's Physiological Output.",
      audience: "developer",
      required: `<= ${physiologicalOutput}`,
      actual: output,
    });
  }

  if (flow.endsAt !== undefined) {
    if (typeof flow.endsAt !== "number" || !Number.isFinite(flow.endsAt)) {
      errors.push({
        code: "aura.outward_flow.end.invalid",
        message: "An outward flow's end must be a finite timestamp.",
        audience: "developer",
        required: "finite GameTimestamp",
        actual: describeDiagnosticValue(flow.endsAt),
      });
    } else if (flow.endsAt <= interval.startedAt) {
      /*
       * A flow that ended before this interval opened is not running in it.
       * The caller should have stopped it when it ended; charging for it here
       * would bill time it was not up.
       */
      errors.push({
        code: "aura.outward_flow.end.stale",
        message: "This outward flow had already ended before the interval began.",
        audience: "developer",
        required: `endsAt > ${interval.startedAt}`,
        actual: flow.endsAt,
      });
    }
  }

  return errors;
}
