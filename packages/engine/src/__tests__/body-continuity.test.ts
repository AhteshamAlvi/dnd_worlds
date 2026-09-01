/*
 * Anatomical continuity: forms, transformation, and the state that survives it.
 *
 * The three namespaces this suite exists to keep apart:
 *
 *   slotId         where anatomy sits inside ONE Reference Form
 *   BodyPart.id    which instance is standing there right now
 *   ContinuityKey  what that anatomy IS, across forms and regenerations
 *
 * They were one namespace for most of this engine's life, and got away with it
 * because the Standard Human names every instance after its slot. Every test
 * below deliberately breaks that coincidence.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";
import { BODY_PART_DEFINITIONS } from "../character/foundation/body/anatomy/body-parts";
import { instantiateAnatomy } from "../character/foundation/body/anatomy/creation";
import { STANDARD_HUMANOID_FORM } from "../character/foundation/body/anatomy/reference-forms";
import { validateReferenceForm } from "../character/foundation/body/anatomy/validation";
import { regenerateAnatomy } from "../character/foundation/body/regeneration";
import { SPECIAL_POINT_DEFINITIONS } from "../character/foundation/body/critical-points/special-points";
import { continuityKey } from "../character/foundation/body/anatomy/types";
import {
  destroyContinuity,
  regenerateContinuity,
} from "../character/foundation/body/continuity";
import { STANDARD_BODY } from "../character/foundation/body/defaults";
import { resolveCharacter } from "../character/resolution";
import { validateCharacter } from "../character/validation";
import type {
  BodyPartDefinition,
  ReferenceForm,
  ReferenceFormPart,
} from "../character/foundation/body/anatomy/types";
import type { ContinuityStates } from "../character/foundation/body/continuity";
import type { Character } from "../character/types";

import {
  createTestCharacter,
  resolveTestCharacter,
} from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});


const DEFINITIONS = Object.values(
  BODY_PART_DEFINITIONS,
) as readonly BodyPartDefinition[];

const SPECIAL_POINTS = Object.values(SPECIAL_POINT_DEFINITIONS);

/* Identities the Standard Human declares, named once so the tests read. */
const TORSO = continuityKey("torso:upper");
const LEFT_ARM = continuityKey("upper-limb:left");
const RIGHT_ARM = continuityKey("upper-limb:right");
const LEFT_WING = continuityKey("wing:left");

const attached = (parentSlotId: string) => ({
  parentSlotId,
  parentPosition: 1,
  childPosition: 0,
});


/*
 * A wolf: the same four limbs, arranged as legs, under different slot names.
 *
 * The point of the fixture is that NOTHING about it resembles the Human form
 * except the continuity identities. Slot ids differ, BodyPart types differ, and
 * the correspondence holds anyway because both definitions say so.
 */
const WOLF_FORM = {
  id: "wolf",
  name: "Wolf",
  description: "A four-legged form, for transformation tests.",
  parts: [
    { slotId: "trunk", type: "upper-body", continuityKey: TORSO, attachment: null },
    { slotId: "fore-left", type: "leg", continuityKey: LEFT_ARM, attachment: attached("trunk") },
    { slotId: "fore-right", type: "leg", continuityKey: RIGHT_ARM, attachment: attached("trunk") },
  ],
} as const;

/* A winged form, for anatomy the Human simply does not have. */
const ANGEL_FORM = {
  id: "angel",
  name: "Angel",
  description: "A winged humanoid, for dormancy tests.",
  parts: [
    ...STANDARD_HUMANOID_FORM.parts,
    {
      slotId: "wing-left",
      type: "arm",
      continuityKey: LEFT_WING,
      attachment: attached("upper-body-1"),
    },
  ],
} as const;


function becomes(formId: string, mode: "base" | "resolved" = "resolved") {
  registerDefinition("trait", {
    id: "transformed",
    name: "Transformed",
    description: "Carries the form replacement under test.",
    effects: [
      {
        type:
          mode === "base"
            ? "modifyBaseBodyAnatomy"
            : "modifyResolvedBodyAnatomy",
        operation: { mode: "replaceForm", referenceFormId: formId },
      },
    ],
  });

  return { traitId: "transformed" };
}

function characterWith(
  continuity: ContinuityStates,
  traits: readonly { readonly traitId: string }[] = [],
): Character {
  return createTestCharacter({
    traits: [...traits],
    body: { ...STANDARD_BODY, continuity },
  });
}


describe("Reference Forms are complete blueprints", () => {
  it("instantiates anatomy, topology and geometry from the form alone", () => {
    const anatomy = instantiateAnatomy(STANDARD_HUMANOID_FORM, {});

    expect(anatomy.parts).toHaveLength(12);

    const head = anatomy.parts.find((part) => part.referenceSlotId === "head-1");

    expect(head?.attachment?.parentId).toBe("neck-1");
    expect(head?.continuityKey).toBe(continuityKey("head"));

    /*
     * The three geometry cases the Standard Human exists to exercise: the
     * torso pair meeting inferior-to-superior, and both hips at one pelvis
     * coordinate.
     */
    const lowerBody = anatomy.parts.find(
      (part) => part.referenceSlotId === "lower-body-1",
    );

    expect(lowerBody?.attachment?.parentPosition).toBe(0);
    expect(lowerBody?.attachment?.childPosition).toBe(1);
  });

  it("resolves the Basic Human Standard from the blueprint", () => {
    const resolved = resolveTestCharacter(createTestCharacter());

    expect(resolved.body.measurements.present.heightCm).toBeCloseTo(165, 6);
    expect(resolved.body.measurements.present.totalMassKg).toBeCloseTo(62, 6);
    expect(resolved.body.strength.normalizedBodySP).toBeCloseTo(100, 6);
  });

  const invalid = (parts: readonly ReferenceFormPart[]): ReferenceForm => ({
    id: "broken",
    parts,
  });

  it("rejects a slot attached to a parent the form does not declare", () => {
    const result = validateReferenceForm(
      invalid([
        { slotId: "trunk", type: "upper-body", continuityKey: TORSO, attachment: null },
        { slotId: "arm", type: "arm", continuityKey: LEFT_ARM, attachment: attached("nowhere") },
      ]),
      DEFINITIONS,
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(
      "missing-parent-slot",
    );
  });

  it("rejects a duplicate slot id", () => {
    const result = validateReferenceForm(
      invalid([
        { slotId: "trunk", type: "upper-body", continuityKey: TORSO, attachment: null },
        { slotId: "trunk", type: "arm", continuityKey: LEFT_ARM, attachment: null },
      ]),
      DEFINITIONS,
    );

    expect(result.issues.map((issue) => issue.code)).toContain(
      "duplicate-slot-id",
    );
  });

  it("rejects a BodyPart type nothing declares", () => {
    const result = validateReferenceForm(
      invalid([
        { slotId: "trunk", type: "chassis", continuityKey: TORSO, attachment: null },
      ]),
      DEFINITIONS,
    );

    expect(result.issues.map((issue) => issue.code)).toContain(
      "unknown-body-part-type",
    );
  });

  it("rejects two slots claiming one identity within a form", () => {
    /*
     * Across forms this is the whole mechanism. Within one form it leaves
     * every persistent value with two places to land and no rule for choosing.
     */
    const result = validateReferenceForm(
      invalid([
        { slotId: "trunk", type: "upper-body", continuityKey: TORSO, attachment: null },
        { slotId: "arm-a", type: "arm", continuityKey: LEFT_ARM, attachment: attached("trunk") },
        { slotId: "arm-b", type: "arm", continuityKey: LEFT_ARM, attachment: attached("trunk") },
      ]),
      DEFINITIONS,
    );

    expect(result.issues.map((issue) => issue.code)).toContain(
      "duplicate-continuity-key",
    );
  });

  it("rejects a form with no root and one with a cycle", () => {
    const rootless = validateReferenceForm(
      invalid([
        { slotId: "a", type: "arm", continuityKey: LEFT_ARM, attachment: attached("b") },
        { slotId: "b", type: "arm", continuityKey: RIGHT_ARM, attachment: attached("a") },
      ]),
      DEFINITIONS,
    );

    expect(rootless.issues.map((issue) => issue.code)).toContain("missing-root");
    expect(rootless.issues.map((issue) => issue.code)).toContain(
      "attachment-cycle",
    );
  });

  it("accepts the authored Standard Human", () => {
    expect(
      validateReferenceForm(STANDARD_HUMANOID_FORM, DEFINITIONS).valid,
    ).toBe(true);
  });
});


describe("the three namespaces stay apart", () => {
  it("gives a slot, an instance and an identity three different values", () => {
    registerDefinition("reference-form", WOLF_FORM);

    const resolved = resolveTestCharacter(
      characterWith({}, [becomes("wolf")]),
    );

    const foreleg = resolved.body.anatomy.parts.find(
      (part) => part.continuityKey === LEFT_ARM,
    );

    expect(foreleg?.referenceSlotId).toBe("fore-left");
    expect(foreleg?.continuityKey).toBe(LEFT_ARM);

    /*
     * The identity is NOT the slot. A resolver that conflated the two would
     * find the Human's arm damage under "fore-left" and miss it entirely.
     */
    expect(String(foreleg?.continuityKey)).not.toBe(foreleg?.referenceSlotId);
  });

  it("keeps a form's own slot ids out of the identity namespace", () => {
    registerDefinition("reference-form", WOLF_FORM);

    const resolved = resolveTestCharacter(
      characterWith({}, [becomes("wolf")]),
    );

    const slots = resolved.body.referenceForm.parts.map((part) => part.slotId);
    const identities = resolved.body.referenceForm.parts.map(
      (part) => String(part.continuityKey),
    );

    expect(slots).toEqual(["trunk", "fore-left", "fore-right"]);
    expect(identities).not.toEqual(slots);
  });
});


describe("replaceForm produces the target form's anatomy", () => {
  it("turns a Human into a Wolf, not a Human wearing a Wolf's label", () => {
    registerDefinition("reference-form", WOLF_FORM);

    const resolved = resolveTestCharacter(
      characterWith({}, [becomes("wolf")]),
    );

    expect(resolved.body.referenceForm.id).toBe("wolf");
    expect(resolved.body.anatomy.parts.map((part) => part.referenceSlotId)).toEqual([
      "trunk",
      "fore-left",
      "fore-right",
    ]);

    /* Human-only anatomy is simply not manifested. */
    expect(
      resolved.body.anatomy.parts.some((part) => part.type === "head"),
    ).toBe(false);

    /* Upper Body 10 + two Legs at 16. */
    expect(resolved.body.strength.referenceFormAnatomicalCapacity).toBe(42);
  });

  it("grows real anatomy for a form with more of it", () => {
    registerDefinition("reference-form", ANGEL_FORM);

    const resolved = resolveTestCharacter(
      characterWith({}, [becomes("angel")]),
    );

    expect(resolved.body.anatomy.parts).toHaveLength(13);
    expect(
      resolved.body.anatomy.parts.some(
        (part) => part.continuityKey === LEFT_WING,
      ),
    ).toBe(true);

    /* A wing weighs something and has Body Points, like any other anatomy. */
    expect(resolved.body.measurements.present.totalMassKg).toBeGreaterThan(62);
  });

  it("normalizes Strength against the transformed form's own blueprint", () => {
    registerDefinition("reference-form", ANGEL_FORM);

    const human = resolveTestCharacter(createTestCharacter());
    const angel = resolveTestCharacter(characterWith({}, [becomes("angel")]));

    /*
     * Extra intended anatomy raises numerator and denominator together, so a
     * winged form is not a free Strength tier — the same invariant that makes
     * a four-armed Species STR 10.
     */
    expect(angel.body.strength.referenceFormAnatomicalCapacity).toBe(114);
    expect(angel.body.strength.normalizedBodySP).toBeCloseTo(
      human.body.strength.normalizedBodySP,
      6,
    );
  });

  it("leaves the stored body untouched when the replacement is resolved-only", () => {
    registerDefinition("reference-form", WOLF_FORM);

    const character = characterWith({}, [becomes("wolf", "resolved")]);
    const before = JSON.parse(JSON.stringify(character.body)) as unknown;

    const resolved = resolveTestCharacter(character);

    expect(resolved.body.referenceForm.id).toBe("wolf");

    /*
     * Nothing was written. A temporary transformation is a resolution-time
     * view, so removing the Trait is all it takes to be human again.
     */
    expect(character.body).toEqual(before);

    const untransformed = resolveTestCharacter(characterWith({}));

    expect(untransformed.body.referenceForm.id).toBe("standard-humanoid");
    expect(untransformed.body.anatomy.parts).toHaveLength(12);
  });
});


describe("persistent state follows the identity across forms", () => {
  it("carries an integrity fraction onto whatever anatomy corresponds", () => {
    registerDefinition("reference-form", WOLF_FORM);

    const hurt: ContinuityStates = { [LEFT_ARM]: { integrity: 0.4 } };

    const human = resolveTestCharacter(characterWith(hurt));
    const wolf = resolveTestCharacter(characterWith(hurt, [becomes("wolf")]));

    const humanArm = human.body.points.parts.find(
      (part) => part.partId === "arm-1",
    );
    const wolfLeg = wolf.body.points.parts.find(
      (part) => part.partId === "fore-left",
    );

    /*
     * The SAME injury on two different bodies. An Arm's Max BP is 14 and a
     * Leg's is 16, so raw missing BP would have healed or maimed this
     * character for changing shape; the fraction means "40% intact" and each
     * form works out its own Current BP.
     */
    expect(humanArm?.maximumBP).toBe(14);
    expect(wolfLeg?.maximumBP).toBe(16);

    expect(humanArm?.currentBP).toBe(6);
    expect(wolfLeg?.currentBP).toBe(6);

    expect(
      wolf.body.anatomy.parts.find((part) => part.continuityKey === LEFT_ARM)
        ?.integrity,
    ).toBeCloseTo(0.4, 10);
  });

  it("keeps damage dormant while no form expresses that anatomy", () => {
    registerDefinition("reference-form", ANGEL_FORM);

    const brokenWing: ContinuityStates = { [LEFT_WING]: { integrity: 0.4 } };

    /* As a Human there is no wing at all — nothing to show, nothing lost. */
    const human = resolveTestCharacter(characterWith(brokenWing));

    expect(
      human.body.anatomy.parts.some((part) => part.continuityKey === LEFT_WING),
    ).toBe(false);

    /* As an Angel the wing returns, still at 40%. */
    const angel = resolveTestCharacter(
      characterWith(brokenWing, [becomes("angel")]),
    );

    expect(
      angel.body.anatomy.parts.find((part) => part.continuityKey === LEFT_WING)
        ?.integrity,
    ).toBeCloseTo(0.4, 10);
  });

  it("carries individual morphology to the corresponding anatomy", () => {
    registerDefinition("reference-form", WOLF_FORM);

    const longLimb: ContinuityStates = {
      [LEFT_ARM]: { morphology: { length: 1.2 } },
    };

    const wolf = resolveTestCharacter(characterWith(longLimb, [becomes("wolf")]));

    const lengthOf = (partId: string) =>
      wolf.body.measurements.present.parts.find(
        (part) => part.partId === partId,
      )?.lengthCm;

    /* A Leg's reference length is 81 cm; this character's is 20% longer. */
    expect(lengthOf("fore-left")).toBeCloseTo(97.2, 6);

    /* And the identity that was never unusual is not. */
    expect(lengthOf("fore-right")).toBeCloseTo(81, 6);
  });

  it("does not lend one identity's morphology to another", () => {
    const resolved = resolveTestCharacter(
      characterWith({ [LEFT_ARM]: { morphology: { length: 1.2 } } }),
    );

    const lengthOf = (partId: string) =>
      resolved.body.measurements.present.parts.find(
        (part) => part.partId === partId,
      )?.lengthCm;

    expect(lengthOf("arm-1")).toBeCloseTo(66, 6);
    expect(lengthOf("arm-2")).toBeCloseTo(55, 6);
    expect(lengthOf("leg-1")).toBeCloseTo(81, 6);
  });

  it("grows back whole, not merely present", () => {
    /*
     * The bug this pins. Restoring the continuity record alone brought the arm
     * back at full integrity and left its Anatomical Points archived, so the
     * limb was structurally perfect and permanently unusable — destroyed
     * Shoulder, destroyed Elbow, everything downstream at a quarter
     * effectiveness. Whole in every number except the ones anyone would check.
     */
    const wrecked = destroyContinuity(
      destroyContinuity(
        { [RIGHT_ARM]: { integrity: 0.3, morphology: { length: 1.2 } } },
        RIGHT_ARM,
      ),
      continuityKey("extremity:upper-right"),
    );

    const outcome = regenerateAnatomy({
      referenceForm: STANDARD_HUMANOID_FORM,
      continuity: wrecked,
      anatomicalPoints: {
        "shoulder:arm-2": "archived-removed",
        "elbow:arm-2": "archived-removed",
        "wrist:arm-2": "archived-removed",
      },
      definitions: DEFINITIONS,
      specialPointDefinitions: SPECIAL_POINTS,
      continuityKey: RIGHT_ARM,
    });

    /* Destruction took the Hand with the Arm, so regeneration returns it. */
    expect(outcome.restored).toEqual([
      RIGHT_ARM,
      continuityKey("extremity:upper-right"),
    ]);

    /* The old manifestation's joint records are gone. */
    expect(outcome.anatomicalPoints).toEqual({});

    const regrown = resolveTestCharacter(
      createTestCharacter({
        body: {
          ...STANDARD_BODY,
          continuity: outcome.continuity,
          anatomicalPoints: outcome.anatomicalPoints,
        },
      }),
    );

    const arm = regrown.body.capability.byPartId["arm-2"];
    const hand = regrown.body.capability.byPartId["hand-2"];

    expect(arm?.accessible).toBe(true);
    expect(arm?.effectiveness).toBe(1);
    expect(hand?.accessible).toBe(true);
    expect(hand?.effectiveness).toBe(1);

    /* Full integrity: a new limb, not the damaged one that was lost. */
    expect(outcome.continuity[RIGHT_ARM]?.integrity).toBe(1);
    expect(outcome.continuity[RIGHT_ARM]?.destroyed).toBe(false);

    /* And still theirs: their own morphology came through untouched. */
    expect(outcome.continuity[RIGHT_ARM]?.morphology).toEqual({ length: 1.2 });
    expect(
      regrown.body.measurements.present.parts.find(
        (part) => part.partId === "arm-2",
      )?.lengthCm,
    ).toBeCloseTo(66, 6);
  });

  it("survives destruction and comes back on regeneration", () => {
    const own: ContinuityStates = {
      [RIGHT_ARM]: { morphology: { length: 1.2 } },
    };

    const destroyed = destroyContinuity(own, RIGHT_ARM);

    const missing = resolveTestCharacter(characterWith(destroyed));

    /* Gone, and it took the Hand with it. */
    expect(
      missing.body.anatomy.parts.find(
        (part) => part.continuityKey === RIGHT_ARM,
      )?.state,
    ).toBe("archived-removed");
    expect(
      missing.body.anatomy.parts.find(
        (part) => part.referenceSlotId === "hand-2",
      )?.state,
    ).toBe("archived-removed");

    /* The morphology was not deleted along with the limb. */
    expect(destroyed[RIGHT_ARM]?.morphology).toEqual({ length: 1.2 });

    const regrown = resolveTestCharacter(
      characterWith(regenerateContinuity(destroyed, RIGHT_ARM)),
    );

    expect(
      regrown.body.measurements.present.parts.find(
        (part) => part.partId === "arm-2",
      )?.lengthCm,
    ).toBeCloseTo(66, 6);
  });
});


describe("Injuries are valid while dormant", () => {
  function registerWingFracture(): void {
    registerDefinition("injury", {
      id: "fractured-wing",
      name: "Fractured Wing",
      description: "A test Injury on anatomy the Human form lacks.",
      applicability: { bodyParts: { all: true } },
      recovery: { treatmentRequired: false },
    });
  }

  const withWingInjury = (traits: readonly { readonly traitId: string }[]) => {
    const base = characterWith({ [LEFT_WING]: { integrity: 0.4 } }, traits);

    return {
      ...base,
      injuries: [
        {
          id: "injury-1",
          injuryId: "fractured-wing",
          location: { continuityKeys: [LEFT_WING] },
        },
      ],
    } satisfies Character;
  };

  it("stays valid on a form that cannot express the anatomy", () => {
    registerWingFracture();
    registerDefinition("reference-form", ANGEL_FORM);

    /*
     * A Human with a Dragon's wing injury. The anatomy is not there, and the
     * record is not wrong — it is dormant. Reporting it as invalid would tell
     * the player to move an Injury that is exactly where it belongs.
     */
    const asHuman = withWingInjury([]);

    expect(validateCharacter(asHuman).success).toBe(true);

    const resolved = resolveTestCharacter(asHuman);

    expect(
      resolved.body.anatomy.parts.some(
        (part) => part.continuityKey === LEFT_WING,
      ),
    ).toBe(false);
  });

  it("becomes expressible again on a form that has the anatomy", () => {
    registerWingFracture();
    registerDefinition("reference-form", ANGEL_FORM);

    const asAngel = withWingInjury([becomes("angel")]);

    expect(validateCharacter(asAngel).success).toBe(true);

    const resolved = resolveTestCharacter(asAngel);

    const wing = resolved.body.anatomy.parts.find(
      (part) => part.continuityKey === LEFT_WING,
    );

    expect(wing?.state).toBe("active");
    expect(wing?.integrity).toBeCloseTo(0.4, 10);
  });

  it("still rejects an identity this character's body has never had", () => {
    registerWingFracture();

    /*
     * No wing in any form this character can take, and no persistent record of
     * one. That is a genuine authoring error rather than dormancy.
     */
    const result = validateCharacter(withWingInjury([]));

    expect(result.success).toBe(true);

    const nowhere = validateCharacter({
      ...createTestCharacter(),
      injuries: [
        {
          id: "injury-1",
          injuryId: "fractured-wing",
          location: { continuityKeys: [continuityKey("tentacle:third")] },
        },
      ],
    });

    expect(nowhere.success).toBe(false);

    if (nowhere.success) return;

    expect(nowhere.errors.map((error) => error.code)).toContain(
      "character.injury.continuity_unknown",
    );
  });
});


describe("a character resolves the same way twice", () => {
  it("is pure across a transformation", () => {
    registerDefinition("reference-form", WOLF_FORM);

    const character = characterWith(
      { [LEFT_ARM]: { integrity: 0.4, morphology: { length: 1.1 } } },
      [becomes("wolf")],
    );

    const first = resolveCharacter(character);
    const second = resolveCharacter(character);

    expect(first.success && second.success).toBe(true);

    if (!first.success || !second.success) return;

    expect(second.payload.body.anatomy).toEqual(first.payload.body.anatomy);
    expect(second.payload.stats).toEqual(first.payload.stats);
  });
});
