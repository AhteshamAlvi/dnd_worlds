/*
 * Placing stored allocations onto the body that is actually there.
 *
 * Two things happen here, and they are the two the stored shape cannot answer
 * on its own:
 *
 *   1. A LOCALIZED allocation names a ContinuityKey. Which BodyPart is
 *      standing in that identity right now — and whether one is — is a fact
 *      about present anatomy, not about the allocation.
 *
 *   2. A WHOLE-BODY allocation names no part at all. It expands into one
 *      resolved allocation per present part, each holding a share
 *      proportional to that part's Volume (internal) or Surface Area
 *      (surface), which is what makes the density come out equal everywhere
 *      rather than merely equal per part.
 *
 * An allocation whose identity is not manifested is DROPPED and its Aura
 * returns to unallocated Output. It does not linger pointing at nothing, and
 * it does not reduce Current Aura — losing a limb does not drain a character,
 * it only means they are no longer reinforcing it.
 *
 * This is not the central Aura resolver. It takes an already-resolved Output
 * figure and already-resolved measurements and answers one question: where is
 * the active Aura. What Output the character has is decided elsewhere.
 */

import type { Anatomy, BodyPartId } from "../body/anatomy/types";
import type { ResolvedBodyMeasurements } from "../body/measurements/types";
import { isLocalizedAllocation } from "./state";
import type { AuraAllocation } from "./state";
import {
  SQUARE_CENTIMETRES_PER_SQUARE_METRE,
  type AuraPlacement,
  type ResolvedAuraAllocation,
  type ResolvedAuraDistribution,
} from "./types";


/** Why one stored allocation produced no resolved allocation. */
export type DroppedAuraAllocationReason =
  | "identity-not-manifested"
  | "no-measurable-body";

export interface DroppedAuraAllocation {
  readonly allocationId: string;
  readonly reason: DroppedAuraAllocationReason;
  readonly aura: number;
}

export interface ResolveAuraDistributionInput {
  readonly allocations: readonly AuraAllocation[];
  readonly anatomy: Anatomy;

  /** The PRESENT measurements. Destroyed and suppressed anatomy is absent. */
  readonly measurements: ResolvedBodyMeasurements;

  /** Output the character has available to place. */
  readonly availableOutput: number;
}

export interface ResolveAuraDistributionResult {
  readonly distribution: ResolvedAuraDistribution;
  readonly dropped: readonly DroppedAuraAllocation[];
}


/*
 * The measurement one placement is denominated in.
 *
 * The single place the internal/surface asymmetry is decided; everything below
 * is placement-agnostic and reads through this.
 */
function coveredMeasure(
  placement: AuraPlacement,
  part: { readonly volumeL: number; readonly surfaceAreaCm2: number },
): number {
  return placement === "internal" ? part.volumeL : part.surfaceAreaCm2;
}


function resolvedAllocation(
  input: {
    readonly allocationId: string;
    readonly placement: AuraPlacement;
    readonly coverage: "whole-body" | "localized";
    readonly continuityKey: ResolvedAuraAllocation["continuityKey"];
    readonly partId: BodyPartId;
    readonly aura: number;
    readonly measure: number;
  },
): ResolvedAuraAllocation {
  if (input.placement === "internal") {
    return {
      allocationId: input.allocationId,
      placement: "internal",
      coverage: input.coverage,
      continuityKey: input.continuityKey,
      partId: input.partId,
      aura: input.aura,
      coveredVolumeL: input.measure,
      density: {
        placement: "internal",
        auraPerLiter: input.aura / input.measure,
      },
    };
  }

  return {
    allocationId: input.allocationId,
    placement: "surface",
    coverage: input.coverage,
    continuityKey: input.continuityKey,
    partId: input.partId,
    aura: input.aura,
    coveredSurfaceAreaCm2: input.measure,
    density: {
      placement: "surface",
      auraPerSquareMeter:
        input.aura /
        (input.measure / SQUARE_CENTIMETRES_PER_SQUARE_METRE),
    },
  };
}


export function resolveAuraDistribution(
  input: ResolveAuraDistributionInput,
): ResolveAuraDistributionResult {
  /*
   * Present anatomy only, and keyed by identity. A part that is not in
   * `measurements.byPartId` did not contribute Volume or Surface Area, which
   * is precisely the definition of not being there.
   */
  const partByContinuityKey = new Map<
    ResolvedAuraAllocation["continuityKey"],
    BodyPartId
  >();

  for (const part of input.anatomy.parts) {
    if (part.state !== "active") continue;
    if (input.measurements.byPartId[part.id] === undefined) continue;

    partByContinuityKey.set(part.continuityKey, part.id);
  }

  const resolved: ResolvedAuraAllocation[] = [];
  const dropped: DroppedAuraAllocation[] = [];

  for (const allocation of input.allocations) {
    if (isLocalizedAllocation(allocation)) {
      const partId = partByContinuityKey.get(allocation.continuityKey);

      /*
       * A nonexistent part cannot hold active Aura. The allocation is removed
       * rather than zeroed, and its Aura falls back to unallocated Output.
       */
      if (partId === undefined) {
        dropped.push({
          allocationId: allocation.id,
          reason: "identity-not-manifested",
          aura: allocation.aura,
        });
        continue;
      }

      const part = input.measurements.byPartId[partId]!;
      const measure = coveredMeasure(allocation.placement, part);

      if (!Number.isFinite(measure) || measure <= 0) {
        dropped.push({
          allocationId: allocation.id,
          reason: "no-measurable-body",
          aura: allocation.aura,
        });
        continue;
      }

      resolved.push(resolvedAllocation({
        allocationId: allocation.id,
        placement: allocation.placement,
        coverage: "localized",
        continuityKey: allocation.continuityKey,
        partId,
        aura: allocation.aura,
        measure,
      }));

      continue;
    }

    /*
     * Whole-body: share out by the placement's own measurement, so every
     * covered part ends at the same density. Dividing evenly per part instead
     * would give a Hand the same Aura as a Leg and fourteen times the density.
     */
    const covered: {
      partId: BodyPartId;
      continuityKey: ResolvedAuraAllocation["continuityKey"];
      measure: number;
    }[] = [];
    let totalMeasure = 0;

    for (const part of input.anatomy.parts) {
      if (part.state !== "active") continue;

      const measured = input.measurements.byPartId[part.id];

      if (measured === undefined) continue;

      const measure = coveredMeasure(allocation.placement, measured);

      if (!Number.isFinite(measure) || measure <= 0) continue;

      covered.push({
        partId: part.id,
        continuityKey: part.continuityKey,
        measure,
      });
      totalMeasure += measure;
    }

    if (totalMeasure <= 0) {
      dropped.push({
        allocationId: allocation.id,
        reason: "no-measurable-body",
        aura: allocation.aura,
      });
      continue;
    }

    for (const entry of covered) {
      resolved.push(resolvedAllocation({
        allocationId: allocation.id,
        placement: allocation.placement,
        coverage: "whole-body",
        continuityKey: entry.continuityKey,
        partId: entry.partId,
        aura: allocation.aura * (entry.measure / totalMeasure),
        measure: entry.measure,
      }));
    }
  }

  const activeAura = resolved.reduce(
    (total, allocation) => total + allocation.aura,
    0,
  );

  return {
    distribution: {
      activeAura,
      /*
       * Never negative. Over-allocation is a validation failure rather than
       * something to represent as negative spare capacity.
       */
      unallocatedOutput: Math.max(0, input.availableOutput - activeAura),
      allocations: resolved,
    },
    dropped,
  };
}
