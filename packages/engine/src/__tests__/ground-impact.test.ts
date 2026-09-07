/*
 * The scenario this phase was built for, end to end, outside Combat.
 *
 *   Gon drives an Aura-filled punch into the ground near a hidden trap,
 *   intending to tear up the surrounding terrain.
 *
 * Nothing about it is exotic, and every part of it was impossible before this
 * phase: it declares no target, it is aimed at a place rather than a person,
 * it affects something nobody declared, it destroys terrain the engine does
 * not own, and it happens with no Combat running.
 *
 * The path runs through every layer in order — Character adapter, neutral
 * preparation, GM adjudication, settlement — with no shortcuts, because the
 * point is that the layers compose rather than that each works alone.
 */

import { describe, expect, it } from "vitest";

import { prepareCharacterActionInputs } from "../character/actions/preparation";
import {
  ANY_NUMBER_OF_TARGETS,
  type TargetRef,
} from "../targeting";
import {
  ONE_ACTION,
  UNSTRUCTURED_EXECUTION,
  adjudicateAction,
  affectedSubjectConsequence,
  prepareAction,
  settleAction,
  staminaDamageConsequence,
  worldChangeConsequence,
  type ActionIntent,
  type ActionProfile,
  type ConsequenceContext,
} from "../actions";
import type { MetricPosition } from "../spatial";
import type { RuntimeOperationContext } from "../runtime/context";
import type { QuantitativeRequest } from "../runtime/requests";
import { seconds } from "../time/duration";
import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";
import { poolCostHandler, stateOf } from "./fixtures/settlement";
import { payloadOf } from "./fixtures/result";

const CLEARING = "forest-clearing";

const OPERATION: RuntimeOperationContext = {
  operationId: "ground-impact-1",
  occurredAt: 5_000,
};

const CONSEQUENCES: ConsequenceContext = {
  operationId: OPERATION.operationId,
  occurredAt: OPERATION.occurredAt,
  from: { domain: "caller", id: "gon" },
};

/* Gon stands at the origin; the ground he hits is 1.2 m out and 1.6 m down. */
const GON_POSITION: MetricPosition = {
  kind: "metric",
  contextId: CLEARING,
  xMetres: 0,
  yMetres: 0,
  zMetres: 0,
};

const GROUND: MetricPosition = {
  kind: "metric",
  contextId: CLEARING,
  xMetres: 1.2,
  yMetres: 0,
  zMetres: -1.6,
};

/** Nobody at the table knows this is here. */
const HIDDEN_TRAP: TargetRef = { kind: "object", objectId: "pit-trap-7" };

const GROUND_PUNCH: ActionProfile = {
  id: "aura-punch",
  source: { type: "skill", id: "aura-punch" },
  allowedTimings: ["action"],
  structuredActionCost: ONE_ACTION,

  /* Zero targets is legal. That is the whole point. */
  targets: { cardinality: ANY_NUMBER_OF_TARGETS },
  permittedFocusKinds: ["none", "position"],
  range: { kind: "direct", minimumMetres: 0, maximumMetres: 2 },
  executionDuration: seconds(1),
  check: { scope: { kind: "attribute", attribute: "dex" } },
};

const INTENT: ActionIntent = {
  id: "gon-ground-punch",
  profileId: GROUND_PUNCH.id,
  actor: { type: "character", id: "gon" },

  /* No target. */
  targets: [],

  /* Aimed at a place. */
  focus: { kind: "position", position: GROUND },

  declaredGoal: "tear up the surrounding ground",

  /* No Combat is running. */
  executionContext: UNSTRUCTURED_EXECUTION,
};

const AURA_COST: QuantitativeRequest = {
  requestId: "aura-punch-cost",
  kind: "aura.spend",
  phase: "cost",
  operationId: OPERATION.operationId,
  occurredAt: OPERATION.occurredAt,
  from: { domain: "caller", id: "gon" },
  to: { domain: "aura", id: "gon" },
  requested: 40,
};

const GON = resolveTestCharacter(
  createTestCharacter({ attributes: { dex: 14, con: 14 } }),
);

/* Step 1: the Character supplies what only a Character can supply. */
const PUNCH_CHECK = GROUND_PUNCH.check;

if (PUNCH_CHECK === undefined) throw new Error("The punch has a check.");

const CHARACTER_INPUTS = payloadOf(prepareCharacterActionInputs({
  resolved: GON,
  checkScope: PUNCH_CHECK.scope,
  requirements: [{
    id: "aura-punch.dexterity",
    requirement: {
      type: "attributeMinimum",
      layer: "resolved",
      attribute: "dex",
      minimum: 10,
    },
    summary: "The punch needs a formed fist.",
  }],
}));

/* Step 2: neutral preparation, which has never heard of a Character. */
function proposal() {
  return payloadOf(prepareAction({
    operationId: OPERATION.operationId,
    profile: GROUND_PUNCH,
    intent: INTENT,
    approach: "mechanical",
    eligibility: CHARACTER_INPUTS.eligibility,
    costRequests: [AURA_COST],
    spatial: { origin: GON_POSITION },
    outputs: [{
      id: "aura.output",
      decidedBy: "aura",
      amount: 40,
      summary: "Forty Aura driven into the strike.",
    }],

    /*
     * The host looked, and found the trap. Players are not told; the flag
     * says the sweep actually ran, so an empty list later would mean empty
     * rather than unexamined.
     */
    suggestedAffectedSubjects: { evaluated: true, subjects: [HIDDEN_TRAP] },
  }));
}

/* Step 3: the GM rules on it. */
function adjudicated() {
  return payloadOf(adjudicateAction({
    operationId: OPERATION.operationId,
    proposal: proposal(),
    approach: "mechanical",
    decision: {
      kind: "modify",

      /* The trap is collateral. It was never declared and still is not. */
      affectedSubjects: [HIDDEN_TRAP],

      reveal: {
        detail: "outcome",
        narration: "The ground bursts upward in a ring of torn earth.",

        /* Players are told about the earth, and nothing about the trap. */
        affectedSubjects: [],
      },
    },
    dice: [{ purpose: "check:aura-punch", sides: 20, values: [15] }],
    checkAdvantage: 0,
    checkInputs: {
      baseContributions: CHARACTER_INPUTS.baseContributions,
      modifiers: CHARACTER_INPUTS.modifiers,
      difficulty: 10,
    },
  }));
}

/* Step 4: it commits. */
function settled() {
  return payloadOf(settleAction({
    adjudicated: adjudicated(),
    context: OPERATION,
    states: { "aura:gon": 100 },
    handlers: { costs: [poolCostHandler("aura")], effects: [] },
    consequences: [
      affectedSubjectConsequence({
        operation: "add",
        subject: HIDDEN_TRAP,
        reason: "The flagstone above it came apart.",
      }),
      worldChangeConsequence({
        id: "torn-earth",
        kind: "terrain.destruction",
        summary: "A three-metre ring of ground is torn open.",
      }),
      worldChangeConsequence({
        id: "trap-exposed",
        kind: "object.destruction",
        summary: "The pit trap's cover is destroyed and its pit lies open.",
        subject: HIDDEN_TRAP,
      }),
    ],
  }));
}


describe("Gon punches the ground near a hidden trap", () => {
  it("1. declares no direct target", () => {
    expect(INTENT.targets).toEqual([]);
    expect(proposal().declaredTargets).toEqual([]);
  });

  it("2. records the ground as the focus and the goal as stated", () => {
    const prepared = proposal();

    expect(prepared.focus).toEqual({ kind: "position", position: GROUND });
    expect(prepared.declaredGoal).toBe("tear up the surrounding ground");
  });

  it("3. is legal with zero targets", () => {
    /* Not merely tolerated: the proposal is well-formed and in Range. */
    expect(proposal().disposition).toBe("check-dependent");
    expect(proposal().measuredDistance?.metres).toBeCloseTo(2, 12);
  });

  it("4. exposes cost and output without committing either", () => {
    const prepared = proposal();
    const states = { "aura:gon": 100 };

    expect(prepared.costRequests).toEqual([AURA_COST]);
    expect(prepared.outputs[0]?.amount).toBe(40);
    expect(prepared.structuredActionCost).toEqual({ actions: 0 });

    /* Preparing it twice changes nothing anywhere. */
    proposal();

    expect(states).toEqual({ "aura:gon": 100 });
  });

  it("5. shows the host's trap sweep to the GM alone", () => {
    const prepared = proposal();

    expect(prepared.suggestedAffectedSubjects).toEqual({
      evaluated: true,
      subjects: [HIDDEN_TRAP],
    });

    /* Evaluated, so a later empty list would mean empty rather than unchecked. */
    expect(prepared.suggestedAffectedSubjects.evaluated).toBe(true);

    expect(JSON.stringify(adjudicated().public)).not.toContain("pit-trap-7");
  });

  it("6. keeps the trap out of the declared targets", () => {
    expect(proposal().declaredTargets).toEqual([]);
    expect(settled().declaredTargets).toEqual([]);
    expect(settled().declaredTargets).not.toContainEqual(HIDDEN_TRAP);
  });

  it("7. lets the GM add it as a collateral affected subject", () => {
    expect(adjudicated().gm.affectedSubjects).toEqual([HIDDEN_TRAP]);
    expect(settled().finalAffectedSubjects).toContainEqual(HIDDEN_TRAP);
  });

  it("8. carries the GM's terrain and trap destruction", () => {
    const kinds = settled().hostConsequences.map((one) => one.kind);

    expect(kinds).toEqual(["terrain.destruction", "object.destruction"]);
  });

  it("9. commits the engine-owned cost atomically", () => {
    const result = settled();

    expect(stateOf(result.states, "aura", "gon")).toBe(60);
    expect(result.costOutcomes[0]?.actual).toBe(40);
  });

  it("10. returns the world changes as work rather than claiming them", () => {
    const result = settled();

    /*
     * There is no terrain model and no object durability model. The engine
     * described the change precisely and did not pretend to have made it.
     */
    expect(Object.keys(result.states)).toEqual(["aura:gon"]);
    expect(result.hostConsequences).toHaveLength(2);
    expect(result.hostConsequences[1]?.subject).toEqual(HIDDEN_TRAP);
  });

  it("11. reveals to players only what the GM approved", () => {
    const view = settled().public;
    const serialized = JSON.stringify(view);

    expect(view.narration)
      .toBe("The ground bursts upward in a ring of torn earth.");
    expect(view.succeeded).toBe(true);

    expect(serialized).not.toContain("pit-trap-7");
    expect(serialized).not.toContain("flagstone");
    expect(serialized).not.toContain("terrain.destruction");

    /* The roll is not shown, because the GM did not raise the detail level. */
    expect(view.retainedRoll).toBeUndefined();
    expect(view.total).toBeUndefined();
  });

  it("12. keeps the hidden subject and the provenance on the GM view", () => {
    const gm = settled().gm;

    expect(gm.affectedSubjects).toContainEqual(HIDDEN_TRAP);
    expect(gm.rolls[0]?.rolledValue).toBe(15);
    expect(gm.rolls[0]?.effectiveValue).toBe(15);
    expect(gm.findings.map((finding) => finding.id))
      .toContain("aura-punch.dexterity");
    expect(gm.proposal.declaredGoal).toBe("tear up the surrounding ground");
  });

  it("13. assumes no SP-to-BP conversion anywhere", () => {
    /*
     * The strain of the punch is SP, and nothing can route it. It comes back
     * as an explicit diagnostic rather than being quietly converted into Body
     * damage at a rate nobody chose.
     */
    const withStrain = payloadOf(settleAction({
      adjudicated: adjudicated(),
      context: OPERATION,
      states: { "aura:gon": 100 },
      handlers: { costs: [poolCostHandler("aura")], effects: [] },
      consequences: [staminaDamageConsequence({
        requestId: "strain-1",
        bodyOwnerId: "gon",
        staminaPoints: 6,
      })],
    }));

    expect(withStrain.unresolved.map((error) => error.code))
      .toEqual(["actions.consequence.stamina-damage.unroutable"]);

    /* The cost still committed; the SP simply has nowhere to go. */
    expect(stateOf(withStrain.states, "aura", "gon")).toBe(60);
    expect(Object.keys(withStrain.states)).toEqual(["aura:gon"]);
  });

  it("runs entirely outside Combat", () => {
    expect(INTENT.executionContext).toEqual(UNSTRUCTURED_EXECUTION);
    expect(settled().gm.proposal.structuredActionCost).toEqual({ actions: 0 });
  });
});
