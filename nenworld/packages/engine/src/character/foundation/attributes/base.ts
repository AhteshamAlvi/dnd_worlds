/*
 * The base attribute ladder: which attributes exist, in what order, and the
 * range a stored score is allowed to occupy.
 *
 * Source: Rulebook "01 Core Rules/Attributes". These describe stored/base
 * values — the numbers on the sheet before Traits, Conditions or equipment
 * touch them. Anything that adjusts a score is a modifier (modifiers.ts) and
 * the combined figure is a resolved score (resolution.ts).
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

// The legal stored range, matching the 1-30 ladder in the Rulebook. Resolved
// scores may fall outside it: a Trait or injury is allowed to push a score
// below 1, and clamping that silently would hide the penalty.
export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 30;
