/*
 * External Surface Area, resolved.
 *
 * Two claims carry this file, and they are the ones that make Surface Area
 * worth having as a measurement rather than as a number computed back out of
 * Volume:
 *
 *   1. It scales as Scale SQUARED while Volume takes the cube. That divergence
 *      is the whole physical reason a Giant is hard to cover in Aura, and a
 *      formula that got the exponent wrong would still look plausible on a
 *      human-sized body.
 *
 *   2. It is AUTHORED per definition. A thin membrane can carry a great deal
 *      of area against almost no volume, which no volume-derived formula can
 *      express without being told the thinness separately.
 */

import { describe, expect, it } from "vitest";

import { BODY_PART_DEFINITIONS } from "../character/foundation/body/anatomy/body-parts";
import { createAnatomy } from "../character/foundation/body/anatomy/creation";
import { setBodyPartState } from "../character/foundation/body/anatomy/modification";
import {
  STANDARD_HUMANOID_ANATOMY,
  STANDARD_HUMANOID_BODY_PART_SPECS,
} from "../character/foundation/body/anatomy/standard-humanoid";
import {
  resolveBodyMeasurements,
  resolveCrossSectionFactor,
  resolvePartMeasurements,
} from "../character/foundation/body/measurements/resolution";
import { validateMeasurementInputs } from "../character/foundation/body/measurements/validation";
import {
  morphologyTargetsForAnatomy,
  resolveMorphology,
} from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import type { BodyMorphology } from "../character/foundation/body/types";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "../character/foundation/body/anatomy/types";
import type { BodyPartCreationSpec } from "../character/foundation/body/anatomy/creation";

const DEFINITIONS = Object.values(
  BODY_PART_DEFINITIONS,
) as readonly BodyPartDefinition[];

const NEUTRAL_SOURCE = { global: NEUTRAL_MORPHOLOGY, local: {} };

function neutralMorphology(
  anatomy: Anatomy,
): Readonly<Record<BodyPartId, BodyMorphology>> {
  return resolveMorphology(
    {
      species: NEUTRAL_SOURCE,
      age: NEUTRAL_SOURCE,
      character: NEUTRAL_SOURCE,
      individual: {},
      strengthDevelopmentMuscularity: 1,
      effectLayers: [],
    },
    morphologyTargetsForAnatomy(anatomy),
  );
}

function measure(
  anatomy: Anatomy,
  effectiveScale = 1,
  morphology = neutralMorphology(anatomy),
) {
  return resolveBodyMeasurements(anatomy, DEFINITIONS, morphology, effectiveScale);
}

const ARM = BODY_PART_DEFINITIONS.arm;

function arm(morphology: Partial<BodyMorphology> = {}, effectiveScale = 1) {
  return resolvePartMeasurements(
    "arm-1" as BodyPartId,
    ARM.reference,
    ARM.sensitivity,
    { ...NEUTRAL_MORPHOLOGY, ...morphology },
    effectiveScale,
  );
}


describe("the Basic Human Standard, resolved", () => {
  const resolved = measure(STANDARD_HUMANOID_ANATOMY);

  it("resolves to 16,900 cm2 of external Surface Area", () => {
    expect(resolved.totalSurfaceAreaCm2).toBeCloseTo(16_900, 10);
  });

  it("is 1.69 m2 once converted", () => {
    expect(resolved.totalSurfaceAreaCm2 / 10_000).toBeCloseTo(1.69, 10);
  });

  it("holds a surface-area-to-volume ratio of 28.17 per metre", () => {
    const surfaceAreaM2 = resolved.totalSurfaceAreaCm2 / 10_000;
    const volumeM3 = resolved.totalVolumeL / 1000;

    expect(surfaceAreaM2 / volumeM3).toBeCloseTo(28.17, 2);
  });

  it("totals exactly the sum of its parts", () => {
    expect(
      resolved.parts.reduce((total, part) => total + part.surfaceAreaCm2, 0),
    ).toBeCloseTo(resolved.totalSurfaceAreaCm2, 10);
  });
});


describe("Scale", () => {
  /*
   * The exponent split. At Scale 10 a body is 10x as long, 100x the area and
   * 1000x the volume — which is why a Giant that is a thousand times the
   * creature by volume has only a hundred times the skin to spread Aura over.
   */
  it("takes Surface Area as the square where Volume takes the cube", () => {
    const single = measure(STANDARD_HUMANOID_ANATOMY, 1);
    const doubled = measure(STANDARD_HUMANOID_ANATOMY, 2);

    expect(doubled.totalSurfaceAreaCm2 / single.totalSurfaceAreaCm2)
      .toBeCloseTo(4, 10);
    expect(doubled.totalVolumeL / single.totalVolumeL).toBeCloseTo(8, 10);
  });

  it("gives a Scale-10 body 100x the area and 1000x the volume", () => {
    const giant = measure(STANDARD_HUMANOID_ANATOMY, 10);

    expect(giant.totalSurfaceAreaCm2).toBeCloseTo(1_690_000, 6);
    expect(giant.totalVolumeL).toBeCloseTo(60_000, 6);
  });

  it("drops the surface-area-to-volume ratio as Scale rises", () => {
    const human = measure(STANDARD_HUMANOID_ANATOMY, 1);
    const giant = measure(STANDARD_HUMANOID_ANATOMY, 10);

    const ratio = (m: typeof human) =>
      (m.totalSurfaceAreaCm2 / 10_000) / (m.totalVolumeL / 1000);

    expect(ratio(human) / ratio(giant)).toBeCloseTo(10, 10);
  });
});


describe("morphology", () => {
  const neutral = arm();

  it("moves Length and Surface Area together, linearly", () => {
    const longer = arm({ length: 1.5 });

    expect(longer.lengthCm / neutral.lengthCm).toBeCloseTo(1.5, 10);
    expect(longer.surfaceAreaCm2 / neutral.surfaceAreaCm2).toBeCloseTo(1.5, 10);
  });

  /*
   * Bulk is breadth. It reaches Volume as a cross-sectional AREA factor and
   * Surface Area as that factor's square root, because the skin around a limb
   * grows with the cross-section's perimeter rather than with its area.
   */
  it("takes the square root of Bulk into Surface Area", () => {
    const broad = arm({ bulk: 2 });

    // An Arm's bulkVolume sensitivity is 1.00, so effectiveBulk is 2.
    expect(broad.effectiveBulk).toBeCloseTo(2, 10);
    expect(broad.volumeL / neutral.volumeL).toBeCloseTo(2, 10);
    expect(broad.surfaceAreaCm2 / neutral.surfaceAreaCm2)
      .toBeCloseTo(Math.SQRT2, 10);
  });

  it("keeps Length and Bulk independent", () => {
    const longer = arm({ length: 1.5 });
    const broad = arm({ bulk: 2 });
    const both = arm({ length: 1.5, bulk: 2 });

    expect(longer.effectiveBulk).toBeCloseTo(1, 10);
    expect(broad.lengthCm).toBeCloseTo(neutral.lengthCm, 10);

    expect(both.surfaceAreaCm2).toBeCloseTo(
      neutral.surfaceAreaCm2 * 1.5 * Math.SQRT2,
      10,
    );
    expect(both.volumeL).toBeCloseTo(neutral.volumeL * 1.5 * 2, 10);
  });

  it("reaches Volume, Surface Area and Mass through Adiposity", () => {
    const fat = arm({ adiposity: 5 });

    expect(fat.volumeL).toBeGreaterThan(neutral.volumeL);
    expect(fat.surfaceAreaCm2).toBeGreaterThan(neutral.surfaceAreaCm2);
    expect(fat.massKg).toBeGreaterThan(neutral.massKg);

    // Adiposity adds volume as an area factor, so area gains its square root.
    expect(fat.volumeL / neutral.volumeL)
      .toBeCloseTo(fat.adiposityVolumeFactor, 10);
    expect(fat.surfaceAreaCm2 / neutral.surfaceAreaCm2)
      .toBeCloseTo(Math.sqrt(fat.adiposityVolumeFactor), 10);
  });

  /*
   * Muscularity is denser tissue inside a volume that already exists. It
   * cannot reach either geometric measurement, only Mass.
   */
  it("lets Muscularity reach Mass but neither Volume nor Surface Area", () => {
    const muscular = arm({ muscularity: 5 });

    expect(muscular.massKg).toBeGreaterThan(neutral.massKg);
    expect(muscular.volumeL).toBeCloseTo(neutral.volumeL, 10);
    expect(muscular.surfaceAreaCm2).toBeCloseTo(neutral.surfaceAreaCm2, 10);
  });

  it("shares one cross-section factor between Volume and Surface Area", () => {
    const shaped = arm({ bulk: 1.4, adiposity: 2 });

    expect(shaped.crossSectionFactor).toBeCloseTo(
      resolveCrossSectionFactor(
        shaped.effectiveBulk,
        shaped.adiposityVolumeFactor,
      ),
      10,
    );
    expect(shaped.surfaceAreaCm2).toBeCloseTo(
      ARM.reference.surfaceAreaCm2 *
        shaped.lengthFactor *
        Math.sqrt(shaped.crossSectionFactor),
      10,
    );
  });
});


describe("thin anatomy", () => {
  /*
   * The case that forces Surface Area to be authored rather than derived.
   *
   * A Wing is mostly membrane: less volume than a Hand and more area than the
   * entire Upper Body. Nothing about the resolver has to know it is thin — the
   * definition already said so, in the only two numbers that could say it.
   */
  const WING: BodyPartDefinition = {
    id: "wing",
    name: "Wing",
    description: "A membranous flight surface.",
    tags: ["limb"],
    reference: {
      lengthCm: 120,
      volumeL: 0.9,
      surfaceAreaCm2: 7200,
      massKg: 0.95,
      structuralCapacity: 6,
      intrinsicPhysicalForce: 1,
      heightContribution: 0,
      heightAxisSign: 1,
    },
    sensitivity: {
      bulkVolume: 0.3,
      adiposityVolume: 0.02,
      muscularityMass: 0.4,
      muscularityStructural: 0.5,
      muscularityForce: 0.5,
    },
  };

  const wing = resolvePartMeasurements(
    "wing-1" as BodyPartId,
    WING.reference,
    WING.sensitivity,
    NEUTRAL_MORPHOLOGY,
    1,
  );

  const hand = resolvePartMeasurements(
    "hand-1" as BodyPartId,
    BODY_PART_DEFINITIONS.hand.reference,
    BODY_PART_DEFINITIONS.hand.sensitivity,
    NEUTRAL_MORPHOLOGY,
    1,
  );

  const upperBody = resolvePartMeasurements(
    "upper-body-1" as BodyPartId,
    BODY_PART_DEFINITIONS["upper-body"].reference,
    BODY_PART_DEFINITIONS["upper-body"].sensitivity,
    NEUTRAL_MORPHOLOGY,
    1,
  );

  it("carries low Volume and high Surface Area at once", () => {
    expect(wing.volumeL).toBeGreaterThan(hand.volumeL);
    expect(wing.volumeL).toBeLessThan(upperBody.volumeL / 20);
    expect(wing.surfaceAreaCm2).toBeGreaterThan(upperBody.surfaceAreaCm2);
  });

  it("has an area-to-volume ratio no volume-derived formula would produce", () => {
    const wingRatio = wing.surfaceAreaCm2 / wing.volumeL;
    const upperBodyRatio = upperBody.surfaceAreaCm2 / upperBody.volumeL;

    expect(wingRatio / upperBodyRatio).toBeGreaterThan(50);
  });

  it("still takes Scale squared into its area", () => {
    const large = resolvePartMeasurements(
      "wing-1" as BodyPartId,
      WING.reference,
      WING.sensitivity,
      NEUTRAL_MORPHOLOGY,
      3,
    );

    expect(large.surfaceAreaCm2 / wing.surfaceAreaCm2).toBeCloseTo(9, 10);
    expect(large.volumeL / wing.volumeL).toBeCloseTo(27, 10);
  });
});


describe("present versus intact anatomy", () => {
  const intact = measure(STANDARD_HUMANOID_ANATOMY);

  /*
   * The three states a part can be in are active, suppressed and
   * archived-removed. Destruction is tracked on continuity rather than as a
   * fourth state; what removes a part from the measured body is leaving it.
   */
  function withState(
    partId: string,
    state: "suppressed" | "archived-removed",
  ): Anatomy {
    return setBodyPartState(STANDARD_HUMANOID_ANATOMY, partId, state);
  }

  const armIds = STANDARD_HUMANOID_ANATOMY.parts
    .filter((part) => part.type === "arm")
    .map((part) => part.id);

  it("drops an amputated part's Surface Area from the present body", () => {
    const measured = measure(withState(armIds[0]!, "archived-removed"));

    expect(measured.totalSurfaceAreaCm2).toBeCloseTo(
      intact.totalSurfaceAreaCm2 - 1183,
      10,
    );
  });

  it("drops a suppressed part's Surface Area as well", () => {
    const measured = measure(withState(armIds[0]!, "suppressed"));

    expect(measured.totalSurfaceAreaCm2).toBeCloseTo(
      intact.totalSurfaceAreaCm2 - 1183,
      10,
    );
  });

  it("treats suppressed and removed anatomy identically for area", () => {
    const suppressed = measure(withState(armIds[0]!, "suppressed"));
    const removed = measure(withState(armIds[0]!, "archived-removed"));

    expect(suppressed.totalSurfaceAreaCm2)
      .toBeCloseTo(removed.totalSurfaceAreaCm2, 10);
  });

  /*
   * Damage is a separate axis. A badly hurt arm is still attached, so it still
   * has skin — which is what keeps Aura coverage from improving when you get
   * injured.
   */
  it("keeps a damaged but attached part's Surface Area", () => {
    const hurt: Anatomy = {
      ...STANDARD_HUMANOID_ANATOMY,
      parts: STANDARD_HUMANOID_ANATOMY.parts.map((part) =>
        part.id === armIds[0] ? { ...part, integrity: 0.1 } : part
      ),
    };

    expect(measure(hurt).totalSurfaceAreaCm2)
      .toBeCloseTo(intact.totalSurfaceAreaCm2, 10);
  });

  it("leaves the part list and the total in agreement after a loss", () => {
    const measured = measure(withState(armIds[0]!, "archived-removed"));

    expect(measured.parts).toHaveLength(11);
    expect(
      measured.parts.reduce((total, part) => total + part.surfaceAreaCm2, 0),
    ).toBeCloseTo(measured.totalSurfaceAreaCm2, 10);
  });
});


describe("validation", () => {
  it("accepts the standard body", () => {
    expect(
      validateMeasurementInputs(STANDARD_HUMANOID_ANATOMY, DEFINITIONS, 1).valid,
    ).toBe(true);
  });

  it("rejects a non-finite Effective Scale before any area is resolved", () => {
    const result = validateMeasurementInputs(
      STANDARD_HUMANOID_ANATOMY,
      DEFINITIONS,
      Number.NaN,
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code))
      .toContain("invalid-effective-scale");
  });

  it("rejects a negative Effective Scale", () => {
    expect(
      validateMeasurementInputs(STANDARD_HUMANOID_ANATOMY, DEFINITIONS, -1).valid,
    ).toBe(false);
  });

  /*
   * Area is authored rather than derived, so an authoring mistake arrives here
   * intact instead of being caught on its way through the volume arithmetic.
   */
  it("reports a negative authored Surface Area", () => {
    const broken: BodyPartDefinition = {
      ...BODY_PART_DEFINITIONS.arm,
      id: "broken-arm",
      reference: { ...BODY_PART_DEFINITIONS.arm.reference, surfaceAreaCm2: -50 },
    };

    const anatomy = createAnatomy([
      { id: "broken-1", type: "broken-arm", attachment: null },
    ] as readonly BodyPartCreationSpec[]);

    const result = validateMeasurementInputs(
      anatomy,
      [...DEFINITIONS, broken],
      1,
      { ["broken-1" as BodyPartId]: NEUTRAL_MORPHOLOGY },
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code))
      .toContain("invalid-resolved-surface-area");
  });

  it("reports a non-finite authored Surface Area", () => {
    const broken: BodyPartDefinition = {
      ...BODY_PART_DEFINITIONS.arm,
      id: "nan-arm",
      reference: {
        ...BODY_PART_DEFINITIONS.arm.reference,
        surfaceAreaCm2: Number.NaN,
      },
    };

    const anatomy = createAnatomy([
      { id: "nan-1", type: "nan-arm", attachment: null },
    ] as readonly BodyPartCreationSpec[]);

    const result = validateMeasurementInputs(
      anatomy,
      [...DEFINITIONS, broken],
      1,
      { ["nan-1" as BodyPartId]: NEUTRAL_MORPHOLOGY },
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code))
      .toContain("invalid-resolved-surface-area");
  });

  it("allows a zero Surface Area, which is a part with no exposed skin", () => {
    const internal: BodyPartDefinition = {
      ...BODY_PART_DEFINITIONS.arm,
      id: "internal-organ",
      reference: {
        ...BODY_PART_DEFINITIONS.arm.reference,
        surfaceAreaCm2: 0,
      },
    };

    const anatomy = createAnatomy([
      { id: "organ-1", type: "internal-organ", attachment: null },
    ] as readonly BodyPartCreationSpec[]);

    const result = validateMeasurementInputs(
      anatomy,
      [...DEFINITIONS, internal],
      1,
      { ["organ-1" as BodyPartId]: NEUTRAL_MORPHOLOGY },
    );

    expect(
      result.issues.map((issue) => issue.code),
    ).not.toContain("invalid-resolved-surface-area");
  });
});


describe("the standard humanoid part list", () => {
  it("authors a Surface Area for every part it uses", () => {
    for (const spec of STANDARD_HUMANOID_BODY_PART_SPECS) {
      const definition = DEFINITIONS.find((entry) => entry.id === spec.type)!;

      expect(Number.isFinite(definition.reference.surfaceAreaCm2)).toBe(true);
      expect(definition.reference.surfaceAreaCm2).toBeGreaterThan(0);
    }
  });
});
