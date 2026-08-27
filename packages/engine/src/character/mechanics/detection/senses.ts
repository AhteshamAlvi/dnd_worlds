/*
 * Detection-sense helpers and profile construction.
 *
 * This file owns generic operations around the engine's canonical detection
 * senses.
 *
 * It does NOT own:
 *
 * - Detection calculations;
 * - Concealment calculations;
 * - Detection contests;
 * - attribute modifiers;
 * - sense range;
 * - line of sight;
 * - wall interaction;
 * - Foundry visibility;
 * - Nen-specific behavior.
 */

import {
  DETECTION_SENSE_IDS,
  type DetectionSenseId,
  type InherentDetectionProfile,
  type InherentDetectionSense,
  type ResolvedDetectionProfile,
  type ResolvedDetectionSense,
} from "./types";


/* -------------------------------------------------------------------------- */
/* Sense identification                                                       */
/* -------------------------------------------------------------------------- */

const DETECTION_SENSE_ID_SET: ReadonlySet<string> =
  new Set(DETECTION_SENSE_IDS);


/**
 * Returns whether a value is one of the engine's canonical detection senses.
 */
export function isDetectionSenseId(
  value: string,
): value is DetectionSenseId {
  return DETECTION_SENSE_ID_SET.has(value);
}


/* -------------------------------------------------------------------------- */
/* Neutral sense values                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Creates a neutral unavailable inherent sense.
 *
 * An unavailable sense cannot ordinarily be used for Detection, but its
 * Detection and Concealment modifiers still exist explicitly as zero values.
 */
export function createUnavailableInherentDetectionSense():
  InherentDetectionSense {
  return {
    available: false,
    detectionModifier: 0,
    concealmentModifier: 0,
  };
}


/**
 * Creates a neutral available inherent sense.
 *
 * The sense can be used for Detection but has no inherent Detection or
 * Concealment modifier.
 */
export function createAvailableInherentDetectionSense():
  InherentDetectionSense {
  return {
    available: true,
    detectionModifier: 0,
    concealmentModifier: 0,
  };
}


/**
 * Creates a neutral unavailable resolved sense.
 */
export function createUnavailableResolvedDetectionSense():
  ResolvedDetectionSense {
  return {
    available: false,
    detectionModifier: 0,
    concealmentModifier: 0,
  };
}


/**
 * Creates a neutral available resolved sense.
 */
export function createAvailableResolvedDetectionSense():
  ResolvedDetectionSense {
  return {
    available: true,
    detectionModifier: 0,
    concealmentModifier: 0,
  };
}


/* -------------------------------------------------------------------------- */
/* Profile construction                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Partial authored values used when constructing an inherent detection
 * profile.
 *
 * Omitted senses begin unavailable with zero Detection and Concealment
 * modifiers.
 *
 * Omitted fields within a supplied sense also use those neutral values.
 */
export type InherentDetectionProfileInput =
  Partial<
    Readonly<
      Record<
        DetectionSenseId,
        Partial<InherentDetectionSense>
      >
    >
  >;


/**
 * Constructs a complete inherent six-sense profile.
 *
 * Every canonical sense is guaranteed to exist in the returned profile.
 *
 * Any omitted sense begins as:
 *
 *   available: false
 *   detectionModifier: 0
 *   concealmentModifier: 0
 *
 * This intentionally does not assume that any particular species possesses
 * Sight, Hearing, Aura perception, or any other sense. Species and character
 * construction are responsible for specifying actual inherent capabilities.
 */
export function createInherentDetectionProfile(
  input: InherentDetectionProfileInput = {},
): InherentDetectionProfile {
  const profile = {} as Record<
    DetectionSenseId,
    InherentDetectionSense
  >;

  for (const sense of DETECTION_SENSE_IDS) {
    const supplied = input[sense];

    profile[sense] = {
      available: supplied?.available ?? false,
      detectionModifier: supplied?.detectionModifier ?? 0,
      concealmentModifier: supplied?.concealmentModifier ?? 0,
    };
  }

  return profile;
}


/**
 * Constructs an initially identical resolved profile from an inherent profile.
 *
 * This provides the starting state onto which Traits, Skills, Techniques,
 * Conditions, Equipment, Nen Principles, and other effects may later apply
 * their changes.
 *
 * No modifiers are applied here.
 */
export function createResolvedDetectionProfile(
  inherent: InherentDetectionProfile,
): ResolvedDetectionProfile {
  const profile = {} as Record<
    DetectionSenseId,
    ResolvedDetectionSense
  >;

  for (const sense of DETECTION_SENSE_IDS) {
    const source = inherent[sense];

    profile[sense] = {
      available: source.available,
      detectionModifier: source.detectionModifier,
      concealmentModifier: source.concealmentModifier,
    };
  }

  return profile;
}