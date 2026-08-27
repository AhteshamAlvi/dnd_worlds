/*
 * Shared rounding for derived Rulebook figures.
 *
 * Several systems (Aura Pool, Aura Output, Aura Regeneration, XP thresholds)
 * independently round a raw computed value to one significant figure before
 * it reaches the character sheet. This is the one place that rounding rule
 * lives, so every caller stays byte-for-byte consistent.
 */

/**
 * Round a value to one significant figure.
 *
 * Examples:
 *
 *   5.76    -> 6
 *   17.83   -> 20
 *   61.25   -> 60
 *   126.67  -> 100
 *   383,053 -> 400,000
 */
export function roundToOneSignificantFigure(value: number): number {
  if (value === 0) {
    return 0;
  }

  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(value)));

  return Math.round(value / magnitude) * magnitude;
}
