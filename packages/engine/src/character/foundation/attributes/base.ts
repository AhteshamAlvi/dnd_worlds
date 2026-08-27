/*
 * The base attribute ladder: which attributes exist, in what order, the
 * range a stored score is allowed to occupy, and how each attribute is
 * decided at character creation.
 *
 * Source: Rulebook "01 Core Rules/Attributes". These describe *stored*
 * values — the numbers the player authored and progression writes, before
 * any Trait, Condition or Item has been applied. Anything that adjusts a
 * score is a modifier (modifiers.ts); the two stages those modifiers produce
 * are Base and Resolved (resolution.ts).
 */

import type { AttributeKey } from "./types";

// Iteration order for anything that walks every attribute in turn. The
// `satisfies` clause makes a missing or misspelled key a compile error.
export const ATTRIBUTE_KEYS = [
  "str",
  "agi",
  "dex",
  "con",
  "vit",
  "int",
  "wis",
  "per",
  "spi",
  "cha",
] as const satisfies readonly AttributeKey[];

// The legal *stored* range, matching the 1-30 ladder in the Rulebook. Only
// authored scores are held to it. Base and Resolved scores may fall outside:
// a Trait or injury is allowed to push a score below 1, and clamping that
// silently would hide the penalty.
export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 30;

/**
 * Attributes assigned from the Level 1 starting array and increasable by
 * ordinary Stat Points during progression.
 *
 * See progression/stats.ts for the starting array itself and for spending
 * Stat Points.
 */
export const ORDINARY_ATTRIBUTE_KEYS = [
  "str",
  "agi",
  "dex",
  "con",
  "vit",
  "int",
  "wis",
  "per",
] as const satisfies readonly AttributeKey[];

/**
 * Attributes decided by a roll at character creation rather than the
 * starting array, and not increasable by ordinary Stat Points.
 *
 * These may still be permanently increased through a Limited Stat Point
 * grant (progression/stats.ts).
 */
export const ROLLED_ATTRIBUTE_KEYS = [
  "spi",
  "cha",
] as const satisfies readonly AttributeKey[];

export type OrdinaryAttributeKey = typeof ORDINARY_ATTRIBUTE_KEYS[number];
export type RolledAttributeKey = typeof ROLLED_ATTRIBUTE_KEYS[number];

/**
 * Determine whether an Attribute is one of the eight ordinarily trainable
 * Attributes, as opposed to a rolled Attribute (SPI, CHA).
 */
export function isOrdinaryAttributeKey(
  key: AttributeKey,
): key is OrdinaryAttributeKey {
  return (ORDINARY_ATTRIBUTE_KEYS as readonly string[]).includes(key);
}
