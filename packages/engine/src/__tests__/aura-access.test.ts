/*
 * Aura access: what a character can currently do with the Aura they have.
 *
 * Three ordinary states, and the whole point of the shape is that the central
 * Aura resolver can tell them apart WITHOUT knowing the name of a single Nen
 * principle. It reads a fraction and two permissions; access decides what
 * those are.
 *
 *   UNAWAKENED   half-open nodes, no deliberate access, passive pseudo-Chu
 *   UNCONTAINED  awakened with no Ten: open nodes reinforcing nothing
 *   TEN          awakened with Ten: the default state, 5% of Output as a coat
 *
 * Overrides are the extension point for Ren, Zetsu, Chu and anything else.
 * None of their mechanics are implemented; what is tested here is that the
 * typed shapes flatten into the right fractions and permissions.
 */

import { describe, expect, it } from "vitest";

import {
  findAuraPlacementIssues,
  PSEUDO_CHU_EFFICIENCY,
  resolveAuraAccess,
  TEN_SURFACE_COATING_OUTPUT_FRACTION,
} from "../character/foundation/aura/access";
import { continuityKey } from "../character/foundation/body/anatomy/types";
import type { AuraAllocation } from "../character/foundation/aura/state";
import type {
  AuraAccessInput,
  ResolvedAuraAccess,
} from "../character/foundation/aura/types";

import { UNAWAKENED, UNCONTAINED, WITH_TEN } from "./fixtures/aura";

const RIGHT_ARM = continuityKey("upper-limb:right");

function access(input: AuraAccessInput): ResolvedAuraAccess {
  const result = resolveAuraAccess(input);

  if (!result.success) {
    throw new Error(
      "Expected access to resolve: " +
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


describe("the unawakened state", () => {
  const resolved = access(UNAWAKENED);

  it("has half-open nodes and no deliberate access", () => {
    expect(resolved.state).toBe("unawakened");
    expect(resolved.awakened).toBe(false);
    expect(resolved.nodeState).toBe("half-open");
    expect(resolved.deliberateInternalAccess).toBe(false);
    expect(resolved.deliberateExternalAccess).toBe(false);
  });

  /*
   * Not "no Aura". The character has a pool and can still lose Current Aura;
   * what they cannot do is direct any of it, which is a narrower claim.
   */
  it("reaches none of physiological Output", () => {
    expect(resolved.accessFraction).toBe(0);
  });

  it("receives passive internal reinforcement instead", () => {
    expect(resolved.passiveInternalReinforcement).toEqual({
      source: "unawakened-pseudo-chu",
      efficiency: PSEUDO_CHU_EFFICIENCY,
    });
  });

  it("has no surface coating", () => {
    expect(resolved.automaticSurfaceCoating).toBeNull();
  });

  /*
   * Awakening is authoritative. A recorded Ten rank on an unawakened character
   * is data that cannot be true, and the awakening flag is the half to trust.
   */
  it("stays unawakened even with a Ten rank recorded", () => {
    const odd = access({ awakened: false, effectiveTenMastery: 5 });

    expect(odd.state).toBe("unawakened");
    expect(odd.automaticSurfaceCoating).toBeNull();
  });
});


describe("awakened but uncontained", () => {
  const resolved = access(UNCONTAINED);

  it("has open nodes", () => {
    expect(resolved.state).toBe("uncontained");
    expect(resolved.awakened).toBe(true);
    expect(resolved.nodeState).toBe("open");
  });

  /*
   * The pseudo-Chu is gone and nothing has replaced it. This is the state that
   * makes awakening without Ten a genuine liability rather than a free upgrade.
   */
  it("no longer receives pseudo-Chu", () => {
    expect(resolved.passiveInternalReinforcement).toBeNull();
  });

  it("has no stable surface coating and no reachable Output", () => {
    expect(resolved.automaticSurfaceCoating).toBeNull();
    expect(resolved.accessFraction).toBe(0);
  });
});


describe("awakened with Ten", () => {
  const resolved = access(WITH_TEN);

  it("is the default state once Ten is learned", () => {
    expect(resolved.state).toBe("ten");
    expect(resolved.awakened).toBe(true);
    expect(resolved.nodeState).toBe("open");
  });

  it("coats the whole body from 5% of physiological Output", () => {
    expect(TEN_SURFACE_COATING_OUTPUT_FRACTION).toBe(0.05);
    expect(resolved.accessFraction).toBe(0.05);
    expect(resolved.automaticSurfaceCoating).toEqual({
      source: "baseline-ten",
      outputFraction: 0.05,
    });
  });

  it("places nothing inside the body", () => {
    expect(resolved.deliberateInternalAccess).toBe(false);
    expect(resolved.passiveInternalReinforcement).toBeNull();
  });

  /*
   * Effective mastery decides availability and nothing else. Ten's scaling,
   * upkeep and containment limits are Ten's own file's business, so every rank
   * from I upward resolves to the same access.
   */
  it("resolves identically at every learned rank", () => {
    for (let rank = 1; rank <= 10; rank += 1) {
      expect(access({ awakened: true, effectiveTenMastery: rank }))
        .toEqual(resolved);
    }
  });

  it("falls back to uncontained when a seal reduces Ten to 0", () => {
    expect(access({ awakened: true, effectiveTenMastery: 0 }).state)
      .toBe("uncontained");
  });
});


describe("typed access overrides", () => {
  it("opens a share of Output and keeps Ten running", () => {
    const resolved = access({
      ...WITH_TEN,
      override: { kind: "output-access", source: "ren-iii", accessFraction: 0.3 },
    });

    expect(resolved.state).toBe("override");
    expect(resolved.source).toBe("ren-iii");
    expect(resolved.accessFraction).toBe(0.3);
    expect(resolved.deliberateExternalAccess).toBe(true);
    expect(resolved.automaticSurfaceCoating).not.toBeNull();
  });

  it("does not conjure a Ten coating for a character without Ten", () => {
    const resolved = access({
      ...UNCONTAINED,
      override: { kind: "output-access", source: "ren-i", accessFraction: 0.1 },
    });

    expect(resolved.automaticSurfaceCoating).toBeNull();
  });

  it("closes ordinary Output and Ten when suppressed", () => {
    const resolved = access({
      ...WITH_TEN,
      override: { kind: "suppressed", source: "zetsu" },
    });

    expect(resolved.accessFraction).toBe(0);
    expect(resolved.automaticSurfaceCoating).toBeNull();
    expect(resolved.deliberateExternalAccess).toBe(false);
    expect(resolved.deliberateInternalAccess).toBe(false);
  });

  it("trades the coating for internal placement", () => {
    const resolved = access({
      ...WITH_TEN,
      override: {
        kind: "internal-access",
        source: "chu",
        accessFraction: 0.4,
      },
    });

    expect(resolved.deliberateInternalAccess).toBe(true);
    expect(resolved.automaticSurfaceCoating).toBeNull();
    expect(resolved.accessFraction).toBe(0.4);
  });

  it("takes every field outright when stated explicitly", () => {
    const resolved = access({
      ...WITH_TEN,
      override: {
        kind: "explicit",
        source: "some-later-effect",
        accessFraction: 0.75,
        deliberateInternalAccess: true,
        deliberateExternalAccess: false,
        automaticSurfaceCoating: false,
      },
    });

    expect(resolved.accessFraction).toBe(0.75);
    expect(resolved.deliberateInternalAccess).toBe(true);
    expect(resolved.deliberateExternalAccess).toBe(false);
    expect(resolved.automaticSurfaceCoating).toBeNull();
  });

  it("never carries pseudo-Chu, which belongs to unawakened bodies", () => {
    const resolved = access({
      ...WITH_TEN,
      override: { kind: "internal-access", source: "chu", accessFraction: 0.4 },
    });

    expect(resolved.passiveInternalReinforcement).toBeNull();
  });
});


describe("access inputs that cannot be true", () => {
  it("rejects a Ten rank outside 0 through X", () => {
    expect(errorCodes(resolveAuraAccess({
      awakened: true,
      effectiveTenMastery: 11,
    }))).toContain("aura.access.ten_mastery.invalid");

    expect(errorCodes(resolveAuraAccess({
      awakened: true,
      effectiveTenMastery: 2.5,
    }))).toContain("aura.access.ten_mastery.invalid");
  });

  it("rejects an access fraction outside 0 through 1", () => {
    expect(errorCodes(resolveAuraAccess({
      ...WITH_TEN,
      override: { kind: "output-access", source: "ren", accessFraction: 1.5 },
    }))).toContain("aura.access.fraction.invalid");
  });

  it("rejects an unnamed override", () => {
    expect(errorCodes(resolveAuraAccess({
      ...WITH_TEN,
      override: { kind: "output-access", source: "  ", accessFraction: 0.2 },
    }))).toContain("aura.access.override.source.missing");
  });

  /*
   * An override describes a principle doing something, and an unawakened
   * character has no principles. Quietly letting it win would make awakening
   * look optional.
   */
  it("rejects an override on an unawakened character", () => {
    expect(errorCodes(resolveAuraAccess({
      ...UNAWAKENED,
      override: { kind: "output-access", source: "ren", accessFraction: 0.2 },
    }))).toContain("aura.access.override.unawakened");
  });
});


describe("placement permission", () => {
  const INTERNAL: AuraAllocation = {
    id: "chu-fist",
    coverage: "localized",
    placement: "internal",
    continuityKey: RIGHT_ARM,
    aura: 100,
  };

  const SURFACE: AuraAllocation = {
    id: "coat",
    coverage: "whole-body",
    placement: "surface",
    aura: 100,
  };

  it("refuses internal placement on an awakened character by default", () => {
    const issues = findAuraPlacementIssues([INTERNAL], access(WITH_TEN));

    expect(issues.map((issue) => issue.code))
      .toEqual(["aura.access.internal_placement.not_permitted"]);
  });

  it("permits internal placement once an override grants it", () => {
    const granted = access({
      ...WITH_TEN,
      override: { kind: "internal-access", source: "chu", accessFraction: 0.4 },
    });

    expect(findAuraPlacementIssues([INTERNAL], granted)).toEqual([]);
  });

  it("refuses everything an unawakened character tries to place", () => {
    const issues = findAuraPlacementIssues([INTERNAL, SURFACE], access(UNAWAKENED));

    expect(issues.map((issue) => issue.code)).toEqual([
      "aura.access.internal_placement.not_permitted",
      "aura.access.surface_placement.not_permitted",
    ]);
  });

  it("permits surface placement on an awakened character", () => {
    expect(findAuraPlacementIssues([SURFACE], access(WITH_TEN))).toEqual([]);
  });
});
