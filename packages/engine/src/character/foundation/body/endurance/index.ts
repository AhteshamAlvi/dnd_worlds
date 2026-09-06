/*
 * The endurance subsystem's public surface.
 *
 * Stamina is efficiency, wakefulness is strain, Fatigue is the condition the
 * two produce. None of them is a reserve — the character has exactly one of
 * those, and it is Aura.
 *
 * Everything here takes cross-domain figures as plain numbers. The Aura domain
 * depends on this folder; this folder depends on nothing but Time.
 */

export type {
  CharacterWakefulnessState,
  FatigueComponents,
  FatigueState,
  PhysicalExertionLevel,
  PhysicalExertionLoad,
  ResolvedFatigue,
  ResolvedWakefulness,
  SustainedActivityLevel,
  WakefulnessMode,
  WakefulnessTransition,
} from "./types";

export {
  FATIGUE_STATES,
  PHYSICAL_EXERTION_LEVELS,
  SUSTAINED_ACTIVITY_LEVELS,
  WAKEFULNESS_MODES,
  restedWakefulness,
} from "./types";

export type {
  ActivityCombination,
  ActivityExertionOverride,
} from "./exertion";

export {
  PHYSICAL_EXERTION_LOADS,
  REFERENCE_STAMINA,
  SUSTAINED_ACTIVITY_LOADS_PER_HOUR,
  deriveStaminaExpenditureMultiplier,
  findActivityCombinationIssues,
  physicalExertionLoad,
  sustainedActivityLoadPerHour,
} from "./exertion";

export {
  WAKING_HOURS_CLEARED_PER_HOUR_SLEPT,
  advanceWakefulness,
  deriveMaximumWakefulDays,
  deriveMaximumWakefulHours,
  findWakefulnessStateIssues,
  resolveWakefulness,
} from "./wakefulness";

export type { DeriveFatigueInput } from "./fatigue";

export {
  AURA_DEPLETION_FATIGUE_BANDS,
  MAXIMUM_FATIGUE,
  WAKEFULNESS_FATIGUE_EXPONENT,
  deriveAuraDepletionFatigue,
  deriveFatigue,
  deriveWakefulnessFatigue,
  fatigueStateFor,
} from "./fatigue";
