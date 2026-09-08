/*
 * Characterization: the Round lifecycle.
 *
 * The rule this suite protects hardest: a Round does NOT end after everyone
 * has had one Turn. Initiative keeps rotating until every combatant's Round
 * Action pool is empty, so one combatant may take several Turns in a Round.
 */

import { describe, expect, it } from "vitest";

import {
  COMBAT_ROUND_DURATION_SECONDS,
  advanceToNextTurn,
  applyActionSpendToRound,
  continueAfterTurn,
  countRoundEligibleCombatants,
  createCombatantRoundState,
  createCombatantRoundStates,
  currentInitiativeCombatantId,
  currentInitiativeEntry,
  findRoundCombatant,
  isRoundComplete,
  isValidReactionActionCapacity,
  isValidRoundActionCapacity,
  isValidRoundNumber,
  isValidTurnActionCapacity,
  nextRoundNumber,
  replaceRoundCombatant,
  setInitiativePositionForCombatant,
  setRoundActiveState,
  startRound,
  activateReaction,
  type CombatRound,
} from "../gameplay/combat";
import { SECONDS_PER_COMBAT_ROUND } from "../time/duration";
import {
  capacity,
  combatantInput,
  initiative,
  reactionState,
  roundState,
  startedRound,
  threeCombatantRound,
  turnState,
} from "./fixtures/combat";

/** Drains a combatant's pool without going through the Action path. */
function drain(round: CombatRound, combatantId: string): CombatRound {
  const combatant = findRoundCombatant(round, combatantId);

  if (combatant === undefined) throw new Error("no such combatant");

  return replaceRoundCombatant(round, { ...combatant, remainingActions: 0 });
}


describe("a Round is two seconds, declared once", () => {
  it("re-exports the canonical constant rather than restating it", () => {
    expect(COMBAT_ROUND_DURATION_SECONDS).toBe(2);
    expect(COMBAT_ROUND_DURATION_SECONDS).toBe(SECONDS_PER_COMBAT_ROUND);
  });
});


describe("capacity validation", () => {
  it("requires positive whole numbers everywhere", () => {
    for (const check of [
      isValidRoundNumber,
      isValidRoundActionCapacity,
      isValidTurnActionCapacity,
      isValidReactionActionCapacity,
    ]) {
      expect(check(1)).toBe(true);
      expect(check(0)).toBe(false);
      expect(check(-1)).toBe(false);
      expect(check(1.5)).toBe(false);
    }
  });
});


describe("Round state is snapshotted at the start", () => {
  it("fills the pool from the Round capacity", () => {
    expect(createCombatantRoundState(combatantInput("a"))).toEqual({
      combatantId: "a",
      capacity: capacity(),
      remainingActions: 4,
    });
  });

  it("keeps the Turn and Reaction caps alongside it", () => {
    /*
     * Snapshotted rather than looked up later: the Round enforces the
     * capacities the character had when it began, so a Trait lost mid-Round
     * does not retroactively change what this Round allowed.
     */
    const states = createCombatantRoundStates([
      combatantInput("a", { turn: 3 }),
      combatantInput("b"),
    ]);

    expect(states[0]?.capacity.turn).toBe(3);
    expect(states[1]?.capacity.turn).toBe(2);
  });
});


describe("starting a Round", () => {
  it("begins with the first Initiative entry already in a Turn", () => {
    const round = threeCombatantRound();

    expect(round.number).toBe(1);
    expect(round.initiativeIndex).toBe(0);
    expect(round.initiative.map((entry) => entry.combatantId))
      .toEqual(["a", "b", "c"]);
    expect(round.activeState).toEqual(turnState("a", 2));
  });

  it("always starts at Initiative position 0, not at the highest roll", () => {
    /*
     * Equivalent today because resolveInitiativeOrder() sorts descending,
     * so position 0 IS the highest. Pinned because the two are separate
     * facts and a refactor could keep one while breaking the other.
     */
    const round = startedRound(
      [combatantInput("a"), combatantInput("b")],
      [{ combatantId: "a", value: 3 }, { combatantId: "b", value: 20 }],
    );

    expect(round.initiativeIndex).toBe(0);
    expect(currentInitiativeCombatantId(round)).toBe("b");
  });

  it("gives everyone a full pool", () => {
    const round = threeCombatantRound();

    expect(round.combatants.map((one) => one.remainingActions)).toEqual([4, 4, 4]);
  });

  it.each([
    ["round-number-invalid", 0, [combatantInput("a")]],
    ["combatants-empty", 1, []],
  ] as const)("refuses %s", (reason, roundNumber, inputs) => {
    const result = startRound(roundNumber, inputs, initiative("a"));

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe(reason);
  });

  it("refuses duplicate combatants, naming them", () => {
    const result = startRound(
      1,
      [combatantInput("a"), combatantInput("a")],
      initiative("a"),
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("combatant-id-duplicate");
    expect(result.combatantIds).toEqual(["a"]);
  });

  it.each([
    ["round-action-capacity-invalid", { round: 0 }],
    ["turn-action-capacity-invalid", { turn: 0 }],
    ["reaction-action-capacity-invalid", { reaction: 0 }],
  ] as const)("refuses %s, naming the combatant", (reason, override) => {
    const result = startRound(
      1,
      [combatantInput("a", override)],
      initiative("a"),
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe(reason);
    expect(result.combatantIds).toEqual(["a"]);
  });

  it("refuses invalid Initiative, carrying the issues through", () => {
    const result = startRound(
      1,
      [combatantInput("a"), combatantInput("b")],
      [{ combatantId: "a", value: 5 }, { combatantId: "b", value: 5 }],
    );

    if (result.success) throw new Error("unreachable");

    expect(result.reason).toBe("initiative-invalid");
    expect(result.initiativeIssues?.map((issue) => issue.code))
      .toEqual(["initiative-tie"]);
  });
});


describe("Round bookkeeping", () => {
  it("finds and replaces one combatant immutably", () => {
    const round = threeCombatantRound();
    const updated = replaceRoundCombatant(round, roundState("b", 1));

    expect(findRoundCombatant(updated, "b")?.remainingActions).toBe(1);
    expect(findRoundCombatant(round, "b")?.remainingActions).toBe(4);
    expect(updated).not.toBe(round);
  });

  it("returns undefined for a combatant not in the Round", () => {
    expect(findRoundCombatant(threeCombatantRound(), "z")).toBeUndefined();
  });

  it("replaces the active state without touching anything else", () => {
    const round = threeCombatantRound();
    const cleared = setRoundActiveState(round, null);

    expect(cleared.activeState).toBeNull();
    expect(cleared.initiativeIndex).toBe(round.initiativeIndex);
    expect(cleared.combatants).toBe(round.combatants);
  });

  it("applies a spend to the combatant and the state at once", () => {
    const round = threeCombatantRound();

    const updated = applyActionSpendToRound(
      round,
      roundState("a", 3),
      turnState("a", 2, 1),
    );

    expect(findRoundCombatant(updated, "a")?.remainingActions).toBe(3);
    expect(updated.activeState).toEqual(turnState("a", 2, 1));
  });

  it("reports the current Initiative position, or null when out of range", () => {
    const round = threeCombatantRound();

    expect(currentInitiativeEntry(round)?.combatantId).toBe("a");
    expect(currentInitiativeCombatantId({ ...round, initiativeIndex: 9 }))
      .toBeNull();
    expect(currentInitiativeEntry({ ...round, initiativeIndex: -1 })).toBeNull();
  });

  it("moves the Initiative position onto a named combatant", () => {
    const round = threeCombatantRound();

    expect(setInitiativePositionForCombatant(round, "c")?.initiativeIndex).toBe(2);
    expect(setInitiativePositionForCombatant(round, "z")).toBeNull();
  });

  it("numbers the next Round without creating it", () => {
    expect(nextRoundNumber(threeCombatantRound())).toBe(2);
  });
});


describe("a Round ends on exhausted Actions, not on one Turn each", () => {
  it("is incomplete while anyone has an Action left", () => {
    const round = threeCombatantRound();

    expect(isRoundComplete(round)).toBe(false);
    expect(countRoundEligibleCombatants(round)).toBe(3);

    const partly = drain(drain(round, "a"), "b");

    expect(isRoundComplete(partly)).toBe(false);
    expect(countRoundEligibleCombatants(partly)).toBe(1);
  });

  it("is complete once every pool is empty", () => {
    const drained = ["a", "b", "c"].reduce(drain, threeCombatantRound());

    expect(isRoundComplete(drained)).toBe(true);
    expect(countRoundEligibleCombatants(drained)).toBe(0);
  });

  it("gives one combatant several Turns while others are spent", () => {
    /*
     * The rotation returns to the same combatant once everybody else is
     * out. This is why a Round is an Action budget rather than a lap.
     */
    const round = drain(drain(threeCombatantRound(), "b"), "c");

    const next = advanceToNextTurn(round);

    expect(next.complete).toBe(false);
    expect(next.round.initiativeIndex).toBe(0);
    expect(next.round.activeState).toEqual(turnState("a", 2));
  });
});


describe("advancing between Turns", () => {
  it("moves to the next eligible combatant and starts their Turn", () => {
    const next = advanceToNextTurn(threeCombatantRound());

    expect(next.complete).toBe(false);
    expect(next.round.initiativeIndex).toBe(1);
    expect(next.round.activeState).toEqual(turnState("b", 2));
  });

  it("skips a combatant with nothing left", () => {
    const round = drain(threeCombatantRound(), "b");
    const next = advanceToNextTurn(round);

    expect(next.round.initiativeIndex).toBe(2);
    expect(next.round.activeState).toEqual(turnState("c", 2));
  });

  it("completes the Round and clears the active state", () => {
    const drained = ["a", "b", "c"].reduce(drain, threeCombatantRound());
    const next = advanceToNextTurn(drained);

    expect(next.complete).toBe(true);
    expect(next.round.activeState).toBeNull();
  });

  it("continues after a Turn by clearing state first, then advancing", () => {
    const next = continueAfterTurn(threeCombatantRound());

    expect(next.round.activeState).toEqual(turnState("b", 2));
  });
});


describe("a Reaction does not move the Initiative position", () => {
  it("leaves initiativeIndex on the interrupted Turn", () => {
    const round = threeCombatantRound();
    const reacting = activateReaction(round, reactionState("c", "a"));

    expect(reacting.activeState?.kind).toBe("reaction");
    expect(reacting.initiativeIndex).toBe(0);
  });

  it("resumes AFTER the interrupted combatant, never back into their Turn", () => {
    /*
     * A -> B -> C, A's Turn interrupted by C's Reaction. When the Reaction
     * closes, the Round advances to B — not back to A, and not on to a
     * second C Turn.
     *
     * The Reaction is closed through the queue now; continueAfterReaction()
     * is gone, because clearing the active state and advancing was a second
     * way to end a Reaction that left the queue believing it was still
     * running. advanceToNextTurn() on a cleared Round is what the queue
     * itself calls at this point, and the rule it demonstrates is unchanged.
     */
    const round = activateReaction(threeCombatantRound(), reactionState("c", "a"));

    const next = advanceToNextTurn(setRoundActiveState(round, null));

    expect(next.complete).toBe(false);
    expect(next.round.initiativeIndex).toBe(1);
    expect(next.round.activeState).toEqual(turnState("b", 2));
  });

  it("completes the Round if the Reaction emptied the last pool", () => {
    const drained = ["a", "b", "c"].reduce(
      drain,
      activateReaction(threeCombatantRound(), reactionState("c", "a")),
    );

    expect(advanceToNextTurn(setRoundActiveState(drained, null)).complete)
      .toBe(true);
  });
});
