/*
 * Resolved attributes — stored scores plus every permanent adjustment.
 *
 * Only Traits contribute here so far. Conditions, injuries and equipment join
 * as separate modifier sources rather than by editing the stored numbers, so
 * the sheet can always show base and resolved side by side and explain the
 * difference.
 */

import { collectTraitAttributeModifiers } from "../../identity/traits";
import type { CharacterTrait } from "../../identity/traits";

import { applyAttributeModifiers } from "./modifiers";
import type { Attributes } from "./types";

export function resolveAttributes(
  attributes: Attributes,
  traits: readonly CharacterTrait[] = [],
): Attributes {
  return applyAttributeModifiers(
    attributes,
    collectTraitAttributeModifiers(traits),
  );
}
