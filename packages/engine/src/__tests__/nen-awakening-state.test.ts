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
  abilityFunctionsDespiteSuppression,
  abilityFunctionsThroughSuppression,
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
  NenForcedZetsuState,
} from "../character/foundation/nen/awakening/types";
import { createUnawakenedNenState } from "../character/foundation/nen/nen";

import { abruptAwakenedNen, revertedNen, standardAwakenedNen } from "./fixtures/nen";
import {
  assignedNenType,
  unassignedNenType,
} from "../character/foundation/nen/nen-type";

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
    ...createUnawakenedAwakeningState(unassignedNenType()),
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
    const fresh = createUnawakenedNenState(unassignedNenType()).awakening;
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
    expect(hasPseudoChu(createUnawakenedNenState(unassignedNenType()).awakening)).toBe(true);
    expect(hasPseudoChu(standardAwakenedNen().awakening)).toBe(false);
    expect(hasPseudoChu(abruptAwakenedNen().awakening)).toBe(false);
    expect(hasPseudoChu(revertedNen().awakening)).toBe(false);
  });

  it("tracks node state alongside the condition", () => {
    expect(standardAwakenedNen().awakening.nodes).toBe("open");
    expect(revertedNen().awakening.nodes).toBe("half-open");
    expect(createUnawakenedNenState(unassignedNenType()).awakening.nodes).toBe("half-open");
  });

  it("records which awakening the character is currently in", () => {
    const awakened = standardAwakenedNen().awakening;

    expect(awakened.currentMethod).toBe("standard");
    expect(currentAwakeningRecord(awakened)?.method).toBe("standard");
    expect(currentAwakeningRecord(revertedNen().awakening)).toBeNull();
  });

  it("knows whether the NEXT awakening would be a reawakening", () => {
    expect(wouldBeReawakening(createUnawakenedNenState(unassignedNenType()).awakening)).toBe(false);
    expect(wouldBeReawakening(revertedNen().awakening)).toBe(true);
  });

  it("tracks Nen Type separately from awakening", () => {
    const awakened = standardAwakenedNen().awakening;

    /* Awakening assigns no affinity and discovers none. */
    expect(awakened.nenType).toEqual(unassignedNenType());
  });
});


describe("forced states are not Zetsu mastery", () => {
  const forced: NenForcedZetsuState = {
    id: "fz-1",
    kind: "forced-zetsu",
    appliedAt: 100,
    source: SOURCE,
    release: { rule: "source-authorized", authority: SOURCE },
    exemptions: [{
      abilityId: "ability-a",
      suppressionId: "fz-1",
      source: SOURCE,
    }],
  };

  const held = awakenedState({
    suppression: [forced],
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
    expect(abilityFunctionsThroughSuppression(forced, "ability-a")).toBe(true);
    expect(abilityFunctionsDespiteSuppression(held, "ability-a")).toBe(true);
  });

  it("lets nothing else through", () => {
    expect(abilityFunctionsThroughSuppression(forced, "ability-b")).toBe(false);
    expect(abilityFunctionsDespiteSuppression(held, "ability-b")).toBe(false);
  });

  /*
   * The global-exception hole, closed. An exemption naming a different forced
   * state would travel: the same Ability would work through a collapse Zetsu
   * it was never granted an exception for.
   */
  it("refuses an exemption attached to a different instance", () => {
    const misattached = awakenedState({
      suppression: [{
        ...forced,
        exemptions: [{
          abilityId: "ability-a",
          suppressionId: "some-other-state",
          source: SOURCE,
        }],
      }],
      naturalAbility: held.naturalAbility,
    });

    expect(codes(findAwakeningStateDomainIssues(misattached)))
      .toContain("nen.awakening.suppression.exemption.misattached");
  });

  it("refuses an exemption granted by a different source", () => {
    const wrongSource = awakenedState({
      suppression: [{
        ...forced,
        exemptions: [{
          abilityId: "ability-a",
          suppressionId: "fz-1",
          source: { type: "item", id: "somebody-else" },
        }],
      }],
      naturalAbility: held.naturalAbility,
    });

    expect(codes(findAwakeningStateDomainIssues(wrongSource)))
      .toContain("nen.awakening.suppression.exemption.source.mismatch");
  });

  /*
   * An exemption for an Ability nobody holds is dead data at best, and a free
   * pass nobody authorised the moment such an Ability is granted from anywhere.
   */
  it("refuses an exemption for an Ability the character does not have", () => {
    const orphan = awakenedState({ suppression: [forced] });

    expect(codes(findAwakeningStateDomainIssues(orphan)))
      .toContain("nen.awakening.suppression.exemption.unknown-ability");
  });

  it("refuses suppression on an unawakened character", () => {
    const impossible: NenAwakeningState = {
      ...createUnawakenedAwakeningState(unassignedNenType()),
      suppression: [{ ...forced, exemptions: [] }],
    };

    expect(codes(findAwakeningStateDomainIssues(impossible)))
      .toContain("nen.awakening.suppression.before-awakening");
  });
});


describe("structural validation", () => {
  it("accepts what the transitions produce", () => {
    for (const nen of [
      createUnawakenedNenState(unassignedNenType()),
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
    ["a non-array suppression list", { suppression: 3 }, "nen.awakening.suppression.list.invalid"],
    ["a missing Nen Type reading", { nenType: null }, "nen.awakening.nen-type.invalid"],
  ];

  it.each(malformed)("refuses %s without throwing", (_label, patch, code) => {
    const state = {
      ...createUnawakenedAwakeningState(unassignedNenType()),
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
      ...createUnawakenedAwakeningState(unassignedNenType()),
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
      ...createUnawakenedAwakeningState(unassignedNenType()),
      condition: "reverted",
    };

    expect(codes(findAwakeningStateDomainIssues(impossible)))
      .toContain("nen.awakening.reverted.without-history");
  });

  it("insists a character with a history is reverted rather than unawakened", () => {
    const impossible: NenAwakeningState = {
      ...createUnawakenedAwakeningState(unassignedNenType()),
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

  /*
   * A known type must say WHICH type. The old model spelled the impossible
   * case as `{ type: null, known: true }`; the discriminated one cannot
   * represent it at all, so what is left to check is an assigned reading whose
   * type is missing.
   */
  it("refuses an assigned Nen Type with no type", () => {
    expect(codes(findAwakeningStateDomainIssues(
      awakenedState({ nenType: { status: "assigned", known: true } as never }),
    ))).toContain("nen.awakening.nen-type.value.invalid");
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
      createUnawakenedNenState(unassignedNenType()),
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
      ...createUnawakenedAwakeningState(unassignedNenType()),
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
      awakeningStateToJson(createUnawakenedAwakeningState(unassignedNenType())),
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
    expect(collapseRecoveryHoursRemaining(createUnawakenedAwakeningState(unassignedNenType())))
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
      { ...createUnawakenedAwakeningState(unassignedNenType()), naturalAbility: undefined },
      { ...createUnawakenedAwakeningState(unassignedNenType()), collapseRecovery: undefined },
      { ...createUnawakenedAwakeningState(unassignedNenType()), suppression: [null] },
      { ...createUnawakenedAwakeningState(unassignedNenType()), history: [null] },
      { ...createUnawakenedAwakeningState(unassignedNenType()), externalAbilities: [7] },
    ];

    for (const value of garbage) {
      expect(() => findAwakeningStateDomainIssues(value as never)).not.toThrow();
      expect(() => findAwakeningStateIssues(value as never)).not.toThrow();
      expect(findAwakeningStateIssues(value as never).length)
        .toBeGreaterThan(0);
    }
  });
});
