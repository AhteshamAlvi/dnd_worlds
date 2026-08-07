// resolveAuraDistribution(character, request) -> EngineResult<...>
//
// Takes an Aura Output and a set of requested per-region concentrations,
// returns every region's aura, density, soak, requested % and effective %.
// Requested-vs-effective is part of the return type, not a display concern.
//
// Open design question this function has to settle: the rulebook's five-step
// Gyo calculation is defined for a single concentration target and does not
// compose across multiple regions (each region's donor pool includes the
// others, so independent evaluation creates aura from nothing). Whatever rule
// is chosen here needs a decision-log entry.

export {};
