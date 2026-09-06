/*
 * A Round's movement allowance, and how Moves draw on it.
 *
 * Move is a non-skill Action that allows controlled combat locomotion while
 * retaining ordinary perception, directional control, defensive availability,
 * and the ability to transition into another Action. It is not a sprint and it
 * is not a charge; those are separate mechanics that will layer on top.
 *
 *
 * THE DIVISION
 *
 *   MoveShare    = 1 / RoundActionCapacity
 *   MoveDistance = CurrentRoundMovement x MoveShare
 *
 * A Round holds one movement allowance, and each Move spends an equal share of
 * it. That is the whole mechanic, and its consequence is the point: a
 * character's Round Actions decide how FINELY they can divide their movement,
 * never how much of it there is.
 *
 *   Round Actions   One Move   Full Round
 *               1      6 m         6 m
 *               2      3 m         6 m
 *               3      2 m         6 m
 *               4    1.5 m         6 m
 *               6      1 m         6 m
 *              10    0.6 m         6 m
 *
 * Actions per TURN affect sequencing only — how the Round's Actions are
 * distributed across the Turns a creature takes in it. They do not appear in
 * either formula above. The old model divided by Actions per Turn instead,
 * which made a creature with more Turn Actions cover MORE total ground in a
 * Round, so granting a third Action per Turn was a 50% speed bonus nobody had
 * priced.
 *
 *
 * WHY THE DIVISOR IS SNAPSHOTTED
 *
 * Round Action Capacity is read once, at Round start, after start-of-Round
 * modifiers have applied. It is then fixed for the Round even if the capacity
 * changes mid-Round.
 *
 * The alternative recomputes the share as the capacity moves, and it does not
 * conserve: a character with two Actions who Moves once has spent half their
 * Round. If losing an Action then re-divided the allowance, that same half
 * would retroactively become the whole thing, and a character could be robbed
 * of — or handed — distance by an effect that never mentioned movement.
 *
 * Losing Actions still costs, and costs the right way: the shares are still
 * there, and the character simply has no Action left to spend on one. Gaining
 * Actions is the symmetric case — an extra Action is an extra opportunity to
 * act, not an extra share, and cannot take a character past the Round cap.
 *
 *
 * PRECISION
 *
 * Consumption is tracked as a COUNT of Moves rather than as an accumulating
 * distance, and the distance is derived from it. Adding a share at a time
 * drifts — seven sevenths of 6 metres is not 6 — and the drift shows up as a
 * character who cannot quite reach a square they have exactly enough movement
 * for. Counting makes the last Move of a Round land on the cap exactly.
 *
 *
 * WHAT THIS FILE DOES NOT DECIDE
 *
 * It owns no Speed formula, no terrain, no encumbrance, no Sprint and no
 * locomotor conditions. Every one of those is a modifier to
 * `currentRoundMovementMeters` BEFORE a Round begins, or a grant on top of the
 * allowance during it. That is the extension point: new movement content
 * changes the allowance handed in here, never the arithmetic below.
 */

import type { ResolvedMovement } from "./speed";


/*
 * A Round's allowance, and the division that was locked in when it opened.
 */
export interface RoundMovementAllowance {
  /** The allowance for this Round, after every applicable modifier. */
  readonly roundMovementMeters: number;

  /** Round Action Capacity as snapshotted at Round start. */
  readonly roundActionCapacity: number;

  /** 1 / capacity. Zero when the character has no Round Actions. */
  readonly moveShare: number;

  /** What one Move covers. Zero when no Move is available at all. */
  readonly moveDistanceMeters: number;
}


export interface RoundMovementState {
  readonly allowance: RoundMovementAllowance;

  /** Normal Moves spent so far. Never exceeds the snapshotted capacity. */
  readonly movesSpent: number;

  /*
   * Granted movement that was declared to draw on the Round allowance, and
   * granted movement that was declared not to.
   *
   * Forced and explicitly granted movement has to say which it is; a grant
   * that neither counts against the cap nor is recorded outside it is how a
   * character ends up with more movement than anything accounted for.
   */
  readonly grantedChargedMeters: number;
  readonly grantedUnchargedMeters: number;

  /** Allowance actually drawn down. Never exceeds the allowance. */
  readonly consumedMeters: number;

  /** Allowance still available to normal Moves. */
  readonly remainingMeters: number;
}


/**
 * The share one Move draws, from a snapshotted Round Action Capacity.
 *
 * Zero Round Actions cannot produce a normal Move, so the share is zero rather
 * than infinite. A fractional or non-finite capacity is treated the same way:
 * there is no meaningful division to perform and no reason to invent one.
 */
export function resolveMoveShare(roundActionCapacity: number): number {
  if (!Number.isFinite(roundActionCapacity) || roundActionCapacity <= 0) {
    return 0;
  }

  return 1 / roundActionCapacity;
}


/**
 * Open a Round.
 *
 * `roundMovementMeters` is the CURRENT allowance — Speed's baseline after
 * locomotor condition and whatever else applies. `roundActionCapacity` is
 * snapshotted here and does not change for the rest of the Round.
 */
export function beginRoundMovement(
  roundMovementMeters: number,
  roundActionCapacity: number,
): RoundMovementState {
  const meters =
    Number.isFinite(roundMovementMeters) && roundMovementMeters > 0
      ? roundMovementMeters
      : 0;

  const capacity =
    Number.isFinite(roundActionCapacity) && roundActionCapacity > 0
      ? Math.floor(roundActionCapacity)
      : 0;

  const moveShare = resolveMoveShare(capacity);

  return {
    allowance: {
      roundMovementMeters: meters,
      roundActionCapacity: capacity,
      moveShare,
      moveDistanceMeters: meters * moveShare,
    },

    movesSpent: 0,
    grantedChargedMeters: 0,
    grantedUnchargedMeters: 0,

    consumedMeters: 0,
    remainingMeters: meters,
  };
}


/**
 * Open a Round from a resolved character.
 *
 * The convenience form, and the one that makes the boundary visible: movement
 * consumes `currentRoundMovementMeters` and a capacity number, and reaches for
 * nothing else.
 */
export function beginRoundMovementFor(
  movement: ResolvedMovement,
  roundActionCapacity: number,
): RoundMovementState {
  return beginRoundMovement(
    movement.currentRoundMovementMeters,
    roundActionCapacity,
  );
}


/*
 * Consumption, recomputed from the counts rather than accumulated.
 *
 * `movesSpent / capacity` is exact at the boundaries — capacity/capacity is 1
 * for any integer capacity — so spending every Move lands on the allowance
 * exactly rather than a float's width away from it.
 */
function withConsumption(
  allowance: RoundMovementAllowance,
  movesSpent: number,
  grantedChargedMeters: number,
  grantedUnchargedMeters: number,
): RoundMovementState {
  const fromMoves =
    allowance.roundActionCapacity > 0
      ? allowance.roundMovementMeters *
        (movesSpent / allowance.roundActionCapacity)
      : 0;

  const consumedMeters = Math.min(
    allowance.roundMovementMeters,
    fromMoves + grantedChargedMeters,
  );

  return {
    allowance,
    movesSpent,
    grantedChargedMeters,
    grantedUnchargedMeters,
    consumedMeters,
    remainingMeters: allowance.roundMovementMeters - consumedMeters,
  };
}


/** How many normal Moves the Round still has shares for. */
export function movesRemaining(state: RoundMovementState): number {
  return Math.max(0, state.allowance.roundActionCapacity - state.movesSpent);
}


export interface MoveOutcome {
  readonly state: RoundMovementState;

  /** What this Move actually covered. Zero when none was available. */
  readonly distanceMeters: number;

  /*
   * Why nothing happened, when nothing did.
   *
   * "no-round-actions" is a character who never had a Move this Round;
   * "allowance-spent" is one who has used every share they had. They are
   * different situations and a GM reading a log deserves to be told which.
   */
  readonly refusal: "no-round-actions" | "allowance-spent" | null;
}


/**
 * Spend one Action on a Move.
 *
 * Extra Actions cannot take a character past the Round cap: once every share
 * is spent, further Moves cover nothing and say so. That is the same rule as
 * "a Round holds one allowance", stated where it can be enforced.
 *
 * Reaction Moves come through here too. A Reaction Move is a Move — it draws
 * on the same Round allowance as any other, which is what stops a character
 * from doubling their ground by moving on someone else's Turn.
 */
export function spendMove(state: RoundMovementState): MoveOutcome {
  if (state.allowance.roundActionCapacity <= 0) {
    return { state, distanceMeters: 0, refusal: "no-round-actions" };
  }

  if (movesRemaining(state) <= 0) {
    return { state, distanceMeters: 0, refusal: "allowance-spent" };
  }

  const next = withConsumption(
    state.allowance,
    state.movesSpent + 1,
    state.grantedChargedMeters,
    state.grantedUnchargedMeters,
  );

  return {
    state: next,
    distanceMeters: next.consumedMeters - state.consumedMeters,
    refusal: null,
  };
}


/**
 * Movement the character did not spend an Action on.
 *
 * A shove, a pull, a Technique that repositions someone, a Trait that hands
 * out a free step. Every such grant must declare `chargedAgainstCap`, because
 * the two answers are both legitimate and neither is safe to assume: a free
 * step that quietly ignored the cap would be a movement bonus, and a forced
 * shove that quietly consumed the cap would punish the victim for being
 * shoved.
 */
export function grantMovement(
  state: RoundMovementState,
  meters: number,
  options: { readonly chargedAgainstCap: boolean },
): RoundMovementState {
  if (!Number.isFinite(meters) || meters <= 0) return state;

  return options.chargedAgainstCap
    ? withConsumption(
      state.allowance,
      state.movesSpent,
      state.grantedChargedMeters + meters,
      state.grantedUnchargedMeters,
    )
    : withConsumption(
      state.allowance,
      state.movesSpent,
      state.grantedChargedMeters,
      state.grantedUnchargedMeters + meters,
    );
}


/** Everything the character actually travelled this Round, cap-free. */
export function totalDistanceTravelledMeters(
  state: RoundMovementState,
): number {
  return state.consumedMeters + state.grantedUnchargedMeters;
}
