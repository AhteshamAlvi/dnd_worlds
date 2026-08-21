/*
 * Concealment calculations.
 *
 * Concealment represents suppressing the signs by which a particular sense
 * could detect the character.
 *
 * Concealment uses:
 *
 *   DEX modifier
 *   + WIS modifier
 *   + resolved sense Concealment modifier
 *
 * Concealment Score:
 *
 *   d20
 *   + DEX modifier
 *   + WIS modifier
 *   + sense modifier
 *
 * Concealment is resolved independently for each sense.
 *
 * A character may therefore be concealed from one sense while remaining
 * obvious to another.
 *
 * Examples:
 *
 * - concealed from sight but obvious to hearing;
 * - concealed from aura but plainly visible;
 * - concealed from smell but easy to hear.
 *
 * This file owns Concealment calculations only.
 *
 * It does NOT own:
 *
 * - attribute-modifier derivation;
 * - dice generation;
 * - Detection calculations;
 * - Detection vs Concealment resolution;
 * - sense availability;
 * - range;
 * - line of sight;
 * - wall interaction;
 * - Foundry visibility;
 * - Nen-specific modifiers;
 * - validation.
 *
 * Sense availability does not determine whether a character can conceal
 * itself from that sense. Availability describes whether the character can
 * use a sense for Detection, not whether other creatures can detect the
 * character through that sense.
 */

import type {
  DetectionSenseId,
} from "./types";


/* -------------------------------------------------------------------------- */
/* Concealment modifiers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Inputs required to calculate the modifier for a Concealment attempt.
 *
 * Attribute modifiers are supplied already derived. This subsystem does not
 * determine how raw DEX or WIS values become attribute modifiers.
 *
 * `senseModifier` should normally be the `concealmentModifier` of the chosen
 * sense from the character's ResolvedDetectionProfile.
 */
export interface ConcealmentModifierInput {
  readonly dexterityModifier: number;

  readonly wisdomModifier: number;

  readonly senseModifier: number;
}


/**
 * Complete breakdown of the modifiers contributing to Concealment.
 *
 * Keeping the individual components allows tracing, Workbench inspection,
 * Foundry display, and future mechanics to understand where the final modifier
 * came from without recomputing it.
 */
export interface ConcealmentModifierBreakdown {
  readonly dexterityModifier: number;

  readonly wisdomModifier: number;

  readonly senseModifier: number;

  readonly totalModifier: number;
}


/**
 * Calculates the complete modifier breakdown for a Concealment attempt.
 */
export function calculateConcealmentModifiers(
  input: ConcealmentModifierInput,
): ConcealmentModifierBreakdown {
  const {
    dexterityModifier,
    wisdomModifier,
    senseModifier,
  } = input;

  return {
    dexterityModifier,
    wisdomModifier,
    senseModifier,
    totalModifier:
      dexterityModifier
      + wisdomModifier
      + senseModifier,
  };
}


/* -------------------------------------------------------------------------- */
/* Concealment                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Inputs required for a Concealment attempt.
 *
 * The d20 result is supplied by the caller rather than generated here. This
 * keeps Concealment calculations deterministic and allows dice systems,
 * Foundry, tests, and future integrations to own roll generation.
 */
export interface ConcealmentInput
  extends ConcealmentModifierInput {
  readonly sense: DetectionSenseId;

  readonly roll: number;
}


/**
 * Result of a Concealment attempt against one specific sense.
 *
 * The resulting `score` becomes the target number that Detection must contest.
 */
export interface ConcealmentScore {
  readonly sense: DetectionSenseId;

  readonly roll: number;

  readonly modifiers: ConcealmentModifierBreakdown;

  readonly score: number;
}


/**
 * Calculates a Concealment Score.
 *
 * Formula:
 *
 *   d20
 *   + DEX modifier
 *   + WIS modifier
 *   + sense Concealment modifier
 */
export function calculateConcealment(
  input: ConcealmentInput,
): ConcealmentScore {
  const modifiers = calculateConcealmentModifiers(input);

  return {
    sense: input.sense,
    roll: input.roll,
    modifiers,
    score:
      input.roll
      + modifiers.totalModifier,
  };
}