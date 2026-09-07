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
import { resolveInformationBand } from "../information";
import type { DetectionRequest, DetectionResolution } from "./types";

export function resolvePassiveDetection(
  request: DetectionRequest,
): EngineResult<DetectionResolution> {
  /*
   * Wrong resolver, not wrong data: this one throws. See ../diagnostics.ts.
   */
  if (request.mode !== "passive") {
    throw new RangeError("Passive Detection resolver requires passive mode.");
  }

  const signature = request.cue.signature;
  const route = request.concealment.route;

  /*
   * A mismatched route IS caller data — two resolutions that describe
   * different senses were handed in together — so it comes back as a failure
   * a caller can inspect rather than an exception it has to catch.
   */
  if (
    route.sense !== signature.sense ||
    route.phenomenon !== signature.phenomenon ||
    route.subject !== signature.subject
  ) {
    return sensoryFailure(
      `character.senses.detection.passive.${signature.id}`,
      "Resolve passive Detection",
      mismatchedSensoryRouteError(
        `${signature.sense}/${signature.phenomenon}/${signature.subject}`,
        `${route.sense}/${route.phenomenon}/${route.subject}`,
      ),
    );
  }
  const sense = request.profile.senses[signature.sense];
  const scope = {
    kind: "detection" as const,
    mode: "passive" as const,
    sense: signature.sense,
    phenomenon: signature.phenomenon,
    subject: signature.subject,
  };
  const modifier = resolveCheckModifier([
    { id: "passiveDetection.base", amount: sense.passiveDetectionBase },
  ], request.modifiers ?? [], scope);
  const margin = modifier.finalModifier - request.concealment.total;
  const band = resolveInformationBand(margin, request.informationOverride);
  const modifierTrace = createCheckModifierTraceNode(modifier);

  const trace = createTraceNode({
    id: `character.senses.detection.passive.${signature.id}`,
    label: "Resolve passive Detection",
    formula: "passive Detection - Concealment",
    inputs: {
      detection: { value: modifier.finalModifier },
      concealment: { value: request.concealment.total },
    },
    output: band,
    children: [modifierTrace, request.concealment.trace],
  });

  return engineSuccess({
    mode: "passive",
    observerTotal: modifier.finalModifier,
    concealmentTotal: request.concealment.total,
    margin,
    band,
    trace,
  }, { root: trace });
}
