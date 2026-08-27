/*
 * Validation for the Detection/Concealment subsystem.
 *
 * This file validates the values consumed by Detection mechanics without
 * performing Detection, Concealment, or contest resolution itself.
 *
 * Detection profiles may eventually come from Workbench-authored data,
 * serialized characters, Effects, or other host-controlled sources. Runtime
 * validation therefore still matters even though the TypeScript types require
 * all six senses to be present.
 *
 * This file validates:
 *
 * - complete six-sense profiles;
 * - sense availability values;
 * - sense-specific Detection modifiers;
 * - sense-specific Concealment modifiers;
 * - PER/WIS Detection inputs;
 * - DEX/WIS Concealment inputs;
 * - active d20 rolls.
 *
 * It does NOT validate:
 *
 * - whether a sense can reach a target;
 * - line of sight;
 * - walls;
 * - range;
 * - Foundry visibility;
 * - whether Detection beats Concealment;
 * - Nen-specific rules.
 *
 * These functions return issues rather than EngineResults. They are domain
 * validation helpers; a higher-level engine entry point can translate their
 * issues into EngineErrors when required.
 */

import type {
  DetectionSenseId,
  InherentDetectionProfile,
  InherentDetectionSense,
  ResolvedDetectionProfile,
  ResolvedDetectionSense,
} from "./types";

import {
  DETECTION_SENSE_IDS,
} from "./types";

import type {
  ActiveDetectionInput,
  DetectionModifierInput,
  PassiveDetectionInput,
} from "./detection";

import type {
  ConcealmentInput,
  ConcealmentModifierInput,
} from "./concealment";


/* -------------------------------------------------------------------------- */
/* Issues                                                                     */
/* -------------------------------------------------------------------------- */

export type DetectionValidationIssue =
  | {
      readonly type: "missing-detection-sense";
      readonly sense: DetectionSenseId;
    }
  | {
      readonly type: "invalid-sense-availability";
      readonly sense: DetectionSenseId;
    }
  | {
      readonly type: "invalid-sense-detection-modifier";
      readonly sense: DetectionSenseId;
      readonly modifier: number;
    }
  | {
      readonly type: "invalid-sense-concealment-modifier";
      readonly sense: DetectionSenseId;
      readonly modifier: number;
    }
  | {
      readonly type: "invalid-perception-modifier";
      readonly modifier: number;
    }
  | {
      readonly type: "invalid-wisdom-modifier";
      readonly modifier: number;
    }
  | {
      readonly type: "invalid-dexterity-modifier";
      readonly modifier: number;
    }
  | {
      readonly type: "invalid-detection-sense-modifier";
      readonly modifier: number;
    }
  | {
      readonly type: "invalid-concealment-sense-modifier";
      readonly modifier: number;
    }
  | {
      readonly type: "invalid-d20-roll";
      readonly roll: number;
    };


/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

type DetectionSenseState =
  | InherentDetectionSense
  | ResolvedDetectionSense;

type DetectionProfile =
  | InherentDetectionProfile
  | ResolvedDetectionProfile;


/**
 * A d20 result must represent an actual face of the die.
 */
export function isValidD20Roll(
  roll: number,
): boolean {
  return (
    Number.isFinite(roll) &&
    Number.isInteger(roll) &&
    roll >= 1 &&
    roll <= 20
  );
}


/* -------------------------------------------------------------------------- */
/* Sense/profile validation                                                   */
/* -------------------------------------------------------------------------- */

export function findDetectionSenseValidationIssues(
  sense: DetectionSenseId,
  state: DetectionSenseState,
): readonly DetectionValidationIssue[] {
  const issues: DetectionValidationIssue[] = [];

  if (typeof state.available !== "boolean") {
    issues.push({
      type: "invalid-sense-availability",
      sense,
    });
  }

  if (!Number.isFinite(state.detectionModifier)) {
    issues.push({
      type: "invalid-sense-detection-modifier",
      sense,
      modifier: state.detectionModifier,
    });
  }

  if (!Number.isFinite(state.concealmentModifier)) {
    issues.push({
      type: "invalid-sense-concealment-modifier",
      sense,
      modifier: state.concealmentModifier,
    });
  }

  return issues;
}


/**
 * Validate a complete inherent or resolved six-sense profile.
 *
 * The explicit undefined check is intentional. TypeScript guarantees the
 * Record shape to typed callers, but serialized or host-authored runtime data
 * can still be incomplete.
 */
export function findDetectionProfileValidationIssues(
  profile: DetectionProfile,
): readonly DetectionValidationIssue[] {
  const issues: DetectionValidationIssue[] = [];

  for (const sense of DETECTION_SENSE_IDS) {
    const state = profile[sense];

    if (state === undefined) {
      issues.push({
        type: "missing-detection-sense",
        sense,
      });

      continue;
    }

    issues.push(
      ...findDetectionSenseValidationIssues(
        sense,
        state,
      ),
    );
  }

  return issues;
}


/* -------------------------------------------------------------------------- */
/* Detection input validation                                                 */
/* -------------------------------------------------------------------------- */

export function findDetectionModifierValidationIssues(
  input: DetectionModifierInput,
): readonly DetectionValidationIssue[] {
  const issues: DetectionValidationIssue[] = [];

  if (!Number.isFinite(input.perceptionModifier)) {
    issues.push({
      type: "invalid-perception-modifier",
      modifier: input.perceptionModifier,
    });
  }

  if (!Number.isFinite(input.wisdomModifier)) {
    issues.push({
      type: "invalid-wisdom-modifier",
      modifier: input.wisdomModifier,
    });
  }

  if (!Number.isFinite(input.senseModifier)) {
    issues.push({
      type: "invalid-detection-sense-modifier",
      modifier: input.senseModifier,
    });
  }

  return issues;
}


export function findActiveDetectionValidationIssues(
  input: ActiveDetectionInput,
): readonly DetectionValidationIssue[] {
  const issues = [
    ...findDetectionModifierValidationIssues(input),
  ];

  if (!isValidD20Roll(input.roll)) {
    issues.push({
      type: "invalid-d20-roll" as const,
      roll: input.roll,
    });
  }

  return issues;
}


export function findPassiveDetectionValidationIssues(
  input: PassiveDetectionInput,
): readonly DetectionValidationIssue[] {
  return findDetectionModifierValidationIssues(input);
}


/* -------------------------------------------------------------------------- */
/* Concealment input validation                                               */
/* -------------------------------------------------------------------------- */

export function findConcealmentModifierValidationIssues(
  input: ConcealmentModifierInput,
): readonly DetectionValidationIssue[] {
  const issues: DetectionValidationIssue[] = [];

  if (!Number.isFinite(input.dexterityModifier)) {
    issues.push({
      type: "invalid-dexterity-modifier",
      modifier: input.dexterityModifier,
    });
  }

  if (!Number.isFinite(input.wisdomModifier)) {
    issues.push({
      type: "invalid-wisdom-modifier",
      modifier: input.wisdomModifier,
    });
  }

  if (!Number.isFinite(input.senseModifier)) {
    issues.push({
      type: "invalid-concealment-sense-modifier",
      modifier: input.senseModifier,
    });
  }

  return issues;
}


export function findConcealmentValidationIssues(
  input: ConcealmentInput,
): readonly DetectionValidationIssue[] {
  const issues = [
    ...findConcealmentModifierValidationIssues(input),
  ];

  if (!isValidD20Roll(input.roll)) {
    issues.push({
      type: "invalid-d20-roll" as const,
      roll: input.roll,
    });
  }

  return issues;
}