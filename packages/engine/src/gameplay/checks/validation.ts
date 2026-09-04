/* Structural validation for universal check data. */

import {
  isValidCheckScope,
  isValidCheckScopeSelector,
} from "../../character/checks/validation";
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

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

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

