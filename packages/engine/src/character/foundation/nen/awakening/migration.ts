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
   * Which shape is this? The discriminator is which awakening field exists,
   * and a payload carrying BOTH is refused rather than resolved by precedence:
   * the two can disagree, and silently preferring one changes whether somebody
   * is awakened.
   */
  const hasBoolean = typeof stored["awakened"] === "boolean";
  const hasObject =
    stored["awakening"] !== null &&
    typeof stored["awakening"] === "object" &&
    !Array.isArray(stored["awakening"]);

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

  if (legacyStates !== undefined && !Array.isArray(legacyStates)) {
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

  const suppression = legacyStates === undefined
    ? current
    : (legacyStates as readonly unknown[]).map(migrateForcedState);

  const nenType = migrateNenTypeField(stored["nenType"]);

  if (!nenType.ok) return nenType;

  const { forcedStates: _dropped, ...rest } = stored;

  return {
    ok: true,
    value: {
      ...rest,
      suppression: suppression ?? [],
      nenType: nenType.value,
    } as unknown as NenAwakeningState,
  };
}


/*
 * One Phase-5.0 forced state, split by the origin it used to carry.
 *
 * An `uncontained-collapse` origin was never an externally imposed state — it
 * was the body's own response — so it becomes an involuntary Zetsu and loses
 * the exemption list it should never have been able to hold. Everything else
 * was externally imposed and becomes a forced Zetsu whose release authority is
 * the source that imposed it, which is what the repair made explicit.
 */
function migrateForcedState(held: unknown): unknown {
  if (held === null || typeof held !== "object") return held;

  const legacy = held as Record<string, unknown>;

  if (legacy["origin"] === "uncontained-collapse") {
    return {
      id: legacy["id"],
      kind: "involuntary-zetsu",
      appliedAt: legacy["appliedAt"],
      cause: "uncontained-aura-collapse",
      recoveryId: legacy["recoveryId"] ?? "",
    };
  }

  const source = legacy["source"];
  const exemptions = Array.isArray(legacy["exemptions"])
    ? (legacy["exemptions"] as readonly unknown[]).map((exemption) => {
      if (exemption === null || typeof exemption !== "object") return exemption;

      const old = exemption as Record<string, unknown>;

      return {
        abilityId: old["abilityId"],
        suppressionId: old["forcedStateId"] ?? old["suppressionId"],
        source,
      };
    })
    : [];

  return {
    id: legacy["id"],
    kind: "forced-zetsu",
    appliedAt: legacy["appliedAt"],
    source,
    release: { rule: "source-authorized", authority: source },
    exemptions,
  };
}


function migrateNenTypeField(
  value: unknown,
): { readonly ok: true; readonly value: NenTypeKnowledge } | { readonly ok: false; readonly errors: readonly EngineError[] } {
  if (value === null || typeof value !== "object") {
    return { ok: true, value: unassignedNenType() };
  }

  const stored = value as Record<string, unknown>;

  /* Already migrated. */
  if (stored["status"] === "assigned" || stored["status"] === "unassigned") {
    return { ok: true, value: value as NenTypeKnowledge };
  }

  const type = stored["type"];

  if (type === null || type === undefined) {
    return { ok: true, value: unassignedNenType() };
  }

  if (!isNenType(type)) {
    return {
      ok: false,
      errors: [{
        code: "nen.state.migrate.nen-type.invalid",
        message: "A stored Nen Type must be one of the six Nen Types.",
        audience: "developer",
        required: "a Nen Type",
        actual: describeDiagnosticValue(type),
      }],
    };
  }

  return { ok: true, value: assignedNenType(type, stored["known"] === true) };
}
