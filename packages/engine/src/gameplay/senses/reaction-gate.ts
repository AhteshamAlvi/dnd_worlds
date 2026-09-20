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
 *
 * "Every identity" is meant literally: trigger, reacting combatant, observer,
 * source, Concealment attempt, the COMPLETE route including its channel and
 * receiver, the received intensity, and the Concealment total. Each of those
 * either changes the dice count or changes the total the dice are compared
 * against, so a binding that omitted one would let a preparation be spent on a
 * check it was not costed for.
 *
 *
 * A PASSIVE WIN IS DECIDED IN THE FIRST CALL AND APPLIED IN THE SECOND
 *
 * Preparation is pure: it takes no ordering value, returns no state, and must
 * not quietly rewrite the world before the dice arrive. But passive Detection
 * is compared during it, and a passive win breaks the attempt outright — so
 * preparation records that break as a PENDING TRANSITION bound to the attempt
 * and the observer, and settlement applies it, once, at its own `at`.
 *
 * The first version instead described an already-unconcealed world in the
 * binding while leaving the state untouched. Settlement then re-derived a
 * still-concealed world from that same state, the two disagreed, and every
 * passive success refused its own preparation as stale — the one outcome in
 * the whole Gate that should cost a combatant nothing.
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
import {
  sensoryRouteKey,
  type SensoryRoute,
} from "../../character/foundation/senses/routes";
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

  /**
   * The COMPLETE canonical route, receiver and channel included.
   *
   * All of it, because all of it can move between the two calls. A Gate
   * prepared against the facial eyes must not be settled through a palm; a
   * Gate prepared against `visible-light` must not be settled against `sound`,
   * which would spend a preparation made in a lit room on a check in the dark.
   */
  readonly route: SensoryRoute | null;

  /**
   * What the cue was arriving at when the dice count was decided.
   *
   * Bound because it is a base contribution on the settling check: a threat
   * that got louder after the preparation would be rolled against a Gate
   * costed for the quieter one.
   */
  readonly receivedIntensity: number | null;
}


/**
 * A Concealment break that preparation DECIDED and settlement must APPLY.
 *
 * Passive Detection is free and constant, so it can succeed during the pure
 * preparation pass — and §3.2 says a passive win breaks the attempt outright.
 * Preparation may not return a new Concealment state (it takes no ordering
 * value and produces no transition), and it may not pretend the break already
 * happened either: the retained state still records this observer as
 * concealed, so settlement re-derived the old answer and refused its own
 * preparation as stale.
 *
 * It is recorded here instead, as a transition addressed at one attempt and
 * one observer, and applied once at settlement's `at`. Both fields are also in
 * the binding, which is what makes this a bound instruction rather than a
 * boolean a caller could set: settlement checks the attempt in front of it
 * before it applies anything.
 */
export interface ReactionGatePendingDetection {
  readonly attemptId: string;
  readonly observerId: string;
}


export interface ReactionGatePreparation {
  readonly binding: ReactionGateBinding;

  /**
   * True when this combatant had already found the source, whether earlier or
   * through passive Detection just now. No Concealment Lead applies.
   */
  readonly alreadyDetected: boolean;

  /**
   * The passive break this preparation owes the Concealment state.
   *
   * Null unless passive Detection beat a live attempt during preparation.
   */
  readonly pendingDetection: ReactionGatePendingDetection | null;

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
  left: SensoryRoute | null,
  right: SensoryRoute | null,
): boolean {
  if (left === null || right === null) return left === right;

  return sensoryRouteKey(left) === sensoryRouteKey(right);
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
    left.receivedIntensity === right.receivedIntensity &&
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
   * TWO questions, and the defect was answering them with one boolean.
   *
   * What the retained state SAYS is whether an attempt is live against this
   * observer, and that is what the binding is made of: settlement re-derives
   * it from the state it is handed, so a preparation that quietly described
   * an unconcealed world could never match a state that still said concealed.
   *
   * What the Gate COSTS is a different question. Three things make it an
   * ordinary Reaction check with no Lead penalty: no attempt in play, an
   * attempt this observer broke earlier, or passive Detection beating it just
   * now — which §3.2 says breaks it outright, and which this preparation
   * therefore owes the state as a pending transition rather than as an
   * assumption.
   */
  const concealedNow = input.concealment !== null &&
    isConcealedFrom(input.concealment, input.observerId);

  const passivelyDetected = concealedNow && sweep.payload.detected;
  const concealmentApplies = concealedNow && !passivelyDetected;

  const binding: ReactionGateBinding = {
    trigger: opportunity.trigger,
    reactingCombatantId: opportunity.reactingCombatantId,
    observerId: input.observerId,
    sourceId: input.sourceId,
    attemptId: concealedNow ? input.concealment!.attemptId : null,
    route: concealedNow ? best.route : null,
    receivedIntensity: concealedNow ? best.receivedIntensity : null,
  };

  const pendingDetection: ReactionGatePendingDetection | null =
    passivelyDetected
      ? {
        attemptId: input.concealment!.attemptId,
        observerId: input.observerId,
      }
      : null;

  const finish = (
    lead: number,
    concealmentDisadvantages: number,
    finalAdvantage: number,
  ): EngineResult<ReactionGatePreparation> => {
    const requiredRollCount = expectedRollCount(finalAdvantage);
    const preparation: ReactionGatePreparation = {
      binding,
      alreadyDetected: !concealmentApplies,
      pendingDetection,
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
          concealed: { value: concealmentApplies },
          passiveBreak: { value: pendingDetection !== null },
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

  if (!concealmentApplies) return finish(0, 0, independentAdvantage);

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

  /**
   * Unchanged by a FAILED Gate. That is the rule, not an oversight.
   *
   * It is not unchanged by a failed Gate that a passive Detection preceded. A
   * passive win broke the attempt for this observer before any die was asked
   * for, and the rolled Gate that follows decides whether they get to react —
   * not whether they saw what they had already seen.
   */
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

  const routeNow = input.route.route.route;

  const stillConcealed = input.concealment !== null &&
    isConcealedFrom(input.concealment, input.observerId);

  const current: ReactionGateBinding = {
    trigger: opportunity.trigger,
    reactingCombatantId: opportunity.reactingCombatantId,
    observerId: input.observerId,
    sourceId: input.sourceId,
    attemptId: stillConcealed ? input.concealment!.attemptId : null,
    route: stillConcealed ? routeNow : null,
    receivedIntensity: stillConcealed
      ? input.route.route.receivedIntensity
      : null,
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
      actual: sensoryRouteKey(routeNow),
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

  /*
   * The passive break, applied ONCE, before the Gate is rolled and regardless
   * of how it goes. Re-checked against the state actually in front of us even
   * though the binding has already matched it, so that a hand-built
   * preparation cannot address a transition at an attempt that is not here.
   */
  const pending = input.preparation.pendingDetection;
  let concealment = input.concealment;

  if (pending !== null) {
    if (
      input.concealment === null ||
      pending.attemptId !== input.concealment.attemptId ||
      pending.observerId !== input.observerId
    ) {
      return gateFailure(label, {
        code: "gameplay.senses.reaction-gate.stale",
        message:
          "This prepared Gate owes a passive Detection to a Concealment attempt that is not the one in front of it.",
        audience: "developer",
        required: JSON.stringify(pending),
        actual: JSON.stringify({
          attemptId: input.concealment?.attemptId ?? null,
          observerId: input.observerId,
        }),
      });
    }

    const passive = recordConcealmentDetection(input.concealment, {
      attemptId: pending.attemptId,
      observerId: pending.observerId,
      at: input.at,
    });

    if (!passive.success) return passive;

    concealment = passive.payload;
  }

  const detected = resolveDetectionCheck({
    mode: "reaction",
    profile: input.profile,
    route: input.route.route,
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
      passiveBreakApplied: { value: pending !== null },
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
      concealment,
    }, { root: trace });
  }

  const queue = queueReactionAfterGateSuccess(input.queue);

  /*
   * At most once. An observer the passive break has already removed is not
   * recorded a second time by the roll that followed it — and an attempt that
   * was never live is not started by one.
   */
  if (concealment === null || !isConcealedFrom(concealment, input.observerId)) {
    return engineSuccess({
      passed: true,
      detection,
      queue,
      concealment,
    }, { root: trace });
  }

  const broken = recordConcealmentDetection(concealment, {
    attemptId: concealment.attemptId,
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
