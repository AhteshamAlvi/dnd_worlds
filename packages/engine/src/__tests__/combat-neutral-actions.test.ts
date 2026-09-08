/*
 * Combat scheduling authorized neutral actions.
 *
 * Two claims under test. The first is that Combat adds authorization and an
 * Action economy to an action it does not otherwise own — the same intent
 * resolves outside a fight with no wrapper at all. The second is that what
 * reaches Combat is EVIDENCE: an authorization exists only because
 * preparation and adjudication produced one, it carries the finalized timing
 * and cost rather than the authored ones, and it carries nothing private.
 */

import { describe, expect, it } from "vitest";

import {
  NO_FOCUS,
  NO_STRUCTURED_ACTION_COST,
  ONE_ACTION,
  UNSTRUCTURED_EXECUTION,
  adjudicateAction,
  authorizeScheduledAction,
  findAuthorizationIssues,
  prepareAction,
  profileThreatensDeclaredTargets,
  structuredActionCostFor,
  type ActionIntent,
  type ActionProfile,
  type AdjudicationDecision,
  type ActorRef,
  type ScheduledActionAuthorization,
} from "../actions";
import {
  ANY_NUMBER_OF_TARGETS,
  EXACTLY_ONE_TARGET,
  NO_TARGETS,
  ONE_OR_MORE_TARGETS,
  type TargetRef,
} from "../targeting";
import {
  createHesitationAction,
  createInactionAction,
  continueAfterNoReaction,
  continueReactionQueue,
  createEventReactionOpportunity,
  endReactionVoluntarily,
  finishQueuedReaction,
  queueMatchesActiveReaction,
  createReactionOpportunity,
  findRoundCombatant,
  nextReactionOpportunity,
  openNextQueuedReaction,
  openReactionQueue,
  queueReactionAfterGateSuccess,
  setRoundActiveState,
  resolveCombatAction,
  resolveSuccessfulReactionGate,
  resolveVoluntaryReactionEnd,
  scheduleNeutralAction,
  settleActiveStateAfterAction,
  skipReactionOpportunity,
  type CombatRound,
  type QueuedReactionOpenResult,
  type ReactionQueue,
  type ReactionState,
} from "../gameplay/combat";
import { seconds } from "../time/duration";
import { errorCodesOf, payloadOf } from "./fixtures/result";
import {
  combatantInput,
  startedRound,
  threeCombatantRound,
  turnState,
} from "./fixtures/combat";

/* Entity ids map one-to-one onto Combatant ids in these fixtures. */
function resolveCombatant(target: TargetRef): string | undefined {
  return target.kind === "entity" ? target.entityId : undefined;
}

function resolveActorCombatant(actor: ActorRef): string | undefined {
  return actor.id;
}

/** The "opened" branch of a queue opening, failing the test otherwise. */
function opened(result: QueuedReactionOpenResult) {
  if (!result.success) {
    throw new Error(`Expected the Reaction to open: ${result.reason}`);
  }

  if (result.outcome !== "opened") {
    throw new Error("Expected a Reaction to open, but the queue was exhausted.");
  }

  return result;
}

/** Finishes the running Reaction canonically, failing the test otherwise. */
function finish(round: CombatRound, queue: ReactionQueue) {
  const result = finishQueuedReaction(
    round,
    queue,
    endReactionVoluntarily(activeReactionOf(round)),
  );

  if (!result.success) {
    throw new Error(`Expected the Reaction to close: ${result.reason}`);
  }

  return result;
}

/** The Reaction currently running, failing the test if there is not one. */
function activeReactionOf(round: CombatRound): ReactionState {
  const state = round.activeState;

  if (state === null || state.kind !== "reaction") {
    throw new Error("Expected an active Reaction.");
  }

  return state;
}

function profile(
  id: string,
  overrides: Partial<ActionProfile> = {},
): ActionProfile {
  return {
    id,
    source: { type: "skill", id },
    allowedTimings: ["action", "reaction"],
    structuredActionCost: ONE_ACTION,
    targets: { cardinality: EXACTLY_ONE_TARGET },
    permittedFocusKinds: ["none"],
    executionDuration: seconds(1),
    ...overrides,
  };
}

const STRIKE = profile("aura-strike", { threatens: "declared-targets" });

const SWEEP = profile("aura-sweep", {
  threatens: "declared-targets",
  targets: { cardinality: ONE_OR_MORE_TARGETS },
});

/* Healing declares a recipient and threatens nobody. */
const HEAL = profile("field-treatment", { allowedTimings: ["action"] });

const STANCE = profile("defensive-stance", {
  source: { type: "technique", id: "defensive-stance" },
  allowedTimings: ["action"],
  targets: { cardinality: NO_TARGETS },
});

const GROUND_PUNCH = profile("ground-punch", {
  allowedTimings: ["action"],
  targets: { cardinality: ANY_NUMBER_OF_TARGETS },
  permittedFocusKinds: ["none", "position"],
  threatens: "declared-targets",
});

function intent(overrides: Partial<ActionIntent> = {}): ActionIntent {
  return {
    id: "intent-1",
    profileId: STRIKE.id,
    actor: { type: "character", id: "a" },
    targets: [],
    focus: NO_FOCUS,
    executionContext: { kind: "structured", timing: "action" },
    ...overrides,
  };
}

const AT_B: TargetRef = { kind: "entity", entityId: "b" };
const AT_C: TargetRef = { kind: "entity", entityId: "c" };

/**
 * Prepare, adjudicate and authorize — the only route into Combat.
 *
 * Producing an authorization requires the whole pipeline to have run, which
 * is exactly what the old raw-profile boundary could not prove.
 */
function authorize(
  actionProfile: ActionProfile,
  actionIntent: ActionIntent,
  decision: AdjudicationDecision = { kind: "accept" },
): ScheduledActionAuthorization {
  const proposal = payloadOf(prepareAction({
    operationId: "op-1",
    profile: actionProfile,
    intent: actionIntent,
    approach: "mechanical",
  }));

  const adjudicated = payloadOf(adjudicateAction({
    operationId: "op-1",
    proposal,
    approach: "mechanical",
    decision,
  }));

  return payloadOf(authorizeScheduledAction({
    adjudicated,
    operationId: "op-1",
  }));
}

/**
 * A genuine Reaction-timed authorization for one actor.
 *
 * The profile forbids Reaction timing, so preparation objects and the GM
 * overrules the finding — which is the case worth testing, and it has to be
 * built rather than cloned.
 */
function authorizeReactionFor(
  combatantId: string,
): ScheduledActionAuthorization {
  return authorize(
    HEAL,
    intent({
      profileId: HEAL.id,
      actor: { type: "character", id: combatantId },
      targets: [AT_C],
      executionContext: { kind: "structured", timing: "reaction" },
    }),
    {
      kind: "modify",
      findings: [{
        id: "actions.timing",
        status: "satisfied",
        reason: "Already braced; let them do it on the interrupt.",
      }],
    },
  );
}

function schedule(
  round: CombatRound,
  overrides: Partial<Parameters<typeof scheduleNeutralAction>[1]> = {},
) {
  return scheduleNeutralAction(round, {
    actionId: "combat-action-1",
    operationId: "op-1",
    authorization: authorize(STRIKE, intent({ targets: [AT_C] })),
    resolveActorCombatant,
    resolveCombatant,
    ...overrides,
  });
}

function scheduled(
  round: CombatRound,
  overrides: Partial<Parameters<typeof scheduleNeutralAction>[1]> = {},
) {
  const result = schedule(round, overrides);

  if (!result.success) {
    throw new Error(`Expected scheduling to succeed: ${result.reason}`);
  }

  return result.action;
}


describe("the same intent needs no wrapper outside Combat", () => {
  it("prepares and resolves with no Combat in sight", () => {
    const outside = payloadOf(prepareAction({
      operationId: "op-1",
      profile: STRIKE,
      intent: intent({
        targets: [AT_C],
        executionContext: UNSTRUCTURED_EXECUTION,
      }),
      approach: "mechanical",
    }));

    expect(outside.disposition).toBe("resolvable");
    expect(outside.structuredActionCost).toEqual(NO_STRUCTURED_ACTION_COST);
  });

  it("charges the Action economy only once a Round is running", () => {
    expect(structuredActionCostFor(STRIKE, UNSTRUCTURED_EXECUTION))
      .toEqual(NO_STRUCTURED_ACTION_COST);

    expect(scheduled(threeCombatantRound()).actionCost).toBe(1);
    expect(STRIKE.structuredActionCost).toEqual(ONE_ACTION);
  });

  it("cannot authorize an action prepared for unstructured time", () => {
    const proposal = payloadOf(prepareAction({
      operationId: "op-1",
      profile: STRIKE,
      intent: intent({
        targets: [AT_C],
        executionContext: UNSTRUCTURED_EXECUTION,
      }),
      approach: "mechanical",
    }));

    const adjudicated = payloadOf(adjudicateAction({
      operationId: "op-1",
      proposal,
      approach: "mechanical",
      decision: { kind: "accept" },
    }));

    expect(errorCodesOf(authorizeScheduledAction({
      adjudicated,
      operationId: "op-1",
    }))).toContain("actions.authorization.timing.unstructured");
  });
});


describe("the authorization is narrow evidence", () => {
  it("carries the finalized facts and nothing private", () => {
    const authorization = authorize(STRIKE, intent({ targets: [AT_C] }));

    expect(Object.keys(authorization).sort()).toEqual([
      "actor",
      "declaredTargets",
      "intentId",
      "operationId",
      "profileId",
      "structuredActionCost",
      "threatens",
      "timing",
    ]);

    const serialized = JSON.stringify(authorization);

    expect(serialized).not.toContain("rolls");
    expect(serialized).not.toContain("overrides");
    expect(serialized).not.toContain("findings");
    expect(serialized).not.toContain("consequences");
  });

  it("refuses an adjudication for a different operation", () => {
    const proposal = payloadOf(prepareAction({
      operationId: "op-1",
      profile: STRIKE,
      intent: intent({ targets: [AT_C] }),
      approach: "mechanical",
    }));

    const adjudicated = payloadOf(adjudicateAction({
      operationId: "op-1",
      proposal,
      approach: "mechanical",
      decision: { kind: "accept" },
    }));

    expect(errorCodesOf(authorizeScheduledAction({
      adjudicated,
      operationId: "op-99",
    }))).toContain("actions.authorization.operation.mismatch");
  });

  it("refuses an action nobody may schedule", () => {
    const blocked = payloadOf(prepareAction({
      operationId: "op-1",
      profile: STRIKE,
      intent: intent({ targets: [AT_C] }),
      approach: "mechanical",
      eligibility: [{
        id: "character.requirement.mastery",
        status: "unsatisfied",
        decidedBy: "character",
      }],
    }));

    const adjudicated = payloadOf(adjudicateAction({
      operationId: "op-1",
      proposal: blocked,
      approach: "mechanical",
      decision: { kind: "accept" },
    }));

    expect(errorCodesOf(authorizeScheduledAction({
      adjudicated,
      operationId: "op-1",
    }))).toContain("actions.authorization.disposition.not-schedulable");
  });

  it("carries a GM timing ruling that Combat then does not re-reject", () => {
    /*
     * The profile forbids Reaction timing. Preparation says so, the GM
     * overrules it, and the scheduler must not overrule them back — which is
     * exactly what re-reading allowedTimings inside Combat used to do.
     */
    const reactionOnly = intent({
      profileId: HEAL.id,
      targets: [AT_C],
      executionContext: { kind: "structured", timing: "reaction" },
    });

    const proposal = payloadOf(prepareAction({
      operationId: "op-1",
      profile: HEAL,
      intent: reactionOnly,
      approach: "mechanical",
    }));

    expect(proposal.disposition).toBe("ineligible");

    const adjudicated = payloadOf(adjudicateAction({
      operationId: "op-1",
      proposal,
      approach: "mechanical",
      decision: {
        kind: "modify",
        findings: [{
          id: "actions.timing",
          status: "satisfied",
          reason: "He is already braced; let him do it on the interrupt.",
        }],
      },
    }));

    const authorization = payloadOf(authorizeScheduledAction({
      adjudicated,
      operationId: "op-1",
    }));

    expect(authorization.timing).toBe("reaction");

    /*
     * Built for C properly rather than cloned from A's and edited. An
     * authorization is validated data, not an unforgeable token, so a test
     * that edits one is testing a path the scheduler is supposed to refuse.
     */
    const forC = authorizeReactionFor("c");

    expect(forC.timing).toBe("reaction");
    expect(forC.actor).toEqual({ type: "character", id: "c" });

    /* And it schedules inside a Reaction without being re-checked. */
    const round = threeCombatantRound();
    const attack = scheduled(round);
    const spent = resolveCombatAction(round, attack);

    if (!spent.success) throw new Error("unreachable");

    const gate = createReactionOpportunity(attack, "c");

    if (!gate.success) throw new Error("unreachable");

    const opened = resolveSuccessfulReactionGate(spent.round, gate.opportunity);

    if (!opened.success) throw new Error("unreachable");

    const result = scheduleNeutralAction(opened.round, {
      actionId: "combat-action-2",
      operationId: "op-1",
      authorization: forC,
      resolveActorCombatant,
      resolveCombatant,
    });

    expect(result.success).toBe(true);
  });

  it("rejects an authorization whose identifiers were edited", () => {
    const authorization = authorize(STRIKE, intent({ targets: [AT_C] }));

    for (
      const edited of [
        { ...authorization, intentId: "  " },
        { ...authorization, profileId: "" },
        { ...authorization, timing: "whenever" as never },
        { ...authorization, threatens: "everyone" as never },
        { ...authorization, structuredActionCost: { actions: -1 } },
        { ...authorization, actor: { type: "character", id: "" } },
      ]
    ) {
      const result = schedule(threeCombatantRound(), {
        authorization: edited,
      });

      if (result.success) throw new Error("unreachable");

      expect(result.reason).toBe("authorization-invalid");
      expect(result.authorizationIssues?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("rejects an authorization pointed at a different actor", () => {
    /*
     * Swapping the actor on a valid authorization is exactly the forgery the
     * scheduler has to catch, since the object is ordinary serializable data
     * rather than a token. B is a real participant, so this fails on the
     * active-combatant rule rather than on structure.
     */
    const result = schedule(threeCombatantRound(), {
      authorization: {
        ...authorize(STRIKE, intent({ targets: [AT_C] })),
        actor: { type: "character", id: "b" },
      },
    });

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("not-the-active-combatant");
  });

  it("rejects an authorization built for a different operation", () => {
    const result = schedule(threeCombatantRound(), {
      authorization: {
        ...authorize(STRIKE, intent({ targets: [AT_C] })),
        operationId: "op-99",
      },
    });

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("operation-mismatch");
  });

  it("refuses malformed serialized data without throwing", () => {
    /*
     * An authorization crosses a serialization boundary, so what arrives may
     * be null, a string, or a record whose actor or cost is null. A
     * validator that assumed the declared shape would throw on exactly the
     * inputs it exists to reject — and a thrown error at a scheduling
     * boundary escapes the result type every other refusal travels in.
     */
    const valid = authorize(STRIKE, intent({ targets: [AT_C] }));

    const malformed: readonly unknown[] = [
      null,
      undefined,
      "an authorization",
      42,
      [],
      {},
      { ...valid, actor: null },
      { ...valid, structuredActionCost: null },
      { ...valid, declaredTargets: null },
      { ...valid, declaredTargets: [null] },
      { ...valid, declaredTargets: "c" },
      { ...valid, operationId: null },
      { ...valid, intentId: 7 },
      { ...valid, timing: null },
      { ...valid, threatens: null },
    ];

    const round = threeCombatantRound();

    for (const authorization of malformed) {
      expect(() => findAuthorizationIssues(authorization)).not.toThrow();
      expect(findAuthorizationIssues(authorization).length)
        .toBeGreaterThan(0);

      const result = scheduleNeutralAction(round, {
        actionId: "combat-action-1",
        operationId: "op-1",
        authorization: authorization as ScheduledActionAuthorization,
        resolveActorCombatant,
        resolveCombatant,
      });

      expect(result.success).toBe(false);

      if (result.success) throw new Error("unreachable");

      expect(result.reason).toBe("authorization-invalid");
    }

    /* Nothing was spent by any of them. */
    expect(round.combatants.map((one) => one.remainingActions))
      .toEqual([4, 4, 4]);
    expect(round.activeState).toEqual(turnState("a", 2));
  });

  it("safely rejects malformed nested targets of every kind", () => {
    /*
     * The deepest level. A null position, an area with a null centre, a cone
     * with no direction — each used to reach a dereference inside the
     * spatial validators, because the authorization validator cast an
     * unverified record into a trusted target on the way past.
     */
    const valid = authorize(STRIKE, intent({ targets: [AT_C] }));

    const badTargets: readonly unknown[] = [
      null,
      "c",
      42,
      {},
      { kind: "entity" },
      { kind: "entity", entityId: null },
      { kind: "position" },
      { kind: "position", position: null },
      { kind: "position", position: "over there" },
      { kind: "position", position: { kind: "metric" } },
      { kind: "area" },
      { kind: "area", area: null },
      { kind: "area", area: { kind: "sphere" } },
      { kind: "area", area: { kind: "sphere", centre: null, radiusMetres: 2 } },
      {
        kind: "area",
        area: { kind: "cone", origin: null, direction: null, lengthMetres: 1, apertureDegrees: 60 },
      },
      { kind: "body-part", bodyOwnerId: null, bodyPartId: null },
      { kind: "anatomical-point" },
      { kind: "object", objectId: null },
      { kind: "unheard-of" },
    ];

    for (const target of badTargets) {
      const authorization = { ...valid, declaredTargets: [target] };

      expect(() => findAuthorizationIssues(authorization)).not.toThrow();
      expect(findAuthorizationIssues(authorization).length).toBeGreaterThan(0);
    }
  });

  it("accepts every well-formed target kind from unknown", () => {
    const valid = authorize(STRIKE, intent({ targets: [AT_C] }));

    const goodTargets: readonly unknown[] = [
      { kind: "self" },
      { kind: "entity", entityId: "c" },
      { kind: "object", objectId: "door" },
      { kind: "body-part", bodyOwnerId: "c", bodyPartId: "arm-1" },
      {
        kind: "anatomical-point",
        bodyOwnerId: "c",
        criticalPointId: "wrist:hand-1",
      },
      {
        kind: "position",
        position: {
          kind: "metric",
          contextId: "yard",
          xMetres: 1,
          yMetres: 0,
          zMetres: 0,
        },
      },
      {
        kind: "area",
        area: {
          kind: "sphere",
          centre: {
            kind: "metric",
            contextId: "yard",
            xMetres: 0,
            yMetres: 0,
            zMetres: 0,
          },
          radiusMetres: 3,
        },
      },
    ];

    for (const target of goodTargets) {
      expect(findAuthorizationIssues({ ...valid, declaredTargets: [target] }))
        .toEqual([]);
    }
  });

  it("accepts a valid authorization that made the same round trip", () => {
    const valid = authorize(STRIKE, intent({ targets: [AT_C] }));

    const roundTripped = JSON.parse(
      JSON.stringify(valid),
    ) as ScheduledActionAuthorization;

    expect(findAuthorizationIssues(roundTripped)).toEqual([]);
    expect(schedule(threeCombatantRound(), { authorization: roundTripped })
      .success).toBe(true);
  });

  it("spends nothing when the authorization does not hold up", () => {
    const round = threeCombatantRound();

    schedule(round, {
      authorization: {
        ...authorize(STRIKE, intent({ targets: [AT_C] })),
        intentId: "",
      },
    });

    expect(round.combatants.map((one) => one.remainingActions))
      .toEqual([4, 4, 4]);
    expect(round.activeState).toEqual(turnState("a", 2));
  });
});


describe("GM authority over the structured Action cost", () => {
  function costOf(decision: AdjudicationDecision) {
    return authorize(STRIKE, intent({ targets: [AT_C] }), decision)
      .structuredActionCost.actions;
  }

  it("preserves the authored cost on an accepted proposal", () => {
    expect(costOf({ kind: "accept" })).toBe(1);
  });

  it("lets a modify change it before Combat spends anything", () => {
    expect(costOf({
      kind: "modify",
      structuredActionCost: { actions: 2, reason: "He telegraphed it." },
    })).toBe(2);
  });

  it("lets a modify waive it entirely", () => {
    expect(costOf({
      kind: "modify",
      structuredActionCost: { actions: 0, reason: "Already in motion." },
    })).toBe(0);
  });

  it("spends exactly the finalized cost, not the authored one", () => {
    const round = threeCombatantRound();

    const action = scheduled(round, {
      authorization: authorize(STRIKE, intent({ targets: [AT_C] }), {
        kind: "modify",
        structuredActionCost: { actions: 2 },
      }),
    });

    expect(action.actionCost).toBe(2);

    const spent = resolveCombatAction(round, action);

    if (!spent.success) throw new Error("unreachable");

    expect(findRoundCombatant(spent.round, "a")?.remainingActions).toBe(2);
  });

  it("rejects a technically invalid cost rather than honouring it", () => {
    const proposal = payloadOf(prepareAction({
      operationId: "op-1",
      profile: STRIKE,
      intent: intent({ targets: [AT_C] }),
      approach: "mechanical",
    }));

    for (const actions of [-1, 1.5, Number.NaN]) {
      expect(errorCodesOf(adjudicateAction({
        operationId: "op-1",
        proposal,
        approach: "mechanical",
        decision: { kind: "modify", structuredActionCost: { actions } },
      }))).toContain("actions.adjudication.structured-cost.invalid");
    }
  });

  it("schedules and resolves a GM-waived zero-cost Action", () => {
    /*
     * CHANGED DELIBERATELY. StructuredActionCost has always defined zero as
     * legal and the GM may waive a cost, so Combat refusing it made the
     * ruling unusable at the one place it mattered.
     */
    const round = threeCombatantRound();

    const action = scheduled(round, {
      authorization: authorize(STRIKE, intent({ targets: [AT_C] }), {
        kind: "modify",
        structuredActionCost: { actions: 0, reason: "Already in motion." },
      }),
    });

    expect(action.actionCost).toBe(0);

    const spent = resolveCombatAction(round, action);

    expect(spent.success).toBe(true);

    if (!spent.success) throw new Error("unreachable");

    /* Nothing left the Round pool and nothing was charged to the Turn. */
    expect(findRoundCombatant(spent.round, "a")?.remainingActions).toBe(4);
    expect(spent.round.activeState).toEqual(turnState("a", 2, 0));
    expect(spent.stateMustEnd).toBe(false);
  });

  it("does not turn a free Action into a Bonus Action", () => {
    /*
     * A zero-cost Action consumes nothing and GRANTS nothing. Bonus Actions
     * remain removed and undesigned; reading this as an implementation of
     * them would invent the mechanic that ticket exists to define.
     */
    const round = threeCombatantRound();

    const free = scheduled(round, {
      authorization: authorize(STRIKE, intent({ targets: [AT_C] }), {
        kind: "modify",
        structuredActionCost: { actions: 0 },
      }),
    });

    const spent = resolveCombatAction(round, free);

    if (!spent.success) throw new Error("unreachable");

    expect(free).not.toHaveProperty("bonusAction");

    /* The Turn's allowance is exactly what it was before. */
    const before = round.activeState;
    const after = spent.round.activeState;

    if (before?.kind !== "turn" || after?.kind !== "turn") {
      throw new Error("unreachable");
    }

    expect(after.actionCap - after.actionsSpent)
      .toBe(before.actionCap - before.actionsSpent);
  });

  it("keeps Inaction and Hesitation fixed at one Action", () => {
    expect(createInactionAction("i-1", "a").actionCost).toBe(1);
    expect(createHesitationAction("h-1", "a").actionCost).toBe(1);
  });
});


describe("the actor is mapped, never asserted", () => {
  it("derives the acting Combatant through the host's resolver", () => {
    expect(scheduled(threeCombatantRound()).actorCombatantId).toBe("a");
  });

  it("refuses an actor the host cannot map", () => {
    const result = schedule(threeCombatantRound(), {
      resolveActorCombatant: () => undefined,
    });

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("actor-not-resolvable");
  });

  it("refuses an empty mapping", () => {
    const result = schedule(threeCombatantRound(), {
      resolveActorCombatant: () => "   ",
    });

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("actor-not-resolvable");
  });

  it("refuses an actor who is not in this fight", () => {
    const result = schedule(threeCombatantRound(), {
      resolveActorCombatant: () => "z",
    });

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("actor-not-a-participant");
  });

  it("refuses an actor who is not the one acting", () => {
    /*
     * The defect this closes: the old input took an actorCombatantId beside
     * the intent and never checked they described the same creature, so
     * Gon's punch could be scheduled as Killua's.
     */
    const result = schedule(threeCombatantRound(), {
      resolveActorCombatant: () => "b",
    });

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("not-the-active-combatant");
    expect(result.combatantId).toBe("b");
  });

  it("refuses a scheduling for a different operation", () => {
    const result = schedule(threeCombatantRound(), { operationId: "op-99" });

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("operation-mismatch");
  });

  it("refuses an empty Combat Action id", () => {
    const result = schedule(threeCombatantRound(), { actionId: "  " });

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("combat-action-id-missing");
  });

  it("refuses a threatened combatant who is not in this fight", () => {
    const result = schedule(threeCombatantRound(), {
      resolveCombatant: () => "z",
    });

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("threatened-combatant-unknown");
  });

  it("spends nothing and changes nothing when it refuses", () => {
    const round = threeCombatantRound();

    schedule(round, { resolveActorCombatant: () => "b" });
    schedule(round, { actionId: "" });

    expect(round.combatants.map((one) => one.remainingActions))
      .toEqual([4, 4, 4]);
    expect(round.activeState).toEqual(turnState("a", 2));
  });
});


describe("no source is relabelled as a Skill", () => {
  it("records an intent reference rather than a Combat source vocabulary", () => {
    const action = scheduled(threeCombatantRound());

    expect(action.kind).toBe("neutral");
    expect(action.intentId).toBe("intent-1");
    expect(action).not.toHaveProperty("source");
    expect(action).not.toHaveProperty("skillId");
  });

  it.each([
    ["skill", { type: "skill", id: "aura-strike" }],
    ["item", { type: "item", id: "throwing-knife" }],
    ["movement", { type: "movement", id: "walk" }],
    ["technique", { type: "technique", id: "en" }],
    ["projectile", { type: "projectile", id: "thrown-rock" }],
  ] as const)("schedules a %s without renaming it", (_name, source) => {
    /*
     * Every one of these used to be recorded as `{ kind: "skill", skillId }`.
     * A thrown rock is not a Skill, and Combat maintaining a second, narrower
     * source vocabulary meant it disagreed with the neutral one.
     */
    const action = scheduled(threeCombatantRound(), {
      authorization: authorize(
        profile("varied", { source, threatens: "declared-targets" }),
        intent({ profileId: "varied", targets: [AT_C] }),
      ),
    });

    expect(action.kind).toBe("neutral");
    expect(JSON.stringify(action)).not.toContain("skill");
  });

  it("keeps Combat-native Actions explicit and distinguishable", () => {
    const action = scheduled(threeCombatantRound());

    expect(action).not.toHaveProperty("source");

    /* A consumer cannot read an intent id off a Hesitation, or vice versa. */
    if (action.kind === "neutral") {
      expect(action.intentId).toBeDefined();
    }
  });
});


describe("who may react", () => {
  it("offers a Reaction to a combatant a threatening action declared", () => {
    expect(createReactionOpportunity(scheduled(threeCombatantRound()), "c")
      .success).toBe(true);
  });

  it("offers none for a harmless ability that named the same combatant", () => {
    expect(profileThreatensDeclaredTargets(HEAL)).toBe(false);

    const heal = scheduled(threeCombatantRound(), {
      authorization: authorize(HEAL, intent({
        profileId: HEAL.id,
        targets: [AT_C],
      })),
    });

    expect(heal.threatenedCombatantIds).toEqual([]);

    const result = createReactionOpportunity(heal, "c");

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("combatant-not-threatened");
  });

  it("still offers one when the blow ultimately misses", () => {
    const action = scheduled(threeCombatantRound());

    expect(createReactionOpportunity(action, "c").success).toBe(true);
    expect(action).not.toHaveProperty("succeeded");
  });

  it("offers none for a targetless position-focused action", () => {
    const punch = scheduled(threeCombatantRound(), {
      authorization: authorize(GROUND_PUNCH, intent({
        profileId: GROUND_PUNCH.id,
        targets: [],
        focus: {
          kind: "position",
          position: {
            kind: "metric",
            contextId: "yard",
            xMetres: 1,
            yMetres: 0,
            zMetres: 0,
          },
        },
      })),
    });

    expect(punch.threatenedCombatantIds).toEqual([]);

    const result = createReactionOpportunity(punch, "b");

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("combatant-not-threatened");
  });

  it("offers none to a collateral combatant who was merely affected", () => {
    /*
     * Affectedness is known only after resolution, which is far too late to
     * have offered anyone a Reaction — the Reaction exists to be taken
     * before the thing resolves.
     */
    const punch = scheduled(threeCombatantRound(), {
      authorization: authorize(GROUND_PUNCH, intent({
        profileId: GROUND_PUNCH.id,
        targets: [],
      })),
    });

    expect(createReactionOpportunity(punch, "b").success).toBe(false);
  });

  it("has no way for a caller to add an undeclared threat", () => {
    /*
     * `additionalThreatenedCombatantIds` was an unauthored threat rule
     * wearing a parameter, and it is gone. An action that endangers subjects
     * it did not declare needs an authored rule, not a caller's argument.
     */
    const keys = [
      "actionId",
      "authorization",
      "operationId",
      "resolveActorCombatant",
      "resolveCombatant",
    ];

    const input = {
      actionId: "combat-action-1",
      operationId: "op-1",
      authorization: authorize(STRIKE, intent({ targets: [AT_C] })),
      resolveActorCombatant,
      resolveCombatant,
    };

    expect(Object.keys(input).sort()).toEqual(keys.sort());
    expect(input).not.toHaveProperty("additionalThreatenedCombatantIds");
    expect(input).not.toHaveProperty("source");
  });

  it("offers one for a hazard that no combatant performed", () => {
    const result = createEventReactionOpportunity(
      {
        eventId: "boulder-1",
        threatenedCombatantIds: ["b"],
        describedAs: "The overhang gives way.",
      },
      "b",
    );

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(result.opportunity.trigger.kind).toBe("event");
  });

  it("interrupts the Turn in progress when a hazard opens a Reaction", () => {
    const threat = createEventReactionOpportunity(
      { eventId: "boulder-1", threatenedCombatantIds: ["c"] },
      "c",
    );

    if (!threat.success) throw new Error("unreachable");

    const opened = resolveSuccessfulReactionGate(
      threeCombatantRound(),
      threat.opportunity,
    );

    if (!opened.success) throw new Error("unreachable");

    expect(opened.triggeringTurnEnd.combatantId).toBe("a");
    expect(opened.round.initiativeIndex).toBe(0);
  });
});


describe("every threatened combatant gets their turn to answer", () => {
  /* A sweeps B and C. Initiative is A, B, C. */
  function sweep(round: CombatRound) {
    return scheduled(round, {
      authorization: authorize(SWEEP, intent({
        profileId: SWEEP.id,
        targets: [AT_C, AT_B],
      })),
    });
  }

  function queueFor(round: CombatRound): {
    readonly round: CombatRound;
    readonly queue: ReactionQueue;
  } {
    const action = sweep(round);
    const spent = resolveCombatAction(round, action);

    if (!spent.success) throw new Error("unreachable");

    const opened = openReactionQueue(
      spent.round,
      { kind: "action", actionId: action.id, actorCombatantId: "a" },
      action.threatenedCombatantIds,
    );

    if (!opened.success) throw new Error("unreachable");

    return { round: spent.round, queue: opened.queue };
  }

  function bothGatesPassed(queue: ReactionQueue): ReactionQueue {
    return queueReactionAfterGateSuccess(
      queueReactionAfterGateSuccess(queue),
    );
  }

  it("threatens both declared combatants, deduplicated", () => {
    expect([...sweep(threeCombatantRound()).threatenedCombatantIds].sort())
      .toEqual(["b", "c"]);
  });

  it("orders opportunities by Initiative, not by target order", () => {
    /*
     * The intent declared C first. B acts before C, so B is asked first —
     * who answers first is decided by the same rule that decides who acts
     * first, rather than by the order a host listed its targets in.
     */
    const { queue } = queueFor(threeCombatantRound());

    if (queue.phase !== "resolving-gates") throw new Error("unreachable");

    expect(queue.pending).toEqual(["b", "c"]);
    expect(nextReactionOpportunity(queue)?.reactingCombatantId).toBe("b");
  });

  it("excludes the actor from their own sweep", () => {
    const queueResult = openReactionQueue(
      threeCombatantRound(),
      { kind: "action", actionId: "combat-action-1", actorCombatantId: "a" },
      ["a", "b"],
    );

    if (!queueResult.success) throw new Error("unreachable");

    expect(queueResult.queue.pending).toEqual(["b"]);
  });

  it("stays in the Gate phase until the last Gate is answered", () => {
    const { queue } = queueFor(threeCombatantRound());

    const afterOne = queueReactionAfterGateSuccess(queue);

    expect(afterOne.phase).toBe("resolving-gates");

    const afterBoth = queueReactionAfterGateSuccess(afterOne);

    expect(afterBoth.phase).toBe("resolving-reactions");
  });

  it("refuses to open a Reaction while a Gate is unresolved", () => {
    /*
     * The rule the old shape could not express. Opening one responder's
     * Reaction before everybody has been asked would resolve the first
     * answer against a threat the others have not yet had a chance to
     * respond to.
     */
    const { round, queue } = queueFor(threeCombatantRound());

    const opened = openNextQueuedReaction(round, queue);

    if (opened.success) throw new Error("unreachable");

    expect(opened.reason).toBe("gates-unresolved");
  });

  it("lets a failed or declined gate advance without spending anything", () => {
    const { round, queue } = queueFor(threeCombatantRound());

    const afterSkip = skipReactionOpportunity(queue);

    if (afterSkip.phase !== "resolving-gates") throw new Error("unreachable");

    expect(afterSkip.pending).toEqual(["c"]);
    expect(afterSkip.queued).toEqual([]);

    expect(findRoundCombatant(round, "b")?.remainingActions).toBe(4);
    expect(round.activeState?.kind).toBe("turn");
  });

  it("preserves a continuable Turn when every gate fails", () => {
    /*
     * Nothing opened, so nothing ended the Turn. Initiative must NOT
     * advance; the caller settles the Action through the ordinary
     * no-Reaction path instead.
     */
    const { round, queue } = queueFor(threeCombatantRound());

    const allDeclined = skipReactionOpportunity(
      skipReactionOpportunity(queue),
    );

    expect(allDeclined.phase).toBe("complete");

    if (allDeclined.phase !== "complete") throw new Error("unreachable");

    expect(allDeclined.openedAny).toBe(false);

    const continued = continueReactionQueue(round, allDeclined);

    if (!continued.success) throw new Error("unreachable");

    expect(continued.outcome).toBe("no-reactions");
    expect(continued.round.activeState).toEqual(turnState("a", 2, 1));

    /* And the Turn can legally continue. */
    const settled = continueAfterNoReaction(continued.round);

    if (!settled.success) throw new Error("unreachable");

    expect(settled.stateEnded).toBe(false);
    expect(settled.round.activeState).toEqual(turnState("a", 2, 1));
  });

  it("still offers the later combatant after an earlier gate fails", () => {
    const { round, queue } = queueFor(threeCombatantRound());

    const queued = queueReactionAfterGateSuccess(
      skipReactionOpportunity(queue),
    );

    expect(queued.phase).toBe("resolving-reactions");

    const first = opened(openNextQueuedReaction(round, queued));

    expect(first.round.activeState?.kind).toBe("reaction");
    expect(first.queue.activeResponder).toBe("c");
  });

  it("ends the triggering Turn once, on the first opening", () => {
    const { round, queue } = queueFor(threeCombatantRound());

    const first = opened(openNextQueuedReaction(round, bothGatesPassed(queue)));

    expect(first.triggeringTurnEnd).toEqual({
      combatantId: "a",
      reason: "reaction-opened",
      actionsSpent: 1,
    });

    const finished = finish(first.round, first.queue);

    const second = opened(
      openNextQueuedReaction(finished.round, finished.queue),
    );

    /* No second Turn ending: there is no Turn left to end. */
    expect(second.triggeringTurnEnd).toBeUndefined();
  });

  it("refuses to open the next Reaction before the current one ends", () => {
    /*
     * The transition the old shape allowed. Calling continue twice used to
     * replace the running Reaction with the next and lose it outright.
     */
    const { round, queue } = queueFor(threeCombatantRound());

    const first = opened(openNextQueuedReaction(round, bothGatesPassed(queue)));

    const again = openNextQueuedReaction(first.round, first.queue);

    if (again.success) throw new Error("unreachable");

    expect(again.reason).toBe("reaction-still-active");
    expect(again.combatantId).toBe("b");

    const continued = continueReactionQueue(first.round, first.queue);

    if (continued.success) throw new Error("unreachable");

    expect(continued.reason).toBe("reaction-still-active");
  });

  it("cannot discard an active Reaction by continuing", () => {
    const { round, queue } = queueFor(threeCombatantRound());

    const first = opened(openNextQueuedReaction(round, bothGatesPassed(queue)));

    const result = continueReactionQueue(first.round, first.queue);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("reaction-still-active");

    /* B's Reaction is exactly where it was. */
    expect(activeReactionOf(first.round).reactingCombatantId).toBe("b");
  });

  it("advances to the next queued Reaction, not to the next Turn", () => {
    const { round, queue } = queueFor(threeCombatantRound());

    const first = opened(openNextQueuedReaction(round, bothGatesPassed(queue)));
    const finished = finish(first.round, first.queue);

    expect(finished.round.activeState).toBeNull();

    const continued = continueReactionQueue(finished.round, finished.queue);

    if (!continued.success) throw new Error("unreachable");

    expect(continued.outcome).toBe("reaction-opened");
    expect(activeReactionOf(continued.round).reactingCombatantId).toBe("c");
  });

  it("keeps one coherent trigger and interrupted combatant throughout", () => {
    const { round, queue } = queueFor(threeCombatantRound());

    const first = opened(openNextQueuedReaction(round, bothGatesPassed(queue)));

    const firstState = activeReactionOf(first.round);
    const finished = finish(first.round, first.queue);

    const continued = continueReactionQueue(finished.round, finished.queue);

    if (!continued.success || continued.outcome !== "reaction-opened") {
      throw new Error("unreachable");
    }

    const secondState = activeReactionOf(continued.round);

    expect(secondState.trigger).toEqual(firstState.trigger);
    expect(secondState.interruptedCombatantId)
      .toBe(firstState.interruptedCombatantId);
  });

  it("refuses a Reaction end that belongs to somebody else", () => {
    const { round, queue } = queueFor(threeCombatantRound());

    const first = opened(openNextQueuedReaction(round, bothGatesPassed(queue)));

    const foreign = endReactionVoluntarily({
      ...activeReactionOf(first.round),
      reactingCombatantId: "c",
    });

    const finished = finishQueuedReaction(first.round, first.queue, foreign);

    if (finished.success) throw new Error("unreachable");

    expect(finished.reason).toBe("reaction-mismatch");
  });

  it("advances Initiative only after the last queued Reaction ends", () => {
    const { round, queue } = queueFor(threeCombatantRound());

    const current = opened(openNextQueuedReaction(round, bothGatesPassed(queue)));

    let workingRound = current.round;
    let workingQueue: ReactionQueue = current.queue;

    for (const expected of ["b", "c"]) {
      expect(activeReactionOf(workingRound).reactingCombatantId).toBe(expected);

      const finished = finish(workingRound, workingQueue);

      const continued = continueReactionQueue(finished.round, finished.queue);

      if (!continued.success) throw new Error("unreachable");

      workingRound = continued.round;
      workingQueue = continued.queue;

      if (expected === "b") {
        expect(continued.outcome).toBe("reaction-opened");
      } else {
        expect(continued.outcome).toBe("initiative-advanced");
      }
    }

    /* A was interrupted at Initiative 0, so the Round resumes at B. */
    expect(workingRound.initiativeIndex).toBe(1);
    expect(workingRound.activeState).toEqual(turnState("b", 2));
  });

  it("skips an exhausted responder and keeps the ones behind them", () => {
    /*
     * B passed their Gate and then lost their last Action before the queue
     * reached them. The shared pool is the only Reaction limit there is, and
     * one responder running out is not a reason to silence C.
     */
    const round = startedRound([
      combatantInput("a", { round: 4 }),
      combatantInput("b", { round: 4 }),
      combatantInput("c", { round: 4 }),
    ]);

    const action = sweep(round);
    const spent = resolveCombatAction(round, action);

    if (!spent.success) throw new Error("unreachable");

    const queueResult = openReactionQueue(
      spent.round,
      { kind: "action", actionId: action.id, actorCombatantId: "a" },
      action.threatenedCombatantIds,
    );

    if (!queueResult.success) throw new Error("unreachable");

    const drained = {
      ...spent.round,
      combatants: spent.round.combatants.map((combatant) =>
        combatant.combatantId === "b"
          ? { ...combatant, remainingActions: 0 }
          : combatant
      ),
    };

    const result = opened(openNextQueuedReaction(
      drained,
      bothGatesPassed(queueResult.queue),
    ));

    expect(result.skipped).toEqual(["b"]);
    expect(activeReactionOf(result.round).reactingCombatantId).toBe("c");
    expect(result.queue.skipped).toEqual(["b"]);
  });

  it("refuses a queue whose trigger names the wrong actor", () => {
    const result = openReactionQueue(
      threeCombatantRound(),
      { kind: "action", actionId: "combat-action-1", actorCombatantId: "b" },
      ["c"],
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("queue-trigger-mismatch");
    expect(result.combatantId).toBe("b");
  });

  it("refuses a queue left over from another Round", () => {
    const { queue } = queueFor(threeCombatantRound());

    const stale = { ...bothGatesPassed(queue), roundNumber: 99 } as ReactionQueue;

    const laterRound = threeCombatantRound();

    const result = openNextQueuedReaction(laterRound, stale);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("queue-trigger-mismatch");
  });

  it("refuses a queue whose interrupted combatant is not the parked one", () => {
    const { round, queue } = queueFor(threeCombatantRound());

    const moved = { ...round, initiativeIndex: 1 };

    const result = openNextQueuedReaction(moved, bothGatesPassed(queue));

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("queue-trigger-mismatch");
  });

  it("reports whether the Round's Reaction is the one the queue expects", () => {
    const { round, queue } = queueFor(threeCombatantRound());

    const first = opened(openNextQueuedReaction(round, bothGatesPassed(queue)));

    expect(queueMatchesActiveReaction(first.round, first.queue)).toBe(true);
    expect(queueMatchesActiveReaction(round, first.queue)).toBe(false);
  });

  it("refuses a fabricated Reaction end that no Reaction matches", () => {
    /*
     * A ReactionEnd is a plain record like everything else here. Checking it
     * only against the QUEUE let one built from a ReactionState nobody was
     * in — or carrying a spent count that never happened — close a Reaction
     * it did not describe.
     */
    const { round, queue } = queueFor(threeCombatantRound());
    const first = opened(openNextQueuedReaction(round, bothGatesPassed(queue)));

    const fabricated = {
      ...endReactionVoluntarily(activeReactionOf(first.round)),
      actionsSpent: 3,
    };

    const result = finishQueuedReaction(first.round, first.queue, fabricated);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("reaction-mismatch");

    /* And the Reaction is still running. */
    expect(activeReactionOf(first.round).reactingCombatantId).toBe("b");
  });

  it("refuses to finish when the Round holds a different Reaction", () => {
    const { round, queue } = queueFor(threeCombatantRound());
    const first = opened(openNextQueuedReaction(round, bothGatesPassed(queue)));

    const swapped = {
      ...first.round,
      activeState: {
        ...activeReactionOf(first.round),
        reactingCombatantId: "c",
      },
    };

    const result = finishQueuedReaction(
      swapped,
      first.queue,
      endReactionVoluntarily(activeReactionOf(first.round)),
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("reaction-mismatch");
  });

  it("is the only thing that closes an active Reaction", () => {
    const { round, queue } = queueFor(threeCombatantRound());
    const first = opened(openNextQueuedReaction(round, bothGatesPassed(queue)));

    /* Continuation refuses rather than clearing it on the way past. */
    const continued = continueReactionQueue(first.round, first.queue);

    if (continued.success) throw new Error("unreachable");

    expect(continued.reason).toBe("reaction-still-active");
    expect(first.round.activeState?.kind).toBe("reaction");

    /* Finishing it is what nulls the state, and it does so in the Round. */
    const finished = finish(first.round, first.queue);

    expect(finished.round.activeState).toBeNull();
  });

  it("refuses to continue past an unrelated active Reaction", () => {
    /*
     * A Round holding somebody else's Reaction is not something to advance
     * over. The old version cleared whatever was active before advancing.
     */
    const { round, queue } = queueFor(threeCombatantRound());

    const allDeclined = skipReactionOpportunity(
      skipReactionOpportunity(queue),
    );

    const foreign = {
      ...round,
      activeState: {
        kind: "reaction" as const,
        reactingCombatantId: "c",
        trigger: { kind: "event" as const, eventId: "unrelated" },
        interruptedCombatantId: "a",
        actionCap: 1,
        actionsSpent: 0,
      },
    };

    const result = continueReactionQueue(foreign, allDeclined);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("reaction-still-active");
    expect(foreign.activeState.reactingCombatantId).toBe("c");
  });

  it("keeps the Turn when every responder turns out ineligible", () => {
    /*
     * Both gates passed and both responders then lost their Actions. Nothing
     * opened, so nothing ended the Turn — this is a no-Reaction outcome, not
     * an Initiative advance, and every skipped responder is recorded.
     */
    const round = threeCombatantRound();
    const action = sweep(round);
    const spent = resolveCombatAction(round, action);

    if (!spent.success) throw new Error("unreachable");

    const queueResult = openReactionQueue(
      spent.round,
      { kind: "action", actionId: action.id, actorCombatantId: "a" },
      action.threatenedCombatantIds,
    );

    if (!queueResult.success) throw new Error("unreachable");

    const drained = {
      ...spent.round,
      combatants: spent.round.combatants.map((combatant) =>
        combatant.combatantId === "a"
          ? combatant
          : { ...combatant, remainingActions: 0 }
      ),
    };

    const continued = continueReactionQueue(
      drained,
      bothGatesPassed(queueResult.queue),
    );

    if (!continued.success) throw new Error("unreachable");

    expect(continued.outcome).toBe("no-reactions");
    expect(continued.round.activeState).toEqual(turnState("a", 2, 1));
    expect(continued.queue.phase).toBe("complete");

    if (continued.queue.phase !== "complete") throw new Error("unreachable");

    expect(continued.queue.openedAny).toBe(false);
    expect([...continued.queue.skipped].sort()).toEqual(["b", "c"]);
  });

  it("advances Initiative when the REMAINDER turns out ineligible", () => {
    /*
     * B reacted; C then lost their Actions. One Reaction did open, so the
     * Turn is gone and Initiative continues after the interrupted combatant.
     */
    const { round, queue } = queueFor(threeCombatantRound());
    const first = opened(openNextQueuedReaction(round, bothGatesPassed(queue)));
    const finished = finish(first.round, first.queue);

    const drained = {
      ...finished.round,
      combatants: finished.round.combatants.map((combatant) =>
        combatant.combatantId === "c"
          ? { ...combatant, remainingActions: 0 }
          : combatant
      ),
    };

    const continued = continueReactionQueue(drained, finished.queue);

    if (!continued.success) throw new Error("unreachable");

    expect(continued.outcome).toBe("initiative-advanced");
    expect(continued.round.initiativeIndex).toBe(1);
    expect(continued.round.activeState).toEqual(turnState("b", 2));

    if (continued.queue.phase !== "complete") throw new Error("unreachable");

    expect(continued.queue.openedAny).toBe(true);
    expect(continued.queue.skipped).toEqual(["c"]);
  });

  it("refuses a queue naming somebody outside the fight", () => {
    const result = openReactionQueue(
      threeCombatantRound(),
      { kind: "action", actionId: "combat-action-1", actorCombatantId: "a" },
      ["z"],
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("threatened-combatant-unknown");
  });

  it("refuses a queue with no trigger identity", () => {
    const result = openReactionQueue(
      threeCombatantRound(),
      { kind: "event", eventId: "   " },
      ["b"],
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("trigger-id-missing");
  });
});


describe("a completed queue cannot be replayed", () => {
  function sweepQueue(round: CombatRound) {
    const action = scheduled(round, {
      authorization: authorize(SWEEP, intent({
        profileId: SWEEP.id,
        targets: [AT_C, AT_B],
      })),
    });

    const spent = resolveCombatAction(round, action);

    if (!spent.success) throw new Error("unreachable");

    const result = openReactionQueue(
      spent.round,
      { kind: "action", actionId: action.id, actorCombatantId: "a" },
      action.threatenedCombatantIds,
    );

    if (!result.success) throw new Error("unreachable");

    return { round: spent.round, queue: result.queue };
  }

  it("advances Initiative once and refuses a second time", () => {
    /*
     * A completed queue is exactly the record a caller is most likely to
     * still be holding once the Round has moved on. Replaying it used to
     * advance Initiative again, skipping a Turn nobody took.
     */
    const { round, queue } = sweepQueue(threeCombatantRound());

    const declined = skipReactionOpportunity(
      queueReactionAfterGateSuccess(queue),
    );

    const first = opened(openNextQueuedReaction(round, declined));
    const finished = finish(first.round, first.queue);

    const advanced = continueReactionQueue(finished.round, finished.queue);

    if (!advanced.success) throw new Error("unreachable");

    expect(advanced.outcome).toBe("initiative-advanced");
    expect(advanced.round.initiativeIndex).toBe(1);

    const replayed = continueReactionQueue(advanced.round, advanced.queue);

    if (replayed.success) throw new Error("unreachable");

    expect(replayed.reason).toBe("queue-trigger-mismatch");
    expect(advanced.round.initiativeIndex).toBe(1);
  });

  it("refuses a completed queue against a later Round", () => {
    const { round, queue } = sweepQueue(threeCombatantRound());

    const declined = skipReactionOpportunity(
      queueReactionAfterGateSuccess(queue),
    );

    const first = opened(openNextQueuedReaction(round, declined));
    const finished = finish(first.round, first.queue);

    const laterRound = startedRound(
      [combatantInput("a"), combatantInput("b"), combatantInput("c")],
      undefined,
      2,
    );

    const result = continueReactionQueue(laterRound, finished.queue);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("queue-trigger-mismatch");
  });

  it("refuses a completed queue when Initiative has moved", () => {
    const { round, queue } = sweepQueue(threeCombatantRound());

    const allDeclined = skipReactionOpportunity(
      skipReactionOpportunity(queue),
    );

    const moved = { ...round, initiativeIndex: 2 };

    const result = continueReactionQueue(moved, allDeclined);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("queue-trigger-mismatch");
  });

  it("refuses a no-Reaction completion whose Turn is no longer active", () => {
    /*
     * openedAny is false, so the triggering Turn must still be there. A
     * Round whose active state is something else means the caller is
     * continuing a queue that no longer describes it.
     */
    const { round, queue } = sweepQueue(threeCombatantRound());

    const allDeclined = skipReactionOpportunity(
      skipReactionOpportunity(queue),
    );

    const cleared = setRoundActiveState(round, null);

    const result = continueReactionQueue(cleared, allDeclined);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("queue-trigger-mismatch");
    expect(cleared.activeState).toBeNull();
  });

  it("refuses to advance over a Reaction that was never closed", () => {
    const { round, queue } = sweepQueue(threeCombatantRound());

    const declined = skipReactionOpportunity(
      queueReactionAfterGateSuccess(queue),
    );

    const first = opened(openNextQueuedReaction(round, declined));

    /* The queue thinks it is done; the Round still holds the Reaction. */
    const forged = { ...first.queue, activeResponder: null } as ReactionQueue;

    const result = continueReactionQueue(first.round, forged);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("reaction-still-active");
    expect(first.round.activeState?.kind).toBe("reaction");
  });
});


describe("single-target Reactions use the same lifecycle", () => {
  it("runs the direct helper through a one-entry queue", () => {
    const round = threeCombatantRound();
    const action = scheduled(round);
    const spent = resolveCombatAction(round, action);

    if (!spent.success) throw new Error("unreachable");

    const gate = createReactionOpportunity(action, "c");

    if (!gate.success) throw new Error("unreachable");

    const result = resolveSuccessfulReactionGate(spent.round, gate.opportunity);

    if (!result.success) throw new Error("unreachable");

    /* The same queue shape a sweep produces, with one entry already spent. */
    expect(result.queue.phase).toBe("resolving-reactions");
    expect(result.queue.activeResponder).toBe("c");
    expect(result.queue.queued).toEqual([]);
    expect(result.queue.openedAny).toBe(true);
    expect(result.queue.interruptedCombatantId).toBe("a");
    expect(queueMatchesActiveReaction(result.round, result.queue)).toBe(true);
  });

  it("obeys the same invariants a multi-target queue does", () => {
    const round = threeCombatantRound();
    const action = scheduled(round);
    const spent = resolveCombatAction(round, action);

    if (!spent.success) throw new Error("unreachable");

    const gate = createReactionOpportunity(action, "c");

    if (!gate.success) throw new Error("unreachable");

    const result = resolveSuccessfulReactionGate(spent.round, gate.opportunity);

    if (!result.success) throw new Error("unreachable");

    /* Continuing before ending is refused, exactly as in a sweep. */
    const early = continueReactionQueue(result.round, result.queue);

    if (early.success) throw new Error("unreachable");

    expect(early.reason).toBe("reaction-still-active");

    const finished = finish(result.round, result.queue);

    expect(finished.round.activeState).toBeNull();
    expect(finished.queue.phase).toBe("complete");

    const continued = continueReactionQueue(finished.round, finished.queue);

    if (!continued.success) throw new Error("unreachable");

    expect(continued.outcome).toBe("initiative-advanced");
    expect(continued.round.activeState).toEqual(turnState("b", 2));
  });

  it("ends voluntarily through the queue, never around it", () => {
    const round = threeCombatantRound();
    const action = scheduled(round);
    const spent = resolveCombatAction(round, action);

    if (!spent.success) throw new Error("unreachable");

    const gate = createReactionOpportunity(action, "c");

    if (!gate.success) throw new Error("unreachable");

    const result = resolveSuccessfulReactionGate(spent.round, gate.opportunity);

    if (!result.success) throw new Error("unreachable");

    const ended = resolveVoluntaryReactionEnd(result.round, result.queue);

    if (!ended.success) throw new Error("unreachable");

    /* The queue completed and then advanced; nothing did either alone. */
    expect(ended.queue.phase).toBe("complete");
    expect(ended.round.activeState).toEqual(turnState("b", 2));
    expect(ended.round.initiativeIndex).toBe(1);

    /* And the completed queue cannot be run again. */
    const replayed = resolveVoluntaryReactionEnd(ended.round, ended.queue);

    expect(replayed.success).toBe(false);
  });

  it("refuses a voluntary end whose queue does not match the Round", () => {
    const round = threeCombatantRound();
    const action = scheduled(round);
    const spent = resolveCombatAction(round, action);

    if (!spent.success) throw new Error("unreachable");

    const gate = createReactionOpportunity(action, "c");

    if (!gate.success) throw new Error("unreachable");

    const result = resolveSuccessfulReactionGate(spent.round, gate.opportunity);

    if (!result.success) throw new Error("unreachable");

    const foreign = {
      ...result.queue,
      activeResponder: "b",
    } as ReactionQueue;

    const ended = resolveVoluntaryReactionEnd(result.round, foreign);

    if (ended.success) throw new Error("unreachable");

    expect(ended.reason).toBe("reaction-queue-refused");
    expect(ended.queueFailureReason).toBe("reaction-mismatch");

    /* Nothing moved. */
    expect(result.round.activeState?.kind).toBe("reaction");
  });

  it("still refuses a trigger whose actor is not the interrupted combatant", () => {
    const round = threeCombatantRound();
    const spent = resolveCombatAction(round, scheduled(round));

    if (!spent.success) throw new Error("unreachable");

    const result = resolveSuccessfulReactionGate(spent.round, {
      trigger: { kind: "action", actionId: "combat-action-1", actorCombatantId: "b" },
      reactingCombatantId: "c",
    });

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("reaction-open-failed");
    expect(result.reactionStartFailureReason).toBe("triggering-turn-mismatch");
  });
});


describe("Reactions are limited only by the shared Round pool", () => {
  it("lets one combatant react to several threats in a Round", () => {
    let round = startedRound([
      combatantInput("a", { round: 4 }),
      combatantInput("b", { round: 4 }),
      combatantInput("c", { round: 4, reaction: 1 }),
    ]);

    for (const [index, actionId] of ["r-1", "r-2"].entries()) {
      const actor = round.activeState?.kind === "turn"
        ? round.activeState.combatantId
        : undefined;

      if (actor === undefined) throw new Error("expected an active Turn");

      const action = scheduled(round, {
        actionId,
        authorization: authorize(STRIKE, intent({
          id: `intent-${index}`,
          actor: { type: "character", id: actor },
          targets: [AT_C],
        })),
      });

      const spent = resolveCombatAction(round, action);

      if (!spent.success) throw new Error("unreachable");

      const gate = createReactionOpportunity(action, "c");

      if (!gate.success) throw new Error("unreachable");

      const opened = resolveSuccessfulReactionGate(
        spent.round,
        gate.opportunity,
      );

      if (!opened.success) throw new Error("unreachable");

      const ended = resolveVoluntaryReactionEnd(opened.round, opened.queue);

      if (!ended.success) throw new Error("unreachable");

      round = ended.round;
    }

    /* C answered twice, declining both times, so nothing was spent. */
    expect(findRoundCombatant(round, "c")?.remainingActions).toBe(4);
  });
});


describe("the delayed transition survives the wrapper", () => {
  it("keeps the Turn open after the triggering Action reaches the cap", () => {
    const round = threeCombatantRound({ turn: 1 });
    const action = scheduled(round);

    const spent = resolveCombatAction(round, action);

    if (!spent.success) throw new Error("unreachable");

    expect(spent.stateMustEnd).toBe(true);
    expect(spent.round.activeState).toEqual(turnState("a", 1, 1));

    const gate = createReactionOpportunity(action, "c");

    if (!gate.success) throw new Error("unreachable");

    expect(resolveSuccessfulReactionGate(spent.round, gate.opportunity).success)
      .toBe(true);
  });

  it("advances only once the state is settled", () => {
    const round = threeCombatantRound({ turn: 1 });
    const spent = resolveCombatAction(round, scheduled(round));

    if (!spent.success) throw new Error("unreachable");

    const settled = settleActiveStateAfterAction(spent.round);

    if (!settled.success) throw new Error("unreachable");

    expect(settled.stateEnded).toBe(true);
    expect(settled.round.initiativeIndex).toBe(1);
  });
});
