/*
 * Aura placement: where a character's active Aura actually is, and how thickly.
 *
 * The property the whole design turns on is that INTERNAL and SURFACE are
 * denominated in different Body measurements. Internal Aura divides by litres
 * of volume; surface Aura divides by square metres of skin. Those diverge with
 * Scale — volume cubes, area squares — so a model that shared one denominator
 * would give a Giant a human's density, which is exactly what the retired
 * Surface Units constant did.
 *
 * The second property is that a localized allocation targets a CONTINUITY
 * IDENTITY rather than a BodyPart instance. "My right arm" has to survive that
 * arm being regenerated, enlarged, or temporarily a Dragon's foreleg.
 *
 * Working numbers, standard human at Scale 1:
 *
 *   whole body   60.00 L    16,900 cm2  (1.69 m2)
 *   one Arm       2.37 L     1,183 cm2  (0.1183 m2)
 */

import { describe, expect, it } from "vitest";

import { BODY_PART_DEFINITIONS } from "../character/foundation/body/anatomy/body-parts";
import { createAnatomy } from "../character/foundation/body/anatomy/creation";
import { setBodyPartState } from "../character/foundation/body/anatomy/modification";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import { continuityKey } from "../character/foundation/body/anatomy/types";
import { resolveBodyMeasurements } from "../character/foundation/body/measurements/resolution";
import {
  morphologyTargetsForAnatomy,
  resolveMorphology,
} from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import {
  resolveInternalAuraDensity,
  resolveSurfaceAuraDensity,
} from "../character/foundation/aura/density";
import { resolveAuraDistribution } from "../character/foundation/aura/distribution";
import {
  emptyAuraState,
  isLocalizedAllocation,
  isWholeBodyAllocation,
  totalAllocatedAura,
} from "../character/foundation/aura/state";
import type { AuraAllocation } from "../character/foundation/aura/state";
import type {
  ResolvedAuraAllocation,
  ResolvedInternalAuraAllocation,
  ResolvedSurfaceAuraAllocation,
} from "../character/foundation/aura/types";
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

const RIGHT_ARM = continuityKey("upper-limb:right");
const LEFT_ARM = continuityKey("upper-limb:left");

function morphologyFor(
  anatomy: Anatomy,
  overrides: Readonly<Record<string, Partial<BodyMorphology>>> = {},
): Readonly<Record<BodyPartId, BodyMorphology>> {
  return resolveMorphology(
    {
      species: NEUTRAL_SOURCE,
      age: NEUTRAL_SOURCE,
      character: NEUTRAL_SOURCE,
      individual: overrides,
      strengthDevelopmentMuscularity: 1,
      effectLayers: [],
    },
    morphologyTargetsForAnatomy(anatomy),
  );
}

function measure(
  anatomy: Anatomy,
  effectiveScale = 1,
  overrides: Readonly<Record<string, Partial<BodyMorphology>>> = {},
) {
  return resolveBodyMeasurements(
    anatomy,
    DEFINITIONS,
    morphologyFor(anatomy, overrides),
    effectiveScale,
  );
}

function place(
  allocations: readonly AuraAllocation[],
  options: {
    readonly anatomy?: Anatomy;
    readonly effectiveScale?: number;
    readonly availableOutput?: number;
    readonly overrides?: Readonly<Record<string, Partial<BodyMorphology>>>;
  } = {},
) {
  const anatomy = options.anatomy ?? STANDARD_HUMANOID_ANATOMY;

  return resolveAuraDistribution({
    allocations,
    anatomy,
    measurements: measure(
      anatomy,
      options.effectiveScale ?? 1,
      options.overrides ?? {},
    ),
    availableOutput: options.availableOutput ?? 100_000,
  });
}

function internal(
  allocation: ResolvedAuraAllocation,
): ResolvedInternalAuraAllocation {
  if (allocation.placement !== "internal") {
    throw new Error(`Expected an internal allocation, got ${allocation.placement}.`);
  }
  return allocation;
}

function surface(
  allocation: ResolvedAuraAllocation,
): ResolvedSurfaceAuraAllocation {
  if (allocation.placement !== "surface") {
    throw new Error(`Expected a surface allocation, got ${allocation.placement}.`);
  }
  return allocation;
}


describe("internal Aura density", () => {
  it("is Aura per litre of covered volume", () => {
    const result = resolveInternalAuraDensity(600, 60);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload).toEqual({ placement: "internal", auraPerLiter: 10 });
  });

  it("accepts zero Aura over a real body", () => {
    const result = resolveInternalAuraDensity(0, 60);

    expect(result.success).toBe(true);
    if (result.success) expect(result.payload.auraPerLiter).toBe(0);
  });

  it("rejects a zero volume rather than reporting Infinity", () => {
    const result = resolveInternalAuraDensity(600, 0);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]!.code).toBe("aura.density.volume.invalid");
    }
  });

  it("rejects a negative or non-finite volume", () => {
    expect(resolveInternalAuraDensity(600, -1).success).toBe(false);
    expect(resolveInternalAuraDensity(600, Number.NaN).success).toBe(false);
  });

  it("rejects negative or non-finite Aura", () => {
    expect(resolveInternalAuraDensity(-1, 60).success).toBe(false);
    expect(resolveInternalAuraDensity(Number.POSITIVE_INFINITY, 60).success)
      .toBe(false);
  });
});


describe("surface Aura density", () => {
  /*
   * Body is authoritative in square centimetres and Aura wants square metres.
   * The conversion happens exactly once, here, which is the only reason this
   * function takes cm2 rather than the m2 it reports in.
   */
  it("converts square centimetres to square metres once", () => {
    const result = resolveSurfaceAuraDensity(1690, 16_900);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload).toEqual({
      placement: "surface",
      auraPerSquareMeter: 1000,
    });
  });

  it("measures one Arm against its own 0.1183 m2", () => {
    const result = resolveSurfaceAuraDensity(118.3, 1183);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.auraPerSquareMeter).toBeCloseTo(1000, 10);
    }
  });

  it("rejects a zero or negative area", () => {
    expect(resolveSurfaceAuraDensity(1690, 0).success).toBe(false);
    expect(resolveSurfaceAuraDensity(1690, -1).success).toBe(false);
  });

  it("keeps the two placements' units apart", () => {
    const internalResult = resolveInternalAuraDensity(1690, 60);
    const surfaceResult = resolveSurfaceAuraDensity(1690, 16_900);

    expect(internalResult.success && surfaceResult.success).toBe(true);
    if (!internalResult.success || !surfaceResult.success) return;

    expect(internalResult.payload.placement).toBe("internal");
    expect(surfaceResult.payload.placement).toBe("surface");
    expect(internalResult.payload.auraPerLiter)
      .not.toBeCloseTo(surfaceResult.payload.auraPerSquareMeter, 1);
  });
});


describe("whole-body allocation", () => {
  it("distributes internal Aura proportionally to present Volume", () => {
    const { distribution } = place([
      { id: "ryu", coverage: "whole-body", placement: "internal", aura: 600 },
    ]);

    expect(distribution.allocations).toHaveLength(12);
    expect(distribution.activeAura).toBeCloseTo(600, 10);

    const arm = internal(
      distribution.allocations.find((a) => a.partId === "arm-1")!,
    );

    expect(arm.coveredVolumeL).toBeCloseTo(2.37, 10);
    expect(arm.aura).toBeCloseTo(600 * (2.37 / 60), 10);
  });

  it("produces equal internal density across every covered part", () => {
    const { distribution } = place([
      { id: "ryu", coverage: "whole-body", placement: "internal", aura: 600 },
    ]);

    for (const allocation of distribution.allocations) {
      expect(internal(allocation).density.auraPerLiter).toBeCloseTo(10, 10);
    }
  });

  it("distributes surface Aura proportionally to present Surface Area", () => {
    const { distribution } = place([
      { id: "ten", coverage: "whole-body", placement: "surface", aura: 1690 },
    ]);

    const arm = surface(
      distribution.allocations.find((a) => a.partId === "arm-1")!,
    );

    expect(arm.coveredSurfaceAreaCm2).toBeCloseTo(1183, 10);
    expect(arm.aura).toBeCloseTo(1690 * (1183 / 16_900), 10);
  });

  it("produces equal surface density across every covered part", () => {
    const { distribution } = place([
      { id: "ten", coverage: "whole-body", placement: "surface", aura: 1690 },
    ]);

    for (const allocation of distribution.allocations) {
      expect(surface(allocation).density.auraPerSquareMeter)
        .toBeCloseTo(1000, 10);
    }
  });

  /*
   * The two placements weight the body differently, which is the point of
   * having both. A Leg is 18.4% of the body's volume and 16.5% of its skin, so
   * the same Aura lands in different amounts depending on where it sits.
   */
  it("weights the same part differently by placement", () => {
    const byVolume = place([
      { id: "a", coverage: "whole-body", placement: "internal", aura: 1000 },
    ]).distribution;

    const byArea = place([
      { id: "b", coverage: "whole-body", placement: "surface", aura: 1000 },
    ]).distribution;

    const legVolumeShare = byVolume.allocations
      .find((a) => a.partId === "leg-1")!.aura;
    const legAreaShare = byArea.allocations
      .find((a) => a.partId === "leg-1")!.aura;

    expect(legVolumeShare).toBeCloseTo(1000 * (11.05 / 60), 10);
    expect(legAreaShare).toBeCloseTo(1000 * (2788.5 / 16_900), 10);
    expect(legVolumeShare).not.toBeCloseTo(legAreaShare, 1);
  });

  it("skips anatomy that is not present", () => {
    const oneArmed = setBodyPartState(
      STANDARD_HUMANOID_ANATOMY,
      "arm-1",
      "archived-removed",
    );

    const { distribution } = place(
      [{ id: "ten", coverage: "whole-body", placement: "surface", aura: 1690 }],
      { anatomy: oneArmed },
    );

    expect(distribution.allocations).toHaveLength(11);
    expect(distribution.allocations.some((a) => a.partId === "arm-1")).toBe(false);

    // Still all 1690 Aura, now spread over less skin, so density rises.
    expect(distribution.activeAura).toBeCloseTo(1690, 10);
    for (const allocation of distribution.allocations) {
      expect(surface(allocation).density.auraPerSquareMeter)
        .toBeCloseTo(1690 / ((16_900 - 1183) / 10_000), 10);
    }
  });
});


describe("localized allocation", () => {
  it("targets a continuity identity and resolves to the part standing in it", () => {
    const { distribution } = place([
      {
        id: "ko",
        coverage: "localized",
        placement: "internal",
        continuityKey: RIGHT_ARM,
        aura: 237,
      },
    ]);

    expect(distribution.allocations).toHaveLength(1);

    const arm = internal(distribution.allocations[0]!);

    expect(arm.partId).toBe("arm-2");
    expect(arm.continuityKey).toBe(RIGHT_ARM);
    expect(arm.coveredVolumeL).toBeCloseTo(2.37, 10);
    expect(arm.density.auraPerLiter).toBeCloseTo(100, 10);
  });

  it("measures surface placement against that part's own area", () => {
    const { distribution } = place([
      {
        id: "ken-arm",
        coverage: "localized",
        placement: "surface",
        continuityKey: RIGHT_ARM,
        aura: 118.3,
      },
    ]);

    expect(surface(distribution.allocations[0]!).density.auraPerSquareMeter)
      .toBeCloseTo(1000, 10);
  });

  /*
   * A different form, same identity. The allocation was never pointed at
   * `arm-2`; it was pointed at "my right upper limb", and that is what
   * survives a transformation.
   */
  it("follows the identity through a different form", () => {
    const draconic = createAnatomy([
      { id: "torso", type: "upper-body", attachment: null },
      {
        id: "foreleg-r",
        type: "leg",
        continuityKey: RIGHT_ARM,
        attachment: null,
      },
    ] as readonly BodyPartCreationSpec[]);

    const { distribution, dropped } = place(
      [{
        id: "ko",
        coverage: "localized",
        placement: "internal",
        continuityKey: RIGHT_ARM,
        aura: 237,
      }],
      { anatomy: draconic },
    );

    expect(dropped).toEqual([]);
    expect(distribution.allocations).toHaveLength(1);

    const limb = internal(distribution.allocations[0]!);

    // The identity now manifests as a Leg, so the Aura is spread over 11.05 L.
    expect(limb.partId).toBe("foreleg-r");
    expect(limb.aura).toBeCloseTo(237, 10);
    expect(limb.coveredVolumeL).toBeCloseTo(11.05, 10);
    expect(limb.density.auraPerLiter).toBeCloseTo(237 / 11.05, 10);
  });

  /*
   * Enlarging a part keeps the Aura and changes the density. The character
   * committed 237 Aura; growing the limb does not give them more of it.
   */
  it("preserves allocated Aura and changes density when the part grows", () => {
    const enlarged = place(
      [{
        id: "ko",
        coverage: "localized",
        placement: "internal",
        continuityKey: RIGHT_ARM,
        aura: 237,
      }],
      { overrides: { [RIGHT_ARM]: { bulk: 2 } } },
    ).distribution;

    const arm = internal(enlarged.allocations[0]!);

    expect(arm.aura).toBeCloseTo(237, 10);
    expect(arm.coveredVolumeL).toBeCloseTo(4.74, 10);
    expect(arm.density.auraPerLiter).toBeCloseTo(50, 10);
  });

  it("raises density when the part shrinks", () => {
    const shrunk = place(
      [{
        id: "ko",
        coverage: "localized",
        placement: "internal",
        continuityKey: RIGHT_ARM,
        aura: 237,
      }],
      { overrides: { [RIGHT_ARM]: { bulk: 0.5 } } },
    ).distribution;

    expect(internal(shrunk.allocations[0]!).density.auraPerLiter)
      .toBeCloseTo(200, 10);
  });
});


describe("allocations whose target is not there", () => {
  const KO_ON_RIGHT_ARM: AuraAllocation = {
    id: "ko",
    coverage: "localized",
    placement: "internal",
    continuityKey: RIGHT_ARM,
    aura: 500,
  };

  it("drops an allocation on an identity the body does not manifest", () => {
    const { distribution, dropped } = place([{
      ...KO_ON_RIGHT_ARM,
      continuityKey: continuityKey("wing:left"),
    }]);

    expect(distribution.allocations).toEqual([]);
    expect(dropped).toEqual([
      { allocationId: "ko", reason: "identity-not-manifested", aura: 500 },
    ]);
  });

  it("drops an allocation on an amputated part", () => {
    const oneArmed = setBodyPartState(
      STANDARD_HUMANOID_ANATOMY,
      "arm-2",
      "archived-removed",
    );

    const { distribution, dropped } = place([KO_ON_RIGHT_ARM], {
      anatomy: oneArmed,
    });

    expect(distribution.allocations).toEqual([]);
    expect(dropped[0]!.reason).toBe("identity-not-manifested");
  });

  it("drops an allocation on a suppressed part", () => {
    const suppressed = setBodyPartState(
      STANDARD_HUMANOID_ANATOMY,
      "arm-2",
      "suppressed",
    );

    const { dropped } = place([KO_ON_RIGHT_ARM], { anatomy: suppressed });

    expect(dropped).toHaveLength(1);
  });

  /*
   * The Aura is not lost, it is un-placed. Losing a limb stops you reinforcing
   * it; it does not drain the reserve you were reinforcing it from.
   */
  it("returns a dropped allocation's Aura to unallocated Output", () => {
    const { distribution } = place([KO_ON_RIGHT_ARM], {
      anatomy: setBodyPartState(
        STANDARD_HUMANOID_ANATOMY,
        "arm-2",
        "archived-removed",
      ),
      availableOutput: 2000,
    });

    expect(distribution.activeAura).toBe(0);
    expect(distribution.unallocatedOutput).toBe(2000);
  });

  it("leaves other allocations untouched when one is dropped", () => {
    const { distribution, dropped } = place(
      [
        KO_ON_RIGHT_ARM,
        {
          id: "ko-left",
          coverage: "localized",
          placement: "internal",
          continuityKey: LEFT_ARM,
          aura: 237,
        },
      ],
      {
        anatomy: setBodyPartState(
          STANDARD_HUMANOID_ANATOMY,
          "arm-2",
          "archived-removed",
        ),
      },
    );

    expect(dropped).toHaveLength(1);
    expect(distribution.allocations).toHaveLength(1);
    expect(distribution.allocations[0]!.partId).toBe("arm-1");
  });

  it("drops a whole-body allocation when nothing is left to cover", () => {
    const nothing: Anatomy = { ...STANDARD_HUMANOID_ANATOMY, parts: [] };

    const { distribution, dropped } = place(
      [{ id: "ten", coverage: "whole-body", placement: "surface", aura: 1690 }],
      { anatomy: nothing },
    );

    expect(distribution.allocations).toEqual([]);
    expect(dropped[0]!.reason).toBe("no-measurable-body");
  });
});


describe("simultaneous allocations", () => {
  /*
   * The case that rules out a single "current distribution" field: whole-body
   * Ten and a localized internal Chū are both true of this character at once.
   */
  it("holds whole-body surface and localized internal Aura together", () => {
    const { distribution } = place([
      { id: "ten", coverage: "whole-body", placement: "surface", aura: 1690 },
      {
        id: "chu",
        coverage: "localized",
        placement: "internal",
        continuityKey: RIGHT_ARM,
        aura: 237,
      },
    ]);

    expect(distribution.allocations).toHaveLength(13);
    expect(distribution.activeAura).toBeCloseTo(1690 + 237, 10);

    const onRightArm = distribution.allocations
      .filter((allocation) => allocation.partId === "arm-2");

    expect(onRightArm).toHaveLength(2);
    expect(onRightArm.map((a) => a.placement).sort())
      .toEqual(["internal", "surface"]);
  });

  it("keeps each placement measured against its own denominator", () => {
    const { distribution } = place([
      { id: "ten", coverage: "whole-body", placement: "surface", aura: 1690 },
      {
        id: "chu",
        coverage: "localized",
        placement: "internal",
        continuityKey: RIGHT_ARM,
        aura: 237,
      },
    ]);

    const onRightArm = distribution.allocations
      .filter((allocation) => allocation.partId === "arm-2");

    expect(surface(onRightArm.find((a) => a.placement === "surface")!)
      .density.auraPerSquareMeter).toBeCloseTo(1000, 10);
    expect(internal(onRightArm.find((a) => a.placement === "internal")!)
      .density.auraPerLiter).toBeCloseTo(100, 10);
  });

  it("allows two allocations of the same placement on the same part", () => {
    const { distribution } = place([
      {
        id: "ko-a",
        coverage: "localized",
        placement: "internal",
        continuityKey: RIGHT_ARM,
        aura: 100,
      },
      {
        id: "ko-b",
        coverage: "localized",
        placement: "internal",
        continuityKey: RIGHT_ARM,
        aura: 137,
      },
    ]);

    expect(distribution.allocations).toHaveLength(2);
    expect(distribution.activeAura).toBeCloseTo(237, 10);
    expect(distribution.allocations.map((a) => a.allocationId))
      .toEqual(["ko-a", "ko-b"]);
  });

  it("reports Output the character has not placed anywhere", () => {
    const { distribution } = place(
      [{
        id: "ko",
        coverage: "localized",
        placement: "internal",
        continuityKey: RIGHT_ARM,
        aura: 300,
      }],
      { availableOutput: 2000 },
    );

    expect(distribution.activeAura).toBeCloseTo(300, 10);
    expect(distribution.unallocatedOutput).toBeCloseTo(1700, 10);
  });

  it("never reports negative spare Output", () => {
    const { distribution } = place(
      [{ id: "ten", coverage: "whole-body", placement: "surface", aura: 5000 }],
      { availableOutput: 1000 },
    );

    expect(distribution.unallocatedOutput).toBe(0);
  });

  it("places nothing when there is nothing to place", () => {
    const { distribution, dropped } = place([]);

    expect(distribution.activeAura).toBe(0);
    expect(distribution.allocations).toEqual([]);
    expect(dropped).toEqual([]);
  });
});


describe("Scale", () => {
  /*
   * Same Aura, same body plan, ten times the creature. Internal density falls
   * by 1000 and surface density by 100 — the exponent split, arriving where it
   * actually matters.
   */
  it("dilutes internal density as the cube and surface density as the square", () => {
    const allocations: readonly AuraAllocation[] = [
      { id: "ryu", coverage: "whole-body", placement: "internal", aura: 600 },
      { id: "ten", coverage: "whole-body", placement: "surface", aura: 1690 },
    ];

    const human = place(allocations).distribution;
    const giant = place(allocations, { effectiveScale: 10 }).distribution;

    const internalOf = (d: typeof human) =>
      internal(d.allocations.find((a) => a.placement === "internal")!)
        .density.auraPerLiter;
    const surfaceOf = (d: typeof human) =>
      surface(d.allocations.find((a) => a.placement === "surface")!)
        .density.auraPerSquareMeter;

    expect(internalOf(human) / internalOf(giant)).toBeCloseTo(1000, 6);
    expect(surfaceOf(human) / surfaceOf(giant)).toBeCloseTo(100, 6);
  });
});


describe("stored Aura state", () => {
  it("starts empty", () => {
    expect(emptyAuraState()).toEqual({ current: 0, allocations: [] });
    expect(emptyAuraState(500).current).toBe(500);
  });

  it("sums what the character has committed", () => {
    const allocations: readonly AuraAllocation[] = [
      { id: "ten", coverage: "whole-body", placement: "surface", aura: 1690 },
      {
        id: "chu",
        coverage: "localized",
        placement: "internal",
        continuityKey: RIGHT_ARM,
        aura: 237,
      },
    ];

    expect(totalAllocatedAura(allocations)).toBeCloseTo(1927, 10);
    expect(allocations.filter(isWholeBodyAllocation)).toHaveLength(1);
    expect(allocations.filter(isLocalizedAllocation)).toHaveLength(1);
  });

  /*
   * Removing an allocation is a statement about placement, not about the
   * reserve. Current Aura is stored and nothing here touches it.
   */
  it("does not tie Current Aura to what is allocated", () => {
    const state = {
      current: 5000,
      allocations: [
        {
          id: "ko",
          coverage: "localized" as const,
          placement: "internal" as const,
          continuityKey: RIGHT_ARM,
          aura: 300,
        },
      ],
    };

    const without = { ...state, allocations: [] };

    expect(without.current).toBe(state.current);
    expect(totalAllocatedAura(without.allocations)).toBe(0);
  });
});
