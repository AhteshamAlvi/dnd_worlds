/*
 * The stored awakening state: what it can say, and what it refuses to be.
 *
 * The boolean this replaced could express one of seven facts. These tests
 * mostly exist to prove the other six now have somewhere to live, and that a
 * state which contradicts itself is refused rather than repaired — a validator
 * that silently patches a save file is a validator whose owner never finds out
 * their save file is wrong.
 */

import { describe, expect, it } from "vitest";

import {
  abilityFunctionsDespiteForcedStates,
  abilityFunctionsThroughForcedState,
  collapseRecoveryHoursRemaining,
  createUnawakenedAwakeningState,
  currentAwakeningRecord,
  hasEverAwakened,
  hasPseudoChu,
  isAwakened,
  isCollapseRecoveryComplete,
  isInForcedZetsu,
  isProvenanceLinkedNaturalAbility,
  isReverted,
  wouldBeReawakening,
} from "../character/foundation/nen/awakening/state";
import {
  findAwakeningStateDomainIssues,
  findAwakeningStateIssues,
  findAwakeningStateStructuralIssues,
} from "../character/foundation/nen/awakening/validation";
import {
  awakeningStateFromJson,
  awakeningStateToJson,
} from "../character/foundation/nen/awakening/serialization";
import type {
  NenAwakeningRecord,
  NenAwakeningState,
  NenForcedState,
} from "../character/foundation/nen/awakening/types";
import { createUnawakenedNenState } from "../character/foundation/nen/nen";

import { abruptAwakenedNen, revertedNen, standardAwakenedNen } from "./fixtures/nen";

function codes(issues: readonly { code: string }[]): readonly string[] {
  return issues.map((issue) => issue.code);
}

const SOURCE = { type: "test", id: "a-source" } as const;

const AWAKENING: NenAwakeningRecord = {
  kind: "awakening",
  id: "awk-1",
  method: "standard",
  occurredAt: 100,
  source: null,
  reawakening: false,
  eligibilityBypassed: false,
  appliedOverrides: [],
};

/** An awakened state assembled by hand, for the validator to judge. */
function awakenedState(
  overrides: Partial<NenAwakeningState> = {},
): NenAwakeningState {
  return {
    ...createUnawakenedAwakeningState(),
    condition: "awakened",
    nodes: "open",
    currentMethod: "standard",
    currentAwakeningId: AWAKENING.id,
    history: [AWAKENING],
    ...overrides,
  };
}


describe("the seven facts a boolean could not carry", () => {
  it("separates never awakened from reverted", () => {
    const fresh = createUnawakenedNenState().awakening;
    const reverted = revertedNen().awakening;

    expect(isAwakened(fresh)).toBe(false);
    expect(isAwakened(reverted)).toBe(false);

    expect(hasEverAwakened(fresh)).toBe(false);
    expect(hasEverAwakened(reverted)).toBe(true);

    expect(isReverted(reverted)).toBe(true);
    expect(isReverted(fresh)).toBe(false);
  });

  /*
   * Awakening ends pseudo-Chu PERMANENTLY. It does not come back during a
   * Zetsu, after a collapse, or on reversion — which is the entire reason
   * `reverted` is a third condition rather than a return to `unawakened`.
   */
  it("never gives pseudo-Chu back once it has ended", () => {
    expect(hasPseudoChu(createUnawakenedNenState().awakening)).toBe(true);
    expect(hasPseudoChu(standardAwakenedNen().awakening)).toBe(false);
    expect(hasPseudoChu(abruptAwakenedNen().awakening)).toBe(false);
    expect(hasPseudoChu(revertedNen().awakening)).toBe(false);
  });

  it("tracks node state alongside the condition", () => {
    expect(standardAwakenedNen().awakening.nodes).toBe("open");
    expect(revertedNen().awakening.nodes).toBe("half-open");
    expect(createUnawakenedNenState().awakening.nodes).toBe("half-open");
  });

  it("records which awakening the character is currently in", () => {
    const awakened = standardAwakenedNen().awakening;

    expect(awakened.currentMethod).toBe("standard");
    expect(currentAwakeningRecord(awakened)?.method).toBe("standard");
    expect(currentAwakeningRecord(revertedNen().awakening)).toBeNull();
  });

  it("knows whether the NEXT awakening would be a reawakening", () => {
    expect(wouldBeReawakening(createUnawakenedNenState().awakening)).toBe(false);
    expect(wouldBeReawakening(revertedNen().awakening)).toBe(true);
  });

  it("tracks Nen Type separately from awakening", () => {
    const awakened = standardAwakenedNen().awakening;

    /* Awakening assigns no affinity and discovers none. */
    expect(awakened.nenType).toEqual({ type: null, known: false });
  });
});


describe("forced states are not Zetsu mastery", () => {
  const forced: NenForcedState = {
    id: "fz-1",
    kind: "forced-zetsu",
    origin: "instinctive-awakening",
    appliedAt: 100,
    source: SOURCE,
    exemptions: [{
      abilityId: "ability-a",
      forcedStateId: "fz-1",
      origin: "instinctive-awakening",
    }],
  };

  const held = awakenedState({
    forcedStates: [forced],
    naturalAbility: {
      abilityId: "ability-a",
      grantedAt: 100,
      grantedByAwakeningId: AWAKENING.id,
      origin: "instinctive",
    },
  });

  it("holds a character without granting them anything", () => {
    expect(isInForcedZetsu(held)).toBe(true);
    expect(findAwakeningStateIssues(held)).toEqual([]);
  });

  it("lets the exempt Ability through", () => {
    expect(abilityFunctionsThroughForcedState(forced, "ability-a")).toBe(true);
    expect(abilityFunctionsDespiteForcedStates(held, "ability-a")).toBe(true);
  });

  it("lets nothing else through", () => {
    expect(abilityFunctionsThroughForcedState(forced, "ability-b")).toBe(false);
    expect(abilityFunctionsDespiteForcedStates(held, "ability-b")).toBe(false);
  });

  /*
   * The global-exception hole, closed. An exemption naming a different forced
   * state would travel: the same Ability would work through a collapse Zetsu
   * it was never granted an exception for.
   */
  it("refuses an exemption attached to a different forced state", () => {
    const misattached = awakenedState({
      forcedStates: [{
        ...forced,
        exemptions: [{
          abilityId: "ability-a",
          forcedStateId: "some-other-state",
          origin: "instinctive-awakening",
        }],
      }],
      naturalAbility: held.naturalAbility,
    });

    expect(codes(findAwakeningStateDomainIssues(misattached)))
      .toContain("nen.awakening.forced-state.exemption.misattached");
  });

  it("refuses an exemption granted against a different origin", () => {
    const wrongOrigin = awakenedState({
      forcedStates: [{
        ...forced,
        exemptions: [{
          abilityId: "ability-a",
          forcedStateId: "fz-1",
          origin: "uncontained-collapse",
        }],
      }],
      naturalAbility: held.naturalAbility,
    });

    expect(codes(findAwakeningStateDomainIssues(wrongOrigin)))
      .toContain("nen.awakening.forced-state.exemption.origin.mismatch");
  });

  /*
   * An exemption for an Ability nobody holds is dead data at best, and a free
   * pass nobody authorised the moment such an Ability is granted from anywhere.
   */
  it("refuses an exemption for an Ability the character does not have", () => {
    const orphan = awakenedState({ forcedStates: [forced] });

    expect(codes(findAwakeningStateDomainIssues(orphan)))
      .toContain("nen.awakening.forced-state.exemption.unknown-ability");
  });

  it("refuses a forced state on an unawakened character", () => {
    const impossible: NenAwakeningState = {
      ...createUnawakenedAwakeningState(),
      forcedStates: [{ ...forced, exemptions: [] }],
    };

    expect(codes(findAwakeningStateDomainIssues(impossible)))
      .toContain("nen.awakening.forced-state.before-awakening");
  });
});


describe("structural validation", () => {
  it("accepts what the transitions produce", () => {
    for (const nen of [
      createUnawakenedNenState(),
      standardAwakenedNen(),
      abruptAwakenedNen(),
      revertedNen(),
    ]) {
      expect(findAwakeningStateIssues(nen.awakening)).toEqual([]);
    }
  });

  const malformed: readonly (readonly [string, unknown, string])[] = [
    ["a condition outside the vocabulary", { condition: "asleep" }, "nen.awakening.condition.invalid"],
    ["a node state outside the vocabulary", { nodes: "ajar" }, "nen.awakening.nodes.invalid"],
    ["a method outside the vocabulary", { currentMethod: "wished" }, "nen.awakening.current-method.invalid"],
    ["a non-array history", { history: "none" }, "nen.awakening.history.invalid"],
    ["a non-array forced-state list", { forcedStates: 3 }, "nen.awakening.forced-states.invalid"],
    ["a missing Nen Type reading", { nenType: null }, "nen.awakening.nen-type.invalid"],
  ];

  it.each(malformed)("refuses %s without throwing", (_label, patch, code) => {
    const state = {
      ...createUnawakenedAwakeningState(),
      ...(patch as object),
    } as NenAwakeningState;

    expect(() => findAwakeningStateStructuralIssues(state)).not.toThrow();
    expect(codes(findAwakeningStateStructuralIssues(state))).toContain(code);
  });

  it("refuses a history entry with no id, and a duplicated one", () => {
    const noId = awakenedState({
      history: [{ ...AWAKENING, id: "" }],
      currentAwakeningId: "",
    });

    expect(codes(findAwakeningStateStructuralIssues(noId)))
      .toContain("nen.awakening.history.id.invalid");

    const duplicated = awakenedState({
      history: [AWAKENING, { ...AWAKENING, occurredAt: 200 }],
    });

    expect(codes(findAwakeningStateStructuralIssues(duplicated)))
      .toContain("nen.awakening.history.id.duplicate");
  });

  it("refuses a non-finite timestamp", () => {
    const broken = awakenedState({
      history: [{ ...AWAKENING, occurredAt: Number.NaN }],
    });

    expect(codes(findAwakeningStateStructuralIssues(broken)))
      .toContain("nen.awakening.history.timestamp.invalid");
  });

  it("refuses a reversion with no source", () => {
    const broken = awakenedState({
      history: [
        AWAKENING,
        {
          kind: "reversion",
          id: "rev-1",
          occurredAt: 200,
          source: undefined as never,
          removedNaturalAbilityId: null,
        },
      ],
    });

    expect(codes(findAwakeningStateStructuralIssues(broken)))
      .toContain("nen.awakening.history.reversion.source.invalid");
  });

  it("refuses a malformed collapse recovery", () => {
    const broken = awakenedState({
      collapseRecovery: {
        id: "rec-1",
        beganAt: 0,
        requiredSleepHours: 0,
        accumulatedSleepHours: -1,
        completedAt: null,
      },
    });

    expect(codes(findAwakeningStateStructuralIssues(broken))).toEqual(
      expect.arrayContaining([
        "nen.awakening.collapse-recovery.required-hours.invalid",
        "nen.awakening.collapse-recovery.accumulated-hours.invalid",
      ]),
    );
  });
});


describe("domain validation", () => {
  it("insists the nodes follow the condition", () => {
    expect(codes(findAwakeningStateDomainIssues(
      awakenedState({ nodes: "half-open" }),
    ))).toContain("nen.awakening.nodes.mismatch");

    expect(codes(findAwakeningStateDomainIssues({
      ...createUnawakenedAwakeningState(),
      nodes: "open",
    }))).toContain("nen.awakening.nodes.mismatch");
  });

  it("insists an awakened character is inside a recorded awakening", () => {
    expect(codes(findAwakeningStateDomainIssues(
      awakenedState({ currentAwakeningId: null, currentMethod: null }),
    ))).toContain("nen.awakening.current.missing");

    expect(codes(findAwakeningStateDomainIssues(
      awakenedState({ currentAwakeningId: "not-in-history" }),
    ))).toContain("nen.awakening.current.unrecorded");
  });

  it("insists a reverted character has something to have reverted from", () => {
    const impossible: NenAwakeningState = {
      ...createUnawakenedAwakeningState(),
      condition: "reverted",
    };

    expect(codes(findAwakeningStateDomainIssues(impossible)))
      .toContain("nen.awakening.reverted.without-history");
  });

  it("insists a character with a history is reverted rather than unawakened", () => {
    const impossible: NenAwakeningState = {
      ...createUnawakenedAwakeningState(),
      history: [AWAKENING],
    };

    expect(codes(findAwakeningStateDomainIssues(impossible)))
      .toContain("nen.awakening.unawakened.with-history");
  });

  /*
   * A natural Ability IS its provenance. One naming an awakening that is not
   * in the history is an external Ability with a misleading field — and
   * reversion would delete it on the strength of that field.
   */
  it("insists a natural Ability names an awakening in the history", () => {
    const orphan = awakenedState({
      naturalAbility: {
        abilityId: "ability-a",
        grantedAt: 100,
        grantedByAwakeningId: "no-such-awakening",
        origin: "standard",
      },
    });

    expect(codes(findAwakeningStateDomainIssues(orphan)))
      .toContain("nen.awakening.natural-ability.unrecorded");
  });

  it("refuses an Ability recorded as both natural and external", () => {
    const both = awakenedState({
      naturalAbility: {
        abilityId: "ability-a",
        grantedAt: 100,
        grantedByAwakeningId: AWAKENING.id,
        origin: "standard",
      },
      externalAbilities: [{
        abilityId: "ability-a",
        source: SOURCE,
        grantedAt: 50,
      }],
    });

    expect(codes(findAwakeningStateDomainIssues(both)))
      .toContain("nen.awakening.ability.duplicate");
  });

  it("refuses a known Nen Type with no type", () => {
    expect(codes(findAwakeningStateDomainIssues(
      awakenedState({ nenType: { type: null, known: true } }),
    ))).toContain("nen.awakening.nen-type.known-without-value");
  });

  it("distinguishes a provenance-linked Ability from one that merely resembles it", () => {
    const natural = awakenedState({
      naturalAbility: {
        abilityId: "ability-a",
        grantedAt: 100,
        grantedByAwakeningId: AWAKENING.id,
        origin: "standard",
      },
    });

    expect(isProvenanceLinkedNaturalAbility(natural, "ability-a")).toBe(true);
    expect(isProvenanceLinkedNaturalAbility(natural, "ability-b")).toBe(false);

    const taught = awakenedState({
      externalAbilities: [{ abilityId: "ability-a", source: SOURCE, grantedAt: 50 }],
    });

    expect(isProvenanceLinkedNaturalAbility(taught, "ability-a")).toBe(false);
  });
});


describe("serialization", () => {
  it("round-trips every state the transitions produce", () => {
    for (const nen of [
      createUnawakenedNenState(),
      standardAwakenedNen(),
      abruptAwakenedNen(),
      revertedNen(),
    ]) {
      const written = awakeningStateToJson(nen.awakening);
      const read = awakeningStateFromJson(written);

      expect(read.success).toBe(true);
      if (!read.success) continue;

      expect(read.payload).toEqual(nen.awakening);
    }
  });

  /*
   * Persisted state is hostile input whatever wrote it. A file claiming a
   * shape the rules cannot produce has to be refused before a single field is
   * read, not repaired into something plausible.
   */
  it("refuses a structurally valid but impossible state", () => {
    const impossible = {
      ...createUnawakenedAwakeningState(),
      history: [AWAKENING],
    };

    const read = awakeningStateFromJson(impossible as never);

    expect(read.success).toBe(false);
    if (read.success) return;

    expect(codes(read.errors))
      .toContain("nen.awakening.unawakened.with-history");
  });

  it("refuses garbage without throwing", () => {
    for (const value of [null, 3, "state", [], { condition: "awakened" }]) {
      expect(() => awakeningStateFromJson(value as never)).not.toThrow();
      expect(awakeningStateFromJson(value as never).success).toBe(false);
    }
  });

  it("carries the trace through both branches", () => {
    expect(awakeningStateFromJson(
      awakeningStateToJson(createUnawakenedAwakeningState()),
    ).trace.root.id).toBe("nen.awakening.state.deserialize");

    expect(awakeningStateFromJson(null as never).trace.root.id)
      .toBe("nen.awakening.state.deserialize");
  });
});


describe("collapse recovery readings", () => {
  it("reports the hours still owed", () => {
    const partway = awakenedState({
      collapseRecovery: {
        id: "rec-1",
        beganAt: 0,
        requiredSleepHours: 8,
        accumulatedSleepHours: 3,
        completedAt: null,
      },
    });

    expect(collapseRecoveryHoursRemaining(partway)).toBe(5);
    expect(isCollapseRecoveryComplete(partway)).toBe(false);
  });

  it("reports nothing owed once complete", () => {
    const done = awakenedState({
      collapseRecovery: {
        id: "rec-1",
        beganAt: 0,
        requiredSleepHours: 8,
        accumulatedSleepHours: 8,
        completedAt: 800,
      },
    });

    expect(collapseRecoveryHoursRemaining(done)).toBe(0);
    expect(isCollapseRecoveryComplete(done)).toBe(true);
  });

  it("owes nothing when there is no recovery", () => {
    expect(collapseRecoveryHoursRemaining(createUnawakenedAwakeningState()))
      .toBe(0);
  });
});


describe("the domain pass survives being called on its own", () => {
  /*
   * It is exported, so it is callable without the structural pass in front of
   * it. Every field it reads is one a hostile object can simply omit, and a
   * validator that throws on bad input is a validator that cannot be used at
   * the boundary it exists for.
   */
  it("returns diagnostics rather than throwing for any garbage", () => {
    const garbage: readonly unknown[] = [
      null,
      undefined,
      3,
      "state",
      [],
      {},
      { condition: "awakened" },
      { condition: "awakened", nodes: "open", history: [] },
      { ...createUnawakenedAwakeningState(), naturalAbility: undefined },
      { ...createUnawakenedAwakeningState(), collapseRecovery: undefined },
      { ...createUnawakenedAwakeningState(), forcedStates: [null] },
      { ...createUnawakenedAwakeningState(), history: [null] },
      { ...createUnawakenedAwakeningState(), externalAbilities: [7] },
    ];

    for (const value of garbage) {
      expect(() => findAwakeningStateDomainIssues(value as never)).not.toThrow();
      expect(() => findAwakeningStateIssues(value as never)).not.toThrow();
      expect(findAwakeningStateIssues(value as never).length)
        .toBeGreaterThan(0);
    }
  });
});
