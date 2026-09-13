/*
 * Reversion, and coming back from it.
 *
 * The claim these tests exist to hold the engine to is narrow and easy to
 * break: reversion takes ACCESS and the provenance-linked natural Ability, and
 * takes nothing else. Every rank the character trained stays, at the rank they
 * trained it, and a reawakening gives it back without relearning, duplicating
 * or resetting a single value.
 */

import { describe, expect, it } from "vitest";

import {
  masteryFullyRestored,
  projectAbruptReawakeningOdds,
  projectStandardReawakeningDuration,
  retainedMasteryRanks,
  revertNen,
} from "../character/nen/reversion";
import {
  awakenNenAbrupt,
  awakenNenStandard,
} from "../character/nen/transitions";
import { awakenNenExceptional } from "../character/nen/exceptional";
import {
  ABRUPT_AWAKENING_SUCCESS_PURPOSE,
  type NenAwakeningTransitionResult,
} from "../character/nen/protocol";
import { nenAuraAccessInput } from "../character/nen/access";
import { resolveAuraAccess } from "../character/foundation/aura/access";
import {
  deriveEffectiveNenMastery,
  deriveMaximumNenMastery,
  hasEverAwakenedNen,
  isNenAwakened,
  validateNenState,
} from "../character/foundation/nen/nen";
import { hasPseudoChu } from "../character/foundation/nen/awakening/state";
import type { NenState } from "../character/foundation/nen/types";

import {
  AWAKENING_CAPABLE,
  awakeningContext,
  requirementContextFor,
} from "./fixtures/nen";

function codes(result: NenAwakeningTransitionResult): readonly string[] {
  return result.success ? [] : result.errors.map((error) => error.code);
}

function kinds(result: NenAwakeningTransitionResult): readonly string[] {
  return result.success ? result.payload.events.map((event) => event.kind) : [];
}

function expectState(result: NenAwakeningTransitionResult): NenState {
  if (!result.success) {
    throw new Error(result.errors.map((error) => error.code).join(", "));
  }

  return result.payload.state;
}

const SOURCE = { type: "curse", id: "the-severing" } as const;

/** Awakened, holding Ten V, with a natural Ability and an external one. */
function trained(): NenState {
  const awakened = expectState(awakenNenStandard(awakeningContext(), {
    method: "standard",
    trainingCompleted: true,
  }));

  return {
    ...awakened,
    mastery: { ...awakened.mastery, ten: 5 },
    awakening: {
      ...awakened.awakening,
      naturalAbility: {
        abilityId: "natural-ability",
        grantedAt: 0,
        grantedByAwakeningId: awakened.awakening.currentAwakeningId!,
        origin: "standard",
      },
      externalAbilities: [
        { abilityId: "taught-ability", source: { type: "teacher", id: "t" }, grantedAt: 0 },
        { abilityId: "item-ability", source: { type: "item", id: "i" }, grantedAt: 0 },
      ],
    },
  };
}

function revert(
  nen: NenState = trained(),
  overrides: Record<string, unknown> = {},
): NenAwakeningTransitionResult {
  return revertNen(
    awakeningContext({ nen, operationId: "op-revert" }),
    {
      source: SOURCE,
      reason: "The severing took their access.",
      ...overrides,
    } as never,
  );
}


describe("reversion", () => {
  it("returns the nodes to half-open and disables normal access", () => {
    const reverted = expectState(revert());

    expect(reverted.awakening.condition).toBe("reverted");
    expect(reverted.awakening.nodes).toBe("half-open");
    expect(reverted.awakening.currentAwakeningId).toBeNull();
    expect(reverted.awakening.currentMethod).toBeNull();

    expect(isNenAwakened(reverted)).toBe(false);
    expect(deriveEffectiveNenMastery(reverted, "ten")).toBe(0);
  });

  it("keeps every rank the character permanently trained", () => {
    const reverted = expectState(revert());

    expect(reverted.mastery.ten).toBe(5);
    expect(hasEverAwakenedNen(reverted)).toBe(true);
    expect(deriveMaximumNenMastery(reverted, "ten")).toBe(10);

    /* And the sheet still validates, which the old boolean made impossible. */
    expect(validateNenState(reverted).success).toBe(true);
  });

  it("reads as trained-but-unusable, rank by rank", () => {
    const reverted = expectState(revert());

    expect(retainedMasteryRanks(reverted))
      .toEqual([{ principleId: "ten", rank: 5, usable: 0 }]);
    expect(masteryFullyRestored(reverted)).toBe(false);
  });

  it("keeps the whole history, including the awakening it undid", () => {
    const reverted = expectState(revert());

    expect(reverted.awakening.history.map((entry) => entry.kind))
      .toEqual(["awakening", "reversion"]);
  });

  /*
   * PROVENANCE, not resemblance. The natural Ability goes because its record
   * names an awakening in this character's history; the taught one and the
   * Item one do not, and survive untouched.
   */
  it("removes only the provenance-linked natural Ability", () => {
    const result = revert();
    const reverted = expectState(result);

    expect(reverted.awakening.naturalAbility).toBeNull();
    expect(reverted.awakening.externalAbilities.map((one) => one.abilityId))
      .toEqual(["taught-ability", "item-ability"]);

    expect(result.success && result.payload.changes.naturalAbilityLost)
      .toBe("natural-ability");
    expect(result.success && result.payload.changes.externalAbilitiesLost)
      .toEqual([]);

    expect(kinds(result)).toContain("nen-natural-ability-lost");
  });

  it("removes an external Ability only when the source names it", () => {
    const result = revert(trained(), {
      targetedExternalAbilityIds: ["item-ability"],
    });

    const reverted = expectState(result);

    expect(reverted.awakening.externalAbilities.map((one) => one.abilityId))
      .toEqual(["taught-ability"]);
    expect(result.success && result.payload.changes.externalAbilitiesLost)
      .toEqual(["item-ability"]);
  });

  it("refuses a source that targets an Ability the character lacks", () => {
    expect(codes(revert(trained(), {
      targetedExternalAbilityIds: ["never-had-it"],
    }))).toContain("nen.reversion.targeted-ability.unknown");
  });

  /* Awakening ended pseudo-Chu permanently. Reversion does not give it back. */
  it("does not restore pseudo-Chu", () => {
    const reverted = expectState(revert());

    expect(hasPseudoChu(reverted.awakening)).toBe(false);

    const access = resolveAuraAccess(nenAuraAccessInput(reverted));

    expect(access.success).toBe(true);
    if (!access.success) return;

    expect(access.payload.state).toBe("reverted");
    expect(access.payload.nodeState).toBe("half-open");
    expect(access.payload.passiveInternalReinforcement).toBeNull();
    expect(access.payload.uncontained).toBe(false);
  });

  it("stops any awakening-owned forced state and leakage", () => {
    const leaking = expectState(awakenNenAbrupt(awakeningContext(), {
      method: "abrupt",
      actor: { ref: { type: "character", id: "t" }, capability: [] },
      actorContext: requirementContextFor(),
      rolls: [{ purpose: ABRUPT_AWAKENING_SUCCESS_PURPOSE, sides: 100, values: [1] }],
    }));

    const result = revert(leaking);

    expect(result.success && result.payload.changes.leakageStopped).toBe(true);
    expect(expectState(result).awakening.forcedStates).toEqual([]);
    expect(kinds(result)).toContain("nen-leakage-stopped");
  });

  it("records an explicit Nen Type change and refuses an unexplained one", () => {
    const typed = expectState(awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: {
        ref: { type: "item", id: "a-relic" },
        overrides: {
          nenType: { type: "emission", known: true, summary: "Set by the relic." },
        },
      },
    }));

    const result = revert(typed, {
      nenTypeChange: {
        previous: "emission",
        next: "specialization",
        cause: "The severing rewrote what was left.",
      },
    });

    const reverted = expectState(result);

    expect(reverted.awakening.nenType)
      .toEqual({ type: "specialization", known: true });
    expect(kinds(result)).toContain("nen-type-changed");

    expect(codes(revert(typed, {
      nenTypeChange: { previous: "emission", next: "specialization", cause: "" },
    }))).toContain("nen.reversion.type-change.unexplained");

    expect(codes(revert(typed, {
      nenTypeChange: {
        previous: "conjuration",
        next: "specialization",
        cause: "wrong previous",
      },
    }))).toContain("nen.reversion.type-change.previous.mismatch");
  });

  it("is exceptional, so it refuses a missing source or reason", () => {
    expect(codes(revert(trained(), { source: undefined })))
      .toContain("nen.reversion.source.missing");
    expect(codes(revert(trained(), { reason: "  " })))
      .toContain("nen.reversion.reason.missing");
  });

  it("refuses to revert somebody who is not awakened", () => {
    const reverted = expectState(revert());

    expect(codes(revert(reverted))).toContain("nen.reversion.not-awakened");
  });

  it("changes nothing on a refusal", () => {
    const nen = trained();
    const snapshot = JSON.stringify(nen);

    expect(revert(nen, { reason: "" }).success).toBe(false);
    expect(JSON.stringify(nen)).toBe(snapshot);
  });
});


describe("reawakening", () => {
  function reverted(): NenState {
    return expectState(revert());
  }

  it("restores access to retained mastery without changing a rank", () => {
    const before = reverted();

    const back = expectState(awakenNenStandard(
      awakeningContext({ nen: before, operationId: "op-back" }),
      { method: "standard", trainingCompleted: true, hurdle: "ideal" },
    ));

    expect(back.mastery).toEqual(before.mastery);
    expect(back.mastery.ten).toBe(5);
    expect(deriveEffectiveNenMastery(back, "ten")).toBe(5);
    expect(masteryFullyRestored(back)).toBe(true);
  });

  /*
   * Ten I is not granted "again" to somebody holding Ten V. Advancing them
   * would fail, and writing I in would be a downgrade of mastery the rules say
   * is retained — so the grant is skipped and reported as granting nothing.
   */
  it("neither duplicates nor downgrades an existing Ten", () => {
    const result = awakenNenStandard(
      awakeningContext({ nen: reverted(), operationId: "op-back" }),
      { method: "standard", trainingCompleted: true, hurdle: "ideal" },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.changes.masteryGranted).toEqual([]);
    expect(result.payload.state.mastery.ten).toBe(5);
    expect(kinds(result)).not.toContain("nen-mastery-granted");
  });

  it("marks the return as a reawakening", () => {
    const result = awakenNenStandard(
      awakeningContext({ nen: reverted(), operationId: "op-back" }),
      { method: "standard", trainingCompleted: true, hurdle: "moderate" },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.changes.reawakening).toBe(true);
    expect(result.payload.changes.hurdle).toBe("moderate");
    expect(kinds(result)).toContain("nen-reawakened");
    expect(result.payload.state.awakening.history.map((one) => one.kind))
      .toEqual(["awakening", "reversion", "awakening"]);
  });

  it("requires a hurdle, because the engine may not choose one", () => {
    expect(codes(awakenNenStandard(
      awakeningContext({ nen: reverted(), operationId: "op-back" }),
      { method: "standard", trainingCompleted: true },
    ))).toContain("nen.awakening.hurdle.required");
  });

  it("keeps the standard thresholds on the standard route", () => {
    const weakened: NenState = reverted();

    const refused = awakenNenStandard(
      awakeningContext({
        nen: weakened,
        attributes: { ...AWAKENING_CAPABLE, wis: 9 },
        operationId: "op-back",
      }),
      { method: "standard", trainingCompleted: true, hurdle: "ideal" },
    );

    expect(codes(refused)).toContain("nen.awakening.eligibility.unsatisfied");
  });

  /*
   * The same character below the thresholds may still come back abruptly,
   * because abrupt awakening has no minimums by rule — it prices the shortfall
   * rather than enforcing it.
   */
  it("still allows a valid abrupt route below the thresholds", () => {
    const back = awakenNenAbrupt(
      awakeningContext({
        nen: reverted(),
        attributes: { ...AWAKENING_CAPABLE, wis: 9 },
        operationId: "op-back-abrupt",
      }),
      {
        method: "abrupt",
        actor: { ref: { type: "character", id: "t" }, capability: [] },
        actorContext: requirementContextFor(),
        hurdle: "severe",
        rolls: [
          { purpose: ABRUPT_AWAKENING_SUCCESS_PURPOSE, sides: 100, values: [1] },
          { purpose: "nen.awakening.abrupt.death", sides: 100, values: [100] },
        ],
      },
    );

    expect(back.success).toBe(true);
    if (!back.success) return;

    expect(back.payload.changes.reawakening).toBe(true);
    expect(back.payload.state.mastery.ten).toBe(5);
    expect(masteryFullyRestored(back.payload.state)).toBe(true);
  });

  it("applies the hurdle's odds multiplier to an abrupt reawakening", () => {
    const back = awakenNenAbrupt(
      awakeningContext({ nen: reverted(), operationId: "op-back-abrupt" }),
      {
        method: "abrupt",
        actor: { ref: { type: "character", id: "t" }, capability: [] },
        actorContext: requirementContextFor(),
        hurdle: "ideal",
        rolls: [
          { purpose: ABRUPT_AWAKENING_SUCCESS_PURPOSE, sides: 100, values: [75] },
        ],
      },
    );

    expect(back.success).toBe(true);
    if (!back.success) return;

    /* Ideal at the thresholds is odds 1.5 x 2 = 3, which is 75%. */
    expect(back.payload.changes.resolutions[0]).toMatchObject({
      probability: 0.75,
      roll: 75,
      succeeded: true,
    });
  });

  it("leaves a failed reawakening reverted", () => {
    const before = reverted();

    const failed = awakenNenAbrupt(
      awakeningContext({ nen: before, operationId: "op-back-abrupt" }),
      {
        method: "abrupt",
        actor: { ref: { type: "character", id: "t" }, capability: [] },
        actorContext: requirementContextFor(),
        hurdle: "ideal",
        rolls: [
          { purpose: ABRUPT_AWAKENING_SUCCESS_PURPOSE, sides: 100, values: [100] },
        ],
      },
    );

    expect(failed.success).toBe(true);
    if (!failed.success) return;

    expect(failed.payload.state).toBe(before);
    expect(failed.payload.state.awakening.condition).toBe("reverted");
    expect(failed.payload.state.mastery.ten).toBe(5);
  });
});


describe("hurdle projections a caller can quote before committing", () => {
  it("makes an ideal standard reawakening exactly a tenth of the base", () => {
    expect(projectStandardReawakeningDuration(1000, "ideal")).toBe(100);
    expect(projectStandardReawakeningDuration(1000, "catastrophic")).toBe(4000);
  });

  it("makes an ideal threshold abrupt reawakening exactly 75%", () => {
    expect(projectAbruptReawakeningOdds(AWAKENING_CAPABLE, "ideal").probability)
      .toBe(0.75);
  });
});
