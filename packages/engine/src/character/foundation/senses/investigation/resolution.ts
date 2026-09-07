import { resolveCheck, resolveFixedCheck } from "../../../../checks/resolution";
import type {
  CheckResolution,
  FixedCheckResolution,
} from "../../../../checks/types";
import {
  engineSuccess,
  type EngineResult,
} from "../../../../infrastructure/result";
import {
  createTraceNode,
  type TraceNode,
} from "../../../../infrastructure/trace";
import { sensoryFailure } from "../diagnostics";
import { resolveDerivedAttribute } from "../../attributes/derived/resolution";
import { deriveStandardModifier } from "../../attributes/resolution";
import { resolveInformationBand } from "../information";
import { eligibleInvestigationFindings, findingsRevealedAtBand } from "./findings";
import type { InvestigationRequest, InvestigationResolution } from "./types";

export function resolveInvestigationCheck(
  request: InvestigationRequest,
): EngineResult<InvestigationResolution> {
  if (request.sense !== undefined && request.profile === undefined) {
    return sensoryFailure(
      "character.senses.investigation.resolve",
      "Resolve Investigation",
      {
        code: "character.senses.investigation.profile.missing",
        message: "Sense-specific Investigation requires a sensory profile.",
        audience: "developer",
        required: "ResolvedSensoryProfile",
        actual: "absent",
      },
    );
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

  let check: CheckResolution;
  let fixedCheck: FixedCheckResolution | undefined;
  let opposingValue: number;
  let margin: number;
  let childTrace: TraceNode;

  if (request.difficulty.kind === "fixed") {
    const fixedResult = resolveFixedCheck({
      check: checkRequest,
      difficulty: request.difficulty.difficulty,
      tiePolicy: "fails",
    });

    if (!fixedResult.success) return fixedResult;

    fixedCheck = fixedResult.payload;
    check = fixedCheck.check;
    opposingValue = request.difficulty.difficulty;
    margin = fixedCheck.margin;
    childTrace = fixedCheck.trace;
  } else {
    const checkResult = resolveCheck(checkRequest);

    if (!checkResult.success) return checkResult;

    check = checkResult.payload;
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

  const trace = createTraceNode({
    id: "character.senses.investigation.resolve",
    label: "Resolve Investigation",
    formula: "margin determines information band; prerequisites determine eligible findings",
    inputs: {
      margin: { value: margin },
      eligibleFindings: { value: eligible.map((finding) => finding.id) },
    },
    output: revealed.map((finding) => finding.id),
    children: [childTrace],
  });

  return engineSuccess({
    total: check.total,
    opposingValue,
    margin,
    band,
    eligibleFindingIds: eligible.map((finding) => finding.id),
    revealedFindingIds: revealed.map((finding) => finding.id),
    check,
    ...(fixedCheck === undefined ? {} : { fixedCheck }),
    trace,
  }, { root: trace });
}
