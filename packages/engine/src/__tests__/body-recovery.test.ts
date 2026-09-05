/*
 * Natural BP recovery: the primitive (body-points/recovery.ts) and the
 * VIT-driven pass that drives it (foundation/body/recovery/resolution.ts).
 *
 * Injury treatment caps, overlap detection and Injury removal are covered in
 * injury-recovery.test.ts; this file is plain natural recovery with nothing
 * else in play.
 *
 *
 * WHAT THIS PHASE REMOVED FROM THIS SUITE
 *
 * Half the old tests were about `recoveryProgress` — the banked fraction of a
 * whole Body Point that recovery had earned but could not yet spend, because
 * BP was a whole number. Storing integrity as a fraction deletes the concept
 * outright: recovery happens in exact BP, the result is divided back into a
 * fraction, and the remainder simply IS the fraction. There is nothing left to
 * bank, and so nothing left to test about banking, resetting it, or losing it
 * at a ceiling.
 *
 * What survives is the arithmetic that was always the point: how much heals,
 * and where it stops.
 */

import { describe, expect, it } from "vitest";
import { listAnatomicalInjuryDefinitions } from "../character/status/injuries";

import { continuityKey } from "../character/foundation/body/anatomy/types";

import { applyBodyPartRecovery } from "../character/foundation/body/body-points/recovery";
import { continuityIntegrity } from "../character/foundation/body/continuity";
import type { Anatomy } from "../character/foundation/body/anatomy/types";
import type { BodyPartDefinition } from "../character/foundation/body/anatomy/types";
import {
  morphologyTargetsForAnatomy,
  resolveMorphology,
} from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import type { Body } from "../character/foundation/body/types";

import {
  deriveDailyRecoveryFraction,
  resolveRecovery,
} from "../character/foundation/body/recovery/resolution";
import type { ResolveRecoveryInput } from "../character/foundation/body/recovery/types";

import { days, hours } from "../time/duration";
import { TEST_BODY_STATE, TEST_PART_PHYSICALS } from "./fixtures/body";

// Structural Capacity 20 at neutral morphology and CON 10 resolves to exactly
// 20 Maximum BP — keeps every expected number in these tests a round one.
const DEFINITIONS: readonly BodyPartDefinition[] = [
  {
    id: "torso",
    name: "Torso",
    description: "Test torso.",
    tags: ["core"],
    ...TEST_PART_PHYSICALS,
    reference: { ...TEST_PART_PHYSICALS.reference, structuralCapacity: 20 },
  },
];

const REFERENCE_CONSTITUTION = 10;
const NEUTRAL_SOURCE = { global: NEUTRAL_MORPHOLOGY, local: {} };

/** A single torso at the given integrity. Maximum BP is 20 throughout. */
function singleTorso(integrity: number): Anatomy {
  return {
    parts: [
      { id: "torso-1", type: "torso", attachment: null, referenceFormId: "default", referenceSlotId: "torso-1", continuityKey: continuityKey("torso-1"), state: "active", integrity },
    ],
  };
}

function morphologyFor(anatomy: Anatomy) {
  return resolveMorphology(
    {
      species: NEUTRAL_SOURCE,
      age: NEUTRAL_SOURCE,
      character: NEUTRAL_SOURCE,
      individual: {},
      strengthDevelopmentMuscularity: 1,
      effectLayers: [],
    },
    morphologyTargetsForAnatomy(anatomy),
  );
}

function baseInput(
  overrides: Partial<ResolveRecoveryInput> = {},
): ResolveRecoveryInput {
  const anatomy = overrides.anatomy ?? singleTorso(0.5);

  return {
    anatomy,
    continuity: {},
    constitution: REFERENCE_CONSTITUTION,
    bodyPartDefinitions: DEFINITIONS,
    morphologyByPartId: morphologyFor(anatomy),
    effectiveScale: 1,
    injuries: [],

    // Body is handed its definitions now; the catalog lives above it.
    injuryDefinitions: listAnatomicalInjuryDefinitions(),

    elapsed: days(1),
    vitality: 10,
    ...overrides,
  };
}


describe("applyBodyPartRecovery — the primitive", () => {
  /*
   * Recovery is exact throughout, and this is the case the old whole-BP model
   * could not express: half a point of healing onto a part missing ten points
   * genuinely leaves it half a point better off, rather than restoring nothing
   * and banking a remainder.
   */
  it("restores fractional BP exactly", () => {
    const result = applyBodyPartRecovery({
      integrity: 0.5,
      maximumBP: 20,
      maximumPermittedCurrentBP: 20,
      recoveryAmountBP: 0.5,
    });

    expect(result.bpRestored).toBeCloseTo(0.5, 10);
    expect(result.integrity).toBeCloseTo(10.5 / 20, 10);
  });

  it("accumulates small amounts across calls without losing a fraction", () => {
    let integrity = 0.5;

    for (let tick = 0; tick < 4; tick += 1) {
      integrity = applyBodyPartRecovery({
        integrity,
        maximumBP: 20,
        maximumPermittedCurrentBP: 20,
        recoveryAmountBP: 0.5,
      }).integrity;
    }

    // Four half-points is exactly two points: 10 -> 12 of 20.
    expect(integrity).toBeCloseTo(12 / 20, 10);
  });

  it("never restores past Maximum BP however large the tick", () => {
    const result = applyBodyPartRecovery({
      integrity: 0.5,
      maximumBP: 20,
      maximumPermittedCurrentBP: 20,
      recoveryAmountBP: 1000,
    });

    expect(result.integrity).toBe(1);
    expect(result.bpRestored).toBe(10);
  });

  it("stops at a lower ceiling and reports only what it restored", () => {
    const result = applyBodyPartRecovery({
      integrity: 0.5,
      maximumBP: 20,
      maximumPermittedCurrentBP: 14,
      recoveryAmountBP: 1000,
    });

    expect(result.integrity).toBeCloseTo(14 / 20, 10);
    expect(result.bpRestored).toBe(4);
  });

  it("does nothing when already at the ceiling", () => {
    const result = applyBodyPartRecovery({
      integrity: 0.7,
      maximumBP: 20,
      maximumPermittedCurrentBP: 14,
      recoveryAmountBP: 5,
    });

    expect(result.integrity).toBe(0.7);
    expect(result.bpRestored).toBe(0);
  });

  it("treats a ceiling above Maximum BP as Maximum BP", () => {
    const result = applyBodyPartRecovery({
      integrity: 0.5,
      maximumBP: 20,
      maximumPermittedCurrentBP: 999,
      recoveryAmountBP: 1000,
    });

    expect(result.integrity).toBe(1);
  });
});


describe("deriveDailyRecoveryFraction", () => {
  it.each([
    [0, 0.025],
    [5, 0.05],
    [10, 0.10],
    [15, 0.20],
    [20, 0.40],
    [25, 0.80],
  ])("VIT %i -> %s of Maximum BP per day", (vit, expected) => {
    expect(deriveDailyRecoveryFraction(vit)).toBeCloseTo(expected, 10);
  });
});


describe("resolveRecovery — VIT scaling and per-BodyPart processing", () => {
  it("recovers more BP over the same elapsed time at higher VIT", () => {
    const low = resolveRecovery(baseInput({ vitality: 5 }));
    const reference = resolveRecovery(baseInput({ vitality: 10 }));
    const high = resolveRecovery(baseInput({ vitality: 15 }));

    expect(low.parts[0]?.bpRestored).toBeCloseTo(1, 10); // 5% of 20
    expect(reference.parts[0]?.bpRestored).toBeCloseTo(2, 10); // 10% of 20
    expect(high.parts[0]?.bpRestored).toBeCloseTo(4, 10); // 20% of 20
  });

  it("leaves undamaged BodyParts untouched", () => {
    const body: Anatomy = ({
      parts: [
        { id: "torso-1", type: "torso", attachment: null, referenceFormId: "default", referenceSlotId: "torso-1", continuityKey: continuityKey("torso-1"), state: "active", integrity: 0.5 },
        { id: "torso-2", type: "torso", attachment: null, referenceFormId: "default", referenceSlotId: "torso-2", continuityKey: continuityKey("torso-2"), state: "active", integrity: 1 },
      ],
    });

    const outcome = resolveRecovery(baseInput({ anatomy: body }));

    expect(outcome.parts.map((p) => p.partId)).toEqual(["torso-1"]);
    expect(
      outcome.anatomy.parts.find((p) => p.id === "torso-2")?.integrity,
    ).toBe(1);
  });

  /*
   * Ordinary healing does not regrow anatomy. A destroyed part is
   * archived-removed and never reaches the recovery primitive at all, which is
   * the mechanical form of that rule rather than a special case inside it.
   */
  it.each(["suppressed", "archived-removed"] as const)(
    "does not restore %s anatomy",
    (state) => {
      const body: Anatomy = ({
        parts: [
          { id: "torso-1", type: "torso", attachment: null, referenceFormId: "default", referenceSlotId: "torso-1", continuityKey: continuityKey("torso-1"), state, integrity: 0 },
        ],
      });

      const outcome = resolveRecovery(baseInput({ anatomy: body }));

      expect(outcome.parts).toEqual([]);
      expect(outcome.anatomy.parts[0]?.state).toBe(state);
      expect(outcome.anatomy.parts[0]?.integrity).toBe(0);
    },
  );

  /*
   * Four quarter-day passes at reference VIT restore 0.5 BP each. Under the
   * old whole-BP model the first three restored nothing and banked a
   * remainder; now each one lands, and the total after four is the same 2 BP
   * either way. Exactness is what makes those two facts agree.
   */
  it("accumulates partial passes exactly", () => {
    let anatomy = singleTorso(0.5);

    for (let pass = 0; pass < 4; pass += 1) {
      const outcome = resolveRecovery(
        baseInput({ anatomy, elapsed: hours(6) }),
      );

      expect(outcome.parts[0]?.bpRestored).toBeCloseTo(0.5, 10);

      anatomy = outcome.anatomy;
    }

    expect(anatomy.parts[0]?.integrity).toBeCloseTo(12 / 20, 10);
  });

  it("stops exactly at full health rather than overshooting", () => {
    // integrity 0.95 leaves room for 1 BP; VIT 25 offers 16.
    const outcome = resolveRecovery(baseInput({ anatomy: singleTorso(0.95), vitality: 25 }));

    expect(outcome.parts[0]?.bpRestored).toBeCloseTo(1, 10);
    expect(outcome.parts[0]?.integrityAfter).toBe(1);
    expect(outcome.anatomy.parts[0]?.integrity).toBe(1);
  });

  /*
   * The property that makes integrity worth storing. Maximum BP doubles
   * between these two passes, and the same proportional wound heals the same
   * proportion — twice the raw BP, because there is twice as much body.
   */
  it("scales recovery with Maximum BP rather than with stored damage", () => {
    const atCon10 = resolveRecovery(baseInput({ anatomy: singleTorso(0.5) }));

    const atCon12 = resolveRecovery(
      baseInput({ anatomy: singleTorso(0.5), constitution: 12 }),
    );

    expect(atCon10.parts[0]?.bpRestored).toBeCloseTo(2, 10);
    expect(atCon12.parts[0]?.bpRestored).toBeCloseTo(4, 10);

    expect(atCon10.parts[0]?.integrityAfter).toBeCloseTo(0.6, 10);
    expect(atCon12.parts[0]?.integrityAfter).toBeCloseTo(0.6, 10);
  });

  /*
   * Recovery reads the current manifestation and writes the persistent
   * identity — see resolution.ts's file header. The returned `continuity` is
   * what the caller stores back onto Body.continuity, so it has to actually
   * carry the healed value forward, not just the returned Anatomy snapshot.
   */
  it("writes the healed integrity onto the returned continuity state", () => {
    const torsoKey = continuityKey("torso-1");

    const outcome = resolveRecovery(baseInput({ anatomy: singleTorso(0.5) }));

    expect(continuityIntegrity(outcome.continuity, torsoKey)).toBeCloseTo(
      outcome.parts[0]!.integrityAfter,
      10,
    );
    expect(continuityIntegrity(outcome.continuity, torsoKey)).toBeGreaterThan(
      0.5,
    );
  });
});
