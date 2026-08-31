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
  /*
   * Joints no longer multiply damage. A Shoulder used to double every point
   * aimed at it; it now breaks at a threshold and multiplies nothing. Where a
   * joint region really is soft the definition says so by ALSO being Weak,
   * which is why the Armpit beside the Shoulder is x1.5 and the Shoulder is
   * not.
   */
  it("does not multiply damage, and does not spill into the attached part", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "special-point", pointId: "shoulder:arm-1" },
          penetratingDamage: 4,
        }),
      ),
    );

    expect(outcome.hostPartId).toBe("arm-1");
    expect(outcome.weakMultiplier).toBe(1);
    expect(outcome.appliedDamage).toBe(4);

    const arm = outcome.anatomy.parts.find((p) => p.id === "arm-1");
    const hand = outcome.anatomy.parts.find((p) => p.id === "hand-1");

    // Arm Maximum BP is 14, so 4 damage leaves 10/14 integrity.
    expect(arm?.integrity).toBeCloseTo(10 / 14, 10);
    expect(hand?.integrity).toBe(1);
  });

  it("fails the Joint at 30% of the designated part's Maximum BP", () => {
    const below = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "special-point", pointId: "shoulder:arm-1" },
          penetratingDamage: 4,
        }),
      ),
    );

    const at = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "special-point", pointId: "shoulder:arm-1" },
          penetratingDamage: 5,
        }),
      ),
    );

    expect(below.jointThreshold).toBe(5); // ceil(14 x 0.30)
    expect(below.jointFailed).toBe(false);
    expect(at.jointFailed).toBe(true);
    expect(at.jointDesignatedPartId).toBe("arm-1");
  });

  /*
   * A Wrist sits on the Arm and governs the Hand, so its threshold is 30% of
   * the Hand's 4 Maximum BP rather than 30% of the Arm's 14. Damage still
   * lands on the host Arm; only the threshold reads the designated part.
   */
  it("reads a Wrist's threshold off the Hand, not the Arm hosting it", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "special-point", pointId: "wrist:arm-1" },
          penetratingDamage: 2,
        }),
      ),
    );

    expect(outcome.hostPartId).toBe("arm-1");
    expect(outcome.jointDesignatedPartId).toBe("hand-1");
    expect(outcome.jointThreshold).toBe(2); // ceil(4 x 0.30)
    expect(outcome.jointFailed).toBe(true);
  });
});

describe("Weak", () => {
  /*
   * Multiply, THEN round. Rounding first would let two hits differing only by
   * a fraction land on opposite sides of a threshold.
   */
  it("multiplies before rounding", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "special-point", pointId: "jaw:head-1" },
          penetratingDamage: 3,
        }),
      ),
    );

    expect(outcome.weakMultiplier).toBe(1.5);
    expect(outcome.appliedDamage).toBe(5); // round(4.5), not round(3) x 1.5
  });

  it("leaves a non-Weak point at multiplier 1", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "special-point", pointId: "brain:head-1" },
          penetratingDamage: 3,
        }),
      ),
    );

    expect(outcome.weakMultiplier).toBe(1);
    expect(outcome.appliedDamage).toBe(3);
  });

  /*
   * An Armpit is Joint AND Weak, so one hit both multiplies and is measured
   * against the Joint threshold — using the multiplied number.
   */
  it("feeds the multiplied damage into the Joint threshold", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "special-point", pointId: "armpit:arm-1" },
          penetratingDamage: 4,
        }),
      ),
    );

    expect(outcome.appliedDamage).toBe(6); // 4 x 1.5
    expect(outcome.jointThreshold).toBe(5);
    expect(outcome.jointFailed).toBe(true);
  });
});

describe("Critical tiers", () => {
  /*
   * Head Maximum BP 8, so the Brain's tiers sit at 1, 3 and 4. The engine
   * returns the tier and the injury CHANCE, and never rolls: randomness
   * belongs to the Foundry module, the same way every other subsystem here
   * answers questions and leaves resolution to its caller.
   */
  it.each([
    [1, "minor", "one-third"],
    [3, "major", "one-half"],
    [4, "destruction", "guaranteed"],
  ])("%i damage to the Brain reaches the %s tier", (damage, tier, chance) => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "special-point", pointId: "brain:head-1" },
          penetratingDamage: damage,
        }),
      ),
    );

    expect(outcome.critical.tier).toBe(tier);
    expect(outcome.critical.injuryChance).toBe(chance);
  });

  it("reaches no tier for a plain BodyPart target", () => {
    const outcome = requireSuccess(applyBodyDamage(baseInput()));

    expect(outcome.critical.tier).toBe("none");
    expect(outcome.critical.injuryChance).toBe("none");
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
    /*
     * Destroying the Head takes the Brain with it, even though the attacker
     * targeted the BodyPart rather than the point. Without that, decapitation
     * would archive a Head and leave the character alive.
     *
     * This is also the ordering regression: the Brain is found against the
     * pre-archive point set. Re-deriving points from outcome.anatomy would
     * never find "brain:head-1", because an archived Head hosts nothing.
     */
    expect(outcome.fatal).toBe(true);
    expect(outcome.fatalPointIds).toContain("brain:head-1");
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

    expect(outcome.fatal).toBe(false);
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
    expect(outcome.fatal).toBe(false);
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

    expect(outcome.fatalPointIds).toContain("heart:upper-body-1");
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

    expect(outcome.fatalPointIds).toContain("neck:neck-1");
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
    expect(outcome.fatal).toBe(false);
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

  /*
   * The three tests that used to live here are gone with the thing they
   * tested. A Spine spanning the Upper and Lower Body was one point with two
   * hosts, so every caller had to answer "which host did this hit land on" —
   * and could be rejected for ambiguity, or for naming a host the point did
   * not have.
   *
   * The Spine is now Upper Spine and Lower Spine, one host each, so the
   * question no longer exists to be answered wrongly. What is left is the
   * property that replaced it.
   */
  it("gives every Anatomical Point exactly one unambiguous host", () => {
    for (const pointId of [
      "upper-spine:upper-body-1",
      "lower-spine:lower-body-1",
    ]) {
      const outcome = requireSuccess(
        applyBodyDamage(
          baseInput({ target: { kind: "special-point", pointId } }),
        ),
      );

      expect(outcome.hostPartId).toBe(pointId.split(":")[1]);
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
