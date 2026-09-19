/*
 * Ken: a contained Output, limited from four directions at once.
 *
 *   Cken    = P * kenContainmentFraction      10% at I .. 100% at X
 *   Oren    = P * renAccessFraction           10% at I .. 100% at X
 *   OkenMax = min(Cken, Oren, sharedOutputRemaining, availableAura)
 *
 *   outputLoad      = Oactive / Oren          against Ren's rank clock
 *   containmentLoad = Oactive / Cken          against Ken's rank clock
 *
 * The ceiling is a MINIMUM: containment the character cannot fill and access
 * they cannot hold are both worthless, and `limitedBy` says which it was.
 *
 * Ken contains everything it holds. No leakage at any rank, no upkeep, no
 * outward flow, and Ken I's coating is exactly the coating Ten places.
 *
 * Working numbers: a standard strong human at P = 10,000.
 */

import { describe, expect, it } from "vitest";

import * as ken from "../character/foundation/nen/principles/ken";
import {
  KEN_MASTERY_PROFILES,
  KEN_MASTERY_TRACK,
  NEN_CONTAINMENT_CLOCK_ID,
  deriveKenCoatingDensity,
  deriveKenContainmentCapacity,
  deriveKenContainmentFraction,
  deriveKenFullContainmentDurationSeconds,
  getKenMasteryProfile,
  reduceKenSelectionTo,
  resolveKenOutputCeiling,
  resolveKenSelection,
  type KenOutputCeilingInput,
} from "../character/foundation/nen/principles/ken";
import { TEN_COATING_OUTPUT_FRACTION } from "../character/foundation/nen/principles/ten";
import { deriveRenFullOutputDurationSeconds } from "../character/foundation/nen/principles/ren";
import { MASTERY_RANKS, type MasteryRank } from "../character/capabilities/mastery";

import { errorCodesOf, payloadOf } from "./fixtures/result";

const P = 10_000;

/** A ceiling input at P, with the two situational constraints out of the way. */
function ceilingInput(
  kenMastery: MasteryRank,
  renMastery: MasteryRank,
  overrides: Partial<KenOutputCeilingInput> = {},
): KenOutputCeilingInput {
  return {
    physiologicalOutput: P,
    kenMastery,
    renMastery,
    sharedOutputRemaining: Number.MAX_SAFE_INTEGER,
    availableAura: Number.MAX_SAFE_INTEGER,
    ...overrides,
  };
}


/* ── Mastery ────────────────────────────────────────────────────────────── */

describe("Ken's Mastery table", () => {
  it("keeps every containment fraction and every full-containment duration", () => {
    expect(Object.values(KEN_MASTERY_PROFILES).map((one) => [
      one.rank,
      one.containmentFraction,
      one.fullContainmentDurationSeconds,
    ])).toEqual([
      [1, 0.1, 30],
      [2, 0.2, 60],
      [3, 0.3, 150],
      [4, 0.4, 300],
      [5, 0.5, 600],
      [6, 0.6, 900],
      [7, 0.7, 1800],
      [8, 0.8, 3600],
      [9, 0.9, 7200],
      [10, 1, null],
    ]);
  });

  it("reads 30 seconds and 2.5 minutes exactly", () => {
    expect(deriveKenFullContainmentDurationSeconds(1)).toBe(30);
    expect(deriveKenFullContainmentDurationSeconds(3)).toBe(2.5 * 60);
  });

  it("has no physiological containment limit at Mastery X", () => {
    expect(deriveKenFullContainmentDurationSeconds(10)).toBeNull();
    expect(KEN_MASTERY_PROFILES[10].fullContainmentDurationSeconds).toBeNull();
  });

  it("carries containment and endurance and NOTHING about leakage", () => {
    for (const profile of Object.values(KEN_MASTERY_PROFILES)) {
      expect(Object.keys(profile).sort()).toEqual([
        "containmentFraction",
        "fullContainmentDurationSeconds",
        "rank",
      ]);
    }

    /*
     * Not "leakage is zero" — there is no leakage concept here at all. A zero
     * placeholder is a field a later rank could raise off the floor, which is
     * exactly the coupling Ken exists without.
     */
    for (const name of Object.keys(ken)) {
      expect(name).not.toMatch(/leak|upkeep|flow|recovery|coatingType|forceBonus/i);
    }
  });

  it("reads no Ten mastery anywhere in its API", () => {
    for (const name of Object.keys(ken)) {
      expect(name).not.toMatch(/ten/i);
    }
  });

  it("exposes its own containment clock, distinct from Ren's output clock", () => {
    expect(NEN_CONTAINMENT_CLOCK_ID).toBe("containment");
  });

  it("describes all ten ranks", () => {
    expect(KEN_MASTERY_TRACK.maximumMastery).toBe(10);
    expect(KEN_MASTERY_TRACK.ranks).toHaveLength(10);
  });

  it("resolves a capacity of P x fraction at every rank", () => {
    const expected = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10_000];

    for (const rank of MASTERY_RANKS) {
      expect([rank, deriveKenContainmentCapacity(P, rank)])
        .toEqual([rank, expected[rank - 1]]);
      expect([rank, getKenMasteryProfile(rank).containmentFraction])
        .toEqual([rank, deriveKenContainmentFraction(rank)]);
    }
  });
});


/* ── The ceiling is a minimum ───────────────────────────────────────────── */

describe("the Ken Output ceiling takes the minimum of four constraints", () => {
  const cases = [
    {
      bound: "containment",
      input: ceilingInput(1, 10, { sharedOutputRemaining: 5000, availableAura: 5000 }),
      ceiling: 1000,
    },
    {
      bound: "ren-access",
      input: ceilingInput(10, 1, { sharedOutputRemaining: 5000, availableAura: 5000 }),
      ceiling: 1000,
    },
    {
      bound: "shared-output",
      input: ceilingInput(10, 10, { sharedOutputRemaining: 250, availableAura: 5000 }),
      ceiling: 250,
    },
    {
      bound: "aura",
      input: ceilingInput(10, 10, { sharedOutputRemaining: 5000, availableAura: 125 }),
      ceiling: 125,
    },
  ] as const;

  for (const { bound, input, ceiling } of cases) {
    it(`is bound by ${bound}, and a maximum would answer differently`, () => {
      const resolved = payloadOf(resolveKenOutputCeiling(input));

      expect([resolved.ceiling, resolved.limitedBy]).toEqual([ceiling, bound]);

      const asMaximum = Math.max(
        resolved.containmentCapacity,
        resolved.renAccess,
        resolved.sharedOutputRemaining,
        resolved.availableAura,
      );

      expect(asMaximum).toBeGreaterThan(resolved.ceiling);
    });
  }

  it("limits a strong container with weak access by access", () => {
    /* Ken III holds 3,000; Ren II only opens 2,000. */
    const resolved = payloadOf(resolveKenOutputCeiling(ceilingInput(3, 2)));

    expect([resolved.containmentCapacity, resolved.renAccess]).toEqual([3000, 2000]);
    expect([resolved.ceiling, resolved.limitedBy]).toEqual([2000, "ren-access"]);
  });

  it("limits strong access with a weak container by containment", () => {
    /* Ken II holds 2,000; Ren III opens 3,000 it cannot hold. */
    const resolved = payloadOf(resolveKenOutputCeiling(ceilingInput(2, 3)));

    expect([resolved.containmentCapacity, resolved.renAccess]).toEqual([2000, 3000]);
    expect([resolved.ceiling, resolved.limitedBy]).toEqual([2000, "containment"]);
  });

  it("breaks exact ties in the declared order", () => {
    const at = (input: KenOutputCeilingInput) =>
      payloadOf(resolveKenOutputCeiling(input)).limitedBy;

    expect(at(ceilingInput(1, 1, { sharedOutputRemaining: 1000, availableAura: 1000 })))
      .toBe("containment");
    expect(at(ceilingInput(2, 1, { sharedOutputRemaining: 1000, availableAura: 1000 })))
      .toBe("ren-access");
    expect(at(ceilingInput(2, 2, { sharedOutputRemaining: 1000, availableAura: 1000 })))
      .toBe("shared-output");
    expect(at(ceilingInput(2, 2, { sharedOutputRemaining: 2000, availableAura: 1000 })))
      .toBe("aura");
  });

  it("refuses malformed inputs rather than throwing", () => {
    expect(errorCodesOf(resolveKenOutputCeiling(
      ceilingInput(5, 5, { physiologicalOutput: -1 }),
    ))).toContain("nen.ken.physiological_output.invalid");

    expect(errorCodesOf(resolveKenOutputCeiling(
      ceilingInput(0 as unknown as MasteryRank, 5),
    ))).toContain("nen.ken.mastery.invalid");

    expect(errorCodesOf(resolveKenOutputCeiling(
      ceilingInput(5, 11 as unknown as MasteryRank),
    ))).toContain("nen.ken.ren_mastery.invalid");

    expect(errorCodesOf(resolveKenOutputCeiling(
      ceilingInput(5, 5, { sharedOutputRemaining: Number.NaN }),
    ))).toContain("nen.ken.shared_output.invalid");

    expect(errorCodesOf(resolveKenOutputCeiling(
      ceilingInput(5, 5, { availableAura: Number.POSITIVE_INFINITY }),
    ))).toContain("nen.ken.available_aura.invalid");
  });
});


/* ── Selection ──────────────────────────────────────────────────────────── */

describe("selecting a Ken Output", () => {
  const select = (requestedOutput: number) =>
    resolveKenSelection({ ...ceilingInput(5, 5), requestedOutput });

  it("accepts the exact ceiling and anything under it", () => {
    expect(payloadOf(select(5000)).activeOutput).toBe(5000);
    expect(payloadOf(select(1)).activeOutput).toBe(1);
  });

  it("refuses an above-ceiling request rather than scaling it down", () => {
    const refused = resolveKenSelection({ ...ceilingInput(5, 5), requestedOutput: 5000.0001 });

    expect(errorCodesOf(refused)).toEqual(["nen.ken.ceiling.exceeded"]);
    expect(refused.success).toBe(false);
  });

  it("refuses zero, negative and non-finite requests", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect([bad, errorCodesOf(select(bad))])
        .toEqual([bad, ["nen.ken.requested_output.invalid"]]);
    }
  });

  it("computes both loads exactly at full Output and at half", () => {
    const full = payloadOf(select(5000));
    const half = payloadOf(select(2500));

    expect([full.outputLoad, full.containmentLoad]).toEqual([1, 1]);
    expect([half.outputLoad, half.containmentLoad]).toEqual([0.5, 0.5]);
  });

  it("loads the two clocks differently when the two ranks differ", () => {
    /* Ken V holds 5,000 of the 10,000 Ren X can open: full container, half access. */
    const selection = payloadOf(resolveKenSelection({
      ...ceilingInput(5, 10),
      requestedOutput: 5000,
    }));

    expect(selection.ceiling.limitedBy).toBe("containment");
    expect([selection.outputLoad, selection.containmentLoad]).toEqual([0.5, 1]);
  });

  it("reports the Ren rank's output clock and the Ken rank's containment clock", () => {
    const selection = payloadOf(resolveKenSelection({
      ...ceilingInput(5, 5),
      requestedOutput: 5000,
    }));

    expect(selection.containmentDurationSeconds).toBe(600);
    expect(selection.outputDurationSeconds).toBe(deriveRenFullOutputDurationSeconds(5));
    expect(selection.outputDurationSeconds).toBe(1200);
  });

  it("extends each finite clock in proportion as the Output drops", () => {
    const full = payloadOf(select(5000));
    const half = payloadOf(select(2500));
    const quarter = payloadOf(select(1250));

    expect(full.containmentDurationSeconds! / full.containmentLoad).toBe(600);
    expect(half.containmentDurationSeconds! / half.containmentLoad).toBe(1200);
    expect(quarter.containmentDurationSeconds! / quarter.containmentLoad).toBe(2400);

    expect(full.outputDurationSeconds! / full.outputLoad).toBe(1200);
    expect(half.outputDurationSeconds! / half.outputLoad).toBe(2400);
    expect(quarter.outputDurationSeconds! / quarter.outputLoad).toBe(4800);
  });

  it("leaves Ken X's containment clock unlimited at any Output", () => {
    const selection = payloadOf(resolveKenSelection({
      ...ceilingInput(10, 10),
      requestedOutput: 10_000,
    }));

    expect(selection.containmentDurationSeconds).toBeNull();
    expect(selection.containmentLoad).toBe(1);
  });

  it("refuses a positive Output through zero access and zero capacity, by name", () => {
    /*
     * A body with no Physiological Output has neither, and both are said out
     * loud rather than collapsed into "above the ceiling" — which is the wrong
     * sentence for someone who can hold nothing at all, and would leave the two
     * loads dividing by zero on the way to Infinity.
     */
    const nothing = resolveKenSelection({
      physiologicalOutput: 0,
      kenMastery: 5,
      renMastery: 5,
      sharedOutputRemaining: 100,
      availableAura: 100,
      requestedOutput: 1,
    });

    expect(errorCodesOf(nothing)).toEqual([
      "nen.ken.ren_access.absent",
      "nen.ken.containment.absent",
    ]);
  });
});


/* ── Reduction to a lowered ceiling ─────────────────────────────────────── */

describe("reducing a running Ken to a lowered ceiling", () => {
  const lowered = (ceiling: number) => ({
    containmentCapacity: ceiling,
    renAccess: 10_000,
    sharedOutputRemaining: 10_000,
    availableAura: 10_000,
    ceiling,
    limitedBy: "containment" as const,
  });

  it("takes the greatest valid amount at or below the current Output", () => {
    expect(reduceKenSelectionTo(lowered(1500), 5000)).toBe(1500);
    expect(reduceKenSelectionTo(lowered(1500), 800)).toBe(800);
    expect(reduceKenSelectionTo(lowered(1500), 1500)).toBe(1500);
  });

  it("returns zero — Ken must end — when nothing is left", () => {
    expect(reduceKenSelectionTo(lowered(0), 5000)).toBe(0);
  });

  it("reduces a malformed current Output to zero rather than preserving it", () => {
    expect(reduceKenSelectionTo(lowered(1500), Number.NaN)).toBe(0);
    expect(reduceKenSelectionTo(lowered(1500), -1)).toBe(0);
  });
});


/* ── Coating density ────────────────────────────────────────────────────── */

describe("the density a contained Output makes over a surface", () => {
  const AREA = 1.69;

  it("divides the Output by the area", () => {
    expect(payloadOf(deriveKenCoatingDensity(1000, 2))).toBe(500);
  });

  it("gives Ken I exactly the density Ten's 10%P coating gives", () => {
    const kenI = payloadOf(deriveKenCoatingDensity(
      deriveKenContainmentCapacity(P, 1),
      AREA,
    ));

    const ten = (P * TEN_COATING_OUTPUT_FRACTION) / AREA;

    expect(kenI).toBe(ten);
    expect(deriveKenContainmentFraction(1)).toBe(TEN_COATING_OUTPUT_FRACTION);
  });

  it("refuses a non-positive or non-finite area", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect([bad, errorCodesOf(deriveKenCoatingDensity(1000, bad))])
        .toEqual([bad, ["nen.ken.density.area.invalid"]]);
    }
  });

  it("refuses a malformed Output", () => {
    expect(errorCodesOf(deriveKenCoatingDensity(Number.NaN, 2)))
      .toEqual(["nen.ken.density.active_output.invalid"]);
  });
});
