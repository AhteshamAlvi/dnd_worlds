/*
 * Characterization: Turn and Reaction state lifecycles.
 *
 * The settled rule these exist to protect: being affected creates an
 * OPPORTUNITY, not a Reaction; the Detection gate is separate and lives
 * outside this module; opening a Reaction ends the triggering Turn; and
 * Reaction Actions come from the same Round pool a Turn spends from.
 */

import { describe, expect, it } from "vitest";

import {
  REACTION_DECISION_LIMIT_SECONDS,
  REACTION_END_REASONS,
  REACTION_OPPORTUNITY_FAILURE_REASONS,
  REACTION_START_FAILURE_REASONS,
  TURN_DECISION_LIMIT_SECONDS,
  TURN_END_REASONS,
  TURN_START_FAILURE_REASONS,
  availableReactionActions,
  availableTurnActions,
  canContinueReaction,
  canContinueTurn,
  createEventReactionOpportunity,
  createReactionOpportunity,
  endReactionAtActionCap,
  endReactionForRoundExhaustion,
  endReactionVoluntarily,
  endTurnAtActionCap,
  endTurnForReaction,
  endTurnForRoundExhaustion,
  endTurnVoluntarily,
  findAutomaticReactionEndReason,
  findAutomaticTurnEndReason,
  isValidReactionActionCap,
  isValidTurnActionCap,
  openReactionAfterGateSuccess,
  resolveAutomaticReactionEnd,
  resolveAutomaticTurnEnd,
  startTurn,
} from "../gameplay/combat";
import {
  initiative,
  reactionState,
  roundState,
  skillAction,
  turnState,
} from "./fixtures/combat";

const ORDER = initiative("a", "b", "c");


describe("decision limits are advertised, not enforced", () => {
  it("states 30 seconds for a Turn and 15 for a Reaction", () => {
    /*
     * The engine runs no timers. These are the numbers a host counts down
     * with; expiry comes back as Hesitation through the Action path.
     */
    expect(TURN_DECISION_LIMIT_SECONDS).toBe(30);
    expect(REACTION_DECISION_LIMIT_SECONDS).toBe(15);
  });
});


describe("starting a Turn", () => {
  it("declares three failure reasons", () => {
    expect([...TURN_START_FAILURE_REASONS]).toEqual([
      "combatant-not-in-initiative",
      "combatant-not-round-eligible",
      "invalid-turn-action-cap",
    ]);
  });

  it("takes its Action cap from the combatant's own capacity", () => {
    const result = startTurn("a", ORDER, [roundState("a", 4, { turn: 3 })]);

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(result.turn).toEqual({
      kind: "turn",
      combatantId: "a",
      actionCap: 3,
      actionsSpent: 0,
    });
  });

  it("spends nothing to start", () => {
    const combatant = roundState("a", 4);

    startTurn("a", ORDER, [combatant]);

    expect(combatant.remainingActions).toBe(4);
  });

  it("refuses a combatant absent from Initiative", () => {
    const result = startTurn("z", ORDER, [roundState("z", 4)]);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("combatant-not-in-initiative");
  });

  it("refuses a combatant with no Round Actions left", () => {
    const result = startTurn("a", ORDER, [roundState("a", 0)]);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("combatant-not-round-eligible");
  });

  it("refuses a combatant with no Round state at all", () => {
    const result = startTurn("a", ORDER, []);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("combatant-not-round-eligible");
  });

  it("refuses an invalid resolved Turn cap", () => {
    for (const turn of [0, -1, 1.5]) {
      const result = startTurn("a", ORDER, [roundState("a", 4, { turn })]);

      if (result.success) throw new Error("unreachable");

      expect(result.reason).toBe("invalid-turn-action-cap");
    }

    expect(isValidTurnActionCap(2)).toBe(true);
    expect(isValidTurnActionCap(0)).toBe(false);
  });
});


describe("continuing a Turn", () => {
  it("needs room under BOTH the cap and the Round pool", () => {
    expect(canContinueTurn(turnState("a", 2, 0), roundState("a", 4))).toBe(true);
    expect(canContinueTurn(turnState("a", 2, 2), roundState("a", 4))).toBe(false);
    expect(canContinueTurn(turnState("a", 2, 0), roundState("a", 0))).toBe(false);
  });

  it("refuses a combatant who is not the one whose Turn it is", () => {
    expect(canContinueTurn(turnState("a"), roundState("b", 4))).toBe(false);
    expect(availableTurnActions(turnState("a"), roundState("b", 4))).toBe(0);
  });

  it("reports the smaller of the two allowances", () => {
    expect(availableTurnActions(turnState("a", 2, 0), roundState("a", 4))).toBe(2);
    expect(availableTurnActions(turnState("a", 2, 0), roundState("a", 1))).toBe(1);
    expect(availableTurnActions(turnState("a", 2, 2), roundState("a", 4))).toBe(0);
    expect(availableTurnActions(turnState("a", 2, 0), roundState("a", -1))).toBe(0);
  });
});


describe("ending a Turn", () => {
  it("declares four reasons", () => {
    expect([...TURN_END_REASONS]).toEqual([
      "voluntary",
      "action-cap-reached",
      "round-actions-exhausted",
      "reaction-opened",
    ]);
  });

  it("reports the Actions actually spent, which may be under the cap", () => {
    expect(endTurnVoluntarily(turnState("a", 2, 1))).toEqual({
      combatantId: "a",
      reason: "voluntary",
      actionsSpent: 1,
    });
  });

  it("labels each ending path", () => {
    const turn = turnState("a", 2, 2);

    expect(endTurnAtActionCap(turn).reason).toBe("action-cap-reached");
    expect(endTurnForRoundExhaustion(turn).reason).toBe("round-actions-exhausted");
    expect(endTurnForReaction(turn).reason).toBe("reaction-opened");
  });

  it("ends automatically on an exhausted pool before a reached cap", () => {
    /*
     * Both conditions hold; exhaustion is reported. It is the more binding
     * of the two, since the cap resets on the next Turn and the pool does
     * not.
     */
    expect(findAutomaticTurnEndReason(turnState("a", 2, 2), roundState("a", 0)))
      .toBe("round-actions-exhausted");

    expect(findAutomaticTurnEndReason(turnState("a", 2, 2), roundState("a", 4)))
      .toBe("action-cap-reached");
  });

  it("does not end automatically while the Turn can continue", () => {
    expect(findAutomaticTurnEndReason(turnState("a", 2, 0), roundState("a", 4)))
      .toBeNull();
    expect(resolveAutomaticTurnEnd(turnState("a", 2, 0), roundState("a", 4)))
      .toBeNull();
  });

  it("never ends the Turn of somebody else's combatant state", () => {
    expect(findAutomaticTurnEndReason(turnState("a", 2, 2), roundState("b", 0)))
      .toBeNull();
  });

  it("does NOT infer a Reaction ending, which is an external transition", () => {
    const ended = resolveAutomaticTurnEnd(turnState("a", 2, 2), roundState("a", 4));

    expect(ended?.reason).toBe("action-cap-reached");
    expect(ended?.reason).not.toBe("reaction-opened");
  });
});


describe("Reaction opportunities", () => {
  it("declares three failure reasons", () => {
    expect([...REACTION_OPPORTUNITY_FAILURE_REASONS]).toEqual([
      "combatant-not-threatened",
      "self-reaction",
      "trigger-id-missing",
    ]);
  });

  it("refuses an Action with no identity to react to", () => {
    const result = createReactionOpportunity(
      skillAction({ id: "  ", threatenedCombatantIds: ["c"] }),
      "c",
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("trigger-id-missing");
  });

  it("is created for a combatant the Action explicitly threatens", () => {
    const action = skillAction({
      actorCombatantId: "a",
      threatenedCombatantIds: ["c"],
    });

    const result = createReactionOpportunity(action, "c");

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(result.opportunity).toEqual({
      trigger: {
        kind: "action",
        actionId: "action-1",
        actorCombatantId: "a",
      },
      reactingCombatantId: "c",
    });
  });

  it("is NOT a Reaction — the Detection gate happens elsewhere", () => {
    /*
     * The whole point of the two shapes. An opportunity carries no Action
     * cap and no spent count, because nothing has opened yet.
     */
    const result = createReactionOpportunity(
      skillAction({ threatenedCombatantIds: ["c"] }),
      "c",
    );

    if (!result.success) throw new Error("unreachable");

    expect(result.opportunity).not.toHaveProperty("actionCap");
    expect(result.opportunity).not.toHaveProperty("actionsSpent");
  });

  it("refuses a combatant the Action does not threaten", () => {
    const result = createReactionOpportunity(
      skillAction({ threatenedCombatantIds: ["c"] }),
      "b",
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("combatant-not-threatened");
  });

  it("refuses the actor reacting to their own Action", () => {
    const result = createReactionOpportunity(
      skillAction({
        actorCombatantId: "a",
        threatenedCombatantIds: ["a", "c"],
      }),
      "a",
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("self-reaction");
  });

  it("checks self-reaction BEFORE the threat list", () => {
    const result = createReactionOpportunity(
      skillAction({ actorCombatantId: "a", threatenedCombatantIds: ["c"] }),
      "a",
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("self-reaction");
  });

  it("reads the threat list and nothing else", () => {
    const result = createReactionOpportunity(
      skillAction({ threatenedCombatantIds: [] }),
      "c",
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("combatant-not-threatened");
  });
});


describe("a hazard can open a Reaction with no actor at all", () => {
  it("creates an opportunity from a host-supplied credible threat", () => {
    const result = createEventReactionOpportunity(
      {
        eventId: "boulder-1",
        threatenedCombatantIds: ["b", "c"],
        describedAs: "A boulder comes down the slope.",
      },
      "c",
    );

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(result.opportunity).toEqual({
      trigger: {
        kind: "event",
        eventId: "boulder-1",
        describedAs: "A boulder comes down the slope.",
      },
      reactingCombatantId: "c",
    });
  });

  it("refuses a hazard with no identity", () => {
    const result = createEventReactionOpportunity(
      { eventId: "   ", threatenedCombatantIds: ["c"] },
      "c",
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("trigger-id-missing");
  });

  it("refuses a combatant the hazard does not endanger", () => {
    const result = createEventReactionOpportunity(
      { eventId: "boulder-1", threatenedCombatantIds: ["b"] },
      "c",
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("combatant-not-threatened");
  });

  it("has no self-reaction rule, because a hazard has no actor", () => {
    /*
     * Reacting to a boulder during your own Turn is ordinary. The
     * self-reaction refusal exists to stop somebody reacting to their own
     * Action, and there is no Action here to react to.
     */
    const result = createEventReactionOpportunity(
      { eventId: "boulder-1", threatenedCombatantIds: ["a"] },
      "a",
    );

    expect(result.success).toBe(true);
  });
});


describe("opening a Reaction ends the triggering Turn", () => {
  const opportunity = {
    trigger: {
      kind: "action",
      actionId: "action-1",
      actorCombatantId: "a",
    },
    reactingCombatantId: "c",
  } as const;

  it("declares three failure reasons", () => {
    expect([...REACTION_START_FAILURE_REASONS]).toEqual([
      "triggering-turn-mismatch",
      "reacting-combatant-not-round-eligible",
      "invalid-reaction-action-cap",
    ]);
  });

  it("returns the Reaction and the triggering Turn's end together", () => {
    /*
     * Deliberately not two steps. A Reaction cannot exist while the Turn
     * that provoked it is still active, so the ending is part of opening.
     */
    const result = openReactionAfterGateSuccess(
      opportunity,
      turnState("a", 2, 1),
      [roundState("a", 3), roundState("c", 4, { reaction: 1 })],
    );

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(result.reaction).toEqual({
      kind: "reaction",
      reactingCombatantId: "c",
      trigger: {
        kind: "action",
        actionId: "action-1",
        actorCombatantId: "a",
      },
      interruptedCombatantId: "a",
      actionCap: 1,
      actionsSpent: 0,
    });

    expect(result.triggeringTurnEnd).toEqual({
      combatantId: "a",
      reason: "reaction-opened",
      actionsSpent: 1,
    });
  });

  it("refuses when the active Turn is not the triggering combatant's", () => {
    const result = openReactionAfterGateSuccess(
      opportunity,
      turnState("b"),
      [roundState("c", 4)],
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("triggering-turn-mismatch");
  });

  it("refuses a reactor with no Round Actions left", () => {
    /*
     * The rule that makes Reactions cost something. A combatant who has
     * spent their Round cannot react, however good their Detection was.
     */
    const result = openReactionAfterGateSuccess(
      opportunity,
      turnState("a"),
      [roundState("c", 0)],
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("reacting-combatant-not-round-eligible");
  });

  it("refuses a reactor with no Round state", () => {
    const result = openReactionAfterGateSuccess(opportunity, turnState("a"), []);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("reacting-combatant-not-round-eligible");
  });

  it("refuses an invalid resolved Reaction cap", () => {
    const result = openReactionAfterGateSuccess(
      opportunity,
      turnState("a"),
      [roundState("c", 4, { reaction: 0 })],
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("invalid-reaction-action-cap");

    expect(isValidReactionActionCap(1)).toBe(true);
    expect(isValidReactionActionCap(0)).toBe(false);
  });

  it("places no limit on how many Reactions one combatant opens per Round", () => {
    /*
     * CHARACTERIZED, NOT ENDORSED. Nothing here counts Reactions. A
     * combatant with Round Actions left can open a Reaction against every
     * triggering Action in the Round, one after another — the only brake is
     * the shared Round pool.
     *
     * Reported rather than corrected: adding a per-Round Reaction limit is
     * a rules decision, not a characterization.
     */
    const combatants = [roundState("a", 3), roundState("c", 4)];

    const first = openReactionAfterGateSuccess(opportunity, turnState("a"), combatants);
    const second = openReactionAfterGateSuccess(opportunity, turnState("a"), combatants);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
  });
});


describe("continuing and ending a Reaction", () => {
  it("needs room under both the cap and the Round pool", () => {
    expect(canContinueReaction(reactionState("c", "a", 2, 0), roundState("c", 4)))
      .toBe(true);
    expect(canContinueReaction(reactionState("c", "a", 2, 2), roundState("c", 4)))
      .toBe(false);
    expect(canContinueReaction(reactionState("c", "a", 2, 0), roundState("c", 0)))
      .toBe(false);
  });

  it("refuses a combatant who is not the one reacting", () => {
    expect(canContinueReaction(reactionState("c", "a"), roundState("a", 4)))
      .toBe(false);
    expect(availableReactionActions(reactionState("c", "a"), roundState("a", 4)))
      .toBe(0);
  });

  it("reports the smaller of the two allowances", () => {
    expect(availableReactionActions(reactionState("c", "a", 2, 0), roundState("c", 1)))
      .toBe(1);
    expect(availableReactionActions(reactionState("c", "a", 2, 0), roundState("c", 4)))
      .toBe(2);
  });

  it("declares three ending reasons, without a Reaction-opened one", () => {
    /*
     * Asymmetric with Turns on purpose: a Turn can be ended by somebody
     * else's Reaction, and a Reaction cannot.
     */
    expect([...REACTION_END_REASONS]).toEqual([
      "voluntary",
      "action-cap-reached",
      "round-actions-exhausted",
    ]);
  });

  it("carries the trigger's identity into the ending", () => {
    expect(endReactionVoluntarily(reactionState("c", "a", 1, 1))).toEqual({
      combatantId: "c",
      interruptedCombatantId: "a",
      trigger: {
        kind: "action",
        actionId: "action-1",
        actorCombatantId: "a",
      },
      reason: "voluntary",
      actionsSpent: 1,
    });
  });

  it("labels each ending path", () => {
    const reaction = reactionState("c", "a", 1, 1);

    expect(endReactionAtActionCap(reaction).reason).toBe("action-cap-reached");
    expect(endReactionForRoundExhaustion(reaction).reason)
      .toBe("round-actions-exhausted");
  });

  it("ends automatically on exhaustion before a reached cap", () => {
    expect(findAutomaticReactionEndReason(
      reactionState("c", "a", 1, 1),
      roundState("c", 0),
    )).toBe("round-actions-exhausted");

    expect(findAutomaticReactionEndReason(
      reactionState("c", "a", 1, 1),
      roundState("c", 4),
    )).toBe("action-cap-reached");

    expect(resolveAutomaticReactionEnd(
      reactionState("c", "a", 2, 0),
      roundState("c", 4),
    )).toBeNull();
  });
});
