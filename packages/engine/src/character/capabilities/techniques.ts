/*
 * Techniques — the broad disciplines a character has trained in.
 *
 * Swordsmanship, Medicine, Firebending Forms, Dual Wielding. A Technique is
 * not something you do; it is the body of training that the things you do
 * come out of.
 *
 * ── Mastery is breadth ──────────────────────────────────────────────────
 *
 * Advancing a Technique widens it. Each rank normally grants another of the
 * discipline's Skills, and may add a benefit that applies across the whole
 * discipline:
 *
 *   Swordsmanship I    → Direct Thrust
 *   Swordsmanship II   → Vertical Slash
 *   Swordsmanship III  → Parry
 *
 * That is why no swordsmanship.ts exists. A rank is a MasteryRankDefinition
 * carrying ordinary grantSkill Effects, so authoring a new discipline is
 * authoring data.
 *
 * Depth is the other axis and belongs to the individual Skill — see skills.ts.
 *
 * ── Evolution and combination ───────────────────────────────────────────
 *
 * A Technique that requires other Techniques is just a Technique with
 * Requirements:
 *
 *   Twin Blade Swordsmanship
 *     requires Swordsmanship V, Dual Wielding III, DEX base 16
 *
 * Nothing in the engine needs to know what "evolution" means; the requirement
 * is the whole of it.
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

export type TechniqueId = string;

/**
 * The engine-owned definition of a Technique.
 *
 * `effects` apply from the moment the character has the Technique at all;
 * per-rank effects live on the ranks. `requirements` gate acquiring it.
 */
export interface TechniqueDefinition extends EffectfulDefinition {
  /**
   * How far this discipline widens, and what each rank of it hands over.
   *
   * Absent means the Technique has no Mastery: a body of training that is
   * either had or not had, with nothing further to reach. Rare for a
   * discipline, and deliberately possible — see mastery.ts's MasteryTrack.
   */
  readonly mastery?: MasteryTrack;
}

/**
 * A Technique the character has trained.
 *
 * The stored rank is optional. On a Technique WITH a Mastery track its absence
 * means I: a sheet being filled in should be able to say "they know
 * Swordsmanship" before deciding how far, and the one rank every held track
 * starts at is the sensible reading of that. On a Technique with no track it
 * means what it says — no Mastery — and storing a rank there is a validation
 * error rather than a rank to honour.
 */
export interface CharacterTechnique {
  readonly techniqueId: TechniqueId;
  readonly mastery?: MasteryRank;
}

export const TECHNIQUE_DEFINITIONS = {
  "martial-arts": {
    id: "martial-arts",
    name: "Martial Arts",
    description:
      "Structured training in unarmed combat and bodily fighting techniques.",
    mastery: {
      maximumMastery: STANDARD_MASTERY_MAX,
      ranks: [
        {
          rank: 1,
          description: "The trained strike.",
          effects: [{ type: "grantSkill", skillId: "punch" }],
        },
        {
          rank: 2,
          description: "Turning an incoming attack aside.",
          effects: [{ type: "grantSkill", skillId: "parry" }],
        },
        {
          rank: 3,
          description: "Fighting from a held position.",
          effects: [{ type: "grantSkill", skillId: "defensive-stance" }],
        },
      ],
    },
  },

  lockpicking: {
    id: "lockpicking",
    name: "Lockpicking",
    description:
      "Structured knowledge of manually bypassing mechanical locks.",
    mastery: {
      maximumMastery: 5,
      ranks: [
        {
          rank: 1,
          effects: [{ type: "grantSkill", skillId: "pick-lock" }],
        },
      ],
    },
  },

  "firebending-forms": {
    id: "firebending-forms",
    name: "Firebending Forms",
    description:
      "Structured training in the controlled application of Firebending.",

    // The training is only meaningful to someone who can bend fire at all.
    // The capability is a Trait, so the discipline asks for the Trait rather
    // than for the Sub-species that usually supplies it.
    requirements: [{ type: "hasTrait", traitId: "firebending" }],

    mastery: {
      maximumMastery: STANDARD_MASTERY_MAX,
      ranks: [
        {
          rank: 1,
          effects: [{ type: "grantSkill", skillId: "fire-blast" }],
        },
      ],
    },
  },
} as const satisfies Record<string, TechniqueDefinition>;

const TECHNIQUE_REGISTRY = createRegistry<TechniqueDefinition>(
  "Technique",
  TECHNIQUE_DEFINITIONS,
);

export type KnownTechniqueId = keyof typeof TECHNIQUE_DEFINITIONS;

export function isKnownTechniqueId(
  techniqueId: TechniqueId,
): boolean {
  return TECHNIQUE_REGISTRY.isKnownId(techniqueId);
}

export function getTechniqueDefinition(
  techniqueId: TechniqueId,
): TechniqueDefinition | undefined {
  return TECHNIQUE_REGISTRY.get(techniqueId);
}

/**
 * The Mastery track a Technique declares, if it has one.
 *
 * Unknown ids fall back to the standard track rather than throwing, and
 * rather than reading as non-mastered: validation reports them, and resolution
 * should neither stop at one bad id nor silently drop the rank stored on it.
 */
export function techniqueMasteryTrack(
  techniqueId: TechniqueId,
): MasteryTrack | undefined {
  const definition = getTechniqueDefinition(techniqueId);

  if (definition === undefined) return { maximumMastery: STANDARD_MASTERY_MAX };

  return definition.mastery;
}

/** Whether a Technique has Mastery at all. */
export function techniqueSupportsMastery(techniqueId: TechniqueId): boolean {
  return techniqueMasteryTrack(techniqueId) !== undefined;
}

/**
 * The Mastery a character entry represents.
 *
 * One place decides that an absent rank means I on a track and no Mastery
 * without one, so no caller has to.
 */
export function techniqueMastery(
  technique: CharacterTechnique,
): MasteryRank | null {
  return trackMastery(
    techniqueMasteryTrack(technique.techniqueId),
    technique.mastery,
  );
}

/**
 * A character's Techniques as the id → Mastery record resolution consumes.
 *
 * A null value is a Technique held with no Mastery, which is a possession as
 * real as a ranked one.
 */
export function toTechniqueMasteryRecord(
  techniques: readonly CharacterTechnique[] = [],
): Readonly<Record<TechniqueId, MasteryRank | null>> {
  const record: Record<TechniqueId, MasteryRank | null> = {};

  for (const technique of techniques) {
    record[technique.techniqueId] = techniqueMastery(technique);
  }

  return record;
}

/**
 * The maximum rank a Technique allows, or null when it has no Mastery.
 */
export function techniqueMaximumMastery(
  techniqueId: TechniqueId,
): MasteryRank | null {
  return techniqueMasteryTrack(techniqueId)?.maximumMastery ?? null;
}

/**
 * Everything a character holding this Technique at this Mastery contributes.
 *
 * The Technique's own effects plus the cumulative effects of every rank
 * reached — which is what turns "Swordsmanship III" into three granted
 * Skills without anything Swordsmanship-specific in the engine. A Technique
 * with no Mastery contributes its own effects and nothing further.
 */
export function collectTechniqueEffects(
  definition: TechniqueDefinition,
  mastery: MasteryValue | null,
): readonly Effect[] {
  const track = definition.mastery;

  return [
    ...(definition.effects ?? []),
    ...(track === undefined ? [] : collectMasteryRankEffects(track, mastery)),
  ];
}

/*
 * Development-time validation of the authored Technique catalog.
 *
 * Cross-catalog reference checking belongs to catalogs.ts, which can see the
 * Skills a rank grants without this file importing them.
 */
export function findTechniqueCatalogIssues(): readonly string[] {
  const issues = [...TECHNIQUE_REGISTRY.findCatalogIssues()];

  for (const technique of TECHNIQUE_REGISTRY.all()) {
    if (technique.mastery !== undefined) {
      issues.push(
        ...findMasteryTrackIssues("Technique", technique.id, technique.mastery),
      );
    }
  }

  return issues;
}

// Exposed for the catalog index, which needs every registry in one map.
export const techniqueRegistry = TECHNIQUE_REGISTRY;
