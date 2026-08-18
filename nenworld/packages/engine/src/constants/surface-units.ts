/*
 * Surface Unit constants.
 * Source: Rulebook "03 Aura Engine/Aura Density and Concentration.md".
 *
 * SU is the denominator of every aura density calculation. The per-region
 * table in the Rulebook sums to 101 while the text and every worked example
 * divide by 100; the engine uses 100 and records that in the decision log
 * rather than editing the Rulebook.
 */

// Total surface area of a standard adult human body, in Surface Units.
export const STANDARD_BODY_SURFACE_UNITS = 100 as const;
