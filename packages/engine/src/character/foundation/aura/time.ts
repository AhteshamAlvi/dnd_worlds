/*
 * Advancing time — continuous rates, resolved at their boundaries.
 *
 *   A' = clamp(A + recovery - physical - deliberate - upkeep - outwardFlow
 *              - leakage - forcedDrain, 0, A_max)
 *
 * That equation is still the model. What changed is that it is no longer
 * applied ONCE across whatever span a caller happened to submit. It is applied
 * across each SEGMENT of the interval during which the rates are constant, and
 * the segment ends are computed rather than guessed.
 *
 *
 * WHY SUBDIVISION HAD TO STOP MATTERING
 * -------------------------------------
 *
 * The previous implementation summed every contribution over the whole span
 * and clamped once. That made the answer depend on how the caller chopped up
 * the day, which is not a property a rules engine may have:
 *
 *   A character 100 Aura short of full, recovering 5,000/hour, running an
 *   upkeep of 100/hour, advanced two hours. Whole-span: recovery capped at the
 *   100 missing, upkeep 200, net -100. Advanced as two one-hour steps: full
 *   after the first, then upkeep offset by generation, net 0.
 *
 * Two defensible-looking answers from the same two hours. Now there is one:
 *
 *   advance(T) === advance(T/N) applied N times
 *
 * up to floating point, for every case. It holds because the solver splits at
 * exactly the instants the previous version smeared over — the moment the pool
 * fills, the moment it empties, the moment an upkeep can no longer be carried.
 *
 *
 * THE SEGMENT LOOP
 * ----------------
 *
 *   1  apply everything scheduled at this instant
 *   2  stop an outward flow whose end, suppression or empty reserve is here,
 *      and restore the ordinary access at the same instant
 *   3  resolve which upkeep is running, and shed what cannot be carried
 *   4  compute the rates that hold from here
 *   5  find the nearest boundary, mathematically
 *   6  integrate to it
 *   7  emit the event, and go again
 *
 * Boundaries are calculated, never searched. The pool reaching zero at
 * 1.4732 hours is solved for, not stepped towards — simulating seconds would
 * be slower AND less accurate, and would reintroduce exactly the dependence on
 * step size this exists to remove.
 *
 *
 * RECOVERY IS UNCAPPED UNTIL THE CLAMP
 * ------------------------------------
 *
 * Capping recovery at "the Aura currently missing" before combining it with
 * expenditure is what produced the contradiction above. Generation and drain
 * are now netted at full strength and the POOL is clamped, which is what makes
 * a character at full Aura able to pay an upkeep out of incoming regeneration
 * indefinitely while the surplus is discarded. Both figures are reported:
 * potential recovery, and how much of it was actually used.
 *
 *
 * WHAT THIS FILE STILL DOES NOT DECIDE
 * ------------------------------------
 *
 * It does not read or advance the clock. It is HANDED an interval by the
 * character-time coordinator, which is also what hands the same interval to
 * wakefulness, so no two domains can disagree about how long the night was.
 */

import type { EngineError } from "../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../../infrastructure/trace";
import {
  hoursToDuration,
  intervalHours,
  validateGameTimeInterval,
  type GameTimeInterval,
} from "../../../time/interval";
import { GAME_MILLISECONDS_PER_HOUR } from "../../../time/duration";
import type { GameTimestamp } from "../../../time/types";
import {
  consecutiveSleepHours,
  deriveFatigue,
  findWakefulnessStateIssues,
  QUALIFYING_SLEEP_HOURS,
  sustainedActivityLoadPerHour,
  WAKING_HOURS_CLEARED_PER_HOUR_SLEPT,
  type CharacterWakefulnessState,
  type ResolvedFatigue,
  type WakefulnessMode,
} from "../body/endurance";

import { hasDeliberateAuraAccess, resolveAuraAccess } from "./access";
import { resolveAuraTimeline } from "./timeline";
import type {
  AuraActivityWindow,
  AuraEventInstant,
  AuraTimeActivity,
  AuraActivityChange,
  ScheduledAuraEvent,
} from "./timeline";
import { resolveAuraBudget, type AuraTransitionContext } from "./budget";
import { deriveAuraControl } from "./control";
import { derivePhysicalConsumptionPerHour } from "./expenditure";
import {
  findAuraOutwardFlowIssues,
  outwardFlowRatePerHour,
  type AuraOutwardFlowCommitment,
  type AuraOutwardFlowStop,
} from "./flow";
import {
  deriveHalfOpenLeakage,
  deriveUncontainedLeakage,
  uncontainedCollapse,
} from "./leakage";
import type { AuraCollapse } from "./leakage";
import {
  deriveAuraRegeneration,
  resolveAuraRecoveryMultiplier,
} from "./recovery";
import type { CharacterAuraState } from "./state";
import { settleAuraTransition, type AuraStateTransition } from "./transitions";
import {
  auraUpkeepSheddingOrder,
  isUpkeepActiveAt,
  upkeepRatePerHour,
} from "./upkeep";
import type {
  AuraUpkeepCharge,
  AuraUpkeepCommitment,
  AuraUpkeepShutdown,
} from "./upkeep";
import {
  findAuraActiveNenIssues,
  type AuraActiveNenCommitment,
} from "./timeline";
import {
  suppressionPermitsAuthorizedActiveNen,
} from "./types";
import type {
  AuraBalance,
  AuraRecoveryAccessClass,
  AuraRecoveryContribution,
  AuraRecoverySource,
  AuraSuppression,
  ResolvedAuraAccess,
} from "./types";


/*
 * How close two instants have to be before they are the same instant.
 *
 * A boundary solved in hours and converted to milliseconds lands a fraction of
 * a millisecond away from the scheduled boundary it coincides with, and
 * without a tolerance the loop would take a zero-width segment and go round
 * again. A microsecond is far below anything the model represents and far
 * above the error the arithmetic produces.
 */
const BOUNDARY_EPSILON_MS = 1e-3;

/*
 * How many segments one interval may be cut into before the engine stops.
 *
 * Reaching it means boundaries are being generated without the state
 * advancing, which is a bug in this file rather than a busy day. Every real
 * case is bounded by the number of scheduled events plus a handful of rate
 * boundaries; a thousand is enormous, and hanging the workbench is worse than
 * failing loudly.
 */
const MAX_SEGMENTS = 1_000;

/*
 * How close to a pool boundary counts as being on it, relatively.
 *
 * For the EVENT LOG, not for the arithmetic. A character advanced in six
 * hundred steps arrives at their ceiling a few parts in 10^12 short of it,
 * because each step re-resolves and the residuals accumulate — and an exact
 * `>=` would then report the pool filling when the day was advanced in one go
 * and stay silent when it was advanced in slices. The value is identical
 * either way; only whether it trips a strict comparison differs.
 *
 * The same relative treatment the Output ceiling gets in distribution.ts, and
 * for the same reason.
 */
const POOL_BOUNDARY_TOLERANCE = 1e-9;

/* The boundary tolerance, in the hours the sleep streak is counted in. */
const STREAK_EPSILON_HOURS = BOUNDARY_EPSILON_MS / GAME_MILLISECONDS_PER_HOUR;


/* ── Input ──────────────────────────────────────────────────────────────── */

/*
 * The input vocabulary lives in timeline.ts, beside the validator that judges
 * it, and is re-exported here because this is the function callers reach for.
 *
 * Declaring the shapes here and validating them piecemeal as the solver
 * happened to touch them is how an unknown event kind became a forced drain
 * and a stale timestamp was applied anyway.
 */
export type {
  AuraActiveNenCommitment,
  AuraActivityChange,
  AuraActivityWindow,
  AuraEventInstant,
  AuraTimeActivity,
  ResolvedAuraTimeline,
  ScheduledAuraEvent,
  ScheduledAuraEventKind,
} from "./timeline";

export { SCHEDULED_AURA_EVENT_KINDS } from "./timeline";


export interface AdvanceAuraTimeInput {
  readonly state: CharacterAuraState;
  readonly wakefulness: CharacterWakefulnessState;
  readonly context: AuraTransitionContext;

  /** The authoritative span. Supplied by the clock, never invented here. */
  readonly interval: GameTimeInterval;

  /** What the character is doing at the interval's first instant. */
  readonly activity: AuraTimeActivity;

  /** Changes of activity part-way through, each at its own instant. */
  readonly activityChanges?: readonly AuraActivityChange[];

  /** Effects the character is holding open, with optional start and end. */
  readonly upkeep?: readonly AuraUpkeepCommitment[];

  /** Actions resolved at their own moments inside the interval. */
  readonly instantaneous?: readonly ScheduledAuraEvent[];

  /*
   * A deliberate outward flow running as the interval opens.
   *
   * Replaces the ordinary surface state for as long as it runs and is charged
   * at exactly its Output per minute. See flow.ts.
   */
  readonly outwardFlow?: AuraOutwardFlowCommitment;

  /*
   * Generic Nen activities running as the interval opens, with the instant
   * the last of them stops. Natural recovery is zero while they run — under a
   * suppression too, when they are explicitly authorized to function through
   * one that permits it. See timeline.ts.
   */
  readonly activeNen?: AuraActiveNenCommitment;

  /*
   * The character is unconscious in a way that counts as sleep, for the whole
   * interval — a blackout already in progress as it opens.
   *
   * A generic fact with a provenance label nothing branches on. Supplied by
   * whoever owns the unconsciousness; never inferred here from suppression.
   */
  readonly qualifyingUnconsciousness?: {
    readonly source: string;

    /** When it ends inside the interval. Absent: it lasts the whole of it. */
    readonly endsAt?: GameTimestamp;
  };

  /*
   * How long a collapse beginning INSIDE this interval blacks the character
   * out, from its own instant. Absent: to the end of the interval. Supplied by
   * whoever owns the recovery that ends the blackout; never derived here.
   */
  readonly collapseBlackout?: { readonly hours: number };
}


/* ── Result ─────────────────────────────────────────────────────────────── */

export const AURA_TIMELINE_EVENT_KINDS = [
  "aura-full",
  "aura-empty",
  "upkeep-started",
  "upkeep-expired",
  "upkeep-shutdown",
  "collapse",
  "outward-flow-stopped",
  "sleep-completed",
  "activity-changed",
  "instantaneous",
  "interval-end",
] as const;

export type AuraTimelineEventKind =
  typeof AURA_TIMELINE_EVENT_KINDS[number];

/*
 * One timestamped thing that happened.
 *
 * The reason the result is more than a pair of numbers. "You ended the night
 * on 0 Aura" is not a report; "your Ren dropped at 02:14 and you bottomed out
 * at 03:41" is, and the second cannot be reconstructed from the first.
 */
export interface AuraTimelineEvent {
  readonly at: GameTimestamp;
  readonly kind: AuraTimelineEventKind;

  /** Which commitment, activity or action. Empty for pool boundaries. */
  readonly detail: string;

  /** Current Aura at that instant, after the event applied. */
  readonly current: number;
}

/*
 * Recovery, split three ways.
 *
 * `potential` is what the character's regeneration was worth over the
 * interval; `used` is how much of it the pool actually absorbed; `discarded`
 * is the surplus that arrived while already full. Keeping the three apart is
 * what lets a sheet say "you are regenerating 5,000 an hour and losing all but
 * 100 of it", which is a different situation from regenerating nothing.
 */
export interface AuraRecoverySummary {
  readonly potential: number;
  readonly used: number;
  readonly discarded: number;
}

/*
 * The provenance a collapse's own suppression carries.
 *
 * Distinguishable from an ordinary Zetsu's in a trace, because they are not
 * the same event: one is a character choosing to shut their nodes and the
 * other is a body doing it for them at the moment they ran out.
 */
export const COLLAPSE_SUPPRESSION_SOURCE = "aura-collapse-forced-zetsu";

/** The provenance the completed-sleep top-off is reported under. */
export const SLEEP_COMPLETION_CONTEXT = "completed-sleep";


/*
 * Where involuntary leakage came from, kept apart.
 *
 *   halfOpen     pores that were never opened, or closed again by reversion
 *   uncontained  open nodes with nothing holding them — the only one of the
 *                three that can collapse a character
 *   contained    the residual escaping a containment such as Ten
 */
export interface AuraLeakageBySource {
  readonly halfOpen: number;
  readonly uncontained: number;
  readonly contained: number;
}

export type AuraLeakageSource = "half-open" | "uncontained" | "contained";


/** One stretch of the interval over which every rate was constant. */
export interface AuraTimeSegment {
  readonly startedAt: GameTimestamp;
  readonly endedAt: GameTimestamp;
  readonly hours: number;

  readonly startingAura: number;
  readonly endingAura: number;

  readonly recoveryRatePerHour: number;
  readonly physicalRatePerHour: number;
  readonly upkeepRatePerHour: number;
  readonly outwardFlowRatePerHour: number;
  readonly leakageRatePerHour: number;
  readonly netRatePerHour: number;

  /** Which leak `leakageRatePerHour` is, or null when nothing leaked. */
  readonly leakageSource: AuraLeakageSource | null;

  /** The outward flow running across this segment, by id. */
  readonly outwardFlow: string | null;

  /** The access state in force across this segment. */
  readonly accessState: ResolvedAuraAccess["state"];

  readonly mode: WakefulnessMode;
  readonly activeUpkeep: readonly string[];
}


export interface AuraTimeTransition extends AuraStateTransition {
  readonly interval: GameTimeInterval;
  readonly elapsedHours: number;

  readonly previousWakefulness: CharacterWakefulnessState;
  readonly wakefulness: CharacterWakefulnessState;

  readonly previousFatigue: ResolvedFatigue;
  readonly fatigue: ResolvedFatigue;

  readonly recovery: AuraRecoverySummary;

  /** What each maintained effect was actually charged, across the interval. */
  readonly upkeepCharges: readonly AuraUpkeepCharge[];

  /** Effects that stopped, each with the exact moment and the reason. */
  readonly upkeepShutdowns: readonly AuraUpkeepShutdown[];

  /** Present when an uncontained reserve reached zero. */
  readonly collapse: AuraCollapse | null;

  /** Involuntary leakage, by where it came from. Sums to `balance.leakage`. */
  readonly leakageBySource: AuraLeakageBySource;

  /*
   * How and when a supplied outward flow stopped inside the interval. Null
   * when none was supplied, or when it was still running at the end.
   */
  readonly outwardFlowStop: AuraOutwardFlowStop | null;

  /** The access in force at the interval's end. */
  readonly endingAccess: ResolvedAuraAccess;

  /*
   * Drain the empty pool could not pay for.
   *
   * A character at zero Aura still exerts themselves and is still bled; the
   * clamp means that costs nothing, and reporting the shortfall is what stops
   * that being invisible when something later wants to make it hurt.
   */
  readonly unmetDrain: number;

  readonly events: readonly AuraTimelineEvent[];
  readonly segments: readonly AuraTimeSegment[];
}


/* ── Rates ──────────────────────────────────────────────────────────────── */

interface SegmentRates {
  readonly recovery: number;
  readonly physical: number;
  readonly outwardFlow: number;
  readonly leakage: number;
  readonly leakageSource: AuraLeakageSource | null;
}


function sustainedLoadPerHour(activity: AuraTimeActivity): number {
  if (activity.activityLoadPerHour !== undefined) {
    return activity.activityLoadPerHour;
  }

  return sustainedActivityLoadPerHour(activity.activity ?? "ordinary-waking");
}


/* ── The solver ─────────────────────────────────────────────────────────── */

interface RunningUpkeep {
  readonly commitment: AuraUpkeepCommitment;
  readonly ratePerHour: number;
}


/**
 * Advance a character's Aura and wakefulness across an authoritative interval.
 *
 * Deterministic and independent of how the caller subdivides: one eight-hour
 * advance, eight one-hour advances and 28,800 one-second advances all reach
 * the same state.
 *
 * Hours passing cannot be REFUSED. Every operation in transitions.ts can fail
 * and leave the character untouched, because each is a request; time is not.
 * An unaffordable upkeep is shut down at the exact instant it became
 * unaffordable, a reserve emptied by leakage collapses, and both come back as
 * typed outcomes on a SUCCESS. Only malformed input fails.
 */
export function advanceAuraTime(
  input: AdvanceAuraTimeInput,
): EngineResult<AuraTimeTransition> {
  const { state, context, interval } = input;

  const root = createTraceNode({
    id: "aura.time.advance",
    label: "Advance Aura and wakefulness",
    formula:
      "per segment: next = clamp(current + (recovery - physical - upkeep - outwardFlow - leakage) * dt, 0, maximum)",

    decisionId: "time.continuous-resolution.boundaries",
    inputs: {
      startedAt: { value: interval.startedAt },
      endedAt: { value: interval.endedAt },
      mode: { value: String(input.activity.mode) },
      currentAura: {
        value: Number.isFinite(state.current)
          ? state.current
          : String(state.current),
      },
      hoursAwake: {
        value: Number.isFinite(input.wakefulness.hoursAwake)
          ? input.wakefulness.hoursAwake
          : String(input.wakefulness.hoursAwake),
      },
    },
  });

  const fail = (
    errors: readonly EngineError[],
  ): EngineResult<AuraTimeTransition> => {
    root.output = false;

    return {
      success: false,
      trace: { root },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  };

  /* ── Validation ───────────────────────────────────────────────────── */

  const validInterval = validateGameTimeInterval(interval);

  root.children.push(validInterval.trace.root);

  if (!validInterval.success) return fail(validInterval.errors);

  /*
   * The stored wakefulness, judged by the same rule the dedicated transition
   * uses rather than repaired here. Clamping a negative to zero and letting a
   * NaN through made this the one door into wakefulness that accepted a state
   * advanceWakefulness refuses — and the NaN came back out on a SUCCESS.
   */
  const wakefulnessIssues = findWakefulnessStateIssues(input.wakefulness);

  if (wakefulnessIssues.length > 0) {
    return fail(wakefulnessIssues as NonEmptyArray<EngineError>);
  }

  const budget = resolveAuraBudget(state.current, context);

  root.children.push(budget.trace.root);

  if (!budget.success) return fail(budget.errors);

  const { pool, access: ordinaryAccess } = budget.payload;

  /*
   * The WHOLE timeline, judged before anything is calculated.
   *
   * One validator rather than checks scattered through the loop, because the
   * scattered version only ever checked what the loop happened to reach: an
   * unrecognised event kind fell through the dispatch and became a forced
   * drain, duplicate upkeep ids were charged twice, and a stale timestamp from
   * fifty hours earlier was applied inside the interval anyway.
   */
  const timeline = resolveAuraTimeline(
    {
      interval,
      activity: input.activity,
      ...(input.activityChanges === undefined
        ? {}
        : { activityChanges: input.activityChanges }),
      ...(input.upkeep === undefined ? {} : { upkeep: input.upkeep }),
      ...(input.instantaneous === undefined
        ? {}
        : { instantaneous: input.instantaneous }),
    },
    ordinaryAccess,
  );

  root.children.push(timeline.trace.root);

  if (!timeline.success) return fail(timeline.errors);

  /*
   * The outward flow, and the access it replaces the ordinary state with.
   *
   * Resolved through the SAME access resolver as everything else, by laying
   * a generic override over the character's own input — so a flow on an
   * unawakened character is refused by the rule that refuses any override on
   * one, and the coating the flow sets aside is set aside by the override's
   * own resolution rather than by a branch here.
   */
  /*
   * The generic active-Nen commitment, judged against the whole timeline.
   *
   * A caller-supplied suppression that closes over activities NOT authorized
   * to run through it is two descriptions of one instant: nothing would stop
   * those activities, and recovery would have to pick a branch. Refused.
   */
  const activeNen = input.activeNen;

  if (activeNen !== undefined) {
    const activeNenIssues = [
      ...findAuraActiveNenIssues(activeNen, interval, ordinaryAccess),
      ...timeline.payload.activities
        .filter((window) =>
          window.activity.suppression !== undefined &&
          (activeNen.endsAt === undefined || window.from < activeNen.endsAt) &&
          !(
            activeNen.functionsThroughSuppression === true &&
            suppressionPermitsAuthorizedActiveNen(window.activity.suppression)
          )
        )
        .map((window): EngineError => ({
          code: "aura.activity.suppression.active_nen.contradictory",
          message:
            "A suppression closes over active Nen that is not authorized to function through it.",
          audience: "developer",
          required:
            "active Nen explicitly authorized, under a suppression permitting it",
          actual: `${String(window.activity.suppression?.source)} at ${window.from}`,
        })),
    ];

    if (activeNenIssues.length > 0) {
      return fail(activeNenIssues as NonEmptyArray<EngineError>);
    }
  }

  const unconsciousness = input.qualifyingUnconsciousness;

  if (
    unconsciousness !== undefined &&
    (unconsciousness === null || typeof unconsciousness !== "object" ||
      typeof unconsciousness.source !== "string" ||
      unconsciousness.source.trim().length === 0 ||
      (unconsciousness.endsAt !== undefined &&
        (!Number.isFinite(unconsciousness.endsAt) ||
          unconsciousness.endsAt <= interval.startedAt)))
  ) {
    return fail([{
      code: "aura.time.unconsciousness.invalid",
      message:
        "Qualifying unconsciousness must name what supplied it, and end after the interval opens.",
      audience: "developer",
      required: "{ source: non-empty string, endsAt?: > startedAt }",
      actual: String(unconsciousness),
    }]);
  }

  const blackout = input.collapseBlackout;

  if (
    blackout !== undefined &&
    (blackout === null || typeof blackout !== "object" ||
      !Number.isFinite(blackout.hours) || blackout.hours <= 0)
  ) {
    return fail([{
      code: "aura.time.collapse_blackout.invalid",
      message: "A collapse blackout must last a finite positive number of hours.",
      audience: "developer",
      required: "{ hours: finite number > 0 }",
      actual: String(blackout),
    }]);
  }

  const flow = input.outwardFlow;
  let flowAccess: ResolvedAuraAccess | null = null;

  /*
   * An outward-flow override on the character's own input would open Output
   * the solver has no rate for — a Ren charged nothing. Across an interval a
   * flow must arrive as a commitment, which is what meters it.
   */
  if (context.access.override?.kind === "outward-flow") {
    return fail([{
      code: "aura.outward_flow.unmetered",
      message:
        "An outward flow must be supplied as a commitment to be advanced through time, not as a bare access override.",
      audience: "developer",
      required: "input.outwardFlow",
      actual: "an outward-flow access override",
      resolution:
        "Pass the flow as `outwardFlow`; the solver lays the override itself for exactly as long as the flow runs.",
    }]);
  }

  if (flow !== undefined) {
    const flowIssues = findAuraOutwardFlowIssues(
      flow,
      interval,
      budget.payload.physiologicalOutput,
    );

    if (flowIssues.length > 0) {
      return fail(flowIssues as NonEmptyArray<EngineError>);
    }

    /*
     * An override is already a statement about what the nodes are doing. A
     * flow on top of one — most obviously a suppression — is two descriptions
     * of the same instant that cannot both be true.
     */
    if (context.access.override !== undefined) {
      return fail([{
        code: "aura.outward_flow.access.contradictory",
        message:
          "An outward flow cannot run over an access state that is already overridden.",
        audience: "developer",
        required: "no access override while a flow is supplied",
        actual: context.access.override.kind,
      }]);
    }

    const resolvedFlowAccess = resolveAuraAccess({
      ...context.access,
      override: {
        kind: "outward-flow",
        source: flow.source,
        accessFraction: flow.output / budget.payload.physiologicalOutput,
      },
    });

    root.children.push(resolvedFlowAccess.trace.root);

    if (!resolvedFlowAccess.success) return fail(resolvedFlowAccess.errors);

    flowAccess = resolvedFlowAccess.payload;
  }

  const control = deriveAuraControl(context.attributes.dex);

  root.children.push(control.trace.root);

  if (!control.success) return fail(control.errors);

  /* ── Fixed figures ────────────────────────────────────────────────── */

  const maximumAura = pool.maximum;
  const regenerationPerHour = deriveAuraRegeneration(context.attributes);

  /* Flat while the body is working, and denominated in R rather than in A_max. */
  const physicalRatePerHour =
    derivePhysicalConsumptionPerHour(regenerationPerHour);

  /*
   * From the Output Capacity the budget already derived, not from Maximum
   * Aura. Uncontained nodes bleed at the rate they can pass, and the budget is
   * the one place that capacity is computed — re-deriving it here would be a
   * second producer of a figure that also caps every deliberate expenditure.
   *
   * Constant across the interval, so interval invariance is unaffected: the
   * rate does not depend on the reserve, only on the body. Whether it APPLIES
   * is a per-instant question, asked below.
   */
  const uncontainedRatePerHour = deriveUncontainedLeakage(
    budget.payload.physiologicalOutput,
    pool.current,
  ).ratePerHour;

  /*
   * What a body that never opened its nodes loses, which is a different thing.
   *
   * Denominated in Regeneration rather than Output, applies to the
   * never-awakened and the reverted alike, and CANNOT collapse anybody — see
   * leakage.ts. Constant across the interval for the same reason the other
   * rate is.
   */
  const halfOpenRatePerHour = ordinaryAccess.nodeState === "half-open"
    ? deriveHalfOpenLeakage(regenerationPerHour).ratePerHour
    : 0;

  const flowRatePerHour = flow === undefined
    ? 0
    : outwardFlowRatePerHour(flow.output);

  const commitments = timeline.payload.upkeep;

  /*
   * Ordered once, worst-to-shed first, so that shedding is a pop rather than a
   * search and cannot depend on the order the caller assembled the array in.
   */
  const sheddingOrder = auraUpkeepSheddingOrder(commitments);

  /* ── Accumulators ─────────────────────────────────────────────────── */

  let current = pool.current;
  let hoursAwake = input.wakefulness.hoursAwake;
  let sleptHours = consecutiveSleepHours(input.wakefulness);
  let activity: AuraTimeActivity = timeline.payload.activities[0].activity;

  let potentialRecovery = 0;
  let discardedRecovery = 0;
  let physicalTotal = 0;
  let deliberateTotal = 0;
  let upkeepTotal = 0;
  let leakageTotal = 0;
  let forcedDrainTotal = 0;
  let unmetDrain = 0;

  /*
   * Collapse is permanent within an interval; suppression is not.
   *
   * `collapse` ends the uncontained state outright, which is the first thing
   * the collapse asks for. Suppression only interrupts, and leakage resumes at
   * the instant it lifts if the character is still fundamentally uncontained.
   */
  let collapse: AuraCollapse | null = null;

  /*
   * Whether the supplied flow is still running, and how it stopped.
   *
   * A flow only ever stops within an interval; it never starts. Starting one is
   * a lifecycle transition dated at its own instant, which the caller applies
   * between advances.
   */
  let flowRunning = flow !== undefined;
  let flowStop: AuraOutwardFlowStop | null = null;

  let outwardFlowTotal = 0;
  let halfOpenLeakageTotal = 0;
  let uncontainedLeakageTotal = 0;
  let containedLeakageTotal = 0;

  /*
   * Whether the CURRENT uninterrupted sleep has already paid its completion.
   *
   * The streak only reaches eight by completing, and stays capped there until
   * waking resets it — so a stored streak already at eight IS the latch,
   * carried between calls with no second field to disagree with it. Without
   * reading it, the slice after an eight-hour slice re-emitted the completion.
   * Reset together with the streak.
   */
  let sleepCompleted = sleptHours >= QUALIFYING_SLEEP_HOURS;

  const chargedById = new Map<string, number>();
  const chargedHoursById = new Map<string, number>();
  const shutdownIds = new Set<string>();
  const shutdowns: AuraUpkeepShutdown[] = [];
  const events: AuraTimelineEvent[] = [];
  const segments: AuraTimeSegment[] = [];

  /*
   * Recovery contributions, keyed so identical stretches merge.
   *
   * Accumulated per SEGMENT rather than summarised once at the end. The
   * summary version reported the interval's initial activity as though it had
   * held throughout, which produced contributions like "multiplier 0, hours 4,
   * restored 10,000" for a character who woke, worked, and then slept.
   */
  const contributions = new Map<string, {
    source: AuraRecoverySource;
    context: string;
    ratePerHour: number;
    multiplier: number;
    hours: number;
    potential: number;
    used: number;
    discarded: number;
  }>();

  const contribute = (
    source: AuraRecoverySource,
    contextLabel: string,
    ratePerHour: number,
    multiplier: number,
    hours: number,
    potential: number,
    discarded: number,
  ): void => {
    if (potential === 0) return;

    const key = `${source}|${contextLabel}|${ratePerHour}|${multiplier}`;
    const existing = contributions.get(key);

    if (existing === undefined) {
      contributions.set(key, {
        source,
        context: contextLabel,
        ratePerHour,
        multiplier,
        hours,
        potential,
        used: potential - discarded,
        discarded,
      });

      return;
    }

    existing.hours += hours;
    existing.potential += potential;
    existing.used += potential - discarded;
    existing.discarded += discarded;
  };

  const emit = (
    at: GameTimestamp,
    kind: AuraTimelineEventKind,
    detail: string,
  ): void => {
    events.push({ at, kind, detail, current });
  };

  /*
   * Whether the reserve has reached zero, to the same tolerance the event log
   * uses for the same question.
   *
   * An EXACT `<= 0` was a real bug, and it was invisible until recovery and
   * leakage stopped being the only two rates. Solving for the instant the pool
   * empties divides by a net rate; when that rate was a round -120 the
   * arithmetic landed exactly on zero, and when it became -119.5 it landed on
   * 1.6e-12 instead. A character who had unambiguously bled out was then
   * carried to the end of the interval before collapsing, because 1.6e-12 is
   * not `<= 0` — so the collapse timestamp depended on how the caller had
   * subdivided the night.
   */
  const isEmpty = (value: number): boolean =>
    value <= Math.max(1, maximumAura) * POOL_BOUNDARY_TOLERANCE;

  /* The upkeep running at an instant, minus anything already shut down. */
  const runningAt = (at: GameTimestamp): readonly RunningUpkeep[] =>
    sheddingOrder
      .filter((commitment) =>
        !shutdownIds.has(commitment.id) && isUpkeepActiveAt(commitment, at)
      )
      .map((commitment) => ({
        commitment,
        ratePerHour:
          upkeepRatePerHour(commitment.baseRate, commitment.period) *
          control.payload.multiplier,
      }));

  /*
   * Suppression closes the nodes, so it stops leakage for as long as it lasts.
   *
   * Per instant, not once: a Zetsu beginning at hour one and lifting at hour
   * three leaves the character leaking either side of it and not in between.
   */
  /*
   * Suppression, from either of the two places it can arrive.
   *
   * The caller's activity supplies a voluntary Zetsu. A collapse supplies its
   * own, and has to: the body shut the nodes part-way through an interval the
   * caller described before it happened, so the remainder of that interval is
   * suppressed whatever the caller said. Resolving both here is what makes the
   * post-collapse rates change at the collapse instant instead of at the next
   * call.
   */
  const suppressionNow = (): AuraSuppression | undefined =>
    collapse === null
      ? activity.suppression
      : { source: COLLAPSE_SUPPRESSION_SOURCE, forced: true };

  const suppressedNow = (): boolean => suppressionNow() !== undefined;

  /* When the in-call collapse's blackout ends, if it was given a length. */
  const blackoutEndsAt = (): GameTimestamp | null =>
    collapse === null || !collapse.requests.includes("blackout") ||
      input.collapseBlackout === undefined
      ? null
      : collapse.at + hoursToDuration(input.collapseBlackout.hours);

  /*
   * Whether the character is unconscious in a way that counts as sleep, at
   * this instant. See sleepingNow.
   */
  const unconsciousNow = (): boolean => {
    if (
      unconsciousness !== undefined &&
      (unconsciousness.endsAt === undefined ||
        at < unconsciousness.endsAt - BOUNDARY_EPSILON_MS)
    ) {
      return true;
    }

    if (collapse === null || !collapse.requests.includes("blackout")) {
      return false;
    }

    const ends = blackoutEndsAt();

    return ends === null || at < ends - BOUNDARY_EPSILON_MS;
  };

  /*
   * The access in force right now: the flow's while it runs, the character's
   * own before it starts and after it stops. Every per-instant question below
   * reads this, so the moment a flow stops is the moment Ten — or whatever the
   * ordinary state is — takes over again.
   */
  const accessNow = (): ResolvedAuraAccess =>
    flowRunning && flowAccess !== null ? flowAccess : ordinaryAccess;

  /*
   * Which of the four states the character's Aura is in, right now.
   *
   * The ONE place the class is decided, and it reads only generic facts:
   * whether something is suppressing them, what their nodes are doing, and
   * whether anything is holding those nodes shut. No principle is named, and
   * none can be — the resolved access carries no principle either.
   */
  const accessClassNow = (): AuraRecoveryAccessClass => {
    if (suppressedNow()) return "suppressed";
    if (accessNow().nodeState === "half-open") return "half-open";

    return accessNow().uncontained ? "uncontained" : "contained";
  };

  /*
   * Whether the body is working.
   *
   * A boolean rather than a magnitude, because the magnitude no longer buys
   * anything: one flat rate, one physical recovery column. The named level and
   * the raw load are still both accepted, still validated against each other,
   * and still say the same thing — this just stops asking how much.
   *
   * Unconsciousness ends it. A blacked-out character is not sprinting,
   * whatever the caller said they were doing before the lights went out — and
   * once the blackout ends, the stated activity applies again.
   */
  const exertingNow = (): boolean =>
    !unconsciousNow() && sustainedLoadPerHour(activity) > 0;

  /*
   * Whether the character is bleeding through open, uncontained nodes.
   *
   * Kept apart from whether they bleed by DEFAULT, because suppression
   * interrupts leakage without curing what causes it — and a flow replaces it
   * for as long as the flow runs.
   */
  const leakageNow = (): boolean =>
    accessNow().uncontained && collapse === null && !suppressedNow();

  /*
   * Whether this segment counts towards a completed sleep.
   *
   * Sleep does, and QUALIFYING UNCONSCIOUSNESS does — nothing else.
   * Suppression by itself never does: a conscious character held in a forced
   * Zetsu, or sitting awake in their own, is not asleep however shut their
   * nodes are.
   *
   * Unconsciousness arrives from two generic places, and neither is inferred
   *   from what suppressed the character:
   *
   *   in this call   a collapse whose requests include a blackout, from the
   *                  collapse's own instant for `collapseBlackout.hours`
   *   carried        `qualifyingUnconsciousness`, a fact the host supplies from
   *                  the interval's start until its own `endsAt` — which is
   *                  what a host advancing a blackout in slices hands back
   *                  after the collapse, so both agree about the night
   *
   * Each ends at an exact instant, which is a rate boundary.
   *
   * It counts for the SLEEP STREAK only. `hoursAwake` still follows the mode
   * the caller stated, because clearing sleep debt is a different benefit with
   * a different rule, and nothing in this ticket settled whether a blackout
   * rests you.
   */
  const sleepingNow = (): boolean =>
    activity.mode === "sleep" || unconsciousNow();

  /*
   * Whether the supplied generic activities are still running, and permitted
   * to at this instant.
   *
   * Their own end is a boundary; so is a suppression that permits no
   * exceptions — a collapse's, most obviously — beginning over them.
   */
  const activeNenRunningNow = (): boolean =>
    activeNen !== undefined &&
    (activeNen.endsAt === undefined ||
      at < activeNen.endsAt - BOUNDARY_EPSILON_MS);

  const activeNenThroughSuppressionNow = (): boolean => {
    const suppression = suppressionNow();

    return (
      suppression !== undefined &&
      activeNenRunningNow() &&
      activeNen?.functionsThroughSuppression === true &&
      suppressionPermitsAuthorizedActiveNen(suppression)
    );
  };

  const recoveryNow = () => {
    const suppression = suppressionNow();
    const throughSuppression = activeNenThroughSuppressionNow();

    return resolveAuraRecoveryMultiplier({
      mode: activity.mode,
      accessClass: accessClassNow(),
      exerting: exertingNow(),
      /*
       * A running flow IS active Nen, whatever else the activity says, and so
       * are the generic activities while they run. Under suppression only the
       * explicitly authorized ones still count.
       */
      activeNenUse: throughSuppression ||
        (
          (activity.activeNenUse === true || flowRunning ||
            activeNenRunningNow()) &&
          !suppressedNow()
        ),
      ...(throughSuppression ? { activeNenThroughSuppression: true } : {}),
      ...(suppression === undefined ? {} : { suppression }),
    });
  };

  const ratesFor = (): SegmentRates => {
    const resolvedRecovery = recoveryNow();

    /*
     * The three leaks are alternatives, never a sum: nodes are half-open or
     * open, and open nodes are either uncontained or held by a containment
     * that leaks its own residual. Suppression stops all three, and so does a
     * collapse; a running flow replaces the open-node ones.
     */
    /*
     * Zero while a commitment is holding the surface itself. The automatic
     * coating is not underneath it leaking its own residual: a body has one
     * coating, and for as long as something is deliberately holding Output
     * against the skin, that is the one it has.
     */
    const containedRate =
      activeNenRunningNow() && activeNen?.replacesAutomaticCoating === true
        ? 0
        : regenerationPerHour *
          accessNow().containedLeakageRegenerationMultiple;

    const leak: { rate: number; source: AuraLeakageSource | null } =
      suppressedNow()
        ? { rate: 0, source: null }
        : leakageNow()
          ? { rate: uncontainedRatePerHour, source: "uncontained" }
          : accessNow().nodeState === "half-open"
            ? { rate: halfOpenRatePerHour, source: "half-open" }
            : collapse === null && containedRate > 0
              ? { rate: containedRate, source: "contained" }
              : { rate: 0, source: null };

    return {
      /*
       * UNCAPPED. Capping against missing Aura before netting is what made the
       * old answer depend on subdivision; the clamp below is what keeps the
       * pool honest.
       */
      recovery: regenerationPerHour * resolvedRecovery.multiplier,

      physical: exertingNow() ? physicalRatePerHour : 0,

      outwardFlow: flowRunning ? flowRatePerHour : 0,

      leakage: leak.rate,
      leakageSource: leak.rate > 0 ? leak.source : null,
    };
  };

  /*
   * Deliberate access is a per-instant fact, because suppression can begin
   * mid-interval. A Zetsu closing over a running Ren does not refuse the hour;
   * it drops the Ren at the moment it closes.
   */
  const deliberatePermittedNow = (): boolean =>
    hasDeliberateAuraAccess(accessNow()) && !suppressedNow();

  const stopFlow = (
    at: GameTimestamp,
    reason: AuraOutwardFlowStop["reason"],
  ): void => {
    if (!flowRunning || flow === undefined) return;

    flowRunning = false;
    flowStop = { id: flow.id, source: flow.source, reason, at };
    emit(at, "outward-flow-stopped", flow.id);

    /* The flow's activity has stopped, and so has any upkeep it was paying. */
    stopOwner(flow.id, at);
  };

  const shutDown = (
    entry: RunningUpkeep,
    at: GameTimestamp,
    reason: AuraUpkeepShutdown["reason"],
  ): void => {
    if (shutdownIds.has(entry.commitment.id)) return;

    shutdownIds.add(entry.commitment.id);
    shutdowns.push({
      id: entry.commitment.id,
      source: entry.commitment.source,
      reason,
      at,
      ratePerHour: entry.ratePerHour,
      availableAura: current,
    });
    emit(at, "upkeep-shutdown", entry.commitment.id);

    /*
     * An activity whose upkeep dropped has stopped, and so has everything
     * paid for it or built on it — at this instant, once each.
     */
    const provenance = entry.commitment.provenance;

    if (provenance?.kind === "activity") stopOwner(provenance.activityId, at);
  };

  /*
   * End every upkeep paid for an owner, or for anything composed of it, that
   * has not already ended. Opaque ids only: the owner is whatever the
   * commitment's provenance named.
   */
  const stopOwner = (ownerId: string, at: GameTimestamp): void => {
    for (const commitment of sheddingOrder) {
      if (shutdownIds.has(commitment.id)) continue;
      if (commitment.endsAt !== undefined && commitment.endsAt <= at) continue;

      const provenance = commitment.provenance;

      if (provenance?.kind !== "activity") continue;
      if (
        provenance.activityId !== ownerId &&
        !(provenance.dependsOn ?? []).includes(ownerId)
      ) {
        continue;
      }

      shutDown(
        {
          commitment,
          ratePerHour:
            upkeepRatePerHour(commitment.baseRate, commitment.period) *
            control.payload.multiplier,
        },
        at,
        "owner-stopped",
      );
    }
  };

  /* ── The loop ─────────────────────────────────────────────────────── */

  const instants = timeline.payload.instants;
  const windows = timeline.payload.activities;

  let at = interval.startedAt;
  let instantIndex = 0;
  let windowIndex = 1;

  /*
   * A change supplied AT the opening instant is still a change. Reporting it
   * only when it fell mid-interval would make the event log depend on where a
   * caller happened to put its interval boundaries.
   */
  if (windows[0].changed) emit(at, "activity-changed", activity.mode);

  for (let segment = 0; ; segment += 1) {
    if (segment > MAX_SEGMENTS) {
      return fail([{
        code: "aura.time.segments.unstable",
        message:
          `Resolving this interval did not settle within ${MAX_SEGMENTS} segments.`,
        audience: "developer",
        required: `at most ${MAX_SEGMENTS} rate changes`,
        actual: segment,
        resolution:
          "A boundary is being emitted without the state advancing past it. This is an engine bug rather than a busy interval.",
      }]);
    }

    /*
     * 1. Everything scheduled at this instant, resolved TOGETHER.
     *
     * Simultaneous events have no order — neither happened first — so applying
     * them one at a time made the answer depend on the array. A 500 drain and
     * a 900 heal at one moment on a pool of 100 left the character on 900 or
     * on 500 depending on which the caller listed first.
     */
    while (
      instantIndex < instants.length &&
      instants[instantIndex]!.at <= at + BOUNDARY_EPSILON_MS
    ) {
      const instant = instants[instantIndex]!;

      instantIndex += 1;

      let recovery = 0;
      let drain = 0;

      for (const event of instant.events) {
        if (event.kind === "recovery") recovery += event.amount;
        else drain += event.amount;
      }

      /*
       * One net change, clamped ONCE.
       *
       * Sequencing recovery before drain re-introduced the ordering the
       * gathering above exists to remove — it just moved it from the caller's
       * array to the two kinds. A character on 49,000 of 50,000 taking 3,000
       * of recovery and 3,000 of drain at one instant ended on 47,000, because
       * the cap discarded 2,000 of the recovery before the drain that would
       * have made room for it was applied. Neither event happened first, so
       * neither gets to overflow or to starve ahead of the other.
       */
      const settled = current + recovery - drain;
      const next = Math.min(maximumAura, Math.max(0, settled));

      /*
       * At most one of these is non-zero: a net result cannot be above the cap
       * and below zero at once.
       */
      const discarded = Math.max(0, settled - maximumAura);

      current = next;
      unmetDrain += Math.max(0, -settled);

      /*
       * Each source is reported in FULL, with the shortfall in unmetDrain —
       * the same convention the continuous rates use. The discarded share of
       * simultaneous recovery is split in proportion, because nothing
       * distinguishes which of two effects arriving at once overflowed.
       */
      for (const event of instant.events) {
        if (event.kind === "recovery") {
          const share = recovery > 0 ? event.amount / recovery : 0;

          potentialRecovery += event.amount;
          discardedRecovery += discarded * share;
          contribute(
            "scheduled-event",
            event.source,
            0,
            1,
            0,
            event.amount,
            discarded * share,
          );

          continue;
        }

        /*
         * No `physical` kind reaches here any more. Bodily effort is a RATE
         * integrated over the segments below, and a scheduled one-off physical
         * charge would be the per-action model coming back through the
         * timeline. An application's own declared surcharge is a deliberate
         * cost and arrives as one.
         */
        if (event.kind === "deliberate") deliberateTotal += event.amount;
        else forcedDrainTotal += event.amount;
      }

      /*
       * Reported in a stable order so two callers who listed the same events
       * differently get the same log, not merely the same arithmetic.
       */
      const reported = [...instant.events].sort((left, right) =>
        left.kind === right.kind
          ? left.source.localeCompare(right.source)
          : left.kind.localeCompare(right.kind)
      );

      for (const event of reported) {
        emit(instant.at, "instantaneous", event.source);
      }
    }

    /* Activity changes take effect at their instant. */
    while (
      windowIndex < windows.length &&
      windows[windowIndex]!.from <= at + BOUNDARY_EPSILON_MS
    ) {
      activity = windows[windowIndex]!.activity;
      windowIndex += 1;
      emit(at, "activity-changed", activity.mode);
    }

    /*
     * Timed effects beginning INSIDE the interval, reported once.
     *
     * A commitment whose startsAt predates the interval was already running
     * and must not be announced again — chained advancement would report the
     * same effect starting at the head of every interval it survived.
     */
    for (const commitment of sheddingOrder) {
      if (commitment.startsAt === undefined) continue;
      if (commitment.startsAt <= interval.startedAt) continue;
      if (Math.abs(commitment.startsAt - at) > BOUNDARY_EPSILON_MS) continue;

      emit(at, "upkeep-started", commitment.id);
    }

    /*
     * The flow's own end, and suppression closing over it.
     *
     * Before collapse and before the loop can end, so a flow ending exactly on
     * the interval boundary is reported in this interval rather than in
     * whichever one the caller happens to advance next — and so the access a
     * collapse check reads is already the ordinary one.
     *
     * The declared end wins a tie with an empty reserve: both are true at the
     * same instant, and one stop is reported rather than two.
     */
    if (flowRunning && flow !== undefined) {
      if (
        flow.endsAt !== undefined &&
        flow.endsAt <= at + BOUNDARY_EPSILON_MS
      ) {
        stopFlow(at, "ended");
      } else if (suppressedNow()) {
        stopFlow(at, "access-lost");
      }
    }

    /*
     * Collapse, judged before the loop can end.
     *
     * An uncontained reserve that hits zero exactly ON the interval boundary
     * has still hit zero, and checking only at the top of a segment that never
     * runs would miss the commonest case of all: the full standard character
     * advanced exactly the 48 hours it takes to empty them.
     *
     * Suppression prevents it, because suppression stops the leakage that
     * would cause it. A character in Zetsu at zero Aura is empty, not
     * collapsing.
     *
     * So does QUALIFYING SLEEP, and for a different reason: a sleeper emptying
     * their reserve is already inside the eight-hour restoration a collapse
     * would start. Collapsing them would open a second one — a second blackout,
     * a second suppression instance, a second timer — beside the one already
     * running. They are asleep and empty, which is the state the restoration
     * already answers.
     */
    if (collapse === null && leakageNow() && !sleepingNow() && isEmpty(current)) {
      const unavoidable = ratesFor();

      if (
        unavoidable.recovery - unavoidable.physical - unavoidable.leakage <= 0
      ) {
        collapse = uncontainedCollapse(at);
        emit(at, "collapse", "uncontained-leakage-exhausted");
      }
    }

    if (at >= interval.endedAt - BOUNDARY_EPSILON_MS) break;

    /*
     * 2. A flow the reserve can no longer pay for.
     *
     * At zero, with the flow still in force, the balance cannot be positive —
     * a flow is active Nen, so nothing is being recovered — and the flow is
     * what stops. It goes BEFORE any upkeep is shed, because it is the drain
     * that also suppresses recovery, and the ordinary access it hands back may
     * make the rest sustainable.
     */
    if (flowRunning && isEmpty(current)) {
      const withFlow = ratesFor();

      if (
        withFlow.recovery - withFlow.physical - withFlow.outwardFlow -
          withFlow.leakage < 0
      ) {
        stopFlow(at, "unfunded");
      }
    }

    /* 3. Access, then affordability. */
    let running = runningAt(at);

    if (!deliberatePermittedNow()) {
      /*
       * Closed access shuts deliberate upkeep down — except upkeep EXPLICITLY
       * authorized to function through a suppression that permits it, which
       * keeps being charged exactly as before.
       */
      const suppression = suppressionNow();

      const survives = (entry: RunningUpkeep): boolean =>
        suppression !== undefined &&
        ordinaryAccess.awakened &&
        entry.commitment.functionsThroughSuppression === true &&
        suppressionPermitsAuthorizedActiveNen(suppression) &&
        (suppression.exemptUpkeepIds === undefined ||
          suppression.exemptUpkeepIds.includes(entry.commitment.id));

      for (const entry of running) {
        if (!survives(entry)) shutDown(entry, at, "access-lost");
      }

      running = running.filter(survives);
    }

    const rates = ratesFor();

    /*
     * Shed what an empty pool cannot carry.
     *
     * Only at zero, and only upkeep: physical effort and leakage are not
     * things the character can choose to stop, so the lowest-priority
     * maintained effect goes first and keeps going until the continuous
     * balance is sustainable or there is nothing left to drop.
     */
    if (isEmpty(current)) {
      let upkeepRate = running.reduce(
        (sum, entry) => sum + entry.ratePerHour,
        0,
      );

      while (
        running.length > 0 &&
        rates.recovery - rates.physical - rates.outwardFlow - upkeepRate -
          rates.leakage < 0
      ) {
        const dropped = running[0]!;

        shutDown(dropped, at, "insufficient-aura");
        running = running.slice(1);
        upkeepRate -= dropped.ratePerHour;
      }
    }

    const upkeepRate = running.reduce(
      (sum, entry) => sum + entry.ratePerHour,
      0,
    );

    /* 4. The nearest boundary. */
    const boundaries: number[] = [interval.endedAt];

    if (flowRunning && flow?.endsAt !== undefined && flow.endsAt > at) {
      boundaries.push(flow.endsAt);
    }

    if (activeNen?.endsAt !== undefined && activeNen.endsAt > at) {
      boundaries.push(activeNen.endsAt);
    }

    if (unconsciousness?.endsAt !== undefined && unconsciousness.endsAt > at) {
      boundaries.push(unconsciousness.endsAt);
    }

    const blackoutEnd = blackoutEndsAt();

    if (blackoutEnd !== null && blackoutEnd > at) boundaries.push(blackoutEnd);

    if (instantIndex < instants.length) {
      boundaries.push(instants[instantIndex]!.at);
    }

    if (windowIndex < windows.length) {
      boundaries.push(windows[windowIndex]!.from);
    }

    for (const commitment of sheddingOrder) {
      if (shutdownIds.has(commitment.id)) continue;

      if (commitment.startsAt !== undefined && commitment.startsAt > at) {
        boundaries.push(commitment.startsAt);
      }

      if (commitment.endsAt !== undefined && commitment.endsAt > at) {
        boundaries.push(commitment.endsAt);
      }
    }

    const net =
      rates.recovery - rates.physical - rates.outwardFlow - upkeepRate -
      rates.leakage;

    if (net > 0 && current < maximumAura) {
      boundaries.push(
        at + hoursToDuration((maximumAura - current) / net),
      );
    }

    if (net < 0 && current > 0) {
      boundaries.push(at + hoursToDuration(current / -net));
    }

    /*
     * The instant a continuous sleep becomes a COMPLETED one.
     *
     * Solved for like every other boundary rather than tested for at segment
     * ends, because a caller advancing a nine-hour night in one step must land
     * on the same eighth hour as one advancing it in nine. The segment ends
     * there, the ordinary rates are applied up to it, and the top-off happens
     * at the boundary itself.
     */
    if (sleepingNow() && sleptHours < QUALIFYING_SLEEP_HOURS) {
      boundaries.push(
        at + hoursToDuration(QUALIFYING_SLEEP_HOURS - sleptHours),
      );
    }

    const endsAt = Math.min(
      interval.endedAt,
      ...boundaries.filter((candidate) => candidate > at + BOUNDARY_EPSILON_MS),
    );

    const hours = (endsAt - at) / GAME_MILLISECONDS_PER_HOUR;

    /* 5. Integrate. */
    const startingAura = current;

    const unclamped = current + net * hours;

    current = Math.min(maximumAura, Math.max(0, unclamped));

    const segmentPotential = rates.recovery * hours;
    const segmentDiscarded = Math.max(0, unclamped - maximumAura);

    potentialRecovery += segmentPotential;
    physicalTotal += rates.physical * hours;
    upkeepTotal += upkeepRate * hours;
    outwardFlowTotal += rates.outwardFlow * hours;
    leakageTotal += rates.leakage * hours;

    if (rates.leakageSource === "half-open") {
      halfOpenLeakageTotal += rates.leakage * hours;
    } else if (rates.leakageSource === "uncontained") {
      uncontainedLeakageTotal += rates.leakage * hours;
    } else if (rates.leakageSource === "contained") {
      containedLeakageTotal += rates.leakage * hours;
    }

    discardedRecovery += segmentDiscarded;
    unmetDrain += Math.max(0, -unclamped);

    const resolvedRecovery = recoveryNow();

    /*
     * The BASE capacity and the multiplier separately, so a sheet can say
     * "5,000 an hour at x0.5" rather than only the product — and so this
     * matches what the standalone recoverAura reports. For a continuous
     * contribution, potential === ratePerHour x multiplier x hours.
     */
    contribute(
      "natural-regeneration",
      resolvedRecovery.context,
      regenerationPerHour,
      resolvedRecovery.multiplier,
      hours,
      segmentPotential,
      segmentDiscarded,
    );

    for (const entry of running) {
      chargedById.set(
        entry.commitment.id,
        (chargedById.get(entry.commitment.id) ?? 0) + entry.ratePerHour * hours,
      );
      chargedHoursById.set(
        entry.commitment.id,
        (chargedHoursById.get(entry.commitment.id) ?? 0) + hours,
      );
    }

    hoursAwake = activity.mode === "sleep"
      ? Math.max(0, hoursAwake - WAKING_HOURS_CLEARED_PER_HOUR_SLEPT * hours)
      : hoursAwake + hours;

    /*
     * The streak, then the benefit it earns.
     *
     * A waking segment that actually lasted resets it; a zero-width one cannot,
     * for the same reason the standalone transition refuses to — subdivision
     * creates those boundaries and they must not change the answer.
     */
    if (sleepingNow()) {
      sleptHours = Math.min(QUALIFYING_SLEEP_HOURS, sleptHours + hours);

      /*
       * Landing ON the requirement, to the same tolerance every other boundary
       * uses. The segment that ends at the solved completion instant adds a
       * span converted back out of milliseconds, so the sum can sit one ulp
       * short of eight — and an exact `>=` would then carry the restoration
       * past its own boundary and pay it out at the end of the interval
       * instead. A streak resumed part-way through, which is what a sleeper
       * continuing a blackout has, is where that shows up.
       */
      if (QUALIFYING_SLEEP_HOURS - sleptHours <= STREAK_EPSILON_HOURS) {
        sleptHours = QUALIFYING_SLEEP_HOURS;
      }
    } else if (hours > 0) {
      sleptHours = 0;
      sleepCompleted = false;
    }

    /*
     * Eight hours of continuous sleep fills the reserve, once.
     *
     * Applied AFTER the segment's own arithmetic, so the hours leading up to
     * it are paid for at their ordinary rates and the top-off is only ever the
     * remainder. Reported as its own recovery source rather than folded into
     * natural regeneration, because a sheet showing "you regenerated 100" for
     * a night that regenerated 80 and was completed to full would be lying
     * about both numbers.
     *
     * The streak is CAPPED at eight rather than reset, so a twelve-hour sleep
     * pays this once and the ninth through twelfth hours are ordinary. Waking
     * resets it and makes the next completed sleep count again.
     */
    if (
      sleepingNow() &&
      sleptHours >= QUALIFYING_SLEEP_HOURS &&
      !sleepCompleted
    ) {
      sleepCompleted = true;

      const toppedUp = Math.max(0, maximumAura - current);

      if (toppedUp > 0) {
        current = maximumAura;

        contribute(
          "sleep-completion",
          SLEEP_COMPLETION_CONTEXT,
          toppedUp,
          1,
          0,
          toppedUp,
          0,
        );
      }

      emit(endsAt, "sleep-completed", SLEEP_COMPLETION_CONTEXT);
    }

    segments.push({
      startedAt: at,
      endedAt: endsAt,
      hours,
      startingAura,
      endingAura: current,
      recoveryRatePerHour: rates.recovery,
      physicalRatePerHour: rates.physical,
      upkeepRatePerHour: upkeepRate,
      outwardFlowRatePerHour: rates.outwardFlow,
      leakageRatePerHour: rates.leakage,
      netRatePerHour: net,
      leakageSource: rates.leakageSource,
      outwardFlow: flowRunning && flow !== undefined ? flow.id : null,
      accessState: accessNow().state,
      mode: activity.mode,
      activeUpkeep: running.map((entry) => entry.commitment.id),
    });

    at = endsAt;

    /* 6. Expiries and pool boundaries, reported where they happened. */
    for (const commitment of sheddingOrder) {
      if (shutdownIds.has(commitment.id)) continue;
      if (commitment.endsAt === undefined) continue;
      if (Math.abs(commitment.endsAt - at) > BOUNDARY_EPSILON_MS) continue;

      emit(at, "upkeep-expired", commitment.id);
    }

    const scale = Math.max(1, maximumAura) * POOL_BOUNDARY_TOLERANCE;

    const filled = maximumAura - current <= scale;
    const wasFull = maximumAura - startingAura <= scale;

    if (filled && !wasFull) emit(at, "aura-full", "");

    if (isEmpty(current) && !isEmpty(startingAura)) emit(at, "aura-empty", "");
  }

  emit(interval.endedAt, "interval-end", "");

  /* ── Assembly ─────────────────────────────────────────────────────── */

  const elapsedHours = intervalHours(interval);

  const recoveryBySource: readonly AuraRecoveryContribution[] =
    [...contributions.values()].map((entry) => ({
      source: entry.source,
      context: entry.context,
      ratePerHour: entry.ratePerHour,
      multiplier: entry.multiplier,
      hours: entry.hours,
      potential: entry.potential,
      used: entry.used,
      discarded: entry.discarded,
    }));

  const recoveryUsed = potentialRecovery - discardedRecovery;

  const balance: AuraBalance = {
    recovery: recoveryUsed,
    recoveryBySource,
    physical: physicalTotal,
    deliberate: deliberateTotal,
    upkeep: upkeepTotal,
    outwardFlow: outwardFlowTotal,
    leakage: leakageTotal,
    forcedDrain: forcedDrainTotal,

    /*
     * The arithmetic sum of the terms above, before clamping — so a reader
     * adding up the fields gets this number. It differs from `currentChange`
     * exactly when the pool hit zero and could not pay for everything asked of
     * it, and `unmetDrain` is that difference.
     */
    net:
      recoveryUsed - physicalTotal - deliberateTotal - upkeepTotal -
      outwardFlowTotal - leakageTotal - forcedDrainTotal,
  };

  const previousFatigue = deriveFatigue({
    wakefulness: input.wakefulness,
    maximumAura,
    depletionFraction: pool.depletionFraction,
  });

  /*
   * Settled against the access in force at the END. A flow still running has
   * opened more Output than the ordinary state would; one that stopped has
   * handed the ordinary state back. Reconciling allocations against the wrong
   * one would shed or keep commitments the character's actual state does not
   * justify.
   */
  const endingAccessInput = flowRunning && flow !== undefined
    ? {
      ...context.access,
      override: {
        kind: "outward-flow" as const,
        source: flow.source,
        accessFraction: flow.output / budget.payload.physiologicalOutput,
      },
    }
    : context.access;

  const settled = settleAuraTransition(
    state,
    current,
    state.allocations,
    { ...context, access: endingAccessInput },
    root,
    [],
    balance,
  );

  if (!settled.success) return fail(settled.errors);

  /*
   * NORMALIZED on the way out, always.
   *
   * A caller who handed in a state with no sleep progress gets one back that
   * has it, so chaining advances is deterministic without the caller having to
   * know the field exists.
   */
  const wakefulness: CharacterWakefulnessState = {
    hoursAwake,
    consecutiveSleepHours: sleptHours,
  };

  const fatigue = deriveFatigue({
    wakefulness,
    maximumAura,
    depletionFraction: maximumAura > 0
      ? Math.min(1, Math.max(0, (maximumAura - current) / maximumAura))
      : 0,
  });

  /*
   * Charged for as long as it was actually up, not for the whole interval.
   *
   * `hours` used to be the enclosing interval's length for every commitment,
   * so an effect that started three hours into a four-hour advance reported
   * four hours against a one-hour cost and broke its own
   * `cost = ratePerHour x hours` invariant.
   */
  const upkeepCharges: readonly AuraUpkeepCharge[] = commitments
    .filter((commitment) => chargedById.has(commitment.id))
    .map((commitment) => {
      const baseRatePerHour = upkeepRatePerHour(
        commitment.baseRate,
        commitment.period,
      );

      return {
        id: commitment.id,
        source: commitment.source,
        baseRate: commitment.baseRate,
        period: commitment.period,
        baseRatePerHour,
        controlMultiplier: control.payload.multiplier,
        ratePerHour: baseRatePerHour * control.payload.multiplier,
        hours: chargedHoursById.get(commitment.id) ?? 0,
        cost: chargedById.get(commitment.id) ?? 0,
      };
    });

  root.output = {
    startedAt: interval.startedAt,
    endedAt: interval.endedAt,
    segments: segments.length,
    previousCurrent: state.current,
    current,
    recoveryPotential: potentialRecovery,
    recoveryUsed,
    recoveryDiscarded: discardedRecovery,
    physical: physicalTotal,
    deliberate: deliberateTotal,
    upkeep: upkeepTotal,
    outwardFlow: outwardFlowTotal,
    leakage: leakageTotal,
    forcedDrain: forcedDrainTotal,
    unmetDrain,
    previousHoursAwake: input.wakefulness.hoursAwake,
    hoursAwake,
    previousFatigue: previousFatigue.level,
    fatigue: fatigue.level,
    upkeepShutdowns: shutdowns.length,
    collapsed: collapse !== null,
    outwardFlowStopped: flowStop === null
      ? "no"
      : `${(flowStop as AuraOutwardFlowStop).reason}@${(flowStop as AuraOutwardFlowStop).at}`,
  };

  return {
    success: true,
    payload: {
      ...settled.payload,
      interval,
      elapsedHours,
      previousWakefulness: input.wakefulness,
      wakefulness,
      previousFatigue,
      fatigue,
      recovery: {
        potential: potentialRecovery,
        used: recoveryUsed,
        discarded: discardedRecovery,
      },
      upkeepCharges,
      upkeepShutdowns: shutdowns,
      collapse,
      leakageBySource: {
        halfOpen: halfOpenLeakageTotal,
        uncontained: uncontainedLeakageTotal,
        contained: containedLeakageTotal,
      },
      outwardFlowStop: flowStop,
      endingAccess: accessNow(),
      unmetDrain,
      events,
      segments,
    },
    trace: { root },
    warnings: settled.warnings,
  };
}
