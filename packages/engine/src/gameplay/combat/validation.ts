/*
 * Structural validation for Combat runtime state.
 *
 * Combat validation checks whether an encounter and its current Round are
 * internally coherent. It does NOT advance Combat, repair invalid state, or
 * determine whether a Skill/check itself was legal.
 *
 * Several apparently unusual states are intentionally valid:
 *
 * - A Turn or Reaction may remain active after the acting combatant reaches
 *   0 remaining Round Actions. The Action that exhausted the pool may still
 *   need to finish resolving before the state is settled.
 *
 * - A Turn may remain active after reaching its Action cap for the same
 *   reason: Reaction opportunities from the final Action may still need to
 *   resolve.
 *
 * - An incomplete Round may temporarily have activeState === null between
 *   state transitions.
 *
 * Validation therefore focuses on structural invariants rather than trying
 * to infer where the caller "should" currently be in the lifecycle.
 */

import type {
  ActiveCombatState,
  Combat,
  CombatantId,
  CombatantRoundState,
  CombatRound,
  ReactionState,
  TurnState,
} from "./types";

import {
  findInitiativeEntryIssues,
  findInitiativeTieIssues,
} from "./initiative";


// ---------------------------------------------------------------------------
// Validation issue vocabulary
// ---------------------------------------------------------------------------

export const COMBAT_VALIDATION_ISSUE_CODES = [
  "combat.combatants.empty",
  "combat.combatant-id.empty",
  "combat.combatant-id.duplicate",

  "combat.round.number-invalid",
  "combat.round.combatants.empty",
  "combat.round.combatant-id.empty",
  "combat.round.combatant-id.duplicate",

  "combat.round.combatant-missing",
  "combat.round.combatant-unknown",

  "combat.round.capacity.round-invalid",
  "combat.round.capacity.turn-invalid",
  "combat.round.capacity.reaction-invalid",
  "combat.round.remaining-actions-invalid",

  "combat.round.initiative.combatants-empty",
  "combat.round.initiative.combatant-id-duplicate",
  "combat.round.initiative.entry-combatant-duplicate",
  "combat.round.initiative.entry-combatant-unknown",
  "combat.round.initiative.entry-combatant-missing",
  "combat.round.initiative.entry-value-invalid",
  "combat.round.initiative.tie",
  "combat.round.initiative.unsorted",
  "combat.round.initiative-index.invalid",

  "combat.round.turn.combatant-unknown",
  "combat.round.turn.initiative-mismatch",
  "combat.round.turn.action-cap-invalid",
  "combat.round.turn.action-cap-mismatch",
  "combat.round.turn.actions-spent-invalid",
  "combat.round.turn.actions-spent-impossible",

  "combat.round.reaction.reacting-combatant-unknown",
  "combat.round.reaction.triggering-combatant-unknown",
  "combat.round.reaction.self-reaction",
  "combat.round.reaction.initiative-mismatch",
  "combat.round.reaction.action-cap-invalid",
  "combat.round.reaction.action-cap-mismatch",
  "combat.round.reaction.actions-spent-invalid",
  "combat.round.reaction.actions-spent-impossible",
  "combat.round.reaction.triggering-action-id-empty",
] as const;

export type CombatValidationIssueCode =
  typeof COMBAT_VALIDATION_ISSUE_CODES[number];


export interface CombatValidationIssue {
  readonly code: CombatValidationIssueCode;

  readonly message: string;

  readonly combatantIds?: readonly CombatantId[];
}


// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function isPositiveWholeNumber(
  value: number,
): boolean {
  return (
    Number.isInteger(value) &&
    value > 0
  );
}


function findDuplicateIds(
  ids: readonly CombatantId[],
): readonly CombatantId[] {
  const counts =
    new Map<CombatantId, number>();

  for (const id of ids) {
    counts.set(
      id,
      (counts.get(id) ?? 0) + 1,
    );
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
}


function findRoundCombatant(
  round: CombatRound,
  combatantId: CombatantId,
): CombatantRoundState | undefined {
  return round.combatants.find(
    (combatant) =>
      combatant.combatantId ===
      combatantId,
  );
}


function currentInitiativeCombatantId(
  round: CombatRound,
): CombatantId | null {
  if (
    !Number.isInteger(
      round.initiativeIndex,
    ) ||
    round.initiativeIndex < 0 ||
    round.initiativeIndex >=
      round.initiative.length
  ) {
    return null;
  }

  return (
    round.initiative[
      round.initiativeIndex
    ]?.combatantId ?? null
  );
}


// ---------------------------------------------------------------------------
// Combatant Round-state validation
// ---------------------------------------------------------------------------

export function findCombatantRoundStateValidationIssues(
  combatant: CombatantRoundState,
): readonly CombatValidationIssue[] {
  const issues: CombatValidationIssue[] = [];

  if (
    combatant.combatantId.trim().length === 0
  ) {
    issues.push({
      code:
        "combat.round.combatant-id.empty",
      message:
        "Round combatant id cannot be empty.",
      combatantIds: [
        combatant.combatantId,
      ],
    });
  }

  if (
    !isPositiveWholeNumber(
      combatant.capacity.round,
    )
  ) {
    issues.push({
      code:
        "combat.round.capacity.round-invalid",
      message:
        "Round Action capacity must be a positive whole number.",
      combatantIds: [
        combatant.combatantId,
      ],
    });
  }

  if (
    !isPositiveWholeNumber(
      combatant.capacity.turn,
    )
  ) {
    issues.push({
      code:
        "combat.round.capacity.turn-invalid",
      message:
        "Turn Action capacity must be a positive whole number.",
      combatantIds: [
        combatant.combatantId,
      ],
    });
  }

  if (
    !isPositiveWholeNumber(
      combatant.capacity.reaction,
    )
  ) {
    issues.push({
      code:
        "combat.round.capacity.reaction-invalid",
      message:
        "Reaction Action capacity must be a positive whole number.",
      combatantIds: [
        combatant.combatantId,
      ],
    });
  }

  if (
    !Number.isInteger(
      combatant.remainingActions,
    ) ||
    combatant.remainingActions < 0 ||
    combatant.remainingActions >
      combatant.capacity.round
  ) {
    issues.push({
      code:
        "combat.round.remaining-actions-invalid",
      message:
        "Remaining Round Actions must be a whole number from 0 through the combatant's Round Action capacity.",
      combatantIds: [
        combatant.combatantId,
      ],
    });
  }

  return issues;
}


// ---------------------------------------------------------------------------
// Initiative validation
// ---------------------------------------------------------------------------

function findMappedInitiativeIssues(
  round: CombatRound,
): readonly CombatValidationIssue[] {
  const combatantIds =
    round.combatants.map(
      (combatant) =>
        combatant.combatantId,
    );

  const initiativeIssues = [
    ...findInitiativeEntryIssues(
      combatantIds,
      round.initiative,
    ),
    ...findInitiativeTieIssues(
      round.initiative,
    ),
  ];

  return initiativeIssues.map(
    (issue): CombatValidationIssue => {
      switch (issue.code) {
        case "combatants-empty":
          return {
            code:
              "combat.round.initiative.combatants-empty",
            message: issue.message,
            combatantIds:
              issue.combatantIds,
          };

        case "combatant-id-duplicate":
          return {
            code:
              "combat.round.initiative.combatant-id-duplicate",
            message: issue.message,
            combatantIds:
              issue.combatantIds,
          };

        case "entry-combatant-duplicate":
          return {
            code:
              "combat.round.initiative.entry-combatant-duplicate",
            message: issue.message,
            combatantIds:
              issue.combatantIds,
          };

        case "entry-combatant-unknown":
          return {
            code:
              "combat.round.initiative.entry-combatant-unknown",
            message: issue.message,
            combatantIds:
              issue.combatantIds,
          };

        case "entry-combatant-missing":
          return {
            code:
              "combat.round.initiative.entry-combatant-missing",
            message: issue.message,
            combatantIds:
              issue.combatantIds,
          };

        case "entry-value-invalid":
          return {
            code:
              "combat.round.initiative.entry-value-invalid",
            message: issue.message,
            combatantIds:
              issue.combatantIds,
          };

        case "initiative-tie":
          return {
            code:
              "combat.round.initiative.tie",
            message: issue.message,
            combatantIds:
              issue.combatantIds,
          };
      }
    },
  );
}


/*
 * A resolved InitiativeOrder must already be sorted from highest value to
 * lowest value.
 */
export function isInitiativeOrderSorted(
  round: CombatRound,
): boolean {
  for (
    let index = 1;
    index < round.initiative.length;
    index += 1
  ) {
    const previous =
      round.initiative[index - 1];

    const current =
      round.initiative[index];

    if (
      previous === undefined ||
      current === undefined
    ) {
      return false;
    }

    if (
      previous.value <
      current.value
    ) {
      return false;
    }
  }

  return true;
}


export function findInitiativeValidationIssues(
  round: CombatRound,
): readonly CombatValidationIssue[] {
  const issues: CombatValidationIssue[] = [
    ...findMappedInitiativeIssues(
      round,
    ),
  ];

  if (
    !isInitiativeOrderSorted(
      round,
    )
  ) {
    issues.push({
      code:
        "combat.round.initiative.unsorted",
      message:
        "Initiative order must be sorted from highest Initiative value to lowest.",
    });
  }

  if (
    !Number.isInteger(
      round.initiativeIndex,
    ) ||
    round.initiativeIndex < 0 ||
    round.initiativeIndex >=
      round.initiative.length
  ) {
    issues.push({
      code:
        "combat.round.initiative-index.invalid",
      message:
        "The Round Initiative index must reference a valid Initiative entry.",
    });
  }

  return issues;
}


// ---------------------------------------------------------------------------
// Turn-state validation
// ---------------------------------------------------------------------------

export function findTurnStateValidationIssues(
  turn: TurnState,
  round: CombatRound,
): readonly CombatValidationIssue[] {
  const issues: CombatValidationIssue[] = [];

  const combatant =
    findRoundCombatant(
      round,
      turn.combatantId,
    );

  if (combatant === undefined) {
    issues.push({
      code:
        "combat.round.turn.combatant-unknown",
      message:
        "The active Turn belongs to a combatant who is not present in the Round.",
      combatantIds: [
        turn.combatantId,
      ],
    });

    return issues;
  }

  const initiativeCombatantId =
    currentInitiativeCombatantId(
      round,
    );

  if (
    initiativeCombatantId !==
    turn.combatantId
  ) {
    issues.push({
      code:
        "combat.round.turn.initiative-mismatch",
      message:
        "The active Turn combatant must match the Round's current Initiative position.",
      combatantIds: [
        turn.combatantId,
      ],
    });
  }

  if (
    !isPositiveWholeNumber(
      turn.actionCap,
    )
  ) {
    issues.push({
      code:
        "combat.round.turn.action-cap-invalid",
      message:
        "Turn Action cap must be a positive whole number.",
      combatantIds: [
        turn.combatantId,
      ],
    });
  }

  if (
    turn.actionCap !==
    combatant.capacity.turn
  ) {
    issues.push({
      code:
        "combat.round.turn.action-cap-mismatch",
      message:
        "The active Turn Action cap must match the combatant's snapshotted Turn Action capacity for the Round.",
      combatantIds: [
        turn.combatantId,
      ],
    });
  }

  if (
    !Number.isInteger(
      turn.actionsSpent,
    ) ||
    turn.actionsSpent < 0 ||
    turn.actionsSpent >
      turn.actionCap
  ) {
    issues.push({
      code:
        "combat.round.turn.actions-spent-invalid",
      message:
        "Turn Actions spent must be a whole number from 0 through the Turn Action cap.",
      combatantIds: [
        turn.combatantId,
      ],
    });
  }

  /*
   * Current-state expenditure cannot exceed total expenditure for the
   * entire Round.
   *
   * Example:
   *
   *   Round capacity:       6
   *   remaining Actions:    5
   *   total Actions spent:  1
   *
   * A Turn claiming actionsSpent = 2 would therefore be impossible.
   */
  const totalRoundActionsSpent =
    combatant.capacity.round -
    combatant.remainingActions;

  if (
    Number.isInteger(
      turn.actionsSpent,
    ) &&
    turn.actionsSpent >
      totalRoundActionsSpent
  ) {
    issues.push({
      code:
        "combat.round.turn.actions-spent-impossible",
      message:
        "The active Turn cannot contain more spent Actions than the combatant has spent during the Round overall.",
      combatantIds: [
        turn.combatantId,
      ],
    });
  }

  return issues;
}


// ---------------------------------------------------------------------------
// Reaction-state validation
// ---------------------------------------------------------------------------

export function findReactionStateValidationIssues(
  reaction: ReactionState,
  round: CombatRound,
): readonly CombatValidationIssue[] {
  const issues: CombatValidationIssue[] = [];

  const reactingCombatant =
    findRoundCombatant(
      round,
      reaction.reactingCombatantId,
    );

  const triggeringCombatant =
    findRoundCombatant(
      round,
      reaction.triggeringCombatantId,
    );

  if (
    reactingCombatant === undefined
  ) {
    issues.push({
      code:
        "combat.round.reaction.reacting-combatant-unknown",
      message:
        "The active Reaction belongs to a combatant who is not present in the Round.",
      combatantIds: [
        reaction.reactingCombatantId,
      ],
    });
  }

  if (
    triggeringCombatant === undefined
  ) {
    issues.push({
      code:
        "combat.round.reaction.triggering-combatant-unknown",
      message:
        "The active Reaction references a triggering combatant who is not present in the Round.",
      combatantIds: [
        reaction.triggeringCombatantId,
      ],
    });
  }

  if (
    reaction.reactingCombatantId ===
    reaction.triggeringCombatantId
  ) {
    issues.push({
      code:
        "combat.round.reaction.self-reaction",
      message:
        "A combatant cannot open a Reaction against their own triggering Action.",
      combatantIds: [
        reaction.reactingCombatantId,
      ],
    });
  }

  /*
   * During Reaction, initiativeIndex deliberately remains on the combatant
   * whose Turn was interrupted.
   *
   * It must NOT point to the reacting combatant unless that happens to be
   * the same id, which self-Reaction validation already rejects.
   */
  const initiativeCombatantId =
    currentInitiativeCombatantId(
      round,
    );

  if (
    initiativeCombatantId !==
    reaction.triggeringCombatantId
  ) {
    issues.push({
      code:
        "combat.round.reaction.initiative-mismatch",
      message:
        "During a Reaction, the Round Initiative position must remain on the combatant whose Turn was interrupted.",
      combatantIds: [
        reaction.triggeringCombatantId,
        reaction.reactingCombatantId,
      ],
    });
  }

  if (
    reaction.triggeringActionId.trim()
      .length === 0
  ) {
    issues.push({
      code:
        "combat.round.reaction.triggering-action-id-empty",
      message:
        "An active Reaction must reference the Action that triggered it.",
      combatantIds: [
        reaction.triggeringCombatantId,
        reaction.reactingCombatantId,
      ],
    });
  }

  if (
    !isPositiveWholeNumber(
      reaction.actionCap,
    )
  ) {
    issues.push({
      code:
        "combat.round.reaction.action-cap-invalid",
      message:
        "Reaction Action cap must be a positive whole number.",
      combatantIds: [
        reaction.reactingCombatantId,
      ],
    });
  }

  if (
    reactingCombatant !== undefined &&
    reaction.actionCap !==
      reactingCombatant.capacity.reaction
  ) {
    issues.push({
      code:
        "combat.round.reaction.action-cap-mismatch",
      message:
        "The active Reaction Action cap must match the reacting combatant's snapshotted Reaction Action capacity for the Round.",
      combatantIds: [
        reaction.reactingCombatantId,
      ],
    });
  }

  if (
    !Number.isInteger(
      reaction.actionsSpent,
    ) ||
    reaction.actionsSpent < 0 ||
    reaction.actionsSpent >
      reaction.actionCap
  ) {
    issues.push({
      code:
        "combat.round.reaction.actions-spent-invalid",
      message:
        "Reaction Actions spent must be a whole number from 0 through the Reaction Action cap.",
      combatantIds: [
        reaction.reactingCombatantId,
      ],
    });
  }

  if (
    reactingCombatant !== undefined
  ) {
    const totalRoundActionsSpent =
      reactingCombatant.capacity.round -
      reactingCombatant.remainingActions;

    if (
      Number.isInteger(
        reaction.actionsSpent,
      ) &&
      reaction.actionsSpent >
        totalRoundActionsSpent
    ) {
      issues.push({
        code:
          "combat.round.reaction.actions-spent-impossible",
        message:
          "The active Reaction cannot contain more spent Actions than the reacting combatant has spent during the Round overall.",
        combatantIds: [
          reaction.reactingCombatantId,
        ],
      });
    }
  }

  return issues;
}


// ---------------------------------------------------------------------------
// Active-state validation
// ---------------------------------------------------------------------------

export function findActiveCombatStateValidationIssues(
  state: ActiveCombatState,
  round: CombatRound,
): readonly CombatValidationIssue[] {
  switch (state.kind) {
    case "turn":
      return findTurnStateValidationIssues(
        state,
        round,
      );

    case "reaction":
      return findReactionStateValidationIssues(
        state,
        round,
      );
  }
}


// ---------------------------------------------------------------------------
// Round validation
// ---------------------------------------------------------------------------

export function findCombatRoundValidationIssues(
  round: CombatRound,
  expectedCombatantIds?: readonly CombatantId[],
): readonly CombatValidationIssue[] {
  const issues: CombatValidationIssue[] = [];

  if (
    !Number.isInteger(
      round.number,
    ) ||
    round.number <= 0
  ) {
    issues.push({
      code:
        "combat.round.number-invalid",
      message:
        "Combat Round number must be a positive whole number.",
    });
  }

  if (
    round.combatants.length === 0
  ) {
    issues.push({
      code:
        "combat.round.combatants.empty",
      message:
        "A Combat Round must contain at least one combatant.",
    });
  }

  const roundCombatantIds =
    round.combatants.map(
      (combatant) =>
        combatant.combatantId,
    );

  const duplicateRoundIds =
    findDuplicateIds(
      roundCombatantIds,
    );

  if (
    duplicateRoundIds.length > 0
  ) {
    issues.push({
      code:
        "combat.round.combatant-id.duplicate",
      message:
        "A combatant may appear only once in a Combat Round.",
      combatantIds:
        duplicateRoundIds,
    });
  }

  for (const combatant of round.combatants) {
    issues.push(
      ...findCombatantRoundStateValidationIssues(
        combatant,
      ),
    );
  }

  /*
   * When validating a Round as part of a Combat encounter, ensure the
   * encounter participant set and Round participant set still agree.
   */
  if (
    expectedCombatantIds !== undefined
  ) {
    const expected =
      new Set(
        expectedCombatantIds,
      );

    const actual =
      new Set(
        roundCombatantIds,
      );

    const missing =
      expectedCombatantIds.filter(
        (id) => !actual.has(id),
      );

    if (
      missing.length > 0
    ) {
      issues.push({
        code:
          "combat.round.combatant-missing",
        message:
          "Every Combat participant must be represented in the active Round.",
        combatantIds: missing,
      });
    }

    const unknown =
      roundCombatantIds.filter(
        (id) => !expected.has(id),
      );

    if (
      unknown.length > 0
    ) {
      issues.push({
        code:
          "combat.round.combatant-unknown",
        message:
          "The active Round contains combatants who are not participants in the Combat encounter.",
        combatantIds: unknown,
      });
    }
  }

  issues.push(
    ...findInitiativeValidationIssues(
      round,
    ),
  );

  if (
    round.activeState !== null
  ) {
    issues.push(
      ...findActiveCombatStateValidationIssues(
        round.activeState,
        round,
      ),
    );
  }

  return issues;
}


// ---------------------------------------------------------------------------
// Encounter validation
// ---------------------------------------------------------------------------

export function findCombatValidationIssues(
  combat: Combat,
): readonly CombatValidationIssue[] {
  const issues: CombatValidationIssue[] = [];

  if (
    combat.combatantIds.length === 0
  ) {
    issues.push({
      code:
        "combat.combatants.empty",
      message:
        "Combat must contain at least one combatant.",
    });
  }

  const emptyIds =
    combat.combatantIds.filter(
      (id) =>
        id.trim().length === 0,
    );

  if (
    emptyIds.length > 0
  ) {
    issues.push({
      code:
        "combat.combatant-id.empty",
      message:
        "Combatant ids cannot be empty.",
      combatantIds: emptyIds,
    });
  }

  const duplicateIds =
    findDuplicateIds(
      combat.combatantIds,
    );

  if (
    duplicateIds.length > 0
  ) {
    issues.push({
      code:
        "combat.combatant-id.duplicate",
      message:
        "A combatant may appear only once in a Combat encounter.",
      combatantIds:
        duplicateIds,
    });
  }

  if (
    combat.round !== null
  ) {
    issues.push(
      ...findCombatRoundValidationIssues(
        combat.round,
        combat.combatantIds,
      ),
    );
  }

  return issues;
}


// ---------------------------------------------------------------------------
// Convenience predicates
// ---------------------------------------------------------------------------

export function isCombatRoundValid(
  round: CombatRound,
  expectedCombatantIds?: readonly CombatantId[],
): boolean {
  return (
    findCombatRoundValidationIssues(
      round,
      expectedCombatantIds,
    ).length === 0
  );
}


export function isCombatValid(
  combat: Combat,
): boolean {
  return (
    findCombatValidationIssues(
      combat,
    ).length === 0
  );
}