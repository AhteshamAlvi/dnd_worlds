import { createCheckModifierTraceNode, resolveCheckModifier } from "../../../../checks/modifiers";
import {
  engineSuccess,
  type EngineResult,
} from "../../../../infrastructure/result";
import { createTraceNode } from "../../../../infrastructure/trace";
import {
  mismatchedSensoryRouteError,
  sensoryFailure,
} from "../diagnostics";
import { sensoryRouteTermsKey } from "../routes";
import { compareDetectionTotals } from "./outcome";
import { detectionScopeFor, intensityContribution } from "./scope";
import type { DetectionRequest, DetectionResolution } from "./types";

/**
 * Passive Detection: the permanent alertness total, compared once, never rolled.
 *
 * P > C detects. A tie leaves the subject concealed — see outcome.ts for why
 * the rule is written once and imported rather than restated here.
 *
 * Two base contributions and no more: the observer's standing alertness, and
 * what the cue's loudness is worth. The intensity lands HERE and in the rolled
 * resolver, and nowhere else in the pipeline — Perception does not also add it,
 * because a bright light must not be easy to notice twice.
 */
export function resolvePassiveDetection(
  request: DetectionRequest,
): EngineResult<DetectionResolution> {
  /*
   * Wrong resolver, not wrong data: this one throws. See ../diagnostics.ts.
   */
  if (request.mode !== "passive") {
    throw new RangeError("Passive Detection resolver requires passive mode.");
  }

  const generated = request.route;
  const route = generated.route;
  const rated = request.concealment.route;

  /*
   * A mismatched route IS caller data — two resolutions that describe
   * different routes were handed in together — so it comes back as a failure
   * a caller can inspect rather than an exception it has to catch.
   *
   * Compared on the four shared TERMS. A rating that names no receiver
   * legitimately covers this route's receiver; one that names a different
   * receiver was already excluded by the lookup that produced it.
   */
  if (sensoryRouteTermsKey(route) !== sensoryRouteTermsKey(rated)) {
    return sensoryFailure(
      `character.senses.detection.passive.${generated.cueId}`,
      "Resolve passive Detection",
      mismatchedSensoryRouteError(
        sensoryRouteTermsKey(route),
        sensoryRouteTermsKey(rated),
      ),
    );
  }

  const sense = request.profile.senses[route.sense];

  if (sense === undefined) {
    return sensoryFailure(
      `character.senses.detection.passive.${generated.cueId}`,
      "Resolve passive Detection",
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

  const modifier = resolveCheckModifier([
    { id: "passiveDetection.base", amount: sense.passiveDetectionBase },
    intensityContribution(generated),
  ], request.modifiers ?? [], detectionScopeFor("passive", route));

  const { detected, margin } = compareDetectionTotals(
    modifier.finalModifier,
    request.concealment.total,
  );
  const modifierTrace = createCheckModifierTraceNode(modifier);

  const trace = createTraceNode({
    id: `character.senses.detection.passive.${generated.cueId}`,
    label: "Resolve passive Detection",
    formula: "detected when passive Detection > Concealment; a tie stays hidden",
    inputs: {
      detection: { value: modifier.finalModifier },
      concealment: { value: request.concealment.total },
      receivedIntensity: { value: generated.receivedIntensity },
    },
    output: detected,
    children: [modifierTrace, request.concealment.trace],
  });

  return engineSuccess({
    mode: "passive",
    detected,
    observerTotal: modifier.finalModifier,
    concealmentTotal: request.concealment.total,
    margin,
    route,
    receivedIntensity: generated.receivedIntensity,
    trace,
  }, { root: trace });
}
