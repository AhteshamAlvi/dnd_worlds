import { findCheckRequestIssues, type CheckValidationIssue } from "../../../../checks/validation";
import { findSensorySignatureIssues, type SensoryValidationIssue } from "../validation";
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
 * resolvePerception() throws on exactly one caller-supplied condition —
 * uncertain reception with no dice — and this reports it as "dice-missing"
 * rather than letting the resolver be the thing that finds out. Dice handed in
 * for automatic or impossible reception are reported too: they are not a crash
 * but they are a caller who believes a roll is about to happen when none is,
 * and silently ignoring them hides that.
 */
export function findPerceptionRequestIssues(
  request: PerceptionRequest,
): readonly (SensoryValidationIssue | PerceptionValidationIssue | CheckValidationIssue)[] {
  const issues: (
    | SensoryValidationIssue
    | PerceptionValidationIssue
    | CheckValidationIssue
  )[] = [...findSensorySignatureIssues(request.signature)];

  const reception = request.signature.reception;

  if (reception.kind === "uncertain") {
    if (request.dice === undefined) {
      issues.push({ type: "dice-missing", path: "dice" });
    } else {
      issues.push(...findCheckRequestIssues({
        scope: {
          kind: "perception",
          sense: request.signature.sense,
          phenomenon: request.signature.phenomenon,
        },
        dice: request.dice,
        baseContributions: [],
        modifiers: request.modifiers ?? [],
      }));
    }
  } else if (request.dice !== undefined) {
    issues.push({ type: "dice-unnecessary", path: "dice" });
  }

  return issues;
}
