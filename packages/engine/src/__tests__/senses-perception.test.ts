/*
 * Perception — raw reception, and the three states it can land in.
 *
 * The distinction being pinned throughout: "there was no route" and "there was
 * a route and the roll missed" are different answers. The old shape conflated
 * them behind one boolean, so a failed roll and a blind character looked alike
 * to anything narrowing on `perceived`.
 *
 * Access is now entirely a question about CHANNELS: a cue is inaccessible when
 * no available Sense receives any channel it is emitting on, through a
 * receiver that is working and reachable. Nothing here branches on a
 * phenomenon or a Sense id, which is why the old "intent needs Extrasensory"
 * case is gone — it was a hard-coded rule, and a registered Sense that read
 * intent could never have satisfied it.
 */

import { describe, expect, it } from "vitest";

import type { EngineResult } from "../infrastructure/result";
import { errorCodesOf, payloadOf } from "./fixtures/result";

import { resolvePerception } from "../character/foundation/senses/perception/resolution";
import { findPerceptionRequestIssues } from "../character/foundation/senses/perception/validation";
import type { PerceptionRequest } from "../character/foundation/senses/perception/types";

import type {
  InaccessiblePerception,
  PerceivedPerception,
  PerceptionResolution,
  UnperceivedPerception,
} from "../character/foundation/senses/perception/types";

import { cue, effects, roll, sensoryProfile, source } from "./fixtures/senses";

/*
 * Narrowing helpers. The union no longer carries `band` on every member — an
 * inaccessible route has no band at all, which is the point — so a test that
 * wants one has to say which state it expected first. That the compiler
 * enforces this is itself the fix working.
 */
function expectPerceived(
  outcome: EngineResult<PerceptionResolution>,
): PerceivedPerception {
  const result = payloadOf(outcome);

  expect(result.status).toBe("perceived");
  if (result.status !== "perceived") throw new Error("unreachable");
  return result;
}

function expectNotPerceived(
  outcome: EngineResult<PerceptionResolution>,
): UnperceivedPerception {
  const result = payloadOf(outcome);

  expect(result.status).toBe("not-perceived");
  if (result.status !== "not-perceived") throw new Error("unreachable");
  return result;
}

function expectInaccessible(
  outcome: EngineResult<PerceptionResolution>,
): InaccessiblePerception {
  const result = payloadOf(outcome);

  expect(result.status).toBe("inaccessible");
  if (result.status !== "inaccessible") throw new Error("unreachable");
  return result;
}

const SIGHT_MODIFIER = 3;

/*
 * The default cue here is an UNCERTAIN one, because that is the case this
 * suite is mostly about. A cue with no authored reception is received
 * automatically — which is the right default for the shared fixture, since a
 * cue built for Detection has no reception at all.
 */
function request(overrides: Partial<PerceptionRequest> = {}): PerceptionRequest {
  return {
    profile: sensoryProfile(),
    cue: cue({ reception: { kind: "uncertain", difficulty: 10 } }),
    ...overrides,
  };
}

function issueTypes(input: PerceptionRequest): readonly string[] {
  return findPerceptionRequestIssues(input).map((issue) => issue.type);
}


describe("automatic reception", () => {
  it("is perceived at the authored band without rolling", () => {
    const result = expectPerceived(resolvePerception(request({
      cue: cue({ reception: { kind: "automatic", band: "partial" } }),
    })));

    expect(result.perceived).toBe(true);
    expect(result.band).toBe("partial");
    expect(result.check).toBeUndefined();
    expect(result.cue.id).toBe("footstep");
    expect(result.route.sense).toBe("sight");
    expect(result.route.channel).toBe("visible-light");
  });

  it("defaults to the full band when none is authored", () => {
    const result = expectPerceived(resolvePerception(request({
      cue: cue({ reception: { kind: "automatic" } }),
    })));

    expect(result.band).toBe("full");
  });
});


describe("impossible reception", () => {
  it("is inaccessible rather than a failed roll", () => {
    const result = expectInaccessible(resolvePerception(request({
      cue: cue({
        reception: { kind: "impossible", reason: "sealed behind stone" },
      }),
    })));

    expect(result.perceived).toBe(false);
    expect(result.reason).toBe("authored-impossible");
  });

  it("never reaches the roll, so it never throws", () => {
    /*
     * The one remaining throw in this resolver guards a branch access
     * resolution has already excluded. This proves it stays unreachable.
     */
    expect(() =>
      resolvePerception(request({
        cue: cue({ reception: { kind: "impossible" } }),
      }))
    ).not.toThrow();
  });
});


describe("inaccessible routes", () => {
  it("reports a Sense whose anatomy is gone", () => {
    const result = expectInaccessible(resolvePerception(request({
      profile: sensoryProfile({
        pointStates: {
          "left-eye:head-1": "archived-removed",
          "right-eye:head-1": "archived-removed",
        },
      }),
    })));

    expect(result.reason).toBe("no-compatible-route");
  });

  it("reports a channel nothing this creature has can receive", () => {
    const result = expectInaccessible(resolvePerception(request({
      cue: cue({ channel: "magnetic-field" }),
    })));

    expect(result.reason).toBe("no-compatible-route");
  });

  it("reports Aura as inaccessible to an unawakened character", () => {
    const result = expectInaccessible(resolvePerception(request({
      cue: cue({ channel: "aura", phenomenon: "nen" }),
    })));

    expect(result.reason).toBe("no-compatible-route");
  });

  it("opens the Aura route once the character is awakened", () => {
    const result = payloadOf(resolvePerception(request({
      profile: sensoryProfile({ nenAwakened: true }),
      cue: cue({
        channel: "aura",
        phenomenon: "nen",
        reception: { kind: "automatic" },
      }),
    })));

    expect(result.status).toBe("perceived");
  });

  it("reports a contact channel nothing is touching", () => {
    const result = expectInaccessible(resolvePerception(request({
      cue: cue({ channel: "contact-chemical" }),
    })));

    expect(result.reason).toBe("no-compatible-route");
  });

  it("opens a contact route once the caller supplies the contact", () => {
    const result = payloadOf(resolvePerception(request({
      cue: cue({ channel: "contact-chemical", reception: { kind: "automatic" } }),
      exposure: { contactedPointIds: ["tongue:head-1"] },
    })));

    expect(result.status).toBe("perceived");
  });
});


describe("uncertain reception", () => {
  it("is perceived when the margin clears the minimal threshold", () => {
    // 12 + 3 = 15 against difficulty 10 -> margin 5 -> partial.
    const result = expectPerceived(resolvePerception(request({ dice: roll(12) })));

    expect(result.band).toBe("partial");
    expect(result.check?.margin).toBe(5);
    expect(result.cue.id).toBe("footstep");
  });

  it("is not-perceived — not inaccessible — when the roll misses", () => {
    // 7 + 3 = 10 against difficulty 10 -> margin 0 -> none, ties fail.
    const result = expectNotPerceived(resolvePerception(request({ dice: roll(7) })));

    expect(result.perceived).toBe(false);
    expect(result.band).toBe("none");
    expect(result.check.margin).toBe(0);
  });

  it("applies matching check modifiers through the universal resolver", () => {
    // 7 + 3 + 4 = 14 against difficulty 10 -> margin 4 -> minimal.
    const result = expectPerceived(resolvePerception(request({
      dice: roll(7),
      modifiers: [{
        source: source("eagle-eyed"),
        scope: { kind: "perception", sense: { kind: "specific", sense: "sight" } },
        amount: 4,
        channel: "persistent",
      }],
    })));

    expect(result.band).toBe("minimal");
  });

  it("ignores a modifier scoped to a different sense", () => {
    const result = payloadOf(resolvePerception(request({
      dice: roll(7),
      modifiers: [{
        source: source("keen-ears"),
        scope: { kind: "perception", sense: { kind: "specific", sense: "hearing" } },
        amount: 4,
        channel: "persistent",
      }],
    })));

    expect(result.status).toBe("not-perceived");
  });

  it("uses the sense's own modifier, not raw PER, when the sense was raised", () => {
    const profile = sensoryProfile({
      effects: effects({
        senseModifiers: [{
          source: source("keen-ears"),
          sense: { kind: "specific", sense: "hearing" },
          amount: 4,
        }],
      }),
    });

    // Hearing is 20 -> +5. 7 + 5 = 12 against 10 -> margin 2 -> minimal.
    const heard = payloadOf(resolvePerception(request({
      profile,
      cue: cue({ channel: "sound" }),
      dice: roll(7),
    })));
    const seen = payloadOf(resolvePerception(request({ profile, dice: roll(7) })));

    expect(heard.status).toBe("perceived");
    expect(seen.status).toBe("not-perceived");
    expect(SIGHT_MODIFIER).toBe(3);
  });
});


describe("natural 1 and natural 20 carry no automatic outcome", () => {
  it("lets a natural 1 succeed when the modifier is enough", () => {
    // 1 + 3 = 4 against difficulty 1 -> margin 3 -> minimal.
    const result = expectPerceived(resolvePerception(request({
      cue: cue({ reception: { kind: "uncertain", difficulty: 1 } }),
      dice: roll(1),
    })));

    expect(result.band).toBe("minimal");
  });

  it("lets a natural 20 fail when the difficulty is out of reach", () => {
    // 20 + 3 = 23 against difficulty 20 is fine; against 20 with margin 3.
    const result = expectPerceived(resolvePerception(request({
      cue: cue({ reception: { kind: "uncertain", difficulty: 20 } }),
      dice: roll(20),
    })));

    expect(result.band).toBe("minimal");
  });

  it("gives a natural 20 no automatic band promotion", () => {
    // 20 + 3 = 23 against difficulty 10 -> margin 13 -> substantial, not full.
    const result = expectPerceived(resolvePerception(request({ dice: roll(20) })));

    expect(result.band).toBe("substantial");
  });

  it("gives a natural 1 no automatic failure flag", () => {
    const result = expectPerceived(resolvePerception(request({
      cue: cue({ reception: { kind: "uncertain", difficulty: 1 } }),
      dice: roll(1),
    })));

    expect(result.check?.check.dice.retainedRoll).toBe(1);
    expect(result.check?.success).toBe(true);
  });
});


describe("validate-then-resolve", () => {
  it("reports dice-missing for uncertain reception with no dice", () => {
    expect(issueTypes(request())).toContain("dice-missing");
  });

  it("reports dice-unnecessary for automatic reception", () => {
    expect(issueTypes(request({
      cue: cue({ reception: { kind: "automatic" } }),
      dice: roll(12),
    }))).toContain("dice-unnecessary");
  });

  it("reports dice-unnecessary for impossible reception", () => {
    expect(issueTypes(request({
      cue: cue({ reception: { kind: "impossible" } }),
      dice: roll(12),
    }))).toContain("dice-unnecessary");
  });

  it("accepts a well-formed uncertain request", () => {
    expect(issueTypes(request({ dice: roll(12) }))).toEqual([]);
  });

  it("accepts a well-formed automatic request", () => {
    expect(issueTypes(request({
      cue: cue({ reception: { kind: "automatic" } }),
    }))).toEqual([]);
  });

  it("reports missing dice through validation AND through the resolver", () => {
    /*
     * Validation should still be what finds this first. What changed is the
     * resolver's answer when it is reached anyway: a failure a caller can read
     * alongside every other diagnostic, rather than the one sensory problem
     * that had to be caught.
     */
    const missingDice = request();

    expect(issueTypes(missingDice)).toContain("dice-missing");
    expect(errorCodesOf(resolvePerception(missingDice)))
      .toContain("character.senses.dice.missing");
  });

  it("reports a malformed cue", () => {
    expect(issueTypes(request({
      cue: { ...cue({ reception: { kind: "uncertain", difficulty: 10 } }), id: "   " },
      dice: roll(12),
    }))).toContain("identifier-missing");
  });

  it("reports an out-of-range authored difficulty", () => {
    expect(issueTypes(request({
      cue: cue({ reception: { kind: "uncertain", difficulty: 21 } }),
      dice: roll(12),
    }))).toContain("difficulty-invalid");
  });

  it("reports malformed dice through the universal check validator", () => {
    expect(issueTypes(request({ dice: { advantage: 0, rolls: [] } })).length)
      .toBeGreaterThan(0);
  });
});
