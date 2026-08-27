/*
 * Conditions — what is currently happening to a character.
 *
 * Source: Rulebook "04 Combat/Injury Recovery and Conditions.md", condition
 * glossary.
 *
 * The line against Traits is integration, not duration: a Condition is
 * something affecting the character, a Trait is something that has become
 * part of them. A long infection is still a Condition; what it leaves behind
 * when it finishes is a Trait.
 *
 * Conditions contribute the same universal Effects as every other content
 * source. They usually modify the Resolved layer, because that is what
 * "currently" means — but nothing here enforces that. A Condition that
 * permanently costs the character something says modifyBaseAttribute, and a
 * Condition granting a Skill or a Trait uses the ordinary grant Effects.
 *
 * A Condition may also progress through stages, stack in severity, and
 * expire — see status/stage.ts for that shared vocabulary. None of the
 * entries below use it; the eleven Rulebook conditions are catalog
 * *classification* only, with no Effects authored onto them at all. That is
 * deliberate, not an oversight: their d20 penalties, halved Strike and
 * advantage swings are not expressible as Effects yet — those need combat
 * mechanics that do not exist, which is a missing *mechanic*, the case where
 * the engine is supposed to gain code rather than the content gaining a
 * workaround. What effects any Condition carries — combat or otherwise — is
 * for the Workbench to author.
 */

import {
  createRegistry,
  scanReferences,
} from "../../infrastructure/registry";

import type { EffectfulDefinition } from "../rules/content";
import {
  findStagedEntryValidationIssues,
  findStageTrackIssues,
  type StagedCharacterEntry,
  type StagedContent,
  type StagedEntryValidationIssue,
} from "./stage";

export type ConditionId = string;

export interface ConditionDefinition extends EffectfulDefinition, StagedContent {}

/**
 * A Condition currently affecting a character.
 */
export interface CharacterCondition extends StagedCharacterEntry {
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
    }
  | {
      readonly type: "invalid-condition-lifecycle";
      readonly conditionId: ConditionId;
      readonly issue: StagedEntryValidationIssue;
    };

export function findConditionValidationIssues(
  conditions: readonly CharacterCondition[],
): readonly ConditionValidationIssue[] {
  const issues: ConditionValidationIssue[] = scanReferences(
    conditions.map((condition) => condition.conditionId),
    isKnownConditionId,
  ).map((issue) => ({
    type:
      issue.kind === "unknown" ? "unknown-condition" : "duplicate-condition",
    conditionId: issue.id,
  }));

  const unknown = new Set(
    issues
      .filter((issue) => issue.type === "unknown-condition")
      .map((issue) => issue.conditionId),
  );

  // A repeated Condition's lifecycle fields are the same ones judged on its
  // first appearance; the duplicate is already reported once above.
  const checked = new Set<ConditionId>();

  for (const condition of conditions) {
    if (
      unknown.has(condition.conditionId) ||
      checked.has(condition.conditionId)
    ) {
      continue;
    }

    checked.add(condition.conditionId);

    const definition = getConditionDefinition(condition.conditionId);

    if (definition === undefined) continue;

    for (const lifecycleIssue of findStagedEntryValidationIssues(
      definition,
      condition,
    )) {
      issues.push({
        type: "invalid-condition-lifecycle",
        conditionId: condition.conditionId,
        issue: lifecycleIssue,
      });
    }
  }

  return issues;
}

export function findConditionCatalogIssues(): readonly string[] {
  const issues = [...CONDITION_REGISTRY.findCatalogIssues()];

  for (const condition of CONDITION_REGISTRY.all()) {
    issues.push(
      ...findStageTrackIssues("Condition", condition.id, condition),
    );
  }

  return issues;
}

// Exposed for the catalog index, which needs every registry in one map.
export const conditionRegistry = CONDITION_REGISTRY;
