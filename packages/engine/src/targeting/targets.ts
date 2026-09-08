/*
 * What an action can be pointed at.
 *
 * A closed union, because "target" is otherwise the single most overloaded
 * word in a rules engine: a creature, a specific limb of that creature, a
 * pressure point inside that limb, a door, a patch of ground, and a volume of
 * air are all things a player says "I target" about, and they are not
 * interchangeable to any mechanic that reads them.
 *
 *
 * WHY BODY IDENTITIES ARE IMPORTED RATHER THAN REDECLARED
 *
 * A Body Part and an Anatomical Point already have identities, and they belong
 * to Body. Declaring a second BodyPartId here would produce two string aliases
 * that TypeScript accepts in either direction, so a targeting id and an
 * anatomy id could be swapped forever without a compiler complaint — the exact
 * failure mode that made the sensory vocabulary move to one declaration.
 *
 * The import is type-only and one-directional: targeting sits ABOVE Body and
 * reuses its identities; Body must never import targeting. architecture.test.ts
 * enforces both halves.
 *
 *
 * WHAT THIS FILE DOES NOT VALIDATE
 *
 * Whether the part exists, whether it belongs to that Body, whether it is
 * still attached, and whether the attacker can reach it are all questions that
 * need an actual Body, and handing one to a domain this generic would make
 * targeting a second consumer of anatomy. Structure is checked here; existence
 * and accessibility are findings supplied to action preparation by callers
 * that already hold the Body.
 */

import type { EngineError } from "../infrastructure/diagnostics";
import type { BodyPartId } from "../character/foundation/body/anatomy/types";
import type { CriticalPointId } from "../character/foundation/body/critical-points/types";
import {
  findAreaIssues,
  findPositionIssues,
  type SpatialArea,
  type SpatialPosition,
} from "../spatial";


/**
 * Identity of a thing in the world that is not a position or an area.
 *
 * Opaque to the engine, and deliberately not "a Character id": a summon, a
 * vehicle, a spirit and a Nen construct are all targetable and none of them is
 * necessarily a Character.
 */
export type TargetEntityId = string;

export type TargetObjectId = string;


export const TARGET_KINDS = [
  "self",
  "entity",
  "body-part",
  "anatomical-point",
  "object",
  "position",
  "area",
] as const;

export type TargetKind = typeof TARGET_KINDS[number];


export function isTargetKind(value: unknown): value is TargetKind {
  return typeof value === "string" &&
    (TARGET_KINDS as readonly string[]).includes(value);
}


/** The actor themselves, named rather than inferred from an id match. */
export interface SelfTarget {
  readonly kind: "self";
}


export interface EntityTarget {
  readonly kind: "entity";
  readonly entityId: TargetEntityId;
}


/** One Body Part, and the Body it belongs to. Both, always. */
export interface BodyPartTarget {
  readonly kind: "body-part";
  readonly bodyOwnerId: TargetEntityId;
  readonly bodyPartId: BodyPartId;
}


/** One Anatomical Point, and the Body it belongs to. Both, always. */
export interface AnatomicalPointTarget {
  readonly kind: "anatomical-point";
  readonly bodyOwnerId: TargetEntityId;
  readonly criticalPointId: CriticalPointId;
}


export interface ObjectTarget {
  readonly kind: "object";
  readonly objectId: TargetObjectId;
}


export interface PositionTarget {
  readonly kind: "position";
  readonly position: SpatialPosition;
}


export interface AreaTarget {
  readonly kind: "area";
  readonly area: SpatialArea;
}


export type TargetRef =
  | SelfTarget
  | EntityTarget
  | BodyPartTarget
  | AnatomicalPointTarget
  | ObjectTarget
  | PositionTarget
  | AreaTarget;


function findIdIssue(
  value: unknown,
  code: string,
  message: string,
): EngineError | undefined {
  if (typeof value === "string" && value.trim().length > 0) return undefined;

  return {
    code,
    message,
    audience: "developer",
    required: "non-empty identifier",
    actual: value === undefined ? "absent" : String(value),
  };
}


/*
 * Takes `unknown`, for the reason spatial's validators do: a target may
 * arrive from a host, from JSON, or out of a persisted authorization, so
 * whether it is an object at all is part of the question. Nested values are
 * handed to validators that guard themselves rather than being cast into
 * trusted shapes on the way past.
 */
export function findTargetIssues(value: unknown): readonly EngineError[] {
  if (typeof value !== "object" || value === null) {
    return [{
      code: "targeting.target.malformed",
      message: "A target must be an object.",
      audience: "developer",
      required: [...TARGET_KINDS],
      actual: value === null ? "null" : typeof value,
    }];
  }

  const target = value as TargetRef;
  const errors: EngineError[] = [];

  switch (target.kind) {
    case "self":
      break;

    case "entity": {
      const issue = findIdIssue(
        target.entityId,
        "targeting.target.entity.missing",
        "An entity target must name the entity.",
      );

      if (issue !== undefined) errors.push(issue);
      break;
    }

    case "body-part": {
      /*
       * The owner is required as insistently as the part. A bare part id names
       * "the left arm" of nobody in particular, and the first mechanic to read
       * it would have to guess whose.
       */
      const ownerIssue = findIdIssue(
        target.bodyOwnerId,
        "targeting.target.body-part.owner.missing",
        "A Body Part target must name the Body it belongs to.",
      );

      const partIssue = findIdIssue(
        target.bodyPartId,
        "targeting.target.body-part.id.missing",
        "A Body Part target must name the exact Body Part.",
      );

      if (ownerIssue !== undefined) errors.push(ownerIssue);
      if (partIssue !== undefined) errors.push(partIssue);
      break;
    }

    case "anatomical-point": {
      const ownerIssue = findIdIssue(
        target.bodyOwnerId,
        "targeting.target.anatomical-point.owner.missing",
        "An Anatomical Point target must name the Body it belongs to.",
      );

      const pointIssue = findIdIssue(
        target.criticalPointId,
        "targeting.target.anatomical-point.id.missing",
        "An Anatomical Point target must name the exact Anatomical Point.",
      );

      if (ownerIssue !== undefined) errors.push(ownerIssue);
      if (pointIssue !== undefined) errors.push(pointIssue);
      break;
    }

    case "object": {
      const issue = findIdIssue(
        target.objectId,
        "targeting.target.object.missing",
        "An object target must name the object.",
      );

      if (issue !== undefined) errors.push(issue);
      break;
    }

    case "position":
      errors.push(...findPositionIssues(target.position));
      break;

    case "area":
      errors.push(...findAreaIssues(target.area));
      break;

    default:
      errors.push({
        code: "targeting.target.kind.invalid",
        message: "A target must be one of the known target kinds.",
        audience: "developer",
        required: [...TARGET_KINDS],
        actual: String((target as { kind?: unknown }).kind),
      });
  }

  return errors;
}


/**
 * The Body a target concerns, if it concerns one.
 *
 * Exists so that a caller holding Bodies can find the ones it needs to check
 * without re-implementing the union, which is where an "owner" would otherwise
 * quietly get dropped.
 */
export function targetBodyOwnerId(
  target: TargetRef,
): TargetEntityId | undefined {
  return target.kind === "body-part" || target.kind === "anatomical-point"
    ? target.bodyOwnerId
    : undefined;
}
