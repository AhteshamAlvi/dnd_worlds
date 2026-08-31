/*
 * Tests applyBodyDamage — the full pipeline from "this target took this much
 * penetrating damage" to updated persistent Anatomy.
 *
 * The two regressions that matter most:
 *
 * - Fatal ordering: a fatal Critical failure must be detected using the
 *   Critical Point set that existed at the moment of the hit, BEFORE the
 *   destroyed host is archived — otherwise the archiving makes the
 *   Critical Point (and its fatal failure) disappear along with it.
 * - No damage spill: a Joint multiplier applies only to its host BodyPart,
 *   and destroying a BodyPart removes its structural descendants without
 *   giving them any of its damage — they simply cease to exist.
 */

import { describe, expect, it } from "vitest";

import { applyBodyDamage } from "../character/foundation/body/damage";
import type { BodyDamageInput } from "../character/foundation/body/damage";
import { listDefinitions } from "../character/catalogs";
import { STANDARD_BODY } from "../character/foundation/body/defaults";
import { resolveMorphology } from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import type { Body } from "../character/foundation/body/types";

const REFERENCE_CONSTITUTION = 10;

const NEUTRAL_SOURCE = { global: NEUTRAL_MORPHOLOGY, local: {} };

/*
 * Neutral morphology for the standard humanoid, so every part resolves to its
 * reference Structural Capacity and Maximum BP is the table in
 * anatomy/body-parts.ts: Arm 14, Hand 4, Head 8, Neck 2, Upper Body 10.
 */
const NEUTRAL_MORPHOLOGY_BY_PART = resolveMorphology(
  {
    species: NEUTRAL_SOURCE,
    age: NEUTRAL_SOURCE,
    character: NEUTRAL_SOURCE,
    strengthDevelopmentMuscularity: 1,
    effectLayers: [],
  },
  STANDARD_BODY.anatomy.parts.map((part) => part.id),
);

function baseInput(overrides: Partial<BodyDamageInput> = {}): BodyDamageInput {
  return {
    body: STANDARD_BODY,
    constitution: REFERENCE_CONSTITUTION,
    morphologyByPartId: NEUTRAL_MORPHOLOGY_BY_PART,
    effectiveScale: 1,
    bodyPartDefinitions: listDefinitions("body-part"),
    specialPointDefinitions: listDefinitions("special-point"),
    target: { kind: "body-part", partId: "arm-1" },
    penetratingDamage: 4,
    ...overrides,
  };
}

function requireSuccess<T>(result: { success: boolean; payload?: T }): T {
  if (!result.success || result.payload === undefined) {
    throw new Error("Expected applyBodyDamage to succeed.");
  }
  return result.payload;
}

describe("Joint targeting", () => {
  it("applies the multiplier to the host and leaves the attached part undamaged", () => {
    const result = applyBodyDamage(
      baseInput({
        target: { kind: "special-point", pointId: "shoulder:arm-1" },
        penetratingDamage: 4,
      }),
    );

    const outcome = requireSuccess(result);

    expect(outcome.hostPartId).toBe("arm-1");
    expect(outcome.damageMultiplier).toBe(2);
    expect(outcome.appliedDamage).toBe(8);

    const arm = outcome.anatomy.parts.find((p) => p.id === "arm-1");
    const hand = outcome.anatomy.parts.find((p) => p.id === "hand-1");

    // Arm Maximum BP is 14, so 8 damage leaves 6/14 integrity.
    expect(arm?.integrity).toBeCloseTo(6 / 14, 10);
    expect(hand?.integrity).toBe(1); // no spill into the attached Hand
  });

  it("a non-Joint target has multiplier 1", () => {
    const result = applyBodyDamage(
      baseInput({ target: { kind: "body-part", partId: "arm-1" }, penetratingDamage: 5 }),
    );

    const outcome = requireSuccess(result);
    expect(outcome.damageMultiplier).toBe(1);
    expect(outcome.appliedDamage).toBe(5);
  });
});

describe("Injury-opportunity metadata", () => {
  it("is true for a Semicritical target", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({ target: { kind: "special-point", pointId: "face:head-1" } }),
      ),
    );
    expect(outcome.injuryOpportunity).toBe(true);
  });

  it("is true for a Joint target", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({ target: { kind: "special-point", pointId: "shoulder:arm-1" } }),
      ),
    );
    expect(outcome.injuryOpportunity).toBe(true);
  });

  it("is false for a Critical target", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "special-point", pointId: "brain:head-1" },
          penetratingDamage: 1,
        }),
      ),
    );
    expect(outcome.injuryOpportunity).toBe(false);
  });

  it("is false for a plain body-part target", () => {
    const outcome = requireSuccess(applyBodyDamage(baseInput()));
    expect(outcome.injuryOpportunity).toBe(false);
  });
});

describe("fatal-ordering regression", () => {
  it("detects the Brain's fatal failure even though the Head is removed in the same call", () => {
    // Head Maximum BP is 8 at reference morphology/CON — 8 damage destroys it.
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "body-part", partId: "head-1" },
          penetratingDamage: 8,
        }),
      ),
    );

    expect(outcome.destroyedPartIds).toContain("head-1");
    expect(outcome.removedPartIds).toContain("head-1");
    /*
     * Archived, not deleted. A destroyed part stays in the tree as
     * "archived-removed" so extraordinary regeneration has a specific
     * structure to regrow, and so the Reference Form's expectation and the
     * body's actual contents stay separately inspectable.
     */
    expect(
      outcome.anatomy.parts.find((p) => p.id === "head-1")?.state,
    ).toBe("archived-removed");

    // This is the assertion that would fail if fatal-failure detection ran
    // AFTER removal: the Brain point's host (Head) is already gone from
    // outcome.anatomy, so re-deriving Critical Points from outcome.anatomy
    // would never find "brain:head-1" to report as fatal.
    const fatalIds = outcome.fatalCriticalFailures.map((p) => p.id);
    expect(fatalIds).toContain("brain:head-1");
  });

  it("a Head above 0 BP produces no fatal Brain failure", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "body-part", partId: "head-1" },
          penetratingDamage: 3,
        }),
      ),
    );

    expect(outcome.fatalCriticalFailures).toEqual([]);
    expect(outcome.anatomy.parts.some((p) => p.id === "head-1")).toBe(true);
  });

  it("an Arm reaching 0 BP is not inherently fatal", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "body-part", partId: "arm-1" },
          penetratingDamage: 14,
        }),
      ),
    );

    expect(outcome.destroyedPartIds).toContain("arm-1");
    expect(outcome.fatalCriticalFailures).toEqual([]);
  });
});

describe("fatal Critical failures across all three Critical Points", () => {
  it("Upper Body Current BP = 0 -> Heart fatal failure", () => {
    // Upper Body Maximum BP is 10 — its reference Structural Capacity.
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "body-part", partId: "upper-body-1" },
          penetratingDamage: 10,
        }),
      ),
    );

    expect(outcome.fatalCriticalFailures.map((p) => p.id)).toContain(
      "heart:upper-body-1",
    );
  });

  it("Neck Current BP = 0 -> Neck fatal failure", () => {
    // Neck Maximum BP is 2 — its reference Structural Capacity.
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "body-part", partId: "neck-1" },
          penetratingDamage: 2,
        }),
      ),
    );

    expect(outcome.fatalCriticalFailures.map((p) => p.id)).toContain("neck:neck-1");
  });

  it("Leg Current BP = 0 is not inherently fatal", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "body-part", partId: "leg-1" },
          penetratingDamage: 16,
        }),
      ),
    );

    expect(outcome.destroyedPartIds).toContain("leg-1");
    expect(outcome.fatalCriticalFailures).toEqual([]);
  });
});

describe("structural destruction cascade", () => {
  it("destroying an Arm removes its attached Hand too, without transferring damage", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "body-part", partId: "arm-1" },
          penetratingDamage: 14, // exactly Arm's Maximum BP
        }),
      ),
    );

    expect(outcome.removedPartIds.slice().sort()).toEqual(["arm-1", "hand-1"]);
    const stateOf = (id: string) =>
      outcome.anatomy.parts.find((p) => p.id === id)?.state;

    expect(stateOf("arm-1")).toBe("archived-removed");
    expect(stateOf("hand-1")).toBe("archived-removed");

    // The Hand was never itself reduced to 0 BP — it disappears purely
    // because its structural attachment to the organism was destroyed.
    expect(outcome.destroyedPartIds).toEqual(["arm-1"]);
  });
});

describe("purity", () => {
  it("does not mutate the input Body", () => {
    const before = JSON.parse(JSON.stringify(STANDARD_BODY)) as Body;

    applyBodyDamage(baseInput({ penetratingDamage: 999 }));

    expect(STANDARD_BODY).toEqual(before);
  });

  it("returns a new Anatomy object distinct from the input", () => {
    const outcome = requireSuccess(applyBodyDamage(baseInput()));
    expect(outcome.anatomy).not.toBe(STANDARD_BODY.anatomy);
  });
});

describe("error paths", () => {
  it("rejects an unknown body-part target", () => {
    const result = applyBodyDamage(
      baseInput({ target: { kind: "body-part", partId: "tail-1" } }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]?.code).toBe("body.damage.target.unknown");
    }
  });

  it("rejects an unknown special-point target", () => {
    const result = applyBodyDamage(
      baseInput({ target: { kind: "special-point", pointId: "tail-whip:tail-1" } }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]?.code).toBe("body.damage.target.unknown");
    }
  });

  it("rejects Spine targeted without a hostPartId as ambiguous", () => {
    const result = applyBodyDamage(
      baseInput({ target: { kind: "special-point", pointId: "spine:shared:lower-body-1,upper-body-1" } }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]?.code).toBe("body.damage.target.ambiguous_host");
    }
  });

  it("accepts Spine targeted with an explicit hostPartId", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: {
            kind: "special-point",
            pointId: "spine:shared:lower-body-1,upper-body-1",
            hostPartId: "upper-body-1",
          },
        }),
      ),
    );

    expect(outcome.hostPartId).toBe("upper-body-1");
  });

  it("rejects a hostPartId that isn't among the point's hosts", () => {
    const result = applyBodyDamage(
      baseInput({
        target: {
          kind: "special-point",
          pointId: "spine:shared:lower-body-1,upper-body-1",
          hostPartId: "head-1",
        },
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]?.code).toBe("body.damage.target.invalid_host");
    }
  });

  it("rejects negative penetrating damage", () => {
    const result = applyBodyDamage(baseInput({ penetratingDamage: -1 }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]?.code).toBe("body.damage.penetrating_damage.invalid");
    }
  });

  it("rejects non-finite penetrating damage", () => {
    const result = applyBodyDamage(baseInput({ penetratingDamage: NaN }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]?.code).toBe("body.damage.penetrating_damage.invalid");
    }
  });
});
