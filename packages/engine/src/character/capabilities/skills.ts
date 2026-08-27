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

import {
  findMasteryTrackIssues,
  STANDARD_MASTERY_MAX,
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
export interface SkillDefinition extends EffectfulDefinition, MasteryTrack {
  /**
   * Relevant only when structured timing is active. A Skill may support both
   * normal Action and Reaction execution.
   */
  readonly timings: readonly SkillTiming[];
}

/**
 * A Skill the character knows.
 *
 * Mastery is optional, and absent means I — see CharacterTechnique for why.
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
    maximumMastery: STANDARD_MASTERY_MAX,
    requirements: [
      { type: "hasTechnique", techniqueId: "martial-arts" },
    ],
  },

  parry: {
    id: "parry",
    name: "Parry",
    description: "React to an incoming attack by actively deflecting it.",
    timings: ["reaction"],
    maximumMastery: STANDARD_MASTERY_MAX,
    requirements: [
      { type: "techniqueMastery", techniqueId: "martial-arts", minimumMastery: 2 },
    ],
  },

  "defensive-stance": {
    id: "defensive-stance",
    name: "Defensive Stance",
    description: "Enter a trained defensive fighting stance.",
    timings: ["action"],
    maximumMastery: STANDARD_MASTERY_MAX,
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
    maximumMastery: 5,
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
    maximumMastery: STANDARD_MASTERY_MAX,
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

/** The Mastery a character entry represents; absent means I. */
export function skillMastery(skill: CharacterSkill): MasteryRank {
  return skill.mastery ?? 1;
}

/** A character's Skills as the id → Mastery record resolution consumes. */
export function toSkillMasteryRecord(
  skills: readonly CharacterSkill[] = [],
): Readonly<Record<SkillId, MasteryRank>> {
  const record: Record<SkillId, MasteryRank> = {};

  for (const skill of skills) {
    record[skill.skillId] = skillMastery(skill);
  }

  return record;
}

/**
 * The maximum rank a Skill allows.
 *
 * Unknown ids fall back to the standard maximum rather than throwing.
 */
export function skillMaximumMastery(skillId: SkillId): MasteryRank {
  return getSkillDefinition(skillId)?.maximumMastery ?? STANDARD_MASTERY_MAX;
}

/**
 * Everything a character knowing this Skill at this Mastery contributes.
 *
 * Ranks are cumulative, so a Skill at III contributes the effects of I, II
 * and III.
 */
export function collectSkillEffects(
  definition: SkillDefinition,
  mastery: MasteryValue,
) {
  return [
    ...(definition.effects ?? []),
    ...(definition.ranks ?? [])
      .filter((rank) => rank.rank <= mastery)
      .sort((left, right) => left.rank - right.rank)
      .flatMap((rank) => rank.effects ?? []),
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

    issues.push(...findMasteryTrackIssues("Skill", skill.id, skill));
  }

  return issues;
}

// Exposed for the catalog index, which needs every registry in one map.
export const skillRegistry = SKILL_REGISTRY;
