/*
 * Endurance: the Body-owned half of the energy model.
 *
 * There is no Stamina bar, and that is the whole design. A character has ONE
 * expendable reserve — Aura — and the three things in this folder describe how
 * hard it is to spend, how long the body has been running, and what the
 * combination is doing to them:
 *
 *   Stamina      physical-expenditure EFFICIENCY, derived from CON and VIT.
 *                A multiplier on cost, never a pool.
 *
 *   Wakefulness  time-based physiological strain. The only stored value in
 *                the folder, and only because hours awake cannot be
 *                recomputed from anything else.
 *
 *   Fatigue      a derived 0-10 condition combining wakefulness with how
 *                drained the Aura reserve is. Never stored — storing it beside
 *                the wakefulness it is derived from is how the two disagree.
 *
 * Body takes every cross-domain figure as a PLAIN NUMBER. Maximum Aura, the
 * depletion fraction and the Stamina score all arrive as arguments rather than
 * as imports, which is the same rule that keeps Body independent of the
 * Attribute layer — and here it also keeps the Aura domain, which depends on
 * this folder, from being depended on by it.
 */

import type { GameDuration } from "../../../../time/types";


/* ── Physical exertion ──────────────────────────────────────────────────── */

/*
 * How hard a discrete physical action is, RELATIVE TO THE ACTOR.
 *
 * This is the load-bearing subtlety. Load is not absolute force. A
 * superhuman's ordinary committed punch and an ordinary human's ordinary
 * committed punch are both Load 1: each is spending the same share of what
 * they have, and each produces wildly different force and a wildly different
 * absolute Aura cost, because cost scales with Maximum Aura. A superhuman
 * deliberately pulling a punch down to human force is doing something LIGHT
 * for them, and takes the lower load.
 *
 * Aura never infers this. Whether a punch, a slash, a sprint, a weapon swing
 * or a maneuver is strenuous is a fact about the action, and Combat and the
 * action layer supply it. Combat will eventually derive the relative load from
 * force used over maximum available force; that conversion is not this
 * ticket's, and neither is attack force to Body Points.
 */
export const PHYSICAL_EXERTION_LEVELS = [
  "negligible",
  "light",
  "ordinary-committed",
  "forceful",
  "maximal",
  "desperate-overexertion",
] as const;

export type PhysicalExertionLevel = typeof PHYSICAL_EXERTION_LEVELS[number];

/*
 * A raw exertion load.
 *
 * Kept as a bare number rather than restricted to the six named levels so
 * Combat can eventually supply a continuous ratio of force used to maximum
 * force available. The named levels are the anchors on that scale, not the
 * whole of it.
 */
export type PhysicalExertionLoad = number;


/*
 * How hard a character is working over TIME, as load per hour.
 *
 * A separate scale from the discrete one and deliberately so: a single
 * forceful blow and an hour of forceful work are not the same quantity, and
 * one scale serving both would have to mean "per hour" in one place and "per
 * action" in another.
 *
 * Ordinary waking is ZERO. Walking, talking, eating and going about a day cost
 * a character nothing — a model in which merely being awake drains Aura makes
 * every character a clock running down, and wakefulness already carries the
 * cost of time passing.
 */
export const SUSTAINED_ACTIVITY_LEVELS = [
  "ordinary-waking",
  "light",
  "moderate",
  "strenuous",
  "extreme",
] as const;

export type SustainedActivityLevel = typeof SUSTAINED_ACTIVITY_LEVELS[number];


/* ── Wakefulness ────────────────────────────────────────────────────────── */

/*
 * Everything stored about how long a character has been up.
 *
 * One number, because one number is all that cannot be recomputed. Fatigue is
 * deliberately NOT stored beside it: Fatigue is a function of these hours and
 * of the Aura reserve, and a stored copy would be a second answer that drifts
 * the moment either input moves.
 *
 * "Effective" hours because sleep subtracts from this rather than resetting
 * it. A character who sleeps four hours after being up for thirty is not
 * freshly rested, and this is where that debt lives.
 */
export interface CharacterWakefulnessState {
  readonly hoursAwake: number;
}

/** A character who has just woken fully rested. */
export function restedWakefulness(): CharacterWakefulnessState {
  return { hoursAwake: 0 };
}

/*
 * How long this body can stay up, and how far into that it is.
 *
 * `maximumHours` scales logarithmically with Maximum Aura: a vastly more
 * powerful character stays functional longer, but ten times the Aura buys one
 * more day rather than ten.
 */
export interface ResolvedWakefulness {
  readonly hoursAwake: number;
  readonly maximumHours: number;

  /** 0 freshly rested, 1 at the limit. Never above 1. */
  readonly fraction: number;
}


/* ── Fatigue ────────────────────────────────────────────────────────────── */

/*
 * The two things that tire a character, kept separate all the way to the top.
 *
 * `wakefulnessRaw` is quadratic and deliberately unrounded — flooring each
 * component on its own and then adding would lose up to two whole levels
 * between them. Only the TOTAL is floored.
 *
 * Physical exertion is absent on purpose. Exertion spends Aura, Aura
 * depletion is already a component, and adding a third term for exertion would
 * charge the same effort twice.
 */
export interface FatigueComponents {
  readonly wakefulnessRaw: number;
  readonly auraDepletion: number;
  readonly totalRaw: number;
}

export const FATIGUE_STATES = [
  "unimpaired",
  "fatigued",
  "severely-fatigued",
  "cannot-fight",
  "blackout",
] as const;

export type FatigueState = typeof FATIGUE_STATES[number];

/*
 * A character's current Fatigue, and what it stops them doing.
 *
 * The flags are TYPED CONSEQUENCES, not dice penalties. What Fatigue 6 costs
 * a Skill check, a Body recovery rate or a Combat roll belongs to those
 * systems, and inventing a universal modifier here would pre-empt all three
 * with a number none of them agreed to. What Fatigue can say on its own is
 * categorical: at 9 the character cannot fight, at 10 they are unconscious.
 */
export interface ResolvedFatigue {
  /** 0 through 10, floored from the combined raw total. */
  readonly level: number;

  readonly state: FatigueState;
  readonly components: FatigueComponents;
  readonly wakefulness: ResolvedWakefulness;

  readonly canFight: boolean;
  readonly conscious: boolean;
}


/* ── Time ───────────────────────────────────────────────────────────────── */

/*
 * How a character spent an interval, as far as the body is concerned.
 *
 * Three modes, because three are what change the physiology differently:
 * ordinary waking accrues strain and recovers nothing, intentional rest
 * recovers Aura but is NOT sleep and does not touch sleep debt, and sleep is
 * the only thing that reduces it.
 *
 * Nen suppression is not a mode. Resting behind a Zetsu recovers Aura faster
 * and still leaves the character just as short of sleep; that is the Aura
 * domain's recovery multiplier, not a fourth kind of hour.
 */
export const WAKEFULNESS_MODES = [
  "ordinary-waking",
  "intentional-rest",
  "sleep",
] as const;

export type WakefulnessMode = typeof WAKEFULNESS_MODES[number];

export interface WakefulnessTransition {
  readonly mode: WakefulnessMode;
  readonly elapsedHours: number;
  readonly previous: CharacterWakefulnessState;
  readonly state: CharacterWakefulnessState;
  readonly hoursChange: number;
}

/** Re-exported so callers can hand this folder a GameDuration directly. */
export type { GameDuration };
