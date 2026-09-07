/*
 * How long a thing takes to GET there.
 *
 * Three durations are routinely confused and this file owns exactly one of
 * them. Execution duration is how long the actor spends performing the act.
 * Travel duration is how long whatever was sent takes to arrive. Consequence
 * duration is how long the result lasts. A thrown spear has all three and they
 * are three different numbers; collapsing any two of them is how a projectile
 * ends up landing before it was thrown.
 *
 * Travel is either instantaneous — the mechanic arrives in the same instant it
 * is used, which is the honest model for most melee and for effects that are
 * not modelled as objects crossing a gap — or it has a speed, and the duration
 * follows from the distance. The engine does not simulate flight; it converts.
 */

import {
  createTraceNode,
  type EngineTrace,
} from "../infrastructure/trace";
import type { EngineError } from "../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
} from "../infrastructure/result";
import { seconds } from "../time/duration";
import type { GameDuration } from "../time/types";
import { findDistanceIssues, type Distance } from "./distance";


export interface InstantaneousTravel {
  readonly kind: "instantaneous";
}


export interface SpeedTravel {
  readonly kind: "speed";
  readonly metresPerSecond: number;
}


export type SpatialTravel = InstantaneousTravel | SpeedTravel;


export const INSTANTANEOUS_TRAVEL: InstantaneousTravel = {
  kind: "instantaneous",
};


export function findTravelIssues(
  travel: SpatialTravel,
): readonly EngineError[] {
  if (travel.kind === "instantaneous") return [];

  if (travel.kind === "speed") {
    /*
     * Zero is rejected rather than treated as "never arrives". A speed of zero
     * is what an uninitialised field looks like, and the resulting infinite
     * duration would propagate into the clock.
     */
    if (
      !Number.isFinite(travel.metresPerSecond) ||
      travel.metresPerSecond <= 0
    ) {
      return [{
        code: "spatial.travel.speed.invalid",
        message: "Travel speed must be a finite, positive number of metres per second.",
        audience: "developer",
        required: "finite metres/second > 0",
        actual: String(travel.metresPerSecond),
      }];
    }

    return [];
  }

  return [{
    code: "spatial.travel.kind.invalid",
    message: "Travel must be either instantaneous or speed-based.",
    audience: "developer",
    required: ["instantaneous", "speed"],
    actual: String((travel as { kind?: unknown }).kind),
  }];
}


/**
 * How long this travel takes to cover this distance.
 *
 * Accepts either kind of distance on purpose: a bullet crosses the straight
 * line, a thrown rope follows a route, and which one applies is the calling
 * mechanic's decision rather than this converter's.
 */
export function travelDuration(
  travel: SpatialTravel,
  distance: Distance,
): EngineResult<GameDuration> {
  const issues = [
    ...findTravelIssues(travel),
    ...findDistanceIssues(distance),
  ];

  const durationSeconds = issues.length === 0 && travel.kind === "speed"
    ? distance.metres / travel.metresPerSecond
    : 0;

  const trace: EngineTrace = {
    root: createTraceNode({
      id: "spatial.travel.duration",
      label: "Resolve Travel Duration",
      formula: travel.kind === "speed"
        ? "metres / metres per second"
        : "instantaneous arrival",
      inputs: {
        metres: { value: distance.metres },
        metresPerSecond: {
          value: travel.kind === "speed" ? travel.metresPerSecond : 0,
        },
      },
      output: durationSeconds,
    }),
  };

  const firstIssue = issues[0];

  if (firstIssue !== undefined) {
    return engineFailure(trace, [firstIssue, ...issues.slice(1)]);
  }

  return engineSuccess(seconds(durationSeconds), trace);
}
