/*
 * Fixtures for the Combat characterization suite.
 *
 * These build Rounds and states through the module's own entry points
 * wherever possible, so a test describes behaviour reachable by a caller
 * rather than a hand-assembled shape the production code could never
 * produce.
 */

import {
  startRound,
  type CombatAction,
  type CombatActionCapacity,
  type CombatantId,
  type CombatantRoundState,
  type CombatRound,
  type InitiativeEntry,
  type ReactionState,
  type RoundCombatantInput,
  type TurnState,
} from "../../gameplay/combat";

export const CAPACITY: CombatActionCapacity = {
  round: 4,
  turn: 2,
  reaction: 1,
};

export function capacity(
  overrides: Partial<CombatActionCapacity> = {},
): CombatActionCapacity {
  return { ...CAPACITY, ...overrides };
}

export function combatantInput(
  combatantId: CombatantId,
  overrides: Partial<CombatActionCapacity> = {},
): RoundCombatantInput {
  return { combatantId, actionCapacity: capacity(overrides) };
}

export function roundState(
  combatantId: CombatantId,
  remainingActions: number,
  overrides: Partial<CombatActionCapacity> = {},
): CombatantRoundState {
  return {
    combatantId,
    capacity: capacity(overrides),
    remainingActions,
  };
}

export function turnState(
  combatantId: CombatantId,
  actionCap = 2,
  actionsSpent = 0,
): TurnState {
  return { kind: "turn", combatantId, actionCap, actionsSpent };
}

export function reactionState(
  reactingCombatantId: CombatantId,
  interruptedCombatantId: CombatantId,
  actionCap = 1,
  actionsSpent = 0,
): ReactionState {
  return {
    kind: "reaction",
    reactingCombatantId,
    trigger: {
      kind: "action",
      actionId: "action-1",
      actorCombatantId: interruptedCombatantId,
    },
    interruptedCombatantId,
    actionCap,
    actionsSpent,
  };
}


/** A Reaction opened by a hazard rather than by anybody's Action. */
export function eventReactionState(
  reactingCombatantId: CombatantId,
  interruptedCombatantId: CombatantId,
  actionCap = 1,
): ReactionState {
  return {
    kind: "reaction",
    reactingCombatantId,
    trigger: { kind: "event", eventId: "boulder-1" },
    interruptedCombatantId,
    actionCap,
    actionsSpent: 0,
  };
}

export function skillAction(
  overrides: Partial<CombatAction> = {},
): CombatAction {
  return {
    id: "action-1",
    actorCombatantId: "a",
    actionCost: 1,
    source: { kind: "skill", skillId: "strike" },
    threatenedCombatantIds: [],
    ...overrides,
  };
}

/** Descending Initiative values, so order matches the argument order. */
export function initiative(
  ...combatantIds: readonly CombatantId[]
): readonly InitiativeEntry[] {
  return combatantIds.map((combatantId, index) => ({
    combatantId,
    value: 100 - index,
  }));
}

/**
 * A started Round, failing the test if it could not start.
 *
 * Almost every Round test is about what a VALID Round does; the failure
 * branch has its own tests.
 */
export function startedRound(
  inputs: readonly RoundCombatantInput[],
  entries: readonly InitiativeEntry[] = initiative(
    ...inputs.map((input) => input.combatantId),
  ),
  roundNumber = 1,
): CombatRound {
  const result = startRound(roundNumber, inputs, entries);

  if (!result.success) {
    throw new Error(`Expected the Round to start: ${result.reason}`);
  }

  return result.round;
}

/** The three-combatant Round the rotation tests share. */
export function threeCombatantRound(
  overrides: Partial<CombatActionCapacity> = {},
): CombatRound {
  return startedRound([
    combatantInput("a", overrides),
    combatantInput("b", overrides),
    combatantInput("c", overrides),
  ]);
}
