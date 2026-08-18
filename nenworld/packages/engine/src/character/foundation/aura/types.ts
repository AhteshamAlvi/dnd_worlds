/*
 * Core Aura-domain value shapes.
 *
 * AuraPool represents stored Aura.
 *
 * AuraOutput represents the character's currently derived Aura Output
 * capacities. Output is not manually set.
 *
 * AuraOutputLimit represents the body's physiological Output ceiling before
 * Ren access and Current Aura are applied.
 *
 * AuraExpenditure represents the resolved cost of an Aura application after
 * DEX-derived Control has been applied.
 *
 * Distribution and density describe where actively used Aura is physically
 * located across the body.
 */


// A character's stored Aura reserve.
export interface AuraPool {
  readonly current: number;
  readonly maximum: number;
}


// The body's maximum physiological Aura Output Capacity.
export interface AuraOutputLimit {
  readonly maximum: number;
}


// The character's currently derived Aura Output capacities.
export interface AuraOutput {
  // Absolute CON-derived physiological ceiling.
  readonly physiologicalMaximum: number;

  // Portion of the physiological ceiling currently accessible through Ren.
  readonly renAccessibleMaximum: number;

  // Final usable Output after Current Aura is also considered.
  readonly usableMaximum: number;
}


// The resolved Aura cost of a specific expenditure.
//
// This is not a stored character statistic.
//
// baseCost:
//   The Aura the action fundamentally requires before Control.
//
// controlMultiplier:
//   The DEX-derived cost multiplier, rounded to 2 significant figures.
//
// finalCost:
//   The actual amount deducted from Current Aura.
//
//   finalCost is intentionally not rounded so fractional Aura can be
//   preserved internally.
export interface AuraExpenditure {
  readonly baseCost: number;
  readonly controlMultiplier: number;
  readonly finalCost: number;
}


// Aura placed across a physical surface.
export interface AuraDistribution {
  readonly aura: number;
  readonly surfaceUnits: number;
}


// Aura concentration over one Surface Unit.
export interface AuraDensity {
  readonly auraPerSurfaceUnit: number;
}