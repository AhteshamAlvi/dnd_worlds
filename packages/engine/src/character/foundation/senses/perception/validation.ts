import { findCheckRequestIssues, type CheckValidationIssue } from "../../../../checks/validation";
import { findSensoryCueIssues, type SensoryCueIssue } from "../cues";
import { generateSensoryRoutes } from "../routes";
import type { PerceptionRequest } from "./types";

/**
 * Dice problems specific to Perception, whose reception decides whether a roll
 * happens at all rather than the caller.
 */
export type PerceptionValidationIssue =
  | { readonly type: "dice-missing"; readonly path: string }
  | { readonly type: "dice-unnecessary"; readonly path: string };

/*
 * Validate-then-resolve for Perception.
 *
 * resolvePerception() refuses exactly one caller-supplied condition —
 * uncertain reception with no dice — and this reports it as "dice-missing"
 * rather than letting the resolver be the thing that finds out. The resolver
 * returns a typed failure there rather than throwing, so skipping validation
 * is no longer a crash; it is still the wrong place to find out. Dice handed
 * in for automatic or impossible reception are reported too: they are a caller
 * who believes a roll is about to happen when none is, and silently ignoring
 * them hides that.
 */
export function findPerceptionRequestIssues(
  request: PerceptionRequest,
): readonly (SensoryCueIssue | PerceptionValidationIssue | CheckValidationIssue)[] {
  const issues: (
    | SensoryCueIssue
    | PerceptionValidationIssue
    | CheckValidationIssue
  )[] = [...findSensoryCueIssues(request.cue)];

  const reception = request.cue.reception;

  if (reception?.kind === "uncertain") {
    if (request.dice === undefined) {
      issues.push({ type: "dice-missing", path: "dice" });
    } else {
      /*
       * Validated against the route the cue would ACTUALLY arrive through,
       * generated from the same profile and exposure the resolver will use.
       * A placeholder scope would have been simpler and would have been a
       * check nobody is going to make.
       *
       * No route means the cue is inaccessible, and there is no check to
       * validate — the resolver reports that as a successful resolution of an
       * unsuccessful perception rather than as a malformed request.
       */
      const routes = generateSensoryRoutes({
        profile: request.profile,
        cue: request.cue,
        ...(request.exposure === undefined ? {} : { exposure: request.exposure }),
        ...(request.overrides === undefined
          ? {}
          : { overrides: request.overrides }),
      });

      const first = routes[0];

      if (first !== undefined) {
        issues.push(...findCheckRequestIssues({
          scope: {
            kind: "perception",
            sense: first.route.sense,
            channel: first.route.channel,
            phenomenon: request.cue.phenomenon,
          },
          dice: request.dice,
          baseContributions: [],
          modifiers: request.modifiers ?? [],
        }));
      }
    }
  } else if (request.dice !== undefined) {
    issues.push({ type: "dice-unnecessary", path: "dice" });
  }

  return issues;
}
