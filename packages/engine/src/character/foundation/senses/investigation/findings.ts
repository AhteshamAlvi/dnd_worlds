import { compareInformationBands, type InformationBand } from "../information";
import type { InvestigationFinding } from "./types";

function containsEvery(available: ReadonlySet<string>, required: readonly string[]): boolean {
  return required.every((id) => available.has(id));
}

export function eligibleInvestigationFindings(input: {
  readonly findings: readonly InvestigationFinding[];
  readonly evidenceIds: ReadonlySet<string>;
  readonly skillIds: ReadonlySet<string>;
  readonly knowledgeIds: ReadonlySet<string>;
}): readonly InvestigationFinding[] {
  return input.findings.filter((finding) =>
    containsEvery(input.evidenceIds, finding.requiredEvidenceIds ?? []) &&
    containsEvery(input.skillIds, finding.requiredSkillIds ?? []) &&
    containsEvery(input.knowledgeIds, finding.requiredKnowledgeIds ?? [])
  );
}

export function findingsRevealedAtBand(
  findings: readonly InvestigationFinding[],
  band: InformationBand,
): readonly InvestigationFinding[] {
  return findings.filter((finding) =>
    compareInformationBands(band, finding.requiredBand) >= 0
  );
}
