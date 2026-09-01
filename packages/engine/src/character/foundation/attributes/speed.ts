/*
 * Speed as an actual velocity, and what a Move covers.
 *
 * Speed is a Stat on the ordinary ladder, but unlike every other derived
 * attribute it converts to a real-world quantity:
 *
 *   Speed 10  =  10/3 m/s  =  10 metres in a 3-second Move
 *
 * The Standard Human defines the anchor, the same way it defines 100
 * normalized SP and 62 kg. Every +3 Speed doubles velocity — three points per
 * doubling rather than one, because Speed averages two Stats and would
 * otherwise run away:
 *
 *   Speed 10  ->  3.33 m/s
 *   Speed 13  ->  6.67 m/s
 *   Speed 16  -> 13.33 m/s
 *
 * There is deliberately NO height, limb-length or stride term. A larger body is
 * not universally faster — it has already been charged for its size through
 * AGI, and adding a stride bonus would hand part of that back. A Species with
 * genuinely unusual locomotion says so with its own mechanic rather than every
 * large creature getting one by default.
 *
 *
 * INTACT CAPABILITY VERSUS WHAT YOU CAN CURRENTLY MANAGE
 *
 * Speed describes a body that works. Damage does not lower the Stat — a
 * character with a ruined leg still has Speed 10 and simply cannot use all of
 * it. Current movement is that rate multiplied by locomotor condition, which
 * body/locomotion.ts resolves from BP fraction and accessibility.
 *
 * Both numbers are exposed. A GM who can only see one cannot explain why a
 * character moved 5 metres instead of 10.
 */

/* One of the baseline-10 anchors; see resolution.ts's
 * STANDARD_MODIFIER_REFERENCE_SCORE. */
export const REFERENCE_SPEED_POSITION = 10;

/** The Standard Human's ordinary combat movement: 10 m in a 3-second Move. */
export const REFERENCE_MOVEMENT_RATE_MPS = 10 / 3;

/** Points of Speed per doubling of velocity. */
export const SPEED_DOUBLING_INTERVAL = 3;

/** One Round is six seconds; a Turn divides it by the Actions taken in it. */
export const ROUND_DURATION_SECONDS = 6;

/** A normal creature spends two Actions per Turn, so a Move is three seconds. */
export const STANDARD_ACTIONS_PER_TURN = 2;


/*
 * Velocity from a Speed position.
 *
 * Takes the CONTINUOUS position rather than the displayed Stat. Displayed
 * Speed is floored for the sheet, and flooring before converting would throw
 * away up to a third of a doubling.
 */
export function resolveMovementRateMps(speedPosition: number): number {
  return (
    REFERENCE_MOVEMENT_RATE_MPS *
    Math.pow(
      2,
      (speedPosition - REFERENCE_SPEED_POSITION) / SPEED_DOUBLING_INTERVAL,
    )
  );
}


/*
 * How long one Action represents.
 *
 * Actions per TURN divide the Round into finer slices; Actions per ROUND do
 * not. A creature with more Round Actions gets more opportunities to act, not
 * shorter ones — which is why a six-Action character still covers a full Move
 * with each of them and can therefore travel six Moves in a Round.
 */
export function resolveActionMovementSeconds(
  actionsPerTurn: number = STANDARD_ACTIONS_PER_TURN,
): number {
  if (actionsPerTurn <= 0) return 0;

  return ROUND_DURATION_SECONDS / actionsPerTurn;
}


/*
 * How far one Move Action covers.
 *
 * At the standard two Actions per Turn a Move is three seconds, so Speed 10
 * covers exactly 10 metres. A mechanic granting a third Action per Turn does
 * not make a character faster — it slices the same Round more finely, and each
 * Move covers proportionally less.
 */
export function resolveMoveDistanceMeters(
  movementRateMps: number,
  actionsPerTurn: number = STANDARD_ACTIONS_PER_TURN,
): number {
  return movementRateMps * resolveActionMovementSeconds(actionsPerTurn);
}


export interface ResolvedMovement {
  readonly speedPosition: number;
  readonly displayedSpeed: number;

  /** What an intact body of this Speed manages. */
  readonly baseMovementRateMps: number;

  /** That rate after locomotor damage and accessibility. */
  readonly currentMovementRateMps: number;

  /** 1 when every locomotor chain is whole; 0 when none of them work. */
  readonly locomotionFraction: number;

  readonly actionsPerTurn: number;
  readonly moveDistanceMeters: number;
}


/*
 * Assembles the movement a character actually has.
 *
 * `locomotionFraction` comes from body/locomotion.ts and is the only place
 * damage enters. Speed itself is untouched by it, which keeps "how fast is
 * this character" and "how much of their legs work" separate questions.
 */
export function resolveMovement(
  speedPosition: number,
  locomotionFraction: number,
  actionsPerTurn: number = STANDARD_ACTIONS_PER_TURN,
): ResolvedMovement {
  const baseMovementRateMps = resolveMovementRateMps(speedPosition);
  const currentMovementRateMps = baseMovementRateMps * locomotionFraction;

  return {
    speedPosition,
    displayedSpeed: Math.floor(speedPosition),

    baseMovementRateMps,
    currentMovementRateMps,
    locomotionFraction,

    actionsPerTurn,
    moveDistanceMeters: resolveMoveDistanceMeters(
      currentMovementRateMps,
      actionsPerTurn,
    ),
  };
}
