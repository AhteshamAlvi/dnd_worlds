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
import {
  isRuntimeOwnerRef,
  ownerKey,
  sameOwner,
  type RuntimeDomain,
  type RuntimeOwnerRef,
} from "./domains";
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
 * The transaction draft: every participating OWNER's state.
 *
 * Keyed by `ownerKey()` — "aura:gon", "body:killua" — rather than by domain,
 * because a domain names a KIND of state and an operation between two
 * characters touches two of them. Keying by domain alone silently merged them:
 * the second write won, and a fight resolved as though one person were hitting
 * themselves.
 *
 * Opaque values on purpose. The coordinator routes them and never inspects
 * them, which is what keeps it free of every domain it serves.
 */
export type OwnerStates = Readonly<Record<string, unknown>>;


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

  /** The owner whose state this was priced against, domain and id. */
  readonly owner: RuntimeOwnerRef;

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

  /** The starting state of every owner that participates, by `ownerKey()`. */
  readonly states: OwnerStates;

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
    states: OwnerStates,
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
  readonly states: OwnerStates;

  readonly events: readonly RuntimeEvent[];
  readonly costOutcomes: readonly RuntimeRequestOutcome[];
  readonly effectOutcomes: readonly RuntimeRequestOutcome[];
}


export interface CoordinatorHandlers {
  readonly costs: readonly CostHandler[];
  readonly effects: readonly EffectHandler[];
}


/**
 * A handler may only be called about state that exists.
 *
 * Passing `undefined` through would put every handler one step from inventing
 * a pool out of nothing — `(state as number) ?? 100` is the natural way to
 * write past a missing value, and it would create a character's Aura by
 * accident on the first typo in an owner id. State creation has to be a
 * deliberate operation somebody wrote, never a side effect of addressing
 * something that was not there.
 */
function findMissingStateIssue(
  states: OwnerStates,
  owner: RuntimeOwnerRef,
  what: string,
): EngineError | null {
  const key = ownerKey(owner);

  if (
    Object.prototype.hasOwnProperty.call(states, key) &&
    states[key] !== undefined
  ) {
    return null;
  }

  return {
    code: "runtime.state.missing",
    message:
      `This operation has no state for "${key}", which ${what} is addressed to.`,
    audience: "developer",
    required: key,
    actual: Object.keys(states).sort().join(", ") || "no states supplied",
  };
}


/**
 * One outcome, judged against the request it answers.
 *
 * A quantitative request gets a complete answer or none is accepted: both
 * figures present, both real, and `requested` echoing what was actually asked.
 * A handler quietly reporting a different `requested` than it was given would
 * make the log describe an operation nobody performed, and an absent figure
 * makes "how much of this landed" unanswerable by anything downstream.
 *
 * A NON-quantitative request has no amounts to report, and is not asked to
 * invent any — that is the whole reason amounts left the shared base.
 */
function findOutcomeIssue(
  outcome: RuntimeRequestOutcome,
  request: RuntimeRequest,
  owner: RuntimeOwnerRef,
): EngineError | null {
  const amountIssue = findOutcomeAmountIssue(outcome, owner.domain);

  if (amountIssue !== null) return amountIssue;

  if (!isQuantitativeRequest(request)) return null;

  for (const [field, value] of [
    ["requested", outcome.requested],
    ["actual", outcome.actual],
  ] as const) {
    if (value === undefined) {
      return {
        code: "runtime.outcome.amount.missing",
        message:
          `The "${owner.domain}" handler answered the quantitative request ` +
          `"${request.requestId}" without reporting ${field}.`,
        audience: "developer",
        required: `a ${field} amount`,
        actual: "absent",
      };
    }
  }

  if (outcome.requested !== request.requested) {
    return {
      code: "runtime.outcome.requested.mismatch",
      message:
        `The "${owner.domain}" handler reported a different requested amount ` +
        `than "${request.requestId}" asked for.`,
      audience: "developer",
      required: String(request.requested),
      actual: String(outcome.requested),
    };
  }

  return null;
}


/**
 * An amount a handler reported has to be a real amount.
 *
 * A NaN or a negative `actual` would flow straight into an event and a caller's
 * arithmetic without ever being questioned, and "healed -3 Body Points" reads
 * as data rather than as the bug it is.
 */
function findOutcomeAmountIssue(
  outcome: RuntimeRequestOutcome,
  domain: RuntimeDomain,
): EngineError | null {
  for (const [field, value] of [
    ["requested", outcome.requested],
    ["actual", outcome.actual],
  ] as const) {
    if (value === undefined) continue;

    if (!Number.isFinite(value) || value < 0) {
      return {
        code: "runtime.outcome.amount.invalid",
        message:
          `The "${domain}" handler reported a ${field} amount that is not a ` +
          "finite, non-negative number.",
        audience: "developer",
        required: "finite number >= 0",
        actual: String(value),
      };
    }
  }

  return null;
}


/**
 * Every request in a batch gets exactly one outcome, and no others appear.
 *
 * Counting alone is not enough: a handler that answered one request twice and
 * ignored another would have the right total and the wrong answer, and the
 * request it dropped would silently report nothing at all.
 */
function findBatchOutcomeIssues(
  requests: readonly RuntimeRequest[],
  outcomes: readonly RuntimeRequestOutcome[],
  owner: RuntimeOwnerRef,
): readonly EngineError[] {
  const errors: EngineError[] = [];
  const byRequestId = new Map(requests.map((one) => [one.requestId, one]));
  const expected = new Set(byRequestId.keys());
  const answered = new Set<string>();

  for (const outcome of outcomes) {
    if (!expected.has(outcome.requestId)) {
      errors.push({
        code: "runtime.effect.outcome-unexpected",
        message:
          `The "${owner.domain}" handler reported an outcome for ` +
          `"${String(outcome.requestId)}", which was not in its batch.`,
        audience: "developer",
        required: [...expected].join(", "),
        actual: String(outcome.requestId),
      });

      continue;
    }

    if (answered.has(outcome.requestId)) {
      errors.push({
        code: "runtime.effect.outcome-duplicate",
        message:
          `The "${owner.domain}" handler answered ` +
          `"${outcome.requestId}" more than once.`,
        audience: "developer",
        required: "one outcome per request",
        actual: outcome.requestId,
      });

      continue;
    }

    answered.add(outcome.requestId);

    const issue = findOutcomeIssue(
      outcome,
      byRequestId.get(outcome.requestId)!,
      owner,
    );

    if (issue !== null) errors.push(issue);
  }

  for (const requestId of expected) {
    if (!answered.has(requestId)) {
      errors.push({
        code: "runtime.effect.outcome-missing",
        message:
          `The "${owner.domain}" handler returned no outcome for ` +
          `"${requestId}".`,
        audience: "developer",
        required: requestId,
        actual: "absent",
      });
    }
  }

  return errors;
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
    requestIssues.push(
      ...findRequestIssues(request, context.operationId, "cost"),
    );

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

  let draft: OwnerStates = { ...operation.states };
  const prepared: PreparedCost[] = [];

  for (const request of orderedCosts) {
    const handler = costIndex.get(request.to.domain);

    if (handler === undefined) {
      prepareNode.output = false;

      return fail(root, [{
        code: "runtime.request.unhandled",
        message:
          `No handler owns "${request.to.domain}" to pay a ${request.kind} cost.`,
        audience: "developer",
        required: `a cost handler for ${request.to.domain}`,
        actual: handlers.costs.map((one) => one.domain).join(", ") || "none",
      }]);
    }

    /*
     * The draft as it stands, so a second cost for this owner sees the first
     * one's deduction. Preparing against `operation.states` here is the bug
     * that let two 60-Aura costs both pass against 100 Aura.
     */
    const stateIssue = findMissingStateIssue(draft, request.to, request.kind);

    if (stateIssue !== null) {
      prepareNode.output = false;

      return fail(root, [stateIssue]);
    }

    const attempt = handler.prepare(request, draft[ownerKey(request.to)]);

    prepareNode.children.push(attempt.trace.root);

    if (!attempt.success) {
      prepareNode.output = false;

      return fail(root, attempt.errors);
    }

    const cost = attempt.payload;

    /*
     * `isRuntimeOwnerRef` first, because a handler that returned no owner at
     * all would otherwise crash the comparison — and an engine that throws on
     * malformed handler output is worse than one that reports it, since the
     * throw escapes the transaction and takes the trace with it.
     */
    if (
      !isRuntimeOwnerRef(cost.owner) ||
      !sameOwner(cost.owner, request.to) ||
      cost.requestId !== request.requestId
    ) {
      prepareNode.output = false;

      return fail(root, [{
        code: "runtime.cost.prepared-mismatch",
        message:
          "A prepared cost does not match the request it was prepared for.",
        audience: "developer",
        required: `${ownerKey(request.to)}/${request.requestId}`,
        actual: `${String(cost.owner?.domain)}:${String(cost.owner?.id)}/${String(cost.requestId)}`,
      }]);
    }

    if (isQuantitativeRequest(request)) {
      /*
       * A quantitative cost MUST say what it will pay.
       *
       * The full-payment check used to skip when `actual` was absent, which
       * made omitting it a way past the very rule it guards: a handler that
       * reported no figure could underpay a cost that forbids underpaying, and
       * nothing downstream would know how much had actually left the pool.
       */
      if (cost.actual === undefined) {
        prepareNode.output = false;

        return fail(root, [{
          code: "runtime.cost.actual.missing",
          message:
            `A quantitative ${request.kind} cost was prepared without saying ` +
            "how much it will pay.",
          audience: "developer",
          required: "an actual amount",
          actual: "absent",
        }]);
      }

      if (!Number.isFinite(cost.actual) || cost.actual < 0) {
        prepareNode.output = false;

        return fail(root, [{
          code: "runtime.outcome.amount.invalid",
          message: `A ${request.kind} cost prepared an impossible amount.`,
          audience: "developer",
          required: "finite number >= 0",
          actual: String(cost.actual),
        }]);
      }

      if (cost.actual < request.requested && request.allowPartial !== true) {
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
    }

    draft = { ...draft, [ownerKey(request.to)]: cost.nextState };
    prepared.push(cost);
  }

  prepareNode.output = true;

  /* ── 6. Turn prepared costs into events. ──────────────────────────── */

  const events: RuntimeEvent[] = [];
  const costOutcomes: RuntimeRequestOutcome[] = [];

  const costsByRequestId = new Map(
    orderedCosts.map((one) => [one.requestId, one]),
  );

  let sequence = 0;

  const record = (partial: readonly Omit<RuntimeEvent, "sequence">[]): void => {
    for (const event of partial) {
      events.push({ ...event, sequence });
      sequence += 1;
    }
  };

  for (const cost of prepared) {
    const committed = costIndex.get(cost.owner.domain)!.commit(cost);

    if (committed.outcome.requestId !== cost.requestId) {
      return fail(root, [{
        code: "runtime.cost.outcome-mismatch",
        message:
          `The "${cost.owner.domain}" handler reported an outcome for a ` +
          "different request than the one it committed.",
        audience: "developer",
        required: cost.requestId,
        actual: String(committed.outcome.requestId),
      }]);
    }

    const outcomeIssue = findOutcomeIssue(
      committed.outcome,
      costsByRequestId.get(cost.requestId)!,
      cost.owner,
    );

    if (outcomeIssue !== null) return fail(root, [outcomeIssue]);

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
      boundaryIssues.push(
        ...findRequestIssues(request, context.operationId, "effect"),
      );

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
      const handler = effectIndex.get(batch.to.domain);

      if (handler === undefined) {
        return fail(root, [{
          code: "runtime.request.unhandled",
          message:
            `No handler owns "${batch.to.domain}" to apply ` +
            `${batch.requests.map((one) => one.kind).join(", ")}.`,
          audience: "developer",
          required: `an effect handler for ${batch.to.domain}`,
          actual: handlers.effects.map((one) => one.domain).join(", ") || "none",
        }]);
      }

      /*
       * The whole batch, and ONE pre-batch state. Everything in it is
       * calculated from what the owner is handed here, so the order within the
       * batch cannot change the result.
       */
      const stateIssue = findMissingStateIssue(
        draft,
        batch.to,
        batch.requests.map((one) => one.kind).join(", "),
      );

      if (stateIssue !== null) return fail(root, [stateIssue]);

      const applied = handler.applyBatch(
        batch.requests,
        draft[ownerKey(batch.to)],
      );

      const outcomeIssues = findBatchOutcomeIssues(
        batch.requests,
        applied.outcomes,
        batch.to,
      );

      if (outcomeIssues.length > 0) return fail(root, outcomeIssues);

      draft = { ...draft, [ownerKey(batch.to)]: applied.state };

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
