/*
 * Ten: the coating a body wears for free, and the one place its size is decided.
 *
 * Ten used to be two mechanics that disagreed. ten.ts computed a "containment
 * limit" straight off Physiological Output and modelled imperfect Ten as
 * eating a share of Aura Regeneration Capacity; aura/access.ts separately
 * applied a flat 5% coating at every rank. Nothing called the first, so the
 * second was the real rule — which made Ten X indistinguishable from Ten I,
 * and made a principle that costs nothing cost regeneration on paper.
 *
 * One formula replaced both:
 *
 *   intendedCoating = max(
 *     physiologicalOutput * renAccessFraction * containmentFraction,
 *     physiologicalOutput * 0.05,
 *   )
 *
 * The two terms are doing different jobs and both are needed. The Mastery term
 * is what containment skill makes of the Output REN has opened — so Ten and
 * Ren multiply, and neither is worth anything alone. The floor is what a body
 * does regardless of skill, and it is the entire answer for the character who
 * has learned Ten and no Ren, who would otherwise be wearing nothing.
 *
 * Working numbers used below, standard human:
 *
 *   CON 20        Physiological Output 10,000, Maximum Aura 50,000
 *   whole body    60.00 L    16,900 cm2  (1.69 m2)
 *   one Arm        2.37 L     1,183 cm2  (0.1183 m2)
 */

import { describe, expect, it } from "vitest";

import { advanceAuraTime } from "../character/foundation/aura/time";
import { resolveAuraBudget } from "../character/foundation/aura/budget";
import { resolveAuraProfile } from "../character/foundation/aura/resolution";
import { restedWakefulness } from "../character/foundation/body/endurance";
import {
  gameTimeIntervalOf,
  hoursToDuration,
} from "../time/interval";
import * as ten from "../character/foundation/nen/principles/ten";
import {
  resolveTenCoating,
  TEN_MASTERY_PROFILES,
  TEN_MINIMUM_COATING_OUTPUT_FRACTION,
  tenSurfaceCoating,
} from "../character/foundation/nen/principles/ten";
import type { AuraAccessInput } from "../character/foundation/aura/types";
import type { MasteryRank } from "../character/capabilities/mastery";

import { auraContext, UNCONTAINED, withTen } from "./fixtures/aura";

/* CON 20 / VIT 20: Physiological Output 10,000, Maximum Aura 50,000. */
const STRONG = { con: 20, vit: 20 } as const;

const RANKS: readonly MasteryRank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Ten at `mastery`, with Ren opening `renFraction` of physiological Output. */
function tenWithRen(
  mastery: number,
  renFraction: number,
): AuraAccessInput {
  return withTen(mastery, {
    kind: "output-access",
    source: `ren:${renFraction}`,
    accessFraction: renFraction,
  });
}

function coating(input: {
  physiologicalOutput: number;
  renAccessFraction: number;
  mastery: number;
}) {
  const result = resolveTenCoating(input);

  if (!result.success) {
    throw new Error(
      "Expected the Ten coating to resolve: " +
      result.errors.map((error) => error.code).join(", "),
    );
  }

  return result.payload;
}

function errorCodes(
  result: { success: boolean; errors?: readonly { code: string }[] },
): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((error) => error.code);
}

/** The whole-body coating a character actually ends up wearing. */
function automaticAura(options: {
  readonly access: AuraAccessInput;
  readonly current?: number;
}): number {
  const result = resolveAuraBudget(
    options.current ?? 40_000,
    auraContext({ attributes: STRONG, access: options.access }),
  );

  if (!result.success) {
    throw new Error(
      "Expected the budget to resolve: " +
      result.errors.map((error) => error.code).join(", "),
    );
  }

  return result.payload.automaticAura;
}


/*
 * The ticket's four worked cases, at the Physiological Output it states.
 *
 * They are the whole shape of the rule in four lines: the floor wins when
 * neither Ten nor Ren is developed, either one developed alone doubles it, and
 * both developed together is the only way to reach the body's whole Output.
 */
describe("the coating at Physiological Output 20", () => {
  const cases: readonly (readonly [string, number, number, number])[] = [
    ["Ten I + Ren I", 1, 0.1, 1],
    ["Ten X + Ren I", 10, 0.1, 2],
    ["Ten I + Ren X", 1, 1.0, 2],
    ["Ten X + Ren X", 10, 1.0, 20],
  ];

  for (const [label, mastery, renAccessFraction, expected] of cases) {
    it(`resolves ${expected} Aura for ${label}`, () => {
      expect(coating({
        physiologicalOutput: 20,
        renAccessFraction,
        mastery,
      }).intendedCoating).toBeCloseTo(expected, 10);
    });
  }

  it("takes the floor for Ten I + Ren I and the Mastery share for the rest", () => {
    const sourceOf = (mastery: number, renAccessFraction: number) =>
      coating({ physiologicalOutput: 20, renAccessFraction, mastery }).source;

    expect(sourceOf(1, 0.1)).toBe("minimum");
    expect(sourceOf(10, 0.1)).toBe("mastery");
    expect(sourceOf(1, 1.0)).toBe("mastery");
    expect(sourceOf(10, 1.0)).toBe("mastery");
  });

  it("reports both terms, not only the one that won", () => {
    const resolved = coating({
      physiologicalOutput: 20,
      renAccessFraction: 0.1,
      mastery: 1,
    });

    expect(resolved.renAccessibleOutput).toBeCloseTo(2, 10);
    expect(resolved.masteryCoating).toBeCloseTo(0.2, 10);
    expect(resolved.minimumCoating).toBeCloseTo(1, 10);
    expect(resolved.intendedCoating).toBeCloseTo(1, 10);
  });
});


describe("Ten without Ren", () => {
  /*
   * The case the floor exists for. Ten's Mastery term is a share of what Ren
   * opened, and a character with no Ren has had nothing opened — so at every
   * rank from I to X the Mastery term is zero and the floor is the whole
   * coating. Perfect containment of nothing is still nothing.
   */
  it("resolves the 5% floor at every rank", () => {
    expect(TEN_MINIMUM_COATING_OUTPUT_FRACTION).toBe(0.05);

    for (const mastery of RANKS) {
      const resolved = coating({
        physiologicalOutput: 20,
        renAccessFraction: 0,
        mastery,
      });

      expect([mastery, resolved.intendedCoating, resolved.source])
        .toEqual([mastery, 1, "minimum"]);
    }
  });

  it("wears that floor on an actual body", () => {
    for (const mastery of RANKS) {
      expect([mastery, automaticAura({ access: withTen(mastery) })])
        .toEqual([mastery, 500]);
    }
  });
});


describe("Ten and Ren multiply", () => {
  /*
   * The same four cases again, through the whole Aura pipeline rather than
   * through the formula alone — because the formula being right is worth
   * nothing if the budget is still applying a rule of its own.
   */
  it("scales the resolved coating by both", () => {
    expect(automaticAura({ access: tenWithRen(1, 0.1) })).toBeCloseTo(500, 10);
    expect(automaticAura({ access: tenWithRen(10, 0.1) })).toBeCloseTo(1000, 10);
    expect(automaticAura({ access: tenWithRen(1, 1.0) })).toBeCloseTo(1000, 10);
    expect(automaticAura({ access: tenWithRen(10, 1.0) })).toBeCloseTo(10_000, 10);
  });

  /*
   * Ten's containment fraction is a share of REN-accessible Output, so every
   * rank's own table entry has to survive the trip. Checked against the
   * profile rather than restated, so a changed table fails here.
   */
  it("holds exactly its rank's share of what Ren opened", () => {
    for (const mastery of RANKS) {
      const share = TEN_MASTERY_PROFILES[mastery].containmentFraction;

      expect([mastery, automaticAura({ access: tenWithRen(mastery, 1.0) })])
        .toEqual([mastery, 10_000 * share]);
    }
  });
});


describe("the coating Ten places", () => {
  function profileWithTen(mastery: number, renFraction = 1.0) {
    const result = resolveAuraProfile({
      state: { current: 40_000, allocations: [] },
      ...auraContext({
        attributes: STRONG,
        access: tenWithRen(mastery, renFraction),
      }),
    });

    if (!result.success) {
      throw new Error(
        "Expected the profile to resolve: " +
        result.errors.map((error) => error.code).join(", "),
      );
    }

    return result.payload;
  }

  /*
   * Automatic, whole-body and surface-only, at EVERY rank. Ten is not
   * something a character declares and not something they can aim: a rank that
   * placed its coating anywhere but over the whole skin would be a different
   * principle wearing Ten's name.
   */
  it("is automatic, whole-body and surface-only at every rank", () => {
    for (const mastery of RANKS) {
      const resolved = profileWithTen(mastery);

      expect(resolved.distribution.allocations.length).toBeGreaterThan(0);

      for (const allocation of resolved.distribution.allocations) {
        expect([
          allocation.allocationId,
          allocation.source,
          allocation.coverage,
          allocation.placement,
        ]).toEqual(["baseline-ten", "baseline-ten", "whole-body", "surface"]);
      }
    }
  });

  /*
   * Evenly, which is the other half of "coats the body". Differently sized
   * parts take different AMOUNTS of Aura and arrive at the same density — the
   * Arm is 1,183 cm2 of a 16,900 cm2 body and holds 1183/16900 of the coating.
   */
  it("spreads at equal density over differently sized Body Parts", () => {
    const resolved = profileWithTen(10);

    const densities = resolved.byBodyPart.map(
      (part) => part.surface!.density.auraPerSquareMeter,
    );

    expect(densities.length).toBeGreaterThan(1);

    for (const density of densities) {
      expect(density).toBeCloseTo(10_000 / 1.69, 10);
    }

    /* And the amounts genuinely differ, so the equality above means something. */
    expect(new Set(resolved.byBodyPart.map((part) => part.surface!.aura)).size)
      .toBeGreaterThan(1);
  });

  it("never places anything inside the body", () => {
    for (const mastery of RANKS) {
      for (const part of profileWithTen(mastery).byBodyPart) {
        expect(part.internal?.aura ?? 0).toBe(0);
      }
    }
  });
});


describe("Ten costs nothing", () => {
  /*
   * The claim the old model contradicted twice over — once by charging
   * regeneration for imperfect Ten, once by describing the coating as a
   * commitment. Allocation is not expenditure: the coating draws on OUTPUT,
   * which is a rate the body sustains, and reads Current Aura only as a
   * ceiling.
   */
  it("deducts no Current Aura to place the coating", () => {
    for (const mastery of RANKS) {
      const result = resolveAuraBudget(
        40_000,
        auraContext({ attributes: STRONG, access: tenWithRen(mastery, 1.0) }),
      );

      if (!result.success) throw new Error("Expected the budget to resolve.");

      expect([mastery, result.payload.pool.current]).toEqual([mastery, 40_000]);
    }
  });

  /*
   * An hour of ordinary waking life with Ten up, and nothing leaves the
   * reserve. No upkeep, no passive leak, and no reduction of what regeneration
   * puts back — an awake character regenerates nothing by design, so the
   * balance being empty in BOTH directions is the assertion.
   */
  it("charges no upkeep and leaks nothing over an hour", () => {
    for (const mastery of RANKS) {
      const result = advanceAuraTime({
        state: { current: 20_000, allocations: [] },
        wakefulness: restedWakefulness(),
        context: auraContext({
          attributes: STRONG,
          access: tenWithRen(mastery, 1.0),
        }),
        interval: gameTimeIntervalOf(1_000_000_000, hoursToDuration(1)),
        activity: { mode: "ordinary-waking" },
      });

      if (!result.success) throw new Error("Expected the interval to resolve.");

      expect([
        mastery,
        result.payload.balance.upkeep,
        result.payload.balance.leakage,
        result.payload.state.current,
      ]).toEqual([mastery, 0, 0, 20_000]);
    }
  });

  /*
   * And it takes no share of regeneration, which is the specific arithmetic
   * the old resolveTenPassiveContainment invented. A full night's sleep
   * recovers the same Aura at Ten I as at Ten X.
   */
  it("reduces regeneration at no rank", () => {
    const recovered = (mastery: number) => {
      const result = advanceAuraTime({
        state: { current: 0, allocations: [] },
        wakefulness: restedWakefulness(),
        context: auraContext({
          attributes: STRONG,
          access: tenWithRen(mastery, 1.0),
        }),
        interval: gameTimeIntervalOf(1_000_000_000, hoursToDuration(4)),
        activity: { mode: "sleep" },
      });

      if (!result.success) throw new Error("Expected the interval to resolve.");

      return result.payload.balance.recovery;
    };

    const atRankOne = recovered(1);

    expect(atRankOne).toBeGreaterThan(0);

    for (const mastery of RANKS) {
      expect([mastery, recovered(mastery)]).toEqual([mastery, atRankOne]);
    }
  });

  /*
   * Stated as a rule about the file rather than about a number, because the
   * removed model's distinguishing feature was a per-rank regeneration
   * penalty, and the cheapest way to bring it back is a second table.
   */
  it("exports no replenishment or passive-leakage API at all", () => {
    const surface = Object.keys(ten);

    expect(surface).not.toContain("resolveTenPassiveContainment");
    expect(surface).not.toContain("deriveTenReplenishmentMultiplier");
    expect(surface).not.toContain("resolveTenContainment");

    for (const profile of Object.values(TEN_MASTERY_PROFILES)) {
      expect(Object.keys(profile).sort())
        .toEqual(["containmentFraction", "minimumDex", "rank"]);
    }
  });
});


describe("containment is the whole of what Ten does", () => {
  it("leaves a character with no Ten in the uncontained leakage path", () => {
    const result = advanceAuraTime({
      state: { current: 20_000, allocations: [] },
      wakefulness: restedWakefulness(),
      context: auraContext({ attributes: STRONG, access: UNCONTAINED }),
      interval: gameTimeIntervalOf(1_000_000_000, hoursToDuration(1)),
      activity: { mode: "ordinary-waking" },
    });

    if (!result.success) throw new Error("Expected the interval to resolve.");

    expect(result.payload.balance.leakage).toBeGreaterThan(0);
  });

  it("takes every functioning rank out of it", () => {
    for (const mastery of RANKS) {
      const result = resolveAuraBudget(
        40_000,
        auraContext({ attributes: STRONG, access: withTen(mastery) }),
      );

      if (!result.success) throw new Error("Expected the budget to resolve.");

      expect([mastery, result.payload.access.uncontained])
        .toEqual([mastery, false]);
    }
  });

  /*
   * Suppression closes the nodes, which removes the coating AND stops the
   * leak. Those two going together is the point: a character in Zetsu is not
   * an uncontained character who happens to have no coating.
   */
  it("is removed by suppression, which stops the leak rather than starting one", () => {
    const suppressed = withTen(10, { kind: "suppressed", source: "zetsu" });

    const budget = resolveAuraBudget(
      40_000,
      auraContext({ attributes: STRONG, access: suppressed }),
    );

    if (!budget.success) throw new Error("Expected the budget to resolve.");

    expect(budget.payload.access.automaticSurfaceCoating).toBeNull();
    expect(budget.payload.automatic).toEqual([]);
    expect(budget.payload.automaticAura).toBe(0);
    expect(budget.payload.access.uncontained).toBe(false);

    const hour = advanceAuraTime({
      state: { current: 20_000, allocations: [] },
      wakefulness: restedWakefulness(),
      context: auraContext({ attributes: STRONG, access: suppressed }),
      interval: gameTimeIntervalOf(1_000_000_000, hoursToDuration(1)),
      activity: { mode: "ordinary-waking" },
    });

    if (!hour.success) throw new Error("Expected the interval to resolve.");

    expect(hour.payload.balance.leakage).toBe(0);
  });
});


describe("the coating is capped, never charged", () => {
  /*
   * A reserve smaller than the coating does not make Ten fail; it makes the
   * coating smaller. The character is still contained, still wearing what they
   * can afford to hold out, and still paying nothing for it.
   */
  it("funds what the reserve can hold and no more", () => {
    const placed = automaticAura({
      access: tenWithRen(10, 1.0),
      current: 250,
    });

    expect(placed).toBe(250);
  });

  /*
   * And the floor is subject to the same cap rather than exempt from it. Ten's
   * 5% is what it INTENDS, which is a different question from what a drained
   * body can currently put out.
   */
  it("caps the 5% floor too", () => {
    expect(automaticAura({ access: withTen(1), current: 120 })).toBe(120);
  });
});


describe("bad input is refused rather than absorbed", () => {
  const cases: readonly (readonly [string, Parameters<typeof resolveTenCoating>[0], string])[] = [
    [
      "a negative Physiological Output",
      { physiologicalOutput: -1, renAccessFraction: 0.5, mastery: 3 },
      "nen.ten.physiological_output.invalid",
    ],
    [
      "a Physiological Output that is not a number",
      { physiologicalOutput: Number.NaN, renAccessFraction: 0.5, mastery: 3 },
      "nen.ten.physiological_output.invalid",
    ],
    [
      "a Ren share stated as a percentage",
      { physiologicalOutput: 20, renAccessFraction: 30, mastery: 3 },
      "nen.ten.ren_access_fraction.invalid",
    ],
    [
      "a negative Ren share",
      { physiologicalOutput: 20, renAccessFraction: -0.1, mastery: 3 },
      "nen.ten.ren_access_fraction.invalid",
    ],
    [
      "a Mastery rank nobody can hold",
      { physiologicalOutput: 20, renAccessFraction: 0.5, mastery: 11 },
      "nen.ten.mastery.invalid",
    ],
    [
      "an unlearned Mastery",
      { physiologicalOutput: 20, renAccessFraction: 0.5, mastery: 0 },
      "nen.ten.mastery.invalid",
    ],
  ];

  for (const [label, input, code] of cases) {
    it(`refuses ${label}`, () => {
      const result = resolveTenCoating(input);

      expect(errorCodes(result)).toContain(code);
    });
  }

  it("traces the refusal rather than returning a bare failure", () => {
    const result = resolveTenCoating({
      physiologicalOutput: 20,
      renAccessFraction: 0.5,
      mastery: 11,
    });

    expect(result.trace.root.id).toBe("nen.ten.coating");
    expect(result.trace.root.formula).toContain("max(");
    expect(result.trace.root.inputs).toMatchObject({
      physiologicalOutput: { value: 20 },
      mastery: { value: 11 },
    });
  });

  it("traces the arithmetic when it succeeds", () => {
    const result = resolveTenCoating({
      physiologicalOutput: 20,
      renAccessFraction: 1,
      mastery: 10,
    });

    expect(result.success).toBe(true);
    expect(result.trace.root.output).toMatchObject({
      intendedCoating: 20,
      minimumCoating: 1,
      source: "mastery",
    });
  });

  /*
   * The projection is total where the resolver is strict, and deliberately so:
   * it answers "is Ten running, and wearing what" for states Aura has to be
   * able to resolve, including states with no Ten in them at all.
   */
  it("projects nothing for a character Ten does not reach", () => {
    expect(tenSurfaceCoating(0, 0.5)).toBeNull();
    expect(tenSurfaceCoating(11, 0.5)).toBeNull();
    expect(tenSurfaceCoating(1.5, 0.5)).toBeNull();
  });

  it("projects the floor rather than a wrong coating for a malformed Ren share", () => {
    expect(tenSurfaceCoating(10, Number.NaN)).toEqual({
      source: "baseline-ten",
      outputFraction: 0.05,
      masteryFraction: 0,
      minimumFraction: 0.05,
    });
  });
});
