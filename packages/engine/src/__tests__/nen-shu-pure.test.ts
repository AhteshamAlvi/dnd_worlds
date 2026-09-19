/*
 * Shū: how much of the user's Aura reaches an Item, and what it does there.
 *
 *   Ti              = 0.5^itemDepth * product(kappa, destination included)
 *   Hi              = efficiency * Ti * (density / D0),   D0 = 1 Aura/m2
 *   Fi              = 1 + Hi
 *   effectiveStress = incomingStress / Fi
 *   mitigation      = incomingStress - effectiveStress
 *
 * Nothing is rounded at any stage. Shū spends no Aura, opens no Output and
 * runs no clock: Output after Shū is Output before Shū.
 *
 * Mastery X's `null` Item cap means "no number", never "everything touching
 * you" — the selection is still finite, explicit and connected.
 */

import { describe, expect, it } from "vitest";

import * as shu from "../character/foundation/nen/principles/shu";
import {
  SHU_ADVANCEMENT_DEX,
  SHU_MASTERY_PROFILES,
  SHU_MASTERY_TRACK,
  SHU_REFERENCE_DENSITY,
  deriveShuEfficiency,
  deriveShuEnhancementFactor,
  deriveShuIntegrityMitigation,
  deriveShuMaximumItems,
  deriveShuPathTransmission,
  getShuMasteryProfile,
  withinShuItemLimit,
} from "../character/foundation/nen/principles/shu";
import { MASTERY_RANKS } from "../character/capabilities/mastery";

import { errorCodesOf, payloadOf } from "./fixtures/result";


/* ── Mastery ────────────────────────────────────────────────────────────── */

describe("Shū's Mastery table", () => {
  it("keeps every Item count and every efficiency", () => {
    expect(Object.values(SHU_MASTERY_PROFILES).map((one) => [
      one.rank,
      one.maximumItems,
      one.enhancementEfficiency,
    ])).toEqual([
      [1, 1, 0.2],
      [2, 1, 0.3],
      [3, 2, 0.4],
      [4, 2, 0.5],
      [5, 3, 0.6],
      [6, 4, 0.7],
      [7, 5, 0.8],
      [8, 7, 0.9],
      [9, 10, 0.95],
      [10, null, 1],
    ]);

    for (const rank of MASTERY_RANKS) {
      expect([rank, deriveShuMaximumItems(rank), deriveShuEfficiency(rank)])
        .toEqual([
          rank,
          getShuMasteryProfile(rank).maximumItems,
          getShuMasteryProfile(rank).enhancementEfficiency,
        ]);
    }
  });

  it("keeps the advancement Dexterity figures, repeated ranks included", () => {
    expect(Object.values(SHU_ADVANCEMENT_DEX))
      .toEqual([16, 16, 17, 18, 19, 20, 21, 22, 24, 26]);
  });

  it("uncaps the count at Mastery X without uncapping the selection", () => {
    expect(deriveShuMaximumItems(10)).toBeNull();
    expect(withinShuItemLimit(10, 0)).toBe(true);
    expect(withinShuItemLimit(10, 1)).toBe(true);
    expect(withinShuItemLimit(10, 10_000)).toBe(true);

    /* Still a list of Items, so still a count — not a region or an inventory. */
    expect(withinShuItemLimit(10, 2.5)).toBe(false);
    expect(withinShuItemLimit(10, -1)).toBe(false);
  });

  it("enforces the numeric cap at every other rank", () => {
    for (const rank of MASTERY_RANKS) {
      const cap = deriveShuMaximumItems(rank);

      if (cap === null) continue;

      expect([rank, withinShuItemLimit(rank, cap)]).toEqual([rank, true]);
      expect([rank, withinShuItemLimit(rank, cap + 1)]).toEqual([rank, false]);
      expect([rank, withinShuItemLimit(rank, 0)]).toEqual([rank, true]);
    }
  });

  it("describes all ten ranks", () => {
    expect(SHU_MASTERY_TRACK.maximumMastery).toBe(10);
    expect(SHU_MASTERY_TRACK.ranks).toHaveLength(10);
  });

  it("has no Output, commitment, duration, upkeep or recovery vocabulary", () => {
    for (const name of Object.keys(shu)) {
      expect(name).not.toMatch(
        /output|commit|concentrat|leak|upkeep|duration|exertion|recovery|clock/i,
      );
    }
  });
});


/* ── Path transmission ──────────────────────────────────────────────────── */

describe("transmission along one already-chosen path", () => {
  const transmission = (itemDepth: number, pathConductivities: readonly number[]) =>
    payloadOf(deriveShuPathTransmission({ itemDepth, pathConductivities }));

  it("halves once per Item-to-Item boundary", () => {
    expect(transmission(0, [1])).toBe(1);
    expect(transmission(1, [1])).toBe(0.5);
    expect(transmission(2, [1])).toBe(0.25);
    expect(transmission(3, [1])).toBe(0.125);
  });

  it("multiplies the conductivity of every Item on the path, destination included", () => {
    /* body -> A -> B -> C, so C is at depth 2: 0.25 x (2 x 0.5 x 1.5). */
    expect(transmission(2, [2, 0.5, 1.5])).toBe(0.375);
    expect(transmission(0, [2, 0.5, 1.5])).toBe(1.5);
  });

  it("carries a conductivity below, at and above the reference through unchanged", () => {
    expect(transmission(0, [0.25])).toBe(0.25);
    expect(transmission(0, [1])).toBe(1);
    expect(transmission(0, [4])).toBe(4);

    /* A superb blade at the end of a poor chain is still starved. */
    expect(transmission(1, [0.1, 4])).toBe(0.2);
  });

  it("refuses a negative or fractional depth", () => {
    expect(errorCodesOf(deriveShuPathTransmission({ itemDepth: -1, pathConductivities: [1] })))
      .toEqual(["nen.shu.item_depth.invalid"]);
    expect(errorCodesOf(deriveShuPathTransmission({ itemDepth: 1.5, pathConductivities: [1] })))
      .toEqual(["nen.shu.item_depth.invalid"]);
    expect(errorCodesOf(deriveShuPathTransmission({ itemDepth: Number.NaN, pathConductivities: [1] })))
      .toEqual(["nen.shu.item_depth.invalid"]);
  });

  it("refuses an empty conductivity list", () => {
    expect(errorCodesOf(deriveShuPathTransmission({ itemDepth: 0, pathConductivities: [] })))
      .toEqual(["nen.shu.path.empty"]);
  });

  it("refuses a non-positive or non-finite conductivity", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect([bad, errorCodesOf(deriveShuPathTransmission({
        itemDepth: 0,
        pathConductivities: [1, bad],
      }))]).toEqual([bad, ["nen.shu.conductivity.invalid"]]);
    }
  });
});


/* ── Enhancement ────────────────────────────────────────────────────────── */

describe("the enhancement an Item receives", () => {
  it("measures density against a reference of one Aura per square metre", () => {
    expect(SHU_REFERENCE_DENSITY).toBe(1);

    const atReference = payloadOf(deriveShuEnhancementFactor({
      efficiency: 0.8,
      transmission: 0.5,
      density: SHU_REFERENCE_DENSITY,
    }));

    expect(atReference.headroom).toBe(0.8 * 0.5);
    expect(atReference.factor).toBe(1.4);
  });

  it("rounds nothing, at any stage", () => {
    /*
     * Shū IX at 0.95, a depth-2 path of 2 x 0.5 x 1.5, twice the reference
     * density. The exact product is 0.7124999999999999 — not 0.7125 — and that
     * is the number the engine must carry, because a factor rounded before it
     * divides a stress is a different object than the rules describe.
     */
    const transmission = payloadOf(deriveShuPathTransmission({
      itemDepth: 2,
      pathConductivities: [2, 0.5, 1.5],
    }));

    const enhancement = payloadOf(deriveShuEnhancementFactor({
      efficiency: deriveShuEfficiency(9),
      transmission,
      density: 2,
    }));

    expect(transmission).toBe(0.375);
    expect(enhancement.headroom).toBe(0.7124999999999999);
    expect(enhancement.headroom).not.toBe(0.7125);
    expect(enhancement.factor).toBe(1.7125);
  });

  it("is exactly 1 — the Item itself — when nothing reaches it", () => {
    const none = payloadOf(deriveShuEnhancementFactor({
      efficiency: 1,
      transmission: 0.5,
      density: 0,
    }));

    expect([none.headroom, none.factor]).toEqual([0, 1]);
  });

  it("refuses negative and non-finite inputs, naming each", () => {
    expect(errorCodesOf(deriveShuEnhancementFactor({
      efficiency: -1,
      transmission: 0.5,
      density: 1,
    }))).toEqual(["nen.shu.efficiency.invalid"]);

    expect(errorCodesOf(deriveShuEnhancementFactor({
      efficiency: 1,
      transmission: Number.NaN,
      density: 1,
    }))).toEqual(["nen.shu.transmission.invalid"]);

    expect(errorCodesOf(deriveShuEnhancementFactor({
      efficiency: 1,
      transmission: 0.5,
      density: Number.POSITIVE_INFINITY,
    }))).toEqual(["nen.shu.density.invalid"]);
  });
});


/* ── Integrity mitigation ───────────────────────────────────────────────── */

describe("what an enhanced Item actually suffers", () => {
  it("divides the stress and reports the difference as mitigation", () => {
    const factor = 1.7125;
    const incoming = 100;

    const resolved = payloadOf(deriveShuIntegrityMitigation(incoming, factor));

    expect(resolved.effectiveStress).toBe(incoming / factor);
    expect(resolved.mitigation).toBe(incoming - incoming / factor);
    expect(resolved.effectiveStress + resolved.mitigation).toBe(incoming);
  });

  it("passes an unenhanced Item's stress through untouched", () => {
    const resolved = payloadOf(deriveShuIntegrityMitigation(42, 1));

    expect([resolved.effectiveStress, resolved.mitigation]).toEqual([42, 0]);
  });

  it("mitigates nothing from nothing", () => {
    const resolved = payloadOf(deriveShuIntegrityMitigation(0, 2));

    expect([resolved.effectiveStress, resolved.mitigation]).toEqual([0, 0]);
  });

  it("refuses a non-positive or non-finite factor, and a negative stress", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect([bad, errorCodesOf(deriveShuIntegrityMitigation(10, bad))])
        .toEqual([bad, ["nen.shu.factor.invalid"]]);
    }

    expect(errorCodesOf(deriveShuIntegrityMitigation(-1, 2)))
      .toEqual(["nen.shu.incoming_stress.invalid"]);
  });
});
