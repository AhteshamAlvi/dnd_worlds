/*
 * Fatigue — one derived 0-10 condition from two independent causes.
 *
 *   F = clamp(F_wakefulness + F_depletion, 0, 10)
 *
 * Never stored. Both inputs are already recorded elsewhere — hours awake on
 * the character, Current Aura in the pool — so a stored Fatigue would be a
 * third number free to disagree with the two it came from.
 *
 *
 * THE WAKEFULNESS COMPONENT IS QUADRATIC
 * --------------------------------------
 *
 *   r = clamp(hoursAwake / maximumWakefulHours, 0, 1)
 *   F_wakefulness = 10 r^2
 *
 * Chosen for its shape rather than its endpoints. A linear curve would make
 * the first eight hours of a day cost the same as the eight before collapse,
 * which is not how staying up works: half way to the limit is 2.5 Fatigue and
 * still functional, three quarters is 5.6 and impaired, and the last stretch
 * arrives fast. At r = 1 it is exactly 10, so reaching the limit blacks a
 * character out on its own with no help from the reserve.
 *
 *
 * THE DEPLETION COMPONENT IS BANDED
 * ---------------------------------
 *
 * A step function on the pool's existing depletion fraction rather than
 * another curve, because this is the half a GM reads off a sheet mid-scene.
 * The bands preserve the existing calibration that roughly two thirds drained
 * is worth +2.
 *
 *
 * WHY THE TOTAL IS FLOORED ONCE, AT THE END
 * -----------------------------------------
 *
 * Flooring each component separately and adding them would lose almost a whole
 * level: 3.9 wakefulness plus a banded 2 is 5.9, one level below "severely
 * fatigued", and flooring first makes it 5 — the same answer as 3.0 plus 2.
 * The raw components are kept on the result so a sheet can show how close the
 * next level is.
 *
 * Physical exertion is deliberately NOT a third component. Exertion spends
 * Aura, spending Aura raises the depletion fraction, and the depletion
 * component already charges for it. A separate exertion term would bill the
 * same effort twice.
 */

import type { CharacterWakefulnessState, ResolvedFatigue } from "./types";
import { resolveWakefulness } from "./wakefulness";


/** Fatigue at the wakefulness limit, and the ceiling for the total. */
export const MAXIMUM_FATIGUE = 10;

/*
 * The exponent on the wakefulness ratio.
 *
 * Centralized because it is the single knob controlling how front-loaded
 * tiredness feels: 1 is linear, 2 is the chosen "fine until suddenly not", and
 * 3 would let a character run to four fifths of their limit unbothered.
 */
export const WAKEFULNESS_FATIGUE_EXPONENT = 2;

/*
 * Aura depletion to Fatigue, as ascending thresholds.
 *
 * Read as "at or above this depletion fraction, add this much". The last band
 * is a strict full-depletion check: a character at exactly zero Aura is a
 * different case from one at 0.1%, and +5 is what makes an empty reserve alone
 * enough to put an otherwise fresh character halfway to unconscious.
 */
export const AURA_DEPLETION_FATIGUE_BANDS = [
  { atLeastDepletion: 1.00, fatigue: 5 },
  { atLeastDepletion: 0.90, fatigue: 4 },
  { atLeastDepletion: 0.75, fatigue: 3 },
  { atLeastDepletion: 0.50, fatigue: 2 },
  { atLeastDepletion: 0.25, fatigue: 1 },
  { atLeastDepletion: 0.00, fatigue: 0 },
] as const;


/** The Fatigue a depletion fraction contributes, on its own. */
export function deriveAuraDepletionFatigue(depletionFraction: number): number {
  if (!Number.isFinite(depletionFraction)) return 0;

  const depletion = Math.min(1, Math.max(0, depletionFraction));

  for (const band of AURA_DEPLETION_FATIGUE_BANDS) {
    if (depletion >= band.atLeastDepletion) return band.fatigue;
  }

  return 0;
}


/** The unrounded Fatigue a wakefulness ratio contributes, on its own. */
export function deriveWakefulnessFatigue(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0;

  const ratio = Math.min(1, Math.max(0, fraction));

  return MAXIMUM_FATIGUE * ratio ** WAKEFULNESS_FATIGUE_EXPONENT;
}


/*
 * What a Fatigue level stops a character doing.
 *
 * Categorical only. What Fatigue 6 costs a Skill check, a recovery rate or an
 * attack roll belongs to Skills, Body recovery and Combat respectively;
 * inventing a universal modifier here would pre-empt all three with a number
 * none of them agreed to. What Fatigue can say alone is that at 9 a character
 * is done fighting and at 10 they are unconscious.
 */
export function fatigueStateFor(level: number): ResolvedFatigue["state"] {
  if (level >= 10) return "blackout";
  if (level >= 9) return "cannot-fight";
  if (level >= 7) return "severely-fatigued";
  if (level >= 5) return "fatigued";

  return "unimpaired";
}


export interface DeriveFatigueInput {
  readonly wakefulness: CharacterWakefulnessState;

  /** Plain numbers. Body does not import the Aura domain. */
  readonly maximumAura: number;
  readonly depletionFraction: number;
}


/**
 * A character's current Fatigue, from hours awake and how drained they are.
 *
 * Not an EngineResult. Every input is clamped into a range that produces a
 * meaningful answer — a NaN hours-awake resolves as freshly rested rather than
 * as a failure — because Fatigue is read on every sheet render and a resolver
 * that can refuse to answer "how tired is this character" is a resolver every
 * caller has to guard.
 */
export function deriveFatigue(input: DeriveFatigueInput): ResolvedFatigue {
  const wakefulness = resolveWakefulness(input.wakefulness, input.maximumAura);

  const wakefulnessRaw = deriveWakefulnessFatigue(wakefulness.fraction);
  const auraDepletion = deriveAuraDepletionFatigue(input.depletionFraction);

  const totalRaw = Math.min(
    MAXIMUM_FATIGUE,
    Math.max(0, wakefulnessRaw + auraDepletion),
  );

  /*
   * Floored, but not below the ceiling it already reached. A totalRaw of
   * exactly 10 must be level 10 rather than a floor away from it, which is
   * what makes "reaching the wakefulness limit blacks you out" exact.
   */
  const level = Math.min(MAXIMUM_FATIGUE, Math.floor(totalRaw));

  return {
    level,
    state: fatigueStateFor(level),
    components: { wakefulnessRaw, auraDepletion, totalRaw },
    wakefulness,
    canFight: level < 9,
    conscious: level < 10,
  };
}
