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
 * - generic contribution provenance (ContributionSourceRef)
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
 *
 * ── Who calls this ──────────────────────────────────────────────────────
 *
 * These are not standalone debugging utilities. character/validation.ts runs
 * findResolvedActionCapacityValidationIssues over every resolved character and
 * turns what it reports into engine diagnostics, so an unknown capacity kind,
 * a non-finite amount, a fractional Action contribution and a resolved
 * capacity that disagrees with the formulas are all rejected by ordinary
 * character validation rather than only by a caller who thought to ask.
 *
 * The AUTHORED half of the same question — a modifyActionCapacity Effect in a
 * catalog — is checked by rules/validation.ts, and it checks it with the
 * predicates below rather than with its own copy of the rule. One value must
 * not be judged two ways: an amount of 2.5 that authoring accepts and
 * resolution rejects is a character that validates as content and fails as a
 * character.
 */

import type {
  DiagnosticSubject,
  EngineError,
} from "../../../infrastructure/diagnostics";

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


/**
 * Whether a number is a legal Action-capacity contribution amount.
 *
 * Normal Action capacity is counted in whole Actions, so half an Action is not
 * a small bonus — it is a value the mechanic has no meaning for. Negative and
 * zero are both legal (penalties, and contributions that happen to cancel).
 *
 * Exported so rules/validation.ts can judge an AUTHORED
 * modifyActionCapacity amount by exactly this rule instead of its own weaker
 * one. Number.isInteger already rejects NaN and Infinity, so this is the
 * finiteness check too.
 */
export function isValidActionCapacityAmount(value: number): boolean {
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
 * `source` is deliberately not validated here. ContributionSourceRef
 * provenance is owned by infrastructure and stamped by the rules layer.
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

    if (contribution === undefined) continue;

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
        !isValidActionCapacityAmount(
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
      !isValidActionCapacityAmount(
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

/* -------------------------------------------------------------------------- */
/* Diagnostics                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One Action-capacity issue as an EngineError.
 *
 * The domain owns its own diagnostic wording, matching
 * foundation/body/validation.ts's toBodyEngineError — character/validation.ts
 * decides that a character has to satisfy these rules, not what they mean.
 *
 * Audience is "developer" throughout. Every one of these is either malformed
 * content crossing the engine boundary or the engine's own arithmetic
 * disagreeing with itself; neither is something a player can act on from a
 * character sheet.
 */
export function toActionCapacityEngineError(
  issue: ActionCapacityValidationIssue,
  subject?: DiagnosticSubject,
): EngineError {
  const at = subject !== undefined ? { subject } : {};

  switch (issue.type) {
    case "combat-ability-invalid":
      return {
        code: "character.actions.combat_ability_invalid",
        message:
          `Combat Ability resolved to ${issue.combatAbility}, which cannot derive whole Actions.`,
        audience: "developer",
        ...at,
        required: "finite whole number",
        actual: String(issue.combatAbility),
        resolution:
          "Check the Attributes and Effects feeding Combat Ability.",
      };

    case "action-capacity-contribution-kind-invalid":
      return {
        code: "character.actions.contribution_kind_invalid",
        message:
          `Action-capacity contribution ${issue.index} names an unknown capacity kind.`,
        audience: "developer",
        ...at,
        required: ACTION_CAPACITY_KINDS.join(", "),
        actual: String(issue.kind),
        resolution:
          'Set the Effect\'s capacity to "round", "turn" or "reaction".',
      };

    case "action-capacity-contribution-amount-invalid":
      return {
        code: "character.actions.contribution_amount_invalid",
        message:
          `Action-capacity contribution ${issue.index} (${issue.kind}) is ` +
          `${issue.amount}, which is not a whole number of Actions.`,
        audience: "developer",
        ...at,
        required: "whole number of Actions",
        actual: String(issue.amount),
        resolution:
          "Author modifyActionCapacity amounts as whole Actions.",
      };

    case "action-capacity-base-round-invalid":
    case "action-capacity-base-turn-invalid":
    case "action-capacity-base-reaction-invalid":
    case "action-capacity-round-invalid":
    case "action-capacity-turn-invalid":
    case "action-capacity-reaction-invalid":
      return {
        code: `character.actions.${issue.type.replace(/-/g, "_")}`,
        message:
          `Resolved Action capacity is structurally invalid (${issue.type}): ${issue.actual}.`,
        audience: "developer",
        ...at,
        actual: String(issue.actual),
        resolution:
          "Resolve Action capacity through resolveActionCapacity rather than constructing it by hand.",
      };

    case "action-capacity-base-round-mismatch":
    case "action-capacity-base-turn-mismatch":
    case "action-capacity-base-reaction-mismatch":
    case "action-capacity-round-mismatch":
    case "action-capacity-turn-mismatch":
    case "action-capacity-reaction-mismatch":
      return {
        code: `character.actions.${issue.type.replace(/-/g, "_")}`,
        message:
          `Resolved Action capacity disagrees with the mechanic's own ` +
          `formula (${issue.type}): expected ${issue.expected}, got ${issue.actual}.`,
        audience: "developer",
        ...at,
        required: String(issue.expected),
        actual: String(issue.actual),
        resolution:
          "Resolve Action capacity through resolveActionCapacity rather than constructing it by hand.",
      };
  }
}
