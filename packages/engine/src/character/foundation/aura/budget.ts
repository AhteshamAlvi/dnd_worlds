/*
 * The Aura budget, and bringing stored allocations back into agreement with it.
 *
 * Both the central resolver and the transition operations have to answer the
 * same two questions before they can do anything: how much Output may this
 * character place right now, and which of the allocations they are holding can
 * the present body and present access actually support. Two implementations of
 * that would be two answers, and the one nobody was looking at would be wrong,
 * so both callers come here.
 *
 *
 * WHO SHARES THE BUDGET
 * ---------------------
 *
 * Usable Output is one pool. Stored allocations and the automatic whole-body
 * coating the character's access state applies for them both draw on it, which
 * is why `deliberateBudget` is what is LEFT after the coating. A character
 * running baseline Ten has already committed 5% of physiological Output;
 * letting stored allocations spend the same 5% again would double it.
 *
 * Passive unawakened pseudo-Chu is the exception and does not appear here at
 * all. It is drawn from Current Aura through half-open nodes and never passes
 * through Output, so there is no budget for it to compete for.
 *
 *
 * WHAT RECONCILIATION IS ALLOWED TO DO
 * ------------------------------------
 *
 * Reduce and remove, never restore. Three things can make an allocation
 * unsupportable, and each has its own answer:
 *
 *   the anatomy is gone          removed; the Aura returns to unallocated
 *                                Output, and Current Aura is untouched,
 *                                because losing a limb does not drain you
 *
 *   the placement is not         removed; an awakened character's internal
 *   permitted                    Density is zero until something grants it
 *
 *   the budget shrank            scaled down proportionally, so a character
 *                                reinforcing their legs twice as hard as their
 *                                arms still is
 *
 * It never grows an allocation back when Aura returns. Re-committing Output is
 * a decision, and decisions come from the caller.
 */

import type { EngineResult } from "../../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../../infrastructure/trace";
import type { CharacterStats } from "../attributes/stats";
import type { Anatomy } from "../body/anatomy/types";
import type { ResolvedBodyMeasurements } from "../body/measurements/types";

import { resolveAuraAccess } from "./access";
import {
  resolveAuraDistribution,
  type AutomaticAuraAllocation,
} from "./distribution";
import { deriveAuraOutput } from "./output";
import { validateAuraPool } from "./pool";
import { totalAllocatedAura, type AuraAllocation } from "./state";
import type {
  AuraAccessInput,
  AuraAllocationChange,
  AuraPool,
  DroppedAuraAllocationReason,
  ResolvedAuraAccess,
} from "./types";


/** The allocation id the automatic whole-body coating resolves under. */
export const BASELINE_TEN_ALLOCATION_ID = "baseline-ten";


/*
 * Everything Aura depends on that is not the stored Aura state itself.
 *
 * Shared by resolution and by every transition, so a transition and the
 * resolution that follows it can never be judging different bodies, different
 * attributes or different access.
 */
export interface AuraTransitionContext {
  /*
   * The PHYSICALLY-RESOLVED stat block, not the raw resolved Attributes.
   *
   * Typed as CharacterStats rather than ResolvedAttributes because Aura reads
   * four different scores off it and every one of them has to be the score the
   * character actually has: a Giant's Volume/Mass burden lowers their DEX, and
   * their Control multiplier must follow it exactly as every Derived Attribute
   * does. Stamina — round((CON + VIT) / 2) — is read through the same block, so
   * physical expenditure cannot be handed a different character than Control was.
   */
  readonly attributes: CharacterStats;
  readonly anatomy: Anatomy;

  /** The PRESENT measurements. Destroyed and suppressed anatomy is absent. */
  readonly bodyMeasurements: ResolvedBodyMeasurements;

  readonly access: AuraAccessInput;
}


export interface AuraBudget {
  readonly pool: AuraPool;
  readonly access: ResolvedAuraAccess;

  readonly physiologicalOutput: number;
  readonly accessibleOutput: number;
  readonly usableOutput: number;

  /** What the access state places without being asked. */
  readonly automatic: readonly AutomaticAuraAllocation[];
  readonly automaticAura: number;

  /** Usable Output left for STORED allocations once the above has its share. */
  readonly deliberateBudget: number;

  readonly trace: TraceNode;
}


/**
 * How much Output the character may currently place, and what their own state
 * has already placed for them.
 *
 *   O_coating = min(usable Output, Current Aura, coatingFraction x O_phys)
 *
 * The usable-Output cap on the coating normally changes nothing — usable
 * Output already accounts for the same two limits — but it keeps the coating
 * inside the budget if an access override ever opens a smaller fraction than
 * the coating draws.
 */
export function resolveAuraBudget(
  current: number,
  context: AuraTransitionContext,
): EngineResult<AuraBudget> {
  const children: TraceNode[] = [];

  const pool = validateAuraPool(current, context.attributes);

  children.push(pool.trace.root);

  if (!pool.success) return pool;

  const access = resolveAuraAccess(context.access);

  children.push(access.trace.root);

  if (!access.success) return access;

  const output = deriveAuraOutput(
    context.attributes,
    pool.payload,
    access.payload.accessFraction,
  );

  children.push(output.trace.root);

  if (!output.success) return output;

  const coating = access.payload.automaticSurfaceCoating;

  const automaticAura = coating === null ? 0 : Math.min(
    output.payload.usableMaximum,
    pool.payload.current,
    coating.outputFraction * output.payload.physiologicalMaximum,
  );

  const automatic: readonly AutomaticAuraAllocation[] = coating === null
    ? []
    : [{
      id: BASELINE_TEN_ALLOCATION_ID,
      source: coating.source,
      coverage: "whole-body",
      placement: "surface",
      aura: automaticAura,
    }];

  const deliberateBudget = Math.max(
    0,
    output.payload.usableMaximum - automaticAura,
  );

  const traceNode = createTraceNode({
    id: "aura.budget.resolve",
    label: "Resolve the Aura budget",
    formula:
      "deliberateBudget = usableOutput - the Aura the access state commits automatically",
    inputs: {
      currentAura: { value: current },
      accessState: { value: access.payload.state },
      accessFraction: { value: access.payload.accessFraction },
    },
    output: {
      physiologicalOutput: output.payload.physiologicalMaximum,
      accessibleOutput: output.payload.accessibleMaximum,
      usableOutput: output.payload.usableMaximum,
      automaticAura,
      deliberateBudget,
    },
    children,
  });

  return {
    success: true,
    payload: {
      pool: pool.payload,
      access: access.payload,
      physiologicalOutput: output.payload.physiologicalMaximum,
      accessibleOutput: output.payload.accessibleMaximum,
      usableOutput: output.payload.usableMaximum,
      automatic,
      automaticAura,
      deliberateBudget,
      trace: traceNode,
    },
    trace: { root: traceNode },
    warnings: [],
  };
}


/*
 * Scale a set of amounts down to fit a budget, keeping their proportions.
 *
 *   A_i' = A_i x (budget / total)
 *
 * The trailing correction is not cosmetic. Multiplying each amount by a factor
 * and adding the results back up does not reliably reproduce the budget in
 * binary floating point, and stored state that overshoots by one part in 10^13
 * is stored state that is over its ceiling. The excess comes off the largest
 * amount, where it is proportionally smallest and cannot drive anything
 * negative.
 */
export function proportionallyReduce(
  amounts: readonly number[],
  budget: number,
): { readonly amounts: readonly number[]; readonly factor: number } {
  const total = amounts.reduce((sum, amount) => sum + amount, 0);

  if (total <= budget) return { amounts, factor: 1 };

  const factor = total > 0 ? budget / total : 0;
  const scaled = amounts.map((amount) => amount * factor);
  const excess = scaled.reduce((sum, amount) => sum + amount, 0) - budget;

  if (excess > 0) {
    let largest = 0;

    scaled.forEach((amount, index) => {
      if (amount > scaled[largest]!) largest = index;
    });

    scaled[largest] = Math.max(0, scaled[largest]! - excess);
  }

  return { amounts: scaled, factor };
}


export interface ReconciledAuraAllocations {
  readonly allocations: readonly AuraAllocation[];

  /** One entry per allocation that came in, including the unchanged ones. */
  readonly changes: readonly AuraAllocationChange[];
}


/**
 * Bring a set of allocations back into agreement with the body and the budget.
 *
 * Applied in order, because each step changes the arithmetic of the next:
 * permission first (a forbidden allocation is not competing for anything),
 * then present anatomy, then the budget.
 *
 * Returns a change entry for EVERY allocation, `unchanged` included, so a
 * caller can present the whole list rather than diffing two of them.
 */
export function reconcileAuraAllocations(
  allocations: readonly AuraAllocation[],
  budget: AuraBudget,
  context: AuraTransitionContext,
): EngineResult<ReconciledAuraAllocations> {
  /*
   * 1. Placement permission.
   *
   * An awakened character's internal Density is zero unless an access override
   * explicitly restores it, and an unawakened character directs nothing at
   * all. Either way the allocation is not applying, and saying so is better
   * than resolving it at an Aura the character cannot supply.
   */
  const permitted: AuraAllocation[] = [];
  const forbidden = new Set<string>();

  for (const allocation of allocations) {
    const allowed = allocation.placement === "internal"
      ? budget.access.deliberateInternalAccess
      : budget.access.deliberateExternalAccess;

    if (allowed) permitted.push(allocation);
    else forbidden.add(allocation.id);
  }

  /*
   * 2. Present anatomy, asked of the same resolver that will place them.
   *
   * The ceiling handed down is everything committed, so that this pass reports
   * only unmanifested anatomy. The budget is applied below, where a reduction
   * can be attributed allocation by allocation.
   */
  const probe = resolveAuraDistribution({
    allocations: permitted,
    automatic: budget.automatic,
    anatomy: context.anatomy,
    measurements: context.bodyMeasurements,
    availableOutput: totalAllocatedAura(permitted) + budget.automaticAura,
  });

  if (!probe.success) return probe;

  const unmanifested = new Map<string, DroppedAuraAllocationReason>();

  for (const dropped of probe.payload.dropped) {
    if (forbidden.has(dropped.allocationId)) continue;
    if (dropped.allocationId === BASELINE_TEN_ALLOCATION_ID) continue;

    unmanifested.set(dropped.allocationId, dropped.reason);
  }

  const surviving = permitted.filter(
    (allocation) => !unmanifested.has(allocation.id),
  );

  /* 3. The budget. */
  const reduced = proportionallyReduce(
    surviving.map((allocation) => allocation.aura),
    budget.deliberateBudget,
  );

  const reducedById = new Map(
    surviving.map((allocation, index) => [
      allocation.id,
      reduced.amounts[index]!,
    ]),
  );

  const next: AuraAllocation[] = [];
  const changes: AuraAllocationChange[] = [];

  for (const allocation of allocations) {
    if (forbidden.has(allocation.id)) {
      changes.push({
        kind: "removed-not-permitted",
        allocationId: allocation.id,
        previous: allocation,
        placement: allocation.placement,
      });

      continue;
    }

    const reason = unmanifested.get(allocation.id);

    if (reason !== undefined) {
      changes.push({
        kind: "removed-not-manifested",
        allocationId: allocation.id,
        previous: allocation,
        reason,
      });

      continue;
    }

    const aura = reducedById.get(allocation.id)!;

    if (aura === allocation.aura) {
      next.push(allocation);
      changes.push({
        kind: "unchanged",
        allocationId: allocation.id,
        allocation,
      });

      continue;
    }

    const scaled: AuraAllocation = { ...allocation, aura };

    next.push(scaled);
    changes.push({
      kind: "reduced",
      allocationId: allocation.id,
      previous: allocation,
      allocation: scaled,
      factor: reduced.factor,
    });
  }

  return {
    success: true,
    payload: { allocations: next, changes },
    trace: probe.trace,
    warnings: probe.warnings,
  };
}


/** Everything reconciliation actually had to do. Empty when it did nothing. */
export function auraAdjustments(
  changes: readonly AuraAllocationChange[],
): readonly AuraAllocationChange[] {
  return changes.filter((change) => change.kind !== "unchanged");
}
