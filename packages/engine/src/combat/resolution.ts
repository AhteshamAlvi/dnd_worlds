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
  continueAfterReaction,
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
] as const;

export type CombatResolutionFailureReason =
  typeof COMBAT_RESOLUTION_FAILURE_REASONS[number];


export interface CombatResolutionFailure {
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

      const progress =
        continueAfterReaction(
          round,
        );

      return {
        success: true,
        stateEnded: true,
        roundComplete:
          progress.complete,
        round:
          progress.round,
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

  const reactionResult =
    openReactionAfterGateSuccess(
      opportunity,
      state,
      round.combatants,
    );

  if (!reactionResult.success) {
    return {
      success: false,
      reason:
        "reaction-open-failed",
      reactionStartFailureReason:
        reactionResult.reason,
    };
  }

  return {
    success: true,

    triggeringTurnEnd:
      reactionResult.triggeringTurnEnd,

    round:
      activateReaction(
        round,
        reactionResult.reaction,
      ),
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

  const reactionEnd =
    endReactionVoluntarily(
      state,
    );

  const progress =
    continueAfterReaction(
      round,
    );

  return {
    success: true,
    reactionEnd,
    roundComplete:
      progress.complete,
    round:
      progress.round,
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