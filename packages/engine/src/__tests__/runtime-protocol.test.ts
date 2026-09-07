/*
 * The shared transition protocol, as a TRANSACTION.
 *
 * Five properties carry the design, and the first three were all broken in the
 * version of this coordinator that shipped with Phase 1:
 *
 *   - A successful operation returns the complete new state, and there is no
 *     other channel it could arrive through.
 *   - A failed operation changes nothing, at any point in the lifecycle.
 *   - Costs owned by one domain are CUMULATIVE against a running draft.
 *   - Simultaneous effects settle from one pre-batch state.
 *   - Two callers who assemble the same operation differently get one answer.
 *
 * The generic coordinated operation here is TEST-ONLY on purpose. Proving
 * atomicity needs two independent resource owners, and inventing a production
 * Item or Nen mechanic to supply the second one would be shipping a mechanic
 * to test a protocol.
 */

import { describe, expect, it } from "vitest";

import type { EngineResult } from "../infrastructure/result";
import { createTraceNode } from "../infrastructure/trace";

import {
  MAXIMUM_CONSEQUENCE_DEPTH,
  attachCombat,
  detachCombat,
  emptyRuntimeState,
  findDiceIssues,
  findOperationContextIssues,
  findRequestIssues,
  groupSimultaneousRequests,
  isInCombat,
  orderRuntimeRequests,
  runCoordinatedOperation,
  wasPrevented,
  type CostCommitResult,
  type CostHandler,
  type EffectBatchResult,
  type EffectHandler,
  type PreparedCost,
  type QuantitativeRequest,
  type RuntimeRequest,
} from "../runtime";

const OPERATION = { operationId: "op-1", occurredAt: 1_000 } as const;


/* ── A test-only resource owner ─────────────────────────────────────────── */

/*
 * Stateless, like every real handler must be. The pool arrives as the draft's
 * value and leaves in `nextState`; nothing here captures a balance, which is
 * what makes two costs cumulative and a discarded operation free.
 */
function resourceOwner(domain: RuntimeRequest["to"]): CostHandler {
  return {
    domain,

    prepare(
      request: RuntimeRequest,
      state: unknown,
    ): EngineResult<PreparedCost> {
      const pool = state as number;
      const { requested } = request as QuantitativeRequest;

      const root = createTraceNode({
        id: `test.${domain}.prepare`,
        label: `Price a ${domain} cost`,
        inputs: { requested: { value: requested }, pool: { value: pool } },
      });

      if (requested > pool) {
        root.output = false;

        return {
          success: false,
          trace: { root },
          warnings: [],
          errors: [{
            code: `test.${domain}.insufficient`,
            message: `Not enough ${domain}.`,
            audience: "developer",
            required: requested,
            actual: pool,
          }],
        };
      }

      root.output = true;

      return {
        success: true,
        payload: {
          requestId: request.requestId,
          domain,
          nextState: pool - requested,
          actual: requested,
          prepared: { request },
        },
        trace: { root },
        warnings: [],
      };
    },

    commit(cost: PreparedCost): CostCommitResult {
      const { request } = cost.prepared as { request: QuantitativeRequest };

      return {
        outcome: {
          requestId: cost.requestId,
          requested: request.requested,
          actual: cost.actual ?? 0,
        },
        events: [{
          kind: `${domain}-spent`,
          domain,
          operationId: request.operationId,
          occurredAt: request.occurredAt,
          change: { requested: request.requested, actual: cost.actual ?? 0 },
        }],
      };
    },
  };
}

function costRequest(
  overrides:
    & Partial<QuantitativeRequest>
    & Pick<QuantitativeRequest, "requestId" | "to">,
): QuantitativeRequest {
  return {
    kind: "test-cost",
    phase: "cost",
    operationId: OPERATION.operationId,
    occurredAt: OPERATION.occurredAt,
    from: "caller",
    requested: 1,
    allowPartial: false,
    ...overrides,
  };
}


describe("Runtime State exists outside Combat", () => {
  const withRen = () => {
    const empty = emptyRuntimeState<{ readonly round: number }>();

    return {
      ...empty,
      nen: {
        applications: [{
          id: "ren-1",
          source: "ren",
          subjectId: "kurapika",
          startedAt: 500,
        }],
      },
    };
  };

  it("holds an active application before any encounter begins", () => {
    const state = withRen();

    expect(isInCombat(state)).toBe(false);
    expect(state.nen.applications).toHaveLength(1);
  });

  it("neither moves nor duplicates active state when Combat starts", () => {
    const before = withRen();
    const during = attachCombat(before, { round: 1 });

    expect(isInCombat(during)).toBe(true);
    expect(during.nen).toBe(before.nen);
    expect(during.transformations).toBe(before.transformations);
    expect(during.activity).toBe(before.activity);
  });

  it("leaves active state untouched when Combat ends", () => {
    const before = withRen();
    const after = detachCombat(attachCombat(before, { round: 1 }));

    expect(isInCombat(after)).toBe(false);
    expect(after.nen).toBe(before.nen);
    expect(after.nen.applications[0]!.id).toBe("ren-1");
  });

  it("keeps activation off permanent Nen state", async () => {
    const { createUnawakenedNenState } = await import(
      "../character/foundation/nen/nen"
    );

    const keys = Object.keys(createUnawakenedNenState());

    for (const key of keys) {
      expect(key.toLowerCase()).not.toMatch(/active$/);
    }
  });

  /*
   * Upkeep is not on the shared shape. Whether it is per hour or per Round,
   * which reserve pays it and what suspension does to it are domain questions,
   * and one shared number would commit every future domain to one answer.
   */
  it("carries no generic upkeep on the shared application shape", () => {
    const application = withRen().nen.applications[0]!;

    expect(Object.keys(application)).not.toContain("upkeepPerHour");
  });
});


describe("a successful operation returns the whole new state", () => {
  it("returns every participating domain's final state", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { aura: 100, combat: 2 },
        costs: [
          costRequest({ requestId: "r-aura", to: "aura", requested: 40 }),
          costRequest({ requestId: "r-action", to: "combat", requested: 1 }),
        ],
        resolve: () => ({ result: "done" }),
      },
      { costs: [resourceOwner("aura"), resourceOwner("combat")], effects: [] },
    );

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(result.payload.states).toEqual({ aura: 60, combat: 1 });
  });

  /*
   * There is no other way for a result to arrive. The handler captures nothing
   * and exposes nothing, so a caller that ignored `states` would have no second
   * place to look — which is the point of removing `committedState()`.
   */
  it("gives handlers no channel other than the return value", () => {
    const handler = resourceOwner("aura");

    expect(Object.keys(handler).sort()).toEqual(["commit", "domain", "prepare"]);
  });

  it("hands the post-cost draft to the operation's own rules", () => {
    let seen: unknown;

    runCoordinatedOperation(
      {
        context: OPERATION,
        states: { aura: 100 },
        costs: [costRequest({ requestId: "r1", to: "aura", requested: 40 })],
        resolve: (_dice, states) => {
          seen = states.aura;

          return { result: "done" };
        },
      },
      { costs: [resourceOwner("aura")], effects: [] },
    );

    expect(seen).toBe(60);
  });
});


describe("costs owned by one domain are cumulative", () => {
  /*
   * The reported defect. Two 60-Aura costs each validated against the same
   * untouched 100-Aura pool, and a character spent 120 they did not have.
   */
  it("rejects two same-owner costs that jointly overspend", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { aura: 100 },
        costs: [
          costRequest({ requestId: "r1", to: "aura", requested: 60 }),
          costRequest({ requestId: "r2", to: "aura", requested: 60 }),
        ],
        resolve: () => ({ result: "done" }),
      },
      { costs: [resourceOwner("aura")], effects: [] },
    );

    expect(result.success).toBe(false);
  });

  it("deducts the combined amount when both are affordable", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { aura: 100 },
        costs: [
          costRequest({ requestId: "r1", to: "aura", requested: 30 }),
          costRequest({ requestId: "r2", to: "aura", requested: 25 }),
        ],
        resolve: () => ({ result: "done" }),
      },
      { costs: [resourceOwner("aura")], effects: [] },
    );

    if (!result.success) throw new Error("expected success");

    expect(result.payload.states.aura).toBe(45);
  });

  it("still commits nothing when one of two owners cannot pay", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { aura: 100, combat: 0 },
        costs: [
          costRequest({ requestId: "r-aura", to: "aura", requested: 40 }),
          costRequest({ requestId: "r-action", to: "combat", requested: 1 }),
        ],
        resolve: () => ({ result: "done" }),
      },
      { costs: [resourceOwner("aura"), resourceOwner("combat")], effects: [] },
    );

    expect(result.success).toBe(false);
  });
});


describe("a failure changes nothing, wherever it happens", () => {
  const original = Object.freeze({ aura: 100, combat: 2 });

  const attempt = (
    resolve: () => {
      readonly result: string;
      readonly requests?: readonly RuntimeRequest[];
    },
    effects: readonly EffectHandler[] = [],
  ) =>
    runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        costs: [
          costRequest({ requestId: "r-aura", to: "aura", requested: 40 }),
          costRequest({ requestId: "r-action", to: "combat", requested: 1 }),
        ],
        resolve,
      },
      { costs: [resourceOwner("aura"), resourceOwner("combat")], effects },
    );

  const effectRequest = (requestId: string): RuntimeRequest => ({
    requestId,
    kind: "damage",
    phase: "effect",
    operationId: OPERATION.operationId,
    occurredAt: OPERATION.occurredAt,
    from: "caller",
    to: "body",
  });

  /*
   * The second reported defect. Costs used to commit and THEN effects were
   * routed, so an unhandled effect returned a failure with the Aura already
   * gone — a failed operation that spent something.
   */
  it("preserves state when an effect has no handler", () => {
    const result = attempt(() => ({
      result: "hit",
      requests: [effectRequest("dmg-1")],
    }));

    expect(result.success).toBe(false);
    expect(original).toEqual({ aura: 100, combat: 2 });
  });

  it("preserves state when a request id repeats", () => {
    const passthrough: EffectHandler = {
      domain: "body",
      applyBatch: (requests, state) => ({
        state,
        outcomes: requests.map((one) => ({ requestId: one.requestId })),
        events: [],
      }),
    };

    const result = attempt(
      () => ({
        result: "hit",
        requests: [effectRequest("dmg-1"), effectRequest("dmg-1")],
      }),
      [passthrough],
    );

    expect(result.success).toBe(false);
    expect(original).toEqual({ aura: 100, combat: 2 });
  });

  it("preserves state when consequences never settle", () => {
    let issued = 0;

    const looping: EffectHandler = {
      domain: "body",
      applyBatch: (requests, state) => {
        issued += 1;

        return {
          state,
          outcomes: requests.map((one) => ({ requestId: one.requestId })),
          events: [],
          requests: [effectRequest(`loop-${issued}`)],
        };
      },
    };

    const result = attempt(
      () => ({ result: "hit", requests: [effectRequest("start")] }),
      [looping],
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.consequences.too-deep");

    expect(issued).toBeLessThanOrEqual(MAXIMUM_CONSEQUENCE_DEPTH);
    expect(original).toEqual({ aura: 100, combat: 2 });
  });

  it("preserves state when the dice are malformed", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        requiredDice: [{ purpose: "attack", sides: 20 }],
        dice: [{ purpose: "attack", value: 21, sides: 20 }],
        costs: [costRequest({ requestId: "r1", to: "aura", requested: 40 })],
        resolve: () => ({ result: "hit" }),
      },
      { costs: [resourceOwner("aura")], effects: [] },
    );

    expect(result.success).toBe(false);
    expect(original).toEqual({ aura: 100, combat: 2 });
  });

  /* A valid attempt that goes badly is not a failure and keeps what it paid. */
  it("keeps committed costs when the roll fails", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        requiredDice: [{ purpose: "attack", sides: 20 }],
        dice: [{ purpose: "attack", value: 1, sides: 20 }],
        costs: [costRequest({ requestId: "r1", to: "aura", requested: 40 })],
        resolve: (dice) => ({
          result: { hit: dice[0]!.value >= 10 },
          events: [{
            kind: "check-failed",
            domain: "caller",
            operationId: OPERATION.operationId,
            occurredAt: OPERATION.occurredAt,
          }],
        }),
      },
      { costs: [resourceOwner("aura")], effects: [] },
    );

    if (!result.success) throw new Error("expected success");

    expect(result.payload.result).toEqual({ hit: false });
    expect(result.payload.states.aura).toBe(60);
    expect(result.payload.events.map((one) => one.kind))
      .toContain("check-failed");
  });
});


describe("simultaneous effects settle from one pre-batch state", () => {
  /*
   * The owner is handed the whole batch and ONE state, and calculates every
   * member from it. Applying them one at a time would let the second read the
   * first's result and make the answer depend on sort order.
   */
  const halvingOwner: EffectHandler = {
    domain: "body",
    applyBatch: (requests, state): EffectBatchResult => {
      const before = state as number;

      /* Each request takes half of the PRE-BATCH pool, not of the running one. */
      const outcomes = requests.map((request) => {
        const asked = (request as QuantitativeRequest).requested;
        const actual = Math.min(asked, before / 2);

        return { requestId: request.requestId, requested: asked, actual };
      });

      const total = outcomes.reduce((sum, one) => sum + (one.actual ?? 0), 0);

      return {
        state: Math.max(0, before - total),
        outcomes,
        events: outcomes.map((one) => ({
          kind: "damage-taken",
          domain: "body" as const,
          operationId: OPERATION.operationId,
          occurredAt: OPERATION.occurredAt,
          change: { requested: one.requested!, actual: one.actual! },
        })),
      };
    },
  };

  const damage = (requestId: string, requested: number): QuantitativeRequest => ({
    requestId,
    kind: "damage",
    phase: "effect",
    operationId: OPERATION.operationId,
    occurredAt: OPERATION.occurredAt,
    from: "caller",
    to: "body",
    requested,
  });

  const run = (requests: readonly RuntimeRequest[]) =>
    runCoordinatedOperation(
      {
        context: OPERATION,
        states: { body: 100 },
        costs: [],
        resolve: () => ({ result: "hit", requests }),
      },
      { costs: [], effects: [halvingOwner] },
    );

  it("produces the same state whichever order the effects arrived in", () => {
    const forward = run([damage("d1", 30), damage("d2", 80)]);
    const reversed = run([damage("d2", 80), damage("d1", 30)]);

    if (!forward.success || !reversed.success) throw new Error("expected success");

    expect(reversed.payload.states).toEqual(forward.payload.states);
  });

  it("gives every effect in the batch the same starting state", () => {
    const result = run([damage("d1", 80), damage("d2", 80)]);

    if (!result.success) throw new Error("expected success");

    /* Both capped at half of 100, not at half of a dwindling pool. */
    for (const outcome of result.payload.effectOutcomes) {
      expect(outcome.actual).toBe(50);
    }

    expect(result.payload.states.body).toBe(0);
  });

  it("groups by owner and effective time", () => {
    const later = { ...damage("d3", 10), effectiveAt: 2_000 };
    const batches = groupSimultaneousRequests([damage("d1", 1), later, damage("d2", 1)]);

    expect(batches).toHaveLength(2);
    expect(batches[0]!.requests.map((one) => one.requestId)).toEqual(["d1", "d2"]);
    expect(batches[1]!.requests.map((one) => one.requestId)).toEqual(["d3"]);
  });

  /*
   * Ordering still controls the LOG. What it must not do — and no longer can —
   * is decide the mechanical result.
   */
  it("keeps the event log deterministic without controlling the result", () => {
    const forward = run([damage("d1", 30), damage("d2", 80)]);
    const reversed = run([damage("d2", 80), damage("d1", 30)]);

    if (!forward.success || !reversed.success) throw new Error("expected success");

    expect(reversed.payload.events.map((one) => one.sequence))
      .toEqual(forward.payload.events.map((one) => one.sequence));

    expect(reversed.payload.effectOutcomes).toEqual(forward.payload.effectOutcomes);
  });

  it("reports full prevention as an actual of zero, not a failure", () => {
    const immune: EffectHandler = {
      domain: "body",
      applyBatch: (requests, state) => ({
        state,
        outcomes: requests.map((one) => ({
          requestId: one.requestId,
          requested: (one as QuantitativeRequest).requested,
          actual: 0,
        })),
        events: requests.map((one) => ({
          kind: "damage-taken",
          domain: "body" as const,
          operationId: OPERATION.operationId,
          occurredAt: OPERATION.occurredAt,
          change: { requested: (one as QuantitativeRequest).requested, actual: 0 },
        })),
      }),
    };

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { body: 100 },
        costs: [],
        resolve: () => ({ result: "hit", requests: [damage("d1", 40)] }),
      },
      { costs: [], effects: [immune] },
    );

    if (!result.success) throw new Error("expected success");

    expect(result.payload.states.body).toBe(100);
    expect(result.payload.effectOutcomes[0]!.actual).toBe(0);
    expect(wasPrevented(result.payload.events[0]!)).toBe(true);
  });
});


describe("the boundary refuses malformed protocol input", () => {
  const base = {
    requestId: "r1",
    kind: "test",
    phase: "cost" as const,
    operationId: OPERATION.operationId,
    occurredAt: OPERATION.occurredAt,
    from: "caller" as const,
    to: "aura" as const,
  };

  it.each([
    ["an empty request id", { ...base, requestId: "  " }, "runtime.request.id.invalid"],
    ["a missing kind", { ...base, kind: "" }, "runtime.request.kind.invalid"],
    ["an unknown phase", { ...base, phase: "later" as never }, "runtime.request.phase.invalid"],
    ["another operation", { ...base, operationId: "op-9" }, "runtime.request.operation.mismatch"],
    ["an unknown domain", { ...base, to: "wizardry" as never }, "runtime.request.domain.invalid"],
    ["a non-finite time", { ...base, occurredAt: Number.NaN }, "runtime.request.timestamp.invalid"],
    ["a bad effective time", { ...base, effectiveAt: Number.NaN }, "runtime.request.effective-time.invalid"],
    ["a negative amount", { ...base, requested: -5 }, "runtime.request.amount.invalid"],
    ["a non-finite amount", { ...base, requested: Number.NaN }, "runtime.request.amount.invalid"],
  ])("rejects %s", (_name, request, code) => {
    expect(findRequestIssues(request, OPERATION.operationId).map((one) => one.code))
      .toContain(code);
  });

  /* A removal is not a quantity, and is not asked to pretend to be one. */
  it("accepts a non-quantitative request with no amount at all", () => {
    expect(findRequestIssues(base, OPERATION.operationId)).toEqual([]);
    expect("requested" in base).toBe(false);
  });

  it("refuses two handlers claiming one domain", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { aura: 100 },
        costs: [],
        resolve: () => ({ result: "done" }),
      },
      { costs: [resourceOwner("aura"), resourceOwner("aura")], effects: [] },
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.handler.duplicate");
  });

  it("refuses a prepared cost that does not match its request", () => {
    const liar: CostHandler = {
      domain: "aura",
      prepare: (request) => ({
        success: true,
        payload: {
          requestId: "some-other-request",
          domain: "aura",
          nextState: 0,
          actual: 0,
          prepared: {},
        },
        trace: { root: createTraceNode({ id: "t", label: "t" }) },
        warnings: [],
      }),
      commit: (cost) => ({
        outcome: { requestId: cost.requestId },
        events: [],
      }),
    };

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { aura: 100 },
        costs: [costRequest({ requestId: "r1", to: "aura", requested: 10 })],
        resolve: () => ({ result: "done" }),
      },
      { costs: [liar], effects: [] },
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.cost.prepared-mismatch");
  });

  it("refuses an effect handler that answers the wrong number of requests", () => {
    const sloppy: EffectHandler = {
      domain: "body",
      applyBatch: (_requests, state) => ({
        state,
        outcomes: [],
        events: [],
      }),
    };

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { body: 10 },
        costs: [],
        resolve: () => ({
          result: "hit",
          requests: [{
            requestId: "d1",
            kind: "damage",
            phase: "effect" as const,
            operationId: OPERATION.operationId,
            occurredAt: OPERATION.occurredAt,
            from: "caller" as const,
            to: "body" as const,
          }],
        }),
      },
      { costs: [], effects: [sloppy] },
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.effect.outcome-count-mismatch");
  });

  it("refuses a non-finite operation timestamp", () => {
    expect(
      findOperationContextIssues({ operationId: "op", occurredAt: Number.NaN })
        .map((one) => one.code),
    ).toContain("runtime.operation.timestamp.invalid");
  });
});


describe("dice are validated at the boundary", () => {
  it.each([
    [
      "a die with no purpose",
      [{ purpose: "  ", value: 3, sides: 20 }],
      [{ purpose: "attack", sides: 20 }],
      "runtime.dice.purpose.missing",
    ],
    [
      "two dice for one purpose",
      [
        { purpose: "attack", value: 3, sides: 20 },
        { purpose: "attack", value: 19, sides: 20 },
      ],
      [{ purpose: "attack", sides: 20 }],
      "runtime.dice.duplicate",
    ],
    [
      "a missing die",
      [],
      [{ purpose: "attack", sides: 20 }],
      "runtime.dice.missing",
    ],
    [
      "a fractional face",
      [{ purpose: "attack", value: 3.5, sides: 20 }],
      [{ purpose: "attack", sides: 20 }],
      "runtime.dice.value.invalid",
    ],
    [
      "a face outside the range",
      [{ purpose: "attack", value: 0, sides: 20 }],
      [{ purpose: "attack", sides: 20 }],
      "runtime.dice.value.out-of-range",
    ],
    [
      "a die nothing asked for",
      [
        { purpose: "attack", value: 3, sides: 20 },
        { purpose: "gossip", value: 3, sides: 6 },
      ],
      [{ purpose: "attack", sides: 20 }],
      "runtime.dice.unexpected",
    ],
  ])("rejects %s", (_name, supplied, required, code) => {
    expect(findDiceIssues(supplied, required).map((one) => one.code))
      .toContain(code);
  });

  /*
   * A malformed REQUIREMENT is caught first, because a d0 or a d2.5 has no
   * valid face and would report every roll out of range — sending the caller
   * to look at their dice instead of at their requirement.
   */
  it.each([
    [0, "a zero-sided die"],
    [-4, "a negative die"],
    [2.5, "a fractional die"],
  ])("rejects %s as a requirement (%s)", (sides) => {
    const issues = findDiceIssues(
      [{ purpose: "attack", value: 1, sides }],
      [{ purpose: "attack", sides }],
    );

    expect(issues.map((one) => one.code))
      .toContain("runtime.dice.requirement.sides.invalid");
  });

  it("rejects one purpose required twice", () => {
    const issues = findDiceIssues(
      [{ purpose: "attack", value: 3, sides: 20 }],
      [{ purpose: "attack", sides: 20 }, { purpose: "attack", sides: 6 }],
    );

    expect(issues.map((one) => one.code))
      .toContain("runtime.dice.requirement.duplicate");
  });
});


describe("order does not decide outcomes", () => {
  const requests = (): QuantitativeRequest[] => [
    costRequest({ requestId: "b", to: "combat", requested: 1 }),
    costRequest({ requestId: "a", to: "aura", requested: 10 }),
    costRequest({ requestId: "c", to: "aura", requested: 5 }),
  ];

  it("resolves the same set the same way whatever order it arrived in", () => {
    const run = (order: readonly RuntimeRequest[]) => {
      const result = runCoordinatedOperation(
        {
          context: OPERATION,
          states: { aura: 100, combat: 2 },
          costs: order,
          resolve: () => ({ result: "done" }),
        },
        { costs: [resourceOwner("aura"), resourceOwner("combat")], effects: [] },
      );

      if (!result.success) throw new Error("expected success");

      return result.payload;
    };

    expect(run([...requests()].reverse())).toEqual(run(requests()));
  });

  it("does not mutate the caller's request array", () => {
    const original = requests();
    const snapshot = original.map((one) => one.requestId);

    orderRuntimeRequests(original);

    expect(original.map((one) => one.requestId)).toEqual(snapshot);
  });

  it("survives a JSON round trip unchanged", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { aura: 100 },
        costs: [costRequest({ requestId: "r1", to: "aura", requested: 10 })],
        resolve: () => ({ result: { hit: true } }),
      },
      { costs: [resourceOwner("aura")], effects: [] },
    );

    if (!result.success) throw new Error("expected success");

    expect(JSON.parse(JSON.stringify(result.payload))).toEqual(result.payload);
  });
});
