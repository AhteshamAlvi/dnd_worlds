/*
 * Core derived-attribute domain types.
 *
 * Derived Attributes are character-facing values calculated from the
 * character's resolved Attributes.
 *
 * They represent broadly reusable capabilities that may be consumed by
 * combat, checks, skills, techniques, detection, movement, and other systems.
 *
 * This file defines only the shared value shapes. Calculation logic belongs
 * in derived/resolution.ts.
 *
 *
 * DERIVED ATTRIBUTES ARE COMPUTED, NEVER STORED
 * ---------------------------------------------
 *
 * There is deliberately no `modifyDerivedAttribute` Effect, and no persistent
 * Derived Attribute state on a character.
 *
 * A Trait that should make a character more acrobatic raises AGI or DEX; the
 * Acrobatics value follows automatically because it is recalculated from the
 * resolved Attributes every time the character is resolved. Allowing content
 * to write a Derived Attribute directly would create a second source of truth
 * that could disagree with the Attributes it is supposed to summarize.
 *
 * Situational bonuses that apply only to a particular check — a Skill, a
 * Technique, a sense-specific Trait such as Keen Eyes — are not score changes
 * at all. They are `modifyCheck` Effects scoped to a Derived Attribute (see
 * rules/effects.ts) and are applied at resolution time by
 * rules/resolution.ts's resolveCheckModifier, never folded into the stored
 * value here.
 */


/**
 * Complete resolved set of Derived Attributes for a character.
 */
export interface DerivedAttributes {
  /**
   * General combat capability derived from:
   *
   * STR, AGI, DEX, PER, WIS
   */
  readonly combatAbility: number;

  /**
   * General forceful physical capability derived from:
   *
   * STR, AGI
   *
   * Used for movement-related physical activity such as running,
   * climbing, jumping, swimming, and similar exertion.
   */
  readonly athletics: number;

  /**
   * General body-control capability derived from:
   *
   * AGI, DEX
   */
  readonly acrobatics: number;

  /**
   * General physical precision and targeting capability derived from:
   *
   * DEX, PER
   */
  readonly accuracy: number;

  /**
   * Base sensory detection capability derived from:
   *
   * PER, WIS
   *
   * Sense-specific, situational, equipment, trait, skill, and technique
   * modifiers are applied by the systems performing the detection check.
   */
  readonly detection: number;

  /**
   * Base concealment capability derived from:
   *
   * DEX, WIS
   *
   * Sense-specific, situational, equipment, trait, skill, and technique
   * modifiers are applied by the systems performing the concealment check.
   */
  readonly concealment: number;

  /**
   * General investigative capability derived from:
   *
   * INT, WIS, PER
   */
  readonly investigation: number;

  /**
   * General physical stamina capability derived from:
   *
   * CON, VIT
   *
   * Combat-specific Stamina mechanics may consume this value but are not
   * defined by the Derived Attributes system.
   */
  readonly stamina: number;

  /**
   * General mental and spiritual resistance derived from:
   *
   * WIS, SPI
   */
  readonly willpower: number;

  /**
   * General intimidating presence derived from:
   *
   * CHA, SPI
   */
  readonly intimidation: number;
}


/**
 * Names of all supported Derived Attributes.
 *
 * Derived from the interface rather than restated as a literal union, the
 * same way AttributeKey is `keyof Attributes` — a hand-written second list
 * can drift from the shape it is supposed to describe.
 */
export type DerivedAttributeName = keyof DerivedAttributes;


/**
 * Iteration order for anything that walks every Derived Attribute in turn.
 *
 * The `satisfies` clause makes a misspelled name a compile error, matching
 * ATTRIBUTE_KEYS in attributes/base.ts. A name *omitted* from this list is
 * caught one layer up instead: resolveDerivedScores builds a
 * Record<DerivedAttributeName, ...> from it, which does not typecheck unless
 * every name is present.
 */
export const DERIVED_ATTRIBUTE_NAMES = [
  "combatAbility",
  "athletics",
  "acrobatics",
  "accuracy",
  "detection",
  "concealment",
  "investigation",
  "stamina",
  "willpower",
  "intimidation",
] as const satisfies readonly DerivedAttributeName[];