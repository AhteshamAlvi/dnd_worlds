/*
 * Immutable Aura state transitions.
 *
 * Every way a character's stored Aura legitimately changes lives here, and all
 * of them share one shape: take the current state, take the context it has to
 * be judged against, and return a NEW state plus an account of what changed.
 * Nothing is mutated, and a failure leaves the caller holding exactly what
 * they passed in.
 *
 *
 * WHAT THE POOL AND THE PLACEMENT HAVE TO DO WITH EACH OTHER
 * ----------------------------------------------------------
 *
 * Almost nothing, and that is the load-bearing rule.
 *
 * Moving Aura around the body never costs Aura. Allocations are Output —
 * capacity the character is directing — and directing it somewhere else is
 * free. Only DELIBERATE EXPENDITURE and INVOLUNTARY DRAIN reduce Current Aura.
 * Losing the limb an allocation was on does not drain a character either; the
 * Aura returns to unallocated Output.
 *
 * The one direction the dependency does run is downward: Current Aura caps
 * usable Output, so DRAINING a character can leave them holding more Aura in
 * place than they can now supply. That is what reconciliation is for, and why
 * every operation here ends with it rather than only the allocation ones.
 *
 *
 * CONTROL APPLIES TO EXPENDITURE AND NOTHING ELSE
 * -----------------------------------------------
 *
 * spendAura routes through the DEX-derived Control multiplier, because a
 * deliberate expenditure is exactly what Control describes the efficiency of.
 * drainAura bypasses it completely: leakage, a hostile drain and every other
 * forced loss take what they take, and being dexterous is no defence against
 * having Aura torn out of you.
 *
 *
 * WHAT RECONCILIATION IS ALLOWED TO DO
 * ------------------------------------
 *
 * Reduce and remove, never restore. It removes allocations whose anatomy is
 * not manifested or whose placement the character's access no longer permits,
 * and scales the rest down proportionally when the budget no longer covers
 * them. It never grows an allocation back when Aura returns, because the
 * character did not ask it to — re-committing Output is a decision, and
 * decisions come from the caller. budget.ts owns the whole of it, shared with
 * the central resolver so the two cannot disagree.
 */

import type { EngineError } from "../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../../infrastructure/trace";
import type { ContinuityKey } from "../body/anatomy/types";

import type { PhysicalExertionLoad } from "../body/endurance";

import { findAuraPlacementIssues } from "./access";
import {
  reconcileAuraAllocations,
  resolveAuraBudget,
  type AuraBudget,
  type AuraTransitionContext,
} from "./budget";
import { applyAuraControl, deriveAuraControl } from "./control";
import {
  resolveActionAuraCostFor,
  type AuraActionCostRequest,
} from "./expenditure";
import {
  isLocalizedAllocation,
  totalAllocatedAura,
  type AuraAllocation,
  type CharacterAuraState,
} from "./state";
import {
  auraAllocationIssueToEngineError,
  findAuraAllocationIssues,
} from "./validation";
import { emptyAuraBalance } from "./types";
import type {
  AuraAllocationChange,
  AuraBalance,
  AuraExpenditure,
} from "./types";


/* ── What a transition reports ──────────────────────────────────────────── */

/*
 * One allocation's fate is declared in types.ts and re-exported here.
 *
 * Shared with resolution rather than declared twice: the reductions and
 * removals a transition reports are the same ones the resolver reports when it
 * reconciles a profile, and a sheet should not need two renderers for them.
 */
export type { AuraAllocationChange } from "./types";


/*
 * The result of one transition: the new state, and enough to explain it.
 *
 * `currentChange` is carried rather than left as a subtraction for the caller,
 * so that gameplay, a trace and the Workbench are all quoting the same number
 * — and so a transition that deliberately changed nothing reports 0 rather
 * than looking like it forgot to.
 */
export interface AuraStateTransition {
  readonly state: CharacterAuraState;

  readonly previousCurrent: number;
  readonly current: number;
  readonly currentChange: number;

  /*
   * Which of the seven ways Aura moves this transition used, itemised.
   *
   * Present on every transition, with the untouched terms at zero, so a
   * consumer never has to know which operation produced a result in order to
   * read it. `currentChange` is the same number as `balance.net` unless the
   * pool clamped — an over-recovery capped at Maximum Aura is exactly the case
   * where the two differ, and both figures are worth having.
   */
  readonly balance: AuraBalance;

  /** Present only for deliberate expenditure. */
  readonly expenditure?: AuraExpenditure;

  readonly allocationChanges: readonly AuraAllocationChange[];
}


/* ── Shared plumbing ────────────────────────────────────────────────────── */

/*
 * A transition's root node, left OPEN.
 *
 * `output` and `children` are filled in as the transition runs, because a
 * failure has to carry the same explanation of how far it got that a success
 * does — a caller debugging a refused expenditure needs the Control
 * derivation, not an empty node.
 */
function transitionTrace(
  id: string,
  label: string,
  inputs: TraceNode["inputs"],
): TraceNode {
  return createTraceNode({ id, label, inputs });
}


function failed(
  root: TraceNode,
  errors: readonly EngineError[],
): EngineResult<AuraStateTransition> {
  root.output = false;

  return {
    success: false,
    trace: { root },
    warnings: [],
    errors: errors as NonEmptyArray<EngineError>,
  };
}


/*
 * Reconcile a state and package the result.
 *
 * Every operation ends here, including the ones that only changed Current
 * Aura, because Current Aura caps usable Output and a drain can therefore
 * invalidate a placement nobody touched.
 *
 * Exported for time.ts, which produces a WIDER result — wakefulness, Fatigue,
 * collapse — around exactly this one. Having it build its own settling step
 * would be a second implementation of reconciliation free to disagree with
 * this one about what a drained character is still holding.
 */
export function settleAuraTransition(
  previous: CharacterAuraState,
  current: number,
  allocations: readonly AuraAllocation[],
  context: AuraTransitionContext,
  root: TraceNode,
  priorChanges: readonly AuraAllocationChange[],
  balance: AuraBalance,
  expenditure?: AuraExpenditure,
): EngineResult<AuraStateTransition> {
  const budget = resolveAuraBudget(current, context);

  if (!budget.success) return failed(root, budget.errors);

  root.children.push(budget.payload.trace);

  const reconciled = reconcileAuraAllocations(
    allocations,
    budget.payload,
    context,
  );

  if (!reconciled.success) return failed(root, reconciled.errors);

  root.children.push(reconciled.trace.root);

  /*
   * Prior changes describe what the CALLER asked for; reconciliation describes
   * what the engine then had to do about it. Merging them by id keeps one
   * entry per allocation, with the engine's verdict winning when it is more
   * specific than "unchanged".
   */
  const merged = new Map<string, AuraAllocationChange>();

  for (const change of priorChanges) merged.set(change.allocationId, change);

  for (const change of reconciled.payload.changes) {
    if (change.kind === "unchanged" && merged.has(change.allocationId)) continue;

    merged.set(change.allocationId, change);
  }

  const state: CharacterAuraState = {
    current,
    allocations: reconciled.payload.allocations,
  };

  root.output = {
    previousCurrent: previous.current,
    current,
    allocations: state.allocations.length,
  };

  return {
    success: true,
    payload: {
      state,
      previousCurrent: previous.current,
      current,
      currentChange: current - previous.current,
      balance,
      ...(expenditure === undefined ? {} : { expenditure }),
      allocationChanges: [...merged.values()],
    },
    trace: { root },
    warnings: [],
  };
}


/* ── Deliberate expenditure ─────────────────────────────────────────────── */

/**
 * Spend Aura on purpose.
 *
 *   Final Cost = Base Cost x resolved Control Multiplier
 *
 * The Base Cost is what the mechanic producing the expenditure asks for;
 * Control decides what the character actually pays. The Final Cost is NOT
 * rounded — fractional Aura has to survive continuous-time upkeep — and it is
 * deducted whole or not at all.
 *
 * There is no partial spend. A character who cannot afford an application does
 * not perform a weaker version of it by default; a mechanic that wants that
 * has to ask for a smaller Base Cost.
 */
export function spendAura(
  state: CharacterAuraState,
  context: AuraTransitionContext,
  baseCost: number,
): EngineResult<AuraStateTransition> {
  const root = transitionTrace(
    "aura.transition.spend",
    "Spend Aura",
    {
      baseCost: {
        value: Number.isFinite(baseCost) ? baseCost : String(baseCost),
      },
      currentAura: {
        value: Number.isFinite(state.current)
          ? state.current
          : String(state.current),
      },
    },
  );

  if (!Number.isFinite(baseCost) || baseCost < 0) {
    return failed(root, [{
      code: "aura.control.base_cost.invalid",
      message: "Base Aura Cost must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(baseCost) ? baseCost : String(baseCost),
    }]);
  }

  const control = deriveAuraControl(context.attributes.dex);

  root.children.push(control.trace.root);

  if (!control.success) return failed(root, control.errors);

  const expenditure = applyAuraControl(baseCost, control.payload);

  if (expenditure.finalCost > state.current) {
    return failed(root, [{
      code: "aura.expenditure.insufficient",
      message: "The character does not have enough Aura for this expenditure.",
      audience: "player",
      required: expenditure.finalCost,
      actual: state.current,
      resolution:
        "Lower the Base Cost, recover Aura, or raise DEX to reduce the Control multiplier.",
    }]);
  }

  return settleAuraTransition(
    state,
    state.current - expenditure.finalCost,
    state.allocations,
    context,
    root,
    [],
    {
      ...emptyAuraBalance(),
      deliberate: expenditure.finalCost,
      net: -expenditure.finalCost,
    },
    expenditure,
  );
}


/* ── Physical and Aura-enhanced actions ─────────────────────────────────── */

/**
 * Pay for one action: bodily effort, deliberate Aura, or both at once.
 *
 * The two costs have two different efficiency terms and are never mixed:
 *
 *   physical    = maximumAura x 0.001 x exertionLoad x staminaMultiplier
 *   deliberate  = baseAuraCost x controlMultiplier
 *
 * Stamina touches only the first. Control touches only the second. A clumsy
 * character does not tire faster from swinging a sword, and a frail one does
 * not project Nen less efficiently.
 *
 * Both are charged in ONE transition rather than through two calls, because
 * two calls can half-succeed: a character who paid the physical cost of a
 * Nen-enhanced strike and then could not afford the Aura has bought nothing
 * and lost something. Here the whole action is affordable or none of it
 * happens.
 *
 * REQUIRED OUTPUT is checked and not spent. An application may need Aura held
 * on the body to work while consuming none of it, and charging for it would
 * bill a character for standing still in Ren.
 */
export function spendActionAura(
  state: CharacterAuraState,
  context: AuraTransitionContext,
  request: AuraActionCostRequest,
): EngineResult<AuraStateTransition> {
  const root = transitionTrace(
    "aura.transition.action",
    "Spend Aura on an action",
    {
      exertionLoad: { value: request.exertionLoad ?? 0 },
      baseAuraCost: { value: request.baseAuraCost ?? 0 },
      requiredOutput: { value: request.requiredOutput ?? 0 },
      currentAura: {
        value: Number.isFinite(state.current)
          ? state.current
          : String(state.current),
      },
    },
  );

  const cost = resolveActionAuraCostFor(state, context, request);

  root.children.push(cost.trace.root);

  if (!cost.success) return failed(root, cost.errors);

  const { physical, deliberate, total } = cost.payload;

  if (total > state.current) {
    return failed(root, [{
      code: "aura.expenditure.insufficient",
      message: "The character does not have enough Aura for this action.",
      audience: "player",
      required: total,
      actual: state.current,
      resolution:
        "Act with less exertion, drop the Aura enhancement, or recover first.",
    }]);
  }

  return settleAuraTransition(
    state,
    state.current - total,
    state.allocations,
    context,
    root,
    [],
    {
      ...emptyAuraBalance(),
      physical: physical.cost,
      deliberate: deliberate?.finalCost ?? 0,
      net: -total,
    },
    deliberate ?? undefined,
  );
}


/**
 * Pay for bodily effort alone.
 *
 * Delegates, so an unenhanced swing is judged by exactly the same rules an
 * enhanced one is. Works before and after awakening: an unawakened character
 * has a real Aura pool and their body burns it the same way, because awakening
 * gates deliberate projection rather than metabolism.
 */
export function spendPhysicalAura(
  state: CharacterAuraState,
  context: AuraTransitionContext,
  exertionLoad: PhysicalExertionLoad,
): EngineResult<AuraStateTransition> {
  return spendActionAura(state, context, { exertionLoad });
}


/* ── Involuntary loss ───────────────────────────────────────────────────── */

/**
 * Lose Aura without choosing to.
 *
 * The operation future leakage, hostile effects and every other forced loss
 * routes through. It bypasses Control entirely — precision does not make Aura
 * harder to take from you — and it applies regardless of awakening or
 * deliberate access, because an unawakened character possesses Aura and can
 * absolutely be drained of it.
 *
 * Rejected atomically when the amount exceeds what is there. A drain that
 * "would have" taken more than the character has is a question about what
 * happens at zero — unconsciousness, forced Zetsu, collapse — and those are
 * later tickets' answers, not a silent clamp here.
 */
export function drainAura(
  state: CharacterAuraState,
  context: AuraTransitionContext,
  amount: number,
): EngineResult<AuraStateTransition> {
  const root = transitionTrace(
    "aura.transition.drain",
    "Drain Aura",
    {
      amount: { value: Number.isFinite(amount) ? amount : String(amount) },
      currentAura: {
        value: Number.isFinite(state.current)
          ? state.current
          : String(state.current),
      },
    },
  );

  if (!Number.isFinite(amount) || amount < 0) {
    return failed(root, [{
      code: "aura.drain.amount.invalid",
      message: "Drained Aura must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(amount) ? amount : String(amount),
    }]);
  }

  if (amount > state.current) {
    return failed(root, [{
      code: "aura.drain.excessive",
      message: "More Aura was drained than the character has.",
      audience: "developer",
      required: `<= ${state.current}`,
      actual: amount,
      resolution:
        "Clamp the drain to the character's Current Aura before applying it, and handle reaching zero explicitly.",
    }]);
  }

  return settleAuraTransition(
    state,
    state.current - amount,
    state.allocations,
    context,
    root,
    [],
    { ...emptyAuraBalance(), forcedDrain: amount, net: -amount },
  );
}


/* ── Allocation transitions ─────────────────────────────────────────────── */

/*
 * Every way a proposed set of allocations can be refused.
 *
 * One function, called by one operation, because upsert, remove and clear all
 * delegate to replaceAuraAllocations — three entry points and one rule set,
 * rather than three chances to check a slightly different list of things.
 */
function findAllocationRejections(
  allocations: readonly AuraAllocation[],
  budget: AuraBudget,
  context: AuraTransitionContext,
): readonly EngineError[] {
  const structural = findAuraAllocationIssues(allocations);

  /*
   * Structural problems come first and alone. A duplicate id makes every
   * question below ambiguous, and reporting "over Output" about a list that
   * cannot be read is noise on top of the real answer.
   */
  if (structural.length > 0) {
    return structural.map(auraAllocationIssueToEngineError);
  }

  const errors: EngineError[] = [
    ...findAuraPlacementIssues(allocations, budget.access),
  ];

  /*
   * A localized allocation aimed at anatomy that is not there is REFUSED here,
   * where reconciliation would merely remove it. The difference is who asked:
   * a caller deliberately reinforcing an arm that does not exist has made a
   * mistake and should be told, whereas an arm that was severed after the fact
   * is the world changing under a decision that was sound when it was made.
   */
  const manifested = new Set<ContinuityKey>();

  for (const part of context.anatomy.parts) {
    if (part.state !== "active") continue;
    if (context.bodyMeasurements.byPartId[part.id] === undefined) continue;

    manifested.add(part.continuityKey);
  }

  for (const allocation of allocations) {
    if (!isLocalizedAllocation(allocation)) continue;
    if (manifested.has(allocation.continuityKey)) continue;

    errors.push({
      code: "aura.allocation.identity.not_manifested",
      message:
        "No present Body Part stands in the anatomical identity this allocation targets.",
      audience: "player",
      required: "a manifested continuity identity",
      actual: allocation.continuityKey,
      resolution:
        "Target an identity the current form expresses, or use whole-body coverage.",
    });
  }

  const total = totalAllocatedAura(allocations);

  if (total > budget.deliberateBudget) {
    errors.push({
      code: "aura.allocation.over_output",
      message:
        "More Aura is allocated than the character's usable Output can supply.",
      audience: "player",
      required: budget.deliberateBudget,
      actual: total,
      resolution: budget.automaticAura > 0
        ? `Automatic Aura already commits ${budget.automaticAura} of ${budget.usableOutput} usable Output.`
        : "Reduce an allocation, or raise accessible Output before placing it.",
    });
  }

  return errors;
}


/*
 * What changed between two allocation lists, by id.
 *
 * Ids are the identity here rather than positions, because a caller replacing
 * a list has no obligation to keep its order and an order-sensitive diff would
 * report a reshuffle as a wholesale replacement.
 */
function diffAllocations(
  previous: readonly AuraAllocation[],
  next: readonly AuraAllocation[],
): readonly AuraAllocationChange[] {
  const previousById = new Map(
    previous.map((allocation) => [allocation.id, allocation]),
  );
  const nextById = new Map(
    next.map((allocation) => [allocation.id, allocation]),
  );

  const changes: AuraAllocationChange[] = [];

  for (const allocation of next) {
    const before = previousById.get(allocation.id);

    if (before === undefined) {
      changes.push({
        kind: "added",
        allocationId: allocation.id,
        allocation,
      });

      continue;
    }

    if (
      before.aura === allocation.aura &&
      before.coverage === allocation.coverage &&
      before.placement === allocation.placement &&
      (!isLocalizedAllocation(before) ||
        !isLocalizedAllocation(allocation) ||
        before.continuityKey === allocation.continuityKey)
    ) {
      changes.push({
        kind: "unchanged",
        allocationId: allocation.id,
        allocation,
      });

      continue;
    }

    changes.push({
      kind: "replaced",
      allocationId: allocation.id,
      previous: before,
      allocation,
    });
  }

  for (const allocation of previous) {
    if (nextById.has(allocation.id)) continue;

    changes.push({
      kind: "removed",
      allocationId: allocation.id,
      previous: allocation,
    });
  }

  return changes;
}


/**
 * Replace the character's allocations wholesale.
 *
 * The PRIMARY allocation operation, and the only one that validates. Upsert,
 * remove and clear each build the list they want and hand it here, so there is
 * exactly one place that decides whether a set of allocations is legal and
 * exactly one place that can be wrong about it.
 *
 * Current Aura is untouched. Reallocating Output is free; only expenditure and
 * drain cost anything.
 */
export function replaceAuraAllocations(
  state: CharacterAuraState,
  context: AuraTransitionContext,
  allocations: readonly AuraAllocation[],
): EngineResult<AuraStateTransition> {
  const root = transitionTrace(
    "aura.transition.allocations",
    "Replace Aura allocations",
    {
      previous: { value: state.allocations.length },
      proposed: { value: allocations.length },
    },
  );

  const budget = resolveAuraBudget(state.current, context);

  if (!budget.success) return failed(root, budget.errors);

  root.children.push(budget.payload.trace);

  const rejections = findAllocationRejections(
    allocations,
    budget.payload,
    context,
  );

  if (rejections.length > 0) return failed(root, rejections);

  return settleAuraTransition(
    state,
    state.current,
    allocations,
    context,
    root,
    diffAllocations(state.allocations, allocations),
    emptyAuraBalance(),
  );
}


/**
 * Add one allocation, or replace the one already using its id.
 *
 * Delegates, so an upserted allocation is judged by exactly the same rules a
 * wholesale replacement is.
 */
export function upsertAuraAllocation(
  state: CharacterAuraState,
  context: AuraTransitionContext,
  allocation: AuraAllocation,
): EngineResult<AuraStateTransition> {
  const replaced = state.allocations.some(
    (existing) => existing.id === allocation.id,
  );

  const allocations = replaced
    ? state.allocations.map((existing) =>
      existing.id === allocation.id ? allocation : existing
    )
    : [...state.allocations, allocation];

  return replaceAuraAllocations(state, context, allocations);
}


/**
 * Remove one allocation by id.
 *
 * Removing an id that is not there is refused rather than treated as a
 * successful no-op: the caller believes they are holding an allocation that
 * does not exist, and returning success would confirm a belief that is wrong.
 */
export function removeAuraAllocation(
  state: CharacterAuraState,
  context: AuraTransitionContext,
  allocationId: string,
): EngineResult<AuraStateTransition> {
  const present = state.allocations.some(
    (allocation) => allocation.id === allocationId,
  );

  if (!present) {
    return failed(
      transitionTrace(
        "aura.transition.allocations",
        "Remove Aura allocation",
        { allocationId: { value: allocationId } },
      ),
      [{
        code: "aura.allocation.not_found",
        message: "No Aura allocation with that id is on this character.",
        audience: "developer",
        required: "an existing allocation id",
        actual: allocationId,
      }],
    );
  }

  return replaceAuraAllocations(
    state,
    context,
    state.allocations.filter((allocation) => allocation.id !== allocationId),
  );
}


/** Drop every allocation. Current Aura is untouched. */
export function clearAuraAllocations(
  state: CharacterAuraState,
  context: AuraTransitionContext,
): EngineResult<AuraStateTransition> {
  return replaceAuraAllocations(state, context, []);
}


/**
 * Bring stored Aura back into agreement with the body and the budget.
 *
 * Called on its own after anything OUTSIDE the Aura domain changes what the
 * character can support — a transformation, an amputation, a regeneration, an
 * Attribute change, a principle starting or stopping. The Aura operations
 * above already end with it.
 *
 * It never raises an allocation and never touches Current Aura. Anatomy
 * disappearing is not a drain.
 */
export function reconcileAuraState(
  state: CharacterAuraState,
  context: AuraTransitionContext,
): EngineResult<AuraStateTransition> {
  const root = transitionTrace(
    "aura.transition.reconcile",
    "Reconcile Aura state",
    {
      currentAura: {
        value: Number.isFinite(state.current)
          ? state.current
          : String(state.current),
      },
      allocations: { value: state.allocations.length },
    },
  );

  /*
   * Structural problems are refused rather than reconciled. Reconciliation
   * answers "this was legal and the world moved"; a duplicate id was never
   * legal, and quietly repairing one would hide a bug in whatever wrote it.
   */
  const structural = findAuraAllocationIssues(state.allocations);

  if (structural.length > 0) {
    return failed(root, structural.map(auraAllocationIssueToEngineError));
  }

  return settleAuraTransition(
    state,
    state.current,
    state.allocations,
    context,
    root,
    [],
    emptyAuraBalance(),
  );
}
