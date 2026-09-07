/*
 * The coordinator: procedure, never rules.
 *
 * It runs the lifecycle every coordinated operation shares — validate, price,
 * resolve, settle — and it knows nothing about what any of those steps mean.
 * It cannot tell an Aura cost from an ammunition cost, and it must not learn:
 * the moment it knows that Ren costs Output or that a shove is resisted by
 * Strength, every domain's rules start migrating into one file and the domains
 * stop owning their own mechanics.
 *
 * So this file imports NO gameplay domain. Not Aura, not Body, not Nen, not
 * Combat. It talks to handler interfaces that domains implement, and a
 * dependency test enforces it, because a single convenient import is all it
 * would take to turn this into the universal resolver it exists to prevent.
 *
 *
 * THE OPERATION IS A TRANSACTION
 *
 * Everything happens against a DRAFT — a map from domain to that domain's
 * state, seeded from the caller's originals. Handlers receive the draft's
 * value for their domain and RETURN A REPLACEMENT; they never write to
 * anything they captured. On success the completed draft is the answer. On any
 * failure the draft is discarded and the caller keeps exactly what they had.
 *
 * The first version of this had neither property, and both were wrong in ways
 * that only showed up under load:
 *
 *   - It returned events and outcomes but no state, so handlers smuggled their
 *     results out through closures and a `committedState()` side channel. Two
 *     sources of truth, one of them invisible to the type system.
 *   - It committed costs and THEN routed effects, so an unhandled effect
 *     request returned a failure after the Aura had already left the pool. A
 *     failed operation that spent something is the one outcome the protocol
 *     exists to make impossible.
 *
 *
 * COSTS ARE CUMULATIVE
 *
 * Each cost prepares against the DRAFT AS IT STANDS, not against the original.
 * Preparing every cost against the original state is how two 60-Aura costs
 * both validated against a 100-Aura pool and a character spent 120 they did
 * not have. Chaining the draft makes the second cost see the first one's
 * deduction, which is simply what "cumulative" means.
 *
 *
 * SIMULTANEOUS EFFECTS SETTLE TOGETHER
 *
 * Effects landing on one owner at one instant are handed over as a BATCH with
 * one pre-batch state, and the owner returns one combined replacement. Applying
 * them one at a time lets the second read the first's result, which makes the
 * answer depend on the order the coordinator happened to sort them into — the
 * same defect the Aura solver had for simultaneous events, in a new place.
 *
 * Ordering still exists, and still matters: it fixes the order of the event log
 * and the order batches are handed over. It must not decide a mechanical
 * result, and after this change it cannot.
 */

import type { EngineError } from "../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../infrastructure/result";
import { createTraceNode, type TraceNode } from "../infrastructure/trace";

import { findOperationContextIssues, type RuntimeOperationContext } from "./context";
import type { RuntimeDomain } from "./domains";
import { findDiceIssues, type RuntimeDieRequirement, type RuntimeDieRoll } from "./dice";
import type { RuntimeEvent } from "./events";
import {
  effectiveTimeOf,
  findRequestIssues,
  groupSimultaneousRequests,
  isQuantitativeRequest,
  orderRuntimeRequests,
  type RuntimeRequest,
  type RuntimeRequestOutcome,
} from "./requests";


/**
 * How deep a chain of consequences may run.
 *
 * Effects produce requests, and a batch's outcome may produce further requests
 * — damage causes an Injury which causes a Condition. That is legitimate and
 * finite in every mechanic anybody has designed, so the bound exists to catch
 * the case where it is NOT finite rather than to constrain design. Hitting it
 * is an engine bug, and is reported as one.
 */
export const MAXIMUM_CONSEQUENCE_DEPTH = 8;


/**
 * The transaction draft: every participating domain's state.
 *
 * Opaque values on purpose. The coordinator routes them and never inspects
 * them, which is what keeps it free of every domain it serves.
 */
export type DomainStates = Readonly<Partial<Record<RuntimeDomain, unknown>>>;


/**
 * A validated cost and the draft state that paying it produces.
 *
 * `nextState` is the whole point: preparation is where the arithmetic happens,
 * against the draft as it stands, so the next cost for the same owner sees
 * this one's deduction. Nothing is committed by producing it — the draft is
 * discardable right up until the operation succeeds.
 */
export interface PreparedCost {
  readonly requestId: string;
  readonly domain: RuntimeDomain;

  /** The owner's state after this cost. Replaces the draft's value. */
  readonly nextState: unknown;

  /** What will be paid. Absent for a cost with no magnitude. */
  readonly actual?: number;

  /** The domain's own business, handed back to `commit` untouched. */
  readonly prepared: unknown;
}


export interface CostCommitResult {
  readonly outcome: RuntimeRequestOutcome;
  readonly events: readonly Omit<RuntimeEvent, "sequence">[];
}


/**
 * A domain that owns a resource an operation can spend.
 *
 * `prepare` receives the draft's current value for this domain and returns the
 * replacement. It must be pure: no captured variable is written, no external
 * side effect is performed, and nothing outside the returned state changes.
 * `commit` turns a prepared cost into its outcome and events, and is only ever
 * called after every cost in the operation prepared successfully.
 */
export interface CostHandler {
  readonly domain: RuntimeDomain;

  prepare(
    request: RuntimeRequest,
    state: unknown,
  ): EngineResult<PreparedCost>;

  commit(prepared: PreparedCost): CostCommitResult;
}


export interface EffectBatchResult {
  /** One combined replacement for this owner, covering the whole batch. */
  readonly state: unknown;

  /** One outcome per request in the batch. */
  readonly outcomes: readonly RuntimeRequestOutcome[];

  readonly events: readonly Omit<RuntimeEvent, "sequence">[];

  /** Consequences, resolved at the next depth. */
  readonly requests?: readonly RuntimeRequest[];
}


/**
 * A domain that owns state an operation can affect.
 *
 * Receives the WHOLE simultaneous batch and one pre-batch state, and returns
 * one combined result. It must calculate every member of the batch from the
 * state it was handed rather than from its own running total, because that is
 * exactly what makes the answer independent of the order within the batch.
 *
 * A resist, an immunity or a cap is an `actual` below `requested`. Returning a
 * failure for one would retroactively turn a successful attack into a
 * validation error and refund what it cost.
 */
export interface EffectHandler {
  readonly domain: RuntimeDomain;

  applyBatch(
    requests: readonly RuntimeRequest[],
    state: unknown,
  ): EffectBatchResult;
}


export interface CoordinatedOperation<TResult> {
  readonly context: RuntimeOperationContext;

  /** The starting state of every domain that participates. */
  readonly states: DomainStates;

  /** Dice the operation needs, checked before anything is priced. */
  readonly requiredDice?: readonly RuntimeDieRequirement[];
  readonly dice?: readonly RuntimeDieRoll[];

  /** Mandatory costs. All prepare against the running draft, or none apply. */
  readonly costs: readonly RuntimeRequest[];

  /**
   * The operation's own resolution, run against the post-cost draft.
   *
   * This is where the caller's rules live — the check, the outcome, the effect
   * requests it produces. It may report a FAILED attempt; that is a successful
   * transition containing a failed-check event, not an error.
   */
  resolve(
    dice: readonly RuntimeDieRoll[],
    states: DomainStates,
  ): {
    readonly result: TResult;
    readonly events?: readonly Omit<RuntimeEvent, "sequence">[];
    readonly requests?: readonly RuntimeRequest[];
  };
}


export interface CoordinatedOutcome<TResult> {
  readonly result: TResult;

  /**
   * The authoritative new state of every participating domain.
   *
   * THE answer. Not a convenience beside a side channel — there is no side
   * channel, and a handler that kept one would be returning a state nobody
   * reads while the caller stored a different one.
   */
  readonly states: DomainStates;

  readonly events: readonly RuntimeEvent[];
  readonly costOutcomes: readonly RuntimeRequestOutcome[];
  readonly effectOutcomes: readonly RuntimeRequestOutcome[];
}


export interface CoordinatorHandlers {
  readonly costs: readonly CostHandler[];
  readonly effects: readonly EffectHandler[];
}


function fail(
  root: TraceNode,
  errors: readonly EngineError[],
): EngineResult<never> {
  root.output = false;

  return {
    success: false,
    trace: { root },
    warnings: [],
    errors: errors as NonEmptyArray<EngineError>,
  };
}


/**
 * Index handlers by the domain they own.
 *
 * Two handlers claiming one domain is refused rather than last-one-wins: two
 * owners of one state is not a thing the ownership matrix can express, and
 * silently picking one would make the answer depend on array order in the one
 * place that decides who owns what.
 */
function indexHandlers<THandler extends { readonly domain: RuntimeDomain }>(
  handlers: readonly THandler[],
  what: string,
): { readonly index: Map<RuntimeDomain, THandler>; readonly errors: readonly EngineError[] } {
  const index = new Map<RuntimeDomain, THandler>();
  const errors: EngineError[] = [];

  for (const handler of handlers) {
    if (index.has(handler.domain)) {
      errors.push({
        code: "runtime.handler.duplicate",
        message: `Two ${what} handlers claim to own "${handler.domain}".`,
        audience: "developer",
        required: "one handler per domain",
        actual: handler.domain,
      });

      continue;
    }

    index.set(handler.domain, handler);
  }

  return { index, errors };
}


/**
 * Run one coordinated operation as a transaction.
 *
 *   1. validate the operation context
 *   2. validate the dice
 *   3. validate and index the handlers
 *   4. validate every request at the boundary
 *   5. PREPARE every cost against the running draft   <- cumulative
 *   6. commit the prepared costs into events
 *   7. resolve the operation's own rules on the draft
 *   8. settle effects in simultaneous batches, bounded and cycle-checked
 *   9. return the completed draft
 *
 * Any failure at any step discards the draft entirely. There is no step after
 * which a failure can still have spent something.
 */
export function runCoordinatedOperation<TResult>(
  operation: CoordinatedOperation<TResult>,
  handlers: CoordinatorHandlers,
): EngineResult<CoordinatedOutcome<TResult>> {
  const { context } = operation;

  const root = createTraceNode({
    id: "runtime.operation",
    label: "Coordinated operation",
    inputs: {
      operationId: { value: String(context?.operationId) },
      occurredAt: {
        value: Number.isFinite(context?.occurredAt)
          ? context.occurredAt
          : String(context?.occurredAt),
      },
      costs: { value: operation.costs.length },
    },
  });

  /* ── 1. Context ───────────────────────────────────────────────────── */

  const contextIssues = findOperationContextIssues(context);

  if (contextIssues.length > 0) return fail(root, contextIssues);

  /* ── 2. Dice, before anything is priced ───────────────────────────── */

  const dice = operation.dice ?? [];
  const requiredDice = operation.requiredDice ?? [];

  const diceNode = createTraceNode({
    id: "runtime.operation.dice",
    label: "Validate supplied dice",
    inputs: Object.fromEntries(
      dice.map((roll, index) => [
        `${roll.purpose || `roll-${index}`}`,
        { value: `d${roll.sides}=${roll.value}` },
      ]),
    ),
  });

  root.children.push(diceNode);

  const diceIssues = findDiceIssues(dice, requiredDice);

  if (diceIssues.length > 0) {
    diceNode.output = false;

    return fail(root, diceIssues);
  }

  diceNode.output = true;

  /* ── 3. Handlers ──────────────────────────────────────────────────── */

  const costs = indexHandlers(handlers.costs, "cost");
  const effects = indexHandlers(handlers.effects, "effect");
  const handlerIssues = [...costs.errors, ...effects.errors];

  if (handlerIssues.length > 0) return fail(root, handlerIssues);

  const costIndex = costs.index;
  const effectIndex = effects.index;

  /* ── 4. Requests, at the boundary ─────────────────────────────────── */

  const orderedCosts = orderRuntimeRequests(operation.costs);
  const seenRequestIds = new Set<string>();
  const requestIssues: EngineError[] = [];

  for (const request of orderedCosts) {
    requestIssues.push(...findRequestIssues(request, context.operationId));

    if (seenRequestIds.has(request.requestId)) {
      requestIssues.push({
        code: "runtime.request.duplicate-id",
        message: `Request "${request.requestId}" was supplied more than once.`,
        audience: "developer",
        required: "unique request ids within an operation",
        actual: request.requestId,
      });

      continue;
    }

    seenRequestIds.add(request.requestId);
  }

  if (requestIssues.length > 0) return fail(root, requestIssues);

  /* ── 5. Prepare every cost against the RUNNING draft ──────────────── */

  const prepareNode = createTraceNode({
    id: "runtime.operation.costs.prepare",
    label: "Price every mandatory cost against the draft",
    inputs: { count: { value: orderedCosts.length } },
  });

  root.children.push(prepareNode);

  let draft: DomainStates = { ...operation.states };
  const prepared: PreparedCost[] = [];

  for (const request of orderedCosts) {
    const handler = costIndex.get(request.to);

    if (handler === undefined) {
      prepareNode.output = false;

      return fail(root, [{
        code: "runtime.request.unhandled",
        message: `No handler owns "${request.to}" to pay a ${request.kind} cost.`,
        audience: "developer",
        required: `a cost handler for ${request.to}`,
        actual: handlers.costs.map((one) => one.domain).join(", ") || "none",
      }]);
    }

    /*
     * The draft as it stands, so a second cost for this owner sees the first
     * one's deduction. Preparing against `operation.states` here is the bug
     * that let two 60-Aura costs both pass against 100 Aura.
     */
    const attempt = handler.prepare(request, draft[request.to]);

    prepareNode.children.push(attempt.trace.root);

    if (!attempt.success) {
      prepareNode.output = false;

      return fail(root, attempt.errors);
    }

    const cost = attempt.payload;

    if (cost.domain !== request.to || cost.requestId !== request.requestId) {
      prepareNode.output = false;

      return fail(root, [{
        code: "runtime.cost.prepared-mismatch",
        message:
          "A prepared cost does not match the request it was prepared for.",
        audience: "developer",
        required: `${request.to}/${request.requestId}`,
        actual: `${String(cost.domain)}/${String(cost.requestId)}`,
      }]);
    }

    if (
      isQuantitativeRequest(request) &&
      cost.actual !== undefined &&
      cost.actual < request.requested &&
      request.allowPartial !== true
    ) {
      prepareNode.output = false;

      return fail(root, [{
        code: "runtime.cost.partial-payment-refused",
        message:
          `A ${request.kind} cost could not be paid in full, and this ` +
          "operation does not permit partial payment.",
        audience: "developer",
        required: String(request.requested),
        actual: String(cost.actual),
      }]);
    }

    draft = { ...draft, [request.to]: cost.nextState };
    prepared.push(cost);
  }

  prepareNode.output = true;

  /* ── 6. Turn prepared costs into events. ──────────────────────────── */

  const events: RuntimeEvent[] = [];
  const costOutcomes: RuntimeRequestOutcome[] = [];

  let sequence = 0;

  const record = (partial: readonly Omit<RuntimeEvent, "sequence">[]): void => {
    for (const event of partial) {
      events.push({ ...event, sequence });
      sequence += 1;
    }
  };

  for (const cost of prepared) {
    const committed = costIndex.get(cost.domain)!.commit(cost);

    costOutcomes.push(committed.outcome);
    record(committed.events);
  }

  /* ── 7. The operation's own rules, on the post-cost draft. ────────── */

  const resolved = operation.resolve(dice, draft);

  record(resolved.events ?? []);

  /* ── 8. Effects, settled in simultaneous batches. ─────────────────── */

  const effectOutcomes: RuntimeRequestOutcome[] = [];

  let pending: readonly RuntimeRequest[] = resolved.requests ?? [];
  let depth = 0;

  while (pending.length > 0) {
    if (depth >= MAXIMUM_CONSEQUENCE_DEPTH) {
      return fail(root, [{
        code: "runtime.consequences.too-deep",
        message:
          `Consequences did not settle within ${MAXIMUM_CONSEQUENCE_DEPTH} ` +
          "rounds. A request is producing itself.",
        audience: "developer",
        required: `at most ${MAXIMUM_CONSEQUENCE_DEPTH} levels`,
        actual: String(depth + 1),
      }]);
    }

    const boundaryIssues: EngineError[] = [];

    for (const request of pending) {
      boundaryIssues.push(...findRequestIssues(request, context.operationId));

      if (seenRequestIds.has(request.requestId)) {
        /*
         * The same request id twice is a cycle or a routing bug. Repeated
         * CONTENT is fine — two separate 10-damage requests to one target are
         * two real requests — which is why identity is explicit rather than
         * hashed from the fields.
         */
        boundaryIssues.push({
          code: "runtime.request.duplicate-id",
          message: `Request "${request.requestId}" was raised more than once.`,
          audience: "developer",
          required: "one resolution per request id",
          actual: request.requestId,
        });

        continue;
      }

      seenRequestIds.add(request.requestId);
    }

    if (boundaryIssues.length > 0) return fail(root, boundaryIssues);

    const next: RuntimeRequest[] = [];

    for (const batch of groupSimultaneousRequests(pending)) {
      const handler = effectIndex.get(batch.to);

      if (handler === undefined) {
        return fail(root, [{
          code: "runtime.request.unhandled",
          message:
            `No handler owns "${batch.to}" to apply ` +
            `${batch.requests.map((one) => one.kind).join(", ")}.`,
          audience: "developer",
          required: `an effect handler for ${batch.to}`,
          actual: handlers.effects.map((one) => one.domain).join(", ") || "none",
        }]);
      }

      /*
       * The whole batch, and ONE pre-batch state. Everything in it is
       * calculated from what the owner is handed here, so the order within the
       * batch cannot change the result.
       */
      const applied = handler.applyBatch(batch.requests, draft[batch.to]);

      if (applied.outcomes.length !== batch.requests.length) {
        return fail(root, [{
          code: "runtime.effect.outcome-count-mismatch",
          message:
            `The "${batch.to}" handler returned ${applied.outcomes.length} ` +
            `outcomes for ${batch.requests.length} requests.`,
          audience: "developer",
          required: String(batch.requests.length),
          actual: String(applied.outcomes.length),
        }]);
      }

      draft = { ...draft, [batch.to]: applied.state };

      effectOutcomes.push(...applied.outcomes);
      record(applied.events);

      next.push(...(applied.requests ?? []));
    }

    pending = next;
    depth += 1;
  }

  root.output = {
    committedCosts: costOutcomes.length,
    effects: effectOutcomes.length,
    events: events.length,
    consequenceDepth: depth,
  };

  return {
    success: true,
    payload: {
      result: resolved.result,
      states: draft,
      events,
      costOutcomes,
      effectOutcomes,
    },
    trace: { root },
    warnings: [],
  };
}


/** Re-exported for handlers that need to read a batch's instant. */
export { effectiveTimeOf };
