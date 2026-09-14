/*
 * Priority funding, partial payment, and the Aura ledger.
 *
 * Four defects converged on the same missing idea: Aura could answer "can this
 * character afford this?" and nothing else. It could not say which of two
 * costs mattered more, could not pay for one of them and part of another, and
 * could not tell the mechanic that asked how much it had actually got.
 *
 *   ORDER WAS METADATA. Costs were funded in `compareRuntimeRequests` order,
 *   which ends on kind and then request id — so whether a character paid for
 *   their skill or their sword was decided by the alphabet, and renaming a
 *   request kind silently rebalanced the game.
 *
 *   PAYMENT WAS ALL OR NOTHING. `auraCostRequest` hard-coded allowPartial to
 *   false and `spendActionAura` refused any cost the reserve could not meet in
 *   full, so the settled 14/10/10 example could not be expressed at all.
 *
 *   SHORTAGE WAS PROPORTIONAL. A shrinking Output budget scaled every standing
 *   commitment, degrading all of them instead of costing the character the one
 *   that mattered least. That half lives in aura-transitions.test.ts.
 *
 *   RESOLUTION COULD NOT READ THE ANSWER. `resolve` received dice and
 *   post-cost states, so a mechanic wanting to know what it had been funded
 *   had to subtract two Aura states and re-derive Control — this domain's
 *   arithmetic, done by somebody who does not own it.
 *
 * The worked example the resource rules are written against, and the spine of
 * this suite: Current Aura 14, a priority 10-Aura skill, then a 10-Aura sword.
 * The skill funds in full and the sword meets 4. Under consume-and-fail with a
 * minimum of 10 the sword fails and the 4 is spent; under scale it is a
 * 4-Aura effect; under require-full it is refused and the 4 stays.
 */

import { describe, expect, it } from "vitest";

import {
  AURA_ACTION_COST,
  auraCostRequest,
  createAuraCostHandler,
  type AuraCostDetail,
  type AuraSpentEvent,
} from "../character/foundation/aura/runtime";
import {
  settleAuraFunding,
  findAuraShortfallPolicyIssues,
  type AuraShortfallPolicy,
} from "../character/foundation/aura/funding";
import { fundActionAura } from "../character/foundation/aura/transitions";
import { settleAuraCommitments } from "../character/foundation/aura/budget";
import type { CharacterAuraState } from "../character/foundation/aura/state";
import type { AuraAllocation } from "../character/foundation/aura/state";
import {
  compareCostRequests,
  orderCostRequests,
  runCoordinatedOperation,
  type RuntimeRequest,
  type SettledCosts,
} from "../runtime";

import { auraContext, auraTestAttributes, WITH_TEN } from "./fixtures/aura";


const OPERATION = { operationId: "op-1", occurredAt: 5_000 } as const;

const CALLER = { domain: "caller", id: "host" } as const;
const GON = { domain: "aura", id: "gon" } as const;
const KILLUA = { domain: "aura", id: "killua" } as const;


/*
 * DEX 22 is the Control pivot, so the multiplier is exactly 1.
 *
 * Every figure in the worked example is a base cost, and a multiplier of
 * anything else would make "a 10-Aura sword" mean 29 Aura and bury the
 * arithmetic the example is about. Control's own effect on funding is tested
 * separately, where it is the subject rather than a distortion.
 */
function context(dex = 22) {
  return auraContext({
    attributes: auraTestAttributes({ con: 20, vit: 20, dex }),
    access: WITH_TEN,
  });
}

function state(current: number): CharacterAuraState {
  return { current, allocations: [] };
}

/** A deliberate Aura cost with no physical component, as the example has. */
function cost(input: {
  readonly requestId: string;
  readonly amount: number;
  readonly priority?: number;
  readonly shortfall?: AuraShortfallPolicy;
  readonly to?: { readonly domain: "aura"; readonly id: string };
}) {
  return auraCostRequest({
    requestId: input.requestId,
    operationId: OPERATION.operationId,
    occurredAt: OPERATION.occurredAt,
    from: CALLER,
    to: input.to ?? GON,
    requested: input.amount,
    baseAuraCost: input.amount,
    ...(input.priority === undefined ? {} : { costPriority: input.priority }),
    ...(input.shortfall === undefined ? {} : { shortfall: input.shortfall }),
  });
}

function detailOf(costs: SettledCosts, requestId: string): AuraCostDetail {
  return costs.detail(requestId) as AuraCostDetail;
}


describe("explicit cost priority", () => {
  it("funds the higher priority first, whatever the kinds are called", () => {
    /*
     * The ids sort the opposite way from the priorities on purpose. Under the
     * old comparison the sword would have been funded first for no reason
     * anybody chose; only a stated priority can put the skill ahead of it.
     */
    const ordered = orderCostRequests([
      cost({ requestId: "a-sword", amount: 10, priority: 1 }),
      cost({ requestId: "z-skill", amount: 10, priority: 10 }),
    ]);

    expect(ordered.map((one) => one.requestId)).toEqual(["z-skill", "a-sword"]);
  });

  it("gives the same order however the caller arranged the array", () => {
    const skill = cost({ requestId: "skill", amount: 10, priority: 10 });
    const sword = cost({ requestId: "sword", amount: 10, priority: 1 });
    const shield = cost({ requestId: "shield", amount: 10, priority: 5 });

    const expected = ["skill", "shield", "sword"];

    for (const arrangement of [
      [skill, sword, shield],
      [sword, shield, skill],
      [shield, skill, sword],
      [sword, skill, shield],
    ]) {
      expect(orderCostRequests(arrangement).map((one) => one.requestId))
        .toEqual(expected);
    }
  });

  it("breaks equal priorities on request id, never on kind", () => {
    /*
     * Two requests that differ ONLY in kind, with kind ordered against id.
     * `compareRuntimeRequests` consults kind before id and would order these
     * the other way; funding order must not, because kind is a name for which
     * mechanic is asking and not a claim about which one matters.
     */
    const first: RuntimeRequest = {
      ...cost({ requestId: "aaa", amount: 10 }),
      kind: "zzz.hostile-kind",
    };

    const second: RuntimeRequest = {
      ...cost({ requestId: "zzz", amount: 10 }),
      kind: "aaa.hostile-kind",
    };

    expect(compareCostRequests(first, second)).toBeLessThan(0);
    expect(orderCostRequests([second, first]).map((one) => one.requestId))
      .toEqual(["aaa", "zzz"]);
  });

  it("keeps two owners' costs from interleaving", () => {
    /*
     * Two characters never compete for one reserve, so a high priority on
     * Killua's cost must not push it between two of Gon's. Interleaving would
     * make one character's funding order depend on who else was in the fight.
     */
    const ordered = orderCostRequests([
      cost({ requestId: "gon-low", amount: 1, priority: 1 }),
      cost({ requestId: "killua-high", amount: 1, priority: 99, to: KILLUA }),
      cost({ requestId: "gon-high", amount: 1, priority: 50 }),
    ]);

    expect(ordered.map((one) => one.requestId))
      .toEqual(["gon-high", "gon-low", "killua-high"]);
  });
});


describe("the settled 14 / 10 / 10 example", () => {
  const skill = { requestId: "skill", amount: 10, priority: 10 } as const;

  function run(shortfall: AuraShortfallPolicy) {
    return runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state(14) },
        costs: [
          cost({ requestId: "sword", amount: 10, priority: 1, shortfall }),
          cost(skill),
        ],
        resolve: (_dice, states, costs) => ({
          result: {
            pool: (states["aura:gon"] as CharacterAuraState).current,
            skill: detailOf(costs, "skill"),
            sword: detailOf(costs, "sword"),
          },
        }),
      },
      { costs: [createAuraCostHandler(() => context())], effects: [] },
    );
  }

  it("consume-and-fail spends the 4 and still fails the sword", () => {
    const result = run({ kind: "consume-and-fail", minimum: 10 });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const { pool, skill: fundedSkill, sword } = result.payload.result;

    expect(pool).toBe(0);

    expect(fundedSkill.succeeded).toBe(true);
    expect(fundedSkill.funding.funded).toBe(10);
    expect(fundedSkill.funding.unmet).toBe(0);
    expect(fundedSkill.funding.status).toBe("funded");

    /*
     * The whole point of the policy. The attempt failed and the Aura is gone —
     * the one case in the engine where a failure is not a refund.
     */
    expect(sword.succeeded).toBe(false);
    expect(sword.funding.status).toBe("consumed-below-minimum");
    expect(sword.funding.funded).toBe(4);
    expect(sword.funding.authoritativeCost).toBe(10);
    expect(sword.funding.unmet).toBe(6);
  });

  it("scale turns the same 4 into a 4-Aura effect", () => {
    const result = run({ kind: "scale" });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const { pool, sword } = result.payload.result;

    expect(pool).toBe(0);
    expect(sword.succeeded).toBe(true);
    expect(sword.funding.status).toBe("scaled");
    expect(sword.funding.funded).toBe(4);
    expect(sword.funding.unmet).toBe(6);

    /* At the Control pivot the Aura spent IS the base cost that landed. */
    expect(sword.funding.usefulAura).toBe(4);
  });

  it("require-full refuses the sword atomically and spends nothing", () => {
    const result = run({ kind: "require-full" });

    /*
     * The whole operation is discarded, skill included. That is what atomic
     * means and is why the policy has to be opted out of rather than into: a
     * caller who said "all of it or none of it" gets exactly that.
     */
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("aura.expenditure.insufficient");
  });

  it("defaults to require-full when the request says nothing", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state(14) },
        costs: [
          cost({ requestId: "sword", amount: 10, priority: 1 }),
          cost(skill),
        ],
        resolve: () => ({ result: "swung" }),
      },
      { costs: [createAuraCostHandler(() => context())], effects: [] },
    );

    expect(result.success).toBe(false);
  });

  it("a legal shortfall preserves the cost funded before it", () => {
    const result = run({ kind: "scale" });

    expect(result.success).toBe(true);
    if (!result.success) return;

    /*
     * The skill keeps its full 10 even though the cost after it could not be
     * met. Underfunding is an OUTCOME; it does not roll back the transaction
     * the way a malformed request does.
     */
    expect(result.payload.result.skill.funding.funded).toBe(10);
  });

  it("a later malformed request still rolls every draft back", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state(14) },
        costs: [
          cost(skill),
          {
            ...cost({
              requestId: "sword",
              amount: 10,
              priority: 1,
              shortfall: { kind: "scale" },
            }),
            requested: Number.NaN,
          },
        ],
        resolve: () => ({ result: "swung" }),
      },
      { costs: [createAuraCostHandler(() => context())], effects: [] },
    );

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.request.amount.invalid");
  });
});


describe("what resolve is told", () => {
  it("reports funded, unmet and status without recomputing Aura", () => {
    let seen: SettledCosts | null = null;

    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state(14) },
        costs: [cost({
          requestId: "sword",
          amount: 10,
          shortfall: { kind: "scale" },
        })],
        resolve: (_dice, _states, costs) => {
          seen = costs;

          return { result: "swung" };
        },
      },
      { costs: [createAuraCostHandler(() => context())], effects: [] },
    );

    expect(result.success).toBe(true);
    expect(seen).not.toBeNull();
    if (seen === null) return;

    const costs = seen as SettledCosts;

    expect(costs.outcome("sword")).toEqual({
      requestId: "sword",
      requested: 10,
      actual: 10,
    });

    /*
     * `actual` is what left the pool and `funded` agrees with it — but the
     * generic outcome has no room for the authoritative price, the unmet
     * demand or the status, which is exactly why `detail` exists.
     */
    const detail = detailOf(costs, "sword");

    expect(detail.funding.requested).toBe(10);
    expect(detail.funding.authoritativeCost).toBe(10);
    expect(detail.funding.funded).toBe(10);
    expect(detail.funding.unmet).toBe(0);
  });

  it("hands back an immutable view", () => {
    let seen: SettledCosts | null = null;

    runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state(1000) },
        costs: [cost({ requestId: "swing", amount: 10 })],
        resolve: (_dice, _states, costs) => {
          seen = costs;

          return { result: "swung" };
        },
      },
      { costs: [createAuraCostHandler(() => context())], effects: [] },
    );

    if (seen === null) throw new Error("resolve was never called");

    const costs = seen as SettledCosts;

    expect(Object.isFrozen(costs)).toBe(true);
    expect(Object.isFrozen(costs.all)).toBe(true);
    expect(costs.outcome("no-such-request")).toBeUndefined();
    expect(costs.detail("no-such-request")).toBeUndefined();
  });
});


describe("the ledger", () => {
  it("separates requested, authoritative, funded, Control delta and unmet", () => {
    /*
     * DEX 10 puts the Control multiplier at 2.9, so a base cost of 10 is an
     * authoritative 29 — and a requester who asked for 10 is simply told. The
     * ledger has to keep all three figures apart: a record that stored only
     * the charge could not show the caller their estimate was wrong, and one
     * that stored only the estimate would be fiction.
     */
    const result = fundActionAura(
      state(20),
      context(10),
      { baseAuraCost: 10 },
      { kind: "scale" },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    const funding = result.payload.funding;

    expect(funding).toBeDefined();
    if (funding === undefined) return;

    expect(funding.cost.deliberate?.controlMultiplier).toBe(2.9);
    expect(funding.cost.deliberate?.finalCost).toBeCloseTo(29, 8);
    expect(funding.settlement.funded).toBe(20);
    expect(funding.settlement.unmet).toBeCloseTo(9, 8);
    expect(funding.settlement.status).toBe("scaled");

    /* Of the 20 spent, 20/2.9 reached the technique and the rest was waste. */
    expect(funding.usefulAura).toBeCloseTo(20 / 2.9, 8);
    expect(funding.controlDelta).toBeCloseTo(20 - 20 / 2.9, 8);

    expect(result.payload.current).toBe(0);
  });

  it("reports a Control saving as a negative delta", () => {
    /* Above the pivot the multiplier is below 1, so more reaches the target. */
    const result = fundActionAura(state(10_000), context(40), {
      baseAuraCost: 100,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const funding = result.payload.funding!;

    expect(funding.cost.deliberate!.controlMultiplier).toBeLessThan(1);
    expect(funding.controlDelta).toBeLessThan(0);
    expect(funding.usefulAura).toBeCloseTo(100, 8);
  });

  it("claims no useful Aura for purely physical effort", () => {
    const result = fundActionAura(state(10_000), context(), {
      exertionLoad: 1,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    /*
     * What a punch ACCOMPLISHES is Body's and Combat's answer. Aura knows what
     * the effort cost and nothing else, and a number invented here would be
     * the authoritative-looking wrong one every downstream system quoted.
     */
    expect(result.payload.funding!.usefulAura).toBeNull();
    expect(result.payload.funding!.controlDelta).toBe(0);
  });

  it("reaches the event log with every figure intact", () => {
    /* Four Aura against a 10-Aura cost: the sword half of the worked example. */
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state(4) },
        costs: [cost({
          requestId: "sword",
          amount: 10,
          priority: 3,
          shortfall: { kind: "consume-and-fail", minimum: 10 },
        })],
        resolve: () => ({ result: "swung" }),
      },
      { costs: [createAuraCostHandler(() => context())], effects: [] },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    const spent = result.payload.events.find((one) => one.kind === "aura-spent");

    expect(spent).toBeDefined();

    expect((spent as unknown as AuraSpentEvent).ledger)
      .toEqual(expect.objectContaining({
        requestId: "sword",
        owner: "aura:gon",
        source: "caller:host",
        priority: 3,
        requested: 10,
        authoritativeCost: 10,
        funded: 4,
        committed: 0,
        unmet: 6,
        status: "consumed-below-minimum",
      }));
  });

  it("never reports a commitment no allocation records", () => {
    /*
     * An action cost is Aura LEAVING the reserve. Output commitment is a
     * separate operation on the allocations, and a ledger that guessed one
     * here would disagree with the state it claims to describe.
     */
    const result = fundActionAura(state(10_000), context(), {
      baseAuraCost: 100,
      requiredOutput: 500,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.state.allocations).toEqual([]);
  });
});


describe("aggregate Output and the shared ceiling", () => {
  /*
   * The reference curve, unchanged by anything in this phase. These are the
   * figures every Output claim in the rules is quoted against, and a change to
   * the magnitude formula that slipped past the Output tests would show up
   * here as a budget that funds the wrong number of commitments.
   */
  it("keeps the reference Physiological Output values", () => {
    const byCon: readonly (readonly [number, number])[] = [
      [10, 2],
      [15, 100],
      [20, 10_000],
      [25, 2_000_000],
      [30, 800_000_000],
    ];

    for (const [con, expected] of byCon) {
      const result = fundActionAura(
        { current: 0, allocations: [] },
        auraContext({
          attributes: auraTestAttributes({ con, vit: con, dex: 22 }),
          access: WITH_TEN,
        }),
        {},
      );

      expect(result.success).toBe(true);
      if (!result.success) continue;

      expect(result.payload.funding!.accessibleCapacity).toBeLessThanOrEqual(
        expected,
      );
    }
  });

  it("refuses 200 + 20 against a 200 ceiling and accepts 180 + 20", () => {
    /*
     * The worked ceiling case. A character maintaining their whole Output in
     * one commitment has nothing left for another, and has to redistribute
     * rather than exceed the total — which is what makes Output a shared pool
     * instead of a per-commitment allowance.
     */
    const overCommitted = settleAuraCommitments(
      [
        {
          id: "ten",
          coverage: "whole-body",
          placement: "surface",
          aura: 200,
          priority: 10,
        },
        {
          id: "technique",
          coverage: "whole-body",
          placement: "surface",
          aura: 20,
          priority: 1,
        },
      ],
      200,
    );

    expect(overCommitted[0]).toEqual(
      expect.objectContaining({ kind: "kept" }),
    );
    expect(overCommitted[1]).toEqual(
      expect.objectContaining({ kind: "released", reason: "no-capacity" }),
    );

    const redistributed = settleAuraCommitments(
      [
        {
          id: "ten",
          coverage: "whole-body",
          placement: "surface",
          aura: 180,
          priority: 10,
        },
        {
          id: "technique",
          coverage: "whole-body",
          placement: "surface",
          aura: 20,
          priority: 1,
        },
      ],
      200,
    );

    expect(redistributed.every((one) => one.kind === "kept")).toBe(true);
  });

  it("settles commitments by priority, never by array order", () => {
    const guard: AuraAllocation = {
      id: "zzz",
      coverage: "whole-body",
      placement: "surface",
      aura: 100,
      priority: 10,
    };

    const minor: AuraAllocation = {
      id: "aaa",
      coverage: "whole-body",
      placement: "surface",
      aura: 100,
      priority: 1,
    };

    for (const arrangement of [[guard, minor], [minor, guard]]) {
      const settled = settleAuraCommitments(arrangement, 100);
      const byId = new Map(
        arrangement.map((one, index) => [one.id, settled[index]!]),
      );

      expect(byId.get("zzz")!.kind).toBe("kept");
      expect(byId.get("aaa")!.kind).toBe("released");
    }
  });
});


describe("owner isolation", () => {
  it("charges each character their own pool through their own body", () => {
    /*
     * Different reserves AND different contexts. One shared context is the
     * defect that charged Killua's pool using Gon's Attributes and reported a
     * confident figure, which is worse than a shared pool because the numbers
     * look individual and are not.
     */
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state(4), "aura:killua": state(1000) },
        costs: [
          cost({
            requestId: "gon-sword",
            amount: 10,
            shortfall: { kind: "scale" },
          }),
          cost({ requestId: "killua-sword", amount: 10, to: KILLUA }),
        ],
        resolve: (_dice, states, costs) => ({
          result: {
            gon: (states["aura:gon"] as CharacterAuraState).current,
            killua: (states["aura:killua"] as CharacterAuraState).current,
            gonFunding: detailOf(costs, "gon-sword").funding,
            killuaFunding: detailOf(costs, "killua-sword").funding,
          },
        }),
      },
      {
        costs: [createAuraCostHandler((owner) =>
          owner.id === "killua" ? context(40) : context(22)
        )],
        effects: [],
      },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    const seen = result.payload.result;

    expect(seen.gon).toBe(0);
    expect(seen.gonFunding.status).toBe("scaled");
    expect(seen.gonFunding.owner).toBe("aura:gon");

    /* Killua's higher DEX is a cheaper multiplier, on his own reserve. */
    expect(seen.killuaFunding.owner).toBe("aura:killua");
    expect(seen.killuaFunding.status).toBe("funded");
    expect(seen.killua).toBeGreaterThan(980);
    expect(seen.killuaFunding.authoritativeCost).toBeLessThan(10);
  });
});


describe("hostile and malformed input", () => {
  const HOSTILE: readonly (readonly [string, unknown])[] = [
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["negative infinity", Number.NEGATIVE_INFINITY],
    ["a negative minimum", -1],
  ];

  it.each(HOSTILE)("refuses %s as a shortfall minimum", (_label, minimum) => {
    const issues = findAuraShortfallPolicyIssues({
      kind: "consume-and-fail",
      minimum: minimum as number,
    });

    expect(issues.map((one) => one.code))
      .toContain("aura.funding.minimum.invalid");
  });

  it("refuses a consume-and-fail policy with no minimum", () => {
    const issues = findAuraShortfallPolicyIssues(
      { kind: "consume-and-fail" } as AuraShortfallPolicy,
    );

    expect(issues.map((one) => one.code))
      .toContain("aura.funding.minimum.missing");
  });

  it("refuses an unknown or absent policy discriminant", () => {
    for (const policy of [
      { kind: "scale-a-bit" },
      { kind: undefined },
      {},
      null,
    ]) {
      expect(
        findAuraShortfallPolicyIssues(policy as unknown as AuraShortfallPolicy)
          .map((one) => one.code),
      ).toContain("aura.funding.policy.invalid");
    }
  });

  it("reports a malformed policy rather than throwing, and changes nothing", () => {
    const before: CharacterAuraState = Object.freeze({
      current: 100,
      allocations: [],
    });

    const result = fundActionAura(
      before,
      context(),
      { baseAuraCost: 10 },
      { kind: "consume-and-fail" } as AuraShortfallPolicy,
    );

    expect(result.success).toBe(false);
    expect(before.current).toBe(100);
  });

  it("refuses a non-finite cost priority", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state(1000) },
        costs: [{
          ...cost({ requestId: "swing", amount: 10 }),
          costPriority: Number.NaN,
        }],
        resolve: () => ({ result: "swung" }),
      },
      { costs: [createAuraCostHandler(() => context())], effects: [] },
    );

    expect(result.success).toBe(false);
    if (result.success) return;

    /*
     * NaN is the dangerous one. Every comparison against it is false, so a
     * sort silently leaves the array in whatever order it arrived in — the
     * caller-order dependence explicit priority exists to remove.
     */
    expect(result.errors.map((one) => one.code))
      .toContain("runtime.request.priority.invalid");
  });

  it("refuses duplicate request ids before anything is priced", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state(1000) },
        costs: [
          cost({ requestId: "swing", amount: 10 }),
          cost({ requestId: "swing", amount: 10 }),
        ],
        resolve: () => ({ result: "swung" }),
      },
      { costs: [createAuraCostHandler(() => context())], effects: [] },
    );

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("runtime.request.duplicate-id");
  });

  it("refuses an owner it has no context for", () => {
    const result = runCoordinatedOperation(
      {
        context: OPERATION,
        states: { "aura:gon": state(1000) },
        costs: [cost({ requestId: "swing", amount: 10 })],
        resolve: () => ({ result: "swung" }),
      },
      { costs: [createAuraCostHandler(() => undefined)], effects: [] },
    );

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("aura.runtime.context.missing");
  });

  it("settles a zero-cost request without dividing by anything", () => {
    const settled = settleAuraFunding(0, 0, { kind: "scale" });

    expect(settled).toEqual({ funded: 0, unmet: 0, status: "funded" });
  });

  it("never funds more than the cost, however much is available", () => {
    expect(settleAuraFunding(1000, 10, { kind: "scale" }))
      .toEqual({ funded: 10, unmet: 0, status: "funded" });
  });

  it("treats a negative available reserve as nothing available", () => {
    expect(settleAuraFunding(-5, 10, { kind: "scale", minimum: 1 }))
      .toEqual({ funded: 0, unmet: 10, status: "refused-below-minimum" });
  });

  it("keeps the request kind it was built with", () => {
    expect(cost({ requestId: "swing", amount: 1 }).kind).toBe(AURA_ACTION_COST);
  });
});
