/*
 * Reading a Nen state written by an older engine.
 *
 * Two shapes predate the current one, and a host loading a saved character has
 * no way to tell which it is holding except by looking:
 *
 *   PRE-PHASE-5   `{ awakened: boolean, mastery, seals? }`, with the
 *                 character's Nen Type stored separately on
 *                 `details.nenType`. Awakening was one boolean, so everything
 *                 else — node state, history, provenance, suppression — has to
 *                 be reconstructed from it rather than read.
 *
 *   PHASE-5.0     the awakening object, but with `forcedStates` discriminated
 *                 by an `origin` string and a nullable `nenType.type`. Both of
 *                 those were repaired: forced and involuntary Zetsu are
 *                 separate mechanics now, and affinity is an explicit assigned
 *                 or unassigned state.
 *
 * WHAT A MIGRATION MAY NOT DO is invent history. A pre-Phase-5 character
 * recorded as awakened has no record of HOW, WHEN, or because of what — so the
 * migration writes an explicit `legacy-migration` provenance rather than
 * guessing a method, and a reader can tell a reconstructed awakening from one
 * this engine actually performed.
 *
 * The result goes through the ordinary validator before it is returned. A
 * migration that produced a state the rules refuse would be laundering a bad
 * save file into something that looks engine-produced, which is the whole
 * failure mode the deserialization boundary exists to prevent.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../../infrastructure/result";
import { createTraceNode } from "../../../../infrastructure/trace";

import { NO_MASTERY } from "../../../capabilities/mastery";
import {
  adoptLegacyNenType,
  assignedNenType,
  isNenType,
  unassignedNenType,
  type NenTypeKnowledge,
} from "../nen-type";
import { NEN_PRINCIPLE_IDS } from "../nen";
import type {
  NenMasteryRank,
  NenMasteryState,
  NenPrincipleId,
  NenState,
} from "../types";
import { validateNenState } from "../nen";

import { createUnawakenedAwakeningState } from "./state";
import type { NenAwakeningRecord, NenAwakeningState } from "./types";


/** The provenance a reconstructed awakening carries. */
export const LEGACY_AWAKENING_SOURCE = {
  type: "legacy-migration",
  id: "pre-phase-5-awakened-boolean",
} as const;

export const LEGACY_AWAKENING_RECORD_ID = "legacy:awakening";


/*
 * What a caller hands in: whatever the save file had, unvalidated.
 *
 * `legacyNenType` is the old `details.nenType`, which is why it is a separate
 * argument — it lived on a different object, and the whole point of the repair
 * was that it stopped being a second writable home for the affinity.
 */
export interface LegacyNenPayload {
  readonly nen: unknown;
  readonly legacyNenType?: unknown;
}


function fail(
  traceId: string,
  errors: readonly EngineError[],
): EngineResult<NenState> {
  const root = createTraceNode({
    id: traceId,
    label: "Migrate a stored Nen state",
    output: false,
  });

  return {
    success: false,
    trace: { root },
    warnings: [],
    errors: errors as readonly EngineError[] as NonEmptyArray<EngineError>,
  };
}


function readMastery(value: unknown): NenMasteryState | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const mastery = {} as Record<NenPrincipleId, NenMasteryRank>;

  for (const principleId of NEN_PRINCIPLE_IDS) {
    const rank = (value as Record<string, unknown>)[principleId];

    if (rank === undefined) {
      mastery[principleId] = NO_MASTERY;

      continue;
    }

    if (typeof rank !== "number" || !Number.isInteger(rank)) return null;

    mastery[principleId] = rank as NenMasteryRank;
  }

  return mastery;
}


/*
 * The awakening a pre-Phase-5 `awakened: true` implies.
 *
 * `standard` is recorded as the method, because it is the only route that
 * leaves a character stable and it is what an old save's awakened characters
 * were assumed to be. That assumption is made VISIBLE rather than hidden: the
 * source says `legacy-migration`, so nothing downstream can mistake it for a
 * standard awakening this engine resolved.
 */
function reconstructAwakening(nenType: NenTypeKnowledge): NenAwakeningState {
  const record: NenAwakeningRecord = {
    kind: "awakening",
    id: LEGACY_AWAKENING_RECORD_ID,
    method: "standard",
    occurredAt: 0,
    source: LEGACY_AWAKENING_SOURCE,
    reawakening: false,
    eligibilityBypassed: false,
    appliedOverrides: [],
  };

  return {
    ...createUnawakenedAwakeningState(nenType),
    condition: "awakened",
    nodes: "open",
    currentMethod: "standard",
    currentAwakeningId: record.id,
    history: [record],
  };
}


/**
 * Read a stored Nen state written by any engine version, or say why not.
 *
 * The one loading boundary for Nen. A host restoring a character calls this
 * with whatever their save file holds and the old `details.nenType`; it
 * detects the shape, migrates it, folds the legacy affinity in through
 * `adoptLegacyNenType` — which refuses a value contradicting the canonical one
 * rather than picking a winner — and validates the result.
 *
 * A state already in the current shape passes straight through the same
 * validator, so a caller never has to know whether migration happened.
 */
export function migrateLegacyNenState(
  payload: LegacyNenPayload,
): EngineResult<NenState> {
  const traceId = "nen.state.migrate";

  if (
    payload === null ||
    typeof payload !== "object" ||
    payload.nen === null ||
    typeof payload.nen !== "object" ||
    Array.isArray(payload.nen)
  ) {
    return fail(traceId, [{
      code: "nen.state.migrate.invalid",
      message: "A stored Nen state must be a record.",
      audience: "developer",
      required: "{ nen: { mastery, ... } }",
      actual: describeDiagnosticValue((payload as LegacyNenPayload)?.nen),
    }]);
  }

  const stored = payload.nen as Record<string, unknown>;
  const mastery = readMastery(stored["mastery"]);

  if (mastery === null) {
    return fail(traceId, [{
      code: "nen.state.migrate.mastery.invalid",
      message: "A stored Nen state must carry a readable Mastery record.",
      audience: "developer",
      required: "a record of integer Mastery ranks",
      actual: describeDiagnosticValue(stored["mastery"]),
    }]);
  }

  const seals = stored["seals"];

  /*
   * Which shape is this? Decided by FIELD PRESENCE, not by whether the value
   * found there happens to be well-typed.
   *
   * The earlier version asked whether `awakened` was a boolean and whether
   * `awakening` was a record, which meant a payload carrying a corrupt
   * `awakened` alongside a valid `awakening` was quietly read as the newer
   * shape — the corruption disappeared instead of being reported. A payload
   * carrying both fields is ambiguous however either one is typed: the two can
   * disagree, and silently preferring one changes whether somebody is
   * awakened.
   *
   * `hasOwnProperty.call` rather than `in` or a truthiness test, so an
   * inherited property cannot masquerade as a stored one and an own field
   * holding `undefined` still counts as present — it was written.
   */
  const hasBoolean = Object.prototype.hasOwnProperty.call(stored, "awakened");
  const hasObject = Object.prototype.hasOwnProperty.call(stored, "awakening");

  if (hasBoolean && hasObject) {
    return fail(traceId, [{
      code: "nen.state.migrate.ambiguous",
      message:
        "A stored Nen state carries both the old awakening boolean and an awakening object.",
      audience: "developer",
      required: "one awakening representation",
      actual: "both",
    }]);
  }

  if (!hasBoolean && !hasObject) {
    return fail(traceId, [{
      code: "nen.state.migrate.awakening.missing",
      message: "A stored Nen state must record an awakening.",
      audience: "developer",
      required: "`awakened` (pre-Phase-5) or `awakening`",
      actual: "neither",
    }]);
  }

  /* Present, so it has to be the thing its presence claims. */
  if (hasBoolean && typeof stored["awakened"] !== "boolean") {
    return fail(traceId, [{
      code: "nen.state.migrate.awakened.invalid",
      message: "A pre-Phase-5 awakening must be a boolean.",
      audience: "developer",
      required: "boolean",
      actual: describeDiagnosticValue(stored["awakened"]),
    }]);
  }

  if (
    hasObject &&
    (stored["awakening"] === null ||
      typeof stored["awakening"] !== "object" ||
      Array.isArray(stored["awakening"]))
  ) {
    return fail(traceId, [{
      code: "nen.state.migrate.awakening.invalid",
      message: "A stored awakening must be a record.",
      audience: "developer",
      required: "object",
      actual: describeDiagnosticValue(stored["awakening"]),
    }]);
  }

  const awakening = hasBoolean
    ? migrateBooleanAwakening(stored["awakened"] === true)
    : migrateAwakeningObject(stored["awakening"] as Record<string, unknown>);

  if (!awakening.ok) return fail(traceId, awakening.errors);

  const migrated: NenState = {
    awakening: awakening.value,
    mastery,
    ...(seals === undefined
      ? {}
      : { seals: seals as NonNullable<NenState["seals"]> }),
  };

  /*
   * The legacy affinity folded in LAST, so it is applied to whichever shape
   * came out above — and refused if it contradicts an affinity the newer shape
   * already recorded.
   */
  const withType = adoptLegacyNenType(migrated, payload.legacyNenType);

  if (!withType.success) return withType;

  const validated = validateNenState(withType.payload);

  if (!validated.success) {
    return fail(traceId, validated.errors);
  }

  const root = createTraceNode({
    id: traceId,
    label: "Migrate a stored Nen state",
    inputs: {
      shape: { value: hasBoolean ? "pre-phase-5" : "awakening-object" },
      legacyNenType: {
        value: describeDiagnosticValue(payload.legacyNenType ?? "absent"),
      },
    },
    output: {
      condition: withType.payload.awakening.condition,
      migrated: true,
    },
  });

  return {
    success: true,
    payload: withType.payload,
    trace: { root },
    warnings: [],
  };
}


type Migrated =
  | { readonly ok: true; readonly value: NenAwakeningState }
  | { readonly ok: false; readonly errors: readonly EngineError[] };


function migrateBooleanAwakening(awakened: boolean): Migrated {
  /*
   * The affinity is unassigned rather than guessed. A pre-Phase-5 record kept
   * the type on `details`, which arrives separately and is folded in above; if
   * it was absent there too, then nobody ever decided, and saying so is the
   * honest answer.
   */
  return {
    ok: true,
    value: awakened
      ? reconstructAwakening(unassignedNenType())
      : createUnawakenedAwakeningState(unassignedNenType()),
  };
}


/*
 * The Phase-5.0 awakening object, brought forward.
 *
 * Two fields moved. `forcedStates` became `suppression` with forced and
 * involuntary Zetsu as separate kinds, and `nenType` stopped using `null` to
 * mean "nobody decided". Everything else round-trips unchanged, which is why
 * this rewrites two fields rather than rebuilding the object.
 */
function migrateAwakeningObject(stored: Record<string, unknown>): Migrated {
  const legacyStates = stored["forcedStates"];
  const current = stored["suppression"];

  if (legacyStates !== undefined && current !== undefined) {
    return {
      ok: false,
      errors: [{
        code: "nen.state.migrate.suppression.ambiguous",
        message:
          "A stored awakening carries both `forcedStates` and `suppression`.",
        audience: "developer",
        required: "one suppression representation",
        actual: "both",
      }],
    };
  }

  const nenType = migrateNenTypeField(stored["nenType"]);

  if (!nenType.ok) return nenType;

  if (legacyStates === undefined) {
    return {
      ok: true,
      value: { ...stored, suppression: current ?? [], nenType: nenType.value } as
        unknown as NenAwakeningState,
    };
  }

  if (!Array.isArray(legacyStates)) {
    return {
      ok: false,
      errors: [{
        code: "nen.state.migrate.suppression.invalid",
        message: "A stored `forcedStates` must be a list.",
        audience: "developer",
        required: "array",
        actual: describeDiagnosticValue(legacyStates),
      }],
    };
  }

  /*
   * The containing recovery is passed DOWN rather than looked for on each
   * forced state, because Phase 5.0 never stored the relationship there.
   * `awakening.collapseRecovery.id` was the only place it existed, and a
   * migration that expected the forced state to know its own recovery failed
   * every genuine collapse save — producing `recoveryId: ""`, which the
   * current domain validator then refuses.
   */
  const recovery = stored["collapseRecovery"];
  const migrated: unknown[] = [];
  const errors: EngineError[] = [];

  for (const held of legacyStates as readonly unknown[]) {
    const result = migrateForcedState(held, recovery);

    if (!result.ok) {
      errors.push(...result.errors);

      continue;
    }

    migrated.push(result.value);
  }

  if (errors.length > 0) return { ok: false, errors };

  const { forcedStates: _dropped, ...rest } = stored;

  return {
    ok: true,
    value: {
      ...rest,
      suppression: migrated,
      nenType: nenType.value,
    } as unknown as NenAwakeningState,
  };
}


type MigratedState =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly errors: readonly EngineError[] };


/** The recovery id a collapse-origin state belongs to, or why there is none. */
function readRecoveryId(
  recovery: unknown,
): { readonly ok: true; readonly id: string } | { readonly ok: false; readonly errors: readonly EngineError[] } {
  if (
    recovery === null ||
    typeof recovery !== "object" ||
    Array.isArray(recovery) ||
    typeof (recovery as { id?: unknown }).id !== "string" ||
    (recovery as { id: string }).id.trim().length === 0
  ) {
    return {
      ok: false,
      errors: [{
        code: "nen.state.migrate.recovery.unreadable",
        message:
          "A collapse-origin forced state needs the collapse recovery it belongs to, which this awakening does not carry.",
        audience: "developer",
        required: "awakening.collapseRecovery with a non-empty id",
        actual: describeDiagnosticValue(recovery),
      }],
    };
  }

  return { ok: true, id: (recovery as { id: string }).id };
}


/*
 * One Phase-5.0 forced state, split by the origin it used to carry.
 *
 * The origin is EXHAUSTIVE, and an unrecognised one is refused rather than
 * treated as externally imposed. Defaulting it would turn a corrupt or
 * future-dated value into a forced Zetsu carrying a release authority nobody
 * granted — and the final validation pass would not catch it, because the
 * result would be a perfectly well-formed forced Zetsu.
 */
function migrateForcedState(held: unknown, recovery: unknown): MigratedState {
  if (held === null || typeof held !== "object" || Array.isArray(held)) {
    return {
      ok: false,
      errors: [{
        code: "nen.state.migrate.suppression.entry.invalid",
        message: "A stored forced state must be a record.",
        audience: "developer",
        required: "object",
        actual: describeDiagnosticValue(held),
      }],
    };
  }

  const legacy = held as Record<string, unknown>;
  const origin = legacy["origin"];

  switch (origin) {
    case "uncontained-collapse": {
      const recoveryId = readRecoveryId(recovery);

      if (!recoveryId.ok) return recoveryId;

      /*
       * Phase 5.0 wrote no `recoveryId` here. One that turns up anyway is
       * either redundant or wrong, and the migration cannot tell which — so an
       * agreeing value is accepted and a contradicting one is refused rather
       * than silently overruled.
       */
      const declared = legacy["recoveryId"];

      if (declared !== undefined && declared !== recoveryId.id) {
        return {
          ok: false,
          errors: [{
            code: "nen.state.migrate.recovery.conflict",
            message:
              "A stored forced state names a different collapse recovery than the awakening does.",
            audience: "developer",
            required: recoveryId.id,
            actual: describeDiagnosticValue(declared),
          }],
        };
      }

      return {
        ok: true,
        value: {
          id: legacy["id"],
          kind: "involuntary-zetsu",
          appliedAt: legacy["appliedAt"],
          cause: "uncontained-aura-collapse",
          recoveryId: recoveryId.id,
        },
      };
    }

    case "instinctive-awakening": {
      const source = legacy["source"];

      const exemptions = Array.isArray(legacy["exemptions"])
        ? (legacy["exemptions"] as readonly unknown[]).map((exemption) => {
          if (exemption === null || typeof exemption !== "object") {
            return exemption;
          }

          const old = exemption as Record<string, unknown>;

          return {
            abilityId: old["abilityId"],
            suppressionId: old["forcedStateId"] ?? old["suppressionId"],
            source,
          };
        })
        : legacy["exemptions"];

      return {
        ok: true,
        value: {
          id: legacy["id"],
          kind: "forced-zetsu",
          appliedAt: legacy["appliedAt"],
          source,
          release: { rule: "source-authorized", authority: source },
          exemptions: exemptions ?? [],
        },
      };
    }

    default:
      return {
        ok: false,
        errors: [{
          code: "nen.state.migrate.origin.invalid",
          message:
            "A stored forced state names an origin this migration does not recognise.",
          audience: "developer",
          required: "instinctive-awakening | uncontained-collapse",
          actual: describeDiagnosticValue(origin),
        }],
      };
  }
}


/*
 * The Nen Type field, in whichever of the two shapes it was stored.
 *
 * REFUSED rather than normalized. The earlier version turned anything that was
 * not an object into `unassigned` and read `known` as `=== true`, which meant
 * a corrupt affinity silently became "nobody decided" and a corrupt `known`
 * silently became `false`. Both are inventions: the record said something, and
 * the migration does not get to decide it said nothing.
 *
 * The genuine legacy form is `{ type: NenType | null, known: boolean }`, where
 * `{ type: null, known: false }` was what "nobody has established this"
 * looked like before the state became explicit.
 */
function migrateNenTypeField(
  value: unknown,
): { readonly ok: true; readonly value: NenTypeKnowledge } | { readonly ok: false; readonly errors: readonly EngineError[] } {
  const refuse = (
    required: string,
    actual: unknown,
  ): { readonly ok: false; readonly errors: readonly EngineError[] } => ({
    ok: false,
    errors: [{
      code: "nen.state.migrate.nen-type.invalid",
      message: "A stored awakening must carry a readable Nen Type record.",
      audience: "developer",
      required,
      actual: describeDiagnosticValue(actual),
    }],
  });

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return refuse("{ type, known } or { status }", value);
  }

  const stored = value as Record<string, unknown>;

  /* Already current. */
  if (stored["status"] === "unassigned") {
    return { ok: true, value: unassignedNenType() };
  }

  if (stored["status"] === "assigned") {
    if (!isNenType(stored["type"])) {
      return refuse("a Nen Type", stored["type"]);
    }

    if (typeof stored["known"] !== "boolean") {
      return refuse("boolean", stored["known"]);
    }

    return { ok: true, value: assignedNenType(stored["type"], stored["known"]) };
  }

  if (stored["status"] !== undefined) {
    return refuse("assigned | unassigned", stored["status"]);
  }

  /* The legacy form. `known` must be a boolean; it was one. */
  if (typeof stored["known"] !== "boolean") {
    return refuse("boolean", stored["known"]);
  }

  const type = stored["type"];

  if (type === null) {
    /*
     * `{ type: null, known: true }` was refused by the Phase-5.0 validator as
     * "a known Nen Type must say which type it is", so a save carrying it is
     * corrupt rather than merely old.
     */
    if (stored["known"] === true) {
      return refuse("known: false when no type is recorded", stored["known"]);
    }

    return { ok: true, value: unassignedNenType() };
  }

  if (!isNenType(type)) return refuse("a Nen Type or null", type);

  return { ok: true, value: assignedNenType(type, stored["known"]) };
}
