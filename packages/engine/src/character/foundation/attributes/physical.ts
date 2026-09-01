/*
 * How being large costs agility.
 *
 * Size and Mass are direct inputs to the BASE resolution of AGI and DEX. They
 * are deliberately not Attribute modifiers and not Effects: the number they
 * produce is the creature's actual physical base, not a penalty layered on top
 * of one. A Giant does not have "AGI 10 with a -4 modifier"; a Giant has AGI 6.
 *
 * Traits, Conditions, Items and every other Attribute-altering system operate
 * afterwards through the ordinary pipeline, on top of that base.
 *
 *
 * THE FORMULA
 *
 *   LinearSizeRatio = (SizeL / 60)^(1/3)
 *
 *   RawBurden = 0.50 x log2(LinearSizeRatio)
 *             + 0.25 x log2(MassKg / 62)
 *
 *   Steps     = round(RawBurden)
 *
 *   BaseAGI   = StoredAGI - Steps
 *   BaseDEX   = StoredDEX - Steps
 *
 * Size is stored as VOLUME, so it is converted to a linear ratio first —
 * otherwise doubling a creature's height would count as eight times the size
 * and the two terms would not be comparable.
 *
 *
 * WHY THE BURDEN IS QUANTIZED RATHER THAN THE RESULT
 *
 * The obvious implementation, floor(stored - rawBurden), has a cliff exactly at
 * the reference body: a 70 kg human carries a burden of 0.074 and would drop to
 * AGI 9, making the 62 kg Standard Human the only human who gets their stored
 * AGI. Everybody normal is penalised for not being the reference.
 *
 * Rounding the BURDEN into whole physical scale steps fixes that. Ordinary
 * human variation sits well under half a step and costs nothing; a genuinely
 * large creature crosses into whole steps and pays for them.
 *
 * round rather than truncate, because truncating opens the opposite hole: a
 * 327 kg human and a 287 cm human both carry a raw burden just under 1.0 and
 * would pay nothing at all. The first step lands around 150 kg or 230 cm,
 * which is where it should.
 *
 *
 * WHY 0.50 AND 0.25
 *
 * A 2:1 weighting of size against mass, which for a PROPORTIONAL creature
 * collapses to 1.25 x log2(height ratio) — mass scales as the cube, so its
 * 0.25 contributes 0.75 and the two sum to 1.25 per doubling of height. Height
 * governs, and disproportionate mass still costs something on its own: a body
 * that is unusually heavy for its size is less agile than one that is not.
 *
 * The pair is calibrated so a proportional Scale-10 Giant lands on exactly 4
 * steps, taking a stored 10 to a resolved 6.
 *
 *
 * SMALL CREATURES
 *
 * The formula is symmetrical and deliberately not clamped at zero: something
 * smaller and lighter than the Standard Human receives a NEGATIVE burden and
 * therefore higher physical AGI and DEX. Ordinary Attribute bounds still apply
 * afterwards.
 */

import type { ResolvedBodyMeasurements } from "../body/measurements/types";


/*
 * The Basic Human Standard's own measurements. A body of exactly this size and
 * mass carries no burden at all — the reference defines the middle of the
 * scale rather than being placed on it by hand.
 */
export const REFERENCE_BODY_SIZE_L = 60;
export const REFERENCE_BODY_MASS_KG = 62;

export const SIZE_BURDEN_SENSITIVITY = 0.50;
export const MASS_BURDEN_SENSITIVITY = 0.25;


/*
 * Volume to linear ratio.
 *
 * Size is a volume, and volume goes as the cube of length, so a creature twice
 * as tall is eight times the size. Comparing that eight directly against a
 * mass ratio would double-count the same growth.
 */
export function resolveLinearSizeRatio(sizeL: number): number {
  return Math.cbrt(sizeL / REFERENCE_BODY_SIZE_L);
}


/*
 * The continuous burden, before quantization.
 *
 * Kept separate and exported because it is the number worth showing in a
 * trace: the steps alone cannot explain why a creature is one step down rather
 * than two.
 */
export function resolveRawPhysicalScaleBurden(
  sizeL: number,
  massKg: number,
): number {
  if (sizeL <= 0 || massKg <= 0) return 0;

  return (
    SIZE_BURDEN_SENSITIVITY * Math.log2(resolveLinearSizeRatio(sizeL)) +
    MASS_BURDEN_SENSITIVITY * Math.log2(massKg / REFERENCE_BODY_MASS_KG)
  );
}


/*
 * Whole physical scale steps. See the note above on why this rounds.
 */
export function resolvePhysicalScaleSteps(
  sizeL: number,
  massKg: number,
): number {
  return Math.round(resolveRawPhysicalScaleBurden(sizeL, massKg));
}


export interface PhysicalScaleBurden {
  readonly sizeL: number;
  readonly massKg: number;

  readonly linearSizeRatio: number;
  readonly rawBurden: number;
  readonly steps: number;
}


/*
 * Resolves the burden from a body's measurements.
 *
 * Takes the FORM measurements, never the present ones. Losing an Arm makes a
 * character lighter, and reading present mass here would make amputation
 * increase agility — the same class of bug as amputation increasing Strength,
 * and ruled out at the point of use rather than corrected downstream.
 */
export function resolvePhysicalScaleBurden(
  formMeasurements: ResolvedBodyMeasurements,
): PhysicalScaleBurden {
  const sizeL = formMeasurements.totalSizeL;
  const massKg = formMeasurements.totalMassKg;

  return {
    sizeL,
    massKg,
    linearSizeRatio: resolveLinearSizeRatio(sizeL),
    rawBurden: resolveRawPhysicalScaleBurden(sizeL, massKg),
    steps: resolvePhysicalScaleSteps(sizeL, massKg),
  };
}


/*
 * The physical base of one Attribute.
 *
 * Applied to AGI and DEX only. Nothing else in the ladder is a statement about
 * how a body moves.
 */
export function applyPhysicalScaleSteps(
  storedScore: number,
  steps: number,
): number {
  return storedScore - steps;
}
