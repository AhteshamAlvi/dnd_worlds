/*
 * Where something is, in metres or in the host's own terms.
 *
 *
 * WHY METRES, AND ONLY METRES
 *
 * Every distance in this engine is metres. Not squares, not hexes, not feet,
 * not "one grid unit". A square is 1.5 m in one system and 5 ft in another,
 * hexes and squares disagree about diagonals, and a table with no map at all
 * has neither — so a mechanic written in squares is a mechanic that means
 * something different on every host it runs on. Metres is the one unit that
 * survives having no grid, and converting metres to squares is the renderer's
 * job, done once, where the grid size is actually known.
 *
 *
 * WHY THERE ARE TWO KINDS OF POSITION
 *
 * A MetricPosition has coordinates the engine can do arithmetic with. A
 * HostPosition is an opaque reference — a token id, a waypoint name, "the
 * doorway" — that the engine can carry, compare for identity, and nothing
 * else.
 *
 * The second exists because hosts routinely know where something is without
 * being willing to flatten it to a coordinate: a creature occupying several
 * squares, a position on a curved map, a token whose real position lives in
 * the VTT's own space. Forcing a coordinate out of those means inventing one.
 * Carrying the reference instead, and asking the host for any measurement
 * involving it, keeps the engine honest about what it actually knows.
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
import {
  isValidSpatialContextId,
  spatialContextMismatchError,
  type SpatialContextId,
} from "./context";
import {
  directDistance,
  findDistanceIssues,
  type Distance,
} from "./distance";
import { missingSpatialFactError, type SpatialFacts } from "./facts";


/** A position the engine can measure from, in metres, on three axes. */
export interface MetricPosition {
  readonly kind: "metric";
  readonly contextId: SpatialContextId;
  readonly xMetres: number;
  readonly yMetres: number;
  readonly zMetres: number;
}


/**
 * A position only the host can resolve.
 *
 * `reference` is never parsed. Two host positions are the same place when the
 * context and the reference both match, and the engine will not guess at any
 * other relationship between them.
 */
export interface HostPosition {
  readonly kind: "host";
  readonly contextId: SpatialContextId;
  readonly reference: string;
}


export type SpatialPosition = MetricPosition | HostPosition;


/*
 * The kind guards take `unknown` for the same reason the validators do.
 *
 * They are used as predicates over collections that can arrive from a host
 * or out of JSON — `points.every(isMetricPosition)` is the case that found
 * this — so "is it a position at all" is part of what they are being asked.
 * Reading `.kind` off a null waypoint threw from inside a function whose
 * whole job is to answer whether the value is that shape.
 */
export function isMetricPosition(
  position: unknown,
): position is MetricPosition {
  return typeof position === "object" &&
    position !== null &&
    (position as { readonly kind?: unknown }).kind === "metric";
}


export function isHostPosition(
  position: unknown,
): position is HostPosition {
  return typeof position === "object" &&
    position !== null &&
    (position as { readonly kind?: unknown }).kind === "host";
}


/*
 * Structural validators take `unknown`.
 *
 * A position can arrive from a host, from JSON, or out of a persisted
 * authorization, so "is this even an object" is part of the question rather
 * than something the caller has already established. A validator that
 * dereferenced a null and threw would fail on exactly the input it exists to
 * reject — and a throw escapes the result type every other refusal uses.
 */
export function findPositionIssues(
  value: unknown,
): readonly EngineError[] {
  if (typeof value !== "object" || value === null) {
    return [{
      code: "spatial.position.malformed",
      message: "A position must be an object.",
      audience: "developer",
      required: "a metric or host position",
      actual: value === null ? "null" : typeof value,
    }];
  }

  const position = value as SpatialPosition;
  const errors: EngineError[] = [];

  if (!isValidSpatialContextId(position.contextId)) {
    errors.push({
      code: "spatial.position.context.missing",
      message: "Every position must name the spatial context it is in.",
      audience: "developer",
      required: "non-empty spatial context id",
      actual: String(position.contextId),
    });
  }

  if (position.kind === "metric") {
    const axes: readonly (readonly [string, number])[] = [
      ["xMetres", position.xMetres],
      ["yMetres", position.yMetres],
      ["zMetres", position.zMetres],
    ];

    for (const [axis, value] of axes) {
      if (!Number.isFinite(value)) {
        errors.push({
          code: "spatial.position.coordinate.invalid",
          message: `A metric position's ${axis} must be a finite number of metres.`,
          audience: "developer",
          required: "finite metres",
          actual: String(value),
        });
      }
    }
  } else if (position.kind === "host") {
    if (
      typeof position.reference !== "string" ||
      position.reference.trim().length === 0
    ) {
      errors.push({
        code: "spatial.position.reference.missing",
        message: "A host position must carry the host's own reference for it.",
        audience: "developer",
        required: "non-empty reference",
        actual: String(position.reference),
      });
    }
  } else {
    errors.push({
      code: "spatial.position.kind.invalid",
      message: "A position must be either metric or host-referenced.",
      audience: "developer",
      required: ["metric", "host"],
      actual: String((position as { kind?: unknown }).kind),
    });
  }

  return errors;
}


export function isSamePosition(
  left: SpatialPosition,
  right: SpatialPosition,
): boolean {
  if (left.contextId !== right.contextId) return false;
  if (left.kind !== right.kind) return false;

  if (left.kind === "metric" && right.kind === "metric") {
    return left.xMetres === right.xMetres &&
      left.yMetres === right.yMetres &&
      left.zMetres === right.zMetres;
  }

  if (left.kind === "host" && right.kind === "host") {
    return left.reference === right.reference;
  }

  return false;
}


/**
 * A heading, as a vector that is not required to be unit length.
 *
 * Kept unnormalized on the way in because a caller pointing "towards that
 * position" has a difference vector, not a unit vector, and making them
 * normalize first is a rounding step performed twice. `normalizeDirection`
 * exists for the places that need it.
 */
export interface Direction {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}


export function directionMagnitude(direction: Direction): number {
  return Math.hypot(direction.x, direction.y, direction.z);
}


export function findDirectionIssues(
  value: unknown,
): readonly EngineError[] {
  if (typeof value !== "object" || value === null) {
    return [{
      code: "spatial.direction.malformed",
      message: "A direction must be an object.",
      audience: "developer",
      required: "a direction vector",
      actual: value === null ? "null" : typeof value,
    }];
  }

  const direction = value as Direction;

  const components: readonly (readonly [string, number])[] = [
    ["x", direction.x],
    ["y", direction.y],
    ["z", direction.z],
  ];

  for (const [axis, value] of components) {
    if (!Number.isFinite(value)) {
      return [{
        code: "spatial.direction.component.invalid",
        message: `A direction's ${axis} component must be a finite number.`,
        audience: "developer",
        required: "finite number",
        actual: String(value),
      }];
    }
  }

  /*
   * A zero vector points nowhere. It is worth its own error because it is what
   * "towards the target" produces when the target is where the actor is
   * standing, and silently treating that as some default heading would aim a
   * cone in a direction nobody chose.
   */
  if (directionMagnitude(direction) === 0) {
    return [{
      code: "spatial.direction.zero",
      message: "A direction must have a non-zero length.",
      audience: "developer",
      required: "non-zero vector",
      actual: "(0, 0, 0)",
    }];
  }

  return [];
}


export function normalizeDirection(
  direction: Direction,
): EngineResult<Direction> {
  const issues = findDirectionIssues(direction);
  const trace: EngineTrace = {
    root: createTraceNode({
      id: "spatial.direction.normalize",
      label: "Normalize Direction",
      formula: "component / magnitude",
      inputs: {
        x: { value: direction.x },
        y: { value: direction.y },
        z: { value: direction.z },
      },
      output: issues.length === 0 ? directionMagnitude(direction) : 0,
    }),
  };

  const firstIssue = issues[0];

  if (firstIssue !== undefined) {
    return engineFailure(trace, [firstIssue, ...issues.slice(1)]);
  }

  const magnitude = directionMagnitude(direction);

  return engineSuccess({
    x: direction.x / magnitude,
    y: direction.y / magnitude,
    z: direction.z / magnitude,
  }, trace);
}


/**
 * Straight-line separation between two positions.
 *
 * Computed when both ends are metric and in the same context. Otherwise the
 * host is asked: an opaque position has no coordinates to subtract, so the
 * answer is a missing FACT rather than a failed attempt, and the caller can
 * tell those apart by the diagnostic code.
 */
export function measureDirectDistance(
  from: SpatialPosition,
  to: SpatialPosition,
  facts: SpatialFacts = {},
): EngineResult<Distance> {
  const issues = [...findPositionIssues(from), ...findPositionIssues(to)];

  /*
   * The context comparison reads both ends, so it only runs once both have
   * been established as objects to read. findPositionIssues() has already
   * reported a malformed one by this line — which is exactly what made the
   * missing guard easy to miss, since the error was collected and then
   * execution carried on into the dereference anyway.
   */
  const readable = typeof from === "object" && from !== null &&
    typeof to === "object" && to !== null;

  if (readable && from.contextId !== to.contextId) {
    issues.push(spatialContextMismatchError(from.contextId, to.contextId));
  }

  const suppliedSeparation = facts.separation;

  const measurable = isMetricPosition(from) && isMetricPosition(to);

  /*
   * A supplied separation is checked whether or not the engine could have
   * measured it itself. The host's measurement WINS over computed coordinates
   * — it is the one that knows about the curved corridor — so an unchecked
   * path length handed in here would be adopted as a straight line, and the
   * one case where the engine could have caught it is exactly the case the
   * validation used to skip.
   */
  if (suppliedSeparation !== undefined) {
    if (suppliedSeparation.kind !== "direct") {
      issues.push({
        code: "spatial.distance.kind.mismatch",
        message: "A supplied separation must be a direct distance.",
        audience: "developer",
        required: "direct distance",
        actual: `${suppliedSeparation.kind} distance`,
      });
    }

    issues.push(...findDistanceIssues(suppliedSeparation));
  } else if (!measurable && issues.length === 0) {
    issues.push(missingSpatialFactError(
      "the separation between an opaque host position and another position",
      "The engine has no coordinates for a host position. Supply facts.separation, measured by the host.",
    ));
  }

  const metres = suppliedSeparation !== undefined
    ? suppliedSeparation.metres
    : measurable
      ? Math.hypot(
        (to as MetricPosition).xMetres - (from as MetricPosition).xMetres,
        (to as MetricPosition).yMetres - (from as MetricPosition).yMetres,
        (to as MetricPosition).zMetres - (from as MetricPosition).zMetres,
      )
      : 0;

  const trace: EngineTrace = {
    root: createTraceNode({
      id: "spatial.distance.direct",
      label: "Measure Direct Distance",
      formula: suppliedSeparation !== undefined
        ? "host-supplied separation"
        : "sqrt(dx^2 + dy^2 + dz^2)",
      inputs: {
        context: { value: readable ? from.contextId : "unreadable" },
        supplied: { value: suppliedSeparation === undefined ? 0 : 1 },
      },
      output: metres,
    }),
  };

  const firstIssue = issues[0];

  if (firstIssue !== undefined) {
    return engineFailure(trace, [firstIssue, ...issues.slice(1)]);
  }

  return engineSuccess(directDistance(metres), trace);
}
