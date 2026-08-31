/*
 * The Human ordinary ranges.
 *
 * Engine-side Human content, alongside human-age-profile.ts, for the same
 * reason: the Basic Human Standard is the calibration every other Species is
 * authored against, so it lives in the engine rather than in a vault file a
 * world can quietly delete.
 *
 *
 * HEIGHT
 *
 * The low bound is a real clinical line. Dwarfism is conventionally defined as
 * an adult height of 4'10" or under, and that convention exists because it is
 * functional rather than merely statistical.
 *
 * The high bound has no equivalent. Medicine works in standard deviations:
 * +2 SD is "tall stature" and usually benign familial tallness, +3 SD is
 * "pathological tall stature" and worth investigating, and gigantism itself is
 * diagnosed on growth-hormone biochemistry rather than on any height at all.
 * Against this engine's 165 cm sex-pooled reference and a sex-pooled SD near
 * 9.5 cm, that puts +2 SD at 184 cm and +3 SD at 193 cm.
 *
 * 198 cm sits just past +3 SD: high enough that plenty of real people stand
 * there and no rule should call them impossible, low enough to still mean
 * something. It is the deliberate middle between the clinical threshold and
 * the 208 cm point where tallness is essentially always pathological.
 *
 *
 * MASS
 *
 * Anchored on the reference body's 62 kg at 165 cm, which is BMI 22.8, and
 * bounded where mass stops being build and starts being a diagnosis: roughly
 * BMI 16 below, where a body is severely underweight, and roughly BMI 36
 * above.
 *
 * Read these as build and not as weight. The Mass band's norm keeps this
 * body's own Scale, Length and Muscularity, so the ratio measures Bulk and
 * Adiposity alone. A 195 cm Human is heavier than 62 kg and still sits at
 * ratio 1, and so does a character who has bought their way to STR 13 and
 * weighs 105 kg. See stature/types.ts for why muscle is deliberately outside
 * this band.
 *
 *
 * WHAT THESE RESOLVE TO
 *
 *   dimension   ratio          adult Human      note
 *   height      0.89 - 1.20    146.9 - 198.0 cm  4'9.8" - 6'6.0"
 *   mass        0.70 - 1.60    43.4 - 99.2 kg    BMI 15.9 - 36.4 at 165 cm
 *
 * The same two ratios applied to a twelve-year-old give 130.7-176.2 cm, and
 * applied to a Scale-10 Giant give 14.69-19.80 m. That is the entire reason
 * the band is a ratio.
 */

import type { SpeciesStatureBands } from "./types";

export const HUMAN_STATURE_BANDS: SpeciesStatureBands = {
  height: {
    min: 0.89,
    max: 1.20,
  },

  mass: {
    min: 0.70,
    max: 1.60,
  },
};
