/*
 * Skills — the concrete things a character can attempt on purpose.
 *
 * A Defined Skill is an authored application of an Ability, a Technique, or
 * both. Anything a player invents on the spot is an improvised attempt
 * instead — see attempts.ts.
 */

import {
  createRegistry,
  type Definition,
} from "../../infrastructure/registry";
import { isKnownAbilityId, type AbilityId } from "./abilities";
import { isKnownTechniqueId, type TechniqueId } from "./techniques";

export type SkillId = string;

/**
 * Structured-time execution timing.
 *
 * This does NOT restrict use outside structured time.
 *
 * "action":   uses the normal Action economy when structured timing is active.
 * "reaction": may be used through the Reaction system when its trigger fires.
 */
export type SkillTiming = "action" | "reaction";

/**
 * One valid prerequisite path for possessing or learning a Skill.
 *
 * Every requirement inside one set must be satisfied. If a Skill lists
 * several sets, satisfying any one complete set is sufficient.
 */
export interface SkillRequirementSet {
  readonly abilityIds?: readonly AbilityId[];
  readonly techniqueIds?: readonly TechniqueId[];
}

/**
 * Engine-owned definition of a Defined Skill.
 */
export interface SkillDefinition extends Definition {
  /**
   * Relevant only when structured timing is active. A Skill may support both
   * normal Action and Reaction execution.
   */
  readonly timings: readonly SkillTiming[];

  /**
   * Optional prerequisite paths. No requirements means the Skill needs no
   * special Ability or Technique foundation.
   */
  readonly requirements?: readonly SkillRequirementSet[];
}

/**
 * A Defined Skill actually known by the character.
 */
export interface CharacterSkill {
  readonly skillId: SkillId;
}

export const SKILL_DEFINITIONS = {
  punch: {
    id: "punch",
    name: "Punch",
    description: "Deliver a trained unarmed strike using the fist.",
    timings: ["action"],
    requirements: [
      {
        techniqueIds: ["martial-arts"],
      },
    ],
  },

  parry: {
    id: "parry",
    name: "Parry",
    description: "React to an incoming attack by actively deflecting it.",
    timings: ["reaction"],
    requirements: [
      {
        techniqueIds: ["martial-arts"],
      },
    ],
  },

  "defensive-stance": {
    id: "defensive-stance",
    name: "Defensive Stance",
    description: "Enter a trained defensive fighting stance.",
    timings: ["action"],
    requirements: [
      {
        techniqueIds: ["martial-arts"],
      },
    ],
  },

  "pick-lock": {
    id: "pick-lock",
    name: "Pick Lock",
    description:
      "Manipulate a mechanical lock using trained lockpicking methods.",
    timings: ["action"],
    requirements: [
      {
        techniqueIds: ["lockpicking"],
      },
    ],
  },

  "fire-blast": {
    id: "fire-blast",
    name: "Fire Blast",
    description: "Project fire offensively using trained Firebending.",
    timings: ["action"],
    requirements: [
      {
        abilityIds: ["firebending"],
        techniqueIds: ["firebending-forms"],
      },
    ],
  },
} as const satisfies Record<string, SkillDefinition>;

const SKILL_REGISTRY = createRegistry<SkillDefinition>(
  "Skill",
  SKILL_DEFINITIONS,
);

export type KnownSkillId = keyof typeof SKILL_DEFINITIONS;

export function isKnownSkillId(skillId: SkillId): boolean {
  return SKILL_REGISTRY.isKnownId(skillId);
}

export function getSkillDefinition(
  skillId: SkillId,
): SkillDefinition | undefined {
  return SKILL_REGISTRY.get(skillId);
}

/*
 * Development-time validation of the authored Skill catalog.
 *
 * Skills are the only catalog that references other catalogs, so this is the
 * one that can be broken by an edit somewhere else — a renamed Technique
 * silently orphans every Skill that required it.
 */
export function findSkillCatalogIssues(): readonly string[] {
  const issues = [...SKILL_REGISTRY.findCatalogIssues()];

  for (const skill of SKILL_REGISTRY.all()) {
    if (skill.timings.length === 0) {
      issues.push(`Skill "${skill.id}" has no valid timing.`);
    }

    for (const requirement of skill.requirements ?? []) {
      for (const abilityId of requirement.abilityIds ?? []) {
        if (!isKnownAbilityId(abilityId)) {
          issues.push(
            `Skill "${skill.id}" references unknown Ability "${abilityId}".`,
          );
        }
      }

      for (const techniqueId of requirement.techniqueIds ?? []) {
        if (!isKnownTechniqueId(techniqueId)) {
          issues.push(
            `Skill "${skill.id}" references unknown Technique "${techniqueId}".`,
          );
        }
      }
    }
  }

  return issues;
}

// Exposed for the catalog index, which needs every registry in one map.
export const skillRegistry = SKILL_REGISTRY;
