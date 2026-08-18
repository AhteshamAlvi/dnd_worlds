/*
 * Traits — permanent characteristics that adjust what a character is capable
 * of, independent of training.
 *
 * A Trait's mechanical effect is expressed as AttributeModifiers, which
 * attribute resolution applies on top of the stored scores. Traits never edit
 * the stored numbers, so the sheet can always show base and resolved side by
 * side.
 */

import {
  createRegistry,
  scanReferences,
  type Definition,
} from "../../infrastructure/registry";
import type { AttributeModifier } from "../foundation/attributes/modifiers";

/**
 * Stable semantic identifier for a Trait definition.
 *
 * Examples: "one-armed", "ambidextrous", "pain-tolerance".
 */
export type TraitId = string;

/**
 * A permanent Attribute adjustment contributed by a Trait.
 *
 * Permanent is the operative word: temporary changes belong to Conditions,
 * injuries and equipment, which contribute the same modifier shape through a
 * different source.
 */
export type TraitAttributeModifier = AttributeModifier;

/**
 * The engine-owned definition of a Trait.
 *
 * Character data references this by id rather than copying the rule onto each
 * character.
 */
export interface TraitDefinition extends Definition {
  /**
   * Optional permanent Attribute modifiers.
   *
   * Example: One Armed -> DEX -2.
   */
  readonly attributeModifiers?: readonly TraitAttributeModifier[];
}

/**
 * A Trait possessed by a particular character.
 */
export interface CharacterTrait {
  readonly traitId: TraitId;
}

export const TRAIT_DEFINITIONS = {
  "one-armed": {
    id: "one-armed",
    name: "One Armed",
    description: "The character permanently has only one functional arm.",
    attributeModifiers: [
      {
        attribute: "dex",
        amount: -2,
      },
    ],
  },
} as const satisfies Record<string, TraitDefinition>;

const TRAIT_REGISTRY = createRegistry<TraitDefinition>(
  "Trait",
  TRAIT_DEFINITIONS,
);

export type KnownTraitId = keyof typeof TRAIT_DEFINITIONS;

export function isKnownTraitId(traitId: TraitId): boolean {
  return TRAIT_REGISTRY.isKnownId(traitId);
}

export function getTraitDefinition(
  traitId: TraitId,
): TraitDefinition | undefined {
  return TRAIT_REGISTRY.get(traitId);
}

/*
 * Gathers the Attribute modifiers a character's Traits contribute.
 *
 * Unknown Trait ids contribute nothing rather than throwing: validation is
 * what reports them, and a half-resolved sheet is more useful to look at than
 * an exception.
 */
export function collectTraitAttributeModifiers(
  traits: readonly CharacterTrait[],
): readonly TraitAttributeModifier[] {
  return traits.flatMap(
    (trait) => getTraitDefinition(trait.traitId)?.attributeModifiers ?? [],
  );
}

export type TraitValidationIssue =
  | {
      readonly type: "unknown-trait";
      readonly traitId: TraitId;
    }
  | {
      readonly type: "duplicate-trait";
      readonly traitId: TraitId;
    };

export function findTraitValidationIssues(
  traits: readonly CharacterTrait[],
): readonly TraitValidationIssue[] {
  return scanReferences(
    traits.map((trait) => trait.traitId),
    isKnownTraitId,
  ).map((issue) => ({
    type: issue.kind === "unknown" ? "unknown-trait" : "duplicate-trait",
    traitId: issue.id,
  }));
}

/*
 * Development-time validation of the authored Trait catalog itself.
 *
 * Character validation checks whether characters reference valid Traits.
 * This checks whether our own definitions are malformed.
 */
export function findTraitCatalogIssues(): readonly string[] {
  const issues = [...TRAIT_REGISTRY.findCatalogIssues()];

  for (const trait of TRAIT_REGISTRY.all()) {
    for (const modifier of trait.attributeModifiers ?? []) {
      if (!Number.isInteger(modifier.amount)) {
        issues.push(
          `Trait "${trait.id}" has a non-integer Attribute modifier.`,
        );
      }

      if (modifier.amount === 0) {
        issues.push(
          `Trait "${trait.id}" contains a useless zero-value Attribute modifier.`,
        );
      }
    }
  }

  return issues;
}

// Exposed for the catalog index, which needs every registry in one map.
export const traitRegistry = TRAIT_REGISTRY;
