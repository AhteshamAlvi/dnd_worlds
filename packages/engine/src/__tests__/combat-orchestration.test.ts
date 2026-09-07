/*
 * Characterization: the orchestration layer, and the sequences it produces.
 *
 * These are the tests the neutral-action refactor has to keep green. They
 * walk whole exchanges rather than single functions, because the rules that
 * matter most here are about ORDER: an Action is spent before its Reaction
 * opportunity is resolved, opening a Reaction ends the triggering Turn, and
 * Initiative resumes after the interrupted Turn rather than returning to it.
 */

import { describe, expect, it } from "vitest";

import {
  COMBAT_RESOLUTION_FAILURE_REASONS,
  continueAfterNoReaction,
  createReactionOpportunity,
  didRoundComplete,
  findActiveCombatant,
  mustEndActiveState,
  resolveCombatAction,
  resolveSuccessfulReactionGate,
  resolveVoluntaryReactionEnd,
  resolveVoluntaryTurnEnd,
  settleActiveStateAfterAction,
  setRoundActiveState,
  advanceToNextTurn,
  findRoundCombatant,
  type CombatRound,
} from "../gameplay/combat";
import {
  beginRoundMovement,
  spendMove,
} from "../character/foundation/attributes/movement";
import {
  combatantInput,
  reactionState,
  skillAction,
  startedRound,
  threeCombatantRound,
  turnState,
} from "./fixtures/combat";

/** Spends one Action for whoever is currently active, failing loudly. */
function spend(
  round: CombatRound,
  overrides: Parameters<typeof skillAction>[0] = {},
): CombatRound {
  const result = resolveCombatAction(round, skillAction(overrides));

  if (!result.success) {
    throw new Error(`Expected the Action to resolve: ${result.reason}`);
  }

  return result.round;
}


describe("finding who is acting", () => {
  it("reads the combatant out of whichever state is active", () => {
    const round = threeCombatantRound();

    expect(findActiveCombatant(round)?.combatantId).toBe("a");

    const reacting = setRoundActiveState(round, reactionState("c", "a"));

    expect(findActiveCombatant(reacting)?.combatantId).toBe("c");
  });

  it("reports nobody when no state is active", () => {
    expect(findActiveCombatant(setRoundActiveState(threeCombatantRound(), null)))
      .toBeUndefined();
  });
});


describe("resolving one Action", () => {
  it("declares six failure reasons", () => {
    expect([...COMBAT_RESOLUTION_FAILURE_REASONS]).toEqual([
      "no-active-state",
      "active-combatant-missing",
      "action-spend-failed",
      "active-state-not-turn",
      "active-state-not-reaction",
      "reaction-open-failed",
    ]);
  });

  it("charges the pool and the state, and returns the new Round", () => {
    const result = resolveCombatAction(threeCombatantRound(), skillAction());

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(findRoundCombatant(result.round, "a")?.remainingActions).toBe(3);
    expect(result.round.activeState).toEqual(turnState("a", 2, 1));
    expect(result.spend.success).toBe(true);
  });

  it("refuses when nothing is active", () => {
    const result = resolveCombatAction(
      setRoundActiveState(threeCombatantRound(), null),
      skillAction(),
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("no-active-state");
  });

  it("passes the Action-economy failure through, naming the actor", () => {
    const result = resolveCombatAction(
      threeCombatantRound(),
      skillAction({ actorCombatantId: "b" }),
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("action-spend-failed");
    expect(result.combatantId).toBe("a");
    expect(result.actionSpendFailureReason).toBe("wrong-combatant");
  });

  it("reports that the state must end WITHOUT ending it", () => {
    /*
     * The deliberate delay. A's second Action reaches the Turn cap, and the
     * Turn stays active anyway — because the Reaction Gate for that very
     * Action has not been resolved yet, and a Reaction cannot open against
     * a Turn that has already been closed.
     */
    const afterFirst = spend(threeCombatantRound());
    const result = resolveCombatAction(afterFirst, skillAction({ id: "action-2" }));

    if (!result.success) throw new Error("unreachable");

    expect(result.stateMustEnd).toBe(true);
    expect(result.round.activeState).toEqual(turnState("a", 2, 2));
    expect(mustEndActiveState(result.round)).toBe(true);
  });
});


describe("settling the state after an Action", () => {
  it("leaves a Turn open while it can still continue", () => {
    const settled = settleActiveStateAfterAction(spend(threeCombatantRound()));

    expect(settled.success).toBe(true);

    if (!settled.success) throw new Error("unreachable");

    expect(settled.stateEnded).toBe(false);
    expect(settled.roundComplete).toBe(false);
    expect(settled.round.activeState).toEqual(turnState("a", 2, 1));
  });

  it("ends the Turn at the cap and advances Initiative", () => {
    const atCap = spend(spend(threeCombatantRound()), { id: "action-2" });
    const settled = settleActiveStateAfterAction(atCap);

    if (!settled.success) throw new Error("unreachable");

    expect(settled.stateEnded).toBe(true);
    expect(settled.turnEnd).toEqual({
      combatantId: "a",
      reason: "action-cap-reached",
      actionsSpent: 2,
    });
    expect(settled.round.initiativeIndex).toBe(1);
    expect(settled.round.activeState).toEqual(turnState("b", 2));
  });

  it("keeps the unspent Round Actions for the next rotation", () => {
    /*
     * A has a 4-Action Round and a 2-Action Turn. Reaching the cap ends the
     * Turn, not the Round: the other two Actions survive until Initiative
     * comes back around.
     */
    const atCap = spend(spend(threeCombatantRound()), { id: "action-2" });
    const settled = settleActiveStateAfterAction(atCap);

    if (!settled.success) throw new Error("unreachable");

    expect(findRoundCombatant(settled.round, "a")?.remainingActions).toBe(2);
  });

  it("refuses when nothing is active", () => {
    const settled = settleActiveStateAfterAction(
      setRoundActiveState(threeCombatantRound(), null),
    );

    if (settled.success) throw new Error("unreachable");

    expect(settled.reason).toBe("no-active-state");
  });

  it("completes the Round when the last pool empties", () => {
    /* One Action each, one Action apiece in the Round. */
    let round = startedRound([
      combatantInput("a", { round: 1, turn: 1 }),
      combatantInput("b", { round: 1, turn: 1 }),
    ]);

    round = spend(round);

    const first = settleActiveStateAfterAction(round);

    if (!first.success) throw new Error("unreachable");

    expect(first.roundComplete).toBe(false);

    round = spend(first.round, { actorCombatantId: "b" });

    const second = settleActiveStateAfterAction(round);

    if (!second.success) throw new Error("unreachable");

    expect(second.roundComplete).toBe(true);
    expect(second.round.activeState).toBeNull();
  });
});


describe("the Reaction sequence, end to end", () => {
  function attackOnC() {
    const round = spend(threeCombatantRound(), { targetCombatantIds: ["c"] });

    const opportunity = createReactionOpportunity(
      skillAction({ targetCombatantIds: ["c"] }),
      "c",
    );

    if (!opportunity.success) throw new Error("unreachable");

    return { round, opportunity: opportunity.opportunity };
  }

  it("opens the Reaction and ends the triggering Turn in one step", () => {
    const { round, opportunity } = attackOnC();

    const opened = resolveSuccessfulReactionGate(round, opportunity);

    expect(opened.success).toBe(true);

    if (!opened.success) throw new Error("unreachable");

    expect(opened.triggeringTurnEnd).toEqual({
      combatantId: "a",
      reason: "reaction-opened",
      actionsSpent: 1,
    });

    expect(opened.round.activeState).toEqual({
      kind: "reaction",
      reactingCombatantId: "c",
      triggeringCombatantId: "a",
      triggeringActionId: "action-1",
      actionCap: 1,
      actionsSpent: 0,
    });
  });

  it("leaves the Initiative position on the interrupted Turn", () => {
    const { round, opportunity } = attackOnC();
    const opened = resolveSuccessfulReactionGate(round, opportunity);

    if (!opened.success) throw new Error("unreachable");

    expect(opened.round.initiativeIndex).toBe(0);
  });

  it("spends the Reaction's Action from the reactor's own Round pool", () => {
    const { round, opportunity } = attackOnC();
    const opened = resolveSuccessfulReactionGate(round, opportunity);

    if (!opened.success) throw new Error("unreachable");

    const reacted = spend(opened.round, {
      id: "action-2",
      actorCombatantId: "c",
    });

    expect(findRoundCombatant(reacted, "c")?.remainingActions).toBe(3);
    expect(findRoundCombatant(reacted, "a")?.remainingActions).toBe(3);
  });

  it("continues to the NEXT combatant, never back into the ended Turn", () => {
    const { round, opportunity } = attackOnC();
    const opened = resolveSuccessfulReactionGate(round, opportunity);

    if (!opened.success) throw new Error("unreachable");

    const reacted = spend(opened.round, {
      id: "action-2",
      actorCombatantId: "c",
    });

    /* The Reaction cap is 1, so it must now end. */
    const settled = settleActiveStateAfterAction(reacted);

    if (!settled.success) throw new Error("unreachable");

    expect(settled.stateEnded).toBe(true);
    expect(settled.reactionEnd?.reason).toBe("action-cap-reached");
    expect(settled.round.initiativeIndex).toBe(1);
    expect(settled.round.activeState).toEqual(turnState("b", 2));
  });

  it("leaves A's unspent Actions available for the next rotation", () => {
    /*
     * A's Turn was cut short by C's Reaction. A keeps the three Round
     * Actions they had not spent, and gets them when Initiative wraps.
     */
    const { round, opportunity } = attackOnC();
    const opened = resolveSuccessfulReactionGate(round, opportunity);

    if (!opened.success) throw new Error("unreachable");

    const ended = resolveVoluntaryReactionEnd(opened.round);

    if (!ended.success) throw new Error("unreachable");

    expect(findRoundCombatant(ended.round, "a")?.remainingActions).toBe(3);

    const backToA = advanceToNextTurn(
      advanceToNextTurn(setRoundActiveState(ended.round, null)).round,
    );

    expect(backToA.round.activeState).toEqual(turnState("a", 2));
  });

  it("refuses to open a Reaction while a Reaction is already active", () => {
    const { round, opportunity } = attackOnC();
    const opened = resolveSuccessfulReactionGate(round, opportunity);

    if (!opened.success) throw new Error("unreachable");

    const again = resolveSuccessfulReactionGate(opened.round, opportunity);

    if (again.success) throw new Error("unreachable");

    expect(again.reason).toBe("active-state-not-turn");
  });

  it("refuses to open one when nothing is active", () => {
    const { opportunity } = attackOnC();

    const result = resolveSuccessfulReactionGate(
      setRoundActiveState(threeCombatantRound(), null),
      opportunity,
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("no-active-state");
  });

  it("carries a failed opening's reason through", () => {
    const { round } = attackOnC();

    const result = resolveSuccessfulReactionGate(round, {
      triggeringActionId: "action-1",
      triggeringCombatantId: "b",
      reactingCombatantId: "c",
    });

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("reaction-open-failed");
    expect(result.reactionStartFailureReason).toBe("triggering-turn-mismatch");
  });

  it("changes nothing when no Reaction opens", () => {
    /*
     * A declined or failed gate is not a state transition. The helper
     * simply settles the Action that was already spent.
     */
    const { round } = attackOnC();
    const settled = continueAfterNoReaction(round);

    if (!settled.success) throw new Error("unreachable");

    expect(settled.stateEnded).toBe(false);
    expect(settled.round.activeState).toEqual(turnState("a", 2, 1));
  });
});


describe("voluntary endings", () => {
  it("ends a Turn without spending an Action and advances", () => {
    const round = spend(threeCombatantRound());
    const ended = resolveVoluntaryTurnEnd(round);

    expect(ended.success).toBe(true);

    if (!ended.success) throw new Error("unreachable");

    expect(ended.turnEnd).toEqual({
      combatantId: "a",
      reason: "voluntary",
      actionsSpent: 1,
    });

    /* Three Actions survive: ending a Turn is not Inaction. */
    expect(findRoundCombatant(ended.round, "a")?.remainingActions).toBe(3);
    expect(ended.round.activeState).toEqual(turnState("b", 2));
  });

  it("refuses to end a Turn when a Reaction is active", () => {
    const reacting = setRoundActiveState(
      threeCombatantRound(),
      reactionState("c", "a"),
    );

    const result = resolveVoluntaryTurnEnd(reacting);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("active-state-not-turn");
  });

  it("refuses to end a Reaction when a Turn is active", () => {
    const result = resolveVoluntaryReactionEnd(threeCombatantRound());

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("active-state-not-reaction");
  });

  it("reports Round completion through a shared helper", () => {
    expect(didRoundComplete({ complete: true, round: threeCombatantRound() }))
      .toBe(true);
    expect(didRoundComplete({ complete: false, round: threeCombatantRound() }))
      .toBe(false);
  });
});


describe("movement is denominated per Round, not per state", () => {
  it("prices a Move against the ROUND capacity", () => {
    /*
     * 12 m of Round movement across a 4-Action Round is 3 m per Move. The
     * Turn cap does not appear in the arithmetic at all — which is what
     * stops a third Action per Turn from being a speed bonus.
     */
    const state = beginRoundMovement(12, 4);

    expect(state.allowance.moveDistanceMeters).toBeCloseTo(3, 10);
    expect(state.allowance.roundActionCapacity).toBe(4);
  });

  it("draws a Reaction's Move from the same allowance as a Turn's", () => {
    /*
     * The movement model has no notion of Turn or Reaction — there is ONE
     * allowance per Round, and every Move spends from it. A Move taken
     * while reacting is therefore a Move not available later in a Turn,
     * which is the shared-allowance rule stated from the other side.
     */
    const opened = beginRoundMovement(12, 4);

    const duringTurn = spendMove(opened);

    expect(duringTurn.refusal).toBeNull();
    expect(duringTurn.distanceMeters).toBeCloseTo(3, 10);

    const duringReaction = spendMove(duringTurn.state);

    expect(duringReaction.refusal).toBeNull();
    expect(duringReaction.state.movesSpent).toBe(2);
    expect(duringReaction.state.remainingMeters).toBeCloseTo(6, 10);
  });
});
