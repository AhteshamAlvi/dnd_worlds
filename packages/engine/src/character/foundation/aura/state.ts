/*
 * Stored Aura state — the only Aura facts a character sheet writes down.
 *
 * The test for membership is whether the number can be recomputed. Current
 * Aura cannot: it is the history of everything spent and recovered. Active
 * allocations cannot: they are what the character chose to do. Everything else
 * about Aura is derived and lives nowhere.
 *
 * NOT stored here, and each for the same reason — it follows from something
 * else that IS stored:
 *
 *   Maximum Aura           CON + VIT
 *   Output Capacity        CON, then access
 *   Regeneration Capacity  VIT
 *   Control multiplier     DEX
 *   Aura Density           allocation over Body measurements
 *   Body Volume, Surface   anatomy, Scale and morphology
 *
 * Nen state is a sibling rather than a parent. NenState does not own the pool
 * and does not gate generic Aura loss: an unawakened character possesses Aura,
 * can lose Current Aura, and receives passive internal reinforcement from 20%
 * of it — which costs no Output, because they have none to spend. Awakening
 * controls DELIBERATE access and externalization, which is a narrower claim
 * than "has Nen" and the reason the two are separate fields on Character.
 */

import type { ContinuityKey } from "../body/anatomy/types";
import type {
  AuraCommitmentShortfall,
  AuraCoverage,
  AuraDifferentialAuthorization,
  AuraDifferentialWeight,
  AuraPlacement,
} from "./types";
import { DEFAULT_AURA_COMMITMENT_PRIORITY } from "./types";


/*
 * What every stored allocation carries besides its amount and its target.
 *
 * All optional, and that is a compatibility decision rather than an oversight.
 * There is no versioned Aura loader in this engine — `CharacterAuraState` is
 * held on Character and passed around in memory — so old state reaches the new
 * rules as a plain object missing these fields. Making them optional with
 * documented defaults means such an allocation resolves to exactly what it
 * resolved to before, instead of needing a migration API with nothing real to
 * migrate.
 *
 * `source` is provenance, not mechanism: which activity, item or effect asked
 * for this placement. Aura does not interpret it — an id it cannot parse is
 * still an id it can report — but without it a resolved ledger cannot say WHY
 * a character is holding 200 Aura on their forearm, and a lifecycle that ends
 * cannot find the commitments it should release.
 */
export interface AuraAllocationMetadata {
  /**
   * Which commitments survive when the Output budget shrinks. Higher first.
   *
   * Absent means `DEFAULT_AURA_COMMITMENT_PRIORITY`. Equal priorities break on
   * the allocation id, never on array order.
   */
  readonly priority?: number;

  /** Reduce to fit, or release whole. Absent means reduce with no floor. */
  readonly shortfall?: AuraCommitmentShortfall;

  /** What asked for this placement. Opaque to Aura. */
  readonly source?: string;
}


/*
 * Aura placed across the whole body, distributed proportionally.
 *
 * Proportional to present VOLUME for internal placement and present SURFACE
 * AREA for surface placement, which is what makes the resulting density equal
 * across every covered part instead of merely equal per part.
 */
export interface WholeBodyAuraAllocation extends AuraAllocationMetadata {
  readonly id: string;
  readonly coverage: "whole-body";
  readonly placement: AuraPlacement;
  readonly aura: number;
}

/*
 * Aura placed on one anatomical identity.
 *
 * Targets a ContinuityKey, never a BodyPartId. A BodyPartId names the instance
 * standing in that position right now, so a transformation or a regeneration
 * would silently orphan every allocation aimed at one. The identity is what
 * the character was reinforcing — "my right arm" — and it survives the arm
 * being a Dragon's foreleg for the next three rounds.
 *
 * Enlarging or shrinking that part keeps the Aura and changes the density,
 * which is the physically honest outcome: the same Aura spread over more body.
 */
export interface LocalizedAuraAllocation extends AuraAllocationMetadata {
  readonly id: string;
  readonly coverage: "localized";
  readonly placement: AuraPlacement;
  readonly continuityKey: ContinuityKey;
  readonly aura: number;
}

/*
 * Aura placed UNEVENLY across several identities.
 *
 * The shape that says out loud what a weighted placement is. `whole-body`
 * cannot express it — that coverage means equal density over the complete
 * eligible domain, and a version of it carrying weights or gaps would be this
 * allocation wearing a name that hides it.
 *
 * The authorization is mandatory and is checked against THIS allocation, this
 * source and this owner. Uneven Aura is the raw material of the advanced
 * applications, so a generic path that took weights on trust would hand every
 * caller those applications without the mastery or gate meant to grant them.
 *
 * What it is NOT is any particular application. Aura resolves weights into
 * placed Aura and density and stops; which mastery earns a grant, and what an
 * uneven distribution then DOES, belong to the mechanics that own those rules.
 */
export interface DifferentialAuraAllocation extends AuraAllocationMetadata {
  readonly id: string;
  readonly coverage: "differential";
  readonly placement: AuraPlacement;

  /** At least one, each finite and non-negative, totalling more than zero. */
  readonly weights: readonly AuraDifferentialWeight[];

  readonly aura: number;

  /** Required. An unauthorized weighted placement is refused, not ignored. */
  readonly authorization: AuraDifferentialAuthorization;
}

/*
 * Records rather than one mutually exclusive distribution mode.
 *
 * Whole-body surface Ten and a localized internal Chū in one fist are
 * simultaneously true of the same character, and a single "current
 * distribution" field cannot say so. Multiple allocations may target the same
 * part, including one in each placement.
 */
export type AuraAllocation =
  | WholeBodyAuraAllocation
  | LocalizedAuraAllocation
  | DifferentialAuraAllocation;

/*
 * A character's stored Aura.
 *
 * Removing an allocation never changes `current`. Aura that was placed is
 * still the character's Aura; where it sits is a separate fact from how much
 * of it there is.
 */
export interface CharacterAuraState {
  readonly current: number;
  readonly allocations: readonly AuraAllocation[];
}

/** What a character with no Aura activity stores. */
export function emptyAuraState(current = 0): CharacterAuraState {
  return { current, allocations: [] };
}

export function isWholeBodyAllocation(
  allocation: AuraAllocation,
): allocation is WholeBodyAuraAllocation {
  return allocation.coverage === "whole-body";
}

export function isLocalizedAllocation(
  allocation: AuraAllocation,
): allocation is LocalizedAuraAllocation {
  return allocation.coverage === "localized";
}

export function isDifferentialAllocation(
  allocation: AuraAllocation,
): allocation is DifferentialAuraAllocation {
  return allocation.coverage === "differential";
}

/** Total Aura the character has committed, across every allocation. */
export function totalAllocatedAura(
  allocations: readonly AuraAllocation[],
): number {
  return allocations.reduce((total, allocation) => total + allocation.aura, 0);
}

/**
 * The priority a commitment settles at, stated or defaulted.
 *
 * A function rather than a `?? 0` at each site so that the default is one
 * decision in one place: three call sites each defaulting independently is
 * three chances for one of them to pick a different number.
 */
export function allocationPriority(allocation: AuraAllocation): number {
  return allocation.priority ?? DEFAULT_AURA_COMMITMENT_PRIORITY;
}


export function allocationsForPlacement(
  allocations: readonly AuraAllocation[],
  placement: AuraPlacement,
): readonly AuraAllocation[] {
  return allocations.filter(
    (allocation) => allocation.placement === placement,
  );
}

export function allocationsWithCoverage(
  allocations: readonly AuraAllocation[],
  coverage: AuraCoverage,
): readonly AuraAllocation[] {
  return allocations.filter(
    (allocation) => allocation.coverage === coverage,
  );
}
