/*
 * Awakening as a whole: the transition matrix, the invariants, and the
 * boundaries.
 *
 * The per-ticket suites check each route against its own rules. This one
 * checks the things that are only true of the system: that every row of the
 * required matrix actually resolves, that the seven invariants hold across all
 * of them, that no operation touches an owner it was not addressed to, and
 * that every state any route can produce survives a round trip and re-reads as
 * valid.
 */

import { describe, expect, it } from "vitest";

import {
  advanceNenCollapseRecovery,
  awakenNenAbrupt,
  awakenNenExceptional,
  awakenNenInstinctive,
  awakenNenStandard,
  isNenUncontained,
  releaseInvoluntaryZetsu,
  revertNen,
  settleNenCollapse,
  ABRUPT_AWAKENING_SUCCESS_PURPOSE,
  NEN_AWAKENING_EVENT_KINDS,
  type NenAwakeningContext,
  type NenAwakeningTransitionResult,
} from "../character/nen";
import { uncontainedCollapse } from "../character/foundation/aura/leakage";
import {
  awakeningStateFromJson,
  awakeningStateToJson,
} from "../character/foundation/nen/awakening/serialization";
import { findAwakeningStateIssues } from "../character/foundation/nen/awakening/validation";
import {
  hasPseudoChu,
  isInForcedZetsu,
} from "../character/foundation/nen/awakening/state";
import {
  createUnawakenedNenState,
  deriveEffectiveNenMastery,
  hasEverAwakenedNen,
  isNenAwakened,
  NEN_PRINCIPLE_IDS,
  validateNenState,
} from "../character/foundation/nen/nen";
import { compareRuntimeEvents } from "../runtime/events";
import { findRequestIssues } from "../runtime/requests";
import type { NenState } from "../character/foundation/nen/types";
import { INSTINCTIVE_AWAKENING_MINIMUM_SPI } from "../character/foundation/nen/awakening/calculations";

import {
  AWAKENING_CAPABLE,
  awakeningContext,
  requirementContextFor,
} from "./fixtures/nen";
import { unassignedNenAffinity } from "../character/foundation/nen/nen-type";

const OP = "operation-under-test";

function expectState(result: NenAwakeningTransitionResult): NenState {
  if (!result.success) {
    throw new Error(result.errors.map((error) => error.code).join(", "));
  }

  return result.payload.state;
}

function successRoll(value: number) {
  return { purpose: ABRUPT_AWAKENING_SUCCESS_PURPOSE, sides: 100, values: [value] };
}

const ACTOR = {
  ref: { type: "character", id: "a-teacher" },
  capability: [],
} as const;


/* ── The required transition matrix ─────────────────────────────────────── */

describe("every row of the required transition matrix resolves", () => {
  it("unawakened + standard -> awakened, open, Ten I, stable, no pseudo-Chu", () => {
    const state = expectState(awakenNenStandard(awakeningContext(), {
      method: "standard",
      trainingCompleted: true,
    }));

    expect(state.awakening.condition).toBe("awakened");
    expect(state.awakening.nodes).toBe("open");
    expect(state.mastery.ten).toBe(1);
    expect(isNenUncontained(state)).toBe(false);
    expect(hasPseudoChu(state.awakening)).toBe(false);
  });

  it("unawakened + abrupt success -> awakened, open, no Ten, leaking", () => {
    const state = expectState(awakenNenAbrupt(awakeningContext(), {
      method: "abrupt",
      actor: ACTOR,
      actorContext: requirementContextFor(),
      rolls: [successRoll(1)],
    }));

    expect(state.awakening.condition).toBe("awakened");
    expect(state.mastery.ten).toBe(0);
    expect(isNenUncontained(state)).toBe(true);
  });

  it("unawakened + abrupt failure -> unchanged, with trauma", () => {
    const context = awakeningContext();

    const result = awakenNenAbrupt(context, {
      method: "abrupt",
      actor: ACTOR,
      actorContext: requirementContextFor(),
      rolls: [successRoll(100)],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.state).toBe(context.nen);
    expect(result.payload.changes.trauma).toBe("severe");
  });

  it("unawakened + instinctive -> awakened, forced Zetsu, bound exception", () => {
    const state = expectState(awakenNenInstinctive(
      awakeningContext({
        attributes: { ...AWAKENING_CAPABLE, spi: INSTINCTIVE_AWAKENING_MINIMUM_SPI },
      }),
      {
        method: "instinctive",
        authorization: { grantedBy: { type: "gm", id: "ruling" }, reason: "Cornered." },
        naturalAbilityId: "ability-a",
      },
    ));

    expect(isInForcedZetsu(state.awakening)).toBe(true);

    const forced = state.awakening.suppression[0]!;

    expect(forced.kind).toBe("forced-zetsu");
    if (forced.kind !== "forced-zetsu") return;

    expect(forced.exemptions[0]!.abilityId).toBe("ability-a");
  });

  it("unawakened + exceptional -> only what the source declared", () => {
    const state = expectState(awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: {
        ref: { type: "item", id: "a-relic" },
        overrides: { eligibility: { requirements: [], summary: "Waived." } },
      },
    }));

    expect(state.awakening.condition).toBe("awakened");
    expect(state.mastery.ten).toBe(0);
    expect(state.affinity.status).toBe("unassigned");
  });

  it("awakened + reversion -> reverted, half-open, mastery kept, Ability lost", () => {
    const awakened = expectState(awakenNenStandard(awakeningContext(), {
      method: "standard",
      trainingCompleted: true,
    }));

    const withAbility: NenState = {
      ...awakened,
      awakening: {
        ...awakened.awakening,
        naturalAbility: {
          abilityId: "natural",
          grantedAt: 0,
          grantedByAwakeningId: awakened.awakening.currentAwakeningId!,
          origin: "standard",
        },
      },
    };

    const reverted = expectState(revertNen(
      awakeningContext({ nen: withAbility, operationId: "op-revert" }),
      { source: { type: "curse", id: "c" }, reason: "Severed." },
    ));

    expect(reverted.awakening.condition).toBe("reverted");
    expect(reverted.awakening.nodes).toBe("half-open");
    expect(reverted.mastery.ten).toBe(1);
    expect(reverted.awakening.naturalAbility).toBeNull();
  });

  it("reverted + standard reawakening -> awakened after thresholds", () => {
    const back = expectState(awakenNenStandard(
      awakeningContext({ nen: reverted(), operationId: "op-back" }),
      { method: "standard", trainingCompleted: true, hurdle: "ideal" },
    ));

    expect(back.awakening.condition).toBe("awakened");
  });

  it("reverted + abrupt reawakening -> the hurdle's odds", () => {
    const result = awakenNenAbrupt(
      awakeningContext({ nen: reverted(), operationId: "op-back" }),
      {
        method: "abrupt",
        actor: ACTOR,
        actorContext: requirementContextFor(),
        hurdle: "ideal",
        rolls: [successRoll(75)],
      },
    );

    expect(result.success && result.payload.changes.resolutions[0]!.probability)
      .toBe(0.75);
  });

  it("reverted + exceptional reawakening -> only the source's overrides", () => {
    const back = expectState(awakenNenExceptional(
      awakeningContext({ nen: reverted(), operationId: "op-back" }),
      {
        method: "exceptional",
        hurdle: "severe",
        source: {
          ref: { type: "item", id: "a-relic" },
          overrides: { eligibility: { requirements: [], summary: "Waived." } },
        },
      },
    ));

    expect(back.awakening.condition).toBe("awakened");
    expect(back.mastery.ten).toBe(1);
  });

  it("leaking + 0 Aura -> unconscious, leak stopped, recovery created", () => {
    const collapsed = expectState(settleNenCollapse(
      awakeningContext({ nen: leaking(), operationId: "op-collapse" }),
      { collapse: uncontainedCollapse(0) },
    ));

    expect(isNenUncontained(collapsed)).toBe(false);
    expect(collapsed.awakening.collapseRecovery).not.toBeNull();
  });

  it("collapsed + recovery completes -> awake, in an involuntary Zetsu", () => {
    const woken = expectState(advanceNenCollapseRecovery(
      awakeningContext({ nen: collapsed(), operationId: "op-sleep" }),
      { qualifyingSleepHours: 8, maximumAura: 100, at: 1 },
    ));

    expect(woken.awakening.collapseRecovery?.completedAt).toBe(1);
    expect(woken.awakening.suppression[0]!.kind).toBe("involuntary-zetsu");
  });

  it("forced Zetsu without Ten + release -> ended, leak restarted", () => {
    const woken = expectState(advanceNenCollapseRecovery(
      awakeningContext({ nen: collapsed(), operationId: "op-sleep" }),
      { qualifyingSleepHours: 8, maximumAura: 100, at: 1 },
    ));

    const released = expectState(releaseInvoluntaryZetsu(
      awakeningContext({ nen: woken, operationId: "op-release" }),
      { suppressionId: woken.awakening.suppression[0]!.id },
    ));

    expect(released.awakening.suppression).toEqual([]);
    expect(isNenUncontained(released)).toBe(true);
  });
});


function leaking(): NenState {
  return expectState(awakenNenAbrupt(awakeningContext(), {
    method: "abrupt",
    actor: ACTOR,
    actorContext: requirementContextFor(),
    rolls: [successRoll(1)],
  }));
}

function collapsed(): NenState {
  return expectState(settleNenCollapse(
    awakeningContext({ nen: leaking(), operationId: "op-collapse" }),
    { collapse: uncontainedCollapse(0) },
  ));
}

function reverted(): NenState {
  const awakened = expectState(awakenNenStandard(awakeningContext(), {
    method: "standard",
    trainingCompleted: true,
  }));

  return expectState(revertNen(
    awakeningContext({ nen: awakened, operationId: "op-revert" }),
    { source: { type: "curse", id: "c" }, reason: "Severed." },
  ));
}


/* ── The required invariants ────────────────────────────────────────────── */

describe("the required invariants hold across every reachable state", () => {
  const states: readonly (readonly [string, NenState])[] = [
    ["unawakened", createUnawakenedNenState(unassignedNenAffinity())],
    ["standard", expectState(awakenNenStandard(awakeningContext(), {
      method: "standard", trainingCompleted: true,
    }))],
    ["abrupt", leaking()],
    ["instinctive", expectState(awakenNenInstinctive(
      awakeningContext({
        attributes: { ...AWAKENING_CAPABLE, spi: INSTINCTIVE_AWAKENING_MINIMUM_SPI },
      }),
      {
        method: "instinctive",
        authorization: { grantedBy: { type: "gm", id: "r" }, reason: "Cornered." },
        naturalAbilityId: "ability-a",
      },
    ))],
    ["collapsed", collapsed()],
    ["reverted", reverted()],
  ];

  it("keeps pseudo-Chu to characters who have never awakened", () => {
    for (const [name, state] of states) {
      expect([name, hasPseudoChu(state.awakening)])
        .toEqual([name, !hasEverAwakenedNen(state)]);
    }
  });

  it("accepts awakened without Ten as a valid state", () => {
    const fresh = leaking();

    expect(isNenAwakened(fresh)).toBe(true);
    expect(fresh.mastery.ten).toBe(0);
    expect(validateNenState(fresh).success).toBe(true);
  });

  it("accepts reverted with retained mastery as a valid state", () => {
    const back = reverted();

    expect(isNenAwakened(back)).toBe(false);
    expect(back.mastery.ten).toBe(1);
    expect(validateNenState(back).success).toBe(true);
  });

  it("never lets a forced Zetsu imply Zetsu mastery", () => {
    for (const [name, state] of states) {
      if (!isInForcedZetsu(state.awakening)) continue;

      expect([name, state.mastery.zetsu]).toEqual([name, 0]);
      expect([name, deriveEffectiveNenMastery(state, "zetsu")])
        .toEqual([name, 0]);
    }
  });

  it("binds every exemption to its own instance and source", () => {
    for (const [name, state] of states) {
      for (const held of state.awakening.suppression) {
        /* An involuntary Zetsu carries none at all, which is the rule. */
        if (held.kind !== "forced-zetsu") continue;

        for (const exemption of held.exemptions) {
          expect([name, exemption.suppressionId, exemption.source])
            .toEqual([name, held.id, held.source]);
        }
      }
    }
  });

  it("refuses mastery on a character who has never awakened", () => {
    const impossible: NenState = {
      ...createUnawakenedNenState(unassignedNenAffinity()),
      mastery: { ...createUnawakenedNenState(unassignedNenAffinity()).mastery, ten: 1 },
    };

    const result = validateNenState(impossible);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((error) => error.code))
      .toContain("nen.mastery.before_awakening");
  });

  it("never lets an override bypass an unrelated mastery rule", () => {
    const refused = awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: {
        ref: { type: "item", id: "a-relic" },
        overrides: {
          eligibility: { requirements: [], summary: "Waived." },
          masteryGrant: {
            /* Zetsu is unlocked by Ren, which this character has not learned. */
            grants: [{ principleId: "zetsu", rank: 1 }],
            summary: "Skips Ren.",
          },
        },
      },
    });

    expect(refused.success).toBe(false);
    if (refused.success) return;

    expect(refused.errors.map((error) => error.code))
      .toContain("nen.mastery.unlock_prerequisite_not_met");
  });

  it("leaves every reachable state valid and re-readable", () => {
    for (const [name, state] of states) {
      expect([name, findAwakeningStateIssues(state.awakening)])
        .toEqual([name, []]);
      expect([name, validateNenState(state).success]).toEqual([name, true]);

      const read = awakeningStateFromJson(awakeningStateToJson(state.awakening));

      expect([name, read.success]).toEqual([name, true]);
      if (!read.success) continue;

      expect([name, read.payload]).toEqual([name, state.awakening]);
    }
  });
});


/* ── Protocol conformance ───────────────────────────────────────────────── */

describe("events and requests obey the shared protocol", () => {
  const operations: readonly (readonly [string, NenAwakeningTransitionResult])[] = [
    ["standard", awakenNenStandard(awakeningContext({ operationId: OP }), {
      method: "standard", trainingCompleted: true,
    })],
    ["abrupt success", awakenNenAbrupt(awakeningContext({ operationId: OP }), {
      method: "abrupt",
      actor: ACTOR,
      actorContext: requirementContextFor(),
      rolls: [successRoll(1)],
    })],
    ["abrupt failure", awakenNenAbrupt(awakeningContext({ operationId: OP }), {
      method: "abrupt",
      actor: ACTOR,
      actorContext: requirementContextFor(),
      rolls: [successRoll(100)],
    })],
    ["collapse", settleNenCollapse(
      awakeningContext({ nen: leaking(), operationId: OP }),
      { collapse: uncontainedCollapse(0) },
    )],
    ["reversion", revertNen(
      awakeningContext({ nen: leaking(), operationId: OP }),
      { source: { type: "curse", id: "c" }, reason: "Severed." },
    )],
  ];

  it("emits only declared event kinds, from the character domain", () => {
    for (const [name, result] of operations) {
      expect([name, result.success]).toEqual([name, true]);
      if (!result.success) continue;

      for (const event of result.payload.events) {
        expect([name, NEN_AWAKENING_EVENT_KINDS.includes(event.kind as never)])
          .toEqual([name, true]);
        expect([name, event.domain]).toEqual([name, "character"]);
        expect([name, event.operationId]).toEqual([name, OP]);
      }
    }
  });

  it("numbers events in rule order, stably", () => {
    for (const [name, result] of operations) {
      if (!result.success) continue;

      const sequences = result.payload.events.map((event) => event.sequence);

      expect([name, sequences])
        .toEqual([name, sequences.map((_value, index) => index)]);

      const sorted = [...result.payload.events].sort(compareRuntimeEvents);

      expect([name, sorted]).toEqual([name, result.payload.events]);
    }
  });

  it("raises only well-formed requests, each to the owner that decides", () => {
    for (const [name, result] of operations) {
      if (!result.success) continue;

      for (const request of result.payload.requests) {
        expect([name, findRequestIssues(request, OP, "effect")])
          .toEqual([name, []]);
        expect([name, request.from.domain]).toEqual([name, "character"]);
      }
    }
  });

  /*
   * Owner isolation. Two characters awakening in one operation must produce
   * events and requests that name their own subject and nobody else's — the
   * failure mode where a domain closes over one character and charges everyone
   * through them.
   */
  it("keeps two subjects' events and requests entirely separate", () => {
    const gon = awakenNenAbrupt(
      awakeningContext({
        operationId: OP,
        owner: { domain: "character", id: "gon" },
      }),
      {
        method: "abrupt",
        actor: ACTOR,
        actorContext: requirementContextFor(),
        rolls: [successRoll(1)],
      },
    );

    const killua = awakenNenAbrupt(
      awakeningContext({
        operationId: OP,
        owner: { domain: "character", id: "killua" },
      }),
      {
        method: "abrupt",
        actor: ACTOR,
        actorContext: requirementContextFor(),
        rolls: [successRoll(100)],
      },
    );

    expect(gon.success && killua.success).toBe(true);
    if (!gon.success || !killua.success) return;

    for (const event of gon.payload.events) {
      expect(event.target?.id).toBe("gon");
    }

    for (const request of killua.payload.requests) {
      expect(request.from.id).toBe("killua");
      expect(request.to.id).toBe("killua");
    }

    /* And the two outcomes genuinely differ: one awakened, one did not. */
    expect(isNenAwakened(gon.payload.state)).toBe(true);
    expect(isNenAwakened(killua.payload.state)).toBe(false);
  });

  it("gives every request in one operation a distinct id", () => {
    for (const [name, result] of operations) {
      if (!result.success) continue;

      const ids = result.payload.requests.map((request) => request.requestId);

      expect([name, new Set(ids).size]).toEqual([name, ids.length]);
    }
  });
});


/* ── Hostile input ──────────────────────────────────────────────────────── */

describe("every route refuses hostile state rather than building on it", () => {
  const corrupt = {
    ...createUnawakenedNenState(unassignedNenAffinity()),
    awakening: { ...createUnawakenedNenState(unassignedNenAffinity()).awakening, condition: "asleep" },
  } as unknown as NenState;

  it("refuses a malformed awakening state everywhere", () => {
    const attempts: readonly NenAwakeningTransitionResult[] = [
      awakenNenStandard(awakeningContext({ nen: corrupt }), {
        method: "standard", trainingCompleted: true,
      }),
      awakenNenAbrupt(awakeningContext({ nen: corrupt }), {
        method: "abrupt",
        actor: ACTOR,
        actorContext: requirementContextFor(),
        rolls: [successRoll(1)],
      }),
      awakenNenInstinctive(awakeningContext({ nen: corrupt }), {
        method: "instinctive",
        authorization: { grantedBy: { type: "gm", id: "r" }, reason: "x" },
        naturalAbilityId: "a",
      }),
      awakenNenExceptional(awakeningContext({ nen: corrupt }), {
        method: "exceptional",
        source: { ref: { type: "item", id: "i" }, overrides: {} },
      }),
      revertNen(awakeningContext({ nen: corrupt }), {
        source: { type: "curse", id: "c" }, reason: "x",
      }),
      settleNenCollapse(awakeningContext({ nen: corrupt }), {
        collapse: uncontainedCollapse(0),
      }),
      advanceNenCollapseRecovery(awakeningContext({ nen: corrupt }), {
        qualifyingSleepHours: 8, maximumAura: 100, at: 0,
      }),
      releaseInvoluntaryZetsu(awakeningContext({ nen: corrupt }), {
        suppressionId: "anything",
      }),
    ];

    for (const attempt of attempts) {
      expect(attempt.success).toBe(false);
      if (attempt.success) continue;

      expect(attempt.errors.map((error) => error.code))
        .toContain("nen.awakening.condition.invalid");
    }
  });

  /*
   * The routing values every event and request this domain emits is built
   * from. A malformed one produces a malformed request that is refused at
   * DISPATCH — after the state has already changed, which is the ordering the
   * validate-before-mutate rule exists to prevent.
   */
  it("refuses a malformed owner, operation or timestamp before mutating", () => {
    const good = awakeningContext();

    const broken: readonly (readonly [string, NenAwakeningContext])[] = [
      ["owner", { ...good, owner: { domain: "character", id: "" } }],
      ["owner", { ...good, owner: undefined as never }],
      ["operation", { ...good, operationId: "  " }],
      ["timestamp", { ...good, occurredAt: Number.NaN }],
    ];

    const expected = [
      "nen.awakening.owner.invalid",
      "nen.awakening.operation.invalid",
      "nen.awakening.timestamp.invalid",
    ];

    for (const [label, context] of broken) {
      const result = awakenNenStandard(context, {
        method: "standard",
        trainingCompleted: true,
      });

      expect([label, result.success]).toEqual([label, false]);
      if (result.success) continue;

      expect([
        label,
        result.errors.some((error) => expected.includes(error.code)),
      ]).toEqual([label, true]);

      expect([label, context.nen.awakening.condition])
        .toEqual([label, "unawakened"]);
    }
  });

  it("refuses a malformed supplied training duration", () => {
    for (const hours of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const result = awakenNenStandard(awakeningContext(), {
        method: "standard",
        trainingCompleted: true,
        baseTrainingDurationHours: hours,
      });

      expect([hours, result.success]).toEqual([hours, false]);
      if (result.success) continue;

      expect([hours, result.errors.map((error) => error.code)])
        .toEqual([hours, ["nen.awakening.training.duration.invalid"]]);
    }
  });

  it("carries a trace through every refusal", () => {
    const refused = awakenNenStandard(awakeningContext({ nen: corrupt }), {
      method: "standard", trainingCompleted: true,
    });

    expect(refused.trace.root.id).toBe("nen.awakening.standard");
    expect(refused.trace.root.output).toBe(false);
  });
});


describe("the mastery record is never written to except through the graph", () => {
  it("leaves every principle at zero unless a route granted it", () => {
    for (const state of [leaking(), collapsed()]) {
      for (const principleId of NEN_PRINCIPLE_IDS) {
        expect([principleId, state.mastery[principleId]]).toEqual([principleId, 0]);
      }
    }
  });
});
