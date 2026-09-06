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

import type { EngineError } from "../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../../infrastructure/trace";
import type { Anatomy, BodyPartId } from "../body/anatomy/types";
import type { ResolvedBodyMeasurements } from "../body/measurements/types";
import {
  resolveInternalAuraDensity,
  resolveSurfaceAuraDensity,
} from "./density";
import { isLocalizedAllocation } from "./state";
import type { AuraAllocation } from "./state";
import {
  auraAllocationIssueToEngineError,
  findAuraAllocationIssues,
} from "./validation";
import type {
  AuraPlacement,
  ResolvedAuraAllocation,
  ResolvedAuraDistribution,
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

  /*
   * Allocations that could not be placed because their anatomy is not there.
   *
   * Not an error. A character who lost the arm they were reinforcing has a
   * perfectly valid distribution; they are simply no longer reinforcing it.
   * The Aura returns to unallocated Output and Current Aura is untouched.
   */
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
): EngineResult<ResolvedAuraAllocation> {
  /*
   * Density is NOT recomputed here. density.ts owns both formulas and both
   * denominators — including the single cm2-to-m2 conversion — so this asks it
   * rather than dividing again. A second division is a second place the
   * conversion can be forgotten.
   */
  const shared = {
    allocationId: input.allocationId,
    coverage: input.coverage,
    continuityKey: input.continuityKey,
    partId: input.partId,
    aura: input.aura,
  } as const;

  if (input.placement === "internal") {
    const density = resolveInternalAuraDensity(input.aura, input.measure);

    if (!density.success) return density;

    return {
      success: true,
      payload: {
        ...shared,
        placement: "internal",
        coveredVolumeL: input.measure,
        density: density.payload,
      },
      trace: density.trace,
      warnings: [],
    };
  }

  const density = resolveSurfaceAuraDensity(input.aura, input.measure);

  if (!density.success) return density;

  return {
    success: true,
    payload: {
      ...shared,
      placement: "surface",
      coveredSurfaceAreaCm2: input.measure,
      density: density.payload,
    },
    trace: density.trace,
    warnings: [],
  };
}


/*
 * Places stored allocations onto the body that is actually there.
 *
 * Returns an EngineResult because there are inputs it genuinely cannot place,
 * and the previous shape had no way to say so. Over-allocation was the worst
 * of them: more Aura committed than the character can reach was silently
 * clamped to zero unallocated Output, so an impossible distribution came back
 * looking merely full. A caller cannot distinguish "exactly spent" from
 * "spent 5x what you have" after the fact, so the clamp is gone and the
 * failure is reported.
 *
 * Dropped allocations remain a SUCCESS. Anatomy that is not manifested is a
 * fact about the body, not a malformed input.
 */
export function resolveAuraDistribution(
  input: ResolveAuraDistributionInput,
): EngineResult<ResolveAuraDistributionResult> {
  const allocations = input.allocations;

  const traceNode = createTraceNode({
    id: "aura.distribution.resolve",
    label: "Place Aura allocations on the body",
    formula:
      "whole-body shares split by covered measure; localized resolve by continuity identity",
    inputs: {
      allocations: { value: allocations.length },
      availableOutput: {
        value: Number.isFinite(input.availableOutput)
          ? input.availableOutput
          : String(input.availableOutput),
      },
    },
  });

  const fail = (
    errors: NonEmptyArray<EngineError>,
  ): EngineResult<ResolveAuraDistributionResult> => {
    traceNode.output = false;

    return { success: false, trace: { root: traceNode }, warnings: [], errors };
  };

  if (
    !Number.isFinite(input.availableOutput) ||
    input.availableOutput < 0
  ) {
    return fail([{
      code: "aura.distribution.output.invalid",
      message: "Available Aura Output must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(input.availableOutput)
        ? input.availableOutput
        : String(input.availableOutput),
    }]);
  }

  /*
   * The same predicate the character sheet is validated with. An allocation
   * the sheet rejects must not be one distribution quietly accepts.
   */
  const allocationIssues = findAuraAllocationIssues(allocations);

  if (allocationIssues.length > 0) {
    return fail(
      allocationIssues.map(auraAllocationIssueToEngineError) as
        NonEmptyArray<EngineError>,
    );
  }

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
  const children: TraceNode[] = [];

  /* Collects one placed allocation, or fails the whole resolution. */
  const placeOne = (
    entry: Parameters<typeof resolvedAllocation>[0],
  ): EngineError[] => {
    const result = resolvedAllocation(entry);

    if (!result.success) return [...result.errors];

    resolved.push(result.payload);
    children.push(result.trace.root);

    return [];
  };

  for (const allocation of allocations) {
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

      /*
       * Zero covered measure is not a failure here: an internal organ with no
       * exposed skin genuinely cannot carry surface Aura, which is a fact
       * about the anatomy rather than about the request.
       */
      if (!Number.isFinite(measure) || measure <= 0) {
        dropped.push({
          allocationId: allocation.id,
          reason: "no-measurable-body",
          aura: allocation.aura,
        });
        continue;
      }

      const errors = placeOne({
        allocationId: allocation.id,
        placement: allocation.placement,
        coverage: "localized",
        continuityKey: allocation.continuityKey,
        partId,
        aura: allocation.aura,
        measure,
      });

      if (errors.length > 0) return fail(errors as NonEmptyArray<EngineError>);

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
      const errors = placeOne({
        allocationId: allocation.id,
        placement: allocation.placement,
        coverage: "whole-body",
        continuityKey: entry.continuityKey,
        partId: entry.partId,
        aura: allocation.aura * (entry.measure / totalMeasure),
        measure: entry.measure,
      });

      if (errors.length > 0) return fail(errors as NonEmptyArray<EngineError>);
    }
  }

  const activeAura = resolved.reduce(
    (total, allocation) => total + allocation.aura,
    0,
  );

  /*
   * More Aura placed than the character can reach.
   *
   * Reported rather than clamped. Clamping produced a distribution that looked
   * exactly like a legally full one, so nothing downstream could tell a
   * character spending everything they have from a character spending five
   * times it.
   *
   * Measured against PLACED Aura, not stored: a dropped allocation's Aura is
   * back in unallocated Output and is not competing for the ceiling.
   */
  if (activeAura > input.availableOutput) {
    return fail([{
      code: "aura.distribution.over_allocated",
      message:
        "More Aura is allocated than the character's available Output can supply.",
      audience: "player",
      required: `active Aura <= ${input.availableOutput}`,
      actual: activeAura,
      resolution:
        "Reduce an allocation, or raise accessible Output before placing it.",
    }]);
  }

  const distribution: ResolvedAuraDistribution = {
    activeAura,
    unallocatedOutput: input.availableOutput - activeAura,
    allocations: resolved,
  };

  traceNode.output = {
    activeAura,
    unallocatedOutput: distribution.unallocatedOutput,
    placed: resolved.length,
    dropped: dropped.length,
  };
  traceNode.children = children;

  return {
    success: true,
    payload: { distribution, dropped },
    trace: { root: traceNode },
    warnings: [],
  };
}
