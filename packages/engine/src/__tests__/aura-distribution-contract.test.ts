/*
 * Target-aware Aura placement, and the authorization that gates uneven Aura.
 *
 * Two things this suite exists to hold apart.
 *
 * UNIFORM MEANS COMPLETE AND EQUAL. A whole-body allocation covers every
 * eligible present part at ONE density, which is a claim about the arithmetic
 * rather than a promise in a comment. The failure mode it guards is not a
 * caller writing `coverage: "differential"` by mistake — it is a caller who
 * wants uneven Aura labelling it uniform, because the uniform path asks no
 * questions. A "whole-body" placement that skipped a limb, or doubled the
 * fists, would be exactly the advanced application the rules gate behind
 * mastery, obtained for free by choosing a word.
 *
 * DIFFERENTIAL IS AUTHORIZED, AND THE AUTHORIZATION IS BOUND. Not a permission
 * bit — a grant naming the allocation, the source and the owner it was issued
 * for. A bit could be copied onto another allocation or handed to another
 * character and would still read as valid; the bindings are what make forging
 * one require forging the thing it authorizes.
 *
 * The mutants at the end are the real assertions. Equal Aura per part instead
 * of equal density, and an authorization that only has to exist, are the two
 * ways this can be quietly wrong while every ordinary test still passes.
 */

import { describe, expect, it } from "vitest";

import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import { continuityKey } from "../character/foundation/body/anatomy/types";
import { resolveAuraDistribution } from "../character/foundation/aura/distribution";
import { findAuraAllocationIssues } from "../character/foundation/aura/validation";
import type {
  AuraAllocation,
  DifferentialAuraAllocation,
} from "../character/foundation/aura/state";
import {
  deriveAreaVolumeLitres,
  resolveAuraPlacement,
  type AuraPlacementBody,
  type AuraPlacementMeasure,
  type AuraPlacementRequest,
} from "../gameplay/aura";
import type { SpatialArea } from "../spatial";
import type { TargetRef } from "../targeting";

import { auraTestMeasurements } from "./fixtures/aura";


const RIGHT_ARM = continuityKey("upper-limb:right");
const LEFT_ARM = continuityKey("upper-limb:left");

const OWNER = "aura:gon";
const SOURCE = "activity:ryu-1";

function body(availableOutput = 100_000): AuraPlacementBody {
  return {
    anatomy: STANDARD_HUMANOID_ANATOMY,
    measurements: auraTestMeasurements(),
    availableOutput,
  };
}

const SELF: TargetRef = { kind: "self" };

const SWORD: TargetRef = { kind: "object", objectId: "sword-1" };

const HERE = {
  kind: "metric",
  contextId: "scene-1",
  xMetres: 0,
  yMetres: 0,
  zMetres: 0,
} as const;

function sphere(radiusMetres: number): SpatialArea {
  return { kind: "sphere", centre: HERE, radiusMetres };
}

function hostMeasure(
  amount: number,
  unit: AuraPlacementMeasure["unit"] = "square-metre",
): AuraPlacementMeasure {
  return { unit, amount, derivation: "host", provenance: "host:item-catalog" };
}

function request(
  overrides: Partial<AuraPlacementRequest> = {},
): AuraPlacementRequest {
  return {
    requestId: "place-1",
    owner: OWNER,
    source: SOURCE,
    aura: 1000,
    targets: [{ target: SELF, channel: { kind: "uniform-body-surface" } }],
    ...overrides,
  } as AuraPlacementRequest;
}

/** A well-formed differential allocation, which the tests then break. */
function differential(
  overrides: Partial<DifferentialAuraAllocation> = {},
): DifferentialAuraAllocation {
  return {
    id: "ryu",
    coverage: "differential",
    placement: "surface",
    aura: 600,
    source: SOURCE,
    weights: [
      { continuityKey: RIGHT_ARM, weight: 3 },
      { continuityKey: LEFT_ARM, weight: 1 },
    ],
    authorization: {
      allocationId: "ryu",
      source: SOURCE,
      owner: OWNER,
      grantedBy: "mastery:ryu",
    },
    ...overrides,
  };
}


describe("uniform placement is complete and equal-density", () => {
  it("gives every eligible part the same density, not the same Aura", () => {
    const result = resolveAuraPlacement(request(), body());

    expect(result.success).toBe(true);
    if (!result.success) return;

    const densities = result.payload.sites.map((site) =>
      site.density.placement === "surface"
        ? site.density.auraPerSquareMeter
        : site.density.auraPerLiter
    );

    expect(densities.length).toBeGreaterThan(4);

    for (const density of densities) {
      expect(density).toBeCloseTo(densities[0]!, 6);
    }

    /*
     * The mutant this kills: equal Aura per part. A Hand and a Leg would then
     * carry the same Aura, which is fourteen times the density on the Hand —
     * and every density assertion above would still pass if the parts happened
     * to be the same size, which they are not.
     */
    const auras = result.payload.sites.map((site) => site.aura);
    const smallest = Math.min(...auras);
    const largest = Math.max(...auras);

    expect(largest / smallest).toBeGreaterThan(2);
  });

  it("conserves the funded Aura across the whole body", () => {
    const result = resolveAuraPlacement(request({ aura: 1337 }), body());

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.placedAura).toBeCloseTo(1337, 6);
  });

  it("keeps equal density on a scaled body", () => {
    const scaled: AuraPlacementBody = {
      anatomy: STANDARD_HUMANOID_ANATOMY,
      measurements: auraTestMeasurements(STANDARD_HUMANOID_ANATOMY, 4),
      availableOutput: 100_000,
    };

    const result = resolveAuraPlacement(request(), scaled);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const densities = result.payload.sites.map((site) =>
      site.density.placement === "surface"
        ? site.density.auraPerSquareMeter
        : 0
    );

    for (const density of densities) {
      expect(density).toBeCloseTo(densities[0]!, 6);
    }

    /* Same Aura over more body is a lower density, which is the honest result. */
    const unscaled = resolveAuraPlacement(request(), body());

    expect(unscaled.success).toBe(true);
    if (!unscaled.success) return;

    const before = unscaled.payload.sites[0]!.density;
    expect(before.placement).toBe("surface");

    if (before.placement !== "surface") return;

    expect(densities[0]!).toBeLessThan(before.auraPerSquareMeter);
  });

  it("refuses a uniform allocation that carries weights", () => {
    /*
     * The shape the union alone cannot catch: TypeScript's excess-property
     * check fires on literals, and stored state arrives from a host as a
     * parsed object. Without this, a weighted placement labelled "whole-body"
     * resolves as uniform while reading as authorized to anybody looking.
     */
    const smuggled = {
      id: "sneaky",
      coverage: "whole-body",
      placement: "surface",
      aura: 100,
      weights: [{ continuityKey: RIGHT_ARM, weight: 1 }],
    } as unknown as AuraAllocation;

    expect(findAuraAllocationIssues([smuggled]).map((one) => one.code))
      .toContain("aura.allocation.uniform.weighted");
  });
});


describe("differential placement requires a bound authorization", () => {
  function place(allocation: AuraAllocation) {
    return resolveAuraDistribution({
      allocations: [allocation],
      anatomy: STANDARD_HUMANOID_ANATOMY,
      measurements: auraTestMeasurements(),
      availableOutput: 100_000,
      owner: OWNER,
    });
  }

  it("normalizes valid weights deterministically", () => {
    const result = place(differential());

    expect(result.success).toBe(true);
    if (!result.success) return;

    const byPart = new Map(
      result.payload.distribution.allocations.map((one) => [one.partId, one.aura]),
    );

    /* 3:1 of 600 is 450 and 150, whatever the arms happen to measure. */
    const auras = [...byPart.values()].sort((a, b) => b - a);

    expect(auras).toHaveLength(2);
    expect(auras[0]!).toBeCloseTo(450, 8);
    expect(auras[1]!).toBeCloseTo(150, 8);
  });

  it("gives the same answer for 3:1 and 0.75:0.25", () => {
    const scaled = place(differential({
      weights: [
        { continuityKey: RIGHT_ARM, weight: 0.75 },
        { continuityKey: LEFT_ARM, weight: 0.25 },
      ],
    }));

    const whole = place(differential());

    expect(scaled.success && whole.success).toBe(true);
    if (!scaled.success || !whole.success) return;

    const auraOf = (result: typeof whole) =>
      Object.fromEntries(
        result.payload.distribution.allocations.map((one) => [one.partId, one.aura]),
      );

    expect(auraOf(scaled)).toEqual(auraOf(whole));
  });

  it("refuses an allocation with no authorization at all", () => {
    const { authorization: _unused, ...rest } = differential();

    expect(
      findAuraAllocationIssues([rest as unknown as AuraAllocation])
        .map((one) => one.code),
    ).toContain("aura.allocation.authorization.missing");
  });

  it("refuses a grant issued for a different allocation", () => {
    const forged = differential({
      authorization: {
        allocationId: "some-other-allocation",
        source: SOURCE,
        owner: OWNER,
        grantedBy: "mastery:ryu",
      },
    });

    expect(findAuraAllocationIssues([forged], { owner: OWNER })
      .map((one) => one.code))
      .toContain("aura.allocation.authorization.mismatched");
  });

  it("refuses a grant issued for a different owner", () => {
    const stolen = differential({
      authorization: {
        allocationId: "ryu",
        source: SOURCE,
        owner: "aura:killua",
        grantedBy: "mastery:ryu",
      },
    });

    expect(findAuraAllocationIssues([stolen], { owner: OWNER })
      .map((one) => one.code))
      .toContain("aura.allocation.authorization.mismatched");

    /* And through the real path, not only the validator. */
    expect(place(stolen).success).toBe(false);
  });

  it("refuses a grant issued to a different source", () => {
    const borrowed = differential({
      authorization: {
        allocationId: "ryu",
        source: "activity:something-else",
        owner: OWNER,
        grantedBy: "mastery:ryu",
      },
    });

    expect(findAuraAllocationIssues([borrowed], { owner: OWNER })
      .map((one) => one.code))
      .toContain("aura.allocation.authorization.mismatched");
  });

  it("kills the mutant where an authorization only has to exist", () => {
    /*
     * Every binding wrong at once, but structurally a perfectly good grant. An
     * implementation that checked presence rather than bindings accepts this,
     * and with it accepts every copied and reused grant there could be.
     */
    const useless = differential({
      authorization: {
        allocationId: "not-this-one",
        source: "not-this-source",
        owner: "not-this-character",
        grantedBy: "mastery:ryu",
      },
    });

    expect(place(useless).success).toBe(false);
  });

  it.each([
    ["no weights", []],
    ["a NaN weight", [{ continuityKey: RIGHT_ARM, weight: Number.NaN }]],
    ["an infinite weight", [{ continuityKey: RIGHT_ARM, weight: Infinity }]],
    ["a negative weight", [{ continuityKey: RIGHT_ARM, weight: -1 }]],
    ["weights totalling zero", [{ continuityKey: RIGHT_ARM, weight: 0 }]],
    ["a nameless identity", [{ continuityKey: "", weight: 1 }]],
  ])("refuses %s", (_label, weights) => {
    const broken = differential({
      weights: weights as unknown as DifferentialAuraAllocation["weights"],
    });

    expect(findAuraAllocationIssues([broken], { owner: OWNER })
      .map((one) => one.code))
      .toContain("aura.allocation.weights.invalid");
  });

  it("conserves the Aura when one weighted identity is missing", () => {
    /*
     * Normalizing against the weights that LANDED rather than every weight
     * asked for. A share aimed at an arm that is not there would otherwise go
     * nowhere and silently shrink the placement — the character would be
     * holding less than they committed with nothing saying so.
     */
    const result = place(differential({
      weights: [
        { continuityKey: RIGHT_ARM, weight: 3 },
        { continuityKey: continuityKey("tail:primary"), weight: 1 },
      ],
    }));

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.distribution.activeAura).toBeCloseTo(600, 8);
    expect(result.payload.distribution.allocations).toHaveLength(1);
  });
});


describe("item and projected targets", () => {
  it("uses the host's authoritative item measure", () => {
    const result = resolveAuraPlacement(request({
      aura: 50,
      targets: [{
        target: SWORD,
        channel: { kind: "item-surface", measure: hostMeasure(0.25) },
      }],
    }));

    expect(result.success).toBe(true);
    if (!result.success) return;

    const site = result.payload.sites[0]!;

    expect(site.target).toEqual(SWORD);
    expect(site.channel).toBe("item-surface");
    expect(site.aura).toBe(50);
    expect(site.measure.derivation).toBe("host");
    expect(site.measure.provenance).toBe("host:item-catalog");

    expect(site.density.placement).toBe("surface");
    if (site.density.placement !== "surface") return;

    expect(site.density.auraPerSquareMeter).toBeCloseTo(200, 8);
  });

  it("derives a sphere's volume rather than asking for it", () => {
    const result = resolveAuraPlacement(request({
      aura: 1000,
      targets: [{
        target: { kind: "area", area: sphere(1) },
        channel: { kind: "projected-spatial" },
      }],
    }));

    expect(result.success).toBe(true);
    if (!result.success) return;

    const site = result.payload.sites[0]!;

    /* (4/3)pi cubic metres, in litres. */
    expect(site.measure.unit).toBe("litre");
    expect(site.measure.derivation).toBe("derived");
    expect(site.measure.amount).toBeCloseTo((4 / 3) * Math.PI * 1000, 6);
    expect(site.measure.provenance).toBe("spatial:sphere");
  });

  it("refuses to guess a volume for a shape that does not determine one", () => {
    /*
     * A cone's fields fix a direction, a length and an aperture but not the
     * solid they sweep; a line has no height at all. Returning a plausible
     * number would be the engine silently choosing a shape, and every density
     * computed from it would carry that choice as though it were measured.
     */
    expect(deriveAreaVolumeLitres({
      kind: "cone",
      origin: HERE,
      direction: { x: 1, y: 0, z: 0 },
      lengthMetres: 5,
      apertureDegrees: 60,
    })).toBeNull();

    const result = resolveAuraPlacement(request({
      targets: [{
        target: {
          kind: "area",
          area: {
            kind: "cone",
            origin: HERE,
            direction: { x: 1, y: 0, z: 0 },
            lengthMetres: 5,
            apertureDegrees: 60,
          },
        },
        channel: { kind: "projected-spatial" },
      }],
    }));

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("aura.placement.measure.required");
  });

  it("accepts a host measure for the shapes it will not derive", () => {
    const result = resolveAuraPlacement(request({
      aura: 100,
      targets: [{
        target: {
          kind: "area",
          area: {
            kind: "line",
            origin: HERE,
            direction: { x: 1, y: 0, z: 0 },
            lengthMetres: 10,
            widthMetres: 1,
          },
        },
        channel: {
          kind: "projected-spatial",
          measure: {
            unit: "litre",
            amount: 20_000,
            derivation: "host",
            provenance: "host:scene-volume",
          },
        },
      }],
    }));

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.sites[0]!.measure.provenance)
      .toBe("host:scene-volume");
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("refuses a %s host measure", (_label, amount) => {
    const result = resolveAuraPlacement(request({
      targets: [{
        target: SWORD,
        channel: { kind: "item-surface", measure: hostMeasure(amount) },
      }],
    }));

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("aura.placement.measure.amount.invalid");
  });

  it("refuses a measure with no provenance", () => {
    const result = resolveAuraPlacement(request({
      targets: [{
        target: SWORD,
        channel: {
          kind: "item-surface",
          measure: {
            unit: "square-metre",
            amount: 1,
            derivation: "host",
            provenance: "   ",
          },
        },
      }],
    }));

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("aura.placement.measure.provenance.missing");
  });
});


describe("multiple targets", () => {
  it("spreads one request across two items at one density", () => {
    const result = resolveAuraPlacement(request({
      aura: 300,
      targets: [
        {
          target: SWORD,
          channel: { kind: "item-surface", measure: hostMeasure(1) },
        },
        {
          target: { kind: "object", objectId: "shield-1" },
          channel: { kind: "item-surface", measure: hostMeasure(2) },
        },
      ],
    }));

    expect(result.success).toBe(true);
    if (!result.success) return;

    const [sword, shield] = result.payload.sites;

    expect(sword!.aura).toBeCloseTo(100, 8);
    expect(shield!.aura).toBeCloseTo(200, 8);

    /* Different sizes, different Aura, the SAME density. That is uniform. */
    expect(sword!.density).toEqual(shield!.density);

    expect(result.payload.placedAura).toBeCloseTo(300, 8);
  });

  it("conserves the total and preserves each target's own context", () => {
    const result = resolveAuraPlacement(
      request({
        aura: 777,
        targets: [
          { target: SELF, channel: { kind: "uniform-body-surface" } },
          {
            target: SWORD,
            channel: { kind: "item-surface", measure: hostMeasure(0.5) },
          },
        ],
      }),
      body(),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.placedAura).toBeCloseTo(777, 6);

    const targets = new Set(result.payload.sites.map((one) => one.channel));

    expect(targets).toEqual(
      new Set(["uniform-body-surface", "item-surface"]),
    );

    /*
     * One target's Aura never appears under another's. A body site names a
     * part; an item site names the object and no part at all.
     */
    for (const site of result.payload.sites) {
      if (site.channel === "item-surface") {
        expect(site.partId).toBeUndefined();
        expect(site.target).toEqual(SWORD);
      } else {
        expect(site.partId).toBeDefined();
      }
    }
  });
});


describe("malformed placement requests", () => {
  it("reports an invalid target through Targeting's own validator", () => {
    const result = resolveAuraPlacement(request({
      targets: [{
        target: { kind: "object" } as unknown as TargetRef,
        channel: { kind: "item-surface", measure: hostMeasure(1) },
      }],
    }));

    expect(result.success).toBe(false);
  });

  it("reports an invalid area through Spatial's own validator", () => {
    const result = resolveAuraPlacement(request({
      targets: [{
        target: { kind: "area", area: sphere(Number.NaN) },
        channel: { kind: "projected-spatial" },
      }],
    }));

    expect(result.success).toBe(false);
  });

  it.each([
    ["NaN", Number.NaN],
    ["negative", -1],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("refuses %s Aura without throwing", (_label, aura) => {
    const result = resolveAuraPlacement(request({ aura }), body());

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("aura.placement.aura.invalid");
  });

  it("refuses an unknown channel", () => {
    const result = resolveAuraPlacement(request({
      targets: [{
        target: SELF,
        channel: { kind: "uniform-body-diagonal" } as never,
      }],
    }), body());

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("aura.placement.channel.invalid");
  });

  it("refuses a body channel with no body to place it on", () => {
    const result = resolveAuraPlacement(request());

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("aura.placement.body.missing");
  });

  it("refuses an empty target list", () => {
    const result = resolveAuraPlacement(
      request({ targets: [] as unknown as AuraPlacementRequest["targets"] }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("aura.placement.targets.missing");
  });

  it("never mutates the request it was given", () => {
    const original = request({
      aura: 100,
      targets: [{
        target: SWORD,
        channel: { kind: "item-surface", measure: hostMeasure(1) },
      }],
    });

    const before = JSON.stringify(original);

    resolveAuraPlacement(original, body());

    expect(JSON.stringify(original)).toBe(before);
  });
});
