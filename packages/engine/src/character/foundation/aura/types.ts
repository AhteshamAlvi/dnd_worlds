/*
 * The Aura domain's value shapes.
 *
 * The split this file exists to hold open is STORED versus RESOLVED. Only two
 * things about a character's Aura cannot be recomputed — how much Aura they
 * have right now, and where they have deliberately put it — and those live in
 * CharacterAuraState (state.ts). Everything here is derived: maximum, output,
 * regeneration, control, access and density all fall out of Attributes, Body
 * and Nen state, and storing any of them would be storing a number that can
 * disagree with the character it came from.
 *
 * PLACEMENT is the other distinction, and it is a physical one. Aura inside a
 * body occupies its VOLUME; Aura on a body occupies its SURFACE AREA. Those
 * are different Body measurements with different units and different Scale
 * exponents, so they cannot share a density type without one of them lying —
 * which is exactly what the previous "Surface Units" placeholder did, by
 * having neither.
 */

import type { BodyPartId, ContinuityKey } from "../body/anatomy/types";


/* ── Placement and coverage ─────────────────────────────────────────────── */

/*
 * Where Aura physically sits.
 *
 *   internal  through the body's volume — reinforcement, Chū, Ryū inward
 *   surface   across the body's skin    — Ten, Ren, Ken
 *
 * Not a mode the character is "in". A character running whole-body Ten while
 * reinforcing one fist has Aura in both placements at once, which is why
 * allocations are records rather than a single selected distribution.
 */
export const AURA_PLACEMENTS = ["internal", "surface"] as const;

export type AuraPlacement = typeof AURA_PLACEMENTS[number];

/*
 * How much of the body one allocation covers.
 *
 *   whole-body  every present part, proportionally
 *   localized   one continuity identity
 */
export const AURA_COVERAGES = ["whole-body", "localized"] as const;

export type AuraCoverage = typeof AURA_COVERAGES[number];


/* ── Density ────────────────────────────────────────────────────────────── */

/*
 * Body is authoritative in square centimetres, and Aura is the only consumer
 * that wants square metres. The conversion therefore happens exactly once, in
 * resolveSurfaceAuraDensity, rather than being a second stored figure on the
 * measurement that could drift from the first.
 */
export const SQUARE_CENTIMETRES_PER_SQUARE_METRE = 10_000;

/** Aura per litre of covered body volume. */
export interface InternalAuraDensity {
  readonly placement: "internal";
  readonly auraPerLiter: number;
}

/** Aura per square metre of covered body surface. */
export interface SurfaceAuraDensity {
  readonly placement: "surface";
  readonly auraPerSquareMeter: number;
}

/*
 * Discriminated on placement rather than carrying both numbers with one unset.
 * "12 per litre" and "12 per square metre" are not comparable quantities, and a
 * single shape invites code that adds them.
 */
export type AuraDensity = InternalAuraDensity | SurfaceAuraDensity;


/* ── Pool, regeneration, control ────────────────────────────────────────── */

/*
 * A character's Aura reserve.
 *
 * `current` is stored. `maximum` is derived from CON and VIT, and
 * `depletionFraction` from the two — carried here rather than recomputed at
 * every call site that wants "how drained is this character", which is most of
 * the ones that will consume exhaustion.
 */
export interface AuraPool {
  readonly current: number;
  readonly maximum: number;

  /** 0 at full, 1 at empty. */
  readonly depletionFraction: number;
}

/** The body's maximum physiological Aura Output Capacity. */
export interface AuraOutputLimit {
  readonly maximum: number;
}

/*
 * The character's currently derived Aura Output capacities.
 *
 * `accessibleMaximum` is deliberately NOT called renAccessibleMaximum. Ren is
 * one principle that opens access; Zetsu closes it, awakening changes it, and
 * an unawakened character still leaks a physiological trickle. Naming the
 * general field after one principle made every other route look like a special
 * case. Ren's own resolver keeps `renAccessibleMaximum` for the figure that IS
 * specifically Ren's.
 */
export interface AuraOutput {
  /** Absolute CON-derived physiological ceiling. */
  readonly physiologicalMaximum: number;

  /** Portion of that ceiling currently reachable, whatever opened it. */
  readonly accessibleMaximum: number;

  /** Final usable Output after Current Aura is also considered. */
  readonly usableMaximum: number;
}

/** VIT-derived Aura restored per hour. */
export interface AuraRegenerationCapacity {
  readonly perHour: number;
}

/*
 * DEX-derived expenditure efficiency.
 *
 * `deliberateExpenditureAvailable` is false below the DEX floor: a character
 * that clumsy still HAS Aura and still loses it, they simply cannot spend it
 * on purpose. That is a different fact from having none.
 */
export interface AuraControl {
  readonly multiplier: number;
  readonly deliberateExpenditureAvailable: boolean;
}

/*
 * The resolved Aura cost of a specific expenditure.
 *
 * Not a stored character statistic. `finalCost` is deliberately unrounded so
 * fractional Aura survives continuous-time upkeep.
 */
export interface AuraExpenditure {
  readonly baseCost: number;
  readonly controlMultiplier: number;
  readonly finalCost: number;
}


/* ── Access ─────────────────────────────────────────────────────────────── */

/*
 * How open the character's Aura nodes are.
 *
 *   half-open  the ordinary human state: Aura leaks continuously and cannot
 *              be directed
 *   open       awakened: output is deliberate
 */
export const AURA_NODE_STATES = ["half-open", "open"] as const;

export type AuraNodeState = typeof AURA_NODE_STATES[number];

/*
 * What the character can actually do with their Output right now.
 *
 * Awakening gates DELIBERATE access, not possession. An unawakened character
 * has a pool, loses Current Aura, and receives involuntary internal
 * reinforcement — which is why `internalOutputMaximum` is meaningful while
 * `deliberateInternalAccess` is false. Reading "not awakened" as "no Aura" is
 * the mistake this shape is built to prevent.
 */
export interface ResolvedAuraAccess {
  readonly awakened: boolean;
  readonly nodeState: AuraNodeState;

  readonly physiologicalOutputMaximum: number;
  readonly internalOutputMaximum: number;
  readonly externalOutputMaximum: number;

  readonly deliberateInternalAccess: boolean;
  readonly deliberateExternalAccess: boolean;
}


/* ── Resolved distribution ──────────────────────────────────────────────── */

/*
 * One allocation as it actually landed on one BodyPart.
 *
 * A whole-body allocation expands into one of these PER COVERED PART, each
 * holding its proportional share, which is what makes "equal density
 * everywhere" a property of the arithmetic rather than a promise.
 *
 * Discriminated on placement so the covered measurement and its density always
 * agree about which one they are. There is no shape here that can hold litres
 * next to an aura-per-square-metre.
 */
export interface ResolvedInternalAuraAllocation {
  readonly allocationId: string;
  readonly placement: "internal";
  readonly coverage: AuraCoverage;
  readonly continuityKey: ContinuityKey;
  readonly partId: BodyPartId;
  readonly aura: number;
  readonly coveredVolumeL: number;
  readonly density: InternalAuraDensity;
}

export interface ResolvedSurfaceAuraAllocation {
  readonly allocationId: string;
  readonly placement: "surface";
  readonly coverage: AuraCoverage;
  readonly continuityKey: ContinuityKey;
  readonly partId: BodyPartId;
  readonly aura: number;
  readonly coveredSurfaceAreaCm2: number;
  readonly density: SurfaceAuraDensity;
}

export type ResolvedAuraAllocation =
  | ResolvedInternalAuraAllocation
  | ResolvedSurfaceAuraAllocation;

/*
 * Where the character's active Aura currently is.
 *
 * `unallocatedOutput` is Output the character has available and has not placed
 * anywhere — including Aura freed when an allocation's continuity identity
 * stopped being manifested. Dropping such an allocation returns its Aura here;
 * it never touches Current Aura, because losing a limb does not drain you.
 */
export interface ResolvedAuraDistribution {
  readonly activeAura: number;
  readonly unallocatedOutput: number;
  readonly allocations: readonly ResolvedAuraAllocation[];
}


/* ── The whole resolved profile ─────────────────────────────────────────── */

/*
 * Everything derived about a character's Aura, in one place.
 *
 * ResolvedCharacter.aura will hold one of these. The resolver that populates
 * it is the next Aura ticket's work; this file settles what it has to produce.
 */
export interface ResolvedAuraProfile {
  readonly pool: AuraPool;
  readonly output: AuraOutput;
  readonly regeneration: AuraRegenerationCapacity;
  readonly control: AuraControl;
  readonly access: ResolvedAuraAccess;
  readonly distribution: ResolvedAuraDistribution;
}
