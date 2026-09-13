/*
 * Standard awakening eligibility, as requirements rather than as five `if`s.
 *
 * The thresholds themselves live in the Foundation calculator, because the
 * abrupt odds formula measures its exponents from the same five numbers and
 * two tables would eventually disagree. What lives HERE is their expression as
 * the engine's universal Requirement vocabulary, and that is a layer decision
 * rather than a style one: `character/rules/` sits above Foundation, so the
 * Requirement type cannot be reached from where the numbers are kept.
 *
 *
 * WHY REQUIREMENTS AND NOT COMPARISONS
 * ------------------------------------
 *
 * Because of the third answer. A hand-written `attributes.spi >= 16` has two
 * outcomes, and the engine's requirement vocabulary has three:
 *
 *   satisfied    the character meets it
 *   unsatisfied  the character definitely does not
 *   unresolved   nobody has established the fact being asked about
 *
 * An awakening refused because a character is short of SPI and one refused
 * because their sheet has no Attributes recorded are different refusals with
 * different remedies, and only the first is the character's problem. Collapsing
 * them into `false` is a confident wrong answer of exactly the kind the
 * disposition vocabulary was introduced to stop.
 *
 * `unresolved` is PRESERVED all the way out to the caller. It is never
 * rounded down to a refusal on the way, and never rounded up to a pass.
 *
 *
 * WHICH ATTRIBUTE LAYER, AND WHY IT IS THE SAME ONE EVERYWHERE
 * -----------------------------------------------------------
 *
 * `base` — the permanent score after Traits and other permanent effects, and
 * before anything temporary. Awakening is a permanent acquisition, so a
 * Condition that has knocked two points off a character's WIS this afternoon
 * must not revoke an eligibility they have trained for; equally, a temporary
 * buff must not buy one.
 *
 * The abrupt odds read the SAME layer, from the same context, for the same
 * reason — and because a character judged eligible against one layer and rolled
 * for against another is being measured with two different rulers.
 */

import type { Attributes } from "../foundation/attributes/types";
import {
  INSTINCTIVE_AWAKENING_MINIMUM_SPI,
  STANDARD_AWAKENING_ATTRIBUTES,
  STANDARD_AWAKENING_THRESHOLDS,
  type StandardAwakeningAttribute,
} from "../foundation/nen/awakening/calculations";
import type { NamedRequirement } from "../rules/requirements";
import {
  namedRequirementDisposition,
  resolveNamedRequirements,
  type NamedRequirementResolution,
  type RequirementContext,
  type RequirementDisposition,
} from "../rules/resolution";


/*
 * The one Attribute layer every awakening judgement reads.
 *
 * Named once, here, so eligibility and the abrupt roll cannot be pointed at
 * different layers by two callers who each thought they were being careful.
 */
export const AWAKENING_ATTRIBUTE_LAYER = "base" as const;


/** The Attributes an awakening is judged against, from a requirement context. */
export function awakeningAttributes(context: RequirementContext): Attributes {
  return context.attributes[AWAKENING_ATTRIBUTE_LAYER];
}


function thresholdRequirement(
  attribute: StandardAwakeningAttribute,
): NamedRequirement {
  const minimum = STANDARD_AWAKENING_THRESHOLDS[attribute];

  return {
    id: `nen.awakening.standard.${attribute}`,
    summary: `${attribute.toUpperCase()} ${minimum} or higher`,
    requirement: {
      type: "attributeMinimum",
      attribute,
      layer: AWAKENING_ATTRIBUTE_LAYER,
      minimum,
    },
  };
}


/**
 * The five requirements a standard awakening — and a standard REawakening —
 * must satisfy.
 *
 * One bundle for both routes, because the rule is that a reawakening keeps the
 * standard thresholds. A second bundle for reawakening would be two places to
 * change the day a threshold moves, and the one that got missed would let a
 * reverted character back in cheaper than a first-timer.
 */
export const STANDARD_AWAKENING_REQUIREMENTS: readonly NamedRequirement[] =
  STANDARD_AWAKENING_ATTRIBUTES.map(thresholdRequirement);


/**
 * The SPI floor an instinctive awakening requires.
 *
 * A separate bundle rather than an addition to the standard one, because
 * instinctive awakening does not apply the standard thresholds at all — it
 * applies this one gate plus an explicit authorization, and a character at
 * CON 8 / SPI 22 is a legitimate instinctive candidate.
 */
export const INSTINCTIVE_AWAKENING_REQUIREMENTS: readonly NamedRequirement[] = [
  {
    id: "nen.awakening.instinctive.spi",
    summary: `SPI ${INSTINCTIVE_AWAKENING_MINIMUM_SPI} or higher`,
    requirement: {
      type: "attributeMinimum",
      attribute: "spi",
      layer: AWAKENING_ATTRIBUTE_LAYER,
      minimum: INSTINCTIVE_AWAKENING_MINIMUM_SPI,
    },
  },
];


/*
 * What a bundle of requirements made of this character.
 *
 * Carries the per-requirement resolutions alongside the verdict rather than
 * only the verdict, so a refusal can say WHICH threshold was missed — the
 * whole reason the resolutions carry their own summaries.
 */
export interface NenEligibilityReport {
  readonly disposition: RequirementDisposition;
  readonly resolutions: readonly NamedRequirementResolution[];

  /*
   * Whether the bundle was applied at all.
   *
   * False for abrupt awakening, which has no minimums by rule, and for an
   * exceptional source that overrode eligibility. Recorded rather than implied
   * by an empty resolution list, because "nothing was required" and "nothing
   * was checked" are different and only the second is a bypass.
   */
  readonly applied: boolean;
}


/** A report for a route that applies no thresholds at all. */
export function bypassedEligibility(): NenEligibilityReport {
  return { disposition: "satisfied", resolutions: [], applied: false };
}


/**
 * Judge a requirement bundle, preserving all three dispositions.
 *
 * Pure: it reads the context it is handed and decides nothing about what
 * should happen next. Whether an `unresolved` bundle blocks a transition is
 * the transition's decision, and every one of them makes it the same way —
 * only `satisfied` proceeds.
 */
export function resolveNenEligibility(
  requirements: readonly NamedRequirement[],
  context: RequirementContext,
): NenEligibilityReport {
  const resolutions = resolveNamedRequirements(requirements, context);

  return {
    disposition: namedRequirementDisposition(resolutions),
    resolutions,
    applied: true,
  };
}


/** The standard thresholds, judged. Used by standard awakening and reawakening. */
export function resolveStandardAwakeningEligibility(
  context: RequirementContext,
): NenEligibilityReport {
  return resolveNenEligibility(STANDARD_AWAKENING_REQUIREMENTS, context);
}


export function resolveInstinctiveAwakeningEligibility(
  context: RequirementContext,
): NenEligibilityReport {
  return resolveNenEligibility(INSTINCTIVE_AWAKENING_REQUIREMENTS, context);
}


/**
 * The requirements that were not met, for a diagnostic.
 *
 * Includes `unresolved` ones, and the caller is expected to say which kind
 * each was — an `unsatisfied` requirement is something the character can go
 * and fix, and an `unresolved` one is something their sheet has not recorded.
 */
export function unmetRequirements(
  report: NenEligibilityReport,
): readonly NamedRequirementResolution[] {
  return report.resolutions.filter(
    (resolution) => resolution.disposition !== "satisfied",
  );
}
