import { resolveCheck, resolveFixedCheck } from "../../../../checks/resolution";
import { createTraceNode } from "../../../../infrastructure/trace";
import { resolveDerivedAttribute } from "../../attributes/derived/resolution";
import { deriveStandardModifier } from "../../attributes/resolution";
import { resolveInformationBand } from "../information";
import { eligibleInvestigationFindings, findingsRevealedAtBand } from "./findings";
import type { InvestigationRequest, InvestigationResolution } from "./types";

export function resolveInvestigationCheck(
  request: InvestigationRequest,
): InvestigationResolution {
  if (request.sense !== undefined && request.profile === undefined) {
    throw new RangeError("Sense-specific Investigation requires a sensory profile.");
  }

  const score = request.sense === undefined
    ? resolveDerivedAttribute("investigation", request.stats)
    : request.profile!.senses[request.sense].investigation.score;
  const scope = {
    kind: "investigation" as const,
    subject: request.subject,
    ...(request.sense === undefined ? {} : { sense: request.sense }),
    ...(request.phenomenon === undefined ? {} : { phenomenon: request.phenomenon }),
  };
  const checkRequest = {
    scope,
    dice: request.dice,
    baseContributions: [{
      id: request.sense === undefined
        ? "investigation.standardModifier"
        : "senseAdjustedInvestigation.standardModifier",
      amount: deriveStandardModifier(score),
    }],
    modifiers: request.modifiers ?? [],
  };

  let check;
  let fixedCheck;
  let opposingValue: number;
  let margin: number;
  let childTrace;

  if (request.difficulty.kind === "fixed") {
    fixedCheck = resolveFixedCheck({
      check: checkRequest,
      difficulty: request.difficulty.difficulty,
      tiePolicy: "fails",
    });
    check = fixedCheck.check;
    opposingValue = request.difficulty.difficulty;
    margin = fixedCheck.margin;
    childTrace = fixedCheck.trace;
  } else {
    check = resolveCheck(checkRequest);
    opposingValue = request.difficulty.rating.total;
    margin = check.total - opposingValue;
    childTrace = createTraceNode({
      id: "character.senses.investigation.opposed",
      label: "Oppose informational Concealment",
      formula: "Investigation total - Concealment total",
      inputs: { investigation: { value: check.total }, concealment: { value: opposingValue } },
      output: margin,
      children: [check.trace, request.difficulty.rating.trace],
    });
  }

  const band = resolveInformationBand(margin, request.informationOverride);
  const eligible = eligibleInvestigationFindings({
    findings: request.findings,
    evidenceIds: new Set(request.evidence.map((entry) => entry.id)),
    skillIds: new Set(request.skillIds ?? []),
    knowledgeIds: new Set(request.knowledgeIds ?? []),
  });
  const revealed = findingsRevealedAtBand(eligible, band);

  return {
    total: check.total,
    opposingValue,
    margin,
    band,
    eligibleFindingIds: eligible.map((finding) => finding.id),
    revealedFindingIds: revealed.map((finding) => finding.id),
    check,
    ...(fixedCheck === undefined ? {} : { fixedCheck }),
    trace: createTraceNode({
      id: "character.senses.investigation.resolve",
      label: "Resolve Investigation",
      formula: "margin determines information band; prerequisites determine eligible findings",
      inputs: {
        margin: { value: margin },
        eligibleFindings: { value: eligible.map((finding) => finding.id) },
      },
      output: revealed.map((finding) => finding.id),
      children: [childTrace],
    }),
  };
}
