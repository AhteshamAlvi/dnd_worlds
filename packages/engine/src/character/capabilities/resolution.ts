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
 * A generic grantSkill or grantTechnique Effect grants access at Mastery I —
 * when the granted capability HAS Mastery. When it does not, the grant hands
 * over the capability itself and nothing else, and the resolved Mastery is
 * null.
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
 * POSSESSION IS NOT A RANK
 * ------------------------
 *
 * Having a capability and having a Mastery rank in it are two facts, and this
 * file keeps them apart. Presence in the resolved record means the character
 * has the capability; `mastery` says what rank they hold, or null when the
 * capability has no ranks to hold. Nothing here may go back to reading
 * `mastery > 0` as "has it" — that is precisely what made a Skill without a
 * Mastery track impossible to express.
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
 * - recursively inspect content definitions.
 *
 * It DOES ask each definition one question — whether it has a Mastery track —
 * because that is not something a character's own state can answer, and
 * inventing a rank for a capability that has none is the alternative.
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

import { trackMastery } from "./mastery";

import type { MasteryRank, MasteryTrack } from "./mastery";

import {
  skillMasteryTrack,
  type CharacterSkill,
} from "./skills";

import {
  techniqueMasteryTrack,
  type CharacterTechnique,
} from "./techniques";


/* -------------------------------------------------------------------------- */
/* Authored capability state                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A character's own capabilities as an id → Mastery projection.
 *
 * A missing id means the character does not have that capability. A NULL value
 * means they have it and it has no Mastery, which is why this cannot be a
 * record of ranks alone.
 *
 * Not what resolveCapabilities() takes — it reads the authored entries, so
 * that it can tell a stored rank from an interpreted one. This is the flatter
 * shape effect resolution seeds itself from.
 */
export type AuthoredCapabilityMastery =
  Readonly<Record<string, MasteryRank | null>>;


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
 * The resolved state of one Skill or Technique the character HAS.
 *
 * A capability the character does not have has no entry at all; there is no
 * such thing as a resolved capability that is absent, which is what stops
 * "possesses it" from being spelled as a rank comparison anywhere.
 */
export interface ResolvedCapability {
  readonly id: string;

  /** Listed on the sheet, whatever rank (if any) is stored against it. */
  readonly isAuthored: boolean;

  /** Currently supplied by something else — a Trait, an Item, a Technique. */
  readonly isGranted: boolean;

  readonly grantedBy: readonly CapabilityGrantSource[];

  /** Whether the definition declares a Mastery track at all. */
  readonly supportsMastery: boolean;

  /**
   * Permanently learned/trained Mastery.
   *
   * Absent when the character has not authored the capability, and when the
   * capability has no Mastery to author.
   */
  readonly authoredMastery?: MasteryRank;

  /**
   * The Mastery currently available after authored state and grants are
   * combined, or null when the capability has no Mastery.
   */
  readonly mastery: MasteryRank | null;
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
 *
 * The authored ENTRIES, not a record of ranks. A record cannot say "held, with
 * no Mastery" without a sentinel, and the sentinel it used to have — absence —
 * already means "not held". The entries carry the distinction the definitions
 * then interpret.
 */
export interface ResolveCapabilitiesInput {
  readonly authoredSkills?: readonly CharacterSkill[];
  readonly authoredTechniques?: readonly CharacterTechnique[];

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
 * One authored capability entry, whichever kind it is.
 *
 * Skills and Techniques store the same two things under different key names,
 * so the resolver takes the shared shape and each caller renames on the way
 * in.
 */
interface AuthoredCapabilityEntry {
  readonly id: string;
  readonly storedMastery?: MasteryRank;
}


/**
 * Resolve one category of capability.
 *
 * A grant supplies Mastery I to a capability that has Mastery, and bare access
 * to one that does not.
 *
 * Authored Mastery always remains authoritative if it is higher.
 *
 * `masteryTrack` is how this stays ignorant of which category it is resolving
 * while still being able to tell a rank-bearing capability from one that has
 * no ranks — a question only the definition can answer.
 */
function resolveCapabilitySet(
  authored: readonly AuthoredCapabilityEntry[],
  grants: readonly GenericCapabilityGrant[],
  masteryTrack: (id: string) => MasteryTrack | undefined,
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


  /*
   * Last entry wins for a repeated id.
   *
   * A sheet listing the same Skill twice is a validation error, but resolution
   * still has to give ONE answer for it, and it has to be the same answer
   * every other reader of that sheet gives — see toSkillMasteryRecord, which
   * is built by the same rule.
   */
  const authoredById = new Map<string, AuthoredCapabilityEntry>();

  for (const entry of authored) authoredById.set(entry.id, entry);


  const ids = new Set<string>([
    ...authoredById.keys(),
    ...grantSources.keys(),
  ]);


  const resolved: Record<string, ResolvedCapability> = {};


  for (const id of ids) {
    const entry = authoredById.get(id);

    const track = masteryTrack(id);

    const grantedBy =
      grantSources.get(id) ?? [];

    /*
     * Authored means LISTED, not ranked. A Skill with no Mastery track is
     * authored by appearing on the sheet at all, and reading a rank to decide
     * that would make such a Skill impossible to own.
     */
    const isAuthored =
      entry !== undefined;

    const isGranted =
      grantedBy.length > 0;

    const authoredMastery =
      entry === undefined ? null : trackMastery(track, entry.storedMastery);

    /*
     * A grant supplies Mastery I, and any authored rank is at least I, so the
     * authored value wins wherever there is one. A capability with no track
     * resolves to null however it was come by.
     */
    const mastery: MasteryRank | null =
      track === undefined ? null : authoredMastery ?? 1;


    resolved[id] = {
      id,

      isAuthored,
      isGranted,

      grantedBy,

      supportsMastery: track !== undefined,

      ...(authoredMastery === null ? {} : { authoredMastery }),

      mastery,
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
  const authoredSkills: AuthoredCapabilityEntry[] =
    (input.authoredSkills ?? []).map((skill) => ({
      id: skill.skillId,
      ...(skill.mastery === undefined ? {} : { storedMastery: skill.mastery }),
    }));


  const authoredTechniques: AuthoredCapabilityEntry[] =
    (input.authoredTechniques ?? []).map((technique) => ({
      id: technique.techniqueId,
      ...(technique.mastery === undefined
        ? {}
        : { storedMastery: technique.mastery }),
    }));


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
      skillMasteryTrack,
    ),

    techniques: resolveCapabilitySet(
      authoredTechniques,
      techniqueGrants,
      techniqueMasteryTrack,
    ),
  };
}


/* -------------------------------------------------------------------------- */
/* Lookup helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The Mastery the character currently has in a Skill.
 *
 * Three answers, and they are three different facts:
 *
 *   a rank    → they have it, at that rank
 *   null      → they have it, and it has no Mastery
 *   undefined → they do not have it
 *
 * The old signature collapsed the last two onto 0, which is what made a Skill
 * with no Mastery track indistinguishable from one nobody has. Use
 * hasResolvedSkill() to ask about possession.
 */
export function getResolvedSkillMastery(
  capabilities: ResolvedCapabilities,
  skillId: string,
): MasteryRank | null | undefined {
  return capabilities.skills[skillId]?.mastery;
}


/**
 * The Mastery the character currently has in a Technique, with the same three
 * answers getResolvedSkillMastery() gives.
 */
export function getResolvedTechniqueMastery(
  capabilities: ResolvedCapabilities,
  techniqueId: string,
): MasteryRank | null | undefined {
  return capabilities.techniques[techniqueId]?.mastery;
}


/**
 * Determine whether the character currently has access to a Skill.
 *
 * PRESENCE, not a rank comparison. A Skill with no Mastery is had exactly as
 * fully as one at rank X.
 */
export function hasResolvedSkill(
  capabilities: ResolvedCapabilities,
  skillId: string,
): boolean {
  return capabilities.skills[skillId] !== undefined;
}


/**
 * Determine whether the character currently has access to a Technique.
 */
export function hasResolvedTechnique(
  capabilities: ResolvedCapabilities,
  techniqueId: string,
): boolean {
  return capabilities.techniques[techniqueId] !== undefined;
}


/* -------------------------------------------------------------------------- */
/* Requirement projection                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every Skill the character has, whatever Mastery it carries.
 *
 * This is what a hasSkill requirement reads. It is a separate projection from
 * the Mastery record below because the two questions are separate: a Skill
 * with no Mastery belongs in this list and in no Mastery record.
 */
export function getResolvedSkillIds(
  capabilities: ResolvedCapabilities,
): readonly string[] {
  return Object.keys(capabilities.skills);
}


/**
 * Every Technique the character has, whatever Mastery it carries.
 */
export function getResolvedTechniqueIds(
  capabilities: ResolvedCapabilities,
): readonly string[] {
  return Object.keys(capabilities.techniques);
}


/**
 * Resolved Skill Mastery, as the id → rank record the Requirement evaluator
 * reads for skillMastery requirements.
 *
 * Skills with no Mastery are OMITTED rather than entered as 0. They are in the
 * id list instead, so they satisfy hasSkill and can never satisfy a rank
 * requirement — which is the whole distinction this projection exists to keep.
 */
export function getResolvedSkillMasteryRecord(
  capabilities: ResolvedCapabilities,
): Readonly<Record<string, MasteryRank>> {
  const mastery: Record<string, MasteryRank> = {};


  for (const [id, skill] of Object.entries(
    capabilities.skills,
  )) {
    if (skill.mastery !== null) mastery[id] = skill.mastery;
  }


  return mastery;
}


/**
 * Resolved Technique Mastery, on the same terms.
 */
export function getResolvedTechniqueMasteryRecord(
  capabilities: ResolvedCapabilities,
): Readonly<Record<string, MasteryRank>> {
  const mastery: Record<string, MasteryRank> = {};


  for (const [id, technique] of Object.entries(
    capabilities.techniques,
  )) {
    if (technique.mastery !== null) mastery[id] = technique.mastery;
  }


  return mastery;
}
