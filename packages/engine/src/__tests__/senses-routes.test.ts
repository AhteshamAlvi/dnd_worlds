/*
 * Cues, receivers and the routes generated from them.
 *
 * The boundary this suite defends is the one the whole redesign rests on: an
 * EVENT NEVER NAMES A RECEIVER. A torch emits light; it does not emit "light
 * into your left eye". Everything about which organ caught a cue is derived
 * from the observer's own profile plus whatever exposure the caller could
 * honestly supply.
 *
 * The second property is that several receivers are several CANDIDATES and
 * still one roll. A creature with eyes in its face and an eye in its palm has
 * two genuine ways to see the same thing; it does not get two chances.
 */

import { describe, expect, it } from "vitest";

import { findSensoryCueIssues } from "../character/foundation/senses/cues";
import {
  canonicalReceiver,
  isCoatableReceiver,
  receiverKey,
  receiverPointIds,
  sameSensoryReceiver,
} from "../character/foundation/senses/receivers";
import {
  generateSensoryRoutes,
  sameSensoryRoute,
  sameSensoryRouteTerms,
  sensoryRouteKey,
  sensoryRouteTermsKey,
} from "../character/foundation/senses/routes";
import { resolveSensoryAccess } from "../character/foundation/senses/access";

import {
  cue,
  effects,
  generatedRoutes,
  sensoryProfile,
  source,
} from "./fixtures/senses";

const PROFILE = sensoryProfile();
const AWAKENED = sensoryProfile({ nenAwakened: true });

const LEFT_EYE = "left-eye:head-1";
const RIGHT_EYE = "right-eye:head-1";

const EYES = {
  kind: "anatomical" as const,
  clusterKey: "head-1/sight/facial-eyes",
  pointIds: [LEFT_EYE, RIGHT_EYE],
};


describe("cue validation", () => {
  it("accepts one intensity per registered channel", () => {
    expect(findSensoryCueIssues(cue({
      emissions: { "visible-light": 3, sound: 7 },
    }))).toEqual([]);
  });

  it("refuses an emission map with nothing in it", () => {
    expect(findSensoryCueIssues(cue({ emissions: {} })).map((one) => one.type))
      .toContain("emissions-empty");
  });

  it("refuses intensity 0, which is not a quieter emission but no emission", () => {
    expect(
      findSensoryCueIssues(cue({ emissions: { sound: 0 as never } }))
        .map((one) => one.type),
    ).toContain("intensity-invalid");
  });

  it("refuses intensity 11 and anything fractional", () => {
    for (const bad of [11, 2.5, -3]) {
      expect(
        findSensoryCueIssues(cue({ emissions: { sound: bad as never } }))
          .map((one) => one.type),
      ).toContain("intensity-invalid");
    }
  });

  it("refuses an unregistered channel", () => {
    expect(
      findSensoryCueIssues(cue({ emissions: { "tachyon-flux": 5 } as never }))
        .map((one) => one.type),
    ).toContain("channel-unknown");
  });

  it("refuses a blank id, a bad phenomenon and a bad subject", () => {
    const issues = findSensoryCueIssues({
      ...cue(),
      id: "   ",
      phenomenon: "vibes" as never,
      subject: "vibes" as never,
    }).map((one) => one.type);

    expect(issues).toContain("identifier-missing");
    expect(issues).toContain("phenomenon-invalid");
    expect(issues).toContain("subject-invalid");
  });

  it("cannot declare one channel twice, because the map is a map", () => {
    /*
     * Stated as a structural fact rather than a rule to enforce. An emission
     * map keyed by channel makes "two intensities on one channel" unwritable,
     * which is a stronger guarantee than a validator that refuses it.
     */
    const emissions: Record<string, number> = Object.fromEntries([
      ["sound", 3],
      ["sound", 7],
    ]);

    expect(Object.keys(emissions)).toEqual(["sound"]);
    expect(emissions["sound"]).toBe(7);
  });
});


describe("receiver identity", () => {
  it("does not depend on the order the point ids arrived in", () => {
    const forwards = { ...EYES, pointIds: [LEFT_EYE, RIGHT_EYE] };
    const backwards = { ...EYES, pointIds: [RIGHT_EYE, LEFT_EYE] };

    expect(receiverKey(forwards)).toBe(receiverKey(backwards));
    expect(sameSensoryReceiver(forwards, backwards)).toBe(true);
  });

  it("deduplicates a repeated point id", () => {
    expect(receiverKey({ ...EYES, pointIds: [LEFT_EYE, LEFT_EYE] }))
      .toBe(receiverKey({ ...EYES, pointIds: [LEFT_EYE] }));
  });

  it("canonicalizes the stored form, not just the key", () => {
    expect(canonicalReceiver({ ...EYES, pointIds: [RIGHT_EYE, LEFT_EYE] }))
      .toEqual({ ...EYES, pointIds: [LEFT_EYE, RIGHT_EYE] });
  });

  it("keeps a cluster and a network with the same members distinct", () => {
    const cluster = { ...EYES, pointIds: [LEFT_EYE] };
    const network = {
      kind: "distributed-network" as const,
      networkId: "head-1/sight/facial-eyes",
      pointIds: [LEFT_EYE],
    };

    expect(receiverKey(cluster)).not.toBe(receiverKey(network));
  });

  it("identifies a grant by its provenance, so two grants are two receivers", () => {
    const first = { kind: "granted" as const, source: source("third-eye") };
    const second = { kind: "granted" as const, source: source("premonition") };

    expect(receiverKey(first)).not.toBe(receiverKey(second));
    expect(receiverPointIds(first)).toEqual([]);
  });

  it("marks a grant as the one receiver a coating cannot reach", () => {
    expect(isCoatableReceiver(EYES)).toBe(true);
    expect(isCoatableReceiver({
      kind: "granted",
      source: source("third-eye"),
    })).toBe(false);
  });
});


describe("route identity", () => {
  const BASE = {
    sense: "sight",
    channel: "visible-light",
    phenomenon: "physical" as const,
    subject: "entity" as const,
    receiver: EYES,
  };

  it("includes the channel, so invisibility is not silence", () => {
    expect(sensoryRouteKey(BASE))
      .not.toBe(sensoryRouteKey({ ...BASE, channel: "thermal" }));
    expect(sameSensoryRouteTerms(BASE, { ...BASE, channel: "thermal" }))
      .toBe(false);
  });

  it("includes the receiver, so a palm is not a face", () => {
    const palm = {
      ...BASE,
      receiver: {
        kind: "anatomical" as const,
        clusterKey: "hand-1/sight/palm-eye",
        pointIds: ["eye:hand-1"],
      },
    };

    expect(sensoryRouteKey(BASE)).not.toBe(sensoryRouteKey(palm));
    expect(sameSensoryRoute(BASE, palm)).toBe(false);

    /* The four shared TERMS are identical, which is why Concealment omits it. */
    expect(sameSensoryRouteTerms(BASE, palm)).toBe(true);
  });

  it("is stable across point-id ordering", () => {
    expect(sensoryRouteKey(BASE)).toBe(sensoryRouteKey({
      ...BASE,
      receiver: { ...EYES, pointIds: [RIGHT_EYE, LEFT_EYE] },
    }));
  });

  it("keys the shared terms without the receiver", () => {
    expect(sensoryRouteTermsKey(BASE))
      .toBe("sight|visible-light|physical|entity");
  });
});


describe("generating routes", () => {
  it("never takes a receiver from the caller", () => {
    /*
     * The boundary, stated as a shape. A cue carries an id, provenance, a
     * phenomenon, a subject, emissions and at most an authored reception —
     * and nothing that names an organ.
     */
    expect(Object.keys(cue()).sort())
      .toEqual(["emissions", "id", "phenomenon", "source", "subject"]);
  });

  it("matches a channel against every available Sense that reads it", () => {
    const routes = generatedRoutes(PROFILE, {
      emissions: { "ground-vibration": 6 },
    }, { contactedPointIds: ["tactile-surface:foot-1", "palm:hand-1"] });

    /*
     * A Human reads ground vibration through Touch alone — and through THREE
     * of Touch's receivers, because a palm, the other palm and the whole-body
     * network are genuinely different places to feel it. A creature with
     * Vibration Sense would add a fourth here without any code changing.
     */
    expect(new Set(routes.map((one) => one.route.sense))).toEqual(
      new Set(["touch"]),
    );
    expect(routes.length).toBeGreaterThan(1);
  });

  it("generates one candidate per receiver, for the sweep to compare", () => {
    const routes = generatedRoutes(PROFILE, {
      emissions: { "surface-pressure": 5 },
    }, {
      contactedPointIds: ["palm:hand-1", "tactile-surface:upper-body-1"],
    });

    const keys = routes.map((one) => receiverKey(one.route.receiver));

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.some((key) => key.includes("hand-1/touch/palm"))).toBe(true);
    expect(keys.some((key) => key.startsWith("network:"))).toBe(true);
  });

  it("gives every generated route the cue's provenance, unchanged", () => {
    const routes = generatedRoutes(PROFILE, {
      source: source("thrown-knife", "action"),
    });

    for (const route of routes) {
      expect(route.source).toEqual(source("thrown-knife", "action"));
      expect(route.cueId).toBe("footstep");
    }
  });

  it("generates nothing for a Sense this creature does not have", () => {
    expect(generatedRoutes(PROFILE, { emissions: { "magnetic-field": 9 } }))
      .toEqual([]);
  });

  it("generates nothing through anatomy that has been destroyed", () => {
    const blind = sensoryProfile({
      pointStates: {
        [LEFT_EYE]: "archived-removed",
        [RIGHT_EYE]: "archived-removed",
      },
    });

    expect(generatedRoutes(blind, {})).toEqual([]);
  });

  it("drops one ruined receiver and keeps the others", () => {
    const profile = sensoryProfile({
      pointStates: { "palm:hand-1": "archived-removed" },
    });

    const routes = generateSensoryRoutes({
      profile,
      cue: cue({ emissions: { "surface-pressure": 5 } }),
      exposure: {
        contactedPointIds: ["palm:hand-1", "palm:hand-2"],
      },
    });

    const keys = routes.map((one) => receiverKey(one.route.receiver));

    expect(keys.some((key) => key.includes("hand-1/touch/palm"))).toBe(false);
    expect(keys.some((key) => key.includes("hand-2/touch/palm"))).toBe(true);
  });

  it("drops a blocked channel outright", () => {
    expect(generatedRoutes(PROFILE, {}, {
      blockedChannels: ["visible-light"],
    })).toEqual([]);
  });

  it("drops a blocked receiver and leaves the others", () => {
    const routes = generatedRoutes(PROFILE, {
      emissions: { "surface-pressure": 5 },
    }, {
      contactedPointIds: ["palm:hand-1", "palm:hand-2"],
      blockedReceiverKeys: ["anatomical:hand-1/touch/palm:palm:hand-1"],
    });

    expect(routes.some((one) =>
      receiverKey(one.route.receiver).includes("hand-1/touch/palm")
    )).toBe(false);
  });

  it("blindfolds the face without blinding a hypothetical palm eye", () => {
    /*
     * Exposure is how a blindfold is expressed: the eyes are still there and
     * still working, they simply cannot be reached. No Effect, no suppression,
     * and nothing that would also have covered an eye somewhere else.
     */
    expect(generatedRoutes(PROFILE, {}, { exposedReceiverKeys: [] }))
      .toEqual([]);
    expect(generatedRoutes(PROFILE, {}, {
      exposedReceiverKeys: [receiverKey(EYES)],
    })).toHaveLength(1);
  });

  it("refuses a contact channel by default and opens it on contact", () => {
    expect(generatedRoutes(PROFILE, { emissions: { "contact-chemical": 5 } }))
      .toEqual([]);

    expect(generatedRoutes(PROFILE, {
      emissions: { "contact-chemical": 5 },
    }, { contactedPointIds: ["tongue:head-1"] })).toHaveLength(1);
  });

  it("lets a caller name a contacted receiver for a Sense with no anatomy", () => {
    const profile = sensoryProfile({
      effects: effects({
        senseGrants: [{ source: source("phantom-touch"), sense: "touch" }],
      }),
    });

    const granted = profile.senses.touch!.receivers
      .find((one) => one.ref.kind === "granted")!;

    expect(generateSensoryRoutes({
      profile,
      cue: cue({ emissions: { "surface-pressure": 5 } }),
      exposure: { contactedReceiverKeys: [granted.key] },
    }).some((one) => one.route.receiver.kind === "granted")).toBe(true);
  });

  it("applies a reception modifier to the arriving intensity, once", () => {
    const nightVision = sensoryProfile({
      effects: effects({
        senseChannelReception: [{
          source: source("night-vision"),
          sense: { kind: "specific", sense: "sight" },
          channel: "visible-light",
          amount: 2,
        }],
      }),
    });

    const dim = generatedRoutes(nightVision, {
      emissions: { "visible-light": 2 },
    })[0]!;

    expect(dim.emittedIntensity).toBe(2);
    expect(dim.receivedIntensity).toBe(4);
    expect(dim.intensityModifier).toBe(-1);
  });

  it("clamps a reception modifier into the scale rather than off the end", () => {
    const dazzling = sensoryProfile({
      effects: effects({
        senseChannelReception: [{
          source: source("night-vision"),
          sense: { kind: "specific", sense: "sight" },
          channel: "visible-light",
          amount: 8,
        }],
      }),
    });

    const route = generatedRoutes(dazzling, {
      emissions: { "visible-light": 9 },
    })[0]!;

    expect(route.receivedIntensity).toBe(10);
    expect(route.intensityModifier).toBe(5);
  });

  it("respects a restricted grant's enabled channels", () => {
    const premonition = sensoryProfile({
      effects: effects({
        senseGrants: [{
          source: source("premonition"),
          sense: "esp",
          enabledChannels: ["danger"],
        }],
      }),
    });

    expect(generatedRoutes(premonition, { emissions: { danger: 7 } }))
      .toHaveLength(1);
    expect(generatedRoutes(premonition, { emissions: { "hostile-intent": 7 } }))
      .toEqual([]);
  });

  it("orders its output deterministically, channels and receivers sorted", () => {
    const once = generatedRoutes(AWAKENED, {
      emissions: { "visible-light": 4, sound: 6, aura: 8 },
    });
    const twice = generatedRoutes(AWAKENED, {
      emissions: { aura: 8, sound: 6, "visible-light": 4 },
    });

    expect(once.map((one) => sensoryRouteKey(one.route)))
      .toEqual(twice.map((one) => sensoryRouteKey(one.route)));
    expect(once.map((one) => one.route.channel))
      .toEqual(["aura", "sound", "visible-light"]);
  });

  it("lets a host assert a route the rules would not have produced", () => {
    const override = {
      route: {
        sense: "sight",
        channel: "visible-light",
        receiver: EYES,
        phenomenon: "other-supernatural" as const,
        subject: "phenomenon" as const,
      },
      cueId: "gm-ruling",
      source: source("gm", "host"),
      emittedIntensity: 7 as const,
      receivedIntensity: 7 as const,
      intensityModifier: 2,
    };

    const routes = generateSensoryRoutes({
      profile: PROFILE,
      cue: cue({ emissions: { "magnetic-field": 9 } }),
      overrides: [override],
    });

    /*
     * The ordinary rules produced nothing here — a Human reads no magnetic
     * field — and the override still arrives, unfiltered. That is the point of
     * an override: it is not asking to be second-guessed by the exposure facts.
     */
    expect(routes).toEqual([override]);
  });
});


describe("access", () => {
  it("hands back the routes that made it accessible", () => {
    const access = resolveSensoryAccess({ profile: PROFILE, cue: cue() });

    expect(access.accessible).toBe(true);
    expect(access.accessible === true && access.routes).toHaveLength(1);
  });

  it("reports no compatible route rather than guessing a reason", () => {
    const access = resolveSensoryAccess({
      profile: PROFILE,
      cue: cue({ emissions: { "magnetic-field": 9 } }),
    });

    expect(access.accessible).toBe(false);
    expect(access.accessible === false && access.reason)
      .toBe("no-compatible-route");
  });

  it("refuses an authored impossibility before generating anything", () => {
    const access = resolveSensoryAccess({
      profile: PROFILE,
      cue: cue({ reception: { kind: "impossible", reason: "sealed in stone" } }),
    });

    expect(access.accessible === false && access.reason)
      .toBe("authored-impossible");
    expect(access.accessible === false && access.detail)
      .toBe("sealed in stone");
  });
});


/*
 * Routes are generated from the observer's RESOLVED profile.
 *
 * Starting from `sensesReceiving(channel)` answered "which Senses were
 * authored to read this channel", which is a different question from "which of
 * this creature's receivers reads it". The difference is a runtime
 * `grantSenseChannel`, which opened a channel no definition listed and could
 * therefore produce no route at all.
 */
describe("routes follow receiver channels", () => {
  const PREMONITION = {
    source: source("premonition"),
    sense: "esp",
    enabledChannels: ["danger"],
  };

  const EMPATHY = {
    source: source("empathy"),
    sense: "esp",
    enabledChannels: ["presence"],
  };

  const TWO_GRANTS = sensoryProfile({
    effects: effects({ senseGrants: [PREMONITION, EMPATHY] }),
  });

  it("routes each restricted grant's channel through that grant alone", () => {
    const danger = generatedRoutes(TWO_GRANTS, { emissions: { danger: 7 } });
    const presence = generatedRoutes(TWO_GRANTS, { emissions: { presence: 7 } });

    expect(danger).toHaveLength(1);
    expect(receiverKey(danger[0]!.route.receiver))
      .toBe("granted:trait:premonition");

    expect(presence).toHaveLength(1);
    expect(receiverKey(presence[0]!.route.receiver))
      .toBe("granted:trait:empathy");
  });

  it("generates nothing for a channel neither grant enabled", () => {
    expect(generatedRoutes(TWO_GRANTS, { emissions: { "hostile-intent": 7 } }))
      .toEqual([]);
  });

  it("produces identical routes whichever order the grants arrived in", () => {
    const reversed = sensoryProfile({
      effects: effects({ senseGrants: [EMPATHY, PREMONITION] }),
    });

    for (const channel of ["danger", "presence"] as const) {
      expect(
        generatedRoutes(reversed, { emissions: { [channel]: 7 } })
          .map((one) => sensoryRouteKey(one.route)),
      ).toEqual(
        generatedRoutes(TWO_GRANTS, { emissions: { [channel]: 7 } })
          .map((one) => sensoryRouteKey(one.route)),
      );
    }
  });

  it("emits candidates in canonical receiver order, whatever order the grants arrived", () => {
    /*
     * Two grants that both read `danger`, so the channel genuinely has two
     * receivers and their order is expressible. It is the order the sweep
     * compares candidates in and the order a best-route tie breaks on, so it
     * may not be the order the host assembled its Effects in.
     */
    const OMEN = {
      source: source("omen"),
      sense: "esp",
      enabledChannels: ["danger", "presence"],
    };

    const forwards = sensoryProfile({
      effects: effects({ senseGrants: [PREMONITION, OMEN] }),
    });
    const backwards = sensoryProfile({
      effects: effects({ senseGrants: [OMEN, PREMONITION] }),
    });

    const keysOf = (profile: typeof forwards) =>
      generatedRoutes(profile, { emissions: { danger: 7 } })
        .map((one) => sensoryRouteKey(one.route));

    expect(keysOf(forwards)).toEqual(keysOf(backwards));
    expect(keysOf(forwards)).toHaveLength(2);
    expect(keysOf(forwards).map((key) => key.split("|").at(-1)))
      .toEqual(["granted:trait:omen", "granted:trait:premonition"]);
  });

  it("opens a route on a channel the Sense definition never listed", () => {
    /*
     * A Human reads no thermal channel through any Sense they have, so the
     * Effect is the only thing that could produce this route — and the eyes it
     * lands on are ordinary anatomy, not a grant.
     */
    const pitOrgans = sensoryProfile({
      effects: effects({
        senseChannelGrants: [{
          source: source("pit-organs"),
          sense: "sight",
          channel: "thermal",
        }],
      }),
    });

    expect(generatedRoutes(PROFILE, { emissions: { thermal: 6 } })).toEqual([]);

    const routes = generatedRoutes(pitOrgans, { emissions: { thermal: 6 } });

    expect(routes).toHaveLength(1);
    expect(routes[0]!.route.sense).toBe("sight");
    expect(receiverKey(routes[0]!.route.receiver)).toBe(receiverKey(EYES));
  });

  it("drops a channel suppressed on the receiver that would have carried it", () => {
    const deaf = sensoryProfile({
      effects: effects({
        senseChannelSuppressions: [{
          source: source("numbness", "condition"),
          sense: { kind: "specific", sense: "touch" },
          channel: "air-displacement",
        }],
      }),
    });

    expect(generatedRoutes(PROFILE, { emissions: { "air-displacement": 6 } })
      .length).toBeGreaterThan(0);
    expect(generatedRoutes(deaf, { emissions: { "air-displacement": 6 } }))
      .toEqual([]);
  });

  it("produces one canonical route from duplicated grant data", () => {
    /*
     * Two grants with identical provenance are two entries and one receiver in
     * the world. A sweep that saw it twice would compare the creature against
     * itself and call the tie a second chance.
     */
    const duplicated = sensoryProfile({
      effects: effects({
        senseGrants: [
          { source: source("third-eye"), sense: "esp" },
          { source: source("third-eye"), sense: "esp" },
        ],
      }),
    });

    const routes = generatedRoutes(duplicated, { emissions: { danger: 7 } });

    expect(routes).toHaveLength(1);
    expect(new Set(routes.map((one) => sensoryRouteKey(one.route))).size)
      .toBe(routes.length);
  });

  it("still offers both receivers of one Sense as separate candidates", () => {
    const routes = generatedRoutes(
      PROFILE,
      { emissions: { "surface-pressure": 6 } },
      { contactedPointIds: ["palm:hand-1", "tactile-surface:upper-body-1"] },
    );

    expect(routes.length).toBeGreaterThan(1);
    expect(new Set(routes.map((one) => sensoryRouteKey(one.route))).size)
      .toBe(routes.length);
  });
});
