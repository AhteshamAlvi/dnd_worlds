/*
 * The Aura timeline — everything a caller says happened during an interval,
 * checked before the solver touches any of it.
 *
 * The solver used to validate as it went, which meant it validated only what
 * it happened to look at. An unknown event kind fell through the dispatch and
 * became a forced drain; a pair of upkeep commitments sharing an empty id were
 * charged twice; a NaN suppression multiplier was silently ignored and a
 * different recovery rate used; an event timestamped fifty hours before the
 * interval was applied inside it anyway. None of those failed — they produced
 * confident wrong answers.
 *
 * So the whole timeline is now resolved and judged up front, and the solver
 * consumes a shape that cannot be malformed.
 *
 *
 * HALF-OPEN OWNERSHIP
 * -------------------
 *
 * An interval owns `[startedAt, endedAt)`. Caller-supplied events and activity
 * changes belong to it only inside that range, and an event ON the endpoint
 * belongs to the NEXT interval beginning there. That is not pedantry: two
 * adjacent intervals meet at one timestamp, and an inclusive rule would have
 * both apply the same strike — chained advancement would charge every boundary
 * action twice.
 *
 * Solver OUTCOMES are a different matter and may land on `endedAt`. A pool
 * emptying exactly at the interval's end emptied during it, and nothing
 * downstream re-claims that instant because the next interval starts from the
 * state this one left.
 *
 *
 * SIMULTANEITY IS RESOLVED HERE, NOT IN THE SOLVER
 * ------------------------------------------------
 *
 * Events sharing a timestamp are grouped into one INSTANT. Applying them one
 * at a time made the result depend on array order — a 500 drain and a 900 heal
 * at the same moment on a pool of 100 left the character on 900 or on 500
 * depending on which the caller listed first — and nothing about "these two
 * things happened at once" says which came first, because neither did.
 */

import type { EngineError } from "../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";
import { intervalOwns, type GameTimeInterval } from "../../../time/interval";
import type { GameTimestamp } from "../../../time/types";
import {
  findActivityCombinationIssues,
  sustainedActivityLoadPerHour,
  SUSTAINED_ACTIVITY_LEVELS,
  WAKEFULNESS_MODES,
  type ActivityExertionOverride,
  type PhysicalExertionLoad,
  type SustainedActivityLevel,
  type WakefulnessMode,
} from "../body/endurance";

import { hasDeliberateAuraAccess } from "./access";
import { findAuraUpkeepIssues } from "./upkeep";
import type { AuraUpkeepCommitment } from "./upkeep";
import type { AuraSuppression, ResolvedAuraAccess } from "./types";


/* ── Input shapes ───────────────────────────────────────────────────────── */

/*
 * What the character is doing, and what that costs and restores.
 *
 * `mode` decides three things at once — recovery multiplier, whether sleep
 * debt is paid, and whether wakefulness accrues — which is why it is one field
 * rather than three that could disagree.
 *
 * `exertionOverride` is the escape hatch for a mode and an activity that
 * ordinarily contradict each other. Sprinting in your sleep is refused unless
 * something names itself and says why.
 */
export interface AuraTimeActivity {
  readonly mode: WakefulnessMode;

  /*
   * Named level, or a raw load per hour for a caller with a finer figure.
   *
   * Alternatives, and enforced as such: supplying both is refused unless the
   * number matches what the named level costs.
   */
  readonly activity?: SustainedActivityLevel;
  readonly activityLoadPerHour?: PhysicalExertionLoad;

  /** Supplied by whatever is suppressing the character's Aura. */
  readonly suppression?: AuraSuppression;

  readonly exertionOverride?: ActivityExertionOverride;
}

/** The character starts doing something else, at an exact moment. */
export interface AuraActivityChange {
  readonly at: GameTimestamp;
  readonly activity: AuraTimeActivity;
}


/*
 * Something that happens AT an instant rather than over a span.
 *
 * A punch, a technique activation, a hostile drain, a healing effect. These
 * replaced accumulated `discretePhysical` / `discreteDeliberate` /
 * `forcedDrain` totals, which could only be smeared across the whole interval
 * — so a strike landing in the last minute of an eight-hour advance was
 * charged as though it had been happening all night.
 *
 * `amount` is ALREADY RESOLVED. Physical amounts have had Stamina applied and
 * deliberate ones Control, by whoever produced the event, because those
 * multipliers belong to the mechanic that knows what the action was.
 */
export const SCHEDULED_AURA_EVENT_KINDS = [
  "physical",
  "deliberate",
  "forced-drain",
  "recovery",
] as const;

export type ScheduledAuraEventKind =
  typeof SCHEDULED_AURA_EVENT_KINDS[number];

export interface ScheduledAuraEvent {
  readonly at: GameTimestamp;
  readonly kind: ScheduledAuraEventKind;
  readonly source: string;
  readonly amount: number;
}


/* ── Resolved shapes ────────────────────────────────────────────────────── */

/** Everything the caller scheduled at one instant, resolved together. */
export interface AuraEventInstant {
  readonly at: GameTimestamp;
  readonly events: readonly ScheduledAuraEvent[];
}

/*
 * The activity in force from an instant onward.
 *
 * Always non-empty and always begins at `interval.startedAt`, so the solver
 * never has to ask what was true before the first entry.
 */
export interface AuraActivityWindow {
  readonly from: GameTimestamp;
  readonly activity: AuraTimeActivity;

  /*
   * Whether the caller SUPPLIED this as a change, rather than it being the
   * activity the interval opened under.
   *
   * A change landing exactly on `startedAt` folds into the first window — the
   * two describe the same instant, and keeping both would leave a zero-width
   * segment. But it is still a change the caller made, and the event log has
   * to say so, or the same change would be reported when it fell mid-interval
   * and go unmentioned when a subdivision put an interval boundary on it.
   */
  readonly changed: boolean;
}

export interface ResolvedAuraTimeline {
  readonly interval: GameTimeInterval;
  readonly activities: NonEmptyArray<AuraActivityWindow>;
  readonly upkeep: readonly AuraUpkeepCommitment[];
  readonly instants: readonly AuraEventInstant[];
}

export interface AuraTimelineInput {
  readonly interval: GameTimeInterval;
  readonly activity: AuraTimeActivity;
  readonly activityChanges?: readonly AuraActivityChange[];
  readonly upkeep?: readonly AuraUpkeepCommitment[];
  readonly instantaneous?: readonly ScheduledAuraEvent[];
}


/* ── Validation ─────────────────────────────────────────────────────────── */

function inVocabulary(
  vocabulary: readonly string[],
  value: unknown,
): boolean {
  return typeof value === "string" && vocabulary.includes(value);
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}


function activityIssues(
  activity: AuraTimeActivity,
  access: ResolvedAuraAccess,
  where: string,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!inVocabulary(WAKEFULNESS_MODES, activity.mode)) {
    errors.push({
      code: "aura.activity.mode.invalid",
      message:
        `A wakefulness mode must be one of: ${WAKEFULNESS_MODES.join(", ")}.`,
      audience: "developer",
      required: WAKEFULNESS_MODES.join(" | "),
      actual: `${where}: ${String(activity.mode)}`,
    });
  }

  if (
    activity.activity !== undefined &&
    !inVocabulary(SUSTAINED_ACTIVITY_LEVELS, activity.activity)
  ) {
    errors.push({
      code: "aura.activity.level.invalid",
      message:
        `A sustained activity must be one of: ${SUSTAINED_ACTIVITY_LEVELS.join(", ")}.`,
      audience: "developer",
      required: SUSTAINED_ACTIVITY_LEVELS.join(" | "),
      actual: `${where}: ${String(activity.activity)}`,
    });
  }

  const load = activity.activityLoadPerHour;

  /*
   * The two are ALTERNATIVES, and were only documented as such.
   *
   * The resolver silently preferred the raw figure, so an activity that named
   * itself "extreme" and supplied a load of 0 cost nothing at all — the label
   * a caller reads back and the number the engine charges disagreed, and
   * nothing said so. Naming both is a caller who has not decided which they
   * meant, so it is refused unless they agree.
   */
  if (activity.activity !== undefined && load !== undefined) {
    const named = inVocabulary(SUSTAINED_ACTIVITY_LEVELS, activity.activity)
      ? sustainedActivityLoadPerHour(activity.activity)
      : undefined;

    if (named !== undefined && named !== load) {
      errors.push({
        code: "aura.activity.load.contradictory",
        message:
          "A named sustained activity and a raw load per hour must agree; supply one or the other.",
        audience: "developer",
        required: `${activity.activity} costs ${named} per hour`,
        actual: `${where}: ${activity.activity} with ${String(load)} per hour`,
      });
    }
  }

  if (load !== undefined && (!Number.isFinite(load) || load < 0)) {
    errors.push({
      code: "aura.exertion.load.invalid",
      message: "Sustained activity load must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: `${where}: ${String(load)}`,
    });
  }

  const suppression = activity.suppression;

  if (suppression !== undefined) {
    if (!nonEmpty(suppression.source)) {
      errors.push({
        code: "aura.recovery.suppression.source.missing",
        message: "Aura suppression must name the effect that supplied it.",
        audience: "developer",
        required: "non-empty string",
        actual: `${where}: ${String(suppression.source)}`,
      });
    }

    /*
     * Left unchecked, a NaN multiplier did not produce NaN — the comparison it
     * feeds is false for NaN, so the mode's own rate was used instead and the
     * caller got a confidently wrong number rather than an error.
     */
    if (
      !Number.isFinite(suppression.multiplier) ||
      suppression.multiplier < 0
    ) {
      errors.push({
        code: "aura.recovery.multiplier.invalid",
        message:
          "An Aura suppression recovery multiplier must be a finite non-negative number.",
        audience: "developer",
        required: "finite number >= 0",
        actual: `${where}: ${String(suppression.multiplier)}`,
      });
    }

    /*
     * An unawakened character has no principles to be suppressing anything
     * with, voluntarily or otherwise.
     */
    if (!access.awakened) {
      errors.push({
        code: "aura.time.suppression.unawakened",
        message: "An unawakened character has no Aura suppression to resolve.",
        audience: "developer",
        required: "awakened character",
        actual: `${where}: ${String(suppression.source)}`,
      });
    }
  }

  return [...errors, ...findActivityCombinationIssues(activity)];
}


/**
 * Resolve and validate a whole Aura timeline.
 *
 * Nothing is partially processed. A timeline with one malformed event is
 * refused entirely, because the alternative is a character who has been
 * charged for half of a scene the engine then declined to finish.
 */
export function resolveAuraTimeline(
  input: AuraTimelineInput,
  access: ResolvedAuraAccess,
): EngineResult<ResolvedAuraTimeline> {
  const { interval } = input;

  const traceNode = createTraceNode({
    id: "aura.timeline.resolve",
    label: "Resolve and validate the Aura timeline",
    formula:
      "caller events belong to [startedAt, endedAt); simultaneous events resolve as one instant",
    inputs: {
      startedAt: { value: interval.startedAt },
      endedAt: { value: interval.endedAt },
      activityChanges: { value: (input.activityChanges ?? []).length },
      upkeep: { value: (input.upkeep ?? []).length },
      instantaneous: { value: (input.instantaneous ?? []).length },
    },
  });

  const errors: EngineError[] = [
    ...activityIssues(input.activity, access, "initial activity"),
    ...findAuraUpkeepIssues(input.upkeep ?? []),
  ];

  /* ── Activity changes ─────────────────────────────────────────────── */

  const changes = [...(input.activityChanges ?? [])];
  const changeTimestamps = new Set<number>();

  for (const change of changes) {
    const where = `activity change at ${String(change.at)}`;

    if (!Number.isFinite(change.at)) {
      errors.push({
        code: "aura.timeline.timestamp.invalid",
        message: "An activity change needs a finite timestamp.",
        audience: "developer",
        required: "finite timestamp",
        actual: String(change.at),
      });

      continue;
    }

    if (!intervalOwns(interval, change.at)) {
      errors.push({
        code: change.at < interval.startedAt
          ? "aura.timeline.change.stale"
          : "aura.timeline.change.outside",
        message: change.at < interval.startedAt
          ? "An activity change predates the interval it was supplied with."
          : "An activity change falls at or after the interval's end, and belongs to the next one.",
        audience: "developer",
        required: `${interval.startedAt} <= at < ${interval.endedAt}`,
        actual: change.at,
      });

      continue;
    }

    /*
     * Two changes at one instant have no defined order, and taking whichever
     * the array listed last would make the answer depend on how the caller
     * assembled it — the same failure simultaneous events had.
     */
    if (changeTimestamps.has(change.at)) {
      errors.push({
        code: "aura.timeline.change.duplicate",
        message:
          "More than one activity change is supplied for the same instant.",
        audience: "developer",
        required: "one activity change per timestamp",
        actual: change.at,
      });

      continue;
    }

    changeTimestamps.add(change.at);
    errors.push(...activityIssues(change.activity, access, where));
  }

  changes.sort((left, right) => left.at - right.at);

  const activities: NonEmptyArray<AuraActivityWindow> = [
    { from: interval.startedAt, activity: input.activity, changed: false },
  ];

  for (const change of changes) {
    if (!Number.isFinite(change.at) || !intervalOwns(interval, change.at)) {
      continue;
    }

    /*
     * A change AT the interval's first instant replaces the initial activity
     * rather than following it. Both describe the same moment, and keeping two
     * windows there would leave a zero-width segment for the solver to trip on.
     */
    if (change.at === interval.startedAt) {
      activities[0] = {
        from: change.at,
        activity: change.activity,
        changed: true,
      };

      continue;
    }

    activities.push({
      from: change.at,
      activity: change.activity,
      changed: true,
    });
  }

  /* ── Instantaneous events ─────────────────────────────────────────── */

  const scheduled = [...(input.instantaneous ?? [])];

  for (const event of scheduled) {
    if (!Number.isFinite(event.at)) {
      errors.push({
        code: "aura.timeline.timestamp.invalid",
        message: "A scheduled Aura event needs a finite timestamp.",
        audience: "developer",
        required: "finite timestamp",
        actual: String(event.at),
      });

      continue;
    }

    if (!intervalOwns(interval, event.at)) {
      errors.push({
        code: event.at < interval.startedAt
          ? "aura.timeline.event.stale"
          : "aura.timeline.event.outside",
        message: event.at < interval.startedAt
          ? "A scheduled Aura event predates the interval it was supplied with."
          : "A scheduled Aura event falls at or after the interval's end, and belongs to the next one.",
        audience: "developer",
        required: `${interval.startedAt} <= at < ${interval.endedAt}`,
        actual: event.at,
        resolution:
          "An interval owns [startedAt, endedAt). An event on the endpoint belongs to the interval beginning there, or it would be applied twice.",
      });

      continue;
    }

    /*
     * Checked rather than assumed. The dispatch that consumes this used to
     * treat anything it did not recognise as a forced drain, so a typo in a
     * kind silently became an attack.
     */
    if (!inVocabulary(SCHEDULED_AURA_EVENT_KINDS, event.kind)) {
      errors.push({
        code: "aura.timeline.event.kind.invalid",
        message:
          `A scheduled Aura event kind must be one of: ${SCHEDULED_AURA_EVENT_KINDS.join(", ")}.`,
        audience: "developer",
        required: SCHEDULED_AURA_EVENT_KINDS.join(" | "),
        actual: String(event.kind),
      });
    }

    if (!nonEmpty(event.source)) {
      errors.push({
        code: "aura.timeline.event.source.missing",
        message: "A scheduled Aura event must name its source.",
        audience: "developer",
        required: "non-empty string",
        actual: String(event.source),
      });
    }

    if (!Number.isFinite(event.amount) || event.amount < 0) {
      errors.push({
        code: "aura.timeline.event.amount.invalid",
        message:
          "A scheduled Aura event needs a finite non-negative amount.",
        audience: "developer",
        required: "finite number >= 0",
        actual: String(event.amount),
      });
    }
  }

  /*
   * Deliberate expenditure needs deliberate access AT ITS OWN TIMESTAMP, which
   * is why this runs after the activity windows are built: suppression
   * beginning mid-interval closes the nodes from that instant, and a technique
   * scheduled after it cannot be paid for.
   */
  for (const event of scheduled) {
    if (event.kind !== "deliberate") continue;
    if (!Number.isFinite(event.at) || !intervalOwns(interval, event.at)) {
      continue;
    }

    const window = activities.reduce(
      (current, candidate) =>
        candidate.from <= event.at ? candidate : current,
      activities[0],
    );

    const permitted =
      hasDeliberateAuraAccess(access) &&
      window.activity.suppression === undefined;

    if (permitted) continue;

    errors.push({
      code: "aura.access.deliberate.not_permitted",
      message:
        "A deliberate Aura expenditure is scheduled for a moment the character cannot spend Aura deliberately.",
      audience: "player",
      required: "an access state permitting deliberate Aura expenditure",
      actual: `${event.source} at ${event.at}`,
      resolution:
        "Resolve the action before suppression begins, or drop the deliberate component.",
    });
  }

  if (errors.length > 0) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  }

  /* ── Grouping ─────────────────────────────────────────────────────── */

  scheduled.sort((left, right) => left.at - right.at);

  const instants: AuraEventInstant[] = [];

  for (const event of scheduled) {
    const last = instants[instants.length - 1];

    if (last !== undefined && last.at === event.at) {
      (last.events as ScheduledAuraEvent[]).push(event);

      continue;
    }

    instants.push({ at: event.at, events: [event] });
  }

  traceNode.output = {
    activities: activities.length,
    instants: instants.length,
    events: scheduled.length,
    upkeep: (input.upkeep ?? []).length,
  };

  return {
    success: true,
    payload: {
      interval,
      activities,
      upkeep: input.upkeep ?? [],
      instants,
    },
    trace: { root: traceNode },
    warnings: [],
  };
}
