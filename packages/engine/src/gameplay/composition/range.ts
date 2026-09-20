/*
 * Five different questions about distance, kept five different questions.
 *
 *
 * WHY THIS IS NOT ONE "range" ANSWER
 *
 * "Is it in range" sounds like one question and is at least five:
 *
 *   1. How far away is it, exactly.           (the host measured it)
 *   2. How far can this reach.                (the content authored it)
 *   3. Can what it sends actually get there.  (walls, not distance)
 *   4. Does the attack therefore land.        (1, 2 and 3 together)
 *   5. How far does the NOISE carry.          (a different domain entirely)
 *
 * Collapsing these is the single most common way a system ends up quietly
 * wrong. If (4) is the only answer available then (5) borrows it, and an
 * arrow's impact becomes inaudible one metre past the bow's maximum range —
 * a wall of silence at exactly the distance the fletching stopped mattering.
 * If (3) is folded into (2), then "behind a wall" and "too far away" become
 * the same refusal, and a target three metres away behind a door reports as
 * out of range.
 *
 * So this file answers (1) through (4) and deliberately does not answer (5).
 * Propagation lives in propagation.ts, consumes the exact measured distance
 * directly, and never reads `deliverable`.
 *
 *
 * WHAT IT TAKES, AND WHAT IT REFUSES TO TAKE
 *
 * A measurement, a capability and the host's facts about the route. Not the
 * prepared snapshot — this projector has no business knowing who is acting or
 * what the weather is doing, and taking the snapshot would make it able to
 * find out.
 */

import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import type { EngineError } from "../../infrastructure/diagnostics";
import {
  compareToDistanceInterval,
  findDistanceIntervalIssues,
  findDistanceIssues,
  type Distance,
  type DistanceComparison,
  type DistanceInterval,
  type SpatialFacts,
} from "../../spatial";


/**
 * Whether what is sent can get there, as distinct from whether it is close
 * enough.
 *
 * `unknown` is a real answer and is not optimism. A host that reported no
 * line-of-effect fact has not said the way is clear, and treating silence as
 * clear would make every host that has not implemented walls yet report every
 * shot as unimpeded. Each owning decision chooses what to do about not
 * knowing; this one only refuses to guess.
 */
export type PathFeasibility =
  | { readonly kind: "clear" }
  | { readonly kind: "blocked"; readonly blockedBy?: string }
  | { readonly kind: "obstructed"; readonly describedAs?: string }
  | { readonly kind: "unknown" };


export interface RangeProjectionInput {
  /** What the host measured. */
  readonly measured: Distance;

  /** What the content says this can reach. */
  readonly capability: DistanceInterval;

  /** What the host says about the route. */
  readonly facts?: SpatialFacts;
}


export interface RangeProjection {
  readonly measured: Distance;
  readonly capability: DistanceInterval;

  /** Distance against capability, and nothing else. */
  readonly comparison: DistanceComparison;
  readonly withinCapability: boolean;

  /** The route, independent of how long it is. */
  readonly path: PathFeasibility;

  /**
   * Whether the attempt can actually be delivered.
   *
   * Both halves, deliberately AND-ed here rather than by each caller, so no
   * consumer can accidentally check one and believe it checked both. A path
   * that is merely `unknown` does not block delivery — not knowing is not the
   * same as knowing it is blocked — while `blocked` does.
   */
  readonly deliverable: boolean;

  readonly trace: TraceNode;
}


export function projectPathFeasibility(
  facts: SpatialFacts | undefined,
): PathFeasibility {
  const lineOfEffect = facts?.lineOfEffect;

  if (lineOfEffect?.clear === false) {
    return {
      kind: "blocked",
      ...(lineOfEffect.blockedBy === undefined
        ? {}
        : { blockedBy: lineOfEffect.blockedBy }),
    };
  }

  const obstruction = facts?.obstruction;

  if (obstruction?.obstructed === true) {
    return {
      kind: "obstructed",
      ...(obstruction.describedAs === undefined
        ? {}
        : { describedAs: obstruction.describedAs }),
    };
  }

  return lineOfEffect?.clear === true ? { kind: "clear" } : { kind: "unknown" };
}


/**
 * Everything structurally wrong with the inputs, before any of them are used.
 *
 * Returned rather than thrown, and checked before the comparison runs, so that
 * a malformed capability produces a diagnostic about the capability rather
 * than an `incomparable` outcome that blames the measurement.
 */
export function findRangeProjectionIssues(
  input: RangeProjectionInput,
  path = "range",
): readonly EngineError[] {
  return [
    ...findDistanceIssues(input?.measured).map((error) => ({
      ...error,
      subject: error.subject ?? { kind: "field", id: `${path}.measured` },
    })),
    ...findDistanceIntervalIssues(input?.capability).map((error) => ({
      ...error,
      subject: error.subject ?? { kind: "field", id: `${path}.capability` },
    })),
  ];
}


export function projectRange(input: RangeProjectionInput): RangeProjection {
  const comparison = compareToDistanceInterval(input.capability, input.measured);
  const withinCapability = comparison.outcome === "within";
  const path = projectPathFeasibility(input.facts);

  const deliverable = withinCapability && path.kind !== "blocked";

  const trace = createTraceNode({
    id: "composition.range",
    label: "Project range",
    inputs: {
      measuredMetres: { value: input.measured.metres },
      measurementKind: { value: input.measured.kind },
      minimumMetres: { value: input.capability.minimumMetres },
      maximumMetres: { value: input.capability.maximumMetres },
      pathFeasibility: { value: path.kind },
    },
    formula: "within capability AND path not blocked",
    output: deliverable,
    children: [
      createTraceNode({
        id: "composition.range.capability",
        label: "Distance against authored capability",
        inputs: { outcome: { value: comparison.outcome } },
        output: withinCapability,
      }),
      createTraceNode({
        id: "composition.range.path",
        label: "Route feasibility",
        /*
         * Traced as its own node even when it is `unknown`, because "the host
         * said nothing about walls" is a fact a GM reading the explanation
         * needs, and a node that appeared only when a wall existed would make
         * its absence look like a clear line.
         */
        inputs: { kind: { value: path.kind } },
        output: path.kind !== "blocked",
      }),
    ],
  });

  return {
    measured: input.measured,
    capability: input.capability,
    comparison,
    withinCapability,
    path,
    deliverable,
    trace,
  };
}
