/*
 * Detection calculations.
 *
 * Detection represents noticing a target through one particular sense.
 *
 * Detection uses:
 *
 *   PER modifier
 *   + WIS modifier
 *   + resolved sense Detection modifier
 *
 * Active Detection:
 *
 *   d20
 *   + PER modifier
 *   + WIS modifier
 *   + sense modifier
 *
 * Passive Detection:
 *
 *   10
 *   + PER modifier
 *   + WIS modifier
 *   + sense modifier
 *
 * This file owns Detection calculations only.
 *
 * It does NOT own:
 *
 * - attribute-modifier derivation;
 * - dice generation;
 * - Concealment calculations;
 * - Detection vs Concealment resolution;
 * - sense availability;
 * - range;
 * - line of sight;
 * - wall interaction;
 * - Foundry visibility;
 * - Nen-specific modifiers;
 * - validation.
 *
 * Callers are responsible for establishing that the chosen sense is available
 * and otherwise eligible to detect the target before using these calculations.
 */

import type {
  DetectionSenseId,
} from "./types";


/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Fixed base used by passive Detection.
 */
export const PASSIVE_DETECTION_BASE = 10;


/* -------------------------------------------------------------------------- */
/* Detection modifiers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Inputs required to calculate the modifier for a Detection attempt.
 *
 * Attribute modifiers are supplied already derived. This subsystem does not
 * determine how raw PER or WIS values become attribute modifiers.
 *
 * `senseModifier` should normally be the `detectionModifier` of the chosen
 * sense from the character's ResolvedDetectionProfile.
 */
export interface DetectionModifierInput {
  readonly perceptionModifier: number;

  readonly wisdomModifier: number;

  readonly senseModifier: number;
}


/**
 * Complete breakdown of the modifiers contributing to Detection.
 *
 * Keeping the individual components allows tracing, Workbench inspection,
 * Foundry display, and future mechanics to understand where the final modifier
 * came from without recomputing it.
 */
export interface DetectionModifierBreakdown {
  readonly perceptionModifier: number;

  readonly wisdomModifier: number;

  readonly senseModifier: number;

  readonly totalModifier: number;
}


/**
 * Calculates the complete modifier breakdown for a Detection attempt.
 */
export function calculateDetectionModifiers(
  input: DetectionModifierInput,
): DetectionModifierBreakdown {
  const {
    perceptionModifier,
    wisdomModifier,
    senseModifier,
  } = input;

  return {
    perceptionModifier,
    wisdomModifier,
    senseModifier,
    totalModifier:
      perceptionModifier
      + wisdomModifier
      + senseModifier,
  };
}


/* -------------------------------------------------------------------------- */
/* Active Detection                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Inputs required for an active Detection attempt.
 *
 * The d20 result is supplied by the caller rather than generated here. This
 * keeps Detection calculations deterministic and allows dice systems,
 * Foundry, tests, and future integrations to own roll generation.
 */
export interface ActiveDetectionInput
  extends DetectionModifierInput {
  readonly sense: DetectionSenseId;

  readonly roll: number;
}


/**
 * Result of an active Detection attempt.
 */
export interface ActiveDetectionScore {
  readonly sense: DetectionSenseId;

  readonly attemptType: "active";

  readonly roll: number;

  readonly modifiers: DetectionModifierBreakdown;

  readonly score: number;
}


/**
 * Calculates an active Detection score.
 *
 * Formula:
 *
 *   d20
 *   + PER modifier
 *   + WIS modifier
 *   + sense Detection modifier
 */
export function calculateActiveDetection(
  input: ActiveDetectionInput,
): ActiveDetectionScore {
  const modifiers = calculateDetectionModifiers(input);

  return {
    sense: input.sense,
    attemptType: "active",
    roll: input.roll,
    modifiers,
    score:
      input.roll
      + modifiers.totalModifier,
  };
}


/* -------------------------------------------------------------------------- */
/* Passive Detection                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Inputs required for passive Detection.
 */
export interface PassiveDetectionInput
  extends DetectionModifierInput {
  readonly sense: DetectionSenseId;
}


/**
 * Result of a passive Detection calculation.
 */
export interface PassiveDetectionScore {
  readonly sense: DetectionSenseId;

  readonly attemptType: "passive";

  readonly base: number;

  readonly modifiers: DetectionModifierBreakdown;

  readonly score: number;
}


/**
 * Calculates a passive Detection score.
 *
 * Formula:
 *
 *   10
 *   + PER modifier
 *   + WIS modifier
 *   + sense Detection modifier
 */
export function calculatePassiveDetection(
  input: PassiveDetectionInput,
): PassiveDetectionScore {
  const modifiers = calculateDetectionModifiers(input);

  return {
    sense: input.sense,
    attemptType: "passive",
    base: PASSIVE_DETECTION_BASE,
    modifiers,
    score:
      PASSIVE_DETECTION_BASE
      + modifiers.totalModifier,
  };
}


/* -------------------------------------------------------------------------- */
/* Detection result                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Any calculated Detection score.
 *
 * `attemptType` acts as the discriminant:
 *
 * - active results contain the d20 roll;
 * - passive results contain the fixed passive base.
 */
export type DetectionScore =
  | ActiveDetectionScore
  | PassiveDetectionScore;