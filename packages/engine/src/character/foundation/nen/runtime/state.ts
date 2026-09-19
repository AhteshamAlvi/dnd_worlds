/*
 * Reading and checking active-Nen runtime state.
 *
 * Queries and structural validation only. Every function here is pure and
 * total: it answers a question about a runtime it was handed, or reports what
 * is wrong with one. Nothing in this file produces a new state — transitions
 * do that, and they live above Foundation because they need the Aura funding
 * outcome and the suppression rules to decide anything.
 *
 * The validation exists because this state crosses a boundary. Scene state is
 * assembled by a host, survives a save, and is handed back; an activity with a
 * `startedAt` after its `endedAt`, two activities sharing an id, or a
 * `suspended` condition with no stop record are all shapes the type system
 * cannot refuse at runtime and every transition below would then have to
 * guess about.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../../../infrastructure/diagnostics";
import { isJsonValue } from "../../../../infrastructure/json";
import { GAME_MILLISECONDS_PER_SECOND } from "../../../../time/duration";
import type { GameTimestamp } from "../../../../time/types";

import {
  NEN_ACTIVITY_CONDITIONS,
  NEN_ACTIVITY_CONSTRAINT_KINDS,
  NEN_ACTIVITY_RELATIONS,
  NEN_ACTIVITY_STOP_CAUSES,
  type NenActivity,
  type NenActivityCondition,
  type NenActivityConstraintKind,
  NEN_ACTIVITY_MAX_CLOCK_LOAD,
  type NenActivityClock,
  type NenActivityClockProgress,
  type NenActivityConfiguration,
  type NenActivityDefinition,
  type NenActivityRuntime,
  type NenSuppressionPolicy,
} from "./types";


/** A runtime with nothing running. The starting point for a scene. */
export function emptyNenActivityRuntime(
  owner: string,
  at: GameTimestamp = 0,
): NenActivityRuntime {
  return { owner, at, activities: [] };
}


export function isNenActivityCondition(
  value: unknown,
): value is NenActivityCondition {
  return typeof value === "string" &&
    (NEN_ACTIVITY_CONDITIONS as readonly string[]).includes(value);
}


/** Only the activities actually running. */
export function activeNenActivities(
  runtime: NenActivityRuntime,
): readonly NenActivity[] {
  return runtime.activities.filter((one) => one.condition === "active");
}


/** One activity by id, or `undefined`. Never throws on a missing one. */
export function findNenActivity(
  runtime: NenActivityRuntime,
  activityId: string,
): NenActivity | undefined {
  return runtime.activities.find((one) => one.id === activityId);
}


/**
 * Output committed by everything currently running.
 *
 * Active only. A suspended activity has released its commitment — that is what
 * stopping means for Output — so counting it would reserve capacity for
 * something that is not holding any, and the character would be unable to
 * spend Output they actually have.
 */
export function committedNenOutput(runtime: NenActivityRuntime): number {
  return activeNenActivities(runtime).reduce(
    (total, one) => total + one.funding.committed,
    0,
  );
}


/**
 * Whether an activity was running across a given instant.
 *
 * Half-open `[startedAt, endedAt)`, which is what stops one instant belonging
 * to both the activity that ended there and the one that began there — and
 * therefore what stops a single advance charging two upkeeps for one moment.
 */
export function wasNenActivityRunningAt(
  activity: NenActivity,
  at: GameTimestamp,
): boolean {
  if (at < activity.startedAt) return false;

  return activity.endedAt === null || at < activity.endedAt;
}


/* ── Exertion ───────────────────────────────────────────────────────────── */

/*
 * How far past a declared capacity a stored figure may sit before it is a
 * contradiction rather than a rounding residual.
 */
const EXERTION_TOLERANCE_SECONDS = 1e-6;


/** Every endurance dimension an activity declares. Absent reads as none. */
export function nenActivityClocks(
  activity: NenActivity,
): readonly NenActivityClock[] {
  return activity.requested.clocks ?? [];
}


/** One named clock's declaration, if the activity has it. */
export function nenActivityClock(
  activity: NenActivity,
  clockId: string,
): NenActivityClock | undefined {
  return nenActivityClocks(activity).find((one) => one.id === clockId);
}


/*
 * What one clock has spent as of an instant.
 *
 * Progress is matched BY ID and is sparse: a clock with no stored entry has
 * spent nothing as of `startedAt`. An entry whose clock the configuration no
 * longer declares still reads back — that is what stops an adjustment which
 * drops a dimension and later restores it from refilling it.
 */
function storedProgressFor(
  activity: NenActivity,
  clockId: string,
): NenActivityClockProgress {
  const stored = (activity.progress ?? []).find(
    (one) => one.clockId === clockId,
  );

  return stored ?? {
    clockId,
    fullLoadEquivalentSeconds: 0,
    resolvedAt: activity.startedAt,
  };
}


/**
 * One clock's progress, settled to an instant.
 *
 * An ACTIVE activity accrues at that clock's load from the progress it
 * carries; a stopped one accrued nothing after it stopped, so its progress is
 * returned as stored.
 *
 * Pure and total over a well-formed activity. Settling to an instant before
 * the stored one is a caller error the transitions refuse first; here it
 * accrues nothing rather than subtracting.
 */
export function nenActivityClockProgressAt(
  activity: NenActivity,
  clockId: string,
  at: GameTimestamp,
): NenActivityClockProgress {
  const stored = storedProgressFor(activity, clockId);
  const clock = nenActivityClock(activity, clockId);

  if (
    activity.condition !== "active" || clock === undefined ||
    at <= stored.resolvedAt
  ) {
    return stored;
  }

  const elapsedSeconds =
    (at - stored.resolvedAt) / GAME_MILLISECONDS_PER_SECOND;

  return {
    clockId,
    fullLoadEquivalentSeconds:
      stored.fullLoadEquivalentSeconds + clock.load * elapsedSeconds,
    resolvedAt: at,
  };
}


/**
 * Every clock's progress, settled to an instant.
 *
 * The whole progress record an adjustment or a stop stores. Clocks the
 * activity no longer declares are carried through untouched rather than
 * dropped, so nothing an adjustment removes comes back refilled.
 */
export function nenActivityProgressAt(
  activity: NenActivity,
  at: GameTimestamp,
): readonly NenActivityClockProgress[] {
  const declared = nenActivityClocks(activity).map((clock) =>
    nenActivityClockProgressAt(activity, clock.id, at)
  );

  const covered = new Set(declared.map((one) => one.clockId));

  const orphaned = (activity.progress ?? []).filter(
    (one) => !covered.has(one.clockId),
  );

  return [...declared, ...orphaned];
}


/*
 * The exact instant one clock exhausts, and which it is.
 *
 * `null` for a clock with no declared capacity and for an activity that is not
 * running.
 *
 *   exhaustsAt = resolvedAt + (capacity - spent) / load   (seconds -> ms)
 */
function clockExpiry(
  activity: NenActivity,
  clock: NenActivityClock,
): GameTimestamp | null {
  if (clock.fullLoadDurationSeconds === undefined) return null;

  const progress = storedProgressFor(activity, clock.id);

  const remainingSeconds =
    Math.max(
      0,
      clock.fullLoadDurationSeconds - progress.fullLoadEquivalentSeconds,
    ) / clock.load;

  return progress.resolvedAt + remainingSeconds * GAME_MILLISECONDS_PER_SECOND;
}


/**
 * The exact instant a running activity runs out, and on WHICH clock.
 *
 * The earliest exhausting clock wins, because an activity that has run out of
 * any one of its dimensions has run out. Ties are broken by clock id so that
 * two hosts holding the clocks in different orders report the same cause.
 *
 * The ONE producer of the expiry instant: the lifecycle advance stops an
 * activity here, and the character-time coordinator hands the same instant to
 * the Aura time solver as a boundary, so the two cannot disagree about when
 * something ran out.
 */
export function nenActivityExpiry(
  activity: NenActivity,
): { readonly at: GameTimestamp; readonly clockId: string } | null {
  if (activity.condition !== "active") return null;

  let earliest: { readonly at: GameTimestamp; readonly clockId: string } | null =
    null;

  for (const clock of nenActivityClocks(activity)) {
    const at = clockExpiry(activity, clock);

    if (at === null) continue;

    if (
      earliest === null || at < earliest.at ||
      (at === earliest.at && clock.id.localeCompare(earliest.clockId) < 0)
    ) {
      earliest = { at, clockId: clock.id };
    }
  }

  return earliest;
}


/** The instant a running activity runs out, without saying on which clock. */
export function nenActivityExpiryAt(
  activity: NenActivity,
): GameTimestamp | null {
  return nenActivityExpiry(activity)?.at ?? null;
}


/*
 * The order activities are resolved and given up in.
 *
 * Priority descending, then id ascending. The id is a TIE-BREAK so that two
 * hosts holding the same activities in different array orders resolve them
 * identically; it never outranks a stated priority, and array order is
 * consulted at no point. Exactly the rule Aura's commitment settlement uses,
 * because these are the same commitments seen from the other side.
 */
export function orderNenActivities(
  activities: readonly NenActivity[],
): readonly NenActivity[] {
  return [...activities].sort((left, right) => {
    const byPriority = right.priority - left.priority;

    return byPriority !== 0 ? byPriority : left.id.localeCompare(right.id);
  });
}


function isSourceRef(value: unknown): boolean {
  const ref = value as { readonly type?: unknown; readonly id?: unknown };

  return ref !== null && typeof ref === "object" &&
    typeof ref.type === "string" && ref.type.length > 0 &&
    typeof ref.id === "string" && ref.id.length > 0;
}


/**
 * Everything structurally wrong with one activity.
 *
 * Reported rather than thrown, and reported in full rather than at the first
 * problem, so a host fixing a malformed save is told about all of it at once.
 */
export function findNenActivityIssues(
  activity: NenActivity,
  owner: string,
): readonly EngineError[] {
  const errors: EngineError[] = [];
  const at = `activity ${String(activity?.id)}`;

  if (activity === null || typeof activity !== "object") {
    return [{
      code: "nen.activity.malformed",
      message: "A Nen activity must be an object.",
      audience: "developer",
      required: "NenActivity",
      actual: describeDiagnosticValue(activity),
    }];
  }

  if (typeof activity.id !== "string" || activity.id.trim().length === 0) {
    errors.push({
      code: "nen.activity.id.invalid",
      message: "Every Nen activity needs a non-empty id.",
      audience: "developer",
      required: "non-empty string",
      actual: describeDiagnosticValue(activity.id),
    });
  }

  /*
   * The owner is checked against the RUNTIME's, not merely for presence. An
   * activity carrying somebody else's owner inside one character's runtime is
   * how a technique gets driven by the wrong sheet, and it is the exact defect
   * the Aura handler had before contexts became owner-keyed.
   */
  if (activity.owner !== owner) {
    errors.push({
      code: "nen.activity.owner.mismatched",
      message: `${at} belongs to a different owner than the runtime holding it.`,
      audience: "developer",
      required: owner,
      actual: describeDiagnosticValue(activity.owner),
    });
  }

  if (
    typeof activity.definitionId !== "string" ||
    activity.definitionId.trim().length === 0
  ) {
    errors.push({
      code: "nen.activity.definition.invalid",
      message: `${at} must name the authored definition it instantiates.`,
      audience: "developer",
      required: "non-empty string",
      actual: describeDiagnosticValue(activity.definitionId),
    });
  }

  if (!isSourceRef(activity.source)) {
    errors.push({
      code: "nen.activity.source.invalid",
      message: `${at} must name what asked for it.`,
      audience: "developer",
      required: "{ type, id }",
      actual: describeDiagnosticValue(activity.source),
    });
  }

  if (!isNenActivityCondition(activity.condition)) {
    errors.push({
      code: "nen.activity.condition.invalid",
      message: `${at} must be in a known lifecycle condition.`,
      audience: "developer",
      required: NEN_ACTIVITY_CONDITIONS.join(" | "),
      actual: describeDiagnosticValue(activity.condition),
    });
  }

  if (!Number.isFinite(activity.priority)) {
    errors.push({
      code: "nen.activity.priority.invalid",
      message: `${at} must carry a finite priority.`,
      audience: "developer",
      required: "finite number",
      actual: describeDiagnosticValue(activity.priority),
    });
  }

  if (!Number.isFinite(activity.startedAt)) {
    errors.push({
      code: "nen.activity.time.invalid",
      message: `${at} must have started at a finite game timestamp.`,
      audience: "developer",
      required: "finite GameTimestamp",
      actual: describeDiagnosticValue(activity.startedAt),
    });
  }

  if (activity.endedAt !== null) {
    if (!Number.isFinite(activity.endedAt)) {
      errors.push({
        code: "nen.activity.time.invalid",
        message: `${at} must end at a finite game timestamp or not at all.`,
        audience: "developer",
        required: "finite GameTimestamp | null",
        actual: describeDiagnosticValue(activity.endedAt),
      });
    } else if (activity.endedAt < activity.startedAt) {
      /*
       * A negative interval is not a short activity, it is a corrupt record —
       * and `wasRunningAt` would answer false for every instant, which reads
       * exactly like an activity that never happened.
       */
      errors.push({
        code: "nen.activity.interval.reversed",
        message: `${at} ends before it starts.`,
        audience: "developer",
        required: `endedAt >= ${activity.startedAt}`,
        actual: activity.endedAt,
      });
    }
  }

  /*
   * Condition and stop record must agree.
   *
   * These are two fields describing one fact, which is the price of separating
   * condition from cause — so the invariant that keeps them honest is checked
   * rather than assumed. A `suspended` activity with no stop cannot say what it
   * is waiting for or who may resume it; an `active` one carrying a stop is
   * reporting itself both running and stopped.
   */
  if (activity.condition === "active") {
    if (activity.stop !== null) {
      errors.push({
        code: "nen.activity.stop.contradictory",
        message: `${at} is active but carries a stop record.`,
        audience: "developer",
        required: "stop === null while active",
        actual: describeDiagnosticValue(activity.stop?.cause),
      });
    }

    if (activity.endedAt !== null) {
      errors.push({
        code: "nen.activity.stop.contradictory",
        message: `${at} is active but has already ended.`,
        audience: "developer",
        required: "endedAt === null while active",
        actual: activity.endedAt,
      });
    }
  } else {
    if (activity.stop === null || typeof activity.stop !== "object") {
      errors.push({
        code: "nen.activity.stop.missing",
        message:
          `${at} is not active and must record why, when and by whom it stopped.`,
        audience: "developer",
        required: "a NenActivityStop",
        actual: "absent",
      });
    } else {
      if (
        !(NEN_ACTIVITY_STOP_CAUSES as readonly string[])
          .includes(activity.stop.cause)
      ) {
        errors.push({
          code: "nen.activity.stop.cause.invalid",
          message: `${at} stopped for an unknown reason.`,
          audience: "developer",
          required: NEN_ACTIVITY_STOP_CAUSES.join(" | "),
          actual: describeDiagnosticValue(activity.stop.cause),
        });
      }

      if (!isSourceRef(activity.stop.by)) {
        errors.push({
          code: "nen.activity.stop.authority.invalid",
          message: `${at} must record who or what stopped it.`,
          audience: "developer",
          required: "{ type, id }",
          actual: describeDiagnosticValue(activity.stop.by),
        });
      }

      /*
       * Only a SUSPENDED activity may carry resume permission. An `ended` one
       * that carried a grant would be resumable in fact while reading as
       * finished, and the two conditions would stop meaning anything.
       */
      if (activity.condition === "ended" && activity.stop.resume !== null) {
        errors.push({
          code: "nen.activity.stop.contradictory",
          message: `${at} has ended but carries permission to resume.`,
          audience: "developer",
          required: "resume === null once ended",
          actual: "a resume permission",
        });
      }

      if (activity.condition === "suspended" && activity.stop.resume === null) {
        errors.push({
          code: "nen.activity.stop.contradictory",
          message:
            `${at} is suspended but nothing may resume it, which is the ` +
            "definition of ended.",
          audience: "developer",
          required: "a resume permission",
          actual: "absent",
        });
      }
    }
  }

  const requested = activity.requested;

  if (requested === null || typeof requested !== "object") {
    errors.push({
      code: "nen.activity.configuration.invalid",
      message: `${at} must record the configuration it asked for.`,
      audience: "developer",
      required: "NenActivityConfiguration",
      actual: describeDiagnosticValue(requested),
    });
  } else {
    errors.push(...findNenActivityConfigurationIssues(requested, at));
  }

  errors.push(...findProgressIssues(activity, at));

  errors.push(...findRevokedKindIssues(activity.revokes, at));
  errors.push(...findSuppressionDeclarationIssues(activity, at));

  if (
    !Number.isFinite(activity.funding?.committed) ||
    activity.funding.committed < 0
  ) {
    errors.push({
      code: "nen.activity.funding.invalid",
      message: `${at} must record a finite non-negative committed Output.`,
      audience: "developer",
      required: "finite number >= 0",
      actual: describeDiagnosticValue(activity.funding?.committed),
    });
  }

  return errors;
}


/**
 * Everything wrong with a requested configuration's numbers.
 *
 * Shared by the stored-activity validator and by every transition that
 * accepts a new configuration, so a shape one refuses cannot be written by the
 * other.
 */
/*
 * Everything wrong with an activity's declared clocks.
 *
 * Ids must be unique because progress is matched by id: two clocks called
 * "output" would share one progress entry and each spend the other's
 * endurance. Capacity is optional and, when stated, strictly positive — a
 * capacity of zero is an activity that has already expired, which is a stop
 * rather than a configuration.
 */
function findClockIssues(
  clocks: NenActivityConfiguration["clocks"],
  label: string,
): readonly EngineError[] {
  if (clocks === undefined) return [];

  if (!Array.isArray(clocks)) {
    return [{
      code: "nen.activity.clock.invalid",
      message: `${label} must declare its endurance clocks as a list.`,
      audience: "developer",
      required: "NenActivityClock[]",
      actual: describeDiagnosticValue(clocks),
    }];
  }

  const errors: EngineError[] = [];
  const seen = new Set<string>();

  for (const clock of clocks) {
    if (clock === null || typeof clock !== "object") {
      errors.push({
        code: "nen.activity.clock.invalid",
        message: `${label} declares a malformed endurance clock.`,
        audience: "developer",
        required: "{ id, load, fullLoadDurationSeconds? }",
        actual: describeDiagnosticValue(clock),
      });

      continue;
    }

    if (typeof clock.id !== "string" || clock.id.trim().length === 0) {
      errors.push({
        code: "nen.activity.clock.id.invalid",
        message: `${label} declares an endurance clock with no id.`,
        audience: "developer",
        required: "non-empty string",
        actual: describeDiagnosticValue(clock.id),
      });
    } else if (seen.has(clock.id)) {
      errors.push({
        code: "nen.activity.clock.id.duplicate",
        message:
          `${label} declares two endurance clocks called "${clock.id}"; ` +
          "progress is matched by id, so they would spend each other.",
        audience: "developer",
        required: "distinct clock ids",
        actual: clock.id,
      });
    } else {
      seen.add(clock.id);
    }

    if (
      typeof clock.load !== "number" || !Number.isFinite(clock.load) ||
      clock.load <= 0 || clock.load > NEN_ACTIVITY_MAX_CLOCK_LOAD
    ) {
      errors.push({
        code: "nen.activity.clock.load.invalid",
        message:
          `${label} must give every endurance clock a load in ` +
          `(0, ${NEN_ACTIVITY_MAX_CLOCK_LOAD}].`,
        audience: "developer",
        required: `finite number > 0 and <= ${NEN_ACTIVITY_MAX_CLOCK_LOAD}`,
        actual: describeDiagnosticValue(clock.load),
      });
    }

    const capacity = clock.fullLoadDurationSeconds;

    if (
      capacity !== undefined &&
      (typeof capacity !== "number" || !Number.isFinite(capacity) ||
        capacity <= 0)
    ) {
      errors.push({
        code: "nen.activity.clock.duration.invalid",
        message:
          `${label} must give a stated clock capacity as a finite positive ` +
          "number of full-load-equivalent seconds; absent means unlimited.",
        audience: "developer",
        required: "finite number > 0, or absent",
        actual: describeDiagnosticValue(capacity),
      });
    }
  }

  return errors;
}


export function findNenActivityConfigurationIssues(
  requested: NenActivity["requested"],
  label = "a Nen activity",
): readonly EngineError[] {
  const errors: EngineError[] = [];

  const aura = requested.aura;

  if (typeof aura !== "number" || !Number.isFinite(aura) || aura < 0) {
    errors.push({
      code: "nen.activity.configuration.invalid",
      message: `${label} must request a finite non-negative amount of Aura.`,
      audience: "developer",
      required: "finite number >= 0",
      actual: describeDiagnosticValue(aura),
    });
  }

  const upkeep = requested.upkeepPerRound;

  if (
    upkeep !== undefined &&
    (typeof upkeep !== "number" || !Number.isFinite(upkeep) || upkeep < 0)
  ) {
    errors.push({
      code: "nen.activity.configuration.invalid",
      message: "An upkeep rate must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: describeDiagnosticValue(upkeep),
    });
  }

  errors.push(...findClockIssues(requested.clocks, label));

  /*
   * JSON-safe, and checked at the boundary rather than trusted.
   *
   * The runtime never reads inside a payload, which is exactly why it has to
   * check this: a `Map` or a `Date` in there type-checks as `JsonValue` from a
   * caller's `any`, survives every transition untouched, and then comes back
   * from a save file as `{}` with nothing having reported a problem.
   */
  if (requested.payload !== undefined && !isJsonValue(requested.payload)) {
    errors.push({
      code: "nen.activity.configuration.payload.invalid",
      message:
        `${label} carries activity configuration that would not survive a ` +
        "save: an opaque payload must be JSON-safe.",
      audience: "developer",
      required: "a JSON value — no functions, Maps, Dates, cycles, NaN or undefined",
      actual: describeDiagnosticValue(requested.payload),
    });
  }

  return errors;
}


/*
 * Everything wrong with an activity's stored clock progress.
 *
 * Refused rather than repaired: negative or non-finite figures, progress dated
 * before the activity's current interval began or after it ended, two entries
 * for one clock, or more spent on a clock than its capacity allows.
 *
 * An entry naming a clock the configuration does not declare is NOT an error.
 * That is the shape an adjustment leaves behind when it drops a dimension, and
 * keeping it is what stops the dimension coming back refilled if it returns.
 *
 * Deliberately NOT compared against wall-clock time since `startedAt`: a
 * resumed activity starts a new interval and keeps what it had already spent,
 * which is exactly what stops a suspension from refilling endurance.
 */
function findProgressIssues(
  activity: NenActivity,
  at: string,
): readonly EngineError[] {
  const progress = activity.progress;

  if (progress === undefined) return [];

  if (!Array.isArray(progress)) {
    return [{
      code: "nen.activity.progress.invalid",
      message: `${at} carries malformed clock progress.`,
      audience: "developer",
      required: "NenActivityClockProgress[]",
      actual: describeDiagnosticValue(progress),
    }];
  }

  const errors: EngineError[] = [];
  const seen = new Set<string>();

  for (const entry of progress) {
    if (entry === null || typeof entry !== "object") {
      errors.push({
        code: "nen.activity.progress.invalid",
        message: `${at} carries a malformed clock progress entry.`,
        audience: "developer",
        required: "{ clockId, fullLoadEquivalentSeconds, resolvedAt }",
        actual: describeDiagnosticValue(entry),
      });

      continue;
    }

    const { clockId, fullLoadEquivalentSeconds, resolvedAt } = entry;

    if (typeof clockId !== "string" || clockId.trim().length === 0) {
      errors.push({
        code: "nen.activity.progress.invalid",
        message: `${at} records progress against an unnamed clock.`,
        audience: "developer",
        required: "non-empty clockId",
        actual: describeDiagnosticValue(clockId),
      });

      continue;
    }

    if (seen.has(clockId)) {
      errors.push({
        code: "nen.activity.progress.duplicate",
        message:
          `${at} records the clock "${clockId}" twice; one clock has one ` +
          "figure.",
        audience: "developer",
        required: "one entry per clock",
        actual: clockId,
      });
    }

    seen.add(clockId);

    if (
      typeof fullLoadEquivalentSeconds !== "number" ||
      !Number.isFinite(fullLoadEquivalentSeconds) ||
      fullLoadEquivalentSeconds < 0 ||
      typeof resolvedAt !== "number" ||
      !Number.isFinite(resolvedAt)
    ) {
      errors.push({
        code: "nen.activity.progress.invalid",
        message:
          `${at} must record a finite non-negative figure for "${clockId}" ` +
          "at a finite timestamp.",
        audience: "developer",
        required: "fullLoadEquivalentSeconds >= 0, finite resolvedAt",
        actual: describeDiagnosticValue(fullLoadEquivalentSeconds),
      });

      continue;
    }

    if (Number.isFinite(activity.startedAt) && resolvedAt < activity.startedAt) {
      errors.push({
        code: "nen.activity.progress.contradictory",
        message:
          `${at} records "${clockId}" as of a moment before it started.`,
        audience: "developer",
        required: `resolvedAt >= ${activity.startedAt}`,
        actual: resolvedAt,
      });
    }

    if (
      activity.endedAt !== null &&
      Number.isFinite(activity.endedAt) &&
      resolvedAt > activity.endedAt
    ) {
      errors.push({
        code: "nen.activity.progress.contradictory",
        message: `${at} records "${clockId}" as of a moment after it ended.`,
        audience: "developer",
        required: `resolvedAt <= ${activity.endedAt}`,
        actual: resolvedAt,
      });
    }

    const capacity = nenActivityClock(activity, clockId)?.fullLoadDurationSeconds;

    if (
      typeof capacity === "number" && Number.isFinite(capacity) &&
      fullLoadEquivalentSeconds > capacity + EXERTION_TOLERANCE_SECONDS
    ) {
      errors.push({
        code: "nen.activity.progress.contradictory",
        message:
          `${at} records more spent on "${clockId}" than its capacity permits.`,
        audience: "developer",
        required: `fullLoadEquivalentSeconds <= ${capacity}`,
        actual: fullLoadEquivalentSeconds,
      });
    }
  }

  return errors;
}


/** Everything structurally wrong with a whole runtime. */
export function findNenActivityRuntimeIssues(
  runtime: NenActivityRuntime,
): readonly EngineError[] {
  if (runtime === null || typeof runtime !== "object") {
    return [{
      code: "nen.activity.runtime.malformed",
      message: "A Nen activity runtime must be an object.",
      audience: "developer",
      required: "NenActivityRuntime",
      actual: describeDiagnosticValue(runtime),
    }];
  }

  const errors: EngineError[] = [];

  if (typeof runtime.owner !== "string" || runtime.owner.trim().length === 0) {
    errors.push({
      code: "nen.activity.runtime.owner.invalid",
      message: "A Nen activity runtime must name its owner.",
      audience: "developer",
      required: "non-empty string",
      actual: describeDiagnosticValue(runtime.owner),
    });
  }

  if (!Number.isFinite(runtime.at)) {
    errors.push({
      code: "nen.activity.runtime.time.invalid",
      message: "A Nen activity runtime must be dated at a finite timestamp.",
      audience: "developer",
      required: "finite GameTimestamp",
      actual: describeDiagnosticValue(runtime.at),
    });
  }

  if (!Array.isArray(runtime.activities)) {
    errors.push({
      code: "nen.activity.runtime.malformed",
      message: "A Nen activity runtime must carry a list of activities.",
      audience: "developer",
      required: "an array",
      actual: describeDiagnosticValue(runtime.activities),
    });

    return errors;
  }

  const seen = new Set<string>();

  for (const activity of runtime.activities) {
    errors.push(...findNenActivityIssues(activity, runtime.owner));

    /*
     * Progress dated after the runtime itself is exertion from the future: the
     * runtime is the instant everything in it is described at. Checked on
     * EVERY clock — one dimension settled past the runtime is as impossible as
     * all of them.
     */
    for (const entry of activity?.progress ?? []) {
      const resolvedAt = entry?.resolvedAt;

      if (
        typeof resolvedAt !== "number" || !Number.isFinite(resolvedAt) ||
        !Number.isFinite(runtime.at) || resolvedAt <= runtime.at
      ) {
        continue;
      }

      errors.push({
        code: "nen.activity.progress.future",
        message:
          `activity ${String(activity.id)} records "${String(entry.clockId)}" ` +
          "after the instant its runtime is described at.",
        audience: "developer",
        required: `resolvedAt <= ${runtime.at}`,
        actual: resolvedAt,
      });
    }

    if (typeof activity?.id !== "string") continue;

    /*
     * Duplicate ids make every transition ambiguous: cancelling "ren-1" when
     * two of them exist has no single right answer, and whichever the engine
     * picked would look correct from outside.
     */
    if (seen.has(activity.id)) {
      errors.push({
        code: "nen.activity.id.duplicate",
        message: `More than one Nen activity uses the id "${activity.id}".`,
        audience: "developer",
        required: "unique activity ids within a runtime",
        actual: activity.id,
      });
    }

    seen.add(activity.id);
  }

  errors.push(...findRevokedConstraintContradictions(runtime.activities));

  return errors;
}


/*
 * The two suppression declarations, on a definition or a stored activity.
 *
 * Booleans when present, and never an authorization that contradicts a
 * `deliberate-access` constraint: suppression closes deliberate access by
 * definition, so the pair describes an activity that stops the instant it is
 * allowed to continue.
 */
function findSuppressionDeclarationIssues(
  declared: Pick<
    NenActivityDefinition,
    "functionsThroughSuppression" | "imposesSuppression" | "constraints"
  >,
  at: string,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  for (const [name, value] of [
    ["functionsThroughSuppression", declared.functionsThroughSuppression],
    ["imposesSuppression", declared.imposesSuppression],
  ] as const) {
    if (value === undefined || typeof value === "boolean") continue;

    errors.push({
      code: "nen.activity.suppression_declaration.invalid",
      message: `${at}'s ${name} must be a boolean when supplied.`,
      audience: "developer",
      required: "boolean",
      actual: describeDiagnosticValue(value),
    });
  }

  if (
    declared.functionsThroughSuppression === true &&
    Array.isArray(declared.constraints) &&
    declared.constraints.some((one) => one?.kind === "deliberate-access")
  ) {
    errors.push({
      code: "nen.activity.suppression_declaration.contradictory",
      message:
        `${at} cannot function through suppression while requiring deliberate access.`,
      audience: "developer",
      required: "no deliberate-access constraint",
      actual: "functionsThroughSuppression with deliberate-access",
    });
  }

  return errors;
}


/**
 * Whether an activity may keep operating under a suppression.
 *
 * Only by EXPLICIT authorization, and only under a suppression whose policy
 * permits authorized activities. The activity's constraints are not consulted:
 * lacking `deliberate-access` authorizes nothing.
 */
export function nenActivityPermittedUnderSuppression(
  activity: Pick<NenActivity, "id" | "functionsThroughSuppression">,
  policy: NenSuppressionPolicy,
): boolean {
  return (
    policy.exemptions === "authorized" &&
    activity.functionsThroughSuppression === true &&
    (policy.exemptActivityIds === undefined ||
      policy.exemptActivityIds.includes(activity.id))
  );
}


/** Everything wrong with a supplied suppression policy. */
export function findNenSuppressionPolicyIssues(
  policy: NenSuppressionPolicy,
): readonly EngineError[] {
  if (
    policy === null || typeof policy !== "object" ||
    (policy.exemptions !== "authorized" && policy.exemptions !== "none")
  ) {
    return [{
      code: "nen.activity.suppression_policy.invalid",
      message: "A suppression policy must state a known exemption policy.",
      audience: "developer",
      required: "{ exemptions: authorized | none }",
      actual: describeDiagnosticValue(policy),
    }];
  }

  const ids = policy.exemptActivityIds;

  if (ids === undefined) return [];

  if (
    !Array.isArray(ids) ||
    ids.some((id) => typeof id !== "string" || id.trim().length === 0)
  ) {
    return [{
      code: "nen.activity.suppression_policy.exemptions.invalid",
      message: "A suppression instance's exempt activities must be listed by id.",
      audience: "developer",
      required: "an array of non-empty activity ids",
      actual: describeDiagnosticValue(ids),
    }];
  }

  /* An instance list on a policy permitting nothing is two answers at once. */
  if (policy.exemptions === "none" && ids.length > 0) {
    return [{
      code: "nen.activity.suppression_policy.contradictory",
      message: "A suppression permitting nothing cannot exempt activities.",
      audience: "developer",
      required: "no exempt activities under exemptions: none",
      actual: describeDiagnosticValue(ids),
    }];
  }

  return [];
}


/**
 * The instant an active activity stops on its own, if it will.
 *
 * Its declared expiry, or the earliest instant a component it is composed of
 * stops — transitively, because a composite collapses the moment it loses a
 * part. Null when nothing it depends on has an end.
 */
export function nenActivityRunsUntil(
  runtime: NenActivityRuntime,
  activity: NenActivity,
): GameTimestamp | null {
  const visiting = new Set<string>();

  const until = (one: NenActivity): GameTimestamp | null => {
    if (visiting.has(one.id)) return null;

    visiting.add(one.id);

    const ends = [nenActivityExpiryAt(one)];

    for (const constraint of one.constraints) {
      if (constraint.kind !== "component") continue;

      const component = findNenActivity(runtime, constraint.activityId);

      if (component !== undefined && component.condition === "active") {
        ends.push(until(component));
      }
    }

    visiting.delete(one.id);

    const known = ends.filter((end): end is GameTimestamp => end !== null);

    return known.length === 0 ? null : Math.min(...known);
  };

  return until(activity);
}


/** Whether any active activity in a runtime holds the Aura suppressed. */
export function nenSuppressionImposed(
  activities: readonly NenActivity[],
): boolean {
  return activities.some((one) =>
    one?.condition === "active" && one.imposesSuppression === true
  );
}


/*
 * A revoked kind list, if one is present, must name known constraint kinds.
 *
 * Shared by the stored activity and the authored definition, so one cannot
 * carry a shape the other refuses.
 */
function findRevokedKindIssues(
  revokes: unknown,
  at: string,
): readonly EngineError[] {
  if (revokes === undefined) return [];

  if (
    !Array.isArray(revokes) ||
    revokes.some((kind) =>
      !(NEN_ACTIVITY_CONSTRAINT_KINDS as readonly unknown[]).includes(kind)
    )
  ) {
    return [{
      code: "nen.activity.revokes.invalid",
      message: `${at} must revoke only known constraint kinds.`,
      audience: "developer",
      required: NEN_ACTIVITY_CONSTRAINT_KINDS.join(" | "),
      actual: describeDiagnosticValue(revokes),
    }];
  }

  return [];
}


/**
 * The constraint kinds the active activities of a runtime make unsatisfiable.
 *
 * Generic: read off each activity's own stored declaration, never off its
 * definition id.
 */
export function revokedNenConstraintKinds(
  activities: readonly NenActivity[],
): ReadonlySet<NenActivityConstraintKind> {
  const kinds = new Set<NenActivityConstraintKind>();

  for (const activity of activities) {
    if (activity?.condition !== "active") continue;
    if (!Array.isArray(activity.revokes)) continue;

    for (const kind of activity.revokes) kinds.add(kind);
  }

  return kinds;
}


/*
 * Two active activities, one carrying a kind the other revokes.
 *
 * Unreachable through the transitions, which end or refuse the carrier. A
 * host-assembled runtime can still say it, and it is two descriptions of one
 * character that cannot both be true.
 */
function findRevokedConstraintContradictions(
  activities: readonly NenActivity[],
): readonly EngineError[] {
  const errors: EngineError[] = [];

  for (const activity of activities) {
    if (activity?.condition !== "active") continue;
    if (!Array.isArray(activity.constraints)) continue;

    const others = activities.filter((one) => one !== activity);
    const revoked = revokedNenConstraintKinds(others);

    const clash = activity.constraints.find((one) => revoked.has(one?.kind));

    if (clash === undefined) continue;

    errors.push({
      code: "nen.activity.constraint.revoked",
      message:
        `activity ${describeDiagnosticValue(activity.id)} is active while ` +
        `another active activity revokes its "${clash.kind}" constraint.`,
      audience: "developer",
      required: `no active activity revoking "${clash.kind}"`,
      actual: describeDiagnosticValue(activity.id),
    });
  }

  return errors;
}


/** Everything structurally wrong with an authored declaration. */
export function findNenActivityDefinitionIssues(
  definition: NenActivityDefinition,
): readonly EngineError[] {
  if (definition === null || typeof definition !== "object") {
    return [{
      code: "nen.activity.definition.malformed",
      message: "A Nen activity definition must be an object.",
      audience: "developer",
      required: "NenActivityDefinition",
      actual: describeDiagnosticValue(definition),
    }];
  }

  const errors: EngineError[] = [];

  if (
    typeof definition.id !== "string" || definition.id.trim().length === 0
  ) {
    errors.push({
      code: "nen.activity.definition.invalid",
      message: "A Nen activity definition needs a non-empty id.",
      audience: "developer",
      required: "non-empty string",
      actual: describeDiagnosticValue(definition.id),
    });
  }

  for (const relation of definition.relations ?? []) {
    if (
      !(NEN_ACTIVITY_RELATIONS as readonly string[])
        .includes(relation?.relation)
    ) {
      errors.push({
        code: "nen.activity.relation.invalid",
        message: "A Nen activity relation must name a known relationship.",
        audience: "developer",
        required: NEN_ACTIVITY_RELATIONS.join(" | "),
        actual: describeDiagnosticValue(relation?.relation),
      });

      continue;
    }

    if (typeof relation.other !== "string" || relation.other.length === 0) {
      errors.push({
        code: "nen.activity.relation.invalid",
        message: "A Nen activity relation must name the definition it is about.",
        audience: "developer",
        required: "non-empty string",
        actual: describeDiagnosticValue(relation.other),
      });
    }

    /*
     * A conditional relation with no condition is a compatible one that looks
     * gated — the most dangerous shape available, because it reads as
     * restricted and behaves as open.
     */
    if (
      relation.relation === "conditional" &&
      (typeof relation.condition !== "string" ||
        relation.condition.trim().length === 0)
    ) {
      errors.push({
        code: "nen.activity.relation.invalid",
        message:
          "A conditional relation must name the condition it depends on.",
        audience: "developer",
        required: "non-empty condition",
        actual: describeDiagnosticValue(relation.condition),
      });
    }
  }

  errors.push(...findRevokedKindIssues(
    definition.revokes,
    `definition ${describeDiagnosticValue(definition.id)}`,
  ));

  const selfRevoked = (definition.constraints ?? []).find((one) =>
    Array.isArray(definition.revokes) &&
    definition.revokes.includes(one?.kind)
  );

  /*
   * An activity that revoked a constraint it carries would end itself the
   * instant it started, or never be allowed to.
   */
  if (selfRevoked !== undefined) {
    errors.push({
      code: "nen.activity.definition.invalid",
      message:
        "A Nen activity definition cannot revoke a constraint it carries itself.",
      audience: "developer",
      required: `no "${selfRevoked.kind}" constraint`,
      actual: selfRevoked.kind,
    });
  }

  errors.push(...findSuppressionDeclarationIssues(
    definition,
    `definition ${describeDiagnosticValue(definition.id)}`,
  ));

  /* A composite that lists no components is not composite. */
  const composite = (definition.relations ?? []).some(
    (one) => one?.relation === "composite",
  );

  if (composite && (definition.components ?? []).length === 0) {
    errors.push({
      code: "nen.activity.definition.invalid",
      message:
        "A composite Nen activity must name the components it is assembled from.",
      audience: "developer",
      required: "one or more components",
      actual: "none",
    });
  }

  return errors;
}
