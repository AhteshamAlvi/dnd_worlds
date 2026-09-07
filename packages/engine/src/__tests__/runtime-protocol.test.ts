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
  type RuntimeRequestOutcome,
} from "../runtime";

const OPERATION = { operationId: "op-1", occurredAt: 1_000 } as const;

const CALLER = { domain: "caller", id: "host" } as const;
const owner = (domain: RuntimeRequest["to"]["domain"], id: string) =>
  ({ domain, id }) as const;


/* ── A test-only resource owner ─────────────────────────────────────────── */

/*
 * Stateless, like every real handler must be. The pool arrives as the draft's
 * value and leaves in `nextState`; nothing here captures a balance, which is
 * what makes two costs cumulative and a discarded operation free.
 */
function resourceOwner(domain: RuntimeRequest["to"]["domain"]): CostHandler {
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
          owner: request.to,
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
    from: CALLER,
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
        states: { "aura:gon": 100, "combat:gon": 2 },
        costs: [
          costRequest({ requestId: "r-aura", to: owner("aura", "gon"), requested: 40 }),
          costRequest({ requestId: "r-action", to: owner("combat", "gon"), requested: 1 }),
        ],
        resolve: () => ({ result: "done" }),
      },
      { costs: [resourceOwner("aura"), resourceOwner("combat")], effects: [] },
    );

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(result.payload.states).toEqual({ "aura:gon": 60, "combat:gon": 1 });
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
        states: { "aura:gon": 100 },
        costs: [costRequest({ requestId: "r1", to: owner("aura", "gon"), requested: 40 })],
        resolve: (_dice, states) => {
          seen = states["aura:gon"];

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
        states: { "aura:gon": 100 },
        costs: [
          costRequest({ requestId: "r1", to: owner("aura", "gon"), requested: 60 }),
          costRequest({ requestId: "r2", to: owner("aura", "gon"), requested: 60 }),
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
        states: { "aura:gon": 100 },
        costs: [
          costRequest({ requestId: "r1", to: owner("aura", "gon"), requested: 30 }),
          costRequest({ requestId: "r2", to: owner("aura", "gon"), requested: 25 }),
        ],
        resolve: () => ({ result: "done" }),
      },
      { costs: [resourceOwner("aura")], effects: [] },
    );

    if (!result.success) throw new Error("expected success");

    expect(result.payload.states["aura:gon"]).toBe(45);
  });

  it("still commits nothing when one of two owners cannot pay", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": 100, "combat:gon": 0 },
        costs: [
          costRequest({ requestId: "r-aura", to: owner("aura", "gon"), requested: 40 }),
          costRequest({ requestId: "r-action", to: owner("combat", "gon"), requested: 1 }),
        ],
        resolve: () => ({ result: "done" }),
      },
      { costs: [resourceOwner("aura"), resourceOwner("combat")], effects: [] },
    );

    expect(result.success).toBe(false);
  });
});


describe("a failure changes nothing, wherever it happens", () => {
  const original = Object.freeze({
    "aura:gon": 100,
    "combat:gon": 2,
    "body:gon": 50,
  });

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
          costRequest({ requestId: "r-aura", to: owner("aura", "gon"), requested: 40 }),
          costRequest({ requestId: "r-action", to: owner("combat", "gon"), requested: 1 }),
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
    from: CALLER,
    to: owner("body", "gon"),
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
    expect(original).toEqual({
      "aura:gon": 100,
      "combat:gon": 2,
      "body:gon": 50,
    });
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
    expect(original).toEqual({
      "aura:gon": 100,
      "combat:gon": 2,
      "body:gon": 50,
    });
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
    expect(original).toEqual({
      "aura:gon": 100,
      "combat:gon": 2,
      "body:gon": 50,
    });
  });

  it("preserves state when the dice are malformed", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        requiredDice: [{ purpose: "attack", sides: 20 }],
        dice: [{ purpose: "attack", value: 21, sides: 20 }],
        costs: [costRequest({ requestId: "r1", to: owner("aura", "gon"), requested: 40 })],
        resolve: () => ({ result: "hit" }),
      },
      { costs: [resourceOwner("aura")], effects: [] },
    );

    expect(result.success).toBe(false);
    expect(original).toEqual({
      "aura:gon": 100,
      "combat:gon": 2,
      "body:gon": 50,
    });
  });

  /* A valid attempt that goes badly is not a failure and keeps what it paid. */
  it("keeps committed costs when the roll fails", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        requiredDice: [{ purpose: "attack", sides: 20 }],
        dice: [{ purpose: "attack", value: 1, sides: 20 }],
        costs: [costRequest({ requestId: "r1", to: owner("aura", "gon"), requested: 40 })],
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
    expect(result.payload.states["aura:gon"]).toBe(60);
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
    from: CALLER,
    to: owner("body", "gon"),
    requested,
  });

  const run = (requests: readonly RuntimeRequest[]) =>
    runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "body:gon": 100 },
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

    expect(result.payload.states["body:gon"]).toBe(0);
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
        states: { "body:gon": 100 },
        costs: [],
        resolve: () => ({ result: "hit", requests: [damage("d1", 40)] }),
      },
      { costs: [], effects: [immune] },
    );

    if (!result.success) throw new Error("expected success");

    expect(result.payload.states["body:gon"]).toBe(100);
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
    from: CALLER,
    to: owner("aura", "gon"),
  };

  it.each([
    ["an empty request id", { ...base, requestId: "  " }, "runtime.request.id.invalid"],
    ["a missing kind", { ...base, kind: "" }, "runtime.request.kind.invalid"],
    ["an unknown phase", { ...base, phase: "later" as never }, "runtime.request.phase.invalid"],
    ["another operation", { ...base, operationId: "op-9" }, "runtime.request.operation.mismatch"],
    ["an unknown owner domain", { ...base, to: owner("wizardry" as never, "gon") }, "runtime.request.owner.invalid"],
    ["an owner with no id", { ...base, to: owner("aura", "  ") }, "runtime.request.owner.invalid"],
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
        states: { "aura:gon": 100 },
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
          owner: owner("aura", "gon"),
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
        states: { "aura:gon": 100 },
        costs: [costRequest({ requestId: "r1", to: owner("aura", "gon"), requested: 10 })],
        resolve: () => ({ result: "done" }),
      },
      { costs: [liar], effects: [] },
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.cost.prepared-mismatch");
  });

  it("refuses an effect handler that leaves a request unanswered", () => {
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
        states: { "body:gon": 10 },
        costs: [],
        resolve: () => ({
          result: "hit",
          requests: [{
            requestId: "d1",
            kind: "damage",
            phase: "effect" as const,
            operationId: OPERATION.operationId,
            occurredAt: OPERATION.occurredAt,
            from: CALLER,
            to: owner("body", "gon"),
          }],
        }),
      },
      { costs: [], effects: [sloppy] },
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.effect.outcome-missing");
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
    costRequest({ requestId: "b", to: owner("combat", "gon"), requested: 1 }),
    costRequest({ requestId: "a", to: owner("aura", "gon"), requested: 10 }),
    costRequest({ requestId: "c", to: owner("aura", "gon"), requested: 5 }),
  ];

  it("resolves the same set the same way whatever order it arrived in", () => {
    const run = (order: readonly RuntimeRequest[]) => {
      const result = runCoordinatedOperation(
        {
          context: OPERATION,
          states: { "aura:gon": 100, "combat:gon": 2 },
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
        states: { "aura:gon": 100 },
        costs: [costRequest({ requestId: "r1", to: owner("aura", "gon"), requested: 10 })],
        resolve: () => ({ result: { hit: true } }),
      },
      { costs: [resourceOwner("aura")], effects: [] },
    );

    if (!result.success) throw new Error("expected success");

    expect(JSON.parse(JSON.stringify(result.payload))).toEqual(result.payload);
  });
});


/*
 * Two characters in one operation.
 *
 * The reason ownership is a domain AND an id. Keyed by domain alone, "aura"
 * named one slot, so Gon's Aura and Killua's Aura shared it and the second
 * write won — a fight between two people resolving as one person hitting
 * themselves.
 */
describe("an operation can touch several characters", () => {
  const damage = (
    requestId: string,
    target: RuntimeRequest["to"],
    requested: number,
  ): QuantitativeRequest => ({
    requestId,
    kind: "damage",
    phase: "effect",
    operationId: OPERATION.operationId,
    occurredAt: OPERATION.occurredAt,
    from: CALLER,
    to: target,
    requested,
  });

  /* One rule, applied to whichever body it is handed. */
  const bodyOwner: EffectHandler = {
    domain: "body",
    applyBatch: (requests, state): EffectBatchResult => {
      const before = state as number;

      const outcomes = requests.map((request) => {
        const asked = (request as QuantitativeRequest).requested;

        return {
          requestId: request.requestId,
          requested: asked,
          actual: Math.min(asked, before),
        };
      });

      const total = outcomes.reduce((sum, one) => sum + one.actual, 0);

      return {
        state: Math.max(0, before - total),
        outcomes,
        events: outcomes.map((one) => ({
          kind: "damage-taken",
          domain: "body" as const,
          operationId: OPERATION.operationId,
          occurredAt: OPERATION.occurredAt,
          change: { requested: one.requested, actual: one.actual },
        })),
      };
    },
  };

  it("keeps two characters' Aura and Body states apart", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: {
          "aura:gon": 100,
          "aura:killua": 80,
          "body:gon": 50,
          "body:killua": 60,
        },
        costs: [
          costRequest({
            requestId: "c-gon",
            to: owner("aura", "gon"),
            requested: 30,
          }),
          costRequest({
            requestId: "c-killua",
            to: owner("aura", "killua"),
            requested: 10,
          }),
        ],
        resolve: () => ({ result: "clash" }),
      },
      { costs: [resourceOwner("aura")], effects: [] },
    );

    if (!result.success) throw new Error("expected success");

    /* One Aura handler, two pools, each charged its own cost. */
    expect(result.payload.states).toEqual({
      "aura:gon": 70,
      "aura:killua": 70,
      "body:gon": 50,
      "body:killua": 60,
    });
  });

  /*
   * Simultaneous, but not the same batch. Grouping by domain alone would put
   * both blows in one batch against whichever Body was fetched first.
   */
  it("settles simultaneous effects on different characters separately", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "body:gon": 50, "body:killua": 60 },
        costs: [],
        resolve: () => ({
          result: "clash",
          requests: [
            damage("d-gon", owner("body", "gon"), 20),
            damage("d-killua", owner("body", "killua"), 45),
          ],
        }),
      },
      { costs: [], effects: [bodyOwner] },
    );

    if (!result.success) throw new Error("expected success");

    expect(result.payload.states).toEqual({
      "body:gon": 30,
      "body:killua": 15,
    });
  });

  /* Two blows on ONE character are one batch, from one pre-state. */
  it("settles simultaneous effects on one character as a single batch", () => {
    const batches: number[] = [];

    const counting: EffectHandler = {
      domain: "body",
      applyBatch: (requests, state) => {
        batches.push(requests.length);

        return bodyOwner.applyBatch(requests, state);
      },
    };

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "body:gon": 50 },
        costs: [],
        resolve: () => ({
          result: "clash",
          requests: [
            damage("d1", owner("body", "gon"), 40),
            damage("d2", owner("body", "gon"), 40),
          ],
        }),
      },
      { costs: [], effects: [counting] },
    );

    if (!result.success) throw new Error("expected success");

    expect(batches).toEqual([2]);

    /* Both measured against the pre-batch 50, not against a dwindling pool. */
    for (const outcome of result.payload.effectOutcomes) {
      expect(outcome.actual).toBe(40);
    }
  });

  it("groups by the complete owner, not by the domain", () => {
    const batches = groupSimultaneousRequests([
      damage("a", owner("body", "gon"), 1),
      damage("b", owner("body", "killua"), 1),
      damage("c", owner("body", "gon"), 1),
    ]);

    expect(batches).toHaveLength(2);
    expect(batches.map((one) => one.requests.length).sort()).toEqual([1, 2]);
  });

  it("charges two characters' costs cumulatively but independently", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": 100, "aura:killua": 100 },
        costs: [
          costRequest({ requestId: "g1", to: owner("aura", "gon"), requested: 60 }),
          costRequest({ requestId: "g2", to: owner("aura", "gon"), requested: 30 }),
          costRequest({ requestId: "k1", to: owner("aura", "killua"), requested: 60 }),
        ],
        resolve: () => ({ result: "done" }),
      },
      { costs: [resourceOwner("aura")], effects: [] },
    );

    if (!result.success) throw new Error("expected success");

    expect(result.payload.states).toEqual({
      "aura:gon": 10,
      "aura:killua": 40,
    });
  });

  /* Gon's two costs overspend; Killua's is fine. The whole thing is refused. */
  it("rejects the operation when one character's costs jointly overspend", () => {
    const original = Object.freeze({ "aura:gon": 100, "aura:killua": 100 });

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        costs: [
          costRequest({ requestId: "g1", to: owner("aura", "gon"), requested: 60 }),
          costRequest({ requestId: "g2", to: owner("aura", "gon"), requested: 60 }),
          costRequest({ requestId: "k1", to: owner("aura", "killua"), requested: 10 }),
        ],
        resolve: () => ({ result: "done" }),
      },
      { costs: [resourceOwner("aura")], effects: [] },
    );

    expect(result.success).toBe(false);
    expect(original).toEqual({ "aura:gon": 100, "aura:killua": 100 });
  });
});


describe("phases and handler outcomes are enforced", () => {
  const original = Object.freeze({ "aura:gon": 100, "body:gon": 50 });

  it("refuses an effect request supplied as a cost", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        costs: [{
          ...costRequest({
            requestId: "r1",
            to: owner("aura", "gon"),
            requested: 10,
          }),
          phase: "effect",
        }],
        resolve: () => ({ result: "done" }),
      },
      { costs: [resourceOwner("aura")], effects: [] },
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.request.phase.misplaced");

    expect(original).toEqual({ "aura:gon": 100, "body:gon": 50 });
  });

  it("refuses a cost request raised as an effect", () => {
    const passthrough: EffectHandler = {
      domain: "body",
      applyBatch: (requests, state) => ({
        state,
        outcomes: requests.map((one) => ({ requestId: one.requestId })),
        events: [],
      }),
    };

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        costs: [],
        resolve: () => ({
          result: "hit",
          requests: [{
            requestId: "e1",
            kind: "damage",
            phase: "cost" as const,
            operationId: OPERATION.operationId,
            occurredAt: OPERATION.occurredAt,
            from: CALLER,
            to: owner("body", "gon"),
          }],
        }),
      },
      { costs: [], effects: [passthrough] },
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.request.phase.misplaced");

    expect(original).toEqual({ "aura:gon": 100, "body:gon": 50 });
  });

  const effectRequest = (requestId: string) => ({
    requestId,
    kind: "damage",
    phase: "effect" as const,
    operationId: OPERATION.operationId,
    occurredAt: OPERATION.occurredAt,
    from: CALLER,
    to: owner("body", "gon"),
  });

  const withEffectHandler = (handler: EffectHandler) =>
    runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        costs: [],
        resolve: () => ({
          result: "hit",
          requests: [effectRequest("e1"), effectRequest("e2")],
        }),
      },
      { costs: [], effects: [handler] },
    );

  it("refuses an outcome for a request that was not in the batch", () => {
    const result = withEffectHandler({
      domain: "body",
      applyBatch: (requests, state) => ({
        state,
        outcomes: [
          ...requests.map((one) => ({ requestId: one.requestId })),
          { requestId: "not-mine" },
        ],
        events: [],
      }),
    });

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.effect.outcome-unexpected");
  });

  /*
   * Counting alone would pass this: two outcomes for two requests, but one
   * request answered twice and the other silently dropped.
   */
  it("refuses one request answered twice while another goes unanswered", () => {
    const result = withEffectHandler({
      domain: "body",
      applyBatch: (_requests, state) => ({
        state,
        outcomes: [{ requestId: "e1" }, { requestId: "e1" }],
        events: [],
      }),
    });

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    const codes = result.errors.map((one) => one.code);

    expect(codes).toContain("runtime.effect.outcome-duplicate");
    expect(codes).toContain("runtime.effect.outcome-missing");
    expect(original).toEqual({ "aura:gon": 100, "body:gon": 50 });
  });

  it.each([
    ["a negative actual", -3],
    ["a non-finite actual", Number.NaN],
    ["an infinite actual", Number.POSITIVE_INFINITY],
  ])("refuses %s", (_name, actual) => {
    const result = withEffectHandler({
      domain: "body",
      applyBatch: (requests, state) => ({
        state,
        outcomes: requests.map((one) => ({
          requestId: one.requestId,
          requested: 5,
          actual,
        })),
        events: [],
      }),
    });

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.outcome.amount.invalid");

    expect(original).toEqual({ "aura:gon": 100, "body:gon": 50 });
  });

  it("refuses a cost outcome reported against the wrong request", () => {
    const confused: CostHandler = {
      domain: "aura",
      prepare: (request, state) => ({
        success: true,
        payload: {
          requestId: request.requestId,
          owner: request.to,
          nextState: (state as number) - 10,
          actual: 10,
          prepared: {},
        },
        trace: { root: createTraceNode({ id: "t", label: "t" }) },
        warnings: [],
      }),
      commit: () => ({
        outcome: { requestId: "a-different-request" },
        events: [],
      }),
    };

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        costs: [costRequest({
          requestId: "r1",
          to: owner("aura", "gon"),
          requested: 10,
        })],
        resolve: () => ({ result: "done" }),
      },
      { costs: [confused], effects: [] },
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.cost.outcome-mismatch");

    expect(original).toEqual({ "aura:gon": 100, "body:gon": 50 });
  });
});


/*
 * State is addressed, never created.
 *
 * A handler handed `undefined` is one step from inventing a pool out of
 * nothing — `(state as number) ?? 100` is the natural way to write past a
 * missing value — so a character's Aura would spring into existence on the
 * first typo in an owner id.
 */
describe("a handler is only called about state that exists", () => {
  const original = Object.freeze({ "aura:gon": 100 });

  it("refuses a cost addressed to an owner with no state", () => {
    let called = false;

    const watching: CostHandler = {
      domain: "aura",
      prepare: (...args) => {
        called = true;

        return resourceOwner("aura").prepare(...args);
      },
      commit: (cost) => resourceOwner("aura").commit(cost),
    };

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        costs: [costRequest({
          requestId: "r1",
          to: owner("aura", "killua"),
          requested: 10,
        })],
        resolve: () => ({ result: "done" }),
      },
      { costs: [watching], effects: [] },
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code)).toContain("runtime.state.missing");

    /* Refused BEFORE the handler ran, not after it improvised. */
    expect(called).toBe(false);
    expect(original).toEqual({ "aura:gon": 100 });
  });

  it("refuses an effect addressed to an owner with no state", () => {
    let called = false;

    const watching: EffectHandler = {
      domain: "body",
      applyBatch: (requests, state) => {
        called = true;

        return {
          state,
          outcomes: requests.map((one) => ({ requestId: one.requestId })),
          events: [],
        };
      },
    };

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        costs: [],
        resolve: () => ({
          result: "hit",
          requests: [{
            requestId: "e1",
            kind: "damage",
            phase: "effect" as const,
            operationId: OPERATION.operationId,
            occurredAt: OPERATION.occurredAt,
            from: CALLER,
            to: owner("body", "gon"),
          }],
        }),
      },
      { costs: [], effects: [watching] },
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code)).toContain("runtime.state.missing");
    expect(called).toBe(false);
    expect(original).toEqual({ "aura:gon": 100 });
  });

  /* An explicitly-undefined value is still no state, not an empty one. */
  it("treats an undefined entry as absent", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": undefined },
        costs: [costRequest({
          requestId: "r1",
          to: owner("aura", "gon"),
          requested: 10,
        })],
        resolve: () => ({ result: "done" }),
      },
      { costs: [resourceOwner("aura")], effects: [] },
    );

    expect(result.success).toBe(false);
  });
});


/*
 * A quantitative request gets a complete answer or the operation is refused.
 *
 * The full-payment check used to skip whenever `actual` was absent, which made
 * omitting it a way PAST the very rule it guards.
 */
describe("quantitative outcomes must be complete", () => {
  const original = Object.freeze({ "aura:gon": 100, "body:gon": 50 });

  const withCostHandler = (handler: CostHandler) =>
    runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        costs: [costRequest({
          requestId: "r1",
          to: owner("aura", "gon"),
          requested: 10,
        })],
        resolve: () => ({ result: "done" }),
      },
      { costs: [handler], effects: [] },
    );

  /* Deliberately loose, so a test may omit a field the type marks required. */
  const preparing = (payload: Record<string, unknown>): CostHandler => ({
    domain: "aura",
    prepare: (request, state) => ({
      success: true,
      payload: {
        requestId: request.requestId,
        owner: request.to,
        nextState: (state as number) - 10,
        actual: 10,
        prepared: {},
        ...payload,
      },
      trace: { root: createTraceNode({ id: "t", label: "t" }) },
      warnings: [],
    }),
    commit: (cost) => ({
      outcome: { requestId: cost.requestId, requested: 10, actual: cost.actual! },
      events: [],
    }),
  });

  it("refuses a quantitative cost prepared without an actual", () => {
    const result = withCostHandler(preparing({ actual: undefined }));

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.cost.actual.missing");

    expect(original).toEqual({ "aura:gon": 100, "body:gon": 50 });
  });

  /*
   * The bypass itself: underpaying a cost that forbids underpayment, by
   * declining to say how much was paid.
   */
  it("cannot dodge full-payment validation by omitting the amount", () => {
    const underpaying = withCostHandler(preparing({ actual: 4 }));
    const silent = withCostHandler(preparing({ actual: undefined }));

    expect(underpaying.success).toBe(false);
    expect(silent.success).toBe(false);
  });

  it.each([
    ["a missing requested", { requested: undefined, actual: 10 }, "runtime.outcome.amount.missing"],
    ["a missing actual", { requested: 10, actual: undefined }, "runtime.outcome.amount.missing"],
    ["a mismatched requested", { requested: 99, actual: 10 }, "runtime.outcome.requested.mismatch"],
  ])("refuses a cost outcome with %s", (_name, outcome: Record<string, unknown>, code) => {
    const result = withCostHandler({
      domain: "aura",
      prepare: (request, state) => ({
        success: true,
        payload: {
          requestId: request.requestId,
          owner: request.to,
          nextState: (state as number) - 10,
          actual: 10,
          prepared: {},
        },
        trace: { root: createTraceNode({ id: "t", label: "t" }) },
        warnings: [],
      }),
      commit: (cost) => ({
        outcome: {
          requestId: cost.requestId,
          ...outcome,
        } as RuntimeRequestOutcome,
        events: [],
      }),
    });

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code)).toContain(code);
    expect(original).toEqual({ "aura:gon": 100, "body:gon": 50 });
  });

  const quantitativeEffect = (requestId: string): QuantitativeRequest => ({
    requestId,
    kind: "damage",
    phase: "effect",
    operationId: OPERATION.operationId,
    occurredAt: OPERATION.occurredAt,
    from: CALLER,
    to: owner("body", "gon"),
    requested: 12,
  });

  it.each([
    ["no amounts at all", {}, "runtime.outcome.amount.missing"],
    ["only an actual", { actual: 5 }, "runtime.outcome.amount.missing"],
    ["a mismatched requested", { requested: 3, actual: 3 }, "runtime.outcome.requested.mismatch"],
  ])("refuses a quantitative effect outcome with %s", (_name, fields, code) => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        costs: [],
        resolve: () => ({
          result: "hit",
          requests: [quantitativeEffect("e1")],
        }),
      },
      {
        costs: [],
        effects: [{
          domain: "body",
          applyBatch: (requests, state) => ({
            state,
            outcomes: requests.map((one) => ({
              requestId: one.requestId,
              ...fields,
            }) as RuntimeRequestOutcome),
            events: [],
          }),
        }],
      },
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code)).toContain(code);
    expect(original).toEqual({ "aura:gon": 100, "body:gon": 50 });
  });

  /* A removal has nothing to count, and is not asked to invent a figure. */
  it("still accepts a non-quantitative outcome with no amounts", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: original,
        costs: [],
        resolve: () => ({
          result: "healed",
          requests: [{
            requestId: "e1",
            kind: "character-status.remove-injury",
            phase: "effect" as const,
            operationId: OPERATION.operationId,
            occurredAt: OPERATION.occurredAt,
            from: CALLER,
            to: owner("body", "gon"),
          }],
        }),
      },
      {
        costs: [],
        effects: [{
          domain: "body",
          applyBatch: (requests, state) => ({
            state,
            outcomes: requests.map((one) => ({ requestId: one.requestId })),
            events: [],
          }),
        }],
      },
    );

    expect(result.success).toBe(true);
  });
});
