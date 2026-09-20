/*
 * The shared contracts every projector is built on.
 *
 * Three properties are defended here, and each one is a bug that would
 * otherwise be invisible:
 *
 *   A phase vocabulary that accepted an unknown id would give every
 *   exhaustive switch in the domain a silent "none of the above" branch.
 *
 *   A contribution that could carry a function would be a rule with no
 *   provenance, no trace and no override, executing inside the composer.
 *
 *   A snapshot that did not notice its bound world had changed would settle
 *   an action nobody proposed.
 */

import { describe, expect, it } from "vitest";

import {
  ACTION_PHASES,
  actionPhaseKey,
  canonicalJson,
  digestOf,
  findActionPhaseRefIssues,
  findActionPhaseSequenceIssues,
  findActionStateBindingIssues,
  findExecutableDataIssues,
  findPreparedActionSnapshotIssues,
  findSensoryEmissionAdjustmentIssues,
  findSensoryEmissionContributionIssues,
  findStaleBindings,
  isActionPhase,
  isSettlementStale,
  orderActionPhases,
  type ActionPhaseRef,
  type SensoryEmissionAdjustment,
  type SensoryEmissionContribution,
} from "../gameplay/composition";

import {
  ARROW,
  at,
  currentRevisions,
  LOOSE,
  snapshot,
  step,
} from "./fixtures/composition";


const codes = (errors: readonly { code: string }[]): readonly string[] =>
  errors.map((error) => error.code);


describe("the phase vocabulary is closed and ordered", () => {
  it("names exactly the five semantic phases", () => {
    expect([...ACTION_PHASES]).toEqual([
      "preparation",
      "release",
      "travel",
      "impact",
      "aftermath",
    ]);
  });

  it("accepts every one of them and refuses anything else", () => {
    for (const phase of ACTION_PHASES) {
      expect(isActionPhase(phase)).toBe(true);
      expect(findActionPhaseRefIssues(step(phase))).toEqual([]);
    }

    expect(isActionPhase("detonation")).toBe(false);

    expect(
      codes(findActionPhaseRefIssues({
        ...step("release"),
        phase: "detonation" as ActionPhaseRef["phase"],
      })),
    ).toContain("composition.phase.unknown");
  });

  it("refuses a step with no identity, a fractional order or a broken clock", () => {
    expect(codes(findActionPhaseRefIssues({ ...step("impact"), stepId: "  " })))
      .toContain("composition.phase.step-id.missing");

    expect(codes(findActionPhaseRefIssues({ ...step("impact"), sequence: 1.5 })))
      .toContain("composition.phase.sequence.invalid");

    expect(
      codes(findActionPhaseRefIssues({ ...step("impact"), occursAt: Number.NaN })),
    ).toContain("composition.phase.time.invalid");
  });

  it("lets a phase repeat, but never under a shared identity", () => {
    const volley: readonly ActionPhaseRef[] = [
      { phase: "release", stepId: "release-1", sequence: 0, occursAt: 10 },
      { phase: "release", stepId: "release-2", sequence: 1, occursAt: 11 },
      { phase: "release", stepId: "release-3", sequence: 2, occursAt: 12 },
    ];

    expect(findActionPhaseSequenceIssues(volley)).toEqual([]);
    expect(volley.map(actionPhaseKey)).toEqual([
      "release#release-1",
      "release#release-2",
      "release#release-3",
    ]);

    expect(
      codes(findActionPhaseSequenceIssues([
        volley[0]!,
        { ...volley[1]!, stepId: "release-1" },
      ])),
    ).toContain("composition.phase.step-id.duplicate");

    expect(
      codes(findActionPhaseSequenceIssues([
        volley[0]!,
        { ...volley[1]!, sequence: 0 },
      ])),
    ).toContain("composition.phase.sequence.duplicate");
  });

  it("orders by sequence rather than by clock, so a simultaneous volley still has an order", () => {
    const simultaneous: readonly ActionPhaseRef[] = [
      { phase: "release", stepId: "c", sequence: 2, occursAt: 10 },
      { phase: "release", stepId: "a", sequence: 0, occursAt: 10 },
      { phase: "release", stepId: "b", sequence: 1, occursAt: 10 },
    ];

    expect(orderActionPhases(simultaneous).map((entry) => entry.stepId))
      .toEqual(["a", "b", "c"]);
  });
});


describe("authored composition data is typed, never executable", () => {
  const valid: SensoryEmissionContribution = {
    source: LOOSE,
    appliesTo: { phase: "release" },
    subject: "action",
    phenomenon: "physical",
    channel: "sound",
    intensity: 4,
  };

  it("accepts a well-formed contribution", () => {
    expect(findSensoryEmissionContributionIssues(valid)).toEqual([]);
  });

  it("refuses an unregistered channel and an out-of-scale intensity", () => {
    expect(
      codes(findSensoryEmissionContributionIssues({
        ...valid,
        channel: "vibes" as SensoryEmissionContribution["channel"],
      })),
    ).toContain("composition.contribution.channel.unknown");

    for (const intensity of [0, 11, 2.5, Number.NaN]) {
      expect(
        codes(findSensoryEmissionContributionIssues({
          ...valid,
          intensity: intensity as SensoryEmissionContribution["intensity"],
        })),
      ).toContain("composition.contribution.intensity.invalid");
    }
  });

  it("refuses a callback smuggled into authored data, at any depth", () => {
    expect(
      codes(findSensoryEmissionContributionIssues({
        ...valid,
        note: (() => "loud") as unknown as string,
      })),
    ).toContain("composition.contribution.executable");

    expect(codes(findExecutableDataIssues({ a: { b: [{ c: () => 1 }] } })))
      .toEqual(["composition.contribution.executable"]);
  });

  it("survives a cyclic authored shape rather than blowing the stack", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };

    cyclic.self = cyclic;

    expect(findExecutableDataIssues(cyclic)).toEqual([]);
  });
});


describe("an adjustment without authorization is refused", () => {
  const base: SensoryEmissionAdjustment = {
    source: { type: "effect", id: "ward" },
    appliesTo: { phase: "release" },
    channel: "sound",
    operation: "suppress",
    authorization: { authorizedBy: "gm", reason: "A ward covers the clearing." },
  };

  it("accepts a signed, reasoned adjustment", () => {
    expect(findSensoryEmissionAdjustmentIssues(base)).toEqual([]);
  });

  it("refuses every operation when nobody signed for it", () => {
    for (const operation of ["add", "suppress", "replace"] as const) {
      const unauthorized = {
        ...base,
        operation,
        ...(operation === "suppress" ? {} : { amount: 4 as const }),
        authorization: undefined,
      } as unknown as SensoryEmissionAdjustment;

      expect(codes(findSensoryEmissionAdjustmentIssues(unauthorized)))
        .toContain("composition.adjustment.unauthorized");
    }
  });

  it("refuses an authorization with no reason and one with no author", () => {
    expect(
      codes(findSensoryEmissionAdjustmentIssues({
        ...base,
        authorization: { authorizedBy: "gm", reason: "   " },
      })),
    ).toContain("composition.adjustment.reason.missing");

    expect(
      codes(findSensoryEmissionAdjustmentIssues({
        ...base,
        authorization: { authorizedBy: "", reason: "because" },
      })),
    ).toContain("composition.adjustment.authorized-by.missing");
  });

  it("requires an amount to add or replace, and refuses one on a suppression", () => {
    expect(
      codes(findSensoryEmissionAdjustmentIssues({ ...base, operation: "replace" })),
    ).toContain("composition.adjustment.amount.invalid");

    expect(
      codes(findSensoryEmissionAdjustmentIssues({ ...base, amount: 3 })),
    ).toContain("composition.adjustment.amount.unexpected");
  });
});


describe("a prepared snapshot binds what it was decided against", () => {
  it("accepts a complete snapshot", () => {
    expect(findPreparedActionSnapshotIssues(snapshot())).toEqual([]);
  });

  it("refuses a snapshot missing the facts a decision needs", () => {
    expect(
      codes(findPreparedActionSnapshotIssues({ ...snapshot(), actionId: "" })),
    ).toContain("composition.snapshot.actionId.missing");

    expect(
      codes(findPreparedActionSnapshotIssues({
        ...snapshot(),
        implementation: { implement: { type: "", id: "" } },
      })),
    ).toContain("composition.snapshot.implementation.missing");

    expect(
      codes(findPreparedActionSnapshotIssues({
        ...snapshot(),
        declaredAt: Number.POSITIVE_INFINITY,
      })),
    ).toContain("composition.snapshot.declared-at.invalid");
  });

  it("refuses one owner bound to two revisions", () => {
    expect(
      codes(findActionStateBindingIssues({
        boundAt: 1,
        revisions: [
          { owner: "actor:archer", revision: "a1" },
          { owner: "actor:archer", revision: "a2" },
        ],
      })),
    ).toContain("composition.binding.owner.duplicate");
  });

  it("is not stale against the world it bound", () => {
    const taken = snapshot();

    expect(findStaleBindings(taken, currentRevisions(taken))).toEqual([]);
    expect(isSettlementStale(taken, currentRevisions(taken))).toBe(false);
  });

  it("is stale once a bound fact changes, and says which", () => {
    const taken = snapshot();

    const moved = currentRevisions(
      snapshot({ spatial: { targetPositions: [at(90)] } }),
    );

    const stale = findStaleBindings(taken, moved);

    expect(stale.map((entry) => entry.owner))
      .toEqual(["composition:spatial"]);
    expect(isSettlementStale(taken, moved)).toBe(true);
  });

  it("is stale when the ammunition it bound is gone", () => {
    const taken = snapshot();

    const emptied = currentRevisions(
      snapshot({ implementation: { implement: LOOSE, consumables: [] } }),
    );

    expect(findStaleBindings(taken, emptied).map((entry) => entry.owner))
      .toEqual(["composition:implementation"]);
  });

  it("is stale when a bound owner vanishes entirely", () => {
    const taken = snapshot();

    const gone = currentRevisions(taken)
      .filter((entry) => entry.owner !== "actor:archer");

    expect(findStaleBindings(taken, gone)).toEqual([
      { owner: "actor:archer", bound: "a1", current: "absent" },
    ]);
  });

  it("is NOT stale because unrelated, unbound state moved", () => {
    const taken = snapshot();

    const noisyWorld = [
      ...currentRevisions(taken),
      { owner: "weather:scene-1", revision: "storm" },
      { owner: "actor:somebody-else", revision: "z9" },
    ];

    expect(findStaleBindings(taken, noisyWorld)).toEqual([]);
  });
});


describe("bound facts fingerprint deterministically", () => {
  it("ignores key order, so two code paths bind the same position alike", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(digestOf({ b: 1, a: 2 })).toBe(digestOf({ a: 2, b: 1 }));
  });

  it("respects array order, because in an array the order IS the value", () => {
    expect(digestOf([1, 2])).not.toBe(digestOf([2, 1]));
  });

  it("round-trips a snapshot through JSON with every id and revision intact", () => {
    const taken = snapshot({
      adjustments: [{
        source: { type: "effect", id: "ward" },
        appliesTo: { phase: "release" },
        channel: "sound",
        operation: "replace",
        amount: 2,
        authorization: { authorizedBy: "gm", reason: "muffled" },
      }],
    });

    const revived = JSON.parse(JSON.stringify(taken)) as typeof taken;

    expect(revived).toEqual(taken);
    expect(findPreparedActionSnapshotIssues(revived)).toEqual([]);
    expect(digestOf(revived)).toBe(digestOf(taken));
    expect(findStaleBindings(revived, currentRevisions(taken))).toEqual([]);
  });

  it("keeps a consumable's instance identity across the boundary", () => {
    const taken = snapshot();
    const revived = JSON.parse(JSON.stringify(taken)) as typeof taken;

    expect(revived.implementation.consumables?.[0]).toEqual(ARROW);
  });
});
