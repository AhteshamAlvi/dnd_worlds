/*
 * Structural validation for universal check data.
 *
 * Two questions, and they are not the same one. A SCOPE names one concrete
 * check and must be fully specified; a SELECTOR names a set and may leave any
 * dimension open. "All hearing Detection" is a valid selector and not a check
 * anyone can roll.
 *
 * Both are decided against the closed lists in scopes.ts rather than against a
 * second copy of them, so content validation and runtime validation cannot
 * disagree about what a sense or a mode is.
 */

import { ATTRIBUTE_KEYS } from "../character/foundation/attributes/base";
import { DERIVED_ATTRIBUTE_NAMES } from "../character/foundation/attributes/derived/types";
import {
  CONCEALMENT_MODES,
  DETECTION_MODES,
  DETECTION_SUBJECTS,
  INVESTIGATION_SUBJECTS,
  PERCEPTION_PHENOMENA,
  SENSE_IDS,
  type CheckScope,
  type CheckScopeSelector,
  type ConcealmentMode,
  type DetectionMode,
  type DetectionSubject,
  type InvestigationSubject,
  type PerceptionPhenomenon,
  type SenseId,
} from "./scopes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isSense(value: unknown): value is SenseId {
  return includes(SENSE_IDS, value);
}

function isPhenomenon(value: unknown): value is PerceptionPhenomenon {
  return includes(PERCEPTION_PHENOMENA, value);
}

function isDetectionMode(value: unknown): value is DetectionMode {
  return includes(DETECTION_MODES, value);
}

function isConcealmentMode(value: unknown): value is ConcealmentMode {
  return includes(CONCEALMENT_MODES, value);
}

function isDetectionSubject(value: unknown): value is DetectionSubject {
  return includes(DETECTION_SUBJECTS, value);
}

function isInvestigationSubject(value: unknown): value is InvestigationSubject {
  return includes(INVESTIGATION_SUBJECTS, value);
}

function isSenseSelector(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "all" || value.kind === "all-physical") return true;
  return value.kind === "specific" && isSense(value.sense);
}

function isPhenomenonSelector(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "all") return true;
  return value.kind === "specific" && isPhenomenon(value.phenomenon);
}

function isModeSelector(
  value: unknown,
  modeGuard: (mode: unknown) => boolean,
): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "all") return true;
  return value.kind === "specific" && modeGuard(value.mode);
}

function isSubjectSelector(
  value: unknown,
  subjectGuard: (subject: unknown) => boolean,
): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "all") return true;
  return value.kind === "specific" && subjectGuard(value.subject);
}

export function isValidCheckScope(value: unknown): value is CheckScope {
  if (!isRecord(value)) return false;

  switch (value.kind) {
    case "attribute":
      return includes(ATTRIBUTE_KEYS, value.attribute);
    case "derivedAttribute":
      return includes(DERIVED_ATTRIBUTE_NAMES, value.derivedAttribute);
    case "perception":
      return isSense(value.sense) && isPhenomenon(value.phenomenon);
    case "detection":
      return isDetectionMode(value.mode) && isSense(value.sense) &&
        isPhenomenon(value.phenomenon) && isDetectionSubject(value.subject);
    case "concealment":
      return isConcealmentMode(value.mode) && isSense(value.sense) &&
        isPhenomenon(value.phenomenon) && isDetectionSubject(value.subject);
    case "investigation":
      return isInvestigationSubject(value.subject) &&
        (value.sense === undefined || isSense(value.sense)) &&
        (value.phenomenon === undefined || isPhenomenon(value.phenomenon));
    default:
      return false;
  }
}

export function isValidCheckScopeSelector(
  value: unknown,
): value is CheckScopeSelector {
  if (!isRecord(value)) return false;

  switch (value.kind) {
    case "attribute":
      return includes(ATTRIBUTE_KEYS, value.attribute);
    case "derivedAttribute":
      return includes(DERIVED_ATTRIBUTE_NAMES, value.derivedAttribute);
    case "perception":
      return (value.sense === undefined || isSenseSelector(value.sense)) &&
        (value.phenomenon === undefined || isPhenomenonSelector(value.phenomenon));
    case "detection":
      return (value.mode === undefined ||
          isModeSelector(value.mode, isDetectionMode)) &&
        (value.sense === undefined || isSenseSelector(value.sense)) &&
        (value.phenomenon === undefined || isPhenomenonSelector(value.phenomenon)) &&
        (value.subject === undefined ||
          isSubjectSelector(value.subject, isDetectionSubject));
    case "concealment":
      return (value.mode === undefined ||
          isModeSelector(value.mode, isConcealmentMode)) &&
        (value.sense === undefined || isSenseSelector(value.sense)) &&
        (value.phenomenon === undefined || isPhenomenonSelector(value.phenomenon)) &&
        (value.subject === undefined ||
          isSubjectSelector(value.subject, isDetectionSubject));
    case "investigation":
      return (value.subject === undefined ||
          isSubjectSelector(value.subject, isInvestigationSubject)) &&
        (value.sense === undefined || isSenseSelector(value.sense)) &&
        (value.phenomenon === undefined || isPhenomenonSelector(value.phenomenon));
    default:
      return false;
  }
}


import {
  CHECK_MODIFIER_CHANNELS,
  type CheckModifierChannel,
  type CheckRequest,
  type FixedCheckRequest,
  type OpposedCheckRequest,
} from "./types";

export type CheckValidationIssue =
  | { readonly type: "advantage-invalid"; readonly path: string; readonly actual: number }
  | { readonly type: "roll-count-invalid"; readonly path: string; readonly expected: number; readonly actual: number }
  | { readonly type: "d20-roll-invalid"; readonly path: string; readonly actual: number }
  | { readonly type: "number-invalid"; readonly path: string; readonly actual: number }
  | { readonly type: "identifier-missing"; readonly path: string }
  | { readonly type: "scope-invalid"; readonly path: string }
  | { readonly type: "selector-invalid"; readonly path: string }
  | { readonly type: "modifier-channel-invalid"; readonly path: string; readonly actual: unknown }
  | { readonly type: "tie-policy-invalid"; readonly path: string; readonly actual: unknown };

export function findCheckRequestIssues(
  request: CheckRequest,
  path = "check",
): readonly CheckValidationIssue[] {
  const issues: CheckValidationIssue[] = [];
  const expectedRollCount = 1 + Math.abs(request.dice.advantage);

  if (!Number.isInteger(request.dice.advantage)) {
    issues.push({
      type: "advantage-invalid",
      path: `${path}.dice.advantage`,
      actual: request.dice.advantage,
    });
  }

  if (request.dice.rolls.length !== expectedRollCount) {
    issues.push({
      type: "roll-count-invalid",
      path: `${path}.dice.rolls`,
      expected: expectedRollCount,
      actual: request.dice.rolls.length,
    });
  }

  request.dice.rolls.forEach((roll, index) => {
    if (!Number.isInteger(roll) || roll < 1 || roll > 20) {
      issues.push({
        type: "d20-roll-invalid",
        path: `${path}.dice.rolls.${index}`,
        actual: roll,
      });
    }
  });

  if (!isValidCheckScope(request.scope)) {
    issues.push({ type: "scope-invalid", path: `${path}.scope` });
  }

  request.baseContributions.forEach((contribution, index) => {
    if (contribution.id.trim().length === 0) {
      issues.push({
        type: "identifier-missing",
        path: `${path}.baseContributions.${index}.id`,
      });
    }

    if (!Number.isFinite(contribution.amount)) {
      issues.push({
        type: "number-invalid",
        path: `${path}.baseContributions.${index}.amount`,
        actual: contribution.amount,
      });
    }
  });

  request.modifiers.forEach((modifier, index) => {
    const modifierPath = `${path}.modifiers.${index}`;

    if (modifier.source.type.trim().length === 0) {
      issues.push({
        type: "identifier-missing",
        path: `${modifierPath}.source.type`,
      });
    }

    if (modifier.source.id.trim().length === 0) {
      issues.push({
        type: "identifier-missing",
        path: `${modifierPath}.source.id`,
      });
    }

    if (!Number.isFinite(modifier.amount)) {
      issues.push({
        type: "number-invalid",
        path: `${modifierPath}.amount`,
        actual: modifier.amount,
      });
    }

    if (!isValidCheckScopeSelector(modifier.scope)) {
      issues.push({ type: "selector-invalid", path: `${modifierPath}.scope` });
    }

    if (!includes(CHECK_MODIFIER_CHANNELS, modifier.channel)) {
      issues.push({
        type: "modifier-channel-invalid",
        path: `${modifierPath}.channel`,
        actual: modifier.channel as CheckModifierChannel,
      });
    }
  });

  return issues;
}

export function findFixedCheckRequestIssues(
  request: FixedCheckRequest,
): readonly CheckValidationIssue[] {
  const issues = [...findCheckRequestIssues(request.check)];

  if (!Number.isFinite(request.difficulty)) {
    issues.push({
      type: "number-invalid",
      path: "difficulty",
      actual: request.difficulty,
    });
  }

  if (
    request.tiePolicy !== undefined &&
    request.tiePolicy !== "succeeds" &&
    request.tiePolicy !== "fails"
  ) {
    issues.push({
      type: "tie-policy-invalid",
      path: "tiePolicy",
      actual: request.tiePolicy,
    });
  }

  return issues;
}

export function findOpposedCheckRequestIssues(
  request: OpposedCheckRequest,
): readonly CheckValidationIssue[] {
  const issues = [
    ...findCheckRequestIssues(request.initiator, "initiator"),
    ...findCheckRequestIssues(request.opponent, "opponent"),
  ];

  if (request.tiesFavor !== "initiator" && request.tiesFavor !== "opponent") {
    issues.push({
      type: "tie-policy-invalid",
      path: "tiesFavor",
      actual: request.tiesFavor,
    });
  }

  return issues;
}

