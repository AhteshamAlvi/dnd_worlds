/*
 * The central Aura resolver: everything derived about a character's Aura, from
 * one function, in one order.
 *
 * Three claims are under test here, and each of them is a mistake the model
 * makes easy.
 *
 * THE THREE OUTPUT FIGURES ARE DIFFERENT QUESTIONS. Physiological Output is
 * what the body can produce, from CON alone. Accessible Output is the share
 * the current state can reach. Usable Output is that, capped by the Aura
 * actually held. Ren, Zetsu and Ten move the second; none of them move the
 * first, and physiological Output is NOT a percentage of Maximum Aura.
 *
 * PSEUDO-CHU IS NOT OUTPUT. An unawakened character reinforces themselves from
 * 20% of Current Aura through half-open nodes. It costs no Output, deducts no
 * Aura, weakens as they are drained, and vanishes at awakening.
 *
 * UNITS DO NOT MIX. Internal Aura is Aura per litre; surface Aura is Aura per
 * square metre. Contributions add within a placement and never across one.
 *
 * Working numbers, standard human at Scale 1:
 *
 *   whole body   60.00 L    16,900 cm2  (1.69 m2)
 *   one Arm       2.37 L     1,183 cm2  (0.1183 m2)
 */

import { describe, expect, it } from "vitest";

import * as engine from "../index";
import { setBodyPartState } from "../character/foundation/body/anatomy/modification";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import { continuityKey } from "../character/foundation/body/anatomy/types";
import { deriveAuraOutputLimit } from "../character/foundation/aura/output";
import { deriveMaximumAura } from "../character/foundation/aura/pool";
import { resolveAuraProfile } from "../character/foundation/aura/resolution";
import type { AuraAllocation } from "../character/foundation/aura/state";
import type {
  AuraAccessInput,
  ResolvedAuraProfile,
} from "../character/foundation/aura/types";
import type { Anatomy } from "../character/foundation/body/anatomy/types";

import {
  auraContext,
  auraTestAttributes,
  UNAWAKENED,
  UNCONTAINED,
  WITH_TEN,
  type AuraContextOptions,
} from "./fixtures/aura";
import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";

const RIGHT_ARM = continuityKey("upper-limb:right");

/* Ren III: 30% of physiological Output, and room to place things by hand. */
const REN_III: AuraAccessInput = {
  ...WITH_TEN,
  override: { kind: "output-access", source: "ren-iii", accessFraction: 0.3 },
};

/* Chu: internal placement permitted, Ten's coating traded away for it. */
const CHU: AuraAccessInput = {
  ...WITH_TEN,
  override: { kind: "internal-access", source: "chu", accessFraction: 0.3 },
};

interface ProfileOptions extends AuraContextOptions {
  readonly current?: number;
  readonly allocations?: readonly AuraAllocation[];
}

function attempt(options: ProfileOptions = {}) {
  const { current = 0, allocations = [], ...context } = options;

  return resolveAuraProfile({
    state: { current, allocations },
    ...auraContext(context),
  });
}

function profile(options: ProfileOptions = {}): ResolvedAuraProfile {
  const result = attempt(options);

  if (!result.success) {
    throw new Error(
      "Expected the Aura profile to resolve: " +
      result.errors.map((error) => error.code).join(", "),
    );
  }

  return result.payload;
}

function surfaceOn(resolved: ResolvedAuraProfile, partId: string) {
  return resolved.byBodyPart.find((part) => part.partId === partId)?.surface;
}

function internalOn(resolved: ResolvedAuraProfile, partId: string) {
  return resolved.byBodyPart.find((part) => part.partId === partId)?.internal;
}


describe("physiological Aura Output", () => {
  /*
   * CON alone, through the existing curve. Not derived from Maximum Aura, and
   * not capped at a fraction of the pool.
   */
  it("hits every CON checkpoint", () => {
    const checkpoints: readonly (readonly [number, number])[] = [
      [10, 2],
      [15, 100],
      [20, 10_000],
      [25, 2_000_000],
      [30, 800_000_000],
    ];

    for (const [con, expected] of checkpoints) {
      expect([con, deriveAuraOutputLimit(auraTestAttributes({ con })).maximum])
        .toEqual([con, expected]);
    }
  });

  it("depends on CON and nothing else", () => {
    const base = deriveAuraOutputLimit(auraTestAttributes({ con: 20 })).maximum;

    for (const vit of [5, 10, 25]) {
      expect(deriveAuraOutputLimit(auraTestAttributes({ con: 20, vit })).maximum)
        .toBe(base);
    }

    expect(deriveAuraOutputLimit(auraTestAttributes({ con: 20, dex: 30 })).maximum)
      .toBe(base);
  });

  /*
   * A coincidence of the two formulas rather than a rule, and worth pinning as
   * such: when CON and VIT match, Pool and Output happen to put physiological
   * Output at exactly a fifth of the pool. Nothing computes it that way.
   */
  it("lands on 20% of Maximum Aura when CON and VIT are equal", () => {
    for (const score of [10, 15, 20, 25, 30]) {
      const attributes = auraTestAttributes({ con: score, vit: score });

      expect(deriveAuraOutputLimit(attributes).maximum)
        .toBeCloseTo(deriveMaximumAura(attributes) * 0.2, 6);
    }
  });

  it("lands somewhere else when they differ", () => {
    const attributes = auraTestAttributes({ con: 20, vit: 12 });
    const fraction =
      deriveAuraOutputLimit(attributes).maximum / deriveMaximumAura(attributes);

    expect(fraction).not.toBeCloseTo(0.2, 3);
  });
});


describe("accessible and usable Output", () => {
  it("applies the access fraction to the physiological figure", () => {
    const resolved = profile({
      attributes: { con: 20, vit: 20 },
      current: 50_000,
      access: REN_III,
    });

    expect(resolved.output.physiologicalMaximum).toBe(10_000);
    expect(resolved.output.accessibleMaximum).toBeCloseTo(3000, 10);
    expect(resolved.output.usableMaximum).toBeCloseTo(3000, 10);
  });

  /*
   * A reachable capacity is not Aura the character has. A nearly-empty
   * character running Ren still cannot project what is not there.
   */
  it("caps usable Output by Current Aura", () => {
    const resolved = profile({
      attributes: { con: 20, vit: 20 },
      current: 400,
      access: REN_III,
    });

    expect(resolved.output.accessibleMaximum).toBeCloseTo(3000, 10);
    expect(resolved.output.usableMaximum).toBe(400);
  });

  it("leaves physiological Output untouched when access closes", () => {
    const suppressed = profile({
      attributes: { con: 20, vit: 20 },
      current: 50_000,
      access: {
        ...WITH_TEN,
        override: { kind: "suppressed", source: "zetsu" },
      },
    });

    expect(suppressed.output.physiologicalMaximum).toBe(10_000);
    expect(suppressed.output.accessibleMaximum).toBe(0);
    expect(suppressed.output.usableMaximum).toBe(0);
  });
});


describe("the unawakened body's passive internal Aura", () => {
  const resolved = profile({
    attributes: { con: 20, vit: 20 },
    current: 20_000,
    access: UNAWAKENED,
  });

  it("converts 20% of Current Aura", () => {
    expect(resolved.passiveInternal).not.toBeNull();
    expect(resolved.passiveInternal!.source).toBe("unawakened-pseudo-chu");
    expect(resolved.passiveInternal!.efficiency).toBe(0.2);
    expect(resolved.passiveInternal!.sourceAura).toBe(20_000);
    expect(resolved.passiveInternal!.effectiveAura).toBe(4000);
  });

  /*
   * The 20% is a conversion efficiency, not a cost. Nothing is deducted, and
   * no Output is consumed — an unawakened character has no reachable Output at
   * all, so an Output-denominated model of this would be zero.
   */
  it("bypasses Output entirely", () => {
    expect(resolved.output.accessibleMaximum).toBe(0);
    expect(resolved.output.usableMaximum).toBe(0);
    expect(resolved.distribution.activeAura).toBe(0);
    expect(resolved.pool.current).toBe(20_000);
  });

  it("spreads by Volume to an equal internal density everywhere", () => {
    expect(resolved.passiveInternal!.allocations).toHaveLength(12);

    for (const allocation of resolved.passiveInternal!.allocations) {
      expect(allocation.density.auraPerLiter).toBeCloseTo(4000 / 60, 10);
    }

    const arm = resolved.passiveInternal!.allocations
      .find((allocation) => allocation.partId === "arm-1")!;

    expect(arm.coveredVolumeL).toBeCloseTo(2.37, 10);
    expect(arm.aura).toBeCloseTo(4000 * (2.37 / 60), 10);
  });

  it("reaches the per-part aggregate as internal Aura", () => {
    expect(internalOn(resolved, "arm-1")!.density.auraPerLiter)
      .toBeCloseTo(4000 / 60, 10);
    expect(surfaceOn(resolved, "arm-1")).toBeNull();
  });

  /*
   * Drawn from the reserve continuously rather than paid for once, so it
   * weakens with the character rather than persisting at full strength.
   */
  it("weakens as Current Aura falls", () => {
    const drained = profile({
      attributes: { con: 20, vit: 20 },
      current: 5000,
      access: UNAWAKENED,
    });

    expect(drained.passiveInternal!.effectiveAura).toBe(1000);
    expect(internalOn(drained, "arm-1")!.density.auraPerLiter)
      .toBeCloseTo(1000 / 60, 10);
  });

  it("is nothing at all when the reserve is empty", () => {
    const empty = profile({ attributes: { con: 20, vit: 20 }, access: UNAWAKENED });

    expect(empty.passiveInternal!.effectiveAura).toBe(0);
    expect(internalOn(empty, "arm-1")!.density.auraPerLiter).toBe(0);
  });
});


describe("awakening", () => {
  it("removes all passive internal Density", () => {
    const awakened = profile({
      attributes: { con: 20, vit: 20 },
      current: 20_000,
      access: UNCONTAINED,
    });

    expect(awakened.passiveInternal).toBeNull();

    for (const part of awakened.byBodyPart) {
      expect(part.internal).toBeNull();
    }
  });

  /*
   * The state that makes awakening without Ten a liability. Nodes open,
   * pseudo-Chu gone, nothing containing anything.
   */
  it("leaves an awakened character without Ten defenceless", () => {
    const uncontained = profile({
      attributes: { con: 20, vit: 20 },
      current: 20_000,
      access: UNCONTAINED,
    });

    expect(uncontained.output.usableMaximum).toBe(0);
    expect(uncontained.distribution.allocations).toEqual([]);

    for (const part of uncontained.byBodyPart) {
      expect(part.internal).toBeNull();
      expect(part.surface).toBeNull();
    }
  });

  it("keeps internal Density at zero even under Ten", () => {
    const withTen = profile({
      attributes: { con: 20, vit: 20 },
      current: 20_000,
      access: WITH_TEN,
    });

    for (const part of withTen.byBodyPart) {
      expect(part.internal).toBeNull();
    }
  });

  it("restores internal placement only through an explicit override", () => {
    const chu = profile({
      attributes: { con: 20, vit: 20 },
      current: 20_000,
      access: CHU,
      allocations: [{
        id: "chu-fist",
        coverage: "localized",
        placement: "internal",
        continuityKey: RIGHT_ARM,
        aura: 237,
      }],
    });

    expect(chu.adjustments).toEqual([]);
    expect(internalOn(chu, "arm-2")!.density.auraPerLiter)
      .toBeCloseTo(237 / 2.37, 10);
  });
});


describe("baseline Ten", () => {
  const resolved = profile({
    attributes: { con: 20, vit: 20 },
    current: 20_000,
    access: WITH_TEN,
  });

  /*
   * Ten is the DEFAULT state, not something the character declares. Learning
   * it is enough for the coating to be there.
   */
  it("coats the whole body without being asked for", () => {
    expect(resolved.distribution.allocations).toHaveLength(12);

    for (const allocation of resolved.distribution.allocations) {
      expect(allocation.source).toBe("baseline-ten");
      expect(allocation.allocationId).toBe("baseline-ten");
      expect(allocation.coverage).toBe("whole-body");
      expect(allocation.placement).toBe("surface");
    }
  });

  it("draws 5% of physiological Output", () => {
    expect(resolved.output.physiologicalMaximum).toBe(10_000);
    expect(resolved.distribution.activeAura).toBeCloseTo(500, 10);
  });

  it("produces equal surface density over the whole body", () => {
    for (const part of resolved.byBodyPart) {
      expect(part.surface!.density.auraPerSquareMeter)
        .toBeCloseTo(500 / 1.69, 10);
    }
  });

  it("is capped by Current Aura when the reserve is smaller", () => {
    const nearlyEmpty = profile({
      attributes: { con: 20, vit: 20 },
      current: 120,
      access: WITH_TEN,
    });

    expect(nearlyEmpty.distribution.activeAura).toBeCloseTo(120, 10);
    expect(nearlyEmpty.pool.current).toBe(120);
  });

  /*
   * Derived state, recomputed every resolution. A stored copy would outlive
   * the Ten that produced it.
   */
  it("is never written into stored allocation state", () => {
    const character = createTestCharacter({
      attributes: { con: 20, vit: 20 },
      aura: { current: 20_000, allocations: [] },
      nen: {
        awakened: true,
        mastery: {
          ten: 1, ren: 0, zetsu: 0, hatsu: 0, shu: 0, en: 0, gyo: 0,
          ken: 0, chu: 0, in: 0, ko: 0, ryu: 0, yu: 0, ju: 0, fu: 0,
        },
      },
    });

    const resolvedCharacter = resolveTestCharacter(character);

    expect(resolvedCharacter.character.aura.allocations).toEqual([]);
    expect(resolvedCharacter.aura.distribution.allocations.length)
      .toBeGreaterThan(0);
  });

  it("stops covering anatomy that is not present", () => {
    const oneArmed = setBodyPartState(
      STANDARD_HUMANOID_ANATOMY,
      "arm-1",
      "archived-removed",
    );

    const resolvedOneArmed = profile({
      attributes: { con: 20, vit: 20 },
      current: 20_000,
      access: WITH_TEN,
      anatomy: oneArmed,
    });

    expect(surfaceOn(resolvedOneArmed, "arm-1")).toBeUndefined();

    /* Same 500 Aura over less skin, so the density everywhere rises. */
    for (const part of resolvedOneArmed.byBodyPart) {
      expect(part.surface!.density.auraPerSquareMeter)
        .toBeCloseTo(500 / ((16_900 - 1183) / 10_000), 10);
    }
  });

  it("resolves to nothing on a body with no measurable anatomy", () => {
    const nothing: Anatomy = { ...STANDARD_HUMANOID_ANATOMY, parts: [] };

    const resolvedNothing = profile({
      attributes: { con: 20, vit: 20 },
      current: 20_000,
      access: WITH_TEN,
      anatomy: nothing,
    });

    expect(resolvedNothing.distribution.allocations).toEqual([]);
    expect(resolvedNothing.byBodyPart).toEqual([]);
  });
});


describe("aggregating contributions on one Body Part", () => {
  const LOCAL_ARM_COAT: AuraAllocation = {
    id: "ken-arm",
    coverage: "localized",
    placement: "surface",
    continuityKey: RIGHT_ARM,
    aura: 118.3,
  };

  const resolved = profile({
    attributes: { con: 20, vit: 20 },
    current: 50_000,
    access: REN_III,
    allocations: [LOCAL_ARM_COAT],
  });

  /* Baseline Ten's share of the right Arm: 500 x (1183 / 16,900). */
  const TEN_ON_ARM = 500 * (1183 / 16_900);

  it("keeps every contribution separately", () => {
    const arm = surfaceOn(resolved, "arm-2")!;

    expect(arm.contributions).toHaveLength(2);
    expect(arm.contributions.map((one) => one.source).sort())
      .toEqual(["baseline-ten", "stored"]);
  });

  it("adds their Aura", () => {
    expect(surfaceOn(resolved, "arm-2")!.aura)
      .toBeCloseTo(118.3 + TEN_ON_ARM, 10);
  });

  /*
   * Densities over the same denominator add, which is what makes "one
   * aggregate Density for this forearm" a true statement rather than a
   * convenient one.
   */
  it("adds their same-placement densities", () => {
    const arm = surfaceOn(resolved, "arm-2")!;
    const separately = arm.contributions.reduce(
      (total, one) => total + one.density.auraPerSquareMeter,
      0,
    );

    expect(arm.density.auraPerSquareMeter).toBeCloseTo(separately, 8);
    expect(arm.density.auraPerSquareMeter)
      .toBeCloseTo(1000 + 500 / 1.69, 8);
  });

  it("leaves the parts the localized allocation does not cover alone", () => {
    expect(surfaceOn(resolved, "arm-1")!.contributions).toHaveLength(1);
    expect(surfaceOn(resolved, "arm-1")!.density.auraPerSquareMeter)
      .toBeCloseTo(500 / 1.69, 10);
  });

  /*
   * Aura per litre and Aura per square metre are not comparable quantities.
   * How the two layers interact is reinforcement's decision, not aggregation's.
   */
  it("never adds internal Density to surface Density", () => {
    const both = profile({
      attributes: { con: 20, vit: 20 },
      current: 50_000,
      access: CHU,
      allocations: [
        {
          id: "chu-fist",
          coverage: "localized",
          placement: "internal",
          continuityKey: RIGHT_ARM,
          aura: 237,
        },
        LOCAL_ARM_COAT,
      ],
    });

    const arm = both.byBodyPart.find((part) => part.partId === "arm-2")!;

    expect(arm.internal!.density.auraPerLiter).toBeCloseTo(100, 10);
    expect(arm.surface!.density.auraPerSquareMeter).toBeCloseTo(1000, 10);
    expect(arm.internal!.aura).toBeCloseTo(237, 10);
    expect(arm.surface!.aura).toBeCloseTo(118.3, 10);
  });
});


describe("one shared Output budget", () => {
  /*
   * Baseline Ten and stored allocations draw on the same usable Output. Ten
   * has already committed 5% of physiological Output, and a stored allocation
   * cannot spend it a second time.
   */
  it("counts the automatic coating against the ceiling", () => {
    const resolved = profile({
      attributes: { con: 20, vit: 20 },
      current: 50_000,
      access: REN_III,
      allocations: [{
        id: "ken",
        coverage: "whole-body",
        placement: "surface",
        aura: 2500,
      }],
    });

    expect(resolved.output.usableMaximum).toBeCloseTo(3000, 10);
    expect(resolved.distribution.activeAura).toBeCloseTo(3000, 10);
    expect(resolved.distribution.unallocatedOutput).toBeCloseTo(0, 8);
    expect(resolved.adjustments).toEqual([]);
  });

  it("reduces stored allocations that no longer fit, proportionally", () => {
    const resolved = profile({
      attributes: { con: 20, vit: 20 },
      current: 50_000,
      access: REN_III,
      allocations: [
        { id: "a", coverage: "whole-body", placement: "surface", aura: 4000 },
        { id: "b", coverage: "whole-body", placement: "surface", aura: 1000 },
      ],
    });

    /* 2500 of budget left after Ten's 500, shared 4:1. */
    expect(resolved.adjustments).toHaveLength(2);
    expect(resolved.adjustments.every((one) => one.kind === "reduced"))
      .toBe(true);
    expect(resolved.distribution.activeAura).toBeCloseTo(3000, 8);

    const byId = new Map(
      resolved.distribution.allocations
        .filter((one) => one.partId === "arm-1")
        .map((one) => [one.allocationId, one.aura]),
    );

    expect(byId.get("a")! / byId.get("b")!).toBeCloseTo(4, 8);
  });

  /*
   * An unawakened character directs nothing. Their stored allocations are not
   * an invalid sheet — they may have been written before a Zetsu, or by a
   * workbench mid-edit — so they are reported as not applying rather than
   * failing the whole character.
   */
  it("drops allocations the access state does not permit", () => {
    const resolved = profile({
      attributes: { con: 20, vit: 20 },
      current: 20_000,
      access: UNAWAKENED,
      allocations: [{
        id: "ten",
        coverage: "whole-body",
        placement: "surface",
        aura: 1690,
      }],
    });

    expect(resolved.adjustments).toEqual([
      expect.objectContaining({
        kind: "removed-not-permitted",
        allocationId: "ten",
        placement: "surface",
      }),
    ]);
    expect(resolved.distribution.allocations).toEqual([]);
  });

  it("reports a localized allocation whose anatomy is gone", () => {
    const resolved = profile({
      attributes: { con: 20, vit: 20 },
      current: 50_000,
      access: REN_III,
      anatomy: setBodyPartState(
        STANDARD_HUMANOID_ANATOMY,
        "arm-2",
        "archived-removed",
      ),
      allocations: [{
        id: "ken-arm",
        coverage: "localized",
        placement: "surface",
        continuityKey: RIGHT_ARM,
        aura: 118.3,
      }],
    });

    expect(resolved.adjustments).toEqual([
      expect.objectContaining({
        kind: "removed-not-manifested",
        allocationId: "ken-arm",
        reason: "identity-not-manifested",
      }),
    ]);

    /* The Aura returns to unallocated Output; Current Aura is untouched. */
    expect(resolved.pool.current).toBe(50_000);
    expect(resolved.distribution.unallocatedOutput).toBeCloseTo(2500, 8);
  });

  it("never resolves a distribution above usable Output", () => {
    for (const aura of [1, 100, 10_000, 1_000_000]) {
      const resolved = profile({
        attributes: { con: 20, vit: 20 },
        current: 50_000,
        access: REN_III,
        allocations: [
          { id: "a", coverage: "whole-body", placement: "surface", aura },
        ],
      });

      expect(resolved.distribution.activeAura)
        .toBeLessThanOrEqual(resolved.output.usableMaximum * (1 + 1e-9));
    }
  });
});


describe("the profile a character resolves with", () => {
  it("reaches ResolvedCharacter.aura", () => {
    const resolved = resolveTestCharacter(createTestCharacter({
      attributes: { con: 20, vit: 18, dex: 22 },
      aura: { current: 8000, allocations: [] },
    }));

    expect(resolved.aura.pool).toEqual({
      current: 8000,
      maximum: 20_000,
      depletionFraction: 0.6,
    });
    expect(resolved.aura.output.physiologicalMaximum).toBe(10_000);
    expect(resolved.aura.control.multiplier).toBe(1);
    expect(resolved.aura.access.state).toBe("unawakened");
    expect(resolved.aura.passiveInternal!.effectiveAura).toBe(1600);
  });

  /*
   * Aura reads the physically-resolved stat block, so a Giant's Volume/Mass
   * burden reaches their Control multiplier exactly as it reaches every
   * Derived Attribute.
   */
  it("reads the DEX the character actually has", () => {
    const resolved = resolveTestCharacter(createTestCharacter({
      attributes: { dex: 22 },
    }));

    expect(resolved.aura.control.multiplier)
      .toBe(profile({ attributes: { dex: resolved.stats.dex } }).control.multiplier);
  });

  it("carries the VIT-derived Regeneration Capacity forward unchanged", () => {
    const resolved = resolveTestCharacter(createTestCharacter({
      attributes: { con: 20, vit: 20 },
      aura: { current: 0, allocations: [] },
    }));

    expect(resolved.aura.regeneration.perHour).toBe(5000);
  });
});


describe("inputs the resolver cannot make sense of", () => {
  function errorCodes(result: ReturnType<typeof attempt>): readonly string[] {
    return result.success ? [] : result.errors.map((error) => error.code);
  }

  it("refuses a reserve above the derived pool", () => {
    expect(errorCodes(attempt({ attributes: { con: 20, vit: 18 }, current: 99_999 })))
      .toContain("aura.pool.current.exceeds_maximum");
  });

  it("refuses a negative reserve", () => {
    expect(errorCodes(attempt({ current: -1 })))
      .toContain("aura.pool.current.invalid");
  });

  it("refuses a DEX that is not a score", () => {
    expect(errorCodes(attempt({ attributes: { dex: Number.NaN } })))
      .toContain("aura.control.dex.invalid");
  });

  it("refuses an access state that cannot be true", () => {
    expect(errorCodes(attempt({
      access: { awakened: true, effectiveTenMastery: 99 },
    }))).toContain("aura.access.ten_mastery.invalid");
  });

  it("refuses a malformed allocation", () => {
    expect(errorCodes(attempt({
      attributes: { con: 20, vit: 20 },
      current: 50_000,
      access: REN_III,
      allocations: [
        { id: "dup", coverage: "whole-body", placement: "surface", aura: 1 },
        { id: "dup", coverage: "whole-body", placement: "surface", aura: 1 },
      ],
    }))).toContain("aura.allocation.id.duplicate");
  });
});


describe("the Aura subsystem's public surface", () => {
  /*
   * Asserted rather than assumed. The package root hand-maintained a dozen
   * Aura export blocks until this ticket, and it had already fallen behind its
   * domain once — Control was finished, tested and unreachable. The barrel is
   * re-exported wholesale now, and this is what notices if a new module is
   * added without one.
   */
  it("reaches the package root", () => {
    const surface = [
      /* The central resolver and the pieces it is assembled from. */
      "resolveAuraProfile",
      "resolveAuraAccess",
      "resolveAuraBudget",
      "reconcileAuraAllocations",
      "resolvePassiveInternalAura",
      "resolveAuraDistribution",

      /* Control. */
      "deriveAuraControl",
      "deriveAuraControlMultiplier",
      "deriveAuraExpenditure",
      "applyAuraControl",

      /* Transitions. */
      "spendAura",
      "drainAura",
      "replaceAuraAllocations",
      "upsertAuraAllocation",
      "removeAuraAllocation",
      "clearAuraAllocations",
      "reconcileAuraState",

      /* Vocabularies and the constants a caller has to be able to name. */
      "AURA_ACCESS_STATES",
      "AURA_ALLOCATION_SOURCES",
      "AURA_PLACEMENTS",
      "BASELINE_TEN_ALLOCATION_ID",
      "PSEUDO_CHU_ALLOCATION_ID",
      "PSEUDO_CHU_EFFICIENCY",
      "TEN_SURFACE_COATING_OUTPUT_FRACTION",
      "findAuraPlacementIssues",

      /*
       * The one Nen derivation a caller needs to build an AuraAccessInput.
       * Reading NenState.mastery.ten directly would ignore every seal.
       */
      "deriveEffectiveNenMastery",

      /* Expenditure, recovery, upkeep, leakage and the time transition. */
      "PHYSICAL_AURA_COST_COEFFICIENT",
      "derivePhysicalAuraCost",
      "deriveSustainedActivityAuraCost",
      "resolveAuraActionCost",
      "spendActionAura",
      "spendPhysicalAura",
      "recoverAura",
      "resolveAuraRecoveryMultiplier",
      "AURA_RECOVERY_MODE_MULTIPLIERS",
      "deriveAuraUpkeep",
      "payAuraUpkeep",
      "deriveUncontainedLeakage",
      "uncontainedCollapse",
      "AURA_COLLAPSE_REQUESTS",
      "advanceAuraTime",
      "emptyAuraBalance",

      /* The authoritative time model and the character-time coordinator. */
      "SECONDS_PER_COMBAT_ROUND",
      "COMBAT_ROUNDS_PER_HOUR",
      "GAME_MILLISECONDS_PER_HOUR",
      "advanceGameClock",
      "gameTimeInterval",
      "gameTimeIntervalOf",
      "validateGameTimeInterval",
      "intervalHours",
      "hoursToDuration",
      "advanceCharacterTime",
      "projectCharacterAtTime",
      "characterTemporalState",

      /* The Body-owned half, through the Body barrel. */
      "deriveStaminaExpenditureMultiplier",
      "deriveMaximumWakefulHours",
      "advanceWakefulness",
      "deriveFatigue",
      "restedWakefulness",
      "PHYSICAL_EXERTION_LOADS",
      "SUSTAINED_ACTIVITY_LOADS_PER_HOUR",
      "findActivityCombinationIssues",
    ];

    for (const name of surface) {
      expect([name, name in engine]).toEqual([name, true]);
    }
  });
});
