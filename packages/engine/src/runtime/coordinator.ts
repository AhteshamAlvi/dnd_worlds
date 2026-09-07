/*
 * The coordinator: procedure, never rules.
 *
 * It runs the lifecycle every coordinated operation shares — validate, price,
 * commit, resolve, consequence — and it knows nothing about what any of those
 * steps mean. It cannot tell an Aura cost from an ammunition cost, and it must
 * not learn: the moment it knows that Ren costs Output or that a shove is
 * resisted by Strength, every domain's rules start migrating into one file and
 * the domains stop owning their own mechanics.
 *
 * So this file imports NO gameplay domain. Not Aura, not Body, not Nen, not
 * Combat. It talks to handler interfaces that domains implement, and a
 * dependency test enforces it, because a single convenient import is all it
 * would take to turn this into the universal resolver it exists to prevent.
 *
 *
 * WHY COST HANDLERS ARE TWO-PHASE
 *
 * The rule is "validate every mandatory cost, and if any fails commit none".
 * That is unimplementable when a domain's only entry point validates and
 * applies in one call: by the time the second cost refuses, the first is
 * already spent and there is nothing to roll back to that the coordinator is
 * allowed to construct.
 *
 * So a cost handler offers `prepare` and `commit`. `prepare` validates against
 * current state and returns an opaque token holding whatever the domain needs;
 * it changes nothing. `commit` takes the token and produces the new state. The
 * coordinator prepares everything, and only then commits anything.
 *
 *
 * VALIDATION FAILURE VERSUS FAILED ATTEMPT
 *
 * These are different outcomes and the whole protocol turns on keeping them
 * apart. An operation that cannot BEGIN — unknown target, missing mastery,
 * unaffordable, malformed dice — fails, and spends nothing. An operation that
 * begins and then goes badly — the attack misses, the technique is resisted —
 * SUCCEEDS, keeps its committed costs, and reports the miss as an event.
 *
 * Merging them either refunds the Aura and the Action every time someone
 * misses, or makes a wiring bug indistinguishable from bad luck.
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
  orderRuntimeRequests,
  type RuntimeRequest,
  type RuntimeRequestOutcome,
} from "./requests";


/**
 * How deep a chain of consequences may run.
 *
 * Effects produce requests, and a request's outcome may produce further
 * requests — damage causes an Injury which causes a Condition. That is
 * legitimate and finite in every mechanic anybody has designed, so the bound
 * exists to catch the case where it is NOT finite rather than to constrain
 * design. Hitting it is an engine bug, and is reported as one.
 */
export const MAXIMUM_CONSEQUENCE_DEPTH = 8;


/**
 * A validated, not-yet-applied cost.
 *
 * Opaque to the coordinator on purpose. Whatever the domain needs to carry
 * from `prepare` to `commit` goes in `prepared`, and the coordinator only ever
 * hands it back.
 */
export interface PreparedCost {
  readonly requestId: string;
  readonly domain: RuntimeDomain;

  /** What will actually be paid, which may be under `requested` only when
   * the request allowed partial payment. */
  readonly actual: number;

  /** The domain's own business. */
  readonly prepared: unknown;
}


export interface CostCommitResult {
  readonly outcome: RuntimeRequestOutcome;
  readonly events: readonly Omit<RuntimeEvent, "sequence">[];
}


/**
 * A domain that owns a resource an operation can spend.
 *
 * `prepare` must not change anything. `commit` is only ever called with a
 * token `prepare` returned, and only after every other cost in the operation
 * has prepared successfully.
 */
export interface CostHandler {
  readonly domain: RuntimeDomain;

  prepare(request: RuntimeRequest): EngineResult<PreparedCost>;

  commit(prepared: PreparedCost): CostCommitResult;
}


export interface EffectApplication {
  readonly outcome: RuntimeRequestOutcome;
  readonly events: readonly Omit<RuntimeEvent, "sequence">[];

  /** Consequences of applying this effect, resolved on the next depth. */
  readonly requests?: readonly RuntimeRequest[];
}


/**
 * A domain that owns state an operation can affect.
 *
 * A resist, an immunity or a cap is an `actual` below `requested` — a real
 * result of a real operation. Returning a FAILURE for one would retroactively
 * turn a successful attack into a validation error and refund what it cost.
 */
export interface EffectHandler {
  readonly domain: RuntimeDomain;

  apply(request: RuntimeRequest): EffectApplication;
}


export interface CoordinatedOperation<TResult> {
  readonly context: RuntimeOperationContext;

  /** Dice the operation needs, checked before anything commits. */
  readonly requiredDice?: readonly RuntimeDieRequirement[];
  readonly dice?: readonly RuntimeDieRoll[];

  /** Mandatory costs. All prepare, or none commits. */
  readonly costs: readonly RuntimeRequest[];

  /**
   * The operation's own resolution, run after costs are committed.
   *
   * This is where the caller's rules live — the check, the outcome, the effect
   * requests it produces. It may report a FAILED attempt; that is a successful
   * transition with a failed-check event, not an error.
   */
  resolve(dice: readonly RuntimeDieRoll[]): {
    readonly result: TResult;
    readonly events?: readonly Omit<RuntimeEvent, "sequence">[];
    readonly requests?: readonly RuntimeRequest[];
  };
}


export interface CoordinatedOutcome<TResult> {
  readonly result: TResult;
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
 * Run one coordinated operation.
 *
 * The lifecycle, in the order the protocol fixes:
 *
 *   1. validate the operation context
 *   2. validate the dice
 *   3. PREPARE every mandatory cost           <- nothing has changed yet
 *   4. commit every prepared cost atomically  <- the point of no refund
 *   5. resolve the operation's own rules
 *   6. route effect requests to their owners, bounded and cycle-checked
 *   7. return state, events and outcomes
 *
 * Steps 1 to 3 can fail the operation. From step 4 onward it has happened, and
 * anything that goes wrong is an event rather than an error.
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

  /* ── 2. Dice, before anything is spent ────────────────────────────── */

  const dice = operation.dice ?? [];
  const requiredDice = operation.requiredDice ?? [];

  const diceNode = createTraceNode({
    id: "runtime.operation.dice",
    label: "Validate supplied dice",
    inputs: Object.fromEntries(
      dice.map((roll) => [roll.purpose, { value: `d${roll.sides}=${roll.value}` }]),
    ),
  });

  root.children.push(diceNode);

  const diceIssues = findDiceIssues(dice, requiredDice);

  if (diceIssues.length > 0) {
    diceNode.output = false;

    return fail(root, diceIssues);
  }

  diceNode.output = true;

  /* ── 3. Prepare every cost. Nothing commits here. ─────────────────── */

  const costHandlers = new Map(handlers.costs.map((one) => [one.domain, one]));
  const orderedCosts = orderRuntimeRequests(operation.costs);

  const duplicateIssues = findDuplicateRequestIds(orderedCosts);

  if (duplicateIssues.length > 0) return fail(root, duplicateIssues);

  const prepareNode = createTraceNode({
    id: "runtime.operation.costs.prepare",
    label: "Validate every mandatory cost",
    inputs: { count: { value: orderedCosts.length } },
  });

  root.children.push(prepareNode);

  const prepared: PreparedCost[] = [];

  for (const request of orderedCosts) {
    const handler = costHandlers.get(request.to);

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

    const attempt = handler.prepare(request);

    prepareNode.children.push(attempt.trace.root);

    if (!attempt.success) {
      /*
       * One refusal ends the operation and NOTHING has been committed, which
       * is the entire reason preparation is a separate pass.
       */
      prepareNode.output = false;

      return fail(root, attempt.errors);
    }

    if (
      attempt.payload.actual < request.requested &&
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
        actual: String(attempt.payload.actual),
      }]);
    }

    prepared.push(attempt.payload);
  }

  prepareNode.output = true;

  /* ── 4. Commit. Past this line the operation has happened. ────────── */

  const events: RuntimeEvent[] = [];
  const costOutcomes: RuntimeRequestOutcome[] = [];

  let sequence = 0;

  const record = (
    partial: readonly Omit<RuntimeEvent, "sequence">[],
  ): void => {
    for (const event of partial) {
      events.push({ ...event, sequence });
      sequence += 1;
    }
  };

  for (const cost of prepared) {
    const committed = costHandlers.get(cost.domain)!.commit(cost);

    costOutcomes.push(committed.outcome);
    record(committed.events);
  }

  /* ── 5. The operation's own rules. ────────────────────────────────── */

  const resolved = operation.resolve(dice);

  record(resolved.events ?? []);

  /* ── 6. Consequences, bounded and cycle-checked. ──────────────────── */

  const effectHandlers = new Map(
    handlers.effects.map((one) => [one.domain, one]),
  );

  const effectOutcomes: RuntimeRequestOutcome[] = [];
  const seenRequestIds = new Set(orderedCosts.map((one) => one.requestId));

  let pending = orderRuntimeRequests(resolved.requests ?? []);
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

    const next: RuntimeRequest[] = [];

    for (const request of pending) {
      if (seenRequestIds.has(request.requestId)) {
        /*
         * The same request id twice is a cycle or a routing bug. Repeated
         * CONTENT is fine — two separate 10-damage requests to one target are
         * two real requests — which is why identity is explicit rather than
         * hashed from the fields.
         */
        return fail(root, [{
          code: "runtime.request.duplicate-id",
          message: `Request "${request.requestId}" was raised more than once.`,
          audience: "developer",
          required: "one resolution per request id",
          actual: request.requestId,
        }]);
      }

      seenRequestIds.add(request.requestId);

      const handler = effectHandlers.get(request.to);

      if (handler === undefined) {
        return fail(root, [{
          code: "runtime.request.unhandled",
          message: `No handler owns "${request.to}" to apply ${request.kind}.`,
          audience: "developer",
          required: `an effect handler for ${request.to}`,
          actual: handlers.effects.map((one) => one.domain).join(", ") || "none",
        }]);
      }

      const applied = handler.apply(request);

      effectOutcomes.push(applied.outcome);
      record(applied.events);

      next.push(...(applied.requests ?? []));
    }

    pending = orderRuntimeRequests(next);
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
      events,
      costOutcomes,
      effectOutcomes,
    },
    trace: { root },
    warnings: [],
  };
}


function findDuplicateRequestIds(
  requests: readonly RuntimeRequest[],
): readonly EngineError[] {
  const seen = new Set<string>();
  const errors: EngineError[] = [];

  for (const request of requests) {
    if (seen.has(request.requestId)) {
      errors.push({
        code: "runtime.request.duplicate-id",
        message: `Request "${request.requestId}" was supplied more than once.`,
        audience: "developer",
        required: "unique request ids within an operation",
        actual: request.requestId,
      });

      continue;
    }

    seen.add(request.requestId);
  }

  return errors;
}
