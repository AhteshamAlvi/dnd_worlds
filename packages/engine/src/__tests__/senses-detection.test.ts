/*
 * Detection — turning a perceived cue into awareness, opposed by Concealment.
 *
 * The invariant guarded hardest here is the route match: a Detection roll and
 * the Concealment it is opposed by must describe the SAME sense, phenomenon
 * and subject. Comparing a sight roll against a sound's concealment is a
 * silent wrong answer, so both the validator and the resolver refuse it.
 */

import { describe, expect, it } from "vitest";

import { createTraceNode } from "../infrastructure/trace";
import { resolvePassiveDetection } from "../character/foundation/senses/detection/passive";
import { resolveDetectionCheck } from "../character/foundation/senses/detection/resolution";
import { resolvePassiveDetectionCandidates } from "../character/foundation/senses/detection/candidates";
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
    const result = resolvePassiveDetection(request());

    expect(result.observerTotal).toBe(PASSIVE_DETECTION_BASE);
    expect(result.concealmentTotal).toBe(3);
    expect(result.margin).toBe(PASSIVE_DETECTION_BASE - 3);
    expect(result.band).toBe("minimal");
  });

  it("does not roll", () => {
    expect(resolvePassiveDetection(request()).check).toBeUndefined();
  });

  it("notices nothing when Concealment matches the passive base", () => {
    const result = resolvePassiveDetection(request({
      concealment: rating(SIGHT, PASSIVE_DETECTION_BASE),
    }));

    expect(result.margin).toBe(0);
    expect(result.band).toBe("none");
  });

  it("layers route-specific persistent modifiers on the observer's side", () => {
    const result = resolvePassiveDetection(request({
      modifiers: [{
        source: source("alert"),
        scope: { kind: "detection", mode: { kind: "specific", mode: "passive" } },
        amount: 4,
        channel: "persistent",
      }],
    }));

    expect(result.observerTotal).toBe(PASSIVE_DETECTION_BASE + 4);
    expect(result.band).toBe("partial");
  });

  it("refuses a request that is not passive", () => {
    expect(() => resolvePassiveDetection(request({ mode: "active" })))
      .toThrow(RangeError);
  });
});


describe("active and reaction Detection", () => {
  it("rolls the sense-adjusted Detection modifier", () => {
    const result = resolveDetectionCheck(request({ mode: "active", dice: roll(10) }));

    expect(result.observerTotal).toBe(10 + SIGHT_DETECTION_MODIFIER);
    expect(result.margin).toBe(12 - 3);
    expect(result.band).toBe("partial");
  });

  it("resolves a reaction the same way", () => {
    const result = resolveDetectionCheck(request({ mode: "reaction", dice: roll(10) }));

    expect(result.mode).toBe("reaction");
    expect(result.observerTotal).toBe(12);
  });

  it("requires dice", () => {
    expect(() => resolveDetectionCheck(request({ mode: "active" })))
      .toThrow(RangeError);
  });

  it("delegates a passive request to the passive resolver", () => {
    const result = resolveDetectionCheck(request());

    expect(result.mode).toBe("passive");
    expect(result.observerTotal).toBe(PASSIVE_DETECTION_BASE);
  });
});


describe("route matching", () => {
  const MISMATCHED = request({ concealment: rating(HEARING, 3) });

  it("refuses a passive resolution across mismatched routes", () => {
    expect(() => resolvePassiveDetection(MISMATCHED)).toThrow(RangeError);
  });

  it("refuses a rolled resolution across mismatched routes", () => {
    expect(() =>
      resolveDetectionCheck({ ...MISMATCHED, mode: "active", dice: roll(10) })
    ).toThrow(RangeError);
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

  it("drops a candidate nobody noticed at all", () => {
    const notifications = resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [candidate({
        id: "hidden",
        routes: [{ cue: cue(), concealment: rating(SIGHT, PASSIVE_DETECTION_BASE) }],
      })],
    });

    expect(notifications).toEqual([]);
  });

  it("drops a candidate that did not clear its own notification floor", () => {
    // Margin 1 is "minimal", which is below the authored "partial" floor.
    const notifications = resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [candidate({ id: "rustle", minimumNotificationBand: "partial" })],
    });

    expect(notifications).toEqual([]);
  });

  it("keeps a candidate that cleared its floor", () => {
    const notifications = resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [candidate({ id: "rustle", minimumNotificationBand: "minimal" })],
    });

    expect(notifications.map((entry) => entry.key)).toEqual(["rustle"]);
    expect(notifications[0]!.band).toBe("minimal");
  });

  it("reports a candidate's best route when several exist", () => {
    const notifications = resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [candidate({
        id: "intruder",
        routes: [
          { cue: cue(), concealment: rating(SIGHT, 4) },
          { cue: cue("hearing"), concealment: rating(HEARING, 0) },
        ],
      })],
    });

    // Sight margin 1 (minimal), hearing margin 5 (partial): the best wins.
    expect(notifications[0]!.band).toBe("partial");
  });

  it("collapses a group into one notification carrying every member", () => {
    const notifications = resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [
        candidate({ id: "bystander-1", groupId: "crowd" }),
        candidate({ id: "bystander-2", groupId: "crowd" }),
      ],
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.key).toBe("crowd");
    expect(notifications[0]!.candidateIds).toEqual(["bystander-1", "bystander-2"]);
  });

  it("takes a group's importance from its most important member", () => {
    const notifications = resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [
        candidate({ id: "bystander", groupId: "crowd", importance: "ambient" }),
        candidate({ id: "assassin", groupId: "crowd", importance: "critical" }),
      ],
    });

    expect(notifications[0]!.importance).toBe("critical");
  });

  it("sorts by importance before anything else", () => {
    /*
     * The ambient hit is noticed far more clearly, and still ranks below the
     * critical one. A passive sweep must not bury the assassin under scenery.
     */
    const notifications = resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [
        candidate({
          id: "scenery",
          importance: "ambient",
          routes: [{ cue: cue(), concealment: rating(SIGHT, -10) }],
        }),
        candidate({ id: "assassin", importance: "critical" }),
      ],
    });

    expect(notifications.map((entry) => entry.key)).toEqual(["assassin", "scenery"]);
    expect(notifications[1]!.band).toBe("full");
  });

  it("breaks an importance tie on the information band", () => {
    const notifications = resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [
        candidate({ id: "faint" }),
        candidate({
          id: "obvious",
          routes: [{ cue: cue(), concealment: rating(SIGHT, 0) }],
        }),
      ],
    });

    expect(notifications.map((entry) => entry.key)).toEqual(["obvious", "faint"]);
  });

  it("carries the underlying results through for the GM to inspect", () => {
    const notifications = resolvePassiveDetectionCandidates({
      profile: sensoryProfile(),
      candidates: [candidate({ id: "rustle" })],
    });

    expect(notifications[0]!.results).toHaveLength(1);
    expect(notifications[0]!.results[0]!.margin).toBe(1);
  });
});
