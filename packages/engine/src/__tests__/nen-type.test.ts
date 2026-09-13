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
  /*
   * The EXACT shape commit 54bd4d3 emitted, taken from its own collapse
   * settlement rather than reconstructed.
   *
   * Note what the forced state does NOT carry: a `recoveryId`. Phase 5.0
   * stored that relationship in one place only — `awakening.collapseRecovery
   * .id` — so a migration that expected the forced state to know its own
   * recovery would fail every genuine collapse save. The first version of
   * this test added the field to its fixture and hid exactly that.
   */
  const PHASE_5_0_COLLAPSE = {
    condition: "awakened",
    nodes: "open",
    currentMethod: "abrupt",
    currentAwakeningId: "op-1:awakening",
    history: [{
      kind: "awakening",
      id: "op-1:awakening",
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
      id: "op-collapse:forced-zetsu:uncontained-collapse",
      kind: "forced-zetsu",
      origin: "uncontained-collapse",
      appliedAt: 10,
      source: { type: "nen-collapse", id: "uncontained-leakage-exhausted" },
      exemptions: [],
    }],
    nenType: { type: null, known: false },
    collapseRecovery: {
      id: "op-collapse:collapse-recovery",
      beganAt: 10,
      requiredSleepHours: 8,
      accumulatedSleepHours: 0,
      completedAt: null,
    },
  };

  it("splits a Phase-5.0 collapse state into an involuntary Zetsu", () => {
    const migrated = migrateLegacyNenState({
      nen: { mastery: PRE_PHASE_5.nen.mastery, awakening: PHASE_5_0_COLLAPSE },
    });

    expect(migrated.success).toBe(true);
    if (!migrated.success) return;

    const held = migrated.payload.awakening.suppression[0]!;

    expect(held.kind).toBe("involuntary-zetsu");
    if (held.kind !== "involuntary-zetsu") return;

    expect(held.cause).toBe("uncontained-aura-collapse");

    /*
     * Taken from the CONTAINING recovery, which is where Phase 5.0 kept it.
     * The current domain validator requires the two to agree, so a migration
     * that invented an empty string here would produce a state the engine
     * then refuses.
     */
    expect(held.recoveryId).toBe("op-collapse:collapse-recovery");
    expect(migrated.payload.awakening.collapseRecovery?.id)
      .toBe(held.recoveryId);

    expect(migrated.payload.awakening.nenType).toEqual(unassignedNenType());
  });

  it("refuses a collapse state whose recovery is missing or malformed", () => {
    for (const collapseRecovery of [undefined, null, {}, { id: "" }, { id: 3 }, []]) {
      const migrated = migrateLegacyNenState({
        nen: {
          mastery: PRE_PHASE_5.nen.mastery,
          awakening: { ...PHASE_5_0_COLLAPSE, collapseRecovery },
        },
      });

      expect([String(collapseRecovery), migrated.success])
        .toEqual([String(collapseRecovery), false]);

      if (migrated.success) continue;

      expect([String(collapseRecovery), migrated.errors.map((e) => e.code)])
        .toEqual([
          String(collapseRecovery),
          ["nen.state.migrate.recovery.unreadable"],
        ]);
    }
  });

  /*
   * A save that somehow carries a recoveryId is not silently overruled. If it
   * agrees, it is redundant; if it disagrees, one of the two is wrong and the
   * migration cannot know which.
   */
  it("refuses a nonstandard recoveryId that contradicts the recovery", () => {
    const conflicting = migrateLegacyNenState({
      nen: {
        mastery: PRE_PHASE_5.nen.mastery,
        awakening: {
          ...PHASE_5_0_COLLAPSE,
          forcedStates: [{
            ...PHASE_5_0_COLLAPSE.forcedStates[0],
            recoveryId: "some-other-recovery",
          }],
        },
      },
    });

    expect(conflicting.success).toBe(false);
    if (conflicting.success) return;

    expect(conflicting.errors.map((e) => e.code))
      .toContain("nen.state.migrate.recovery.conflict");

    const agreeing = migrateLegacyNenState({
      nen: {
        mastery: PRE_PHASE_5.nen.mastery,
        awakening: {
          ...PHASE_5_0_COLLAPSE,
          forcedStates: [{
            ...PHASE_5_0_COLLAPSE.forcedStates[0],
            recoveryId: "op-collapse:collapse-recovery",
          }],
        },
      },
    });

    expect(agreeing.success).toBe(true);
  });

  /*
   * The origin is the legacy discriminant, and an unrecognised one is not
   * "probably external". Defaulting it would have silently turned a corrupt
   * or future value into a forced Zetsu with a release authority nobody
   * granted.
   */
  it("refuses a missing, null or unknown legacy origin", () => {
    for (const origin of [undefined, null, "", "voluntary", 3, {}]) {
      const migrated = migrateLegacyNenState({
        nen: {
          mastery: PRE_PHASE_5.nen.mastery,
          awakening: {
            ...PHASE_5_0_COLLAPSE,
            forcedStates: [{
              ...PHASE_5_0_COLLAPSE.forcedStates[0],
              origin,
            }],
          },
        },
      });

      expect([String(origin), migrated.success])
        .toEqual([String(origin), false]);

      if (migrated.success) continue;

      expect([String(origin), migrated.errors.map((e) => e.code)])
        .toEqual([String(origin), ["nen.state.migrate.origin.invalid"]]);
    }
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

  /*
   * Presence, not validity. A corrupt `awakened` sitting beside a valid
   * `awakening` used to be read as the newer shape — the corruption vanished
   * rather than being reported — because the check asked whether each value
   * was well-typed instead of whether the field was there.
   */
  it("refuses a dual representation however either side is typed", () => {
    const valid = createUnawakenedNenState(unassignedNenType()).awakening;

    const dual: readonly (readonly [string, unknown])[] = [
      ["corrupt boolean, valid object", { awakened: "corrupt", awakening: valid }],
      ["valid boolean, corrupt object", { awakened: true, awakening: "corrupt" }],
      ["both corrupt", { awakened: 3, awakening: [] }],
      ["both valid", { awakened: false, awakening: valid }],
      ["both undefined but present", { awakened: undefined, awakening: undefined }],
    ];

    for (const [name, awakeningFields] of dual) {
      const migrated = migrateLegacyNenState({
        nen: { mastery: PRE_PHASE_5.nen.mastery, ...(awakeningFields as object) },
      });

      expect([name, migrated.success]).toEqual([name, false]);
      if (migrated.success) continue;

      expect([name, migrated.errors.map((e) => e.code)])
        .toEqual([name, ["nen.state.migrate.ambiguous"]]);
    }
  });

  it("requires each single representation to be what its presence claims", () => {
    for (const awakened of [null, 3, "true", {}, []]) {
      const migrated = migrateLegacyNenState({
        nen: { mastery: PRE_PHASE_5.nen.mastery, awakened },
      });

      expect([String(awakened), migrated.success])
        .toEqual([String(awakened), false]);

      if (migrated.success) continue;

      expect([String(awakened), migrated.errors.map((e) => e.code)])
        .toEqual([String(awakened), ["nen.state.migrate.awakened.invalid"]]);
    }

    for (const awakening of [null, 3, "awake", []]) {
      const migrated = migrateLegacyNenState({
        nen: { mastery: PRE_PHASE_5.nen.mastery, awakening },
      });

      expect([String(awakening), migrated.success])
        .toEqual([String(awakening), false]);

      if (migrated.success) continue;

      expect([String(awakening), migrated.errors.map((e) => e.code)])
        .toEqual([String(awakening), ["nen.state.migrate.awakening.invalid"]]);
    }
  });

  /*
   * A corrupt affinity is not "nobody decided", and a corrupt `known` is not
   * `false`. The record said something; normalizing it would be the migration
   * deciding it said nothing.
   */
  it("refuses a malformed Nen Type instead of normalizing it", () => {
    const rejected: readonly unknown[] = [
      null,
      undefined,
      [],
      3,
      "enhancement",
      {},
      { type: "fire", known: false },
      { type: "enhancement", known: "yes" },
      { type: "enhancement" },
      { known: true },
      { type: null, known: true },
      { status: "made-up" },

      /*
       * The discriminated union, enforced. An `unassigned` reading carrying
       * assigned-branch data contradicts itself, and normalizing it to
       * `{ status: "unassigned" }` silently discarded whichever half was
       * right.
       */
      { status: "unassigned", type: "enhancement", known: true },
      { status: "unassigned", type: "enhancement" },
      { status: "unassigned", known: false },
      { status: "assigned", type: null, known: true },
      { status: "assigned", type: "emission", known: 1 },
    ];

    for (const nenType of rejected) {
      const migrated = migrateLegacyNenState({
        nen: {
          mastery: PRE_PHASE_5.nen.mastery,
          awakening: { ...PHASE_5_0_COLLAPSE, nenType },
        },
      });

      expect([JSON.stringify(nenType) ?? "undefined", migrated.success])
        .toEqual([JSON.stringify(nenType) ?? "undefined", false]);
    }
  });

  it("accepts both the legacy and the current Nen Type forms", () => {
    const accepted: readonly (readonly [unknown, unknown])[] = [
      [{ type: null, known: false }, unassignedNenType()],
      [{ type: "emission", known: false }, assignedNenType("emission", false)],
      [{ type: "emission", known: true }, assignedNenType("emission", true)],
      [unassignedNenType(), unassignedNenType()],
      [assignedNenType("conjuration", true), assignedNenType("conjuration", true)],
    ];

    for (const [nenType, expected] of accepted) {
      const migrated = migrateLegacyNenState({
        nen: {
          mastery: PRE_PHASE_5.nen.mastery,
          awakening: { ...PHASE_5_0_COLLAPSE, nenType },
        },
      });

      expect([JSON.stringify(nenType), migrated.success])
        .toEqual([JSON.stringify(nenType), true]);

      if (!migrated.success) continue;

      expect([JSON.stringify(nenType), migrated.payload.awakening.nenType])
        .toEqual([JSON.stringify(nenType), expected]);
    }
  });

  /*
   * The same presence-versus-value confusion as the outer discriminator, one
   * level in. Detecting the inner representation by value meant a save with
   * `suppression` simply absent, or present-but-null, migrated "successfully"
   * into an empty list — the migration manufacturing a fact the record never
   * carried.
   */
  describe("the suppression representation, by presence", () => {
    const CURRENT = {
      ...PHASE_5_0_COLLAPSE,
      forcedStates: undefined,
      suppression: [{
        id: "iz-1",
        kind: "involuntary-zetsu",
        appliedAt: 10,
        cause: "uncontained-aura-collapse",
        recoveryId: "op-collapse:collapse-recovery",
      }],
      nenType: { status: "unassigned" },
    };

    function migrate(awakening: unknown) {
      return migrateLegacyNenState({
        nen: { mastery: PRE_PHASE_5.nen.mastery, awakening },
      });
    }

    function withoutKeys(source: object, ...drop: readonly string[]): object {
      return Object.fromEntries(
        Object.entries(source).filter(([key]) => !drop.includes(key)),
      );
    }

    it("refuses an awakening carrying neither representation", () => {
      const neither = withoutKeys(CURRENT, "forcedStates", "suppression");
      const result = migrate(neither);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.errors.map((e) => e.code))
        .toEqual(["nen.state.migrate.suppression.missing"]);
    });

    it("refuses both representations present, however either is valued", () => {
      const dual: readonly (readonly [string, unknown])[] = [
        ["forcedStates undefined", { ...CURRENT, forcedStates: undefined, suppression: [] }],
        ["suppression undefined", { ...CURRENT, forcedStates: [], suppression: undefined }],
        ["both empty", { ...CURRENT, forcedStates: [], suppression: [] }],
        ["both populated", {
          ...CURRENT,
          forcedStates: PHASE_5_0_COLLAPSE.forcedStates,
          suppression: CURRENT.suppression,
        }],
      ];

      for (const [name, awakening] of dual) {
        const result = migrate(awakening);

        expect([name, result.success]).toEqual([name, false]);
        if (result.success) continue;

        expect([name, result.errors.map((e) => e.code)])
          .toEqual([name, ["nen.state.migrate.suppression.ambiguous"]]);
      }
    });

    it("refuses a present but malformed suppression rather than defaulting it", () => {
      for (const suppression of [null, 3, "none", {}]) {
        const result = migrate({
          ...withoutKeys(CURRENT, "forcedStates"),
          suppression,
        });

        expect([String(suppression), result.success])
          .toEqual([String(suppression), false]);
      }
    });

    it("preserves a valid current suppression, empty or populated", () => {
      const empty = migrate({
        ...withoutKeys(CURRENT, "forcedStates"),
        suppression: [],
      });

      expect(empty.success).toBe(true);
      if (!empty.success) return;

      expect(empty.payload.awakening.suppression).toEqual([]);

      const populated = migrate(withoutKeys(CURRENT, "forcedStates"));

      expect(populated.success).toBe(true);
      if (!populated.success) return;

      expect(populated.payload.awakening.suppression)
        .toEqual(CURRENT.suppression);
    });

    it("still migrates a legacy forcedStates list on its own", () => {
      const legacy = migrate(withoutKeys(PHASE_5_0_COLLAPSE, "suppression"));

      expect(legacy.success).toBe(true);
      if (!legacy.success) return;

      expect(legacy.payload.awakening.suppression[0]!.kind)
        .toBe("involuntary-zetsu");
    });

    it("refuses a legacy forcedStates that is not a list", () => {
      for (const forcedStates of [null, 3, "none", {}]) {
        const result = migrate({ ...PHASE_5_0_COLLAPSE, forcedStates });

        expect([String(forcedStates), result.success])
          .toEqual([String(forcedStates), false]);
      }
    });
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
