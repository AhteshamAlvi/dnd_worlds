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

import {
  findMasteryTrackIssues,
  STANDARD_MASTERY_MAX,
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
export interface TechniqueDefinition
  extends EffectfulDefinition,
    MasteryTrack {}

/**
 * A Technique the character has trained.
 *
 * Mastery is optional, and absent means I. A sheet being filled in should be
 * able to say "they know Swordsmanship" before deciding how far, and the one
 * rank every known capability has is the sensible reading of that.
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

  lockpicking: {
    id: "lockpicking",
    name: "Lockpicking",
    description:
      "Structured knowledge of manually bypassing mechanical locks.",
    maximumMastery: 5,
    ranks: [
      {
        rank: 1,
        effects: [{ type: "grantSkill", skillId: "pick-lock" }],
      },
    ],
  },

  "firebending-forms": {
    id: "firebending-forms",
    name: "Firebending Forms",
    description:
      "Structured training in the controlled application of Firebending.",
    maximumMastery: STANDARD_MASTERY_MAX,

    // The training is only meaningful to someone who can bend fire at all.
    // The capability is a Trait, so the discipline asks for the Trait rather
    // than for the Sub-species that usually supplies it.
    requirements: [{ type: "hasTrait", traitId: "firebending" }],

    ranks: [
      {
        rank: 1,
        effects: [{ type: "grantSkill", skillId: "fire-blast" }],
      },
    ],
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
 * The Mastery a character entry represents.
 *
 * One place decides that an absent rank means I, so no caller has to.
 */
export function techniqueMastery(
  technique: CharacterTechnique,
): MasteryRank {
  return technique.mastery ?? 1;
}

/**
 * A character's Techniques as the id → Mastery record resolution consumes.
 */
export function toTechniqueMasteryRecord(
  techniques: readonly CharacterTechnique[] = [],
): Readonly<Record<TechniqueId, MasteryRank>> {
  const record: Record<TechniqueId, MasteryRank> = {};

  for (const technique of techniques) {
    record[technique.techniqueId] = techniqueMastery(technique);
  }

  return record;
}

/**
 * The maximum rank a Technique allows, for a Technique that exists.
 *
 * Unknown ids fall back to the standard maximum rather than throwing:
 * validation reports them, and resolution should not stop at one bad id.
 */
export function techniqueMaximumMastery(
  techniqueId: TechniqueId,
): MasteryRank {
  return getTechniqueDefinition(techniqueId)?.maximumMastery ??
    STANDARD_MASTERY_MAX;
}

/**
 * Everything a character holding this Technique at this Mastery contributes.
 *
 * The Technique's own effects plus the cumulative effects of every rank
 * reached — which is what turns "Swordsmanship III" into three granted
 * Skills without anything Swordsmanship-specific in the engine.
 */
export function collectTechniqueEffects(
  definition: TechniqueDefinition,
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
 * Development-time validation of the authored Technique catalog.
 *
 * Cross-catalog reference checking belongs to catalogs.ts, which can see the
 * Skills a rank grants without this file importing them.
 */
export function findTechniqueCatalogIssues(): readonly string[] {
  const issues = [...TECHNIQUE_REGISTRY.findCatalogIssues()];

  for (const technique of TECHNIQUE_REGISTRY.all()) {
    issues.push(
      ...findMasteryTrackIssues("Technique", technique.id, technique),
    );
  }

  return issues;
}

// Exposed for the catalog index, which needs every registry in one map.
export const techniqueRegistry = TECHNIQUE_REGISTRY;
