/*
 * Effective Scale — how large this body is, all three contributions combined.
 *
 * Kept in its own file because Scale is not morphology and not a measurement.
 * Measurements, Structural Capacity, Strength and Body Points all need it, and
 * none of them owns it.
 */

/*
 * The three independent answers to "how big".
 *
 *   Species Standard Scale  how large a mature member of this kind is
 *   Age Scale               how far along its own growth this one is
 *   Character Scale         how large this individual is for its kind and age
 *
 * Keeping them apart is what lets a Giant child be a large Species early on
 * its curve rather than a strangely-sized Human, and what lets an unusually
 * big Human be Character Scale 1.1 without pretending to be another Species.
 *
 * Scale does not propagate uniformly across dimensions:
 *
 *   Length  proportional to  Scale
 *   Size    proportional to  Scale cubed
 *   Mass    proportional to  Scale cubed
 *   SC      proportional to  Scale squared
 *
 * Those exponents are geometry, not calibration. Doubling every linear
 * dimension multiplies volume by eight and cross-section by four, and it is
 * cross-section that carries force and resists destruction. This is the whole
 * reason a proportionally ordinary Giant is enormously strong without any
 * Species needing to author a Strength bonus.
 */
export function resolveEffectiveScale(
  speciesStandardScale: number,
  ageScale: number,
  characterScale: number,
): number {
  return speciesStandardScale * ageScale * characterScale;
}
