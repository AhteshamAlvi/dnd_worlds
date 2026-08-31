/*
 * Attribute modifiers — a named adjustment to one attribute score.
 *
 * Traits contribute these permanently. Conditions, injuries and equipment
 * will contribute them temporarily. The shape is deliberately shared so
 * resolution has one kind of thing to apply rather than one code path per
 * source of adjustment.
 *
 *
 * TWO THINGS ARE CALLED "MODIFIER"
 * --------------------------------
 *
 * The Rulebook uses the word in both directions, and conflating them is the
 * easiest mistake to make in this domain:
 *
 *   AttributeModifier (this file)
 *   → an adjustment applied TO a score.
 *     Flexible's "+2 AGI" turns a 17 into a 19.
 *
 *   standard modifier (attributes/resolution.ts)
 *   → the ±N derived FROM a score.
 *     AGI 19 yields +4, via floor((19 - 10) / 2).
 *
 * They point opposite ways: one changes the score, the other is what the
 * score is worth. A third kind — the situational "+3 to applicable AGI
 * checks" a Skill grants — is neither, and lives in rules/effects.ts as a
 * modifyCheck Effect: it never touches the score and never appears on the
 * sheet, only in the resolution of one applicable check.
 */

import type { AttributeKey, Attributes } from "./types";

export interface AttributeModifier {
  readonly attribute: AttributeKey;
  readonly amount: number;
}

/*
 * Applies modifiers to a copy, never to the input.
 *
 * The stored attributes on a character are the player's authored numbers; a
 * resolved score is derived. Mutating the input would make the two the same
 * object and quietly destroy the base values the sheet displays.
 */
export function applyAttributeModifiers(
  attributes: Attributes,
  modifiers: readonly AttributeModifier[],
): Attributes {
  // Widened to a mutable record for the accumulation, then handed back as
  // readonly Attributes.
  const resolved: Record<AttributeKey, number> = { ...attributes };

  for (const modifier of modifiers) {
    resolved[modifier.attribute] += modifier.amount;
  }

  return resolved;
}
