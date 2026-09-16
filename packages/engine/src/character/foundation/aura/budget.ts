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
 * running baseline Ten has already committed whatever share of physiological
 * Output Ten resolved; letting stored allocations spend that share again would
 * double it.
 *
 * That share is Ten's answer and arrives on the access state already resolved,
 * so nothing here decides how much a coating is worth. This file multiplies a
 * fraction by a physiological maximum and caps the result; it does not know
 * what produced the fraction, and must not grow a rule of its own about it.
 *
 * A deliberate outward flow is not a coating and never appears here: the
 * access override that carries one sets the coating aside, so a character
 * running Ren holds no automatic commitment at all.
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
 *   the budget shrank            settled by PRIORITY, highest first. Each
 *                                commitment is kept whole while there is room;
 *                                the first that does not fit takes what is
 *                                left — or is released if it declared itself
 *                                indivisible — and those below it are released
 *
 * That last rule used to scale every survivor by budget/total, and it was the
 * right arithmetic in the wrong place. Spreading ONE allocation over a body at
 * equal density is proportional and still is; see distribution.ts. Spreading a
 * SHORTAGE across unrelated commitments is not. It left a character whose
 * reserve dipped holding a degraded version of everything instead of an intact
 * version of what mattered, and nothing they could state changed that, because
 * the split was decided by the amounts alone.
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
import {
  allocationPriority,
  totalAllocatedAura,
  type AuraAllocation,
} from "./state";
import { DEFAULT_AURA_COMMITMENT_SHORTFALL } from "./types";
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
 * inside the budget if an explicit override ever opens a smaller fraction than
 * the coating draws. The character still INTENDS the whole coating, and gets
 * as much of it as their Output and reserve can actually fund.
 *
 * Capping is not charging. The coating is an Output commitment and Current
 * Aura is read only as a ceiling on it — allocating Ten deducts nothing, which
 * is what makes it free to run indefinitely.
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
 * Floating-point slack for "this commitment still fits".
 *
 * Upkeep and interval arithmetic produce budgets like 999.9999999999999, and
 * an exact comparison would cut a 1,000-Aura Ken down by a ten-trillionth and
 * report it to the player as a reduction.
 */
const BUDGET_EPSILON = 1e-9;


/** One commitment's fate under the budget, before it is turned into a change. */
type SettledCommitment =
  | { readonly kind: "kept"; readonly allocation: AuraAllocation }
  | {
    readonly kind: "reduced";
    readonly allocation: AuraAllocation;
    readonly aura: number;
    readonly factor: number;
  }
  | {
    readonly kind: "released";
    readonly allocation: AuraAllocation;
    readonly available: number;
    readonly reason: "indivisible" | "below-minimum" | "no-capacity";
  };


/*
 * Fit a set of commitments into a budget, HIGHEST PRIORITY FIRST.
 *
 * This replaced proportional reduction, and the difference is the whole point.
 * Scaling everything by budget/total is the correct answer to a different
 * question — how to spread one allocation's Aura over a body at equal density,
 * which distribution.ts still does — and the wrong answer to this one. A
 * character holding 200 in Ten and 20 in a technique, whose reserve drops to
 * 200, should lose the technique and keep Ten intact; proportional reduction
 * gave them 181.8 and 18.2, which is a Ten that no longer stops anything and a
 * technique that no longer works. Shortage is supposed to cost you your least
 * important commitment, not degrade all of them at once.
 *
 * The order is priority descending, then allocation ID ascending. The id is a
 * TIE-BREAK and nothing more: it exists so that two callers holding the same
 * commitments in different array orders settle them identically, and it is
 * never allowed to outrank a stated priority. Array order is consulted at no
 * point.
 *
 * A commitment that does not fit takes whatever is left and the remainder
 * drops to zero — so everything below it is released. An INDIVISIBLE one is
 * released instead, and the scan CONTINUES: the capacity it was not given is
 * genuinely free, and handing it to the next commitment down wastes nothing
 * while still preserving every priority above.
 */
export function settleAuraCommitments(
  allocations: readonly AuraAllocation[],
  budget: number,
): readonly SettledCommitment[] {
  const order = [...allocations].sort((left, right) => {
    const byPriority = allocationPriority(right) - allocationPriority(left);

    return byPriority !== 0 ? byPriority : left.id.localeCompare(right.id);
  });

  const settled = new Map<string, SettledCommitment>();

  let remaining = Math.max(0, budget);

  for (const allocation of order) {
    if (allocation.aura <= remaining + BUDGET_EPSILON) {
      settled.set(allocation.id, { kind: "kept", allocation });
      remaining = Math.max(0, remaining - allocation.aura);

      continue;
    }

    const shortfall = allocation.shortfall ?? DEFAULT_AURA_COMMITMENT_SHORTFALL;

    if (shortfall.kind === "remove") {
      settled.set(allocation.id, {
        kind: "released",
        allocation,
        available: remaining,
        reason: "indivisible",
      });

      continue;
    }

    const minimum = shortfall.minimum ?? 0;

    if (remaining <= 0 || remaining + BUDGET_EPSILON < minimum) {
      settled.set(allocation.id, {
        kind: "released",
        allocation,
        available: remaining,
        reason: remaining <= 0 ? "no-capacity" : "below-minimum",
      });

      continue;
    }

    settled.set(allocation.id, {
      kind: "reduced",
      allocation,
      aura: remaining,
      /*
       * Zero Aura cannot have been scaled by anything, so a factor of 0 is
       * reported rather than a division by zero. It is unreachable in practice
       * — a zero-Aura commitment always fits — and is here so that the shape
       * has no undefined case.
       */
      factor: allocation.aura > 0 ? remaining / allocation.aura : 0,
    });

    remaining = 0;
  }

  /* Back into the caller's order, so the result is a parallel list. */
  return allocations.map((allocation) => settled.get(allocation.id)!);
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

  /* 3. The budget, settled by priority rather than shared out. */
  const settled = settleAuraCommitments(surviving, budget.deliberateBudget);

  const settledById = new Map(
    surviving.map((allocation, index) => [allocation.id, settled[index]!]),
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

    const outcome = settledById.get(allocation.id)!;

    if (outcome.kind === "released") {
      changes.push({
        kind: "removed-budget-exhausted",
        allocationId: allocation.id,
        previous: allocation,
        available: outcome.available,
        reason: outcome.reason,
      });

      continue;
    }

    if (outcome.kind === "kept") {
      next.push(allocation);
      changes.push({
        kind: "unchanged",
        allocationId: allocation.id,
        allocation,
      });

      continue;
    }

    const scaled: AuraAllocation = { ...allocation, aura: outcome.aura };

    next.push(scaled);
    changes.push({
      kind: "reduced",
      allocationId: allocation.id,
      previous: allocation,
      allocation: scaled,
      factor: outcome.factor,
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
