/*
 * Structural validation across the three capability layers.
 *
 * Abilities and Techniques only have to exist and not repeat. Skills have to
 * exist, not repeat, *and* rest on capabilities the character actually has —
 * which is why all three are validated here together rather than each file
 * validating itself: the Skill check needs the other two lists in hand.
 *
 * These return issues rather than EngineResults because they are domain
 * helpers, not public entry points. validateCharacter turns them into
 * EngineErrors so every diagnostic the UI sees is built in one place.
 */

import { scanReferences } from "../../infrastructure/registry";

import {
  isKnownAbilityId,
  type AbilityId,
  type CharacterAbility,
} from "./abilities";

import {
  isKnownTechniqueId,
  type CharacterTechnique,
  type TechniqueId,
} from "./techniques";

import {
  getSkillDefinition,
  isKnownSkillId,
  type CharacterSkill,
  type SkillDefinition,
  type SkillId,
  type SkillRequirementSet,
} from "./skills";

export type AbilityValidationIssue =
  | {
      readonly type: "unknown-ability";
      readonly abilityId: AbilityId;
    }
  | {
      readonly type: "duplicate-ability";
      readonly abilityId: AbilityId;
    };

export type TechniqueValidationIssue =
  | {
      readonly type: "unknown-technique";
      readonly techniqueId: TechniqueId;
    }
  | {
      readonly type: "duplicate-technique";
      readonly techniqueId: TechniqueId;
    };

export type SkillValidationIssue =
  | {
      readonly type: "unknown-skill";
      readonly skillId: SkillId;
    }
  | {
      readonly type: "duplicate-skill";
      readonly skillId: SkillId;
    }
  | {
      readonly type: "unsatisfied-skill-requirements";
      readonly skillId: SkillId;
    };

export function findAbilityValidationIssues(
  abilities: readonly CharacterAbility[],
): readonly AbilityValidationIssue[] {
  return scanReferences(
    abilities.map((ability) => ability.abilityId),
    isKnownAbilityId,
  ).map((issue) => ({
    type: issue.kind === "unknown" ? "unknown-ability" : "duplicate-ability",
    abilityId: issue.id,
  }));
}

export function findTechniqueValidationIssues(
  techniques: readonly CharacterTechnique[],
): readonly TechniqueValidationIssue[] {
  return scanReferences(
    techniques.map((technique) => technique.techniqueId),
    isKnownTechniqueId,
  ).map((issue) => ({
    type:
      issue.kind === "unknown" ? "unknown-technique" : "duplicate-technique",
    techniqueId: issue.id,
  }));
}

// Every requirement inside one set must hold.
function satisfiesRequirementSet(
  requirement: SkillRequirementSet,
  abilityIds: ReadonlySet<string>,
  techniqueIds: ReadonlySet<string>,
): boolean {
  return (
    (requirement.abilityIds ?? []).every((abilityId) =>
      abilityIds.has(abilityId),
    ) &&
    (requirement.techniqueIds ?? []).every((techniqueId) =>
      techniqueIds.has(techniqueId),
    )
  );
}

// Satisfying any one complete requirement set is enough.
export function satisfiesSkillRequirements(
  definition: SkillDefinition,
  abilities: readonly CharacterAbility[],
  techniques: readonly CharacterTechnique[],
): boolean {
  const requirements = definition.requirements;

  if (requirements === undefined || requirements.length === 0) {
    return true;
  }

  const abilityIds = new Set(abilities.map((ability) => ability.abilityId));

  const techniqueIds = new Set(
    techniques.map((technique) => technique.techniqueId),
  );

  return requirements.some((requirement) =>
    satisfiesRequirementSet(requirement, abilityIds, techniqueIds),
  );
}

export function findSkillValidationIssues(
  skills: readonly CharacterSkill[],
  abilities: readonly CharacterAbility[],
  techniques: readonly CharacterTechnique[],
): readonly SkillValidationIssue[] {
  const issues: SkillValidationIssue[] = scanReferences(
    skills.map((skill) => skill.skillId),
    isKnownSkillId,
  ).map((issue) => ({
    type: issue.kind === "unknown" ? "unknown-skill" : "duplicate-skill",
    skillId: issue.id,
  }));

  // Unknown ids have no requirements to check, and a repeated Skill's
  // requirements are the same ones already judged on its first appearance.
  const unknown = new Set(
    issues
      .filter((issue) => issue.type === "unknown-skill")
      .map((issue) => issue.skillId),
  );

  const checked = new Set<SkillId>();

  for (const skill of skills) {
    if (unknown.has(skill.skillId) || checked.has(skill.skillId)) {
      continue;
    }

    checked.add(skill.skillId);

    const definition = getSkillDefinition(skill.skillId);

    if (
      definition !== undefined &&
      !satisfiesSkillRequirements(definition, abilities, techniques)
    ) {
      issues.push({
        type: "unsatisfied-skill-requirements",
        skillId: skill.skillId,
      });
    }
  }

  return issues;
}

export type CapabilityValidationIssue =
  | AbilityValidationIssue
  | TechniqueValidationIssue
  | SkillValidationIssue;

// One call for the whole layer, in dependency order: a Skill's requirements
// are only meaningful once the Abilities and Techniques behind them are.
export function findCapabilityValidationIssues(
  abilities: readonly CharacterAbility[],
  techniques: readonly CharacterTechnique[],
  skills: readonly CharacterSkill[],
): readonly CapabilityValidationIssue[] {
  return [
    ...findAbilityValidationIssues(abilities),
    ...findTechniqueValidationIssues(techniques),
    ...findSkillValidationIssues(skills, abilities, techniques),
  ];
}
