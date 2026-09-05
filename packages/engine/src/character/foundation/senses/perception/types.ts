import type {
  CheckDiceInput,
  CheckModifierContribution,
  FixedCheckResolution,
} from "../../../../checks/types";
import type { TraceNode } from "../../../../infrastructure/trace";
import type { InformationBand, InformationBandOverride } from "../information";
import type { SensoryAccessFailureReason } from "../access";
import type { PerceivedCue, SensorySignature } from "../signatures";
import type { ResolvedSensoryProfile } from "../types";

export interface PerceptionRequest {
  readonly profile: ResolvedSensoryProfile;
  readonly signature: SensorySignature;
  readonly dice?: CheckDiceInput;
  readonly modifiers?: readonly CheckModifierContribution[];
  readonly informationOverride?: InformationBandOverride;
}

export const PERCEPTION_STATUSES = [
  "inaccessible",
  "not-perceived",
  "perceived",
] as const;

export type PerceptionStatus = typeof PERCEPTION_STATUSES[number];

/**
 * No sensory route to the phenomenon exists at all: the sense is unavailable,
 * the phenomenon is inaccessible through it, or the signature is authored
 * impossible. Nothing was rolled, and no roll could have changed it.
 */
export interface InaccessiblePerception {
  readonly status: "inaccessible";
  readonly perceived: false;
  readonly signature: SensorySignature;
  readonly reason: SensoryAccessFailureReason;
  readonly trace: TraceNode;
}

/**
 * A route existed and the reception roll did not clear it. This is a FAILED
 * CHECK, not an access failure — which is why `check` is required here and
 * `reason` is absent.
 */
export interface UnperceivedPerception {
  readonly status: "not-perceived";
  readonly perceived: false;
  readonly signature: SensorySignature;
  readonly band: "none";
  readonly check: FixedCheckResolution;
  readonly trace: TraceNode;
}

/**
 * The cue was received. `check` is absent for automatic reception, which does
 * not roll, and present for a cleared uncertain reception.
 */
export interface PerceivedPerception {
  readonly status: "perceived";
  readonly perceived: true;
  readonly signature: SensorySignature;
  readonly band: Exclude<InformationBand, "none">;
  readonly cue: PerceivedCue;
  readonly check?: FixedCheckResolution;
  readonly trace: TraceNode;
}

/*
 * Three explicit states rather than a boolean plus optional fields.
 *
 * The previous shape had one member typed `perceived: false` and another typed
 * `perceived: boolean`, so narrowing on `perceived === false` matched both and
 * never established whether `accessFailure` or `check` was the thing to read.
 * Discriminating on `status` — with `perceived` narrowed to a literal in every
 * member so either one works — makes "was there no route" and "was the roll
 * missed" answerable without inspecting optional fields.
 */
export type PerceptionResolution =
  | InaccessiblePerception
  | UnperceivedPerception
  | PerceivedPerception;
