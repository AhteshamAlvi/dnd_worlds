/*
 * The shapes a capability can cover.
 *
 * Five primitives, all in metres, all composable with the same positions and
 * directions everything else here uses. A Skill's blast, an En sphere, a
 * dragon's cone and a spear's line are the same five shapes with different
 * numbers, which is what "one Range model" is supposed to mean — shared
 * primitives, not one interface with twelve optional fields where only three
 * ever apply together.
 *
 *
 * WHAT IS DELIBERATELY ABSENT: CONTAINMENT
 *
 * There is no `isInsideArea`. Deciding who is caught in a 6 m sphere means
 * knowing where every creature is, how much space each one takes up, whether
 * the wall between them stops the effect, and what the host's own rule is for
 * a token half inside — and the host is the one holding all four. An engine
 * answer here would be a second, poorer occupancy model competing with the
 * real one.
 *
 * So the engine validates the shape and asks the host which subjects it
 * covers. That is the same division as facts.ts: the host supplies geometry,
 * the engine decides what the geometry is worth.
 */

import type { EngineError } from "../infrastructure/diagnostics";
import type { SpatialContextId } from "./context";
import { findDirectionIssues, findPositionIssues } from "./positions";
import type { Direction, SpatialPosition } from "./positions";


export interface SphereArea {
  readonly kind: "sphere";
  readonly centre: SpatialPosition;
  readonly radiusMetres: number;
}


export interface CylinderArea {
  readonly kind: "cylinder";
  readonly centre: SpatialPosition;
  readonly radiusMetres: number;
  readonly heightMetres: number;
}


/**
 * A cone from an apex, along a direction.
 *
 * `apertureDegrees` is the FULL apex angle, not the half-angle, because that
 * is the number a rule states ("a 60-degree cone") and halving it belongs in
 * whatever does the geometry rather than in what the author writes down.
 */
export interface ConeArea {
  readonly kind: "cone";
  readonly origin: SpatialPosition;
  readonly direction: Direction;
  readonly lengthMetres: number;
  readonly apertureDegrees: number;
}


export interface LineArea {
  readonly kind: "line";
  readonly origin: SpatialPosition;
  readonly direction: Direction;
  readonly lengthMetres: number;
  readonly widthMetres: number;
}


/**
 * An axis-aligned box.
 *
 * Deliberately not orientable. An arbitrarily rotated box needs a full
 * orientation frame, and the moment the engine carries one it is doing
 * geometry it said the host owns. A host that needs a rotated volume supplies
 * the covered subjects directly.
 */
export interface BoxArea {
  readonly kind: "box";
  readonly centre: SpatialPosition;
  readonly lengthMetres: number;
  readonly widthMetres: number;
  readonly heightMetres: number;
}


export type SpatialArea =
  | SphereArea
  | CylinderArea
  | ConeArea
  | LineArea
  | BoxArea;


/** The context an area is in, taken from the position that anchors it. */
export function areaContextId(area: SpatialArea): SpatialContextId {
  return area.kind === "cone" || area.kind === "line"
    ? area.origin.contextId
    : area.centre.contextId;
}


function findExtentIssues(
  areaKind: string,
  name: string,
  value: number,
): readonly EngineError[] {
  if (!Number.isFinite(value) || value <= 0) {
    return [{
      code: "spatial.area.extent.invalid",
      message: `A ${areaKind}'s ${name} must be a finite, positive number of metres.`,
      audience: "developer",
      required: "finite metres > 0",
      actual: String(value),
    }];
  }

  return [];
}


export function findAreaIssues(value: unknown): readonly EngineError[] {
  if (typeof value !== "object" || value === null) {
    return [{
      code: "spatial.area.malformed",
      message: "An area must be an object.",
      audience: "developer",
      required: "a sphere, cylinder, cone, line, or box",
      actual: value === null ? "null" : typeof value,
    }];
  }

  const area = value as SpatialArea;
  const errors: EngineError[] = [];

  switch (area.kind) {
    case "sphere":
      errors.push(...findPositionIssues(area.centre));
      errors.push(...findExtentIssues("sphere", "radius", area.radiusMetres));
      break;

    case "cylinder":
      errors.push(...findPositionIssues(area.centre));
      errors.push(...findExtentIssues("cylinder", "radius", area.radiusMetres));
      errors.push(...findExtentIssues("cylinder", "height", area.heightMetres));
      break;

    case "cone":
      errors.push(...findPositionIssues(area.origin));
      errors.push(...findDirectionIssues(area.direction));
      errors.push(...findExtentIssues("cone", "length", area.lengthMetres));

      /*
       * Zero is a line and 360 is a sphere; both are shapes this vocabulary
       * already has, and an author reaching for a cone to express one of them
       * has made a mistake worth surfacing.
       */
      if (
        !Number.isFinite(area.apertureDegrees) ||
        area.apertureDegrees <= 0 ||
        area.apertureDegrees >= 360
      ) {
        errors.push({
          code: "spatial.area.aperture.invalid",
          message: "A cone's aperture must be greater than 0 and less than 360 degrees.",
          audience: "developer",
          required: "0 < degrees < 360",
          actual: String(area.apertureDegrees),
        });
      }

      break;

    case "line":
      errors.push(...findPositionIssues(area.origin));
      errors.push(...findDirectionIssues(area.direction));
      errors.push(...findExtentIssues("line", "length", area.lengthMetres));
      errors.push(...findExtentIssues("line", "width", area.widthMetres));
      break;

    case "box":
      errors.push(...findPositionIssues(area.centre));
      errors.push(...findExtentIssues("box", "length", area.lengthMetres));
      errors.push(...findExtentIssues("box", "width", area.widthMetres));
      errors.push(...findExtentIssues("box", "height", area.heightMetres));
      break;

    default:
      errors.push({
        code: "spatial.area.kind.invalid",
        message: "An area must be a sphere, cylinder, cone, line, or box.",
        audience: "developer",
        required: ["sphere", "cylinder", "cone", "line", "box"],
        actual: String((area as { kind?: unknown }).kind),
      });
  }

  return errors;
}
