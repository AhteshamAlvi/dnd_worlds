/*
 * The sensory domain's edges: authored content in, ResolvedCharacter out, and
 * the public barrel a host actually imports from.
 *
 * These are the seams the unit tests above cannot see. A sensory Effect that
 * resolves perfectly but is never collected, or a resolver that works but is
 * unreachable from outside the engine, passes every other file in this suite.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";
import { resolveRuleEffects } from "../character/rules/resolution";
import { findEffectValidationIssues } from "../character/rules/validation";
import { EFFECT_TYPES, type Effect } from "../character/rules/effects";

import * as engine from "../index";

import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";
import { source } from "./fixtures/senses";

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

    expect(resolved.sensory).toEqual({
      senseModifiers: [],
      senseGrants: [],
      senseSuppressions: [],
      nenPerceptionGrants: [],
      nenPerceptionSuppressions: [],
    });
  });
});


describe("validating sensory Effects", () => {
  it("accepts well-formed variants", () => {
    expect(issueTypes({
      type: "modifySense",
      sense: { kind: "all-physical" },
      amount: -2,
    })).toEqual([]);
    expect(issueTypes({ type: "grantSense", sense: "extrasensory" })).toEqual([]);
    expect(issueTypes({ type: "grantNenPerception" })).toEqual([]);
  });

  it("rejects an unknown sense in a grant", () => {
    expect(issueTypes({
      type: "grantSense",
      sense: "echolocation" as never,
    })).toContain("invalid-sense-effect");
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

    expect(resolved.senses.senses.sight.available).toBe(true);
    expect(resolved.senses.senses.sight.score).toBe(10);
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
    expect(resolved.senses.senses.sight.score).toBe(14);
  });

  it("carries an authored sense grant all the way through", () => {
    registerDefinition("trait", {
      id: "third-eye",
      name: "Third Eye",
      description: "A test Trait granting Extrasensory Perception.",
      effects: [{ type: "grantSense", sense: "extrasensory" }],
    });

    const resolved = resolveTestCharacter(createTestCharacter({
      traits: [{ traitId: "third-eye" }],
    }));

    expect(resolved.senses.senses.extrasensory.available).toBe(true);
    expect(resolved.senses.senses.extrasensory.availabilityReason).toBe("granted");
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

    expect(resolved.senses.senses.hearing.score).toBe(14);
    expect(resolved.senses.senses.sight.score).toBe(10);
    expect(resolved.senses.senses.hearing.contributions).toEqual([
      { source: { type: "trait", id: "keen-ears" }, amount: 4 },
    ]);
  });

  it("leaves Nen Perception off until content grants it", () => {
    /*
     * Deliberate, and documented in foundation/senses/README.md: Character
     * does not store NenState yet, so resolveCharacter cannot report whether
     * Nen is awakened. Content is the only route in for now.
     */
    const resolved = resolveTestCharacter(createTestCharacter());

    expect(resolved.senses.nenPerception.available).toBe(false);
  });
});


describe("the public barrel", () => {
  const EXPORTED_VALUES = [
    "SENSE_IDS",
    "PHYSICAL_SENSE_IDS",
    "PERCEPTION_PHENOMENA",
    "DETECTION_MODES",
    "CONCEALMENT_MODES",
    "DETECTION_SUBJECTS",
    "INVESTIGATION_SUBJECTS",
    "PERCEPTION_STATUSES",
    "DETECTION_IMPORTANCE",
    "INFORMATION_BANDS",
    "DEFAULT_INFORMATION_THRESHOLDS",
    "NATURAL_EXTRASENSORY_PERCEPTION_REQUIREMENTS",
    "EMPTY_SENSORY_EFFECTS",
    "isSenseId",
    "isPerceptionPhenomenon",
    "matchesSenseSelector",
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
    "resolveConcealmentCheck",
    "resolvePassiveConcealment",
    "establishConcealment",
    "shouldRerollEstablishedConcealment",
    "resolveInvestigationCheck",
    "eligibleInvestigationFindings",
    "findingsRevealedAtBand",
    "findPerceptionRequestIssues",
    "findDetectionRequestIssues",
    "findConcealmentRequestIssues",
    "findInvestigationRequestIssues",
    "findSensorySignatureIssues",
    "findInformationOverrideIssues",
    "isValidSenseSelector",
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
     * rolls it against Concealment and returns an information band. Two
     * different things, so the barrel gives them two different names rather
     * than letting one shadow the other.
     */
    expect(engine.resolveDetection).not.toBe(engine.resolveDetectionCheck);
    expect(engine.resolveConcealment).not.toBe(engine.resolveConcealmentCheck);
    expect(engine.resolveInvestigation).not.toBe(engine.resolveInvestigationCheck);

    expect(typeof engine.resolveDetection).toBe("function");
    expect(typeof engine.resolveDetectionCheck).toBe("function");
  });

  it("exports one sense vocabulary, shared with the check vocabulary", () => {
    expect(engine.SENSE_IDS).toEqual([
      "sight",
      "hearing",
      "smell",
      "taste",
      "touch",
      "extrasensory",
    ]);
    expect(engine.isSenseId("sight")).toBe(true);
    expect(engine.isSenseId("echolocation")).toBe(false);
  });

  it("is usable end to end without reaching past the barrel", () => {
    const profile = engine.resolveSensoryProfile(
      engine.createCharacterStats(
        {
          agi: 10, dex: 12, con: 10, vit: 10,
          int: 18, wis: 14, per: 16, spi: 10, cha: 10,
        },
        10,
      ),
    );

    const result = engine.resolvePerception({
      profile,
      signature: {
        id: "footstep",
        sense: "hearing",
        phenomenon: "physical",
        subject: "entity",
        reception: { kind: "uncertain", difficulty: 10 },
      },
      dice: { advantage: 0, rolls: [12] },
    });

    expect(result.status).toBe("perceived");
    if (result.status !== "perceived") throw new Error("unreachable");
    expect(result.band).toBe("partial");
    expect(result.cue.signature.sense).toBe("hearing");
  });
});
