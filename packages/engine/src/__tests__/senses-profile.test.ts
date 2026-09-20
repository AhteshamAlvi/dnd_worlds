/*
 * The resolved sensory profile: what a character can sense, how well, and why.
 *
 * The central property is the one that replaced the old model outright: a
 * Sense is available because the creature HAS THE ANATOMY FOR IT, or because
 * something granted it, and never merely because the Sense exists. Everything
 * else here is a consequence a future Effect could quietly break — support is
 * not clamped, the score floors exactly once, a network renormalizes and a
 * fixed share does not, and suppression beats a grant rather than racing it.
 */

import { describe, expect, it } from "vitest";

import { createAnatomy } from "../character/foundation/body/anatomy/creation";
import { resolveCriticalPoints } from "../character/foundation/body/critical-points/resolution";
import type { SpecialPointDefinition } from "../character/foundation/body/critical-points/types";
import { resolveSensoryProfile } from "../character/foundation/senses/profile";
import { listSenses } from "../character/foundation/senses/definitions";
import { getResolvedSense } from "../character/foundation/senses/types";

import { TEST_PART_PHYSICALS } from "./fixtures/body";
import {
  PASSIVE_CONCEALMENT_BASE,
  PASSIVE_DETECTION_BASE,
  PER_MODIFIER,
  bodilessProfile,
  effects,
  sensoryProfile,
  sensoryStats,
  source,
} from "./fixtures/senses";

const BASIC_SENSES = ["sight", "hearing", "smell", "taste", "touch"] as const;

const LEFT_EYE = "left-eye:head-1";
const RIGHT_EYE = "right-eye:head-1";
const LEFT_EAR = "left-ear:head-1";


describe("anatomy decides availability", () => {
  it("resolves every basic Human Sense from its own points", () => {
    const profile = sensoryProfile();

    for (const id of BASIC_SENSES) {
      const sense = getResolvedSense(profile, id);

      expect(sense?.available).toBe(true);
      expect(sense?.availabilityReason).toBe("anatomical");
      expect(sense?.support).toBeCloseTo(1, 10);
      expect(sense?.score).toBe(16);
      expect(sense?.standardModifier).toBe(PER_MODIFIER);
    }
  });

  it("gives a character with no anatomy at all no physical Sense", () => {
    const profile = bodilessProfile();

    for (const id of BASIC_SENSES) {
      expect(getResolvedSense(profile, id)).toBeUndefined();
    }
  });

  it("publishes only the Senses this creature resolved", () => {
    const profile = sensoryProfile();

    /* A Human has no echolocating anatomy and no grant for it. */
    expect(getResolvedSense(profile, "echolocation")).toBeUndefined();
    expect(getResolvedSense(profile, "esp")).toBeUndefined();

    expect(Object.keys(profile.senses).length)
      .toBeLessThan(listSenses().length);
  });

  it("returns undefined for an id that is not a Sense at all", () => {
    expect(getResolvedSense(sensoryProfile(), "not-a-sense")).toBeUndefined();
  });
});


describe("fixed shares", () => {
  it("gives each Human Eye half of Sight", () => {
    const profile = sensoryProfile();
    const sight = getResolvedSense(profile, "sight")!;

    expect(sight.anatomy).toHaveLength(2);

    for (const entry of sight.anatomy) {
      expect(entry.share).toBe(0.5);
      expect(entry.functionalFraction).toBe(1);
      expect(entry.amount).toBe(0.5);
    }
  });

  it("halves Sight when one Eye is destroyed", () => {
    const profile = sensoryProfile({
      pointStates: { [LEFT_EYE]: "archived-removed" },
    });
    const sight = getResolvedSense(profile, "sight")!;

    expect(sight.support).toBeCloseTo(0.5, 10);

    /* floor(16 x 0.50) = 8, and the Sense is still available. */
    expect(sight.score).toBe(8);
    expect(sight.available).toBe(true);
  });

  it("makes Sight unavailable when both Eyes are gone", () => {
    const profile = sensoryProfile({
      pointStates: {
        [LEFT_EYE]: "archived-removed",
        [RIGHT_EYE]: "archived-removed",
      },
    });
    const sight = getResolvedSense(profile, "sight")!;

    expect(sight.support).toBe(0);
    expect(sight.available).toBe(false);
    expect(sight.availabilityReason).toBe("no-functional-anatomy");
  });

  it("treats a suppressed point exactly as a destroyed one", () => {
    const profile = sensoryProfile({ pointStates: { [LEFT_EYE]: "suppressed" } });

    expect(getResolvedSense(profile, "sight")!.support).toBeCloseTo(0.5, 10);
  });

  it("halves Hearing when one Ear goes, and leaves Sight alone", () => {
    const profile = sensoryProfile({
      pointStates: { [LEFT_EAR]: "archived-removed" },
    });

    expect(getResolvedSense(profile, "hearing")!.support).toBeCloseTo(0.5, 10);
    expect(getResolvedSense(profile, "sight")!.support).toBeCloseTo(1, 10);
  });

  it("loses exactly one eighth when one of eight equal Eyes is destroyed", () => {
    /*
     * Not a Human, and deliberately so: the fraction model has to hold for
     * anatomy nobody has calibrated, or "two eyes, half each" is a special
     * case rather than a rule.
     */
    const eye = (index: number): SpecialPointDefinition => ({
      id: `eye-${index}`,
      name: `Eye ${index}`,
      description: "One of eight equal eyes.",
      categories: ["sensory"],
      placement: { kind: "per-part", selector: { types: ["head"] } },
      sensory: {
        footprint: { kind: "host-surface-fraction", fraction: 0.01 },
        focus: { kind: "local", cluster: "eyes" },
        functions: [
          { senseId: "sight", contribution: { kind: "fixed", amount: 0.125 } },
        ],
      },
    });

    const definitions = Array.from({ length: 8 }, (_, index) => eye(index + 1));
    const anatomy = createAnatomy([
      { id: "head-1", type: "head", attachment: null },
    ]);

    const points = resolveCriticalPoints(
      anatomy,
      [{
        id: "head",
        name: "Head",
        description: "Test head.",
        tags: [],
        ...TEST_PART_PHYSICALS,
      }],
      definitions,
    );

    const intact = resolveSensoryProfile(sensoryStats(), { points });
    const maimed = resolveSensoryProfile(sensoryStats(), {
      points,
      pointStates: { "eye-1:head-1": "archived-removed" },
    });

    expect(getResolvedSense(intact, "sight")!.support).toBeCloseTo(1, 10);
    expect(getResolvedSense(maimed, "sight")!.support).toBeCloseTo(0.875, 10);

    /* floor(16 x 0.875) = 14, which is one eighth of the acuity gone. */
    expect(getResolvedSense(maimed, "sight")!.score).toBe(14);
  });

  it("loses an unpaired organ outright", () => {
    const profile = sensoryProfile({
      pointStates: { "olfactory-organs:head-1": "archived-removed" },
    });

    expect(getResolvedSense(profile, "smell")!.available).toBe(false);
  });
});


describe("partial impairment", () => {
  const CLOUDED = {
    source: source("cataract", "injury"),
    pointId: LEFT_EYE,
    multiplier: 0.5,
  };

  it("scales only the point it names", () => {
    const profile = sensoryProfile({
      effects: effects({ pointFunctionModifiers: [CLOUDED] }),
    });
    const sight = getResolvedSense(profile, "sight")!;

    /* 0.50 x 0.50 + 0.50 x 1.00 = 0.75, and floor(16 x 0.75) = 12. */
    expect(sight.support).toBeCloseTo(0.75, 10);
    expect(sight.score).toBe(12);
  });

  it("multiplies two impairments on one point rather than adding them", () => {
    const profile = sensoryProfile({
      effects: effects({
        pointFunctionModifiers: [
          CLOUDED,
          { source: source("scarring", "injury"), pointId: LEFT_EYE, multiplier: 0.5 },
        ],
      }),
    });

    /* 0.25, not 0. Two independent halvings leave a quarter. */
    expect(getResolvedSense(profile, "sight")!.support).toBeCloseTo(0.625, 10);
  });

  it("retains provenance for what impaired the point", () => {
    const profile = sensoryProfile({
      effects: effects({ pointFunctionModifiers: [CLOUDED] }),
    });
    const left = getResolvedSense(profile, "sight")!.anatomy
      .find((entry) => entry.pointId === LEFT_EYE);

    expect(left?.functionalFraction).toBe(0.5);
    expect(left?.impairedBy).toEqual([source("cataract", "injury")]);
  });

  it("publishes each point's functional fraction for Gyō to read", () => {
    const profile = sensoryProfile({
      effects: effects({ pointFunctionModifiers: [CLOUDED] }),
    });

    expect(profile.pointFunction[LEFT_EYE]).toBe(0.5);
    expect(profile.pointFunction[RIGHT_EYE]).toBe(1);
  });

  it("zeroes a destroyed point's fraction regardless of multipliers", () => {
    const profile = sensoryProfile({
      pointStates: { [LEFT_EYE]: "archived-removed" },
      effects: effects({
        pointFunctionModifiers: [{
          source: source("blessing"),
          pointId: LEFT_EYE,
          multiplier: 4,
        }],
      }),
    });

    expect(profile.pointFunction[LEFT_EYE]).toBe(0);
  });
});


describe("distributed networks", () => {
  it("normalizes Touch from present area and sensitivity", () => {
    const touch = getResolvedSense(sensoryProfile(), "touch")!;

    expect(touch.support).toBeCloseTo(1, 10);
    expect(touch.score).toBe(16);
  });

  it("weights a Palm above ordinary skin of the same area", () => {
    const touch = getResolvedSense(sensoryProfile(), "touch")!;

    const palm = touch.anatomy.find((entry) => entry.pointId === "palm:hand-1")!;
    const handSkin = touch.anatomy
      .find((entry) => entry.pointId === "tactile-surface:hand-1")!;

    /*
     * The palm is a quarter of the Hand and four times as sensitive, so its
     * weight is 105.625 x 4 against the remaining 316.875 x 1 — a shade over
     * a third more.
     */
    expect(palm.share / handSkin.share).toBeCloseTo((105.625 * 4) / 316.875, 10);
  });

  it("renormalizes rather than shrinking when a member is lost", () => {
    const whole = getResolvedSense(sensoryProfile(), "touch")!;
    const maimed = getResolvedSense(
      sensoryProfile({
        pointStates: { "tactile-surface:hand-1": "archived-removed" },
      }),
      "touch",
    )!;

    /*
     * The character does not feel LESS for losing skin — the rest of the
     * network takes up the whole of the Sense. That asymmetry against a fixed
     * share is the point of the two contribution kinds.
     */
    expect(whole.support).toBeCloseTo(1, 10);
    expect(maimed.support).toBeCloseTo(1, 10);
  });

  it("resolves a Palm as its own receiver alongside the whole-body network", () => {
    const touch = getResolvedSense(sensoryProfile(), "touch")!;
    const keys = touch.receivers.map((receiver) => receiver.key);

    expect(keys).toContain("anatomical:hand-1/touch/palm:palm:hand-1");
    expect(keys).toContain("anatomical:hand-2/touch/palm:palm:hand-2");
    expect(keys.some((key) => key.startsWith("network:whole-body-touch"))).toBe(true);
    expect(touch.receivers).toHaveLength(3);
  });

  it("puts both facial Eyes in one receiver", () => {
    const sight = getResolvedSense(sensoryProfile(), "sight")!;

    expect(sight.receivers).toHaveLength(1);
    expect(sight.receivers[0]!.key).toBe(
      "anatomical:head-1/sight/facial-eyes:left-eye:head-1,right-eye:head-1",
    );
  });

  it("drops a receiver whose every point has stopped working", () => {
    const profile = sensoryProfile({
      pointStates: {
        "palm:hand-1": "archived-removed",
      },
    });
    const touch = getResolvedSense(profile, "touch")!;
    const palm = touch.receivers
      .find((receiver) => receiver.key.includes("hand-1/touch/palm"));

    expect(palm?.functionalSupport ?? 0).toBe(0);
  });
});


describe("the score arithmetic", () => {
  it("floors once, after support and modifiers", () => {
    const profile = sensoryProfile({
      pointStates: { [LEFT_EYE]: "archived-removed" },
      effects: effects({
        senseModifiers: [{
          source: source("spectacles", "item"),
          sense: { kind: "specific", sense: "sight" },
          amount: 1.5,
        }],
      }),
    });

    /*
     * floor(16 x 0.5 + 1.5) = floor(9.5) = 9.
     *
     * Rounding the support, the product or the modifier first would each give
     * a different answer, and two of them would give 10.
     */
    expect(getResolvedSense(profile, "sight")!.score).toBe(9);
  });

  it("does not clamp healthy support above one", () => {
    const profile = sensoryProfile({
      effects: effects({
        pointFunctionModifiers: [
          { source: source("awakened-eye"), pointId: LEFT_EYE, multiplier: 3 },
          { source: source("awakened-eye"), pointId: RIGHT_EYE, multiplier: 3 },
        ],
      }),
    });

    expect(getResolvedSense(profile, "sight")!.support).toBeCloseTo(3, 10);
    expect(getResolvedSense(profile, "sight")!.score).toBe(48);
  });

  it("moves Detection and Investigation with the anatomy-resolved score", () => {
    const profile = sensoryProfile({
      pointStates: { [LEFT_EYE]: "archived-removed" },
    });
    const sight = getResolvedSense(profile, "sight")!;

    /* Detection is round((sense + WIS) / 2): round((8 + 14) / 2) = 11. */
    expect(sight.detection.score).toBe(11);

    /* Investigation is round((INT + WIS + sense) / 3): round((18+14+8)/3) = 13. */
    expect(sight.investigation.score).toBe(13);
  });

  it("moves passive Detection with the sense, not with raw PER", () => {
    const profile = sensoryProfile({
      effects: effects({
        senseModifiers: [{
          source: source("keen-ears"),
          sense: { kind: "specific", sense: "hearing" },
          amount: 4,
        }],
      }),
    });

    expect(getResolvedSense(profile, "hearing")!.passiveDetectionBase).toBe(7);
    expect(getResolvedSense(profile, "sight")!.passiveDetectionBase)
      .toBe(PASSIVE_DETECTION_BASE);
  });

  it("stores passive Concealment once, as DEX modifier + WIS modifier", () => {
    expect(sensoryProfile().passiveConcealmentBase).toBe(PASSIVE_CONCEALMENT_BASE);
    expect(PASSIVE_CONCEALMENT_BASE).toBe(3);
  });
});


describe("ESP", () => {
  const THIRD_EYE = { source: source("third-eye"), sense: "esp" };

  it("never unlocks from PER and SPI alone, however high", () => {
    const profile = sensoryProfile({}, { per: 30, spi: 30 });

    expect(getResolvedSense(profile, "esp")).toBeUndefined();
  });

  it("resolves the floor-average of PER and SPI when granted", () => {
    const profile = sensoryProfile(
      { effects: effects({ senseGrants: [THIRD_EYE] }) },
      { per: 17, spi: 12 },
    );

    /* floor((17 + 12) / 2) = floor(14.5) = 14. */
    expect(getResolvedSense(profile, "esp")!.score).toBe(14);
    expect(getResolvedSense(profile, "esp")!.available).toBe(true);
    expect(getResolvedSense(profile, "esp")!.availabilityReason).toBe("granted");
  });

  it("averages before flooring, not after", () => {
    const profile = sensoryProfile(
      {
        effects: effects({
          senseGrants: [THIRD_EYE],
          senseModifiers: [{
            source: source("focus"),
            sense: { kind: "specific", sense: "esp" },
            amount: 0.5,
          }],
        }),
      },
      { per: 17, spi: 12 },
    );

    /* floor(14.5 + 0.5) = 15. Flooring the average first would give 14. */
    expect(getResolvedSense(profile, "esp")!.score).toBe(15);
  });

  it("receives its complete channel set from an unrestricted grant", () => {
    const profile = sensoryProfile({
      effects: effects({ senseGrants: [THIRD_EYE] }),
    });

    expect(getResolvedSense(profile, "esp")!.channels).toEqual([
      "causal-disturbance",
      "danger",
      "hostile-intent",
      "metaphysical-anomaly",
      "presence",
    ]);
  });

  it("receives only the channels a restricted grant enabled", () => {
    const profile = sensoryProfile({
      effects: effects({
        senseGrants: [{
          source: source("premonition"),
          sense: "esp",
          enabledChannels: ["danger"],
        }],
      }),
    });

    expect(getResolvedSense(profile, "esp")!.channels).toEqual(["danger"]);
  });

  it("resolves a grant receiver rather than an anatomical one", () => {
    const profile = sensoryProfile({
      effects: effects({ senseGrants: [THIRD_EYE] }),
    });
    const esp = getResolvedSense(profile, "esp")!;

    expect(esp.receivers).toHaveLength(1);
    expect(esp.receivers[0]!.ref.kind).toBe("granted");
  });
});


describe("grants, suppressions and channels", () => {
  it("floors support rather than adding to it", () => {
    const granted = sensoryProfile({
      effects: effects({
        senseGrants: [{ source: source("blindsight"), sense: "sight" }],
      }),
    });

    /* Two healthy eyes plus a full grant is still 1.00, not 2.00. */
    expect(getResolvedSense(granted, "sight")!.support).toBeCloseTo(1, 10);
  });

  it("restores a blinded character through a grant", () => {
    const profile = sensoryProfile({
      pointStates: {
        [LEFT_EYE]: "archived-removed",
        [RIGHT_EYE]: "archived-removed",
      },
      effects: effects({
        senseGrants: [{ source: source("blindsight"), sense: "sight" }],
      }),
    });

    expect(getResolvedSense(profile, "sight")!.available).toBe(true);
    expect(getResolvedSense(profile, "sight")!.availabilityReason).toBe("granted");
    expect(getResolvedSense(profile, "sight")!.score).toBe(16);
  });

  it("lets suppression override a grant of the same Sense", () => {
    const profile = sensoryProfile({
      effects: effects({
        senseGrants: [{ source: source("third-eye"), sense: "esp" }],
        senseSuppressions: [{
          source: source("null-field", "condition"),
          sense: { kind: "specific", sense: "esp" },
        }],
      }),
    });

    expect(getResolvedSense(profile, "esp")!.available).toBe(false);
    expect(getResolvedSense(profile, "esp")!.availabilityReason).toBe("suppressed");
  });

  it("suppresses every basic Sense through a family selector", () => {
    const profile = sensoryProfile({
      effects: effects({
        senseGrants: [{ source: source("third-eye"), sense: "esp" }],
        senseSuppressions: [{
          source: source("sensory-deprivation", "condition"),
          sense: { kind: "family", family: "basic" },
        }],
      }),
    });

    for (const id of BASIC_SENSES) {
      expect(getResolvedSense(profile, id)!.available).toBe(false);
    }

    expect(getResolvedSense(profile, "esp")!.available).toBe(true);
  });

  it("suppresses whatever reads a channel through a channel selector", () => {
    const profile = sensoryProfile({
      effects: effects({
        senseSuppressions: [{
          source: source("darkness", "condition"),
          sense: { kind: "channel", channel: "visible-light" },
        }],
      }),
    });

    expect(getResolvedSense(profile, "sight")!.available).toBe(false);
    expect(getResolvedSense(profile, "hearing")!.available).toBe(true);
  });

  it("removes one channel without removing the Sense", () => {
    const profile = sensoryProfile({
      effects: effects({
        senseChannelSuppressions: [{
          source: source("deafening", "condition"),
          sense: { kind: "specific", sense: "touch" },
          channel: "air-displacement",
        }],
      }),
    });
    const touch = getResolvedSense(profile, "touch")!;

    expect(touch.available).toBe(true);
    expect(touch.channels).not.toContain("air-displacement");
    expect(touch.channels).toContain("surface-pressure");
  });

  it("adds a channel a Sense does not natively receive", () => {
    const profile = sensoryProfile({
      effects: effects({
        senseChannelGrants: [{
          source: source("pit-organs"),
          sense: "sight",
          channel: "thermal",
        }],
      }),
    });

    expect(getResolvedSense(profile, "sight")!.channels).toEqual([
      "thermal",
      "visible-light",
    ]);
  });

  it("records a Night-Vision-style reception modifier without a second Sense", () => {
    const profile = sensoryProfile({
      effects: effects({
        senseChannelReception: [{
          source: source("night-vision"),
          sense: { kind: "specific", sense: "sight" },
          channel: "visible-light",
          amount: 2,
        }],
      }),
    });

    expect(getResolvedSense(profile, "sight")!.receptionModifiers["visible-light"])
      .toBe(2);
    expect(Object.keys(profile.senses)).not.toContain("night-vision");
  });
});


describe("Nen Perception", () => {
  it("is available to an awakened character, through Aura Perception", () => {
    const profile = sensoryProfile({ nenAwakened: true });

    expect(profile.nenPerception.available).toBe(true);
    expect(getResolvedSense(profile, "aura-perception")!.available).toBe(true);
    expect(getResolvedSense(profile, "aura-perception")!.channels).toEqual(["aura"]);
  });

  it("is unavailable to an unawakened Human", () => {
    expect(sensoryProfile().nenPerception.available).toBe(false);
  });

  it("is suppressed even when awakened and granted", () => {
    const profile = sensoryProfile({
      nenAwakened: true,
      effects: effects({
        nenPerceptionGrants: [source("gyo-training")],
        nenPerceptionSuppressions: [source("in-suppression", "condition")],
      }),
    });

    expect(profile.nenPerception.available).toBe(false);
    expect(profile.nenPerception.suppressedBy).toEqual([
      source("in-suppression", "condition"),
    ]);
  });
});


describe("the profile trace", () => {
  it("reports each resolved Sense's score and availability", () => {
    const trace = resolveSensoryProfile(sensoryStats()).trace;

    expect(trace.id).toBe("character.senses.profile");
    expect(trace.formula).toContain("floor(basis x support");
  });
});


/*
 * Channels belong to a RECEIVER, not to the Sense.
 *
 * A Sense-wide channel list made a restriction into a statement about
 * everything that receives that Sense: the first grant carrying
 * `enabledChannels` decided what the whole Sense received, so grant ORDER was
 * mechanically significant, two restricted grants could not supply different
 * channels, and a restricted grant could delete channels that working anatomy
 * was already supplying.
 */
describe("receiver-specific channels", () => {
  const PREMONITION = {
    source: source("premonition"),
    sense: "esp",
    enabledChannels: ["danger"],
  };

  const EMPATHY = {
    source: source("empathy"),
    sense: "esp",
    enabledChannels: ["hostile-intent", "presence"],
  };

  function espReceiver(profile: ReturnType<typeof sensoryProfile>, id: string) {
    return getResolvedSense(profile, "esp")!.receivers
      .find((receiver) => receiver.key === `granted:trait:${id}`)!;
  }

  it("keeps two restricted grants on their own disjoint channels", () => {
    const profile = sensoryProfile({
      effects: effects({ senseGrants: [PREMONITION, EMPATHY] }),
    });

    expect(espReceiver(profile, "premonition").channels).toEqual(["danger"]);
    expect(espReceiver(profile, "empathy").channels)
      .toEqual(["hostile-intent", "presence"]);
  });

  it("resolves an identical profile whichever order the grants arrived in", () => {
    const forwards = sensoryProfile({
      effects: effects({ senseGrants: [PREMONITION, EMPATHY] }),
    });
    const backwards = sensoryProfile({
      effects: effects({ senseGrants: [EMPATHY, PREMONITION] }),
    });

    const channelsBy = (profile: typeof forwards) =>
      Object.fromEntries(
        getResolvedSense(profile, "esp")!.receivers
          .map((receiver) => [receiver.key, receiver.channels]),
      );

    expect(channelsBy(forwards)).toEqual(channelsBy(backwards));
    expect(getResolvedSense(forwards, "esp")!.channels)
      .toEqual(getResolvedSense(backwards, "esp")!.channels);
  });

  it("lets neither restricted grant restrict the other", () => {
    const profile = sensoryProfile({
      effects: effects({ senseGrants: [PREMONITION, EMPATHY] }),
    });

    expect(espReceiver(profile, "premonition").channels)
      .not.toContain("hostile-intent");
    expect(espReceiver(profile, "empathy").channels).not.toContain("danger");
  });

  it("gives an unrestricted grant the definition's complete set beside a restricted one", () => {
    const profile = sensoryProfile({
      effects: effects({
        senseGrants: [PREMONITION, { source: source("third-eye"), sense: "esp" }],
      }),
    });

    expect(espReceiver(profile, "third-eye").channels).toEqual([
      "causal-disturbance",
      "danger",
      "hostile-intent",
      "metaphysical-anomaly",
      "presence",
    ]);
    expect(espReceiver(profile, "premonition").channels).toEqual(["danger"]);
  });

  it("never lets a restricted grant take a channel from working anatomy", () => {
    /*
     * A grant that supplies pressure alone, on a creature whose skin already
     * reads all four tactile channels. The grant is a floor under Touch, not a
     * ceiling over it.
     */
    const profile = sensoryProfile({
      effects: effects({
        senseGrants: [{
          source: source("phantom-limb"),
          sense: "touch",
          enabledChannels: ["surface-pressure"],
        }],
      }),
    });
    const touch = getResolvedSense(profile, "touch")!;

    for (const receiver of touch.receivers) {
      if (receiver.ref.kind === "granted") continue;

      expect(receiver.channels).toEqual([
        "air-displacement",
        "ground-vibration",
        "structural-vibration",
        "surface-pressure",
      ]);
    }

    expect(touch.channels).toContain("air-displacement");
  });

  it("opens a channel the definition never listed, on every receiver of that Sense", () => {
    const profile = sensoryProfile({
      effects: effects({
        senseChannelGrants: [{
          source: source("pit-organs"),
          sense: "sight",
          channel: "thermal",
        }],
      }),
    });
    const sight = getResolvedSense(profile, "sight")!;

    expect(sight.receivers[0]!.channels).toEqual(["thermal", "visible-light"]);
    expect(sight.channels).toEqual(["thermal", "visible-light"]);
  });

  it("removes a suppressed channel from every receiver its scope covers", () => {
    const profile = sensoryProfile({
      effects: effects({
        senseChannelSuppressions: [{
          source: source("numbness", "condition"),
          sense: { kind: "specific", sense: "touch" },
          channel: "air-displacement",
        }],
        senseGrants: [{ source: source("phantom-limb"), sense: "touch" }],
      }),
    });
    const touch = getResolvedSense(profile, "touch")!;

    for (const receiver of touch.receivers) {
      expect([receiver.key, receiver.channels.includes("air-displacement")])
        .toEqual([receiver.key, false]);
    }

    expect(touch.channels).not.toContain("air-displacement");
  });

  it("publishes the Sense's channels as the sorted union of its active receivers", () => {
    const profile = sensoryProfile({
      effects: effects({ senseGrants: [PREMONITION, EMPATHY] }),
    });
    const esp = getResolvedSense(profile, "esp")!;

    expect(esp.channels).toEqual(["danger", "hostile-intent", "presence"]);

    const union = [
      ...new Set(
        esp.receivers
          .filter((receiver) => receiver.functionalSupport > 0)
          .flatMap((receiver) => [...receiver.channels]),
      ),
    ].sort();

    expect(esp.channels).toEqual(union);
  });

  it("holds that union for an anatomical Sense too", () => {
    const touch = getResolvedSense(sensoryProfile(), "touch")!;

    expect(touch.channels).toEqual([
      ...new Set(touch.receivers.flatMap((receiver) => [...receiver.channels])),
    ].sort());
  });
});
