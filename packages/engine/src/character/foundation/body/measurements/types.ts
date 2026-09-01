/*
 * Resolved physical measurements — what a body actually is, in real units.
 *
 * Everything here is derived. Nothing in this folder is persistent state: a
 * character stores anatomy, scale and morphology, and these numbers fall out
 * of that combination. That is the whole point of the measurement subsystem —
 * a stored height and a resolved height are two sources that can disagree, and
 * one of them is always the wrong one to trust.
 *
 * Units are the real ones throughout:
 *
 *   Length  centimetres
 *   Size    litres (1 L = 1 dm3)
 *   Mass    kilograms
 *
 * Real units are not decoration. A body that reports 165 cm and 62 kg can be
 * checked against reality, and a Giant that reports 16.5 m and 62 tonnes can
 * be checked against its own arithmetic. Abstract "size points" hide the
 * mistake that real units surface immediately.
 */

import type { BodyPartId } from "../anatomy/types";


/*
 * One BodyPart's resolved physical measurements.
 *
 * `lengthCm` is the part's own longitudinal extent — hip to ankle for a Leg,
 * ankle to toe for a Foot — and not its contribution to Height. Those are
 * different numbers, and the second is derived from the first by way of the
 * part's height contribution and the body's geometry. A Human Foot is 25 cm
 * long and 7 cm tall.
 */
export interface ResolvedPartMeasurements {
  readonly partId: BodyPartId;

  readonly lengthCm: number;
  readonly sizeL: number;
  readonly massKg: number;

  /*
   * The factors that produced those three numbers, retained rather than
   * discarded.
   *
   * A resolved measurement is otherwise unexplainable: "this Arm weighs 3.1 kg"
   * is a fact nobody can argue with and nobody can debug. Keeping the factors
   * is what lets a trace answer the question this subsystem is most often
   * asked — why did a Trait change Mass but not Size? — by showing that it
   * moved massComposition and left effectiveBulk and adipositySize alone.
   *
   * `preAdiposityVolumeL` is the part's volume before fat is added: everything
   * Scale, Length and Bulk make it. Both the size factor and the adiposity
   * mass delta are taken against it, which is what keeps the litres that
   * appear in Size and the litres that are weighed into Mass the same litres.
   */
  readonly lengthFactor: number;
  readonly effectiveBulk: number;
  readonly adipositySizeFactor: number;
  readonly massCompositionFactor: number;

  readonly preAdiposityVolumeL: number;
  readonly adiposityVolumeDeltaL: number;
  readonly adiposityMassDeltaKg: number;
}


/*
 * The whole body's resolved physical measurements.
 *
 * `parts` carries only the parts that physically contributed. A suppressed or
 * archived-removed BodyPart is absent entirely rather than present with zeroes,
 * because zero-valued anatomy and absent anatomy mean different things and the
 * distinction survives better as presence than as a magic number.
 *
 * Totals are sums over exactly those same parts, so they cannot drift out of
 * agreement with the per-part list.
 *
 * `heightCm` is deliberately not a sum. It is a vertical span measured through
 * the body's connection geometry — see height.ts for why summing is wrong.
 */
export interface ResolvedBodyMeasurements {
  readonly parts: readonly ResolvedPartMeasurements[];

  readonly byPartId: Readonly<Record<BodyPartId, ResolvedPartMeasurements>>;

  readonly totalSizeL: number;
  readonly totalMassKg: number;

  readonly heightCm: number;
}


/*
 * A body measured twice, because two different questions need two answers.
 *
 * FORM measures the current Reference Form as intact. It is what the body is
 * SUPPOSED to be, and it is what physical Attribute resolution reads — so that
 * losing an Arm cannot make a character lighter and therefore quicker. An
 * amputation that raised AGI would be the same class of bug as an amputation
 * that raised Strength.
 *
 * PRESENT measures the anatomy actually there, honouring suppression and
 * destruction. It is what a scale would read and what physical consequences
 * of missing anatomy are computed from.
 *
 * Both go through identical formulas. Only the anatomy source differs, which
 * is the same shape as the form/present split in Strength — and for the same
 * reason: what a body is and what has happened to it are separate facts.
 */
export interface ResolvedBodyMeasurementViews {
  readonly form: ResolvedBodyMeasurements;
  readonly present: ResolvedBodyMeasurements;
}
