/*
 * Extrasensory Perception.
 *
 * ESP is the Sense this redesign changed most, and the change is almost
 * entirely subtraction. It used to unlock automatically at PER 22 and SPI 20,
 * which meant every high-Perception character silently acquired precognition
 * at a threshold nobody had chosen and nothing on their sheet mentioned. That
 * rule is gone — not disabled behind a flag, gone — and what replaced it is
 * one line on its definition: `availability: "granted"`.
 *
 * The other half of this suite is the part that is deliberately NOT special.
 * A successful ESP Detection locates what it found, opens an ordinary
 * Reaction, and breaks Concealment for that observer, because it goes through
 * exactly the same Gate every other route goes through. There is no ESP branch
 * anywhere in Detection, and the absence is what these tests prove.
 */

import { describe, expect, it } from "vitest";

import { payloadOf } from "./fixtures/result";

import { getSenseDefinition } from "../character/foundation/senses/definitions";
import { getResolvedSense } from "../character/foundation/senses/types";
import { generateSensoryRoutes } from "../character/foundation/senses/routes";
import {
  establishConcealment,
  establishConcealmentState,
  isConcealedFrom,
} from "../character/foundation/senses/concealment";
import { resolveDetectionCheck } from "../character/foundation/senses/detection";
import { sweepPassiveDetectionRoutes } from "../character/foundation/senses/detection";
import { resolveActiveSearch } from "../character/senses/search";
import { sensoryGyoFocusGroups } from "../gameplay/nen";

import {
  cue,
  effects,
  roll,
  sensoryProfile,
  sensoryStats,
  source,
} from "./fixtures/senses";

const ESP_CHANNELS = [
  "danger",
  "hostile-intent",
  "presence",
  "metaphysical-anomaly",
  "causal-disturbance",
] as const;

const THIRD_EYE = { source: source("third-eye"), sense: "esp" };

function espProfile(
  enabledChannels?: readonly string[],
  attributes: Record<string, number> = {},
) {
  return sensoryProfile({
    effects: effects({
      senseGrants: [
        enabledChannels === undefined
          ? THIRD_EYE
          : { ...THIRD_EYE, enabledChannels },
      ],
    }),
  }, attributes);
}


describe("ESP has no automatic unlock", () => {
  it("is grant-only on its definition, with no threshold anywhere", () => {
    expect(getSenseDefinition("esp")!.availability).toBe("granted");
  });

  it("stays unavailable at any PER and SPI at all", () => {
    for (const [per, spi] of [[22, 20], [30, 30], [25, 21], [30, 1]] as const) {
      const profile = sensoryProfile({}, { per, spi });

      expect([per, spi, getResolvedSense(profile, "esp")])
        .toEqual([per, spi, undefined]);
    }
  });

  it("generates no route for an ESP channel without a grant", () => {
    expect(generateSensoryRoutes({
      profile: sensoryProfile({}, { per: 30, spi: 30 }),
      cue: cue({ emissions: { danger: 9 } }),
    })).toEqual([]);
  });
});


describe("a granted ESP", () => {
  it("scores the floor-average of PER and SPI", () => {
    expect(getResolvedSense(espProfile(undefined, { per: 17, spi: 12 }), "esp")!.score)
      .toBe(14);
    expect(getResolvedSense(espProfile(undefined, { per: 20, spi: 20 }), "esp")!.score)
      .toBe(20);
    expect(getResolvedSense(espProfile(undefined, { per: 3, spi: 2 }), "esp")!.score)
      .toBe(2);
  });

  it("is not PER alone", () => {
    const highPer = getResolvedSense(espProfile(undefined, { per: 20, spi: 4 }), "esp")!;

    expect(highPer.score).toBe(12);
    expect(highPer.score).not.toBe(20);
  });

  it("receives every ESP channel when the grant restricts nothing", () => {
    expect(getResolvedSense(espProfile(), "esp")!.channels)
      .toEqual([...ESP_CHANNELS].sort());
  });

  it.each(ESP_CHANNELS)("can be granted %s and nothing else", (channel) => {
    const profile = espProfile([channel]);

    expect(getResolvedSense(profile, "esp")!.channels).toEqual([channel]);

    for (const other of ESP_CHANNELS) {
      expect([
        channel,
        other,
        generateSensoryRoutes({
          profile,
          cue: cue({ emissions: { [other]: 7 } }),
        }).length,
      ]).toEqual([channel, other, other === channel ? 1 : 0]);
    }
  });

  it("can be granted a subset of more than one channel", () => {
    const profile = espProfile(["danger", "presence"]);

    expect(getResolvedSense(profile, "esp")!.channels)
      .toEqual(["danger", "presence"]);
  });

  it("resolves a grant receiver, which no anatomy corresponds to", () => {
    const esp = getResolvedSense(espProfile(), "esp")!;

    expect(esp.receivers).toHaveLength(1);
    expect(esp.receivers[0]!.ref.kind).toBe("granted");
    expect(esp.anatomy).toEqual([]);
  });
});


describe("Sensory Gyō cannot reach a nonanatomical ESP", () => {
  it("offers no focus group for a granted receiver", () => {
    const groups = sensoryGyoFocusGroups(espProfile());

    expect(groups.some((group) => group.senseId === "esp")).toBe(false);
  });

  it("offers groups for the anatomical Senses of the same character", () => {
    const groups = sensoryGyoFocusGroups(espProfile());

    expect(groups.some((group) => group.senseId === "sight")).toBe(true);
  });

  it("offers one when ESP DOES come from anatomy", () => {
    /*
     * The rule is about the receiver rather than about ESP. A creature with a
     * real organ for it has a real place to concentrate into, and this file
     * does not have to know which Sense that organ serves.
     */
    const profile = sensoryProfile({
      effects: effects({
        senseGrants: [THIRD_EYE],
      }),
    });

    const withAnatomy = {
      ...profile,
      senses: {
        ...profile.senses,
        esp: {
          ...getResolvedSense(profile, "esp")!,
          receivers: [{
            ref: {
              kind: "anatomical" as const,
              clusterKey: "head-1/esp/third-eye",
              pointIds: ["third-eye:head-1"],
            },
            key: "anatomical:head-1/esp/third-eye:third-eye:head-1",
            functionalSupport: 1,
            channels: ["danger"],
          }],
        },
      },
    };

    expect(sensoryGyoFocusGroups(withAnatomy).some((group) =>
      group.senseId === "esp"
    )).toBe(true);
  });
});


describe("a successful ESP Detection locates what it found", () => {
  const PROFILE = espProfile();

  const DANGER_ROUTE = generateSensoryRoutes({
    profile: PROFILE,
    cue: cue({
      id: "incoming-blade",
      emissions: { danger: 5 },
      phenomenon: "intent",
      subject: "threat",
    }),
  })[0]!;

  function hidden(retained = 4) {
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
        routes: [{
          sense: "esp",
          channel: "danger",
          phenomenon: "intent",
          subject: "threat",
        }],
        dice: roll(retained),
      })),
      at: 0,
    }));
  }

  it("produces an ordinary route with an ordinary intensity contribution", () => {
    expect(DANGER_ROUTE.route.sense).toBe("esp");
    expect(DANGER_ROUTE.route.channel).toBe("danger");
    expect(DANGER_ROUTE.intensityModifier).toBe(0);
  });

  it("resolves through the same Detection resolver as any other route", () => {
    const state = hidden();
    const result = payloadOf(resolveDetectionCheck({
      mode: "active",
      profile: PROFILE,
      route: DANGER_ROUTE,
      concealment: state.ratings[0]!,
      dice: roll(20),
    }));

    expect(result.detected).toBe(true);
    expect(result.route).toEqual(DANGER_ROUTE.route);
  });

  it("breaks that observer's Concealment on a successful search", () => {
    const state = hidden();
    const search = payloadOf(resolveActiveSearch({
      observerId: "gon",
      profile: PROFILE,
      route: DANGER_ROUTE,
      concealment: state,
      dice: roll(20),
      at: 1,
    }));

    expect(search.detection.detected).toBe(true);
    expect(isConcealedFrom(search.concealment, "gon")).toBe(false);

    /* One observer's success, and nobody else's. */
    expect(isConcealedFrom(search.concealment, "killua")).toBe(true);
  });

  it("leaves Concealment intact when the ESP check misses", () => {
    const state = hidden(18);
    const search = payloadOf(resolveActiveSearch({
      observerId: "gon",
      profile: PROFILE,
      route: DANGER_ROUTE,
      concealment: state,
      dice: roll(1),
      at: 1,
    }));

    expect(search.detection.detected).toBe(false);
    expect(isConcealedFrom(search.concealment, "gon")).toBe(true);
  });

  it("competes for the best route against ordinary senses, and never adds a roll", () => {
    const sight = generateSensoryRoutes({
      profile: PROFILE,
      cue: cue({
        id: "incoming-blade",
        emissions: { "visible-light": 5 },
        phenomenon: "intent",
        subject: "threat",
      }),
    })[0]!;

    const state = hidden();

    const sweep = payloadOf(sweepPassiveDetectionRoutes({
      profile: PROFILE,
      routes: [
        { route: DANGER_ROUTE, concealment: state.ratings[0]! },
        {
          route: sight,
          concealment: {
            ...state.ratings[0]!,
            route: {
              sense: "sight",
              channel: "visible-light",
              phenomenon: "intent",
              subject: "threat",
            },
          },
        },
      ],
    }));

    /* Two routes compared, ONE best, and no dice requested by any of it. */
    expect(sweep.results).toHaveLength(2);
    expect(sweep.best.check).toBeUndefined();
  });
});
