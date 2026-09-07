/*
 * Whether the actor is allowed to do this — as answered by somebody else.
 *
 *
 * WHY THIS IS DELIBERATELY THIN
 *
 * `actions/` must not become a second requirement system. Character rules
 * already own Character requirements, targeting owns selection validity,
 * spatial owns Range, and the resource domains own affordability. If this file
 * knew what a Trait or a Level or a Mastery rank was, it would be re-deciding
 * questions those domains already decide, and the two answers would eventually
 * differ.
 *
 * So a finding is the NORMALISED result of somebody else's decision: an id, a
 * status, and the domain that decided it. Character-aware adapters evaluate
 * Requirement data and hand findings in; `actions/` aggregates them without
 * importing Character rules or understanding any Character-specific
 * requirement variant. architecture.test.ts enforces the missing import.
 *
 * The richer shape — what preparation does with these, what a proposal
 * exposes, how the GM overrides one — belongs to the ticket that builds
 * preparation. This is the smallest contract that lets it be built.
 */

import type { EngineError } from "../infrastructure/diagnostics";


export const ELIGIBILITY_STATUSES = [
  /* The owning domain checked, and the answer is yes. */
  "satisfied",

  /* The owning domain checked, and the answer is no. */
  "unsatisfied",

  /*
   * The owning domain could not answer — a missing host fact, a Body nobody
   * supplied, a question that needs the GM. Not a failure of the attempt.
   */
  "unresolved",
] as const;

export type EligibilityStatus = typeof ELIGIBILITY_STATUSES[number];


export function isEligibilityStatus(
  value: unknown,
): value is EligibilityStatus {
  return typeof value === "string" &&
    (ELIGIBILITY_STATUSES as readonly string[]).includes(value);
}


export interface EligibilityFinding {
  /** Stable id of the question this answers, chosen by the deciding domain. */
  readonly id: string;

  readonly status: EligibilityStatus;

  /**
   * Which domain decided it — "character", "targeting", "spatial", a resource
   * domain, a host.
   *
   * An open string rather than a closed list, because closing it here would
   * mean this file has an opinion about who is allowed to have requirements,
   * which is precisely the ownership it is avoiding.
   */
  readonly decidedBy: string;

  /** Human-readable explanation, for a GM reading a proposal. */
  readonly summary?: string;
}


export function findEligibilityFindingIssues(
  finding: EligibilityFinding,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (typeof finding.id !== "string" || finding.id.trim().length === 0) {
    errors.push({
      code: "actions.eligibility.id.missing",
      message: "An eligibility finding must name the question it answers.",
      audience: "developer",
      required: "non-empty finding id",
      actual: String(finding.id),
    });
  }

  if (!isEligibilityStatus(finding.status)) {
    errors.push({
      code: "actions.eligibility.status.invalid",
      message: "An eligibility finding must carry a known status.",
      audience: "developer",
      required: [...ELIGIBILITY_STATUSES],
      actual: String(finding.status),
    });
  }

  if (
    typeof finding.decidedBy !== "string" ||
    finding.decidedBy.trim().length === 0
  ) {
    errors.push({
      code: "actions.eligibility.decided-by.missing",
      message: "An eligibility finding must name the domain that decided it.",
      audience: "developer",
      required: "non-empty domain name",
      actual: String(finding.decidedBy),
    });
  }

  return errors;
}


/**
 * Fold a set of findings into one status.
 *
 * A definite no wins over a don't-know, because an action with one
 * unsatisfied requirement is blocked whether or not anything else is still
 * unanswered, and reporting "unresolved" there would send a GM looking for a
 * missing fact that would not have helped. With no findings at all the answer
 * is "satisfied": nothing objected. Callers that require a positive
 * confirmation should say so by supplying a finding.
 */
export function summarizeEligibility(
  findings: readonly EligibilityFinding[],
): EligibilityStatus {
  if (findings.some((finding) => finding.status === "unsatisfied")) {
    return "unsatisfied";
  }

  if (findings.some((finding) => finding.status === "unresolved")) {
    return "unresolved";
  }

  return "satisfied";
}
