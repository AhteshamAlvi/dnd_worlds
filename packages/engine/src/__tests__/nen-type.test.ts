/*
 * One Nen Type per character.
 *
 * The affinity was stored twice — `details.nenType` and the awakening state's
 * own reading — with nothing keeping them in step, so a character could be an
 * Enhancer on one field and an Emitter on the other and both would validate.
 *
 * It also defaulted to `type: null`, which conflated two different facts.
 * Affinity is INTRINSIC: every character has one from birth. Whether anybody
 * has established what it is, is the separate question, and "nobody has
 * decided yet" is a property of the RECORD rather than of the character —
 * which is why it is now its own discriminated state rather than a null.
 */

import { describe, expect, it } from "vitest";

import {
  adoptLegacyNenType,
  assignedNenType,
  isNenType,
  unassignedNenType,
  type NenTypeKnowledge,
} from "../character/foundation/nen/nen-type";
import { awakenNenExceptional } from "../character/nen/exceptional";
import { revertNen } from "../character/nen/reversion";
import {
  createUnawakenedNenState,
  validateNenState,
} from "../character/foundation/nen/nen";
import type { NenState } from "../character/foundation/nen/types";

import { awakeningContext } from "./fixtures/nen";

function expectState(result: {
  success: boolean;
  payload?: { state: NenState };
  errors?: readonly { code: string }[];
}): NenState {
  if (!result.success || result.payload === undefined) {
    throw new Error((result.errors ?? []).map((e) => e.code).join(", "));
  }

  return result.payload.state;
}


describe("affinity and knowledge are separate facts", () => {
  it("represents an undiscovered Enhancer as an Enhancer", () => {
    const undiscovered = assignedNenType("enhancement", false);

    expect(undiscovered.status).toBe("assigned");
    if (undiscovered.status !== "assigned") return;

    expect(undiscovered.type).toBe("enhancement");
    expect(undiscovered.known).toBe(false);
  });

  /*
   * A record nobody has filled in is NOT a character with no affinity. Its own
   * state says so, rather than borrowing `null` from the type field — which is
   * what made "Enhancer, undiscovered" and "nobody has decided" the same value.
   */
  it("keeps an unrecorded affinity distinct from an unknown one", () => {
    expect(unassignedNenType().status).toBe("unassigned");
    expect(assignedNenType("emission", false).status).toBe("assigned");
  });

  it("refuses a type outside the six", () => {
    for (const value of [null, undefined, "", "enhancement ", "fire", 3, {}]) {
      expect([String(value), isNenType(value)]).toEqual([String(value), false]);
    }
  });
});


describe("there is exactly one stored affinity", () => {
  it("keeps the canonical value on Nen state", () => {
    const nen = createUnawakenedNenState(assignedNenType("conjuration", true));

    expect(nen.awakening.nenType).toEqual({
      status: "assigned",
      type: "conjuration",
      known: true,
    });
  });

  it("requires an affinity when a Nen state is constructed", () => {
    const nen = createUnawakenedNenState(unassignedNenType());

    expect(nen.awakening.nenType.status).toBe("unassigned");
    expect(validateNenState(nen).success).toBe(true);
  });
});


describe("legacy migration happens exactly once", () => {
  const legacyless = createUnawakenedNenState(unassignedNenType());

  it("folds a legacy details value into the canonical field", () => {
    const migrated = adoptLegacyNenType(legacyless, "manipulation");

    expect(migrated.success).toBe(true);
    if (!migrated.success) return;

    /*
     * `known: false`, because a legacy record said what the character IS and
     * never said whether anybody had established it. Assuming they knew would
     * be inventing a fact.
     */
    expect(migrated.payload.awakening.nenType).toEqual({
      status: "assigned",
      type: "manipulation",
      known: false,
    });
  });

  it("is a no-op the second time", () => {
    const once = adoptLegacyNenType(legacyless, "manipulation");

    expect(once.success).toBe(true);
    if (!once.success) return;

    const twice = adoptLegacyNenType(once.payload, "manipulation");

    expect(twice.success).toBe(true);
    if (!twice.success) return;

    expect(twice.payload.awakening.nenType)
      .toEqual(once.payload.awakening.nenType);
  });

  /*
   * The failure the duplication made possible. Two stored values that disagree
   * is not something to resolve silently by precedence — whichever one loses,
   * somebody's character changes affinity without being told.
   */
  it("refuses a legacy value that contradicts the canonical one", () => {
    const assigned = createUnawakenedNenState(
      assignedNenType("specialization", true),
    );

    const conflict = adoptLegacyNenType(assigned, "enhancement");

    expect(conflict.success).toBe(false);
    if (conflict.success) return;

    expect(conflict.errors.map((error) => error.code))
      .toContain("nen.type.legacy.conflict");
  });

  it("accepts a legacy value that agrees with the canonical one", () => {
    const assigned = createUnawakenedNenState(
      assignedNenType("specialization", true),
    );

    const agreed = adoptLegacyNenType(assigned, "specialization");

    expect(agreed.success).toBe(true);
    if (!agreed.success) return;

    /* Knowledge is preserved: agreeing does not un-know a discovered type. */
    expect(agreed.payload.awakening.nenType).toEqual({
      status: "assigned",
      type: "specialization",
      known: true,
    });
  });

  it("ignores an absent legacy value and refuses a malformed one", () => {
    expect(adoptLegacyNenType(legacyless, undefined).success).toBe(true);

    for (const bad of [null, "fire", 3, {}, []]) {
      const result = adoptLegacyNenType(legacyless, bad as never);

      expect([String(bad), result.success]).toEqual([String(bad), false]);
    }
  });
});


describe("awakening does not touch affinity unless told to", () => {
  const known: NenTypeKnowledge = assignedNenType("emission", true);

  it("leaves the affinity alone through an ordinary awakening", () => {
    const nen = createUnawakenedNenState(known);

    const awakened = expectState(awakenNenExceptional(
      awakeningContext({ nen }),
      {
        method: "exceptional",
        source: {
          ref: { type: "item", id: "relic" },
          overrides: { eligibility: { requirements: [], summary: "Waived." } },
        },
      },
    ));

    expect(awakened.awakening.nenType).toEqual(known);
  });

  it("records previous, next and cause when a source forces a change", () => {
    const nen = createUnawakenedNenState(known);

    const awakened = expectState(awakenNenExceptional(
      awakeningContext({ nen }),
      {
        method: "exceptional",
        source: {
          ref: { type: "item", id: "relic" },
          overrides: {
            nenType: {
              type: "specialization",
              known: true,
              summary: "The relic rewrites its bearer.",
            },
          },
        },
      },
    ));

    expect(awakened.awakening.nenType).toEqual(
      assignedNenType("specialization", true),
    );

    const record = awakened.awakening.history[0]!;

    if (record.kind !== "awakening") return;

    expect(record.nenTypeChange).toEqual({
      previous: "emission",
      next: "specialization",
      cause: "The relic rewrites its bearer.",
    });
  });

  it("round-trips a type change through JSON", () => {
    const nen = createUnawakenedNenState(known);

    const awakened = expectState(awakenNenExceptional(
      awakeningContext({ nen }),
      {
        method: "exceptional",
        source: {
          ref: { type: "item", id: "relic" },
          overrides: {
            nenType: { type: "conjuration", known: false, summary: "Rewritten." },
          },
        },
      },
    ));

    const reverted = expectState(revertNen(
      awakeningContext({ nen: awakened, operationId: "op-revert" }),
      {
        source: { type: "curse", id: "c" },
        reason: "Severed.",
        nenTypeChange: {
          previous: "conjuration",
          next: "transmutation",
          cause: "The severing rewrote what was left.",
        },
      },
    ));

    const restored = JSON.parse(JSON.stringify(reverted)) as NenState;

    expect(restored.awakening.nenType).toEqual(reverted.awakening.nenType);
    expect(restored.awakening.history).toEqual(reverted.awakening.history);
  });
});
