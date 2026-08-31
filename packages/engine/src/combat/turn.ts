/*
 * Turn-state lifecycle for Combat.
 *
 * A Turn is a Combat state in which a combatant may spend Actions.
 *
 * Turns are entered according to Initiative order. Combatants with no
 * remaining Round Actions are skipped before a Turn is created.
 *
 * The number of Actions that may be spent during one Turn is supplied by
 * the combatant's resolved Action capacity. Combat does not derive that
 * value here.
 *
 * Important:
 *
 * - The normal Turn Action cap is currently expected to be 2, but that
 *   default belongs to Character Action-capacity resolution rather than
 *   this runtime module.
 *
 * - A Turn's Action cap does NOT limit the character's total Actions for
 *   the Round.
 *
 * - Unspent Round Actions survive the end of a Turn and may be used when
 *   Initiative cycles back to the combatant.
 *
 * - Successfully opening a Reaction immediately ends the triggering Turn.
 *   The triggering combatant does not resume that Turn after the Reaction.
 *
 * - The 30-second player decision timer is enforced by the host. Combat
 *   resolves the resulting Hesitation through actions.ts when the host
 *   reports that the deadline expired.
 */

import type {
  CombatantId,
  CombatantRoundState,
  InitiativeOrder,
  TurnState,
} from "./types";

import {
  hasExhaustedRoundActions,
  hasReachedStateActionCap,
  remainingStateActions,
} from "./actions";

import {
  findInitiativeEntry,
  isInitiativeEligible,
} from "./initiative";


// ---------------------------------------------------------------------------
// Turn timing
// ---------------------------------------------------------------------------

/*
 * Real-world decision limit for a Turn.
 *
 * The engine does not run timers itself. Hosts such as Foundry or the
 * Workbench use this value to enforce the countdown and report an expiry
 * back to Combat.
 */
export const TURN_DECISION_LIMIT_SECONDS = 30;


// ---------------------------------------------------------------------------
// Turn-ending reasons
// ---------------------------------------------------------------------------

export const TURN_END_REASONS = [
  "voluntary",
  "action-cap-reached",
  "round-actions-exhausted",
  "reaction-opened",
] as const;

export type TurnEndReason =
  typeof TURN_END_REASONS[number];


// ---------------------------------------------------------------------------
// Turn creation results
// ---------------------------------------------------------------------------

export const TURN_START_FAILURE_REASONS = [
  "combatant-not-in-initiative",
  "combatant-not-round-eligible",
  "invalid-turn-action-cap",
] as const;

export type TurnStartFailureReason =
  typeof TURN_START_FAILURE_REASONS[number];


export interface TurnStartSuccess {
  readonly success: true;
  readonly turn: TurnState;
}


export interface TurnStartFailure {
  readonly success: false;

  readonly combatantId: CombatantId;

  readonly reason: TurnStartFailureReason;
}


export type TurnStartResult =
  | TurnStartSuccess
  | TurnStartFailure;


// ---------------------------------------------------------------------------
// Turn completion
// ---------------------------------------------------------------------------

export interface TurnEnd {
  readonly combatantId: CombatantId;

  readonly reason: TurnEndReason;

  /*
   * Number of Actions actually spent during this Turn.
   *
   * This may be lower than the Turn Action cap.
   */
  readonly actionsSpent: number;
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findCombatantRoundState(
  combatants: readonly CombatantRoundState[],
  combatantId: CombatantId,
): CombatantRoundState | undefined {
  return combatants.find(
    (combatant) =>
      combatant.combatantId === combatantId,
  );
}


/*
 * A Turn Action cap must be a positive whole number.
 *
 * Combat does not decide what the cap should be; it only validates the
 * resolved value it receives.
 */
export function isValidTurnActionCap(
  actionCap: number,
): boolean {
  return (
    Number.isInteger(actionCap) &&
    actionCap > 0
  );
}


// ---------------------------------------------------------------------------
// Turn creation
// ---------------------------------------------------------------------------

/*
 * Creates a fresh Turn state for an Initiative-selected combatant.
 *
 * The combatant must:
 *
 * 1. exist in the current Initiative order,
 * 2. still have at least one Round Action remaining, and
 * 3. have a valid resolved Turn Action cap.
 *
 * Turn creation does not spend an Action.
 */
export function startTurn(
  combatantId: CombatantId,
  initiative: InitiativeOrder,
  combatants: readonly CombatantRoundState[],
): TurnStartResult {
  const initiativeEntry =
    findInitiativeEntry(
      initiative,
      combatantId,
    );

  if (initiativeEntry === undefined) {
    return {
      success: false,
      combatantId,
      reason: "combatant-not-in-initiative",
    };
  }

  if (
    !isInitiativeEligible(
      combatantId,
      combatants,
    )
  ) {
    return {
      success: false,
      combatantId,
      reason: "combatant-not-round-eligible",
    };
  }

  const combatant =
    findCombatantRoundState(
      combatants,
      combatantId,
    );

  /*
   * isInitiativeEligible() already establishes that the combatant exists,
   * but retaining the guard keeps this function safe if that helper ever
   * changes independently.
   */
  if (combatant === undefined) {
    return {
      success: false,
      combatantId,
      reason: "combatant-not-round-eligible",
    };
  }

  const actionCap =
    combatant.capacity.turn;

  if (!isValidTurnActionCap(actionCap)) {
    return {
      success: false,
      combatantId,
      reason: "invalid-turn-action-cap",
    };
  }

  return {
    success: true,
    turn: {
      kind: "turn",
      combatantId,
      actionCap,
      actionsSpent: 0,
    },
  };
}


// ---------------------------------------------------------------------------
// Turn continuation
// ---------------------------------------------------------------------------

/*
 * Returns whether the supplied Turn can still accept another Action from
 * the acting combatant.
 *
 * Both constraints must remain available:
 *
 * - the combatant must still own Round Actions, and
 * - the Turn must still have room under its own Action cap.
 */
export function canContinueTurn(
  turn: TurnState,
  combatant: CombatantRoundState,
): boolean {
  if (
    turn.combatantId !==
    combatant.combatantId
  ) {
    return false;
  }

  if (
    hasExhaustedRoundActions(combatant)
  ) {
    return false;
  }

  if (
    hasReachedStateActionCap(turn)
  ) {
    return false;
  }

  return true;
}


/*
 * Returns the maximum number of additional normal Actions the combatant
 * could currently spend during this Turn.
 *
 * The result is constrained by BOTH:
 *
 * - remaining room in the Turn, and
 * - remaining Actions for the Round.
 *
 * Example:
 *
 *   Turn room:       2
 *   Round remaining: 1
 *
 *   Available now:   1
 */
export function availableTurnActions(
  turn: TurnState,
  combatant: CombatantRoundState,
): number {
  if (
    turn.combatantId !==
    combatant.combatantId
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      remainingStateActions(turn),
      combatant.remainingActions,
    ),
  );
}


// ---------------------------------------------------------------------------
// Automatic Turn-ending checks
// ---------------------------------------------------------------------------

/*
 * Determines whether the Turn has reached a mandatory ending condition.
 *
 * Returns null while the Turn may continue.
 *
 * A successful Reaction opening is intentionally NOT inferred here because
 * that is an external state transition handled explicitly through
 * endTurnForReaction().
 */
export function findAutomaticTurnEndReason(
  turn: TurnState,
  combatant: CombatantRoundState,
): TurnEndReason | null {
  if (
    turn.combatantId !==
    combatant.combatantId
  ) {
    return null;
  }

  if (
    hasExhaustedRoundActions(combatant)
  ) {
    return "round-actions-exhausted";
  }

  if (
    hasReachedStateActionCap(turn)
  ) {
    return "action-cap-reached";
  }

  return null;
}


// ---------------------------------------------------------------------------
// Turn ending
// ---------------------------------------------------------------------------

function createTurnEnd(
  turn: TurnState,
  reason: TurnEndReason,
): TurnEnd {
  return {
    combatantId: turn.combatantId,
    reason,
    actionsSpent: turn.actionsSpent,
  };
}


/*
 * Ends the Turn voluntarily.
 *
 * This spends no Action by itself.
 *
 * Voluntarily ending a Turn and choosing Inaction are different:
 *
 * - Ending the Turn means the player simply stops using the current Turn.
 *   Remaining Round Actions are preserved for later Initiative rotations.
 *
 * - Inaction is a deliberate Action and consumes one Round Action.
 *
 * If the player wants to deliberately consume an Action doing nothing,
 * actions.ts::spendInaction() should be used before ending the Turn.
 */
export function endTurnVoluntarily(
  turn: TurnState,
): TurnEnd {
  return createTurnEnd(
    turn,
    "voluntary",
  );
}


/*
 * Ends the Turn because its Action cap has been reached.
 */
export function endTurnAtActionCap(
  turn: TurnState,
): TurnEnd {
  return createTurnEnd(
    turn,
    "action-cap-reached",
  );
}


/*
 * Ends the Turn because the combatant has no remaining Actions for the
 * Round.
 */
export function endTurnForRoundExhaustion(
  turn: TurnState,
): TurnEnd {
  return createTurnEnd(
    turn,
    "round-actions-exhausted",
  );
}


/*
 * Ends the currently acting combatant's Turn because another combatant
 * successfully passed the Reaction Gate and is entering Reaction state.
 *
 * This is one of the core Combat rules:
 *
 *   triggering Action
 *        ↓
 *   target passes Detection
 *        ↓
 *   Reaction opens
 *        ↓
 *   triggering Turn ENDS
 *
 * When the Reaction later closes, Combat proceeds to the next Initiative
 * participant. This Turn is never resumed.
 *
 * Any Round Actions the triggering combatant did not spend remain available
 * when Initiative eventually cycles back to them.
 */
export function endTurnForReaction(
  turn: TurnState,
): TurnEnd {
  return createTurnEnd(
    turn,
    "reaction-opened",
  );
}


/*
 * Ends the Turn when a mandatory ending condition has been reached.
 *
 * Returns null while the Turn remains able to continue.
 */
export function resolveAutomaticTurnEnd(
  turn: TurnState,
  combatant: CombatantRoundState,
): TurnEnd | null {
  const reason =
    findAutomaticTurnEndReason(
      turn,
      combatant,
    );

  if (reason === null) {
    return null;
  }

  return createTurnEnd(
    turn,
    reason,
  );
}