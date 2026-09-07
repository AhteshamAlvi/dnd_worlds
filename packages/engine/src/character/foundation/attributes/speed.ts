/*
 * Speed as an actual distance, and the base movement a Round holds.
 *
 * Speed is the character's general quickness of physical movement. It decides
 * base movement per two-second Combat Round BEFORE movement mode, morphology,
 * bodily integrity, environment, Traits, Skills or techniques are applied.
 *
 *   Speed 10  =    6 m per Round  =   3 m/s
 *   Speed 30  =  700 m per Round  = 350 m/s
 *
 * The Round is two seconds, and this file imports that from time/duration.ts
 * rather than declaring it.
 *
 *
 * ONE CANONICAL SPEED
 *
 *   Speed = round((STR + AGI) / 2)
 *
 * The integer Derived Attribute, and nothing else. STR and AGI arrive already
 * resolved — Volume, Mass and the muscular burden have been charged against
 * them by attributes/physical.ts and body/strength.ts — so movement reapplies
 * none of it.
 *
 * This file briefly consumed the CONTINUOUS Strength ladder position instead,
 * on the reasoning that flooring threw away real force. It did, and that was
 * the wrong trade: it made base movement depend on a number no sheet shows, so
 * two characters who both read Speed 11 moved measurably differently and
 * nothing on either sheet explained why. The invariant is worth more than the
 * precision:
 *
 *   EQUAL CANONICAL SPEED = EQUAL BASE MOVEMENT.
 *
 * Equal Speed does not promise equal PERFORMANCE. A swimmer and a sprinter of
 * the same Speed will differ — through explicit, inspectable mode, propulsion,
 * gait and integrity factors, each of which a GM can point at. None of them is
 * a hidden logarithm.
 *
 *
 * WHY THE CURVE ACCELERATES
 *
 * With x = (S - 10) / 20,
 *
 *   RoundMovement(S) = 6 x 2 ^ (5x + 1.866248611111173x^2)
 *
 * Speed 10 is exactly 6 metres and Speed 30 is exactly 700 — which puts a
 * Speed 30 character at 350 m/s, barely past this engine's reference speed of
 * sound. The quadratic term makes each point buy proportionally more than the
 * last, so the top of the ladder is the expensive part rather than another
 * doubling.
 *
 *   Speed    1      5     10     13     16     20     25     30
 *   m/Round  1.64   2.74   6.0   10.4   19.1   46.9  167.1  700.0
 *
 * Speed 30 is the canonical CEILING of this curve — of the Speed a character
 * has, not merely of the Speed the curve is evaluated at. A Trait, technique
 * or future movement factor that carries someone faster does so as an explicit
 * modifier on the RESULT, not by feeding 40 into the exponential, which would
 * happily answer with 39 kilometres a Round.
 *
 * There is deliberately NO height, limb-length or stride term. A larger body
 * is not universally faster; it has already been charged for its size through
 * AGI, and a stride bonus would hand part of that back.
 *
 *
 * THE FOUR FACTORS
 *
 *   ResolvedMovement = BaseMovement(Speed)
 *                    x ModeFactor
 *                    x PropulsionFactor
 *                    x GaitFactor
 *                    x IntegrityFactor
 *
 * Mode is the inherent rate of Move, Sprint, Crawl, Climb, Swim or Flight.
 * Propulsion is the strength and suitability of the parts producing the
 * movement. Gait is their number, arrangement, symmetry, specialization and
 * coordination. Integrity is how usable they currently are.
 *
 * Only INTEGRITY is implemented. The other three are declared, fixed at 1, and
 * exposed on the result so that the day one of them becomes real, it becomes
 * real in one place instead of being multiplied in ad hoc at four call sites.
 *
 * Limb count is an INPUT to gait, never a modifier of its own. A naturally
 * tripedal creature has an efficient tripedal gait; a quadruped down to three
 * usable legs has a disrupted one. The comparison is always against the
 * creature's intended body plan, which is why gait cannot be a lookup on a
 * number of legs.
 *
 *
 * CONTINUOUS OUT, ROUNDED ONLY ON THE WAY TO THE SHEET
 *
 * Speed in is an integer; metres out are not. Allowances, Move shares and
 * consumed distance all keep full precision, and `presentMovementMeters` is
 * the sheet's two significant figures. Nothing in the engine consumes it.
 *
 *
 * INTACT CAPABILITY VERSUS WHAT YOU CAN CURRENTLY MANAGE
 *
 * Speed describes a body that works. Damage does not lower the Stat — a
 * character with a ruined leg still has Speed 10 and simply cannot use all of
 * it. Both numbers are exposed, because a GM who can only see one cannot
 * explain why a character moved 3 metres instead of 6.
 *
 * How a Round's allowance divides into Moves is movement.ts's question.
 */

import { roundToSignificantFigures } from "../../../infrastructure/rounding";
import { SECONDS_PER_COMBAT_ROUND } from "../../../time/duration";


/* One of the baseline-10 anchors; see resolution.ts's
 * STANDARD_MODIFIER_REFERENCE_SCORE. */
export const REFERENCE_SPEED = 10;

/** The Standard Human's ordinary combat movement: 6 m in a two-second Round. */
export const REFERENCE_ROUND_MOVEMENT_METERS = 6;

/** The upper anchor the curve is calibrated against. */
export const SUPERHUMAN_SPEED = 30;

/** Metres per Round at the upper anchor. */
export const SUPERHUMAN_ROUND_MOVEMENT_METERS = 700;

/*
 * The bounds of the ordinary base curve, matching the 1..30 Stat ladder.
 *
 * These clamp the CURVE's input, not the character's Speed. A Speed 35 from
 * some future Trait is a real Speed 35; it simply does not get to ride an
 * exponential built for the mortal range, and whatever grants it owes an
 * explicit modifier on the result.
 */
export const MINIMUM_CURVE_SPEED = 1;
export const MAXIMUM_CURVE_SPEED = SUPERHUMAN_SPEED;

/*
 * The span the curve's parameter is normalized over, so that x = 0 at the
 * reference anchor and x = 1 at the superhuman one.
 */
export const SPEED_CURVE_SPAN = SUPERHUMAN_SPEED - REFERENCE_SPEED;

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


/**
 * The Speed the base curve is actually evaluated at, or `null` for no movement.
 *
 * One boundary, so that every public helper canonicalizes identically:
 *
 *   non-finite      -> null (no movement)
 *   <= 0            -> null (no movement)
 *   fractional      -> rounded to the canonical integer score
 *   < 1 after that  -> 1
 *   > 30            -> 30
 *
 * The order matters. Zero and negative Speed mean "this thing does not move",
 * which is a different statement from "this thing moves very slowly" — and
 * without the early exit, the clamp to 1 would quietly turn a NaN or a -4 into
 * a Speed 1 character covering 1.6 metres a Round. An exponential is
 * relentlessly positive, so it will convert any nonsense it is handed into
 * confident forward motion unless something refuses first.
 */
export function resolveCurveSpeed(speed: number): number | null {
  if (!Number.isFinite(speed) || speed <= 0) return null;

  return Math.min(
    MAXIMUM_CURVE_SPEED,
    Math.max(MINIMUM_CURVE_SPEED, Math.round(speed)),
  );
}


/*
 * Base movement: how far an intact body of this Speed travels in one Round,
 * before mode, propulsion, gait and integrity.
 *
 * Takes the CANONICAL integer Speed — `derivedAttributes.speed`. It does not
 * reconstruct Speed from STR and AGI and it does not read the continuous
 * Strength ladder position; there is exactly one Speed and this consumes it.
 */
export function resolveRoundMovementMeters(speed: number): number {
  const curveSpeed = resolveCurveSpeed(speed);

  if (curveSpeed === null) return 0;

  const x = (curveSpeed - REFERENCE_SPEED) / SPEED_CURVE_SPAN;

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
export function resolveMovementRateMps(speed: number): number {
  return resolveRoundMovementMeters(speed) / SECONDS_PER_COMBAT_ROUND;
}


/**
 * The integrity factor, bounded to [0, 1].
 *
 * Integrity answers "how much of the apparatus still works", so it may reduce
 * movement to nothing and may never grant any. A value above 1 is not a strong
 * limb or a good gait — those are the propulsion and gait factors, which do not
 * exist yet — and silently accepting one here is how the first "1.2 for a
 * powerful runner" would have become the engine's movement bonus mechanism by
 * accident. Non-finite is 0 rather than 1: an unknown state of the legs is not
 * a working pair of legs.
 */
export function resolveIntegrityFactor(fraction: number): number {
  if (!Number.isFinite(fraction) || fraction <= 0) return 0;

  return Math.min(1, fraction);
}


/**
 * A movement figure as a sheet should show it: two significant figures.
 *
 * Presentation only. Nothing in the engine consumes this — allowances, Move
 * shares and consumed distance all keep full precision, because rounding a
 * share before it accumulates is exactly how a character ends a Round having
 * travelled slightly more or less than their allowance.
 */
export function presentMovementMeters(meters: number): number {
  return roundToSignificantFigures(
    meters,
    MOVEMENT_PRESENTATION_SIGNIFICANT_FIGURES,
  );
}


/*
 * The three factors that are declared and not yet resolved.
 *
 * Fixed at 1 and exposed on every result. Naming them now costs nothing and
 * buys the thing that matters: when Swim arrives, it becomes a mode factor
 * rather than a multiplication somebody adds at whichever call site they
 * happened to be looking at.
 */
export const NEUTRAL_MODE_FACTOR = 1;
export const NEUTRAL_PROPULSION_FACTOR = 1;
export const NEUTRAL_GAIT_FACTOR = 1;


export interface ResolvedMovement {
  /*
   * The canonical Speed, normalized once.
   *
   * `displayedSpeed` and `curveSpeed` are the SAME number and are both kept
   * because callers ask for them by different names. They briefly differed —
   * the curve was normalized and the display was not — which let a Speed 31
   * character report a displayed 31 against a curve 30, and a Speed -4 report
   * a displayed -4 against a curve 0. Two Speeds on one result is exactly the
   * contradiction canonical Speed exists to remove; a sheet showing one of
   * them and a distance derived from the other is unexplainable.
   */
  readonly displayedSpeed: number;
  readonly curveSpeed: number;

  /** Base movement from Speed alone, before any factor. */
  readonly baselineRoundMovementMeters: number;
  readonly baselineMovementRateMps: number;

  /*
   * The four factors. Only integrity is resolved; the rest are neutral and
   * documented in this file's header.
   */
  readonly modeFactor: number;
  readonly propulsionFactor: number;
  readonly gaitFactor: number;

  /** How usable the locomotor apparatus currently is. Always within [0, 1]. */
  readonly integrityFactor: number;

  /** Base movement after every factor above. */
  readonly currentRoundMovementMeters: number;
  readonly currentMovementRateMps: number;
}


/*
 * Assembles the movement a character actually has for a Round.
 *
 * `integrityFraction` comes from body/locomotion.ts and is the only place
 * damage enters. Speed itself is untouched by it, which keeps "how fast is
 * this character" and "how much of their legs work" separate questions.
 *
 * Deliberately stops before Moves. Dividing a Round's allowance needs the
 * character's Round Action Capacity SNAPSHOTTED at the start of that Round,
 * which is encounter state rather than a property of the body — see
 * movement.ts.
 */
export function resolveMovement(
  speed: number,
  integrityFraction: number,
): ResolvedMovement {
  /* Normalized ONCE, and every field below reads this one value. */
  const canonicalSpeed = resolveCurveSpeed(speed) ?? 0;

  const baselineRoundMovementMeters = resolveRoundMovementMeters(canonicalSpeed);

  const integrityFactor = resolveIntegrityFactor(integrityFraction);

  const currentRoundMovementMeters =
    baselineRoundMovementMeters *
    NEUTRAL_MODE_FACTOR *
    NEUTRAL_PROPULSION_FACTOR *
    NEUTRAL_GAIT_FACTOR *
    integrityFactor;

  return {
    displayedSpeed: canonicalSpeed,
    curveSpeed: canonicalSpeed,

    baselineRoundMovementMeters,
    baselineMovementRateMps:
      baselineRoundMovementMeters / SECONDS_PER_COMBAT_ROUND,

    modeFactor: NEUTRAL_MODE_FACTOR,
    propulsionFactor: NEUTRAL_PROPULSION_FACTOR,
    gaitFactor: NEUTRAL_GAIT_FACTOR,
    integrityFactor,

    currentRoundMovementMeters,
    currentMovementRateMps:
      currentRoundMovementMeters / SECONDS_PER_COMBAT_ROUND,
  };
}
