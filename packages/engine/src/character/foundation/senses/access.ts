import type { ResolvedSensoryProfile } from "./types";
import type { SensorySignature } from "./signatures";

export type SensoryAccessFailureReason =
  | "sense-unavailable"
  | "phenomenon-inaccessible"
  | "authored-impossible";

export type SensoryAccessResolution =
  | { readonly accessible: true }
  | {
      readonly accessible: false;
      readonly reason: SensoryAccessFailureReason;
      readonly detail?: string;
    };

/**
 * Resolves only fundamental access. Range and line of sight are intentionally
 * represented by the signature's authored reception until those systems exist.
 */
export function resolveSensoryAccess(
  profile: ResolvedSensoryProfile,
  signature: SensorySignature,
): SensoryAccessResolution {
  const sense = profile.senses[signature.sense];

  if (!sense.available) {
    return { accessible: false, reason: "sense-unavailable" };
  }

  if (signature.reception.kind === "impossible") {
    return {
      accessible: false,
      reason: "authored-impossible",
      ...(signature.reception.reason === undefined
        ? {}
        : { detail: signature.reception.reason }),
    };
  }

  if (
    signature.phenomenon === "nen" &&
    signature.sense !== "extrasensory" &&
    !profile.nenPerception.available
  ) {
    return { accessible: false, reason: "phenomenon-inaccessible" };
  }

  if (
    (signature.phenomenon === "intent" ||
      signature.phenomenon === "other-supernatural") &&
    signature.sense !== "extrasensory"
  ) {
    return { accessible: false, reason: "phenomenon-inaccessible" };
  }

  return { accessible: true };
}
