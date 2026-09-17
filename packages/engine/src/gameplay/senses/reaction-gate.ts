/*
 * The Detection-based Reaction Gate.
 *
 * Combat has always had a hole shaped exactly like this file. It creates the
 * Reaction opportunity, queues everybody an Action threatened, and then waits to
 * be TOLD whether each Gate passed — deliberately, because whether you noticed
 * the knife is a sensory question and Combat is not allowed to answer sensory
 * questions. This is the adapter that answers it and hands the queue the
 * boolean it was waiting for.
 *
 * It lives in `gameplay/` rather than in `gameplay/combat/` for a reason the
 * architecture test enforces: Combat may not import Character content. A Gate
 * resolver needs a resolved sensory profile and a retained Concealment state,
 * both of which are Character's. Putting it inside Combat would either break
 * that rule or push senses down into Combat, and `gameplay/aura` already
 * established the shape for a composition that legitimately joins the two.
 *
 *
 * THERE IS NO THIRD CHECK
 *
 * The sequence is: passive Detection (free, constant, no roll), then — if and
 * only if a threat is actually declared — one rolled Gate. Nothing in between.
 * An earlier design had a "prompted Detection" step where a character who
 * passively missed something got a second, free look before combat began, and
 * it made concealment meaningless: every ambush was pre-announced, and the Gate
 * it announced was then rolled anyway.
 *
 *
 * WHY PREPARATION AND SETTLEMENT ARE TWO CALLS
 *
 * Because the number of dice depends on the answer. Concealment Lead produces
 * one to four disadvantages, the caller may have independent advantage of its
 * own, and the two reconcile into a single signed level that decides how many
 * d20s the runtime must supply. That has to be computed BEFORE anybody rolls.
 *
 * A single call would have to either roll for itself — which this engine never
 * does — or accept one die and silently apply disadvantages to it, which is the
 * same as not applying them.
 *
 * The cost of splitting is a window in which a caller holds a favourable
 * preparation, so the preparation carries a binding of every identity it was
 * computed against, and settlement refuses anything that no longer matches. A
 * prepared check against the assassin cannot be spent on the guard.
 */

import type {
  CheckModifierContribution,
} from "../../checks/types";
import {
  concealmentRatingForRoute,
  isConcealedFrom,
  recordConcealmentDetection,
  type EstablishedConcealmentState,
} from "../../character/foundation/senses/concealment";
import type { ConcealmentRoute } from "../../character/foundation/senses/concealment";
import {
  deriveConcealmentReactionDisadvantages,
  reconcileDetectionAdvantage,
  resolveConcealmentLead,
  resolveDetectionCheck,
  sweepPassiveDetectionRoutes,
  type DetectionResolution,
  type DetectionRouteCandidate,
} from "../../character/foundation/senses/detection";
import { sensoryFailure } from "../../character/foundation/senses/diagnostics";
import type { ResolvedSensoryProfile } from "../../character/foundation/senses/types";
import type { EngineError } from "../../infrastructure/diagnostics";
import {
  engineSuccess,
  type EngineResult,
} from "../../infrastructure/result";
import { createTraceNode } from "../../infrastructure/trace";
import { expectedRollCount } from "../../checks/resolution";
import { projectCheckDice } from "../../runtime/check-dice";
import type { RuntimeRollSet } from "../../runtime/dice";
import {
  nextReactionOpportunity,
  queueReactionAfterGateSuccess,
  skipReactionOpportunity,
  type ReactionQueue,
} from "../combat/reaction-queue";
import type { CombatantId, ReactionTrigger } from "../combat/types";


/**
 * Everything a prepared Gate was computed against.
 *
 * Settlement re-derives this from the state it is handed and compares. A
 * mismatch on any field means the world moved between the two calls, and the
 * prepared advantage no longer describes anything real.
 */
export interface ReactionGateBinding {
  readonly trigger: ReactionTrigger;
  readonly reactingCombatantId: CombatantId;
  readonly observerId: string;
  readonly sourceId: string;
  /** Null when the source was already detected and no attempt is in play. */
  readonly attemptId: string | null;
  readonly route: ConcealmentRoute | null;
}


export interface ReactionGatePreparation {
  readonly binding: ReactionGateBinding;

  /**
   * True when this combatant had already found the source, whether earlier or
   * through passive Detection just now. No Concealment Lead applies.
   */
  readonly alreadyDetected: boolean;

  readonly concealmentTotal: number;
  readonly passiveDetectionTotal: number;

  /** Zero when nothing was concealed from this combatant. */
  readonly lead: number;
  readonly concealmentDisadvantages: number;

  readonly independentAdvantage: number;
  readonly finalAdvantage: number;

  /** Exactly 1 + abs(finalAdvantage). Settlement accepts no other count. */
  readonly requiredRollCount: number;

  readonly trace: ReturnType<typeof createTraceNode>;
}


export interface PrepareReactionGateInput {
  readonly queue: ReactionQueue;

  readonly observerId: string;
  readonly profile: ResolvedSensoryProfile;

  readonly sourceId: string;

  /** Null when this combatant already knows where the threat is coming from. */
  readonly concealment: EstablishedConcealmentState | null;

  /** Every route this observer has on the source. The best one is used. */
  readonly routes: readonly DetectionRouteCandidate[];

  /**
   * Signed advantage from everything EXCEPT concealment: a shouted warning,
   * darkness, a Trait. Never a second helping of the same margin.
   */
  readonly independentAdvantage?: number;

  readonly modifiers?: readonly CheckModifierContribution[];
}


const TRACE_ID = "gameplay.senses.reaction-gate";


function gateFailure(label: string, error: EngineError) {
  return sensoryFailure(TRACE_ID, label, error);
}


function sameTrigger(left: ReactionTrigger, right: ReactionTrigger): boolean {
  if (left.kind !== right.kind) return false;

  if (left.kind === "action" && right.kind === "action") {
    return left.actionId === right.actionId &&
      left.actorCombatantId === right.actorCombatantId;
  }

  return left.kind === "event" && right.kind === "event" &&
    left.eventId === right.eventId;
}


function sameRoute(
  left: ConcealmentRoute | null,
  right: ConcealmentRoute | null,
): boolean {
  if (left === null || right === null) return left === right;

  return left.sense === right.sense &&
    left.phenomenon === right.phenomenon &&
    left.subject === right.subject;
}


function sameBinding(
  left: ReactionGateBinding,
  right: ReactionGateBinding,
): boolean {
  return sameTrigger(left.trigger, right.trigger) &&
    left.reactingCombatantId === right.reactingCombatantId &&
    left.observerId === right.observerId &&
    left.sourceId === right.sourceId &&
    left.attemptId === right.attemptId &&
    sameRoute(left.route, right.route);
}


/**
 * Work out what the next threatened combatant's Gate costs, before dice exist.
 *
 * Reads the queue's own next opportunity rather than taking a combatant id, so
 * a Gate cannot be prepared for somebody the queue is not currently asking.
 */
export function prepareReactionGate(
  input: PrepareReactionGateInput,
): EngineResult<ReactionGatePreparation> {
  const label = "Prepare the Detection Reaction Gate";
  const opportunity = nextReactionOpportunity(input.queue);

  if (opportunity === null) {
    return gateFailure(label, {
      code: "gameplay.senses.reaction-gate.no-opportunity",
      message: "This queue has no Reaction Gate waiting to be resolved.",
      audience: "developer",
      required: "a queue resolving gates",
      actual: input.queue.phase,
    });
  }

  const independentAdvantage = input.independentAdvantage ?? 0;

  if (!Number.isInteger(independentAdvantage)) {
    return gateFailure(label, {
      code: "gameplay.senses.reaction-gate.advantage.invalid",
      message: "Independent Reaction advantage must be a whole number.",
      audience: "developer",
      required: "integer",
      actual: String(independentAdvantage),
    });
  }

  const sweep = sweepPassiveDetectionRoutes({
    profile: input.profile,
    routes: input.routes,
    ...(input.modifiers === undefined ? {} : { modifiers: input.modifiers }),
  });

  if (!sweep.success) return sweep;

  const best = sweep.payload.best;

  /*
   * Three ways to be unconcealed, and all three mean the same thing here: the
   * combatant knows where the threat is, so the Gate is an ordinary Reaction
   * check with no Lead penalty.
   *
   *   - no concealment attempt is in play at all;
   *   - this observer broke the attempt earlier;
   *   - passive Detection just beat it, which §3.2 says breaks it outright.
   */
  const stillConcealed = input.concealment !== null &&
    isConcealedFrom(input.concealment, input.observerId) &&
    !sweep.payload.detected;

  const binding: ReactionGateBinding = {
    trigger: opportunity.trigger,
    reactingCombatantId: opportunity.reactingCombatantId,
    observerId: input.observerId,
    sourceId: input.sourceId,
    attemptId: stillConcealed ? input.concealment!.attemptId : null,
    route: stillConcealed ? best.route : null,
  };

  const finish = (
    lead: number,
    concealmentDisadvantages: number,
    finalAdvantage: number,
  ): EngineResult<ReactionGatePreparation> => {
    const requiredRollCount = expectedRollCount(finalAdvantage);
    const preparation: ReactionGatePreparation = {
      binding,
      alreadyDetected: !stillConcealed,
      concealmentTotal: best.concealmentTotal,
      passiveDetectionTotal: best.observerTotal,
      lead,
      concealmentDisadvantages,
      independentAdvantage,
      finalAdvantage,
      requiredRollCount,
      trace: createTraceNode({
        id: TRACE_ID,
        label,
        formula: "A_final = A - D, and D is fixed before any die is requested",
        inputs: {
          concealed: { value: stillConcealed },
          lead: { value: lead },
          concealmentDisadvantages: { value: concealmentDisadvantages },
          independentAdvantage: { value: independentAdvantage },
        },
        output: { finalAdvantage, requiredRollCount },
        children: [sweep.payload.trace],
      }),
    };

    return engineSuccess(preparation, { root: preparation.trace });
  };

  if (!stillConcealed) return finish(0, 0, independentAdvantage);

  const lead = resolveConcealmentLead({
    concealmentTotal: best.concealmentTotal,
    passiveDetectionTotal: best.observerTotal,
  });

  if (!lead.success) return lead;

  const disadvantages = deriveConcealmentReactionDisadvantages(lead.payload);

  if (!disadvantages.success) return disadvantages;

  const reconciled = reconcileDetectionAdvantage({
    independentAdvantage,
    concealmentDisadvantages: disadvantages.payload,
  });

  if (!reconciled.success) return reconciled;

  return finish(lead.payload, disadvantages.payload, reconciled.payload);
}


export interface SettleReactionGateInput {
  readonly queue: ReactionQueue;
  readonly preparation: ReactionGatePreparation;

  readonly observerId: string;
  readonly profile: ResolvedSensoryProfile;
  readonly sourceId: string;

  readonly concealment: EstablishedConcealmentState | null;

  /** The route prepared for, with its perceived cue. */
  readonly route: DetectionRouteCandidate;

  /** Exactly preparation.requiredRollCount d20s. */
  readonly rolls: RuntimeRollSet;

  readonly modifiers?: readonly CheckModifierContribution[];

  /** Ordering value for the Concealment transition a success produces. */
  readonly at: number;
}


export interface ReactionGateSettlement {
  readonly passed: boolean;
  readonly detection: DetectionResolution;

  /** The queue advanced through its own canonical success/failure transition. */
  readonly queue: ReactionQueue;

  /** Unchanged on a failure. That is the rule, not an oversight. */
  readonly concealment: EstablishedConcealmentState | null;
}


/**
 * Roll the prepared Gate and tell the queue what happened.
 *
 * The queue transition and the Concealment break happen together, from the one
 * result: a Reaction that opens against a subject still recorded as hidden is a
 * combatant reacting to something they have not found.
 */
export function settleReactionGate(
  input: SettleReactionGateInput,
): EngineResult<ReactionGateSettlement> {
  const label = "Settle the Detection Reaction Gate";
  const opportunity = nextReactionOpportunity(input.queue);

  if (opportunity === null) {
    return gateFailure(label, {
      code: "gameplay.senses.reaction-gate.no-opportunity",
      message: "This queue has no Reaction Gate waiting to be resolved.",
      audience: "developer",
      required: "a queue resolving gates",
      actual: input.queue.phase,
    });
  }

  const signature = input.route.cue.signature;
  const routeNow: ConcealmentRoute = {
    sense: signature.sense,
    phenomenon: signature.phenomenon,
    subject: signature.subject,
  };

  const stillConcealed = input.concealment !== null &&
    isConcealedFrom(input.concealment, input.observerId);

  const current: ReactionGateBinding = {
    trigger: opportunity.trigger,
    reactingCombatantId: opportunity.reactingCombatantId,
    observerId: input.observerId,
    sourceId: input.sourceId,
    attemptId: stillConcealed ? input.concealment!.attemptId : null,
    route: stillConcealed ? routeNow : null,
  };

  if (!sameBinding(input.preparation.binding, current)) {
    return gateFailure(label, {
      code: "gameplay.senses.reaction-gate.stale",
      message:
        "This prepared Reaction Gate does not describe the threat, observer, route or Concealment attempt in front of it.",
      audience: "developer",
      required: JSON.stringify(input.preparation.binding),
      actual: JSON.stringify(current),
    });
  }

  if (input.rolls.values.length !== input.preparation.requiredRollCount) {
    return gateFailure(label, {
      code: "gameplay.senses.reaction-gate.dice.count",
      message: "A Reaction Gate must be settled with exactly the dice its preparation required.",
      audience: "developer",
      required: String(input.preparation.requiredRollCount),
      actual: String(input.rolls.values.length),
    });
  }

  const dice = projectCheckDice(input.rolls, input.preparation.finalAdvantage);

  if (!dice.success) return dice;

  /*
   * An already-detected source is rolled against the same retained total when
   * one exists, and against the passive snapshot's total otherwise. Either way
   * the number comes from the preparation, so the check cannot be re-aimed at a
   * softer Concealment between the two calls.
   */
  const rating = stillConcealed
    ? concealmentRatingForRoute(input.concealment!, routeNow)
    : input.route.concealment;

  if (rating === undefined) {
    return gateFailure(label, {
      code: "gameplay.senses.reaction-gate.route.uncovered",
      message: "The prepared Concealment attempt does not cover this route.",
      audience: "developer",
      required: "a rated route",
      actual: `${routeNow.sense}/${routeNow.phenomenon}/${routeNow.subject}`,
    });
  }

  if (rating.total !== input.preparation.concealmentTotal) {
    return gateFailure(label, {
      code: "gameplay.senses.reaction-gate.stale",
      message: "The Concealment total changed between preparing and settling this Gate.",
      audience: "developer",
      required: String(input.preparation.concealmentTotal),
      actual: String(rating.total),
    });
  }

  const detected = resolveDetectionCheck({
    mode: "reaction",
    profile: input.profile,
    cue: input.route.cue,
    concealment: rating,
    dice: dice.payload,
    ...(input.modifiers === undefined ? {} : { modifiers: input.modifiers }),
  });

  if (!detected.success) return detected;

  const detection = detected.payload;

  const trace = createTraceNode({
    id: `${TRACE_ID}.settle`,
    label,
    formula: "a passed Gate queues the Reaction and breaks Concealment for that observer alone",
    inputs: {
      reacting: { value: opportunity.reactingCombatantId },
      finalAdvantage: { value: input.preparation.finalAdvantage },
    },
    output: detection.detected,
    children: [detection.trace],
  });

  if (!detection.detected) {
    /*
     * A failed Gate is the canonical skip. Nothing is spent, nothing opens, and
     * Concealment is untouched — the attack having happened is not a discovery.
     */
    return engineSuccess({
      passed: false,
      detection,
      queue: skipReactionOpportunity(input.queue),
      concealment: input.concealment,
    }, { root: trace });
  }

  const queue = queueReactionAfterGateSuccess(input.queue);

  if (!stillConcealed) {
    return engineSuccess({
      passed: true,
      detection,
      queue,
      concealment: input.concealment,
    }, { root: trace });
  }

  const broken = recordConcealmentDetection(input.concealment!, {
    attemptId: input.concealment!.attemptId,
    observerId: input.observerId,
    at: input.at,
  });

  if (!broken.success) return broken;

  return engineSuccess({
    passed: true,
    detection,
    queue,
    concealment: broken.payload,
  }, { root: trace });
}
