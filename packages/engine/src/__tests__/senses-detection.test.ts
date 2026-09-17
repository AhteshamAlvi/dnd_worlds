/*
 * Detection — turning a perceived cue into awareness, opposed by Concealment.
 *
 * Two invariants are guarded hardest here.
 *
 * The route match: a Detection roll and the Concealment it is opposed by must
 * describe the SAME sense, phenomenon and subject. Comparing a sight roll
 * against a sound's concealment is a silent wrong answer, so both the validator
 * and the resolver refuse it.
 *
 * And the binary answer: Detection says detected or not, never how much. The
 * information bands that used to come back from here belong to Perception and
 * Investigation, and a band on a Detection result would mean an assassin could
 * be two-fifths noticed.
 */

import { describe, expect, it } from "vitest";

import { errorCodesOf, payloadOf } from "./fixtures/result";

import { createTraceNode } from "../infrastructure/trace";
import { resolvePassiveDetection } from "../character/foundation/senses/detection/passive";
import { resolveDetectionCheck } from "../character/foundation/senses/detection/resolution";
import { resolvePassiveDetectionCandidates } from "../character/foundation/senses/detection/candidates";
import { sweepPassiveDetectionRoutes } from "../character/foundation/senses/detection/routes";
import {
  CONCEALMENT_LEAD_BAND_SIZE,
  MAXIMUM_CONCEALMENT_REACTION_DISADVANTAGES,
  compareDetectionTotals,
  deriveConcealmentReactionDisadvantages,
  reconcileDetectionAdvantage,
  resolveConcealmentLead,
} from "../character/foundation/senses/detection/outcome";
import { findDetectionRequestIssues } from "../character/foundation/senses/detection/validation";
import type {
  DetectionCandidate,
  DetectionRequest,
} from "../character/foundation/senses/detection";
import type { ConcealmentRating } from "../character/foundation/senses/concealment";
import type { ConcealmentRoute } from "../character/foundation/senses/concealment";
import type { PerceivedCue } from "../character/foundation/senses/signatures";

import {
  PASSIVE_DETECTION_BASE,
  roll,
  route,
  sensoryProfile,
  signature,
  source,
} from "./fixtures/senses";

const SIGHT = route();
const HEARING = route({ sense: "hearing" });

/* Sight Detection: round((PER 16 + WIS 14) / 2) = 15 -> +2. */
const SIGHT_DETECTION_MODIFIER = 2;

function cue(sense: "sight" | "hearing" = "sight"): PerceivedCue {
  return {
    signature: signature({ id: `${sense}-cue`, sense }),
    perceptionBand: "partial",
  };
}

function rating(concealmentRoute: ConcealmentRoute, total: number): ConcealmentRating {
  return {
    route: concealmentRoute,
    mode: "passive",
    total,
    trace: createTraceNode({
      id: `test.concealment.${concealmentRoute.sense}`,
      label: "Test Concealment rating",
      output: total,
    }),
  };
}

function request(overrides: Partial<DetectionRequest> = {}): DetectionRequest {
  return {
    mode: "passive",
    profile: sensoryProfile(),
    cue: cue(),
    concealment: rating(SIGHT, 3),
    ...overrides,
  };
}


describe("passive Detection", () => {
  it("is the sense's stored passive base opposed by the Concealment total", () => {
    const result = payloadOf(resolvePassiveDetection(request()));

    expect(result.observerTotal).toBe(PASSIVE_DETECTION_BASE);
    expect(result.concealmentTotal).toBe(3);
    expect(result.margin).toBe(PASSIVE_DETECTION_BASE - 3);
    expect(result.detected).toBe(true);
  });

  it("does not roll", () => {
    expect(payloadOf(resolvePassiveDetection(request())).check).toBeUndefined();
  });

  it("leaves the subject concealed when Concealment ties the passive base", () => {
    /*
     * The tie rule, at the resolver rather than only in the pure comparison.
     * Rewarding a tie would make every concealment one point worse than it
     * reads on the sheet.
     */
    const result = payloadOf(resolvePassiveDetection(request({
      concealment: rating(SIGHT, PASSIVE_DETECTION_BASE),
    })));

    expect(result.margin).toBe(0);
    expect(result.detected).toBe(false);
  });

  it("does not detect when Concealment is ahead", () => {
    const result = payloadOf(resolvePassiveDetection(request({
      concealment: rating(SIGHT, PASSIVE_DETECTION_BASE + 1),
    })));

    expect(result.detected).toBe(false);
    expect(result.margin).toBe(-1);
  });

  it("layers route-specific persistent modifiers on the observer's side", () => {
    const result = payloadOf(resolvePassiveDetection(request({
      concealment: rating(SIGHT, PASSIVE_DETECTION_BASE + 2),
      modifiers: [{
        source: source("alert"),
        scope: { kind: "detection", mode: { kind: "specific", mode: "passive" } },
        amount: 4,
        channel: "persistent",
      }],
    })));

    expect(result.observerTotal).toBe(PASSIVE_DETECTION_BASE + 4);
    expect(result.detected).toBe(true);
  });

  it("reports which route answered", () => {
    expect(payloadOf(resolvePassiveDetection(request())).route).toEqual(SIGHT);
  });

  it("refuses a request that is not passive", () => {
    /* Wrong resolver for the mode: a throw, deliberately. */
    expect(() => resolvePassiveDetection(request({ mode: "active" })))
      .toThrow(RangeError);
  });
});


describe("Detection returns no information band", () => {
  /*
   * The regression that matters most in this file. Restoring a band here would
   * reintroduce partial awareness, and every consumer downstream would start
   * grading a boolean again.
   */
  const SHAPES = [
    ["passive", payloadOf(resolvePassiveDetection(request()))],
    ["active", payloadOf(resolveDetectionCheck(request({ mode: "active", dice: roll(18) })))],
    ["reaction", payloadOf(resolveDetectionCheck(request({ mode: "reaction", dice: roll(18) })))],
  ] as const;

  it.each(SHAPES)("%s Detection reports detected, totals, margin and route", (_mode, result) => {
    expect(result).not.toHaveProperty("band");
    expect(typeof result.detected).toBe("boolean");
    expect(typeof result.observerTotal).toBe("number");
    expect(typeof result.concealmentTotal).toBe("number");
    expect(typeof result.margin).toBe("number");
    expect(result.route).toEqual(SIGHT);
    expect(result.trace).toBeDefined();
  });

  it("accepts no information override on the request", () => {
    /*
     * A type-level fact, asserted as a value so it survives a refactor that
     * reintroduces the field without anybody noticing the test still compiles.
     */
    expect(Object.keys(request())).not.toContain("informationOverride");
  });
});


describe("active and reaction Detection", () => {
  it("rolls the sense-adjusted Detection modifier", () => {
    const result = payloadOf(resolveDetectionCheck(request({ mode: "active", dice: roll(10) })));

    expect(result.observerTotal).toBe(10 + SIGHT_DETECTION_MODIFIER);
    expect(result.margin).toBe(12 - 3);
    expect(result.detected).toBe(true);
  });

  it("fails a tie, exactly as passive Detection does", () => {
    const result = payloadOf(resolveDetectionCheck(request({
      mode: "active",
      dice: roll(10),
      concealment: rating(SIGHT, 10 + SIGHT_DETECTION_MODIFIER),
    })));

    expect(result.margin).toBe(0);
    expect(result.detected).toBe(false);
  });

  it("resolves a reaction the same way", () => {
    const result = payloadOf(resolveDetectionCheck(request({ mode: "reaction", dice: roll(10) })));

    expect(result.mode).toBe("reaction");
    expect(result.observerTotal).toBe(12);
  });

  it("keeps whatever advantage the caller already reconciled", () => {
    /*
     * The resolver never adds disadvantages of its own. Three d20s keeping the
     * lowest arrive as three d20s keeping the lowest.
     */
    const result = payloadOf(resolveDetectionCheck(request({
      mode: "reaction",
      dice: { advantage: -2, rolls: [18, 4, 11] },
    })));

    expect(result.check?.dice.retainedRoll).toBe(4);
    expect(result.observerTotal).toBe(4 + SIGHT_DETECTION_MODIFIER);
  });

  it("requires dice", () => {
    expect(errorCodesOf(resolveDetectionCheck(request({ mode: "active" }))))
      .toContain("character.senses.dice.missing");
  });

  it("delegates a passive request to the passive resolver", () => {
    const result = payloadOf(resolveDetectionCheck(request()));

    expect(result.mode).toBe("passive");
    expect(result.observerTotal).toBe(PASSIVE_DETECTION_BASE);
  });
});


describe("the Concealment Lead", () => {
  it("is how far Concealment stayed ahead of passive Detection", () => {
    expect(payloadOf(resolveConcealmentLead({
      concealmentTotal: 18,
      passiveDetectionTotal: 5,
    }))).toBe(13);
  });

  it("is zero on an exact tie, which is still a concealment", () => {
    expect(payloadOf(resolveConcealmentLead({
      concealmentTotal: 5,
      passiveDetectionTotal: 5,
    }))).toBe(0);
  });

  it("refuses to exist when passive Detection actually won", () => {
    expect(errorCodesOf(resolveConcealmentLead({
      concealmentTotal: 4,
      passiveDetectionTotal: 9,
    }))).toContain("character.senses.detection.lead.detected");
  });

  it.each([
    ["a non-finite Concealment total", { concealmentTotal: Number.NaN, passiveDetectionTotal: 3 }],
    ["a non-finite Detection total", { concealmentTotal: 3, passiveDetectionTotal: Number.POSITIVE_INFINITY }],
  ])("refuses %s rather than coercing it", (_name, input) => {
    expect(errorCodesOf(resolveConcealmentLead(input)))
      .toContain("character.senses.detection.total.invalid");
  });
});


describe("Concealment Lead to Reaction disadvantages", () => {
  const BANDS = [
    [0, 1], [1, 1], [4, 1],
    [5, 2], [7, 2], [9, 2],
    [10, 3], [14, 3],
    [15, 4], [19, 4],
  ] as const;

  it.each(BANDS)("a Lead of %i produces %i disadvantages", (lead, expected) => {
    expect(payloadOf(deriveConcealmentReactionDisadvantages(lead))).toBe(expected);
  });

  it("caps at four however far ahead the Concealment was", () => {
    for (const lead of [20, 40, 100, 1_000]) {
      expect(payloadOf(deriveConcealmentReactionDisadvantages(lead)))
        .toBe(MAXIMUM_CONCEALMENT_REACTION_DISADVANTAGES);
    }
  });

  it("never produces zero, because an unnoticed threat is always harder", () => {
    for (let lead = 0; lead <= 30; lead += 1) {
      expect(payloadOf(deriveConcealmentReactionDisadvantages(lead)))
        .toBeGreaterThanOrEqual(1);
    }
  });

  it("changes band exactly every five points", () => {
    expect(CONCEALMENT_LEAD_BAND_SIZE).toBe(5);

    for (const boundary of [5, 10, 15]) {
      expect(payloadOf(deriveConcealmentReactionDisadvantages(boundary)))
        .toBe(payloadOf(deriveConcealmentReactionDisadvantages(boundary - 1)) + 1);
    }
  });

  it.each([-1, 2.5, Number.NaN])("refuses %s", (lead) => {
    expect(errorCodesOf(deriveConcealmentReactionDisadvantages(lead)))
      .toContain("character.senses.detection.lead.invalid");
  });
});


describe("advantage reconciliation", () => {
  it("subtracts concealment disadvantages from independent advantage", () => {
    expect(payloadOf(reconcileDetectionAdvantage({
      independentAdvantage: 1,
      concealmentDisadvantages: 3,
    }))).toBe(-2);
  });

  it("lets a warning cancel disadvantages rather than granting success", () => {
    /*
     * Two advantages against two disadvantages is an ordinary single d20, not
     * an automatic detection. A warning makes you likelier to notice; it does
     * not tell you where the knife is.
     */
    expect(payloadOf(reconcileDetectionAdvantage({
      independentAdvantage: 2,
      concealmentDisadvantages: 2,
    }))).toBe(0);
  });

  it.each([
    [1.5, 1],
    [1, -1],
  ])("refuses advantage %s with disadvantages %s", (independentAdvantage, concealmentDisadvantages) => {
    expect(errorCodesOf(reconcileDetectionAdvantage({
      independentAdvantage,
      concealmentDisadvantages,
    }))).toContain("character.senses.detection.advantage.invalid");
  });
});


describe("the pure comparison", () => {
  it.each([
    [10, 9, true],
    [10, 10, false],
    [10, 11, false],
  ])("Detection %i against Concealment %i detects: %s", (detection, concealment, detected) => {
    expect(compareDetectionTotals(detection, concealment))
      .toEqual({ detected, margin: detection - concealment });
  });
});


describe("best-route selection", () => {
  it("detects once through the best route rather than once per sense", () => {
    const sweep = payloadOf(sweepPassiveDetectionRoutes({
      profile: sensoryProfile(),
      routes: [
        { cue: cue(), concealment: rating(SIGHT, PASSIVE_DETECTION_BASE + 10) },
        { cue: cue("hearing"), concealment: rating(HEARING, PASSIVE_DETECTION_BASE - 2) },
      ],
    }));

    expect(sweep.detected).toBe(true);
    expect(sweep.best.route.sense).toBe("hearing");
    /* Both routes compared, but the answer is ONE detection. */
    expect(sweep.results).toHaveLength(2);
    expect(sweep.results.filter((result) => result.check !== undefined)).toEqual([]);
  });

  it("returns the narrowest failure, which is the smallest Concealment Lead", () => {
    const sweep = payloadOf(sweepPassiveDetectionRoutes({
      profile: sensoryProfile(),
      routes: [
        { cue: cue(), concealment: rating(SIGHT, PASSIVE_DETECTION_BASE + 12) },
        { cue: cue("hearing"), concealment: rating(HEARING, PASSIVE_DETECTION_BASE + 3) },
      ],
    }));

    expect(sweep.detected).toBe(false);
    expect(sweep.best.route.sense).toBe("hearing");
    expect(payloadOf(resolveConcealmentLead({
      concealmentTotal: sweep.best.concealmentTotal,
      passiveDetectionTotal: sweep.best.observerTotal,
    }))).toBe(3);
  });

  it("drops routes through a sense the observer does not have", () => {
    const sweep = payloadOf(sweepPassiveDetectionRoutes({
      profile: sensoryProfile({ unavailablePhysicalSenses: ["sight"] }),
      routes: [
        { cue: cue(), concealment: rating(SIGHT, -100) },
        { cue: cue("hearing"), concealment: rating(HEARING, PASSIVE_DETECTION_BASE + 1) },
      ],
    }));

    expect(sweep.results).toHaveLength(1);
    expect(sweep.detected).toBe(false);
  });

  it("refuses a sweep with no usable route at all", () => {
    expect(errorCodesOf(sweepPassiveDetectionRoutes({
      profile: sensoryProfile({ unavailablePhysicalSenses: ["sight"] }),
      routes: [{ cue: cue(), concealment: rating(SIGHT, 0) }],
    }))).toContain("character.senses.detection.routes.none");
  });
});


describe("route matching", () => {
  const MISMATCHED = request({ concealment: rating(HEARING, 3) });

  it("refuses a passive resolution across mismatched routes", () => {
    expect(errorCodesOf(resolvePassiveDetection(MISMATCHED)))
      .toContain("character.senses.route.mismatch");
  });

  it("refuses a rolled resolution across mismatched routes", () => {
    expect(errorCodesOf(
      resolveDetectionCheck({ ...MISMATCHED, mode: "active", dice: roll(10) }),
    )).toContain("character.senses.route.mismatch");
  });

  it("reports the mismatch in validation, before the resolver throws", () => {
    expect(findDetectionRequestIssues(MISMATCHED).map((issue) => issue.type))
      .toContain("route-mismatch");
  });

  it("reports missing dice for a rolling mode", () => {
    expect(findDetectionRequestIssues(request({ mode: "active" }))
      .map((issue) => issue.type)).toContain("dice-missing");
  });

  it("reports an unavailable sense", () => {
    expect(findDetectionRequestIssues(request({
      profile: sensoryProfile({ unavailablePhysicalSenses: ["sight"] }),
    })).map((issue) => issue.type)).toContain("sense-unavailable");
  });

  it("accepts a well-formed request", () => {
    expect(findDetectionRequestIssues(request())).toEqual([]);
  });
});


describe("passive candidate sweeps", () => {
  function candidate(overrides: Partial<DetectionCandidate> & { id: string }): DetectionCandidate {
    return {
      importance: "relevant",
      routes: [{ cue: cue(), concealment: rating(SIGHT, 4) }],
      ...overrides,
    };
  }

  it("drops a candidate no route detected", () => {
    const notifications = payloadOf(resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [candidate({
        id: "hidden",
        routes: [{ cue: cue(), concealment: rating(SIGHT, PASSIVE_DETECTION_BASE) }],
      })],
    }));

    expect(notifications).toEqual([]);
  });

  it("includes a candidate any route detected", () => {
    const notifications = payloadOf(resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [candidate({ id: "rustle" })],
    }));

    expect(notifications.map((entry) => entry.key)).toEqual(["rustle"]);
    expect(notifications[0]!.bestMargin).toBe(1);
  });

  it("includes a candidate detected through only one of several routes", () => {
    const notifications = payloadOf(resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [candidate({
        id: "intruder",
        routes: [
          { cue: cue(), concealment: rating(SIGHT, PASSIVE_DETECTION_BASE + 4) },
          { cue: cue("hearing"), concealment: rating(HEARING, 0) },
        ],
      })],
    }));

    expect(notifications[0]!.bestMargin).toBe(PASSIVE_DETECTION_BASE);
    /* Only the detecting route is carried; a missed route notifies nothing. */
    expect(notifications[0]!.results).toHaveLength(1);
    expect(notifications[0]!.results[0]!.route.sense).toBe("hearing");
  });

  it("carries no information band on a notification", () => {
    const notifications = payloadOf(resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [candidate({ id: "rustle" })],
    }));

    expect(notifications[0]).not.toHaveProperty("band");
  });

  it("fails the whole sweep on a malformed candidate rather than dropping it", () => {
    /*
     * A silently dropped candidate is indistinguishable from one the character
     * correctly failed to notice, which is the one confusion a sweep must never
     * produce.
     */
    expect(errorCodesOf(resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [candidate({
        id: "malformed",
        routes: [{ cue: cue(), concealment: rating(HEARING, 0) }],
      })],
    }))).toContain("character.senses.route.mismatch");
  });

  it("collapses a group into one notification carrying every member", () => {
    const notifications = payloadOf(resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [
        candidate({ id: "bystander-1", groupId: "crowd" }),
        candidate({ id: "bystander-2", groupId: "crowd" }),
      ],
    }));

    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.key).toBe("crowd");
    expect(notifications[0]!.candidateIds).toEqual(["bystander-1", "bystander-2"]);
  });

  it("takes a group's importance from its most important member", () => {
    const notifications = payloadOf(resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [
        candidate({ id: "bystander", groupId: "crowd", importance: "ambient" }),
        candidate({ id: "assassin", groupId: "crowd", importance: "critical" }),
      ],
    }));

    expect(notifications[0]!.importance).toBe("critical");
  });

  it("sorts by importance before anything else", () => {
    /*
     * The ambient hit is noticed far more clearly, and still ranks below the
     * critical one. A passive sweep must not bury the assassin under scenery.
     */
    const notifications = payloadOf(resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [
        candidate({
          id: "scenery",
          importance: "ambient",
          routes: [{ cue: cue(), concealment: rating(SIGHT, -10) }],
        }),
        candidate({ id: "assassin", importance: "critical" }),
      ],
    }));

    expect(notifications.map((entry) => entry.key)).toEqual(["assassin", "scenery"]);
    expect(notifications[1]!.bestMargin).toBe(PASSIVE_DETECTION_BASE + 10);
  });

  it("breaks an importance tie on the best margin", () => {
    const notifications = payloadOf(resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [
        candidate({ id: "faint" }),
        candidate({
          id: "obvious",
          routes: [{ cue: cue(), concealment: rating(SIGHT, 0) }],
        }),
      ],
    }));

    expect(notifications.map((entry) => entry.key)).toEqual(["obvious", "faint"]);
  });

  it("carries the underlying results through for the GM to inspect", () => {
    const notifications = payloadOf(resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [candidate({ id: "rustle" })],
    }));

    expect(notifications[0]!.results).toHaveLength(1);
    expect(notifications[0]!.results[0]!.margin).toBe(1);
    expect(notifications[0]!.results[0]!.detected).toBe(true);
  });
});
