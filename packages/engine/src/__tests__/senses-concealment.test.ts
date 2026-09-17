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

import { errorCodesOf, payloadOf } from "./fixtures/result";

import { resolvePassiveConcealment } from "../character/foundation/senses/concealment/passive";
import { resolveConcealmentCheck } from "../character/foundation/senses/concealment/resolution";
import {
  establishConcealment,
  shouldRerollEstablishedConcealment,
} from "../character/foundation/senses/concealment/established";
import {
  concealmentRatingForRoute,
  endConcealmentAttempt,
  establishConcealmentState,
  isConcealedFrom,
  recordConcealmentDetection,
  replaceConcealmentAttempt,
} from "../character/foundation/senses/concealment/state";
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
    const result = payloadOf(resolvePassiveConcealment({
      mode: "passive",
      basis: characterBasis(),
      routes: [SIGHT],
    }));

    expect(result.ratings[0]!.total).toBe(PASSIVE_CONCEALMENT_BASE);
    expect(result.ratings[0]!.mode).toBe("passive");
  });

  it("does not roll", () => {
    const result = payloadOf(resolvePassiveConcealment({
      mode: "passive",
      basis: characterBasis(),
      routes: [SIGHT],
    }));

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

    const result = payloadOf(resolvePassiveConcealment({
      mode: "passive",
      basis: { kind: "character", stats: sensoryStats(), profile: restated },
      routes: [SIGHT],
    }));

    expect(profile.passiveConcealmentBase).toBe(PASSIVE_CONCEALMENT_BASE);
    expect(result.ratings[0]!.total).toBe(99);
  });

  it("layers route-specific persistent modifiers on top, per route", () => {
    const result = payloadOf(resolvePassiveConcealment({
      mode: "passive",
      basis: characterBasis(),
      routes: [SIGHT, HEARING],
      modifiers: [hearingOnly(3)],
    }));

    expect(result.ratings[0]!.total).toBe(PASSIVE_CONCEALMENT_BASE);
    expect(result.ratings[1]!.total).toBe(PASSIVE_CONCEALMENT_BASE + 3);
  });

  it("is reachable through the general resolver", () => {
    const result = payloadOf(resolveConcealmentCheck({
      mode: "passive",
      basis: characterBasis(),
      routes: [SIGHT],
    }));

    expect(result.mode).toBe("passive");
    expect(result.ratings[0]!.total).toBe(PASSIVE_CONCEALMENT_BASE);
  });

  /*
   * Still a throw, and deliberately: this is the PASSIVE resolver being handed
   * a request it does not resolve, which is engine code calling the wrong
   * function rather than a caller supplying bad data.
   */
  it("rejects an authored-information basis by throwing", () => {
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
    const result = payloadOf(establishConcealment({
      basis: characterBasis(),
      routes: [SIGHT, HEARING],
      dice: roll(13),
    }));

    const retained = result.ratings.map(
      (rating) => rating.check?.dice.retainedRoll,
    );

    expect(retained).toEqual([13, 13]);
    expect(result.sharedDice?.retainedRoll).toBe(13);
  });

  it("scores each route from that one die plus the Concealment modifier", () => {
    const result = payloadOf(establishConcealment({
      basis: characterBasis(),
      routes: [SIGHT, HEARING],
      dice: roll(13),
    }));

    for (const rating of result.ratings) {
      expect(rating.total).toBe(13 + CONCEALMENT_MODIFIER);
    }
  });

  it("still resolves route modifiers independently on that shared die", () => {
    const result = payloadOf(establishConcealment({
      basis: characterBasis(),
      routes: [SIGHT, HEARING],
      dice: roll(13),
      modifiers: [hearingOnly(3)],
    }));

    expect(result.ratings[0]!.total).toBe(14);
    expect(result.ratings[1]!.total).toBe(17);
    expect(result.ratings[0]!.check?.dice.retainedRoll)
      .toBe(result.ratings[1]!.check?.dice.retainedRoll);
  });

  it("is tagged established on every rating", () => {
    const result = payloadOf(establishConcealment({
      basis: characterBasis(),
      routes: [SIGHT, HEARING],
      dice: roll(13),
    }));

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
    const result = payloadOf(resolveConcealmentCheck({
      mode: "active",
      basis: characterBasis(),
      routes: [SIGHT],
      dice: roll(9),
    }));

    expect(result.ratings[0]!.total).toBe(9 + CONCEALMENT_MODIFIER);
  });

  it("requires dice, as a failure rather than a thrown error", () => {
    expect(errorCodesOf(
      resolveConcealmentCheck({
        mode: "active",
        basis: characterBasis(),
        routes: [SIGHT],
      }),
    )).toContain("character.senses.dice.missing");
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

    expect(payloadOf(resolveConcealmentCheck(request)).ratings[0]!.total)
      .toBe(10 + 4 + 2 + 1);
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

/*
 * The retained lifecycle.
 *
 * Everything below exists because concealment used to be a value recomputed on
 * demand, which quietly meant the hider re-hid every time anybody looked. The
 * roll is made once and kept; who has broken it is tracked per observer; and
 * the list of things that END it is closed.
 */
describe("retained Concealment state", () => {
  const ESTABLISHED_AT = 100;

  function attempt(dice = roll(13)) {
    return payloadOf(establishConcealmentState({
      attemptId: "attempt-1",
      subjectId: "assassin",
      sourceId: "assassin",
      resolution: payloadOf(establishConcealment({
        basis: characterBasis(),
        routes: [SIGHT, HEARING],
        dice,
      })),
      at: ESTABLISHED_AT,
    }));
  }

  it("retains its ratings unchanged across observers and attacks", () => {
    const state = attempt();

    const afterGon = payloadOf(recordConcealmentDetection(state, {
      attemptId: state.attemptId,
      observerId: "gon",
      at: ESTABLISHED_AT + 1,
    }));

    expect(afterGon.ratings).toEqual(state.ratings);
    expect(afterGon.ratings.map((rating) => rating.total))
      .toEqual([13 + CONCEALMENT_MODIFIER, 13 + CONCEALMENT_MODIFIER]);
  });

  it("is broken for the observer who detected it and for nobody else", () => {
    const state = attempt();

    const afterGon = payloadOf(recordConcealmentDetection(state, {
      attemptId: state.attemptId,
      observerId: "gon",
      at: ESTABLISHED_AT + 1,
    }));

    expect(isConcealedFrom(afterGon, "gon")).toBe(false);
    expect(isConcealedFrom(afterGon, "killua")).toBe(true);
    expect(isConcealedFrom(afterGon, "leorio")).toBe(true);
  });

  it("does not mutate the state one observer was handed", () => {
    const state = attempt();

    payloadOf(recordConcealmentDetection(state, {
      attemptId: state.attemptId,
      observerId: "gon",
      at: ESTABLISHED_AT + 1,
    }));

    expect(state.detectedByObserverIds).toEqual([]);
    expect(isConcealedFrom(state, "gon")).toBe(true);
  });

  it("survives an attack, because an attack is not a discovery", () => {
    /*
     * Nothing in this module is reachable FROM an attack. The absence is the
     * test: an arrow arriving tells you an arrow arrived, and a failed Reaction
     * Detection is precisely the finding that you could not tell from where.
     */
    const state = attempt();

    expect(state.status).toBe("concealed");
    expect(isConcealedFrom(state, "killua")).toBe(true);
  });

  it.each(["voluntary", "revealed", "impossible"] as const)(
    "ends outright when it ends for %s",
    (reason) => {
      const state = attempt();

      const ended = payloadOf(endConcealmentAttempt(state, {
        attemptId: state.attemptId,
        reason,
        at: ESTABLISHED_AT + 5,
      }));

      expect(ended.status).toBe("ended");
      expect(ended.endReason).toBe(reason);
      expect(isConcealedFrom(ended, "anybody-at-all")).toBe(false);
    },
  );

  it("hands back the retained rating for a route it covers", () => {
    const state = attempt();

    expect(concealmentRatingForRoute(state, SIGHT)?.total)
      .toBe(13 + CONCEALMENT_MODIFIER);
    expect(concealmentRatingForRoute(state, route({ sense: "smell" })))
      .toBeUndefined();
  });

  it("refuses an attempt built from a passive or active resolution", () => {
    for (const mode of ["passive", "active"] as const) {
      const resolution = payloadOf(resolveConcealmentCheck({
        mode,
        basis: characterBasis(),
        routes: [SIGHT],
        ...(mode === "passive" ? {} : { dice: roll(9) }),
      }));

      expect(errorCodesOf(establishConcealmentState({
        attemptId: "a",
        subjectId: "s",
        sourceId: "s",
        resolution,
        at: 0,
      }))).toContain("character.senses.concealment.state.mode.invalid");
    }
  });

  it.each([
    ["attemptId", { attemptId: "  " }],
    ["subjectId", { subjectId: "" }],
    ["sourceId", { sourceId: "" }],
  ])("refuses a blank %s", (_field, overrides) => {
    expect(errorCodesOf(establishConcealmentState({
      attemptId: "attempt-1",
      subjectId: "assassin",
      sourceId: "assassin",
      resolution: payloadOf(establishConcealment({
        basis: characterBasis(),
        routes: [SIGHT],
        dice: roll(13),
      })),
      at: 0,
      ...overrides,
    }))).toContain("character.senses.concealment.state.identity.missing");
  });

  it("refuses a malformed route", () => {
    const resolution = payloadOf(establishConcealment({
      basis: characterBasis(),
      routes: [SIGHT],
      dice: roll(13),
    }));

    expect(errorCodesOf(establishConcealmentState({
      attemptId: "a",
      subjectId: "s",
      sourceId: "s",
      resolution: {
        ...resolution,
        ratings: [{
          ...resolution.ratings[0]!,
          route: { ...SIGHT, sense: "echolocation" as never },
        }],
      },
      at: 0,
    }))).toContain("character.senses.concealment.state.route.invalid");
  });

  it("refuses a duplicated route", () => {
    const resolution = payloadOf(establishConcealment({
      basis: characterBasis(),
      routes: [SIGHT, SIGHT],
      dice: roll(13),
    }));

    expect(errorCodesOf(establishConcealmentState({
      attemptId: "a",
      subjectId: "s",
      sourceId: "s",
      resolution,
      at: 0,
    }))).toContain("character.senses.concealment.state.route.duplicate");
  });

  it("refuses a non-finite retained total", () => {
    const resolution = payloadOf(establishConcealment({
      basis: characterBasis(),
      routes: [SIGHT],
      dice: roll(13),
    }));

    expect(errorCodesOf(establishConcealmentState({
      attemptId: "a",
      subjectId: "s",
      sourceId: "s",
      resolution: {
        ...resolution,
        ratings: [{ ...resolution.ratings[0]!, total: Number.NaN }],
      },
      at: 0,
    }))).toContain("character.senses.concealment.state.total.invalid");
  });

  it("refuses a transition naming a different attempt, without mutating", () => {
    const state = attempt();

    expect(errorCodesOf(recordConcealmentDetection(state, {
      attemptId: "some-other-attempt",
      observerId: "gon",
      at: ESTABLISHED_AT + 1,
    }))).toContain("character.senses.concealment.state.attempt.mismatch");

    expect(state.detectedByObserverIds).toEqual([]);
  });

  it("refuses a blank observer", () => {
    const state = attempt();

    expect(errorCodesOf(recordConcealmentDetection(state, {
      attemptId: state.attemptId,
      observerId: "   ",
      at: ESTABLISHED_AT + 1,
    }))).toContain("character.senses.concealment.state.identity.missing");
  });

  it("records one observer exactly once", () => {
    const state = payloadOf(recordConcealmentDetection(attempt(), {
      attemptId: "attempt-1",
      observerId: "gon",
      at: ESTABLISHED_AT + 1,
    }));

    expect(errorCodesOf(recordConcealmentDetection(state, {
      attemptId: state.attemptId,
      observerId: "gon",
      at: ESTABLISHED_AT + 2,
    }))).toContain("character.senses.concealment.state.observer.duplicate");

    expect(state.detectedByObserverIds).toEqual(["gon"]);
  });

  it("refuses a transition stamped before the last change", () => {
    const state = payloadOf(recordConcealmentDetection(attempt(), {
      attemptId: "attempt-1",
      observerId: "gon",
      at: ESTABLISHED_AT + 10,
    }));

    expect(errorCodesOf(recordConcealmentDetection(state, {
      attemptId: state.attemptId,
      observerId: "killua",
      at: ESTABLISHED_AT + 3,
    }))).toContain("character.senses.concealment.state.time.contradiction");
  });

  it("refuses any transition on an attempt that already ended", () => {
    const ended = payloadOf(endConcealmentAttempt(attempt(), {
      attemptId: "attempt-1",
      reason: "voluntary",
      at: ESTABLISHED_AT + 1,
    }));

    expect(errorCodesOf(recordConcealmentDetection(ended, {
      attemptId: ended.attemptId,
      observerId: "gon",
      at: ESTABLISHED_AT + 2,
    }))).toContain("character.senses.concealment.state.ended");
  });

  it("replaces the attempt on a declared material change", () => {
    const first = payloadOf(recordConcealmentDetection(attempt(), {
      attemptId: "attempt-1",
      observerId: "gon",
      at: ESTABLISHED_AT + 1,
    }));

    const replaced = payloadOf(replaceConcealmentAttempt(first, {
      attemptId: "attempt-2",
      subjectId: "assassin",
      sourceId: "assassin",
      resolution: payloadOf(establishConcealment({
        basis: characterBasis(),
        routes: [SIGHT, HEARING],
        dice: roll(4),
      })),
      at: ESTABLISHED_AT + 2,
      change: { methodMateriallyChanged: true },
    }));

    expect(replaced.previous.status).toBe("ended");
    expect(replaced.previous.endReason).toBe("replaced");
    expect(replaced.current.ratings[0]!.total).toBe(4 + CONCEALMENT_MODIFIER);
    /* A new hiding place is not the old one with its detections carried over. */
    expect(replaced.current.detectedByObserverIds).toEqual([]);
    expect(isConcealedFrom(replaced.current, "gon")).toBe(true);
  });

  it("refuses to reroll without a declared material change", () => {
    const state = attempt();

    expect(errorCodesOf(replaceConcealmentAttempt(state, {
      attemptId: "attempt-2",
      subjectId: "assassin",
      sourceId: "assassin",
      resolution: payloadOf(establishConcealment({
        basis: characterBasis(),
        routes: [SIGHT],
        dice: roll(20),
      })),
      at: ESTABLISHED_AT + 2,
      change: {},
    }))).toContain("character.senses.concealment.state.change.immaterial");

    expect(state.status).toBe("concealed");
    expect(state.ratings[0]!.total).toBe(13 + CONCEALMENT_MODIFIER);
  });

  it("refuses a replacement that reuses the previous attempt id", () => {
    const state = attempt();

    expect(errorCodesOf(replaceConcealmentAttempt(state, {
      attemptId: state.attemptId,
      subjectId: "assassin",
      sourceId: "assassin",
      resolution: payloadOf(establishConcealment({
        basis: characterBasis(),
        routes: [SIGHT],
        dice: roll(20),
      })),
      at: ESTABLISHED_AT + 2,
      change: { newAttempt: true },
    }))).toContain("character.senses.concealment.state.attempt.duplicate");
  });

  it("leaves the character hidden when the replacement is malformed", () => {
    const state = attempt();
    const resolution = payloadOf(establishConcealment({
      basis: characterBasis(),
      routes: [SIGHT],
      dice: roll(20),
    }));

    expect(errorCodesOf(replaceConcealmentAttempt(state, {
      attemptId: "attempt-2",
      subjectId: "",
      sourceId: "assassin",
      resolution,
      at: ESTABLISHED_AT + 2,
      change: { newAttempt: true },
    }))).toContain("character.senses.concealment.state.identity.missing");

    expect(state.status).toBe("concealed");
  });
});
