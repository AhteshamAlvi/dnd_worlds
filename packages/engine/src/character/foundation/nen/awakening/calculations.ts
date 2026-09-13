/*
 * The awakening arithmetic. Pure, deterministic, and it never rolls.
 *
 * Every function here takes numbers and returns numbers. None of them reads a
 * character, touches state, consults the clock or generates a random value —
 * which is what makes an abrupt attempt reproducible: the probability is a
 * property of the Attributes, and the DIE is supplied by the caller through
 * the existing runtime dice contract. A calculator that rolled internally
 * would make the same attempt come out differently on replay, and would put
 * the one piece of the engine a player disputes beyond their ability to check.
 *
 * Nothing here knows about Combat, and nothing here may learn: an abrupt
 * awakening resolves identically in a fight and in a monastery.
 *
 *
 * THE TWO SCORES ARE SEPARATE RESOLUTIONS
 * ---------------------------------------
 *
 * Success and severity are not two readings of one number. A character at
 * exactly the standard thresholds succeeds 60% of the time and, when they
 * fail, cannot die — Danger 0. A character far below them is both likelier to
 * fail and likelier to die of it. Deriving the second from the first would
 * make a 1%-chance attempt by a superb character as lethal as one by a frail
 * one, which is the opposite of the rule.
 *
 * So: roll success first. Only on a failure does severity get resolved at all.
 */

import type { Attributes } from "../../attributes/types";

import type { NenReawakeningHurdle } from "./types";


/* ── Standard eligibility thresholds ────────────────────────────────────── */

/*
 * The minimum Attributes a standard awakening requires.
 *
 * Also the ZERO POINT of both formulas below — every exponent and every
 * shortfall term is measured from these five numbers, which is why they are
 * one table rather than five literals scattered through the file.
 *
 * Abrupt awakening has NO minimums. That is not an oversight in this table:
 * forcing someone open from outside does not care whether they were ready.
 */
export const STANDARD_AWAKENING_THRESHOLDS = {
  con: 13,
  vit: 13,
  per: 13,
  wis: 13,
  spi: 16,
} as const;

export type StandardAwakeningAttribute =
  keyof typeof STANDARD_AWAKENING_THRESHOLDS;

export const STANDARD_AWAKENING_ATTRIBUTES = [
  "con",
  "vit",
  "per",
  "wis",
  "spi",
] as const satisfies readonly StandardAwakeningAttribute[];

/*
 * The SPI an instinctive awakening requires, on top of its authorization.
 *
 * A gate, never a trigger. SPI 20 makes an instinctive awakening POSSIBLE and
 * causes nothing on its own: there is no rarity roll a high-SPI character
 * quietly passes in the background, and a character may sit at SPI 30
 * indefinitely without one occurring.
 */
export const INSTINCTIVE_AWAKENING_MINIMUM_SPI = 20;


/* ── Abrupt success ─────────────────────────────────────────────────────── */

/*
 * The base odds a forced opening survives contact with the body at all.
 *
 * 1.5 rather than 1, so a character at exactly the thresholds is at 3:2 —
 * 60% — rather than even money. Awakening someone who was ready anyway is
 * meant to be likely, not a coin flip.
 */
export const ABRUPT_BASE_ODDS = 1.5;

/** Per point of CON, VIT, PER or WIS above its threshold. */
export const ABRUPT_PHYSICAL_ODDS_FACTOR = 1.25;

/** Per point of SPI above its threshold. Spirit matters more, and by design. */
export const ABRUPT_SPIRIT_ODDS_FACTOR = 1.75;

/*
 * The floor and ceiling on the final probability.
 *
 * Applied to the PROBABILITY, after the odds are converted — not to the odds.
 * Nothing is certain and nothing is hopeless: a hopeless attempt would make
 * the roll ceremonial, and a certain one would make it a formality, and both
 * are worse stories than a 1% chance.
 */
export const ABRUPT_MINIMUM_PROBABILITY = 0.01;
export const ABRUPT_MAXIMUM_PROBABILITY = 0.99;


/*
 * The same three factors, in log space.
 *
 * The product form leaves the representable range on ordinary-looking input:
 * five Attributes at 1,000 are finite, and their odds are not — 1.25^987 alone
 * overflows. `Infinity / (1 + Infinity)` is NaN, and NaN survives the clamp,
 * so the promised 1%-99% guarantee silently became "or NaN" for every
 * sufficiently extreme character.
 *
 * Summing logarithms never overflows, because the exponents are what grow. It
 * is used as the FALLBACK rather than as the primary formula: see below.
 */
const LOG_BASE_ODDS = Math.log(ABRUPT_BASE_ODDS);
const LOG_PHYSICAL_FACTOR = Math.log(ABRUPT_PHYSICAL_ODDS_FACTOR);
const LOG_SPIRIT_FACTOR = Math.log(ABRUPT_SPIRIT_ODDS_FACTOR);


/*
 * The logistic function, evaluated on whichever side does not overflow.
 *
 * exp(+800) is Infinity and exp(-800) is 0, so a single-branch sigmoid loses
 * one tail or the other. Branching on the sign keeps the exponent negative in
 * both cases, which is the standard stable form.
 */
function logistic(logOdds: number): number {
  if (logOdds >= 0) return 1 / (1 + Math.exp(-logOdds));

  const odds = Math.exp(logOdds);

  return odds / (1 + odds);
}


export interface AbruptAwakeningOdds {
  readonly baseOdds: number;

  /** The odds after Attributes, before any reawakening hurdle. */
  readonly attributeOdds: number;

  /** The multiplier a reawakening hurdle applied. 1 when there is none. */
  readonly hurdleMultiplier: number;

  /** attributeOdds x hurdleMultiplier, before conversion. May be Infinity. */
  readonly odds: number;

  /*
   * The same odds in log space, which never overflows.
   *
   * Reported as well as used, because it is the only field that stays
   * meaningful for a character whose odds have left the representable range —
   * `odds: Infinity` says nothing about how far past the ceiling they are and
   * this does.
   */
  readonly logOdds: number;

  /** odds / (1 + odds), before the clamp. */
  readonly rawProbability: number;

  /** The answer: clamped to 1%-99%. */
  readonly probability: number;

  readonly clamped: boolean;
}


/* Signed. Below a threshold this is negative, which is what makes the
 * corresponding factor divide rather than multiply. */
function excessOver(score: number, threshold: number): number {
  return score - threshold;
}


/**
 * The odds an abrupt awakening succeeds, and the probability they convert to.
 *
 *   odds = 1.5
 *        x 1.25^(CON - 13) x 1.25^(VIT - 13)
 *        x 1.25^(PER - 13) x 1.25^(WIS - 13)
 *        x 1.75^(SPI - 16)
 *
 *   p = clamp(odds / (1 + odds), 0.01, 0.99)
 *
 * The exponents are SIGNED. A character below a threshold divides rather than
 * multiplies, which is the whole reason abrupt awakening can be attempted
 * below the standard minimums and still be a bad idea.
 *
 * A reawakening hurdle multiplies the ODDS and does so BEFORE the conversion.
 * Multiplying the probability instead would let an ideal hurdle push a 60%
 * attempt to 120%, and clamping that to 99% would quietly turn every strong
 * reawakening into the same number.
 */
export function deriveAbruptAwakeningOdds(
  attributes: Attributes,
  hurdleMultiplier = 1,
): AbruptAwakeningOdds {
  const physicalExcess =
    excessOver(attributes.con, STANDARD_AWAKENING_THRESHOLDS.con) +
    excessOver(attributes.vit, STANDARD_AWAKENING_THRESHOLDS.vit) +
    excessOver(attributes.per, STANDARD_AWAKENING_THRESHOLDS.per) +
    excessOver(attributes.wis, STANDARD_AWAKENING_THRESHOLDS.wis);

  const spiritExcess =
    excessOver(attributes.spi, STANDARD_AWAKENING_THRESHOLDS.spi);

  const attributeOdds =
    ABRUPT_BASE_ODDS *
    ABRUPT_PHYSICAL_ODDS_FACTOR **
      excessOver(attributes.con, STANDARD_AWAKENING_THRESHOLDS.con) *
    ABRUPT_PHYSICAL_ODDS_FACTOR **
      excessOver(attributes.vit, STANDARD_AWAKENING_THRESHOLDS.vit) *
    ABRUPT_PHYSICAL_ODDS_FACTOR **
      excessOver(attributes.per, STANDARD_AWAKENING_THRESHOLDS.per) *
    ABRUPT_PHYSICAL_ODDS_FACTOR **
      excessOver(attributes.wis, STANDARD_AWAKENING_THRESHOLDS.wis) *
    ABRUPT_SPIRIT_ODDS_FACTOR **
      excessOver(attributes.spi, STANDARD_AWAKENING_THRESHOLDS.spi);

  const odds = attributeOdds * hurdleMultiplier;

  const logOdds =
    LOG_BASE_ODDS +
    physicalExcess * LOG_PHYSICAL_FACTOR +
    spiritExcess * LOG_SPIRIT_FACTOR +
    Math.log(hurdleMultiplier);

  /*
   * The product where it is representable, logarithms where it is not.
   *
   * Two paths rather than one, deliberately. The log form is stable everywhere
   * but is not EXACT: at the thresholds it returns 0.5999999999999999 rather
   * than 0.6, because exp(-log(1.5)) is not bit-identical to 2/3. These are
   * numbers a player is quoted and will dispute, and the published table says
   * sixty percent — so the ordinary case keeps the exact arithmetic it always
   * had, and the logarithms rescue only the range where the product has
   * already left the doubles.
   *
   * `odds` is still reported as computed, Infinity included, because that is
   * what the odds ARE for such a character. What must never escape is a NaN
   * probability.
   */
  const rawProbability = Number.isFinite(odds) && odds > 0
    ? odds / (1 + odds)
    : logistic(logOdds);

  const probability = Math.min(
    ABRUPT_MAXIMUM_PROBABILITY,
    Math.max(ABRUPT_MINIMUM_PROBABILITY, rawProbability),
  );

  return {
    baseOdds: ABRUPT_BASE_ODDS,
    attributeOdds,
    hurdleMultiplier,
    odds,
    logOdds,
    rawProbability,
    probability,
    clamped: probability !== rawProbability,
  };
}


/* ── Danger and death ───────────────────────────────────────────────────── */

/*
 * How much each point BELOW a threshold contributes to the Danger Score.
 *
 * CON and VIT weigh double: an abrupt awakening is a physical event, and the
 * body's ability to take it is what decides whether a failure is survivable.
 * SPI sits between the two at 1.5 because a mind that cannot hold the surge
 * fails differently but no less badly.
 *
 * Points ABOVE a threshold contribute nothing. Danger measures shortfall, not
 * margin — which is exactly why a character at or above every threshold has
 * Danger 0 and cannot die of a failure, however unlucky the roll was.
 */
export const DANGER_WEIGHTS = {
  con: 2,
  vit: 2,
  per: 1,
  wis: 1,
  spi: 1.5,
} as const satisfies Record<StandardAwakeningAttribute, number>;


/**
 * The Danger Score of a failed abrupt attempt.
 *
 *   danger = 2*max(0, 13 - CON) + 2*max(0, 13 - VIT)
 *          +   max(0, 13 - PER) +   max(0, 13 - WIS)
 *          + 1.5*max(0, 16 - SPI)
 */
export function deriveAwakeningDangerScore(attributes: Attributes): number {
  let danger = 0;

  for (const attribute of STANDARD_AWAKENING_ATTRIBUTES) {
    const shortfall =
      STANDARD_AWAKENING_THRESHOLDS[attribute] - attributes[attribute];

    if (shortfall > 0) danger += DANGER_WEIGHTS[attribute] * shortfall;
  }

  return danger;
}


/*
 * The death table, as HALF-OPEN BANDS.
 *
 * `upTo` is inclusive and the band begins immediately above the previous one,
 * which is what the written rule's "(0, 2]" notation means. Getting this wrong
 * in the obvious direction — treating 0 as the start of the 5% band — would
 * make a character at exactly the thresholds able to die of a failure, which
 * the rule explicitly forbids.
 *
 * The final band has no upper bound and catches everything past 10.
 */
export const AWAKENING_DEATH_BANDS = [
  { upTo: 0, deathChance: 0 },
  { upTo: 2, deathChance: 0.05 },
  { upTo: 4, deathChance: 0.15 },
  { upTo: 6, deathChance: 0.30 },
  { upTo: 8, deathChance: 0.50 },
  { upTo: 10, deathChance: 0.70 },
  { upTo: Number.POSITIVE_INFINITY, deathChance: 0.85 },
] as const;


/**
 * The chance a failed abrupt attempt kills, from the Danger Score.
 *
 * Danger exactly 0 is 0%, and the boundaries are inclusive upwards: 2 is 5%
 * and anything above 2 is 15%.
 */
export function deriveAwakeningDeathChance(dangerScore: number): number {
  for (const band of AWAKENING_DEATH_BANDS) {
    if (dangerScore <= band.upTo) return band.deathChance;
  }

  /*
   * Unreachable: the last band's bound is +Infinity, so any finite score has
   * already returned. Present because a NaN compares false against every bound
   * and would otherwise fall out of the loop with nothing to return.
   */
  return AWAKENING_DEATH_BANDS[AWAKENING_DEATH_BANDS.length - 1]!.deathChance;
}


export interface AwakeningFailureSeverity {
  readonly dangerScore: number;
  readonly deathChance: number;

  /** False when Danger is 0: a failure can still maim, but cannot kill. */
  readonly survivable: boolean;
}


/**
 * What a failure would cost this character, before it is rolled for.
 *
 * Derived from Attributes ALONE and deliberately not from the success
 * probability. They answer different questions and a character can easily be
 * unlikely to succeed and in no danger at all.
 */
export function deriveAwakeningFailureSeverity(
  attributes: Attributes,
): AwakeningFailureSeverity {
  const dangerScore = deriveAwakeningDangerScore(attributes);
  const deathChance = deriveAwakeningDeathChance(dangerScore);

  return {
    dangerScore,
    deathChance,
    survivable: deathChance === 0,
  };
}


/* ── Reawakening hurdles ────────────────────────────────────────────────── */

/*
 * The two hurdle tables, keyed by the same scale and pulling opposite ways.
 *
 * `standardDurationMultiplier` scales the TRAINING TIME a standard reawakening
 * takes, so an ideal hurdle is 0.10 — a tenth of the original — and a
 * catastrophic one is 4.00.
 *
 * `abruptOddsMultiplier` scales the ODDS of an abrupt reawakening, so an ideal
 * hurdle is 2.00 and a catastrophic one is 0.50.
 *
 * They live in one record rather than two because they are one judgement about
 * one character, and splitting them is how a severe standard hurdle ends up
 * paired with a minor abrupt one.
 */
export const REAWAKENING_HURDLE_MULTIPLIERS = {
  ideal: { standardDurationMultiplier: 0.10, abruptOddsMultiplier: 2.00 },
  minor: { standardDurationMultiplier: 0.25, abruptOddsMultiplier: 1.75 },
  moderate: { standardDurationMultiplier: 0.50, abruptOddsMultiplier: 1.50 },
  severe: { standardDurationMultiplier: 1.00, abruptOddsMultiplier: 1.25 },
  critical: { standardDurationMultiplier: 2.00, abruptOddsMultiplier: 1.00 },
  catastrophic: {
    standardDurationMultiplier: 4.00,
    abruptOddsMultiplier: 0.50,
  },
} as const satisfies Record<
  NenReawakeningHurdle,
  { standardDurationMultiplier: number; abruptOddsMultiplier: number }
>;


export function reawakeningStandardDurationMultiplier(
  hurdle: NenReawakeningHurdle,
): number {
  return REAWAKENING_HURDLE_MULTIPLIERS[hurdle].standardDurationMultiplier;
}


export function reawakeningAbruptOddsMultiplier(
  hurdle: NenReawakeningHurdle,
): number {
  return REAWAKENING_HURDLE_MULTIPLIERS[hurdle].abruptOddsMultiplier;
}


/**
 * Apply a hurdle to a supplied standard-training duration.
 *
 * The BASE duration is supplied, never invented. There is no universal length
 * for a standard awakening — it is a training outcome the content and GM
 * workflow produce — and a constant here would be this file deciding a number
 * the rules deliberately leave open.
 */
export function reawakeningStandardDuration(
  baseDurationHours: number,
  hurdle: NenReawakeningHurdle,
): number {
  return baseDurationHours * reawakeningStandardDurationMultiplier(hurdle);
}


/**
 * The abrupt odds for a reawakening: Attributes, then the hurdle, then clamp.
 *
 * At exactly the thresholds an ideal hurdle gives odds 1.5 x 2 = 3, which is
 * 75%. That is the whole reason the multiplier is applied to the odds rather
 * than to the 60% the same character would face on a first attempt.
 */
export function deriveAbruptReawakeningOdds(
  attributes: Attributes,
  hurdle: NenReawakeningHurdle,
): AbruptAwakeningOdds {
  return deriveAbruptAwakeningOdds(
    attributes,
    reawakeningAbruptOddsMultiplier(hurdle),
  );
}
