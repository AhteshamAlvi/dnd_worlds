/*
 * Resolved character capabilities.
 *
 * A character's authored Skill/Technique Mastery is not always the complete
 * set of capabilities they currently possess.
 *
 * Other content may grant capabilities through the universal Effect system:
 *
 * - Traits;
 * - Species/Sub-species;
 * - Technique Mastery;
 * - Items;
 * - Conditions;
 * - transformations;
 * - other Skills;
 * - future content.
 *
 * Example:
 *
 *   Authored Skills:
 *     Direct Thrust III
 *
 *   Spider Mutation:
 *     grantSkill "wall-sticking"
 *
 *   Resolved Skills:
 *     Direct Thrust III
 *     Wall Sticking I
 *
 * The granted Wall Sticking Skill is NOT written permanently into the
 * character's authored Skill state.
 *
 * If Spider Mutation stops applying, the grant disappears automatically.
 *
 *
 * GRANT MASTERY
 * -------------
 *
 * A generic grantSkill or grantTechnique Effect grants access at Mastery I.
 *
 * If the character has independently trained that capability higher, their
 * authored Mastery wins.
 *
 * Example:
 *
 *   Item grants Swordsmanship I
 *   Character has authored Swordsmanship IV
 *
 *   Resolved Swordsmanship = IV
 *
 *
 * This file resolves capability ownership/Mastery only.
 *
 * It does NOT:
 *
 * - spend Growth Points;
 * - decide whether Mastery may advance;
 * - apply Skill-specific effects;
 * - apply Technique-specific effects;
 * - determine what a Mastery rank means;
 * - perform catalog lookups;
 * - recursively inspect content definitions.
 *
 * skills.ts and techniques.ts define capability progression.
 * rules/resolution.ts resolves generic Effects.
 * Higher-level character resolution will orchestrate those systems together.
 */

import type {
  SkillGrant,
  TechniqueGrant,
  RuleSourceRef,
} from "../rules/resolution";

import {
  NO_MASTERY,
} from "./mastery";

import type {
  MasteryRank,
  MasteryValue,
} from "./mastery";


/* -------------------------------------------------------------------------- */
/* Authored capability state                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Mastery explicitly owned by the character.
 *
 * This represents actual learned/trained progression and should be persisted
 * in character data.
 *
 * Missing ids are equivalent to Mastery 0.
 */
export type AuthoredCapabilityMastery =
  Readonly<Record<string, MasteryRank>>;


/* -------------------------------------------------------------------------- */
/* Resolved capability state                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A source currently granting access to a capability.
 */
export interface CapabilityGrantSource {
  readonly source: RuleSourceRef;
}


/**
 * The resolved state of one Skill or Technique.
 *
 * `authoredMastery` represents permanently learned/trained Mastery.
 *
 * `mastery` represents the Mastery currently available to the character after
 * authored state and grants are combined.
 */
export interface ResolvedCapability {
  readonly id: string;

  readonly authoredMastery: MasteryValue;
  readonly mastery: MasteryRank;

  readonly grantedBy: readonly CapabilityGrantSource[];

  readonly isAuthored: boolean;
  readonly isGranted: boolean;
}


/**
 * Resolved Skills indexed by Skill id.
 */
export type ResolvedSkills =
  Readonly<Record<string, ResolvedCapability>>;


/**
 * Resolved Techniques indexed by Technique id.
 */
export type ResolvedTechniques =
  Readonly<Record<string, ResolvedCapability>>;


/**
 * The complete capability state currently available to the character.
 */
export interface ResolvedCapabilities {
  readonly skills: ResolvedSkills;
  readonly techniques: ResolvedTechniques;
}


/**
 * Inputs required to resolve character capabilities.
 */
export interface ResolveCapabilitiesInput {
  readonly authoredSkills?: AuthoredCapabilityMastery;
  readonly authoredTechniques?: AuthoredCapabilityMastery;

  readonly skillGrants?: readonly SkillGrant[];
  readonly techniqueGrants?: readonly TechniqueGrant[];
}


/* -------------------------------------------------------------------------- */
/* Shared capability resolution                                               */
/* -------------------------------------------------------------------------- */

interface GenericCapabilityGrant {
  readonly id: string;
  readonly source: RuleSourceRef;
}


/**
 * Prevent the same content source from appearing multiple times in the
 * resolved provenance list for one capability.
 */
function addGrantSource(
  sources: CapabilityGrantSource[],
  source: RuleSourceRef,
): void {
  const alreadyPresent = sources.some(
    (existing) =>
      existing.source.type === source.type &&
      existing.source.id === source.id,
  );

  if (!alreadyPresent) {
    sources.push({ source });
  }
}


/**
 * Resolve one category of capability.
 *
 * A grant supplies Mastery I.
 *
 * Authored Mastery always remains authoritative if it is higher.
 */
function resolveCapabilitySet(
  authored: AuthoredCapabilityMastery,
  grants: readonly GenericCapabilityGrant[],
): Readonly<Record<string, ResolvedCapability>> {
  const grantSources = new Map<string, CapabilityGrantSource[]>();


  for (const grant of grants) {
    const existing = grantSources.get(grant.id) ?? [];

    addGrantSource(
      existing,
      grant.source,
    );

    grantSources.set(
      grant.id,
      existing,
    );
  }


  const ids = new Set<string>([
    ...Object.keys(authored),
    ...grantSources.keys(),
  ]);


  const resolved: Record<string, ResolvedCapability> = {};


  for (const id of ids) {
    const authoredMastery: MasteryValue =
      authored[id] ?? NO_MASTERY;

    const grantedBy =
      grantSources.get(id) ?? [];

    const isAuthored =
      authoredMastery > NO_MASTERY;

    const isGranted =
      grantedBy.length > 0;


    /*
     * A grant supplies Mastery I.
     *
     * Since authored Mastery can only be I-X, any authored value is already
     * equal to or greater than the grant.
     */
    const mastery: MasteryRank =
      isAuthored
        ? authoredMastery as MasteryRank
        : 1;


    resolved[id] = {
      id,

      authoredMastery,
      mastery,

      grantedBy,

      isAuthored,
      isGranted,
    };
  }


  return resolved;
}


/* -------------------------------------------------------------------------- */
/* Public resolution                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the Skills and Techniques currently available to a character.
 *
 * This function is pure and never modifies authored character state.
 */
export function resolveCapabilities(
  input: ResolveCapabilitiesInput,
): ResolvedCapabilities {
  const authoredSkills =
    input.authoredSkills ?? {};

  const authoredTechniques =
    input.authoredTechniques ?? {};


  const skillGrants: GenericCapabilityGrant[] =
    (input.skillGrants ?? []).map((grant) => ({
      id: grant.skillId,
      source: grant.source,
    }));


  const techniqueGrants: GenericCapabilityGrant[] =
    (input.techniqueGrants ?? []).map((grant) => ({
      id: grant.techniqueId,
      source: grant.source,
    }));


  return {
    skills: resolveCapabilitySet(
      authoredSkills,
      skillGrants,
    ),

    techniques: resolveCapabilitySet(
      authoredTechniques,
      techniqueGrants,
    ),
  };
}


/* -------------------------------------------------------------------------- */
/* Lookup helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Return the currently resolved Mastery of a Skill.
 *
 * Missing Skills resolve to Mastery 0.
 */
export function getResolvedSkillMastery(
  capabilities: ResolvedCapabilities,
  skillId: string,
): MasteryValue {
  return (
    capabilities.skills[skillId]?.mastery ??
    NO_MASTERY
  );
}


/**
 * Return the currently resolved Mastery of a Technique.
 *
 * Missing Techniques resolve to Mastery 0.
 */
export function getResolvedTechniqueMastery(
  capabilities: ResolvedCapabilities,
  techniqueId: string,
): MasteryValue {
  return (
    capabilities.techniques[techniqueId]?.mastery ??
    NO_MASTERY
  );
}


/**
 * Determine whether the character currently has access to a Skill.
 */
export function hasResolvedSkill(
  capabilities: ResolvedCapabilities,
  skillId: string,
): boolean {
  return (
    getResolvedSkillMastery(
      capabilities,
      skillId,
    ) > NO_MASTERY
  );
}


/**
 * Determine whether the character currently has access to a Technique.
 */
export function hasResolvedTechnique(
  capabilities: ResolvedCapabilities,
  techniqueId: string,
): boolean {
  return (
    getResolvedTechniqueMastery(
      capabilities,
      techniqueId,
    ) > NO_MASTERY
  );
}


/* -------------------------------------------------------------------------- */
/* Requirement projection                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Convert resolved Skills into the simple id → Mastery structure expected by
 * the universal Requirement evaluator.
 */
export function getResolvedSkillMasteryRecord(
  capabilities: ResolvedCapabilities,
): Readonly<Record<string, number>> {
  const mastery: Record<string, number> = {};


  for (const [id, skill] of Object.entries(
    capabilities.skills,
  )) {
    mastery[id] = skill.mastery;
  }


  return mastery;
}


/**
 * Convert resolved Techniques into the simple id → Mastery structure expected
 * by the universal Requirement evaluator.
 */
export function getResolvedTechniqueMasteryRecord(
  capabilities: ResolvedCapabilities,
): Readonly<Record<string, number>> {
  const mastery: Record<string, number> = {};


  for (const [id, technique] of Object.entries(
    capabilities.techniques,
  )) {
    mastery[id] = technique.mastery;
  }


  return mastery;
}