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
  collectCapabilityAwards,
  foldCapabilityLifecycle,
  isHeldCapability,
  type CapabilityAvailability,
  type CapabilityAward,
  type CapabilityGrantEntry,
  type CapabilityGrantSource,
  type CapabilityKind,
  type CapabilityRef,
} from "./lifecycle";

import {
  getSkillDefinition,
  skillMasteryTrack,
  type CharacterSkill,
} from "./skills";

import {
  getTechniqueDefinition,
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

  /**
   * Whether this is theirs to use, superseded, or merely on offer.
   *
   * PRESENCE IS NO LONGER THE WHOLE ANSWER. An unlock puts a capability on the
   * record without giving it to the character, so a reader asking "do they
   * have this" must consult availability rather than the key alone — which is
   * what hasResolvedSkill() does.
   */
  readonly availability: CapabilityAvailability;

  /** Sources that permit the character to acquire this, without giving it. */
  readonly unlockedBy: readonly RuleSourceRef[];

  /** Capabilities they hold that replace this one. Empty unless subsumed. */
  readonly subsumedBy: readonly CapabilityRef[];
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

  /**
   * Which subsumed capabilities each surviving one carries the contributions
   * of, keyed by the surviving capability's id.
   *
   * Effect resolution reads this so that a replaced Technique's effects and
   * grants keep applying — once — through whatever replaced it, rather than
   * disappearing with it or applying twice alongside it.
   */
  readonly inheritedSkills: Readonly<Record<string, readonly string[]>>;
  readonly inheritedTechniques: Readonly<Record<string, readonly string[]>>;

  /**
   * Capabilities permanently awarded by currently applicable content.
   *
   * Returned rather than written: resolution is pure. A caller that owns the
   * character's stored state commits these through commitCapabilityAwards(),
   * which is idempotent precisely because this list is reproduced on every
   * resolution for as long as the awarding content applies.
   */
  readonly awards: readonly CapabilityAward[];
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

/**
 * Resolve one category of capability.
 *
 * The lifecycle half — authored versus granted, provenance, unlocks,
 * subsumption — is lifecycle.ts's shared fold, which Traits use too. What this
 * adds is the half that only a ranked capability has: which Mastery the
 * character ends up with.
 *
 * A grant supplies Mastery I to a capability that has Mastery, and bare access
 * to one that does not. Authored Mastery is at least I, so it wins wherever
 * there is one.
 */
function resolveCapabilitySet(
  kind: CapabilityKind,
  authored: readonly AuthoredCapabilityEntry[],
  grants: readonly CapabilityGrantEntry[],
  masteryTrack: (id: string) => MasteryTrack | undefined,
  subsumes: (id: string) => readonly string[],
): {
  readonly resolved: Readonly<Record<string, ResolvedCapability>>;
  readonly inherited: Readonly<Record<string, readonly string[]>>;
} {
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

  const lifecycle = foldCapabilityLifecycle({
    kind,
    authoredIds: authored.map((entry) => entry.id),
    grants,
    subsumes,
  });

  const resolved: Record<string, ResolvedCapability> = {};

  for (const [id, entry] of Object.entries(lifecycle.entries)) {
    const stored = authoredById.get(id);

    const track = masteryTrack(id);

    const authoredMastery =
      stored === undefined ? null : trackMastery(track, stored.storedMastery);

    /*
     * An UNLOCKED capability has no Mastery of any kind, because it is not
     * held. Reading it as I would turn permission into possession, which is
     * the one thing an unlock must never do.
     */
    const mastery: MasteryRank | null =
      track === undefined || !isHeldCapability(entry)
        ? null
        : authoredMastery ?? 1;

    resolved[id] = {
      ...entry,

      supportsMastery: track !== undefined,

      ...(authoredMastery === null ? {} : { authoredMastery }),

      mastery,
    };
  }

  return { resolved, inherited: lifecycle.inherited };
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


/* -------------------------------------------------------------------------- */
/* Public resolution                                                          */
/* -------------------------------------------------------------------------- */

function skillSubsumes(skillId: string): readonly string[] {
  return getSkillDefinition(skillId)?.subsumes ?? [];
}


function techniqueSubsumes(techniqueId: string): readonly string[] {
  return getTechniqueDefinition(techniqueId)?.subsumes ?? [];
}


/**
 * Resolve the Skills and Techniques currently available to a character.
 *
 * This function is pure and never modifies authored character state. Anything
 * a permanent grant awards comes back as data on the result; writing it down
 * is the caller's, through lifecycle.ts's commitCapabilityAwards.
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


  const skillGrants: CapabilityGrantEntry[] =
    (input.skillGrants ?? []).map((grant) => ({
      id: grant.skillId,
      source: grant.source,
      mode: grant.mode,
    }));


  const techniqueGrants: CapabilityGrantEntry[] =
    (input.techniqueGrants ?? []).map((grant) => ({
      id: grant.techniqueId,
      source: grant.source,
      mode: grant.mode,
    }));


  const skills = resolveCapabilitySet(
    "skill",
    authoredSkills,
    skillGrants,
    skillMasteryTrack,
    skillSubsumes,
  );

  const techniques = resolveCapabilitySet(
    "technique",
    authoredTechniques,
    techniqueGrants,
    techniqueMasteryTrack,
    techniqueSubsumes,
  );

  return {
    skills: skills.resolved,
    techniques: techniques.resolved,

    inheritedSkills: skills.inherited,
    inheritedTechniques: techniques.inherited,

    awards: [
      ...collectCapabilityAwards("technique", techniqueGrants),
      ...collectCapabilityAwards("skill", skillGrants),
    ],
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
 * with no Mastery track indistinguishable from one nobody has.
 *
 * A capability that is only UNLOCKED is answered `undefined` rather than
 * `null`, because the character does not have it. It is in the record so that
 * its offer can be reported, and reading its absent rank as "held, no Mastery"
 * would be the same conflation one field further along. Presence in the record
 * is not possession — ask hasResolvedSkill().
 */
export function getResolvedSkillMastery(
  capabilities: ResolvedCapabilities,
  skillId: string,
): MasteryRank | null | undefined {
  const skill = capabilities.skills[skillId];

  if (skill === undefined || !isHeldCapability(skill)) return undefined;

  return skill.mastery;
}


/**
 * The Mastery the character currently has in a Technique, with the same three
 * answers getResolvedSkillMastery() gives.
 */
export function getResolvedTechniqueMastery(
  capabilities: ResolvedCapabilities,
  techniqueId: string,
): MasteryRank | null | undefined {
  const technique = capabilities.techniques[techniqueId];

  if (technique === undefined || !isHeldCapability(technique)) return undefined;

  return technique.mastery;
}


/**
 * Determine whether the character currently has access to a Skill.
 *
 * NOT a rank comparison: a Skill with no Mastery is had exactly as fully as
 * one at rank X. Nor is it bare presence any more — the record also holds
 * capabilities that are only UNLOCKED, and an offer is not a possession. A
 * subsumed Skill counts, because the character has it through whatever
 * replaced it.
 */
export function hasResolvedSkill(
  capabilities: ResolvedCapabilities,
  skillId: string,
): boolean {
  const skill = capabilities.skills[skillId];

  return skill !== undefined && isHeldCapability(skill);
}


/**
 * Determine whether the character currently has access to a Technique.
 */
export function hasResolvedTechnique(
  capabilities: ResolvedCapabilities,
  techniqueId: string,
): boolean {
  const technique = capabilities.techniques[techniqueId];

  return technique !== undefined && isHeldCapability(technique);
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
 *
 * A merely UNLOCKED Skill belongs in neither. The character may acquire it and
 * does not have it, so a requirement naming it is unsatisfied — putting it
 * here would turn every unlock into a grant.
 */
export function getResolvedSkillIds(
  capabilities: ResolvedCapabilities,
): readonly string[] {
  return Object.entries(capabilities.skills)
    .filter(([, skill]) => isHeldCapability(skill))
    .map(([id]) => id);
}


/**
 * Every Technique the character has, whatever Mastery it carries.
 */
export function getResolvedTechniqueIds(
  capabilities: ResolvedCapabilities,
): readonly string[] {
  return Object.entries(capabilities.techniques)
    .filter(([, technique]) => isHeldCapability(technique))
    .map(([id]) => id);
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
