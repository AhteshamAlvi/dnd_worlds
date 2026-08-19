/*
 * Advancement over time.
 *
 * Lifetime XP produces Levels; Levels produce Stat Points and Growth Points;
 * those buy permanent progress. Progression only ever writes *stored* values
 * — authored attributes, trained Mastery — which is why it sits outside
 * foundation rather than inside it, and why a Trait's +1 STR and a Limited
 * Stat Point's +1 STR are different things: the first modifies the derived
 * Base score and disappears with the Trait, the second is the character's
 * own number changing for good.
 *
 * Growth Points remain generic currency on purpose. A Skill or Technique
 * decides its own cost and prerequisites; growth.ts only performs the
 * deduction once the capability has said yes. That is what keeps
 * "Swordsmanship costs 4 GP at rank III" a fact about Swordsmanship rather
 * than a branch inside progression.
 *
 * Source: Rulebook "05 Progression/Progression and Training.md",
 * "03 Aura Engine/Nen Growth.md".
 */

export type { CharacterLevel, ExperienceProgress } from "./levels";

export {
  MIN_CHARACTER_LEVEL,
  MAX_CHARACTER_LEVEL,
  POST_CAP_MILESTONE_LEVEL_INTERVAL,
  LEVEL_CAP_LIFETIME_XP,
  isCharacterLevel,
  validateCharacterLevel,
  validateLifetimeXp,
  deriveRawXpToNextLevel,
  deriveXpToNextLevel,
  deriveLifetimeXpThreshold,
  addExperience,
  deriveCharacterLevelFromLifetimeXp,
  canGainCharacterLevel,
  deriveNextCharacterLevel,
  derivePostCapMilestoneThreshold,
  derivePostCapMilestonesReached,
  deriveExperienceProgress,
} from "./levels";

export type {
  LimitedStatPointGrant,
  LimitedStatPointGrantResult,
  StatPointExpenditure,
} from "./stats";

export {
  STARTING_STAT_POINTS,
  STAT_POINTS_PER_LEVEL_GAINED,
  POST_CAP_STAT_POINTS_PER_MILESTONE,
  STARTING_STAT_ARRAY,
  deriveNaturalStatPointsForLevel,
  deriveNaturalStatPointsForLifetimeXp,
  grantStatPoints,
  spendStatPoints,
  applyLimitedStatPointGrant,
} from "./stats";

export type { GrowthPointExpenditure } from "./growth";

export {
  GROWTH_POINTS_PER_LEVEL,
  POST_CAP_GROWTH_POINTS_PER_MILESTONE,
  deriveNaturalGrowthPointsForLevel,
  deriveNaturalGrowthPointsForLifetimeXp,
  grantGrowthPoints,
  spendGrowthPoints,
} from "./growth";
