/*
 * Reaction-state lifecycle for Combat.
 *
 * A Reaction is a responsive Combat state that may be entered when the
 * reacting combatant is explicitly THREATENED — by an Action that declared
 * them and declares itself dangerous, or by a hazard the host reports.
 *
 * Being threatened does NOT automatically create a Reaction state, and being
 * AFFECTED never creates one at all: affectedness is settled after
 * resolution, which is far too late to offer anybody the chance to respond.
 *
 * The flow is:
 *
 *   Action explicitly threatens another combatant
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
 *   Action cap, which limits Actions WITHIN one Reaction and never the
 *   number of separate Reactions in a Round,
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
  ReactionTrigger,
  TurnState,
} from "./types";


/*
 * A hazard the host reports, with the combatants it endangers.
 *
 * The engine models no boulders. It is told one is falling and on whom, and
 * that is enough to offer a Reaction.
 */
export interface CredibleThreat {
  readonly eventId: string;

  readonly threatenedCombatantIds: readonly CombatantId[];

  readonly describedAs?: string;
}

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
  "combatant-not-threatened",
  "self-reaction",
  "trigger-id-missing",
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
 * Creates a Reaction opportunity for a combatant an Action explicitly
 * threatens.
 *
 * Reads threatenedCombatantIds and nothing else. That list is derived above
 * Combat from the action profile's own threat declaration, so a heal that
 * names a recipient produces no opportunity while an attack that names the
 * same combatant does.
 *
 * Being threatened is not being hit. The Action may still miss, and this
 * opportunity stands either way — you duck the blow that was coming, not the
 * one that landed.
 *
 * This does NOT perform the Detection check and therefore does not open a
 * Reaction state.
 */
export function createReactionOpportunity(
  action: CombatAction,
  reactingCombatantId: CombatantId,
): ReactionOpportunityResult {
  if (
    typeof action.id !== "string" ||
    action.id.trim().length === 0
  ) {
    return {
      success: false,
      reactingCombatantId,
      reason: "trigger-id-missing",
    };
  }

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

  /*
   * Widened deliberately. A Combat-native Action's threat list is typed as
   * the empty tuple — Inaction endangers nobody, and saying so in the type
   * is worth more than the one cast it costs here.
   */
  const threatened: readonly CombatantId[] =
    action.threatenedCombatantIds;

  if (
    !threatened.includes(reactingCombatantId)
  ) {
    return {
      success: false,
      reactingCombatantId,
      reason: "combatant-not-threatened",
    };
  }

  return {
    success: true,
    opportunity: {
      trigger: {
        kind: "action",
        actionId: action.id,
        actorCombatantId: action.actorCombatantId,
      },
      reactingCombatantId,
    },
  };
}


/*
 * Creates a Reaction opportunity from a hazard nobody performed.
 *
 * A falling boulder threatens whoever is under it, and forcing that through
 * the Action model would mean inventing a combatant who threw it and a
 * target list it never declared. The host says what happened and who it
 * endangers; Combat does the rest identically from there.
 */
export function createEventReactionOpportunity(
  threat: CredibleThreat,
  reactingCombatantId: CombatantId,
): ReactionOpportunityResult {
  /*
   * An unidentified hazard cannot be recorded, reacted to coherently, or
   * matched against a queue later. Checked here as well as on the queued
   * path, because a direct caller reaches this function without one.
   */
  if (
    typeof threat.eventId !== "string" ||
    threat.eventId.trim().length === 0
  ) {
    return {
      success: false,
      reactingCombatantId,
      reason: "trigger-id-missing",
    };
  }

  if (
    !threat.threatenedCombatantIds.includes(
      reactingCombatantId,
    )
  ) {
    return {
      success: false,
      reactingCombatantId,
      reason: "combatant-not-threatened",
    };
  }

  return {
    success: true,
    opportunity: {
      trigger: {
        kind: "event",
        eventId: threat.eventId,
        ...(threat.describedAs === undefined
          ? {}
          : { describedAs: threat.describedAs }),
      },
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

  /** Whose Turn this Reaction ended. */
  readonly interruptedCombatantId: CombatantId;

  readonly trigger: ReactionTrigger;

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
/*
 * Builds the Reaction state itself, without ending anything.
 *
 * Split out because a queue of Reactions from ONE trigger ends the Turn
 * exactly once, on the first opening. The second and later ones have no Turn
 * left to end, and must still be validated identically — so the validation
 * lives here and both callers use it rather than one of them growing a
 * looser copy.
 */
export function buildQueuedReaction(
  opportunity: ReactionOpportunity,
  interruptedCombatantId: CombatantId,
  combatants: readonly CombatantRoundState[],
): ReactionStartResult | { readonly success: true; readonly reaction: ReactionState } {
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

  return {
    success: true,

    reaction: {
      kind: "reaction",

      reactingCombatantId:
        opportunity.reactingCombatantId,

      trigger: opportunity.trigger,

      interruptedCombatantId,

      actionCap,

      actionsSpent: 0,
    },
  };
}


export function openReactionAfterGateSuccess(
  opportunity: ReactionOpportunity,
  interruptedTurn: TurnState,
  combatants: readonly CombatantRoundState[],
): ReactionStartResult {
  /*
   * An ACTION trigger must interrupt the Turn of the combatant who acted:
   * a Reaction to Gon's punch cannot interrupt somebody else's Turn.
   *
   * An EVENT trigger has no actor, so there is nothing to match against. A
   * hazard interrupts whichever Turn is in progress when it lands, which is
   * the only Turn it could interrupt.
   */
  if (
    opportunity.trigger.kind === "action" &&
    interruptedTurn.combatantId !==
      opportunity.trigger.actorCombatantId
  ) {
    return {
      success: false,
      opportunity,
      reason: "triggering-turn-mismatch",
    };
  }

  const built = buildQueuedReaction(
    opportunity,
    interruptedTurn.combatantId,
    combatants,
  );

  if (!built.success) return built;

  /*
   * This is deliberately part of opening the Reaction rather than a
   * separate optional step.
   *
   * A Reaction cannot exist while the triggering Turn remains active.
   */
  const triggeringTurnEnd =
    endTurnForReaction(
      interruptedTurn,
    );

  return {
    success: true,
    reaction: built.reaction,
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

    interruptedCombatantId:
      reaction.interruptedCombatantId,

    trigger: reaction.trigger,

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