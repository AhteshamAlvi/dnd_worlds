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
 * ONE ALLOWANCE, TWO WAYS TO SPEND IT
 *
 * Moves and CHARGED grants draw on the same finite Round distance. A shove
 * that consumed the whole Round leaves nothing for a Move even though the
 * character still holds the Action, and the ledger refuses the Move rather
 * than spending the Action on nothing — see `spendMove`'s refusal order.
 *
 * A partially consumed allowance is not a refusal: the Move covers what is
 * left, which may be short of a full share, and spends the Action because the
 * Move happened.
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
 * Round Actions as a discrete count.
 *
 * ONE rule, used by every helper that divides or records a capacity. Two
 * normalizations that merely happen to agree today are two that can disagree
 * after an edit, and a `resolveMoveShare` that floored differently from
 * `beginRoundMovement` would hand out shares the ledger could not spend.
 *
 * Fractional capacity floors: two and a half Actions is two Actions and a
 * fraction the character cannot act on. Non-finite, zero and negative are all
 * zero, which is "cannot Move" rather than "moves oddly".
 */
export function normalizeRoundActionCapacity(capacity: number): number {
  return Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : 0;
}


/**
 * The share one Move draws, from a snapshotted Round Action Capacity.
 *
 * Zero Round Actions cannot produce a normal Move, so the share is zero rather
 * than infinite.
 */
export function resolveMoveShare(roundActionCapacity: number): number {
  const capacity = normalizeRoundActionCapacity(roundActionCapacity);

  if (capacity <= 0) return 0;

  return 1 / capacity;
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

  const capacity = normalizeRoundActionCapacity(roundActionCapacity);
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
 * Refusal precedence is fixed, and all three cases are genuinely different:
 *
 *   1. No Round Actions at all      -> "no-round-actions"
 *   2. Every Move share spent       -> "allowance-spent"
 *   3. Shares left, but charged
 *      movement already took the
 *      whole allowance              -> "allowance-spent"
 *
 * The third is the one this ledger got wrong. Moves and charged grants draw on
 * ONE finite allowance, so a character shoved their whole Round's distance has
 * nothing left to Move with — and the old code let them spend the Action
 * anyway, incrementing `movesSpent` and reporting a successful Move of zero
 * metres. A caller counting successful Moves would have believed it, and the
 * Action was gone either way.
 *
 * A PARTIALLY consumed allowance is different again, and still succeeds: the
 * Move covers whatever remains, which may be less than a full share, and it
 * spends the Action because the Move was performed. Short is not refused.
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

  /*
   * Checked BEFORE the Action is spent, so an exhausted allowance costs the
   * character nothing rather than costing them an Action for no ground.
   */
  if (state.remainingMeters <= 0) {
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

  if (!options.chargedAgainstCap) {
    return withConsumption(
      state.allowance,
      state.movesSpent,
      state.grantedChargedMeters,
      state.grantedUnchargedMeters + meters,
    );
  }

  /*
   * Clamped to what the allowance can actually pay for, and RECORDED clamped.
   *
   * Storing the full 100 metres of a 100-metre shove against a 6-metre Round
   * would leave `grantedChargedMeters` describing distance that never
   * happened — the consumption is clamped either way, so the only thing an
   * unclamped total can do is mislead whoever reads it.
   */
  const charged = Math.min(meters, state.remainingMeters);

  if (charged <= 0) return state;

  return withConsumption(
    state.allowance,
    state.movesSpent,
    state.grantedChargedMeters + charged,
    state.grantedUnchargedMeters,
  );
}


/** Everything the character actually travelled this Round, cap-free. */
export function totalDistanceTravelledMeters(
  state: RoundMovementState,
): number {
  return state.consumedMeters + state.grantedUnchargedMeters;
}
