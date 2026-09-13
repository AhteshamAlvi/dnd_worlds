/*
 * Forced Zetsu and involuntary Zetsu are different mechanics.
 *
 * They were one type discriminated by an `origin` string, and the consequence
 * was not cosmetic: the release transition's only origin-sensitive guard
 * protected the collapse case, so an instinctive forced Zetsu — documented in
 * the same file as something the character "did not choose and cannot lift" —
 * fell straight through it and was removed by an array filter.
 *
 *   FORCED       imposed from outside: instinctive awakening today, and later
 *                an Ability, a status or a transformation. The character
 *                cannot lift it. It ends when the SOURCE authorises it.
 *
 *   INVOLUNTARY  the body's own safety response after leakage empties the
 *                reserve. The character CAN lift it, once the eight hours are
 *                served — and doing so without usable Ten walks straight back
 *                into the trap.
 *
 * Both suppress Aura identically and neither teaches a character anything.
 */

import { describe, expect, it } from "vitest";

import {
  advanceNenCollapseRecovery,
  awakenNenAbrupt,
  awakenNenInstinctive,
  releaseForcedZetsu,
  releaseInvoluntaryZetsu,
  settleNenCollapse,
  ABRUPT_AWAKENING_SUCCESS_PURPOSE,
  isNenUncontained,
  LEAKING_CONDITION_ID,
  type NenAwakeningTransitionResult,
} from "../character/nen";
import { uncontainedCollapse } from "../character/foundation/aura/leakage";
import {
  abilityFunctionsThroughSuppression,
  findSuppression,
  isSuppressed,
} from "../character/foundation/nen/awakening/state";
import {
  awakeningStateFromJson,
  awakeningStateToJson,
} from "../character/foundation/nen/awakening/serialization";
import { findAwakeningStateIssues } from "../character/foundation/nen/awakening/validation";
import { INSTINCTIVE_AWAKENING_MINIMUM_SPI } from "../character/foundation/nen/awakening/calculations";
import type { NenState } from "../character/foundation/nen/types";

import { AWAKENING_CAPABLE, awakeningContext, requirementContextFor } from "./fixtures/nen";

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

const GM = { type: "gm", id: "table-ruling" } as const;
const SPIRITED = { ...AWAKENING_CAPABLE, spi: INSTINCTIVE_AWAKENING_MINIMUM_SPI };

function instinctive(): NenState {
  return expectState(awakenNenInstinctive(
    awakeningContext({ attributes: SPIRITED, operationId: "op-inst" }),
    {
      method: "instinctive",
      authorization: { grantedBy: GM, reason: "Cornered." },
      naturalAbilityId: "ability-a",
    },
  ));
}

function leaking(): NenState {
  return expectState(awakenNenAbrupt(
    awakeningContext({ operationId: "op-abrupt" }),
    {
      method: "abrupt",
      actor: { ref: { type: "character", id: "t" }, capability: [] },
      actorContext: requirementContextFor(),
      rolls: [{ purpose: ABRUPT_AWAKENING_SUCCESS_PURPOSE, sides: 100, values: [1] }],
    },
  ));
}

function collapsed(): NenState {
  return expectState(settleNenCollapse(
    awakeningContext({ nen: leaking(), operationId: "op-collapse" }),
    { collapse: uncontainedCollapse(0) },
  ));
}

function woken(): NenState {
  return expectState(advanceNenCollapseRecovery(
    awakeningContext({ nen: collapsed(), operationId: "op-sleep" }),
    { qualifyingSleepHours: 8, maximumAura: 100, at: 1 },
  ));
}


describe("the two mechanics are distinct in the stored vocabulary", () => {
  it("gives instinctive awakening a forced Zetsu, with a source and a release rule", () => {
    const state = instinctive();
    const suppression = state.awakening.suppression;

    expect(suppression).toHaveLength(1);
    expect(suppression[0]!.kind).toBe("forced-zetsu");

    if (suppression[0]!.kind !== "forced-zetsu") return;

    expect(suppression[0]!.source).toEqual(GM);
    expect(suppression[0]!.release.rule).toBe("source-authorized");
    expect(suppression[0]!.release.authority).toEqual(GM);
  });

  it("gives a collapse an involuntary Zetsu, tied to its recovery", () => {
    const state = collapsed();
    const suppression = state.awakening.suppression;

    expect(suppression).toHaveLength(1);
    expect(suppression[0]!.kind).toBe("involuntary-zetsu");

    if (suppression[0]!.kind !== "involuntary-zetsu") return;

    expect(suppression[0]!.cause).toBe("uncontained-aura-collapse");
    expect(suppression[0]!.recoveryId)
      .toBe(state.awakening.collapseRecovery!.id);
  });

  it("names them differently in the event log", () => {
    expect(kinds(awakenNenInstinctive(
      awakeningContext({ attributes: SPIRITED, operationId: "op-inst" }),
      {
        method: "instinctive",
        authorization: { grantedBy: GM, reason: "Cornered." },
        naturalAbilityId: "ability-a",
      },
    ))).toContain("nen-forced-zetsu-applied");

    expect(kinds(settleNenCollapse(
      awakeningContext({ nen: leaking(), operationId: "op-collapse" }),
      { collapse: uncontainedCollapse(0) },
    ))).toContain("nen-involuntary-zetsu-applied");
  });

  it("suppresses Aura identically and teaches nothing either way", () => {
    for (const state of [instinctive(), collapsed(), woken()]) {
      expect(isSuppressed(state.awakening)).toBe(true);
      expect(isNenUncontained(state)).toBe(false);
      expect(state.mastery.zetsu).toBe(0);
    }
  });
});


describe("release is owned by whoever imposed the state", () => {
  /*
   * The defect this file exists for. The old release transition found a state
   * by id, checked one origin-specific guard that did not apply, and filtered
   * it out of the array.
   */
  it("refuses to release a forced Zetsu through the involuntary route", () => {
    const state = instinctive();
    const forcedId = state.awakening.suppression[0]!.id;

    const result = releaseInvoluntaryZetsu(
      awakeningContext({ nen: state, operationId: "op-release" }),
      { suppressionId: forcedId },
    );

    expect(codes(result))
      .toContain("nen.suppression.involuntary.wrong-kind");
    expect(state.awakening.suppression).toHaveLength(1);
  });

  it("refuses to release an involuntary Zetsu through the forced route", () => {
    const state = woken();

    expect(codes(releaseForcedZetsu(
      awakeningContext({ nen: state, operationId: "op-release" }),
      { suppressionId: state.awakening.suppression[0]!.id, authorization: GM },
    ))).toContain("nen.suppression.forced.wrong-kind");
  });

  it("releases a forced Zetsu only for the authority that imposed it", () => {
    const state = instinctive();
    const forcedId = state.awakening.suppression[0]!.id;

    const impostor = releaseForcedZetsu(
      awakeningContext({ nen: state, operationId: "op-release" }),
      {
        suppressionId: forcedId,
        authorization: { type: "gm", id: "somebody-else" },
      },
    );

    expect(codes(impostor)).toContain("nen.suppression.forced.unauthorized");

    const authorized = releaseForcedZetsu(
      awakeningContext({ nen: state, operationId: "op-release" }),
      { suppressionId: forcedId, authorization: GM },
    );

    expect(authorized.success).toBe(true);
    if (!authorized.success) return;

    expect(authorized.payload.state.awakening.suppression).toEqual([]);
    expect(kinds(authorized)).toContain("nen-forced-zetsu-released");
  });

  it("refuses to release an involuntary Zetsu before the eight hours", () => {
    const state = collapsed();

    expect(codes(releaseInvoluntaryZetsu(
      awakeningContext({ nen: state, operationId: "op-early" }),
      { suppressionId: state.awakening.suppression[0]!.id },
    ))).toContain("nen.suppression.involuntary.recovery-incomplete");
  });

  it("restarts leakage exactly once when released without usable Ten", () => {
    const state = woken();

    const released = releaseInvoluntaryZetsu(
      awakeningContext({ nen: state, operationId: "op-release" }),
      { suppressionId: state.awakening.suppression[0]!.id },
    );

    expect(released.success).toBe(true);
    if (!released.success) return;

    expect(released.payload.state.awakening.suppression).toEqual([]);
    expect(isNenUncontained(released.payload.state)).toBe(true);
    expect(released.payload.changes.leakageStarted).toBe(true);

    expect(kinds(released).filter((kind) => kind === "nen-leakage-started"))
      .toHaveLength(1);

    const applied = released.payload.requests.filter(
      (request) => "conditionId" in request,
    );

    expect(applied).toHaveLength(1);
    expect((applied[0] as unknown as { conditionId: string }).conditionId)
      .toBe(LEAKING_CONDITION_ID);
  });

  it("does not restart leakage when Ten has since been learned", () => {
    const state = woken();
    const withTen: NenState = { ...state, mastery: { ...state.mastery, ten: 1 } };

    const released = releaseInvoluntaryZetsu(
      awakeningContext({ nen: withTen, operationId: "op-release" }),
      { suppressionId: state.awakening.suppression[0]!.id },
    );

    expect(released.success).toBe(true);
    if (!released.success) return;

    expect(released.payload.changes.leakageStarted).toBe(false);
    expect(kinds(released)).toEqual(["nen-involuntary-zetsu-released"]);
    expect(released.payload.requests).toEqual([]);
  });
});


describe("the Ability exemption stays bound to its own instance", () => {
  it("works through the forced Zetsu that granted it", () => {
    const state = instinctive();
    const forced = state.awakening.suppression[0]!;

    expect(abilityFunctionsThroughSuppression(forced, "ability-a")).toBe(true);
    expect(abilityFunctionsThroughSuppression(forced, "ability-b")).toBe(false);
  });

  /*
   * The exemption would TRAVEL if it named only the Ability. An involuntary
   * Zetsu carries no exemptions at all, so nothing works through one.
   */
  it("does not work through an involuntary Zetsu", () => {
    const state = woken();
    const involuntary = state.awakening.suppression[0]!;

    expect(abilityFunctionsThroughSuppression(involuntary, "ability-a"))
      .toBe(false);
  });

  it("refuses an exemption bound to a different instance", () => {
    const state = instinctive();
    const forced = state.awakening.suppression[0]!;

    if (forced.kind !== "forced-zetsu") return;

    const crossBound = {
      ...state.awakening,
      suppression: [{
        ...forced,
        exemptions: [{
          ...forced.exemptions[0]!,
          suppressionId: "a-different-state",
        }],
      }],
    };

    expect(findAwakeningStateIssues(crossBound).map((issue) => issue.code))
      .toContain("nen.awakening.suppression.exemption.misattached");
  });
});


describe("both variants survive serialization", () => {
  it("round-trips a forced and an involuntary state unchanged", () => {
    for (const state of [instinctive(), collapsed(), woken()]) {
      const read = awakeningStateFromJson(awakeningStateToJson(state.awakening));

      expect(read.success).toBe(true);
      if (!read.success) continue;

      expect(read.payload).toEqual(state.awakening);
    }
  });

  it("refuses a suppression state of unknown kind", () => {
    const state = instinctive();

    const broken = {
      ...state.awakening,
      suppression: [{ ...state.awakening.suppression[0]!, kind: "made-up" }],
    };

    expect(awakeningStateFromJson(broken as never).success).toBe(false);
  });

  it("finds a suppression instance by id regardless of kind", () => {
    for (const state of [instinctive(), woken()]) {
      const id = state.awakening.suppression[0]!.id;

      expect(findSuppression(state.awakening, id)?.id).toBe(id);
      expect(findSuppression(state.awakening, "nope")).toBeNull();
    }
  });
});
