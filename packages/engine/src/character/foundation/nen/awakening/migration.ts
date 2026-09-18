/*
 * Reading a Nen state written by an older engine.
 *
 * Three shapes predate the current one, and a host loading a saved character
 * has no way to tell which it is holding except by looking:
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
 *   PRE-HNT-1     the current awakening object, with the affinity stored on it
 *                 as `awakening.nenType: { status, type, known }` — a Type with
 *                 no lean, owned by the wrong object. It moves to
 *                 `nen.affinity` as a complete affinity with NO lean (the old
 *                 record never carried one, and inventing one would change what
 *                 the character is), and history's Type-only `nenTypeChange`
 *                 entries become complete `affinityChange` entries the same
 *                 way.
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
  assignedNenAffinity,
  findNenAffinityKnowledgeIssues,
  isNenType,
  pureNenAffinity,
  unassignedNenAffinity,
  UNASSIGNED_CONFLICTING_FIELDS,
  type NenAffinityChange,
  type NenAffinityKnowledge,
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
function reconstructAwakening(): NenAwakeningState {
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
    ...createUnawakenedAwakeningState(),
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

  const affinity = migrateAffinity(stored, awakening.legacyAffinity);

  if (!affinity.ok) return fail(traceId, affinity.errors);

  const migrated: NenState = {
    awakening: awakening.value,
    affinity: affinity.value,
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


/*
 * A migrated awakening, and the affinity it was carrying when it arrived.
 *
 * `legacyAffinity` is what `awakening.nenType` held — already translated, and
 * already REMOVED from the awakening value — or undefined when the awakening
 * carried none. It is handed up rather than written straight onto the Nen
 * state, because only the caller can see whether `nen.affinity` also exists
 * and the two would then have to be reconciled.
 */
type Migrated =
  | {
    readonly ok: true;
    readonly value: NenAwakeningState;
    readonly legacyAffinity: NenAffinityKnowledge | undefined;
  }
  | { readonly ok: false; readonly errors: readonly EngineError[] };


type MigrationFailure = { readonly ok: false; readonly errors: readonly EngineError[] };


function migrationFailure(
  code: string,
  message: string,
  required: string,
  actual: unknown,
): MigrationFailure {
  return {
    ok: false,
    errors: [{
      code,
      message,
      audience: "developer",
      required,
      actual: describeDiagnosticValue(actual),
    }],
  };
}


function migrateBooleanAwakening(awakened: boolean): Migrated {
  /*
   * No affinity here at all. A pre-Phase-5 record kept the type on `details`,
   * which arrives separately and is folded in by adoptLegacyNenType; if it was
   * absent there too, then nobody ever decided, and migrateAffinity says so.
   */
  return {
    ok: true,
    value: awakened
      ? reconstructAwakening()
      : createUnawakenedAwakeningState(),
    legacyAffinity: undefined,
  };
}


/*
 * Where the affinity comes from, and there may be only one answer.
 *
 *   nen.affinity only            current. Judged strictly and passed through
 *                                UNCHANGED — a malformed lean is refused, not
 *                                normalized, and a valid one is not rewritten.
 *   awakening.nenType only       pre-HNT-1. Already translated by the awakening
 *                                migration into a lean-free affinity.
 *   both                         REFUSED. Two stored affinities is the defect
 *                                this whole move exists to end, and choosing
 *                                one would change somebody's character.
 *   neither, boolean shape       pre-Phase-5, whose type lived on `details`:
 *                                unassigned, and adoptLegacyNenType folds the
 *                                details value in afterwards.
 *   neither, object shape        REFUSED. Every awakening object ever written
 *                                carried a Nen Type; one without is corrupt.
 */
function migrateAffinity(
  stored: Record<string, unknown>,
  legacyAffinity: NenAffinityKnowledge | undefined,
):
  | { readonly ok: true; readonly value: NenAffinityKnowledge }
  | MigrationFailure {
  const hasCurrent = Object.prototype.hasOwnProperty.call(stored, "affinity");

  if (hasCurrent && legacyAffinity !== undefined) {
    return migrationFailure(
      "nen.state.migrate.affinity.ambiguous",
      "A stored Nen state carries both `affinity` and the retired `awakening.nenType`.",
      "one affinity representation",
      "both",
    );
  }

  if (hasCurrent) {
    const issues = findNenAffinityKnowledgeIssues(stored["affinity"], "affinity");

    if (issues.length > 0) return { ok: false, errors: issues };

    return { ok: true, value: stored["affinity"] as NenAffinityKnowledge };
  }

  if (legacyAffinity !== undefined) return { ok: true, value: legacyAffinity };

  if (Object.prototype.hasOwnProperty.call(stored, "awakened")) {
    return { ok: true, value: unassignedNenAffinity() };
  }

  return migrationFailure(
    "nen.state.migrate.affinity.missing",
    "A stored Nen state must record an affinity, even an unassigned one.",
    "`affinity`, or `awakening.nenType` before HNT-1",
    "neither",
  );
}


/*
 * History's Type-only changes, rewritten as complete affinity changes.
 *
 * `previous` and `next` gain NO lean, for the same reason the current affinity
 * gains none. `known` is recorded as TRUE, and that is not a guess: before this
 * ticket every change applied `known: true` to the stored Type whatever the
 * source had asked for, so true is what those changes actually did. (That was
 * a defect, and it is fixed going forward — see settlement.ts.)
 *
 * Applied-override names move with it: the field an exceptional source
 * declared was called `nenType` and is now `affinity`.
 *
 * An entry is only rebuilt when it carries something old, so a current history
 * round-trips as the same objects.
 */
function migrateHistory(
  history: unknown,
): { readonly ok: true; readonly value: unknown } | MigrationFailure {
  if (!Array.isArray(history)) return { ok: true, value: history };

  const errors: EngineError[] = [];
  let changed = false;

  const migrated = (history as readonly unknown[]).map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return entry;
    }

    const record = entry as Record<string, unknown>;
    let next: Record<string, unknown> = record;

    if (Object.prototype.hasOwnProperty.call(record, "nenTypeChange")) {
      if (Object.prototype.hasOwnProperty.call(record, "affinityChange")) {
        errors.push(...migrationFailure(
          "nen.state.migrate.type-change.ambiguous",
          `history[${index}] carries both \`nenTypeChange\` and \`affinityChange\`.`,
          "one change representation",
          "both",
        ).errors);

        return entry;
      }

      const change = record["nenTypeChange"];

      if (
        change === null ||
        typeof change !== "object" ||
        Array.isArray(change) ||
        !(
          (change as Record<string, unknown>)["previous"] === null ||
          isNenType((change as Record<string, unknown>)["previous"])
        ) ||
        !isNenType((change as Record<string, unknown>)["next"])
      ) {
        errors.push(...migrationFailure(
          "nen.state.migrate.type-change.invalid",
          `history[${index}] carries an unreadable Nen Type change.`,
          "{ previous: NenType | null, next: NenType, cause }",
          change,
        ).errors);

        return entry;
      }

      const old = change as Record<string, unknown>;
      const { nenTypeChange: _retired, ...rest } = record;

      const affinityChange: NenAffinityChange = {
        previous: old["previous"] === null
          ? null
          : pureNenAffinity(old["previous"] as NonNullable<NenAffinityChange["previous"]>["primary"]),
        next: pureNenAffinity(old["next"] as NenAffinityChange["next"]["primary"]),
        known: true,
        cause: old["cause"] as string,
      };

      next = { ...rest, affinityChange };
    }

    const overrides = next["appliedOverrides"];

    if (
      Array.isArray(overrides) &&
      overrides.some((override) =>
        override !== null &&
        typeof override === "object" &&
        (override as { field?: unknown }).field === "nenType"
      )
    ) {
      next = {
        ...next,
        appliedOverrides: overrides.map((override) =>
          override !== null &&
          typeof override === "object" &&
          (override as { field?: unknown }).field === "nenType"
            ? { ...(override as object), field: "affinity" }
            : override
        ),
      };
    }

    if (next !== record) changed = true;

    return next;
  });

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, value: changed ? migrated : history };
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
  /*
   * PRESENCE, not value — the same rule the outer awakened/awakening
   * discriminator uses, applied to the inner one.
   *
   * Testing `!== undefined` meant three malformed saves migrated
   * "successfully": `suppression` simply absent, `suppression: null`, and both
   * properties present with one of them holding `undefined`. All three came
   * out as an empty list, which is the migration manufacturing a fact the
   * record never carried — an awakened character who is holding nothing shut.
   */
  const hasLegacy = Object.prototype.hasOwnProperty.call(stored, "forcedStates");
  const hasCurrent = Object.prototype.hasOwnProperty.call(stored, "suppression");

  if (hasLegacy && hasCurrent) {
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

  if (!hasLegacy && !hasCurrent) {
    return {
      ok: false,
      errors: [{
        code: "nen.state.migrate.suppression.missing",
        message: "A stored awakening must record its suppression.",
        audience: "developer",
        required: "`forcedStates` (Phase 5.0) or `suppression`",
        actual: "neither",
      }],
    };
  }

  /*
   * The affinity, if this awakening still carries one. PRESENCE again: a
   * pre-HNT-1 awakening always did, and a current one never does — whether
   * `nen.affinity` then has to supply it is decided by the caller.
   */
  const hasNenType = Object.prototype.hasOwnProperty.call(stored, "nenType");

  let legacyAffinity: NenAffinityKnowledge | undefined;

  if (hasNenType) {
    const migratedType = migrateNenTypeField(stored["nenType"]);

    if (!migratedType.ok) return migratedType;

    legacyAffinity = migratedType.value;
  }

  const history = migrateHistory(stored["history"]);

  if (!history.ok) return history;

  const { nenType: _moved, ...withoutType } = stored;

  const carried: Record<string, unknown> = {
    ...(hasNenType ? withoutType : stored),
    ...(history.value === stored["history"] ? {} : { history: history.value }),
  };

  /*
   * Already current: passed through UNCHANGED rather than defaulted, and left
   * for validateNenState to judge. Two validators disagreeing about what a
   * suppression list may contain is worse than one of them being strict.
   */
  if (hasCurrent) {
    return {
      ok: true,
      value: (hasNenType || carried["history"] !== stored["history"]
        ? carried
        : stored) as unknown as NenAwakeningState,
      legacyAffinity,
    };
  }

  const legacyStates = stored["forcedStates"];

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

  const { forcedStates: _dropped, ...rest } = carried;

  return {
    ok: true,
    value: {
      ...rest,
      suppression: migrated,
    } as unknown as NenAwakeningState,
    legacyAffinity,
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
 * The retired `awakening.nenType` field, in whichever shape it was stored,
 * translated into a lean-free affinity.
 *
 * REFUSED rather than normalized. The earlier version turned anything that was
 * not an object into `unassigned` and read `known` as `=== true`, which meant
 * a corrupt affinity silently became "nobody decided" and a corrupt `known`
 * silently became `false`. Both are inventions: the record said something, and
 * the migration does not get to decide it said nothing.
 *
 * Two shapes:
 *
 *   Phase 5.0   `{ type: NenType | null, known: boolean }`, where
 *               `{ type: null, known: false }` meant nobody had decided.
 *   pre-HNT-1   `{ status: "assigned", type, known }` or
 *               `{ status: "unassigned" }`.
 *
 * Neither ever carried a lean, so every assigned result has `leaning: null`.
 */
function migrateNenTypeField(
  value: unknown,
): { readonly ok: true; readonly value: NenAffinityKnowledge } | MigrationFailure {
  const refuse = (required: string, actual: unknown): MigrationFailure =>
    migrationFailure(
      "nen.state.migrate.nen-type.invalid",
      "A stored awakening must carry a readable Nen Type record.",
      required,
      actual,
    );

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return refuse("{ type, known } or { status }", value);
  }

  const stored = value as Record<string, unknown>;

  /*
   * The union is ENFORCED rather than normalized.
   *
   * `{ status: "unassigned", type: "enhancement", known: true }` contradicts
   * itself: one half says nobody has decided and the other names a discovered
   * affinity. Returning a bare `unassigned` discarded whichever half was
   * right, silently, at the one boundary whose job is to notice.
   *
   * Only the CONFLICTING branch's fields are refused. An unrelated extension
   * field is somebody else's business; this engine has no general
   * closed-object policy and inventing one here would be a wider rule than the
   * defect calls for.
   */
  if (stored["status"] === "unassigned") {
    const conflicting = UNASSIGNED_CONFLICTING_FIELDS.filter((field) =>
      Object.prototype.hasOwnProperty.call(stored, field),
    );

    if (conflicting.length > 0) {
      return refuse(
        `no ${conflicting.join(" or ")} alongside status "unassigned"`,
        conflicting.join(", "),
      );
    }

    return { ok: true, value: unassignedNenAffinity() };
  }

  /*
   * The retired field holding the NEW vocabulary is neither shape. An
   * `affinity` here is a current value written to the old path, and accepting
   * it would keep the old path alive as a second place to write one.
   */
  if (Object.prototype.hasOwnProperty.call(stored, "affinity")) {
    return refuse("{ status, type, known } with no affinity", stored["affinity"]);
  }

  if (stored["status"] === "assigned") {
    if (!isNenType(stored["type"])) {
      return refuse("a Nen Type", stored["type"]);
    }

    if (typeof stored["known"] !== "boolean") {
      return refuse("boolean", stored["known"]);
    }

    return {
      ok: true,
      value: assignedNenAffinity(pureNenAffinity(stored["type"]), stored["known"]),
    };
  }

  if (stored["status"] !== undefined) {
    return refuse("assigned | unassigned", stored["status"]);
  }

  /* The Phase-5.0 form. `known` must be a boolean; it was one. */
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

    return { ok: true, value: unassignedNenAffinity() };
  }

  if (!isNenType(type)) return refuse("a Nen Type or null", type);

  return {
    ok: true,
    value: assignedNenAffinity(pureNenAffinity(type), stored["known"]),
  };
}
