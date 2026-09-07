/*
 * Validation for the capability layer.
 *
 * Two different questions live here, and keeping them apart matters:
 *
 *   - is this *character's* capability list well-formed and earned?
 *   - is this *definition* a coherent Mastery track?
 *
 * The first is asked of every sheet. The second is asked of the catalog,
 * including whatever the host registered at runtime, because a homebrew
 * Technique whose ranks run past its own maximum reaches the same UI as an
 * authored one.
 *
 * Requirement checking needs a resolved character, not the raw lists: a Skill
 * granted by a Trait is as real as one the sheet lists, and a requirement on
 * DEX has to see the Base score rather than the stored one. That context is
 * built by character/resolution.ts and passed in, which is why this file
 * takes a RequirementContext instead of assembling one.
 *
 * These return issues rather than EngineResults because they are domain
 * helpers, not public entry points. validateCharacter turns them into
 * EngineErrors so every diagnostic the UI sees is built in one place.
 */

import { scanReferences } from "../../infrastructure/registry";

import {
  meetsAllRequirements,
  resolveAllRequirements,
  type RequirementContext,
  type RequirementDisposition,
} from "../rules/resolution";
import {
  isMasteryRank,
  type MasteryRank,
} from "./mastery";

import {
  getTechniqueDefinition,
  isKnownTechniqueId,
  techniqueMastery,
  type CharacterTechnique,
  type TechniqueDefinition,
  type TechniqueId,
} from "./techniques";

import {
  getSkillDefinition,
  isKnownSkillId,
  skillMastery,
  type CharacterSkill,
  type SkillDefinition,
  type SkillId,
} from "./skills";

/* ── Character capability issues ────────────────────────────────────────── */

export type TechniqueValidationIssue =
  | {
      readonly type: "unresolved-technique-requirements";
      readonly techniqueId: TechniqueId;
    }
  | {
      readonly type: "unknown-technique";
      readonly techniqueId: TechniqueId;
    }
  | {
      readonly type: "duplicate-technique";
      readonly techniqueId: TechniqueId;
    }
  | {
      readonly type: "invalid-technique-mastery";
      readonly techniqueId: TechniqueId;
      readonly mastery: number;
      readonly maximumMastery: MasteryRank;
    }
  | {
      /*
       * The character's data is complete enough to say the prerequisites are
       * not met. Distinct from "unresolved", below, which is what an
       * unfinished sheet produces.
       */
      readonly type: "unsatisfied-technique-requirements";
      readonly techniqueId: TechniqueId;
    };

export type SkillValidationIssue =
  | {
      /*
       * The sheet does not record something the prerequisites read, so the
       * engine cannot say whether they are met. NOT a failure: reporting it
       * as one would tell an author to fix a character that may be correct.
       */
      readonly type: "unresolved-skill-requirements";
      readonly skillId: SkillId;
    }
  | {
      readonly type: "unknown-skill";
      readonly skillId: SkillId;
    }
  | {
      readonly type: "duplicate-skill";
      readonly skillId: SkillId;
    }
  | {
      readonly type: "invalid-skill-mastery";
      readonly skillId: SkillId;
      readonly mastery: number;
      readonly maximumMastery: MasteryRank;
    }
  | {
      readonly type: "unsatisfied-skill-requirements";
      readonly skillId: SkillId;
    };

export type CapabilityValidationIssue =
  | TechniqueValidationIssue
  | SkillValidationIssue;

/*
 * Requirements are only judged when a context is supplied.
 *
 * A caller validating a half-built sheet in isolation has no resolved
 * character to check against, and inventing an empty one would report every
 * prerequisite in the list as unmet — which is worse than not answering.
 */
export function findTechniqueValidationIssues(
  techniques: readonly CharacterTechnique[],
  context?: RequirementContext,
): readonly TechniqueValidationIssue[] {
  const issues: TechniqueValidationIssue[] = scanReferences(
    techniques.map((technique) => technique.techniqueId),
    isKnownTechniqueId,
  ).map((issue) => ({
    type:
      issue.kind === "unknown" ? "unknown-technique" : "duplicate-technique",
    techniqueId: issue.id,
  }));

  const unknown = new Set(
    issues
      .filter((issue) => issue.type === "unknown-technique")
      .map((issue) => issue.techniqueId),
  );

  const checked = new Set<TechniqueId>();

  for (const technique of techniques) {
    const id = technique.techniqueId;

    // A repeated Technique's rank and prerequisites are the same ones judged
    // on its first appearance; reporting them twice points at one fix.
    if (unknown.has(id) || checked.has(id)) continue;

    checked.add(id);

    const definition = getTechniqueDefinition(id);

    if (definition === undefined) continue;

    const mastery = techniqueMastery(technique);

    if (!isMasteryRank(mastery) || mastery > definition.maximumMastery) {
      issues.push({
        type: "invalid-technique-mastery",
        techniqueId: id,
        mastery,
        maximumMastery: definition.maximumMastery,
      });
    }

    if (context !== undefined) {
      /*
       * Tri-state on purpose. The boolean helper collapses "unresolved" into
       * false, and a diagnostic built on that would tell an author their
       * character fails a prerequisite when nobody has established that it
       * does — the sheet is simply unfinished.
       */
      const disposition = resolveAllRequirements(
        definition.requirements ?? [],
        context,
      );

      if (disposition === "unsatisfied") {
        issues.push({
          type: "unsatisfied-technique-requirements",
          techniqueId: id,
        });
      } else if (disposition === "unresolved") {
        issues.push({
          type: "unresolved-technique-requirements",
          techniqueId: id,
        });
      }
    }
  }

  return issues;
}

export function findSkillValidationIssues(
  skills: readonly CharacterSkill[],
  context?: RequirementContext,
): readonly SkillValidationIssue[] {
  const issues: SkillValidationIssue[] = scanReferences(
    skills.map((skill) => skill.skillId),
    isKnownSkillId,
  ).map((issue) => ({
    type: issue.kind === "unknown" ? "unknown-skill" : "duplicate-skill",
    skillId: issue.id,
  }));

  const unknown = new Set(
    issues
      .filter((issue) => issue.type === "unknown-skill")
      .map((issue) => issue.skillId),
  );

  const checked = new Set<SkillId>();

  for (const skill of skills) {
    const id = skill.skillId;

    if (unknown.has(id) || checked.has(id)) continue;

    checked.add(id);

    const definition = getSkillDefinition(id);

    if (definition === undefined) continue;

    const mastery = skillMastery(skill);

    if (!isMasteryRank(mastery) || mastery > definition.maximumMastery) {
      issues.push({
        type: "invalid-skill-mastery",
        skillId: id,
        mastery,
        maximumMastery: definition.maximumMastery,
      });
    }

    if (context !== undefined) {
      const disposition = resolveAllRequirements(
        definition.requirements ?? [],
        context,
      );

      if (disposition === "unsatisfied") {
        issues.push({
          type: "unsatisfied-skill-requirements",
          skillId: id,
        });
      } else if (disposition === "unresolved") {
        issues.push({
          type: "unresolved-skill-requirements",
          skillId: id,
        });
      }
    }
  }

  return issues;
}

/**
 * Whether a character described by `context` meets what a Skill asks of them.
 *
 * Exposed so a UI can grey out a Skill for exactly the reason the engine
 * would reject it, rather than reimplementing the test.
 *
 * BOOLEAN, and therefore treats "unresolved" as false. That is the right
 * answer for greying out a control — an unfinished sheet should not offer a
 * Skill whose prerequisites nobody can confirm — and the wrong answer for
 * explaining WHY. Use resolveSkillRequirements() for anything a person reads.
 */
export function satisfiesSkillRequirements(
  definition: SkillDefinition,
  context: RequirementContext,
): boolean {
  return meetsAllRequirements(definition.requirements ?? [], context);
}


/** The same question, with the difference between "no" and "cannot tell". */
export function resolveSkillRequirements(
  definition: SkillDefinition,
  context: RequirementContext,
): RequirementDisposition {
  return resolveAllRequirements(definition.requirements ?? [], context);
}


/**
 * The same question for a Technique. Also collapses unresolved to false.
 */
export function satisfiesTechniqueRequirements(
  definition: TechniqueDefinition,
  context: RequirementContext,
): boolean {
  return meetsAllRequirements(definition.requirements ?? [], context);
}


export function resolveTechniqueRequirements(
  definition: TechniqueDefinition,
  context: RequirementContext,
): RequirementDisposition {
  return resolveAllRequirements(definition.requirements ?? [], context);
}

// One call for the whole layer, in dependency order: a Skill's requirements
// commonly name the Techniques behind it.
export function findCapabilityValidationIssues(
  techniques: readonly CharacterTechnique[],
  skills: readonly CharacterSkill[],
  context?: RequirementContext,
): readonly CapabilityValidationIssue[] {
  return [
    ...findTechniqueValidationIssues(techniques, context),
    ...findSkillValidationIssues(skills, context),
  ];
}
