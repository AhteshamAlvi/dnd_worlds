/*
 * Strength.
 *
 * The direction is the reverse of most systems, and every case here exists to
 * hold one end of it down:
 *
 *   Body -> SC -> Intrinsic SP -> Normalized Body SP -> STR
 *
 * Strength is never stored. Buying "+1 STR" solves for the Muscularity that
 * doubles this body's normalized Strength Points, and the displayed number
 * falls out of the physics afterwards.
 *
 * The gates that actually decide whether the model is right are the four
 * normalization cases — reference Human, Giant, four-armed form, amputee —
 * because each one is a way the naive implementation goes wrong. Extra anatomy
 * granting free Strength and amputation cancelling itself out are the same bug
 * seen from two sides, and only a denominator computed from a different input
 * than the numerator avoids both.
 */

import { describe, expect, it } from "vitest";

import { BODY_PART_DEFINITIONS } from "../character/foundation/body/anatomy/body-parts";
import { HUMAN_AGE_PROFILE } from "../character/foundation/body/age/human-age-profile";
import { resolveAge } from "../character/foundation/body/age/resolution";
import {
  createAnatomy,
  createReferenceForm,
} from "../character/foundation/body/anatomy/creation";
import { setBodyPartState } from "../character/foundation/body/anatomy/modification";
import {
  STANDARD_HUMANOID_ANATOMY,
  STANDARD_HUMANOID_BODY_PART_SPECS,
  STANDARD_HUMANOID_REFERENCE_FORM,
} from "../character/foundation/body/anatomy/standard-humanoid";
import {
  advanceStrength,
  solveMonotonicTarget,
} from "../character/foundation/body/strength/advancement";
import {
  MAX_DISPLAYED_STRENGTH,
  resolveDisplayedStrength,
  resolveNormalizedBodySP,
  resolveReferenceFormAnatomicalCapacity,
  resolveStrengthPosition,
} from "../character/foundation/body/strength/normalization";
import {
  resolveBodyStrength,
  resolveMuscularityForceFactor,
} from "../character/foundation/body/strength/resolution";
import {
  findStrengthAdvancementCapabilityIssues,
  findStrengthMonotonicityIssues,
} from "../character/foundation/body/strength/validation";
import {
  morphologyTargetsForAnatomy,
  morphologyTargetsForReferenceForm,
  resolveMorphology,
} from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import type { MorphologyResolutionInput } from "../character/foundation/body/morphology/types";
import type { BodyPartCreationSpec } from "../character/foundation/body/anatomy/creation";
import type {
  Anatomy,
  BodyPartDefinition,
  ReferenceForm,
} from "../character/foundation/body/anatomy/types";

const DEFINITIONS = Object.values(
  BODY_PART_DEFINITIONS,
) as readonly BodyPartDefinition[];

const NEUTRAL_SOURCE = { global: NEUTRAL_MORPHOLOGY, local: {} };


function morphologyInput(
  strengthDevelopmentMuscularity = 1,
): MorphologyResolutionInput {
  return {
    species: NEUTRAL_SOURCE,
    age: NEUTRAL_SOURCE,
    character: NEUTRAL_SOURCE,
    strengthDevelopmentMuscularity,
    effectLayers: [],
  };
}


function strengthOf(
  anatomy: Anatomy,
  referenceForm: ReferenceForm,
  mode: "base" | "resolved",
  effectiveScale = 1,
  muscularity = 1,
  definitions: readonly BodyPartDefinition[] = DEFINITIONS,
) {
  const partIds = [
    ...morphologyTargetsForAnatomy(anatomy),
    ...morphologyTargetsForReferenceForm(referenceForm),
  ];

  return resolveBodyStrength(
    {
      anatomy,
      referenceForm,
      definitions,
      base: {
        morphologyByPartId: resolveMorphology(
          morphologyInput(muscularity),
          partIds,
        ),
        effectiveScale,
      },
    },
    { mode },
  );
}


function humanStrength(
  mode: "base" | "resolved" = "resolved",
  effectiveScale = 1,
  muscularity = 1,
) {
  return strengthOf(
    STANDARD_HUMANOID_ANATOMY,
    STANDARD_HUMANOID_REFERENCE_FORM,
    mode,
    effectiveScale,
    muscularity,
  );
}


describe("the Human calibration gate", () => {
  /*
   * The identity the whole model rests on: at neutral Muscularity both the
   * structural and the force factor are exactly 1, so a neutral Human's
   * intrinsic Strength Points equal its reference Structural Capacity, and
   * normalizing 100 against 100 puts it at exactly position 10.
   */
  it("puts the reference Human at 100 SP, 100 capacity, position 10, STR 10", () => {
    const resolved = humanStrength();

    expect(resolved.referenceFormIntrinsicSP).toBeCloseTo(100, 10);
    expect(resolved.referenceFormAnatomicalCapacity).toBeCloseTo(100, 10);
    expect(resolved.normalizedBodySP).toBeCloseTo(100, 10);
    expect(resolved.strengthPosition).toBeCloseTo(10, 10);
    expect(resolved.displayedStrength).toBe(10);
  });

  it("reads the same in base mode as in resolved mode on an intact body", () => {
    expect(humanStrength("base").normalizedBodySP).toBeCloseTo(
      humanStrength("resolved").normalizedBodySP,
      10,
    );
  });

  it("neutralizes both Muscularity factors at Muscularity 1", () => {
    for (const definition of DEFINITIONS) {
      expect(
        resolveMuscularityForceFactor(
          NEUTRAL_MORPHOLOGY,
          definition.sensitivity,
        ),
      ).toBe(1);
    }
  });

  /*
   * The force factor is exponential where the structural factor is linear, and
   * that gap is the entire reason they are separate fields. Route Strength
   * through the structural response alone and reaching STR 14 needs a
   * Muscularity that makes a Human weigh tonnes.
   */
  it("makes force respond exponentially where structure responds linearly", () => {
    const arm = BODY_PART_DEFINITIONS.arm;

    expect(
      resolveMuscularityForceFactor(
        { ...NEUTRAL_MORPHOLOGY, muscularity: 2 },
        arm.sensitivity,
      ),
    ).toBeCloseTo(2, 10);

    expect(
      resolveMuscularityForceFactor(
        { ...NEUTRAL_MORPHOLOGY, muscularity: 3 },
        arm.sensitivity,
      ),
    ).toBeCloseTo(4, 10);
  });
});


describe("the Giant gate", () => {
  /*
   * Scale-10, proportionally ordinary, neutral Muscularity. SC goes as Scale
   * squared so the body produces 10,000 intrinsic SP, but the Reference Form
   * Anatomical Capacity is a property of the body PLAN and does NOT scale —
   * which is precisely why the Giant reads as strong. Scaling the denominator
   * too would normalize a Giant against a Giant and hand back STR 10.
   */
  it("resolves a Scale-10 fixture to 10,000 normalized SP, position 16.64, STR 16", () => {
    const resolved = humanStrength("resolved", 10);

    expect(resolved.referenceFormIntrinsicSP).toBeCloseTo(10_000, 6);
    expect(resolved.referenceFormAnatomicalCapacity).toBeCloseTo(100, 10);
    expect(resolved.normalizedBodySP).toBeCloseTo(10_000, 6);
    expect(resolved.strengthPosition).toBeCloseTo(16.6438561898, 8);
    expect(resolved.displayedStrength).toBe(16);
  });

  it("gains exactly two Strength points per doubling of Scale", () => {
    const single = humanStrength("resolved", 1).strengthPosition!;
    const doubled = humanStrength("resolved", 2).strengthPosition!;

    expect(doubled - single).toBeCloseTo(2, 10);
  });
});


describe("Reference-Form normalization", () => {
  const FOUR_ARM_SPECS: readonly BodyPartCreationSpec[] = [
    ...STANDARD_HUMANOID_BODY_PART_SPECS,
    {
      id: "arm-3",
      type: "arm",
      attachment: { parentId: "upper-body-1", parentPosition: 0.7, childPosition: 0 },
    },
    {
      id: "hand-3",
      type: "hand",
      attachment: { parentId: "arm-3" },
    },
    {
      id: "arm-4",
      type: "arm",
      attachment: { parentId: "upper-body-1", parentPosition: 0.7, childPosition: 0 },
    },
    {
      id: "hand-4",
      type: "hand",
      attachment: { parentId: "arm-4" },
    },
  ];

  /*
   * Extra INTENDED anatomy raises numerator and denominator together. A
   * four-armed Species is not stronger for having four arms any more than a
   * Human is stronger than a Human; it is simply built differently.
   */
  it("gives a four-armed form 136 / 136 -> normalized 100 -> STR 10", () => {
    const anatomy = createAnatomy(FOUR_ARM_SPECS);
    const referenceForm = createReferenceForm(FOUR_ARM_SPECS);

    const resolved = strengthOf(anatomy, referenceForm, "resolved");

    expect(resolved.referenceFormAnatomicalCapacity).toBeCloseTo(136, 10);
    expect(resolved.referenceFormIntrinsicSP).toBeCloseTo(136, 10);
    expect(resolved.normalizedBodySP).toBeCloseTo(100, 10);
    expect(resolved.displayedStrength).toBe(10);
  });

  /*
   * The rule that changed, and it changed on purpose.
   *
   * An earlier model took the numerator over currently-present anatomy, so an
   * amputated Human read 64 over 100 and dropped to STR 9. That conflated two
   * different questions — how strong the character fundamentally is, and how
   * much of their body is available to use — and answered both with one
   * number. Their remaining muscles did not get weaker when the Arms left.
   *
   * STR now describes the intact form and never moves. What moves is
   * presentIntrinsicSP: the force actually there.
   */
  it("leaves an amputated Human at STR 10 with 64 present SP", () => {
    let anatomy = STANDARD_HUMANOID_ANATOMY;

    for (const id of ["arm-1", "hand-1", "arm-2", "hand-2"]) {
      anatomy = setBodyPartState(anatomy, id, "archived-removed");
    }

    const resolved = strengthOf(
      anatomy,
      STANDARD_HUMANOID_REFERENCE_FORM,
      "resolved",
    );

    expect(resolved.referenceFormAnatomicalCapacity).toBeCloseTo(100, 10);
    expect(resolved.referenceFormIntrinsicSP).toBeCloseTo(100, 10);
    expect(resolved.normalizedBodySP).toBeCloseTo(100, 10);
    expect(resolved.displayedStrength).toBe(10);

    // The loss is here, and only here.
    expect(resolved.presentIntrinsicSP).toBeCloseTo(64, 10);
  });

  it("computes the denominator before Scale, Muscularity and force modifiers", () => {
    expect(
      resolveReferenceFormAnatomicalCapacity(
        STANDARD_HUMANOID_REFERENCE_FORM,
        DEFINITIONS,
      ),
    ).toBeCloseTo(100, 10);

    // Unmoved by a Giant's Scale or a bodybuilder's Muscularity.
    expect(
      humanStrength("resolved", 10, 3).referenceFormAnatomicalCapacity,
    ).toBeCloseTo(100, 10);
  });
});


describe("base and resolved modes", () => {
  const AMPUTATED: Anatomy = ["arm-1", "hand-1", "arm-2", "hand-2"].reduce(
    (anatomy, id) => setBodyPartState(anatomy, id, "archived-removed"),
    STANDARD_HUMANOID_ANATOMY,
  );

  /*
   * The decision that prices advancement. Permanent physical development must
   * never become cheaper or dearer because a character is currently injured,
   * so base mode ignores instance state entirely and evaluates the Base
   * Reference Form as intact.
   */
  it("reports the same STR in both modes, whatever has happened", () => {
    for (const mode of ["base", "resolved"] as const) {
      expect(
        strengthOf(AMPUTATED, STANDARD_HUMANOID_REFERENCE_FORM, mode)
          .normalizedBodySP,
      ).toBeCloseTo(100, 10);
    }
  });

  /*
   * Base mode ignores instance state by definition, so its present SP is the
   * form's. That is what keeps permanent advancement from being priced against
   * transient misfortune.
   */
  it("separates present SP by mode", () => {
    expect(
      strengthOf(AMPUTATED, STANDARD_HUMANOID_REFERENCE_FORM, "base")
        .presentIntrinsicSP,
    ).toBeCloseTo(100, 10);

    expect(
      strengthOf(AMPUTATED, STANDARD_HUMANOID_REFERENCE_FORM, "resolved")
        .presentIntrinsicSP,
    ).toBeCloseTo(64, 10);
  });

  /*
   * Suppression is removal for the purposes of what is physically there, and
   * is nothing at all for the purposes of STR. A character whose Arms are
   * temporarily sealed away is not a lower Strength tier while it lasts.
   */
  it("treats suppression as removal for present SP and not for STR", () => {
    const suppressed = ["arm-1", "hand-1", "arm-2", "hand-2"].reduce(
      (anatomy, id) => setBodyPartState(anatomy, id, "suppressed"),
      STANDARD_HUMANOID_ANATOMY,
    );

    const resolved = strengthOf(
      suppressed,
      STANDARD_HUMANOID_REFERENCE_FORM,
      "resolved",
    );

    expect(resolved.normalizedBodySP).toBeCloseTo(100, 10);
    expect(resolved.displayedStrength).toBe(10);
    expect(resolved.presentIntrinsicSP).toBeCloseTo(64, 10);
  });

  /*
   * Ordinary damage lowers how much force is currently USABLE, which is a
   * different quantity. It does not lower a part's intrinsic capability, so it
   * does not appear in either mode's numerator.
   */
  it("is unmoved by stored damage in either mode", () => {
    const hurt: Anatomy = {
      parts: STANDARD_HUMANOID_ANATOMY.parts.map((part) =>
        part.id === "arm-1" ? { ...part, damage: 13 } : part,
      ),
    };

    for (const mode of ["base", "resolved"] as const) {
      expect(
        strengthOf(hurt, STANDARD_HUMANOID_REFERENCE_FORM, mode)
          .normalizedBodySP,
      ).toBeCloseTo(100, 10);
    }
  });

  it("reports which mode produced a result", () => {
    expect(humanStrength("base").mode).toBe("base");
    expect(humanStrength("resolved").mode).toBe("resolved");
  });
});


describe("inert anatomy", () => {
  const CREST: BodyPartDefinition = {
    ...BODY_PART_DEFINITIONS.head,
    id: "crest",
    name: "Crest",
    description: "A decorative bony crest that produces no force of its own.",
    reference: {
      ...BODY_PART_DEFINITIONS.head.reference,
      structuralCapacity: 20,
      intrinsicPhysicalForce: 0,
    },
  };

  const SPECS: readonly BodyPartCreationSpec[] = [
    ...STANDARD_HUMANOID_BODY_PART_SPECS,
    { id: "crest-1", type: "crest", attachment: { parentId: "head-1" } },
  ];

  /*
   * No `forceContributing` flag exists anywhere. Inert anatomy sets
   * intrinsicPhysicalForce to 0 and contributes zero to the numerator by
   * arithmetic, while still carrying its full Structural Capacity into the
   * denominator. A form loaded with inert structure therefore reads as WEAKER,
   * which is the intended consequence rather than a side effect to correct.
   */
  it("carries capacity into the denominator while contributing no Strength", () => {
    const resolved = strengthOf(
      createAnatomy(SPECS),
      createReferenceForm(SPECS),
      "resolved",
      1,
      1,
      [...DEFINITIONS, CREST],
    );

    expect(resolved.referenceFormAnatomicalCapacity).toBeCloseTo(120, 10);
    expect(resolved.referenceFormIntrinsicSP).toBeCloseTo(100, 10);
    expect(resolved.normalizedBodySP).toBeCloseTo(83.3333333333, 8);
    expect(resolved.displayedStrength).toBe(9);
  });

  it("gives the crest itself exactly zero Strength Points", () => {
    const resolved = strengthOf(
      createAnatomy(SPECS),
      createReferenceForm(SPECS),
      "resolved",
      1,
      1,
      [...DEFINITIONS, CREST],
    );

    expect(resolved.formByPartId["crest-1"]?.structuralCapacity).toBeCloseTo(20, 10);
    expect(resolved.formByPartId["crest-1"]?.intrinsicMaxSP).toBe(0);
  });
});


describe("the zero-Strength rule", () => {
  const INERT: BodyPartDefinition = {
    ...BODY_PART_DEFINITIONS["upper-body"],
    id: "inert",
    name: "Inert Mass",
    description: "Physical structure that produces no force whatsoever.",
    reference: {
      ...BODY_PART_DEFINITIONS["upper-body"].reference,
      intrinsicPhysicalForce: 0,
    },
  };

  const SPECS: readonly BodyPartCreationSpec[] = [
    { id: "inert-1", type: "inert", attachment: null },
  ];

  /*
   * Strength Position is null because log2(0) has no value. Displayed Strength
   * is 0 and NOT null: derived/resolution.ts sums ["str","agi","dex","per",
   * "wis"] directly and a null would poison the sum, while
   * deriveStandardModifier is deliberately unclamped so 0 -> -5 is safe.
   */
  it("gives a force-less body a null position and a numeric Strength of 0", () => {
    const resolved = strengthOf(
      createAnatomy(SPECS),
      createReferenceForm(SPECS),
      "resolved",
      1,
      1,
      [...DEFINITIONS, INERT],
    );

    expect(resolved.referenceFormIntrinsicSP).toBe(0);
    expect(resolved.normalizedBodySP).toBe(0);
    expect(resolved.strengthPosition).toBeNull();
    expect(resolved.displayedStrength).toBe(0);
    expect(resolved.displayedStrength).not.toBeNull();
  });

  it("gives a body with no anatomy left a Strength of 0 rather than NaN", () => {
    const resolved = strengthOf(
      { parts: [] },
      { id: "default", parts: [] },
      "resolved",
    );

    expect(resolved.normalizedBodySP).toBe(0);
    expect(resolved.strengthPosition).toBeNull();
    expect(resolved.displayedStrength).toBe(0);
  });

  it("normalizes against a zero-capacity form as 0 rather than NaN", () => {
    expect(resolveNormalizedBodySP(0, 0)).toBe(0);
    expect(resolveNormalizedBodySP(50, 0)).toBe(0);
  });
});


describe("Strength representation and the cap", () => {
  it("puts each displayed Strength on a doubling of normalized SP", () => {
    const tiers: readonly [number, number][] = [
      [100, 10],
      [200, 11],
      [400, 12],
      [800, 13],
      [6_400, 16],
      [12_800, 17],
    ];

    for (const [normalized, expected] of tiers) {
      expect(
        resolveDisplayedStrength(resolveStrengthPosition(normalized)),
      ).toBe(expected);
    }
  });

  it("floors within a tier rather than rounding", () => {
    expect(resolveDisplayedStrength(resolveStrengthPosition(199))).toBe(10);
    expect(resolveDisplayedStrength(resolveStrengthPosition(200))).toBe(11);
    expect(resolveDisplayedStrength(resolveStrengthPosition(399))).toBe(11);
  });

  /*
   * The cap is a Stat-surface convention, not a physical fact. Position stays
   * honest above it, which is what lets advancement refuse correctly at the
   * cap instead of succeeding against a number clamped before anyone looked.
   */
  it("clamps display to 1..30 while leaving position unclamped", () => {
    // 100 x 2^20 is the least normalized SP that reaches position 30.
    const enormous = resolveStrengthPosition(1e12)!;

    expect(enormous).toBeGreaterThan(MAX_DISPLAYED_STRENGTH);
    expect(resolveDisplayedStrength(enormous)).toBe(30);

    const tiny = resolveStrengthPosition(0.000001)!;

    expect(tiny).toBeLessThan(1);
    expect(resolveDisplayedStrength(tiny)).toBe(1);
  });

  it("reserves 0 for the force-less body and never for an ordinary weak one", () => {
    expect(resolveDisplayedStrength(resolveStrengthPosition(0.0001))).toBe(1);
    expect(resolveDisplayedStrength(null)).toBe(0);
  });
});


describe("Strength advancement", () => {
  function advanceHuman(muscularity = 1) {
    return advanceStrength({
      anatomy: STANDARD_HUMANOID_ANATOMY,
      referenceForm: STANDARD_HUMANOID_REFERENCE_FORM,
      definitions: DEFINITIONS,
      morphology: morphologyInput(muscularity),
      effectiveScale: 1,
    });
  }

  /*
   * The Human calibration for a first advancement. Muscularity 1.0 -> ~1.5747
   * carries normalized SP 100 -> 200 and displayed Strength 10 -> 11, while
   * total Structural Capacity rises only 100 -> ~143.85. Force doubles; the
   * structure that carries it grows by 44%. That asymmetry is the whole point
   * of the separate force factor, and it is what keeps a STR 14 Human from
   * weighing several tonnes.
   *
   * The old M ~= 2.3106 calibration, from before the force factor existed, is
   * obsolete.
   */
  it("solves the Human's first advancement to Muscularity ~1.5747", () => {
    const result = advanceHuman();

    expect(result.success).toBe(true);

    if (!result.success) return;

    expect(result.payload.strengthDevelopmentMuscularity).toBeCloseTo(1.5747, 4);
    expect(result.payload.previousNormalizedBodySP).toBeCloseTo(100, 10);
    expect(result.payload.normalizedBodySP).toBeCloseTo(200, 6);
    expect(result.payload.previousDisplayedStrength).toBe(10);
    expect(result.payload.displayedStrength).toBe(11);
  });

  it("raises total Structural Capacity to ~143.85 at that Muscularity", () => {
    const result = advanceHuman();

    if (!result.success) throw new Error("expected a successful advancement");

    const advanced = humanStrength(
      "base",
      1,
      result.payload.strengthDevelopmentMuscularity,
    );

    const totalSC = advanced.formParts.reduce(
      (total, part) => total + part.structuralCapacity,
      0,
    );

    expect(totalSC).toBeCloseTo(143.85, 2);
  });

  /*
   * The target is the current base SP doubled, never the next tier's minimum.
   * A character at 190 buys their way to 380, not to 200 — snapping would make
   * the same purchase worth wildly different amounts depending on where in a
   * tier someone happened to sit.
   */
  it("doubles the current SP rather than snapping to the next tier", () => {
    const offThreshold = advanceHuman(1.3);

    if (!offThreshold.success) throw new Error("expected success");

    const { previousNormalizedBodySP, normalizedBodySP } = offThreshold.payload;

    expect(previousNormalizedBodySP).toBeGreaterThan(100);
    expect(previousNormalizedBodySP).toBeLessThan(200);
    expect(normalizedBodySP).toBeCloseTo(previousNormalizedBodySP * 2, 6);

    // Doubling an off-threshold body lands off-threshold too.
    expect(normalizedBodySP).not.toBeCloseTo(200, 1);
  });

  it("compounds: two advancements quadruple the starting Strength", () => {
    const first = advanceHuman();

    if (!first.success) throw new Error("expected success");

    const second = advanceHuman(
      first.payload.strengthDevelopmentMuscularity,
    );

    if (!second.success) throw new Error("expected success");

    expect(second.payload.normalizedBodySP).toBeCloseTo(400, 4);
    expect(second.payload.displayedStrength).toBe(12);
  });

  /*
   * Prices against the intact Base Reference Form. A character whose resolved
   * body reads 64 still advances from 100 to 200, because losing an arm must
   * not make the next point of Strength cheaper.
   */
  it("prices advancement against the base body, not the damaged one", () => {
    const amputated = ["arm-1", "hand-1", "arm-2", "hand-2"].reduce(
      (anatomy, id) => setBodyPartState(anatomy, id, "archived-removed"),
      STANDARD_HUMANOID_ANATOMY,
    );

    const result = advanceStrength({
      anatomy: amputated,
      referenceForm: STANDARD_HUMANOID_REFERENCE_FORM,
      definitions: DEFINITIONS,
      morphology: morphologyInput(1),
      effectiveScale: 1,
    });

    if (!result.success) throw new Error("expected success");

    expect(result.payload.previousNormalizedBodySP).toBeCloseTo(100, 10);
    expect(result.payload.normalizedBodySP).toBeCloseTo(200, 6);

    // Identical to the intact character's advancement, to the last digit.
    const intact = advanceHuman();

    if (!intact.success) throw new Error("expected success");

    expect(result.payload.strengthDevelopmentMuscularity).toBe(
      intact.payload.strengthDevelopmentMuscularity,
    );
  });

  it("only ever searches upward from the current development", () => {
    const result = advanceHuman(2);

    if (!result.success) throw new Error("expected success");

    expect(
      result.payload.strengthDevelopmentMuscularity,
    ).toBeGreaterThan(2);
  });
});


describe("advancement refusals", () => {
  /*
   * A character at base 29 may buy one more advancement, carrying their
   * position past 30 and displaying 30. Beyond that ordinary advancement is
   * refused — and refused as an explicit EngineResult failure rather than by
   * silently succeeding and doing nothing.
   */
  it("refuses once base displayed Strength has reached the cap", () => {
    // Scale alone carries this fixture far past the ordinary cap.
    const result = advanceStrength({
      anatomy: STANDARD_HUMANOID_ANATOMY,
      referenceForm: STANDARD_HUMANOID_REFERENCE_FORM,
      definitions: DEFINITIONS,
      morphology: morphologyInput(1),
      effectiveScale: 2 ** 11,
    });

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors[0]?.code).toBe("body.strength.advancement.at_cap");
  });

  it("still allows the purchase that carries a character to the cap", () => {
    const belowCap = humanStrength("base", 2 ** 9);

    expect(belowCap.displayedStrength).toBeLessThan(MAX_DISPLAYED_STRENGTH);

    const result = advanceStrength({
      anatomy: STANDARD_HUMANOID_ANATOMY,
      referenceForm: STANDARD_HUMANOID_REFERENCE_FORM,
      definitions: DEFINITIONS,
      morphology: morphologyInput(1),
      effectiveScale: 2 ** 9,
    });

    expect(result.success).toBe(true);
  });

  /*
   * A form made entirely of inert structure produces no force, and doubling
   * zero stays zero. It must refuse explicitly rather than let the solver
   * exhaust its expansion ceiling and report a numerical failure for what is
   * really a fact about the anatomy.
   */
  it("refuses a Reference Form that produces no force at all", () => {
    const INERT: BodyPartDefinition = {
      ...BODY_PART_DEFINITIONS["upper-body"],
      id: "inert",
      reference: {
        ...BODY_PART_DEFINITIONS["upper-body"].reference,
        intrinsicPhysicalForce: 0,
      },
    };

    const specs: readonly BodyPartCreationSpec[] = [
      { id: "inert-1", type: "inert", attachment: null },
    ];

    const result = advanceStrength({
      anatomy: createAnatomy(specs),
      referenceForm: createReferenceForm(specs),
      definitions: [...DEFINITIONS, INERT],
      morphology: morphologyInput(1),
      effectiveScale: 1,
    });

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors[0]?.code).toBe(
      "body.strength.advancement.reference_form_produces_no_force",
    );
  });

  /*
   * Distinct from the above: this form DOES produce force, it just cannot be
   * developed. No amount of Muscularity changes anything, so the doubling
   * target is unreachable by construction.
   */
  it("refuses a Reference Form insensitive to Strength development", () => {
    const STONE: BodyPartDefinition = {
      ...BODY_PART_DEFINITIONS["upper-body"],
      id: "stone",
      sensitivity: {
        ...BODY_PART_DEFINITIONS["upper-body"].sensitivity,
        muscularityStructural: 0,
        muscularityForce: 0,
      },
    };

    const specs: readonly BodyPartCreationSpec[] = [
      { id: "stone-1", type: "stone", attachment: null },
    ];

    const result = advanceStrength({
      anatomy: createAnatomy(specs),
      referenceForm: createReferenceForm(specs),
      definitions: [...DEFINITIONS, STONE],
      morphology: morphologyInput(1),
      effectiveScale: 1,
    });

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors[0]?.code).toBe(
      "body.strength.advancement.reference_form_insensitive_to_strength",
    );
  });

  it("carries a trace on the failure branch as well as the success one", () => {
    const failed = advanceStrength({
      anatomy: STANDARD_HUMANOID_ANATOMY,
      referenceForm: STANDARD_HUMANOID_REFERENCE_FORM,
      definitions: DEFINITIONS,
      morphology: morphologyInput(1),
      effectiveScale: 2 ** 11,
    });

    expect(failed.trace.root.id).toBe("body.strength.advancement");
  });
});


describe("the solver", () => {
  it("returns the lower bound when it already meets the target", () => {
    expect(solveMonotonicTarget((x) => x, 10, 5)).toEqual({
      solved: true,
      value: 10,
    });
  });

  it("solves a simple monotonic function to tolerance", () => {
    const outcome = solveMonotonicTarget((x) => x * x, 0, 2);

    expect(outcome.solved).toBe(true);

    if (!outcome.solved) return;

    expect(outcome.value).toBeCloseTo(Math.SQRT2, 8);
  });

  /*
   * Bounded whatever it is handed. A flat function can never reach a target
   * above its value, and the expansion ceiling turns that into a refusal
   * rather than an infinite loop.
   */
  it("refuses rather than looping when the target cannot be bracketed", () => {
    expect(solveMonotonicTarget(() => 1, 0, 2)).toEqual({
      solved: false,
      reason: "target-not-bracketed",
    });
  });

  it("refuses on a non-finite evaluation", () => {
    expect(solveMonotonicTarget(() => Number.NaN, 0, 2)).toEqual({
      solved: false,
      reason: "non-finite-evaluation",
    });
  });

  it("expands additively, so a near-zero lower bound does not crawl", () => {
    const outcome = solveMonotonicTarget((x) => x, 1e-12, 1000);

    expect(outcome.solved).toBe(true);

    if (!outcome.solved) return;

    expect(outcome.value).toBeCloseTo(1000, 5);
  });

  /*
   * Never from below. Displayed Strength floors a logarithm, so a solve that
   * lands a hair under the target is a character who paid for a point of
   * Strength and is still shown the old number.
   */
  it("converges from above, so the target is always actually reached", () => {
    for (const target of [2, 7, 1234.5]) {
      const outcome = solveMonotonicTarget((x) => x * x, 0, target);

      if (!outcome.solved) throw new Error("expected a solution");

      expect(outcome.value * outcome.value).toBeGreaterThanOrEqual(target);
    }
  });

  it("is deterministic", () => {
    const first = solveMonotonicTarget((x) => 2 ** x, 1, 100);
    const second = solveMonotonicTarget((x) => 2 ** x, 1, 100);

    expect(first).toEqual(second);
  });
});


describe("monotonicity preconditions", () => {
  const neutralByPart = resolveMorphology(
    morphologyInput(1),
    morphologyTargetsForReferenceForm(STANDARD_HUMANOID_REFERENCE_FORM),
  );

  it("accepts the standard humanoid", () => {
    expect(
      findStrengthMonotonicityIssues(
        STANDARD_HUMANOID_REFERENCE_FORM,
        DEFINITIONS,
        neutralByPart,
      ),
    ).toEqual([]);

    expect(
      findStrengthAdvancementCapabilityIssues(
        STANDARD_HUMANOID_REFERENCE_FORM,
        DEFINITIONS,
      ),
    ).toEqual([]);
  });

  it("rejects a non-positive Muscularity", () => {
    const issues = findStrengthMonotonicityIssues(
      STANDARD_HUMANOID_REFERENCE_FORM,
      DEFINITIONS,
      {
        ...neutralByPart,
        "arm-1": { ...NEUTRAL_MORPHOLOGY, muscularity: 0 },
      },
    );

    expect(issues.map((i) => i.code)).toContain("non-positive-muscularity");
  });

  /*
   * Above 1, `1 + ((M - 1) x s)` crosses zero at legal low Muscularity — at
   * s = 1.5, M = 0.3 gives -0.05 — and the part gets negative Structural
   * Capacity, Body Points and Strength Points.
   */
  it("rejects a structural sensitivity above 1", () => {
    const broken: BodyPartDefinition = {
      ...BODY_PART_DEFINITIONS.arm,
      sensitivity: {
        ...BODY_PART_DEFINITIONS.arm.sensitivity,
        muscularityStructural: 1.5,
      },
    };

    const issues = findStrengthMonotonicityIssues(
      STANDARD_HUMANOID_REFERENCE_FORM,
      [...DEFINITIONS.filter((d) => d.id !== "arm"), broken],
      neutralByPart,
    );

    expect(issues.map((i) => i.code)).toContain(
      "muscularity-structural-sensitivity-out-of-range",
    );
  });

  /*
   * A negative force sensitivity makes Strength FALL as Muscularity rises. A
   * bisection over that does not fail — it converges on a confident wrong
   * answer, which is why the guarantee is established before the search rather
   * than detected during it.
   */
  it("rejects a negative force sensitivity", () => {
    const broken: BodyPartDefinition = {
      ...BODY_PART_DEFINITIONS.leg,
      sensitivity: {
        ...BODY_PART_DEFINITIONS.leg.sensitivity,
        muscularityForce: -0.5,
      },
    };

    const issues = findStrengthMonotonicityIssues(
      STANDARD_HUMANOID_REFERENCE_FORM,
      [...DEFINITIONS.filter((d) => d.id !== "leg"), broken],
      neutralByPart,
    );

    expect(issues.map((i) => i.code)).toContain("negative-force-sensitivity");
  });

  it("rejects a negative intrinsic physical force while allowing zero", () => {
    const negative: BodyPartDefinition = {
      ...BODY_PART_DEFINITIONS.head,
      reference: {
        ...BODY_PART_DEFINITIONS.head.reference,
        intrinsicPhysicalForce: -1,
      },
    };

    expect(
      findStrengthMonotonicityIssues(
        STANDARD_HUMANOID_REFERENCE_FORM,
        [...DEFINITIONS.filter((d) => d.id !== "head"), negative],
        neutralByPart,
      ).map((i) => i.code),
    ).toContain("negative-intrinsic-physical-force");

    const inert: BodyPartDefinition = {
      ...BODY_PART_DEFINITIONS.head,
      reference: {
        ...BODY_PART_DEFINITIONS.head.reference,
        intrinsicPhysicalForce: 0,
      },
    };

    expect(
      findStrengthMonotonicityIssues(
        STANDARD_HUMANOID_REFERENCE_FORM,
        [...DEFINITIONS.filter((d) => d.id !== "head"), inert],
        neutralByPart,
      ),
    ).toEqual([]);
  });
});


/*
 * The STR column of the documented Human age table, closed.
 *
 * Nothing in this column is authored anywhere. It falls out of Scale squared
 * and the muscularity curve, which is the whole reason the age profile does
 * not carry a Strength field: a six-year-old is weaker than an adult because
 * they are physically smaller and less developed, not because a rule says
 * children have low Strength.
 */
describe("the Human age curve's Strength", () => {
  it.each([
    [0, 3.79, 5],
    [2, 13.37, 7],
    [6, 28.21, 8],
    [12, 56.62, 9],
    [16, 84.75, 9],
    [20, 100, 10],
    [40, 100, 10],
    [60, 85.97, 9],
    [80, 67.25, 9],
  ])(
    "resolves a %i-year-old Human to %f normalized SP and STR %i",
    (age, expectedSP, expectedStrength) => {
      const resolved = resolveAge(HUMAN_AGE_PROFILE, age);

      const partIds = morphologyTargetsForAnatomy(STANDARD_HUMANOID_ANATOMY);

      const strength = resolveBodyStrength(
        {
          anatomy: STANDARD_HUMANOID_ANATOMY,
          referenceForm: STANDARD_HUMANOID_REFERENCE_FORM,
          definitions: DEFINITIONS,
          base: {
            morphologyByPartId: resolveMorphology(
              {
                species: NEUTRAL_SOURCE,
                age: {
                  global: resolved.globalMorphology,
                  local: resolved.localMorphology,
                },
                character: NEUTRAL_SOURCE,
                strengthDevelopmentMuscularity: 1,
                effectLayers: [],
              },
              partIds,
            ),
            effectiveScale: resolved.scale,
          },
        },
        { mode: "resolved" },
      );

      expect(strength.normalizedBodySP).toBeCloseTo(expectedSP, 2);
      expect(strength.displayedStrength).toBe(expectedStrength);
    },
  );

  it("puts the mature Human at exactly the reference Strength", () => {
    expect(
      resolveAge(HUMAN_AGE_PROFILE, 20).globalMorphology,
    ).toEqual(NEUTRAL_MORPHOLOGY);

    expect(humanStrength("resolved").displayedStrength).toBe(10);
  });
});
