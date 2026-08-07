// Decision log: id -> { question, chosen, rationale, ruleSource }.
//
// The rulebook is frozen, so every place the engine resolves an ambiguity or
// contradiction gets an entry here and a `decision` id on the emitted
// TraceNode. That keeps the engine's divergence from the book visible in the
// workbench without editing the book.
//
// Known entries to write: rank scale (I-V vs I-X), body SU total (100 vs 101),
// multi-region aura composition.

export {};
