/*
 * The sensory Effects, and what they resolve into.
 *
 * Six of them address Senses and channels, and one addresses a single
 * Anatomical Point. The split is the interesting part:
 *
 *   modifySense                   the Sense's SCORE
 *   grantSense / suppressSense    whether the Sense is available at all
 *   grantSenseChannel             a channel this creature receives and the
 *                                 definition does not
 *   suppressSenseChannel          a channel it no longer receives
 *   modifySenseChannelReception   how strongly one channel ARRIVES
 *   modifyAnatomicalPointFunction how well one organ is working
 *
 *
 * WHY NIGHT VISION IS A CHANNEL EFFECT AND NOT A SENSE
 *
 * Because it is not a different way of perceiving; it is the same eyes
 * receiving light better. Registering a "Night Vision" Sense would give its
 * owner a SECOND Detection route through the same organ — and the best-route
 * sweep would then compare a character's eyes against their own eyes and take
 * whichever rolled better, which is a free reroll wearing a Trait's name.
 *
 * `modifySenseChannelReception` instead raises the received intensity on
 * `visible-light`, so a dim room arrives as a brighter one and the ordinary
 * single Sight route is simply better. Same organ, same route, same one roll.
 *
 *
 * WHY POINT FUNCTION IS AN EFFECT RATHER THAN A FIELD
 *
 * A half-blinded eye is a thing that HAPPENED to a character, and everything
 * else in this engine that happened to a character arrives as an Effect from a
 * Condition, an Injury or an Ability. Putting a mutable `integrity` number on
 * the derived point instance instead would make damage edit anatomy, which is
 * the split body/state.ts exists to maintain — and a derived instance is
 * rebuilt on every resolution, so anything written onto it is lost anyway.
 *
 * Note that partial loss is NOT automatic at a Critical tier. Reaching the
 * major tier on an Eye is an injury OPPORTUNITY; the Injury that results is
 * what carries this Effect. Deriving it straight from the tier would apply it
 * twice the moment an Injury was also authored.
 */

import type { ContributionSourceRef } from "../../../infrastructure/contribution-source";
import type { CriticalPointId } from "../body/critical-points/types";
import type { SensoryChannelId } from "./channels";
import type { SenseId, SenseSelector } from "./scopes";


export interface ModifySenseEffect {
  readonly type: "modifySense";
  readonly sense: SenseSelector;
  readonly amount: number;
}

export interface GrantSenseEffect {
  readonly type: "grantSense";
  readonly sense: SenseId;

  /**
   * Restricts the grant to a subset of the Sense's registered channels.
   *
   * Omitted means the complete set, which is what an ordinary grant wants. A
   * premonition that warns of danger and nothing else is a restricted ESP
   * grant listing `danger` alone — and it must then be genuinely unable to
   * feel hostile intent, which is why route generation reads this rather than
   * the definition.
   */
  readonly enabledChannels?: readonly SensoryChannelId[];

  /**
   * How much functional support the grant supplies, defaulting to 1.
   *
   * A grant does not ADD to anatomy, it FLOORS it — see profile.ts. A full
   * grant on a character with two healthy eyes changes nothing; the same grant
   * on a blinded one restores full Sight.
   */
  readonly amount?: number;
}

export interface SuppressSenseEffect {
  readonly type: "suppressSense";
  readonly sense: SenseSelector;
}

export interface GrantSenseChannelEffect {
  readonly type: "grantSenseChannel";
  readonly sense: SenseId;
  readonly channel: SensoryChannelId;
}

export interface SuppressSenseChannelEffect {
  readonly type: "suppressSenseChannel";
  readonly sense: SenseSelector;
  readonly channel: SensoryChannelId;
}

export interface ModifySenseChannelReceptionEffect {
  readonly type: "modifySenseChannelReception";
  readonly sense: SenseSelector;
  readonly channel: SensoryChannelId;

  /** Signed steps on the 1-10 intensity scale, applied as the cue arrives. */
  readonly amount: number;
}

export interface ModifyAnatomicalPointFunctionEffect {
  readonly type: "modifyAnatomicalPointFunction";
  readonly pointId: CriticalPointId;

  /** Multiplies the point's functional fraction. Finite and non-negative. */
  readonly multiplier: number;
}

export interface GrantNenPerceptionEffect {
  readonly type: "grantNenPerception";
}

export interface SuppressNenPerceptionEffect {
  readonly type: "suppressNenPerception";
}

export type SensoryEffect =
  | ModifySenseEffect
  | GrantSenseEffect
  | SuppressSenseEffect
  | GrantSenseChannelEffect
  | SuppressSenseChannelEffect
  | ModifySenseChannelReceptionEffect
  | ModifyAnatomicalPointFunctionEffect
  | GrantNenPerceptionEffect
  | SuppressNenPerceptionEffect;


export interface SourcedSenseModifier {
  readonly source: ContributionSourceRef;
  readonly sense: SenseSelector;
  readonly amount: number;
}

export interface SourcedSenseGrant {
  readonly source: ContributionSourceRef;
  readonly sense: SenseId;
  readonly enabledChannels?: readonly SensoryChannelId[];
  readonly amount?: number;
}

export interface SourcedSenseSuppression {
  readonly source: ContributionSourceRef;
  readonly sense: SenseSelector;
}

export interface SourcedSenseChannelGrant {
  readonly source: ContributionSourceRef;
  readonly sense: SenseId;
  readonly channel: SensoryChannelId;
}

export interface SourcedSenseChannelSuppression {
  readonly source: ContributionSourceRef;
  readonly sense: SenseSelector;
  readonly channel: SensoryChannelId;
}

export interface SourcedSenseChannelReceptionModifier {
  readonly source: ContributionSourceRef;
  readonly sense: SenseSelector;
  readonly channel: SensoryChannelId;
  readonly amount: number;
}

export interface SourcedAnatomicalPointFunctionModifier {
  readonly source: ContributionSourceRef;
  readonly pointId: CriticalPointId;
  readonly multiplier: number;
}

export interface ResolvedSensoryEffects {
  readonly senseModifiers: readonly SourcedSenseModifier[];
  readonly senseGrants: readonly SourcedSenseGrant[];
  readonly senseSuppressions: readonly SourcedSenseSuppression[];
  readonly senseChannelGrants: readonly SourcedSenseChannelGrant[];
  readonly senseChannelSuppressions: readonly SourcedSenseChannelSuppression[];
  readonly senseChannelReception:
    readonly SourcedSenseChannelReceptionModifier[];
  readonly pointFunctionModifiers:
    readonly SourcedAnatomicalPointFunctionModifier[];
  readonly nenPerceptionGrants: readonly ContributionSourceRef[];
  readonly nenPerceptionSuppressions: readonly ContributionSourceRef[];
}

export const EMPTY_SENSORY_EFFECTS: ResolvedSensoryEffects = {
  senseModifiers: [],
  senseGrants: [],
  senseSuppressions: [],
  senseChannelGrants: [],
  senseChannelSuppressions: [],
  senseChannelReception: [],
  pointFunctionModifiers: [],
  nenPerceptionGrants: [],
  nenPerceptionSuppressions: [],
};
