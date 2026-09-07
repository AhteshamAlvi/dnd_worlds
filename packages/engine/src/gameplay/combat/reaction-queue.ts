/*
 * One threat, several people who may answer it.
 *
 * An Action can endanger more than one participant, and every one of them is
 * entitled to their Reaction Gate. The single-opportunity model silently
 * dropped everybody after the first: a sweep that threatened three combatants
 * offered one of them a chance to react and resolved through the other two.
 *
 * A queue fixes that, and the ORDER it imposes is the interesting part.
 * Everything runs in the Round's own Initiative order, so who gets to answer
 * first is decided by the same rule that decides who acts first, rather than
 * by the order a host happened to list its targets in.
 *
 *
 * THE SEQUENCE
 *
 *   threatened participants, deduplicated and initiative-ordered
 *        ↓  one at a time
 *   external Reaction Gate
 *        ↓  failed or declined            ↓  passed
 *   next opportunity, nothing spent       queued, still in initiative order
 *        ↓
 *   queued Reactions resolve one at a time
 *        ↓
 *   the FIRST one to open ends the triggering Turn, once and for good
 *        ↓
 *   when the queue empties, Initiative continues after the interrupted
 *   combatant — which is where it has been parked the whole time
 *
 * The Gate itself is not resolved here and is not resolved by Combat at all:
 * it is a Detection question, and this module is told the answer.
 */

import {
  buildQueuedReaction,
  type ReactionStartFailureReason,
} from "./reaction";
import { activateReaction, advanceToNextTurn } from "./round";
import { endTurnForReaction, type TurnEnd } from "./turn";
import { findInitiativeIndex } from "./initiative";
import type {
  CombatantId,
  CombatRound,
  ReactionOpportunity,
  ReactionTrigger,
} from "./types";
import type { RoundProgressResult } from "./round";


export const REACTION_QUEUE_FAILURE_REASONS = [
  "no-active-turn",
  "trigger-id-missing",
  "threatened-combatant-unknown",
  "queue-empty",
  "queue-trigger-mismatch",
  "reaction-open-failed",
] as const;

export type ReactionQueueFailureReason =
  typeof REACTION_QUEUE_FAILURE_REASONS[number];


/**
 * Who still has to be asked, and who is waiting to act.
 *
 * Both lists hold Combatant ids in Initiative order. `turnEnded` records
 * that the triggering Turn has already been closed by an earlier opening, so
 * the second and later Reactions in one queue do not try to close it again.
 */
export interface ReactionQueue {
  readonly trigger: ReactionTrigger;

  /** Whose Turn this queue interrupts. Initiative stays parked here. */
  readonly interruptedCombatantId: CombatantId;

  /** Threatened participants whose Gate has not been resolved yet. */
  readonly pendingOpportunities: readonly CombatantId[];

  /** Gate-passed participants waiting to take their Reaction. */
  readonly queuedReactions: readonly CombatantId[];

  readonly turnEnded: boolean;
}


export interface ReactionQueueFailure {
  readonly success: false;
  readonly reason: ReactionQueueFailureReason;
  readonly combatantId?: CombatantId;
  readonly reactionStartFailureReason?: ReactionStartFailureReason;
}


export interface ReactionQueueOpened {
  readonly success: true;
  readonly queue: ReactionQueue;
}


export type ReactionQueueResult =
  | ReactionQueueOpened
  | ReactionQueueFailure;


function triggerId(trigger: ReactionTrigger): string {
  return trigger.kind === "action" ? trigger.actionId : trigger.eventId;
}


function actorOf(trigger: ReactionTrigger): CombatantId | undefined {
  return trigger.kind === "action" ? trigger.actorCombatantId : undefined;
}


/**
 * Order threatened combatants by the Round's own Initiative.
 *
 * Anybody absent from the order sorts last, which cannot happen in a valid
 * Round and is preferable to dropping them silently if it ever does.
 */
function inInitiativeOrder(
  round: CombatRound,
  combatantIds: readonly CombatantId[],
): readonly CombatantId[] {
  return [...combatantIds].sort((left, right) => {
    const leftIndex = findInitiativeIndex(round.initiative, left)
      ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = findInitiativeIndex(round.initiative, right)
      ?? Number.MAX_SAFE_INTEGER;

    return leftIndex - rightIndex;
  });
}


/**
 * Opens a queue of Reaction opportunities for one trigger.
 *
 * Nothing is spent and no state changes: this only decides who is going to
 * be asked, and in what order. The triggering Turn stays open, which is the
 * delayed transition the Action path depends on.
 */
export function openReactionQueue(
  round: CombatRound,
  trigger: ReactionTrigger,
  threatenedCombatantIds: readonly CombatantId[],
): ReactionQueueResult {
  const state = round.activeState;

  if (state === null || state.kind !== "turn") {
    return { success: false, reason: "no-active-turn" };
  }

  if (triggerId(trigger).trim().length === 0) {
    return { success: false, reason: "trigger-id-missing" };
  }

  const actor = actorOf(trigger);

  const distinct = Array.from(new Set(threatenedCombatantIds))
    /* Nobody reacts to their own Action. A hazard has no actor to exclude. */
    .filter((combatantId) => combatantId !== actor);

  for (const combatantId of distinct) {
    const known = round.combatants.some(
      (combatant) => combatant.combatantId === combatantId,
    );

    if (!known || combatantId.trim().length === 0) {
      return {
        success: false,
        reason: "threatened-combatant-unknown",
        combatantId,
      };
    }
  }

  return {
    success: true,

    queue: {
      trigger,
      interruptedCombatantId: state.combatantId,
      pendingOpportunities: inInitiativeOrder(round, distinct),
      queuedReactions: [],
      turnEnded: false,
    },
  };
}


/** The next combatant whose Reaction Gate has to be resolved, if any. */
export function nextReactionOpportunity(
  queue: ReactionQueue,
): ReactionOpportunity | null {
  const next = queue.pendingOpportunities[0];

  if (next === undefined) return null;

  return { trigger: queue.trigger, reactingCombatantId: next };
}


/**
 * Records that a Gate failed, or that the combatant declined.
 *
 * Both spend nothing and open nothing. The queue simply moves on, which is
 * what stops one refusal from silently cancelling everybody else's chance.
 */
export function skipReactionOpportunity(
  queue: ReactionQueue,
): ReactionQueue {
  return { ...queue, pendingOpportunities: queue.pendingOpportunities.slice(1) };
}


/** Records that a Gate succeeded. The Reaction is queued, not yet opened. */
export function queueReactionAfterGateSuccess(
  queue: ReactionQueue,
): ReactionQueue {
  const next = queue.pendingOpportunities[0];

  if (next === undefined) return queue;

  return {
    ...queue,
    pendingOpportunities: queue.pendingOpportunities.slice(1),
    queuedReactions: [...queue.queuedReactions, next],
  };
}


export interface QueuedReactionOpened {
  readonly success: true;
  readonly round: CombatRound;
  readonly queue: ReactionQueue;

  /** Present only on the FIRST opening: the Turn ends once. */
  readonly triggeringTurnEnd?: TurnEnd;
}


export type QueuedReactionOpenResult =
  | QueuedReactionOpened
  | ReactionQueueFailure;


/**
 * Opens the next queued Reaction.
 *
 * The first successful opening ends the triggering Turn and it is never
 * resumed. Later ones replace the finished Reaction directly, because there
 * is no Turn left to end.
 *
 * A combatant who has run out of Round Actions between passing their Gate
 * and reaching the front of the queue cannot open theirs — the shared pool
 * is the only Reaction limit there is, and it is checked when the Reaction
 * actually opens rather than when the Gate was passed.
 */
export function openNextQueuedReaction(
  round: CombatRound,
  queue: ReactionQueue,
): QueuedReactionOpenResult {
  const reactingCombatantId = queue.queuedReactions[0];

  if (reactingCombatantId === undefined) {
    return { success: false, reason: "queue-empty" };
  }

  const built = buildQueuedReaction(
    { trigger: queue.trigger, reactingCombatantId },
    queue.interruptedCombatantId,
    round.combatants,
  );

  if (!built.success) {
    return {
      success: false,
      reason: "reaction-open-failed",
      combatantId: reactingCombatantId,
      reactionStartFailureReason: built.reason,
    };
  }

  const remaining: ReactionQueue = {
    ...queue,
    queuedReactions: queue.queuedReactions.slice(1),
    turnEnded: true,
  };

  const opened = activateReaction(round, built.reaction);

  if (queue.turnEnded) {
    return { success: true, round: opened, queue: remaining };
  }

  const state = round.activeState;

  if (state === null || state.kind !== "turn") {
    return { success: false, reason: "no-active-turn" };
  }

  return {
    success: true,
    round: opened,
    queue: remaining,
    triggeringTurnEnd: endTurnForReaction(state),
  };
}


export interface ReactionQueueContinued {
  readonly success: true;

  /** True while another queued Reaction is now active. */
  readonly reactionOpened: boolean;

  readonly round: CombatRound;
  readonly queue: ReactionQueue;

  /** Only set once the queue is exhausted and Initiative moved on. */
  readonly roundComplete?: boolean;
}


export type ReactionQueueContinueResult =
  | ReactionQueueContinued
  | ReactionQueueFailure;


/**
 * Advances after one queued Reaction has finished.
 *
 * While the queue holds anybody, the next Reaction opens — NOT the next
 * Turn. Only once it is empty does Initiative continue, and because it was
 * never moved, it continues from the interrupted combatant to whoever comes
 * after them.
 */
export function continueReactionQueue(
  round: CombatRound,
  queue: ReactionQueue,
): ReactionQueueContinueResult {
  if (queue.queuedReactions.length > 0) {
    const opened = openNextQueuedReaction(
      { ...round, activeState: null },
      { ...queue, turnEnded: true },
    );

    if (!opened.success) return opened;

    return {
      success: true,
      reactionOpened: true,
      round: opened.round,
      queue: opened.queue,
    };
  }

  const progress: RoundProgressResult = advanceToNextTurn({
    ...round,
    activeState: null,
  });

  return {
    success: true,
    reactionOpened: false,
    round: progress.round,
    queue,
    roundComplete: progress.complete,
  };
}
