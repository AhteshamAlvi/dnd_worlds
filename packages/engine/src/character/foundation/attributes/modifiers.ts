/*
 * Attribute modifiers — a named adjustment to one attribute score.
 *
 * Traits contribute these permanently. Conditions, injuries and equipment
 * will contribute them temporarily. The shape is deliberately shared so
 * resolution has one kind of thing to apply rather than one code path per
 * source of adjustment.
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
