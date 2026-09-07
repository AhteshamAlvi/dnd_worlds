/*
 * Characterization: structural validation of a Combat and its Round.
 *
 * This layer checks that a Round is internally CONSISTENT — that the active
 * state names a combatant who exists, that Initiative agrees with the
 * participant list, that spent Actions could actually have been spent. It
 * decides no rules; it catches states no legal sequence could have produced.
 */

import { describe, expect, it } from "vitest";

import {
  findActiveCombatStateValidationIssues,
  findCombatRoundValidationIssues,
  findCombatValidationIssues,
  findCombatantRoundStateValidationIssues,
  findInitiativeValidationIssues,
  findReactionStateValidationIssues,
  findTurnStateValidationIssues,
  isCombatRoundValid,
  isCombatValid,
  isInitiativeOrderSorted,
  type CombatRound,
} from "../gameplay/combat";
import {
  initiative,
  reactionState,
  roundState,
  threeCombatantRound,
  turnState,
} from "./fixtures/combat";

function codesOf(issues: readonly { readonly code: string }[]) {
  return issues.map((issue) => issue.code);
}

function withState(
  round: CombatRound,
  activeState: CombatRound["activeState"],
): CombatRound {
  return { ...round, activeState };
}


describe("a Round produced by the module validates", () => {
  it("accepts a freshly started Round", () => {
    const round = threeCombatantRound();

    expect(findCombatRoundValidationIssues(round)).toEqual([]);
    expect(isCombatRoundValid(round)).toBe(true);
  });

  it("accepts a Combat wrapping that Round", () => {
    const round = threeCombatantRound();

    const combat = {
      combatantIds: ["a", "b", "c"],
      round,
    };

    expect(findCombatValidationIssues(combat)).toEqual([]);
    expect(isCombatValid(combat)).toBe(true);
  });

  it("accepts a Combat that has not started a Round yet", () => {
    expect(isCombatValid({ combatantIds: ["a"], round: null })).toBe(true);
  });
});


describe("combatant Round state", () => {
  it("rejects invalid capacities and remaining Actions", () => {
    expect(codesOf(findCombatantRoundStateValidationIssues(
      roundState("a", 4, { round: 0 }),
    ))).toContain("combat.round.capacity.round-invalid");

    expect(codesOf(findCombatantRoundStateValidationIssues(
      roundState("a", 4, { turn: 0 }),
    ))).toContain("combat.round.capacity.turn-invalid");

    expect(codesOf(findCombatantRoundStateValidationIssues(
      roundState("a", 4, { reaction: 0 }),
    ))).toContain("combat.round.capacity.reaction-invalid");
  });

  it("rejects a pool larger than the capacity it came from", () => {
    /*
     * Actions are only ever spent, never granted, so a remaining count above
     * the Round capacity is a state no sequence could produce.
     */
    expect(codesOf(findCombatantRoundStateValidationIssues(
      roundState("a", 99),
    ))).toContain("combat.round.remaining-actions-invalid");
  });

  it("rejects a negative pool", () => {
    expect(codesOf(findCombatantRoundStateValidationIssues(
      roundState("a", -1),
    ))).toContain("combat.round.remaining-actions-invalid");
  });

  it("accepts an exactly empty pool", () => {
    expect(findCombatantRoundStateValidationIssues(roundState("a", 0)))
      .toEqual([]);
  });
});


describe("Initiative consistency", () => {
  const round = threeCombatantRound();

  it("requires descending order", () => {
    expect(isInitiativeOrderSorted(round)).toBe(true);

    expect(isInitiativeOrderSorted({
      ...round,
      initiative: [
        { combatantId: "a", value: 1 },
        { combatantId: "b", value: 9 },
        { combatantId: "c", value: 3 },
      ],
    })).toBe(false);
  });

  it("reports an unsorted order as an issue", () => {
    expect(codesOf(findInitiativeValidationIssues({
      ...round,
      initiative: [
        { combatantId: "a", value: 1 },
        { combatantId: "b", value: 9 },
        { combatantId: "c", value: 3 },
      ],
    }))).toContain("combat.round.initiative.unsorted");
  });

  it("maps the Initiative module's own issues into Combat codes", () => {
    expect(codesOf(findInitiativeValidationIssues({
      ...round,
      initiative: [
        { combatantId: "a", value: 5 },
        { combatantId: "b", value: 5 },
        { combatantId: "c", value: 1 },
      ],
    }))).toContain("combat.round.initiative.tie");

    expect(codesOf(findInitiativeValidationIssues({
      ...round,
      initiative: initiative("a", "b"),
    }))).toContain("combat.round.initiative.entry-combatant-missing");
  });

  it("rejects an out-of-range Initiative position", () => {
    const round = threeCombatantRound();

    expect(codesOf(findCombatRoundValidationIssues({
      ...round,
      initiativeIndex: 9,
    }))).toContain("combat.round.initiative-index.invalid");
  });
});


describe("the active Turn must be coherent with the Round", () => {
  const round = threeCombatantRound();

  it("rejects a Turn for a combatant not in the Round", () => {
    expect(codesOf(findTurnStateValidationIssues(turnState("z"), round)))
      .toContain("combat.round.turn.combatant-unknown");
  });

  it("rejects a Turn that disagrees with the Initiative position", () => {
    /*
     * The Turn belongs to whoever Initiative currently points at. A Turn for
     * someone else means the rotation and the active state have diverged.
     */
    expect(codesOf(findTurnStateValidationIssues(turnState("b"), round)))
      .toContain("combat.round.turn.initiative-mismatch");
  });

  it("rejects a cap that is not the combatant's own", () => {
    expect(codesOf(findTurnStateValidationIssues(turnState("a", 5), round)))
      .toContain("combat.round.turn.action-cap-mismatch");

    expect(codesOf(findTurnStateValidationIssues(turnState("a", 0), round)))
      .toContain("combat.round.turn.action-cap-invalid");
  });

  it("rejects spending more than the cap allowed", () => {
    expect(codesOf(findTurnStateValidationIssues(turnState("a", 2, 3), round)))
      .toContain("combat.round.turn.actions-spent-invalid");
  });

  it("rejects spending more than the pool could have paid for", () => {
    /*
     * The pool and the spent count have to add up. A Turn claiming two spent
     * Actions against a combatant who still has their whole Round is a
     * ledger that does not balance.
     */
    expect(codesOf(findTurnStateValidationIssues(turnState("a", 2, 2), round)))
      .toContain("combat.round.turn.actions-spent-impossible");
  });
});


describe("the active Reaction must be coherent with the Round", () => {
  const round = threeCombatantRound();

  function issues(state: ReturnType<typeof reactionState>) {
    return codesOf(findReactionStateValidationIssues(state, round));
  }

  it("rejects unknown reacting or triggering combatants", () => {
    expect(issues(reactionState("z", "a")))
      .toContain("combat.round.reaction.reacting-combatant-unknown");

    expect(issues(reactionState("c", "z")))
      .toContain("combat.round.reaction.triggering-combatant-unknown");
  });

  it("rejects a combatant reacting to themselves", () => {
    expect(issues(reactionState("a", "a")))
      .toContain("combat.round.reaction.self-reaction");
  });

  it("requires Initiative to still point at the interrupted combatant", () => {
    /*
     * The mirror of the Round rule: entering a Reaction does not move the
     * Initiative position, so a Reaction whose trigger is not the current
     * entry means the position moved when it should not have.
     */
    expect(issues(reactionState("c", "b")))
      .toContain("combat.round.reaction.initiative-mismatch");
  });

  it("rejects a cap that is not the reactor's own", () => {
    expect(issues(reactionState("c", "a", 9)))
      .toContain("combat.round.reaction.action-cap-mismatch");
  });

  it("requires the triggering Action to be identified", () => {
    expect(codesOf(findReactionStateValidationIssues(
      {
        ...reactionState("c", "a"),
        trigger: { kind: "action", actionId: "  ", actorCombatantId: "a" },
      },
      round,
    ))).toContain("combat.round.reaction.triggering-action-id-empty");
  });
});


describe("the active state dispatches by kind", () => {
  const round = threeCombatantRound();

  it("accepts a valid Turn and a valid Reaction, dispatching by kind", () => {
    expect(findActiveCombatStateValidationIssues(turnState("a", 2), round))
      .toEqual([]);

    expect(findActiveCombatStateValidationIssues(reactionState("c", "a", 1), round))
      .toEqual([]);
  });

  it("accepts a Round with no active state at all", () => {
    expect(findCombatRoundValidationIssues(withState(round, null))).toEqual([]);
  });

  it("surfaces a bad active state through whole-Round validation", () => {
    expect(codesOf(findCombatRoundValidationIssues(
      withState(round, turnState("z")),
    ))).toContain("combat.round.turn.combatant-unknown");
  });
});


describe("Combat-level participation", () => {
  it("rejects an empty or malformed participant list", () => {
    expect(codesOf(findCombatValidationIssues({ combatantIds: [], round: null })))
      .toContain("combat.combatants.empty");

    expect(codesOf(findCombatValidationIssues({
      combatantIds: ["a", "a"],
      round: null,
    }))).toContain("combat.combatant-id.duplicate");

    expect(codesOf(findCombatValidationIssues({
      combatantIds: ["  "],
      round: null,
    }))).toContain("combat.combatant-id.empty");
  });

  it("requires the Round's combatants to match the encounter's", () => {
    const round = threeCombatantRound();

    expect(codesOf(findCombatValidationIssues({
      combatantIds: ["a", "b", "c", "d"],
      round,
    }))).toContain("combat.round.combatant-missing");

    expect(codesOf(findCombatValidationIssues({
      combatantIds: ["a", "b"],
      round,
    }))).toContain("combat.round.combatant-unknown");
  });
});
