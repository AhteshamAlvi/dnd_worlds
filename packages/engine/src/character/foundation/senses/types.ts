import type { ContributionSourceRef } from "../../../infrastructure/contribution-source";
import type { TraceNode } from "../../../infrastructure/trace";
import type { CriticalPointId } from "../body/critical-points/types";
import type { ResolvedScore } from "../attributes/types";
import type { SensoryChannelId } from "./channels";
import type { SensoryReceiverRef } from "./receivers";
import type { SenseId } from "./scopes";


export type SenseAvailabilityReason =
  | "anatomical"
  | "granted"
  | "suppressed"
  | "no-functional-anatomy"
  | "not-granted";


/*
 * One receiver this creature actually has for one Sense.
 *
 * Derived from the points' focus membership: every local cluster becomes one
 * receiver, every distributed network becomes one receiver, and each grant
 * becomes one. It is a list rather than a single value because a creature with
 * eyes in its face AND an eye in its palm genuinely has two places sight
 * arrives, and route generation has to be able to offer both.
 */
export interface ResolvedSenseReceiver {
  readonly ref: SensoryReceiverRef;

  /** The canonical key, precomputed so comparisons do not re-derive it. */
  readonly key: string;

  /**
   * How much of this Sense's functional support arrives through here.
   *
   * Zero for a receiver whose every point is destroyed, suppressed or fully
   * impaired — which is how a route through a ruined organ is DROPPED rather
   * than resolved at a penalty. A grant receiver carries the grant's support.
   */
  readonly functionalSupport: number;
}


export interface SenseScoreContribution {
  readonly source: ContributionSourceRef;
  readonly amount: number;
}


/*
 * Where one point's share of a Sense came from, kept so a trace can answer
 * "why is my hearing 6".
 */
export interface SenseAnatomicalContribution {
  readonly pointId: CriticalPointId;

  /** The authored share, or the normalized network share, before impairment. */
  readonly share: number;

  /** 1 for an intact point, 0 for a destroyed one, between for an impaired one. */
  readonly functionalFraction: number;

  /** share * functionalFraction. What actually reached the support total. */
  readonly amount: number;

  /** Every multiplier that moved the functional fraction, and what applied it. */
  readonly impairedBy: readonly ContributionSourceRef[];
}


export interface ResolvedSense extends ResolvedScore {
  readonly id: SenseId;
  readonly available: boolean;
  readonly availabilityReason: SenseAvailabilityReason;

  /**
   * Total functional support, before the score basis is applied.
   *
   * 1.00 is a fully intact ordinary creature. Above 1 is legal and NOT clamped
   * — a Species authored with four 0.4 eyes sees better than a Human, and
   * flattening that would delete the only thing its author was saying.
   */
  readonly support: number;

  readonly anatomicalSupport: number;
  readonly grantedSupport: number;

  /** The channels THIS creature receives, after grants and suppressions. */
  readonly channels: readonly SensoryChannelId[];

  /** Signed steps applied to an arriving intensity, per channel. */
  readonly receptionModifiers: Readonly<Record<SensoryChannelId, number>>;

  readonly receivers: readonly ResolvedSenseReceiver[];

  /** Persistent score modifiers, with provenance. */
  readonly contributions: readonly SenseScoreContribution[];

  /** Per-point provenance for the support total. */
  readonly anatomy: readonly SenseAnatomicalContribution[];

  /** Detection with this effective sense substituted for ordinary PER. */
  readonly detection: ResolvedScore;

  /** Investigation with this effective sense substituted for ordinary PER. */
  readonly investigation: ResolvedScore;

  /** Sense modifier + WIS modifier, before route-specific passive modifiers. */
  readonly passiveDetectionBase: number;
}


export interface ResolvedNenPerception {
  readonly available: boolean;
  readonly sources: readonly ContributionSourceRef[];
  readonly suppressedBy: readonly ContributionSourceRef[];
}


export interface ResolvedSensoryProfile {
  /*
   * ONLY the Senses this creature resolved.
   *
   * Not a fixed record with an entry per registered Sense. A Human has no
   * entry for Echolocation, because they have no echolocating anatomy and no
   * grant — and an entry reading "available: false, score: 11" would be a
   * score for a capability they do not have, which anything reading the map
   * could mistake for a capability they merely cannot use right now.
   *
   * Reach for it through getResolvedSense(), never by bare indexing: an
   * unknown id must come back undefined rather than manufacturing a Sense.
   */
  readonly senses: Readonly<Record<SenseId, ResolvedSense>>;

  /**
   * Each resolvable Anatomical Point's functional fraction.
   *
   * Published because Sensory Gyō needs it: useful sensory Aura is
   * `sum(pointAura * pointFunctionalFraction)`, and the Gyō projection must
   * not re-derive impairment from point state and Effects on its own.
   */
  readonly pointFunction: Readonly<Record<CriticalPointId, number>>;

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


/**
 * One resolved Sense, or undefined.
 *
 * The only supported way to read `profile.senses`. A bare index on a
 * `Record<string, T>` is a lie the type system tells about an open key space,
 * and the lie matters here: an unknown Sense id has to be an answer of "this
 * creature does not have that", not a crash three frames later.
 */
export function getResolvedSense(
  profile: ResolvedSensoryProfile,
  id: SenseId,
): ResolvedSense | undefined {
  return profile.senses[id];
}


/** Whether this creature can use one Sense right now. */
export function hasAvailableSense(
  profile: ResolvedSensoryProfile,
  id: SenseId,
): boolean {
  return profile.senses[id]?.available === true;
}


/** Every Sense that is available, in a stable order. */
export function availableSenses(
  profile: ResolvedSensoryProfile,
): readonly ResolvedSense[] {
  return Object.keys(profile.senses)
    .sort()
    .map((id) => profile.senses[id]!)
    .filter((sense) => sense.available);
}
