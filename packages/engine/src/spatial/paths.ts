/*
 * A route actually travelled, and how long it is.
 *
 * A path is an ordered list of positions in one context. Its length is the sum
 * of its segments, and it is a PATH distance, never a direct one — see the
 * header of distance.ts for why the engine refuses to let those two meet.
 *
 * The engine can only add up segments it has coordinates for. A route through
 * opaque host positions has a length only the host can state, and asking for
 * it produces a missing-fact diagnostic rather than a wrong number.
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
import { isValidSpatialContextId, type SpatialContextId } from "./context";
import { pathDistance, type Distance } from "./distance";
import { missingSpatialFactError } from "./facts";
import {
  findPositionIssues,
  isMetricPosition,
  type MetricPosition,
  type SpatialPosition,
} from "./positions";


export interface SpatialPath {
  readonly contextId: SpatialContextId;

  /**
   * Ordered waypoints, start first.
   *
   * Two points is the shortest real path. One point is a place, not a route,
   * and is rejected rather than silently measured as zero — a caller that
   * built a one-point path has lost a waypoint somewhere.
   */
  readonly points: readonly SpatialPosition[];
}


export function findPathIssues(value: unknown): readonly EngineError[] {
  if (typeof value !== "object" || value === null) {
    return [{
      code: "spatial.path.malformed",
      message: "A path must be an object.",
      audience: "developer",
      required: "a path with waypoints",
      actual: value === null ? "null" : typeof value,
    }];
  }

  const path = value as SpatialPath;

  if (!Array.isArray(path.points)) {
    return [{
      code: "spatial.path.malformed",
      message: "A path's waypoints must be a list.",
      audience: "developer",
      required: "an array of positions",
      actual: path.points === null ? "null" : typeof path.points,
    }];
  }

  const errors: EngineError[] = [];

  if (!isValidSpatialContextId(path.contextId)) {
    errors.push({
      code: "spatial.path.context.missing",
      message: "Every path must name the spatial context it is in.",
      audience: "developer",
      required: "non-empty spatial context id",
      actual: String(path.contextId),
    });
  }

  if (path.points.length < 2) {
    errors.push({
      code: "spatial.path.too-short",
      message: "A path must have at least two waypoints.",
      audience: "developer",
      required: "2 or more waypoints",
      actual: String(path.points.length),
    });
  }

  path.points.forEach((point: unknown, index) => {
    errors.push(...findPositionIssues(point));

    /*
     * The cross-context check reads the waypoint, so it only runs once the
     * waypoint has been established as an object to read.
     *
     * findPositionIssues() has already REPORTED a malformed waypoint by this
     * line, which is what made the missing guard easy to miss: the error was
     * collected and then execution carried on into the dereference anyway. A
     * null waypoint threw rather than returning the issue that had just been
     * recorded for it.
     */
    if (typeof point !== "object" || point === null) return;

    const contextId = (point as { readonly contextId?: unknown }).contextId;

    if (
      isValidSpatialContextId(path.contextId) &&
      contextId !== path.contextId
    ) {
      errors.push({
        code: "spatial.path.context.mixed",
        message: `Waypoint ${index + 1} is in a different spatial context from its path.`,
        audience: "developer",
        required: path.contextId,
        actual: String(contextId),
      });
    }
  });

  return errors;
}


function segmentLength(from: MetricPosition, to: MetricPosition): number {
  return Math.hypot(
    to.xMetres - from.xMetres,
    to.yMetres - from.yMetres,
    to.zMetres - from.zMetres,
  );
}


/**
 * The travelled length of a path.
 *
 * `suppliedLength` is how a host answers for a route the engine cannot add up
 * itself. It must be a path distance; a direct distance offered here would be
 * the straight line the path deliberately is not.
 */
export function measurePathLength(
  path: SpatialPath,
  suppliedLength?: Distance,
): EngineResult<Distance> {
  const issues = [...findPathIssues(path)];

  /*
   * Nothing below reads the path until findPathIssues() has established it
   * is a path. A measurement is an entry point like any other and takes
   * whatever a host hands it.
   */
  const points: readonly unknown[] =
    typeof path === "object" && path !== null && Array.isArray(path.points)
      ? path.points
      : [];

  const allMetric = points.length > 0 && points.every(isMetricPosition);

  if (suppliedLength !== undefined && suppliedLength.kind !== "path") {
    issues.push({
      code: "spatial.distance.kind.mismatch",
      message: "A supplied path length must be a path distance.",
      audience: "developer",
      required: "path distance",
      actual: `${suppliedLength.kind} distance`,
    });
  }

  if (!allMetric && suppliedLength === undefined && issues.length === 0) {
    issues.push(missingSpatialFactError(
      "the travelled length of a path through opaque host positions",
      "The engine has no coordinates for a host position. Supply the length measured by the host.",
    ));
  }

  let metres = 0;

  if (suppliedLength !== undefined) {
    metres = suppliedLength.metres;
  } else if (allMetric) {
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];

      if (from === undefined || to === undefined) continue;
      if (!isMetricPosition(from) || !isMetricPosition(to)) continue;

      metres += segmentLength(from, to);
    }
  }

  const trace: EngineTrace = {
    root: createTraceNode({
      id: "spatial.path.length",
      label: "Measure Path Length",
      formula: suppliedLength !== undefined
        ? "host-supplied path length"
        : "sum of segment lengths",
      inputs: {
        waypoints: { value: points.length },
        supplied: { value: suppliedLength === undefined ? 0 : 1 },
      },
      output: metres,
    }),
  };

  const firstIssue = issues[0];

  if (firstIssue !== undefined) {
    return engineFailure(trace, [firstIssue, ...issues.slice(1)]);
  }

  return engineSuccess(pathDistance(metres), trace);
}
