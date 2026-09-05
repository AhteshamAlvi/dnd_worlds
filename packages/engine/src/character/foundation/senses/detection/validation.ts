import type { DetectionRequest } from "./types";

export type DetectionValidationIssue =
  | { readonly type: "dice-missing"; readonly path: string }
  | { readonly type: "route-mismatch"; readonly path: string }
  | { readonly type: "sense-unavailable"; readonly path: string };

export function findDetectionRequestIssues(
  request: DetectionRequest,
): readonly DetectionValidationIssue[] {
  const issues: DetectionValidationIssue[] = [];
  if (request.mode !== "passive" && request.dice === undefined) {
    issues.push({ type: "dice-missing", path: "dice" });
  }
  const signature = request.cue.signature;
  const route = request.concealment.route;
  if (
    signature.sense !== route.sense ||
    signature.phenomenon !== route.phenomenon ||
    signature.subject !== route.subject
  ) {
    issues.push({ type: "route-mismatch", path: "concealment.route" });
  }
  if (!request.profile.senses[signature.sense].available) {
    issues.push({ type: "sense-unavailable", path: `profile.senses.${signature.sense}` });
  }
  return issues;
}
