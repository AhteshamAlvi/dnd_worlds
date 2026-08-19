/*
 * Shared Mastery rank primitives.
 *
 * Mastery is the common rank language used by Skills and Techniques.
 *
 * Standard Mastery runs from:
 *
 *   I → X
 *
 * but an individual Skill or Technique may define a shorter track:
 *
 *   I → III
 *   I → V
 *   I → VII
 *   etc.
 *
 * X is the normal maximum supported Mastery rank.
 *
 * This file deliberately does NOT define what gaining Mastery means.
 *
 * Technique Mastery and Skill Mastery use the same rank vocabulary but have
 * different progression semantics:
 *
 * Technique Mastery:
 *   - represents breadth within a broader discipline;
 *   - normally grants an associated Skill when increased;
 *   - may provide Technique-wide passive benefits;
 *   - may qualify the Technique for evolution, combination, specialization,
 *     or other Techniques.
 *
 * Skill Mastery:
 *   - represents depth in one specific capability;
 *   - improves that Skill's own behavior/effects;
 *   - may have completely different advancement requirements from its parent
 *     Technique.
 *
 * Those rules belong in techniques.ts and skills.ts respectively.
 *
 * What this file does own is the shape of a Mastery *track*: how far it runs,
 * and what one rank on it carries. Both capability kinds need that shape, and
 * both attach the same universal Effects and Requirements to their ranks — so
 * declaring it twice would be two copies of one vocabulary, not two rules.
 */

import type { Effect } from "../rules/effects";
import type { Requirement } from "../rules/requirements";
import {
  findEffectsValidationIssues,
  findRequirementsValidationIssues,
} from "../rules/validation";


/* -------------------------------------------------------------------------- */
/* Mastery ranks                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Every supported learned Mastery rank.
 *
 * Numeric values are stored internally because they are easier to compare,
 * increment, validate, serialize, and use in requirements.
 *
 * They are displayed to players using Roman numerals.
 */
export const MASTERY_RANKS = [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
] as const;


/**
 * A learned Mastery rank.
 *
 * 1 = I
 * 2 = II
 * ...
 * 10 = X
 */
export type MasteryRank = typeof MASTERY_RANKS[number];


/**
 * No learned Mastery.
 *
 * Characters generally do not need to explicitly store Mastery 0; absence
 * from their Skill/Technique state can represent the same thing.
 *
 * The value remains useful during resolution and requirement checking.
 */
export const NO_MASTERY = 0 as const;


/**
 * Either no Mastery or a learned Mastery rank.
 */
export type MasteryValue =
  | typeof NO_MASTERY
  | MasteryRank;


/**
 * Standard maximum Mastery.
 *
 * Individual Skills and Techniques may use a lower maximum.
 */
export const STANDARD_MASTERY_MAX: MasteryRank = 10;


/* -------------------------------------------------------------------------- */
/* Roman numerals                                                             */
/* -------------------------------------------------------------------------- */

export const MASTERY_ROMAN_NUMERALS = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
  7: "VII",
  8: "VIII",
  9: "IX",
  10: "X",
} as const satisfies Readonly<Record<MasteryRank, string>>;


/**
 * Any Roman numeral used by the Mastery system.
 */
export type MasteryRomanNumeral =
  typeof MASTERY_ROMAN_NUMERALS[MasteryRank];


/**
 * Convert a learned Mastery rank into its player-facing Roman numeral.
 */
export function masteryRankToRoman(
  rank: MasteryRank,
): MasteryRomanNumeral {
  return MASTERY_ROMAN_NUMERALS[rank];
}


/**
 * Convert a Mastery Roman numeral back into its numeric rank.
 *
 * Returns null for anything outside I-X.
 */
export function romanToMasteryRank(
  roman: string,
): MasteryRank | null {
  const normalized = roman.trim().toUpperCase();

  for (const rank of MASTERY_RANKS) {
    if (MASTERY_ROMAN_NUMERALS[rank] === normalized) {
      return rank;
    }
  }

  return null;
}


/* -------------------------------------------------------------------------- */
/* Validation helpers                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Determine whether a number is a legal learned Mastery rank.
 */
export function isMasteryRank(
  value: number,
): value is MasteryRank {
  return (
    Number.isInteger(value) &&
    value >= 1 &&
    value <= STANDARD_MASTERY_MAX
  );
}


/**
 * Determine whether a number is either no Mastery or a legal learned rank.
 */
export function isMasteryValue(
  value: number,
): value is MasteryValue {
  return (
    value === NO_MASTERY ||
    isMasteryRank(value)
  );
}


/**
 * Determine whether a Mastery rank is valid for a particular Skill or
 * Technique's declared maximum.
 */
export function isMasteryWithinMaximum(
  rank: MasteryRank,
  maximum: MasteryRank,
): boolean {
  return rank <= maximum;
}


/* -------------------------------------------------------------------------- */
/* Progression helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Return the next Mastery rank available on a particular Mastery track.
 *
 * Examples:
 *
 *   current 0, maximum III → I
 *   current I, maximum III → II
 *   current II, maximum III → III
 *   current III, maximum III → null
 *
 * This function only answers what the next numeric rank is.
 *
 * It does NOT determine:
 *
 * - whether the character may advance;
 * - what advancement costs;
 * - what Requirements must be met;
 * - what Skill a Technique rank grants;
 * - what effects a Skill rank gains.
 */
export function getNextMasteryRank(
  current: MasteryValue,
  maximum: MasteryRank,
): MasteryRank | null {
  if (current >= maximum) {
    return null;
  }

  return (current + 1) as MasteryRank;
}


/**
 * Determine whether another Mastery rank exists on the declared track.
 */
export function canIncreaseMastery(
  current: MasteryValue,
  maximum: MasteryRank,
): boolean {
  return current < maximum;
}


/**
 * Return every Mastery rank belonging to a track up to its declared maximum.
 *
 * Examples:
 *
 *   maximum III
 *   → [I, II, III]
 *
 *   maximum X
 *   → [I, II, III, IV, V, VI, VII, VIII, IX, X]
 *
 * Numeric ranks are returned; UI layers can use masteryRankToRoman() for
 * display.
 */
export function getMasteryTrackRanks(
  maximum: MasteryRank,
): readonly MasteryRank[] {
  return MASTERY_RANKS.filter(
    (rank) => rank <= maximum,
  );
}

/* -------------------------------------------------------------------------- */
/* Mastery tracks                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What one rank on a Mastery track carries.
 *
 * Every field is optional because ranks differ in what they are for. A
 * Technique rank usually grants a Skill; a Skill rank usually deepens what
 * the Skill already does; either may cost Growth Points or demand something
 * of the character first.
 *
 * Nothing here is Skill-specific or Technique-specific: it is the same
 * effects/requirements vocabulary every other piece of content uses, pinned
 * to a rank.
 */
export interface MasteryRankDefinition {
  readonly rank: MasteryRank;

  /**
   * What reaching this rank means, in the Rulebook's words.
   *
   * Example: Wall Sticking III - "maintain adhesion under much greater
   * force".
   */
  readonly description?: string;

  /**
   * Growth Point cost of advancing *into* this rank.
   *
   * The capability owns its own cost; progression/growth.ts only spends the
   * currency once a capability has said what it costs.
   */
  readonly growthPointCost?: number;

  /**
   * What must already be true to reach this rank, beyond holding the previous
   * one — which the track structure implies and no content should restate.
   */
  readonly requirements?: readonly Requirement[];

  /**
   * What this rank contributes once held.
   *
   * Ranks are cumulative: holding rank III means the effects of I, II and III
   * all apply.
   */
  readonly effects?: readonly Effect[];
}


/**
 * A capability that advances through Mastery ranks.
 *
 * Skills and Techniques both extend this. `maximumMastery` is where the track
 * ends, which is X for most content but deliberately not all of it — a narrow
 * Skill that has nowhere left to go by III should say III rather than leave
 * seven ranks nobody will ever author.
 */
export interface MasteryTrack {
  readonly maximumMastery: MasteryRank;

  /**
   * The authored ranks, in any order.
   *
   * Sparse by design: a track may define what happens at I, III and V and
   * leave the rest as ordinary numeric progress.
   */
  readonly ranks?: readonly MasteryRankDefinition[];
}


/**
 * The rank definitions a character at `mastery` currently holds, in rank
 * order.
 *
 * Ranks are cumulative, so this is every authored rank up to and including
 * the one reached. Mastery 0 holds none.
 */
export function getHeldMasteryRanks(
  track: MasteryTrack,
  mastery: MasteryValue,
): readonly MasteryRankDefinition[] {
  return [...(track.ranks ?? [])]
    .filter((definition) => definition.rank <= mastery)
    .sort((left, right) => left.rank - right.rank);
}


/**
 * Every Effect a character holding `mastery` gains from the track itself.
 *
 * This is what makes "Swordsmanship II grants Vertical Slash" work without
 * swordsmanship.ts existing: the grant is an ordinary Effect on an ordinary
 * rank.
 */
export function collectMasteryRankEffects(
  track: MasteryTrack,
  mastery: MasteryValue,
): readonly Effect[] {
  return getHeldMasteryRanks(track, mastery).flatMap(
    (definition) => definition.effects ?? [],
  );
}


/**
 * The authored definition of one specific rank, if the track defines it.
 */
export function getMasteryRankDefinition(
  track: MasteryTrack,
  rank: MasteryRank,
): MasteryRankDefinition | undefined {
  return track.ranks?.find((definition) => definition.rank === rank);
}


/**
 * Whether a Mastery track is internally coherent.
 *
 * Domain-neutral on purpose: it takes the label and id to quote rather than
 * knowing whether it is looking at a Skill or a Technique, because the shape
 * being checked is the one this file defines. What a rank *means* on either
 * track is still skills.ts and techniques.ts's business.
 *
 * Strings rather than structured issues, because these join the
 * catalog-issue lists every domain already produces for development-time
 * checking.
 */
export function findMasteryTrackIssues(
  label: string,
  id: string,
  track: MasteryTrack,
): readonly string[] {
  const issues: string[] = [];

  if (!isMasteryRank(track.maximumMastery)) {
    issues.push(
      `${label} "${id}" declares a maximum Mastery of ${track.maximumMastery}, which is not a rank.`,
    );
  }

  const seen = new Set<number>();

  for (const rank of track.ranks ?? []) {
    if (!isMasteryRank(rank.rank)) {
      issues.push(
        `${label} "${id}" defines rank ${rank.rank}, which is not a Mastery rank.`,
      );
      continue;
    }

    if (rank.rank > track.maximumMastery) {
      issues.push(
        `${label} "${id}" defines rank ${rank.rank} beyond its maximum of ${track.maximumMastery}.`,
      );
    }

    if (seen.has(rank.rank)) {
      issues.push(
        `${label} "${id}" defines rank ${rank.rank} more than once.`,
      );
    }

    seen.add(rank.rank);

    if (
      rank.growthPointCost !== undefined &&
      (!Number.isInteger(rank.growthPointCost) || rank.growthPointCost < 0)
    ) {
      issues.push(
        `${label} "${id}" rank ${rank.rank} has a Growth Point cost of ${rank.growthPointCost}, which must be a non-negative whole number.`,
      );
    }

    // Rank rules are ordinary Effects and Requirements, so the shared rule
    // validator judges them rather than a second copy of it living here.
    for (const issue of [
      ...findEffectsValidationIssues(rank.effects ?? []),
      ...findRequirementsValidationIssues(rank.requirements ?? []),
    ]) {
      issues.push(
        `${label} "${id}" rank ${rank.rank} has a malformed rule: ${issue.type} at ${issue.path}.`,
      );
    }
  }

  return issues;
}
