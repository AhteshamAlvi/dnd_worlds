/*
 * The host boundary: environment bands, candidate queries and range.
 *
 * The distinction this suite exists to protect is that "too far", "behind a
 * wall" and "nobody measured" are three different answers. A system with one
 * `inRange: boolean` collapses them, and every consumer downstream then has to
 * guess which of the three it was looking at.
 */

import { describe, expect, it } from "vitest";

import {
  AMBIENT_NOISE_BANDS,
  CANDIDATE_RELATIONSHIPS,
  findActionEnvironmentIssues,
  findCandidateQueryResultIssues,
  findCandidateQuerySpecIssues,
  findRangeProjectionIssues,
  ILLUMINATION_BANDS,
  isAmbientNoiseBand,
  isIlluminationBand,
  isPrecipitationBand,
  isVisibilityBand,
  isWindBand,
  isWindRelationship,
  PRECIPITATION_BANDS,
  projectPathFeasibility,
  projectRange,
  VISIBILITY_BANDS,
  WIND_BANDS,
  WIND_RELATIONSHIPS,
  type ActionEnvironmentSnapshot,
  type CandidateQueryResult,
  type CandidateQuerySpec,
} from "../gameplay/composition";

import { at, CONTEXT } from "./fixtures/composition";


const codes = (errors: readonly { code: string }[]): readonly string[] =>
  errors.map((error) => error.code);


describe("the environment vocabulary is exactly the accepted bands", () => {
  it("names them, in order, and validates each one", () => {
    expect([...ILLUMINATION_BANDS])
      .toEqual(["absent", "dim", "normal", "bright", "overwhelming"]);
    expect([...AMBIENT_NOISE_BANDS])
      .toEqual(["silent", "quiet", "ordinary", "loud", "overwhelming"]);
    expect([...VISIBILITY_BANDS])
      .toEqual(["clear", "obscured", "heavily-obscured", "blocked"]);
    expect([...PRECIPITATION_BANDS]).toEqual(["none", "light", "heavy", "extreme"]);
    expect([...WIND_BANDS]).toEqual(["calm", "light", "strong", "extreme"]);
    expect([...WIND_RELATIONSHIPS])
      .toEqual(["irrelevant", "headwind", "tailwind", "crosswind"]);
  });

  it("accepts every declared band and refuses anything else", () => {
    for (const band of ILLUMINATION_BANDS) {
      expect(isIlluminationBand(band)).toBe(true);
      expect(findActionEnvironmentIssues({ illumination: band })).toEqual([]);
    }

    for (const band of AMBIENT_NOISE_BANDS) expect(isAmbientNoiseBand(band)).toBe(true);
    for (const band of VISIBILITY_BANDS) expect(isVisibilityBand(band)).toBe(true);
    for (const band of PRECIPITATION_BANDS) expect(isPrecipitationBand(band)).toBe(true);
    for (const band of WIND_BANDS) expect(isWindBand(band)).toBe(true);
    for (const band of WIND_RELATIONSHIPS) expect(isWindRelationship(band)).toBe(true);

    expect(
      codes(findActionEnvironmentIssues({ illumination: "pitch-black" } as never)),
    ).toEqual(["composition.environment.illumination.invalid"]);
  });

  it("round-trips a fully populated snapshot through JSON", () => {
    const environment: ActionEnvironmentSnapshot = {
      illumination: "dim",
      ambientNoise: "loud",
      visibility: "obscured",
      precipitation: "heavy",
      wind: "strong",
      windRelationship: "headwind",
      interference: "a ward hums here",
    };

    const revived = JSON.parse(JSON.stringify(environment)) as ActionEnvironmentSnapshot;

    expect(revived).toEqual(environment);
    expect(findActionEnvironmentIssues(revived)).toEqual([]);
  });

  it("keeps absent distinct from dim, and blocked distinct from heavily obscured", () => {
    /*
     * Not a formatting detail. These pairs sit next to each other on their
     * scales and mean categorically different things: one attenuates by
     * degrees and the other stops the channel, and a scale that merged them
     * would turn every wall into thick fog.
     */
    expect(ILLUMINATION_BANDS.indexOf("absent"))
      .not.toBe(ILLUMINATION_BANDS.indexOf("dim"));
    expect(VISIBILITY_BANDS.indexOf("blocked"))
      .not.toBe(VISIBILITY_BANDS.indexOf("heavily-obscured"));
  });

  it("treats an unreported band as unreported, not as the neutral one", () => {
    expect(findActionEnvironmentIssues({})).toEqual([]);
    expect(({} as ActionEnvironmentSnapshot).illumination).toBeUndefined();
  });
});


describe("a candidate query asks the host only what the host can see", () => {
  const spec: CandidateQuerySpec = {
    queryId: "q-1",
    contextId: CONTEXT,
    origin: at(0),
    maximumDistanceM: 40,
    requiredRelationships: ["line-of-effect"],
    contextRevision: "rev-1",
  };

  it("offers only objective relationships", () => {
    expect([...CANDIDATE_RELATIONSHIPS])
      .toEqual(["line-of-effect", "unobstructed", "in-contact", "shares-region"]);
  });

  it("accepts a well-formed query", () => {
    expect(findCandidateQuerySpecIssues(spec)).toEqual([]);
  });

  it("refuses a distance that is negative, infinite or not a number", () => {
    for (const distance of [-1, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(codes(findCandidateQuerySpecIssues({ ...spec, maximumDistanceM: distance })))
        .toContain("composition.candidates.distance.invalid");
    }

    expect(findCandidateQuerySpecIssues({ ...spec, maximumDistanceM: 0 })).toEqual([]);
  });

  it("refuses a relationship the host could not objectively answer", () => {
    expect(
      codes(findCandidateQuerySpecIssues({
        ...spec,
        requiredRelationships: ["would-notice" as never],
      })),
    ).toContain("composition.candidates.relationship.unknown");
  });

  it("binds the answer to the question and to the version of the space", () => {
    const answer: CandidateQueryResult = {
      queryId: "q-1",
      contextRevision: "rev-1",
      candidates: [{ id: "watcher", position: at(20) }],
    };

    expect(findCandidateQueryResultIssues(answer, spec)).toEqual([]);

    expect(codes(findCandidateQueryResultIssues({ ...answer, queryId: "q-2" }, spec)))
      .toContain("composition.candidates.query-id.mismatch");

    expect(
      codes(findCandidateQueryResultIssues({ ...answer, contextRevision: "rev-2" }, spec)),
    ).toContain("composition.candidates.context-revision.mismatch");
  });

  it("refuses one candidate returned twice", () => {
    expect(
      codes(findCandidateQueryResultIssues({
        queryId: "q-1",
        contextRevision: "rev-1",
        candidates: [{ id: "watcher" }, { id: "watcher" }],
      }, spec)),
    ).toContain("composition.candidates.id.duplicate");
  });

  it("refuses a host that decided Detection on the engine's behalf", () => {
    for (const field of ["detected", "perceived", "visible", "concealed"]) {
      expect(
        codes(findCandidateQueryResultIssues({
          queryId: "q-1",
          contextRevision: "rev-1",
          candidates: [{ id: "watcher", [field]: true } as never],
        }, spec)),
      ).toContain("composition.candidates.decided-outcome");
    }
  });

  it("accepts spatial facts on a candidate, which are not outcomes", () => {
    expect(findCandidateQueryResultIssues({
      queryId: "q-1",
      contextRevision: "rev-1",
      candidates: [{
        id: "watcher",
        position: at(20),
        facts: {
          separation: { kind: "direct", metres: 20 },
          lineOfEffect: { clear: false, blockedBy: "a stone wall" },
          cover: { degree: "heavy" },
        },
      }],
    }, spec)).toEqual([]);
  });

  it("treats no candidates as no receivers, not as an error", () => {
    expect(findCandidateQueryResultIssues({
      queryId: "q-1",
      contextRevision: "rev-1",
      candidates: [],
    }, spec)).toEqual([]);
  });
});


describe("range answers four questions and never merges them", () => {
  const capability = { kind: "direct" as const, minimumMetres: 0, maximumMetres: 60 };
  const measured = { kind: "direct" as const, metres: 40 };

  it("refuses a malformed measurement or capability before comparing", () => {
    expect(
      findRangeProjectionIssues({
        measured: { kind: "direct", metres: Number.NaN },
        capability,
      }).length,
    ).toBeGreaterThan(0);

    expect(
      findRangeProjectionIssues({
        measured,
        capability: { kind: "direct", minimumMetres: 10, maximumMetres: 5 },
      }).length,
    ).toBeGreaterThan(0);
  });

  it("is deliverable when it is close enough and the way is clear", () => {
    const projection = projectRange({
      measured,
      capability,
      facts: { lineOfEffect: { clear: true } },
    });

    expect(projection.withinCapability).toBe(true);
    expect(projection.path).toEqual({ kind: "clear" });
    expect(projection.deliverable).toBe(true);
  });

  it("distinguishes out of range from behind a wall", () => {
    const tooFar = projectRange({
      measured: { kind: "direct", metres: 90 },
      capability,
      facts: { lineOfEffect: { clear: true } },
    });

    const walled = projectRange({
      measured,
      capability,
      facts: { lineOfEffect: { clear: false, blockedBy: "a stone wall" } },
    });

    expect(tooFar.withinCapability).toBe(false);
    expect(tooFar.path).toEqual({ kind: "clear" });

    expect(walled.withinCapability).toBe(true);
    expect(walled.path).toEqual({ kind: "blocked", blockedBy: "a stone wall" });

    /* Both undeliverable, and for demonstrably different reasons. */
    expect(tooFar.deliverable).toBe(false);
    expect(walled.deliverable).toBe(false);
    expect(tooFar.path.kind).not.toBe(walled.path.kind);
  });

  it("keeps 'nobody measured the walls' distinct from 'the walls are clear'", () => {
    expect(projectPathFeasibility(undefined)).toEqual({ kind: "unknown" });
    expect(projectPathFeasibility({})).toEqual({ kind: "unknown" });
    expect(projectPathFeasibility({ lineOfEffect: { clear: true } }))
      .toEqual({ kind: "clear" });

    /* Unknown does not block: not knowing is not knowing it is blocked. */
    expect(projectRange({ measured, capability }).deliverable).toBe(true);
  });

  it("reports obstruction separately from a blocked line of effect", () => {
    expect(
      projectPathFeasibility({
        lineOfEffect: { clear: true },
        obstruction: { obstructed: true, describedAs: "dense briar" },
      }),
    ).toEqual({ kind: "obstructed", describedAs: "dense briar" });
  });

  it("refuses to compare a walked path against a straight-line Range", () => {
    const projection = projectRange({
      measured: { kind: "path", metres: 40 },
      capability,
    });

    expect(projection.comparison.outcome).toBe("incomparable");
    expect(projection.deliverable).toBe(false);
  });

  it("traces the capability and the route as separate steps", () => {
    const projection = projectRange({
      measured,
      capability,
      facts: { lineOfEffect: { clear: true } },
    });

    expect(projection.trace.children.map((child) => child.id)).toEqual([
      "composition.range.capability",
      "composition.range.path",
    ]);
  });
});
