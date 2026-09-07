/*
 * Committing a finalized action, once.
 *
 * The tests that matter most here are the ones that prove nothing happened:
 * a preview commits nothing, a refused adjudication commits nothing, and a
 * routing failure leaves every pool exactly where it started. An engine that
 * gets those wrong loses resources in ways that look like balance problems for
 * months before anybody suspects a bug.
 */

import { describe, expect, it } from "vitest";

import {
  NO_FOCUS,
  ONE_ACTION,
  UNSTRUCTURED_EXECUTION,
  adjudicateAction,
  auraExpenditureConsequence,
  bodyDamageConsequence,
  informationalConsequence,
  narrativeConsequence,
  prepareAction,
  settleAction,
  staminaDamageConsequence,
  worldChangeConsequence,
  type ActionProfile,
  type ActionProposal,
  type AdjudicatedAction,
  type Consequence,
  type ConsequenceContext,
} from "../actions";
import { EXACTLY_ONE_TARGET, type TargetRef } from "../targeting";
import type {
  QuantitativeRequest,
  RuntimeRequest,
} from "../runtime/requests";
import type { RuntimeOperationContext } from "../runtime/context";
import { seconds } from "../time/duration";
import {
  poolCostHandler,
  poolEffectHandler,
  stateOf,
} from "./fixtures/settlement";
import { errorCodesOf, payloadOf } from "./fixtures/result";

const OPERATION: RuntimeOperationContext = {
  operationId: "op-1",
  occurredAt: 1_000,
};

const CONSEQUENCE_CONTEXT: ConsequenceContext = {
  operationId: "op-1",
  occurredAt: 1_000,
  from: { domain: "caller", id: "gon" },
};

const KITE: TargetRef = { kind: "entity", entityId: "kite" };

const STRIKE: ActionProfile = {
  id: "aura-strike",
  source: { type: "skill", id: "aura-strike" },
  allowedTimings: ["action"],
  structuredActionCost: ONE_ACTION,
  targets: { cardinality: EXACTLY_ONE_TARGET },
  permittedFocusKinds: ["none"],
  executionDuration: seconds(1),
  check: { scope: { kind: "attribute", attribute: "dex" } },
};

function auraCost(requestId: string, requested: number): QuantitativeRequest {
  return {
    requestId,
    kind: "aura.spend",
    phase: "cost",
    operationId: "op-1",
    occurredAt: 1_000,
    from: { domain: "caller", id: "gon" },
    to: { domain: "aura", id: "gon" },
    requested,
  };
}

function proposalWith(costs: readonly RuntimeRequest[]): ActionProposal {
  return payloadOf(prepareAction({
    operationId: "op-1",
    profile: STRIKE,
    intent: {
      id: "intent-1",
      profileId: STRIKE.id,
      actor: { type: "character", id: "gon" },
      targets: [KITE],
      focus: NO_FOCUS,
      executionContext: UNSTRUCTURED_EXECUTION,
    },
    approach: "mechanical",
    costRequests: costs,
    suggestedAffectedSubjects: { evaluated: true, subjects: [KITE] },
  }));
}

function adjudicated(
  options: {
    readonly costs?: readonly RuntimeRequest[];
    readonly roll?: number;
    readonly proposal?: ActionProposal;
    readonly waive?: string;
  } = {},
): AdjudicatedAction {
  const base = options.proposal ?? proposalWith(options.costs ?? [auraCost("aura-1", 40)]);

  return payloadOf(adjudicateAction({
    operationId: "op-1",
    proposal: base,
    approach: "mechanical",
    decision: options.waive === undefined
      ? { kind: "accept" }
      : { kind: "modify", costs: [{ requestId: options.waive, waived: true }] },
    dice: [{
      purpose: "check:aura-strike",
      sides: 20,
      values: [options.roll ?? 18],
    }],
    checkInputs: {
      baseContributions: [{ id: "dex", amount: 0 }],
      modifiers: [],
      difficulty: 10,
    },
  }));
}

function handlers() {
  return {
    costs: [poolCostHandler("aura")],
    effects: [poolEffectHandler("body", "op-1", 1_000)],
  };
}

function startingStates() {
  return { "aura:gon": 100, "body:kite": 50 };
}


describe("nothing commits before it is meant to", () => {
  it("leaves every pool untouched while only a proposal exists", () => {
    const states = startingStates();

    proposalWith([auraCost("aura-1", 40)]);

    expect(states).toEqual({ "aura:gon": 100, "body:kite": 50 });
  });

  it("commits nothing when the adjudication left the action ineligible", () => {
    const blocked = payloadOf(prepareAction({
      operationId: "op-1",
      profile: STRIKE,
      intent: {
        id: "intent-1",
        profileId: STRIKE.id,
        actor: { type: "character", id: "gon" },
        targets: [KITE],
        focus: NO_FOCUS,
        executionContext: UNSTRUCTURED_EXECUTION,
      },
      approach: "mechanical",
      costRequests: [auraCost("aura-1", 40)],
      eligibility: [{
        id: "character.requirement.mastery",
        status: "unsatisfied",
        decidedBy: "character",
      }],
    }));

    const states = startingStates();

    const result = settleAction({
      adjudicated: adjudicated({ proposal: blocked }),
      context: OPERATION,
      states,
      handlers: handlers(),
    });

    expect(errorCodesOf(result)).toContain("actions.settlement.not-settleable");
    expect(states).toEqual({ "aura:gon": 100, "body:kite": 50 });
  });

  it("refuses to settle an action with an unanswered question", () => {
    /*
     * A GM who wants it to happen anyway overrides the finding, which leaves a
     * record. Committing quietly would spend Aura on something nobody
     * established could happen.
     */
    const unresolved = payloadOf(prepareAction({
      operationId: "op-1",
      profile: {
        ...STRIKE,
        range: { kind: "direct", minimumMetres: 0, maximumMetres: 2 },
      },
      intent: {
        id: "intent-1",
        profileId: STRIKE.id,
        actor: { type: "character", id: "gon" },
        targets: [KITE],
        focus: NO_FOCUS,
        executionContext: UNSTRUCTURED_EXECUTION,
      },
      approach: "mechanical",
      spatial: {
        origin: { kind: "metric", contextId: "yard", xMetres: 0, yMetres: 0, zMetres: 0 },
      },
    }));

    expect(unresolved.disposition).toBe("missing-facts");

    expect(errorCodesOf(settleAction({
      adjudicated: adjudicated({ proposal: unresolved }),
      context: OPERATION,
      states: startingStates(),
      handlers: handlers(),
    }))).toContain("actions.settlement.not-settleable");
  });

  it("refuses a settlement for a different operation", () => {
    expect(errorCodesOf(settleAction({
      adjudicated: adjudicated(),
      context: { operationId: "op-99", occurredAt: 1_000 },
      states: startingStates(),
      handlers: handlers(),
    }))).toContain("actions.settlement.operation.mismatch");
  });
});


describe("a finalized action commits once, atomically", () => {
  it("charges the cost and returns the authoritative state", () => {
    const settled = payloadOf(settleAction({
      adjudicated: adjudicated(),
      context: OPERATION,
      states: startingStates(),
      handlers: handlers(),
    }));

    expect(stateOf(settled.states, "aura", "gon")).toBe(60);
    expect(settled.costOutcomes[0]?.actual).toBe(40);
  });

  it("prices two costs cumulatively against one owner", () => {
    const settled = payloadOf(settleAction({
      adjudicated: adjudicated({
        costs: [auraCost("aura-1", 40), auraCost("aura-2", 25)],
      }),
      context: OPERATION,
      states: startingStates(),
      handlers: handlers(),
    }));

    expect(stateOf(settled.states, "aura", "gon")).toBe(35);
  });

  it("rolls the whole operation back when one cost cannot be paid", () => {
    const states = startingStates();

    const result = settleAction({
      adjudicated: adjudicated({
        costs: [auraCost("aura-1", 40), auraCost("aura-2", 90)],
      }),
      context: OPERATION,
      states,
      handlers: handlers(),
    });

    expect(result.success).toBe(false);

    /* The first cost was affordable. Neither was charged. */
    expect(states).toEqual({ "aura:gon": 100, "body:kite": 50 });
  });

  it("rolls back when an effect has no domain to route to", () => {
    const states = startingStates();

    const result = settleAction({
      adjudicated: adjudicated(),
      context: OPERATION,
      states,
      handlers: { costs: [poolCostHandler("aura")], effects: [] },
      consequences: [bodyDamageConsequence(CONSEQUENCE_CONTEXT, {
        requestId: "damage-1",
        bodyOwnerId: "kite",
        bodyPoints: 12,
      })],
    });

    expect(result.success).toBe(false);
    expect(states).toEqual({ "aura:gon": 100, "body:kite": 50 });
  });

  it("still pays for a miss", () => {
    /*
     * A resolved failure is a settled outcome, not an error. Aura spent on a
     * punch that missed is spent.
     */
    const missed = adjudicated({ roll: 3 });

    expect(missed.gm.succeeded).toBe(false);

    const settled = payloadOf(settleAction({
      adjudicated: missed,
      context: OPERATION,
      states: startingStates(),
      handlers: handlers(),
    }));

    expect(stateOf(settled.states, "aura", "gon")).toBe(60);
  });

  it("does not charge a cost the GM waived before execution", () => {
    const settled = payloadOf(settleAction({
      adjudicated: adjudicated({ waive: "aura-1" }),
      context: OPERATION,
      states: startingStates(),
      handlers: handlers(),
    }));

    expect(stateOf(settled.states, "aura", "gon")).toBe(100);
    expect(settled.costOutcomes).toEqual([]);
  });

  it("does not refund a reduced effect", () => {
    /*
     * The Body pool is 50 and the blow is for 80. The handler caps it, which
     * is a resist, not a validation failure — and the cost stays paid.
     */
    const settled = payloadOf(settleAction({
      adjudicated: adjudicated(),
      context: OPERATION,
      states: startingStates(),
      handlers: handlers(),
      consequences: [bodyDamageConsequence(CONSEQUENCE_CONTEXT, {
        requestId: "damage-1",
        bodyOwnerId: "kite",
        bodyPoints: 80,
      })],
    }));

    expect(settled.effectOutcomes[0]?.requested).toBe(80);
    expect(settled.effectOutcomes[0]?.actual).toBe(50);
    expect(stateOf(settled.states, "aura", "gon")).toBe(60);
  });
});


describe("consequences route by who owns the state", () => {
  const settled = () => payloadOf(settleAction({
    adjudicated: adjudicated(),
    context: OPERATION,
    states: startingStates(),
    handlers: handlers(),
    consequences: [
      bodyDamageConsequence(CONSEQUENCE_CONTEXT, {
        requestId: "damage-1",
        bodyOwnerId: "kite",
        bodyPoints: 12,
      }),
      staminaDamageConsequence({
        requestId: "sp-1",
        bodyOwnerId: "kite",
        staminaPoints: 9,
      }),
      worldChangeConsequence({
        id: "floor",
        kind: "terrain.destruction",
        summary: "The flagstones crack apart.",
      }),
      narrativeConsequence({
        id: "noise",
        summary: "The whole yard hears it.",
      }),
    ],
  }));

  it("routes BP damage to the Body that owns the points", () => {
    expect(stateOf(settled().states, "body", "kite")).toBe(38);
  });

  it("leaves SP damage unresolved rather than converting it", () => {
    /*
     * applyBodyDamage takes BP. An SP figure passed to it would be silently
     * reinterpreted at a rate nobody chose, and the injuries would look
     * exactly like correctly calculated ones.
     */
    const unresolved = settled().unresolved;

    expect(unresolved.map((error) => error.code))
      .toEqual(["actions.consequence.stamina-damage.unroutable"]);
    expect(unresolved[0]?.actual).toBe("9 SP");
  });

  it("returns a terrain change as host-facing work, not as a mutation", () => {
    const host = settled().hostConsequences;

    expect(host).toHaveLength(1);
    expect(host[0]?.kind).toBe("terrain.destruction");

    /* No state anywhere claims a floor was destroyed. */
    expect(Object.keys(settled().states).sort()).toEqual(["aura:gon", "body:kite"]);
  });

  it("carries narrative-only consequences through finalization", () => {
    expect(settled().narrative).toEqual(["The whole yard hears it."]);
  });

  it("keeps an Aura expenditure effect distinct from an Aura cost", () => {
    const settledWithDrain = payloadOf(settleAction({
      adjudicated: adjudicated(),
      context: OPERATION,
      states: startingStates(),
      handlers: {
        costs: [poolCostHandler("aura")],
        effects: [poolEffectHandler("aura", "op-1", 1_000)],
      },
      consequences: [auraExpenditureConsequence(CONSEQUENCE_CONTEXT, {
        requestId: "drain-1",
        auraOwnerId: "gon",
        amount: 10,
      })],
    }));

    /* 100 - 40 charged as a cost - 10 drained as an effect. */
    expect(stateOf(settledWithDrain.states, "aura", "gon")).toBe(50);
  });
});


describe("declared targets and affected subjects stay apart", () => {
  const collateral: TargetRef = { kind: "object", objectId: "hidden-trap" };

  const settled = () => payloadOf(settleAction({
    adjudicated: adjudicated(),
    context: OPERATION,
    states: startingStates(),
    handlers: handlers(),
    consequences: [{
      channel: "subject",
      operation: "add",
      subject: collateral,
      reason: "It was under the flagstone he hit.",
    } satisfies Consequence],
  }));

  it("adds a collateral subject to the affected list", () => {
    expect(settled().finalAffectedSubjects).toContainEqual(collateral);
  });

  it("does not add it to the declared targets", () => {
    expect(settled().declaredTargets).toEqual([KITE]);
    expect(settled().declaredTargets).not.toContainEqual(collateral);
  });

  it("removes a declared-but-unaffected subject without touching the declaration", () => {
    const withRemoval = payloadOf(settleAction({
      adjudicated: adjudicated(),
      context: OPERATION,
      states: startingStates(),
      handlers: handlers(),
      consequences: [{
        channel: "subject",
        operation: "remove",
        subject: KITE,
        reason: "He stepped out of it in time.",
      } satisfies Consequence],
    }));

    expect(withRemoval.finalAffectedSubjects).toEqual([]);
    expect(withRemoval.declaredTargets).toEqual([KITE]);
  });
});


describe("public and private consequences stay separated", () => {
  it("keeps host-facing and unresolved work out of the public view", () => {
    const settled = payloadOf(settleAction({
      adjudicated: adjudicated(),
      context: OPERATION,
      states: startingStates(),
      handlers: handlers(),
      consequences: [
        informationalConsequence({
          id: "trap-known",
          summary: "The GM now knows the trap is exposed.",
        }),
        staminaDamageConsequence({
          requestId: "sp-1",
          bodyOwnerId: "kite",
          staminaPoints: 9,
        }),
      ],
    }));

    const serialized = JSON.stringify(settled.public);

    expect(serialized).not.toContain("The GM now knows");
    expect(serialized).not.toContain("stamina-damage");
    expect(settled.hostConsequences[0]?.summary).toContain("The GM now knows");
  });
});
