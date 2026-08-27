/*
 * Investigation-domain value shapes.
 *
 * Investigation is a general character mechanic representing the ability to
 * search for clues, examine evidence, connect information, and draw useful
 * conclusions from what is discovered.
 *
 * Unlike Detection, Investigation is not divided into sensory channels.
 *
 *
 * INVESTIGATION
 * -------------
 *
 * Investigation is based on:
 *
 *   INT
 *   + WIS
 *   + PER
 *   + Investigation-specific modifiers
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
 *   → locating relevant clues and details during the investigation
 *
 * Detection and Investigation remain distinct mechanics.
 *
 * Detection answers:
 *
 *   "Can I perceive this?"
 *
 * Investigation answers:
 *
 *   "What can I find and determine by examining this?"
 *
 * Investigation may therefore involve finding clues as part of a deliberate
 * examination, while Detection handles noticing sensory signals or concealed
 * targets through the six Detection senses.
 *
 *
 * This file defines Investigation state value shapes only.
 *
 * It does NOT own:
 *
 * - attribute-modifier derivation;
 * - Investigation roll formulas;
 * - active Investigation;
 * - passive Investigation;
 * - Investigation DCs;
 * - Investigation resolution;
 * - dice generation;
 * - Detection;
 * - validation.
 */


/* -------------------------------------------------------------------------- */
/* Inherent Investigation                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A character's inherent Investigation modifier before external or temporary
 * modifiers are applied.
 *
 * This value represents only the Investigation-specific contribution.
 *
 * INT, WIS, and PER are deliberately not stored here.
 *
 * Potential inherent sources could include Species or other intrinsic
 * character properties.
 */
export interface InherentInvestigation {
  readonly modifier: number;
}


/* -------------------------------------------------------------------------- */
/* Resolved Investigation                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Final Investigation-specific modifier after all applicable character
 * mechanics have been resolved.
 *
 * Potential modifier sources include:
 *
 * - Species;
 * - Traits;
 * - Conditions;
 * - Skills;
 * - Techniques;
 * - Equipment;
 * - other universal Effects.
 *
 * Attribute contributions remain separate.
 *
 * The eventual Investigation calculation is:
 *
 *   INT modifier
 *   + WIS modifier
 *   + PER modifier
 *   + resolved modifier
 */
export interface ResolvedInvestigation {
  readonly modifier: number;
}