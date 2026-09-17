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
import { compareDetectionTotals } from "./outcome";
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

/**
 * Rolled Detection — a deliberate search, or the Reaction Gate.
 *
 * The advantage level on the supplied dice is whatever the CALLER already
 * reconciled. This resolver never adds disadvantages of its own, because by the
 * time it is holding dice the number of them has already been decided; see
 * outcome.ts's reconcileDetectionAdvantage() for the step that must happen
 * first, and senses/reaction-gate.ts for the Gate that performs it.
 *
 * Active searching and the Gate therefore differ by exactly one thing — whether
 * the Concealment Lead was folded in upstream — and not by two different
 * resolvers that could drift apart.
 */
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
  const { detected, margin } = compareDetectionTotals(
    check.total,
    request.concealment.total,
  );

  const trace = createTraceNode({
    id: `character.senses.detection.${request.mode}.${signature.id}`,
    label: `Resolve ${request.mode} Detection`,
    formula: "detected when Detection total > Concealment total; a tie stays hidden",
    inputs: { detection: { value: check.total }, concealment: { value: request.concealment.total } },
    output: detected,
    children: [check.trace, request.concealment.trace],
  });

  return engineSuccess({
    mode: request.mode,
    detected,
    observerTotal: check.total,
    concealmentTotal: request.concealment.total,
    margin,
    route: request.concealment.route,
    check,
    trace,
  }, { root: trace });
}
