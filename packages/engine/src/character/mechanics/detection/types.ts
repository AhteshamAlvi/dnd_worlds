/*
 * Detection-domain value shapes.
 *
 * Detection is a general character mechanic rather than a Nen-specific one.
 *
 * The engine recognizes six detection senses:
 *
 * - sight
 * - hearing
 * - smell
 * - taste
 * - touch
 * - aura
 *
 * Aura functions as the supernatural "sixth sense" used to perceive Aura,
 * Life Force, and similar supernatural presence.
 *
 * A character may have different inherent capabilities in each sense.
 * Traits, Skills, Techniques, Nen Principles, Conditions, Equipment, and
 * other mechanics may later modify those inherent values.
 *
 *
 * DETECTION
 * ---------
 *
 * Detection represents noticing a concealed target through a particular
 * sense.
 *
 * Detection is based on:
 *
 *   PER
 *   + WIS
 *   + sense-specific Detection modifiers
 *
 *
 * CONCEALMENT
 * -----------
 *
 * Concealment represents suppressing the signs by which a particular sense
 * could detect the character.
 *
 * Concealment is based on:
 *
 *   DEX
 *   + WIS
 *   + sense-specific Concealment modifiers
 *
 *
 * This file defines sensory state value shapes only.
 *
 * It does NOT own:
 *
 * - attribute-modifier derivation;
 * - Detection or Concealment roll formulas;
 * - active Detection;
 * - passive Detection;
 * - Detection or Concealment scores;
 * - Detection contests;
 * - sense range;
 * - line of sight;
 * - wall interaction;
 * - Foundry visibility;
 * - Nen-specific modifiers such as Zetsu, In, or Gyō;
 * - resolution;
 * - validation.
 */


/* -------------------------------------------------------------------------- */
/* Senses                                                                     */
/* -------------------------------------------------------------------------- */

export const DETECTION_SENSE_IDS = [
  "sight",
  "hearing",
  "smell",
  "taste",
  "touch",
  "aura",
] as const;


/**
 * Canonical identifier for one of the engine's six detection senses.
 */
export type DetectionSenseId =
  typeof DETECTION_SENSE_IDS[number];


/* -------------------------------------------------------------------------- */
/* Inherent sense values                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A character's inherent state for one detection sense.
 *
 * These values describe the character before external or temporary modifiers
 * are applied.
 *
 * `available` determines whether the character can ordinarily perform
 * Detection through this sense.
 *
 * Availability applies to using the sense for Detection. It does not determine
 * whether other creatures can detect this character through the same sense.
 *
 * For example:
 *
 * - a blind creature may have `sight.available = false`;
 * - an ordinary unawakened human may have `aura.available = false`;
 * - a supernatural species may possess Aura perception inherently.
 *
 * An unavailable sense is not equivalent to an available sense with a +0
 * Detection modifier.
 *
 * Detection and Concealment modifiers remain separate because a creature may
 * be naturally exceptional at perceiving through a sense without being
 * exceptional at concealing itself from that sense, or vice versa.
 *
 * Examples:
 *
 * - a wolf may have a large inherent Smell Detection modifier;
 * - a camouflaged species may have an inherent Sight Concealment modifier;
 * - a supernatural species may have an inherent Aura Detection modifier.
 *
 * Attribute contributions are deliberately not stored here.
 *
 * Detection later combines the sense modifier with PER and WIS.
 * Concealment later combines the sense modifier with DEX and WIS.
 */
export interface InherentDetectionSense {
  /**
   * Whether this sense can ordinarily be used for Detection.
   */
  readonly available: boolean;

  /**
   * Inherent sense-specific contribution to Detection through this channel.
   *
   * PER and WIS are applied later by Detection mechanics.
   */
  readonly detectionModifier: number;

  /**
   * Inherent sense-specific contribution to concealing this character from
   * Detection through this channel.
   *
   * DEX and WIS are applied later by Concealment mechanics.
   */
  readonly concealmentModifier: number;
}


/**
 * The character's complete inherent sensory profile.
 *
 * Every sense is represented explicitly, including unavailable senses. This
 * allows consumers to access every sense without optional-property handling
 * while preserving the distinction between:
 *
 *   available: true, detectionModifier: 0
 *
 * and:
 *
 *   available: false
 */
export type InherentDetectionProfile =
  Readonly<
    Record<
      DetectionSenseId,
      InherentDetectionSense
    >
  >;


/* -------------------------------------------------------------------------- */
/* Resolved sense values                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Final usable state for one detection sense after all applicable modifiers
 * have been resolved.
 *
 * Potential modifier sources include:
 *
 * - Species;
 * - Traits;
 * - Conditions;
 * - Skills;
 * - Techniques;
 * - Equipment;
 * - Nen Principles;
 * - other universal Effects.
 *
 * These fields still represent only sense-specific state.
 *
 * Attribute contributions are deliberately not included:
 *
 * Detection:
 *
 *   PER modifier
 *   + WIS modifier
 *   + resolved detectionModifier
 *
 * Concealment:
 *
 *   DEX modifier
 *   + WIS modifier
 *   + resolved concealmentModifier
 *
 * Resolution may also change whether a sense is available. For example, an
 * Effect could temporarily suppress an existing sense or grant access to a
 * sense the character does not inherently possess.
 */
export interface ResolvedDetectionSense {
  /**
   * Whether this sense is currently usable for Detection after resolution.
   */
  readonly available: boolean;

  /**
   * Final sense-specific Detection modifier after applicable effects.
   */
  readonly detectionModifier: number;

  /**
   * Final sense-specific Concealment modifier after applicable effects.
   */
  readonly concealmentModifier: number;
}


/**
 * The character's fully resolved six-sense profile.
 *
 * Like the inherent profile, every recognized sense is represented
 * explicitly.
 */
export type ResolvedDetectionProfile =
  Readonly<
    Record<
      DetectionSenseId,
      ResolvedDetectionSense
    >
  >;