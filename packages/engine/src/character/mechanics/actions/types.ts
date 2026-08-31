/*
 * Character Action-capacity types.
 *
 * Action capacity is a character mechanic built from Combat Ability and
 * applicable character Effects.
 *
 * It describes how many normal Actions the character is capable of using
 * across Combat states:
 *
 * - `round`:
 *   Total normal Actions available across one Combat Round.
 *
 * - `turn`:
 *   Maximum normal Actions that may be spent during one Turn state.
 *
 * - `reaction`:
 *   Maximum normal Actions that may be spent during one Reaction state.
 *
 * These values belong to the Character because they describe the
 * character's inherent/resolved combat capability and are meaningful even
 * when no Combat encounter is currently active.
 *
 * Combat consumes these capacities but owns their runtime expenditure:
 *
 *   Character:
 *     Actions / Round    = 6
 *     Actions / Turn     = 2
 *     Actions / Reaction = 1
 *
 *   Combat:
 *     remainingActions   = 4
 *     actionsSpentTurn   = 1
 *
 * This module does NOT track remaining Actions, Turns, Reactions,
 * Initiative, or any other encounter-local state.
 */

import type {
  RuleSourceRef,
} from "../../rules/resolution";


/* -------------------------------------------------------------------------- */
/* Capacity kinds                                                             */
/* -------------------------------------------------------------------------- */

export const ACTION_CAPACITY_KINDS = [
  "round",
  "turn",
  "reaction",
] as const;

export type ActionCapacityKind =
  typeof ACTION_CAPACITY_KINDS[number];


/* -------------------------------------------------------------------------- */
/* Resolved capacity                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The character's final resolved normal-Action capacities.
 *
 * These are character capabilities, not mutable Combat counters.
 *
 * Combat may snapshot these values when a Round begins, then independently
 * track how many of the character's Round Actions remain.
 */
export interface ActionCapacity {
  /**
   * Total normal Actions available across one complete Combat Round.
   */
  readonly round: number;

  /**
   * Maximum normal Actions that may be spent during one Turn state.
   */
  readonly turn: number;

  /**
   * Maximum normal Actions that may be spent during one Reaction state.
   */
  readonly reaction: number;
}


/* -------------------------------------------------------------------------- */
/* Contributions                                                              */
/* -------------------------------------------------------------------------- */

/**
 * One sourced additive contribution to an Action-capacity value.
 *
 * The originating Trait, Skill, Technique, Item, Condition, or other
 * Effectful source is retained so the final capacity can explain itself.
 *
 * These contributions do not include the mechanic's own base derivations.
 */
export interface ActionCapacityContribution {
  readonly kind: ActionCapacityKind;

  readonly amount: number;

  readonly source: RuleSourceRef;
}


/* -------------------------------------------------------------------------- */
/* Resolution explanation                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Full explainable result of Action-capacity resolution.
 *
 * Resolution proceeds conceptually as:
 *
 * ROUND
 *
 *   Combat Ability
 *       ↓
 *   baseRound
 *       ↓
 *   + round contributions
 *       ↓
 *   capacity.round
 *
 *
 * TURN
 *
 *   baseTurn
 *       ↓
 *   + turn contributions
 *       ↓
 *   capacity.turn
 *
 *
 * REACTION
 *
 *   resolved Turn capacity
 *       ↓
 *   baseReaction
 *       ↓
 *   + reaction contributions
 *       ↓
 *   capacity.reaction
 *
 * `baseReaction` is therefore derived from the already-resolved Turn
 * capacity, not from `baseTurn`.
 *
 * This is important because a modifier to Turn capacity naturally
 * propagates into Reaction capacity before any Reaction-specific
 * contributions are applied.
 */
export interface ResolvedActionCapacity {
  /**
   * Resolved Combat Ability used to derive the character's base Round
   * Action capacity.
   *
   * Combat Ability itself remains owned by the Derived Attribute system.
   */
  readonly combatAbility: number;

  /**
   * Round Actions supplied by Combat Ability before Action-capacity
   * contributions are applied.
   */
  readonly baseRound: number;

  /**
   * Standard Turn Action cap before Turn-specific contributions.
   */
  readonly baseTurn: number;

  /**
   * Reaction Action cap derived from the resolved Turn capacity, before
   * Reaction-specific contributions.
   */
  readonly baseReaction: number;

  /**
   * Every sourced Action-capacity contribution that participated in this
   * resolution.
   */
  readonly contributions: readonly ActionCapacityContribution[];

  /**
   * Final resolved capacities exposed on the character and consumed by
   * Combat.
   */
  readonly capacity: ActionCapacity;
}