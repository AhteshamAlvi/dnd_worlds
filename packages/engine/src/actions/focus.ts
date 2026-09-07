/*
 * Where the act is AIMED, which is not the same as who it targets.
 *
 * The distinction this file exists for: a punch into the ground has no target
 * and is still aimed somewhere. A cone has a direction and may catch nobody. A
 * charge follows a path. Collapsing focus into targets forces every aimed
 * action to invent a target — usually the ground, sometimes the actor
 * themselves — and every consumer downstream then has to work out which
 * "targets" were real and which were placeholders for geometry.
 *
 * So: targets are subjects, focus is aim, and both are optional independently.
 * A stance has neither. A heal has a target and no focus. A ground punch has a
 * focus and no target. An area attack aimed at a specific person has both.
 */

import type { EngineError } from "../infrastructure/diagnostics";
import {
  findAreaIssues,
  findDirectionIssues,
  findPathIssues,
  findPositionIssues,
  type Direction,
  type SpatialArea,
  type SpatialPath,
  type SpatialPosition,
} from "../spatial";


export const ACTION_FOCUS_KINDS = [
  "none",
  "direction",
  "position",
  "path",
  "area",
] as const;

export type ActionFocusKind = typeof ACTION_FOCUS_KINDS[number];


export function isActionFocusKind(
  value: unknown,
): value is ActionFocusKind {
  return typeof value === "string" &&
    (ACTION_FOCUS_KINDS as readonly string[]).includes(value);
}


export interface NoFocus {
  readonly kind: "none";
}


export interface DirectionFocus {
  readonly kind: "direction";
  readonly direction: Direction;
}


export interface PositionFocus {
  readonly kind: "position";
  readonly position: SpatialPosition;
}


export interface PathFocus {
  readonly kind: "path";
  readonly path: SpatialPath;
}


export interface AreaFocus {
  readonly kind: "area";
  readonly area: SpatialArea;
}


export type ActionFocus =
  | NoFocus
  | DirectionFocus
  | PositionFocus
  | PathFocus
  | AreaFocus;


export const NO_FOCUS: NoFocus = { kind: "none" };


export function findActionFocusIssues(
  focus: ActionFocus,
): readonly EngineError[] {
  switch (focus.kind) {
    case "none":
      return [];

    case "direction":
      return findDirectionIssues(focus.direction);

    case "position":
      return findPositionIssues(focus.position);

    case "path":
      return findPathIssues(focus.path);

    case "area":
      return findAreaIssues(focus.area);

    default:
      return [{
        code: "actions.focus.kind.invalid",
        message: "An action focus must be none, a direction, a position, a path, or an area.",
        audience: "developer",
        required: [...ACTION_FOCUS_KINDS],
        actual: String((focus as { kind?: unknown }).kind),
      }];
  }
}
