/*
 * Reaction-state lifecycle for Combat.
 *
 * A Reaction is a responsive Combat state that may be entered when another
 * combatant's Action attacks or otherwise affects the reacting combatant.
 *
 * Being affected does NOT automatically create a Reaction state.
 *
 * The flow is:
 *
 *   Action affects another combatant
 *        ↓
 *   Reaction opportunity
 *        ↓
 *   Detection-based Reaction Gate
 *        ↓
 *   failure  -> no Reaction
 *   success  -> Reaction opens
 *
 * The Detection check itself is intentionally not resolved here. A separate
 * Combat check layer will determine whether the Reaction Gate succeeds.
 *
 * Once a Reaction successfully opens:
 *
 * - the triggering combatant's Turn ends immediately,
 * - the reacting combatant may spend Actions up to their resolved Reaction
 *   Action cap,
 * - those Actions come from the SAME Round Action pool used during Turns,
 * - the triggering Turn is never resumed,
 * - after the Reaction ends, Combat proceeds to the next combatant in
 *   Initiative order.
 *
 * The character-resolution layer determines the combatant's Reaction Action
 * cap. Combat only consumes and enforces that resolved value.
 *
 * The 15-second player decision timer is host-side. When it expires, the
 * host reports the timeout and actions.ts resolves the resulting Hesitation.
 */

import type {
  CombatAction,
  CombatantId,
  CombatantRoundState,
  ReactionOpportunity,
  ReactionState,
  TurnState,
} from "./types";

import {
  hasExhaustedRoundActions,
  hasReachedStateActionCap,
  remainingStateActions,
} from "./actions";

import {
  endTurnForReaction,
  type TurnEnd,
} from "./turn";


// ---------------------------------------------------------------------------
// Reaction timing
// ---------------------------------------------------------------------------

/*
 * Real-world decision limit for a Reaction.
 *
 * The engine does not run this timer itself. Hosts such as Foundry or the
 * Workbench enforce the countdown and report an expiry back to Combat.
 */
export const REACTION_DECISION_LIMIT_SECONDS = 15;


// ---------------------------------------------------------------------------
// Reaction-opportunity creation
// ---------------------------------------------------------------------------

export const REACTION_OPPORTUNITY_FAILURE_REASONS = [
  "combatant-not-affected",
  "self-reaction",
] as const;

export type ReactionOpportunityFailureReason =
  typeof REACTION_OPPORTUNITY_FAILURE_REASONS[number];


export interface ReactionOpportunitySuccess {
  readonly success: true;

  readonly opportunity: ReactionOpportunity;
}


export interface ReactionOpportunityFailure {
  readonly success: false;

  readonly reactingCombatantId: CombatantId;

  readonly reason: ReactionOpportunityFailureReason;
}


export type ReactionOpportunityResult =
  | ReactionOpportunitySuccess
  | ReactionOpportunityFailure;


/*
 * Creates a Reaction opportunity for a combatant directly affected by an
 * Action.
 *
 * The Action's targetCombatantIds are currently the Combat-level declaration
 * that another combatant is attacked or otherwise affected.
 *
 * This does NOT perform the Detection check and therefore does not open a
 * Reaction state.
 */
export function createReactionOpportunity(
  action: CombatAction,
  reactingCombatantId: CombatantId,
): ReactionOpportunityResult {
  if (
    action.actorCombatantId ===
    reactingCombatantId
  ) {
    return {
      success: false,
      reactingCombatantId,
      reason: "self-reaction",
    };
  }

  if (
    !action.targetCombatantIds.includes(
      reactingCombatantId,
    )
  ) {
    return {
      success: false,
      reactingCombatantId,
      reason: "combatant-not-affected",
    };
  }

  return {
    success: true,
    opportunity: {
      triggeringActionId: action.id,
      triggeringCombatantId:
        action.actorCombatantId,
      reactingCombatantId,
    },
  };
}


// ---------------------------------------------------------------------------
// Reaction opening
// ---------------------------------------------------------------------------

export const REACTION_START_FAILURE_REASONS = [
  "triggering-turn-mismatch",
  "reacting-combatant-not-round-eligible",
  "invalid-reaction-action-cap",
] as const;

export type ReactionStartFailureReason =
  typeof REACTION_START_FAILURE_REASONS[number];


export interface ReactionStartSuccess {
  readonly success: true;

  /*
   * The newly opened Reaction state.
   */
  readonly reaction: ReactionState;

  /*
   * Opening the Reaction simultaneously ends the triggering Turn.
   */
  readonly triggeringTurnEnd: TurnEnd;
}


export interface ReactionStartFailure {
  readonly success: false;

  readonly opportunity: ReactionOpportunity;

  readonly reason: ReactionStartFailureReason;
}


export type ReactionStartResult =
  | ReactionStartSuccess
  | ReactionStartFailure;


// ---------------------------------------------------------------------------
// Reaction ending
// ---------------------------------------------------------------------------

export const REACTION_END_REASONS = [
  "voluntary",
  "action-cap-reached",
  "round-actions-exhausted",
] as const;

export type ReactionEndReason =
  typeof REACTION_END_REASONS[number];


export interface ReactionEnd {
  readonly combatantId: CombatantId;

  readonly triggeringCombatantId: CombatantId;

  readonly triggeringActionId: string;

  readonly reason: ReactionEndReason;

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
 * Reaction Action caps must be positive whole numbers.
 *
 * Combat does not derive the cap here.
 */
export function isValidReactionActionCap(
  actionCap: number,
): boolean {
  return (
    Number.isInteger(actionCap) &&
    actionCap > 0
  );
}


// ---------------------------------------------------------------------------
// Reaction entry
// ---------------------------------------------------------------------------

/*
 * Opens a Reaction after the Reaction Gate has already succeeded.
 *
 * Calling this function means the Detection-based gate has been resolved
 * elsewhere and the reacting combatant is permitted to enter Reaction.
 *
 * The triggering Turn MUST belong to the combatant whose Action generated
 * the Reaction opportunity.
 *
 * Opening the Reaction immediately terminates that Turn.
 */
export function openReactionAfterGateSuccess(
  opportunity: ReactionOpportunity,
  triggeringTurn: TurnState,
  combatants: readonly CombatantRoundState[],
): ReactionStartResult {
  if (
    triggeringTurn.combatantId !==
    opportunity.triggeringCombatantId
  ) {
    return {
      success: false,
      opportunity,
      reason: "triggering-turn-mismatch",
    };
  }

  const reactingCombatant =
    findCombatantRoundState(
      combatants,
      opportunity.reactingCombatantId,
    );

  if (
    reactingCombatant === undefined ||
    hasExhaustedRoundActions(
      reactingCombatant,
    )
  ) {
    return {
      success: false,
      opportunity,
      reason:
        "reacting-combatant-not-round-eligible",
    };
  }

  const actionCap =
    reactingCombatant.capacity.reaction;

  if (
    !isValidReactionActionCap(
      actionCap,
    )
  ) {
    return {
      success: false,
      opportunity,
      reason:
        "invalid-reaction-action-cap",
    };
  }

  const reaction: ReactionState = {
    kind: "reaction",

    reactingCombatantId:
      opportunity.reactingCombatantId,

    triggeringCombatantId:
      opportunity.triggeringCombatantId,

    triggeringActionId:
      opportunity.triggeringActionId,

    actionCap,

    actionsSpent: 0,
  };

  /*
   * This is deliberately part of opening the Reaction rather than a
   * separate optional step.
   *
   * A Reaction cannot exist while the triggering Turn remains active.
   */
  const triggeringTurnEnd =
    endTurnForReaction(
      triggeringTurn,
    );

  return {
    success: true,
    reaction,
    triggeringTurnEnd,
  };
}


// ---------------------------------------------------------------------------
// Reaction continuation
// ---------------------------------------------------------------------------

/*
 * Returns whether the reacting combatant may still spend another Action in
 * this Reaction.
 *
 * The Reaction must have room under its state Action cap AND the combatant
 * must still have Round Actions remaining.
 */
export function canContinueReaction(
  reaction: ReactionState,
  combatant: CombatantRoundState,
): boolean {
  if (
    reaction.reactingCombatantId !==
    combatant.combatantId
  ) {
    return false;
  }

  if (
    hasExhaustedRoundActions(
      combatant,
    )
  ) {
    return false;
  }

  if (
    hasReachedStateActionCap(
      reaction,
    )
  ) {
    return false;
  }

  return true;
}


/*
 * Returns the maximum number of additional normal Actions that may
 * currently be spent during this Reaction.
 *
 * This is constrained by both:
 *
 * - remaining room under the Reaction Action cap, and
 * - remaining Round Actions.
 *
 * Example:
 *
 *   Reaction cap:          2
 *   Reaction actions used: 0
 *   Round actions left:    1
 *
 *   Available now:         1
 */
export function availableReactionActions(
  reaction: ReactionState,
  combatant: CombatantRoundState,
): number {
  if (
    reaction.reactingCombatantId !==
    combatant.combatantId
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      remainingStateActions(
        reaction,
      ),
      combatant.remainingActions,
    ),
  );
}


// ---------------------------------------------------------------------------
// Automatic Reaction-ending checks
// ---------------------------------------------------------------------------

/*
 * Determines whether the Reaction has reached a mandatory ending condition.
 *
 * Returns null while the Reaction may continue.
 */
export function findAutomaticReactionEndReason(
  reaction: ReactionState,
  combatant: CombatantRoundState,
): ReactionEndReason | null {
  if (
    reaction.reactingCombatantId !==
    combatant.combatantId
  ) {
    return null;
  }

  if (
    hasExhaustedRoundActions(
      combatant,
    )
  ) {
    return "round-actions-exhausted";
  }

  if (
    hasReachedStateActionCap(
      reaction,
    )
  ) {
    return "action-cap-reached";
  }

  return null;
}


// ---------------------------------------------------------------------------
// Reaction ending
// ---------------------------------------------------------------------------

function createReactionEnd(
  reaction: ReactionState,
  reason: ReactionEndReason,
): ReactionEnd {
  return {
    combatantId:
      reaction.reactingCombatantId,

    triggeringCombatantId:
      reaction.triggeringCombatantId,

    triggeringActionId:
      reaction.triggeringActionId,

    reason,

    actionsSpent:
      reaction.actionsSpent,
  };
}


/*
 * Ends the Reaction voluntarily.
 *
 * This does not consume an Action by itself.
 *
 * If the reacting combatant deliberately chooses to spend an Action doing
 * nothing, actions.ts::spendInaction() should be used instead.
 *
 * Any remaining Round Actions are preserved.
 */
export function endReactionVoluntarily(
  reaction: ReactionState,
): ReactionEnd {
  return createReactionEnd(
    reaction,
    "voluntary",
  );
}


/*
 * Ends the Reaction because its resolved Reaction Action cap has been
 * reached.
 */
export function endReactionAtActionCap(
  reaction: ReactionState,
): ReactionEnd {
  return createReactionEnd(
    reaction,
    "action-cap-reached",
  );
}


/*
 * Ends the Reaction because the reacting combatant has exhausted their
 * entire Round Action pool.
 */
export function endReactionForRoundExhaustion(
  reaction: ReactionState,
): ReactionEnd {
  return createReactionEnd(
    reaction,
    "round-actions-exhausted",
  );
}


/*
 * Ends the Reaction automatically when one of its mandatory ending
 * conditions has been reached.
 *
 * Returns null while the Reaction remains able to continue.
 */
export function resolveAutomaticReactionEnd(
  reaction: ReactionState,
  combatant: CombatantRoundState,
): ReactionEnd | null {
  const reason =
    findAutomaticReactionEndReason(
      reaction,
      combatant,
    );

  if (reason === null) {
    return null;
  }

  return createReactionEnd(
    reaction,
    reason,
  );
}