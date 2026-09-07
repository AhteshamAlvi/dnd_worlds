/*
 * Characterization: Initiative ordering, eligibility and rotation.
 *
 * The behaviour worth reading closely is the tie refusal. No tie-breaking
 * rule has been settled, so equal values are surfaced as an unresolved
 * issue rather than ordered by array position — which means a host that
 * supplies two equal rolls cannot start a Round at all.
 */

import { describe, expect, it } from "vitest";

import {
  INITIATIVE_ISSUE_CODES,
  findFirstEligibleInitiativeIndex,
  findInitiativeEntry,
  findInitiativeEntryIssues,
  findInitiativeIndex,
  findInitiativeTieIssues,
  findInitiativeTies,
  findNextEligibleInitiativeEntry,
  findNextEligibleInitiativeIndex,
  hasInitiativeEligibleCombatant,
  isInitiativeEligible,
  resolveInitiativeOrder,
} from "../gameplay/combat";
import { roundState } from "./fixtures/combat";

const ABC = ["a", "b", "c"] as const;

function entries(
  ...values: readonly (readonly [string, number])[]
) {
  return values.map(([combatantId, value]) => ({ combatantId, value }));
}

function codesOf(issues: readonly { readonly code: string }[]) {
  return issues.map((issue) => issue.code);
}


describe("Initiative entry validation", () => {
  it("declares seven issue codes", () => {
    expect([...INITIATIVE_ISSUE_CODES]).toEqual([
      "combatants-empty",
      "combatant-id-duplicate",
      "entry-combatant-duplicate",
      "entry-combatant-unknown",
      "entry-combatant-missing",
      "entry-value-invalid",
      "initiative-tie",
    ]);
  });

  it("stops at an empty combatant list rather than reporting more", () => {
    const issues = findInitiativeEntryIssues([], entries(["a", 10]));

    expect(codesOf(issues)).toEqual(["combatants-empty"]);
  });

  it("reports duplicate combatants, duplicate entries, and both at once", () => {
    expect(codesOf(findInitiativeEntryIssues(["a", "a"], entries(["a", 10]))))
      .toContain("combatant-id-duplicate");

    expect(codesOf(findInitiativeEntryIssues(
      ["a", "b"],
      entries(["a", 10], ["a", 9], ["b", 8]),
    ))).toContain("entry-combatant-duplicate");
  });

  it("reports an entry for somebody not in the fight", () => {
    expect(codesOf(findInitiativeEntryIssues(
      ["a"],
      entries(["a", 10], ["z", 9]),
    ))).toContain("entry-combatant-unknown");
  });

  it("requires an entry for every participant", () => {
    expect(codesOf(findInitiativeEntryIssues(
      [...ABC],
      entries(["a", 10], ["b", 9]),
    ))).toContain("entry-combatant-missing");
  });

  it("requires finite values", () => {
    expect(codesOf(findInitiativeEntryIssues(
      ["a"],
      entries(["a", Number.NaN]),
    ))).toContain("entry-value-invalid");

    expect(codesOf(findInitiativeEntryIssues(
      ["a"],
      entries(["a", Number.POSITIVE_INFINITY]),
    ))).toContain("entry-value-invalid");
  });

  it("accepts a well-formed set", () => {
    expect(findInitiativeEntryIssues(
      [...ABC],
      entries(["a", 12], ["b", 9], ["c", 3]),
    )).toEqual([]);
  });
});


describe("ties are refused rather than broken", () => {
  it("groups equal values, ignoring singletons", () => {
    const ties = findInitiativeTies(entries(["a", 10], ["b", 10], ["c", 3]));

    expect(ties).toHaveLength(1);
    expect(ties[0]?.map((entry) => entry.combatantId)).toEqual(["a", "b"]);
  });

  it("names the tied value in the issue", () => {
    const issues = findInitiativeTieIssues(entries(["a", 10], ["b", 10]));

    expect(issues[0]?.code).toBe("initiative-tie");
    expect(issues[0]?.combatantIds).toEqual(["a", "b"]);
    expect(issues[0]?.message).toContain("10");
  });

  it("refuses to resolve an order containing a tie", () => {
    /*
     * No tie-breaking rule is settled, so array position is not used as a
     * silent fallback. The practical consequence is that a host supplying
     * two equal rolls cannot start the Round until it re-rolls or breaks
     * the tie itself.
     */
    const resolution = resolveInitiativeOrder(
      [...ABC],
      entries(["a", 10], ["b", 10], ["c", 3]),
    );

    expect(resolution.success).toBe(false);

    if (resolution.success) throw new Error("unreachable");

    expect(codesOf(resolution.issues)).toEqual(["initiative-tie"]);
  });

  it("reports structural problems before ties", () => {
    const resolution = resolveInitiativeOrder(
      ["a", "b"],
      entries(["a", 10], ["b", 10], ["z", 1]),
    );

    if (resolution.success) throw new Error("unreachable");

    expect(codesOf(resolution.issues)).toContain("entry-combatant-unknown");
    expect(codesOf(resolution.issues)).not.toContain("initiative-tie");
  });
});


describe("resolved order", () => {
  it("sorts from highest to lowest", () => {
    const resolution = resolveInitiativeOrder(
      [...ABC],
      entries(["c", 3], ["a", 12], ["b", 9]),
    );

    if (!resolution.success) throw new Error("unreachable");

    expect(resolution.order.map((entry) => entry.combatantId))
      .toEqual(["a", "b", "c"]);
  });

  it("finds an entry and its position", () => {
    const order = entries(["a", 12], ["b", 9]);

    expect(findInitiativeEntry(order, "b")?.value).toBe(9);
    expect(findInitiativeEntry(order, "z")).toBeUndefined();
    expect(findInitiativeIndex(order, "b")).toBe(1);
    expect(findInitiativeIndex(order, "z")).toBeNull();
  });
});


describe("eligibility follows the Round pool, not the Turn cap", () => {
  it("stays eligible while any Round Action remains", () => {
    const combatants = [roundState("a", 1), roundState("b", 0)];

    expect(isInitiativeEligible("a", combatants)).toBe(true);
    expect(isInitiativeEligible("b", combatants)).toBe(false);
    expect(isInitiativeEligible("z", combatants)).toBe(false);
  });

  it("reports whether anyone at all can still act", () => {
    const order = entries(["a", 12], ["b", 9]);

    expect(hasInitiativeEligibleCombatant(
      order,
      [roundState("a", 0), roundState("b", 1)],
    )).toBe(true);

    expect(hasInitiativeEligibleCombatant(
      order,
      [roundState("a", 0), roundState("b", 0)],
    )).toBe(false);
  });

  it("finds the first eligible position, skipping the exhausted", () => {
    const order = entries(["a", 12], ["b", 9], ["c", 3]);

    expect(findFirstEligibleInitiativeIndex(
      order,
      [roundState("a", 0), roundState("b", 2), roundState("c", 2)],
    )).toBe(1);

    expect(findFirstEligibleInitiativeIndex(
      order,
      [roundState("a", 0), roundState("b", 0), roundState("c", 0)],
    )).toBeNull();
  });
});


describe("rotation wraps and skips", () => {
  const order = entries(["a", 12], ["b", 9], ["c", 3]);

  const all = (remaining: number) =>
    ABC.map((id) => roundState(id, remaining));

  it("advances to the next position", () => {
    expect(findNextEligibleInitiativeIndex(order, 0, all(2))).toBe(1);
  });

  it("wraps past the end of the order", () => {
    expect(findNextEligibleInitiativeIndex(order, 2, all(2))).toBe(0);
  });

  it("skips combatants with nothing left", () => {
    expect(findNextEligibleInitiativeIndex(
      order,
      0,
      [roundState("a", 2), roundState("b", 0), roundState("c", 2)],
    )).toBe(2);
  });

  it("returns to the SAME combatant when they are the only one left", () => {
    /*
     * The wrap deliberately includes the current position. A combatant with
     * Round Actions left keeps receiving Turns after everyone else has run
     * out, which is what makes a Round end on exhausted Actions rather than
     * on one Turn each.
     */
    expect(findNextEligibleInitiativeIndex(
      order,
      0,
      [roundState("a", 2), roundState("b", 0), roundState("c", 0)],
    )).toBe(0);
  });

  it("returns null only when nobody can act", () => {
    expect(findNextEligibleInitiativeIndex(order, 0, all(0))).toBeNull();
  });

  it("returns null for an out-of-range or empty starting position", () => {
    expect(findNextEligibleInitiativeIndex(order, -1, all(2))).toBeNull();
    expect(findNextEligibleInitiativeIndex(order, 3, all(2))).toBeNull();
    expect(findNextEligibleInitiativeIndex(order, 1.5, all(2))).toBeNull();
    expect(findNextEligibleInitiativeIndex([], 0, all(2))).toBeNull();
  });

  it("offers the entry as well as the index", () => {
    expect(findNextEligibleInitiativeEntry(order, 0, all(2))?.combatantId)
      .toBe("b");
    expect(findNextEligibleInitiativeEntry(order, 0, all(0))).toBeNull();
  });
});
