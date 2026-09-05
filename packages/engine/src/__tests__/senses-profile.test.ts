/*
 * The resolved sensory profile: what a character can sense, how well, and why.
 *
 * The properties worth pinning here are the ones a future Effect could quietly
 * break — the natural Extrasensory unlock is a two-threshold AND, Nen
 * Perception is NOT the same unlock wearing a different name, and suppression
 * has to beat a grant rather than race it.
 */

import { describe, expect, it } from "vitest";

import { resolveSensoryProfile } from "../character/foundation/senses/profile";
import { NATURAL_EXTRASENSORY_PERCEPTION_REQUIREMENTS } from "../character/foundation/senses/types";
import { PHYSICAL_SENSE_IDS, SENSE_IDS } from "../character/foundation/senses/scopes";

import {
  PASSIVE_CONCEALMENT_BASE,
  PASSIVE_DETECTION_BASE,
  PER_MODIFIER,
  sensoryProfile,
  sensoryStats,
  source,
} from "./fixtures/senses";

const { per: ESP_PER, spi: ESP_SPI } = NATURAL_EXTRASENSORY_PERCEPTION_REQUIREMENTS;

describe("the sense list", () => {
  it("resolves every sense in the closed vocabulary", () => {
    const profile = sensoryProfile();

    for (const id of SENSE_IDS) {
      expect(profile.senses[id].id).toBe(id);
    }
  });

  it("makes the five physical senses available with no content at all", () => {
    const profile = sensoryProfile();

    for (const id of PHYSICAL_SENSE_IDS) {
      expect(profile.senses[id].available).toBe(true);
      expect(profile.senses[id].availabilityReason).toBe("normally-available");
    }
  });

  it("starts every sense at the character's PER", () => {
    const profile = sensoryProfile();

    for (const id of SENSE_IDS) {
      expect(profile.senses[id].score).toBe(16);
      expect(profile.senses[id].standardModifier).toBe(PER_MODIFIER);
    }
  });
});


describe("the natural Extrasensory unlock", () => {
  it("unlocks at exactly PER 22 and SPI 20", () => {
    const profile = sensoryProfile({}, { per: ESP_PER, spi: ESP_SPI });

    expect(profile.senses.extrasensory.available).toBe(true);
    expect(profile.senses.extrasensory.availabilityReason).toBe(
      "natural-extrasensory-unlock",
    );
  });

  it("does not unlock when PER is one short", () => {
    const profile = sensoryProfile({}, { per: ESP_PER - 1, spi: ESP_SPI });

    expect(profile.senses.extrasensory.available).toBe(false);
    expect(profile.senses.extrasensory.availabilityReason).toBe("not-unlocked");
  });

  it("does not unlock when SPI is one short", () => {
    const profile = sensoryProfile({}, { per: ESP_PER, spi: ESP_SPI - 1 });

    expect(profile.senses.extrasensory.available).toBe(false);
    expect(profile.senses.extrasensory.availabilityReason).toBe("not-unlocked");
  });

  it("is an AND, not an either-or: a huge PER alone is not enough", () => {
    const profile = sensoryProfile({}, { per: 30, spi: 1 });

    expect(profile.senses.extrasensory.available).toBe(false);
  });

  it("can be granted below the thresholds by content", () => {
    const profile = sensoryProfile({
      effects: {
        senseModifiers: [],
        senseGrants: [{ source: source("third-eye"), sense: "extrasensory" }],
        senseSuppressions: [],
        nenPerceptionGrants: [],
        nenPerceptionSuppressions: [],
      },
    });

    expect(profile.senses.extrasensory.available).toBe(true);
    expect(profile.senses.extrasensory.availabilityReason).toBe("granted");
  });
});


describe("Nen Perception", () => {
  it("stays unavailable for a character who naturally unlocked Extrasensory", () => {
    /*
     * The two are independent unlocks. Reading "can perceive the supernatural"
     * as "can perceive Nen" is the mistake this pins shut.
     */
    const profile = sensoryProfile({}, { per: ESP_PER, spi: ESP_SPI });

    expect(profile.senses.extrasensory.available).toBe(true);
    expect(profile.nenPerception.available).toBe(false);
  });

  it("is available when content grants it", () => {
    const profile = sensoryProfile({
      effects: {
        senseModifiers: [],
        senseGrants: [],
        senseSuppressions: [],
        nenPerceptionGrants: [source("gyo-training")],
        nenPerceptionSuppressions: [],
      },
    });

    expect(profile.nenPerception.available).toBe(true);
    expect(profile.nenPerception.sources).toEqual([source("gyo-training")]);
  });

  it("is available when the caller says Nen is awakened", () => {
    expect(sensoryProfile({ nenAwakened: true }).nenPerception.available).toBe(true);
  });

  it("is suppressed even when awakened and granted", () => {
    const profile = sensoryProfile({
      nenAwakened: true,
      effects: {
        senseModifiers: [],
        senseGrants: [],
        senseSuppressions: [],
        nenPerceptionGrants: [source("gyo-training")],
        nenPerceptionSuppressions: [source("in-suppression", "condition")],
      },
    });

    expect(profile.nenPerception.available).toBe(false);
    expect(profile.nenPerception.suppressedBy).toEqual([
      source("in-suppression", "condition"),
    ]);
  });
});


describe("suppression and grants", () => {
  it("lets suppression override a grant of the same sense", () => {
    const profile = sensoryProfile({
      effects: {
        senseModifiers: [],
        senseGrants: [{ source: source("third-eye"), sense: "extrasensory" }],
        senseSuppressions: [{
          source: source("blinded", "condition"),
          sense: { kind: "specific", sense: "extrasensory" },
        }],
        nenPerceptionGrants: [],
        nenPerceptionSuppressions: [],
      },
    });

    expect(profile.senses.extrasensory.available).toBe(false);
    expect(profile.senses.extrasensory.availabilityReason).toBe("suppressed");
  });

  it("suppresses every physical sense through an all-physical selector", () => {
    const profile = sensoryProfile({
      effects: {
        senseModifiers: [],
        senseGrants: [],
        senseSuppressions: [{
          source: source("sensory-deprivation", "condition"),
          sense: { kind: "all-physical" },
        }],
        nenPerceptionGrants: [],
        nenPerceptionSuppressions: [],
      },
    }, { per: 22, spi: 20 });

    for (const id of PHYSICAL_SENSE_IDS) {
      expect(profile.senses[id].available).toBe(false);
    }

    // all-physical means what it says: Extrasensory is untouched.
    expect(profile.senses.extrasensory.available).toBe(true);
  });

  it("suppresses a physical sense the caller reports as unavailable", () => {
    const profile = sensoryProfile({ unavailablePhysicalSenses: ["sight"] });

    expect(profile.senses.sight.available).toBe(false);
    expect(profile.senses.sight.availabilityReason).toBe("suppressed");
    expect(profile.senses.hearing.available).toBe(true);
  });
});


describe("sense score modifiers", () => {
  const KEEN_EARS = {
    source: source("keen-ears"),
    sense: { kind: "specific", sense: "hearing" },
    amount: 4,
  } as const;

  it("raises only the sense it names", () => {
    const profile = sensoryProfile({
      effects: {
        senseModifiers: [KEEN_EARS],
        senseGrants: [],
        senseSuppressions: [],
        nenPerceptionGrants: [],
        nenPerceptionSuppressions: [],
      },
    });

    expect(profile.senses.hearing.score).toBe(20);
    expect(profile.senses.hearing.standardModifier).toBe(5);
    expect(profile.senses.sight.score).toBe(16);
    expect(profile.senses.sight.standardModifier).toBe(PER_MODIFIER);
  });

  it("retains provenance for the sense it modified and no other", () => {
    const profile = sensoryProfile({
      effects: {
        senseModifiers: [KEEN_EARS],
        senseGrants: [],
        senseSuppressions: [],
        nenPerceptionGrants: [],
        nenPerceptionSuppressions: [],
      },
    });

    expect(profile.senses.hearing.contributions).toEqual([
      { source: source("keen-ears"), amount: 4 },
    ]);
    expect(profile.senses.sight.contributions).toEqual([]);
  });

  it("feeds the sense-adjusted Detection and Investigation scores", () => {
    const profile = sensoryProfile({
      effects: {
        senseModifiers: [KEEN_EARS],
        senseGrants: [],
        senseSuppressions: [],
        nenPerceptionGrants: [],
        nenPerceptionSuppressions: [],
      },
    });

    // Detection is round((sense + WIS) / 2): round((20 + 14) / 2) = 17 -> +3.
    expect(profile.senses.hearing.detection.score).toBe(17);
    expect(profile.senses.hearing.detection.standardModifier).toBe(3);

    // Sight keeps the ordinary round((16 + 14) / 2) = 15 -> +2.
    expect(profile.senses.sight.detection.score).toBe(15);
    expect(profile.senses.sight.detection.standardModifier).toBe(2);

    // Investigation is round((INT + WIS + sense) / 3): round((18+14+20)/3) = 17.
    expect(profile.senses.hearing.investigation.score).toBe(17);
    expect(profile.senses.sight.investigation.score).toBe(16);
  });

  it("applies an all-senses modifier to every sense", () => {
    const profile = sensoryProfile({
      effects: {
        senseModifiers: [{
          source: source("heightened-awareness"),
          sense: { kind: "all" },
          amount: 2,
        }],
        senseGrants: [],
        senseSuppressions: [],
        nenPerceptionGrants: [],
        nenPerceptionSuppressions: [],
      },
    });

    for (const id of SENSE_IDS) {
      expect(profile.senses[id].score).toBe(18);
    }
  });
});


describe("the stored passive values", () => {
  it("stores passive Detection per sense as sense modifier + WIS modifier", () => {
    const profile = sensoryProfile();

    expect(profile.senses.sight.passiveDetectionBase).toBe(PASSIVE_DETECTION_BASE);
    expect(PASSIVE_DETECTION_BASE).toBe(5);
  });

  it("moves passive Detection with the sense, not with raw PER", () => {
    const profile = sensoryProfile({
      effects: {
        senseModifiers: [{
          source: source("keen-ears"),
          sense: { kind: "specific", sense: "hearing" },
          amount: 4,
        }],
        senseGrants: [],
        senseSuppressions: [],
        nenPerceptionGrants: [],
        nenPerceptionSuppressions: [],
      },
    });

    expect(profile.senses.hearing.passiveDetectionBase).toBe(5 + 2);
    expect(profile.senses.sight.passiveDetectionBase).toBe(PASSIVE_DETECTION_BASE);
  });

  it("stores passive Concealment once, as DEX modifier + WIS modifier", () => {
    const profile = sensoryProfile();

    expect(profile.passiveConcealmentBase).toBe(PASSIVE_CONCEALMENT_BASE);
    expect(PASSIVE_CONCEALMENT_BASE).toBe(3);
  });

  it("does not expose a raw base Perception score", () => {
    /*
     * It was stored and never read. Each sense's own score is the number every
     * sensory mechanic actually uses, and PER is on the character already.
     */
    expect("basePerceptionScore" in sensoryProfile()).toBe(false);
  });
});


describe("the profile trace", () => {
  it("reports each sense's resolved score", () => {
    const trace = resolveSensoryProfile(sensoryStats()).trace;

    expect(trace.id).toBe("character.senses.profile");
    expect(trace.output).toMatchObject({ sight: 16, hearing: 16, extrasensory: 16 });
  });
});
