/*
 * Runtime Action handling for Combat.
 *
 * An Action is a mechanically significant unit performed while a combatant
 * is in a Turn or Reaction state.
 *
 * Combat does not classify Actions as attacks, defenses, movement, etc.
 * Those behaviors are represented by the Skill or other capability being
 * used. Combat only cares about the runtime properties relevant to the
 * Action economy.
 *
 * Most Actions originate from Skills, though sufficiently significant
 * object interactions may also be treated as Actions at GM discretion.
 *
 * Incidental behavior such as speaking, drawing a weapon, gesturing, or
 * similar flavor is not inherently an Action.
 *
 * Action capacity is supplied to Combat by character resolution.
 * This module does not derive:
 *
 * - Actions per Round
 * - Actions per Turn
 * - Actions per Reaction
 *
 * It only enforces those resolved limits while Combat is running.
 */

import type {
  ActiveCombatState,
  CombatAction,
  CombatActionId,
  CombatActionSource,
  CombatantId,
  CombatantRoundState,
  ReactionState,
  TurnState,
} from "./types";


// ---------------------------------------------------------------------------
// Fixed Action costs
// ---------------------------------------------------------------------------

/*
 * Voluntary Inaction and involuntary Hesitation each consume one normal
 * Action from the combatant's remaining Round Action pool.
 */
export const INACTION_ACTION_COST = 1;
export const HESITATION_ACTION_COST = 1;


// ---------------------------------------------------------------------------
// Action-spending results
// ---------------------------------------------------------------------------

export const ACTION_SPEND_FAILURE_REASONS = [
  "invalid-action-cost",
  "wrong-combatant",
  "insufficient-round-actions",
  "state-action-cap-exceeded",
] as const;

export type ActionSpendFailureReason =
  typeof ACTION_SPEND_FAILURE_REASONS[number];


export interface ActionSpendSuccess {
  readonly success: true;

  readonly action: CombatAction;

  /*
   * Updated runtime state for the acting combatant.
   */
  readonly combatant: CombatantRoundState;

  /*
   * Updated Turn or Reaction state after counting this Action.
   */
  readonly state: ActiveCombatState;
}


export interface ActionSpendFailure {
  readonly success: false;

  readonly action: CombatAction;

  readonly combatant: CombatantRoundState;

  readonly state: ActiveCombatState;

  readonly reason: ActionSpendFailureReason;
}


export type ActionSpendResult =
  | ActionSpendSuccess
  | ActionSpendFailure;


// ---------------------------------------------------------------------------
// Active-state helpers
// ---------------------------------------------------------------------------

/*
 * Returns the combatant currently permitted to act within the supplied
 * Combat state.
 */
export function activeStateCombatantId(
  state: ActiveCombatState,
): CombatantId {
  switch (state.kind) {
    case "turn":
      return state.combatantId;

    case "reaction":
      return state.reactingCombatantId;
  }
}


/*
 * Returns how many Actions have already been spent during the current
 * Turn or Reaction state.
 */
export function actionsSpentInState(
  state: ActiveCombatState,
): number {
  return state.actionsSpent;
}


/*
 * Returns how many more Actions may be spent during the current state.
 *
 * This is distinct from the combatant's remaining Round Actions.
 *
 * Example:
 *
 *   remaining Round Actions = 5
 *   Turn Action cap         = 2
 *   Actions spent this Turn = 1
 *
 *   remainingStateActions   = 1
 *
 * The combatant still owns 5 Round Actions before spending, but may only
 * spend one more during this particular Turn.
 */
export function remainingStateActions(
  state: ActiveCombatState,
): number {
  return Math.max(
    0,
    state.actionCap - state.actionsSpent,
  );
}


/*
 * Returns whether the state has reached its Action cap.
 */
export function hasReachedStateActionCap(
  state: ActiveCombatState,
): boolean {
  return remainingStateActions(state) === 0;
}


// ---------------------------------------------------------------------------
// Round-Action helpers
// ---------------------------------------------------------------------------

/*
 * Returns whether the combatant has exhausted their entire Action pool for
 * the current Round.
 */
export function hasExhaustedRoundActions(
  combatant: CombatantRoundState,
): boolean {
  return combatant.remainingActions <= 0;
}


/*
 * Returns whether the combatant has enough remaining Round Actions to pay
 * the supplied Action cost.
 */
export function canAffordRoundActionCost(
  combatant: CombatantRoundState,
  actionCost: number,
): boolean {
  return (
    Number.isInteger(actionCost) &&
    actionCost > 0 &&
    combatant.remainingActions >= actionCost
  );
}


// ---------------------------------------------------------------------------
// Action validation
// ---------------------------------------------------------------------------

/*
 * Every normal Action must consume at least one whole Action.
 *
 * Bonus Actions are represented separately and therefore do not use an
 * actionCost of zero.
 */
export function isValidActionCost(
  actionCost: number,
): boolean {
  return (
    Number.isInteger(actionCost) &&
    actionCost > 0
  );
}


/*
 * Determines why an Action cannot currently be spent.
 *
 * Returns null when the Action is legal with respect to the runtime Action
 * economy.
 *
 * This does NOT determine whether the underlying Skill itself is legal,
 * whether its requirements are met, whether its check succeeds, or whether
 * its target is valid. Those responsibilities belong to the relevant
 * capability/mechanic.
 */
export function findActionSpendFailure(
  action: CombatAction,
  combatant: CombatantRoundState,
  state: ActiveCombatState,
): ActionSpendFailureReason | null {
  if (!isValidActionCost(action.actionCost)) {
    return "invalid-action-cost";
  }

  const actingCombatantId = activeStateCombatantId(state);

  if (
    action.actorCombatantId !== actingCombatantId ||
    combatant.combatantId !== actingCombatantId
  ) {
    return "wrong-combatant";
  }

  if (combatant.remainingActions < action.actionCost) {
    return "insufficient-round-actions";
  }

  if (remainingStateActions(state) < action.actionCost) {
    return "state-action-cap-exceeded";
  }

  return null;
}


/*
 * Convenience predicate for callers that do not need the failure reason.
 */
export function canSpendCombatAction(
  action: CombatAction,
  combatant: CombatantRoundState,
  state: ActiveCombatState,
): boolean {
  return (
    findActionSpendFailure(
      action,
      combatant,
      state,
    ) === null
  );
}


// ---------------------------------------------------------------------------
// State updates
// ---------------------------------------------------------------------------

function spendTurnActions(
  state: TurnState,
  amount: number,
): TurnState {
  return {
    ...state,
    actionsSpent: state.actionsSpent + amount,
  };
}


function spendReactionActions(
  state: ReactionState,
  amount: number,
): ReactionState {
  return {
    ...state,
    actionsSpent: state.actionsSpent + amount,
  };
}


/*
 * Records Action expenditure against the active state's Action cap.
 */
function spendStateActions(
  state: ActiveCombatState,
  amount: number,
): ActiveCombatState {
  switch (state.kind) {
    case "turn":
      return spendTurnActions(state, amount);

    case "reaction":
      return spendReactionActions(state, amount);
  }
}


/*
 * Records Action expenditure against the combatant's shared Round Action
 * pool.
 */
function spendRoundActions(
  combatant: CombatantRoundState,
  amount: number,
): CombatantRoundState {
  return {
    ...combatant,
    remainingActions:
      combatant.remainingActions - amount,
  };
}


// ---------------------------------------------------------------------------
// Action spending
// ---------------------------------------------------------------------------

/*
 * Attempts to spend one Combat Action.
 *
 * A successful spend consumes the Action's cost from BOTH:
 *
 * 1. the combatant's remaining Round Action pool, and
 * 2. the current Turn or Reaction state's available Action allowance.
 *
 * Those values are deliberately distinct.
 *
 * Example:
 *
 *   Round Actions remaining = 6
 *   Turn cap                = 2
 *
 * Spending a 1-Action Skill produces:
 *
 *   Round Actions remaining = 5
 *   Turn Actions spent      = 1 / 2
 *
 * Bonus Actions do not consume additional normal Actions here.
 */
export function spendCombatAction(
  action: CombatAction,
  combatant: CombatantRoundState,
  state: ActiveCombatState,
): ActionSpendResult {
  const failureReason =
    findActionSpendFailure(
      action,
      combatant,
      state,
    );

  if (failureReason !== null) {
    return {
      success: false,
      action,
      combatant,
      state,
      reason: failureReason,
    };
  }

  return {
    success: true,
    action,
    combatant: spendRoundActions(
      combatant,
      action.actionCost,
    ),
    state: spendStateActions(
      state,
      action.actionCost,
    ),
  };
}


// ---------------------------------------------------------------------------
// Inaction
// ---------------------------------------------------------------------------

/*
 * Inaction is the voluntary choice to spend an Action doing nothing.
 *
 * It is still represented as a CombatAction because it consumes the same
 * runtime resource as any other Action.
 */
export function createInactionAction(
  id: CombatActionId,
  combatantId: CombatantId,
): CombatAction {
  const source: CombatActionSource = {
    kind: "inaction",
  };

  return {
    id,
    actorCombatantId: combatantId,
    actionCost: INACTION_ACTION_COST,
    source,
    targetCombatantIds: [],
  };
}


/*
 * Convenience wrapper for resolving voluntary Inaction.
 */
export function spendInaction(
  id: CombatActionId,
  combatant: CombatantRoundState,
  state: ActiveCombatState,
): ActionSpendResult {
  return spendCombatAction(
    createInactionAction(
      id,
      combatant.combatantId,
    ),
    combatant,
    state,
  );
}


// ---------------------------------------------------------------------------
// Hesitation
// ---------------------------------------------------------------------------

/*
 * Hesitation represents an involuntary loss of an Action because the
 * player failed to make a decision before the applicable Combat-state
 * decision timer expired.
 *
 * The timer itself is host-side. Combat only resolves the mechanical
 * consequence once the host reports that the deadline expired.
 */
export function createHesitationAction(
  id: CombatActionId,
  combatantId: CombatantId,
): CombatAction {
  const source: CombatActionSource = {
    kind: "hesitation",
  };

  return {
    id,
    actorCombatantId: combatantId,
    actionCost: HESITATION_ACTION_COST,
    source,
    targetCombatantIds: [],
  };
}


/*
 * Convenience wrapper for resolving a timeout as Hesitation.
 */
export function spendHesitation(
  id: CombatActionId,
  combatant: CombatantRoundState,
  state: ActiveCombatState,
): ActionSpendResult {
  return spendCombatAction(
    createHesitationAction(
      id,
      combatant.combatantId,
    ),
    combatant,
    state,
  );
}