/*
 * How an attempt is going to be settled.
 *
 * Three ways, and the important claim is that they are a property of the
 * ACTION rather than of the situation. It is tempting to say Combat is
 * mechanical and everything else is narrative, and it is wrong in both
 * directions: an attack roll in the middle of a conversation is still an
 * attack roll, and "I try to talk the guard into looking away" is still a
 * judgement call when it happens on someone's Turn.
 *
 * So the approach is selected per action. Nothing here consults a Combat, and
 * nothing about being inside structured time changes which approach applies.
 *
 *
 * WHY THREE AND NOT TWO
 *
 * The missing middle is the one that matters. A rules engine with only
 * "resolve it" and "the GM decides" pushes every unusual attempt into a hole
 * where it gets no help at all — no Range check, no cost, no relevant facts,
 * nothing — and the GM ends up reconstructing by hand what the engine already
 * knew. Guided narrative is the case where the engine does all the work it can
 * and stops short of deciding, which is most of what a GM actually wants from
 * a tool.
 */

import type { EngineError } from "../infrastructure/diagnostics";


export const RESOLUTION_APPROACHES = [
  /* Ordinary rules can propose the result. */
  "mechanical",

  /* The engine gathers facts and suggestions; the GM decides. */
  "guided-narrative",

  /* The GM supplies the substantive outcome, with engine assistance. */
  "free-adjudication",
] as const;

export type ResolutionApproach = typeof RESOLUTION_APPROACHES[number];


export function isResolutionApproach(
  value: unknown,
): value is ResolutionApproach {
  return typeof value === "string" &&
    (RESOLUTION_APPROACHES as readonly string[]).includes(value);
}


/** Whether the approach hands the substantive decision to a person. */
export function requiresAdjudication(approach: ResolutionApproach): boolean {
  return approach === "guided-narrative" || approach === "free-adjudication";
}


export function findResolutionApproachIssues(
  approach: ResolutionApproach,
): readonly EngineError[] {
  if (isResolutionApproach(approach)) return [];

  return [{
    code: "actions.approach.invalid",
    message: "An action must state how it is to be resolved.",
    audience: "developer",
    required: [...RESOLUTION_APPROACHES],
    actual: String(approach),
  }];
}
