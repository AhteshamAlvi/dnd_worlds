/*
 * The shared transition protocol.
 *
 * Four properties carry the whole design, and each of them is the sort of
 * thing that stays true right up until somebody adds a feature:
 *
 *   - Temporary state outlives Combat in both directions.
 *   - An operation that cannot begin spends nothing.
 *   - An operation that begins and then goes badly keeps what it spent.
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
  isInCombat,
  orderRuntimeRequests,
  runCoordinatedOperation,
  wasPrevented,
  type CostCommitResult,
  type CostHandler,
  type EffectApplication,
  type EffectHandler,
  type PreparedCost,
  type RuntimeDieRoll,
  type RuntimeRequest,
} from "../runtime";

const OPERATION = { operationId: "op-1", occurredAt: 1_000 } as const;


/* ── A test-only resource owner ─────────────────────────────────────────── */

/*
 * Two of these stand in for two independent domains. It holds a pool, refuses
 * to overdraw it, and — critically — separates validating from spending, which
 * is the contract that makes multi-domain atomicity possible at all.
 */
function resourceOwner(
  domain: RuntimeRequest["to"],
  pool: number,
): { readonly handler: CostHandler; spent(): number; remaining(): number } {
  let remaining = pool;
  let spent = 0;

  return {
    handler: {
      domain,

      prepare(request: RuntimeRequest): EngineResult<PreparedCost> {
        const root = createTraceNode({
          id: `test.${domain}.prepare`,
          label: `Validate ${domain} cost`,
          inputs: { requested: { value: request.requested } },
        });

        if (request.requested > remaining) {
          root.output = false;

          return {
            success: false,
            trace: { root },
            warnings: [],
            errors: [{
              code: `test.${domain}.insufficient`,
              message: `Not enough ${domain}.`,
              audience: "developer",
              required: request.requested,
              actual: remaining,
            }],
          };
        }

        root.output = true;

        return {
          success: true,
          payload: {
            requestId: request.requestId,
            domain,
            actual: request.requested,
            prepared: { amount: request.requested, request },
          },
          trace: { root },
          warnings: [],
        };
      },

      commit(cost: PreparedCost): CostCommitResult {
        const { amount, request } = cost.prepared as {
          amount: number;
          request: RuntimeRequest;
        };

        remaining -= amount;
        spent += amount;

        return {
          outcome: {
            requestId: cost.requestId,
            requested: request.requested,
            actual: amount,
          },
          events: [{
            kind: `${domain}-spent`,
            domain,
            operationId: request.operationId,
            occurredAt: request.occurredAt,
            change: { requested: request.requested, actual: amount },
          }],
        };
      },
    },

    spent: () => spent,
    remaining: () => remaining,
  };
}

function costRequest(
  overrides: Partial<RuntimeRequest> & Pick<RuntimeRequest, "requestId" | "to">,
): RuntimeRequest {
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
          upkeepPerHour: 100,
        }],
      },
    };
  };

  it("holds an active application before any encounter begins", () => {
    const state = withRen();

    expect(isInCombat(state)).toBe(false);
    expect(state.nen.applications).toHaveLength(1);
  });

  /*
   * Combat entry is an ATTACHMENT. If it copied active applications into
   * Combat there would be two of each, and they would disagree the first time
   * one of them was updated.
   */
  it("neither moves nor duplicates active state when Combat starts", () => {
    const before = withRen();
    const during = attachCombat(before, { round: 1 });

    expect(isInCombat(during)).toBe(true);
    expect(during.nen).toBe(before.nen);
    expect(during.nen.applications).toHaveLength(1);
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

  /*
   * The rule that keeps permanent data permanent. An activation flag on the
   * character is a field every save has to interpret and every migration has
   * to carry, for a fact that stops being true when the scene ends.
   */
  it("keeps activation off permanent Nen state", async () => {
    const { createUnawakenedNenState } = await import(
      "../character/foundation/nen/nen"
    );

    const nen = createUnawakenedNenState();
    const keys = Object.keys(nen);

    expect(keys).not.toContain("tenActive");
    expect(keys).not.toContain("renActive");
    expect(keys).not.toContain("zetsuActive");

    for (const key of keys) {
      expect(key.toLowerCase()).not.toMatch(/active$/);
    }
  });
});


describe("an operation that cannot begin spends nothing", () => {
  it("refuses an operation with no id and commits no cost", () => {
    const aura = resourceOwner("aura", 100);

    const result = runCoordinatedOperation(
      {
        context: { operationId: "  ", occurredAt: 1_000 },
        costs: [costRequest({ requestId: "r1", to: "aura", requested: 10 })],
        resolve: () => ({ result: "done" }),
      },
      { costs: [aura.handler], effects: [] },
    );

    expect(result.success).toBe(false);
    expect(aura.spent()).toBe(0);
  });

  it("refuses a non-finite timestamp", () => {
    const issues = findOperationContextIssues({
      operationId: "op",
      occurredAt: Number.NaN,
    });

    expect(issues.map((one) => one.code))
      .toContain("runtime.operation.timestamp.invalid");
  });

  /*
   * Dice are validated before commitment for exactly this reason: a caller who
   * forgot to supply the attack roll must not have paid for the swing.
   */
  it("spends nothing when a required die is missing", () => {
    const aura = resourceOwner("aura", 100);

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        requiredDice: [{ purpose: "attack", sides: 20 }],
        dice: [],
        costs: [costRequest({ requestId: "r1", to: "aura", requested: 10 })],
        resolve: () => ({ result: "hit" }),
      },
      { costs: [aura.handler], effects: [] },
    );

    expect(result.success).toBe(false);
    expect(aura.spent()).toBe(0);
  });

  it("spends nothing when a die is out of its range", () => {
    const aura = resourceOwner("aura", 100);

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        requiredDice: [{ purpose: "attack", sides: 20 }],
        dice: [{ purpose: "attack", value: 21, sides: 20 }],
        costs: [costRequest({ requestId: "r1", to: "aura", requested: 10 })],
        resolve: () => ({ result: "hit" }),
      },
      { costs: [aura.handler], effects: [] },
    );

    expect(result.success).toBe(false);
    expect(aura.spent()).toBe(0);
  });

  it("refuses two dice for one purpose rather than picking one", () => {
    const issues = findDiceIssues(
      [
        { purpose: "attack", value: 3, sides: 20 },
        { purpose: "attack", value: 19, sides: 20 },
      ],
      [{ purpose: "attack", sides: 20 }],
    );

    expect(issues.map((one) => one.code)).toContain("runtime.dice.duplicate");
  });
});


describe("mandatory costs commit atomically", () => {
  it("commits both when both validate", () => {
    const aura = resourceOwner("aura", 100);
    const combat = resourceOwner("combat", 2);

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        costs: [
          costRequest({ requestId: "r-aura", to: "aura", requested: 40 }),
          costRequest({ requestId: "r-action", to: "combat", requested: 1 }),
        ],
        resolve: () => ({ result: "done" }),
      },
      { costs: [aura.handler, combat.handler], effects: [] },
    );

    expect(result.success).toBe(true);
    expect(aura.spent()).toBe(40);
    expect(combat.spent()).toBe(1);
  });

  /*
   * The property the two-phase handler exists for. The Aura is affordable and
   * the Action is not, and the character must not end up having paid the Aura.
   */
  it("commits neither when the second cost cannot be paid", () => {
    const aura = resourceOwner("aura", 100);
    const combat = resourceOwner("combat", 0);

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        costs: [
          costRequest({ requestId: "r-aura", to: "aura", requested: 40 }),
          costRequest({ requestId: "r-action", to: "combat", requested: 1 }),
        ],
        resolve: () => ({ result: "done" }),
      },
      { costs: [aura.handler, combat.handler], effects: [] },
    );

    expect(result.success).toBe(false);
    expect(aura.spent()).toBe(0);
    expect(aura.remaining()).toBe(100);
    expect(combat.spent()).toBe(0);
  });

  it("commits neither when the FIRST cost cannot be paid", () => {
    const aura = resourceOwner("aura", 10);
    const combat = resourceOwner("combat", 2);

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        costs: [
          costRequest({ requestId: "r-aura", to: "aura", requested: 40 }),
          costRequest({ requestId: "r-action", to: "combat", requested: 1 }),
        ],
        resolve: () => ({ result: "done" }),
      },
      { costs: [aura.handler, combat.handler], effects: [] },
    );

    expect(result.success).toBe(false);
    expect(aura.spent()).toBe(0);
    expect(combat.spent()).toBe(0);
  });

  /*
   * A valid attempt that goes badly keeps what it paid. The swing happened;
   * refunding it would make missing free.
   */
  it("keeps committed costs when the roll fails", () => {
    const aura = resourceOwner("aura", 100);
    const combat = resourceOwner("combat", 2);

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        requiredDice: [{ purpose: "attack", sides: 20 }],
        dice: [{ purpose: "attack", value: 1, sides: 20 }],
        costs: [
          costRequest({ requestId: "r-aura", to: "aura", requested: 40 }),
          costRequest({ requestId: "r-action", to: "combat", requested: 1 }),
        ],
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
      { costs: [aura.handler, combat.handler], effects: [] },
    );

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(result.payload.result).toEqual({ hit: false });
    expect(aura.spent()).toBe(40);
    expect(combat.spent()).toBe(1);
    expect(result.payload.events.map((one) => one.kind))
      .toContain("check-failed");
  });

  /* Partial payment is refused unless the request says otherwise. */
  it("refuses a short payment by default", () => {
    const partialOwner: CostHandler = {
      domain: "aura",
      prepare: (request) => ({
        success: true,
        payload: {
          requestId: request.requestId,
          domain: "aura",
          actual: request.requested - 1,
          prepared: {},
        },
        trace: { root: createTraceNode({ id: "t", label: "t" }) },
        warnings: [],
      }),
      commit: (cost) => ({
        outcome: { requestId: cost.requestId, requested: 0, actual: cost.actual },
        events: [],
      }),
    };

    const refused = runCoordinatedOperation(
      {
        context: OPERATION,
        costs: [costRequest({ requestId: "r1", to: "aura", requested: 10 })],
        resolve: () => ({ result: "done" }),
      },
      { costs: [partialOwner], effects: [] },
    );

    expect(refused.success).toBe(false);

    if (refused.success) throw new Error("unreachable");

    expect(refused.errors.map((one) => one.code))
      .toContain("runtime.cost.partial-payment-refused");
  });

  it("permits a short payment when the request explicitly allows it", () => {
    const partialOwner: CostHandler = {
      domain: "aura",
      prepare: (request) => ({
        success: true,
        payload: {
          requestId: request.requestId,
          domain: "aura",
          actual: request.requested - 1,
          prepared: {},
        },
        trace: { root: createTraceNode({ id: "t", label: "t" }) },
        warnings: [],
      }),
      commit: (cost) => ({
        outcome: { requestId: cost.requestId, requested: 10, actual: cost.actual },
        events: [],
      }),
    };

    const allowed = runCoordinatedOperation(
      {
        context: OPERATION,
        costs: [costRequest({
          requestId: "r1",
          to: "aura",
          requested: 10,
          allowPartial: true,
        })],
        resolve: () => ({ result: "done" }),
      },
      { costs: [partialOwner], effects: [] },
    );

    expect(allowed.success).toBe(true);

    if (!allowed.success) throw new Error("unreachable");

    expect(allowed.payload.costOutcomes[0]).toEqual({
      requestId: "r1",
      requested: 10,
      actual: 9,
    });
  });
});


describe("cross-domain requests reach their owner", () => {
  const damageHandler = (
    applied: { value: number },
    cap = Number.POSITIVE_INFINITY,
  ): EffectHandler => ({
    domain: "body",
    apply: (request): EffectApplication => {
      const actual = Math.min(request.requested, cap);

      applied.value += actual;

      return {
        outcome: {
          requestId: request.requestId,
          requested: request.requested,
          actual,
        },
        events: [{
          kind: "damage-taken",
          domain: "body",
          operationId: request.operationId,
          occurredAt: request.occurredAt,
          change: { requested: request.requested, actual },
        }],
      };
    },
  });

  it("routes an effect to the domain that owns the state", () => {
    const applied = { value: 0 };

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        costs: [],
        resolve: () => ({
          result: "hit",
          requests: [{
            requestId: "dmg-1",
            kind: "damage",
            phase: "effect" as const,
            operationId: OPERATION.operationId,
            occurredAt: OPERATION.occurredAt,
            from: "caller" as const,
            to: "body" as const,
            requested: 12,
          }],
        }),
      },
      { costs: [], effects: [damageHandler(applied)] },
    );

    expect(result.success).toBe(true);
    expect(applied.value).toBe(12);
  });

  /*
   * A resist is an outcome, not an error. Turning it into one would refund the
   * Aura and the Action every time somebody blocked.
   */
  it("reports full prevention as an actual of zero, not a failure", () => {
    const applied = { value: 0 };

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        costs: [],
        resolve: () => ({
          result: "hit",
          requests: [{
            requestId: "dmg-1",
            kind: "damage",
            phase: "effect" as const,
            operationId: OPERATION.operationId,
            occurredAt: OPERATION.occurredAt,
            from: "caller" as const,
            to: "body" as const,
            requested: 12,
          }],
        }),
      },
      { costs: [], effects: [damageHandler(applied, 0)] },
    );

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(result.payload.effectOutcomes[0]).toEqual({
      requestId: "dmg-1",
      requested: 12,
      actual: 0,
    });

    const event = result.payload.events.find((one) => one.kind === "damage-taken");

    expect(event).toBeDefined();
    expect(wasPrevented(event!)).toBe(true);
  });

  it("rejects a request id raised twice", () => {
    const applied = { value: 0 };

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        costs: [],
        resolve: () => ({
          result: "hit",
          requests: [
            {
              requestId: "dmg-1",
              kind: "damage",
              phase: "effect" as const,
              operationId: OPERATION.operationId,
              occurredAt: OPERATION.occurredAt,
              from: "caller" as const,
              to: "body" as const,
              requested: 4,
            },
            {
              requestId: "dmg-1",
              kind: "damage",
              phase: "effect" as const,
              operationId: OPERATION.operationId,
              occurredAt: OPERATION.occurredAt,
              from: "caller" as const,
              to: "body" as const,
              requested: 4,
            },
          ],
        }),
      },
      { costs: [], effects: [damageHandler(applied)] },
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.request.duplicate-id");
  });

  /* Repeated CONTENT is legitimate; only repeated identity is a bug. */
  it("allows two distinct requests with identical content", () => {
    const applied = { value: 0 };

    const request = (requestId: string) => ({
      requestId,
      kind: "damage",
      phase: "effect" as const,
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      from: "caller" as const,
      to: "body" as const,
      requested: 4,
    });

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        costs: [],
        resolve: () => ({
          result: "hit",
          requests: [request("dmg-1"), request("dmg-2")],
        }),
      },
      { costs: [], effects: [damageHandler(applied)] },
    );

    expect(result.success).toBe(true);
    expect(applied.value).toBe(8);
  });

  it("stops a request cycle instead of running forever", () => {
    let issued = 0;

    const looping: EffectHandler = {
      domain: "body",
      apply: (request) => {
        issued += 1;

        return {
          outcome: {
            requestId: request.requestId,
            requested: request.requested,
            actual: request.requested,
          },
          events: [],
          requests: [{
            ...request,
            requestId: `loop-${issued}`,
          }],
        };
      },
    };

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        costs: [],
        resolve: () => ({
          result: "hit",
          requests: [{
            requestId: "start",
            kind: "damage",
            phase: "effect" as const,
            operationId: OPERATION.operationId,
            occurredAt: OPERATION.occurredAt,
            from: "caller" as const,
            to: "body" as const,
            requested: 1,
          }],
        }),
      },
      { costs: [], effects: [looping] },
    );

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.consequences.too-deep");

    expect(issued).toBeLessThanOrEqual(MAXIMUM_CONSEQUENCE_DEPTH);
  });
});


describe("order does not decide outcomes", () => {
  const requests = (): RuntimeRequest[] => [
    costRequest({ requestId: "b", to: "combat", requested: 1 }),
    costRequest({ requestId: "a", to: "aura", requested: 10 }),
    costRequest({ requestId: "c", to: "aura", requested: 5 }),
  ];

  it("resolves the same set the same way whatever order it arrived in", () => {
    const run = (order: readonly RuntimeRequest[]) => {
      const aura = resourceOwner("aura", 100);
      const combat = resourceOwner("combat", 2);

      const result = runCoordinatedOperation(
        {
          context: OPERATION,
          costs: order,
          resolve: () => ({ result: "done" }),
        },
        { costs: [aura.handler, combat.handler], effects: [] },
      );

      if (!result.success) throw new Error("expected success");

      return {
        aura: aura.spent(),
        combat: combat.spent(),
        outcomes: result.payload.costOutcomes,
        events: result.payload.events.map((one) => `${one.kind}:${one.sequence}`),
      };
    };

    const forward = run(requests());
    const reversed = run([...requests()].reverse());

    expect(reversed).toEqual(forward);
  });

  it("orders requests by a total, stable key rather than by arrival", () => {
    const ordered = orderRuntimeRequests(requests()).map((one) => one.requestId);
    const reordered = orderRuntimeRequests([...requests()].reverse())
      .map((one) => one.requestId);

    expect(reordered).toEqual(ordered);
    expect(ordered).toEqual(["a", "c", "b"]);
  });

  it("does not mutate the caller's request array", () => {
    const original = requests();
    const snapshot = original.map((one) => one.requestId);

    orderRuntimeRequests(original);

    expect(original.map((one) => one.requestId)).toEqual(snapshot);
  });
});


describe("results are deterministic and serializable", () => {
  it("survives a JSON round trip unchanged", () => {
    const aura = resourceOwner("aura", 100);

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        costs: [costRequest({ requestId: "r1", to: "aura", requested: 10 })],
        resolve: () => ({ result: { hit: true } }),
      },
      { costs: [aura.handler], effects: [] },
    );

    if (!result.success) throw new Error("expected success");

    const { events, costOutcomes, effectOutcomes } = result.payload;

    expect(JSON.parse(JSON.stringify({ events, costOutcomes, effectOutcomes })))
      .toEqual({ events, costOutcomes, effectOutcomes });
  });

  it("numbers its events in resolution order", () => {
    const aura = resourceOwner("aura", 100);
    const combat = resourceOwner("combat", 2);

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        costs: [
          costRequest({ requestId: "r-action", to: "combat", requested: 1 }),
          costRequest({ requestId: "r-aura", to: "aura", requested: 10 }),
        ],
        resolve: () => ({ result: "done" }),
      },
      { costs: [aura.handler, combat.handler], effects: [] },
    );

    if (!result.success) throw new Error("expected success");

    expect(result.payload.events.map((one) => one.sequence)).toEqual([0, 1]);
  });
});
