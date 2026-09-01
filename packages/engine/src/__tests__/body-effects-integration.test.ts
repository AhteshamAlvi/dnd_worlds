/*
 * Body Effects, and Body validation, as a character actually experiences them.
 *
 * body-effects.test.ts already covers the Effect VOCABULARY — that the union
 * parses, validates and resolves into typed buckets. None of that proved the
 * one thing that matters: that declaring an Effect on a Trait changes the
 * character. For a while it did not. The buckets were collected and then
 * dropped on the floor, and every test passed.
 *
 * So these tests deliberately go through the character-level API only. They
 * ask resolveCharacter and validateCharacter what happened, never the Body
 * resolvers directly, because the seam that broke was the one between them.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";
import { resolveCharacter } from "../character/resolution";
import { validateCharacter } from "../character/validation";
import { resolveBody } from "../character/foundation/body/resolution";
import { continuityKey } from "../character/foundation/body/anatomy/types";
import { STANDARD_BODY } from "../character/foundation/body/defaults";
import { destroyContinuity } from "../character/foundation/body/continuity";
import type { Effect } from "../character/rules/effects";
import type { Character } from "../character/types";
import type { StatureAllowance } from "../character/foundation/body/stature/types";

import {
  createTestCharacter,
  resolveTestCharacter,
} from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});


/*
 * One Trait carrying whatever the test is about.
 *
 * A Trait rather than a Species or Condition because the point is never the
 * source — effects.test.ts owns that property. It is the cheapest applicable
 * source to attach something to.
 */
function characterWith(
  effects: readonly Effect[],
  allowances: readonly StatureAllowance[] = [],
  overrides: Partial<Character> = {},
): Character {
  registerDefinition("trait", {
    id: "test-effect",
    name: "Test Effect",
    description: "Carries the Body Effect under test.",
    effects: [...effects],
    ...(allowances.length > 0 ? { statureAllowances: [...allowances] } : {}),
  });

  return createTestCharacter({
    traits: [{ traitId: "test-effect" }],
    ...overrides,
  });
}


/* The Basic Human Standard, which every expectation below is relative to. */
const BASELINE = {
  heightCm: 165,
  massKg: 62,
  structuralCapacity: 100,
  normalizedBodySP: 100,
  maximumBP: 100,
  strength: 10,
} as const;


describe("a body with no Effects is unchanged", () => {
  it("still resolves to the Basic Human Standard", () => {
    const resolved = resolveTestCharacter(createTestCharacter());

    expect(resolved.body.measurements.present.heightCm).toBeCloseTo(
      BASELINE.heightCm,
      6,
    );
    expect(resolved.body.measurements.form.totalMassKg).toBeCloseTo(
      BASELINE.massKg,
      6,
    );
    expect(resolved.body.structure.totalStructuralCapacity).toBeCloseTo(
      BASELINE.structuralCapacity,
      6,
    );
    expect(resolved.body.strength.normalizedBodySP).toBeCloseTo(
      BASELINE.normalizedBodySP,
      6,
    );
    expect(resolved.body.points.aggregateMaximumBP).toBe(BASELINE.maximumBP);
    expect(resolved.stats.str).toBe(BASELINE.strength);
  });
});


describe("Scale Effects reach the resolved character", () => {
  it("propagates a doubled Scale through every dimension that depends on it", () => {
    const resolved = resolveTestCharacter(
      characterWith([{ type: "modifyBaseBodyScale", multiplier: 2 }]),
    );

    /*
     * The exponents are the whole point, and they are geometry rather than
     * calibration: length is linear in Scale, Size and Mass cube, and
     * Structural Capacity squares because it is cross-section that carries
     * force. One Effect, four different powers.
     */
    expect(resolved.body.effectiveScale).toBe(2);
    expect(resolved.body.measurements.present.heightCm).toBeCloseTo(330, 6);
    expect(resolved.body.measurements.form.totalMassKg).toBeCloseTo(496, 6);
    expect(resolved.body.structure.totalStructuralCapacity).toBeCloseTo(400, 6);

    // 10 + log2(400/100) = 12.
    expect(resolved.stats.str).toBe(12);

    /*
     * And the burden of being large lands on AGI and DEX, which is what stops
     * Scale from being a pure gain.
     */
    expect(resolved.physicalScaleBurden.steps).toBe(1);
    expect(resolved.stats.agi).toBe(9);
    expect(resolved.stats.dex).toBe(9);
  });
});


describe("morphology Effects reach the resolved character", () => {
  it("raises Structural Capacity and Strength through Muscularity", () => {
    const resolved = resolveTestCharacter(
      characterWith([
        {
          type: "modifyBaseBodyMorphology",
          property: "muscularity",
          multiplier: 1.5747,
        },
      ]),
    );

    /*
     * 1.5747 is the Phase 5 calibration figure: the Muscularity that doubles a
     * standard Human's normalized Strength Points. Reproducing it through an
     * authored Effect is what proves the Effect reaches the same pipeline
     * Strength advancement solves against.
     */
    expect(resolved.body.strength.normalizedBodySP).toBeCloseTo(200, 2);
    expect(resolved.body.structure.totalStructuralCapacity).toBeCloseTo(
      143.85,
      2,
    );

    // Muscle is denser than what it replaces, so Mass moves and Size does not.
    expect(resolved.body.measurements.form.totalMassKg).toBeGreaterThan(
      BASELINE.massKg,
    );
    expect(resolved.body.measurements.form.totalSizeL).toBeCloseTo(60, 6);
  });

  it("applies a targeted morphology Effect to the selected parts only", () => {
    const resolved = resolveTestCharacter(
      characterWith([
        {
          type: "modifyBaseBodyMorphology",
          property: "length",
          multiplier: 1.5,
          target: { types: ["arm"] },
        },
      ]),
    );

    const part = (id: string) =>
      resolved.body.measurements.present.parts.find(
        (measured) => measured.partId === id,
      );

    expect(part("arm-1")?.lengthCm).toBeCloseTo(82.5, 6);
    expect(part("arm-2")?.lengthCm).toBeCloseTo(82.5, 6);
    expect(part("head-1")?.lengthCm).toBeCloseTo(22, 6);

    /*
     * Height is unmoved, because an Arm's heightContribution is 0. A selector
     * that reached the wrong parts would show up here before it showed up
     * anywhere else.
     */
    expect(resolved.body.measurements.present.heightCm).toBeCloseTo(165, 6);
  });
});


describe("anatomy Effects reach the resolved character", () => {
  it("adds anatomy to both the form and the body, and grants no free Strength", () => {
    const resolved = resolveTestCharacter(
      characterWith([
        {
          type: "modifyBaseBodyAnatomy",
          operation: {
            mode: "addToForm",
            slotId: "arm-3",
            type: "arm",
            attachToSlotId: "upper-body-1",
          },
        },
      ]),
    );

    expect(resolved.body.referenceForm.parts).toHaveLength(13);
    expect(resolved.body.anatomy.parts).toHaveLength(13);
    expect(
      resolved.body.anatomy.parts.find((part) => part.id === "arm-3")
        ?.attachment?.parentId,
    ).toBe("upper-body-1");

    /*
     * The normalization invariant, reached through content this time: the new
     * Arm raises the numerator and the denominator by the same 14, so a
     * three-armed Human is STR 10 while genuinely owning more Strength Points
     * than a two-armed one.
     */
    expect(resolved.body.strength.referenceFormAnatomicalCapacity).toBe(114);
    expect(resolved.body.strength.referenceFormIntrinsicSP).toBeCloseTo(114, 6);
    expect(resolved.body.strength.normalizedBodySP).toBeCloseTo(100, 6);
    expect(resolved.stats.str).toBe(BASELINE.strength);

    // It is a real Arm, so it weighs something and has Body Points.
    expect(resolved.body.measurements.present.totalMassKg).toBeGreaterThan(
      BASELINE.massKg,
    );
    expect(resolved.body.points.aggregateMaximumBP).toBe(114);
  });

  it("removes a slot from the form, and with it the manifestation", () => {
    const resolved = resolveTestCharacter(
      characterWith([
        {
          type: "modifyBaseBodyAnatomy",
          operation: { mode: "removeFromForm", slotId: "arm-2" },
        },
      ]),
    );

    expect(
      resolved.body.referenceForm.parts.some((slot) => slot.slotId === "arm-2"),
    ).toBe(false);

    /*
     * And nothing is standing there. Anatomy is instantiated FROM the form, so
     * a form that no longer expects an Arm does not produce one — the identity
     * goes dormant, keeping whatever persistent state it had until a form that
     * expresses it returns.
     */
    expect(
      resolved.body.anatomy.parts.some(
        (part) => part.continuityKey === continuityKey("upper-limb:right"),
      ),
    ).toBe(false);

    expect(resolved.body.strength.referenceFormAnatomicalCapacity).toBe(86);
  });

  it("replaces the Reference Form with another Species' body plan", () => {
    /*
     * Reference Forms are not their own catalog domain: they are owned by the
     * Species that declares them, and character resolution offers every loaded
     * Species' form as a replaceForm candidate. A transformation therefore
     * names a Species' plan rather than an id that lives nowhere.
     */
    registerDefinition("reference-form", {
      id: "two-armed-only",
      name: "Two-Armed Only",
      description: "A body plan with no legs, for the test.",
      parts: [
        {
          slotId: "upper-body-1",
          type: "upper-body",
          continuityKey: continuityKey("torso:upper"),
          attachment: null,
        },
        {
          slotId: "arm-1",
          type: "arm",
          continuityKey: continuityKey("upper-limb:left"),
          attachment: {
            parentSlotId: "upper-body-1",
            parentPosition: 1,
            childPosition: 0,
          },
        },
        {
          slotId: "arm-2",
          type: "arm",
          continuityKey: continuityKey("upper-limb:right"),
          attachment: {
            parentSlotId: "upper-body-1",
            parentPosition: 1,
            childPosition: 0,
          },
        },
      ],
    });

    const resolved = resolveTestCharacter(
      characterWith([
        {
          type: "modifyBaseBodyAnatomy",
          operation: { mode: "replaceForm", referenceFormId: "two-armed-only" },
        },
      ]),
    );

    expect(resolved.body.referenceForm.id).toBe("two-armed-only");

    // 10 upper body + 14 + 14 arms.
    expect(resolved.body.strength.referenceFormAnatomicalCapacity).toBe(38);
  });

  it("warns rather than guessing when a replaceForm names a form nothing declares", () => {
    const result = resolveCharacter(
      characterWith([
        {
          type: "modifyBaseBodyAnatomy",
          operation: { mode: "replaceForm", referenceFormId: "nonexistent" },
        },
      ]),
    );

    expect(result.success).toBe(true);

    if (!result.success) return;

    expect(result.warnings.map((warning) => warning.code)).toContain(
      "body.effects.unknown-reference-form",
    );

    // And the body it could not replace is left exactly as it was.
    expect(result.payload.body.referenceForm.parts).toHaveLength(12);
  });

  it("suppresses anatomy without touching Strength", () => {
    const resolved = resolveTestCharacter(
      characterWith([
        {
          type: "modifyResolvedBodyAnatomy",
          operation: { mode: "suppress", target: { types: ["arm"] } },
        },
      ]),
    );

    for (const id of ["arm-1", "arm-2"]) {
      expect(
        resolved.body.anatomy.parts.find((part) => part.id === id)?.state,
      ).toBe("suppressed");
    }

    /*
     * The rule normalization exists to protect: what is missing changes the
     * force actually available and never the Strength of the form. A character
     * whose Arms are sealed has not become a weaker KIND of body.
     */
    expect(resolved.body.strength.presentIntrinsicSP).toBeCloseTo(72, 6);
    expect(resolved.body.strength.normalizedBodySP).toBeCloseTo(100, 6);
    expect(resolved.stats.str).toBe(BASELINE.strength);

    // But they stop weighing anything, and stop having Body Points.
    expect(resolved.body.measurements.present.totalMassKg).toBeLessThan(
      BASELINE.massKg,
    );
    expect(resolved.body.measurements.form.totalMassKg).toBeCloseTo(62, 6);
    expect(resolved.body.points.aggregateMaximumBP).toBe(72);
  });
});


describe("intrinsic force and destruction resistance Effects reach the resolved character", () => {
  it("doubles Strength Points without changing the body's size", () => {
    const resolved = resolveTestCharacter(
      characterWith([
        { type: "modifyBaseIntrinsicPhysicalForce", multiplier: 2 },
      ]),
    );

    expect(resolved.body.strength.normalizedBodySP).toBeCloseTo(200, 6);
    expect(resolved.stats.str).toBe(11);

    /*
     * This is the Effect for strength without the muscle to show for it, so
     * nothing physical moves: same Structural Capacity, same Mass, same BP.
     */
    expect(resolved.body.structure.totalStructuralCapacity).toBeCloseTo(100, 6);
    expect(resolved.body.measurements.form.totalMassKg).toBeCloseTo(62, 6);
    expect(resolved.body.points.aggregateMaximumBP).toBe(BASELINE.maximumBP);
  });

  it("doubles Body Points without changing the structure they rest on", () => {
    const resolved = resolveTestCharacter(
      characterWith([
        { type: "modifyBaseDestructionResistance", multiplier: 2 },
      ]),
    );

    expect(resolved.body.points.aggregateMaximumBP).toBe(200);

    // Stone skin is harder to break, not larger, heavier or stronger.
    expect(resolved.body.structure.totalStructuralCapacity).toBeCloseTo(100, 6);
    expect(resolved.body.measurements.form.totalMassKg).toBeCloseTo(62, 6);
    expect(resolved.body.strength.normalizedBodySP).toBeCloseTo(100, 6);
  });

  it("applies destruction resistance only to the parts it targets", () => {
    const resolved = resolveTestCharacter(
      characterWith([
        {
          type: "modifyBaseDestructionResistance",
          multiplier: 2,
          target: { types: ["head"] },
        },
      ]),
    );

    // Head 8 BP doubles to 16; everything else is untouched, so 100 + 8.
    expect(resolved.body.points.byPartId["head-1"]?.maximumBP).toBe(16);
    expect(resolved.body.points.byPartId["neck-1"]?.maximumBP).toBe(2);
    expect(resolved.body.points.aggregateMaximumBP).toBe(108);
  });
});


describe("Base and Resolved Effect layers stay apart", () => {
  it("keeps a resolved-only Effect out of the base body", () => {
    const character = characterWith([
      { type: "modifyResolvedBodyScale", multiplier: 2 },
    ]);

    const resolved = resolveTestCharacter(character);

    expect(resolved.body.effectiveScale).toBe(2);
    expect(resolved.body.strength.normalizedBodySP).toBeCloseTo(400, 6);

    /*
     * The same input in base mode. This is the price question: permanent
     * Strength advancement is quoted against the base body, so a minute-long
     * enlargement must not make the next point of Strength cost four times
     * what it did yesterday.
     */
    const base = resolveBody({ ...resolved.bodyInput, mode: "base" });

    expect(base.success).toBe(true);

    if (!base.success) return;

    expect(base.payload.effectiveScale).toBe(1);
    expect(base.payload.strength.normalizedBodySP).toBeCloseTo(100, 6);
  });

  it("applies a base Effect in both modes", () => {
    const resolved = resolveTestCharacter(
      characterWith([{ type: "modifyBaseBodyScale", multiplier: 2 }]),
    );

    const base = resolveBody({ ...resolved.bodyInput, mode: "base" });

    expect(base.success).toBe(true);

    if (!base.success) return;

    expect(base.payload.effectiveScale).toBe(2);
    expect(base.payload.strength.normalizedBodySP).toBeCloseTo(400, 6);
  });
});


describe("a body that cannot resolve fails rather than throwing", () => {
  const withUnknownAnatomy = (): Character => {
    registerDefinition("reference-form", {
      id: "winged",
      name: "Winged",
      description: "A form naming a BodyPart definition nothing declares.",
      parts: [
        {
          slotId: "upper-body-1",
          type: "upper-body",
          continuityKey: continuityKey("torso:upper"),
          attachment: null,
        },
        {
          slotId: "wing-1",
          type: "wing",
          continuityKey: continuityKey("wing:left"),
          attachment: {
            parentSlotId: "upper-body-1",
            parentPosition: 1,
            childPosition: 0,
          },
        },
      ],
    });

    return characterWith([
      {
        type: "modifyBaseBodyAnatomy",
        operation: { mode: "replaceForm", referenceFormId: "winged" },
      },
    ]);
  };

  it("returns an EngineResult failure from resolveCharacter", () => {
    const result = resolveCharacter(withUnknownAnatomy());

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors.map((error) => error.code)).toContain(
      "body.measurements.unknown-body-part-type",
    );

    // A failure still explains how far it got.
    expect(result.trace.root.id).toBe("character.resolve");
    expect(result.trace.root.children[0]?.id).toBe("body.resolve");
  });

  it("reports the same failure through validateCharacter", () => {
    const result = validateCharacter(withUnknownAnatomy());

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors.map((error) => error.code)).toContain(
      "body.measurements.unknown-body-part-type",
    );
  });

  it("still reports the sheet's own problems alongside the body's", () => {
    const broken = withUnknownAnatomy();

    const result = validateCharacter({
      ...broken,
      details: { ...broken.details, name: "   " },
    });

    expect(result.success).toBe(false);

    if (result.success) return;

    const codes = result.errors.map((error) => error.code);

    expect(codes).toContain("character.name.empty");
    expect(codes).toContain("body.measurements.unknown-body-part-type");
  });
});


describe("Body validation runs as part of character validation", () => {
  it("rejects a morphology value that is not a multiplier", () => {
    const character = createTestCharacter({
      body: {
        ...STANDARD_BODY,
        globalMorphology: {
          length: 1,
          bulk: 0,
          muscularity: 1,
          adiposity: 1,
        },
      },
    });

    const result = validateCharacter(character);

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors.map((error) => error.code)).toContain(
      "body.morphology.invalid-morphology-value",
    );
  });

  it("passes a body that is physically ordinary", () => {
    expect(validateCharacter(createTestCharacter()).success).toBe(true);
  });

  it("tags every Body error with the character it came from", () => {
    const result = validateCharacter(
      createTestCharacter({ body: { ...STANDARD_BODY, characterScale: 1.3 } }),
    );

    expect(result.success).toBe(false);

    if (result.success) return;

    for (const error of result.errors) {
      expect(error.subject?.kind).toBe("character");
    }
  });
});


describe("the stature rule participates in character validation", () => {
  const tall = (traits: readonly { readonly traitId: string }[] = []) =>
    createTestCharacter({
      body: { ...STANDARD_BODY, characterScale: 1.3 },
      traits: [...traits],
    });

  it("rejects a Human taller than Humans ordinarily are", () => {
    const resolved = resolveTestCharacter(tall());

    expect(resolved.body.measurements.present.heightCm).toBeCloseTo(214.5, 6);

    const result = validateCharacter(tall());

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors.map((error) => error.code)).toContain(
      "body.stature.unjustified-height",
    );
  });

  it("accepts the same body once content explains it", () => {
    registerDefinition("trait", {
      id: "giant-blood",
      name: "Giant Blood",
      description: "Explains an unusual height.",
      statureAllowances: [{ dimension: "height", deviation: "above" }],
    });

    const result = validateCharacter(tall([{ traitId: "giant-blood" }]));

    expect(result.success).toBe(true);
  });

  it("does not let one allowance cover the other direction", () => {
    registerDefinition("trait", {
      id: "small-frame",
      name: "Small Frame",
      description: "Explains an unusually SHORT body, and nothing else.",
      statureAllowances: [{ dimension: "height", deviation: "below" }],
    });

    const result = validateCharacter(tall([{ traitId: "small-frame" }]));

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors.map((error) => error.code)).toContain(
      "body.stature.unjustified-height",
    );
  });

  it("records which content granted each allowance", () => {
    registerDefinition("trait", {
      id: "giant-blood",
      name: "Giant Blood",
      description: "Explains an unusual height.",
      statureAllowances: [{ dimension: "height", deviation: "above" }],
    });

    const resolved = resolveTestCharacter(tall([{ traitId: "giant-blood" }]));

    expect(resolved.statureJustifications).toEqual([
      { sourceId: "giant-blood", dimension: "height", deviation: "above" },
    ]);
  });

  it("collects an allowance from content that declares no Effects at all", () => {
    /*
     * The regression this exists for: source collection used to skip any
     * definition with an empty Effect list, which would have silently dropped
     * a Trait whose entire purpose is to permit an unusual body.
     */
    registerDefinition("trait", {
      id: "purely-explanatory",
      name: "Purely Explanatory",
      description: "Carries an allowance and nothing else.",
      statureAllowances: [{ dimension: "height", deviation: "above" }],
    });

    const resolved = resolveTestCharacter(
      tall([{ traitId: "purely-explanatory" }]),
    );

    expect(resolved.statureJustifications).toHaveLength(1);
  });
});

describe("Injury validation follows the resolved anatomy", () => {
  /*
   * An Injury's location is checked against the body that actually resolved,
   * not the one on the sheet. Body Effects can add a limb or replace a form,
   * and validating against stored anatomy would reject an Injury on anatomy
   * the character demonstrably has.
   */
  function registerBruise(): void {
    registerDefinition("injury", {
      id: "bruise",
      name: "Bruise",
      description: "A test Injury with no applicability constraint.",
      applicability: { bodyParts: { all: true } },
      recovery: { treatmentRequired: false },
    });
  }

  it("accepts an Injury on anatomy an Effect added", () => {
    registerBruise();

    const character = characterWith([
      {
        type: "modifyBaseBodyAnatomy",
        operation: {
          mode: "addToForm",
          slotId: "tail-1",
          type: "arm",
          attachToSlotId: "lower-body-1",
        },
      },
    ]);

    const injured: Character = {
      ...character,
      injuries: [
        {
          id: "injury-1",
          injuryId: "bruise",
          location: {
            continuityKeys: [continuityKey("standard-humanoid:tail-1")],
          },
        },
      ],
    };

    // The part exists only because the Effect put it there.
    const resolved = resolveTestCharacter(injured);

    expect(
      resolved.body.anatomy.parts.some(
        (part) => part.continuityKey === continuityKey("standard-humanoid:tail-1"),
      ),
    ).toBe(true);

    expect(validateCharacter(injured).success).toBe(true);
  });

  it("still rejects an Injury on anatomy nothing gave the character", () => {
    registerBruise();

    const result = validateCharacter(
      createTestCharacter({
        injuries: [
          {
            id: "injury-1",
            injuryId: "bruise",
            location: {
            continuityKeys: [continuityKey("standard-humanoid:tail-1")],
          },
          },
        ],
      }),
    );

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors.map((error) => error.code)).toContain(
      "character.injury.body_part_unknown",
    );
  });

  it("does not invalidate an Injury because the limb was destroyed", () => {
    /*
     * Destruction removes a current manifestation; it does not erase the
     * anatomical history the archive exists to keep. Whether the Injury still
     * applies — superseded, or dormant until the limb is regenerated — is the
     * Injury system's decision, not a side effect of the instance leaving
     * active anatomy.
     */
    registerDefinition("injury", {
      id: "dislocated-shoulder",
      name: "Dislocated Shoulder",
      description: "A test Injury located at a Special Point.",
      applicability: { specialPointDefinitionIds: ["shoulder"] },
      recovery: { treatmentRequired: false },
    });

    const injured: Character = createTestCharacter({
      body: {
        ...STANDARD_BODY,
        continuity: destroyContinuity(
          {},
          continuityKey("upper-limb:left"),
        ),
      },
      injuries: [
        {
          id: "injury-1",
          injuryId: "dislocated-shoulder",
          location: {
            continuityKeys: [continuityKey("upper-limb:left")],
            specialPointDefinitionId: "shoulder",
          },
        },
      ],
    });

    const resolved = resolveTestCharacter(injured);

    // The Arm is gone, so it hosts nothing right now.
    expect(
      resolved.body.anatomicalPoints.points.some(
        (point) => point.hostPartId === "arm-1",
      ),
    ).toBe(false);

    // The record of it is not, and the sheet stays legal.
    expect(validateCharacter(injured).success).toBe(true);
  });

  it("does not invalidate an Injury because an Effect suppressed the limb", () => {
    /*
     * Suppression is reversible and temporary. A sealed arm is hidden, not
     * gone, and a sheet must not become illegal for the duration — the error's
     * own advice ("point the Injury somewhere else") would be wrong about data
     * that is already correct.
     */
    registerDefinition("injury", {
      id: "dislocated-shoulder",
      name: "Dislocated Shoulder",
      description: "A test Injury located at a Special Point.",
      applicability: { specialPointDefinitionIds: ["shoulder"] },
      recovery: { treatmentRequired: false },
    });

    const character = characterWith([
      {
        type: "modifyResolvedBodyAnatomy",
        operation: { mode: "suppress", target: { types: ["arm"] } },
      },
    ]);

    const injured: Character = {
      ...character,
      injuries: [
        {
          id: "injury-1",
          injuryId: "dislocated-shoulder",
          location: {
            continuityKeys: [continuityKey("upper-limb:left")],
            specialPointDefinitionId: "shoulder",
          },
        },
      ],
    };

    const resolved = resolveTestCharacter(injured);

    expect(
      resolved.body.anatomy.parts.find((part) => part.id === "arm-1")?.state,
    ).toBe("suppressed");

    // The suppressed Arm hosts no usable Shoulder...
    expect(
      resolved.body.anatomicalPoints.points.some(
        (point) => point.hostPartId === "arm-1",
      ),
    ).toBe(false);

    // ...and the sheet is still legal.
    expect(validateCharacter(injured).success).toBe(true);
  });
});
