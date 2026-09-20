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
import { sensoryRouteTermsKey } from "../routes";
import { compareDetectionTotals } from "./outcome";
import { detectionScopeFor, intensityContribution } from "./scope";
import type { DetectionRequest, DetectionResolution } from "./types";
import { resolvePassiveDetection } from "./passive";

function routeMismatch(request: DetectionRequest): EngineResult<never> | undefined {
  const route = sensoryRouteTermsKey(request.route.route);
  const rated = sensoryRouteTermsKey(request.concealment.route);

  if (route !== rated) {
    return sensoryFailure(
      `character.senses.detection.${request.mode}.${request.route.cueId}`,
      `Resolve ${request.mode} Detection`,
      mismatchedSensoryRouteError(route, rated),
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

  const generated = request.route;
  const route = generated.route;

  if (request.dice === undefined) {
    return sensoryFailure(
      `character.senses.detection.${request.mode}.${generated.cueId}`,
      `Resolve ${request.mode} Detection`,
      missingSensoryDiceError("Active and reaction Detection"),
    );
  }

  const sense = request.profile.senses[route.sense];

  if (sense === undefined) {
    return sensoryFailure(
      `character.senses.detection.${request.mode}.${generated.cueId}`,
      `Resolve ${request.mode} Detection`,
      {
        code: "character.senses.detection.sense.unresolved",
        message:
          "This observer has no resolved Sense for the route being detected through.",
        audience: "developer",
        required: "a Sense present in the observer's profile",
        actual: route.sense,
      },
    );
  }

  const checkResult = resolveCheck({
    scope: detectionScopeFor(request.mode, route),
    dice: request.dice,
    baseContributions: [
      {
        id: "senseAdjustedDetection.standardModifier",
        amount: sense.detection.standardModifier,
      },
      intensityContribution(generated),
    ],
    modifiers: request.modifiers ?? [],
  });

  if (!checkResult.success) return checkResult;

  const check = checkResult.payload;
  const { detected, margin } = compareDetectionTotals(
    check.total,
    request.concealment.total,
  );

  const trace = createTraceNode({
    id: `character.senses.detection.${request.mode}.${generated.cueId}`,
    label: `Resolve ${request.mode} Detection`,
    formula: "detected when Detection total > Concealment total; a tie stays hidden",
    inputs: {
      detection: { value: check.total },
      concealment: { value: request.concealment.total },
      receivedIntensity: { value: generated.receivedIntensity },
    },
    output: detected,
    children: [check.trace, request.concealment.trace],
  });

  return engineSuccess({
    mode: request.mode,
    detected,
    observerTotal: check.total,
    concealmentTotal: request.concealment.total,
    margin,
    route,
    receivedIntensity: generated.receivedIntensity,
    check,
    trace,
  }, { root: trace });
}
