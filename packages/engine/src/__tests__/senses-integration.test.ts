/*
 * The sensory domain's edges: authored content in, ResolvedCharacter out, and
 * the public barrel a host actually imports from.
 *
 * These are the seams the unit tests above cannot see. A sensory Effect that
 * resolves perfectly but is never collected, or a resolver that works but is
 * unreachable from outside the engine, passes every other file in this suite.
 */

import { afterEach, describe, expect, it } from "vitest";

import { payloadOf } from "./fixtures/result";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";
import { resolveRuleEffects } from "../character/rules/resolution";
import { findEffectValidationIssues } from "../character/rules/validation";
import { EFFECT_TYPES, type Effect } from "../character/rules/effects";

import * as engine from "../index";

import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";
import { AWAKENING_CAPABLE, standardAwakenedNen } from "./fixtures/nen";
import { source } from "./fixtures/senses";
import { EMPTY_SENSORY_EFFECTS } from "../character/foundation/senses/modifiers";

afterEach(() => {
  clearCustomDefinitions();
});

const SOURCE = source("keen-senses");

function resolve(...effects: Effect[]) {
  return resolveRuleEffects([{ source: SOURCE, effects }]);
}

function issueTypes(effect: Effect): readonly string[] {
  return findEffectValidationIssues(effect).map((issue) => issue.type);
}


describe("the sensory Effect vocabulary", () => {
  it("declares all five variants", () => {
    for (const type of [
      "modifySense",
      "grantSense",
      "suppressSense",
      "grantNenPerception",
      "suppressNenPerception",
    ]) {
      expect(EFFECT_TYPES).toContain(type);
    }
  });
});


describe("collecting sensory Effects", () => {
  it("collects a sense modifier with its provenance", () => {
    const resolved = resolve({
      type: "modifySense",
      sense: { kind: "specific", sense: "hearing" },
      amount: 3,
    });

    expect(resolved.sensory.senseModifiers).toEqual([
      { source: SOURCE, sense: { kind: "specific", sense: "hearing" }, amount: 3 },
    ]);
  });

  it("collects grants and suppressions into their own lists", () => {
    const resolved = resolve(
      { type: "grantSense", sense: "extrasensory" },
      { type: "suppressSense", sense: { kind: "specific", sense: "sight" } },
    );

    expect(resolved.sensory.senseGrants).toEqual([
      { source: SOURCE, sense: "extrasensory" },
    ]);
    expect(resolved.sensory.senseSuppressions).toEqual([
      { source: SOURCE, sense: { kind: "specific", sense: "sight" } },
    ]);
  });

  it("collects Nen Perception grants and suppressions as bare sources", () => {
    const resolved = resolve(
      { type: "grantNenPerception" },
      { type: "suppressNenPerception" },
    );

    expect(resolved.sensory.nenPerceptionGrants).toEqual([SOURCE]);
    expect(resolved.sensory.nenPerceptionSuppressions).toEqual([SOURCE]);
  });

  it("keeps sensory Effects out of the check-modifier list", () => {
    /*
     * A fundamental sense change is not a situational bonus. Letting one leak
     * into availableCheckModifiers would apply it twice — once to the sense
     * score and again to every matching check.
     */
    const resolved = resolve({
      type: "modifySense",
      sense: { kind: "all" },
      amount: 2,
    });

    expect(resolved.availableCheckModifiers).toEqual([]);
  });

  it("leaves the sensory lists empty when no content supplies any", () => {
    const resolved = resolve({ type: "modifyBaseAttribute", attribute: "per", amount: 2 });

    expect(resolved.sensory).toEqual(EMPTY_SENSORY_EFFECTS);
  });
});


describe("validating sensory Effects", () => {
  it("accepts well-formed variants", () => {
    expect(issueTypes({
      type: "modifySense",
      sense: { kind: "family", family: "basic" },
      amount: -2,
    })).toEqual([]);
    expect(issueTypes({ type: "grantSense", sense: "esp" })).toEqual([]);
    expect(issueTypes({ type: "grantNenPerception" })).toEqual([]);
    expect(issueTypes({
      type: "grantSenseChannel",
      sense: "sight",
      channel: "thermal",
    })).toEqual([]);
    expect(issueTypes({
      type: "modifySenseChannelReception",
      sense: { kind: "specific", sense: "sight" },
      channel: "visible-light",
      amount: 2,
    })).toEqual([]);
    expect(issueTypes({
      type: "modifyAnatomicalPointFunction",
      pointId: "left-eye:head-1",
      multiplier: 0.5,
    })).toEqual([]);
  });

  it("rejects an unknown sense in a grant", () => {
    expect(issueTypes({
      type: "grantSense",
      sense: "clairvoyance-of-the-ninth-house" as never,
    })).toContain("invalid-sense-effect");
  });

  it("rejects an enabled channel the granted Sense cannot receive", () => {
    expect(issueTypes({
      type: "grantSense",
      sense: "esp",
      enabledChannels: ["visible-light"],
    })).toContain("invalid-sensory-channel-effect");
  });

  it("rejects an unregistered channel", () => {
    expect(issueTypes({
      type: "grantSenseChannel",
      sense: "sight",
      channel: "tachyon-flux",
    })).toContain("invalid-sensory-channel-effect");
  });

  it("rejects a negative point-function multiplier", () => {
    expect(issueTypes({
      type: "modifyAnatomicalPointFunction",
      pointId: "left-eye:head-1",
      multiplier: -1,
    })).toContain("invalid-effect-amount");
  });

  it("rejects a malformed selector", () => {
    expect(issueTypes({
      type: "suppressSense",
      sense: { kind: "specific", sense: "aura" } as never,
    })).toContain("invalid-sense-effect");
  });

  it("rejects a non-finite modifier amount", () => {
    expect(issueTypes({
      type: "modifySense",
      sense: { kind: "all" },
      amount: Number.NaN,
    })).toContain("invalid-effect-amount");
  });
});


describe("ResolvedCharacter.senses", () => {
  it("resolves a sensory profile for every character", () => {
    const resolved = resolveTestCharacter(createTestCharacter());

    expect(resolved.senses.senses.sight?.available).toBe(true);
    expect(resolved.senses.senses.sight?.score).toBe(10);
  });

  it("tracks the character's resolved PER, not the stored value", () => {
    registerDefinition("trait", {
      id: "sharp-eyed",
      name: "Sharp-Eyed",
      description: "A test Trait that raises PER.",
      effects: [{ type: "modifyBaseAttribute", attribute: "per", amount: 4 }],
    });

    const resolved = resolveTestCharacter(createTestCharacter({
      traits: [{ traitId: "sharp-eyed" }],
    }));

    expect(resolved.attributes.resolved.per).toBe(14);
    expect(resolved.senses.senses.sight?.score).toBe(14);
  });

  it("carries an authored sense grant all the way through", () => {
    registerDefinition("trait", {
      id: "third-eye",
      name: "Third Eye",
      description: "A test Trait granting Extrasensory Perception.",
      effects: [{ type: "grantSense", sense: "esp" }],
    });

    const resolved = resolveTestCharacter(createTestCharacter({
      traits: [{ traitId: "third-eye" }],
    }));

    expect(resolved.senses.senses.esp?.available).toBe(true);
    expect(resolved.senses.senses.esp?.availabilityReason).toBe("granted");
  });

  it("carries an authored sense modifier all the way through", () => {
    registerDefinition("trait", {
      id: "keen-ears",
      name: "Keen Ears",
      description: "A test Trait that sharpens hearing alone.",
      effects: [{
        type: "modifySense",
        sense: { kind: "specific", sense: "hearing" },
        amount: 4,
      }],
    });

    const resolved = resolveTestCharacter(createTestCharacter({
      traits: [{ traitId: "keen-ears" }],
    }));

    expect(resolved.senses.senses.hearing?.score).toBe(14);
    expect(resolved.senses.senses.sight?.score).toBe(10);
    expect(resolved.senses.senses.hearing?.contributions).toEqual([
      { source: { type: "trait", id: "keen-ears" }, amount: 4 },
    ]);
  });

  it("leaves Nen Perception off for an unawakened character", () => {
    const resolved = resolveTestCharacter(createTestCharacter());

    expect(resolved.senses.nenPerception.available).toBe(false);
  });

  it("projects stored awakening into Nen Perception through real resolution", () => {
    /*
     * This used to be impossible and was documented as such. `character.nen`
     * has held NenState for a while, and until this ticket resolveCharacter()
     * still dropped it on the floor — so every awakened character resolved
     * blind to Aura unless a Trait happened to grant them the perception.
     *
     * Asserted through resolveCharacter() rather than by calling
     * resolveSensoryProfile({ nenAwakened: true }) directly, because the defect
     * was entirely in the wiring and a direct call never saw it.
     */
    const resolved = resolveTestCharacter(createTestCharacter({
      attributes: AWAKENING_CAPABLE,
      nen: standardAwakenedNen(),
    }));

    expect(resolved.senses.nenPerception.available).toBe(true);
  });

  it("lets explicit suppression remove it from an awakened character", () => {
    registerDefinition("trait", {
      id: "aura-blind",
      name: "Aura Blind",
      description: "A test Trait that suppresses Nen Perception.",
      effects: [{ type: "suppressNenPerception" }],
    });

    const resolved = resolveTestCharacter(createTestCharacter({
      attributes: AWAKENING_CAPABLE,
      nen: standardAwakenedNen(),
      traits: [{ traitId: "aura-blind" }],
    }));

    expect(resolved.senses.nenPerception.available).toBe(false);
    expect(resolved.senses.nenPerception.suppressedBy).toHaveLength(1);
  });

  it("still lets content grant it to somebody unawakened", () => {
    registerDefinition("trait", {
      id: "borrowed-sight",
      name: "Borrowed Sight",
      description: "A test Trait granting Nen Perception outright.",
      effects: [{ type: "grantNenPerception" }],
    });

    const resolved = resolveTestCharacter(createTestCharacter({
      traits: [{ traitId: "borrowed-sight" }],
    }));

    expect(resolved.senses.nenPerception.available).toBe(true);
  });
});


describe("the public barrel", () => {
  const EXPORTED_VALUES = [
    "SENSE_DEFINITIONS",
    "SENSORY_CHANNEL_DEFINITIONS",
    "SENSE_FAMILIES",
    "SENSE_AVAILABILITY_KINDS",
    "SENSORY_CHANNEL_PROPAGATIONS",
    "SENSORY_RECEIVER_KINDS",
    "EXTRASENSORY_PERCEPTION_SENSE_ID",
    "NEUTRAL_SENSORY_INTENSITY",
    "MINIMUM_SENSORY_INTENSITY",
    "MAXIMUM_SENSORY_INTENSITY",
    "senseRegistry",
    "sensoryChannelRegistry",
    "getSenseDefinition",
    "getSensoryChannel",
    "listSenses",
    "listSensoryChannels",
    "sensesReceiving",
    "senseReceivesChannel",
    "isSensoryChannelId",
    "isSensoryIntensity",
    "sensoryIntensityModifier",
    "generateSensoryRoutes",
    "sensoryRouteKey",
    "sensoryRouteTermsKey",
    "receiverKey",
    "canonicalReceiver",
    "isCoatableReceiver",
    "receiverPointIds",
    "findSensoryCueIssues",
    "emittedChannels",
    "getResolvedSense",
    "hasAvailableSense",
    "availableSenses",
    "localClusterKey",
    "receivedIntensityFor",
    "PERCEPTION_PHENOMENA",
    "DETECTION_MODES",
    "CONCEALMENT_MODES",
    "DETECTION_SUBJECTS",
    "INVESTIGATION_SUBJECTS",
    "PERCEPTION_STATUSES",
    "DETECTION_IMPORTANCE",
    "CONCEALMENT_LEAD_BAND_SIZE",
    "MAXIMUM_CONCEALMENT_REACTION_DISADVANTAGES",
    "CONCEALMENT_END_REASONS",
    "NEN_PRESENCE_EVIDENCE_ID",
    "INFORMATION_BANDS",
    "DEFAULT_INFORMATION_THRESHOLDS",
    "EMPTY_SENSORY_EFFECTS",
    "isSenseId",
    "isPerceptionPhenomenon",
    "matchesSenseSelector",
    "matchesSensoryChannelSelector",
    "matchesPhenomenonSelector",
    "resolveSensoryProfile",
    "resolveSensoryAccess",
    "resolveInformationBand",
    "compareInformationBands",
    "highestInformationBand",
    "resolvePerception",
    "resolveDetectionCheck",
    "resolvePassiveDetection",
    "resolvePassiveDetectionCandidates",
    "compareDetectionTotals",
    "resolveConcealmentLead",
    "deriveConcealmentReactionDisadvantages",
    "reconcileDetectionAdvantage",
    "sweepPassiveDetectionRoutes",
    "resolveActiveSearch",
    "resolveNenConcealmentModifiers",
    "prepareReactionGate",
    "settleReactionGate",
    "resolveConcealmentCheck",
    "resolvePassiveConcealment",
    "establishConcealment",
    "shouldRerollEstablishedConcealment",
    "establishConcealmentState",
    "isConcealedFrom",
    "concealmentRatingForRoute",
    "recordConcealmentDetection",
    "endConcealmentAttempt",
    "replaceConcealmentAttempt",
    "resolveInvestigationCheck",
    "eligibleInvestigationFindings",
    "findingsRevealedAtBand",
    "findPerceptionRequestIssues",
    "findDetectionRequestIssues",
    "findConcealmentRequestIssues",
    "findInvestigationRequestIssues",
    "findInformationOverrideIssues",
    "isValidSenseSelector",
    "isValidSensoryChannelSelector",
    "isValidPhenomenonSelector",
    "isValidInformationThresholds",
  ] as const;

  it.each(EXPORTED_VALUES)("exports %s", (name) => {
    expect(engine).toHaveProperty(name);
    expect(engine[name as keyof typeof engine]).toBeDefined();
  });

  it("names the mechanic resolvers apart from the Derived Attribute ones", () => {
    /*
     * Detection, Concealment and Investigation are both Derived Attributes and
     * mechanics. resolveDetection() computes the score; resolveDetectionCheck()
     * rolls it against Concealment and answers whether the subject was found.
     * Two different things, so the barrel gives them two different names rather
     * than letting one shadow the other.
     */
    expect(engine.resolveDetection).not.toBe(engine.resolveDetectionCheck);
    expect(engine.resolveConcealment).not.toBe(engine.resolveConcealmentCheck);
    expect(engine.resolveInvestigation).not.toBe(engine.resolveInvestigationCheck);

    expect(typeof engine.resolveDetection).toBe("function");
    expect(typeof engine.resolveDetectionCheck).toBe("function");
  });

  it("exports ONE sense vocabulary, registry-backed and shared with checks", () => {
    /*
     * There is no SENSE_IDS array any more, and its absence is the point: a
     * copied list is a second answer that can disagree with the registry. The
     * registry IS the vocabulary, and `isSenseId` asks it.
     */
    expect(engine).not.toHaveProperty("SENSE_IDS");
    expect(engine).not.toHaveProperty("PHYSICAL_SENSE_IDS");

    expect(engine.isSenseId("sight")).toBe(true);
    expect(engine.isSenseId("echolocation")).toBe(true);
    expect(engine.isSenseId("clairvoyance-of-the-ninth-house")).toBe(false);

    expect(engine.listSenses().map((sense) => sense.id).sort()).toEqual(
      Object.keys(engine.SENSE_DEFINITIONS).sort(),
    );
  });

  it("no longer exports the removed sensory vocabulary", () => {
    for (
      const removed of [
        "NATURAL_EXTRASENSORY_PERCEPTION_REQUIREMENTS",
        "findSensorySignatureIssues",
        "eyeGyoAura",
        "resolveEyeGyoContribution",
        "withEyeGyoModifier",
      ]
    ) {
      expect(engine).not.toHaveProperty(removed);
    }
  });

  it("is usable end to end without reaching past the barrel", () => {
    const character = resolveTestCharacter(createTestCharacter({
      attributes: {
        agi: 10, dex: 12, con: 10, vit: 10,
        int: 18, wis: 14, per: 16, spi: 10, cha: 10,
      },
    }));

    const result = payloadOf(engine.resolvePerception({
      profile: character.senses,
      cue: {
        id: "footstep",
        source: { type: "scene", id: "corridor" },
        phenomenon: "physical",
        subject: "entity",
        emissions: { sound: 5 },
        reception: { kind: "uncertain", difficulty: 10 },
      },
      dice: { advantage: 0, rolls: [12] },
    }));

    expect(result.status).toBe("perceived");
    if (result.status !== "perceived") throw new Error("unreachable");
    expect(result.band).toBe("partial");
    expect(result.route.sense).toBe("hearing");
    expect(result.route.channel).toBe("sound");
  });
});
