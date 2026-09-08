/*
 * The spatial vocabulary, checked at the boundaries that actually decide play.
 *
 * Most of these assertions are about EXACT edges — a target at exactly the
 * declared maximum, a band boundary, a zero-length direction — because that is
 * where a Range rule is either right or off by one, and where a reader's
 * intuition about inclusivity is least reliable.
 */

import { describe, expect, it } from "vitest";

import {
  COVER_DEGREES,
  MISSING_SPATIAL_FACT_CODE,
  compareToDistanceInterval,
  directDistance,
  findAreaIssues,
  findDirectionIssues,
  findDistanceIntervalIssues,
  findPathIssues,
  findPositionIssues,
  isMetricPosition,
  findRangeBand,
  findRangeBandScaleIssues,
  findSpatialFactsIssues,
  findTravelIssues,
  isMissingSpatialFactError,
  measureDirectDistance,
  measurePathLength,
  meleeReachInterval,
  normalizeDirection,
  pathDistance,
  travelDuration,
  type DistanceInterval,
  type MetricPosition,
  type RangeBandScale,
  type SpatialArea,
  type SpatialPath,
} from "../spatial";
import { GAME_MILLISECONDS_PER_SECOND } from "../time/duration";

const SCENE = "scene-1";

function at(
  xMetres: number,
  yMetres = 0,
  zMetres = 0,
  contextId = SCENE,
): MetricPosition {
  return { kind: "metric", contextId, xMetres, yMetres, zMetres };
}

const RANGE_5_TO_10: DistanceInterval = {
  kind: "direct",
  minimumMetres: 5,
  maximumMetres: 10,
};


describe("Range boundaries", () => {
  it("includes a target at exactly the declared minimum", () => {
    expect(compareToDistanceInterval(RANGE_5_TO_10, directDistance(5)))
      .toEqual({ outcome: "within" });
  });

  it("includes a target at exactly the declared maximum", () => {
    expect(compareToDistanceInterval(RANGE_5_TO_10, directDistance(10)))
      .toEqual({ outcome: "within" });
  });

  it("rejects below the minimum, reporting the shortfall", () => {
    expect(compareToDistanceInterval(RANGE_5_TO_10, directDistance(4.5)))
      .toEqual({ outcome: "below-minimum", shortfallMetres: 0.5 });
  });

  it("rejects above the maximum, reporting the excess", () => {
    expect(compareToDistanceInterval(RANGE_5_TO_10, directDistance(12)))
      .toEqual({ outcome: "above-maximum", excessMetres: 2 });
  });

  it("treats a null maximum as unbounded", () => {
    const unbounded: DistanceInterval = {
      kind: "direct",
      minimumMetres: 0,
      maximumMetres: null,
    };

    expect(compareToDistanceInterval(unbounded, directDistance(9_000)))
      .toEqual({ outcome: "within" });
  });

  it("converts melee reach to an interval starting at contact", () => {
    const interval = meleeReachInterval({ reachMetres: 1.5 });

    expect(interval).toEqual({
      kind: "direct",
      minimumMetres: 0,
      maximumMetres: 1.5,
    });

    expect(compareToDistanceInterval(interval, directDistance(1.5)).outcome)
      .toBe("within");

    expect(compareToDistanceInterval(interval, directDistance(1.6)).outcome)
      .toBe("above-maximum");
  });
});


describe("direct and path distance stay distinct", () => {
  it("refuses to measure a path length against a direct Range", () => {
    const comparison = compareToDistanceInterval(
      RANGE_5_TO_10,
      pathDistance(7),
    );

    expect(comparison.outcome).toBe("incomparable");

    if (comparison.outcome !== "incomparable") throw new Error("unreachable");

    expect(comparison.error.code).toBe("spatial.distance.kind.mismatch");
  });

  it("refuses a direct distance against a path allowance", () => {
    const allowance: DistanceInterval = {
      kind: "path",
      minimumMetres: 0,
      maximumMetres: 10,
    };

    expect(compareToDistanceInterval(allowance, directDistance(7)).outcome)
      .toBe("incomparable");
  });

  it("keeps the same number meaning two different things", () => {
    /*
     * Eight metres of straight line is in Range; eight metres of walking
     * around a corner is a different measurement that happens to share a
     * number. Nothing in the engine may let one stand in for the other.
     */
    expect(directDistance(8)).not.toEqual(pathDistance(8));
  });
});


describe("spatial contexts", () => {
  it("refuses to compare positions in different contexts", () => {
    const result = measureDirectDistance(at(0), at(3, 0, 0, "scene-2"));

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((error) => error.code))
      .toContain("spatial.context.mismatch");
  });

  it("measures within one context", () => {
    const result = measureDirectDistance(at(0), at(3, 4));

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(result.payload).toEqual(directDistance(5));
  });
});


describe("opaque host positions", () => {
  const token = {
    kind: "host",
    contextId: SCENE,
    reference: "token-42",
  } as const;

  it("requires a supplied separation, and says so distinguishably", () => {
    const result = measureDirectDistance(at(0), token);

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    const [first] = result.errors;

    expect(first.code).toBe(MISSING_SPATIAL_FACT_CODE);
    expect(isMissingSpatialFactError(first)).toBe(true);
  });

  it("uses the host's measurement when one is supplied", () => {
    const result = measureDirectDistance(at(0), token, {
      separation: directDistance(6.5),
    });

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(result.payload).toEqual(directDistance(6.5));
  });

  it("rejects a supplied separation of the wrong kind", () => {
    const result = measureDirectDistance(at(0), token, {
      separation: pathDistance(6.5),
    });

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors[0].code).toBe("spatial.distance.kind.mismatch");
  });

  it("keeps a missing fact distinguishable from invalid data", () => {
    const missing = measureDirectDistance(at(0), token);
    const invalid = measureDirectDistance(at(Number.NaN), at(1));

    if (missing.success || invalid.success) throw new Error("unreachable");

    expect(isMissingSpatialFactError(missing.errors[0])).toBe(true);
    expect(isMissingSpatialFactError(invalid.errors[0])).toBe(false);
    expect(invalid.errors[0].code).toBe("spatial.position.coordinate.invalid");
  });
});


describe("paths", () => {
  it("sums its segments as a path distance", () => {
    const path: SpatialPath = {
      contextId: SCENE,
      points: [at(0), at(3, 4), at(3, 4, 12)],
    };

    const result = measurePathLength(path);

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(result.payload).toEqual(pathDistance(17));
  });

  it("rejects a one-point path", () => {
    expect(findPathIssues({ contextId: SCENE, points: [at(0)] }).map((e) => e.code))
      .toContain("spatial.path.too-short");
  });

  it("rejects a malformed waypoint without throwing", () => {
    /*
     * The regression. findPositionIssues() reports a malformed waypoint and
     * then execution used to carry on into `point.contextId` anyway, so a
     * null waypoint threw instead of returning the issue just recorded for
     * it — the one input the guard exists to handle.
     */
    const malformed: readonly unknown[] = [
      null,
      undefined,
      "over there",
      42,
      true,
      [],
      [at(0)],
      {},
      { kind: "metric" },
      { kind: "metric", contextId: null },
      { kind: "host", contextId: SCENE },
    ];

    for (const point of malformed) {
      const path = { contextId: SCENE, points: [at(0), point] } as SpatialPath;

      expect(() => findPathIssues(path)).not.toThrow();
      expect(findPathIssues(path).length).toBeGreaterThan(0);
    }
  });

  it("reports the malformed waypoint rather than a context mismatch", () => {
    /*
     * "In a DIFFERENT context" is only coherent when both ends name one. A
     * waypoint with no valid contextId is not somewhere else, it is nowhere,
     * and it has already been reported for exactly that.
     *
     * The earlier version guarded only against null, which stopped the throw
     * and not the wrong diagnostic: an array and a bare object are both
     * objects, so both fell through to the comparison.
     */
    const malformed: readonly unknown[] = [
      null,
      undefined,
      "over there",
      [],
      [at(0)],
      {},
      { kind: "metric" },
      { kind: "metric", contextId: "" },
      { kind: "metric", contextId: null },
      { contextId: 42 },
    ];

    for (const point of malformed) {
      const codes = findPathIssues({
        contextId: SCENE,
        points: [at(0), point],
      } as unknown as SpatialPath).map((error) => error.code);

      expect(codes.length).toBeGreaterThan(0);
      expect(codes).not.toContain("spatial.path.context.mixed");
    }
  });

  it("still reports a genuine mismatch between two named contexts", () => {
    const codes = findPathIssues({
      contextId: SCENE,
      points: [at(0), at(1, 0, 0, "scene-2")],
    }).map((error) => error.code);

    expect(codes).toContain("spatial.path.context.mixed");
  });

  it("measures nothing from a path with a malformed waypoint", () => {
    const result = measurePathLength({
      contextId: SCENE,
      points: [at(0), null],
    } as unknown as SpatialPath);

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((error) => error.code))
      .toContain("spatial.position.malformed");
  });

  it("rejects waypoints from another context", () => {
    const path: SpatialPath = {
      contextId: SCENE,
      points: [at(0), at(1, 0, 0, "scene-2")],
    };

    expect(findPathIssues(path).map((error) => error.code))
      .toContain("spatial.path.context.mixed");
  });

  it("asks the host for the length of a route it cannot add up", () => {
    const path: SpatialPath = {
      contextId: SCENE,
      points: [at(0), { kind: "host", contextId: SCENE, reference: "door" }],
    };

    const result = measurePathLength(path);

    if (result.success) throw new Error("unreachable");

    expect(result.errors[0].code).toBe(MISSING_SPATIAL_FACT_CODE);

    const supplied = measurePathLength(path, pathDistance(11));

    expect(supplied.success).toBe(true);
  });
});


describe("Range bands", () => {
  const scale: RangeBandScale = {
    kind: "direct",
    bands: [
      { id: "close", fromMetresInclusive: 0, toMetresExclusive: 5 },
      { id: "medium", fromMetresInclusive: 5, toMetresExclusive: 20 },
      { id: "long", fromMetresInclusive: 20, toMetresExclusive: null },
    ],
  };

  it("accepts an ordered, non-overlapping scale", () => {
    expect(findRangeBandScaleIssues(scale)).toEqual([]);
  });

  it("puts a boundary distance in the band it starts", () => {
    /*
     * Bands are half-open on purpose: exactly 5 m belongs to "medium" and to
     * nothing else. Inclusive-at-both-ends bands would make 5 m two answers
     * and the engine would be choosing by array order.
     */
    expect(findRangeBand(scale, directDistance(4.999))?.id).toBe("close");
    expect(findRangeBand(scale, directDistance(5))?.id).toBe("medium");
    expect(findRangeBand(scale, directDistance(20))?.id).toBe("long");
    expect(findRangeBand(scale, directDistance(9_000))?.id).toBe("long");
  });

  it("does not answer for the wrong kind of distance", () => {
    expect(findRangeBand(scale, pathDistance(7))).toBeUndefined();
  });

  it("rejects overlapping bands", () => {
    const overlapping: RangeBandScale = {
      kind: "direct",
      bands: [
        { id: "close", fromMetresInclusive: 0, toMetresExclusive: 6 },
        { id: "medium", fromMetresInclusive: 5, toMetresExclusive: 20 },
      ],
    };

    expect(findRangeBandScaleIssues(overlapping).map((error) => error.code))
      .toContain("spatial.bands.overlap");
  });

  it("rejects an unbounded band that is not last", () => {
    const wrong: RangeBandScale = {
      kind: "direct",
      bands: [
        { id: "everything", fromMetresInclusive: 0, toMetresExclusive: null },
        { id: "long", fromMetresInclusive: 20, toMetresExclusive: null },
      ],
    };

    expect(findRangeBandScaleIssues(wrong).map((error) => error.code))
      .toContain("spatial.bands.unbounded-not-last");
  });

  it("rejects empty scales, empty spans and duplicate ids", () => {
    expect(findRangeBandScaleIssues({ kind: "direct", bands: [] })
      .map((error) => error.code))
      .toContain("spatial.bands.empty");

    expect(findRangeBandScaleIssues({
      kind: "direct",
      bands: [{ id: "a", fromMetresInclusive: 5, toMetresExclusive: 5 }],
    }).map((error) => error.code))
      .toContain("spatial.bands.empty-span");

    expect(findRangeBandScaleIssues({
      kind: "direct",
      bands: [
        { id: "a", fromMetresInclusive: 0, toMetresExclusive: 5 },
        { id: "a", fromMetresInclusive: 5, toMetresExclusive: 10 },
      ],
    }).map((error) => error.code))
      .toContain("spatial.bands.id.duplicate");
  });
});


describe("invalid spatial data", () => {
  it("rejects inverted and non-finite intervals", () => {
    expect(findDistanceIntervalIssues({
      kind: "direct",
      minimumMetres: 10,
      maximumMetres: 5,
    }).map((error) => error.code)).toContain("spatial.interval.inverted");

    expect(findDistanceIntervalIssues({
      kind: "direct",
      minimumMetres: -1,
      maximumMetres: null,
    }).map((error) => error.code)).toContain("spatial.interval.minimum.invalid");
  });

  it("rejects a zero-length direction", () => {
    expect(findDirectionIssues({ x: 0, y: 0, z: 0 }).map((error) => error.code))
      .toEqual(["spatial.direction.zero"]);
  });

  it("normalizes a direction to unit length", () => {
    const result = normalizeDirection({ x: 0, y: 3, z: 4 });

    if (!result.success) throw new Error("unreachable");

    expect(result.payload.y).toBeCloseTo(0.6, 12);
    expect(result.payload.z).toBeCloseTo(0.8, 12);
  });

  it("rejects areas with non-positive extents", () => {
    const bad: readonly SpatialArea[] = [
      { kind: "sphere", centre: at(0), radiusMetres: 0 },
      { kind: "cylinder", centre: at(0), radiusMetres: 2, heightMetres: -1 },
      {
        kind: "box",
        centre: at(0),
        lengthMetres: 1,
        widthMetres: 1,
        heightMetres: Number.NaN,
      },
    ];

    for (const area of bad) {
      expect(findAreaIssues(area).map((error) => error.code))
        .toContain("spatial.area.extent.invalid");
    }
  });

  it("rejects a cone that is a line or a sphere in disguise", () => {
    const cone = (apertureDegrees: number): SpatialArea => ({
      kind: "cone",
      origin: at(0),
      direction: { x: 1, y: 0, z: 0 },
      lengthMetres: 6,
      apertureDegrees,
    });

    expect(findAreaIssues(cone(0)).map((e) => e.code))
      .toContain("spatial.area.aperture.invalid");

    expect(findAreaIssues(cone(360)).map((e) => e.code))
      .toContain("spatial.area.aperture.invalid");

    expect(findAreaIssues(cone(60))).toEqual([]);
  });

  it("rejects invalid travel speeds", () => {
    expect(findTravelIssues({ kind: "speed", metresPerSecond: 0 })
      .map((error) => error.code))
      .toEqual(["spatial.travel.speed.invalid"]);

    expect(findTravelIssues({ kind: "speed", metresPerSecond: -3 }))
      .toHaveLength(1);

    expect(findTravelIssues({ kind: "instantaneous" })).toEqual([]);
  });

  it("rejects malformed host facts and accepts known cover degrees", () => {
    expect(findSpatialFactsIssues({
      cover: { degree: "extremely" as never },
    }).map((error) => error.code)).toContain("spatial.fact.cover.invalid");

    for (const degree of COVER_DEGREES) {
      expect(findSpatialFactsIssues({ cover: { degree } })).toEqual([]);
    }
  });
});


describe("measurements refuse structurally invalid positions", () => {
  /*
   * `{ kind: "metric" }` is metric-SHAPED and has no coordinates. The kind
   * guard used to accept it on the tag alone — lying about the type it
   * narrows to — so measurement went ahead, subtracted undefined from
   * undefined, and carried NaN into the distance and into the trace.
   *
   * NaN in a trace is not JSON: a caller serializing a failure to show a GM
   * gets null where a number should be, or a crash, depending on the
   * serializer. A failure trace has to survive the trip as much as a
   * successful one.
   */
  const COORDINATELESS = { kind: "metric", contextId: SCENE } as never;

  function isJsonSafe(value: unknown): boolean {
    if (typeof value === "number") return Number.isFinite(value);
    if (value === null || typeof value !== "object") return true;

    return Object.values(value as Record<string, unknown>).every(isJsonSafe);
  }

  it("rejects a coordinateless position as metric", () => {
    expect(isMetricPosition(COORDINATELESS)).toBe(false);
    expect(isMetricPosition({ kind: "metric", contextId: SCENE, xMetres: 1 }))
      .toBe(false);
    expect(isMetricPosition(at(0))).toBe(true);
  });

  it("refuses to measure a direct distance from one", () => {
    const result = measureDirectDistance(at(0), COORDINATELESS);

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((error) => error.code))
      .toContain("spatial.position.coordinate.invalid");
  });

  it("refuses to sum a path containing one", () => {
    const result = measurePathLength({
      contextId: SCENE,
      points: [at(0), COORDINATELESS],
    });

    expect(result.success).toBe(false);
  });

  it("leaves no NaN in either failure trace", () => {
    const distance = measureDirectDistance(at(0), COORDINATELESS);
    const path = measurePathLength({
      contextId: SCENE,
      points: [at(0), COORDINATELESS],
    });

    /*
     * Asserted as "every number is finite" rather than by searching the
     * serialized form for "null" — NaN does serialize to null, but so could
     * a legitimately null field somebody adds later, and a test that fails
     * for that reason teaches people to weaken it.
     */
    for (const result of [distance, path]) {
      expect(isJsonSafe(result.trace)).toBe(true);
    }
  });

  it("keeps every hostile failure trace JSON-safe", () => {
    const hostile: readonly unknown[] = [
      null,
      undefined,
      {},
      { kind: "metric" },
      { kind: "metric", contextId: SCENE, xMetres: Number.NaN },
      { kind: "host", contextId: SCENE },
    ];

    for (const value of hostile) {
      const distance = measureDirectDistance(at(0), value as never);
      const path = measurePathLength({
        contextId: SCENE,
        points: [at(0), value],
      } as never);

      expect(isJsonSafe(distance.trace)).toBe(true);
      expect(isJsonSafe(path.trace)).toBe(true);
    }
  });

  it("still measures correctly when everything is well-formed", () => {
    const distance = measureDirectDistance(at(0), at(3, 4));

    if (!distance.success) throw new Error("unreachable");

    expect(distance.payload.metres).toBe(5);
    expect(isJsonSafe(distance.trace)).toBe(true);
  });
});


describe("no structural entry point throws on hostile input", () => {
  /*
   * A sweep rather than a list of cases, because the defect this covers was
   * never one function: a guard was added at the top of a validator, the
   * error was collected, and execution carried on into a dereference two
   * lines later. Each one looked fixed in isolation.
   *
   * Every value here has reached one of these functions from a host, a
   * serialized authorization, or a malformed test fixture at some point in
   * this phase.
   */
  const HOSTILE: readonly unknown[] = [
    null,
    undefined,
    "over there",
    0,
    true,
    [],
    [null],
    {},
    { kind: null },
    { kind: "metric" },
    { kind: "metric", contextId: null },
    { kind: "sphere", centre: null },
    { kind: "cone", origin: null, direction: null },
    { contextId: SCENE, points: null },
    { contextId: SCENE, points: [null] },
    { contextId: SCENE, points: [at(0), null] },
  ];

  it.each([
    ["findPositionIssues", findPositionIssues],
    ["findAreaIssues", findAreaIssues],
    ["findDirectionIssues", findDirectionIssues],
    ["findPathIssues", findPathIssues],
  ] as const)("%s returns issues instead of throwing", (_name, validate) => {
    for (const value of HOSTILE) {
      expect(() => validate(value as never)).not.toThrow();
    }
  });

  it("measurePathLength refuses rather than throwing", () => {
    for (const value of HOSTILE) {
      expect(() => measurePathLength(value as never)).not.toThrow();
      expect(measurePathLength(value as never).success).toBe(false);
    }
  });

  it("measureDirectDistance refuses rather than throwing", () => {
    for (const value of HOSTILE) {
      expect(() => measureDirectDistance(value as never, value as never))
        .not.toThrow();
      expect(measureDirectDistance(value as never, value as never).success)
        .toBe(false);
    }
  });
});


describe("travel duration", () => {
  it("is zero for instantaneous delivery", () => {
    const result = travelDuration({ kind: "instantaneous" }, directDistance(40));

    if (!result.success) throw new Error("unreachable");

    expect(result.payload).toBe(0);
  });

  it("converts distance and speed into game time", () => {
    const result = travelDuration(
      { kind: "speed", metresPerSecond: 20 },
      directDistance(50),
    );

    if (!result.success) throw new Error("unreachable");

    expect(result.payload).toBe(2.5 * GAME_MILLISECONDS_PER_SECOND);
  });

  it("fails rather than dividing by an invalid speed", () => {
    const result = travelDuration(
      { kind: "speed", metresPerSecond: 0 },
      directDistance(50),
    );

    expect(result.success).toBe(false);
  });
});


describe("a host-supplied separation is checked even when computable", () => {
  it("refuses a path length offered as the separation between two coordinates", () => {
    /*
     * The host's measurement wins over the engine's own arithmetic, because
     * the host is the one that knows about the corridor. That makes an
     * unvalidated supplied value more dangerous here, not less: it would be
     * adopted as a straight line in the one case the engine could have
     * checked.
     */
    const result = measureDirectDistance(at(0), at(3, 4), {
      separation: pathDistance(9),
    });

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors[0].code).toBe("spatial.distance.kind.mismatch");
  });

  it("refuses a non-finite supplied separation", () => {
    const result = measureDirectDistance(at(0), at(3, 4), {
      separation: directDistance(Number.POSITIVE_INFINITY),
    });

    expect(result.success).toBe(false);
  });

  it("prefers the host's measurement over its own coordinates", () => {
    const result = measureDirectDistance(at(0), at(3, 4), {
      separation: directDistance(11),
    });

    if (!result.success) throw new Error("unreachable");

    expect(result.payload).toEqual(directDistance(11));
  });
});
