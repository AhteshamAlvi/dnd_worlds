import { createCheckModifierTraceNode, resolveCheckModifier } from "../../../../checks/modifiers";
import { createTraceNode } from "../../../../infrastructure/trace";
import { resolveInformationBand } from "../information";
import type { DetectionRequest, DetectionResolution } from "./types";

export function resolvePassiveDetection(
  request: DetectionRequest,
): DetectionResolution {
  if (request.mode !== "passive") {
    throw new RangeError("Passive Detection resolver requires passive mode.");
  }
  const signature = request.cue.signature;
  const route = request.concealment.route;
  if (
    route.sense !== signature.sense ||
    route.phenomenon !== signature.phenomenon ||
    route.subject !== signature.subject
  ) {
    throw new RangeError("Detection and Concealment must describe the same sensory route.");
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

  return {
    mode: "passive",
    observerTotal: modifier.finalModifier,
    concealmentTotal: request.concealment.total,
    margin,
    band,
    trace: createTraceNode({
      id: `character.senses.detection.passive.${signature.id}`,
      label: "Resolve passive Detection",
      formula: "passive Detection - Concealment",
      inputs: {
        detection: { value: modifier.finalModifier },
        concealment: { value: request.concealment.total },
      },
      output: band,
      children: [modifierTrace, request.concealment.trace],
    }),
  };
}
