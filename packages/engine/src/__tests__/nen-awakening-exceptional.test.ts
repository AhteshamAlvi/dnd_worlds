/*
 * Instinctive and exceptional awakening.
 *
 * Both routes are places where the engine could easily acquire a global
 * exception by accident, and most of these tests are there to prove it did
 * not:
 *
 *   - an instinctive Ability works through ITS forced Zetsu and no other, so
 *     no general "Abilities work through Zetsu" rule exists;
 *   - an exceptional source that waives eligibility waives eligibility, and
 *     has not quietly granted Ten, changed a Nen Type, or excused the Nen
 *     mastery graph.
 */

import { describe, expect, it } from "vitest";

import {
  awakenNenExceptional,
  awakenNenInstinctive,
} from "../character/nen/exceptional";
import type { NenAwakeningTransitionResult } from "../character/nen/protocol";
import { isNenUncontained } from "../character/nen/access";
import {
  abilityFunctionsDespiteSuppression,
  abilityFunctionsThroughSuppression,
  isInForcedZetsu,
} from "../character/foundation/nen/awakening/state";
import { INSTINCTIVE_AWAKENING_MINIMUM_SPI } from "../character/foundation/nen/awakening/calculations";
import { revertNen } from "../character/nen/reversion";
import type { NenExceptionalAwakeningSource } from "../character/nen/sources";
import type { NenState } from "../character/foundation/nen/types";

import { AWAKENING_CAPABLE, awakeningContext } from "./fixtures/nen";
import {
  assignedNenType,
  unassignedNenType,
} from "../character/foundation/nen/nen-type";

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

const AUTHORIZED = {
  grantedBy: { type: "gm", id: "table-ruling" },
  reason: "Cornered, at the edge of death.",
} as const;

const SPIRITED = { ...AWAKENING_CAPABLE, spi: INSTINCTIVE_AWAKENING_MINIMUM_SPI };

function instinctive(
  attributes = SPIRITED,
  abilityId = "ability-a",
): NenAwakeningTransitionResult {
  return awakenNenInstinctive(awakeningContext({ attributes }), {
    method: "instinctive",
    authorization: AUTHORIZED,
    naturalAbilityId: abilityId,
  });
}

function source(
  overrides: NenExceptionalAwakeningSource["overrides"] = {},
): NenExceptionalAwakeningSource {
  return { ref: { type: "item", id: "a-relic" }, overrides };
}


describe("instinctive awakening", () => {
  it("awakens inside a forced Zetsu, with the Ability that caused it", () => {
    const state = expectState(instinctive());

    expect(state.awakening.condition).toBe("awakened");
    expect(state.awakening.nodes).toBe("open");
    expect(isInForcedZetsu(state.awakening)).toBe(true);
    expect(state.awakening.naturalAbility?.abilityId).toBe("ability-a");
    expect(state.awakening.naturalAbility?.origin).toBe("instinctive");
  });

  it("grants no ordinary mastery of any kind", () => {
    const state = expectState(instinctive());

    for (const rank of Object.values(state.mastery)) expect(rank).toBe(0);
  });

  /* The Zetsu closes the nodes, so there is nothing to leak. */
  it("does not leak", () => {
    const result = instinctive();

    expect(isNenUncontained(expectState(result))).toBe(false);
    expect(kinds(result)).not.toContain("nen-leakage-started");
  });

  it("ends pseudo-Chu like every other awakening", () => {
    const result = instinctive();

    expect(result.success && result.payload.changes.pseudoChuEnded).toBe(true);
    expect(kinds(result)).toContain("nen-pseudo-chu-ended");
  });

  it("refuses SPI 19 even when authorized", () => {
    const result = instinctive({ ...SPIRITED, spi: 19 });

    expect(codes(result)).toEqual(["nen.awakening.eligibility.unsatisfied"]);
  });

  it("accepts SPI 20", () => {
    expect(instinctive({ ...SPIRITED, spi: 20 }).success).toBe(true);
  });

  /*
   * A GATE, not a trigger. SPI 20 makes this possible and causes none of it —
   * there is no rarity roll, so without the authorization nothing happens.
   */
  it("never awakens on SPI alone", () => {
    const unauthorized = awakenNenInstinctive(
      awakeningContext({ attributes: { ...SPIRITED, spi: 30 } }),
      {
        method: "instinctive",
        authorization: undefined as never,
        naturalAbilityId: "ability-a",
      },
    );

    expect(codes(unauthorized)).toContain("nen.awakening.instinctive.unauthorized");
  });

  it("consults no probability at all", () => {
    expect(awakenNenInstinctive.toString()).not.toContain("Math.random");

    const result = instinctive();

    expect(result.success && result.payload.changes.resolutions).toEqual([]);
  });

  it("cannot commit without its Ability", () => {
    const noAbility = awakenNenInstinctive(
      awakeningContext({ attributes: SPIRITED }),
      {
        method: "instinctive",
        authorization: AUTHORIZED,
        naturalAbilityId: "",
      },
    );

    expect(codes(noAbility))
      .toContain("nen.awakening.instinctive.ability.missing");
  });

  it("refuses an already-awakened character as already awakened", () => {
    const awakened = expectState(instinctive());

    const again = awakenNenInstinctive(
      awakeningContext({
        nen: awakened,
        attributes: SPIRITED,
        operationId: "op-2",
      }),
      {
        method: "instinctive",
        authorization: AUTHORIZED,
        naturalAbilityId: "ability-b",
      },
    );

    expect(codes(again)).toContain("nen.awakening.already-awakened");
  });

  /*
   * And refuses a REVERTED one for the right reason. The shared preflight
   * would have refused them too, but for supplying no reawakening hurdle —
   * telling a player to state a hurdle for a route that has none.
   */
  it("is not a route back for a reverted character", () => {
    const awakened = expectState(instinctive());

    const reverted = revertNen(
      awakeningContext({ nen: awakened, operationId: "op-revert" }),
      { source: { type: "curse", id: "c" }, reason: "Severed." },
    );

    expect(reverted.success).toBe(true);
    if (!reverted.success) return;

    const again = awakenNenInstinctive(
      awakeningContext({
        nen: reverted.payload.state,
        attributes: SPIRITED,
        operationId: "op-3",
      }),
      {
        method: "instinctive",
        authorization: AUTHORIZED,
        naturalAbilityId: "ability-b",
      },
    );

    expect(codes(again))
      .toEqual(["nen.awakening.instinctive.not-a-reawakening-route"]);
  });
});


describe("the ability-through-Zetsu exception is bound, not general", () => {
  const state = expectState(instinctive());
  const forced = state.awakening.suppression[0]!;

  it("lets the originating Ability through", () => {
    expect(abilityFunctionsThroughSuppression(forced, "ability-a")).toBe(true);
    expect(abilityFunctionsDespiteSuppression(state.awakening, "ability-a"))
      .toBe(true);
  });

  it("lets nothing else through the same state", () => {
    expect(abilityFunctionsThroughSuppression(forced, "ability-b")).toBe(false);
  });

  it("names the ability, the instance and the source, all three", () => {
    if (forced.kind !== "forced-zetsu") throw new Error("expected a forced Zetsu");

    expect(forced.exemptions).toEqual([{
      abilityId: "ability-a",
      suppressionId: forced.id,
      source: { type: "gm", id: "table-ruling" },
    }]);
  });

  /*
   * The exemption would TRAVEL if it named only the Ability: the same Ability
   * would work through a collapse Zetsu it was never granted an exception for.
   */
  it("does not carry over to a suppression of another kind", () => {
    const foreign = {
      kind: "involuntary-zetsu" as const,
      id: "other-state",
      appliedAt: 0,
      cause: "uncontained-aura-collapse" as const,
      recoveryId: "rec-1",
    };

    expect(abilityFunctionsThroughSuppression(foreign, "ability-a")).toBe(false);
  });

  it("creates no global exception anywhere in the engine", () => {
    /*
     * There is exactly one exemption, on exactly one forced state, and it is
     * the one this awakening produced. Nothing is recorded at the state level.
     */
    expect(state.awakening.suppression).toHaveLength(1);
    expect(Object.keys(state.awakening)).not.toContain("abilityExceptions");
  });
});


describe("exceptional awakening", () => {
  it("applies the standard thresholds when it declares no override", () => {
    const short = awakenNenExceptional(
      awakeningContext({ attributes: { ...AWAKENING_CAPABLE, spi: 10 } }),
      { method: "exceptional", source: source() },
    );

    expect(codes(short)).toContain("nen.awakening.eligibility.unsatisfied");
  });

  it("replaces eligibility when it declares the override", () => {
    const waived = awakenNenExceptional(
      awakeningContext({ attributes: { ...AWAKENING_CAPABLE, spi: 4, con: 4 } }),
      {
        method: "exceptional",
        source: source({
          eligibility: {
            requirements: [],
            summary: "The relic opens anybody who holds it.",
          },
        }),
      },
    );

    expect(waived.success).toBe(true);
    if (!waived.success) return;

    expect(waived.payload.state.awakening.condition).toBe("awakened");
    expect(waived.payload.changes.appliedOverrides)
      .toEqual([{
        field: "eligibility",
        summary: "The relic opens anybody who holds it.",
      }]);
  });

  /*
   * The half that does the work: an override of one field is an override of
   * one field. Everything unmentioned applies exactly as it always did.
   */
  it("grants no Ten, changes no Nen Type and permits no Ability", () => {
    const state = expectState(awakenNenExceptional(
      awakeningContext({ attributes: { ...AWAKENING_CAPABLE, spi: 4 } }),
      {
        method: "exceptional",
        source: source({
          eligibility: { requirements: [], summary: "Waived." },
        }),
      },
    ));

    expect(state.mastery.ten).toBe(0);
    expect(state.awakening.nenType).toEqual(unassignedNenType());
    expect(state.awakening.naturalAbility).toBeNull();

    /* And, having no Ten, it leaks exactly as an abrupt awakening does. */
    expect(isNenUncontained(state)).toBe(true);
  });

  it("forces a Nen Type only when it says so, and records the change", () => {
    const result = awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: source({
        nenType: {
          type: "specialization",
          known: true,
          summary: "The relic rewrites what its bearer is.",
        },
      }),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.state.awakening.nenType)
      .toEqual(assignedNenType("specialization", true));

    expect(result.payload.changes.nenTypeChange).toEqual({
      previous: null,
      next: "specialization",
      cause: "The relic rewrites what its bearer is.",
    });

    expect(kinds(result)).toContain("nen-type-changed");
  });

  /*
   * A declared mastery grant still goes through validateNenAdvancement. An
   * override changes WHAT is granted; it does not excuse the Nen graph.
   */
  it("routes a declared mastery grant through the ordinary path", () => {
    const granted = expectState(awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: source({
        masteryGrant: {
          grants: [{ principleId: "ten", rank: 2 }],
          summary: "The relic teaches containment.",
        },
      }),
    }));

    expect(granted.mastery.ten).toBe(2);
  });

  it("refuses a grant the Nen graph forbids", () => {
    const refused = awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: source({
        masteryGrant: {
          grants: [{ principleId: "hatsu", rank: 1 }],
          summary: "The relic skips the ladder.",
        },
      }),
    });

    expect(codes(refused)).toContain("nen.mastery.prerequisite_not_met");
  });

  it("refuses a grant naming a principle or rank that does not exist", () => {
    expect(codes(awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: source({
        masteryGrant: {
          grants: [{ principleId: "nonsense", rank: 1 }],
          summary: "x",
        },
      }),
    }))).toContain("nen.awakening.override.mastery.principle.unknown");

    expect(codes(awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: source({
        masteryGrant: {
          grants: [{ principleId: "ten", rank: 99 }],
          summary: "x",
        },
      }),
    }))).toContain("nen.awakening.override.mastery.rank.invalid");
  });

  it("adds prerequisites additively and never as a waiver", () => {
    const refused = awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: source({
        prerequisite: {
          requirements: [{
            id: "holds-the-relic",
            requirement: { type: "hasItem", itemId: "a-relic", state: "possessed" },
          }],
          summary: "Must be holding it.",
        },
      }),
    });

    /* Nothing said whether the character holds it, so it is unresolved. */
    expect(codes(refused)).toContain("nen.awakening.eligibility.unresolved");
  });

  it("refuses a source with no provenance", () => {
    expect(codes(awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: { ref: { type: "", id: "" }, overrides: {} },
    }))).toContain("nen.awakening.source.invalid");
  });

  it("refuses an override that does not explain itself", () => {
    expect(codes(awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: source({ eligibility: { requirements: [], summary: "  " } }),
    }))).toContain("nen.awakening.override.summary.missing");
  });

  /*
   * Contradictions are refused BEFORE anything is touched. A source whose two
   * halves cannot both apply would otherwise leave the character in whichever
   * state the second half produced.
   */
  it("refuses prohibiting Ability development while granting an Ability", () => {
    const context = awakeningContext();

    const result = awakenNenExceptional(context, {
      method: "exceptional",
      naturalAbilityId: "ability-a",
      source: source({
        naturalAbilityDevelopment: {
          development: "prohibited",
          summary: "The relic forbids it.",
        },
      }),
    });

    expect(codes(result))
      .toContain("nen.awakening.override.ability.contradictory");
    expect(context.nen.awakening.condition).toBe("unawakened");
  });

  it("refuses two different ranks for one principle", () => {
    expect(codes(awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: source({
        masteryGrant: {
          grants: [
            { principleId: "ten", rank: 1 },
            { principleId: "ten", rank: 3 },
          ],
          summary: "x",
        },
      }),
    }))).toContain("nen.awakening.override.mastery.contradictory");
  });

  it("refuses a requirement id shared between its two bundles", () => {
    expect(codes(awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: source({
        eligibility: {
          requirements: [{ id: "shared", requirement: { type: "levelMinimum", minimum: 1 } }],
          summary: "a",
        },
        prerequisite: {
          requirements: [{ id: "shared", requirement: { type: "levelMinimum", minimum: 2 } }],
          summary: "b",
        },
      }),
    }))).toContain("nen.awakening.override.requirement.duplicate");
  });

  it("records the source and every applied override in the history", () => {
    const state = expectState(awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: source({
        eligibility: { requirements: [], summary: "Waived." },
        progression: { summary: "Advances at half rate hereafter." },
      }),
    }));

    const record = state.awakening.history[0]!;

    expect(record.kind).toBe("awakening");
    if (record.kind !== "awakening") return;

    expect(record.source).toEqual({ type: "item", id: "a-relic" });
    expect(record.eligibilityBypassed).toBe(true);
    expect(record.appliedOverrides.map((one) => one.field))
      .toEqual(["eligibility", "progression"]);
  });

  it("keeps provenance through a JSON round trip", () => {
    const state = expectState(awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: source({
        nenType: { type: "emission", known: true, summary: "Rewritten." },
      }),
    }));

    const restored = JSON.parse(JSON.stringify(state)) as NenState;

    expect(restored.awakening.history).toEqual(state.awakening.history);
    expect(restored.awakening.nenType).toEqual(state.awakening.nenType);
  });

  it("imposes no forced state of its own", () => {
    const state = expectState(awakenNenExceptional(awakeningContext(), {
      method: "exceptional",
      source: source({ eligibility: { requirements: [], summary: "Waived." } }),
    }));

    expect(state.awakening.suppression).toEqual([]);
  });
});
