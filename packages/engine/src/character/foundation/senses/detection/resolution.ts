import { resolveCheck } from "../../../../checks/resolution";
import { createTraceNode } from "../../../../infrastructure/trace";
import { resolveInformationBand } from "../information";
import type { DetectionRequest, DetectionResolution } from "./types";
import { resolvePassiveDetection } from "./passive";

function assertMatchingRoute(request: DetectionRequest): void {
  const signature = request.cue.signature;
  const route = request.concealment.route;
  if (
    route.sense !== signature.sense ||
    route.phenomenon !== signature.phenomenon ||
    route.subject !== signature.subject
  ) {
    throw new RangeError("Detection and Concealment must describe the same sensory route.");
  }
}

export function resolveDetectionCheck(request: DetectionRequest): DetectionResolution {
  assertMatchingRoute(request);
  if (request.mode === "passive") return resolvePassiveDetection(request);
  if (request.dice === undefined) {
    throw new RangeError("Active and reaction Detection require supplied d20 dice.");
  }

  const signature = request.cue.signature;
  const sense = request.profile.senses[signature.sense];
  const check = resolveCheck({
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
  const margin = check.total - request.concealment.total;
  const band = resolveInformationBand(margin, request.informationOverride);

  return {
    mode: request.mode,
    observerTotal: check.total,
    concealmentTotal: request.concealment.total,
    margin,
    band,
    check,
    trace: createTraceNode({
      id: `character.senses.detection.${request.mode}.${signature.id}`,
      label: `Resolve ${request.mode} Detection`,
      formula: "Detection total - Concealment total",
      inputs: { detection: { value: check.total }, concealment: { value: request.concealment.total } },
      output: band,
      children: [check.trace, request.concealment.trace],
    }),
  };
}
