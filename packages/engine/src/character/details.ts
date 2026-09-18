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


/*
 * A character's natural Nen affinity is NOT here.
 *
 * It was, as a plain optional field, and for a while it was here AND on Nen
 * state — two writable values with nothing keeping them in step, so a
 * character could be an Enhancer on one and an Emitter on the other and both
 * would validate.
 *
 * The canonical value is `character.nen.affinity`, which also records the lean
 * and whether anybody has established it. A record written before that was true
 * migrates through adoptLegacyNenType(), which refuses a legacy value that
 * contradicts the canonical one rather than silently picking a winner.
 *
 * The TYPE is still re-exported from here, because callers import it from this
 * module and it is still a description of a character.
 */
export type { NenType } from "./foundation/nen/nen-type";


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
}