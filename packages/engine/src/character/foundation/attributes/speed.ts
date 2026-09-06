/*
 * Speed as an actual distance, and what a Move covers.
 *
 * Speed is a Stat on the ordinary ladder, but unlike every other derived
 * attribute it converts to a real-world quantity. It is denominated in metres
 * per ROUND rather than metres per second, because the Round is the unit the
 * rest of the engine measures combat in and a velocity is one division away:
 *
 *   Speed 10  =    6 m per Round  =   3 m/s
 *   Speed 30  =  700 m per Round  = 350 m/s
 *
 * The Round is two seconds, and this file imports that from time/duration.ts
 * rather than declaring it. It used to declare its own six, which is how the
 * anchor above came to be stated three different ways across the repository at
 * once.
 *
 *
 * WHY THE CURVE ACCELERATES
 *
 * The old conversion doubled velocity every three points forever. That is a
 * constant proportional gain, and it made the top of the ladder uninteresting
 * in exactly the wrong way: the step from Speed 27 to 30 bought the same
 * multiple as the step from 10 to 13, so nothing about approaching the ceiling
 * felt like approaching a ceiling.
 *
 * The locked curve instead pins two anchors and accelerates between them. With
 *
 *   x = (S - 10) / 20
 *
 *   RoundMovement(S) = 6 x 2 ^ (5x + 1.866248611111173 x^2)
 *
 * Speed 10 is exactly 6 metres and Speed 30 is exactly 700 — which puts a
 * Speed 30 character at 350 m/s, barely past this engine's reference speed of
 * sound. The quadratic term is what makes each point buy proportionally more
 * than the last, so the last few points of the ladder are the expensive,
 * conspicuous ones.
 *
 *   Speed    1      5     10     13     16     20     25     30
 *   m/Round  1.64   2.74   6.0   10.4   19.1   46.9  167.1  700.0
 *
 * The exponent's slope is 5 + 2 x 1.8662 x, which stays positive far below
 * Speed 1, so the curve is finite, positive and monotonic across the whole
 * supported range and does not need clamping to stay well-behaved.
 *
 * There is deliberately NO height, limb-length or stride term. A larger body is
 * not universally faster — it has already been charged for its size through
 * AGI, and adding a stride bonus would hand part of that back. A Species with
 * genuinely unusual locomotion says so with its own mechanic rather than every
 * large creature getting one by default.
 *
 *
 * CONTINUOUS IN, ROUNDED ONLY ON THE WAY OUT
 *
 * Speed averages resolved STR and resolved AGI, and both arrive continuous:
 * Strength is a logarithm of Structural Capacity and is genuinely 16.64 rather
 * than 16. Flooring before converting would discard up to a fifth of a
 * doubling and make two visibly different characters move identically, so the
 * conversion takes the continuous position and rounding happens at the sheet.
 * `presentMovementMeters` is that sheet rounding, and nothing in this file
 * consumes its output.
 *
 *
 * INTACT CAPABILITY VERSUS WHAT YOU CAN CURRENTLY MANAGE
 *
 * Speed describes a body that works. Damage does not lower the Stat — a
 * character with a ruined leg still has Speed 10 and simply cannot use all of
 * it. Current movement is that allowance multiplied by locomotor condition,
 * which body/locomotion.ts resolves from BP fraction and accessibility.
 *
 * Both numbers are exposed. A GM who can only see one cannot explain why a
 * character moved 3 metres instead of 6.
 *
 * How a Round's allowance is divided into Moves is movement.ts's question, not
 * this file's. This file answers "how far can this body travel in a Round".
 */

import { roundToSignificantFigures } from "../../../infrastructure/rounding";
import { SECONDS_PER_COMBAT_ROUND } from "../../../time/duration";


/* One of the baseline-10 anchors; see resolution.ts's
 * STANDARD_MODIFIER_REFERENCE_SCORE. */
export const REFERENCE_SPEED_POSITION = 10;

/** The Standard Human's ordinary combat movement: 6 m in a two-second Round. */
export const REFERENCE_ROUND_MOVEMENT_METERS = 6;

/** The upper anchor the curve is calibrated against. */
export const SUPERHUMAN_SPEED_POSITION = 30;

/** Metres per Round at the upper anchor. */
export const SUPERHUMAN_ROUND_MOVEMENT_METERS = 700;

/*
 * The span the curve's parameter is normalized over, so that x = 0 at the
 * reference anchor and x = 1 at the superhuman one.
 */
export const SPEED_CURVE_SPAN =
  SUPERHUMAN_SPEED_POSITION - REFERENCE_SPEED_POSITION;

/*
 * The exponent is 5x + 1.866248611111173x^2, in doublings.
 *
 * The linear term is chosen first — five doublings across the span — and the
 * quadratic term is then whatever makes the upper anchor land on exactly 700
 * rather than approximately there. It is carried to full double precision for
 * that reason and should not be shortened.
 */
export const SPEED_CURVE_LINEAR_DOUBLINGS = 5;
export const SPEED_CURVE_QUADRATIC_DOUBLINGS = 1.866248611111173;

/**
 * The reference speed of sound, for describing what the top of the ladder is
 * near. Nothing derives from it; Speed 30 is 350 m/s because the anchor says
 * 700 metres per Round, not because it was fitted to this number.
 */
export const REFERENCE_SPEED_OF_SOUND_MPS = 343;

/** Movement is presented to two significant figures and calculated in full. */
export const MOVEMENT_PRESENTATION_SIGNIFICANT_FIGURES = 2;


/*
 * Speed's continuous position, from the two resolved Attributes it averages.
 *
 * Takes numbers rather than a stat block on purpose. Strength arrives here as
 * a continuous ladder position and AGI as a resolved score that Volume and
 * Mass have ALREADY been charged against — see attributes/physical.ts. Speed
 * must not look at Volume, Mass or morphology itself; doing so would charge a
 * large creature for its size twice.
 */
export function resolveSpeedPosition(
  strengthPosition: number,
  agility: number,
): number {
  if (!Number.isFinite(strengthPosition) || !Number.isFinite(agility)) return 0;

  return (strengthPosition + agility) / 2;
}


/*
 * How far an intact body of this Speed travels in one Round.
 *
 * Non-finite input resolves to zero rather than propagating: this is a pure
 * derivation with no EngineResult to fail into, and the alternative is a NaN
 * distance reaching a character sheet with nothing naming where it came from.
 */
export function resolveRoundMovementMeters(speedPosition: number): number {
  if (!Number.isFinite(speedPosition)) return 0;

  const x =
    (speedPosition - REFERENCE_SPEED_POSITION) / SPEED_CURVE_SPAN;

  return (
    REFERENCE_ROUND_MOVEMENT_METERS *
    Math.pow(
      2,
      SPEED_CURVE_LINEAR_DOUBLINGS * x +
      SPEED_CURVE_QUADRATIC_DOUBLINGS * x * x,
    )
  );
}


/*
 * The same allowance as a velocity.
 *
 * A division by the Round, which is imported. Movement owns no timing constant
 * of its own — that is what let a six-second Round survive here for as long as
 * it did while the clock had already moved to two.
 */
export function resolveMovementRateMps(speedPosition: number): number {
  return resolveRoundMovementMeters(speedPosition) / SECONDS_PER_COMBAT_ROUND;
}


/**
 * A movement figure as a sheet should show it: two significant figures.
 *
 * Presentation only. Nothing in the engine consumes this — stored positions,
 * Round allowances and Move shares all keep full precision, because rounding
 * a share before it accumulates is exactly how a character ends a Round
 * having travelled slightly more or less than their allowance.
 */
export function presentMovementMeters(meters: number): number {
  return roundToSignificantFigures(
    meters,
    MOVEMENT_PRESENTATION_SIGNIFICANT_FIGURES,
  );
}


export interface ResolvedMovement {
  readonly speedPosition: number;
  readonly displayedSpeed: number;

  /** What an intact body of this Speed covers in one Round. */
  readonly baselineRoundMovementMeters: number;
  readonly baselineMovementRateMps: number;

  /** That allowance after locomotor damage and accessibility. */
  readonly currentRoundMovementMeters: number;
  readonly currentMovementRateMps: number;

  /** 1 when every locomotor chain is whole; 0 when none of them work. */
  readonly locomotionFraction: number;
}


/*
 * Assembles the movement a character actually has for a Round.
 *
 * `locomotionFraction` comes from body/locomotion.ts and is the only place
 * damage enters. Speed itself is untouched by it, which keeps "how fast is
 * this character" and "how much of their legs work" separate questions.
 *
 * Deliberately stops before Moves. Dividing a Round's allowance needs the
 * character's Round Action Capacity SNAPSHOTTED at the start of that Round,
 * which is encounter state rather than a property of the body — see
 * movement.ts.
 */
export function resolveMovement(
  speedPosition: number,
  locomotionFraction: number,
): ResolvedMovement {
  const baselineRoundMovementMeters = resolveRoundMovementMeters(speedPosition);

  const fraction = Number.isFinite(locomotionFraction)
    ? locomotionFraction
    : 0;

  const currentRoundMovementMeters = baselineRoundMovementMeters * fraction;

  return {
    speedPosition,
    displayedSpeed: Math.floor(speedPosition),

    baselineRoundMovementMeters,
    baselineMovementRateMps:
      baselineRoundMovementMeters / SECONDS_PER_COMBAT_ROUND,

    currentRoundMovementMeters,
    currentMovementRateMps:
      currentRoundMovementMeters / SECONDS_PER_COMBAT_ROUND,

    locomotionFraction: fraction,
  };
}
