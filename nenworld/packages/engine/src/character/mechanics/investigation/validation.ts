/*
 * Validation for the Investigation subsystem.
 *
 * This file validates values consumed by Investigation mechanics without
 * performing Investigation calculations or resolution itself.
 *
 * This file validates:
 *
 * - inherent Investigation state;
 * - resolved Investigation state;
 * - INT/WIS/PER modifiers;
 * - Investigation-specific modifiers;
 * - active d20 rolls;
 * - Investigation Difficulty Classes.
 *
 * It does NOT validate:
 *
 * - Investigation score calculations;
 * - whether an Investigation succeeds;
 * - Detection;
 * - environmental eligibility;
 * - clue availability;
 * - whether a character has enough information to investigate;
 * - attribute-modifier derivation.
 *
 * These functions return issues rather than EngineResults. Higher-level engine
 * validation may later translate these issues into EngineErrors.
 */

import type {
  InherentInvestigation,
  ResolvedInvestigation,
} from "./types";

import type {
  ActiveInvestigationInput,
  InvestigationModifierInput,
  PassiveInvestigationInput,
} from "./investigation";


/* -------------------------------------------------------------------------- */
/* Issues                                                                     */
/* -------------------------------------------------------------------------- */

export type InvestigationValidationIssue =
  | {
      readonly type: "invalid-investigation-modifier";
      readonly modifier: number;
    }
  | {
      readonly type: "invalid-intelligence-modifier";
      readonly modifier: number;
    }
  | {
      readonly type: "invalid-wisdom-modifier";
      readonly modifier: number;
    }
  | {
      readonly type: "invalid-perception-modifier";
      readonly modifier: number;
    }
  | {
      readonly type: "invalid-d20-roll";
      readonly roll: number;
    }
  | {
      readonly type: "invalid-investigation-difficulty-class";
      readonly difficultyClass: number;
    };


/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A d20 result must represent an actual face of the die.
 */
export function isValidInvestigationD20Roll(
  roll: number,
): boolean {
  return (
    Number.isFinite(roll)
    && Number.isInteger(roll)
    && roll >= 1
    && roll <= 20
  );
}


/**
 * Investigation Difficulty Classes must be finite integers of at least 0.
 *
 * The upper bound is intentionally unrestricted so unusual mechanics may
 * create extremely difficult Investigations without changing this validator.
 */
export function isValidInvestigationDifficultyClass(
  difficultyClass: number,
): boolean {
  return (
    Number.isFinite(difficultyClass)
    && Number.isInteger(difficultyClass)
    && difficultyClass >= 0
  );
}


/* -------------------------------------------------------------------------- */
/* Investigation state validation                                             */
/* -------------------------------------------------------------------------- */

type InvestigationState =
  | InherentInvestigation
  | ResolvedInvestigation;


/**
 * Validates an inherent or resolved Investigation-specific state.
 *
 * Negative modifiers are valid. Only non-finite numeric values are rejected.
 */
export function findInvestigationStateValidationIssues(
  investigation: InvestigationState,
): readonly InvestigationValidationIssue[] {
  const issues: InvestigationValidationIssue[] = [];

  if (!Number.isFinite(investigation.modifier)) {
    issues.push({
      type: "invalid-investigation-modifier",
      modifier: investigation.modifier,
    });
  }

  return issues;
}


/* -------------------------------------------------------------------------- */
/* Modifier validation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Validates the inputs used to calculate an Investigation modifier.
 */
export function findInvestigationModifierValidationIssues(
  input: InvestigationModifierInput,
): readonly InvestigationValidationIssue[] {
  const issues: InvestigationValidationIssue[] = [];

  if (!Number.isFinite(input.intelligenceModifier)) {
    issues.push({
      type: "invalid-intelligence-modifier",
      modifier: input.intelligenceModifier,
    });
  }

  if (!Number.isFinite(input.wisdomModifier)) {
    issues.push({
      type: "invalid-wisdom-modifier",
      modifier: input.wisdomModifier,
    });
  }

  if (!Number.isFinite(input.perceptionModifier)) {
    issues.push({
      type: "invalid-perception-modifier",
      modifier: input.perceptionModifier,
    });
  }

  if (!Number.isFinite(input.investigationModifier)) {
    issues.push({
      type: "invalid-investigation-modifier",
      modifier: input.investigationModifier,
    });
  }

  return issues;
}


/* -------------------------------------------------------------------------- */
/* Active Investigation validation                                            */
/* -------------------------------------------------------------------------- */

/**
 * Validates an active Investigation attempt.
 */
export function findActiveInvestigationValidationIssues(
  input: ActiveInvestigationInput,
): readonly InvestigationValidationIssue[] {
  const issues: InvestigationValidationIssue[] = [
    ...findInvestigationModifierValidationIssues(input),
  ];

  if (!isValidInvestigationD20Roll(input.roll)) {
    issues.push({
      type: "invalid-d20-roll",
      roll: input.roll,
    });
  }

  return issues;
}


/* -------------------------------------------------------------------------- */
/* Passive Investigation validation                                           */
/* -------------------------------------------------------------------------- */

/**
 * Validates a passive Investigation calculation.
 */
export function findPassiveInvestigationValidationIssues(
  input: PassiveInvestigationInput,
): readonly InvestigationValidationIssue[] {
  return findInvestigationModifierValidationIssues(input);
}


/* -------------------------------------------------------------------------- */
/* Difficulty Class validation                                                */
/* -------------------------------------------------------------------------- */

/**
 * Validates an Investigation Difficulty Class.
 */
export function findInvestigationDifficultyClassValidationIssues(
  difficultyClass: number,
): readonly InvestigationValidationIssue[] {
  if (
    isValidInvestigationDifficultyClass(
      difficultyClass,
    )
  ) {
    return [];
  }

  return [
    {
      type: "invalid-investigation-difficulty-class",
      difficultyClass,
    },
  ];
}