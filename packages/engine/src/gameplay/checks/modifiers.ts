/* Modifier collection and arithmetic for one concrete check scope. */

import { matchesCheckScope } from "../../character/checks/matching";
import type { CheckScope } from "../../character/checks/scopes";
import type {
  CheckBaseContribution,
  CheckModifierContribution,
} from "./types";

export function collectApplicableCheckModifiers(
  modifiers: readonly CheckModifierContribution[],
  scope: CheckScope,
): readonly CheckModifierContribution[] {
  return modifiers.filter((modifier) =>
    matchesCheckScope(modifier.scope, scope),
  );
}

export function sumCheckBaseContributions(
  contributions: readonly CheckBaseContribution[],
): number {
  return contributions.reduce(
    (total, contribution) => total + contribution.amount,
    0,
  );
}

export function sumCheckModifiers(
  modifiers: readonly CheckModifierContribution[],
): number {
  return modifiers.reduce(
    (total, modifier) => total + modifier.amount,
    0,
  );
}

