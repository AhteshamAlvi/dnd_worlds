/*
 * Character Action-capacity validation.
 *
 * This file validates only invariants owned by the Action-capacity mechanic.
 *
 * It does NOT revalidate:
 *
 * - Attributes or Derived Attribute formulas
 * - Traits
 * - Skills
 * - Techniques
 * - Equipment
 * - Conditions
 * - generic RuleSourceRef provenance
 *
 * Those concerns belong to their own domains.
 *
 * Action validation is responsible for:
 *
 * - Combat Ability being usable as an Action-capacity input;
 * - Action-capacity contribution kinds being recognized;
 * - contribution amounts being whole Actions;
 * - resolved capacities being structurally valid;
 * - a ResolvedActionCapacity actually agreeing with the mechanic's
 *   authoritative resolution rules.
 *
 * Combat Ability is deliberately NOT restricted to 1-30 here.
 *
 * The ordinary game range is 1-30, but Derived Attributes are resolved
 * values and may move outside that range through character effects.
 * Action-capacity resolution already handles that safely:
 *
 * - values below 5 derive 0 Round Actions;
 * - values above 30 remain capped at 10 stat-derived Round Actions.
 */

import {
  ACTION_CAPACITY_KINDS,
  type ActionCapacityContribution,
  type ActionCapacityKind,
  type ResolvedActionCapacity,
} from "./types";

import {
  MIN_REACTION_ACTION_CAPACITY,
  MIN_TURN_ACTION_CAPACITY,
  deriveBaseReactionActionCapacity,
  deriveBaseRoundActionCapacity,
  deriveBaseTurnActionCapacity,
  resolveActionCapacity,
} from "./resolution";


/* -------------------------------------------------------------------------- */
/* Validation issue vocabulary                                                */
/* -------------------------------------------------------------------------- */

export type ActionCapacityValidationIssue =
  | {
      readonly type: "combat-ability-invalid";
      readonly combatAbility: number;
    }
  | {
      readonly type: "action-capacity-contribution-kind-invalid";
      readonly index: number;
      readonly kind: unknown;
    }
  | {
      readonly type: "action-capacity-contribution-amount-invalid";
      readonly index: number;
      readonly kind: ActionCapacityKind;
      readonly amount: number;
    }
  | {
      readonly type: "action-capacity-base-round-invalid";
      readonly actual: number;
    }
  | {
      readonly type: "action-capacity-base-turn-invalid";
      readonly actual: number;
    }
  | {
      readonly type: "action-capacity-base-reaction-invalid";
      readonly actual: number;
    }
  | {
      readonly type: "action-capacity-round-invalid";
      readonly actual: number;
    }
  | {
      readonly type: "action-capacity-turn-invalid";
      readonly actual: number;
    }
  | {
      readonly type: "action-capacity-reaction-invalid";
      readonly actual: number;
    }
  | {
      readonly type: "action-capacity-base-round-mismatch";
      readonly expected: number;
      readonly actual: number;
    }
  | {
      readonly type: "action-capacity-base-turn-mismatch";
      readonly expected: number;
      readonly actual: number;
    }
  | {
      readonly type: "action-capacity-base-reaction-mismatch";
      readonly expected: number;
      readonly actual: number;
    }
  | {
      readonly type: "action-capacity-round-mismatch";
      readonly expected: number;
      readonly actual: number;
    }
  | {
      readonly type: "action-capacity-turn-mismatch";
      readonly expected: number;
      readonly actual: number;
    }
  | {
      readonly type: "action-capacity-reaction-mismatch";
      readonly expected: number;
      readonly actual: number;
    };


/* -------------------------------------------------------------------------- */
/* Primitive validation helpers                                               */
/* -------------------------------------------------------------------------- */

function isWholeNumber(value: number): boolean {
  return Number.isInteger(value);
}


function isNonNegativeWholeNumber(
  value: number,
): boolean {
  return (
    Number.isInteger(value) &&
    value >= 0
  );
}


function isKnownActionCapacityKind(
  value: unknown,
): value is ActionCapacityKind {
  return (
    typeof value === "string" &&
    (
      ACTION_CAPACITY_KINDS as readonly string[]
    ).includes(value)
  );
}


/* -------------------------------------------------------------------------- */
/* Combat Ability validation                                                  */
/* -------------------------------------------------------------------------- */

/*
 * Combat Ability must be a finite whole number because Action capacities
 * ultimately resolve into whole Actions.
 *
 * It is intentionally not range-limited here.
 */
export function findCombatAbilityActionIssues(
  combatAbility: number,
): readonly ActionCapacityValidationIssue[] {
  if (
    !Number.isFinite(combatAbility) ||
    !Number.isInteger(combatAbility)
  ) {
    return [
      {
        type: "combat-ability-invalid",
        combatAbility,
      },
    ];
  }

  return [];
}


/* -------------------------------------------------------------------------- */
/* Contribution validation                                                    */
/* -------------------------------------------------------------------------- */

/*
 * Checks the Action-specific portion of capacity contributions.
 *
 * `source` is deliberately not validated here. RuleSourceRef provenance is
 * owned by the generic rules layer.
 *
 * Negative contributions are legal. They may represent penalties from
 * Conditions, Injuries, Traits, Equipment, or other effectful content.
 *
 * Zero is also legal, even though it has no numerical effect.
 *
 * Fractional contributions are not legal because normal Action capacity is
 * counted in whole Actions.
 */
export function findActionCapacityContributionIssues(
  contributions: readonly ActionCapacityContribution[],
): readonly ActionCapacityValidationIssue[] {
  const issues: ActionCapacityValidationIssue[] = [];

  for (
    let index = 0;
    index < contributions.length;
    index += 1
  ) {
    const contribution =
      contributions[index];

    /*
     * TypeScript normally guarantees this, but runtime/homebrew content may
     * still cross the engine boundary with malformed data.
     */
    if (
      !isKnownActionCapacityKind(
        contribution.kind,
      )
    ) {
      issues.push({
        type:
          "action-capacity-contribution-kind-invalid",
        index,
        kind: contribution.kind,
      });

      /*
       * The amount can still be checked independently, but the malformed
       * kind cannot safely be exposed as ActionCapacityKind below.
       */
      if (
        !Number.isInteger(
          contribution.amount,
        )
      ) {
        issues.push({
          type:
            "action-capacity-contribution-amount-invalid",
          index,
          /*
           * This field is only meaningful for known kinds, so skip creating
           * the amount issue here rather than inventing a valid kind.
           */
          kind: "round",
          amount: contribution.amount,
        });
      }

      continue;
    }

    if (
      !Number.isInteger(
        contribution.amount,
      )
    ) {
      issues.push({
        type:
          "action-capacity-contribution-amount-invalid",
        index,
        kind: contribution.kind,
        amount: contribution.amount,
      });
    }
  }

  return issues;
}


/* -------------------------------------------------------------------------- */
/* Resolution-input validation                                                */
/* -------------------------------------------------------------------------- */

/*
 * Complete validation for the inputs consumed by resolveActionCapacity().
 */
export function findActionCapacityInputIssues(
  combatAbility: number,
  contributions: readonly ActionCapacityContribution[],
): readonly ActionCapacityValidationIssue[] {
  return [
    ...findCombatAbilityActionIssues(
      combatAbility,
    ),
    ...findActionCapacityContributionIssues(
      contributions,
    ),
  ];
}


/* -------------------------------------------------------------------------- */
/* Structural resolved-value validation                                       */
/* -------------------------------------------------------------------------- */

function findResolvedCapacityShapeIssues(
  resolved: ResolvedActionCapacity,
): readonly ActionCapacityValidationIssue[] {
  const issues: ActionCapacityValidationIssue[] = [];

  /*
   * Base Round may legitimately be zero.
   */
  if (
    !isNonNegativeWholeNumber(
      resolved.baseRound,
    )
  ) {
    issues.push({
      type:
        "action-capacity-base-round-invalid",
      actual: resolved.baseRound,
    });
  }

  if (
    !isWholeNumber(
      resolved.baseTurn,
    ) ||
    resolved.baseTurn <
      MIN_TURN_ACTION_CAPACITY
  ) {
    issues.push({
      type:
        "action-capacity-base-turn-invalid",
      actual: resolved.baseTurn,
    });
  }

  if (
    !isWholeNumber(
      resolved.baseReaction,
    ) ||
    resolved.baseReaction <
      MIN_REACTION_ACTION_CAPACITY
  ) {
    issues.push({
      type:
        "action-capacity-base-reaction-invalid",
      actual: resolved.baseReaction,
    });
  }

  /*
   * Final Round capacity may also legitimately be zero.
   */
  if (
    !isNonNegativeWholeNumber(
      resolved.capacity.round,
    )
  ) {
    issues.push({
      type:
        "action-capacity-round-invalid",
      actual:
        resolved.capacity.round,
    });
  }

  if (
    !isWholeNumber(
      resolved.capacity.turn,
    ) ||
    resolved.capacity.turn <
      MIN_TURN_ACTION_CAPACITY
  ) {
    issues.push({
      type:
        "action-capacity-turn-invalid",
      actual:
        resolved.capacity.turn,
    });
  }

  if (
    !isWholeNumber(
      resolved.capacity.reaction,
    ) ||
    resolved.capacity.reaction <
      MIN_REACTION_ACTION_CAPACITY
  ) {
    issues.push({
      type:
        "action-capacity-reaction-invalid",
      actual:
        resolved.capacity.reaction,
    });
  }

  return issues;
}


/* -------------------------------------------------------------------------- */
/* Resolution consistency                                                     */
/* -------------------------------------------------------------------------- */

/*
 * Confirms that an already-resolved Action-capacity result agrees with the
 * authoritative formulas in resolution.ts.
 *
 * This is useful for character validation, debugging, persistence boundaries,
 * and any host that receives a previously constructed ResolvedActionCapacity
 * rather than calling resolveActionCapacity() immediately itself.
 *
 * It also verifies the important Reaction ordering rule:
 *
 *   resolve Turn
 *       ↓
 *   derive base Reaction from RESOLVED Turn
 *       ↓
 *   apply Reaction-specific contributions
 */
export function findResolvedActionCapacityConsistencyIssues(
  resolved: ResolvedActionCapacity,
): readonly ActionCapacityValidationIssue[] {
  const issues: ActionCapacityValidationIssue[] = [];

  const inputIssues =
    findActionCapacityInputIssues(
      resolved.combatAbility,
      resolved.contributions,
    );

  /*
   * Do not attempt to prove formula consistency from malformed inputs.
   * Those problems are already reported directly.
   */
  if (inputIssues.length > 0) {
    return inputIssues;
  }

  const expectedBaseRound =
    deriveBaseRoundActionCapacity(
      resolved.combatAbility,
    );

  if (
    resolved.baseRound !==
    expectedBaseRound
  ) {
    issues.push({
      type:
        "action-capacity-base-round-mismatch",
      expected:
        expectedBaseRound,
      actual:
        resolved.baseRound,
    });
  }


  const expectedBaseTurn =
    deriveBaseTurnActionCapacity();

  if (
    resolved.baseTurn !==
    expectedBaseTurn
  ) {
    issues.push({
      type:
        "action-capacity-base-turn-mismatch",
      expected:
        expectedBaseTurn,
      actual:
        resolved.baseTurn,
    });
  }


  /*
   * baseReaction is derived from the final Turn capacity rather than the
   * unmodified baseTurn.
   */
  const expectedBaseReaction =
    deriveBaseReactionActionCapacity(
      resolved.capacity.turn,
    );

  if (
    resolved.baseReaction !==
    expectedBaseReaction
  ) {
    issues.push({
      type:
        "action-capacity-base-reaction-mismatch",
      expected:
        expectedBaseReaction,
      actual:
        resolved.baseReaction,
    });
  }


  /*
   * Re-run the authoritative complete resolver to verify all three final
   * capacities.
   */
  const expected =
    resolveActionCapacity(
      resolved.combatAbility,
      resolved.contributions,
    );

  if (
    resolved.capacity.round !==
    expected.capacity.round
  ) {
    issues.push({
      type:
        "action-capacity-round-mismatch",
      expected:
        expected.capacity.round,
      actual:
        resolved.capacity.round,
    });
  }

  if (
    resolved.capacity.turn !==
    expected.capacity.turn
  ) {
    issues.push({
      type:
        "action-capacity-turn-mismatch",
      expected:
        expected.capacity.turn,
      actual:
        resolved.capacity.turn,
    });
  }

  if (
    resolved.capacity.reaction !==
    expected.capacity.reaction
  ) {
    issues.push({
      type:
        "action-capacity-reaction-mismatch",
      expected:
        expected.capacity.reaction,
      actual:
        resolved.capacity.reaction,
    });
  }

  return issues;
}


/* -------------------------------------------------------------------------- */
/* Complete resolved validation                                               */
/* -------------------------------------------------------------------------- */

/*
 * Complete validation of a ResolvedActionCapacity:
 *
 * 1. validate mechanic inputs,
 * 2. validate the structural shape of the resolved values,
 * 3. verify that every base/final value agrees with the authoritative
 *    Action-capacity calculation.
 */
export function findResolvedActionCapacityValidationIssues(
  resolved: ResolvedActionCapacity,
): readonly ActionCapacityValidationIssue[] {
  const inputIssues =
    findActionCapacityInputIssues(
      resolved.combatAbility,
      resolved.contributions,
    );

  const shapeIssues =
    findResolvedCapacityShapeIssues(
      resolved,
    );

  /*
   * Consistency resolution assumes valid inputs.
   */
  const consistencyIssues =
    inputIssues.length === 0
      ? findResolvedActionCapacityConsistencyIssues(
          resolved,
        )
      : [];

  return [
    ...inputIssues,
    ...shapeIssues,
    ...consistencyIssues,
  ];
}


/* -------------------------------------------------------------------------- */
/* Convenience predicates                                                     */
/* -------------------------------------------------------------------------- */

export function isActionCapacityInputValid(
  combatAbility: number,
  contributions: readonly ActionCapacityContribution[],
): boolean {
  return (
    findActionCapacityInputIssues(
      combatAbility,
      contributions,
    ).length === 0
  );
}


export function isResolvedActionCapacityValid(
  resolved: ResolvedActionCapacity,
): boolean {
  return (
    findResolvedActionCapacityValidationIssues(
      resolved,
    ).length === 0
  );
}