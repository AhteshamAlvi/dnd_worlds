import { sensoryRouteTermsKey } from "../routes";
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

  const route = request.route.route;

  if (
    sensoryRouteTermsKey(route) !==
      sensoryRouteTermsKey(request.concealment.route)
  ) {
    issues.push({ type: "route-mismatch", path: "concealment.route" });
  }

  /*
   * A safe lookup, not a bare index. An unknown Sense id has to report as an
   * unavailable Sense rather than throwing on `.available` — the whole reason
   * the profile publishes only the Senses a creature actually resolved.
   */
  if (request.profile.senses[route.sense]?.available !== true) {
    issues.push({
      type: "sense-unavailable",
      path: `profile.senses.${route.sense}`,
    });
  }

  return issues;
}
