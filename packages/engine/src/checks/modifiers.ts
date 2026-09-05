/* Modifier collection and arithmetic for one concrete check scope. */

import { createTraceNode, type TraceInput, type TraceNode } from "../infrastructure/trace";
import { matchesCheckScope } from "./matching";
import type { CheckScope } from "./scopes";
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


/* -------------------------------------------------------------------------- */
/* Roll-free modifier resolution                                             */
/* -------------------------------------------------------------------------- */

/**
 * The complete modifier for one check, without rolling any dice.
 *
 * A passive value — a sensory DC, a static defense, a sheet display — needs
 * exactly this and nothing else: the governing score(s) plus every
 * currently-applicable situational modifier, added together the same way
 * resolveCheck does it for an actual roll. Keeping the two paths on one
 * arithmetic implementation (collectApplicableCheckModifiers,
 * sumCheckBaseContributions, sumCheckModifiers) is what guarantees a
 * passively-displayed modifier and an actually-rolled one never disagree.
 */
export interface CheckModifierResolution {
  readonly scope: CheckScope;

  readonly baseContributions: readonly CheckBaseContribution[];
  readonly baseModifierTotal: number;

  readonly applicableModifiers: readonly CheckModifierContribution[];
  readonly situationalModifierTotal: number;

  /** baseModifierTotal plus situationalModifierTotal. */
  readonly finalModifier: number;
}

/**
 * Resolve the final modifier for one check scope, without dice.
 *
 * The dice-based sibling is resolveCheck; this is what a passive value reads
 * when nothing is being rolled at all.
 */
export function resolveCheckModifier(
  baseContributions: readonly CheckBaseContribution[],
  modifiers: readonly CheckModifierContribution[],
  scope: CheckScope,
): CheckModifierResolution {
  const applicableModifiers = collectApplicableCheckModifiers(
    modifiers,
    scope,
  );

  const baseModifierTotal = sumCheckBaseContributions(baseContributions);
  const situationalModifierTotal = sumCheckModifiers(applicableModifiers);

  return {
    scope,
    baseContributions: [...baseContributions],
    baseModifierTotal,
    applicableModifiers,
    situationalModifierTotal,
    finalModifier: baseModifierTotal + situationalModifierTotal,
  };
}

/*
 * A short, stable label for one CheckScope, for trace ids and inputs.
 *
 * The union is open-ended in practice — a check can be sensory as well as
 * attribute-shaped — so every kind gets an explicit label rather than a
 * default that would fall back to "[object Object]" exactly where the
 * reasoning is least obvious.
 */
function describeCheckScope(scope: CheckScope): string {
  switch (scope.kind) {
    case "attribute":
      return scope.attribute.toUpperCase();
    case "derivedAttribute":
      return scope.derivedAttribute;
    case "perception":
      return `perception:${scope.sense}/${scope.phenomenon}`;
    case "investigation":
      return `investigation:${scope.subject}`;
    case "detection":
    case "concealment":
      return `${scope.kind}:${scope.mode}/${scope.sense}`;
  }
}

function addModifierTraceInput(
  inputs: Record<string, TraceInput>,
  desiredKey: string,
  amount: number,
): void {
  let key = desiredKey;
  let suffix = 2;

  while (inputs[key] !== undefined) {
    key = `${desiredKey} (${suffix})`;
    suffix += 1;
  }

  inputs[key] = { value: amount };
}

/**
 * A resolved check modifier as a trace node.
 *
 * Each contributing source becomes a named input, so a final +7 visibly
 * decomposes into the +4 the governing score was worth and the +3 a Skill
 * supplied.
 */
export function createCheckModifierTraceNode(
  resolution: CheckModifierResolution,
): TraceNode {
  const scopeLabel = describeCheckScope(resolution.scope);

  const inputs: Record<string, TraceInput> = {};

  for (const contribution of resolution.baseContributions) {
    const prefix = contribution.source === undefined
      ? "base"
      : `${contribution.source.type}:${contribution.source.id}`;

    addModifierTraceInput(
      inputs,
      `${prefix}.${contribution.id}`,
      contribution.amount,
    );
  }

  for (const modifier of resolution.applicableModifiers) {
    addModifierTraceInput(
      inputs,
      `${modifier.channel}.${modifier.source.type}:${modifier.source.id}`,
      modifier.amount,
    );
  }

  return createTraceNode({
    id: `checks.${scopeLabel}.modifier`,
    label: `Resolve ${scopeLabel} check modifier`,
    formula: "final = base modifier total + applicable situational modifiers",
    inputs,
    output: resolution.finalModifier,
  });
}

