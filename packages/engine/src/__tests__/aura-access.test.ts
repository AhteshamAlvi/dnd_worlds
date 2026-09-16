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
 *   TEN          awakened with Ten: the default state, wearing the coating
 *                Ten resolved — which is the 5% floor until Ren opens enough
 *                Output for the Mastery term to beat it
 *
 * Overrides are the extension point for Ren, Zetsu, Chu and anything else.
 * None of their mechanics are implemented; what is tested here is that the
 * typed shapes flatten into the right fractions and permissions.
 */

import { describe, expect, it } from "vitest";

import {
  findAuraPlacementIssues,
  resolveAuraAccess,
} from "../character/foundation/aura/access";
import {
  PSEUDO_CHU_EFFICIENCY,
  PSEUDO_CHU_SOURCE,
} from "../character/foundation/nen/principles/chu";
import {
  TEN_MINIMUM_COATING_OUTPUT_FRACTION,
} from "../character/foundation/nen/principles/ten";
import { continuityKey } from "../character/foundation/body/anatomy/types";
import type { AuraAllocation } from "../character/foundation/aura/state";
import type {
  AuraAccessInput,
  ResolvedAuraAccess,
} from "../character/foundation/aura/types";

import {
  REVERTED,
  UNAWAKENED,
  UNCONTAINED,
  WITH_TEN,
  withTen,
} from "./fixtures/aura";

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

  /*
   * Supplied by Chū and carried through unread. This file owns neither the
   * efficiency nor the decision that a never-awakened body produces one; what
   * it owns is that an awakened character's is dropped.
   */
  it("carries the passive internal reinforcement it was handed", () => {
    expect(resolved.passiveInternalReinforcement).toEqual({
      source: PSEUDO_CHU_SOURCE,
      efficiency: PSEUDO_CHU_EFFICIENCY,
    });
  });

  it("gives a reverted character none, though their nodes are just as shut", () => {
    const reverted = access(REVERTED);

    expect(reverted.state).toBe("reverted");
    expect(reverted.nodeState).toBe("half-open");
    expect(reverted.passiveInternalReinforcement).toBeNull();
  });

  it("drops a reinforcement handed to an awakened character", () => {
    const odd = access({
      ...WITH_TEN,
      passiveInternalReinforcement: {
        source: PSEUDO_CHU_SOURCE,
        efficiency: PSEUDO_CHU_EFFICIENCY,
      },
    });

    expect(odd.passiveInternalReinforcement).toBeNull();
  });

  it("refuses a malformed reinforcement rather than spreading it", () => {
    expect(errorCodes(resolveAuraAccess({
      awakened: false,
      effectiveTenMastery: 0,
      passiveInternalReinforcement: {
        source: PSEUDO_CHU_SOURCE,
        efficiency: Number.NaN,
      },
    }))).toContain("aura.access.passive_reinforcement.efficiency.invalid");
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

  it("coats the whole body from the 5% floor when there is no Ren", () => {
    expect(TEN_MINIMUM_COATING_OUTPUT_FRACTION).toBe(0.05);
    expect(resolved.accessFraction).toBe(0.05);
    expect(resolved.automaticSurfaceCoating).toEqual({
      source: "baseline-ten",
      outputFraction: 0.05,
      masteryFraction: 0,
      minimumFraction: 0.05,
    });
  });

  it("places nothing inside the body", () => {
    expect(resolved.deliberateInternalAccess).toBe(false);
    expect(resolved.passiveInternalReinforcement).toBeNull();
  });

  /*
   * Effective mastery decides AVAILABILITY here and nothing else, which is why
   * every rank still flattens to the same access: Ten's containment fraction
   * is a share of what Ren has opened, and a character with no Ren has had
   * nothing opened. Mastery X holds all of zero, so the floor is the whole
   * coating at every rank, and the difference between ranks only appears once
   * there is Output to contain. That case is Ten's own suite.
   */
  it("resolves identically at every learned rank when there is no Ren", () => {
    for (let rank = 1; rank <= 10; rank += 1) {
      expect(access(withTen(rank))).toEqual(resolved);
    }
  });

  it("falls back to uncontained when a seal reduces Ten to 0", () => {
    expect(access(withTen(0)).state).toBe("uncontained");
  });

  /*
   * The coating is Ten's answer, and this file refuses to invent one.
   *
   * A hand-built input that skipped the Nen projection used to resolve a flat
   * 5% regardless of rank or Ren, which is the defect the Ten correction
   * removed. Silence is not available to it any more.
   */
  it("refuses a character with usable Ten and no resolved coating", () => {
    const result = resolveAuraAccess({
      awakened: true,
      effectiveTenMastery: 3,
    });

    expect(result.success).toBe(false);
    expect(errorCodes(result)).toContain("aura.access.ten_coating.missing");
  });

  it("refuses a coating that is not a share of Output", () => {
    const result = resolveAuraAccess({
      awakened: true,
      effectiveTenMastery: 3,
      tenCoating: {
        source: "baseline-ten",
        outputFraction: Number.NaN,
        masteryFraction: 0,
        minimumFraction: 0.05,
      },
    });

    expect(result.success).toBe(false);
    expect(errorCodes(result))
      .toContain("aura.access.ten_coating.fraction.invalid");
  });

  /*
   * And the mirror: an unawakened character is not missing anything. The
   * coating is absent because Ten does not reach them, not because a caller
   * forgot it.
   */
  it("asks no coating of anybody Ten does not reach", () => {
    expect(resolveAuraAccess(UNAWAKENED).success).toBe(true);
    expect(resolveAuraAccess(UNCONTAINED).success).toBe(true);
  });
});


describe("typed access overrides", () => {
  it("opens a share of Output and keeps Ten running", () => {
    const resolved = access(withTen(1, { kind: "output-access", source: "ren-iii", accessFraction: 0.3 }));

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
    const resolved = access(withTen(1, { kind: "suppressed", source: "zetsu" }));

    expect(resolved.accessFraction).toBe(0);
    expect(resolved.automaticSurfaceCoating).toBeNull();
    expect(resolved.deliberateExternalAccess).toBe(false);
    expect(resolved.deliberateInternalAccess).toBe(false);
  });

  it("trades the coating for internal placement", () => {
    const resolved = access(withTen(1, {
      kind: "internal-access",
      source: "chu",
      accessFraction: 0.4,
    }));

    expect(resolved.deliberateInternalAccess).toBe(true);
    expect(resolved.automaticSurfaceCoating).toBeNull();
    expect(resolved.accessFraction).toBe(0.4);
  });

  it("takes every field outright when stated explicitly", () => {
    const resolved = access(withTen(1, {
      kind: "explicit",
      source: "some-later-effect",
      accessFraction: 0.75,
      deliberateInternalAccess: true,
      deliberateExternalAccess: false,
      automaticSurfaceCoating: false,
    }));

    expect(resolved.accessFraction).toBe(0.75);
    expect(resolved.deliberateInternalAccess).toBe(true);
    expect(resolved.deliberateExternalAccess).toBe(false);
    expect(resolved.automaticSurfaceCoating).toBeNull();
  });

  /*
   * The one field an explicit override cannot state outright. It asks WHETHER
   * a coating applies; how big one is has exactly one source, so an override
   * can waive Ten's coating and cannot conjure one for a character with no Ten
   * to conjure it from.
   */
  it("gives an explicitly requested coating the one Ten resolved", () => {
    const asked = {
      kind: "explicit",
      source: "some-later-effect",
      accessFraction: 0.5,
      deliberateInternalAccess: false,
      deliberateExternalAccess: true,
      automaticSurfaceCoating: true,
    } as const;

    /* Ten X holding half the Output that override opened: 50%, not the floor. */
    expect(access(withTen(10, asked)).automaticSurfaceCoating)
      .toEqual({
        source: "baseline-ten",
        outputFraction: 0.5,
        masteryFraction: 0.5,
        minimumFraction: 0.05,
      });

    expect(access({ ...UNCONTAINED, override: asked }).automaticSurfaceCoating)
      .toBeNull();
  });

  it("never carries pseudo-Chu, which belongs to unawakened bodies", () => {
    const resolved = access(withTen(1, { kind: "internal-access", source: "chu", accessFraction: 0.4 }));

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
    expect(errorCodes(resolveAuraAccess(withTen(1, { kind: "output-access", source: "ren", accessFraction: 1.5 })))).toContain("aura.access.fraction.invalid");
  });

  it("rejects an unnamed override", () => {
    expect(errorCodes(resolveAuraAccess(withTen(1, { kind: "output-access", source: "  ", accessFraction: 0.2 })))).toContain("aura.access.override.source.missing");
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
  /*
   * Uniform internal, not a concentration. What is under test is whether the
   * access state PERMITS internal placement at all, which has nothing to do
   * with how the Aura is spread — and ordinary internal Aura is complete and
   * even, so a one-part version would have misdescribed it.
   */
  const INTERNAL: AuraAllocation = {
    id: "internal",
    coverage: "whole-body",
    placement: "internal",
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
    const granted = access(withTen(1, { kind: "internal-access", source: "chu", accessFraction: 0.4 }));

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
