/*
 * Conditions — temporary states a character is currently under.
 *
 * Source: Rulebook "04 Combat/Injury Recovery and Conditions.md", condition
 * glossary.
 *
 * The catalog is the authored list and its effects as written. Turning those
 * effects into numbers — the d20 penalties, the halved Strike, the advantage
 * swings — is resolution.ts's job, and that needs the combat layer to exist
 * first. Until then a Condition is something a sheet can carry, display and
 * validate, but not yet something the engine arithmetic reads.
 */

import {
  createRegistry,
  scanReferences,
  type Definition,
} from "../../infrastructure/registry";

export type ConditionId = string;

export type ConditionDefinition = Definition;

/**
 * A Condition currently affecting a character.
 */
export interface CharacterCondition {
  readonly conditionId: ConditionId;
}

export const CONDITION_DEFINITIONS = {
  frightened: {
    id: "frightened",
    name: "Frightened",
    description:
      "Disadvantage on checks and attacks while the source is visible; cannot approach it.",
  },

  paralyzed: {
    id: "paralyzed",
    name: "Paralyzed",
    description:
      "No actions, moves or reactions; melee attacks against the character have advantage.",
  },

  numbed: {
    id: "numbed",
    name: "Numbed",
    description: "-2 to all d20s; Strike halved.",
  },

  prone: {
    id: "prone",
    name: "Prone",
    description:
      "Melee against the character +2; the character's attacks -2; half move to stand.",
  },

  grappled: {
    id: "grappled",
    name: "Grappled",
    description: "No movement.",
  },

  restrained: {
    id: "restrained",
    name: "Restrained",
    description:
      "No movement and no reactions; attacks against the character have advantage.",
  },

  blinded: {
    id: "blinded",
    name: "Blinded",
    description:
      "Attacks at disadvantage; EVA -4 against the unseen. En negates this entirely.",
  },

  exhausted: {
    id: "exhausted",
    name: "Exhausted",
    description:
      "Disadvantage on everything. The 0 AP state, and the state forced marches end in.",
  },

  "flat-footed": {
    id: "flat-footed",
    name: "Flat-footed",
    description:
      "No reactions and no Allocation; Ten shroud only. The surprised state.",
  },

  marked: {
    id: "marked",
    name: "Marked",
    description:
      "A tracker ability holds the character's position; they cannot hide from that user.",
  },

  leaking: {
    id: "leaking",
    name: "Leaking",
    description:
      "The fresh-awakener state: -2 to all, and aura visible to any Nen user.",
  },
} as const satisfies Record<string, ConditionDefinition>;

const CONDITION_REGISTRY = createRegistry<ConditionDefinition>(
  "Condition",
  CONDITION_DEFINITIONS,
);

export type KnownConditionId = keyof typeof CONDITION_DEFINITIONS;

export function isKnownConditionId(
  conditionId: ConditionId,
): boolean {
  return CONDITION_REGISTRY.isKnownId(conditionId);
}

export function getConditionDefinition(
  conditionId: ConditionId,
): ConditionDefinition | undefined {
  return CONDITION_REGISTRY.get(conditionId);
}

export type ConditionValidationIssue =
  | {
      readonly type: "unknown-condition";
      readonly conditionId: ConditionId;
    }
  | {
      readonly type: "duplicate-condition";
      readonly conditionId: ConditionId;
    };

export function findConditionValidationIssues(
  conditions: readonly CharacterCondition[],
): readonly ConditionValidationIssue[] {
  return scanReferences(
    conditions.map((condition) => condition.conditionId),
    isKnownConditionId,
  ).map((issue) => ({
    type:
      issue.kind === "unknown" ? "unknown-condition" : "duplicate-condition",
    conditionId: issue.id,
  }));
}

export function findConditionCatalogIssues(): readonly string[] {
  return CONDITION_REGISTRY.findCatalogIssues();
}

// Exposed for the catalog index, which needs every registry in one map.
export const conditionRegistry = CONDITION_REGISTRY;
