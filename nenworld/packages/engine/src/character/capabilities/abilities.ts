/*
 * Abilities — extraordinary non-Nen capabilities.
 *
 * An Ability says what a character is capable of at all. A Technique says
 * what training they have put behind it. A Skill is one concrete application
 * of the two. Fire Blast needs Firebending (the Ability) and Firebending
 * Forms (the Technique); having either alone is not enough.
 */

import {
  createRegistry,
  type Definition,
} from "../../infrastructure/registry";

/**
 * Stable semantic identifier for an extraordinary non-Nen Ability.
 *
 * Examples: "firebending", "waterbending", "heat-vision".
 */
export type AbilityId = string;

export type AbilityDefinition = Definition;

/**
 * An Ability currently possessed by a character.
 */
export interface CharacterAbility {
  readonly abilityId: AbilityId;
}

export const ABILITY_DEFINITIONS = {
  firebending: {
    id: "firebending",
    name: "Firebending",
    description:
      "The extraordinary capability to generate and manipulate fire.",
  },

  waterbending: {
    id: "waterbending",
    name: "Waterbending",
    description: "The extraordinary capability to manipulate water.",
  },
} as const satisfies Record<string, AbilityDefinition>;

const ABILITY_REGISTRY = createRegistry<AbilityDefinition>(
  "Ability",
  ABILITY_DEFINITIONS,
);

export type KnownAbilityId = keyof typeof ABILITY_DEFINITIONS;

export function isKnownAbilityId(
  abilityId: AbilityId,
): boolean {
  return ABILITY_REGISTRY.isKnownId(abilityId);
}

export function getAbilityDefinition(
  abilityId: AbilityId,
): AbilityDefinition | undefined {
  return ABILITY_REGISTRY.get(abilityId);
}

export function findAbilityCatalogIssues(): readonly string[] {
  return ABILITY_REGISTRY.findCatalogIssues();
}

// Exposed for the catalog index, which needs every registry in one map.
export const abilityRegistry = ABILITY_REGISTRY;
