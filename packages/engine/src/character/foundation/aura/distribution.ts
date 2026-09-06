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
 * AUTOMATIC allocations — baseline Ten, today — are placed alongside the
 * stored ones rather than in a second pass. They are derived state and are
 * never written to the character sheet, but they occupy real body and consume
 * real Output, so anything that treated them separately would be a second
 * ceiling and a second expansion that could disagree with the first.
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
  AuraAllocationSource,
  AuraPlacement,
  DroppedAuraAllocation,
  ResolvedAuraAllocation,
  ResolvedAuraDistribution,
} from "./types";


/*
 * Declared in types.ts with every other Aura value shape and re-exported here,
 * because this is the function that produces them and callers reach for the
 * type from the same module they call.
 */
export type {
  DroppedAuraAllocation,
  DroppedAuraAllocationReason,
} from "./types";

/*
 * An allocation the engine DERIVED rather than the character authored.
 *
 * Baseline Ten is the one that exists: it is recomputed from Output on every
 * resolution and is deliberately never written into stored state, because a
 * stored copy would survive the character losing the Ten that produced it.
 *
 * It is otherwise an ordinary allocation and goes through the same validation,
 * the same expansion over present anatomy, and the same Output ceiling — the
 * `source` tag is what keeps it recognisable once it is sitting next to a
 * stored allocation on the same Body Part.
 */
export type AutomaticAuraAllocation =
  & AuraAllocation
  & { readonly source: Exclude<AuraAllocationSource, "stored"> };


/** One allocation and where it came from, once the two lists are merged. */
interface SourcedAllocation {
  readonly allocation: AuraAllocation;
  readonly source: AuraAllocationSource;
}


export interface ResolveAuraDistributionInput {
  /** What the character authored. */
  readonly allocations: readonly AuraAllocation[];

  /** What their current state produces on its own. */
  readonly automatic?: readonly AutomaticAuraAllocation[];

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
 * How far past the ceiling a total has to be before it counts as over it.
 *
 * A whole-body allocation is split into one share per part and then added back
 * up, and binary floating point does not promise that the sum returns to the
 * figure it came from: 1600 spread over eight parts comes back as
 * 1600.0000000000002. An exact `>` reads that as an over-allocation and
 * refuses a character who committed exactly what they had — which is not a
 * hypothetical, it is what the automatic Ten coating does every single time,
 * because it draws the entire usable Output by construction.
 *
 * Relative rather than absolute, because Aura spans nine orders of magnitude
 * between a CON 10 human and a CON 30 monster, and an epsilon that is
 * invisible at 800,000,000 would be a real quantity at 2.
 */
const OUTPUT_OVERSHOOT_TOLERANCE = 1e-9;

function overAllocated(activeAura: number, availableOutput: number): boolean {
  const scale = Math.max(Math.abs(activeAura), Math.abs(availableOutput));

  return activeAura - availableOutput > scale * OUTPUT_OVERSHOOT_TOLERANCE;
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
    readonly source: AuraAllocationSource;
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
    source: input.source,
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
  const automatic = input.automatic ?? [];

  /*
   * Stored and automatic are placed as ONE list, and that is the point.
   *
   * They compete for the same Output ceiling, they expand over the same
   * anatomy, and they are judged by the same predicate — so a duplicate id
   * between the two is caught, and baseline Ten cannot quietly overrun a
   * budget the stored allocations were checked against.
   */
  const allocations: readonly SourcedAllocation[] = [
    ...input.allocations.map((allocation) => ({
      allocation,
      source: "stored" as const,
    })),
    ...automatic.map((allocation) => ({ allocation, source: allocation.source })),
  ];

  const traceNode = createTraceNode({
    id: "aura.distribution.resolve",
    label: "Place Aura allocations on the body",
    formula:
      "whole-body shares split by covered measure; localized resolve by continuity identity",
    inputs: {
      allocations: { value: input.allocations.length },
      automatic: { value: automatic.length },
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
  const allocationIssues = findAuraAllocationIssues(
    allocations.map((entry) => entry.allocation),
  );

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

  for (const { allocation, source } of allocations) {
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
        source,
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
        source,
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
  if (overAllocated(activeAura, input.availableOutput)) {
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
