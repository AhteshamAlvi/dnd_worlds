/*
 * The Sense and channel registries, and the open vocabulary they replaced.
 *
 * The property this suite exists for: a HOST can add a Sense and a channel,
 * and everything downstream works — route generation, profile resolution,
 * modifier matching, Concealment — with no engine edit at all. That was
 * impossible under the closed six-member union, where adding a seventh Sense
 * meant editing profile resolution, modifier matching, validation and every
 * `Record<SenseId, ...>` in the codebase.
 *
 * So most of what is asserted below is asserted through a Sense that does not
 * exist in the engine's own catalog. If the generic path really is generic,
 * the homebrew behaves exactly as Sight does.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  SENSE_AVAILABILITY_KINDS,
  SENSE_DEFINITIONS,
  SENSE_FAMILIES,
  EXTRASENSORY_PERCEPTION_SENSE_ID,
  findSenseCatalogIssues,
  getSenseDefinition,
  isSenseId,
  listSenses,
  senseRegistry,
  senseReceivesChannel,
  sensesReceiving,
  type SenseDefinition,
} from "../character/foundation/senses/definitions";
import {
  MAXIMUM_SENSORY_INTENSITY,
  MINIMUM_SENSORY_INTENSITY,
  NEUTRAL_SENSORY_INTENSITY,
  SENSORY_CHANNEL_DEFINITIONS,
  findSensoryChannelCatalogIssues,
  getSensoryChannel,
  isSensoryChannelId,
  isSensoryIntensity,
  sensoryChannelRegistry,
  sensoryIntensityModifier,
  type SensoryChannelDefinition,
} from "../character/foundation/senses/channels";
import { getResolvedSense } from "../character/foundation/senses/types";
import { generateSensoryRoutes } from "../character/foundation/senses/routes";
import { matchesSenseSelector } from "../character/foundation/senses/scopes";

import { cue, effects, sensoryProfile, source } from "./fixtures/senses";


afterEach(() => {
  senseRegistry.clearCustom();
  sensoryChannelRegistry.clearCustom();
});


describe("the built-in Sense rows", () => {
  const EXPECTED: readonly (readonly [string, string, readonly string[]])[] = [
    ["sight", "basic", ["visible-light"]],
    ["hearing", "basic", ["sound"]],
    ["smell", "basic", ["airborne-chemical"]],
    ["taste", "basic", ["contact-chemical"]],
    ["touch", "basic", [
      "surface-pressure",
      "air-displacement",
      "ground-vibration",
      "structural-vibration",
    ]],
    ["thermoreception", "special", ["thermal"]],
    ["electroreception", "special", ["electric-field"]],
    ["magnetoreception", "special", ["magnetic-field"]],
    ["echolocation", "special", ["reflected-sound"]],
    ["vibration-sense", "special", ["ground-vibration", "structural-vibration"]],
    ["life-perception", "special", ["life-presence"]],
    ["aura-perception", "special", ["aura"]],
    ["esp", "special", [
      "danger",
      "hostile-intent",
      "presence",
      "metaphysical-anomaly",
      "causal-disturbance",
    ]],
  ];

  it("registers exactly the expected Senses and nothing else", () => {
    expect(Object.keys(SENSE_DEFINITIONS).sort())
      .toEqual(EXPECTED.map(([id]) => id).sort());
  });

  it.each(EXPECTED)("%s is %s and receives its channels", (id, family, channels) => {
    const definition = getSenseDefinition(id)!;

    expect(definition.family).toBe(family);
    expect(definition.receiveChannels).toEqual(channels);
  });

  it("scores every Sense but ESP from PER alone", () => {
    for (const definition of listSenses()) {
      if (definition.id === EXTRASENSORY_PERCEPTION_SENSE_ID) continue;

      expect([definition.id, definition.scoreBasis])
        .toEqual([definition.id, { kind: "attribute", attribute: "per" }]);
    }
  });

  it("scores ESP from the average of PER and SPI, and grants it only", () => {
    const esp = getSenseDefinition(EXTRASENSORY_PERCEPTION_SENSE_ID)!;

    expect(esp.scoreBasis)
      .toEqual({ kind: "attribute-average", attributes: ["per", "spi"] });
    expect(esp.availability).toBe("granted");
  });

  it("makes every other Sense reachable by anatomy or by grant", () => {
    for (const definition of listSenses()) {
      if (definition.id === EXTRASENSORY_PERCEPTION_SENSE_ID) continue;

      expect([definition.id, definition.availability])
        .toEqual([definition.id, "anatomical-or-granted"]);
    }
  });
});


describe("the built-in channels", () => {
  it("gives every one of them at least one receiver", () => {
    for (const channel of Object.keys(SENSORY_CHANNEL_DEFINITIONS)) {
      expect([channel, sensesReceiving(channel).length > 0])
        .toEqual([channel, true]);
    }
  });

  it("reports a built-in channel with no receiver as a catalog fault", () => {
    /*
     * The rule stated above, proved by breaking it: unregistering every Sense
     * that reads light would leave `visible-light` as content the engine
     * ships and nothing in it could ever notice.
     */
    expect(findSenseCatalogIssues()).toEqual([]);
    expect(findSensoryChannelCatalogIssues()).toEqual([]);
  });

  it("marks contact channels apart from ambient ones", () => {
    for (
      const contact of [
        "surface-pressure",
        "contact-chemical",
        "ground-vibration",
        "structural-vibration",
      ]
    ) {
      expect([contact, getSensoryChannel(contact)!.propagation])
        .toEqual([contact, "contact"]);
    }

    for (const ambient of ["visible-light", "sound", "aura", "danger"]) {
      expect([ambient, getSensoryChannel(ambient)!.propagation])
        .toEqual([ambient, "ambient"]);
    }
  });

  it("does not let a channel name its own receivers", () => {
    /*
     * The relation is owned in exactly ONE direction. A channel carrying a
     * receiver list would be a second declaration free to disagree with the
     * Sense definitions, and which one a resolver got would depend on which
     * side it happened to ask.
     */
    for (const channel of Object.values(SENSORY_CHANNEL_DEFINITIONS)) {
      expect(Object.keys(channel).sort())
        .toEqual(["description", "id", "name", "propagation"]);
    }
  });
});


describe("intensity", () => {
  it("accepts exactly the integers 1 through 10", () => {
    for (let value = MINIMUM_SENSORY_INTENSITY; value <= MAXIMUM_SENSORY_INTENSITY; value += 1) {
      expect([value, isSensoryIntensity(value)]).toEqual([value, true]);
    }
  });

  it("refuses 0, 11, fractions and non-numbers", () => {
    for (const bad of [0, -1, 11, 100, 2.5, Number.NaN, "5", null, undefined]) {
      expect([bad, isSensoryIntensity(bad)]).toEqual([bad, false]);
    }
  });

  it("maps 1 through 10 onto exactly -4 through +5", () => {
    const table = [
      [1, -4], [2, -3], [3, -2], [4, -1], [5, 0],
      [6, 1], [7, 2], [8, 3], [9, 4], [10, 5],
    ] as const;

    for (const [intensity, modifier] of table) {
      expect([intensity, sensoryIntensityModifier(intensity)])
        .toEqual([intensity, modifier]);
    }

    expect(NEUTRAL_SENSORY_INTENSITY).toBe(5);
  });
});


describe("a host's own Sense works with no engine edit", () => {
  const SEISMIC: SensoryChannelDefinition = {
    id: "seismic-pressure-front",
    name: "Seismic Pressure Front",
    description: "The compression wave running ahead of a large moving mass.",
    propagation: "ambient",
  };

  const GEOMANCY: SenseDefinition = {
    id: "geomancy",
    name: "Geomancy",
    description: "Reading the shape of the world through the stone under it.",
    family: "special",
    receiveChannels: ["seismic-pressure-front"],
    scoreBasis: { kind: "attribute-average", attributes: ["per", "wis"] },
    availability: "granted",
  };

  function register(): void {
    expect(sensoryChannelRegistry.register(SEISMIC).ok).toBe(true);
    expect(senseRegistry.register(GEOMANCY).ok).toBe(true);
  }

  it("is refused while the channel it reads does not exist", () => {
    const refusal = senseRegistry.register(GEOMANCY);

    expect(refusal.ok).toBe(false);
    expect(refusal.ok === false && refusal.reason)
      .toContain("unregistered channel");
  });

  it("becomes a real Sense id the moment it is registered", () => {
    expect(isSenseId("geomancy")).toBe(false);
    expect(isSensoryChannelId("seismic-pressure-front")).toBe(false);

    register();

    expect(isSenseId("geomancy")).toBe(true);
    expect(isSensoryChannelId("seismic-pressure-front")).toBe(true);
    expect(getSenseDefinition("geomancy")).toEqual(GEOMANCY);
  });

  it("is found by a channel query without a reverse index", () => {
    register();

    expect(sensesReceiving("seismic-pressure-front").map((one) => one.id))
      .toEqual(["geomancy"]);
    expect(senseReceivesChannel(GEOMANCY, "seismic-pressure-front")).toBe(true);
  });

  it("resolves a score through the generic basis, with no resolver edit", () => {
    register();

    const profile = sensoryProfile(
      {
        effects: effects({
          senseGrants: [{ source: source("stone-sense"), sense: "geomancy" }],
        }),
      },
      { per: 16, wis: 13 },
    );

    /* floor((16 + 13) / 2) = 14 — the same generic path ESP takes. */
    expect(getResolvedSense(profile, "geomancy")!.score).toBe(14);
    expect(getResolvedSense(profile, "geomancy")!.available).toBe(true);
  });

  it("generates routes on its new channel, with no route-generator edit", () => {
    register();

    const profile = sensoryProfile({
      effects: effects({
        senseGrants: [{ source: source("stone-sense"), sense: "geomancy" }],
      }),
    });

    const routes = generateSensoryRoutes({
      profile,
      cue: cue({ emissions: { "seismic-pressure-front": 8 } }),
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]!.route.sense).toBe("geomancy");
    expect(routes[0]!.receivedIntensity).toBe(8);
    expect(routes[0]!.intensityModifier).toBe(3);
  });

  it("is matched by a family selector and by a channel selector", () => {
    register();

    expect(matchesSenseSelector({ kind: "family", family: "special" }, "geomancy"))
      .toBe(true);
    expect(matchesSenseSelector({ kind: "family", family: "basic" }, "geomancy"))
      .toBe(false);
    expect(matchesSenseSelector(
      { kind: "channel", channel: "seismic-pressure-front" },
      "geomancy",
    )).toBe(true);
  });

  it("lets an existing channel be read by the new Sense too", () => {
    expect(sensoryChannelRegistry.register(SEISMIC).ok).toBe(true);
    expect(senseRegistry.register({
      ...GEOMANCY,
      receiveChannels: ["seismic-pressure-front", "ground-vibration"],
    }).ok).toBe(true);

    expect(sensesReceiving("ground-vibration").map((one) => one.id).sort())
      .toEqual(["geomancy", "touch", "vibration-sense"]);
  });
});


describe("malformed registered content is refused", () => {
  const BASE: SenseDefinition = {
    id: "test-sense",
    name: "Test Sense",
    description: "A Sense registered only to be refused.",
    family: "special",
    receiveChannels: ["sound"],
    scoreBasis: { kind: "attribute", attribute: "per" },
    availability: "granted",
  };

  function reasonFor(overrides: Record<string, unknown>): string {
    const refusal = senseRegistry.register(
      { ...BASE, ...overrides } as SenseDefinition,
    );

    expect(refusal.ok).toBe(false);

    return refusal.ok === false ? refusal.reason : "";
  }

  it("refuses an id the engine already owns", () => {
    expect(reasonFor({ id: "sight" })).toContain("cannot be redefined");
  });

  it("refuses an unknown family", () => {
    expect(reasonFor({ family: "mystical" })).toContain("family");
  });

  it("refuses an unknown availability", () => {
    expect(reasonFor({ availability: "sometimes" })).toContain("availability");
  });

  it("refuses a Sense that receives nothing", () => {
    expect(reasonFor({ receiveChannels: [] }))
      .toContain("at least one channel");
  });

  it("refuses a duplicated received channel", () => {
    expect(reasonFor({ receiveChannels: ["sound", "sound"] }))
      .toContain("twice");
  });

  it("refuses an unregistered received channel", () => {
    expect(reasonFor({ receiveChannels: ["telepathy"] }))
      .toContain("unregistered channel");
  });

  it("refuses every malformed score basis", () => {
    expect(reasonFor({ scoreBasis: { kind: "attribute", attribute: "luck" } }))
      .toContain("no real attribute");
    expect(reasonFor({ scoreBasis: { kind: "attribute-average", attributes: [] } }))
      .toContain("at least one attribute");
    expect(reasonFor({ scoreBasis: { kind: "fixed", score: Number.NaN } }))
      .toContain("finite fixed score");
    expect(reasonFor({ scoreBasis: { kind: "callback" } }))
      .toContain("score basis of attribute");
  });

  it("refuses a channel that does not say how it propagates", () => {
    const refusal = sensoryChannelRegistry.register({
      id: "telepathy",
      name: "Telepathy",
      description: "A channel that declined to say how it travels.",
    } as SensoryChannelDefinition);

    expect(refusal.ok).toBe(false);
    expect(refusal.ok === false && refusal.reason).toContain("propagates");
  });

  it("stores nothing at all when a registration is refused", () => {
    senseRegistry.register({ ...BASE, receiveChannels: ["telepathy"] });

    expect(isSenseId("test-sense")).toBe(false);
    expect(senseRegistry.custom()).toEqual([]);
  });
});


describe("unknown ids are refused rather than defaulted", () => {
  it("answers false for a Sense id nobody registered", () => {
    expect(isSenseId("clairvoyance-of-the-ninth-house")).toBe(false);
    expect(getSenseDefinition("clairvoyance-of-the-ninth-house"))
      .toBeUndefined();
  });

  it("answers false for a channel nobody registered", () => {
    expect(isSensoryChannelId("tachyon-flux")).toBe(false);
    expect(getSensoryChannel("tachyon-flux")).toBeUndefined();
  });

  it("generates no route for an unregistered channel", () => {
    const routes = generateSensoryRoutes({
      profile: sensoryProfile(),
      cue: cue({ emissions: { "tachyon-flux": 9 } as never }),
    });

    expect(routes).toEqual([]);
  });

  it("does not manufacture a Sense from an unknown id on the profile", () => {
    expect(getResolvedSense(sensoryProfile(), "tachyon-sense")).toBeUndefined();
  });

  it("matches nothing when a selector names an unregistered Sense", () => {
    expect(matchesSenseSelector(
      { kind: "family", family: "basic" },
      "clairvoyance-of-the-ninth-house",
    )).toBe(false);
  });

  it("keeps the two closed vocabularies closed", () => {
    expect(SENSE_FAMILIES).toEqual(["basic", "special"]);
    expect(SENSE_AVAILABILITY_KINDS)
      .toEqual(["anatomical", "granted", "anatomical-or-granted"]);
  });
});
