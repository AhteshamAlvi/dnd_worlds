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
import { migrateLegacyNenState } from "../character/foundation/nen/awakening/migration";
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


/*
 * The loading boundary, driven with payloads a real older engine wrote.
 *
 * `adoptLegacyNenType` on its own was an exported function with no production
 * caller — a migration nobody performed. It is now reached through
 * `migrateLegacyNenState`, which is what a host restoring a character calls,
 * and which detects which of the three stored shapes it has been handed.
 */
describe("migrating a stored Nen state", () => {
  /*
   * A genuine pre-Phase-5 character: awakening was one boolean, and the Nen
   * Type lived on `details` because NenState had nowhere to put it.
   */
  const PRE_PHASE_5 = {
    nen: {
      awakened: false,
      mastery: {
        ten: 0, ren: 0, zetsu: 0, hatsu: 0, shu: 0, en: 0, gyo: 0, ken: 0,
        chu: 0, in: 0, ko: 0, ryu: 0, yu: 0, ju: 0, fu: 0,
      },
    },
    legacyNenType: "enhancement",
  };

  it("migrates an unawakened pre-Phase-5 character", () => {
    const migrated = migrateLegacyNenState(PRE_PHASE_5);

    expect(migrated.success).toBe(true);
    if (!migrated.success) return;

    const { awakening } = migrated.payload;

    expect(awakening.condition).toBe("unawakened");
    expect(awakening.nodes).toBe("half-open");
    expect(awakening.suppression).toEqual([]);

    /*
     * The affinity crossed over, and `known: false` because the old field said
     * what the character WAS and never said whether anybody had established it.
     */
    expect(awakening.nenType).toEqual(assignedNenType("enhancement", false));
  });

  /*
   * An awakened pre-Phase-5 character has no record of HOW, WHEN or because of
   * what — a boolean cannot carry it. The migration reconstructs an awakening
   * rather than inventing provenance, and says so in the source.
   */
  it("reconstructs an awakened character with visible legacy provenance", () => {
    const migrated = migrateLegacyNenState({
      nen: { ...PRE_PHASE_5.nen, awakened: true, mastery: { ...PRE_PHASE_5.nen.mastery, ten: 3 } },
      legacyNenType: "emission",
    });

    expect(migrated.success).toBe(true);
    if (!migrated.success) return;

    const { awakening, mastery } = migrated.payload;

    expect(awakening.condition).toBe("awakened");
    expect(awakening.nodes).toBe("open");
    expect(mastery.ten).toBe(3);

    const record = awakening.history[0]!;

    expect(record.kind).toBe("awakening");
    if (record.kind !== "awakening") return;

    expect(record.source).toEqual({
      type: "legacy-migration",
      id: "pre-phase-5-awakened-boolean",
    });

    /* And the result is a state the ordinary validator accepts. */
    expect(validateNenState(migrated.payload).success).toBe(true);
  });

  /*
   * The intermediate shape: the awakening object as Phase 5.0 first shipped
   * it, with forced and involuntary Zetsu still conflated under an `origin`.
   */
  it("splits a Phase-5.0 collapse state into an involuntary Zetsu", () => {
    const migrated = migrateLegacyNenState({
      nen: {
        mastery: PRE_PHASE_5.nen.mastery,
        awakening: {
          condition: "awakened",
          nodes: "open",
          currentMethod: "abrupt",
          currentAwakeningId: "awk-1",
          history: [{
            kind: "awakening",
            id: "awk-1",
            method: "abrupt",
            occurredAt: 0,
            source: { type: "character", id: "teacher" },
            reawakening: false,
            eligibilityBypassed: true,
            appliedOverrides: [],
          }],
          naturalAbility: null,
          externalAbilities: [],
          forcedStates: [{
            id: "fz-1",
            kind: "forced-zetsu",
            origin: "uncontained-collapse",
            appliedAt: 10,
            source: { type: "nen-collapse", id: "uncontained-leakage-exhausted" },
            exemptions: [],
            recoveryId: "rec-1",
          }],
          nenType: { type: null, known: false },
          collapseRecovery: {
            id: "rec-1",
            beganAt: 10,
            requiredSleepHours: 8,
            accumulatedSleepHours: 0,
            completedAt: null,
          },
        },
      },
    });

    expect(migrated.success).toBe(true);
    if (!migrated.success) return;

    const held = migrated.payload.awakening.suppression[0]!;

    expect(held.kind).toBe("involuntary-zetsu");
    if (held.kind !== "involuntary-zetsu") return;

    expect(held.cause).toBe("uncontained-aura-collapse");
    expect(held.recoveryId).toBe("rec-1");

    /* A null type becomes the explicit unassigned state, not a null. */
    expect(migrated.payload.awakening.nenType).toEqual(unassignedNenType());
  });

  it("rebinds a Phase-5.0 instinctive exemption to its instance and source", () => {
    const source = { type: "gm", id: "ruling" };

    const migrated = migrateLegacyNenState({
      nen: {
        mastery: PRE_PHASE_5.nen.mastery,
        awakening: {
          condition: "awakened",
          nodes: "open",
          currentMethod: "instinctive",
          currentAwakeningId: "awk-1",
          history: [{
            kind: "awakening",
            id: "awk-1",
            method: "instinctive",
            occurredAt: 0,
            source,
            reawakening: false,
            eligibilityBypassed: true,
            appliedOverrides: [],
          }],
          naturalAbility: {
            abilityId: "ability-a",
            grantedAt: 0,
            grantedByAwakeningId: "awk-1",
            origin: "instinctive",
          },
          externalAbilities: [],
          forcedStates: [{
            id: "fz-1",
            kind: "forced-zetsu",
            origin: "instinctive-awakening",
            appliedAt: 0,
            source,
            exemptions: [{
              abilityId: "ability-a",
              forcedStateId: "fz-1",
              origin: "instinctive-awakening",
            }],
          }],
          nenType: { type: "specialization", known: true },
          collapseRecovery: null,
        },
      },
    });

    expect(migrated.success).toBe(true);
    if (!migrated.success) return;

    const held = migrated.payload.awakening.suppression[0]!;

    expect(held.kind).toBe("forced-zetsu");
    if (held.kind !== "forced-zetsu") return;

    /* Externally imposed, so it gains the release rule the repair requires. */
    expect(held.release).toEqual({ rule: "source-authorized", authority: source });
    expect(held.exemptions).toEqual([{
      abilityId: "ability-a",
      suppressionId: "fz-1",
      source,
    }]);

    expect(migrated.payload.awakening.nenType)
      .toEqual(assignedNenType("specialization", true));
  });

  it("passes a current-shape state straight through the same validator", () => {
    const current = createUnawakenedNenState(assignedNenType("conjuration", true));

    const migrated = migrateLegacyNenState({
      nen: JSON.parse(JSON.stringify(current)),
    });

    expect(migrated.success).toBe(true);
    if (!migrated.success) return;

    expect(migrated.payload).toEqual(current);
  });

  /*
   * A payload carrying BOTH representations is refused rather than resolved by
   * precedence: the two can disagree, and silently preferring one changes
   * whether somebody is awakened.
   */
  it("refuses a payload that carries two awakening representations", () => {
    const ambiguous = migrateLegacyNenState({
      nen: {
        awakened: true,
        awakening: createUnawakenedNenState(unassignedNenType()).awakening,
        mastery: PRE_PHASE_5.nen.mastery,
      },
    });

    expect(ambiguous.success).toBe(false);
    if (ambiguous.success) return;

    expect(ambiguous.errors.map((error) => error.code))
      .toContain("nen.state.migrate.ambiguous");
  });

  it("refuses a legacy affinity that contradicts a migrated one", () => {
    const conflict = migrateLegacyNenState({
      nen: {
        mastery: PRE_PHASE_5.nen.mastery,
        awakening: {
          ...createUnawakenedNenState(unassignedNenType()).awakening,
          nenType: { type: "emission", known: true },
        },
      },
      legacyNenType: "enhancement",
    });

    expect(conflict.success).toBe(false);
    if (conflict.success) return;

    expect(conflict.errors.map((error) => error.code))
      .toContain("nen.type.legacy.conflict");
  });

  it("refuses malformed payloads without throwing", () => {
    for (const payload of [
      null, undefined, 3, "nen", [],
      {}, { nen: null }, { nen: 3 }, { nen: {} },
      { nen: { mastery: null, awakened: false } },
      { nen: { mastery: { ten: "three" }, awakened: false } },
      Object.create(null),
      { nen: Object.create(null) },
    ]) {
      expect(() => migrateLegacyNenState(payload as never)).not.toThrow();
      expect(migrateLegacyNenState(payload as never).success).toBe(false);
    }
  });
});
