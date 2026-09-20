/*
 * Deliberately looking for something, and what Nen contributes to hiding from
 * it.
 *
 * The property this file exists to pin down: an active search does NOT inherit
 * the Concealment Lead penalty. The Lead measures surprise, and a character who
 * stopped and chose to look is not surprised. Charging it here would mean the
 * better an ambusher hid, the worse a methodical search performed.
 */

import { describe, expect, it } from "vitest";

import { errorCodesOf, payloadOf } from "./fixtures/result";

import { establishConcealment } from "../character/foundation/senses/concealment/established";
import {
  establishConcealmentState,
  isConcealedFrom,
  recordConcealmentDetection,
  type EstablishedConcealmentState,
} from "../character/foundation/senses/concealment/state";
import { deriveConcealmentReactionDisadvantages } from "../character/foundation/senses/detection/outcome";
import { resolveActiveSearch } from "../character/senses/search";
import {
  NEN_PRESENCE_EVIDENCE_ID,
  resolveNenConcealmentModifiers,
} from "../character/senses/nen-concealment";
import { resolveCheckModifier } from "../checks/modifiers";

import {
  generatedRoute,
  roll,
  route,
  sensoryProfile,
  sensoryStats,
  source,
} from "./fixtures/senses";
import { standardAwakenedNen } from "./fixtures/nen";
import { startZetsu } from "../character/nen/zetsu";
import { emptyNenActivityRuntime } from "../character/foundation/nen/runtime";
import type { NenActivityRuntime } from "../character/foundation/nen/runtime";
import type { NenState } from "../character/foundation/nen/types";

/*
 * A minimum viable running Zetsu.
 *
 * Deliberately local rather than shared with nen-zetsu.test.ts. That suite owns
 * the Zetsu mechanic and builds runtimes for a dozen different questions; this
 * one needs exactly "a Zetsu of rank N is running" and nothing else, and pulling
 * its helpers out into a fixture would couple two suites that have no reason to
 * move together.
 */
const T0 = 1_000_000_000;
const SELF = { type: "character", id: "subject" } as const;

function nenWith(zetsu: number): NenState {
  const base = standardAwakenedNen();

  return {
    ...base,
    mastery: { ...base.mastery, ten: 1, ren: 1, zetsu } as NenState["mastery"],
  };
}

function runtimeFor(): NenActivityRuntime {
  return emptyNenActivityRuntime("nen:subject", T0);
}

function inZetsu(nen: NenState): NenActivityRuntime {
  const started = startZetsu(runtimeFor(), {
    activityId: "zetsu-1",
    source: SELF,
    at: T0,
    nen,
  });

  if (!started.success) {
    throw new Error("Zetsu fixture failed to start.");
  }

  return started.payload.runtime;
}

const SIGHT = route();
const HEARING = route({ sense: "hearing", channel: "sound" });
const NEN_PRESENCE = route({
  sense: "aura-perception",
  channel: "aura",
  phenomenon: "nen",
  subject: "entity",
});

/* Concealment Derived Attribute: round((DEX 12 + WIS 14) / 2) = 13 -> +1. */
const CONCEALMENT_MODIFIER = 1;

/* Sight Detection: round((PER 16 + WIS 14) / 2) = 15 -> +2. */
const SIGHT_DETECTION_MODIFIER = 2;

const PROFILE = sensoryProfile();
const AWAKENED = sensoryProfile({ nenAwakened: true });

function generated(
  sense: "sight" | "hearing" | "aura-perception" = "sight",
  profile = PROFILE,
) {
  const channel = sense === "sight"
    ? "visible-light"
    : sense === "hearing"
      ? "sound"
      : "aura";

  return generatedRoute(profile, {
    id: `${sense}-cue`,
    emissions: { [channel]: 5 },
    ...(sense === "aura-perception"
      ? { phenomenon: "nen" as const }
      : {}),
  });
}

function hidden(retained = 13): EstablishedConcealmentState {
  return payloadOf(establishConcealmentState({
    attemptId: "attempt-1",
    subjectId: "assassin",
    sourceId: "assassin",
    resolution: payloadOf(establishConcealment({
      basis: {
        kind: "character",
        stats: sensoryStats(),
        profile: sensoryProfile(),
      },
      routes: [SIGHT, HEARING],
      dice: roll(retained),
    })),
    at: 0,
  }));
}

function search(overrides: Partial<Parameters<typeof resolveActiveSearch>[0]> = {}) {
  return resolveActiveSearch({
    observerId: "gon",
    profile: sensoryProfile(),
    route: generated(),
    concealment: hidden(),
    dice: roll(20),
    at: 1,
    ...overrides,
  });
}


describe("active searching", () => {
  it("rolls against the retained Concealment total", () => {
    const result = payloadOf(search({ dice: roll(20) }));

    expect(result.detection.mode).toBe("active");
    expect(result.detection.concealmentTotal).toBe(13 + CONCEALMENT_MODIFIER);
    expect(result.detection.observerTotal).toBe(20 + SIGHT_DETECTION_MODIFIER);
    expect(result.detection.detected).toBe(true);
  });

  it("fails a tie", () => {
    /* 12 + 2 = 14, against a retained 13 + 1 = 14. */
    const result = payloadOf(search({ dice: roll(12) }));

    expect(result.detection.margin).toBe(0);
    expect(result.detection.detected).toBe(false);
  });

  it("does not inherit the Concealment Lead penalty", () => {
    /*
     * The concealment here is far ahead of this observer's passive Detection —
     * a Lead that would be worth four Reaction disadvantages — and the search
     * still rolls the single d20 it was handed.
     */
    const state = hidden(20);
    const lead = state.ratings[0]!.total - 5;

    expect(payloadOf(deriveConcealmentReactionDisadvantages(lead))).toBe(4);

    const result = payloadOf(search({
      concealment: state,
      dice: roll(20),
    }));

    expect(result.detection.check?.dice.advantage).toBe(0);
    expect(result.detection.check?.dice.rolls).toEqual([20]);
  });

  it("still applies ordinary contextual advantage", () => {
    const result = payloadOf(search({
      dice: { advantage: 1, rolls: [3, 19] },
    }));

    expect(result.detection.check?.dice.retainedRoll).toBe(19);
    expect(result.detection.detected).toBe(true);
  });

  it("still applies ordinary contextual disadvantage", () => {
    const result = payloadOf(search({
      dice: { advantage: -1, rolls: [3, 19] },
    }));

    expect(result.detection.check?.dice.retainedRoll).toBe(3);
    expect(result.detection.detected).toBe(false);
  });

  it("still applies contextual check modifiers", () => {
    const result = payloadOf(search({
      dice: roll(10),
      modifiers: [{
        source: source("torchlight", "environment"),
        scope: { kind: "detection", mode: { kind: "specific", mode: "active" } },
        amount: 5,
        channel: "contextual",
      }],
    }));

    expect(result.detection.observerTotal).toBe(10 + SIGHT_DETECTION_MODIFIER + 5);
  });

  it("breaks Concealment for the searcher alone", () => {
    const result = payloadOf(search({ dice: roll(20), observerId: "gon" }));

    expect(isConcealedFrom(result.concealment, "gon")).toBe(false);
    expect(isConcealedFrom(result.concealment, "killua")).toBe(true);
  });

  it("leaves Concealment exactly as it was on a failure", () => {
    const state = hidden();
    const result = payloadOf(search({ concealment: state, dice: roll(1) }));

    expect(result.detection.detected).toBe(false);
    expect(result.concealment).toBe(state);
    expect(isConcealedFrom(result.concealment, "gon")).toBe(true);
  });

  it("charges no Action or time of its own", () => {
    /*
     * The absence is the contract. The request carries already-rolled dice and
     * nothing resembling a cost, so the foundation cannot invent one.
     */
    const result = payloadOf(search());

    expect(result).not.toHaveProperty("actionsSpent");
    expect(result).not.toHaveProperty("duration");
  });

  it("refuses to search for a subject this observer already found", () => {
    const found = payloadOf(recordConcealmentDetection(hidden(), {
      attemptId: "attempt-1",
      observerId: "gon",
      at: 1,
    }));

    expect(errorCodesOf(search({ concealment: found, at: 2 })))
      .toContain("character.senses.search.already-detected");
  });

  it("refuses a route the attempt never covered", () => {
    expect(errorCodesOf(search({
      route: generatedRoute(PROFILE, {
        id: "smell-cue",
        emissions: { "airborne-chemical": 5 },
      }),
    }))).toContain("character.senses.search.route.uncovered");
  });

  it("produces no evidence when nothing was found", () => {
    expect(payloadOf(search({ dice: roll(1) })).evidenceIds).toEqual([]);
  });

  it("produces generic Nen-presence evidence when live Aura was found", () => {
    const state = payloadOf(establishConcealmentState({
      attemptId: "aura-attempt",
      subjectId: "assassin",
      sourceId: "assassin",
      resolution: payloadOf(establishConcealment({
        basis: {
          kind: "character",
          stats: sensoryStats(),
          profile: sensoryProfile(),
        },
        routes: [NEN_PRESENCE],
        dice: roll(2),
      })),
      at: 0,
    }));

    const result = payloadOf(search({
      profile: sensoryProfile({ nenAwakened: true }),
      concealment: state,
      route: generated("aura-perception", AWAKENED),
      dice: roll(20),
    }));

    expect(result.detection.detected).toBe(true);
    expect(result.evidenceIds).toEqual([NEN_PRESENCE_EVIDENCE_ID]);
  });

  it("produces no Nen evidence from a physical find", () => {
    expect(payloadOf(search({ dice: roll(20) })).evidenceIds).toEqual([]);
  });
});


describe("Zetsu as a Concealment modifier", () => {
  const nen = nenWith(10);

  function totalFor(
    modifiers: readonly Parameters<typeof resolveCheckModifier>[1][number][],
    scope: Parameters<typeof resolveCheckModifier>[2],
  ): number {
    return resolveCheckModifier(
      [{ id: "concealment.standardModifier", amount: CONCEALMENT_MODIFIER }],
      modifiers,
      scope,
    ).finalModifier;
  }

  it("reaches a Nen-presence Concealment check", () => {
    const modifiers = payloadOf(resolveNenConcealmentModifiers(inZetsu(nen), nen));

    expect(totalFor(modifiers, {
      kind: "concealment",
      mode: "established",
      sense: "extrasensory",
      channel: "visible-light",
      phenomenon: "nen",
      subject: "entity",
    })).toBe(CONCEALMENT_MODIFIER + 5);
  });

  it("applies through the universal modifier path, never to the score", () => {
    const modifiers = payloadOf(resolveNenConcealmentModifiers(inZetsu(nen), nen));

    for (const modifier of modifiers) {
      expect(modifier.channel).toBe("contextual");
      expect(modifier.scope.kind).toBe("concealment");
    }

    /* The character's own Concealment score is untouched by any of it. */
    expect(sensoryProfile().passiveConcealmentBase).toBe(3);
  });

  it("carries the running activity's own provenance", () => {
    const modifiers = payloadOf(resolveNenConcealmentModifiers(inZetsu(nen), nen));

    expect(modifiers[0]!.source).toBeDefined();
    expect(modifiers.every((modifier) => modifier.source === modifiers[0]!.source))
      .toBe(true);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const)(
    "reaches Nen-presence Concealment at Mastery %i",
    (rank) => {
      const EXPECTED = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5];
      const ranked = nenWith(rank);
      const modifiers = payloadOf(
        resolveNenConcealmentModifiers(inZetsu(ranked), ranked),
      );

      expect(totalFor(modifiers, {
        kind: "concealment",
        mode: "established",
        sense: "extrasensory",
        channel: "visible-light",
        phenomenon: "nen",
        subject: "entity",
      })).toBe(CONCEALMENT_MODIFIER + EXPECTED[rank - 1]!);
    },
  );

  it("reaches a Nen-presence phenomenon subject too", () => {
    const modifiers = payloadOf(resolveNenConcealmentModifiers(inZetsu(nen), nen));

    expect(totalFor(modifiers, {
      kind: "concealment",
      mode: "established",
      sense: "extrasensory",
      channel: "visible-light",
      phenomenon: "nen",
      subject: "phenomenon",
    })).toBe(CONCEALMENT_MODIFIER + 5);
  });

  it.each([
    ["sight of the body", {
      sense: "sight",
      channel: "visible-light",
      phenomenon: "physical",
      subject: "entity",
    }],
    ["footsteps", {
      sense: "hearing",
      channel: "sound",
      phenomenon: "physical",
      subject: "entity",
    }],
    ["a scent", {
      sense: "smell",
      channel: "airborne-chemical",
      phenomenon: "physical",
      subject: "entity",
    }],
    ["physical tracks", {
      sense: "sight",
      channel: "visible-light",
      phenomenon: "physical",
      subject: "trace",
    }],
    ["Nen residue left behind", {
      sense: "aura-perception",
      channel: "aura",
      phenomenon: "nen",
      subject: "trace",
    }],
  ] as const)("contributes nothing to %s", (_name, scope) => {
    const modifiers = payloadOf(resolveNenConcealmentModifiers(inZetsu(nen), nen));

    expect(totalFor(modifiers, { kind: "concealment", mode: "established", ...scope }))
      .toBe(CONCEALMENT_MODIFIER);
  });

  it("contributes nothing when no Zetsu is running", () => {
    expect(payloadOf(resolveNenConcealmentModifiers(runtimeFor(), nen))).toEqual([]);
  });

  it("refuses a malformed runtime rather than silently contributing nothing", () => {
    expect(
      resolveNenConcealmentModifiers({ ...runtimeFor(), at: Number.NaN }, nen).success,
    ).toBe(false);
  });
});
