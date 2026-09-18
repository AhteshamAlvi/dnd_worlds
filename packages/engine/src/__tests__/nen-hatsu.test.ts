/*
 * Hatsu: one upstream conversion of already-funded Aura into effective Nen
 * Ability power, and the ceiling it puts on how well a trained Ability is used.
 *
 *   effectivePower          = fundedAura × efficiency
 *   effectiveAbilityMastery = min(stored Ability mastery, effective Hatsu)
 *
 *   I 20%  II 35%  III 50%  IV 60%  V 70%  VI 80%  VII 85%  VIII 90%  IX 95%  X 100%
 *
 * Personal Nen Abilities may be created from Hatsu III. Hatsu is not an
 * activity and does no Aura accounting.
 */

import { describe, expect, it } from "vitest";

import { errorCodesOf, payloadOf } from "./fixtures/result";
import { revertedNen, standardAwakenedNen } from "./fixtures/nen";

import * as engine from "../index";
import {
  HATSU_MASTERY_PROFILES,
  HATSU_MASTERY_TRACK,
  HATSU_PERSONAL_ABILITY_MINIMUM_MASTERY,
  canCreatePersonalNenAbility,
  deriveHatsuConversionEfficiency,
  getHatsuMasteryProfile,
  resolveHatsuConversion,
  resolveNenAbilityMasteryCeiling,
} from "../character/foundation/nen/principles/hatsu";
import {
  resolveCharacterHatsuConversion,
  resolveCharacterNenAbilityMastery,
  resolveEffectiveHatsu,
} from "../character/nen/hatsu";
import { createUnawakenedNenState } from "../character/foundation/nen/nen";
import { unassignedNenType } from "../character/foundation/nen/nen-type";
import { MASTERY_RANKS, type MasteryRank } from "../character/capabilities/mastery";
import type { NenState } from "../character/foundation/nen/types";


const EFFICIENCY: Readonly<Record<MasteryRank, number>> = {
  1: 0.20, 2: 0.35, 3: 0.50, 4: 0.60, 5: 0.70,
  6: 0.80, 7: 0.85, 8: 0.90, 9: 0.95, 10: 1.00,
};

const POWER_FROM_100: Readonly<Record<MasteryRank, number>> = {
  1: 20, 2: 35, 3: 50, 4: 60, 5: 70, 6: 80, 7: 85, 8: 90, 9: 95, 10: 100,
};


/** An awakened character with Hatsu at `hatsu`, prerequisites satisfied. */
function nenWith(hatsu: number, extra: Partial<NenState> = {}): NenState {
  const base = standardAwakenedNen();

  return {
    ...base,
    mastery: { ...base.mastery, ten: 1, ren: 1, zetsu: 1, hatsu } as NenState["mastery"],
    ...extra,
  };
}

function sealed(hatsu: number, seal: number): NenState {
  return nenWith(hatsu, { seals: { hatsu: seal } as NonNullable<NenState["seals"]> });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }

  return value;
}


describe("the Hatsu mastery profile", () => {
  it.each(MASTERY_RANKS)("Hatsu %i converts at its exact efficiency", (rank) => {
    expect(HATSU_MASTERY_PROFILES[rank].conversionEfficiency).toBe(EFFICIENCY[rank]);
    expect(deriveHatsuConversionEfficiency(rank)).toBe(EFFICIENCY[rank]);
    expect(getHatsuMasteryProfile(rank).rank).toBe(rank);
  });

  it("never converts at more than 100%", () => {
    for (const rank of MASTERY_RANKS) {
      expect(HATSU_MASTERY_PROFILES[rank].conversionEfficiency).toBeLessThanOrEqual(1);
    }
  });

  it("rises strictly with every rank", () => {
    for (const rank of MASTERY_RANKS.slice(1)) {
      expect(EFFICIENCY[rank]).toBeGreaterThan(EFFICIENCY[(rank - 1) as MasteryRank]);
      expect(HATSU_MASTERY_PROFILES[rank].conversionEfficiency)
        .toBeGreaterThan(HATSU_MASTERY_PROFILES[(rank - 1) as MasteryRank].conversionEfficiency);
    }
  });

  it("describes every rank by its efficiency", () => {
    expect(HATSU_MASTERY_TRACK.ranks).toHaveLength(10);
    expect(HATSU_MASTERY_TRACK.ranks[0]!.description).toMatch(/20%/);
    expect(HATSU_MASTERY_TRACK.ranks[9]!.description).toMatch(/100%/);
  });
});


describe("personal Nen Ability creation", () => {
  it("unlocks at Hatsu III", () => {
    expect(HATSU_PERSONAL_ABILITY_MINIMUM_MASTERY).toBe(3);
  });

  it.each([
    [0, false], [1, false], [2, false],
    [3, true], [4, true], [5, true], [6, true], [7, true], [8, true], [9, true], [10, true],
  ] as const)("Hatsu %i may create a personal Ability: %s", (mastery, expected) => {
    expect(canCreatePersonalNenAbility(mastery)).toBe(expected);

    if (mastery > 0) {
      expect(HATSU_MASTERY_PROFILES[mastery as MasteryRank].canCreatePersonalNenAbility)
        .toBe(expected);
    }
  });
});


describe("pure conversion", () => {
  it.each(MASTERY_RANKS)("100 funded Aura at Hatsu %i becomes its exact power", (rank) => {
    const conversion = payloadOf(resolveHatsuConversion(100, rank));

    expect(conversion.effectivePower).toBeCloseTo(POWER_FROM_100[rank], 10);
    expect(conversion.fundedAura).toBe(100);
    expect(conversion.conversionEfficiency).toBe(EFFICIENCY[rank]);
    expect(conversion.mastery).toBe(rank);
  });

  it("converts zero Aura to zero power", () => {
    expect(payloadOf(resolveHatsuConversion(0, 10)).effectivePower).toBe(0);
  });

  it("does not round a fractional result", () => {
    /* 7 × 0.35 = 2.45; rounding here would steal power the user paid for. */
    expect(payloadOf(resolveHatsuConversion(7, 2)).effectivePower).toBeCloseTo(2.45, 10);
    expect(payloadOf(resolveHatsuConversion(1.5, 3)).effectivePower).toBe(0.75);
    expect(payloadOf(resolveHatsuConversion(3, 7)).effectivePower).toBeCloseTo(2.55, 10);
  });

  it("is a straight product of funded Aura and efficiency, nothing else", () => {
    for (const aura of [0, 1, 13, 250, 9_999.5]) {
      for (const rank of MASTERY_RANKS) {
        expect(payloadOf(resolveHatsuConversion(aura, rank)).effectivePower)
          .toBe(aura * EFFICIENCY[rank]);
      }
    }
  });

  it("returns exactly the conversion fields and no effect fields", () => {
    expect(Object.keys(payloadOf(resolveHatsuConversion(100, 5))).sort())
      .toEqual(["conversionEfficiency", "effectivePower", "fundedAura", "mastery"]);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative", -1],
    ["a string", "100" as unknown as number],
  ])("refuses %s funded Aura", (_name, aura) => {
    expect(errorCodesOf(resolveHatsuConversion(aura, 5)))
      .toEqual(["nen.hatsu.funded_aura.invalid"]);
  });

  it.each([0, 11, 2.5, Number.NaN, -1])("refuses Hatsu mastery %s", (mastery) => {
    expect(errorCodesOf(resolveHatsuConversion(100, mastery)))
      .toEqual(["nen.hatsu.mastery.invalid"]);
  });

  it("states the one conversion formula and its resolved values in the trace", () => {
    const result = resolveHatsuConversion(40, 4);
    const root = result.trace.root;

    expect(root.formula).toBe("effectivePower = fundedAura × Hatsu conversionEfficiency");
    expect(root.output).toEqual({
      mastery: 4,
      fundedAura: 40,
      conversionEfficiency: 0.60,
      effectivePower: 24,
    });
  });
});


describe("the pure Ability-mastery ceiling", () => {
  it.each([
    ["above", 7, 4, 4],
    ["equal to", 5, 5, 5],
    ["below", 2, 8, 2],
    ["against no Hatsu", 6, 0, 0],
    ["untrained", 0, 9, 0],
  ] as const)("stored mastery %s effective Hatsu resolves through min", (_name, stored, hatsu, expected) => {
    const ceiling = payloadOf(resolveNenAbilityMasteryCeiling(stored, hatsu));

    expect(ceiling.effectiveAbilityMastery).toBe(expected);
    expect(ceiling.storedAbilityMastery).toBe(stored);
    expect(ceiling.effectiveHatsuMastery).toBe(hatsu);
  });

  it.each([
    [-1, 5], [11, 5], [2.5, 5], [Number.NaN, 5],
    [5, -1], [5, 11], [5, 1.5], [5, Number.POSITIVE_INFINITY],
  ])("refuses stored %s against Hatsu %s", (stored, hatsu) => {
    expect(errorCodesOf(resolveNenAbilityMasteryCeiling(stored, hatsu)))
      .toEqual(["nen.hatsu.ability_mastery.invalid"]);
  });
});


describe("the character-facing adapter", () => {
  it("converts at the character's effective Hatsu", () => {
    const conversion = payloadOf(resolveCharacterHatsuConversion({
      nen: nenWith(6),
      fundedAura: 100,
    }));

    expect(conversion.mastery).toBe(6);
    expect(conversion.effectivePower).toBe(80);
  });

  it("still converts at Hatsu I–II, where personal creation is locked", () => {
    for (const hatsu of [1, 2]) {
      const effective = payloadOf(resolveEffectiveHatsu(nenWith(hatsu)));

      expect(effective.canCreatePersonalNenAbility).toBe(false);
      expect(payloadOf(resolveCharacterHatsuConversion({
        nen: nenWith(hatsu),
        fundedAura: 100,
      })).effectivePower).toBeCloseTo(hatsu === 1 ? 20 : 35, 10);
    }
  });

  it("reports personal creation from effective Hatsu III", () => {
    expect(payloadOf(resolveEffectiveHatsu(nenWith(3))).canCreatePersonalNenAbility).toBe(true);
    expect(payloadOf(resolveEffectiveHatsu(sealed(8, 2))).canCreatePersonalNenAbility).toBe(false);
  });

  it("uses effective, not stored, Hatsu under a seal", () => {
    const nen = sealed(9, 3);

    expect(nen.mastery.hatsu).toBe(9);

    const conversion = payloadOf(resolveCharacterHatsuConversion({ nen, fundedAura: 100 }));

    expect(conversion.mastery).toBe(3);
    expect(conversion.effectivePower).toBe(50);
  });

  it("lowers the Ability ceiling under a seal without touching stored ranks", () => {
    const nen = deepFreeze(sealed(9, 3));
    const before = JSON.stringify(nen);

    const ceiling = payloadOf(resolveCharacterNenAbilityMastery({
      nen,
      storedAbilityMastery: 7,
    }));

    expect(ceiling.effectiveAbilityMastery).toBe(3);
    expect(ceiling.storedAbilityMastery).toBe(7);
    expect(JSON.stringify(nen)).toBe(before);
    expect(nen.mastery.hatsu).toBe(9);

    /* Lift the seal, and the trained Ability is exactly as it was. */
    expect(payloadOf(resolveCharacterNenAbilityMastery({
      nen: nenWith(9),
      storedAbilityMastery: 7,
    })).effectiveAbilityMastery).toBe(7);
  });

  it.each([
    ["above", 8, 5, 5],
    ["equal to", 5, 5, 5],
    ["below", 3, 5, 3],
  ] as const)("resolves stored Ability mastery %s effective Hatsu through min", (_name, stored, hatsu, expected) => {
    expect(payloadOf(resolveCharacterNenAbilityMastery({
      nen: nenWith(hatsu),
      storedAbilityMastery: stored,
    })).effectiveAbilityMastery).toBe(expected);
  });

  it("gives a reverted character effective Hatsu 0 and refuses conversion", () => {
    const reverted = revertedNen();

    expect(payloadOf(resolveEffectiveHatsu(reverted)).mastery).toBe(0);

    const refused = resolveCharacterHatsuConversion({ nen: reverted, fundedAura: 100 });

    expect(errorCodesOf(refused)).toEqual(["nen.hatsu.unavailable"]);
    if (refused.success) throw new Error("unreachable");
    expect(refused.errors[0]!.audience).toBe("player");

    expect(payloadOf(resolveCharacterNenAbilityMastery({
      nen: reverted,
      storedAbilityMastery: 6,
    })).effectiveAbilityMastery).toBe(0);
  });

  it("refuses conversion for a character sealed to no Hatsu", () => {
    expect(errorCodesOf(resolveCharacterHatsuConversion({
      nen: sealed(5, 0),
      fundedAura: 10,
    }))).toEqual(["nen.hatsu.unavailable"]);
  });

  it("refuses conversion for an unawakened character", () => {
    expect(errorCodesOf(resolveCharacterHatsuConversion({
      nen: createUnawakenedNenState(unassignedNenType()),
      fundedAura: 10,
    }))).toEqual(["nen.hatsu.unavailable"]);
  });

  it("refuses malformed funded Aura through the adapter", () => {
    expect(errorCodesOf(resolveCharacterHatsuConversion({
      nen: nenWith(5),
      fundedAura: -3,
    }))).toEqual(["nen.hatsu.funded_aura.invalid"]);
  });

  it("refuses malformed stored Ability mastery through the adapter", () => {
    expect(errorCodesOf(resolveCharacterNenAbilityMastery({
      nen: nenWith(5),
      storedAbilityMastery: 12,
    }))).toEqual(["nen.hatsu.ability_mastery.invalid"]);
  });

  it.each([
    ["null", null],
    ["a number", 5],
    ["no mastery", { awakening: {} }],
  ])("refuses a structurally malformed Nen state (%s)", (_name, nen) => {
    expect(errorCodesOf(resolveCharacterHatsuConversion({
      nen: nen as unknown as NenState,
      fundedAura: 10,
    }))).toEqual(["nen.hatsu.nen_state.invalid"]);
  });

  it.each([
    ["a fractional stored Hatsu", () => nenWith(2.5), "nen.mastery.rank.invalid"],
    ["an out-of-range seal", () => sealed(5, 14), "nen.mastery.seal.invalid"],
    [
      "mastery on a never-awakened character",
      () => ({
        ...createUnawakenedNenState(unassignedNenType()),
        mastery: { ...createUnawakenedNenState(unassignedNenType()).mastery, hatsu: 4 },
      }) as NenState,
      "nen.mastery.before_awakening",
    ],
  ] as const)("refuses a Nen state with %s", (_name, build, code) => {
    for (const result of [
      resolveCharacterHatsuConversion({ nen: build(), fundedAura: 10 }),
      resolveCharacterNenAbilityMastery({ nen: build(), storedAbilityMastery: 3 }),
    ]) {
      expect(errorCodesOf(result)).toContain(code);
    }
  });

  it("leaves every input exactly as it was", () => {
    const request = deepFreeze({ nen: nenWith(7), fundedAura: 100 });
    const before = JSON.stringify(request);

    payloadOf(resolveCharacterHatsuConversion(request));

    expect(JSON.stringify(request)).toBe(before);
  });

  it("does no Aura accounting: nothing is deducted, allocated or started", () => {
    /*
     * The adapter is handed no Aura state to mutate, and hands none back. Its
     * payload is the conversion and only the conversion.
     */
    const conversion = payloadOf(resolveCharacterHatsuConversion({
      nen: nenWith(10),
      fundedAura: 100,
    }));

    for (const field of ["aura", "current", "allocation", "allocations", "runtime", "activity", "upkeep"]) {
      expect(conversion).not.toHaveProperty(field);
    }

    expect(conversion.fundedAura).toBe(100);
  });

  it("carries the conversion formula and resolved values in its trace", () => {
    const result = resolveCharacterHatsuConversion({ nen: nenWith(4), fundedAura: 40 });
    const conversionNode = result.trace.root.children
      .find((child) => child.id === "nen.hatsu.conversion");

    expect(conversionNode?.formula)
      .toBe("effectivePower = fundedAura × Hatsu conversionEfficiency");
    expect(conversionNode?.output).toMatchObject({ effectivePower: 24, conversionEfficiency: 0.60 });
  });
});


describe("the package surface", () => {
  it("reaches the character-facing Hatsu API from the engine entry point", () => {
    expect(engine.resolveCharacterHatsuConversion).toBe(resolveCharacterHatsuConversion);
    expect(engine.resolveCharacterNenAbilityMastery).toBe(resolveCharacterNenAbilityMastery);
    expect(engine.resolveEffectiveHatsu).toBe(resolveEffectiveHatsu);
    expect(engine.HATSU_MASTERY_PROFILES).toBe(HATSU_MASTERY_PROFILES);
    expect(engine.HATSU_PERSONAL_ABILITY_MINIMUM_MASTERY).toBe(3);
  });

  it("exposes no universal-effect API and no Hatsu activity", () => {
    for (const name of [
      "applyHatsuEffectMultiplier",
      "deriveHatsuEffectMultiplier",
      "deriveHatsuEffectModifier",
      "HATSU_EFFECT_MINIMUM_MASTERY",
      "startHatsu",
      "stopHatsu",
    ]) {
      expect(engine).not.toHaveProperty(name);
    }
  });
});
