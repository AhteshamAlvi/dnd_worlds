/*
 * Round lifecycle and Initiative rotation for Combat.
 *
 * A Round is one complete combat cycle.
 *
 * It does NOT end after every combatant has received one Turn. Initiative
 * continues rotating until every combatant has exhausted their available
 * Actions for the Round.
 *
 * At the beginning of every Round:
 *
 * 1. each combatant receives a fresh Round Action pool from their resolved
 *    Action capacity,
 * 2. Initiative is rolled again from scratch,
 * 3. a new Initiative order is established,
 * 4. the first eligible combatant enters Turn state.
 *
 * A combatant's total Round Actions are independent from their Turn Action
 * cap. A combatant may therefore receive multiple Turns during the same
 * Round as Initiative continues rotating.
 *
 * Reactions temporarily replace the active Turn state, but they do NOT
 * change the Round's Initiative position. When the Reaction closes,
 * Initiative continues from the combatant whose Turn was interrupted.
 *
 * Combat does not derive Action capacity or Initiative rolls here.
 *
 * - Action capacity is supplied by Character resolution.
 * - Initiative values are supplied automatically by the host.
 *
 * The engine remains deterministic.
 */

import type {
  ActiveCombatState,
  CombatActionCapacity,
  CombatantId,
  CombatantRoundState,
  CombatRound,
  InitiativeEntry,
  InitiativeEntry as ResolvedInitiativeEntry,
  ReactionState,
  TurnState,
} from "./types";

import {
  findInitiativeIndex,
  findNextEligibleInitiativeIndex,
  resolveInitiativeOrder,
  type InitiativeIssue,
} from "./initiative";

import {
  startTurn,
  type TurnStartFailureReason,
} from "./turn";


// ---------------------------------------------------------------------------
// Round timing
// ---------------------------------------------------------------------------

/*
 * One completed Combat Round represents six seconds of in-game time.
 *
 * A Round is not a Turn. A creature may take several Turns within one Round,
 * spending its Round Action budget across them — Combat Ability decides how
 * many Actions the Round holds, and Actions per Turn decides how finely those
 * are sliced. Movement reads the Turn division, never the Round budget: see
 * foundation/attributes/speed.ts.
 *
 * The Time module ultimately performs the clock advancement. Round only
 * declares the duration represented by a completed cycle.
 */
export const COMBAT_ROUND_DURATION_SECONDS = 6;


// ---------------------------------------------------------------------------
// Round input
// ---------------------------------------------------------------------------

/*
 * Runtime-independent information needed to initialize one combatant for
 * the new Round.
 *
 * Action capacity has already been resolved elsewhere.
 */
export interface RoundCombatantInput {
  readonly combatantId: CombatantId;

  readonly actionCapacity: CombatActionCapacity;
}


// ---------------------------------------------------------------------------
// Round-start failures
// ---------------------------------------------------------------------------

export const ROUND_START_FAILURE_REASONS = [
  "round-number-invalid",
  "combatants-empty",
  "combatant-id-duplicate",
  "round-action-capacity-invalid",
  "turn-action-capacity-invalid",
  "reaction-action-capacity-invalid",
  "initiative-invalid",
  "first-turn-unavailable",
] as const;

export type RoundStartFailureReason =
  typeof ROUND_START_FAILURE_REASONS[number];


export interface RoundStartFailure {
  readonly success: false;

  readonly reason: RoundStartFailureReason;

  readonly combatantIds?: readonly CombatantId[];

  readonly initiativeIssues?: readonly InitiativeIssue[];

  readonly turnFailureReason?: TurnStartFailureReason;
}


export interface RoundStartSuccess {
  readonly success: true;

  /*
   * The Round begins with its first Turn already active.
   */
  readonly round: CombatRound;
}


export type RoundStartResult =
  | RoundStartSuccess
  | RoundStartFailure;


// ---------------------------------------------------------------------------
// Round-transition results
// ---------------------------------------------------------------------------

export interface RoundContinues {
  readonly complete: false;

  readonly round: CombatRound;
}


export interface RoundComplete {
  readonly complete: true;

  /*
   * Final Round state. Every combatant has exhausted their Round Actions
   * and no Combat state remains active.
   */
  readonly round: CombatRound;
}


export type RoundProgressResult =
  | RoundContinues
  | RoundComplete;


// ---------------------------------------------------------------------------
// Basic validation helpers
// ---------------------------------------------------------------------------

export function isValidRoundNumber(
  roundNumber: number,
): boolean {
  return (
    Number.isInteger(roundNumber) &&
    roundNumber > 0
  );
}


export function isValidRoundActionCapacity(
  capacity: number,
): boolean {
  return (
    Number.isInteger(capacity) &&
    capacity > 0
  );
}


export function isValidTurnActionCapacity(
  capacity: number,
): boolean {
  return (
    Number.isInteger(capacity) &&
    capacity > 0
  );
}


export function isValidReactionActionCapacity(
  capacity: number,
): boolean {
  return (
    Number.isInteger(capacity) &&
    capacity > 0
  );
}


function findDuplicateCombatantIds(
  combatants: readonly RoundCombatantInput[],
): readonly CombatantId[] {
  const counts =
    new Map<CombatantId, number>();

  for (const combatant of combatants) {
    counts.set(
      combatant.combatantId,
      (counts.get(combatant.combatantId) ?? 0) + 1,
    );
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([combatantId]) => combatantId);
}


// ---------------------------------------------------------------------------
// Combatant Round-state creation
// ---------------------------------------------------------------------------

/*
 * Creates the temporary Round state for one combatant.
 *
 * A new Round always begins with:
 *
 *   remainingActions = capacity.round
 *
 * Turn and Reaction capacities are snapshotted alongside it so the Combat
 * runtime can enforce the character's resolved limits consistently
 * throughout this Round.
 */
export function createCombatantRoundState(
  input: RoundCombatantInput,
): CombatantRoundState {
  return {
    combatantId: input.combatantId,

    capacity: input.actionCapacity,

    remainingActions:
      input.actionCapacity.round,
  };
}


export function createCombatantRoundStates(
  inputs: readonly RoundCombatantInput[],
): readonly CombatantRoundState[] {
  return inputs.map(
    createCombatantRoundState,
  );
}


// ---------------------------------------------------------------------------
// Combatant lookup / replacement
// ---------------------------------------------------------------------------

export function findRoundCombatant(
  round: CombatRound,
  combatantId: CombatantId,
): CombatantRoundState | undefined {
  return round.combatants.find(
    (combatant) =>
      combatant.combatantId === combatantId,
  );
}


/*
 * Replaces one combatant's runtime Round state immutably.
 *
 * actions.ts returns an updated CombatantRoundState when an Action is spent;
 * this helper places that updated state back into the Round.
 */
export function replaceRoundCombatant(
  round: CombatRound,
  updatedCombatant: CombatantRoundState,
): CombatRound {
  return {
    ...round,

    combatants: round.combatants.map(
      (combatant) =>
        combatant.combatantId ===
        updatedCombatant.combatantId
          ? updatedCombatant
          : combatant,
    ),
  };
}


// ---------------------------------------------------------------------------
// Active-state replacement
// ---------------------------------------------------------------------------

export function setRoundActiveState(
  round: CombatRound,
  state: ActiveCombatState | null,
): CombatRound {
  return {
    ...round,
    activeState: state,
  };
}


/*
 * Replaces both the acting combatant's runtime Action state and the active
 * Combat state after actions.ts::spendCombatAction().
 */
export function applyActionSpendToRound(
  round: CombatRound,
  combatant: CombatantRoundState,
  state: ActiveCombatState,
): CombatRound {
  return {
    ...replaceRoundCombatant(
      round,
      combatant,
    ),

    activeState: state,
  };
}


// ---------------------------------------------------------------------------
// Round completion
// ---------------------------------------------------------------------------

/*
 * A Round is complete only when EVERY combatant has exhausted their normal
 * Round Action pool.
 *
 * Receiving one Turn is not sufficient.
 */
export function isRoundComplete(
  round: CombatRound,
): boolean {
  return round.combatants.every(
    (combatant) =>
      combatant.remainingActions <= 0,
  );
}


/*
 * Returns the number of combatants who still have Actions remaining.
 */
export function countRoundEligibleCombatants(
  round: CombatRound,
): number {
  return round.combatants.filter(
    (combatant) =>
      combatant.remainingActions > 0,
  ).length;
}


// ---------------------------------------------------------------------------
// Current Initiative position
// ---------------------------------------------------------------------------

export function currentInitiativeEntry(
  round: CombatRound,
): ResolvedInitiativeEntry | null {
  if (
    round.initiativeIndex < 0 ||
    round.initiativeIndex >=
      round.initiative.length
  ) {
    return null;
  }

  return (
    round.initiative[
      round.initiativeIndex
    ] ?? null
  );
}


export function currentInitiativeCombatantId(
  round: CombatRound,
): CombatantId | null {
  return (
    currentInitiativeEntry(round)
      ?.combatantId ?? null
  );
}


// ---------------------------------------------------------------------------
// Round creation
// ---------------------------------------------------------------------------

/*
 * Begins a completely new Round.
 *
 * Initiative entries MUST be fresh results for this Round. Nothing from a
 * previous Round is reused.
 *
 * The host is expected to automatically generate the Initiative values
 * before calling this function.
 */
export function startRound(
  roundNumber: number,
  combatantInputs: readonly RoundCombatantInput[],
  initiativeEntries: readonly InitiativeEntry[],
): RoundStartResult {
  if (
    !isValidRoundNumber(
      roundNumber,
    )
  ) {
    return {
      success: false,
      reason: "round-number-invalid",
    };
  }

  if (
    combatantInputs.length === 0
  ) {
    return {
      success: false,
      reason: "combatants-empty",
    };
  }

  const duplicateIds =
    findDuplicateCombatantIds(
      combatantInputs,
    );

  if (
    duplicateIds.length > 0
  ) {
    return {
      success: false,
      reason: "combatant-id-duplicate",
      combatantIds: duplicateIds,
    };
  }

  const invalidRoundCapacityIds =
    combatantInputs
      .filter(
        (combatant) =>
          !isValidRoundActionCapacity(
            combatant.actionCapacity.round,
          ),
      )
      .map(
        (combatant) =>
          combatant.combatantId,
      );

  if (
    invalidRoundCapacityIds.length > 0
  ) {
    return {
      success: false,
      reason:
        "round-action-capacity-invalid",
      combatantIds:
        invalidRoundCapacityIds,
    };
  }

  const invalidTurnCapacityIds =
    combatantInputs
      .filter(
        (combatant) =>
          !isValidTurnActionCapacity(
            combatant.actionCapacity.turn,
          ),
      )
      .map(
        (combatant) =>
          combatant.combatantId,
      );

  if (
    invalidTurnCapacityIds.length > 0
  ) {
    return {
      success: false,
      reason:
        "turn-action-capacity-invalid",
      combatantIds:
        invalidTurnCapacityIds,
    };
  }

  const invalidReactionCapacityIds =
    combatantInputs
      .filter(
        (combatant) =>
          !isValidReactionActionCapacity(
            combatant.actionCapacity.reaction,
          ),
      )
      .map(
        (combatant) =>
          combatant.combatantId,
      );

  if (
    invalidReactionCapacityIds.length > 0
  ) {
    return {
      success: false,
      reason:
        "reaction-action-capacity-invalid",
      combatantIds:
        invalidReactionCapacityIds,
    };
  }

  const combatantIds =
    combatantInputs.map(
      (combatant) =>
        combatant.combatantId,
    );

  const initiativeResolution =
    resolveInitiativeOrder(
      combatantIds,
      initiativeEntries,
    );

  if (
    !initiativeResolution.success
  ) {
    return {
      success: false,
      reason: "initiative-invalid",
      initiativeIssues:
        initiativeResolution.issues,
    };
  }

  const combatants =
    createCombatantRoundStates(
      combatantInputs,
    );

  /*
   * Every newly-created combatant currently has positive Round capacity,
   * so Initiative position 0 should always be eligible.
   *
   * We still resolve the first Turn through startTurn() rather than
   * constructing TurnState manually so there is one authoritative Turn
   * creation path.
   */
  const firstInitiativeIndex = 0;

  const firstEntry =
    initiativeResolution.order[
      firstInitiativeIndex
    ];

  if (
    firstEntry === undefined
  ) {
    return {
      success: false,
      reason: "first-turn-unavailable",
    };
  }

  const turnResult =
    startTurn(
      firstEntry.combatantId,
      initiativeResolution.order,
      combatants,
    );

  if (
    !turnResult.success
  ) {
    return {
      success: false,
      reason: "first-turn-unavailable",
      combatantIds: [
        firstEntry.combatantId,
      ],
      turnFailureReason:
        turnResult.reason,
    };
  }

  return {
    success: true,

    round: {
      number: roundNumber,

      initiative:
        initiativeResolution.order,

      initiativeIndex:
        firstInitiativeIndex,

      combatants,

      activeState:
        turnResult.turn,
    },
  };
}


// ---------------------------------------------------------------------------
// Initiative advancement
// ---------------------------------------------------------------------------

/*
 * Finds and starts the next Turn in Initiative order.
 *
 * Combatants with no remaining Round Actions are skipped automatically.
 *
 * If every combatant has exhausted their Actions, the Round is completed
 * instead.
 */
export function advanceToNextTurn(
  round: CombatRound,
): RoundProgressResult {
  if (
    isRoundComplete(round)
  ) {
    return {
      complete: true,

      round: {
        ...round,
        activeState: null,
      },
    };
  }

  const nextIndex =
    findNextEligibleInitiativeIndex(
      round.initiative,
      round.initiativeIndex,
      round.combatants,
    );

  /*
   * If the Round is not complete, there should always be an eligible
   * combatant. Returning a completed state here would hide corrupted Round
   * state, so this condition should ultimately be covered by validation.
   *
   * For this structural layer, null simply leaves the Round without an
   * active state.
   */
  if (
    nextIndex === null
  ) {
    return {
      complete: false,

      round: {
        ...round,
        activeState: null,
      },
    };
  }

  const nextEntry =
    round.initiative[nextIndex];

  if (
    nextEntry === undefined
  ) {
    return {
      complete: false,

      round: {
        ...round,
        activeState: null,
      },
    };
  }

  const turnResult =
    startTurn(
      nextEntry.combatantId,
      round.initiative,
      round.combatants,
    );

  if (
    !turnResult.success
  ) {
    return {
      complete: false,

      round: {
        ...round,
        activeState: null,
      },
    };
  }

  return {
    complete: false,

    round: {
      ...round,

      initiativeIndex:
        nextIndex,

      activeState:
        turnResult.turn,
    },
  };
}


// ---------------------------------------------------------------------------
// Turn completion
// ---------------------------------------------------------------------------

/*
 * Advances Combat after the active Turn has ended normally.
 *
 * "Normally" includes:
 *
 * - voluntarily ending the Turn,
 * - reaching the Turn Action cap,
 * - exhausting all remaining Round Actions.
 *
 * A Turn ending because a Reaction opened does NOT call this function yet;
 * the Reaction becomes the active state first.
 */
export function continueAfterTurn(
  round: CombatRound,
): RoundProgressResult {
  return advanceToNextTurn(
    {
      ...round,
      activeState: null,
    },
  );
}


// ---------------------------------------------------------------------------
// Reaction activation
// ---------------------------------------------------------------------------

/*
 * Replaces the active Turn with a Reaction state.
 *
 * IMPORTANT:
 *
 * initiativeIndex is intentionally NOT changed.
 *
 * Example:
 *
 *   Initiative:
 *   A -> B -> C
 *
 *   initiativeIndex = A
 *
 *   A attacks C.
 *   C successfully opens Reaction.
 *
 *   activeState becomes C's Reaction,
 *   but initiativeIndex remains A.
 *
 * When C's Reaction ends, the Round therefore advances from A to B.
 */
export function activateReaction(
  round: CombatRound,
  reaction: ReactionState,
): CombatRound {
  return {
    ...round,

    activeState: reaction,
  };
}


// ---------------------------------------------------------------------------
// Reaction completion
// ---------------------------------------------------------------------------

/*
 * Advances Combat after a Reaction closes.
 *
 * The interrupted Turn is NEVER resumed.
 *
 * Because entering Reaction does not move initiativeIndex, the next
 * Initiative search begins after the combatant whose Turn was interrupted.
 *
 * Example:
 *
 *   A -> B -> C
 *
 *   A Turn
 *     ↓
 *   C Reaction
 *     ↓
 *   Reaction closes
 *     ↓
 *   B Turn
 */
export function continueAfterReaction(
  round: CombatRound,
): RoundProgressResult {
  return advanceToNextTurn(
    {
      ...round,
      activeState: null,
    },
  );
}


// ---------------------------------------------------------------------------
// Initiative-position consistency
// ---------------------------------------------------------------------------

/*
 * Ensures the stored Initiative position points at a particular combatant.
 *
 * This is primarily useful to higher-level orchestration and validation.
 */
export function setInitiativePositionForCombatant(
  round: CombatRound,
  combatantId: CombatantId,
): CombatRound | null {
  const index =
    findInitiativeIndex(
      round.initiative,
      combatantId,
    );

  if (
    index === null
  ) {
    return null;
  }

  return {
    ...round,
    initiativeIndex: index,
  };
}


// ---------------------------------------------------------------------------
// Round reset / next-Round helpers
// ---------------------------------------------------------------------------

/*
 * Returns the number that should be assigned to the next Round.
 *
 * The next Round itself must still be created through startRound() with:
 *
 * - fresh Action-capacity snapshots, and
 * - freshly generated Initiative results.
 *
 * This is important because Character state may have changed during the
 * completed Round.
 */
export function nextRoundNumber(
  round: CombatRound,
): number {
  return round.number + 1;
}