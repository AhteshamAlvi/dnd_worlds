/*
 * High-level runtime orchestration for Combat.
 *
 * This module coordinates the structural Combat modules:
 *
 * - actions.ts
 * - turn.ts
 * - reaction.ts
 * - round.ts
 *
 * It does NOT resolve the mechanical check belonging to a Skill.
 *
 * Combat intentionally does not classify Actions as attacks, defenses,
 * movement, etc. Those meanings belong to the Skill/capability being used.
 *
 * The normal Action flow is:
 *
 *   active Turn / Reaction
 *        ↓
 *   spend Combat Action
 *        ↓
 *   resolve the underlying Skill/check externally, if one exists
 *        ↓
 *   resolve any Reaction opportunities / Reaction Gates
 *        ↓
 *   if a Reaction opens:
 *       replace the active Turn with Reaction
 *
 *   otherwise:
 *       settle the active state
 *       ↓
 *       continue it OR advance Initiative
 *
 * An Action spend deliberately does NOT immediately advance Initiative,
 * even when it reaches the current state's Action cap. The Action may still
 * create a Reaction opportunity which must be resolved first.
 *
 * The engine remains deterministic. Dice and real-world timers are supplied
 * by the host or other resolution layers.
 */

import type {
  CombatAction,
  CombatantId,
  CombatantRoundState,
  CombatRound,
  ReactionOpportunity,
} from "./types";

import {
  activeStateCombatantId,
  spendCombatAction,
  type ActionSpendFailureReason,
  type ActionSpendSuccess,
} from "./actions";

import {
  continueAfterTurn,
  activateReaction,
  applyActionSpendToRound,
  findRoundCombatant,
  type RoundProgressResult,
} from "./round";

import {
  endTurnVoluntarily,
  resolveAutomaticTurnEnd,
  type TurnEnd,
} from "./turn";

import {
  endReactionVoluntarily,
  openReactionAfterGateSuccess,
  resolveAutomaticReactionEnd,
  type ReactionEnd,
  type ReactionStartFailureReason,
} from "./reaction";

import {
  continueReactionQueue,
  finishQueuedReaction,
  openNextQueuedReaction,
  openReactionQueue,
  queueReactionAfterGateSuccess,
  type ReactionQueue,
  type ReactionQueueFailureReason,
  type ReactionResolvingQueue,
} from "./reaction-queue";


// ---------------------------------------------------------------------------
// General failure vocabulary
// ---------------------------------------------------------------------------

export const COMBAT_RESOLUTION_FAILURE_REASONS = [
  "no-active-state",
  "active-combatant-missing",
  "action-spend-failed",
  "active-state-not-turn",
  "active-state-not-reaction",
  "reaction-open-failed",
  "reaction-queue-refused",
  "reaction-queue-required",
] as const;

export type CombatResolutionFailureReason =
  typeof COMBAT_RESOLUTION_FAILURE_REASONS[number];


export interface CombatResolutionFailure {
  /** Present when the Reaction queue refused the transition. */
  readonly queueFailureReason?: ReactionQueueFailureReason;

  readonly success: false;

  readonly reason: CombatResolutionFailureReason;

  readonly combatantId?: CombatantId;

  readonly actionSpendFailureReason?: ActionSpendFailureReason;

  readonly reactionStartFailureReason?: ReactionStartFailureReason;
}


// ---------------------------------------------------------------------------
// Action-spend resolution
// ---------------------------------------------------------------------------

export interface CombatActionResolutionSuccess {
  readonly success: true;

  readonly action: CombatAction;

  /*
   * Round immediately after paying the Action cost.
   *
   * Initiative has NOT advanced.
   */
  readonly round: CombatRound;

  readonly spend: ActionSpendSuccess;

  /*
   * Indicates whether the current state has reached a mandatory ending
   * condition after this Action.
   *
   * This is informational only. The state is intentionally left active
   * until Reaction opportunities have been resolved.
   */
  readonly stateMustEnd: boolean;
}


export type CombatActionResolution =
  | CombatActionResolutionSuccess
  | CombatResolutionFailure;


// ---------------------------------------------------------------------------
// State-settlement result
// ---------------------------------------------------------------------------

export interface CombatStateSettlementSuccess {
  /** Present when a queued Reaction ended: the queue after continuation. */
  readonly queue?: ReactionQueue;

  readonly success: true;

  /*
   * True when this settlement actually ended the current Turn or Reaction.
   */
  readonly stateEnded: boolean;

  /*
   * True when ending the state also exhausted the entire Round.
   */
  readonly roundComplete: boolean;

  readonly round: CombatRound;

  readonly turnEnd?: TurnEnd;

  readonly reactionEnd?: ReactionEnd;
}


export type CombatStateSettlementResult =
  | CombatStateSettlementSuccess
  | CombatResolutionFailure;


// ---------------------------------------------------------------------------
// Reaction-opening result
// ---------------------------------------------------------------------------

export interface CombatReactionOpenSuccess {
  /*
   * The one-entry queue this Reaction is running under.
   *
   * Exposed so a caller ending it uses the same lifecycle a multi-target
   * Reaction does, rather than a second ending path that happens to agree.
   */
  readonly queue: ReactionResolvingQueue;

  readonly success: true;

  readonly round: CombatRound;

  /*
   * Opening the Reaction necessarily ended the triggering Turn.
   */
  readonly triggeringTurnEnd: TurnEnd;
}


export type CombatReactionOpenResult =
  | CombatReactionOpenSuccess
  | CombatResolutionFailure;


// ---------------------------------------------------------------------------
// Voluntary state-ending result
// ---------------------------------------------------------------------------

export interface VoluntaryTurnEndSuccess {
  readonly success: true;

  readonly turnEnd: TurnEnd;

  readonly roundComplete: boolean;

  readonly round: CombatRound;
}


export type VoluntaryTurnEndResult =
  | VoluntaryTurnEndSuccess
  | CombatResolutionFailure;


export interface VoluntaryReactionEndSuccess {
  readonly success: true;

  readonly reactionEnd: ReactionEnd;

  /** The queue after this Reaction finished and the lifecycle advanced. */
  readonly queue: ReactionQueue;

  readonly roundComplete: boolean;

  readonly round: CombatRound;
}


export type VoluntaryReactionEndResult =
  | VoluntaryReactionEndSuccess
  | CombatResolutionFailure;


// ---------------------------------------------------------------------------
// Active-combatant lookup
// ---------------------------------------------------------------------------

/*
 * Finds the runtime Round state belonging to the combatant currently
 * permitted to act.
 */
export function findActiveCombatant(
  round: CombatRound,
): CombatantRoundState | undefined {
  if (round.activeState === null) {
    return undefined;
  }

  return findRoundCombatant(
    round,
    activeStateCombatantId(
      round.activeState,
    ),
  );
}


// ---------------------------------------------------------------------------
// Mandatory state-ending detection
// ---------------------------------------------------------------------------

/*
 * Returns whether the current state MUST end before another normal Action
 * may be spent.
 *
 * Importantly, reaching this condition does not immediately advance
 * Initiative. Reaction opportunities produced by the Action that caused
 * the ending condition must still be resolved first.
 */
export function mustEndActiveState(
  round: CombatRound,
): boolean {
  const state =
    round.activeState;

  if (state === null) {
    return false;
  }

  const combatant =
    findActiveCombatant(round);

  if (combatant === undefined) {
    return false;
  }

  switch (state.kind) {
    case "turn":
      return (
        resolveAutomaticTurnEnd(
          state,
          combatant,
        ) !== null
      );

    case "reaction":
      return (
        resolveAutomaticReactionEnd(
          state,
          combatant,
        ) !== null
      );
  }
}


// ---------------------------------------------------------------------------
// Action spending
// ---------------------------------------------------------------------------

/*
 * Pays the runtime cost of one Combat Action.
 *
 * This is the authoritative high-level Action-spending path for Combat.
 *
 * It updates:
 *
 * - remaining Round Actions, and
 * - Actions spent in the current Turn / Reaction.
 *
 * It does NOT:
 *
 * - resolve the underlying Skill check,
 * - determine whether the Action succeeds,
 * - resolve Detection,
 * - open a Reaction automatically,
 * - advance Initiative automatically.
 *
 * That delay is intentional.
 *
 * Example:
 *
 *   A has Turn cap 2.
 *   A spends their second Action attacking C.
 *
 * After this function:
 *
 *   A has reached the Turn cap,
 *   BUT A's Turn still exists temporarily.
 *
 * This allows C's Reaction Gate to be resolved against the triggering
 * Action before Combat advances to the next Initiative participant.
 */
export function resolveCombatAction(
  round: CombatRound,
  action: CombatAction,
): CombatActionResolution {
  const state =
    round.activeState;

  if (state === null) {
    return {
      success: false,
      reason: "no-active-state",
    };
  }

  const activeCombatantId =
    activeStateCombatantId(state);

  const combatant =
    findRoundCombatant(
      round,
      activeCombatantId,
    );

  if (combatant === undefined) {
    return {
      success: false,
      reason:
        "active-combatant-missing",
      combatantId:
        activeCombatantId,
    };
  }

  const spend =
    spendCombatAction(
      action,
      combatant,
      state,
    );

  if (!spend.success) {
    return {
      success: false,
      reason:
        "action-spend-failed",
      combatantId:
        activeCombatantId,
      actionSpendFailureReason:
        spend.reason,
    };
  }

  const updatedRound =
    applyActionSpendToRound(
      round,
      spend.combatant,
      spend.state,
    );

  return {
    success: true,
    action,
    round: updatedRound,
    spend,
    stateMustEnd:
      mustEndActiveState(
        updatedRound,
      ),
  };
}


// ---------------------------------------------------------------------------
// State settlement
// ---------------------------------------------------------------------------

/*
 * Settles the current Turn or Reaction after all consequences of the most
 * recently spent Action have been handled.
 *
 * This should normally be called only AFTER:
 *
 * - the Skill/check has resolved, and
 * - all applicable Reaction opportunities have either failed, been
 *   declined, or otherwise been resolved.
 *
 * If the active state still has room for another Action and the combatant
 * still has Round Actions remaining, nothing changes.
 *
 * If the state has reached a mandatory ending condition:
 *
 * - Turn    -> advance to the next Initiative combatant
 * - Reaction -> advance to the next Initiative combatant
 *
 * A Reaction is never followed by resuming the interrupted Turn.
 */
export function settleActiveStateAfterAction(
  round: CombatRound,
  queue?: ReactionQueue,
): CombatStateSettlementResult {
  const state =
    round.activeState;

  if (state === null) {
    return {
      success: false,
      reason: "no-active-state",
    };
  }

  const combatant =
    findActiveCombatant(round);

  if (combatant === undefined) {
    return {
      success: false,
      reason:
        "active-combatant-missing",
      combatantId:
        activeStateCombatantId(
          state,
        ),
    };
  }

  switch (state.kind) {
    case "turn": {
      const turnEnd =
        resolveAutomaticTurnEnd(
          state,
          combatant,
        );

      if (turnEnd === null) {
        return {
          success: true,
          stateEnded: false,
          roundComplete: false,
          round,
        };
      }

      const progress =
        continueAfterTurn(round);

      return {
        success: true,
        stateEnded: true,
        roundComplete:
          progress.complete,
        round:
          progress.round,
        turnEnd,
      };
    }

    case "reaction": {
      const reactionEnd =
        resolveAutomaticReactionEnd(
          state,
          combatant,
        );

      if (reactionEnd === null) {
        return {
          success: true,
          stateEnded: false,
          roundComplete: false,
          round,
        };
      }

      /*
       * A Reaction that has hit its cap still ends through the queue.
       *
       * This branch used to close it and advance Initiative directly, which
       * left the queue believing its Reaction was still running and every
       * later transition judged against a state that no longer existed. The
       * queue is required rather than optional here for exactly that reason:
       * there is no correct way to end a queued Reaction without it.
       */
      if (queue === undefined) {
        return {
          success: false,
          reason: "reaction-queue-required",
        };
      }

      const finished =
        finishQueuedReaction(
          round,
          queue,
          reactionEnd,
        );

      if (!finished.success) {
        return {
          success: false,
          reason: "reaction-queue-refused",
          queueFailureReason: finished.reason,
        };
      }

      const continued =
        continueReactionQueue(
          finished.round,
          finished.queue,
        );

      if (!continued.success) {
        return {
          success: false,
          reason: "reaction-queue-refused",
          queueFailureReason: continued.reason,
        };
      }

      return {
        success: true,
        stateEnded: true,
        roundComplete:
          continued.outcome === "initiative-advanced"
            ? continued.roundComplete
            : false,
        round: continued.round,
        queue: continued.queue,
        reactionEnd,
      };
    }
  }
}


// ---------------------------------------------------------------------------
// Reaction opening
// ---------------------------------------------------------------------------

/*
 * Opens a Reaction after its Detection-based Reaction Gate has already
 * succeeded.
 *
 * The current active state MUST be a Turn.
 *
 * This function does not perform Detection. Calling it means some external
 * check-resolution layer has already determined that the reacting
 * combatant successfully crossed the Reaction Gate.
 *
 * Opening a Reaction:
 *
 * 1. immediately ends the triggering Turn,
 * 2. replaces it with the Reaction state,
 * 3. leaves initiativeIndex unchanged.
 *
 * Therefore when the Reaction later ends, Initiative proceeds to the next
 * participant after the interrupted Turn.
 */
export function resolveSuccessfulReactionGate(
  round: CombatRound,
  opportunity: ReactionOpportunity,
): CombatReactionOpenResult {
  const state =
    round.activeState;

  if (state === null) {
    return {
      success: false,
      reason: "no-active-state",
    };
  }

  if (state.kind !== "turn") {
    return {
      success: false,
      reason:
        "active-state-not-turn",
    };
  }

  /*
   * Delegated to the queue rather than opening the Reaction directly.
   *
   * A single-target Reaction is a queue with one entry, and running it
   * through the same lifecycle is what stops "one responder" and "several
   * responders" from being two code paths that drift. Everything the
   * multi-target path validates — the trigger's actor, the parked Initiative
   * position, the responder's remaining Actions, ending the Turn exactly
   * once — is validated here too, because it is the same code.
   */
  const queueResult =
    openReactionQueue(
      round,
      opportunity.trigger,
      [opportunity.reactingCombatantId],
    );

  if (!queueResult.success) {
    /*
     * The queue reports a trigger whose actor is not the interrupted
     * combatant as `queue-trigger-mismatch`; the direct path has always
     * called that same condition `triggering-turn-mismatch`. They are one
     * rule under two names, so the caller-facing name is preserved rather
     * than leaking the queue's vocabulary into a characterized result.
     */
    return {
      success: false,
      reason: "reaction-open-failed",
      ...(queueResult.reason === "queue-trigger-mismatch"
        ? {
          reactionStartFailureReason:
            "triggering-turn-mismatch" as const,
        }
        : {}),
    };
  }

  const gated =
    queueReactionAfterGateSuccess(
      queueResult.queue,
    );

  const opened =
    openNextQueuedReaction(round, gated);

  if (!opened.success) {
    return {
      success: false,
      reason: "reaction-open-failed",
      ...(opened.reactionStartFailureReason === undefined
        ? {}
        : {
          reactionStartFailureReason:
            opened.reactionStartFailureReason,
        }),
    };
  }

  if (opened.outcome !== "opened") {
    /*
     * The one responder turned out to be ineligible. Reported through the
     * same failure the direct path used to produce, so callers that never
     * touch a queue see no change.
     */
    return {
      success: false,
      reason: "reaction-open-failed",
      reactionStartFailureReason:
        "reacting-combatant-not-round-eligible",
    };
  }

  const triggeringTurnEnd =
    opened.triggeringTurnEnd;

  if (triggeringTurnEnd === undefined) {
    return {
      success: false,
      reason: "reaction-open-failed",
    };
  }

  return {
    success: true,
    triggeringTurnEnd,
    round: opened.round,
    queue: opened.queue,
  };
}


// ---------------------------------------------------------------------------
// Failed / declined Reaction Gate
// ---------------------------------------------------------------------------

/*
 * A failed or declined Reaction Gate does not change Combat state.
 *
 * This helper exists primarily to make the intended orchestration explicit.
 *
 * Once no Reaction will open for the triggering Action, the caller may
 * settle the active state. If the triggering Action reached the Turn Action
 * cap or exhausted the actor's Round Actions, Initiative will then advance.
 */
export function continueAfterNoReaction(
  round: CombatRound,
): CombatStateSettlementResult {
  return settleActiveStateAfterAction(
    round,
  );
}


// ---------------------------------------------------------------------------
// Voluntary Turn ending
// ---------------------------------------------------------------------------

/*
 * Voluntarily ends the current Turn without spending another Action.
 *
 * Remaining Round Actions are preserved.
 *
 * This is NOT Inaction.
 *
 * Inaction deliberately consumes one Action and should instead be resolved
 * through actions.ts / resolveCombatAction().
 */
export function resolveVoluntaryTurnEnd(
  round: CombatRound,
): VoluntaryTurnEndResult {
  const state =
    round.activeState;

  if (state === null) {
    return {
      success: false,
      reason: "no-active-state",
    };
  }

  if (state.kind !== "turn") {
    return {
      success: false,
      reason:
        "active-state-not-turn",
    };
  }

  const turnEnd =
    endTurnVoluntarily(state);

  const progress =
    continueAfterTurn(round);

  return {
    success: true,
    turnEnd,
    roundComplete:
      progress.complete,
    round:
      progress.round,
  };
}


// ---------------------------------------------------------------------------
// Voluntary Reaction ending
// ---------------------------------------------------------------------------

/*
 * Voluntarily closes the current Reaction without spending another Action.
 *
 * Remaining Round Actions are preserved.
 *
 * Once the Reaction closes, the interrupted Turn is NOT resumed.
 * Initiative proceeds to the next eligible participant.
 */
export function resolveVoluntaryReactionEnd(
  round: CombatRound,
  queue: ReactionQueue,
): VoluntaryReactionEndResult {
  const state =
    round.activeState;

  if (state === null) {
    return {
      success: false,
      reason: "no-active-state",
    };
  }

  if (state.kind !== "reaction") {
    return {
      success: false,
      reason:
        "active-state-not-reaction",
    };
  }

  return finishThroughQueue(
    round,
    queue,
    endReactionVoluntarily(state),
  );
}


/*
 * The one way a queued Reaction ends.
 *
 * Produces nothing itself: the caller supplies a ReactionEnd from a
 * canonical ending operation, this hands it to the queue, and the queue
 * decides what happens next — open the next responder, complete without
 * moving Initiative, or advance it.
 *
 * Nothing here clears activeState or advances Initiative on its own. The
 * versions that did were the second lifecycle this ticket removes: a
 * Reaction closed outside the queue left the queue believing it was still
 * running, and every later transition was then judged against a state that
 * no longer existed.
 */
function finishThroughQueue(
  round: CombatRound,
  queue: ReactionQueue,
  end: ReactionEnd,
): VoluntaryReactionEndResult {
  const finished =
    finishQueuedReaction(round, queue, end);

  if (!finished.success) {
    return {
      success: false,
      reason: "reaction-queue-refused",
      queueFailureReason: finished.reason,
    };
  }

  const continued =
    continueReactionQueue(
      finished.round,
      finished.queue,
    );

  if (!continued.success) {
    return {
      success: false,
      reason: "reaction-queue-refused",
      queueFailureReason: continued.reason,
    };
  }

  return {
    success: true,
    reactionEnd: end,
    queue: continued.queue,
    round: continued.round,
    roundComplete:
      continued.outcome === "initiative-advanced"
        ? continued.roundComplete
        : false,
  };
}


// ---------------------------------------------------------------------------
// Round-progress helper
// ---------------------------------------------------------------------------

/*
 * Convenience conversion for callers that only need to know whether a
 * Round progression result completed the Round.
 */
export function didRoundComplete(
  result: RoundProgressResult,
): boolean {
  return result.complete;
}