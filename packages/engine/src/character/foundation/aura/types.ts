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
/*
 * state.ts imports the placement and coverage vocabulary from here, and this
 * needs the stored allocation shape to describe what happened TO one. Both
 * directions are `import type` and are erased, so there is no runtime cycle —
 * only the honest fact that "a stored allocation" and "what became of it" are
 * two halves of one idea.
 */
import type { AuraAllocation } from "./state";
import type { WakefulnessMode } from "../body/endurance/types";


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
 * one principle that opens access; Zetsu closes it, and the default Ten state
 * opens 5% of it. Naming the general field after one principle made every
 * other route look like a special case. Ren's own resolver keeps
 * `renAccessibleMaximum` for the figure that IS specifically Ren's.
 *
 * All three figures are ZERO for an unawakened character, whose nodes cannot
 * project Aura at all. What such a body does receive is passive internal
 * reinforcement drawn from Current Aura, which is not Output and is reported
 * separately — see ResolvedPassiveInternalAura.
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
 * One number, and deliberately only one. There is no availability flag here:
 * whether a character may spend Aura on purpose is decided by their access
 * state and by the application's own requirements, and a cost multiplier that
 * also reported permission was two answers wearing one name — callers read the
 * flag as "can act" when it only ever meant "DEX is below 7".
 *
 * Defined for every non-negative integer DEX, with no upper bound. See
 * control.ts for the two curves and why they round differently.
 */
export interface AuraControl {
  readonly multiplier: number;
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
 * Which ordinary Aura-access state a character is in.
 *
 * A CLOSED set, and closed on purpose. The Aura resolver must never branch on
 * the name of a Nen principle — it would have to grow a new branch for every
 * principle that touches Output, and each one would be a second place the
 * access rules live. It reads the resolved fractions and permissions below
 * instead, and this discriminant exists for provenance and for a sheet that
 * wants to say WHICH state produced them.
 *
 *   unawakened   half-open nodes; no deliberate access; passive pseudo-Chu
 *   uncontained  awakened with no Ten; nodes open, nothing contained
 *   ten          awakened with Ten; the default state once Ten is learned
 *   override     an explicit typed override from a later principle resolver
 */
export const AURA_ACCESS_STATES = [
  "unawakened",
  "uncontained",
  "ten",
  "override",
] as const;

export type AuraAccessState = typeof AURA_ACCESS_STATES[number];


/*
 * Passive internal reinforcement an unawakened body produces on its own.
 *
 * NOT Output. Half-open nodes do not project Aura deliberately; they hold a
 * fraction of the reserve inside the body as a matter of physiology, which is
 * why this bypasses the Output budget entirely and why `efficiency` is a
 * conversion rate against CURRENT AURA rather than a share of anything.
 */
export interface PassiveInternalReinforcement {
  readonly source: "unawakened-pseudo-chu";

  /** Fraction of Current Aura that becomes effective internal Aura. */
  readonly efficiency: 0.20;
}


/*
 * A whole-body surface coating the character's default state applies without
 * being asked for.
 *
 * Ten is the one that exists today. It is described as a FRACTION OF
 * PHYSIOLOGICAL OUTPUT rather than as a principle so the resolver can apply it
 * without knowing what produced it.
 */
export interface AutomaticSurfaceCoating {
  readonly source: "baseline-ten";

  /** Share of physiological Output the coating draws. */
  readonly outputFraction: number;
}


/*
 * An explicit, typed replacement for the baseline access state.
 *
 * Later principle resolvers supply one of these; none of them are implemented
 * here. The union is closed so that adding a principle is a decision made in
 * this file, in view of every other access route, rather than a new string
 * appearing at a call site.
 *
 *   output-access    Ren and anything else that opens a share of Output
 *   suppressed       Zetsu and anything else that closes Output and Ten
 *   internal-access  Chu and anything else that permits internal placement
 *   explicit         everything else, with every field stated outright
 *
 * `source` is a provenance label. Nothing branches on it.
 */
export interface AuraOutputAccessOverride {
  readonly kind: "output-access";
  readonly source: string;

  /** 0 through 1. Ren I-X supply 0.10 through 1.00. */
  readonly accessFraction: number;
}

export interface AuraSuppressedAccessOverride {
  readonly kind: "suppressed";
  readonly source: string;
}

export interface AuraInternalAccessOverride {
  readonly kind: "internal-access";
  readonly source: string;
  readonly accessFraction: number;
}

export interface AuraExplicitAccessOverride {
  readonly kind: "explicit";
  readonly source: string;
  readonly accessFraction: number;
  readonly deliberateInternalAccess: boolean;
  readonly deliberateExternalAccess: boolean;
  readonly automaticSurfaceCoating: boolean;

  /** Whether Aura escapes continuously. Defaults to false when omitted. */
  readonly uncontained?: boolean;
}

export type AuraAccessOverride =
  | AuraOutputAccessOverride
  | AuraSuppressedAccessOverride
  | AuraInternalAccessOverride
  | AuraExplicitAccessOverride;


/*
 * What the Aura resolver is told about access, before it resolves any of it.
 *
 * `effectiveTenMastery` is mastery AFTER seals, and it is consulted for one
 * thing only: whether Ten is available at all. Ten's own scaling, upkeep,
 * containment efficiency and density limits are Ten's file's business, not
 * this one's — a resolver that read the rank for anything else would be a
 * second implementation of Ten.
 */
export interface AuraAccessInput {
  readonly awakened: boolean;

  /** 0 for not learned; I-X once it is. Seals already applied. */
  readonly effectiveTenMastery: number;

  readonly override?: AuraAccessOverride;
}


/*
 * What the character can actually do with their Aura right now.
 *
 * Awakening gates DELIBERATE access, not possession. An unawakened character
 * has a pool, loses Current Aura, and receives passive internal reinforcement
 * — which is why `passiveInternalReinforcement` is populated while both
 * deliberate-access flags are false. Reading "not awakened" as "no Aura" is
 * the mistake this shape is built to prevent.
 *
 * Output figures deliberately do NOT live here. AuraOutput owns the
 * physiological, accessible and usable numbers; access owns the FRACTION and
 * the permissions that produced them. Carrying both would be two producers for
 * one figure.
 */
export interface ResolvedAuraAccess {
  readonly state: AuraAccessState;

  /** Provenance for a sheet or trace. Nothing branches on it. */
  readonly source: string;

  readonly awakened: boolean;
  readonly nodeState: AuraNodeState;

  /** Share of physiological Output currently reachable, 0 through 1. */
  readonly accessFraction: number;

  readonly deliberateInternalAccess: boolean;
  readonly deliberateExternalAccess: boolean;

  readonly automaticSurfaceCoating: AutomaticSurfaceCoating | null;
  readonly passiveInternalReinforcement: PassiveInternalReinforcement | null;

  /*
   * Aura is escaping and reinforcing nothing.
   *
   * A flag rather than something inferred from the absence of a coating,
   * because those are different conditions and only one of them bleeds. A
   * character under Chu has no surface coating and is containing their Aura
   * internally; a character in Zetsu has no coating and has closed the nodes
   * entirely. Only the awakened character who never learned Ten is standing
   * there leaking, and this is what says so — so the time transition can drain
   * them without asking which principle is or is not running.
   */
  readonly uncontained: boolean;
}


/* ── Resolved distribution ──────────────────────────────────────────────── */

/*
 * Why one allocation produced nothing.
 *
 *   identity-not-manifested  no present BodyPart stands in that continuity
 *                            identity — the arm is severed, suppressed, or
 *                            simply not part of the current form
 *   no-measurable-body       the anatomy is there but has none of the
 *                            measurement this placement needs, which is an
 *                            internal organ asked to carry surface Aura
 *
 * Neither is an error. A character who lost the arm they were reinforcing has
 * a perfectly valid distribution; they are no longer reinforcing it, the Aura
 * returns to unallocated Output, and Current Aura is untouched.
 */
export type DroppedAuraAllocationReason =
  | "identity-not-manifested"
  | "no-measurable-body";

export interface DroppedAuraAllocation {
  readonly allocationId: string;
  readonly reason: DroppedAuraAllocationReason;
  readonly aura: number;
}


/*
 * Where one resolved contribution came from.
 *
 * Provenance rather than mechanism. Baseline Ten is DERIVED state, recomputed
 * from Output on every resolution and never written into the stored
 * allocations — so once it is standing next to a stored allocation on the same
 * Body Part, this is the only thing distinguishing it, and a caller that
 * cannot tell them apart would happily persist the automatic one.
 */
export const AURA_ALLOCATION_SOURCES = [
  "stored",
  "baseline-ten",
  "unawakened-pseudo-chu",
] as const;

export type AuraAllocationSource = typeof AURA_ALLOCATION_SOURCES[number];


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
  readonly source: AuraAllocationSource;
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
  readonly source: AuraAllocationSource;
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


/* ── Passive internal Aura ──────────────────────────────────────────────── */

/*
 * The whole-body internal Aura an unawakened character carries without
 * spending anything.
 *
 * Kept apart from ResolvedAuraDistribution because it is not Output and does
 * not compete for it. Folding it in would make an unawakened character look
 * like they were spending 20% of a capacity they cannot reach, and would put
 * a number in `activeAura` that no expenditure produced.
 *
 * `sourceAura` is Current Aura; `effectiveAura` is what the 20% conversion
 * makes of it. Nothing is deducted — the reserve is not consumed, it is where
 * the reinforcement is drawn from continuously — so the pseudo-Chu weakens as
 * the character is drained and recovers as they are not.
 *
 * Final Chu and reinforcement STRENGTH are not calculated here. What is
 * exposed is exactly what that future resolver needs: the effective Aura, what
 * it covers, the Volume it covers, and the internal Density that results.
 */
export interface ResolvedPassiveInternalAura {
  readonly source: "unawakened-pseudo-chu";
  readonly efficiency: 0.20;
  readonly sourceAura: number;
  readonly effectiveAura: number;
  readonly allocations: readonly ResolvedInternalAuraAllocation[];
}


/* ── Aggregation by Body Part ───────────────────────────────────────────── */

/*
 * Every contribution to one Body Part in one placement, and their total.
 *
 * Contributions are PRESERVED rather than summed away. Baseline Ten and a
 * localized reinforcement on the same forearm are one aggregate Density to
 * anything asking how protected that forearm is, and two separate facts to
 * anything asking why — a Gyo observer reading the difference, a trace
 * explaining it, a transition removing one of them.
 *
 * Densities add within a placement because both are the same quantity over the
 * same denominator. They do NOT add across placements: Aura per litre and Aura
 * per square metre are different units, and the layer that decides how the two
 * interact is reinforcement, which is not this ticket's.
 */
export interface AggregatedInternalAura {
  readonly placement: "internal";
  readonly aura: number;
  readonly coveredVolumeL: number;
  readonly density: InternalAuraDensity;
  readonly contributions: readonly ResolvedInternalAuraAllocation[];
}

export interface AggregatedSurfaceAura {
  readonly placement: "surface";
  readonly aura: number;
  readonly coveredSurfaceAreaCm2: number;
  readonly density: SurfaceAuraDensity;
  readonly contributions: readonly ResolvedSurfaceAuraAllocation[];
}

/*
 * One Body Part's total Aura, in both placements.
 *
 * A null placement means nothing is there — not zero Aura at zero density.
 * A Part with no exposed skin cannot carry surface Aura at all, and reporting
 * that as 0 Aura/m2 would make it indistinguishable from a bare forearm nobody
 * has reinforced.
 */
export interface ResolvedBodyPartAura {
  readonly partId: BodyPartId;
  readonly continuityKey: ContinuityKey;

  readonly volumeL: number;
  readonly surfaceAreaCm2: number;

  readonly internal: AggregatedInternalAura | null;
  readonly surface: AggregatedSurfaceAura | null;
}


/* ── Recovery ───────────────────────────────────────────────────────────── */

/*
 * How the character is spending an interval, as recovery sees it.
 *
 * The BODY's vocabulary, aliased rather than re-declared. An hour is one kind
 * of hour: the same fact decides how much Aura comes back and whether sleep
 * debt is paid, and two parallel unions of the same three strings would let a
 * fourth mode be added to one of them and not the other.
 */
export { WAKEFULNESS_MODES as AURA_RECOVERY_MODES } from "../body/endurance/types";

export type AuraRecoveryMode = WakefulnessMode;

/*
 * Aura suppression, as recovery is told about it.
 *
 * Zetsu is what will supply this, and the shape is deliberately ignorant of
 * that: a source label for provenance, a resolved multiplier, and whether the
 * character chose it. Nothing branches on the label.
 */
export interface AuraSuppression {
  readonly source: string;

  /** The resolved multiplier. Zetsu I-X supply 1.0 through 5.0. */
  readonly multiplier: number;

  /** Forced suppression applies whatever the character is doing. */
  readonly forced: boolean;
}

export interface AuraRecoveryContext {
  readonly mode: AuraRecoveryMode;

  /** Absent when nothing is suppressing the character's Aura. */
  readonly suppression?: AuraSuppression;
}

/*
 * Where recovered Aura came from.
 *
 * A list rather than a single figure because a transition reports recovery BY
 * SOURCE, and natural regeneration will not be the only one for long — a Nen
 * ability, an item or a healer will each want to say what they put back.
 */
export const AURA_RECOVERY_SOURCES = ["natural-regeneration"] as const;

export type AuraRecoverySource = typeof AURA_RECOVERY_SOURCES[number];

export interface AuraRecoveryContribution {
  readonly source: AuraRecoverySource;

  /** Provenance for the multiplier: the mode, or the suppression's label. */
  readonly context: string;

  readonly ratePerHour: number;
  readonly multiplier: number;
  readonly hours: number;

  /** Before the missing-Aura cap. */
  readonly uncappedAmount: number;

  /** What was actually restored. */
  readonly amount: number;
}


/* ── The Aura balance ───────────────────────────────────────────────────── */

/*
 * Every way Current Aura moved, kept apart.
 *
 *   A' = clamp(A + recovery - physical - deliberate - upkeep - leakage
 *              - forcedDrain, 0, A_max)
 *
 * One equation, six named drains and one gain, and the reason they are not
 * collapsed into a single delta is that they answer different questions. "You
 * lost 40 Aura" is unactionable; "you lost 25 to a maximal swing, 12 to Ren
 * upkeep and 3 to leakage" tells a player what to stop doing. Every transition
 * carries one of these, and the ones that only move a single term carry it
 * with the rest at zero rather than omitting it.
 *
 * ALLOCATION IS NOT HERE, on purpose. Placing Aura through Output changes the
 * distribution and does not touch the reserve; a term for it would imply
 * otherwise.
 */
export interface AuraBalance {
  readonly recovery: number;
  readonly recoveryBySource: readonly AuraRecoveryContribution[];

  /** Bodily effort. Scaled by Stamina, never by Control. */
  readonly physical: number;

  /** Deliberate projection. Scaled by Control, never by Stamina. */
  readonly deliberate: number;

  /** Holding maintained effects open. Scaled by Control. */
  readonly upkeep: number;

  /** Involuntary loss from an uncontained state. Unscaled. */
  readonly leakage: number;

  /** Everything taken from the character by something else. Unscaled. */
  readonly forcedDrain: number;

  /** recovery minus every drain, before clamping. */
  readonly net: number;
}

/** A balance in which nothing happened. */
export function emptyAuraBalance(): AuraBalance {
  return {
    recovery: 0,
    recoveryBySource: [],
    physical: 0,
    deliberate: 0,
    upkeep: 0,
    leakage: 0,
    forcedDrain: 0,
    net: 0,
  };
}


/* ── What became of an allocation ───────────────────────────────────────── */

/*
 * One stored allocation's fate, whether at the hands of a caller or of the
 * engine.
 *
 * A CLOSED union, because "what happened to my Ten" has a small fixed set of
 * true answers and every consumer has to be able to handle all of them. A bare
 * before/after pair cannot tell an allocation the caller removed from one the
 * engine dropped because the arm is gone, and those two need very different
 * things said about them in a log, a trace, or on a sheet.
 *
 * Shared by resolution and by the transition operations rather than written
 * twice. Resolution reports the reductions and removals it had to make to fit
 * the stored allocations onto the present body; a transition reports those
 * plus what the caller asked for. One vocabulary, so a sheet renders both the
 * same way.
 */
export type AuraAllocationChange =
  | {
    readonly kind: "added";
    readonly allocationId: string;
    readonly allocation: AuraAllocation;
  }
  | {
    readonly kind: "replaced";
    readonly allocationId: string;
    readonly previous: AuraAllocation;
    readonly allocation: AuraAllocation;
  }
  | {
    readonly kind: "removed";
    readonly allocationId: string;
    readonly previous: AuraAllocation;
  }
  | {
    /* Dropped by the engine, not by the caller: the anatomy is not there. */
    readonly kind: "removed-not-manifested";
    readonly allocationId: string;
    readonly previous: AuraAllocation;
    readonly reason: DroppedAuraAllocationReason;
  }
  | {
    /*
     * Dropped because the character's access state does not permit Aura in
     * that placement — most often an internal allocation on an awakened
     * character, whose internal Density is zero until something grants it.
     */
    readonly kind: "removed-not-permitted";
    readonly allocationId: string;
    readonly previous: AuraAllocation;
    readonly placement: AuraPlacement;
  }
  | {
    /* Scaled down to fit a budget that shrank underneath it. */
    readonly kind: "reduced";
    readonly allocationId: string;
    readonly previous: AuraAllocation;
    readonly allocation: AuraAllocation;
    readonly factor: number;
  }
  | {
    readonly kind: "unchanged";
    readonly allocationId: string;
    readonly allocation: AuraAllocation;
  };


/* ── The whole resolved profile ─────────────────────────────────────────── */

/*
 * Everything derived about a character's Aura, in one place.
 *
 * ResolvedCharacter.aura holds one of these, produced by exactly one resolver
 * — see resolution.ts.
 *
 * The three Output figures are three different questions and a sheet needs all
 * three:
 *
 *   physiologicalMaximum  what the body can produce      (CON alone)
 *   accessibleMaximum     what the character can reach   (x access fraction)
 *   usableMaximum         what they can actually use now (capped by reserve)
 */
export interface ResolvedAuraProfile {
  readonly pool: AuraPool;
  readonly output: AuraOutput;
  readonly regeneration: AuraRegenerationCapacity;
  readonly control: AuraControl;
  readonly access: ResolvedAuraAccess;

  /** Output-denominated placement: stored allocations plus baseline Ten. */
  readonly distribution: ResolvedAuraDistribution;

  /*
   * Passive unawakened internal reinforcement, or null.
   *
   * Null the moment a character awakens. An awakened body's internal Density
   * is zero unless an access override explicitly permits internal placement:
   * open nodes stop producing the passive effect, and nothing replaces it
   * until the character learns to put Aura inside themselves on purpose.
   */
  readonly passiveInternal: ResolvedPassiveInternalAura | null;

  /*
   * Every present Body Part's aggregate Aura and Density, both placements.
   *
   * The union of everything physically there: stored allocations, the
   * automatic Ten coating, and passive pseudo-Chu. Wider than `distribution`
   * on purpose — distribution answers "what is this character spending", and
   * this answers "what is actually on and in this body", and pseudo-Chu is the
   * case where those two differ.
   */
  readonly byBodyPart: readonly ResolvedBodyPartAura[];

  /*
   * What the resolver had to do to the stored allocations to fit them onto the
   * body and the budget that are actually there. Empty when it did nothing.
   *
   * Resolution RECONCILES rather than refuses, and this is what makes that
   * honest. A character whose arm was severed, who has been drained below what
   * they had committed, or who is not awakened and cannot direct Aura at all,
   * still resolves — a sheet has to be able to show a character who is halfway
   * to legal, and refusing would mean showing nothing. What it must not do is
   * quietly report a distribution that disagrees with the stored state, so
   * every removal and every reduction is listed here.
   *
   * The stored allocations are NOT modified. They are still on the character,
   * waiting for the anatomy, the Aura or the access to come back;
   * reconcileAuraState is what writes the reconciliation down.
   */
  readonly adjustments: readonly AuraAllocationChange[];
}
