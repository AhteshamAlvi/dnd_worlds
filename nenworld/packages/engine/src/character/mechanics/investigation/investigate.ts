/*
 * Investigation calculations.
 *
 * Investigation represents deliberately searching for clues, examining
 * evidence, connecting information, and drawing conclusions from what is
 * discovered.
 *
 * Investigation uses:
 *
 *   INT modifier
 *   + WIS modifier
 *   + PER modifier
 *   + resolved Investigation modifier
 *
 *
 * Active Investigation:
 *
 *   d20
 *   + INT modifier
 *   + WIS modifier
 *   + PER modifier
 *   + Investigation modifier
 *
 *
 * Passive Investigation:
 *
 *   10
 *   + INT modifier
 *   + WIS modifier
 *   + PER modifier
 *   + Investigation modifier
 *
 *
 * Attribute roles:
 *
 *   INT
 *   → reasoning, deduction, and connecting information
 *
 *   WIS
 *   → judgment, interpretation, and understanding significance
 *
 *   PER
 *   → locating relevant clues and details during examination
 *
 *
 * This file owns Investigation calculations only.
 *
 * It does NOT own:
 *
 * - attribute-modifier derivation;
 * - dice generation;
 * - Investigation DCs;
 * - Investigation resolution;
 * - Detection;
 * - environmental eligibility;
 * - validation.
 */

import type {
  ResolvedInvestigation,
} from "./types";


/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Fixed base used by passive Investigation.
 */
export const PASSIVE_INVESTIGATION_BASE = 10;


/* -------------------------------------------------------------------------- */
/* Investigation modifiers                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Inputs required to calculate an Investigation modifier.
 *
 * Attribute modifiers are supplied already derived. This subsystem does not
 * determine how raw INT, WIS, or PER values become attribute modifiers.
 *
 * `investigationModifier` should normally come from the character's
 * ResolvedInvestigation state.
 */
export interface InvestigationModifierInput {
  readonly intelligenceModifier: number;

  readonly wisdomModifier: number;

  readonly perceptionModifier: number;

  readonly investigationModifier: number;
}


/**
 * Complete breakdown of all modifiers contributing to Investigation.
 *
 * Keeping each contribution separate allows tracing, Workbench inspection,
 * Foundry display, and future mechanics to determine where the final value
 * came from.
 */
export interface InvestigationModifierBreakdown {
  readonly intelligenceModifier: number;

  readonly wisdomModifier: number;

  readonly perceptionModifier: number;

  readonly investigationModifier: number;

  readonly totalModifier: number;
}


/**
 * Calculates the complete modifier breakdown for Investigation.
 */
export function calculateInvestigationModifiers(
  input: InvestigationModifierInput,
): InvestigationModifierBreakdown {
  const {
    intelligenceModifier,
    wisdomModifier,
    perceptionModifier,
    investigationModifier,
  } = input;

  return {
    intelligenceModifier,
    wisdomModifier,
    perceptionModifier,
    investigationModifier,
    totalModifier:
      intelligenceModifier
      + wisdomModifier
      + perceptionModifier
      + investigationModifier,
  };
}


/**
 * Creates Investigation modifier inputs from a resolved Investigation state.
 *
 * Attribute modifiers remain explicit inputs because Investigation does not
 * own attribute derivation.
 */
export function createInvestigationModifierInput(
  resolved: ResolvedInvestigation,
  intelligenceModifier: number,
  wisdomModifier: number,
  perceptionModifier: number,
): InvestigationModifierInput {
  return {
    intelligenceModifier,
    wisdomModifier,
    perceptionModifier,
    investigationModifier: resolved.modifier,
  };
}


/* -------------------------------------------------------------------------- */
/* Active Investigation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Inputs required for an active Investigation attempt.
 *
 * The d20 result is supplied by the caller rather than generated here. This
 * keeps Investigation deterministic and allows dice systems, Foundry, tests,
 * and future integrations to own roll generation.
 */
export interface ActiveInvestigationInput
  extends InvestigationModifierInput {
  readonly roll: number;
}


/**
 * Result of an active Investigation attempt.
 */
export interface ActiveInvestigationScore {
  readonly attemptType: "active";

  readonly roll: number;

  readonly modifiers: InvestigationModifierBreakdown;

  readonly score: number;
}


/**
 * Calculates an active Investigation score.
 *
 * Formula:
 *
 *   d20
 *   + INT modifier
 *   + WIS modifier
 *   + PER modifier
 *   + Investigation modifier
 */
export function calculateActiveInvestigation(
  input: ActiveInvestigationInput,
): ActiveInvestigationScore {
  const modifiers = calculateInvestigationModifiers(input);

  return {
    attemptType: "active",
    roll: input.roll,
    modifiers,
    score:
      input.roll
      + modifiers.totalModifier,
  };
}


/* -------------------------------------------------------------------------- */
/* Passive Investigation                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Inputs required for passive Investigation.
 */
export interface PassiveInvestigationInput
  extends InvestigationModifierInput {}


/**
 * Result of a passive Investigation calculation.
 */
export interface PassiveInvestigationScore {
  readonly attemptType: "passive";

  readonly base: number;

  readonly modifiers: InvestigationModifierBreakdown;

  readonly score: number;
}


/**
 * Calculates a passive Investigation score.
 *
 * Formula:
 *
 *   10
 *   + INT modifier
 *   + WIS modifier
 *   + PER modifier
 *   + Investigation modifier
 */
export function calculatePassiveInvestigation(
  input: PassiveInvestigationInput,
): PassiveInvestigationScore {
  const modifiers = calculateInvestigationModifiers(input);

  return {
    attemptType: "passive",
    base: PASSIVE_INVESTIGATION_BASE,
    modifiers,
    score:
      PASSIVE_INVESTIGATION_BASE
      + modifiers.totalModifier,
  };
}


/* -------------------------------------------------------------------------- */
/* Investigation score                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Any calculated Investigation score.
 *
 * `attemptType` acts as the discriminant:
 *
 * - active results contain the d20 roll;
 * - passive results contain the fixed passive base.
 */
export type InvestigationScore =
  | ActiveInvestigationScore
  | PassiveInvestigationScore;