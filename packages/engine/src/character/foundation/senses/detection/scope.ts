/*
 * The two things every Detection resolver needs to build identically.
 *
 * Written once here rather than twice in passive.ts and resolution.ts, because
 * the two used to construct their scopes inline and the pair is exactly where
 * a divergence would be invisible: a channel omitted from one of them would
 * leave channel-scoped modifiers applying to rolled Detection and silently not
 * to passive comparison.
 */

import type { CheckBaseContribution } from "../../../../checks/types";
import { NEUTRAL_SENSORY_INTENSITY } from "../channels";
import type { GeneratedSensoryRoute, SensoryRoute } from "../routes";
import type { DetectionCheckScope, DetectionMode } from "../scopes";

/** The id every intensity contribution carries, so a trace names it. */
export const SENSORY_INTENSITY_CONTRIBUTION_ID = "sensoryIntensity";

export function detectionScopeFor(
  mode: DetectionMode,
  route: SensoryRoute,
): DetectionCheckScope {
  return {
    kind: "detection",
    mode,
    sense: route.sense,
    channel: route.channel,
    phenomenon: route.phenomenon,
    subject: route.subject,
  };
}

/**
 * What the cue's loudness is worth, as ONE named base contribution.
 *
 * `received - 5`, straight from the route. Named rather than folded into the
 * observer's alertness so a trace can show the two apart, and taken from the
 * route rather than recomputed so that the number a Reaction Gate was prepared
 * against is the number that settles it.
 */
export function intensityContribution(
  generated: GeneratedSensoryRoute,
): CheckBaseContribution {
  return {
    id: SENSORY_INTENSITY_CONTRIBUTION_ID,
    amount: generated.receivedIntensity - NEUTRAL_SENSORY_INTENSITY,
  };
}
