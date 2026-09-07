/*
 * Combat scheduling neutral actions.
 *
 * The claim under test is that Combat adds authorization and an Action
 * economy to an action it does not otherwise own. The same intent resolves
 * outside a fight with no wrapper at all; inside one it additionally has to
 * be this combatant's turn, and it costs the Round pool.
 *
 * The other half is who may react. The replaced rule was "you may react to
 * an Action that targets you", which is wrong twice over: a heal names a
 * recipient and endangers nobody, and a boulder endangers whoever is under
 * it while naming nobody.
 */

import { describe, expect, it } from "vitest";

import {
  NO_FOCUS,
  ONE_ACTION,
  NO_STRUCTURED_ACTION_COST,
  UNSTRUCTURED_EXECUTION,
  prepareAction,
  profileThreatensDeclaredTargets,
  structuredActionCostFor,
  type ActionIntent,
  type ActionProfile,
} from "../actions";
import {
  ANY_NUMBER_OF_TARGETS,
  EXACTLY_ONE_TARGET,
  NO_TARGETS,
  type TargetRef,
} from "../targeting";
import {
  createEventReactionOpportunity,
  createReactionOpportunity,
  findRoundCombatant,
  resolveCombatAction,
  resolveSuccessfulReactionGate,
  resolveVoluntaryReactionEnd,
  scheduleNeutralAction,
  settleActiveStateAfterAction,
  type CombatRound,
} from "../gameplay/combat";
import { seconds } from "../time/duration";
import { payloadOf } from "./fixtures/result";
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

const STRIKE: ActionProfile = {
  id: "aura-strike",
  source: { type: "skill", id: "aura-strike" },
  allowedTimings: ["action", "reaction"],
  structuredActionCost: ONE_ACTION,
  targets: { cardinality: EXACTLY_ONE_TARGET },
  permittedFocusKinds: ["none"],
  executionDuration: seconds(1),
  threatens: "declared-targets",
};

const HEAL: ActionProfile = {
  id: "field-treatment",
  source: { type: "skill", id: "field-treatment" },
  allowedTimings: ["action"],
  structuredActionCost: ONE_ACTION,
  targets: { cardinality: EXACTLY_ONE_TARGET },
  permittedFocusKinds: ["none"],
  executionDuration: seconds(1),
  /* threatens omitted: healing an ally endangers nobody. */
};

const STANCE: ActionProfile = {
  id: "defensive-stance",
  source: { type: "technique", id: "defensive-stance" },
  allowedTimings: ["action"],
  structuredActionCost: ONE_ACTION,
  targets: { cardinality: NO_TARGETS },
  permittedFocusKinds: ["none"],
  executionDuration: seconds(1),
};

const GROUND_PUNCH: ActionProfile = {
  id: "ground-punch",
  source: { type: "skill", id: "ground-punch" },
  allowedTimings: ["action"],
  structuredActionCost: ONE_ACTION,
  targets: { cardinality: ANY_NUMBER_OF_TARGETS },
  permittedFocusKinds: ["none", "position"],
  executionDuration: seconds(1),
  threatens: "declared-targets",
};

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

const AT_C: TargetRef = { kind: "entity", entityId: "c" };

function schedule(
  round: CombatRound,
  overrides: Partial<Parameters<typeof scheduleNeutralAction>[1]> = {},
) {
  return scheduleNeutralAction(round, {
    actionId: "combat-action-1",
    profile: STRIKE,
    intent: intent({ targets: [AT_C] }),
    actorCombatantId: "a",
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
    /*
     * The profile's price never changes. What changes is whether there is a
     * Round to charge it against.
     */
    expect(structuredActionCostFor(STRIKE, UNSTRUCTURED_EXECUTION))
      .toEqual(NO_STRUCTURED_ACTION_COST);

    expect(scheduled(threeCombatantRound()).actionCost).toBe(1);
    expect(STRIKE.structuredActionCost).toEqual(ONE_ACTION);
  });

  it("refuses to schedule an intent built for unstructured time", () => {
    const result = schedule(threeCombatantRound(), {
      intent: intent({
        targets: [AT_C],
        executionContext: UNSTRUCTURED_EXECUTION,
      }),
    });

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("execution-context-not-structured");
  });
});


describe("Combat authorizes; it does not own the action", () => {
  it("schedules an eligible intent for the combatant whose Turn it is", () => {
    const action = scheduled(threeCombatantRound());

    expect(action.actorCombatantId).toBe("a");
    expect(action.intentId).toBe("intent-1");
    expect(action.actionCost).toBe(1);
    expect(action.threatenedCombatantIds).toEqual(["c"]);
  });

  it("references the intent rather than copying its targets", () => {
    /*
     * The CombatAction carries an id and a threat list. The goal, the focus,
     * the Range, the check and the consequences stay in the neutral layer,
     * where exactly one thing owns them.
     */
    const action = scheduled(threeCombatantRound());

    expect(action).not.toHaveProperty("targets");
    expect(action).not.toHaveProperty("declaredGoal");
    expect(action).not.toHaveProperty("focus");
    expect(action).not.toHaveProperty("check");
  });

  it("refuses an actor who is not the one acting", () => {
    const result = schedule(threeCombatantRound(), {
      actorCombatantId: "b",
      intent: intent({ targets: [AT_C], actor: { type: "character", id: "b" } }),
    });

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("not-the-active-combatant");
  });

  it("refuses a timing the profile does not allow", () => {
    const result = schedule(threeCombatantRound(), {
      profile: HEAL,
      intent: intent({
        profileId: HEAL.id,
        targets: [AT_C],
        executionContext: { kind: "structured", timing: "reaction" },
      }),
    });

    if (result.success) throw new Error("unreachable");

    /* The active state is a Turn, so the intent's Reaction timing mismatches. */
    expect(result.reason).toBe("timing-mismatch");
  });

  it("schedules a Reaction-timed intent inside a Reaction", () => {
    const round = threeCombatantRound();
    const action = scheduled(round, { intent: intent({ targets: [AT_C] }) });

    const spent = resolveCombatAction(round, action);

    if (!spent.success) throw new Error("unreachable");

    const opportunity = createReactionOpportunity(action, "c");

    if (!opportunity.success) throw new Error("unreachable");

    const opened = resolveSuccessfulReactionGate(
      spent.round,
      opportunity.opportunity,
    );

    if (!opened.success) throw new Error("unreachable");

    const reactionAction = scheduleNeutralAction(opened.round, {
      actionId: "combat-action-2",
      profile: STRIKE,
      intent: {
        ...intent({ targets: [{ kind: "entity", entityId: "a" }] }),
        id: "intent-2",
        actor: { type: "character", id: "c" },
        executionContext: { kind: "structured", timing: "reaction" },
      },
      actorCombatantId: "c",
      resolveCombatant,
    });

    expect(reactionAction.success).toBe(true);

    if (!reactionAction.success) throw new Error("unreachable");

    expect(reactionAction.action.threatenedCombatantIds).toEqual(["a"]);
  });

  it("schedules a targetless action where the profile permits one", () => {
    const action = scheduled(threeCombatantRound(), {
      profile: STANCE,
      intent: intent({ profileId: STANCE.id, targets: [] }),
    });

    expect(action.threatenedCombatantIds).toEqual([]);

    const spent = resolveCombatAction(threeCombatantRound(), action);

    expect(spent.success).toBe(true);
  });

  it("keeps mechanical costs out of the Action economy entirely", () => {
    /*
     * The Aura this Skill burns is priced by the resource domain and
     * committed through settlement. Combat charges one thing: an Action.
     */
    const action = scheduled(threeCombatantRound());

    expect(action.actionCost).toBe(1);
    expect(action).not.toHaveProperty("costRequests");
    expect(action).not.toHaveProperty("requested");
  });
});


describe("who may react", () => {
  it("offers a Reaction to a combatant a threatening action declared", () => {
    const action = scheduled(threeCombatantRound());

    expect(createReactionOpportunity(action, "c").success).toBe(true);
  });

  it("offers none for a harmless ability that named the same combatant", () => {
    /*
     * The rule the old model got wrong. Being pointed at is not being
     * endangered, and a healer does not provoke a dodge.
     */
    expect(profileThreatensDeclaredTargets(HEAL)).toBe(false);

    const heal = scheduled(threeCombatantRound(), {
      profile: HEAL,
      intent: intent({ profileId: HEAL.id, targets: [AT_C] }),
    });

    expect(heal.threatenedCombatantIds).toEqual([]);

    const result = createReactionOpportunity(heal, "c");

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("combatant-not-threatened");
  });

  it("still offers one when the blow ultimately misses", () => {
    /*
     * The threat list is fixed before resolution and nothing downstream
     * edits it. You duck the blow that was coming, not the one that landed.
     */
    const action = scheduled(threeCombatantRound());
    const opportunity = createReactionOpportunity(action, "c");

    expect(opportunity.success).toBe(true);

    /* No outcome has been resolved at all at this point. */
    expect(action).not.toHaveProperty("succeeded");
  });

  it("offers none to a collateral combatant who was merely affected", () => {
    /*
     * A position-focused punch declares nobody. Whoever the blast catches
     * becomes an affected subject during settlement, and that is far too
     * late to have offered them a Reaction — the Reaction exists to be taken
     * BEFORE the thing resolves.
     */
    const punch = scheduled(threeCombatantRound(), {
      profile: GROUND_PUNCH,
      intent: intent({ profileId: GROUND_PUNCH.id, targets: [] }),
    });

    expect(punch.threatenedCombatantIds).toEqual([]);

    const result = createReactionOpportunity(punch, "b");

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("combatant-not-threatened");
  });

  it("offers one to a bystander who WAS named as explicitly threatened", () => {
    /*
     * The same position-focused punch, with whoever worked out that B is
     * standing on that ground naming them ahead of resolution. Combat does
     * not compute this; it is told.
     */
    const punch = scheduled(threeCombatantRound(), {
      profile: GROUND_PUNCH,
      intent: intent({ profileId: GROUND_PUNCH.id, targets: [] }),
      additionalThreatenedCombatantIds: ["b"],
    });

    expect(punch.threatenedCombatantIds).toEqual(["b"]);
    expect(createReactionOpportunity(punch, "b").success).toBe(true);
  });

  it("refuses to let a harmless profile carry an explicit threat", () => {
    const result = schedule(threeCombatantRound(), {
      profile: HEAL,
      intent: intent({ profileId: HEAL.id, targets: [AT_C] }),
      additionalThreatenedCombatantIds: ["b"],
    });

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("threat-not-permitted");
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
    const round = threeCombatantRound();

    const threat = createEventReactionOpportunity(
      { eventId: "boulder-1", threatenedCombatantIds: ["c"] },
      "c",
    );

    if (!threat.success) throw new Error("unreachable");

    const opened = resolveSuccessfulReactionGate(round, threat.opportunity);

    expect(opened.success).toBe(true);

    if (!opened.success) throw new Error("unreachable");

    /* A's Turn ends even though A did nothing. */
    expect(opened.triggeringTurnEnd.combatantId).toBe("a");
    expect(opened.round.initiativeIndex).toBe(0);
  });
});


describe("Reactions are limited only by the shared Round pool", () => {
  it("lets one combatant react repeatedly while Actions remain", () => {
    /*
     * There is no per-Round Reaction limit. The Reaction cap governs how
     * many Actions may be spent INSIDE one Reaction; the Round pool governs
     * how many Reactions a combatant can afford at all.
     */
    let round = startedRound([
      combatantInput("a", { round: 4 }),
      combatantInput("b", { round: 4 }),
      combatantInput("c", { round: 4, reaction: 1 }),
    ]);

    /*
     * A attacks C, C reacts; the Round then moves on to B, who attacks C
     * again. C reacts a second time in the same Round, which nothing stops.
     */
    for (const actionId of ["r-1", "r-2"]) {
      const actor = round.activeState?.kind === "turn"
        ? round.activeState.combatantId
        : undefined;

      if (actor === undefined) throw new Error("expected an active Turn");

      const action = scheduled(round, {
        actionId,
        actorCombatantId: actor,
        intent: {
          ...intent({ targets: [AT_C] }),
          id: `intent-${actionId}`,
          actor: { type: "character", id: actor },
        },
      });

      const spent = resolveCombatAction(round, action);

      if (!spent.success) throw new Error("unreachable");

      const opportunity = createReactionOpportunity(action, "c");

      if (!opportunity.success) throw new Error("unreachable");

      const opened = resolveSuccessfulReactionGate(
        spent.round,
        opportunity.opportunity,
      );

      if (!opened.success) throw new Error("unreachable");

      const reacted = resolveVoluntaryReactionEnd(opened.round);

      if (!reacted.success) throw new Error("unreachable");

      round = reacted.round;
    }

    /* C reacted twice and has spent nothing, having declined both times. */
    expect(findRoundCombatant(round, "c")?.remainingActions).toBe(4);
  });

  it("caps Actions within one Reaction without capping Reactions", () => {
    const round = threeCombatantRound({ reaction: 1 });
    const action = scheduled(round);
    const spent = resolveCombatAction(round, action);

    if (!spent.success) throw new Error("unreachable");

    const opportunity = createReactionOpportunity(action, "c");

    if (!opportunity.success) throw new Error("unreachable");

    const opened = resolveSuccessfulReactionGate(
      spent.round,
      opportunity.opportunity,
    );

    if (!opened.success) throw new Error("unreachable");

    const reactionAction = scheduled(opened.round, {
      actionId: "combat-action-2",
      intent: {
        ...intent({ targets: [{ kind: "entity", entityId: "a" }] }),
        id: "intent-2",
        actor: { type: "character", id: "c" },
        executionContext: { kind: "structured", timing: "reaction" },
      },
      actorCombatantId: "c",
    });

    const reacted = resolveCombatAction(opened.round, reactionAction);

    if (!reacted.success) throw new Error("unreachable");

    /* The cap of 1 is now reached, and the Reaction must end. */
    expect(reacted.stateMustEnd).toBe(true);
    expect(findRoundCombatant(reacted.round, "c")?.remainingActions).toBe(3);
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

    /* The Gate can still be resolved against a Turn that is still open. */
    const opportunity = createReactionOpportunity(action, "c");

    if (!opportunity.success) throw new Error("unreachable");

    expect(resolveSuccessfulReactionGate(
      spent.round,
      opportunity.opportunity,
    ).success).toBe(true);
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
