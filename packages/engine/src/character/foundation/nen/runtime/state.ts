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
import { GAME_MILLISECONDS_PER_SECOND } from "../../../../time/duration";
import type { GameTimestamp } from "../../../../time/types";

import {
  NEN_ACTIVITY_CONDITIONS,
  NEN_ACTIVITY_RELATIONS,
  NEN_ACTIVITY_STOP_CAUSES,
  type NenActivity,
  type NenActivityCondition,
  type NenActivityDefinition,
  type NenActivityProgress,
  type NenActivityRuntime,
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
 * How far past the declared duration a stored exertion may sit before it is
 * a contradiction rather than a rounding residual.
 */
const EXERTION_TOLERANCE_SECONDS = 1e-6;


/** Exertion accrued per second of running. Absent means every second counts. */
export function nenActivityExertionLoad(activity: NenActivity): number {
  return activity.requested.exertionLoad ?? 1;
}


/**
 * The activity's exertion, settled to an instant.
 *
 * An ACTIVE activity accrues at its load from the progress it carries; a
 * stopped one accrued nothing after it stopped, so its progress is returned as
 * stored. Absent progress normalises to none as of `startedAt`, which is what
 * an activity that predates the field genuinely has.
 *
 * Pure and total over a well-formed activity. Settling to an instant before
 * the stored one is a caller error the transitions refuse first; here it
 * accrues nothing rather than subtracting.
 */
export function nenActivityProgressAt(
  activity: NenActivity,
  at: GameTimestamp,
): NenActivityProgress {
  const stored = activity.progress ?? {
    exertionSeconds: 0,
    resolvedAt: activity.startedAt,
  };

  if (activity.condition !== "active" || at <= stored.resolvedAt) {
    return stored;
  }

  const elapsedSeconds =
    (at - stored.resolvedAt) / GAME_MILLISECONDS_PER_SECOND;

  return {
    exertionSeconds:
      stored.exertionSeconds + nenActivityExertionLoad(activity) * elapsedSeconds,
    resolvedAt: at,
  };
}


/**
 * The exact instant a running activity's exertion reaches its duration.
 *
 * `null` for an activity with no declared duration, and for one that is not
 * running. The ONE producer of the expiry instant: the lifecycle advance stops
 * an activity here, and the character-time coordinator hands the same instant
 * to the Aura time solver as a boundary, so the two cannot disagree about when
 * something ran out.
 *
 *   expiresAt = resolvedAt + (duration - exertion) / load   (seconds -> ms)
 */
export function nenActivityExpiryAt(
  activity: NenActivity,
): GameTimestamp | null {
  if (activity.condition !== "active") return null;

  const duration = activity.requested.durationSeconds;

  if (duration === undefined) return null;

  const progress = activity.progress ?? {
    exertionSeconds: 0,
    resolvedAt: activity.startedAt,
  };

  const remainingSeconds =
    Math.max(0, duration - progress.exertionSeconds) /
    nenActivityExertionLoad(activity);

  return progress.resolvedAt + remainingSeconds * GAME_MILLISECONDS_PER_SECOND;
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

  const duration = requested.durationSeconds;

  if (
    duration !== undefined &&
    (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0)
  ) {
    errors.push({
      code: "nen.activity.configuration.invalid",
      message: "A declared duration must be a finite positive number.",
      audience: "developer",
      required: "finite number > 0",
      actual: describeDiagnosticValue(duration),
    });
  }

  const load = requested.exertionLoad;

  if (
    load !== undefined &&
    (typeof load !== "number" || !Number.isFinite(load) || load <= 0 || load > 1)
  ) {
    errors.push({
      code: "nen.activity.configuration.invalid",
      message: "An exertion load must be a finite number in (0, 1].",
      audience: "developer",
      required: "finite number > 0 and <= 1",
      actual: describeDiagnosticValue(load),
    });
  }

  return errors;
}


/*
 * Everything wrong with an activity's stored exertion.
 *
 * Refused rather than repaired: negative or non-finite exertion, progress
 * dated before the activity's current interval began or after it ended, or
 * more exertion than the duration allows.
 *
 * Deliberately NOT compared against wall-clock time since `startedAt`: a
 * resumed activity starts a new interval and keeps the exertion it had already
 * spent, which is exactly what stops a suspension from refilling endurance.
 */
function findProgressIssues(
  activity: NenActivity,
  at: string,
): readonly EngineError[] {
  const progress = activity.progress;

  if (progress === undefined) return [];

  if (progress === null || typeof progress !== "object") {
    return [{
      code: "nen.activity.progress.invalid",
      message: `${at} carries malformed exertion progress.`,
      audience: "developer",
      required: "{ exertionSeconds, resolvedAt }",
      actual: describeDiagnosticValue(progress),
    }];
  }

  const { exertionSeconds, resolvedAt } = progress;

  if (
    typeof exertionSeconds !== "number" ||
    !Number.isFinite(exertionSeconds) ||
    exertionSeconds < 0 ||
    typeof resolvedAt !== "number" ||
    !Number.isFinite(resolvedAt)
  ) {
    return [{
      code: "nen.activity.progress.invalid",
      message:
        `${at} must record a finite non-negative exertion at a finite timestamp.`,
      audience: "developer",
      required: "exertionSeconds >= 0, finite resolvedAt",
      actual: describeDiagnosticValue(exertionSeconds),
    }];
  }

  const errors: EngineError[] = [];

  if (Number.isFinite(activity.startedAt) && resolvedAt < activity.startedAt) {
    errors.push({
      code: "nen.activity.progress.contradictory",
      message: `${at} records exertion as of a moment before it started.`,
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
      message: `${at} records exertion as of a moment after it ended.`,
      audience: "developer",
      required: `resolvedAt <= ${activity.endedAt}`,
      actual: resolvedAt,
    });
  }

  const duration = activity.requested?.durationSeconds;

  if (
    typeof duration === "number" &&
    Number.isFinite(duration) &&
    exertionSeconds > duration + EXERTION_TOLERANCE_SECONDS
  ) {
    errors.push({
      code: "nen.activity.progress.contradictory",
      message: `${at} records more exertion than its duration permits.`,
      audience: "developer",
      required: `exertionSeconds <= ${duration}`,
      actual: exertionSeconds,
    });
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
     * runtime is the instant everything in it is described at.
     */
    const resolvedAt = activity?.progress?.resolvedAt;

    if (
      typeof resolvedAt === "number" &&
      Number.isFinite(resolvedAt) &&
      Number.isFinite(runtime.at) &&
      resolvedAt > runtime.at
    ) {
      errors.push({
        code: "nen.activity.progress.future",
        message:
          `activity ${String(activity.id)} records exertion after the instant its runtime is described at.`,
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
