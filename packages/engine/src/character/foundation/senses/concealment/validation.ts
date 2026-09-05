import type { ConcealmentRequest } from "./types";

export type ConcealmentValidationIssue =
  | { readonly type: "route-missing"; readonly path: string }
  | { readonly type: "dice-missing"; readonly path: string }
  | { readonly type: "basis-invalid"; readonly path: string };

export function findConcealmentRequestIssues(
  request: ConcealmentRequest,
): readonly ConcealmentValidationIssue[] {
  const issues: ConcealmentValidationIssue[] = [];
  if (request.routes.length === 0) issues.push({ type: "route-missing", path: "routes" });
  if (request.mode !== "passive" && request.dice === undefined) {
    issues.push({ type: "dice-missing", path: "dice" });
  }
  if (request.mode === "passive" && request.basis.kind !== "character") {
    issues.push({ type: "basis-invalid", path: "basis" });
  }
  return issues;
}
