/*
 * Skills — the concrete things a character can attempt on purpose.
 *
 * Direct Thrust, Wall Sticking, Pick Lock, Fire Blast. Anything a player
 * invents on the spot is an improvised attempt instead — see attempts.ts.
 *
 * ── Mastery is depth ────────────────────────────────────────────────────
 *
 * A Technique widens as it advances; a Skill deepens:
 *
 *   Wall Sticking I    → basic surface adhesion
 *   Wall Sticking II   → controlled movement while adhered
 *   Wall Sticking III  → adhesion under much greater force
 *
 * What a rank means is specific to the Skill, so there is no universal
 * per-rank bonus. A Skill declares its own ranks, and may end its track
 * early: three ranks is a complete Skill if the third is everything the Skill
 * has to give.
 *
 * A Skill may also declare no track at all. Activating a door rune is a thing
 * a character can either do or not do; there is no better way to do it and
 * nothing to advance. Such a Skill is held with NO Mastery rather than held at
 * Mastery I — see mastery.ts's trackMastery() — because a rank that can never
 * change is a rank a player will keep trying to spend Growth Points on.
 *
 * ── Requirements ────────────────────────────────────────────────────────
 *
 * Skills used to carry their own requirement shape — lists of Ability and
 * Technique ids, satisfied if any one list matched. That was a second, weaker
 * copy of rules/requirements.ts, and it could not express "DEX 14" or "Parry
 * II" at all. Skills now use the universal Requirements, so
 *
 *   Riposte: Swordsmanship IV, DEX base 14, Parry II
 *
 * is authorable data rather than a new requirement type.
 *
 * ── Nen Principles ──────────────────────────────────────────────────────
 *
 * Ten, Ren, Gyō and the rest are Skills conceptually and fit this shape, but
 * each introduces substantial Aura mechanics, so they keep dedicated
 * implementations under foundation/nen/principles/. They are the deliberate
 * exception to "content is data"; nothing else should follow them.
 */

import { createRegistry } from "../../infrastructure/registry";

import type { EffectfulDefinition } from "../rules/content";
import type { Effect } from "../rules/effects";

import {
  collectMasteryRankEffects,
  findMasteryTrackIssues,
  STANDARD_MASTERY_MAX,
  trackMastery,
  type MasteryRank,
  type MasteryTrack,
  type MasteryValue,
} from "./mastery";

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
 * Engine-owned definition of a Skill.
 *
 * `requirements` gate learning or being granted it; `effects` apply while it
 * is known, with rank-specific ones on the ranks themselves.
 */
export interface SkillDefinition extends EffectfulDefinition {
  /**
   * Relevant only when structured timing is active. A Skill may support both
   * normal Action and Reaction execution.
   */
  readonly timings: readonly SkillTiming[];

  /**
   * How far this Skill can be deepened, and what each rank of it carries.
   *
   * Absent means the Skill has no Mastery: it is held or it is not.
   */
  readonly mastery?: MasteryTrack;

  /**
   * The Skills this one REPLACES.
   *
   * Declared, never inferred. A name that reads like a successor, a parent
   * Trait, and a prerequisite are all things content authors use for other
   * reasons, so guessing from any of them would silently retire capabilities
   * nobody meant to retire.
   *
   * Holding this one makes each listed Skill subsumed rather than gone:
   * the acquisition stays on the record, requirements naming it are still
   * satisfied, and its effects and grants are inherited by this one instead of
   * applying separately. Chains work — and are checked for cycles by
   * capabilities/dependencies.ts.
   */
  readonly subsumes?: readonly SkillId[];

  /**
   * Whether this may only be acquired once something has unlocked it.
   *
   * Off by default, which is the ordinary case: anything whose prerequisites a
   * character meets is theirs to take up. Turning it on says the prerequisites
   * are NOT the whole gate — a Clan's inner style is closed to outsiders who
   * would otherwise qualify perfectly well, and the Clan's grant is what opens
   * it.
   *
   * An unlock supplies PERMISSION, never prerequisites. Something declared
   * this way and reachable by nobody's unlock can never be acquired at all,
   * which capabilities/dependencies.ts reports.
   */
  readonly requiresUnlock?: boolean;
}

/**
 * A Skill the character knows.
 *
 * The stored rank is optional, and what its absence means depends on the
 * definition rather than on this entry: I for a Skill with a Mastery track,
 * and no Mastery at all for one without. Storing a rank against a Skill that
 * has no track is a validation error — see capabilities/validation.ts.
 */
export interface CharacterSkill {
  readonly skillId: SkillId;
  readonly mastery?: MasteryRank;
}

export const SKILL_DEFINITIONS = {
  punch: {
    id: "punch",
    name: "Punch",
    description: "Deliver a trained unarmed strike using the fist.",
    timings: ["action"],
    mastery: { maximumMastery: STANDARD_MASTERY_MAX },
    requirements: [
      { type: "hasTechnique", techniqueId: "martial-arts" },
    ],
  },

  parry: {
    id: "parry",
    name: "Parry",
    description: "React to an incoming attack by actively deflecting it.",
    timings: ["reaction"],
    mastery: { maximumMastery: STANDARD_MASTERY_MAX },
    requirements: [
      { type: "techniqueMastery", techniqueId: "martial-arts", minimumMastery: 2 },
    ],
  },

  "defensive-stance": {
    id: "defensive-stance",
    name: "Defensive Stance",
    description: "Enter a trained defensive fighting stance.",
    timings: ["action"],
    mastery: { maximumMastery: STANDARD_MASTERY_MAX },
    requirements: [
      { type: "techniqueMastery", techniqueId: "martial-arts", minimumMastery: 3 },
    ],
  },

  "pick-lock": {
    id: "pick-lock",
    name: "Pick Lock",
    description:
      "Manipulate a mechanical lock using trained lockpicking methods.",
    timings: ["action"],
    mastery: { maximumMastery: 5 },
    requirements: [
      { type: "hasTechnique", techniqueId: "lockpicking" },
    ],
  },

  /*
   * The old two-part gate, unchanged in meaning: the capability to bend fire
   * at all, plus training in applying it. What changed is that both halves
   * are now ordinary requirement types rather than a bespoke pair of id
   * lists.
   */
  "fire-blast": {
    id: "fire-blast",
    name: "Fire Blast",
    description: "Project fire offensively using trained Firebending.",
    timings: ["action"],
    mastery: { maximumMastery: STANDARD_MASTERY_MAX },
    requirements: [
      {
        type: "all",
        requirements: [
          { type: "hasTrait", traitId: "firebending" },
          { type: "hasTechnique", techniqueId: "firebending-forms" },
        ],
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

/**
 * The Mastery track a Skill declares, if it has one.
 *
 * An UNKNOWN id is treated as carrying the standard track rather than as
 * having none. Validation reports the unknown id; reading it as non-mastered
 * here would additionally discard whatever rank the sheet stored against it,
 * which is a second wrong answer to a problem that already has a message.
 */
export function skillMasteryTrack(
  skillId: SkillId,
): MasteryTrack | undefined {
  const definition = getSkillDefinition(skillId);

  if (definition === undefined) return { maximumMastery: STANDARD_MASTERY_MAX };

  return definition.mastery;
}

/** Whether a Skill has Mastery at all. */
export function skillSupportsMastery(skillId: SkillId): boolean {
  return skillMasteryTrack(skillId) !== undefined;
}

/**
 * The Mastery a character entry represents.
 *
 * Null means the Skill has no Mastery, which is NOT the same as not having the
 * Skill — absence from the character's list is what means that.
 */
export function skillMastery(skill: CharacterSkill): MasteryRank | null {
  return trackMastery(skillMasteryTrack(skill.skillId), skill.mastery);
}

/**
 * A character's Skills as the id → Mastery record resolution consumes.
 *
 * A null value is a Skill held with no Mastery, and is as real an entry as a
 * ranked one; a caller must not read it the way it reads a missing key.
 */
export function toSkillMasteryRecord(
  skills: readonly CharacterSkill[] = [],
): Readonly<Record<SkillId, MasteryRank | null>> {
  const record: Record<SkillId, MasteryRank | null> = {};

  for (const skill of skills) {
    record[skill.skillId] = skillMastery(skill);
  }

  return record;
}

/**
 * The maximum rank a Skill allows, or null when it has no Mastery.
 *
 * Unknown ids fall back to the standard maximum rather than throwing.
 */
export function skillMaximumMastery(skillId: SkillId): MasteryRank | null {
  return skillMasteryTrack(skillId)?.maximumMastery ?? null;
}

/**
 * Everything a character knowing this Skill at this Mastery contributes.
 *
 * Ranks are cumulative, so a Skill at III contributes the effects of I, II
 * and III. A Skill with no Mastery still contributes its own effects: having
 * no ranks is not the same as having nothing to give.
 */
export function collectSkillEffects(
  definition: SkillDefinition,
  mastery: MasteryValue | null,
): readonly Effect[] {
  const track = definition.mastery;

  return [
    ...(definition.effects ?? []),
    ...(track === undefined ? [] : collectMasteryRankEffects(track, mastery)),
  ];
}

/*
 * Development-time validation of the authored Skill catalog.
 *
 * Whether the ids a Skill's requirements point at actually exist is checked
 * by catalogs.ts, which can see every domain at once — asking this file to do
 * it would mean importing every catalog a requirement can name.
 */
export function findSkillCatalogIssues(): readonly string[] {
  const issues = [...SKILL_REGISTRY.findCatalogIssues()];

  for (const skill of SKILL_REGISTRY.all()) {
    if (skill.timings.length === 0) {
      issues.push(`Skill "${skill.id}" has no valid timing.`);
    }

    if (skill.mastery !== undefined) {
      issues.push(...findMasteryTrackIssues("Skill", skill.id, skill.mastery));
    }
  }

  return issues;
}

// Exposed for the catalog index, which needs every registry in one map.
export const skillRegistry = SKILL_REGISTRY;
