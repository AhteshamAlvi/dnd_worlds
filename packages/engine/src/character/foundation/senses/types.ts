import type { ContributionSourceRef } from "../../../infrastructure/contribution-source";
import type { TraceNode } from "../../../infrastructure/trace";
import type { ResolvedScore } from "../attributes/types";
import type { SenseId } from "./scopes";

export const NATURAL_EXTRASENSORY_PERCEPTION_REQUIREMENTS = {
  per: 22,
  spi: 20,
} as const;

export type SenseAvailabilityReason =
  | "normally-available"
  | "natural-extrasensory-unlock"
  | "granted"
  | "suppressed"
  | "not-unlocked";

export interface ResolvedSense extends ResolvedScore {
  readonly id: SenseId;
  readonly available: boolean;
  readonly availabilityReason: SenseAvailabilityReason;
  readonly contributions: readonly SenseScoreContribution[];
  /** Detection with this effective sense substituted for ordinary PER. */
  readonly detection: ResolvedScore;
  /** Investigation with this effective sense substituted for ordinary PER. */
  readonly investigation: ResolvedScore;
  /** Sense modifier + WIS modifier, before route-specific passive modifiers. */
  readonly passiveDetectionBase: number;
}

export interface SenseScoreContribution {
  readonly source: ContributionSourceRef;
  readonly amount: number;
}

export interface ResolvedNenPerception {
  readonly available: boolean;
  readonly sources: readonly ContributionSourceRef[];
  readonly suppressedBy: readonly ContributionSourceRef[];
}

export interface ResolvedSensoryProfile {
  readonly senses: Readonly<Record<SenseId, ResolvedSense>>;
  readonly nenPerception: ResolvedNenPerception;
  /*
   * The character's permanent passive Concealment value: DEX standard
   * modifier + WIS standard modifier.
   *
   * This is the authoritative number. resolvePassiveConcealment() reads it
   * rather than recomputing it from raw stats, so there is one place the
   * formula lives and one place a future Effect would have to reach to change
   * it. Route-specific persistent modifiers are layered on afterward through
   * the universal check-modifier system, never folded in here.
   */
  readonly passiveConcealmentBase: number;
  readonly trace: TraceNode;
}
