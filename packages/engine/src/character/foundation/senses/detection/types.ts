import type { CheckDiceInput, CheckModifierContribution, CheckResolution } from "../../../../checks/types";
import type { TraceNode } from "../../../../infrastructure/trace";
import type { ConcealmentRating } from "../concealment";
import type { InformationBand, InformationBandOverride } from "../information";
import type { DetectionMode } from "../scopes";
import type { PerceivedCue } from "../signatures";
import type { ResolvedSensoryProfile } from "../types";

export interface DetectionRequest {
  readonly mode: DetectionMode;
  readonly profile: ResolvedSensoryProfile;
  readonly cue: PerceivedCue;
  readonly concealment: ConcealmentRating;
  readonly dice?: CheckDiceInput;
  readonly modifiers?: readonly CheckModifierContribution[];
  readonly informationOverride?: InformationBandOverride;
}

export interface DetectionResolution {
  readonly mode: DetectionMode;
  readonly observerTotal: number;
  readonly concealmentTotal: number;
  readonly margin: number;
  readonly band: InformationBand;
  readonly check?: CheckResolution;
  readonly trace: TraceNode;
}
