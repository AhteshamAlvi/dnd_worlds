/*
 * Character Action-capacity resolution.
 *
 * This mechanic converts Combat Ability and sourced Action-capacity
 * contributions into the character's final:
 *
 * - Actions per Round
 * - Actions per Turn
 * - Actions per Reaction
 *
 * These are character capabilities, not mutable Combat resources.
 *
 * Combat may snapshot the resolved capacities when a Round begins and then
 * independently track remaining Actions and state-local expenditure.
 *
 *
 * RESOLUTION ORDER
 * ----------------
 *
 * ROUND
 *
 *   Combat Ability
 *       ↓
 *   base Round Actions
 *       ↓
 *   + Round contributions
 *       ↓
 *   resolved Round capacity
 *
 *
 * TURN
 *
 *   base Turn capacity
 *       ↓
 *   + Turn contributions
 *       ↓
 *   resolved Turn capacity
 *
 *
 * REACTION
 *
 *   resolved Turn capacity
 *       ↓
 *   floor(turn / 2), minimum 1
 *       ↓
 *   base Reaction capacity
 *       ↓
 *   + Reaction contributions
 *       ↓
 *   resolved Reaction capacity
 *
 *
 * The Reaction calculation deliberately uses the RESOLVED Turn capacity.
 *
 * Therefore a feature that changes:
 *
 *   Turn: 2 -> 4
 *
 * automatically changes the ordinary Reaction base:
 *
 *   Reaction: 1 -> 2
 *
 * before any Reaction-specific contributions are applied.
 *
 *
 * COMBAT ABILITY -> ROUND ACTIONS
 * --------------------------------
 *
 * Combat Ability 1-4:
 *   0 Actions / Round
 *
 * Combat Ability 5-7:
 *   1 Action / Round
 *
 * Combat Ability 8-12:
 *   2 Actions / Round
 *
 * Combat Ability 13+:
 *
 *   2 + floor((Combat Ability - 10) * 0.4)
 *
 * clamped to the stat-derived range of 2-10.
 *
 * This produces:
 *
 *   1-4   -> 0
 *   5-7   -> 1
 *   8-12  -> 2
 *   13-14 -> 3
 *   15-17 -> 4
 *   18-19 -> 5
 *   20-22 -> 6
 *   23-24 -> 7
 *   25-27 -> 8
 *   28-29 -> 9
 *   30+   -> 10
 *
 * Ten is the maximum obtainable from Combat Ability alone. Explicit
 * character Effects may raise the final Round capacity beyond 10.
 *
 * This file assumes its inputs have already passed actions/validation.ts.
 */

import type {
  ActionCapacity,
  ActionCapacityContribution,
  ActionCapacityKind,
  ResolvedActionCapacity,
} from "./types";


/* -------------------------------------------------------------------------- */
/* Round capacity constants                                                   */
/* -------------------------------------------------------------------------- */

/*
 * Combat Ability below 5 produces no normal Actions from stats alone.
 */
export const ZERO_ROUND_ACTION_THRESHOLD = 5;

/*
 * Combat Ability 5-7 produces exactly one normal Action.
 *
 * At Combat Ability 8, the ordinary two-Action range begins.
 */
export const ONE_ROUND_ACTION_THRESHOLD = 8;

/*
 * Reference point for the ordinary Round Action progression.
 *
 * Combat Ability 10 represents the ordinary human baseline and produces
 * two Actions per Round.
 */
export const ROUND_ACTION_REFERENCE_COMBAT_ABILITY = 10;
export const ROUND_ACTION_REFERENCE_CAPACITY = 2;

/*
 * Eight additional Actions are distributed from Combat Ability 10 through
 * Combat Ability 30:
 *
 *   8 additional Actions / 20 Combat Ability
 *   = 0.4 Actions of progression per Combat Ability point
 *
 * floor() converts that continuous progression into whole Action tiers.
 */
export const ROUND_ACTION_GROWTH_RATE = 0.4;

/*
 * Combat Ability alone can never supply more than ten Actions per Round.
 *
 * This is NOT an absolute final-capacity ceiling. Explicit character
 * mechanics may add further Actions afterward.
 */
export const MAX_STAT_DERIVED_ROUND_ACTIONS = 10;


/* -------------------------------------------------------------------------- */
/* Turn / Reaction constants                                                  */
/* -------------------------------------------------------------------------- */

/*
 * A normal character may spend at most two Actions during one Turn state.
 *
 * This is independent of total Round Action capacity.
 *
 * A character with only one Round Action remaining can naturally spend only
 * one despite having a Turn capacity of two. Combat owns that runtime
 * restriction.
 */
export const BASE_TURN_ACTION_CAPACITY = 2;

/*
 * Ordinary Action-capacity resolution never reduces the Turn cap below two.
 *
 * A future mechanic that needs to completely deny or fundamentally replace
 * a Turn should model that explicitly rather than producing nonsensical
 * negative Action capacities.
 */
export const MIN_TURN_ACTION_CAPACITY = 2;

/*
 * A Reaction normally permits half as many Actions as a Turn, rounded down,
 * with a minimum capacity of one.
 */
export const MIN_REACTION_ACTION_CAPACITY = 1;


/* -------------------------------------------------------------------------- */
/* Generic helpers                                                            */
/* -------------------------------------------------------------------------- */

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(
    maximum,
    Math.max(minimum, value),
  );
}


/*
 * Returns every contribution targeting one Action-capacity kind.
 *
 * Order is preserved so explanation surfaces retain the same provenance
 * order supplied by character/rules resolution.
 */
export function filterActionCapacityContributions(
  contributions: readonly ActionCapacityContribution[],
  kind: ActionCapacityKind,
): readonly ActionCapacityContribution[] {
  return contributions.filter(
    (contribution) =>
      contribution.kind === kind,
  );
}


/*
 * Sums additive contributions targeting one Action-capacity kind.
 */
export function sumActionCapacityContributions(
  contributions: readonly ActionCapacityContribution[],
  kind: ActionCapacityKind,
): number {
  return filterActionCapacityContributions(
    contributions,
    kind,
  ).reduce(
    (total, contribution) =>
      total + contribution.amount,
    0,
  );
}


/* -------------------------------------------------------------------------- */
/* Combat Ability -> base Round Actions                                       */
/* -------------------------------------------------------------------------- */

/**
 * Derives the number of Round Actions supplied by Combat Ability alone.
 *
 * This function does not apply Traits, Skills, Techniques, Equipment,
 * Conditions, or any other sourced contributions.
 *
 * Combat Ability below 5:
 *   0
 *
 * Combat Ability 5-7:
 *   1
 *
 * Combat Ability 8+:
 *   ordinary progression, capped at 10 from stats alone.
 */
export function deriveBaseRoundActionCapacity(
  combatAbility: number,
): number {
  if (
    combatAbility <
    ZERO_ROUND_ACTION_THRESHOLD
  ) {
    return 0;
  }

  if (
    combatAbility <
    ONE_ROUND_ACTION_THRESHOLD
  ) {
    return 1;
  }

  const progressedCapacity =
    ROUND_ACTION_REFERENCE_CAPACITY +
    Math.floor(
      (
        combatAbility -
        ROUND_ACTION_REFERENCE_COMBAT_ABILITY
      ) *
        ROUND_ACTION_GROWTH_RATE,
    );

  return clamp(
    progressedCapacity,
    ROUND_ACTION_REFERENCE_CAPACITY,
    MAX_STAT_DERIVED_ROUND_ACTIONS,
  );
}


/* -------------------------------------------------------------------------- */
/* Round capacity resolution                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Resolves final Actions per Round.
 *
 * The stat-derived 10-Action maximum applies only to `baseRound`.
 * Contributions are added afterward and may raise the final capacity beyond
 * ten.
 *
 * Final capacity is floored at zero because a character cannot possess a
 * negative number of Actions.
 */
export function resolveRoundActionCapacity(
  combatAbility: number,
  contributions: readonly ActionCapacityContribution[],
): number {
  const baseRound =
    deriveBaseRoundActionCapacity(
      combatAbility,
    );

  const contributionTotal =
    sumActionCapacityContributions(
      contributions,
      "round",
    );

  return Math.max(
    0,
    baseRound + contributionTotal,
  );
}


/* -------------------------------------------------------------------------- */
/* Turn capacity resolution                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Returns the ordinary per-Turn Action cap.
 *
 * Combat Ability does not alter this value.
 */
export function deriveBaseTurnActionCapacity(): number {
  return BASE_TURN_ACTION_CAPACITY;
}


/**
 * Resolves final Actions per Turn.
 *
 * Turn capacity is independent from Round capacity.
 *
 * Example:
 *
 *   Round capacity = 10
 *   Turn capacity  = 2
 *
 * The character still cannot normally spend more than two Actions in one
 * Turn despite possessing ten across the entire Round.
 */
export function resolveTurnActionCapacity(
  contributions: readonly ActionCapacityContribution[],
): number {
  const contributionTotal =
    sumActionCapacityContributions(
      contributions,
      "turn",
    );

  return Math.max(
    MIN_TURN_ACTION_CAPACITY,
    BASE_TURN_ACTION_CAPACITY +
      contributionTotal,
  );
}


/* -------------------------------------------------------------------------- */
/* Reaction capacity resolution                                               */
/* -------------------------------------------------------------------------- */

/**
 * Derives ordinary Reaction capacity from RESOLVED Turn capacity.
 *
 * Reaction capacity is always half the Turn cap, rounded down, with an
 * ordinary minimum of one:
 *
 *   Turn 2 -> Reaction 1
 *   Turn 3 -> Reaction 1
 *   Turn 4 -> Reaction 2
 *   Turn 5 -> Reaction 2
 *   Turn 6 -> Reaction 3
 */
export function deriveBaseReactionActionCapacity(
  resolvedTurnCapacity: number,
): number {
  return Math.max(
    MIN_REACTION_ACTION_CAPACITY,
    Math.floor(
      resolvedTurnCapacity / 2,
    ),
  );
}


/**
 * Resolves final Actions per Reaction.
 *
 * Turn-capacity changes have already propagated into `baseReaction` before
 * Reaction-specific contributions are applied.
 *
 * Example:
 *
 *   Base Turn                  2
 *   Turn contribution         +2
 *   Resolved Turn              4
 *
 *   Derived Reaction base      2
 *   Reaction contribution     +1
 *   Final Reaction             3
 */
export function resolveReactionActionCapacity(
  resolvedTurnCapacity: number,
  contributions: readonly ActionCapacityContribution[],
): number {
  const baseReaction =
    deriveBaseReactionActionCapacity(
      resolvedTurnCapacity,
    );

  const contributionTotal =
    sumActionCapacityContributions(
      contributions,
      "reaction",
    );

  return Math.max(
    MIN_REACTION_ACTION_CAPACITY,
    baseReaction + contributionTotal,
  );
}


/* -------------------------------------------------------------------------- */
/* Full Action-capacity resolution                                            */
/* -------------------------------------------------------------------------- */

/**
 * Resolves the character's complete Action-capacity profile.
 *
 * This is the primary entry point for the Character Action mechanic.
 *
 * It returns both the final capacities and the intermediate base values
 * necessary for character sheets, traces, debugging, and explanation
 * surfaces to show where those values came from.
 */
export function resolveActionCapacity(
  combatAbility: number,
  contributions: readonly ActionCapacityContribution[] = [],
): ResolvedActionCapacity {
  const baseRound =
    deriveBaseRoundActionCapacity(
      combatAbility,
    );

  const roundContributionTotal =
    sumActionCapacityContributions(
      contributions,
      "round",
    );

  const resolvedRound =
    Math.max(
      0,
      baseRound +
        roundContributionTotal,
    );


  const baseTurn =
    deriveBaseTurnActionCapacity();

  const turnContributionTotal =
    sumActionCapacityContributions(
      contributions,
      "turn",
    );

  const resolvedTurn =
    Math.max(
      MIN_TURN_ACTION_CAPACITY,
      baseTurn +
        turnContributionTotal,
    );


  /*
   * Deliberately derived AFTER Turn contributions.
   */
  const baseReaction =
    deriveBaseReactionActionCapacity(
      resolvedTurn,
    );

  const reactionContributionTotal =
    sumActionCapacityContributions(
      contributions,
      "reaction",
    );

  const resolvedReaction =
    Math.max(
      MIN_REACTION_ACTION_CAPACITY,
      baseReaction +
        reactionContributionTotal,
    );


  const capacity: ActionCapacity = {
    round: resolvedRound,
    turn: resolvedTurn,
    reaction: resolvedReaction,
  };


  return {
    combatAbility,

    baseRound,
    baseTurn,
    baseReaction,

    contributions,

    capacity,
  };
}