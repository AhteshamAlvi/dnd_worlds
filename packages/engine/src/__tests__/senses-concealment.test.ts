/*
 * Concealment — the difficulty of acquiring information about something.
 *
 * Two properties carry the design and are easy to break by accident:
 *
 *  - passive Concealment READS the resolved profile's stored base rather than
 *    recomputing DEX + WIS. One formula, one place.
 *  - an established attempt retains ONE die across every sensory route. You
 *    hid once; you do not get a fresh roll per sense that looks for you.
 */

import { describe, expect, it } from "vitest";

import { resolvePassiveConcealment } from "../character/foundation/senses/concealment/passive";
import { resolveConcealmentCheck } from "../character/foundation/senses/concealment/resolution";
import {
  establishConcealment,
  shouldRerollEstablishedConcealment,
} from "../character/foundation/senses/concealment/established";
import { findConcealmentRequestIssues } from "../character/foundation/senses/concealment/validation";
import type {
  ConcealmentRequest,
} from "../character/foundation/senses/concealment/types";

import {
  PASSIVE_CONCEALMENT_BASE,
  roll,
  route,
  sensoryProfile,
  sensoryStats,
  source,
} from "./fixtures/senses";

const SIGHT = route();
const HEARING = route({ sense: "hearing" });

/* Concealment Derived Attribute: round((DEX 12 + WIS 14) / 2) = 13 -> +1. */
const CONCEALMENT_MODIFIER = 1;

function characterBasis() {
  return {
    kind: "character" as const,
    stats: sensoryStats(),
    profile: sensoryProfile(),
  };
}

function hearingOnly(amount: number) {
  return {
    source: source("muffled-step"),
    scope: {
      kind: "concealment" as const,
      sense: { kind: "specific" as const, sense: "hearing" as const },
    },
    amount,
    channel: "persistent" as const,
  };
}


describe("passive Concealment", () => {
  it("is DEX modifier + WIS modifier with no modifiers in play", () => {
    const result = resolvePassiveConcealment({
      mode: "passive",
      basis: characterBasis(),
      routes: [SIGHT],
    });

    expect(result.ratings[0]!.total).toBe(PASSIVE_CONCEALMENT_BASE);
    expect(result.ratings[0]!.mode).toBe("passive");
  });

  it("does not roll", () => {
    const result = resolvePassiveConcealment({
      mode: "passive",
      basis: characterBasis(),
      routes: [SIGHT],
    });

    expect(result.ratings[0]!.check).toBeUndefined();
    expect(result.sharedDice).toBeUndefined();
  });

  it("consumes the profile's stored base rather than recomputing it", () => {
    /*
     * The point of the assertion: a profile whose stored base disagrees with
     * what DEX + WIS would produce must win. If this resolver ever goes back
     * to deriving the number itself, this is the test that notices.
     */
    const profile = sensoryProfile();
    const restated = { ...profile, passiveConcealmentBase: 99 };

    const result = resolvePassiveConcealment({
      mode: "passive",
      basis: { kind: "character", stats: sensoryStats(), profile: restated },
      routes: [SIGHT],
    });

    expect(profile.passiveConcealmentBase).toBe(PASSIVE_CONCEALMENT_BASE);
    expect(result.ratings[0]!.total).toBe(99);
  });

  it("layers route-specific persistent modifiers on top, per route", () => {
    const result = resolvePassiveConcealment({
      mode: "passive",
      basis: characterBasis(),
      routes: [SIGHT, HEARING],
      modifiers: [hearingOnly(3)],
    });

    expect(result.ratings[0]!.total).toBe(PASSIVE_CONCEALMENT_BASE);
    expect(result.ratings[1]!.total).toBe(PASSIVE_CONCEALMENT_BASE + 3);
  });

  it("is reachable through the general resolver", () => {
    const result = resolveConcealmentCheck({
      mode: "passive",
      basis: characterBasis(),
      routes: [SIGHT],
    });

    expect(result.mode).toBe("passive");
    expect(result.ratings[0]!.total).toBe(PASSIVE_CONCEALMENT_BASE);
  });

  it("rejects an authored-information basis", () => {
    expect(() =>
      resolvePassiveConcealment({
        mode: "passive",
        basis: { kind: "authored-information", baseModifier: 4 },
        routes: [SIGHT],
      })
    ).toThrow(RangeError);
  });
});


describe("established Concealment", () => {
  it("retains one die across every sensory route", () => {
    const result = establishConcealment({
      basis: characterBasis(),
      routes: [SIGHT, HEARING],
      dice: roll(13),
    });

    const retained = result.ratings.map(
      (rating) => rating.check?.dice.retainedRoll,
    );

    expect(retained).toEqual([13, 13]);
    expect(result.sharedDice?.retainedRoll).toBe(13);
  });

  it("scores each route from that one die plus the Concealment modifier", () => {
    const result = establishConcealment({
      basis: characterBasis(),
      routes: [SIGHT, HEARING],
      dice: roll(13),
    });

    for (const rating of result.ratings) {
      expect(rating.total).toBe(13 + CONCEALMENT_MODIFIER);
    }
  });

  it("still resolves route modifiers independently on that shared die", () => {
    const result = establishConcealment({
      basis: characterBasis(),
      routes: [SIGHT, HEARING],
      dice: roll(13),
      modifiers: [hearingOnly(3)],
    });

    expect(result.ratings[0]!.total).toBe(14);
    expect(result.ratings[1]!.total).toBe(17);
    expect(result.ratings[0]!.check?.dice.retainedRoll)
      .toBe(result.ratings[1]!.check?.dice.retainedRoll);
  });

  it("is tagged established on every rating", () => {
    const result = establishConcealment({
      basis: characterBasis(),
      routes: [SIGHT, HEARING],
      dice: roll(13),
    });

    expect(result.mode).toBe("established");
    expect(result.ratings.map((rating) => rating.mode))
      .toEqual(["established", "established"]);
  });

  it("is rerolled only on a new attempt, a reconstruction, or a changed method", () => {
    expect(shouldRerollEstablishedConcealment({ newAttempt: true })).toBe(true);
    expect(shouldRerollEstablishedConcealment({ deliberateReconstruction: true })).toBe(true);
    expect(shouldRerollEstablishedConcealment({ methodMateriallyChanged: true })).toBe(true);
    expect(shouldRerollEstablishedConcealment({})).toBe(false);
    expect(shouldRerollEstablishedConcealment({ newAttempt: false })).toBe(false);
  });
});


describe("active Concealment", () => {
  it("rolls the Concealment Derived Attribute", () => {
    const result = resolveConcealmentCheck({
      mode: "active",
      basis: characterBasis(),
      routes: [SIGHT],
      dice: roll(9),
    });

    expect(result.ratings[0]!.total).toBe(9 + CONCEALMENT_MODIFIER);
  });

  it("requires dice", () => {
    expect(() =>
      resolveConcealmentCheck({
        mode: "active",
        basis: characterBasis(),
        routes: [SIGHT],
      })
    ).toThrow(RangeError);
  });
});


describe("authored-information Concealment", () => {
  it("sums the authored base with its named factors", () => {
    const request: ConcealmentRequest = {
      mode: "established",
      basis: {
        kind: "authored-information",
        baseModifier: 4,
        factors: [
          { kind: "age", amount: 2, sourceId: "decade-old" },
          { kind: "faintness", amount: 1, sourceId: "washed-out" },
        ],
      },
      routes: [SIGHT],
      dice: roll(10),
    };

    expect(resolveConcealmentCheck(request).ratings[0]!.total).toBe(10 + 4 + 2 + 1);
  });
});


describe("validation", () => {
  it("reports an empty route list", () => {
    const issues = findConcealmentRequestIssues({
      mode: "passive",
      basis: characterBasis(),
      routes: [],
    });

    expect(issues.map((issue) => issue.type)).toContain("route-missing");
  });

  it("reports missing dice for a rolling mode", () => {
    const issues = findConcealmentRequestIssues({
      mode: "established",
      basis: characterBasis(),
      routes: [SIGHT],
    });

    expect(issues.map((issue) => issue.type)).toContain("dice-missing");
  });

  it("reports a passive request that is not character-based", () => {
    const issues = findConcealmentRequestIssues({
      mode: "passive",
      basis: { kind: "authored-information", baseModifier: 4 },
      routes: [SIGHT],
    });

    expect(issues.map((issue) => issue.type)).toContain("basis-invalid");
  });

  it("accepts a well-formed request", () => {
    expect(findConcealmentRequestIssues({
      mode: "passive",
      basis: characterBasis(),
      routes: [SIGHT],
    })).toEqual([]);
  });
});
