/*
 * Advancing time — continuous rates, resolved at their boundaries.
 *
 *   A' = clamp(A + recovery - physical - deliberate - upkeep - leakage
 *              - forcedDrain, 0, A_max)
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
 *   2  resolve which upkeep is running, and shed what cannot be carried
 *   3  compute the rates that hold from here
 *   4  find the nearest boundary, mathematically
 *   5  integrate to it
 *   6  emit the event, and go again
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
  deriveFatigue,
  deriveStaminaExpenditureMultiplier,
  findWakefulnessStateIssues,
  sustainedActivityLoadPerHour,
  WAKING_HOURS_CLEARED_PER_HOUR_SLEPT,
  type CharacterWakefulnessState,
  type ResolvedFatigue,
  type WakefulnessMode,
} from "../body/endurance";
import { resolveStamina } from "../attributes/derived/resolution";

import { hasDeliberateAuraAccess } from "./access";
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
import { PHYSICAL_AURA_COST_COEFFICIENT } from "./expenditure";
import { deriveUncontainedLeakage, uncontainedCollapse } from "./leakage";
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
import type {
  AuraBalance,
  AuraRecoveryContribution,
  AuraRecoverySource,
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
}


/* ── Result ─────────────────────────────────────────────────────────────── */

export const AURA_TIMELINE_EVENT_KINDS = [
  "aura-full",
  "aura-empty",
  "upkeep-started",
  "upkeep-expired",
  "upkeep-shutdown",
  "collapse",
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
  readonly leakageRatePerHour: number;
  readonly netRatePerHour: number;

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
  readonly leakage: number;
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
      "per segment: next = clamp(current + (recovery - physical - upkeep - leakage) * dt, 0, maximum)",

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

  const { pool, access } = budget.payload;

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
    access,
  );

  root.children.push(timeline.trace.root);

  if (!timeline.success) return fail(timeline.errors);

  const control = deriveAuraControl(context.attributes.dex);

  root.children.push(control.trace.root);

  if (!control.success) return fail(control.errors);

  /* ── Fixed figures ────────────────────────────────────────────────── */

  const maximumAura = pool.maximum;
  const stamina = resolveStamina(context.attributes);
  const staminaMultiplier = deriveStaminaExpenditureMultiplier(stamina);
  const regenerationPerHour = deriveAuraRegeneration(context.attributes);

  /*
   * Whether this character bleeds AT ALL, from their resolved access.
   *
   * Kept apart from whether they are bleeding right now, because suppression
   * interrupts leakage without curing what causes it. Collapsing them into one
   * flag is what had a character in Zetsu still losing Aura through nodes the
   * Zetsu had closed — and, worse, still able to collapse from it.
   */
  const uncontainedByDefault = access.uncontained;

  const leakageRatePerHour = uncontainedByDefault
    ? deriveUncontainedLeakage(maximumAura, pool.current).ratePerHour
    : 0;

  const commitments = timeline.payload.upkeep;

  /*
   * Ordered once, worst-to-shed first, so that shedding is a pop rather than a
   * search and cannot depend on the order the caller assembled the array in.
   */
  const sheddingOrder = auraUpkeepSheddingOrder(commitments);

  /* ── Accumulators ─────────────────────────────────────────────────── */

  let current = pool.current;
  let hoursAwake = input.wakefulness.hoursAwake;
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
  const suppressedNow = (): boolean => activity.suppression !== undefined;

  const leakageNow = (): boolean =>
    uncontainedByDefault && collapse === null && !suppressedNow();

  const recoveryNow = () =>
    resolveAuraRecoveryMultiplier({
      mode: activity.mode,
      ...(activity.suppression === undefined
        ? {}
        : { suppression: activity.suppression }),
    });

  const ratesFor = (): SegmentRates => {
    const resolvedRecovery = recoveryNow();

    return {
      /*
       * UNCAPPED. Capping against missing Aura before netting is what made the
       * old answer depend on subdivision; the clamp below is what keeps the
       * pool honest.
       */
      recovery: regenerationPerHour * resolvedRecovery.multiplier,

      physical:
        maximumAura *
        PHYSICAL_AURA_COST_COEFFICIENT *
        sustainedLoadPerHour(activity) *
        staminaMultiplier,

      leakage: leakageNow() ? leakageRatePerHour : 0,
    };
  };

  /*
   * Deliberate access is a per-instant fact, because suppression can begin
   * mid-interval. A Zetsu closing over a running Ren does not refuse the hour;
   * it drops the Ren at the moment it closes.
   */
  const deliberatePermittedNow = (): boolean =>
    hasDeliberateAuraAccess(access) && !suppressedNow();

  const shutDown = (
    entry: RunningUpkeep,
    at: GameTimestamp,
    reason: AuraUpkeepShutdown["reason"],
  ): void => {
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

        if (event.kind === "physical") physicalTotal += event.amount;
        else if (event.kind === "deliberate") deliberateTotal += event.amount;
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
     */
    if (collapse === null && leakageNow() && current <= 0) {
      const unavoidable = ratesFor();

      if (
        unavoidable.recovery - unavoidable.physical - unavoidable.leakage <= 0
      ) {
        collapse = uncontainedCollapse(at);
        emit(at, "collapse", "uncontained-leakage-exhausted");
      }
    }

    if (at >= interval.endedAt - BOUNDARY_EPSILON_MS) break;

    /* 2. Access, then affordability. */
    let running = runningAt(at);

    if (!deliberatePermittedNow()) {
      for (const entry of running) shutDown(entry, at, "access-lost");

      running = [];
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
    if (current <= 0) {
      let upkeepRate = running.reduce(
        (sum, entry) => sum + entry.ratePerHour,
        0,
      );

      while (
        running.length > 0 &&
        rates.recovery - rates.physical - upkeepRate - rates.leakage < 0
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

    /* 3. The nearest boundary. */
    const boundaries: number[] = [interval.endedAt];

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

    const net = rates.recovery - rates.physical - upkeepRate - rates.leakage;

    if (net > 0 && current < maximumAura) {
      boundaries.push(
        at + hoursToDuration((maximumAura - current) / net),
      );
    }

    if (net < 0 && current > 0) {
      boundaries.push(at + hoursToDuration(current / -net));
    }

    const endsAt = Math.min(
      interval.endedAt,
      ...boundaries.filter((candidate) => candidate > at + BOUNDARY_EPSILON_MS),
    );

    const hours = (endsAt - at) / GAME_MILLISECONDS_PER_HOUR;

    /* 4. Integrate. */
    const startingAura = current;

    const unclamped = current + net * hours;

    current = Math.min(maximumAura, Math.max(0, unclamped));

    const segmentPotential = rates.recovery * hours;
    const segmentDiscarded = Math.max(0, unclamped - maximumAura);

    potentialRecovery += segmentPotential;
    physicalTotal += rates.physical * hours;
    upkeepTotal += upkeepRate * hours;
    leakageTotal += rates.leakage * hours;

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

    segments.push({
      startedAt: at,
      endedAt: endsAt,
      hours,
      startingAura,
      endingAura: current,
      recoveryRatePerHour: rates.recovery,
      physicalRatePerHour: rates.physical,
      upkeepRatePerHour: upkeepRate,
      leakageRatePerHour: rates.leakage,
      netRatePerHour: net,
      mode: activity.mode,
      activeUpkeep: running.map((entry) => entry.commitment.id),
    });

    at = endsAt;

    /* 5. Expiries and pool boundaries, reported where they happened. */
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

    if (current <= scale && startingAura > scale) emit(at, "aura-empty", "");
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
      leakageTotal - forcedDrainTotal,
  };

  const previousFatigue = deriveFatigue({
    wakefulness: input.wakefulness,
    maximumAura,
    depletionFraction: pool.depletionFraction,
  });

  const settled = settleAuraTransition(
    state,
    current,
    state.allocations,
    context,
    root,
    [],
    balance,
  );

  if (!settled.success) return fail(settled.errors);

  const wakefulness: CharacterWakefulnessState = { hoursAwake };

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
    leakage: leakageTotal,
    forcedDrain: forcedDrainTotal,
    unmetDrain,
    previousHoursAwake: input.wakefulness.hoursAwake,
    hoursAwake,
    previousFatigue: previousFatigue.level,
    fatigue: fatigue.level,
    upkeepShutdowns: shutdowns.length,
    collapsed: collapse !== null,
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
      unmetDrain,
      events,
      segments,
    },
    trace: { root },
    warnings: settled.warnings,
  };
}
