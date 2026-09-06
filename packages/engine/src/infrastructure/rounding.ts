/*
 * Shared rounding for derived Rulebook figures.
 *
 * Several systems (Aura Pool, Aura Output, Aura Regeneration, Aura Control,
 * XP thresholds) independently round a raw computed value to a fixed number of
 * significant figures before it reaches the character sheet. This is the one
 * place that rounding rule lives, so every caller stays byte-for-byte
 * consistent.
 *
 * The rounding is part of the CALCULATION, not of the display. A Control
 * multiplier of x2.9 is what the engine multiplies by; nothing downstream ever
 * sees 2.897304.
 */

/**
 * Round a value to `digits` significant figures.
 *
 * Examples:
 *
 *   (5.76, 1)     -> 6
 *   (383_053, 1)  -> 400000
 *   (2.897304, 2) -> 2.9
 *   (0.769432, 1) -> 0.8
 *
 * Implemented through `toPrecision` rather than by dividing out a power of
 * ten. Both agree on which decimal answer is correct, but the division leaves
 * binary artefacts on the way back — `Math.round(2.897304 / 0.1) * 0.1` is
 * 2.9000000000000004, which is not the number a rounded multiplier is supposed
 * to be and does not compare equal to 2.9. `toPrecision` formats the decimal
 * answer and parses it back, so the result is the nearest double to the figure
 * actually intended.
 */
export function roundToSignificantFigures(
  value: number,
  digits: number,
): number {
  if (!Number.isFinite(value) || value === 0) return value;

  return Number(value.toPrecision(digits));
}

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
  return roundToSignificantFigures(value, 1);
}
