/*
 * Sensory Anatomical Points: the metadata, the footprint partition, and the
 * instances a real Human roster produces.
 *
 * The rule the whole file turns on is that a footprint PARTITIONS its host and
 * never adds to it. A Palm is part of a Hand, not an extra surface bolted onto
 * one — so subdividing a body into organs must leave its total exactly where
 * it was. Adding instead would grow a character's surface every time somebody
 * authored anatomy, which thins every coating they hold and makes "this
 * Species is described in detail" a mechanical penalty.
 */

import { describe, expect, it } from "vitest";

import { createAnatomy } from "../character/foundation/body/anatomy/creation";
import type {
  BodyPartDefinition,
  BodyPartId,
} from "../character/foundation/body/anatomy/types";
import type {
  ResolvedBodyMeasurements,
} from "../character/foundation/body/measurements/types";
import { resolveCriticalPoints } from "../character/foundation/body/critical-points/resolution";
import {
  resolveSensoryFootprints,
  resolveSensoryPointFootprint,
} from "../character/foundation/body/critical-points/footprints";
import {
  ANATOMICAL_POINT_CATEGORIES,
  type SpecialPointDefinition,
} from "../character/foundation/body/critical-points/types";
import { validateSpecialPointDefinition } from "../character/foundation/body/critical-points/validation";
import {
  HUMAN_SENSORY_FOOTPRINT_FRACTIONS,
  HUMAN_TACTILE_SENSITIVITIES,
  HUMAN_TOUCH_NETWORK_ID,
  SPECIAL_POINT_DEFINITIONS,
} from "../character/foundation/body/critical-points/special-points";

import { TEST_PART_PHYSICALS } from "./fixtures/body";
import { errorCodesOf, payloadOf } from "./fixtures/result";
import { sensoryBody } from "./fixtures/senses";


const DEFINITIONS: readonly BodyPartDefinition[] = [
  { id: "torso", name: "Torso", description: "Test torso.", tags: [], ...TEST_PART_PHYSICALS },
  { id: "head", name: "Head", description: "Test head.", tags: [], ...TEST_PART_PHYSICALS },
];


function anatomyWith(heads: number) {
  return createAnatomy([
    { id: "torso-1", type: "torso", attachment: null },
    ...Array.from({ length: heads }, (_, index) => ({
      id: `head-${index + 1}`,
      type: "head",
      attachment: { parentId: "torso-1" },
    })),
  ]);
}


/** Measurements with one number per part: the only field footprints read. */
function measuring(
  areas: Readonly<Record<BodyPartId, number>>,
): ResolvedBodyMeasurements {
  const byPartId = Object.fromEntries(
    Object.entries(areas).map(([partId, surfaceAreaCm2]) => [
      partId,
      { partId, surfaceAreaCm2 } as ResolvedBodyMeasurements["parts"][number],
    ]),
  );

  return {
    parts: Object.values(byPartId),
    byPartId,
    totalVolumeL: 0,
    totalSurfaceAreaCm2: Object.values(areas).reduce((sum, one) => sum + one, 0),
    totalMassKg: 0,
    heightCm: 0,
  };
}


function sensoryPoint(
  overrides: Partial<SpecialPointDefinition> & { id: string },
): SpecialPointDefinition {
  return {
    name: "Test Organ",
    description: "A Sensory point authored for a test.",
    categories: ["sensory"],
    placement: { kind: "per-part", selector: { types: ["head"] } },
    sensory: {
      footprint: { kind: "host-surface-fraction", fraction: 0.1 },
      focus: { kind: "local", cluster: "test-cluster" },
      functions: [{ senseId: "sight", contribution: { kind: "fixed", amount: 1 } }],
    },
    ...overrides,
  };
}


function issueCodes(definition: SpecialPointDefinition): readonly string[] {
  return validateSpecialPointDefinition(definition).issues.map((one) => one.code);
}


describe("the Sensory category", () => {
  it("is one of the five independent categories", () => {
    expect(ANATOMICAL_POINT_CATEGORIES)
      .toEqual(["fatal", "critical", "joint", "weak", "sensory"]);
  });

  it("accepts a point that is Sensory and nothing else", () => {
    expect(issueCodes(sensoryPoint({ id: "ear" }))).toEqual([]);
  });

  it("accepts a point that is Sensory as well as a damage category", () => {
    expect(issueCodes(sensoryPoint({
      id: "eye",
      categories: ["critical", "weak", "sensory"],
    }))).toEqual([]);
  });

  it("refuses the Sensory category with no metadata", () => {
    const { sensory, ...bare } = sensoryPoint({ id: "ear" });

    expect(sensory).toBeDefined();
    expect(issueCodes(bare as SpecialPointDefinition))
      .toEqual(["sensory-without-metadata"]);
  });

  it("refuses metadata on a point that is not Sensory", () => {
    expect(issueCodes(sensoryPoint({ id: "ear", categories: ["weak"] })))
      .toEqual(["metadata-without-sensory"]);
  });

  it("refuses a Sensory point that serves no Sense", () => {
    const point = sensoryPoint({ id: "ear" });

    expect(issueCodes({
      ...point,
      sensory: { ...point.sensory!, functions: [] },
    })).toEqual(["sensory-without-functions"]);
  });

  it("refuses one point serving the same Sense twice", () => {
    const point = sensoryPoint({ id: "ear" });

    expect(issueCodes({
      ...point,
      sensory: {
        ...point.sensory!,
        functions: [
          { senseId: "sight", contribution: { kind: "fixed", amount: 0.5 } },
          { senseId: "sight", contribution: { kind: "fixed", amount: 0.5 } },
        ],
      },
    })).toEqual(["duplicate-sensory-sense"]);
  });

  it("accepts one point serving two DIFFERENT Senses", () => {
    const point = sensoryPoint({ id: "thermal-eye" });

    expect(issueCodes({
      ...point,
      sensory: {
        ...point.sensory!,
        functions: [
          { senseId: "sight", contribution: { kind: "fixed", amount: 1 } },
          { senseId: "thermoreception", contribution: { kind: "fixed", amount: 1 } },
        ],
      },
    })).toEqual([]);
  });

  it("refuses contributions, footprints and focuses that make no sense", () => {
    const point = sensoryPoint({ id: "ear" });
    const withSensory = (sensory: Partial<NonNullable<SpecialPointDefinition["sensory"]>>) =>
      issueCodes({ ...point, sensory: { ...point.sensory!, ...sensory } });

    expect(withSensory({
      functions: [{ senseId: "sight", contribution: { kind: "fixed", amount: 0 } }],
    })).toEqual(["invalid-sensory-contribution"]);

    expect(withSensory({
      footprint: { kind: "host-surface-fraction", fraction: 1 },
    })).toEqual(["invalid-sensory-footprint"]);

    expect(withSensory({
      footprint: { kind: "absolute", squareMetres: -1 },
    })).toEqual(["invalid-sensory-footprint"]);

    expect(withSensory({
      focus: { kind: "local", cluster: "  " },
    })).toEqual(["invalid-sensory-focus"]);

    expect(withSensory({
      focus: {
        kind: "distributed",
        network: "skin",
        selection: "some" as never,
      },
    })).toEqual(["invalid-sensory-focus"]);
  });

  it("validates the Sense id's shape without importing the Sense registry", () => {
    /*
     * An unregistered Sense id passes HERE on purpose. Proving it exists needs
     * the Sense registry, and the body foundation does not import it — so the
     * question belongs to cross-catalog validation at the composition
     * boundary, which is where both catalogs are in scope anyway.
     */
    const point = sensoryPoint({ id: "ear" });

    expect(issueCodes({
      ...point,
      sensory: {
        ...point.sensory!,
        functions: [{
          senseId: "clairvoyance-of-the-ninth-house",
          contribution: { kind: "fixed", amount: 1 },
        }],
      },
    })).toEqual([]);

    expect(issueCodes({
      ...point,
      sensory: {
        ...point.sensory!,
        functions: [{ senseId: "  ", contribution: { kind: "fixed", amount: 1 } }],
      },
    })).toEqual(["invalid-sensory-sense"]);
  });
});


describe("resolved instances", () => {
  it("gives each Head its own independent organ instances", () => {
    const points = resolveCriticalPoints(
      anatomyWith(3),
      DEFINITIONS,
      [sensoryPoint({ id: "eye" })],
    );

    expect(points.points.map((one) => one.id))
      .toEqual(["eye:head-1", "eye:head-2", "eye:head-3"]);

    for (const point of points.points) {
      expect(point.sensory?.focus).toEqual({
        kind: "local",
        cluster: "test-cluster",
      });
    }
  });

  it("carries the sensory metadata onto the instance", () => {
    const point = resolveCriticalPoints(
      anatomyWith(1),
      DEFINITIONS,
      [sensoryPoint({ id: "eye" })],
    ).points[0]!;

    expect(point.sensory?.functions).toEqual([
      { senseId: "sight", contribution: { kind: "fixed", amount: 1 } },
    ]);
  });

  it("leaves a non-Sensory point with no metadata at all", () => {
    const point = resolveCriticalPoints(anatomyWith(1), DEFINITIONS, [{
      id: "brain",
      name: "Brain",
      description: "Test brain.",
      categories: ["fatal"],
      placement: { kind: "per-part", selector: { types: ["head"] } },
    }]).points[0]!;

    expect(point.sensory).toBeUndefined();
    expect("sensory" in point).toBe(false);
  });
});


describe("the footprint partition", () => {
  const HEAD_AREA_CM2 = 1_000;

  function footprintsFor(
    definitions: readonly SpecialPointDefinition[],
    heads = 1,
  ) {
    return resolveSensoryFootprints({
      points: resolveCriticalPoints(anatomyWith(heads), DEFINITIONS, definitions),
      measurements: measuring({
        "torso-1": 5_000,
        ...Object.fromEntries(
          Array.from({ length: heads }, (_, index) => [
            `head-${index + 1}`,
            HEAD_AREA_CM2,
          ]),
        ),
      }),
    });
  }

  it("resolves a host fraction against the host's own area", () => {
    const host = payloadOf(footprintsFor([
      sensoryPoint({ id: "eye" }),
    ])).byHostPartId["head-1"]!;

    expect(host.points[0]!.squareMetres).toBeCloseTo(0.01, 12);
    expect(host.remainderSquareMetres).toBeCloseTo(0.09, 12);
  });

  it("scales a host fraction with the host, and an absolute area not at all", () => {
    const fractional = resolveSensoryPointFootprint(
      resolveCriticalPoints(anatomyWith(1), DEFINITIONS, [
        sensoryPoint({ id: "eye" }),
      ]).points[0]!,
      1,
    );

    const absolute = resolveSensoryPointFootprint(
      resolveCriticalPoints(anatomyWith(1), DEFINITIONS, [
        sensoryPoint({
          id: "gem",
          sensory: {
            ...sensoryPoint({ id: "gem" }).sensory!,
            footprint: { kind: "absolute", squareMetres: 0.004 },
          },
        }),
      ]).points[0]!,
      1,
    );

    expect(fractional).toBeCloseTo(0.1, 12);
    expect(absolute).toBe(0.004);

    /* Ten times the host: the eye grows, the implant does not. */
    expect(resolveSensoryPointFootprint(
      resolveCriticalPoints(anatomyWith(1), DEFINITIONS, [
        sensoryPoint({ id: "eye" }),
      ]).points[0]!,
      10,
    )).toBeCloseTo(1, 12);
  });

  it("adds up to exactly the host's area, points and remainder together", () => {
    const host = payloadOf(footprintsFor([
      sensoryPoint({ id: "eye" }),
      sensoryPoint({
        id: "ear",
        sensory: {
          ...sensoryPoint({ id: "ear" }).sensory!,
          footprint: { kind: "host-surface-fraction", fraction: 0.25 },
        },
      }),
    ])).byHostPartId["head-1"]!;

    const claimed = host.points.reduce((sum, one) => sum + one.squareMetres, 0);

    expect(claimed + host.remainderSquareMetres)
      .toBeCloseTo(host.hostSquareMetres, 12);
  });

  it("hands the remainder to a point that asked for it, leaving nothing over", () => {
    const host = payloadOf(footprintsFor([
      sensoryPoint({ id: "eye" }),
      sensoryPoint({
        id: "skin",
        sensory: {
          ...sensoryPoint({ id: "skin" }).sensory!,
          footprint: { kind: "host-remainder" },
        },
      }),
    ])).byHostPartId["head-1"]!;

    const skin = host.points.find((one) => one.pointId === "skin:head-1")!;

    expect(skin.squareMetres).toBeCloseTo(0.09, 12);
    expect(host.remainderSquareMetres).toBeCloseTo(0, 12);
  });

  it("refuses points that claim more surface than the host has", () => {
    expect(errorCodesOf(footprintsFor([
      sensoryPoint({
        id: "eye",
        sensory: {
          ...sensoryPoint({ id: "eye" }).sensory!,
          footprint: { kind: "absolute", squareMetres: 0.3 },
        },
      }),
    ]))).toContain("character.body.sensory.footprint.overcommitted");
  });

  it("refuses two points both claiming the host remainder", () => {
    const remainder = (id: string) =>
      sensoryPoint({
        id,
        sensory: {
          ...sensoryPoint({ id }).sensory!,
          footprint: { kind: "host-remainder" },
        },
      });

    expect(errorCodesOf(footprintsFor([remainder("skin"), remainder("hide")])))
      .toContain("character.body.sensory.footprint.remainder.duplicate");
  });

  it("ignores a point whose host is not in the present measurements", () => {
    const resolved = payloadOf(resolveSensoryFootprints({
      points: resolveCriticalPoints(anatomyWith(2), DEFINITIONS, [
        sensoryPoint({ id: "eye" }),
      ]),
      measurements: measuring({ "torso-1": 5_000, "head-1": HEAD_AREA_CM2 }),
    }));

    expect(Object.keys(resolved.byPointId)).toEqual(["eye:head-1"]);
  });

  it("resolves the same partition whatever order the points arrive in", () => {
    const forwards = payloadOf(footprintsFor([
      sensoryPoint({ id: "eye" }),
      sensoryPoint({ id: "ear" }),
    ]));
    const backwards = payloadOf(footprintsFor([
      sensoryPoint({ id: "ear" }),
      sensoryPoint({ id: "eye" }),
    ]));

    expect(forwards.byHostPartId["head-1"]!.points)
      .toEqual(backwards.byHostPartId["head-1"]!.points);
  });
});


describe("the Human roster's calibration", () => {
  const BODY = sensoryBody();
  const CM2 = 10_000;

  it("centralizes every chosen fraction in one place", () => {
    expect(HUMAN_SENSORY_FOOTPRINT_FRACTIONS).toEqual({
      eye: 0.0010,
      ear: 0.0100,
      olfactory: 0.0040,
      tongue: 0.0200,
      palm: 0.2500,
    });

    expect(HUMAN_TACTILE_SENSITIVITIES).toEqual({ skin: 1, palm: 4 });
    expect(HUMAN_TOUCH_NETWORK_ID).toBe("whole-body-touch");
  });

  it("resolves the reference Human's organs to their calibrated areas", () => {
    const area = (pointId: string) =>
      Number(
        (BODY.sensoryFootprints.byPointId[pointId]!.squareMetres * CM2)
          .toFixed(3),
      );

    expect(area("left-eye:head-1")).toBe(1.183);
    expect(area("right-eye:head-1")).toBe(1.183);
    expect(area("left-ear:head-1")).toBe(11.830);
    expect(area("right-ear:head-1")).toBe(11.830);
    expect(area("olfactory-organs:head-1")).toBe(4.732);
    expect(area("tongue:head-1")).toBe(23.660);
    expect(area("palm:hand-1")).toBe(105.625);
    expect(area("palm:hand-2")).toBe(105.625);
    expect(area("tactile-surface:head-1")).toBe(1128.582);
  });

  it("leaves the reference Human's total surface at exactly 16,900 cm2", () => {
    const partitioned = BODY.sensoryFootprints.hosts.reduce(
      (sum, host) =>
        sum + host.remainderSquareMetres +
        host.points.reduce((inner, one) => inner + one.squareMetres, 0),
      0,
    );

    expect(partitioned * CM2).toBeCloseTo(16_900, 6);
    expect(BODY.measurements.present.totalSurfaceAreaCm2)
      .toBeCloseTo(16_900, 9);
  });

  it("never duplicates Palm area into the Hand's tactile surface", () => {
    const hand = BODY.sensoryFootprints.byHostPartId["hand-1"]!;
    const palm = hand.points.find((one) => one.pointId === "palm:hand-1")!;
    const skin = hand.points
      .find((one) => one.pointId === "tactile-surface:hand-1")!;

    expect(palm.squareMetres * CM2).toBeCloseTo(105.625, 9);
    expect(skin.squareMetres * CM2).toBeCloseTo(316.875, 9);
    expect((palm.squareMetres + skin.squareMetres) * CM2)
      .toBeCloseTo(422.5, 9);
    expect(hand.remainderSquareMetres).toBeCloseTo(0, 12);
  });

  it("carves the facial organs out of the Head's tactile surface", () => {
    const head = BODY.sensoryFootprints.byHostPartId["head-1"]!;

    expect(head.points.reduce((sum, one) => sum + one.squareMetres, 0) * CM2)
      .toBeCloseTo(1_183, 9);
  });

  it("authors the Eyes as Critical, Weak AND Sensory", () => {
    expect(SPECIAL_POINT_DEFINITIONS["left-eye"].categories)
      .toEqual(["critical", "weak", "sensory"]);
  });

  it("authors the Ears, nose and tongue as Sensory alone", () => {
    for (
      const id of ["left-ear", "right-ear", "olfactory-organs", "tongue"] as const
    ) {
      expect([id, SPECIAL_POINT_DEFINITIONS[id].categories])
        .toEqual([id, ["sensory"]]);
    }
  });

  it("gives the Palm a local focus and a network contribution at once", () => {
    const palm = SPECIAL_POINT_DEFINITIONS.palm.sensory!;

    expect(palm.focus).toEqual({ kind: "local", cluster: "palm" });
    expect(palm.functions).toEqual([{
      senseId: "touch",
      contribution: {
        kind: "network-weight",
        networkId: HUMAN_TOUCH_NETWORK_ID,
        sensitivity: 4,
      },
    }]);
  });
});
