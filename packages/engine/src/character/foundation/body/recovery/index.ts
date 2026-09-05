/*
 * Recovery — natural BP healing over elapsed time, and its Injury-treatment
 * integration.
 *
 * body-points/recovery.ts is the low-level whole-BP-vs-fractional-progress
 * primitive; this module is the orchestrator that drives it from elapsed
 * GameDuration and Vitality, reduces a BodyPart's active Injury caps to one
 * ceiling, and reports which Injuries have fully healed. See resolution.ts
 * for the full pipeline.
 */

export type {
  ActiveRecoveryCap,
  BodyPartRecoveryCeiling,
  BodyPartRecoveryOutcome,
  RecoveredInjuryRemoval,
  ResolveRecoveryInput,
  ResolveRecoveryOutcome,
} from "./types";

export {
  VIT_RECOVERY_REFERENCE,
  VIT_RECOVERY_DOUBLING_INTERVAL,
  REFERENCE_DAILY_RECOVERY_FRACTION,
  deriveDailyRecoveryFraction,
  resolveBodyPartRecoveryCeiling,
  resolveRecovery,
} from "./resolution";
