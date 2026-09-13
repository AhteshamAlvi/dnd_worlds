/*
 * Judging an awakening state that arrived from outside.
 *
 * Everything here RETURNS diagnostics. Nothing throws, and nothing repairs:
 * a malformed state that gets silently patched is a state whose owner never
 * learns their save file is wrong, and a thrown domain error is a second error
 * channel every caller would have to handle alongside EngineResult.
 *
 * Two levels, kept apart because they answer different questions.
 *
 *   STRUCTURAL  is this the right shape? Discriminants in range, ids present,
 *               numbers finite, timestamps real. A `condition` of "asleep" or
 *               an `appliedAt` of NaN fails here. This is what a
 *               deserialization boundary runs, and it makes no reference to
 *               the rules.
 *
 *   DOMAIN      is this a state the rules permit? Open nodes while unawakened,
 *               pseudo-Chu on a reverted character, a natural Ability whose
 *               provenance names no awakening in the history, a forced-state
 *               exemption pointing at a different forced state. Every one of
 *               these is structurally perfect and mechanically impossible.
 *
 * Structural issues are found first and stop the domain pass, because domain
 * rules read fields the structural pass has just proved are readable.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../../../infrastructure/diagnostics";
import type { JsonValue } from "../../../../infrastructure/json";
import {
  contributionSourceKey,
  isSameContributionSource,
} from "../../../../infrastructure/contribution-source";
import { AURA_NODE_STATES } from "../../aura/types";
import { isNenType } from "../nen-type";

import {
  awakeningRecords,
  hasEverAwakened,
} from "./state";
import {
  isNenAwakeningCondition,
  isNenAwakeningMethod,
  isNenExceptionalOverrideField,
  isNenSuppressionKind,
  isNenReawakeningHurdle,
  NEN_SUPPRESSION_KINDS,
  type NenAwakeningHistoryEntry,
  type NenAwakeningState,
  type NenCollapseRecovery,
  type NenSuppressionState,
  type NenAwakeningRecord,
  type NenReversionRecord,
} from "./types";


/* ── Shared predicates ──────────────────────────────────────────────────── */

function isIdentifier(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isTimestamp(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/*
 * A field that is allowed to be null but never allowed to be MISSING.
 *
 * `!== null` alone was not enough and the difference bit: a hostile object
 * with the field simply absent passed the guard as `undefined` and the next
 * line dereferenced it, so a malformed save file threw a TypeError out of a
 * validator whose entire contract is that it returns diagnostics.
 */
function isNullableObject(value: unknown): boolean {
  return value === null || isRecordObject(value);
}

/*
 * A provenance ref, judged HERE rather than by importing a validator from the
 * contribution-source module — that module deliberately declares the shape and
 * no opinion about it, because different consumers require different fields.
 * Awakening requires both a type and an id, and permits an optional instance.
 */
function isSourceRef(value: unknown): boolean {
  if (!isRecordObject(value)) return false;

  return (
    isIdentifier(value["type"]) &&
    isIdentifier(value["id"]) &&
    (value["instanceId"] === undefined || isIdentifier(value["instanceId"]))
  );
}

/*
 * Delegated to the shared formatter, which never asks the value to describe
 * itself. The local version ended in `String(value)`, and a prototype-less
 * object — which is what `JSON.parse` with a reviver hands back — has no
 * `toString` to call, so formatting the diagnostic threw.
 */
const describe = describeDiagnosticValue;

function developerError(
  code: string,
  message: string,
  required: JsonValue,
  actual: JsonValue,
): EngineError {
  return { code, message, audience: "developer", required, actual };
}


/* ── Structural validation ──────────────────────────────────────────────── */

function findSuppressionStructuralIssues(
  held: NenSuppressionState,
  index: number,
): readonly EngineError[] {
  const errors: EngineError[] = [];
  const at = `suppression[${index}]`;

  if (!isRecordObject(held)) {
    return [developerError(
      "nen.awakening.suppression.invalid",
      `${at} must be a record.`,
      "object",
      describe(held),
    )];
  }

  if (!isIdentifier(held.id)) {
    errors.push(developerError(
      "nen.awakening.suppression.id.invalid",
      `${at} must carry a non-empty id.`,
      "non-empty string",
      describe(held.id),
    ));
  }

  if (!isTimestamp(held.appliedAt)) {
    errors.push(developerError(
      "nen.awakening.suppression.timestamp.invalid",
      `${at} must have been applied at a finite game timestamp.`,
      "finite GameTimestamp",
      describe(held.appliedAt),
    ));
  }

  /*
   * The discriminant is checked before either variant is read, so an unknown
   * kind is one clear error rather than a cascade of missing-field errors from
   * whichever branch happened to run.
   */
  if (!isNenSuppressionKind(held.kind)) {
    errors.push(developerError(
      "nen.awakening.suppression.kind.invalid",
      `${at} names an unknown suppression kind.`,
      NEN_SUPPRESSION_KINDS.join(" | "),
      describe((held as { kind?: unknown }).kind),
    ));

    return errors;
  }

  if (held.kind === "involuntary-zetsu") {
    if (held.cause !== "uncontained-aura-collapse") {
      errors.push(developerError(
        "nen.awakening.suppression.cause.invalid",
        `${at} names an unknown involuntary-Zetsu cause.`,
        "uncontained-aura-collapse",
        describe(held.cause),
      ));
    }

    if (!isIdentifier(held.recoveryId)) {
      errors.push(developerError(
        "nen.awakening.suppression.recovery.invalid",
        `${at} must name the collapse recovery it belongs to.`,
        "non-empty string",
        describe(held.recoveryId),
      ));
    }

    /*
     * Nothing functions through an involuntary Zetsu, so the field that would
     * carry such a permission must not be present at all. A caller smuggling
     * one in would otherwise be relying on a reader that ignores it.
     */
    if ((held as { exemptions?: unknown }).exemptions !== undefined) {
      errors.push(developerError(
        "nen.awakening.suppression.involuntary.exemptions",
        `${at} is an involuntary Zetsu and cannot carry exemptions.`,
        "no exemptions",
        describe((held as { exemptions?: unknown }).exemptions),
      ));
    }

    return errors;
  }

  if (!isSourceRef(held.source)) {
    errors.push(developerError(
      "nen.awakening.suppression.source.invalid",
      `${at} must name what imposed it.`,
      "{ type, id }",
      describe(held.source),
    ));
  }

  if (
    !isRecordObject(held.release) ||
    held.release["rule"] !== "source-authorized" ||
    !isSourceRef(held.release["authority"])
  ) {
    errors.push(developerError(
      "nen.awakening.suppression.release.invalid",
      `${at} must declare how it can be released.`,
      '{ rule: "source-authorized", authority: { type, id } }',
      describe(held.release),
    ));
  }

  if (!Array.isArray(held.exemptions)) {
    errors.push(developerError(
      "nen.awakening.suppression.exemptions.invalid",
      `${at} must carry a list of exemptions, even when it is empty.`,
      "array",
      describe(held.exemptions),
    ));

    return errors;
  }

  held.exemptions.forEach((exemption, exemptionIndex) => {
    const where = `${at}.exemptions[${exemptionIndex}]`;

    if (!isRecordObject(exemption)) {
      errors.push(developerError(
        "nen.awakening.suppression.exemption.invalid",
        `${where} must be a record.`,
        "object",
        describe(exemption),
      ));

      return;
    }

    if (!isIdentifier(exemption.abilityId)) {
      errors.push(developerError(
        "nen.awakening.suppression.exemption.ability.invalid",
        `${where} must name the Ability it exempts.`,
        "non-empty string",
        describe(exemption.abilityId),
      ));
    }

    if (!isIdentifier(exemption.suppressionId)) {
      errors.push(developerError(
        "nen.awakening.suppression.exemption.state.invalid",
        `${where} must name the suppression it belongs to.`,
        "non-empty string",
        describe(exemption.suppressionId),
      ));
    }

    if (!isSourceRef(exemption.source)) {
      errors.push(developerError(
        "nen.awakening.suppression.exemption.source.invalid",
        `${where} must name the source that granted it.`,
        "{ type, id }",
        describe(exemption.source),
      ));
    }
  });

  return errors;
}


function findAwakeningRecordStructuralIssues(
  record: NenAwakeningRecord,
  at: string,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!isNenAwakeningMethod(record.method)) {
    errors.push(developerError(
      "nen.awakening.history.method.invalid",
      `${at} names an unknown awakening method.`,
      "standard | abrupt | instinctive | exceptional",
      describe(record.method),
    ));
  }

  if (record.source !== null && !isSourceRef(record.source)) {
    errors.push(developerError(
      "nen.awakening.history.source.invalid",
      `${at} carries a malformed source.`,
      "{ type, id } or null",
      describe(record.source),
    ));
  }

  if (typeof record.reawakening !== "boolean") {
    errors.push(developerError(
      "nen.awakening.history.reawakening.invalid",
      `${at} must say whether it was a reawakening.`,
      "boolean",
      describe(record.reawakening),
    ));
  }

  if (typeof record.eligibilityBypassed !== "boolean") {
    errors.push(developerError(
      "nen.awakening.history.eligibility-bypassed.invalid",
      `${at} must say whether the standard thresholds were applied.`,
      "boolean",
      describe(record.eligibilityBypassed),
    ));
  }

  if (
    record.hurdle !== undefined && !isNenReawakeningHurdle(record.hurdle)
  ) {
    errors.push(developerError(
      "nen.awakening.history.hurdle.invalid",
      `${at} names an unknown reawakening hurdle.`,
      "ideal | minor | moderate | severe | critical | catastrophic",
      describe(record.hurdle),
    ));
  }

  if (!Array.isArray(record.appliedOverrides)) {
    errors.push(developerError(
      "nen.awakening.history.overrides.invalid",
      `${at} must carry a list of applied overrides, even when it is empty.`,
      "array",
      describe(record.appliedOverrides),
    ));
  } else {
    record.appliedOverrides.forEach((override, overrideIndex) => {
      if (!isNenExceptionalOverrideField(override.field)) {
        errors.push(developerError(
          "nen.awakening.history.override.field.invalid",
          `${at}.appliedOverrides[${overrideIndex}] names an unknown field.`,
          "a declared exceptional override field",
          describe(override.field),
        ));
      }

      if (!isIdentifier(override.summary)) {
        errors.push(developerError(
          "nen.awakening.history.override.summary.invalid",
          `${at}.appliedOverrides[${overrideIndex}] must explain itself.`,
          "non-empty string",
          describe(override.summary),
        ));
      }
    });
  }

  errors.push(...findNenTypeChangeIssues(record.nenTypeChange, at));

  return errors;
}


function findReversionRecordStructuralIssues(
  record: NenReversionRecord,
  at: string,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  /*
   * Reversion is exceptional by definition, so a source is REQUIRED rather
   * than nullable. There is no ordinary un-awakening for one to be absent on.
   */
  if (!isSourceRef(record.source)) {
    errors.push(developerError(
      "nen.awakening.history.reversion.source.invalid",
      `${at} must name the exceptional source that caused it.`,
      "{ type, id }",
      describe(record.source),
    ));
  }

  if (
    record.removedNaturalAbilityId !== null &&
    !isIdentifier(record.removedNaturalAbilityId)
  ) {
    errors.push(developerError(
      "nen.awakening.history.reversion.ability.invalid",
      `${at} carries a malformed removed-Ability id.`,
      "non-empty string or null",
      describe(record.removedNaturalAbilityId),
    ));
  }

  errors.push(...findNenTypeChangeIssues(record.nenTypeChange, at));

  return errors;
}


function findNenTypeChangeIssues(
  change: NenAwakeningRecord["nenTypeChange"],
  at: string,
): readonly EngineError[] {
  if (change === undefined) return [];

  const errors: EngineError[] = [];

  if (change.previous !== null && !isNenType(change.previous)) {
    errors.push(developerError(
      "nen.awakening.type-change.previous.invalid",
      `${at} records a malformed previous Nen Type.`,
      "a Nen Type or null",
      describe(change.previous),
    ));
  }

  if (!isNenType(change.next)) {
    errors.push(developerError(
      "nen.awakening.type-change.next.invalid",
      `${at} must record the Nen Type it changed to.`,
      "a Nen Type",
      describe(change.next),
    ));
  }

  if (!isIdentifier(change.cause)) {
    errors.push(developerError(
      "nen.awakening.type-change.cause.invalid",
      `${at} must record what caused the Nen Type change.`,
      "non-empty string",
      describe(change.cause),
    ));
  }

  return errors;
}


function findHistoryStructuralIssues(
  history: readonly NenAwakeningHistoryEntry[],
): readonly EngineError[] {
  const errors: EngineError[] = [];
  const seen = new Set<string>();

  history.forEach((entry, index) => {
    const at = `history[${index}]`;

    if (!isRecordObject(entry)) {
      errors.push(developerError(
        "nen.awakening.history.entry.invalid",
        `${at} must be a record.`,
        "object",
        describe(entry),
      ));

      return;
    }

    if (!isIdentifier(entry.id)) {
      errors.push(developerError(
        "nen.awakening.history.id.invalid",
        `${at} must carry a non-empty id.`,
        "non-empty string",
        describe(entry.id),
      ));
    } else if (seen.has(entry.id)) {
      errors.push(developerError(
        "nen.awakening.history.id.duplicate",
        `${at} reuses an id already present in the history.`,
        "each history id at most once",
        entry.id,
      ));
    } else {
      seen.add(entry.id);
    }

    if (!isTimestamp(entry.occurredAt)) {
      errors.push(developerError(
        "nen.awakening.history.timestamp.invalid",
        `${at} must have occurred at a finite game timestamp.`,
        "finite GameTimestamp",
        describe(entry.occurredAt),
      ));
    }

    if (entry.kind === "awakening") {
      errors.push(...findAwakeningRecordStructuralIssues(entry, at));
    } else if (entry.kind === "reversion") {
      errors.push(...findReversionRecordStructuralIssues(entry, at));
    } else {
      errors.push(developerError(
        "nen.awakening.history.kind.invalid",
        `${at} names an unknown history entry kind.`,
        "awakening | reversion",
        describe((entry as { kind?: unknown }).kind),
      ));
    }
  });

  return errors;
}


function findCollapseRecoveryStructuralIssues(
  recovery: NenCollapseRecovery,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!isIdentifier(recovery.id)) {
    errors.push(developerError(
      "nen.awakening.collapse-recovery.id.invalid",
      "A collapse recovery must carry a non-empty id.",
      "non-empty string",
      describe(recovery.id),
    ));
  }

  if (!isTimestamp(recovery.beganAt)) {
    errors.push(developerError(
      "nen.awakening.collapse-recovery.began-at.invalid",
      "A collapse recovery must have begun at a finite game timestamp.",
      "finite GameTimestamp",
      describe(recovery.beganAt),
    ));
  }

  if (
    typeof recovery.requiredSleepHours !== "number" ||
    !Number.isFinite(recovery.requiredSleepHours) ||
    recovery.requiredSleepHours <= 0
  ) {
    errors.push(developerError(
      "nen.awakening.collapse-recovery.required-hours.invalid",
      "A collapse recovery must require a finite, positive number of hours.",
      "finite number > 0",
      describe(recovery.requiredSleepHours),
    ));
  }

  if (
    typeof recovery.accumulatedSleepHours !== "number" ||
    !Number.isFinite(recovery.accumulatedSleepHours) ||
    recovery.accumulatedSleepHours < 0
  ) {
    errors.push(developerError(
      "nen.awakening.collapse-recovery.accumulated-hours.invalid",
      "Accumulated qualifying sleep must be a finite, non-negative number.",
      "finite number >= 0",
      describe(recovery.accumulatedSleepHours),
    ));
  }

  if (recovery.completedAt !== null && !isTimestamp(recovery.completedAt)) {
    errors.push(developerError(
      "nen.awakening.collapse-recovery.completed-at.invalid",
      "A completed collapse recovery must record a finite completion time.",
      "finite GameTimestamp or null",
      describe(recovery.completedAt),
    ));
  }

  return errors;
}


/**
 * Is this the right SHAPE? No rule is consulted.
 *
 * What a deserialization boundary runs before anything reads a field. It
 * cannot be skipped on the grounds that the state came from the engine's own
 * transitions: a save file is hostile input whatever wrote it, and the
 * transitions are exactly what a tampered file is trying to get past.
 */
export function findAwakeningStateStructuralIssues(
  state: NenAwakeningState,
): readonly EngineError[] {
  if (!isRecordObject(state)) {
    return [developerError(
      "nen.awakening.state.invalid",
      "An awakening state must be an object.",
      "object",
      describe(state),
    )];
  }

  const errors: EngineError[] = [];

  if (!isNenAwakeningCondition(state.condition)) {
    errors.push(developerError(
      "nen.awakening.condition.invalid",
      "An awakening state must name a known condition.",
      "unawakened | awakened | reverted",
      describe(state.condition),
    ));
  }

  if (!(AURA_NODE_STATES as readonly string[]).includes(state.nodes)) {
    errors.push(developerError(
      "nen.awakening.nodes.invalid",
      "An awakening state must name a known Aura-node state.",
      AURA_NODE_STATES.join(" | "),
      describe(state.nodes),
    ));
  }

  if (
    state.currentMethod !== null && !isNenAwakeningMethod(state.currentMethod)
  ) {
    errors.push(developerError(
      "nen.awakening.current-method.invalid",
      "The current awakening method must be a known method, or null.",
      "standard | abrupt | instinctive | exceptional | null",
      describe(state.currentMethod),
    ));
  }

  if (
    state.currentAwakeningId !== null &&
    !isIdentifier(state.currentAwakeningId)
  ) {
    errors.push(developerError(
      "nen.awakening.current-id.invalid",
      "The current awakening id must be a non-empty string, or null.",
      "non-empty string or null",
      describe(state.currentAwakeningId),
    ));
  }

  if (!Array.isArray(state.history)) {
    errors.push(developerError(
      "nen.awakening.history.invalid",
      "An awakening state must carry a history, even when it is empty.",
      "array",
      describe(state.history),
    ));
  } else {
    errors.push(...findHistoryStructuralIssues(state.history));
  }

  if (!isNullableObject(state.naturalAbility)) {
    errors.push(developerError(
      "nen.awakening.natural-ability.invalid",
      "A natural Nen Ability must be a record, or null.",
      "{ abilityId, grantedAt, grantedByAwakeningId, origin } or null",
      describe(state.naturalAbility),
    ));
  } else if (state.naturalAbility !== null) {
    const natural = state.naturalAbility;

    if (!isIdentifier(natural.abilityId)) {
      errors.push(developerError(
        "nen.awakening.natural-ability.id.invalid",
        "A natural Nen Ability must name the Ability it is.",
        "non-empty string",
        describe(natural.abilityId),
      ));
    }

    if (!isIdentifier(natural.grantedByAwakeningId)) {
      errors.push(developerError(
        "nen.awakening.natural-ability.provenance.invalid",
        "A natural Nen Ability must name the awakening that granted it.",
        "non-empty string",
        describe(natural.grantedByAwakeningId),
      ));
    }

    if (!isTimestamp(natural.grantedAt)) {
      errors.push(developerError(
        "nen.awakening.natural-ability.timestamp.invalid",
        "A natural Nen Ability must have been granted at a finite timestamp.",
        "finite GameTimestamp",
        describe(natural.grantedAt),
      ));
    }

    if (!isNenAwakeningMethod(natural.origin)) {
      errors.push(developerError(
        "nen.awakening.natural-ability.origin.invalid",
        "A natural Nen Ability must name the awakening method it came from.",
        "standard | abrupt | instinctive | exceptional",
        describe(natural.origin),
      ));
    }
  }

  if (!Array.isArray(state.externalAbilities)) {
    errors.push(developerError(
      "nen.awakening.external-abilities.invalid",
      "An awakening state must carry an external-Ability list, even empty.",
      "array",
      describe(state.externalAbilities),
    ));
  } else {
    state.externalAbilities.forEach((external, index) => {
      /*
       * The entry proved to be a record BEFORE anything is read off it —
       * including by the diagnostic. The previous version short-circuited the
       * condition correctly and then called describe(external.abilityId)
       * inside the error literal, so `externalAbilities: [null]` threw a
       * TypeError out of a validator whose entire contract is that it does not.
       */
      if (!isRecordObject(external)) {
        errors.push(developerError(
          "nen.awakening.external-ability.invalid",
          `externalAbilities[${index}] must be a record.`,
          "{ abilityId, source: { type, id } }",
          describe(external),
        ));

        return;
      }

      if (!isIdentifier(external.abilityId) || !isSourceRef(external.source)) {
        errors.push(developerError(
          "nen.awakening.external-ability.invalid",
          `externalAbilities[${index}] must name an Ability and its source.`,
          "{ abilityId, source: { type, id } }",
          describe(external.abilityId),
        ));
      }
    });
  }

  if (!Array.isArray(state.suppression)) {
    errors.push(developerError(
      "nen.awakening.suppression.list.invalid",
      "An awakening state must carry a suppression list, even when empty.",
      "array",
      describe(state.suppression),
    ));
  } else {
    state.suppression.forEach((held: NenSuppressionState, index) => {
      errors.push(...findSuppressionStructuralIssues(held, index));
    });
  }

  if (!isRecordObject(state.nenType)) {
    errors.push(developerError(
      "nen.awakening.nen-type.invalid",
      "An awakening state must carry a Nen Type reading.",
      "{ type, known }",
      describe(state.nenType),
    ));
  } else if (state.nenType.status === "assigned") {
    if (!isNenType(state.nenType.type)) {
      errors.push(developerError(
        "nen.awakening.nen-type.value.invalid",
        "An assigned Nen Type must be one of the six types.",
        "a Nen Type",
        describe(state.nenType.type),
      ));
    }

    if (typeof state.nenType.known !== "boolean") {
      errors.push(developerError(
        "nen.awakening.nen-type.known.invalid",
        "A Nen Type reading must say whether the type is known.",
        "boolean",
        describe(state.nenType.known),
      ));
    }
  } else if (state.nenType.status !== "unassigned") {
    errors.push(developerError(
      "nen.awakening.nen-type.status.invalid",
      "A Nen Type reading must be assigned or unassigned.",
      "assigned | unassigned",
      describe((state.nenType as { status?: unknown }).status),
    ));
  }

  if (!isNullableObject(state.collapseRecovery)) {
    errors.push(developerError(
      "nen.awakening.collapse-recovery.invalid",
      "A collapse recovery must be a record, or null.",
      "{ id, beganAt, requiredSleepHours, accumulatedSleepHours, completedAt } or null",
      describe(state.collapseRecovery),
    ));
  } else if (state.collapseRecovery !== null) {
    errors.push(
      ...findCollapseRecoveryStructuralIssues(state.collapseRecovery),
    );
  }

  return errors;
}


/* ── Domain validation ──────────────────────────────────────────────────── */

/**
 * Is this a state the RULES permit? Assumes the shape is already sound.
 *
 * Every check here is a state that would serialize and deserialize perfectly
 * and still be impossible — which is precisely the class a type system cannot
 * catch and a save file will eventually contain.
 */
export function findAwakeningStateDomainIssues(
  state: NenAwakeningState,
): readonly EngineError[] {
  /*
   * The structural pass runs FIRST, here, rather than being assumed.
   *
   * Every rule below reads a field — a history entry's kind, a forced state's
   * id, an Ability's provenance — and a hostile object can simply omit any of
   * them. Enumerating those guards again inside the domain rules would be the
   * structural pass written twice, and the second copy is the one that misses
   * the field somebody adds next year. So it delegates, and a malformed state
   * gets the structural answer rather than a TypeError out of a function whose
   * whole contract is that it returns diagnostics.
   */
  const structural = findAwakeningStateStructuralIssues(state);

  if (structural.length > 0) return structural;

  const errors: EngineError[] = [];
  const records = awakeningRecords(state);
  const recordIds = new Set(records.map((record) => record.id));

  /* Nodes follow the condition. Open nodes ARE what awakened means. */
  const expectedNodes = state.condition === "awakened" ? "open" : "half-open";

  if (state.nodes !== expectedNodes) {
    errors.push(developerError(
      "nen.awakening.nodes.mismatch",
      `A ${state.condition} character's Aura nodes must be ${expectedNodes}.`,
      expectedNodes,
      state.nodes,
    ));
  }

  if (state.condition === "awakened") {
    if (state.currentAwakeningId === null || state.currentMethod === null) {
      errors.push(developerError(
        "nen.awakening.current.missing",
        "An awakened character must record which awakening they are in.",
        "a currentAwakeningId and a currentMethod",
        describe(state.currentAwakeningId),
      ));
    }
  } else if (
    state.currentAwakeningId !== null || state.currentMethod !== null
  ) {
    errors.push(developerError(
      "nen.awakening.current.unexpected",
      `A ${state.condition} character is not inside an awakening.`,
      "null currentAwakeningId and currentMethod",
      describe(state.currentAwakeningId ?? state.currentMethod),
    ));
  }

  if (
    state.currentAwakeningId !== null &&
    !recordIds.has(state.currentAwakeningId)
  ) {
    errors.push(developerError(
      "nen.awakening.current.unrecorded",
      "The current awakening is not present in the history.",
      "an awakening record with this id",
      state.currentAwakeningId,
    ));
  }

  /*
   * A `reverted` character must have something to have reverted FROM, and an
   * `unawakened` one must not have a history saying otherwise. Both are the
   * same mistake in opposite directions: a condition that contradicts the
   * record it is supposed to summarise.
   */
  if (state.condition === "reverted" && records.length === 0) {
    errors.push(developerError(
      "nen.awakening.reverted.without-history",
      "A reverted character must have an awakening in their history.",
      "at least one awakening record",
      "none",
    ));
  }

  if (state.condition === "unawakened" && records.length > 0) {
    errors.push(developerError(
      "nen.awakening.unawakened.with-history",
      "A character who has awakened is reverted, not unawakened.",
      "reverted",
      "unawakened",
    ));
  }

  /*
   * A natural Ability is defined by its provenance, so provenance that names
   * nothing is not a natural Ability at all — it is an external one with a
   * misleading field, and reversion would delete it on that basis.
   */
  const natural = state.naturalAbility;

  if (natural !== null && !recordIds.has(natural.grantedByAwakeningId)) {
    errors.push(developerError(
      "nen.awakening.natural-ability.unrecorded",
      "A natural Nen Ability names an awakening that is not in the history.",
      "an awakening record with this id",
      natural.grantedByAwakeningId,
    ));
  }

  if (natural !== null && !hasEverAwakened(state)) {
    errors.push(developerError(
      "nen.awakening.natural-ability.before-awakening",
      "A natural Nen Ability cannot exist before any awakening.",
      "an awakened or reverted character",
      state.condition,
    ));
  }

  /*
   * The same Ability cannot be both natural and external. It would survive
   * reversion through one entry and be deleted through the other, and which
   * happened would depend on the order the two lists were read in.
   */
  if (natural !== null) {
    const clash = state.externalAbilities.find(
      (external) => external.abilityId === natural.abilityId,
    );

    if (clash !== undefined) {
      errors.push(developerError(
        "nen.awakening.ability.duplicate",
        "An Ability is recorded as both natural and external.",
        "one provenance per Ability",
        natural.abilityId,
      ));
    }
  }

  const suppressionIds = new Set<string>();

  for (const held of state.suppression) {
    if (suppressionIds.has(held.id)) {
      errors.push(developerError(
        "nen.awakening.suppression.duplicate",
        "Two suppression states share an id.",
        "each suppression id at most once",
        held.id,
      ));
    }

    suppressionIds.add(held.id);

    /*
     * Only an awakened or reverted character has nodes to hold shut. A
     * suppression on anybody else is a state with no cause.
     */
    if (state.condition === "unawakened") {
      errors.push(developerError(
        "nen.awakening.suppression.before-awakening",
        "An unawakened character cannot be held in Nen suppression.",
        "an awakened or reverted character",
        state.condition,
      ));
    }

    if (held.kind === "involuntary-zetsu") {
      /*
       * The recovery it names has to be the one in progress. A stale link
       * would let the release guard consult a recovery that has since been
       * replaced, and pass.
       */
      if (state.collapseRecovery?.id !== held.recoveryId) {
        errors.push(developerError(
          "nen.awakening.suppression.recovery.unrecorded",
          "An involuntary Zetsu names a collapse recovery this character is not in.",
          state.collapseRecovery?.id ?? "a collapse recovery",
          held.recoveryId,
        ));
      }

      continue;
    }

    for (const exemption of held.exemptions) {
      /*
       * An exemption naming a DIFFERENT instance is the global
       * ability-through-Zetsu exception trying to get in by the back door: it
       * would be carried by a state it was never granted against.
       */
      if (exemption.suppressionId !== held.id) {
        errors.push(developerError(
          "nen.awakening.suppression.exemption.misattached",
          "A suppression exemption names a different suppression state.",
          held.id,
          exemption.suppressionId,
        ));
      }

      if (!isSameContributionSource(exemption.source, held.source)) {
        errors.push(developerError(
          "nen.awakening.suppression.exemption.source.mismatch",
          "A suppression exemption was granted by a different source.",
          contributionSourceKey(held.source),
          contributionSourceKey(exemption.source),
        ));
      }

      /*
       * And it must name an Ability this character actually has. An exemption
       * for an Ability nobody holds is dead data at best and, the moment such
       * an Ability is granted from anywhere, a free pass nobody authorised.
       */
      const heldAbility =
        state.naturalAbility?.abilityId === exemption.abilityId ||
        state.externalAbilities.some(
          (external) => external.abilityId === exemption.abilityId,
        );

      if (!heldAbility) {
        errors.push(developerError(
          "nen.awakening.suppression.exemption.unknown-ability",
          "A suppression exemption names an Ability the character does not have.",
          "an Ability held by this character",
          exemption.abilityId,
        ));
      }
    }
  }


  /*
   * Collapse is something only an awakened character's open nodes can do to
   * them. A recovery on anybody else is a state with no cause.
   */
  if (state.collapseRecovery !== null && !hasEverAwakened(state)) {
    errors.push(developerError(
      "nen.awakening.collapse-recovery.before-awakening",
      "A collapse recovery requires a character who has awakened.",
      "an awakened or reverted character",
      state.condition,
    ));
  }

  return errors;
}


/**
 * Both passes, structural first.
 *
 * An alias over the domain pass, which already begins with the structural one
 * — kept as its own name because it is what a boundary should call, and
 * because a caller who wants only the shape check has a separate function to
 * reach for rather than a flag.
 */
export function findAwakeningStateIssues(
  state: NenAwakeningState,
): readonly EngineError[] {
  return findAwakeningStateDomainIssues(state);
}
