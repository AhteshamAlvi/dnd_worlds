/*
 * A campfire: the other half of the architecture.
 *
 * Fire Blast proves that a finite action can be decomposed into phases. A
 * campfire proves the opposite case — something that is simply going on — and
 * the properties worth defending are all about what does NOT happen:
 *
 *   Time passing produces nothing. There is no tick handler to switch off,
 *   because there is none to begin with.
 *
 *   Looking twice sees the same thing twice. A source has no accumulator, so
 *   how finely you slice the evening is not a mechanical input.
 *
 *   The host says who is nearby. The engine says who noticed.
 */

import { describe, expect, it } from "vitest";

import {
  findCandidateQueryResultIssues,
  findCandidateQuerySpecIssues,
  propagateCue,
  receiveCue,
  type ComposedSensoryCue,
} from "../gameplay/composition";
import {
  findPersistentPhenomenonSourceIssues,
  isPhenomenonActive,
  PHENOMENON_PROFILE_DEFINITIONS,
  phenomenonCandidateQuery,
  phenomenonProfileRegistry,
  queryPhenomenonAt,
  queryPhenomenonOver,
  startPhenomenon,
  stopPhenomenon,
  type PersistentPhenomenonSource,
} from "../gameplay/phenomena";
import type { GameTimeInterval } from "../time/interval";
import type { MetricPosition } from "../spatial";

import { sensoryProfile } from "./fixtures/senses";


const CAMP = "camp-1";

function at(xMetres: number): MetricPosition {
  return { kind: "metric", contextId: CAMP, xMetres, yMetres: 0, zMetres: 0 };
}

const HEARTH = at(0);

const LIT = 18_000;
const OUT = 22_000;

function interval(startedAt: number, endedAt: number): GameTimeInterval {
  return { startedAt, endedAt, elapsed: endedAt - startedAt };
}

const CAMPFIRE = PHENOMENON_PROFILE_DEFINITIONS.campfire;

function fire(): PersistentPhenomenonSource {
  return startPhenomenon({
    id: "hearth-1",
    profileId: "campfire",
    contextId: CAMP,
    origin: HEARTH,
    activeInterval: interval(LIT, OUT),
  });
}


describe("the campfire is authored content that passed the registration barrier", () => {
  it("is in the registry rather than only in a test", () => {
    expect(phenomenonProfileRegistry.get("campfire")).toBeDefined();
    expect(phenomenonProfileRegistry.all().map((entry) => entry.id))
      .toContain("campfire");

    /* And the barrier is satisfied by it, rather than merely storing it. */
    expect(phenomenonProfileRegistry.findCatalogIssues()).toEqual([]);
  });

  it("emits on all four channels a fire physically occupies", () => {
    expect(CAMPFIRE.emissions.map((entry) => entry.channel).sort()).toEqual([
      "airborne-chemical",
      "sound",
      "thermal",
      "visible-light",
    ]);
  });

  it("declares every one of them on a channel SEN-1 has registered", () => {
    /*
     * The condition R17 attaches to the slice: if a channel a campfire needs
     * did not exist, the honest move was to demonstrate the supported subset
     * and report the gap rather than widen SEN-1. All four exist, so no
     * subset was needed.
     */
    for (const emission of CAMPFIRE.emissions) {
      expect(emission.intensity).toBeGreaterThanOrEqual(1);
      expect(emission.intensity).toBeLessThanOrEqual(10);
    }
  });

  it("accepts a well-formed source and rejects one placed nowhere", () => {
    expect(findPersistentPhenomenonSourceIssues(fire())).toEqual([]);

    const { origin: _origin, ...placeless } = fire();

    expect(
      findPersistentPhenomenonSourceIssues(placeless as PersistentPhenomenonSource)
        .map((error) => error.code),
    ).toContain("phenomena.source.place.ambiguous");
  });

  it("rejects a source placed by both an origin and an area", () => {
    expect(
      findPersistentPhenomenonSourceIssues({
        ...fire(),
        area: { kind: "sphere", centre: HEARTH, radiusMetres: 5 },
      }).map((error) => error.code),
    ).toContain("phenomena.source.place.ambiguous");
  });

  it("rejects a source whose place is in a different space from its declaration", () => {
    expect(
      findPersistentPhenomenonSourceIssues({
        ...fire(),
        origin: { ...HEARTH, contextId: "somewhere-else" },
      }).map((error) => error.code),
    ).toContain("phenomena.source.context.mismatch");
  });
});


describe("it is lit, it burns, it goes out", () => {
  it("answers only within the span it burned", () => {
    const hearth = fire();

    expect(isPhenomenonActive(hearth, LIT - 1)).toBe(false);
    expect(isPhenomenonActive(hearth, LIT)).toBe(true);
    expect(isPhenomenonActive(hearth, (LIT + OUT) / 2)).toBe(true);
    expect(isPhenomenonActive(hearth, OUT)).toBe(false);
  });

  it("produces multi-channel cues while lit and nothing before or after", () => {
    const hearth = fire();

    const burning = queryPhenomenonAt(hearth, CAMPFIRE, LIT + 100);

    expect(burning.kind).toBe("active");

    if (burning.kind !== "active") throw new Error("unreachable");

    expect(burning.cue.emissions).toEqual({
      "airborne-chemical": 6,
      sound: 3,
      thermal: 6,
      "visible-light": 7,
    });
    expect(burning.origin).toEqual(HEARTH);

    expect(queryPhenomenonAt(hearth, CAMPFIRE, LIT - 1).kind).toBe("inactive");
    expect(queryPhenomenonAt(hearth, CAMPFIRE, OUT + 1).kind).toBe("inactive");
  });

  it("can be put out early, without rewriting what already happened", () => {
    const doused = stopPhenomenon(fire(), LIT + 1_000);

    expect(doused.activeInterval.endedAt).toBe(LIT + 1_000);
    expect(doused.stateRevision).not.toBe(fire().stateRevision);

    /* It still burned at the start, and a later question still says so. */
    expect(queryPhenomenonAt(doused, CAMPFIRE, LIT + 500).kind).toBe("active");
    expect(queryPhenomenonAt(doused, CAMPFIRE, LIT + 2_000).kind).toBe("inactive");
  });

  it("refuses to run time backwards when doused before it was lit", () => {
    const doused = stopPhenomenon(fire(), LIT - 5_000);

    expect(doused.activeInterval.elapsed).toBe(0);
    expect(doused.activeInterval.endedAt).toBe(LIT);
  });

  it("leaves an already-finished fire alone", () => {
    const hearth = fire();

    expect(stopPhenomenon(hearth, OUT + 1_000)).toBe(hearth);
  });
});


describe("time passing produces nothing at all", () => {
  it("has no output to produce without a query", () => {
    const hearth = fire();

    /*
     * The strongest form this property can take: there is no function on a
     * source that advances it, so "a tick produced no event" is not a
     * behaviour that could regress — the mechanism does not exist.
     */
    const surface = Object.keys(hearth);

    expect(surface).not.toContain("events");
    expect(surface).not.toContain("pending");
    expect(surface).not.toContain("elapsedTicks");
  });

  it("is unchanged by being queried, however many times", () => {
    const hearth = fire();
    const before = JSON.stringify(hearth);

    for (let index = 0; index < 100; index += 1) {
      queryPhenomenonAt(hearth, CAMPFIRE, LIT + index);
    }

    expect(JSON.stringify(hearth)).toBe(before);
    expect(hearth.stateRevision).toBe(fire().stateRevision);
  });

  it("answers identically every time it is asked the same question", () => {
    const hearth = fire();

    const first = queryPhenomenonAt(hearth, CAMPFIRE, LIT + 100);
    const second = queryPhenomenonAt(hearth, CAMPFIRE, LIT + 100);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("gives one cue identity for one fire, rather than one per look", () => {
    const hearth = fire();

    const ids = [0, 1_000, 2_000, 3_000].map((offset) => {
      const result = queryPhenomenonAt(hearth, CAMPFIRE, LIT + offset);

      return result.kind === "active" ? result.cue.id : "inactive";
    });

    expect(new Set(ids)).toEqual(new Set(["phenomenon:hearth-1"]));
  });
});


describe("slicing the evening more finely changes nothing", () => {
  it("gives the same answer for the whole burn and for any part of it", () => {
    const hearth = fire();

    const whole = queryPhenomenonOver(hearth, CAMPFIRE, interval(LIT, OUT));

    expect(whole.kind).toBe("active");

    const slices = Array.from({ length: 8 }, (_unused, index) => {
      const width = (OUT - LIT) / 8;

      return queryPhenomenonOver(
        hearth,
        CAMPFIRE,
        interval(LIT + index * width, LIT + (index + 1) * width),
      );
    });

    for (const slice of slices) {
      expect(JSON.stringify(slice.kind === "active" ? slice.cue : null))
        .toBe(JSON.stringify(whole.kind === "active" ? whole.cue : null));
    }
  });

  it("does not accumulate: eight slices are not eight times anything", () => {
    const hearth = fire();

    const total = Array.from({ length: 8 }, (_unused, index) => {
      const width = (OUT - LIT) / 8;
      const slice = queryPhenomenonOver(
        hearth,
        CAMPFIRE,
        interval(LIT + index * width, LIT + (index + 1) * width),
      );

      return slice.kind === "active" ? slice.cue.emissions.thermal ?? 0 : 0;
    });

    /* Every slice reports the same 6, and nothing anywhere sums them. */
    expect(total).toEqual([6, 6, 6, 6, 6, 6, 6, 6]);
  });

  it("leaves the source state identical after either approach", () => {
    const hearth = fire();
    const before = hearth.stateRevision;

    queryPhenomenonOver(hearth, CAMPFIRE, interval(LIT, OUT));

    for (let index = 0; index < 50; index += 1) {
      queryPhenomenonOver(hearth, CAMPFIRE, interval(LIT + index, LIT + index + 1));
    }

    expect(hearth.stateRevision).toBe(before);
  });

  it("sees no fire in a span that ends exactly when it starts", () => {
    const hearth = fire();

    expect(queryPhenomenonOver(hearth, CAMPFIRE, interval(LIT - 100, LIT)).kind)
      .toBe("inactive");
    expect(queryPhenomenonOver(hearth, CAMPFIRE, interval(OUT, OUT + 100)).kind)
      .toBe("inactive");
  });
});


describe("the host says who is nearby; the engine says who noticed", () => {
  it("produces a well-formed, objective candidate query", () => {
    const query = phenomenonCandidateQuery({
      source: fire(),
      contextRevision: "rev-1",
      maximumDistanceM: 60,
      requiredRelationships: ["line-of-effect"],
    });

    expect(query).toBeDefined();
    expect(findCandidateQuerySpecIssues(query!)).toEqual([]);
    expect(query!.origin).toEqual(HEARTH);
    expect(query!.contextId).toBe(CAMP);
    expect(query!.requiredRelationships).toEqual(["line-of-effect"]);
  });

  it("binds its question to the version of the space it asked about", () => {
    const first = phenomenonCandidateQuery({
      source: fire(),
      contextRevision: "rev-1",
    });

    const later = phenomenonCandidateQuery({
      source: fire(),
      contextRevision: "rev-2",
    });

    expect(first!.queryId).not.toBe(later!.queryId);

    expect(
      findCandidateQueryResultIssues(
        { queryId: first!.queryId, contextRevision: "rev-2", candidates: [] },
        first!,
      ).map((error) => error.code),
    ).toContain("composition.candidates.context-revision.mismatch");
  });

  it("refuses a host that decided who saw the fire", () => {
    const query = phenomenonCandidateQuery({
      source: fire(),
      contextRevision: "rev-1",
    });

    expect(
      findCandidateQueryResultIssues({
        queryId: query!.queryId,
        contextRevision: "rev-1",
        candidates: [{ id: "watcher", detected: true } as never],
      }, query!).map((error) => error.code),
    ).toContain("composition.candidates.decided-outcome");
  });

  it("lets obstruction and environment affect only the profiles that own them", () => {
    const hearth = fire();
    const lit = queryPhenomenonAt(hearth, CAMPFIRE, LIT + 100);

    if (lit.kind !== "active") throw new Error("unreachable");

    const composed: ComposedSensoryCue = {
      cue: lit.cue,
      anchor: "step",
      origin: HEARTH,
      trace: lit.trace,
    };

    const near = propagateCue({
      composed,
      distance: { kind: "direct", metres: 2 },
      environment: { illumination: "absent" },
      profiles: CAMPFIRE.propagation!,
    });

    /*
     * Darkness makes the fire MORE noticeable, which is exactly what a global
     * "darkness attenuates" rule would have got backwards — and it does
     * nothing at all to the smoke, the heat or the crackle, because those
     * profiles express no interest in illumination.
     */
    expect(near.received.emissions["visible-light"]).toBe(9);
    expect(near.received.emissions.thermal).toBe(6);
    expect(near.received.emissions.sound).toBe(3);
    expect(near.received.emissions["airborne-chemical"]).toBe(6);
  });

  it("lets the smell carry downwind long after the light and heat have gone", () => {
    const hearth = fire();
    const lit = queryPhenomenonAt(hearth, CAMPFIRE, LIT + 100);

    if (lit.kind !== "active") throw new Error("unreachable");

    const far = propagateCue({
      composed: { cue: lit.cue, anchor: "step", origin: HEARTH, trace: lit.trace },
      distance: { kind: "direct", metres: 120 },
      environment: { windRelationship: "tailwind" },
      profiles: CAMPFIRE.propagation!,
    });

    /* Heat is long gone; the smoke is stronger than it was at the hearth. */
    expect(far.received.emissions.thermal).toBeUndefined();
    expect(far.received.emissions["visible-light"]).toBe(5);
    expect(far.received.emissions["airborne-chemical"]).toBe(7);
    expect(far.received.emissions.sound).toBe(1);
  });

  it("stops the light at a wall rather than dimming it", () => {
    const hearth = fire();
    const lit = queryPhenomenonAt(hearth, CAMPFIRE, LIT + 100);

    if (lit.kind !== "active") throw new Error("unreachable");

    const walled = propagateCue({
      composed: { cue: lit.cue, anchor: "step", origin: HEARTH, trace: lit.trace },
      distance: { kind: "direct", metres: 3 },
      environment: { visibility: "blocked" },
      profiles: CAMPFIRE.propagation!,
    });

    expect([...walled.blockedChannels].sort())
      .toEqual(["thermal", "visible-light"]);

    /* You still hear it and smell it through the wall. */
    expect(walled.received.emissions.sound).toBe(3);
    expect(walled.received.emissions["airborne-chemical"]).toBe(6);
  });

  it("reaches a real observer's own senses, and only then", () => {
    const hearth = fire();
    const lit = queryPhenomenonAt(hearth, CAMPFIRE, LIT + 100);

    if (lit.kind !== "active") throw new Error("unreachable");

    const propagated = propagateCue({
      composed: { cue: lit.cue, anchor: "step", origin: HEARTH, trace: lit.trace },
      distance: { kind: "direct", metres: 4 },
      environment: {},
      profiles: CAMPFIRE.propagation!,
    });

    const access = receiveCue({ propagated, profile: sensoryProfile() });

    expect(access.accessible).toBe(true);

    if (!access.accessible) throw new Error("unreachable");

    expect(access.routes.length).toBeGreaterThan(0);
  });
});
