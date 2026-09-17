import type { CheckDiceInput, CheckModifierContribution, CheckResolution } from "../../../../checks/types";
import type { TraceNode } from "../../../../infrastructure/trace";
import type { ConcealmentRating, ConcealmentRoute } from "../concealment";
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
}

/*
 * Binary, and deliberately so.
 *
 * `detected` is the answer; `margin` is retained because the Concealment Lead
 * is derived from it and because a GM reading a trace wants to know whether the
 * ambush was close. It is NOT a band, and nothing downstream may reintroduce
 * one: an observer either found the subject or did not.
 */
export interface DetectionResolution {
  readonly mode: DetectionMode;
  readonly detected: boolean;
  readonly observerTotal: number;
  readonly concealmentTotal: number;
  /** Detection total minus Concealment total. Positive means detected. */
  readonly margin: number;
  readonly route: ConcealmentRoute;
  readonly check?: CheckResolution;
  readonly trace: TraceNode;
}
