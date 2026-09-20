/*
 * Who heard the shout, what it bought them, and what it did not.
 *
 *
 * BEING SHOUTED AT IS NOT HEARING
 *
 * The whole of R13 is here. A warning is a noise in a room, and a noise in a
 * room reaches whoever it reaches: the deaf ally does not hear it, the one
 * behind the blast door does not hear it, and the one forty metres away hears
 * a quieter version that may not register. Every recipient therefore goes
 * through propagation and SEN-1 exactly as the threat's own danger cue did,
 * and being an intended recipient changes none of that.
 *
 * Group membership in particular buys NOTHING here. It is not a distance
 * bonus, not an automatic success, and not a channel of its own. What it does
 * is decide who the warning was MEANT for, which matters only for how the
 * information is interpreted — and which is why `intended` and `reached` are
 * two fields rather than one.
 *
 *
 * ANYBODY MAY BE LISTENING
 *
 * R14, and it falls out of the model rather than being enforced by it: the
 * shout is a cue on the `sound` channel, and route generation does not ask
 * whose side a listener is on. So the ambusher with good hearing detects the
 * warning shouted about them, and there is no privacy flag a caller can set to
 * prevent it. Making an ordinary shout private would take a real mechanic that
 * somebody authored — a code, a language, a whispered aside — and none of
 * those is a boolean on this function.
 *
 * `intercepted` is reported rather than hidden, because a GM needs to know the
 * assassin heard you.
 *
 *
 * WHAT A WARNING IS WORTH, EXACTLY
 *
 * R16 is a list of one thing it does and six it does not, and the six are the
 * ones that get quietly granted. A warning:
 *
 *   removes the Detection disadvantage that CONCEALMENT of this threat
 *   imposed, and nothing else.
 *
 * It does not reveal an invisible attacker, does not remove the disadvantage
 * on ATTACKING them, does not clear cover or obstruction, does not give an
 * exact location, does not carry over to the next threat, and does not
 * guarantee you keep track of them afterwards.
 *
 * The implementation is deliberately shaped so those are unreachable rather
 * than merely unwritten: `warningConcealmentRelief` returns a NUMBER, and that
 * number's only destination is the Reaction Gate's `independentAdvantage`. It
 * cannot touch a Concealment state, an exposure fact, a spatial fact or a
 * source id, because it never sees one. A relief that returned a modified
 * world could have removed any of the six by accident.
 *
 * It is also exactly the disadvantage and never more. Returning a flat +1
 * would make a warning about a barely-hidden attacker into a bonus — better
 * than never having been ambushed — and returning the Lead itself would scale
 * a courtesy into a superpower.
 *
 *
 * NO CHAINS
 *
 * R17 is enforced by absence. Nothing in this file emits, and nothing calls
 * back into `composeWarningCues`. A recipient who wants to pass it on declares
 * their own warning and pays for it, through the same front door the first
 * speaker used. There is no "propagate to allies" parameter to forget to set
 * to false.
 */

import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import type { GameTimestamp } from "../../time/types";
import {
  deriveConcealmentReactionDisadvantages,
  resolveConcealmentLead,
} from "../../character/foundation/senses/detection";
import type { ConcealmentRating } from "../../character/foundation/senses/concealment";
import type { DetectionRouteCandidate } from "../../character/foundation/senses/detection";
import type { SensoryExposureFacts } from "../../character/foundation/senses/routes";
import type { ResolvedSensoryProfile } from "../../character/foundation/senses/types";
import type { Distance } from "../../spatial";
import type { ActionEnvironmentSnapshot } from "../composition/environment";
import type { ChannelPropagationProfile } from "../composition/propagation";
import type { ComposedSensoryCue } from "../composition/sensory";
import { subjectAwareness, type ThreatAwareness } from "./awareness";
import type { ThreatIdentity } from "./identity";
import {
  receiveComposedCue,
  type ThreatReceptionFailure,
} from "./reception";
import { compareEffectToImpact, type EffectTimeliness } from "./timing";
import type { PreparedWarning } from "./warning";


const TRACE_ID = "gameplay.awareness.recipients";


export interface WarningRecipientInput {
  readonly warning: PreparedWarning;
  readonly threat: ThreatIdentity;

  readonly recipientId: string;

  /**
   * Whether the speaker meant this one.
   *
   * Decided by the caller from the relationship facts, and deliberately NOT
   * consulted when deciding whether the warning was heard. An unintended
   * listener with working ears hears it; an intended one behind a wall does
   * not.
   */
  readonly intended: boolean;

  /** Whether THIS threat endangers this recipient. Decides R15's two cases. */
  readonly endangered: boolean;

  readonly recipientProfile: ResolvedSensoryProfile;

  /** The warning's own cue, as composition produced it. */
  readonly composed: ComposedSensoryCue;

  readonly distance: Distance;
  readonly environment: ActionEnvironmentSnapshot;
  readonly profiles: readonly ChannelPropagationProfile[];
  readonly exposure?: SensoryExposureFacts;

  /** The Concealment standing against this recipient on the warning's channel. */
  readonly concealment: readonly ConcealmentRating[];

  /** What this recipient already knows about the threat being warned about. */
  readonly awareness: ThreatAwareness;
}


export type WarningRecipientOutcome =
  | {
      readonly reached: true;

      /** The routes SEN-1 will compare. Detection itself is still to come. */
      readonly candidates: readonly DetectionRouteCandidate[];

      readonly intended: boolean;

      /** Reached somebody it was not meant for. R14 permits this. */
      readonly intercepted: boolean;

      /**
       * When it becomes receivable.
       *
       * The Action's effect point, per R21. There is no separate flight time:
       * ordinary speech does not get a speed-of-sound simulation, and adding
       * one would be a timing model nothing else in this engine has.
       */
      readonly receivedAt: GameTimestamp;

      /** Whether it arrives before the thing it is warning about. */
      readonly timeliness: EffectTimeliness;

      /**
       * Whether this recipient could get their one defensive Gate from it.
       *
       * False for everybody not endangered — R15's information-only case —
       * and false for an endangered recipient whose one Gate has already been
       * offered, however that went.
       */
      readonly mayOpenGate: boolean;

      /**
       * Whether the warning is what made them aware.
       *
       * False when they had already detected the threat for themselves. The
       * warning is then redundant rather than forbidden: it does not create a
       * second Gate, because the Gate they are entitled to is the same one
       * either way, and the disposition is what allows it exactly once.
       */
      readonly establishesAwareness: boolean;

      readonly trace: TraceNode;
    }
  | {
      readonly reached: false;
      readonly reason: WarningRecipientFailure;
      readonly trace: TraceNode;
    };


export type WarningRecipientFailure =
  | ThreatReceptionFailure
  /* The warning is about a different threat than the one asked about. */
  | "threat-mismatch";


/**
 * Resolve one recipient, intended or not.
 *
 * Note the order: reach is settled first and entirely on sensory grounds, and
 * only then does anything ask who this person is. Asking in the other order is
 * how "allies always hear you" gets written.
 */
export function resolveWarningRecipient(
  input: WarningRecipientInput,
): WarningRecipientOutcome {
  const trace = (output: string | number): TraceNode =>
    createTraceNode({
      id: TRACE_ID,
      label: "Resolve a warning recipient",
      formula: "reach is sensory; who they are decides only what it is worth",
      inputs: {
        warning: { value: input.warning.warningId },
        recipient: { value: input.recipientId },
        intended: { value: input.intended },
        endangered: { value: input.endangered },
      },
      output,
    });

  if (input.warning.threatKey !== input.threat.key) {
    return { reached: false, reason: "threat-mismatch", trace: trace("threat-mismatch") };
  }

  const reception = receiveComposedCue({
    reference: input.warning.warningId,
    subjectId: input.recipientId,
    composed: input.composed,
    observerProfile: input.recipientProfile,
    distance: input.distance,
    environment: input.environment,
    profiles: input.profiles,
    ...(input.exposure === undefined ? {} : { exposure: input.exposure }),
    concealment: input.concealment,
  });

  if (!reception.received) {
    return { reached: false, reason: reception.reason, trace: trace(reception.reason) };
  }

  const receivedAt = input.warning.effect.effectiveAt;
  const timeliness = compareEffectToImpact(
    receivedAt,
    input.threat.timing.impactAt,
  );

  const already = subjectAwareness(input.awareness, input.recipientId);

  return {
    reached: true,
    candidates: reception.candidates,
    intended: input.intended,
    intercepted: !input.intended,
    receivedAt,
    timeliness,

    /*
     * Three conditions, all of them necessary, and one common mistake avoided.
     *
     * Endangered, because R15 gives a bystander information and nothing else.
     * Timely, because a warning arriving after impact may be recorded but
     * cannot retroactively authorize a defence against something that already
     * landed. And the Gate still PENDING — which is the condition that does
     * the real work.
     *
     * The mistake is requiring the recipient to have already detected the
     * threat. That is the test for a DIRECT entitlement, and applying it here
     * inverts the rule: a warning exists precisely to reach somebody who has
     * not noticed, so demanding prior awareness would make a warning useful
     * only to people who did not need it.
     *
     * What stops a second Gate is therefore the disposition and not the
     * detection. A recipient who noticed for themselves and has not yet been
     * offered anything is entitled to one Gate; whether the warning or their
     * own eyes established it does not make it two.
     */
    mayOpenGate: input.endangered &&
      already.gate === "pending" &&
      timeliness === "timely",

    establishesAwareness: !already.detected,

    trace: trace(reception.candidates.length),
  };
}


/**
 * What a detected warning is worth on the recipient's Reaction Gate.
 *
 * Exactly the Concealment disadvantage this threat's hiding imposed, so the
 * two cancel and the recipient reacts as though nobody had been hiding. Not
 * more, which would be a bonus for having been ambushed, and not a fixed
 * number, which would be the wrong size at both ends of the table.
 *
 * Zero when nothing was concealed. There is nothing to relieve, and a warning
 * about an attacker standing in plain sight is worth no dice — the recipient
 * already had every chance the rules give them.
 *
 * The result goes to `prepareReactionGate`'s `independentAdvantage` and
 * nowhere else. That parameter's own documentation names a shouted warning as
 * its example, so this is the channel SEN-1 already built for it rather than a
 * new one.
 */
export function warningConcealmentRelief(input: {
  readonly concealmentTotal: number;
  readonly passiveDetectionTotal: number;
}): number {
  const lead = resolveConcealmentLead(input);

  /*
   * A failure here means passive Detection had already beaten the Concealment,
   * so there was no Lead and therefore no disadvantage to relieve. Zero is the
   * correct answer and not a swallowed error: `resolveConcealmentLead` refuses
   * a negative Lead precisely so callers cannot feed one to the table.
   */
  if (!lead.success) return 0;

  const disadvantages = deriveConcealmentReactionDisadvantages(lead.payload);

  return disadvantages.success ? disadvantages.payload : 0;
}
