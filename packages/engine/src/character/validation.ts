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

import type { InjuryValidationIssue } from "./foundation/body/injuries";

import type { StagedEntryValidationIssue } from "./status/stage";

import {
  findItemValidationIssues,
  type ItemValidationIssue,
} from "./equipment/index";

import { resolveCharacter, type ResolvedCharacter } from "./resolution";

import { validateDerivedAttributes } from "./foundation/attributes/derived/validation";

import {
  findBodyValidationIssues,
  toBodyEngineError,
} from "./foundation/body/validation";
import { assessStature } from "./foundation/body/stature/resolution";
import { checkStatureJustified } from "./foundation/body/stature/justification";

import {
  findBodyInjuryValidationIssues,
  type BodyInjuryValidationIssue,
} from "./foundation/body/injuries";

import type { Character } from "./types";

// Everything a character can get wrong by referencing an authored catalog.
//
// BodyInjuryValidationIssue already covers Injuries end to end — both the
// intrinsic checks foundation/body/injuries/validation.ts owns and the
// Body-aware location checks it adds — so this union does not list
// InjuryValidationIssue separately; that would report the same intrinsic
// problem twice.
type CharacterReferenceIssue =
  | SpeciesValidationIssue
  | ClanValidationIssue
  | TraitValidationIssue
  | CapabilityValidationIssue
  | ConditionValidationIssue
  | BodyInjuryValidationIssue
  | ItemValidationIssue;

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
  "invalid-technique-mastery": {
    code: "character.technique.mastery_invalid",
    describe: (issue) =>
      `Technique "${issue.techniqueId}" is at Mastery ${issue.mastery}, but its track ends at ${issue.maximumMastery}.`,
    resolution: "Lower the Mastery to one the Technique defines.",
  },
  "unsatisfied-technique-requirements": {
    code: "character.technique.requirements_unsatisfied",
    describe: (issue) =>
      `Technique "${issue.techniqueId}" requires something the character does not have.`,
    resolution:
      "Meet the Technique's prerequisites, or remove the Technique.",
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
  "invalid-skill-mastery": {
    code: "character.skill.mastery_invalid",
    describe: (issue) =>
      `Skill "${issue.skillId}" is at Mastery ${issue.mastery}, but its track ends at ${issue.maximumMastery}.`,
    resolution: "Lower the Mastery to one the Skill defines.",
  },
  "unsatisfied-skill-requirements": {
    code: "character.skill.requirements_unsatisfied",
    describe: (issue) =>
      `Skill "${issue.skillId}" requires something the character does not have.`,
    resolution:
      "Meet the Skill's prerequisites, or remove the Skill.",
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
  "invalid-condition-lifecycle": {
    code: "character.condition.lifecycle_invalid",
    describe: (issue) =>
      `Condition "${issue.conditionId}" ${describeStagedEntryIssue(issue.issue)}.`,
    resolution:
      "Fix the Condition's stage, severity, or remaining duration.",
  },

  "invalid-injury-instance-id": {
    code: "character.injury.instance_id_invalid",
    describe: () => "An injury entry has an empty id.",
    resolution: "Assign the injury entry a non-empty id.",
  },
  "duplicate-injury-instance-id": {
    code: "character.injury.instance_id_duplicate",
    describe: (issue) =>
      `Injury id "${issue.id}" is used by more than one entry.`,
    resolution: "Give each injury entry its own id.",
  },
  "unknown-injury": {
    code: "character.injury.unknown",
    describe: (issue) => `Unknown injury "${issue.injuryId}".`,
    resolution: "Choose an injury the engine defines, or remove it.",
  },
  "invalid-injury-location": {
    code: "character.injury.location_invalid",
    describe: (issue) =>
      `Injury "${issue.id}" ${describeInjuryLocationIssue(issue)}.`,
    resolution: "Fix the injury's BodyPart or Special Point location.",
  },
  "invalid-injury-treatment-status": {
    code: "character.injury.treatment_status_invalid",
    describe: (issue) =>
      `Injury "${issue.id}" ${describeInjuryTreatmentStatusIssue(issue.issue)}.`,
    resolution: "Set the injury's treatment status to match its definition.",
  },

  "injury-continuity-unknown": {
    code: "character.injury.continuity_unknown",
    describe: (issue) =>
      `Injury "${issue.id}" references anatomy "${issue.continuityKey}", which this character's body has never had.`,
    resolution:
      "Point the injury at anatomy one of this character's forms actually contains.",
  },
  "injury-body-part-not-applicable": {
    code: "character.injury.body_part_not_applicable",
    describe: (issue) =>
      `Injury "${issue.id}" occupies BodyPart "${issue.bodyPartId}", which its definition does not allow.`,
    resolution: "Move the injury to a BodyPart its definition applies to.",
  },
  "injury-special-point-missing": {
    code: "character.injury.special_point_missing",
    describe: (issue) =>
      `Injury "${issue.id}" needs a Special Point location, but none is set.`,
    resolution: "Set the injury's Special Point location.",
  },
  "injury-special-point-unknown": {
    code: "character.injury.special_point_unknown",
    describe: (issue) =>
      `Injury "${issue.id}" references unknown Special Point "${issue.specialPointDefinitionId}".`,
    resolution: "Choose a Special Point the engine defines.",
  },
  "injury-special-point-not-applicable": {
    code: "character.injury.special_point_not_applicable",
    describe: (issue) =>
      `Injury "${issue.id}" references Special Point "${issue.specialPointDefinitionId}", which its definition does not allow.`,
    resolution: "Choose a Special Point the injury's definition allows.",
  },
  "injury-special-point-not-hosted": {
    code: "character.injury.special_point_not_hosted",
    describe: (issue) =>
      `Injury "${issue.id}" references Special Point "${issue.specialPointDefinitionId}", which is not hosted by its location's BodyParts.`,
    resolution: "Point the injury's location at the Special Point's actual host BodyParts.",
  },

  "unknown-item": {
    code: "character.item.unknown",
    describe: (issue) => `Unknown Item "${issue.itemId}".`,
    resolution: "Choose an Item the engine defines, or remove it.",
  },
  "duplicate-item": {
    code: "character.item.duplicate",
    describe: (issue) =>
      `Item "${issue.itemId}" appears in the inventory more than once.`,
    resolution: "Merge the entries and set the quantity.",
  },
  "invalid-item-quantity": {
    code: "character.item.quantity_invalid",
    describe: (issue) =>
      `Item "${issue.itemId}" has a quantity of ${issue.quantity}.`,
    resolution: "Set the quantity to a whole number of zero or more.",
  },
};

// Renders the one nested issue a Condition's or injury's lifecycle fields
// can produce. Shared by both descriptors above rather than duplicated,
// since a stage/severity/duration problem reads identically on either.
function describeStagedEntryIssue(
  issue: StagedEntryValidationIssue,
): string {
  switch (issue.type) {
    case "unknown-stage":
      return `references stage ${issue.stage}, which its definition does not declare`;

    case "invalid-severity":
      return `has an invalid severity of ${issue.severity}`;

    case "invalid-duration":
      return `has an invalid remaining duration of ${issue.remainingDuration}`;
  }
}

// Renders the one nested issue an injury's location can carry.
function describeInjuryLocationIssue(
  issue: Extract<InjuryValidationIssue, { type: "invalid-injury-location" }>,
): string {
  switch (issue.issue) {
    case "no-body-parts":
      return "has a location with no BodyPart ids";

    case "invalid-body-part-id":
      return "references an empty BodyPart id";

    case "duplicate-body-part-id":
      return `references BodyPart "${issue.bodyPartId}" more than once`;

    case "invalid-special-point-definition-id":
      return "has an empty Special Point definition id";
  }
}

// Renders the one nested issue an injury's treatment status can carry.
function describeInjuryTreatmentStatusIssue(
  issue: Extract<
    InjuryValidationIssue,
    { type: "invalid-injury-treatment-status" }
  >["issue"],
): string {
  switch (issue) {
    case "unexpected-treatment-status":
      return "does not require treatment but carries a treatment status";

    case "missing-treatment-status":
      return "requires treatment but has no treatment status recorded";

    case "unknown-treatment-status":
      return "has a treatment status its definition does not recognize";
  }
}

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

/*
 * Collects every catalog reference problem across identity, capabilities,
 * status and inventory, in the order a sheet reads top to bottom.
 *
 * Capability prerequisites are checked against the *resolved* character
 * rather than the lists on the sheet. A Technique granted by a Sub-species
 * satisfies a Skill that requires it just as fully as one the player trained,
 * and a requirement on DEX has to see the Base score a Trait produced. That
 * is only visible after resolution, which is why it is done here rather than
 * in the capability domain.
 */
function findCharacterReferenceIssues(
  character: Character,
  resolved: ResolvedCharacter,
): readonly CharacterReferenceIssue[] {
  return [
    ...findSpeciesValidationIssues(character.species ?? []),
    ...findClanValidationIssues(character.clans ?? []),
    ...findTraitValidationIssues(character.traits ?? []),
    ...findCapabilityValidationIssues(
      character.techniques ?? [],
      character.skills ?? [],
      resolved.requirementContext,
    ),
    ...findConditionValidationIssues(character.conditions ?? []),
    /*
     * The RESOLVED anatomy, not the stored one.
     *
     * Body Effects genuinely change what anatomy a character has — one can add
     * a limb, another can take a slot out of the form — so an Injury has to be
     * judged against the body that actually resolved. Validating against the
     * sheet would reject an Injury on anatomy the character demonstrably has,
     * and accept one on anatomy an Effect replaced out from under it.
     */
    ...findBodyInjuryValidationIssues(
      resolved.body.anatomy,
      resolved.knownContinuityKeys,
      resolved.bodyInput.definitions,
      resolved.bodyInput.specialPointDefinitions,
      character.injuries ?? [],
    ),
    ...findItemValidationIssues(character.items ?? []),
  ];
}

/*
 * Checks identity fields and catalog references, and folds in attribute,
 * derived-attribute, Body and stature validation.
 *
 * Body is judged from the RESOLVED body rather than the stored one, so an
 * Effect that changed the body plan has its result validated rather than its
 * declaration. Every physical rule belongs to the Body subsystem that owns it;
 * this file only decides that a character has to satisfy them, and turns what
 * they report into EngineErrors.
 */
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

  /*
   * Everything that can be judged from the sheet alone, before anything is
   * resolved. Kept first so that a character whose body cannot resolve still
   * gets told about an empty name or an out-of-range Attribute, rather than
   * only about the body.
   */
  if (character.id.trim().length === 0) {
    errors.push({
      code: "character.id.empty",
      message: "Character ID cannot be empty.",
      audience: "player",
      actual: character.id,
      resolution: "Assign the character a non-empty ID.",
    });
  }

  if (character.details.name.trim().length === 0) {
    errors.push({
      code: "character.name.empty",
      message: "Character name cannot be empty.",
      audience: "player",
      subject,
      actual: character.details.name,
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

  /*
   * Resolved once and threaded through everything that needs it. Both the
   * catalog-reference checks (which judge Requirements against the resolved
   * character) and the Derived Attribute self-check read from this, and
   * resolution is the expensive part of validating a character.
   *
   * Resolution can fail — a body whose anatomy names a BodyPartDefinition that
   * does not exist has no measurements, no Strength and therefore no Derived
   * Attributes. That is reported here rather than thrown, and the checks below
   * that need a resolved character are skipped rather than run against
   * something invented to stand in for one.
   */
  const resolution = resolveCharacter(character);

  warnings.push(...resolution.warnings);

  if (!resolution.success) {
    for (const error of resolution.errors) {
      errors.push({ ...error, subject });
    }

    return {
      success: false,
      trace: {
        root: createTraceNode({
          id: "character.validate",
          label: "Validate character",
          inputs: {
            id: { value: character.id },
            name: { value: character.details.name },
          },
          output: false,
          children: [attributesResult.trace.root, resolution.trace.root],
          warnings,
        }),
      },
      warnings,
      errors: errors as NonEmptyArray<EngineError>,
    };
  }

  const resolved = resolution.payload;

  /*
   * Derived Attributes are computed rather than authored, so this is a
   * self-check on the engine's own arithmetic rather than on anything the
   * player typed — a non-finite Derived Attribute means a contributing
   * Attribute was non-finite. It reads the resolved character for the same
   * reason it is calculated there: Derived Attributes follow the Resolved
   * layer, not the authored one.
   */
  const derivedResult = validateDerivedAttributes(resolved.derivedAttributes);

  if (!derivedResult.success) {
    for (const error of derivedResult.errors) {
      errors.push({
        ...error,
        subject,
      });
    }
  }

  const referenceIssues = findCharacterReferenceIssues(character, resolved);

  for (const issue of referenceIssues) {
    errors.push(toEngineError(issue, subject));
  }

  /*
   * The body.
   *
   * Judged against what was ACTUALLY resolved — the anatomy and Reference Form
   * after Body Effects, and the morphology the physics used — rather than
   * against what the sheet stores. An Effect that adds anatomy has to have its
   * anatomy validated, and re-deriving any of it here would be a second
   * implementation of the layer stack that could disagree about which body was
   * being judged.
   *
   * Every rule belongs to the Body subsystem that owns it; this only decides
   * that a character has to satisfy them. See foundation/body/validation.ts.
   */
  for (const issue of findBodyValidationIssues({
    anatomy: resolved.body.anatomy,
    referenceForm: resolved.body.referenceForm,
    definitions: resolved.bodyInput.definitions,

    morphologyByPartId: resolved.body.morphologyByPartId,
    morphologyBySlotId: resolved.body.morphologyBySlotId,
    authoredMorphology: resolved.body.morphologyInput,

    effectiveScale: resolved.body.effectiveScale,

    ...(resolved.bodyInput.adiposeTissueDensityKgPerL !== undefined
      ? {
          adiposeTissueDensityKgPerL:
            resolved.bodyInput.adiposeTissueDensityKgPerL,
        }
      : {}),
    ...(resolved.speciesBodyProfile.ageProfile !== undefined
      ? { ageProfile: resolved.speciesBodyProfile.ageProfile }
      : {}),

    statureBands: resolved.speciesBodyProfile.stature,
  })) {
    errors.push(toBodyEngineError(issue, subject));
  }

  /*
   * Stature — the one Body rule that needs to know about content.
   *
   * assessStature only describes a body; whether an exceptional one is ALLOWED
   * depends on the Traits and Conditions the character carries, which Body must
   * never import. Resolution collected those allowances from applicable content
   * and stamped each with its source; this is where they are spent.
   *
   * The assessment runs against the resolved layer stack for the same reason
   * body validation does: a character whose Trait made them tall is tall, and
   * the rule has to see the height the physics produced.
   */
  const stature = checkStatureJustified(
    assessStature({
      anatomy: resolved.body.anatomy,
      definitions: resolved.bodyInput.definitions,
      morphology: resolved.body.morphologyInput,

      speciesStandardScale: resolved.bodyInput.speciesStandardScale,
      ageScale: resolved.bodyInput.ageScale,
      characterScale: resolved.bodyInput.characterScale,

      bands: resolved.speciesBodyProfile.stature,
    }),
    resolved.statureJustifications,
  );

  if (!stature.success) {
    for (const error of stature.errors) {
      errors.push({ ...error, subject });
    }
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
      traits: { value: (character.traits ?? []).length },
      techniques: { value: (character.techniques ?? []).length },
      skills: { value: (character.skills ?? []).length },
      items: { value: (character.items ?? []).length },
      conditions: { value: (character.conditions ?? []).length },
      injuries: { value: (character.injuries ?? []).length },
    },
    output: referenceIssues.length === 0,
  });

  // Nests every sub-validation beneath the character-level checks.
  const trace: EngineTrace = {
    root: createTraceNode({
      id: "character.validate",
      label: "Validate character",
      inputs: {
        id: { value: character.id },
        name: { value: character.details.name },
      },
      output: errors.length === 0,
      children: [
        attributesResult.trace.root,
        derivedResult.trace.root,
        referenceTraceNode,
        resolution.trace.root,
        stature.trace.root,
      ],
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
