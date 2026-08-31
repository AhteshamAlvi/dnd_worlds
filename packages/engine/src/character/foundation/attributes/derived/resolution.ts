/*
 * Derived Attribute resolution.
 *
 * Derived Attributes are calculated from the character's resolved Attributes.
 *
 * This file owns the base formulas only. It does not apply situational,
 * sense-specific, skill, technique, equipment, or other contextual modifiers —
 * those are modifyCheck Effects resolved at check time (see
 * rules/resolution.ts's resolveCheckModifier) and never fold into the value
 * calculated here.
 *
 * All Derived Attributes are rounded to the nearest whole number after their
 * contributing Attributes are averaged.
 *
 *
 * ONE FORMULA, TEN ATTRIBUTE LISTS
 * --------------------------------
 *
 * Every Derived Attribute is the same operation — the rounded mean of two to
 * five resolved Attributes — differing only in which Attributes feed it. That
 * makes the contributing list the real content and the arithmetic shared, so
 * DERIVED_ATTRIBUTE_SOURCES below is the single place a formula is stated.
 *
 * Writing the ten averages out longhand instead would mean ten chances to
 * mistype an attribute key, and would leave the trace layer needing its own
 * second copy of "which Attributes feed Acrobatics" to name its inputs — two
 * lists that must agree and no compiler check that they do.
 */

import {
  createTraceNode,
  type TraceNode,
} from "../../../../infrastructure/trace";

import { deriveStandardModifier } from "../resolution";
import type {
  AttributeKey,
  Attributes,
  ResolvedScore,
} from "../types";
import {
  DERIVED_ATTRIBUTE_NAMES,
  type DerivedAttributeName,
  type DerivedAttributes,
} from "./types";


/**
 * The resolved Attributes each Derived Attribute averages.
 *
 * Order within a list is presentational only — it decides the order inputs
 * appear in a trace, not the result.
 */
export const DERIVED_ATTRIBUTE_SOURCES = {
  combatAbility: ["str", "agi", "dex", "per", "wis"],
  athletics: ["str", "agi"],
  acrobatics: ["agi", "dex"],
  accuracy: ["dex", "per"],
  detection: ["per", "wis"],
  concealment: ["dex", "wis"],
  investigation: ["int", "wis", "per"],
  stamina: ["con", "vit"],
  willpower: ["wis", "spi"],
  intimidation: ["cha", "spi"],
} as const satisfies Readonly<
  Record<DerivedAttributeName, readonly AttributeKey[]>
>;


/**
 * Resolve one Derived Attribute by name.
 *
 * Formula:
 *
 *   round(mean of its contributing resolved Attributes)
 */
export function resolveDerivedAttribute(
  name: DerivedAttributeName,
  attributes: Attributes,
): number {
  return roundedAverage(
    ...DERIVED_ATTRIBUTE_SOURCES[name].map(
      (key: AttributeKey) => attributes[key],
    ),
  );
}


/**
 * Resolve Combat Ability.
 *
 * Formula:
 *
 *   round((STR + AGI + DEX + PER + WIS) / 5)
 */
export function resolveCombatAbility(attributes: Attributes): number {
  return resolveDerivedAttribute("combatAbility", attributes);
}


/**
 * Resolve Athletics.
 *
 * Formula:
 *
 *   round((STR + AGI) / 2)
 */
export function resolveAthletics(attributes: Attributes): number {
  return resolveDerivedAttribute("athletics", attributes);
}


/**
 * Resolve Acrobatics.
 *
 * Formula:
 *
 *   round((AGI + DEX) / 2)
 */
export function resolveAcrobatics(attributes: Attributes): number {
  return resolveDerivedAttribute("acrobatics", attributes);
}


/**
 * Resolve Accuracy.
 *
 * Formula:
 *
 *   round((DEX + PER) / 2)
 */
export function resolveAccuracy(attributes: Attributes): number {
  return resolveDerivedAttribute("accuracy", attributes);
}


/**
 * Resolve base Detection.
 *
 * Formula:
 *
 *   round((PER + WIS) / 2)
 *
 * Sense-specific and contextual modifiers are applied by the mechanic
 * performing the Detection check, as modifyCheck Effects scoped to this
 * Derived Attribute.
 */
export function resolveDetection(attributes: Attributes): number {
  return resolveDerivedAttribute("detection", attributes);
}


/**
 * Resolve base Concealment.
 *
 * Formula:
 *
 *   round((DEX + WIS) / 2)
 *
 * Sense-specific and contextual modifiers are applied by the mechanic
 * performing the Concealment check, as modifyCheck Effects scoped to this
 * Derived Attribute.
 */
export function resolveConcealment(attributes: Attributes): number {
  return resolveDerivedAttribute("concealment", attributes);
}


/**
 * Resolve Investigation.
 *
 * Formula:
 *
 *   round((INT + WIS + PER) / 3)
 */
export function resolveInvestigation(attributes: Attributes): number {
  return resolveDerivedAttribute("investigation", attributes);
}


/**
 * Resolve Stamina.
 *
 * Formula:
 *
 *   round((CON + VIT) / 2)
 */
export function resolveStamina(attributes: Attributes): number {
  return resolveDerivedAttribute("stamina", attributes);
}


/**
 * Resolve Willpower.
 *
 * Formula:
 *
 *   round((WIS + SPI) / 2)
 */
export function resolveWillpower(attributes: Attributes): number {
  return resolveDerivedAttribute("willpower", attributes);
}


/**
 * Resolve Intimidation.
 *
 * Formula:
 *
 *   round((CHA + SPI) / 2)
 */
export function resolveIntimidation(attributes: Attributes): number {
  return resolveDerivedAttribute("intimidation", attributes);
}


/**
 * Resolve the complete Derived Attribute set.
 *
 * `attributes` should normally be the character's RESOLVED Attributes: a
 * Trait that raises AGI is expected to raise Acrobatics with it, and reading
 * the Base or Stored layer here would silently drop every Condition, injury,
 * and equipped Item.
 */
export function resolveDerivedAttributes(
  attributes: Attributes,
): DerivedAttributes {
  const derived = {} as Record<DerivedAttributeName, number>;

  for (const name of DERIVED_ATTRIBUTE_NAMES) {
    derived[name] = resolveDerivedAttribute(name, attributes);
  }

  return derived;
}


/**
 * Every Derived Attribute paired with its standard modifier.
 *
 * The same ResolvedScore shape resolveAttributeScores produces for ordinary
 * Attributes, so a sheet renders Acrobatics and AGI through one code path.
 */
export function resolveDerivedScores(
  derived: DerivedAttributes,
): Readonly<Record<DerivedAttributeName, ResolvedScore>> {
  const scores = {} as Record<DerivedAttributeName, ResolvedScore>;

  for (const name of DERIVED_ATTRIBUTE_NAMES) {
    scores[name] = {
      score: derived[name],
      standardModifier: deriveStandardModifier(derived[name]),
    };
  }

  return scores;
}


/* ── Explaining a Derived Attribute ─────────────────────────────────────── */

/**
 * One contributing Attribute's part in a Derived Attribute.
 */
export interface DerivedAttributeContribution {
  readonly attribute: AttributeKey;
  readonly score: number;
}


/**
 * The full arithmetic behind one Derived Attribute.
 *
 * "Why is my Athletics 15" is answerable only with the contributing scores,
 * not the total — the same reason explainAttribute exists for Attributes.
 */
export interface DerivedAttributeExplanation {
  readonly name: DerivedAttributeName;

  readonly contributions: readonly DerivedAttributeContribution[];
  readonly average: number;
  readonly score: number;
  readonly standardModifier: number;
}


/**
 * Why one Derived Attribute ended up where it did.
 *
 * `average` is kept unrounded beside the rounded `score` so a half-point that
 * rounded away is visible rather than looking like an arithmetic error.
 */
export function explainDerivedAttribute(
  name: DerivedAttributeName,
  attributes: Attributes,
): DerivedAttributeExplanation {
  const sources: readonly AttributeKey[] = DERIVED_ATTRIBUTE_SOURCES[name];

  const contributions = sources.map((attribute) => ({
    attribute,
    score: attributes[attribute],
  }));

  const total = contributions.reduce(
    (sum, contribution) => sum + contribution.score,
    0,
  );

  const average = total / contributions.length;
  const score = Math.round(average);

  return {
    name,
    contributions,
    average,
    score,
    standardModifier: deriveStandardModifier(score),
  };
}


/**
 * The same explanation as a trace node.
 *
 * Every contributing Attribute becomes a named input, so the total on the
 * node is one the inputs visibly produce.
 */
export function createDerivedAttributeTraceNode(
  name: DerivedAttributeName,
  attributes: Attributes,
): TraceNode {
  const explanation = explainDerivedAttribute(name, attributes);

  const inputs: Record<string, { value: number }> = {};

  for (const contribution of explanation.contributions) {
    inputs[contribution.attribute] = { value: contribution.score };
  }

  inputs["average"] = { value: explanation.average };

  return createTraceNode({
    id: `character.attributes.derived.${name}.resolve`,
    label: `Resolve ${name}`,
    formula: `round((${explanation.contributions
      .map((contribution) => contribution.attribute.toUpperCase())
      .join(" + ")}) / ${explanation.contributions.length})`,
    inputs,
    output: explanation.score,
    rounding: { mode: "integer" },
  });
}


/**
 * One trace node per Derived Attribute, beneath a single parent.
 */
export function createDerivedAttributeResolutionTrace(
  attributes: Attributes,
): TraceNode {
  return createTraceNode({
    id: "character.attributes.derived.resolve",
    label: "Resolve Derived Attributes",
    formula: "each is the rounded mean of its contributing resolved Attributes",
    output: DERIVED_ATTRIBUTE_NAMES.length,
    children: DERIVED_ATTRIBUTE_NAMES.map((name) =>
      createDerivedAttributeTraceNode(name, attributes),
    ),
  });
}


/**
 * Returns the arithmetic mean of one or more values,
 * rounded to the nearest whole number.
 *
 * Deliberately not infrastructure/rounding.ts's roundToOneSignificantFigure:
 * that rule exists for large Aura and XP figures where precision past the
 * leading digit is noise. A Derived Attribute is a small integer on the same
 * 1-30 scale as an Attribute, so it rounds to the nearest whole number.
 *
 * Math.round breaks ties upward (toward +Infinity), which is asymmetric for
 * negative values — see decisions/log.ts's
 * "attributes.derived.rounding-direction" entry.
 */
function roundedAverage(...values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error(
      "Cannot calculate the average of an empty value set.",
    );
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return Math.round(total / values.length);
}
