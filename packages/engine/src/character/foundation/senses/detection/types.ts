import type { CheckDiceInput, CheckModifierContribution, CheckResolution } from "../../../../checks/types";
import type { TraceNode } from "../../../../infrastructure/trace";
import type { ConcealmentRating } from "../concealment";
import type { GeneratedSensoryRoute, SensoryRoute } from "../routes";
import type { DetectionMode } from "../scopes";
import type { ResolvedSensoryProfile } from "../types";

/*
 * What Detection is handed.
 *
 * A GENERATED ROUTE, not a cue. That is the change that stops a concealed
 * threat being rolled for twice: the old shape took a `PerceivedCue`, which
 * was the output of a Perception check, so finding a hidden assassin meant
 * first passing an uncertain reception and then passing Detection — two rolls,
 * one of which nobody had authored a difficulty for.
 *
 * A route already carries the received intensity, so the caller cannot hand in
 * a route and separately claim a different loudness for it.
 */
export interface DetectionRequest {
  readonly mode: DetectionMode;
  readonly profile: ResolvedSensoryProfile;
  readonly route: GeneratedSensoryRoute;
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

  /** The complete route acted through, receiver included. */
  readonly route: SensoryRoute;

  /** What arrived, after this observer's reception modifiers. */
  readonly receivedIntensity: number;

  readonly check?: CheckResolution;
  readonly trace: TraceNode;
}
