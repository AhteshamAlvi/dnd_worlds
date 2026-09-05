import { INFORMATION_BANDS } from "../information";
import type { InvestigationRequest } from "./types";

export type InvestigationValidationIssue =
  | { readonly type: "sense-profile-missing"; readonly path: string }
  | { readonly type: "difficulty-invalid"; readonly path: string }
  | { readonly type: "finding-id-missing"; readonly path: string }
  | { readonly type: "finding-band-invalid"; readonly path: string };

export function findInvestigationRequestIssues(
  request: InvestigationRequest,
): readonly InvestigationValidationIssue[] {
  const issues: InvestigationValidationIssue[] = [];
  if (request.sense !== undefined && request.profile === undefined) {
    issues.push({ type: "sense-profile-missing", path: "profile" });
  }
  if (
    request.difficulty.kind === "fixed" &&
    !Number.isFinite(request.difficulty.difficulty)
  ) {
    issues.push({ type: "difficulty-invalid", path: "difficulty.difficulty" });
  }
  request.findings.forEach((finding, index) => {
    if (finding.id.trim().length === 0) {
      issues.push({ type: "finding-id-missing", path: `findings.${index}.id` });
    }
    if (!(INFORMATION_BANDS as readonly string[]).includes(finding.requiredBand)) {
      issues.push({ type: "finding-band-invalid", path: `findings.${index}.requiredBand` });
    }
  });
  return issues;
}
