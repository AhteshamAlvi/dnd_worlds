/*
 * The Character Stat block: attributes plus Strength.
 *
 * Strength stopped being a stored Attribute when it became derived from
 * physics, but it did not stop being a Stat — derived attributes still average
 * it alongside AGI and DEX, and a character sheet still shows it in the same
 * column. What changed is where it comes from.
 *
 * So there are two closed sets, and keeping them distinct is the point:
 *
 *   AttributeKey      what a character STORES and progression writes
 *   CharacterStatKey  what rules and derived attributes READ
 *
 * The second is the first plus "str". Modelling Strength as a fake stored
 * Attribute would have been the cheaper change and would have reintroduced the
 * exact problem the Body refactor exists to remove: a second source of truth
 * that can disagree with the physics.
 */

import { ATTRIBUTE_KEYS } from "./base";
import type { AttributeKey, Attributes } from "./types";


/*
 * The Stat every rule and derived attribute may read.
 */
export type CharacterStatKey = AttributeKey | "str";

export const CHARACTER_STAT_KEYS = [
  "str",
  ...ATTRIBUTE_KEYS,
] as const satisfies readonly CharacterStatKey[];


/*
 * A complete stat line: the stored-and-modified attributes, plus the Strength
 * that fell out of the body.
 */
export type CharacterStats = Attributes & {
  readonly str: number;
};


/*
 * Assembles a stat block from resolved attributes and a Body-derived Strength.
 *
 * Deliberately a function rather than a spread at every call site, so that
 * "where does STR come from" has exactly one answer and cannot be quietly
 * satisfied with a stored value somebody happened to have lying around.
 */
export function createCharacterStats(
  attributes: Attributes,
  displayedStrength: number,
): CharacterStats {
  return { ...attributes, str: displayedStrength };
}


export function isCharacterStatKey(key: string): key is CharacterStatKey {
  return (CHARACTER_STAT_KEYS as readonly string[]).includes(key);
}
