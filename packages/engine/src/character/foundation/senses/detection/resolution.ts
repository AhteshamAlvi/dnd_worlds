import { resolveCheck } from "../../../../checks/resolution";
import {
  engineSuccess,
  type EngineResult,
} from "../../../../infrastructure/result";
import { createTraceNode } from "../../../../infrastructure/trace";
import {
  mismatchedSensoryRouteError,
  missingSensoryDiceError,
  sensoryFailure,
} from "../diagnostics";
import { resolveInformationBand } from "../information";
import type { DetectionRequest, DetectionResolution } from "./types";
import { resolvePassiveDetection } from "./passive";

function routeMismatch(request: DetectionRequest): EngineResult<never> | undefined {
  const signature = request.cue.signature;
  const route = request.concealment.route;

  if (
    route.sense !== signature.sense ||
    route.phenomenon !== signature.phenomenon ||
    route.subject !== signature.subject
  ) {
    return sensoryFailure(
      `character.senses.detection.${request.mode}.${signature.id}`,
      `Resolve ${request.mode} Detection`,
      mismatchedSensoryRouteError(
        `${signature.sense}/${signature.phenomenon}/${signature.subject}`,
        `${route.sense}/${route.phenomenon}/${route.subject}`,
      ),
    );
  }

  return undefined;
}

export function resolveDetectionCheck(
  request: DetectionRequest,
): EngineResult<DetectionResolution> {
  const mismatch = routeMismatch(request);

  if (mismatch !== undefined) return mismatch;

  if (request.mode === "passive") return resolvePassiveDetection(request);

  const signature = request.cue.signature;

  if (request.dice === undefined) {
    return sensoryFailure(
      `character.senses.detection.${request.mode}.${signature.id}`,
      `Resolve ${request.mode} Detection`,
      missingSensoryDiceError("Active and reaction Detection"),
    );
  }

  const sense = request.profile.senses[signature.sense];
  const checkResult = resolveCheck({
    scope: {
      kind: "detection",
      mode: request.mode,
      sense: signature.sense,
      phenomenon: signature.phenomenon,
      subject: signature.subject,
    },
    dice: request.dice,
    baseContributions: [{
      id: "senseAdjustedDetection.standardModifier",
      amount: sense.detection.standardModifier,
    }],
    modifiers: request.modifiers ?? [],
  });

  if (!checkResult.success) return checkResult;

  const check = checkResult.payload;
  const margin = check.total - request.concealment.total;
  const band = resolveInformationBand(margin, request.informationOverride);

  const trace = createTraceNode({
    id: `character.senses.detection.${request.mode}.${signature.id}`,
    label: `Resolve ${request.mode} Detection`,
    formula: "Detection total - Concealment total",
    inputs: { detection: { value: check.total }, concealment: { value: request.concealment.total } },
    output: band,
    children: [check.trace, request.concealment.trace],
  });

  return engineSuccess({
    mode: request.mode,
    observerTotal: check.total,
    concealmentTotal: request.concealment.total,
    margin,
    band,
    check,
    trace,
  }, { root: trace });
}
