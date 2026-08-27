/*
 * Surface Unit constants.
 * Source: Rulebook "03 Aura Engine/Aura Density and Concentration.md".
 *
 * SU is the denominator of every aura density calculation. The per-region
 * table in the Rulebook sums to 101 while the text and every worked example
 * divide by 100; the engine uses 100 and records that in the decision log
 * rather than editing the Rulebook.
 *
 * The Surface Unit architecture itself has otherwise been removed — Body no
 * longer carries a surfaceUnits field (see character/foundation/body/types.ts).
 * This constant survives as a standalone, explicitly temporary placeholder so
 * aura/distribution.ts keeps compiling and its existing tests keep passing,
 * pending a dedicated follow-up ticket that redesigns Aura density around the
 * new Body/Body-Points model. Do not build new functionality on top of this
 * number, and do not read it as meaningful body-scale data — it is
 * scaffolding, kept only for that ticket to replace.
 */

// Total surface area of a standard adult human body, in Surface Units.
export const STANDARD_BODY_SURFACE_UNITS = 100 as const;
