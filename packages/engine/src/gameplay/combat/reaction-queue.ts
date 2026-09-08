/*
 * One threat, several people who may answer it — as a state machine.
 *
 * An Action can endanger more than one participant, and every one of them is
 * entitled to their Reaction Gate. The single-opportunity model silently
 * dropped everybody after the first.
 *
 * The first fix for that was a record of two mutable arrays and a boolean,
 * and it let a caller do things no sequence of play could: open a second
 * Reaction while the first was still running, discard an active Reaction by
 * calling "continue" twice, or advance Initiative after a queue in which
 * every Gate had failed and the Turn was therefore still alive. None of
 * those were reachable through the intended call order, and all of them were
 * reachable.
 *
 * So the queue is a discriminated state machine instead. Gates are resolved
 * in one phase and Reactions in another; the transition between them happens
 * once, when the last Gate is answered; and an open Reaction is named in the
 * state, so opening another before it ends is refusable rather than merely
 * discouraged.
 *
 *
 * THE SEQUENCE
 *
 *   resolving-gates
 *     threatened participants, deduplicated, in the Round's Initiative order
 *     each Gate answered in turn; a refusal spends nothing and opens nothing
 *        ↓  when the last Gate is answered
 *   resolving-reactions          (only if at least one Gate passed)
 *     one Reaction at a time; the FIRST opening ends the triggering Turn,
 *     once and for good; each must be finished through a canonical Reaction
 *     end before the next may open; a responder who has run out of Actions
 *     in the meantime is skipped without cancelling anybody after them
 *        ↓  when the last queued Reaction finishes
 *   complete
 *     Initiative continues from the interrupted combatant — but only if a
 *     Reaction actually opened. If every Gate failed, the Turn was never
 *     ended and belongs to the ordinary no-Reaction settlement path.
 *
 * The Gate itself is not resolved here, and not by Combat at all: it is a
 * Detection question, and this module is told the answer.
 */

import {
  buildQueuedReaction,
  type ReactionEnd,
  type ReactionStartFailureReason,
} from "./reaction";
import {
  activateReaction,
  advanceToNextTurn,
  setRoundActiveState,
} from "./round";
import { endTurnForReaction, type TurnEnd } from "./turn";
import { findInitiativeIndex } from "./initiative";
import { currentInitiativeCombatantId } from "./round";
import type {
  CombatantId,
  CombatRound,
  ReactionOpportunity,
  ReactionState,
  ReactionTrigger,
} from "./types";


export const REACTION_QUEUE_FAILURE_REASONS = [
  "no-active-turn",
  "trigger-id-missing",
  "queue-trigger-mismatch",
  "threatened-combatant-unknown",
  "wrong-phase",
  "gates-unresolved",
  "reaction-still-active",
  "no-active-reaction",
  "reaction-mismatch",
  "reaction-open-failed",
] as const;

export type ReactionQueueFailureReason =
  typeof REACTION_QUEUE_FAILURE_REASONS[number];


export interface ReactionQueueFailure {
  readonly success: false;
  readonly reason: ReactionQueueFailureReason;
  readonly combatantId?: CombatantId;
  readonly reactionStartFailureReason?: ReactionStartFailureReason;
}


interface ReactionQueueIdentity {
  readonly trigger: ReactionTrigger;

  /** Whose Turn this queue interrupts. Initiative stays parked here. */
  readonly interruptedCombatantId: CombatantId;

  /** Guards against a queue outliving the Round that produced it. */
  readonly roundNumber: number;
}


export interface GateResolvingQueue extends ReactionQueueIdentity {
  readonly phase: "resolving-gates";

  /** Threatened participants whose Gate has not been answered yet. */
  readonly pending: readonly CombatantId[];

  /** Gate-passed participants, in the order they will act. */
  readonly queued: readonly CombatantId[];
}


export interface ReactionResolvingQueue extends ReactionQueueIdentity {
  readonly phase: "resolving-reactions";

  readonly queued: readonly CombatantId[];

  /**
   * The responder whose Reaction is open right now.
   *
   * Named in the state rather than inferred, so opening another while one is
   * running is a refusable transition instead of an accident.
   */
  readonly activeResponder: CombatantId | null;

  /** Responders who lost their Actions before the queue reached them. */
  readonly skipped: readonly CombatantId[];

  readonly openedAny: boolean;
}


export interface CompleteQueue extends ReactionQueueIdentity {
  readonly phase: "complete";

  /**
   * Whether any Reaction actually opened.
   *
   * False means every Gate failed or was declined, the triggering Turn was
   * never ended, and Initiative must NOT advance — the caller settles the
   * Action normally instead.
   */
  readonly openedAny: boolean;

  readonly skipped: readonly CombatantId[];
}


export type ReactionQueue =
  | GateResolvingQueue
  | ReactionResolvingQueue
  | CompleteQueue;


export interface ReactionQueueOpened {
  readonly success: true;
  readonly queue: GateResolvingQueue;
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


function sameTrigger(
  left: ReactionTrigger,
  right: ReactionTrigger,
): boolean {
  if (left.kind !== right.kind) return false;

  return triggerId(left) === triggerId(right) &&
    actorOf(left) === actorOf(right);
}


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
 * Whether this queue still describes the Round in front of it.
 *
 * A queue is a small record a caller holds across several calls, so the
 * cheapest way to corrupt Combat is to keep one and use it against a later
 * Round, a different trigger, or after Initiative has moved. Every transition
 * checks this first.
 */
function findStalenessReason(
  round: CombatRound,
  queue: ReactionQueueIdentity,
): ReactionQueueFailureReason | null {
  if (queue.roundNumber !== round.number) return "queue-trigger-mismatch";

  if (currentInitiativeCombatantId(round) !== queue.interruptedCombatantId) {
    return "queue-trigger-mismatch";
  }

  if (triggerId(queue.trigger).trim().length === 0) {
    return "trigger-id-missing";
  }

  return null;
}


/**
 * Opens a queue of Reaction opportunities for one trigger.
 *
 * Nothing is spent and no state changes: this decides who will be asked, and
 * in what order. The triggering Turn stays open, which is the delayed
 * transition the Action path depends on.
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

  /*
   * An Action trigger must belong to the combatant whose Turn is being
   * interrupted. A Reaction to Gon's punch cannot interrupt Killua's Turn,
   * and a queue built that way would park Initiative on the wrong person.
   */
  if (actor !== undefined && actor !== state.combatantId) {
    return { success: false, reason: "queue-trigger-mismatch", combatantId: actor };
  }

  if (currentInitiativeCombatantId(round) !== state.combatantId) {
    return { success: false, reason: "queue-trigger-mismatch" };
  }

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
      phase: "resolving-gates",
      trigger,
      interruptedCombatantId: state.combatantId,
      roundNumber: round.number,
      pending: inInitiativeOrder(round, distinct),
      queued: [],
    },
  };
}


/** The next combatant whose Reaction Gate has to be resolved, if any. */
export function nextReactionOpportunity(
  queue: ReactionQueue,
): ReactionOpportunity | null {
  if (queue.phase !== "resolving-gates") return null;

  const next = queue.pending[0];

  if (next === undefined) return null;

  return { trigger: queue.trigger, reactingCombatantId: next };
}


/*
 * Moves out of the Gate phase once the last one has been answered.
 *
 * Splitting the transition out is what makes "no Reaction may open while a
 * Gate is unresolved" a property of the type rather than a rule callers are
 * asked to remember.
 */
function afterGate(
  queue: GateResolvingQueue,
  pending: readonly CombatantId[],
  queued: readonly CombatantId[],
): ReactionQueue {
  if (pending.length > 0) {
    return { ...queue, pending, queued };
  }

  if (queued.length === 0) {
    return {
      phase: "complete",
      trigger: queue.trigger,
      interruptedCombatantId: queue.interruptedCombatantId,
      roundNumber: queue.roundNumber,
      openedAny: false,
      skipped: [],
    };
  }

  return {
    phase: "resolving-reactions",
    trigger: queue.trigger,
    interruptedCombatantId: queue.interruptedCombatantId,
    roundNumber: queue.roundNumber,
    queued,
    activeResponder: null,
    skipped: [],
    openedAny: false,
  };
}


/**
 * Records that a Gate failed, or that the combatant declined.
 *
 * Both spend nothing and open nothing. The queue moves on, which is what
 * stops one refusal from cancelling everybody else's chance.
 */
export function skipReactionOpportunity(
  queue: ReactionQueue,
): ReactionQueue {
  if (queue.phase !== "resolving-gates") return queue;

  return afterGate(queue, queue.pending.slice(1), queue.queued);
}


/** Records that a Gate succeeded. The Reaction is queued, not yet opened. */
export function queueReactionAfterGateSuccess(
  queue: ReactionQueue,
): ReactionQueue {
  if (queue.phase !== "resolving-gates") return queue;

  const next = queue.pending[0];

  if (next === undefined) return queue;

  return afterGate(
    queue,
    queue.pending.slice(1),
    [...queue.queued, next],
  );
}


export interface QueuedReactionOpened {
  readonly success: true;
  readonly outcome: "opened";

  readonly round: CombatRound;
  readonly queue: ReactionResolvingQueue;

  /** Present only on the FIRST opening: the Turn ends once. */
  readonly triggeringTurnEnd?: TurnEnd;

  /** Responders passed over because they had no Actions left. */
  readonly skipped: readonly CombatantId[];
}


/**
 * Nobody left who can act.
 *
 * Every remaining responder lost their Actions before the queue reached
 * them. That is not a failure — it is the queue finishing — so it comes back
 * as an outcome carrying the completed queue, with every skipped responder
 * still recorded on it.
 */
export interface QueuedReactionExhausted {
  readonly success: true;
  readonly outcome: "exhausted";

  readonly queue: CompleteQueue;

  readonly skipped: readonly CombatantId[];
}


export type QueuedReactionOpenResult =
  | QueuedReactionOpened
  | QueuedReactionExhausted
  | ReactionQueueFailure;


function completedFrom(
  queue: ReactionResolvingQueue,
  skipped: readonly CombatantId[],
): CompleteQueue {
  return {
    phase: "complete",
    trigger: queue.trigger,
    interruptedCombatantId: queue.interruptedCombatantId,
    roundNumber: queue.roundNumber,
    openedAny: queue.openedAny,
    skipped: [...queue.skipped, ...skipped],
  };
}


/**
 * Opens the next queued Reaction.
 *
 * A responder who has lost their Round Actions between passing their Gate
 * and reaching the front of the queue is SKIPPED rather than failing the
 * whole queue — the shared pool is the only Reaction limit there is, and one
 * responder running out is not a reason to silence everybody behind them.
 * Eligibility is therefore checked here, at the moment the Reaction opens,
 * rather than when the Gate was answered.
 */
export function openNextQueuedReaction(
  round: CombatRound,
  queue: ReactionQueue,
): QueuedReactionOpenResult {
  if (queue.phase !== "resolving-reactions") {
    return {
      success: false,
      reason: queue.phase === "resolving-gates" ? "gates-unresolved" : "wrong-phase",
    };
  }

  if (queue.activeResponder !== null) {
    return {
      success: false,
      reason: "reaction-still-active",
      combatantId: queue.activeResponder,
    };
  }

  const stale = findStalenessReason(round, queue);

  if (stale !== null) return { success: false, reason: stale };

  const skipped: CombatantId[] = [];
  let remaining = queue.queued;

  while (remaining.length > 0) {
    const reactingCombatantId = remaining[0]!;

    const built = buildQueuedReaction(
      { trigger: queue.trigger, reactingCombatantId },
      queue.interruptedCombatantId,
      round.combatants,
    );

    if (!built.success) {
      if (built.reason === "reacting-combatant-not-round-eligible") {
        skipped.push(reactingCombatantId);
        remaining = remaining.slice(1);

        continue;
      }

      return {
        success: false,
        reason: "reaction-open-failed",
        combatantId: reactingCombatantId,
        reactionStartFailureReason: built.reason,
      };
    }

    const opened = activateReaction(round, built.reaction);

    const next: ReactionResolvingQueue = {
      ...queue,
      queued: remaining.slice(1),
      activeResponder: reactingCombatantId,
      skipped: [...queue.skipped, ...skipped],
      openedAny: true,
    };

    if (queue.openedAny) {
      return { success: true, outcome: "opened", round: opened, queue: next, skipped };
    }

    /*
     * The first opening, and the only one that ends anything. A Reaction
     * cannot exist while the triggering Turn is still active, and the Turn
     * can only be ended once.
     */
    const state = round.activeState;

    if (state === null || state.kind !== "turn") {
      return { success: false, reason: "no-active-turn" };
    }

    return {
      success: true,
      outcome: "opened",
      round: opened,
      queue: next,
      triggeringTurnEnd: endTurnForReaction(state),
      skipped,
    };
  }

  return {
    success: true,
    outcome: "exhausted",
    queue: completedFrom({ ...queue, queued: [] }, skipped),
    skipped,
  };
}


export interface QueuedReactionFinished {
  readonly success: true;

  /** The Round with the finished Reaction closed. */
  readonly round: CombatRound;

  readonly queue: ReactionQueue;
}


export type QueuedReactionFinishResult =
  | QueuedReactionFinished
  | ReactionQueueFailure;


/**
 * Closes the Reaction that is currently open.
 *
 * Takes the ReactionEnd produced by one of the canonical ending operations
 * rather than ending it here, so there is one place a Reaction can end and
 * this is not a second one.
 *
 * The end is checked against the ROUND'S ACTIVE REACTION, not merely against
 * the queue. Checking only the queue let a fabricated end — one built from a
 * ReactionState nobody was in, or carrying a spent count that never happened
 * — close a Reaction it did not describe, which is the same class of forgery
 * as an edited authorization.
 *
 * This is also the ONLY operation that clears an active Reaction. Queue
 * continuation used to null the active state on its way past, which meant a
 * Reaction could be discarded by advancing rather than by ending.
 */
export function finishQueuedReaction(
  round: CombatRound,
  queue: ReactionQueue,
  end: ReactionEnd,
): QueuedReactionFinishResult {
  if (queue.phase !== "resolving-reactions") {
    return { success: false, reason: "wrong-phase" };
  }

  if (queue.activeResponder === null) {
    return { success: false, reason: "no-active-reaction" };
  }

  const stale = findStalenessReason(round, queue);

  if (stale !== null) return { success: false, reason: stale };

  const active = round.activeState;

  if (active === null || active.kind !== "reaction") {
    return { success: false, reason: "no-active-reaction" };
  }

  if (!matchesReaction(active, queue)) {
    return {
      success: false,
      reason: "reaction-mismatch",
      combatantId: active.reactingCombatantId,
    };
  }

  /*
   * The end must describe the Reaction that is actually running, down to the
   * Actions it spent. A ReactionEnd is a plain record like everything else
   * here, so it is checked rather than trusted.
   */
  if (
    end.combatantId !== active.reactingCombatantId ||
    end.interruptedCombatantId !== active.interruptedCombatantId ||
    !sameTrigger(end.trigger, active.trigger) ||
    end.actionsSpent !== active.actionsSpent
  ) {
    return {
      success: false,
      reason: "reaction-mismatch",
      combatantId: end.combatantId,
    };
  }

  const closed: ReactionResolvingQueue = {
    ...queue,
    activeResponder: null,
  };

  const clearedRound = setRoundActiveState(round, null);

  if (closed.queued.length > 0) {
    return { success: true, round: clearedRound, queue: closed };
  }

  return {
    success: true,
    round: clearedRound,
    queue: completedFrom(closed, []),
  };
}


export type ReactionQueueContinuation =
  | {
    /* Another queued Reaction is now active. */
    readonly outcome: "reaction-opened";
    readonly round: CombatRound;
    readonly queue: ReactionResolvingQueue;
    readonly skipped: readonly CombatantId[];
  }
  | {
    /*
     * The queue is done and a Reaction did open, so the Turn is gone and
     * Initiative continues from the interrupted combatant.
     */
    readonly outcome: "initiative-advanced";
    readonly round: CombatRound;
    readonly queue: CompleteQueue;
    readonly roundComplete: boolean;
  }
  | {
    /*
     * Every Gate failed or was declined. Nothing opened, the triggering Turn
     * was never ended, and the caller settles the Action normally.
     */
    readonly outcome: "no-reactions";
    readonly round: CombatRound;
    readonly queue: CompleteQueue;
  };


export type ReactionQueueContinueResult =
  | ({ readonly success: true } & ReactionQueueContinuation)
  | ReactionQueueFailure;


/**
 * Advances the queue.
 *
 * Refuses while a Reaction is still open, which is the transition the old
 * shape allowed and should not have: calling continue twice used to replace
 * the running Reaction with the next one and lose it.
 */
export function continueReactionQueue(
  round: CombatRound,
  queue: ReactionQueue,
): ReactionQueueContinueResult {
  /*
   * Identity is checked FIRST, for every phase including complete.
   *
   * A queue is a small record a caller holds across several calls, and the
   * cheapest way to corrupt Combat is to keep a finished one and continue it
   * again. The staleness check catches that on its own: once Initiative has
   * advanced it no longer points at the interrupted combatant, so a replay
   * of a completed queue fails here rather than advancing a second time.
   */
  const stale = findStalenessReason(round, queue);

  if (stale !== null) return { success: false, reason: stale };

  if (queue.phase === "resolving-gates") {
    return { success: false, reason: "gates-unresolved" };
  }

  /*
   * Refuses while ANY Reaction is still open, and never clears one on the
   * way past. An earlier version nulled the active state before advancing,
   * which meant a running Reaction could be discarded by continuing instead
   * of by ending — the transition finishQueuedReaction() owns.
   */
  if (round.activeState !== null && round.activeState.kind === "reaction") {
    return {
      success: false,
      reason: "reaction-still-active",
      combatantId: round.activeState.reactingCombatantId,
    };
  }

  if (queue.phase === "resolving-reactions") {
    if (queue.activeResponder !== null) {
      return {
        success: false,
        reason: "reaction-still-active",
        combatantId: queue.activeResponder,
      };
    }

    const opened = openNextQueuedReaction(round, queue);

    if (!opened.success) return opened;

    if (opened.outcome === "opened") {
      return {
        success: true,
        outcome: "reaction-opened",
        round: opened.round,
        queue: opened.queue,
        skipped: opened.skipped,
      };
    }

    return completionOutcome(round, opened.queue);
  }

  return completionOutcome(round, queue);
}


/*
 * What a completed queue does next, which depends entirely on whether a
 * Reaction ever opened — and on the Round still being in the state that
 * completion implies.
 *
 * If none opened, the triggering Turn was never ended and must still be
 * active; Initiative does not move and the caller settles the Action through
 * the ordinary no-Reaction path. If one did, the Turn is gone, the last
 * Reaction must have been closed canonically, and Initiative continues from
 * the interrupted combatant.
 *
 * Both conditions are checked rather than assumed. A completed queue is
 * exactly the thing a caller is most likely to still be holding when the
 * Round has moved on underneath it.
 */
function completionOutcome(
  round: CombatRound,
  queue: CompleteQueue,
): ReactionQueueContinueResult {
  if (!queue.openedAny) {
    const state = round.activeState;

    if (
      state === null ||
      state.kind !== "turn" ||
      state.combatantId !== queue.interruptedCombatantId
    ) {
      return { success: false, reason: "queue-trigger-mismatch" };
    }

    return { success: true, outcome: "no-reactions", round, queue };
  }

  /*
   * A Reaction opened, so the Turn is gone. Anything still active means the
   * final Reaction was not closed through finishQueuedReaction(), and
   * advancing over it would lose it.
   */
  if (round.activeState !== null) {
    return { success: false, reason: "reaction-still-active" };
  }

  const progress = advanceToNextTurn(round);

  return {
    success: true,
    outcome: "initiative-advanced",
    round: progress.round,
    queue,
    roundComplete: progress.complete,
  };
}


/**
 * Whether the Reaction currently active in the Round is the one the queue
 * believes is running.
 *
 * Exported so a caller ending a Reaction can check before it does, rather
 * than discovering the mismatch from a refusal afterwards.
 */
export function queueMatchesActiveReaction(
  round: CombatRound,
  queue: ReactionQueue,
): boolean {
  const state = round.activeState;

  if (state === null || state.kind !== "reaction") return false;
  if (queue.phase !== "resolving-reactions") return false;

  return matchesReaction(state, queue);
}


function matchesReaction(
  state: ReactionState,
  queue: ReactionResolvingQueue,
): boolean {
  return state.reactingCombatantId === queue.activeResponder &&
    state.interruptedCombatantId === queue.interruptedCombatantId &&
    sameTrigger(state.trigger, queue.trigger);
}
