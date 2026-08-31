/*
 * Basic personal and physical details belonging to an individual character.
 *
 * These values describe the character rather than defining a standalone
 * mechanical system.
 *
 * Mechanical systems may consume these values later:
 *
 * - Age may eventually interact with species-specific aging or maturity.
 * - Nen Type may eventually integrate directly with the Nen system.
 *
 * For now, these values are stored without applying those mechanics here.
 *
 * Height and weight are deliberately NOT here. They are resolved from Body —
 * from anatomy, Effective Scale and morphology — and an authored copy
 * alongside a derived one is two sources that can disagree, with nothing to
 * say which is right. A character who is described as 180 cm and whose body
 * resolves to 165 cm is a bug, not a character.
 *
 * Name is required because every Character has a basic personal identity.
 * Everything else is optional so the workbench can construct characters
 * incrementally.
 */


/**
 * A character's gender.
 *
 * This is currently descriptive character data. It does not itself apply
 * mechanical effects.
 *
 * Additional values can be added later if the setting requires them.
 */
export type Gender =
  | "male"
  | "female"
  | "other"
  | "unspecified";


/**
 * A character's natural Nen affinity.
 *
 * This is stored here as character data for now.
 *
 * Once Nen affinity mechanics are implemented, this type can move into
 * foundation/nen/types.ts and be imported here instead.
 */
export type NenType =
  | "enhancement"
  | "transmutation"
  | "emission"
  | "conjuration"
  | "manipulation"
  | "specialization";


export interface CharacterDetails {
  readonly name: string;

  /**
   * Chronological age in years.
   *
   * Age does not imply Level. An older character may still be Level 1,
   * while a younger prodigy may possess a much higher Level.
   */
  readonly age?: number;

  readonly gender?: Gender;

  /**
   * Natural Nen affinity.
   *
   * Absence currently means the value has not been assigned or established.
   * Nen mechanics do not yet depend on this field.
   */
  readonly nenType?: NenType;
}