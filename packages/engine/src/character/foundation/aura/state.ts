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
 * can lose Current Aura, and receives involuntary internal reinforcement.
 * Awakening controls DELIBERATE access and externalization, which is a
 * narrower claim than "has Nen" and the reason the two are separate fields on
 * Character.
 */

import type { ContinuityKey } from "../body/anatomy/types";
import type { AuraCoverage, AuraPlacement } from "./types";


/*
 * Aura placed across the whole body, distributed proportionally.
 *
 * Proportional to present VOLUME for internal placement and present SURFACE
 * AREA for surface placement, which is what makes the resulting density equal
 * across every covered part instead of merely equal per part.
 */
export interface WholeBodyAuraAllocation {
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
export interface LocalizedAuraAllocation {
  readonly id: string;
  readonly coverage: "localized";
  readonly placement: AuraPlacement;
  readonly continuityKey: ContinuityKey;
  readonly aura: number;
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
  | LocalizedAuraAllocation;

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

/** Total Aura the character has committed, across every allocation. */
export function totalAllocatedAura(
  allocations: readonly AuraAllocation[],
): number {
  return allocations.reduce((total, allocation) => total + allocation.aura, 0);
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
