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
