/*
 * Characterization: the Combat Action economy.
 *
 * Written against the EXISTING implementation, before any refactor, and
 * describing what it does rather than what it ought to. Where current
 * behaviour looks like it contradicts a settled rule, the test still pins
 * the behaviour and the comment says so — a characterization suite that
 * quietly asserts the desired rule instead of the real one is worse than
 * none, because the refactor it is supposed to protect will "fix" the
 * discrepancy without anybody deciding to.
 */

import { describe, expect, it } from "vitest";

import {
  ACTION_SPEND_FAILURE_REASONS,
  HESITATION_ACTION_COST,
  INACTION_ACTION_COST,
  actionsSpentInState,
  activeStateCombatantId,
  canAffordRoundActionCost,
  canSpendCombatAction,
  createHesitationAction,
  createInactionAction,
  findActionSpendFailure,
  hasExhaustedRoundActions,
  hasReachedStateActionCap,
  isValidActionCost,
  remainingStateActions,
  spendCombatAction,
  spendHesitation,
  spendInaction,
} from "../gameplay/combat";
import {
  reactionState,
  roundState,
  skillAction,
  turnState,
} from "./fixtures/combat";


describe("active-state helpers", () => {
  it("names the combatant permitted to act in each state kind", () => {
    expect(activeStateCombatantId(turnState("a"))).toBe("a");
    expect(activeStateCombatantId(reactionState("c", "a"))).toBe("c");
  });

  it("reports Actions spent in the state, not in the Round", () => {
    expect(actionsSpentInState(turnState("a", 2, 1))).toBe(1);
  });

  it("floors remaining state Actions at zero when the cap is overshot", () => {
    expect(remainingStateActions(turnState("a", 2, 5))).toBe(0);
    expect(hasReachedStateActionCap(turnState("a", 2, 5))).toBe(true);
  });
});


describe("Round-Action helpers", () => {
  it("treats zero and negative remaining Actions as exhausted", () => {
    expect(hasExhaustedRoundActions(roundState("a", 1))).toBe(false);
    expect(hasExhaustedRoundActions(roundState("a", 0))).toBe(true);
    expect(hasExhaustedRoundActions(roundState("a", -1))).toBe(true);
  });

  it("requires a positive whole cost that the pool can cover", () => {
    const combatant = roundState("a", 2);

    expect(canAffordRoundActionCost(combatant, 2)).toBe(true);
    expect(canAffordRoundActionCost(combatant, 3)).toBe(false);
    expect(canAffordRoundActionCost(combatant, 0)).toBe(false);
    expect(canAffordRoundActionCost(combatant, -1)).toBe(false);
    expect(canAffordRoundActionCost(combatant, 1.5)).toBe(false);
  });

  it("rejects a zero cost, because a free Action is a Bonus Action", () => {
    expect(isValidActionCost(1)).toBe(true);
    expect(isValidActionCost(0)).toBe(false);
    expect(isValidActionCost(-1)).toBe(false);
    expect(isValidActionCost(1.5)).toBe(false);
    expect(isValidActionCost(Number.NaN)).toBe(false);
  });
});


describe("why an Action cannot be spent", () => {
  it("declares exactly four failure reasons", () => {
    expect([...ACTION_SPEND_FAILURE_REASONS]).toEqual([
      "invalid-action-cost",
      "wrong-combatant",
      "insufficient-round-actions",
      "state-action-cap-exceeded",
    ]);
  });

  it("reports an invalid cost before anything else", () => {
    expect(findActionSpendFailure(
      skillAction({ actionCost: 0, actorCombatantId: "b" }),
      roundState("a", 4),
      turnState("a"),
    )).toBe("invalid-action-cost");
  });

  it("rejects an Action whose actor is not the one acting", () => {
    expect(findActionSpendFailure(
      skillAction({ actorCombatantId: "b" }),
      roundState("a", 4),
      turnState("a"),
    )).toBe("wrong-combatant");
  });

  it("rejects a combatant state belonging to somebody else", () => {
    expect(findActionSpendFailure(
      skillAction({ actorCombatantId: "a" }),
      roundState("b", 4),
      turnState("a"),
    )).toBe("wrong-combatant");
  });

  it("rejects a cost the Round pool cannot cover", () => {
    expect(findActionSpendFailure(
      skillAction({ actionCost: 3 }),
      roundState("a", 2),
      turnState("a", 4),
    )).toBe("insufficient-round-actions");
  });

  it("rejects a cost the state cap cannot cover", () => {
    /* The pool is fine; this Turn simply has no room left. */
    expect(findActionSpendFailure(
      skillAction({ actionCost: 2 }),
      roundState("a", 4),
      turnState("a", 2, 1),
    )).toBe("state-action-cap-exceeded");
  });

  it("checks the Round pool before the state cap", () => {
    /* Both are short. The pool is reported. */
    expect(findActionSpendFailure(
      skillAction({ actionCost: 3 }),
      roundState("a", 2),
      turnState("a", 2),
    )).toBe("insufficient-round-actions");
  });

  it("returns null when the Action is affordable", () => {
    const action = skillAction();

    expect(findActionSpendFailure(action, roundState("a", 4), turnState("a")))
      .toBeNull();
    expect(canSpendCombatAction(action, roundState("a", 4), turnState("a")))
      .toBe(true);
  });
});


describe("spending an Action", () => {
  it("charges the Round pool and the state cap together", () => {
    const result = spendCombatAction(
      skillAction(),
      roundState("a", 4),
      turnState("a", 2),
    );

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(result.combatant.remainingActions).toBe(3);
    expect(result.state.actionsSpent).toBe(1);
  });

  it("charges a multi-Action cost to both, once", () => {
    const result = spendCombatAction(
      skillAction({ actionCost: 2 }),
      roundState("a", 4),
      turnState("a", 2),
    );

    if (!result.success) throw new Error("unreachable");

    expect(result.combatant.remainingActions).toBe(2);
    expect(result.state.actionsSpent).toBe(2);
  });

  it("spends from a Reaction against the same Round pool", () => {
    /*
     * The rule that makes Reactions cost something: a Reaction Action is
     * drawn from the combatant's Round allowance, not from a separate
     * Reaction budget. The cap only limits how many may be spent inside
     * this one Reaction.
     */
    const result = spendCombatAction(
      skillAction({ actorCombatantId: "c" }),
      roundState("c", 4),
      reactionState("c", "a"),
    );

    if (!result.success) throw new Error("unreachable");

    expect(result.combatant.remainingActions).toBe(3);
    expect(result.state.kind).toBe("reaction");
    expect(result.state.actionsSpent).toBe(1);
  });

  it("returns the inputs unchanged on failure", () => {
    const combatant = roundState("a", 0);
    const state = turnState("a");

    const result = spendCombatAction(skillAction(), combatant, state);

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("insufficient-round-actions");
    expect(result.combatant).toBe(combatant);
    expect(result.state).toBe(state);
  });

  it("mutates neither the combatant nor the state it was handed", () => {
    const combatant = roundState("a", 4);
    const state = turnState("a", 2);

    spendCombatAction(skillAction(), combatant, state);

    expect(combatant.remainingActions).toBe(4);
    expect(state.actionsSpent).toBe(0);
  });
});


describe("Bonus Actions are gone from the model", () => {
  it("cannot be attached to a Combat Action at all", () => {
    /*
     * CHANGED DELIBERATELY in 2B-4B. `bonusAction` was carried on every
     * Action and read by nothing: not validated, not counted, not limited.
     * It was dead data that read like a feature, and a wrapper that kept it
     * would have carried the same lie into the new model.
     *
     * It is removed rather than fixed. Authorization, limits, resolution and
     * cost semantics for Bonus Actions are a rules design nobody has done,
     * and inventing them inside a refactor is how an unowned mechanic gets
     * decided by accident.
     */
    const action = skillAction();

    expect(action).not.toHaveProperty("bonusAction");
    expect(Object.keys(action).sort()).toEqual([
      "actionCost",
      "actorCombatantId",
      "id",
      "intentId",
      "kind",
      "threatenedCombatantIds",
    ]);
  });
});


describe("Inaction and Hesitation", () => {
  it("both cost exactly one Action", () => {
    expect(INACTION_ACTION_COST).toBe(1);
    expect(HESITATION_ACTION_COST).toBe(1);
  });

  it("builds an Inaction that threatens nobody", () => {
    const action = createInactionAction("i-1", "a");

    expect(action).toEqual({
      kind: "combat-native",
      id: "i-1",
      actorCombatantId: "a",
      actionCost: 1,
      source: "inaction",
      threatenedCombatantIds: [],
    });
  });

  it("builds a Hesitation that is identical except for its source", () => {
    /*
     * The distinction is intent, not mechanics: Inaction is chosen and
     * Hesitation is a timeout the host reported. Both cost the same, and
     * the source is what a log reads to tell them apart.
     */
    const hesitation = createHesitationAction("h-1", "a");

    expect(hesitation.source).toBe("hesitation");
    expect(hesitation.kind).toBe("combat-native");
    expect(hesitation).not.toHaveProperty("intentId");
    expect(hesitation.actionCost).toBe(createInactionAction("i-1", "a").actionCost);
  });

  it("spends Inaction through the ordinary Action path", () => {
    const result = spendInaction("i-1", roundState("a", 4), turnState("a", 2));

    if (!result.success) throw new Error("unreachable");

    expect(result.combatant.remainingActions).toBe(3);
    expect(result.state.actionsSpent).toBe(1);
  });

  it("spends Hesitation through the ordinary Action path", () => {
    const result = spendHesitation("h-1", roundState("a", 4), turnState("a", 2));

    if (!result.success) throw new Error("unreachable");

    expect(result.combatant.remainingActions).toBe(3);
  });

  it("refuses Hesitation when no Action remains to lose", () => {
    /*
     * A combatant with an exhausted pool cannot hesitate: the timeout has
     * nothing to charge. The host is told why rather than the pool going
     * negative.
     */
    const result = spendHesitation("h-1", roundState("a", 0), turnState("a", 2));

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("insufficient-round-actions");
  });

  it("refuses Inaction once the state cap is reached", () => {
    const result = spendInaction("i-1", roundState("a", 4), turnState("a", 2, 2));

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("state-action-cap-exceeded");
  });
});
