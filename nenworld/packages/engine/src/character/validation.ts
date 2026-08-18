/*
 * Structural validation for a whole character.
 *
 * These checks answer "is this object well-formed enough to compute with",
 * not "is this character balanced". Every path returns an EngineResult, so a
 * rejection still carries the trace showing which checks ran.
 *
 * Each domain reports its own problems as plain issue objects; this file is
 * the single place they become EngineErrors, so codes, audiences and subject
 * tagging stay consistent no matter which domain a diagnostic came from.
 */

import type {
  DiagnosticSubject,
  EngineError,
  Warning,
} from "../infrastructure/diagnostics";
import type { EngineResult, NonEmptyArray } from "../infrastructure/result";
import { createTraceNode, type EngineTrace } from "../infrastructure/trace";

import { validateAttributes } from "./foundation/attributes/validation";

import {
  findClanValidationIssues,
  type ClanValidationIssue,
} from "./identity/clans";

import {
  findMutationValidationIssues,
  type MutationValidationIssue,
} from "./identity/mutations";

import {
  findSpeciesValidationIssues,
  type SpeciesValidationIssue,
} from "./identity/species";

import {
  findTraitValidationIssues,
  type TraitValidationIssue,
} from "./identity/traits";

import {
  findCapabilityValidationIssues,
  type CapabilityValidationIssue,
} from "./capabilities/validation";

import {
  findConditionValidationIssues,
  type ConditionValidationIssue,
} from "./status/conditions";

import type { Character } from "./types";

// Everything a character can get wrong by referencing an authored catalog.
type CharacterReferenceIssue =
  | SpeciesValidationIssue
  | ClanValidationIssue
  | MutationValidationIssue
  | TraitValidationIssue
  | CapabilityValidationIssue
  | ConditionValidationIssue;

/*
 * How each kind of issue is reported.
 *
 * A mapped type rather than a switch, so adding an issue variant to any
 * domain is a compile error here until it has a code and a message — which is
 * the point: the alternative is a default branch quietly emitting
 * "unknown problem" in the UI.
 */
type ReferenceIssueDescriptors = {
  readonly [Type in CharacterReferenceIssue["type"]]: {
    readonly code: string;
    readonly describe: (
      issue: Extract<CharacterReferenceIssue, { type: Type }>,
    ) => string;
    readonly resolution: string;
  };
};

const REFERENCE_ISSUE_DESCRIPTORS: ReferenceIssueDescriptors = {
  "unknown-species": {
    code: "character.species.unknown",
    describe: (issue) => `Unknown Species "${issue.speciesId}".`,
    resolution: "Choose a Species the engine defines.",
  },
  "duplicate-species": {
    code: "character.species.duplicate",
    describe: (issue) =>
      `Species "${issue.speciesId}" appears in the ancestry more than once.`,
    resolution: "Merge the repeated Species into one share.",
  },
  "invalid-species-percentage": {
    code: "character.species.percentage_invalid",
    describe: (issue) =>
      `Species "${issue.speciesId}" has an ancestry share of ${issue.percentage}, which must be greater than 0 and at most 100.`,
    resolution: "Give the Species a share between 0 and 100.",
  },
  "incomplete-species-mix": {
    code: "character.species.mix_incomplete",
    describe: (issue) =>
      `Ancestry shares total ${issue.total}%, and must total 100%.`,
    resolution: "Adjust the shares until they add up to 100%.",
  },

  "unknown-clan": {
    code: "character.clan.unknown",
    describe: (issue) => `Unknown Clan "${issue.clanId}".`,
    resolution: "Choose a Clan the engine defines, or remove it.",
  },
  "duplicate-clan": {
    code: "character.clan.duplicate",
    describe: (issue) => `Clan "${issue.clanId}" is listed more than once.`,
    resolution: "Remove the repeated Clan.",
  },

  "unknown-mutation": {
    code: "character.mutation.unknown",
    describe: (issue) => `Unknown Mutation "${issue.mutationId}".`,
    resolution: "Choose a Mutation the engine defines, or remove it.",
  },
  "duplicate-mutation": {
    code: "character.mutation.duplicate",
    describe: (issue) =>
      `Mutation "${issue.mutationId}" is listed more than once.`,
    resolution: "Remove the repeated Mutation.",
  },
  "missing-mutation-variant": {
    code: "character.mutation.variant_missing",
    describe: (issue) =>
      `Mutation "${issue.mutationId}" requires a variant, but none was chosen.`,
    resolution: "Choose one of the Mutation's variants.",
  },
  "unexpected-mutation-variant": {
    code: "character.mutation.variant_unexpected",
    describe: (issue) =>
      `Mutation "${issue.mutationId}" has no variants, but "${issue.variantId}" was chosen.`,
    resolution: "Remove the variant.",
  },
  "unknown-mutation-variant": {
    code: "character.mutation.variant_unknown",
    describe: (issue) =>
      `Mutation "${issue.mutationId}" has no variant "${issue.variantId}".`,
    resolution: "Choose one of the Mutation's defined variants.",
  },

  "unknown-trait": {
    code: "character.trait.unknown",
    describe: (issue) => `Unknown Trait "${issue.traitId}".`,
    resolution: "Choose a Trait the engine defines, or remove it.",
  },
  "duplicate-trait": {
    code: "character.trait.duplicate",
    describe: (issue) => `Trait "${issue.traitId}" is listed more than once.`,
    resolution: "Remove the repeated Trait.",
  },

  "unknown-ability": {
    code: "character.ability.unknown",
    describe: (issue) => `Unknown Ability "${issue.abilityId}".`,
    resolution: "Choose an Ability the engine defines, or remove it.",
  },
  "duplicate-ability": {
    code: "character.ability.duplicate",
    describe: (issue) =>
      `Ability "${issue.abilityId}" is listed more than once.`,
    resolution: "Remove the repeated Ability.",
  },

  "unknown-technique": {
    code: "character.technique.unknown",
    describe: (issue) => `Unknown Technique "${issue.techniqueId}".`,
    resolution: "Choose a Technique the engine defines, or remove it.",
  },
  "duplicate-technique": {
    code: "character.technique.duplicate",
    describe: (issue) =>
      `Technique "${issue.techniqueId}" is listed more than once.`,
    resolution: "Remove the repeated Technique.",
  },

  "unknown-skill": {
    code: "character.skill.unknown",
    describe: (issue) => `Unknown Skill "${issue.skillId}".`,
    resolution: "Choose a Skill the engine defines, or remove it.",
  },
  "duplicate-skill": {
    code: "character.skill.duplicate",
    describe: (issue) => `Skill "${issue.skillId}" is listed more than once.`,
    resolution: "Remove the repeated Skill.",
  },
  "unsatisfied-skill-requirements": {
    code: "character.skill.requirements_unsatisfied",
    describe: (issue) =>
      `Skill "${issue.skillId}" requires an Ability or Technique the character does not have.`,
    resolution:
      "Add the required Ability or Technique, or remove the Skill.",
  },

  "unknown-condition": {
    code: "character.condition.unknown",
    describe: (issue) => `Unknown Condition "${issue.conditionId}".`,
    resolution: "Choose a Condition the engine defines, or remove it.",
  },
  "duplicate-condition": {
    code: "character.condition.duplicate",
    describe: (issue) =>
      `Condition "${issue.conditionId}" is applied more than once.`,
    resolution: "Remove the repeated Condition.",
  },
};

function toEngineError(
  issue: CharacterReferenceIssue,
  subject: DiagnosticSubject,
): EngineError {
  // The table is exhaustive by construction, but TypeScript cannot pair an
  // issue with its own descriptor through an index lookup. Widening the
  // callback here is the one cast that buys the exhaustiveness above.
  const descriptor = REFERENCE_ISSUE_DESCRIPTORS[issue.type] as {
    code: string;
    describe: (value: CharacterReferenceIssue) => string;
    resolution: string;
  };

  return {
    code: descriptor.code,
    message: descriptor.describe(issue),
    audience: "player",
    subject,
    resolution: descriptor.resolution,
  };
}

// Collects every catalog reference problem across identity, capabilities and
// status, in the order a sheet reads top to bottom.
function findCharacterReferenceIssues(
  character: Character,
): readonly CharacterReferenceIssue[] {
  return [
    ...findSpeciesValidationIssues(character.species ?? []),
    ...findClanValidationIssues(character.clans ?? []),
    ...findMutationValidationIssues(character.mutations ?? []),
    ...findTraitValidationIssues(character.traits ?? []),
    ...findCapabilityValidationIssues(
      character.abilities ?? [],
      character.techniques ?? [],
      character.skills ?? [],
    ),
    ...findConditionValidationIssues(character.conditions ?? []),
  ];
}

// Checks identity fields and catalog references, and folds in attribute
// validation.
export function validateCharacter(
  character: Character,
): EngineResult<Character> {
  const errors: EngineError[] = [];
  const warnings: Warning[] = [];

  // Lets the UI pin any diagnostic back to the character it came from.
  const subject: DiagnosticSubject = {
    kind: "character",
    id: character.id,
  };

  if (character.id.trim().length === 0) {
    errors.push({
      code: "character.id.empty",
      message: "Character ID cannot be empty.",
      audience: "player",
      actual: character.id,
      resolution: "Assign the character a non-empty ID.",
    });
  }

  if (character.name.trim().length === 0) {
    errors.push({
      code: "character.name.empty",
      message: "Character name cannot be empty.",
      audience: "player",
      subject,
      actual: character.name,
      resolution: "Enter a character name.",
    });
  }

  // An unfinished character is not a malformed one — the workbench is where
  // characters get finished, so this is a warning it can surface rather than
  // a failure that stops the rest of the pipeline.
  if ((character.species ?? []).length === 0) {
    warnings.push({
      code: "character.species.missing",
      message: "Character has no Species.",
      audience: "player",
      subject,
    });
  }

  const attributesResult = validateAttributes(character.attributes);

  // Attribute errors are re-tagged with the character so they are traceable.
  if (!attributesResult.success) {
    for (const error of attributesResult.errors) {
      errors.push({
        ...error,
        subject,
      });
    }
  }

  const referenceIssues = findCharacterReferenceIssues(character);

  for (const issue of referenceIssues) {
    errors.push(toEngineError(issue, subject));
  }

  const referenceTraceNode = createTraceNode({
    id: "character.references.validate",
    label: "Validate catalog references",
    formula: "every referenced id exists and appears once",
    inputs: {
      species: {
        value: (character.species ?? [])
          .map((entry) => `${entry.speciesId} ${entry.percentage}%`)
          .join(", "),
      },
      clans: { value: (character.clans ?? []).length },
      mutations: { value: (character.mutations ?? []).length },
      traits: { value: (character.traits ?? []).length },
      abilities: { value: (character.abilities ?? []).length },
      techniques: { value: (character.techniques ?? []).length },
      skills: { value: (character.skills ?? []).length },
      conditions: { value: (character.conditions ?? []).length },
    },
    output: referenceIssues.length === 0,
  });

  // Nests both sub-validations beneath the character-level checks.
  const trace: EngineTrace = {
    root: createTraceNode({
      id: "character.validate",
      label: "Validate character",
      inputs: {
        id: { value: character.id },
        name: { value: character.name },
      },
      output: errors.length === 0,
      children: [attributesResult.trace.root, referenceTraceNode],
      warnings,
    }),
  };

  if (errors.length > 0) {
    return {
      success: false,
      trace,
      warnings,
      errors: errors as NonEmptyArray<EngineError>,
    };
  }

  return {
    success: true,
    payload: character,
    trace,
    warnings,
  };
}
