/*
 * The central Aura resolver — the one producer of ResolvedAuraProfile.
 *
 * Everything derived about a character's Aura is assembled here, from stored
 * state and already-resolved dependencies, in one order:
 *
 *   Stored Character
 *     -> Resolved Attributes
 *     -> Resolved Body and measurements
 *     -> Resolved Aura access
 *     -> Resolved Aura profile
 *     -> ResolvedCharacter
 *
 * A completed ResolvedCharacter is deliberately NOT an input. ResolvedCharacter
 * holds the profile this function produces, so taking one would be a cycle
 * dressed up as a parameter — and it would let a caller hand in a character
 * resolved from different attributes than the ones the Aura was computed with.
 * The focused input below names exactly the four things Aura actually depends
 * on, and nothing that depends on Aura can be among them.
 *
 *
 * THE THREE OUTPUT FIGURES
 * ------------------------
 *
 * They are three different questions, and conflating any two of them produces
 * a plausible wrong answer:
 *
 *   PHYSIOLOGICAL   what the body can produce at all.  CON alone, through the
 *                   curve in output.ts. Not a share of Maximum Aura and not
 *                   capped at a fraction of the pool — when CON and VIT are
 *                   equal the Pool and Output formulas happen to make it 20%
 *                   of Maximum Aura, and when they differ it is not.
 *
 *   ACCESSIBLE      what the character can currently reach.  Physiological x
 *                   the access fraction. Ren raises the fraction; Zetsu closes
 *                   it; Ten's default state opens 5% of it. None of them touch
 *                   the physiological figure — a character in Zetsu has not
 *                   become physically weaker.
 *
 *   USABLE          what they can actually spend right now.  Accessible capped
 *                   by Current Aura, because a reachable capacity is not Aura
 *                   the character has.
 *
 *
 * WHAT SHARES THE OUTPUT BUDGET
 * -----------------------------
 *
 * Stored allocations and the automatic Ten coating both spend usable Output,
 * and both are counted against one ceiling. Passive unawakened pseudo-Chu does
 * NOT: it is drawn from Current Aura through half-open nodes and never passes
 * through Output at all, so it is resolved separately and reported separately.
 *
 * UNITS stay explicit throughout. Internal Aura is Aura per LITRE; surface
 * Aura is Aura per SQUARE METRE. They aggregate within a placement and never
 * across one.
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
  auraAdjustments,
  reconcileAuraAllocations,
  resolveAuraBudget,
  type AuraTransitionContext,
} from "./budget";
import { deriveAuraControl } from "./control";
import {
  resolveInternalAuraDensity,
  resolveSurfaceAuraDensity,
} from "./density";
import { resolveAuraDistribution } from "./distribution";
import { resolvePassiveInternalAura } from "./passive";
import { deriveAuraRegenerationCapacity } from "./recovery";
import type { CharacterAuraState } from "./state";
import type {
  AggregatedInternalAura,
  AggregatedSurfaceAura,
  ResolvedAuraAllocation,
  ResolvedAuraProfile,
  ResolvedBodyPartAura,
  ResolvedInternalAuraAllocation,
  ResolvedSurfaceAuraAllocation,
} from "./types";


/*
 * The four things Aura depends on, plus the stored state itself.
 *
 * Extends AuraTransitionContext rather than restating it, so the resolver and
 * every transition are literally judging the same inputs — a transition that
 * reconciled against one body while the resolution that followed it used
 * another would be a bug nobody could see.
 */
export interface ResolveAuraProfileInput extends AuraTransitionContext {
  readonly state: CharacterAuraState;
}


/*
 * Every contribution to one Body Part, in one placement, as one figure.
 *
 * Densities are added by summing the AURA and dividing once, rather than by
 * summing the per-contribution densities. Arithmetically identical — the
 * denominator is the same covered measure for every contribution to the same
 * part — but it goes back through density.ts, so the cm2-to-m2 conversion
 * still happens in exactly one place.
 */
function aggregateInternal(
  contributions: readonly ResolvedInternalAuraAllocation[],
  coveredVolumeL: number,
): EngineResult<AggregatedInternalAura> {
  const aura = contributions.reduce((total, one) => total + one.aura, 0);
  const density = resolveInternalAuraDensity(aura, coveredVolumeL);

  if (!density.success) return density;

  return {
    success: true,
    payload: {
      placement: "internal",
      aura,
      coveredVolumeL,
      density: density.payload,
      contributions,
    },
    trace: density.trace,
    warnings: [],
  };
}

function aggregateSurface(
  contributions: readonly ResolvedSurfaceAuraAllocation[],
  coveredSurfaceAreaCm2: number,
): EngineResult<AggregatedSurfaceAura> {
  const aura = contributions.reduce((total, one) => total + one.aura, 0);
  const density = resolveSurfaceAuraDensity(aura, coveredSurfaceAreaCm2);

  if (!density.success) return density;

  return {
    success: true,
    payload: {
      placement: "surface",
      aura,
      coveredSurfaceAreaCm2,
      density: density.payload,
      contributions,
    },
    trace: density.trace,
    warnings: [],
  };
}


/*
 * The whole body's Aura, part by part.
 *
 * Every PRESENT part appears, including the ones carrying nothing — a sheet
 * asking "what is protecting this forearm" needs an answer for a bare forearm
 * too, and a missing entry and a zero entry read differently. A placement is
 * null when nothing is there; it is never a zero-Aura aggregate, because a
 * Part with no exposed skin and a Part nobody has coated are different facts.
 */
function aggregateByBodyPart(
  anatomy: Anatomy,
  measurements: ResolvedBodyMeasurements,
  contributions: readonly ResolvedAuraAllocation[],
): EngineResult<readonly ResolvedBodyPartAura[]> {
  const internalByPart = new Map<
    BodyPartId,
    ResolvedInternalAuraAllocation[]
  >();
  const surfaceByPart = new Map<BodyPartId, ResolvedSurfaceAuraAllocation[]>();

  for (const contribution of contributions) {
    if (contribution.placement === "internal") {
      const held = internalByPart.get(contribution.partId) ?? [];

      held.push(contribution);
      internalByPart.set(contribution.partId, held);

      continue;
    }

    const held = surfaceByPart.get(contribution.partId) ?? [];

    held.push(contribution);
    surfaceByPart.set(contribution.partId, held);
  }

  const parts: ResolvedBodyPartAura[] = [];
  const children: TraceNode[] = [];
  const errors: EngineError[] = [];

  for (const part of anatomy.parts) {
    if (part.state !== "active") continue;

    const measured = measurements.byPartId[part.id];

    if (measured === undefined) continue;

    const internalContributions = internalByPart.get(part.id) ?? [];
    const surfaceContributions = surfaceByPart.get(part.id) ?? [];

    let internal: AggregatedInternalAura | null = null;
    let surface: AggregatedSurfaceAura | null = null;

    if (internalContributions.length > 0) {
      const result = aggregateInternal(
        internalContributions,
        measured.volumeL,
      );

      if (!result.success) {
        errors.push(...result.errors);
        continue;
      }

      internal = result.payload;
      children.push(result.trace.root);
    }

    if (surfaceContributions.length > 0) {
      const result = aggregateSurface(
        surfaceContributions,
        measured.surfaceAreaCm2,
      );

      if (!result.success) {
        errors.push(...result.errors);
        continue;
      }

      surface = result.payload;
      children.push(result.trace.root);
    }

    parts.push({
      partId: part.id,
      continuityKey: part.continuityKey,
      volumeL: measured.volumeL,
      surfaceAreaCm2: measured.surfaceAreaCm2,
      internal,
      surface,
    });
  }

  const traceNode = createTraceNode({
    id: "aura.aggregate.by-part",
    label: "Aggregate Aura by Body Part",
    formula:
      "same-placement contributions add; internal (Aura/L) and surface (Aura/m2) never do",
    inputs: {
      contributions: { value: contributions.length },
      parts: { value: parts.length },
    },
    output: errors.length === 0,
    children,
  });

  if (errors.length > 0) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  }

  return {
    success: true,
    payload: parts,
    trace: { root: traceNode },
    warnings: [],
  };
}


/**
 * Resolve a character's whole Aura profile.
 *
 * Resolution order, and each step's reason for being where it is:
 *
 *   1  Maximum and Current Aura      everything downstream is capped by them
 *   2  Depletion fraction            falls out of the pool, carried once
 *   3  Physiological Output          CON alone; independent of everything else
 *   4  Access fraction applied       what the current state can reach
 *   5  Usable Output                 capped by the reserve actually held
 *   6  Control from DEX              cost only, and cost is not resolved here
 *   7  Baseline access state         resolved before 4, whose fraction it owns
 *   8  Passive pseudo-Chu or Ten     whichever the access state produces
 *   9  Stored allocations reconciled onto the anatomy and budget that exist
 *  10  Placement                     under one shared Output ceiling
 *  11  Aggregation by Body Part      contributions kept, densities summed
 *  12  Assembly
 *
 * Steps 1 through 8 fail loudly, because a pool, an Output curve or an access
 * state that cannot be derived is a bug. Step 9 does not: stored allocations
 * that no longer fit the body or the budget are RECONCILED and the adjustments
 * reported, because a character halfway to legal still has to be renderable —
 * and because whether allocations fit inside accessible Output depends on
 * runtime state, so a character legal at rest and over-committed after a drain
 * does not have an invalid sheet.
 */
export function resolveAuraProfile(
  input: ResolveAuraProfileInput,
): EngineResult<ResolvedAuraProfile> {
  const { state, attributes, anatomy, bodyMeasurements } = input;

  const traceNode = createTraceNode({
    id: "aura.profile.resolve",
    label: "Resolve Aura profile",
    formula:
      "pool -> physiological Output -> access fraction -> usable Output -> Control -> placement",
    inputs: {
      con: { value: attributes.con },
      vit: { value: attributes.vit },
      dex: { value: attributes.dex },
      currentAura: {
        value: Number.isFinite(state.current)
          ? state.current
          : String(state.current),
      },
      allocations: { value: state.allocations.length },
    },
  });

  const children: TraceNode[] = [];

  const fail = (
    errors: NonEmptyArray<EngineError>,
  ): EngineResult<ResolvedAuraProfile> => {
    traceNode.output = false;
    traceNode.children = children;

    return { success: false, trace: { root: traceNode }, warnings: [], errors };
  };

  /*
   * 1-7. The pool, the access state, the three Output figures, and what the
   * access state places on its own — all of it in one place, because every one
   * of them is an input to the next and the transitions need the same set.
   */
  const budget = resolveAuraBudget(state.current, input);

  children.push(budget.trace.root);

  if (!budget.success) return fail(budget.errors);

  /* 6. Control. Cost only — nothing below reads it. */
  const control = deriveAuraControl(attributes.dex);

  children.push(control.trace.root);

  if (!control.success) return fail(control.errors);

  /* 8a. Passive internal reinforcement, for an unawakened body only. */
  const reinforcement = budget.payload.access.passiveInternalReinforcement;

  let passiveInternal: ResolvedAuraProfile["passiveInternal"] = null;

  if (reinforcement !== null) {
    const passive = resolvePassiveInternalAura({
      currentAura: budget.payload.pool.current,
      reinforcement,
      anatomy,
      measurements: bodyMeasurements,
    });

    children.push(passive.trace.root);

    if (!passive.success) return fail(passive.errors);

    passiveInternal = passive.payload;
  }

  /*
   * 9. The stored allocations, against the body and the budget that exist.
   *
   * Reconciled rather than refused. What comes back is guaranteed placeable,
   * which is what lets step 10 treat an over-allocation as the bug it would
   * now be rather than as an ordinary state a character can be in.
   */
  const reconciled = reconcileAuraAllocations(
    state.allocations,
    budget.payload,
    input,
  );

  children.push(reconciled.trace.root);

  if (!reconciled.success) return fail(reconciled.errors);

  /* 8b + 10. Placement, under one shared Output ceiling. */
  const placed = resolveAuraDistribution({
    allocations: reconciled.payload.allocations,
    automatic: budget.payload.automatic,
    anatomy,
    measurements: bodyMeasurements,
    availableOutput: budget.payload.usableOutput,
  });

  children.push(placed.trace.root);

  if (!placed.success) return fail(placed.errors);

  /*
   * 11. Aggregation, over everything physically present.
   *
   * Wider than the distribution on purpose: pseudo-Chu is real internal Aura
   * sitting in the body, and a resolver asking how reinforced a Part is must
   * see it. It stays out of `distribution` because it is not Output.
   */
  const byBodyPart = aggregateByBodyPart(
    anatomy,
    bodyMeasurements,
    [
      ...placed.payload.distribution.allocations,
      ...(passiveInternal?.allocations ?? []),
    ],
  );

  children.push(byBodyPart.trace.root);

  if (!byBodyPart.success) return fail(byBodyPart.errors);

  /* 12. */
  const payload: ResolvedAuraProfile = {
    pool: budget.payload.pool,

    output: {
      physiologicalMaximum: budget.payload.physiologicalOutput,
      accessibleMaximum: budget.payload.accessibleOutput,
      usableMaximum: budget.payload.usableOutput,
    },

    /*
     * Carried forward from VIT unchanged. Recovery eligibility, recovery over
     * time and every contextual replenishment rule belong to the Fatigue and
     * Recovery ticket; this is the capacity, not a transition.
     */
    regeneration: deriveAuraRegenerationCapacity(attributes),

    control: control.payload,
    access: budget.payload.access,
    distribution: placed.payload.distribution,
    passiveInternal,
    byBodyPart: byBodyPart.payload,
    adjustments: auraAdjustments(reconciled.payload.changes),
  };

  traceNode.output = {
    maximumAura: payload.pool.maximum,
    currentAura: payload.pool.current,
    depletionFraction: payload.pool.depletionFraction,
    physiologicalOutput: payload.output.physiologicalMaximum,
    accessFraction: payload.access.accessFraction,
    accessibleOutput: payload.output.accessibleMaximum,
    usableOutput: payload.output.usableMaximum,
    controlMultiplier: payload.control.multiplier,
    accessState: payload.access.state,
    activeAura: payload.distribution.activeAura,
    unallocatedOutput: payload.distribution.unallocatedOutput,
    passiveInternalAura: passiveInternal?.effectiveAura ?? null,
    adjustments: payload.adjustments.length,
  };
  traceNode.children = children;

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: placed.warnings,
  };
}
