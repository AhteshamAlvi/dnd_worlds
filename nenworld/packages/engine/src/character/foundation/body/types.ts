/*
 * The physical body represented by the rules engine.
 *
 * For the initial implementation the engine treats the whole body as a
 * single 100-SU unit. Regional subdivision comes later, and the per-race
 * question later still.
 */

// Total physical surface area of the body, measured in Surface Units.
export interface Body {
  readonly surfaceUnits: 100;
}
