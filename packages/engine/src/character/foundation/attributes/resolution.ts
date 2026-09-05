/*
 * Attribute resolution — stored scores through to the numbers a check uses.
 *
 *   Stored
 *      ↓ base modifiers      (permanent: Traits, Sub-species, transformations)
 *   Base
 *      ↓ resolved modifiers  (active: Conditions, injuries, equipped Items)
 *   Resolved
 *
 * This file deliberately does not know where a modifier came from. It used to
 * import Traits and collect their modifiers itself, which meant every new
 * source of adjustment — Conditions, Items, Techniques — would have added
 * another import and another collection step here. Sources now declare
 * Effects, character/resolution.ts turns those into modifiers, and this file
 * only does the arithmetic.
 *
 * Provenance rides along on the modifiers themselves (see
 * rules/resolution.ts's SourcedAttributeModifier, which is structurally an
 * AttributeModifier), so explaining a score costs nothing extra.
 *
 * This file also owns the standard modifier ladder — the ±N a score converts
 * to when something rolls against it. See deriveStandardModifier below, and
 * modifiers.ts's header for why that is a different thing from an
 * AttributeModifier despite both being called "modifier".
 */

import { createTraceNode, type TraceNode } from "../../../infrastructure/trace";

import { applyAttributeModifiers, type AttributeModifier } from "./modifiers";
import { ATTRIBUTE_KEYS } from "./base";
import type {
  AttributeKey,
  AttributeLayers,
  Attributes,
  BaseAttributes,
  ResolvedAttributes,
  ResolvedScore,
  StoredAttributes,
} from "./types";

/**
 * Stored scores plus every permanent effect.
 *
 * The stored values are never written to: a Trait that costs DEX 2 lowers the
 * Base score while the sheet still remembers what the character rolled.
 */
export function deriveBaseAttributes(
  stored: StoredAttributes,
  baseModifiers: readonly AttributeModifier[] = [],
): BaseAttributes {
  return applyAttributeModifiers(stored, baseModifiers);
}

/**
 * Base scores plus everything currently true of the character.
 *
 * Temporary by nature: remove the Condition and the same Base produces a
 * different Resolved score without anything having been recalculated back.
 */
export function deriveResolvedAttributes(
  base: BaseAttributes,
  resolvedModifiers: readonly AttributeModifier[] = [],
): ResolvedAttributes {
  return applyAttributeModifiers(base, resolvedModifiers);
}

/**
 * Both steps at once, keeping all three stages.
 *
 * This is what a sheet wants: it displays Base, shows Resolved beside it when
 * they differ, and needs Stored to explain the gap.
 */
export function resolveAttributeLayers(
  stored: StoredAttributes,
  baseModifiers: readonly AttributeModifier[] = [],
  resolvedModifiers: readonly AttributeModifier[] = [],
): AttributeLayers {
  const base = deriveBaseAttributes(stored, baseModifiers);

  return {
    stored,
    base,
    resolved: deriveResolvedAttributes(base, resolvedModifiers),
  };
}

/* ── The standard modifier ladder ───────────────────────────────────────── */

/*
 * The score a modifier of +0 sits at, and how many points of score buy one
 * point of modifier.
 *
 * Kept as named constants beside the function that uses them, matching
 * REFERENCE_CONSTITUTION/CONSTITUTION_DOUBLING_INTERVAL in
 * body-points/resolution.ts and VIT_RECOVERY_REFERENCE in
 * foundation/body/recovery/resolution.ts.
 */
/*
 * Four mechanics anchor on an attribute score of 10 meaning "ordinary", each
 * naming its own constant: this one, REFERENCE_CONSTITUTION (body-points),
 * VIT_RECOVERY_REFERENCE (foundation/body/recovery) and
 * REFERENCE_STRENGTH_POSITION (body/strength). They are deliberately
 * independent — each mechanic picks the baseline it is calibrated against,
 * and they are not required to agree — but changing what counts as an
 * ordinary Human is therefore four edits, not one.
 */
export const STANDARD_MODIFIER_REFERENCE_SCORE = 10;
export const STANDARD_MODIFIER_DIVISOR = 2;

/**
 * The ±N a score contributes when something rolls against it.
 *
 * Formula:
 *
 *   floor((score - 10) / 2)
 *
 *    8-9  → -1
 *   10-11 → +0
 *   12-13 → +1
 *   ...
 *   30    → +10
 *
 * This is the single authoritative implementation. It takes a plain number
 * rather than an AttributeKey or a Derived Attribute name precisely so that
 * an Attribute score and a Derived Attribute score go through the same
 * ladder — the Rulebook does not give them separate tables, and neither
 * should the engine.
 *
 * Not clamped at either end: a Resolved score may legitimately sit outside
 * the 1-30 stored range (see base.ts), and reporting the real modifier for a
 * heavily penalized score is more honest than flattening it.
 */
export function deriveStandardModifier(score: number): number {
  return Math.floor(
    (score - STANDARD_MODIFIER_REFERENCE_SCORE) / STANDARD_MODIFIER_DIVISOR,
  );
}

/**
 * Every resolved Attribute paired with its standard modifier.
 *
 * The form a sheet reads: `attributeScores.agi` is `{score: 19,
 * standardModifier: 4}`, the same shape resolveDerivedScores produces for
 * Acrobatics — see ResolvedScore in types.ts.
 */
export function resolveAttributeScores(
  resolved: ResolvedAttributes,
): Readonly<Record<AttributeKey, ResolvedScore>> {
  const scores = {} as Record<AttributeKey, ResolvedScore>;

  for (const key of ATTRIBUTE_KEYS) {
    scores[key] = {
      score: resolved[key],
      standardModifier: deriveStandardModifier(resolved[key]),
    };
  }

  return scores;
}

/* ── Explaining a score ─────────────────────────────────────────────────── */

/**
 * One modifier's contribution to one attribute, with whatever the caller knew
 * about where it came from.
 *
 * `source` is a label rather than a structured reference because this is the
 * display end of the pipeline; character/resolution.ts holds the typed
 * RuleSourceRef for anything that needs to act on the source rather than
 * print it.
 */
export interface AttributeContribution {
  readonly source: string;
  readonly amount: number;
}

/**
 * The full arithmetic behind one attribute, in the order it happened.
 */
export interface AttributeExplanation {
  readonly attribute: AttributeKey;

  readonly stored: number;
  readonly baseContributions: readonly AttributeContribution[];
  readonly base: number;
  readonly resolvedContributions: readonly AttributeContribution[];
  readonly resolved: number;
}

// A modifier may or may not carry provenance; unattributed ones still have to
// appear in the explanation, or the arithmetic will not add up on screen.
type PossiblySourcedModifier = AttributeModifier & {
  readonly source?: { readonly type: string; readonly id: string };
};

function describeSource(modifier: PossiblySourcedModifier): string {
  return modifier.source === undefined
    ? "unattributed"
    : `${modifier.source.type}:${modifier.source.id}`;
}

function contributionsFor(
  attribute: AttributeKey,
  modifiers: readonly AttributeModifier[],
): readonly AttributeContribution[] {
  return modifiers
    .filter((modifier) => modifier.attribute === attribute)
    .map((modifier) => ({
      source: describeSource(modifier as PossiblySourcedModifier),
      amount: modifier.amount,
    }));
}

/**
 * Why one attribute ended up where it did.
 *
 * The question a player actually asks is "why is my DEX 11 when I rolled 16",
 * and answering it needs the individual contributions, not just the totals.
 */
export function explainAttribute(
  attribute: AttributeKey,
  layers: AttributeLayers,
  baseModifiers: readonly AttributeModifier[] = [],
  resolvedModifiers: readonly AttributeModifier[] = [],
): AttributeExplanation {
  return {
    attribute,

    stored: layers.stored[attribute],
    baseContributions: contributionsFor(attribute, baseModifiers),
    base: layers.base[attribute],
    resolvedContributions: contributionsFor(attribute, resolvedModifiers),
    resolved: layers.resolved[attribute],
  };
}

/**
 * The same explanation as a trace node, for the engine's normal explanation
 * tree.
 *
 * Every contribution becomes a named input, so the workbench's trace view can
 * show the ladder without knowing anything about attributes specifically.
 */
export function createAttributeTraceNode(
  attribute: AttributeKey,
  layers: AttributeLayers,
  baseModifiers: readonly AttributeModifier[] = [],
  resolvedModifiers: readonly AttributeModifier[] = [],
): TraceNode {
  const explanation = explainAttribute(
    attribute,
    layers,
    baseModifiers,
    resolvedModifiers,
  );

  const inputs: Record<string, { value: number }> = {
    stored: { value: explanation.stored },
  };

  /*
   * One source can contribute twice to the same attribute — two ranks of one
   * Skill both raising STR, say — and a plain key would let the second
   * silently replace the first. The trace would then show a total its own
   * inputs do not add up to, which is the one thing an explanation must
   * never do.
   */
  const addInput = (key: string, amount: number): void => {
    if (inputs[key] === undefined) {
      inputs[key] = { value: amount };
      return;
    }

    let suffix = 2;

    while (inputs[`${key} (${suffix})`] !== undefined) suffix += 1;

    inputs[`${key} (${suffix})`] = { value: amount };
  };

  for (const contribution of explanation.baseContributions) {
    addInput(`base:${contribution.source}`, contribution.amount);
  }

  inputs["base"] = { value: explanation.base };

  for (const contribution of explanation.resolvedContributions) {
    addInput(`resolved:${contribution.source}`, contribution.amount);
  }

  return createTraceNode({
    id: `character.attributes.${attribute}.resolve`,
    label: `Resolve ${attribute.toUpperCase()}`,
    formula: "resolved = (stored + base modifiers) + resolved modifiers",
    inputs,
    output: explanation.resolved,
  });
}

/**
 * One trace node per attribute, in ladder order, beneath a single parent.
 */
export function createAttributeResolutionTrace(
  layers: AttributeLayers,
  baseModifiers: readonly AttributeModifier[] = [],
  resolvedModifiers: readonly AttributeModifier[] = [],
): TraceNode {
  return createTraceNode({
    id: "character.attributes.resolve",
    label: "Resolve attributes",
    formula: "stored → base → resolved",
    output: changedAttributeCount(layers),
    children: ATTRIBUTE_KEYS.map((key) =>
      createAttributeTraceNode(key, layers, baseModifiers, resolvedModifiers),
    ),
  });
}

// How many attributes any effect actually touched — the one number worth
// putting on the parent node, since the detail is on the children.
function changedAttributeCount(layers: AttributeLayers): number {
  return ATTRIBUTE_KEYS.filter(
    (key) => layers.resolved[key] !== layers.stored[key],
  ).length;
}

// Re-exported so callers resolving attributes do not also have to import the
// modifier module to name the type they are passing in.
export type { Attributes, AttributeModifier };
