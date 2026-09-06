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
  findActivityCombinationIssues,
  sustainedActivityLoadPerHour,
  WAKING_HOURS_CLEARED_PER_HOUR_SLEPT,
  type ActivityExertionOverride,
  type CharacterWakefulnessState,
  type PhysicalExertionLoad,
  type ResolvedFatigue,
  type SustainedActivityLevel,
  type WakefulnessMode,
} from "../body/endurance";
import { resolveStamina } from "../attributes/derived/resolution";

import { hasDeliberateAuraAccess } from "./access";
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
  AuraSuppression,
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


/* ── Input ──────────────────────────────────────────────────────────────── */

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

  /** Named level, or a raw load per hour for a caller with a finer figure. */
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
 * replace the accumulated `discretePhysical` / `discreteDeliberate` /
 * `forcedDrain` totals the previous shape took, which could only ever be
 * smeared across the whole interval — so a strike landing in the last minute
 * of an eight-hour advance was charged as though it had been happening all
 * night, and could empty a pool that recovery would have refilled by then.
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

  for (const candidate of [
    input.activity,
    ...(input.activityChanges ?? []).map((change) => change.activity),
  ]) {
    const load = candidate.activityLoadPerHour;

    if (load === undefined || (Number.isFinite(load) && load >= 0)) continue;

    return fail([{
      code: "aura.exertion.load.invalid",
      message: "Sustained activity load must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(load) ? load : String(load),
    }]);
  }

  const activityIssues = [
    input.activity,
    ...(input.activityChanges ?? []).map((change) => change.activity),
  ].flatMap((activity) => findActivityCombinationIssues(activity));

  if (activityIssues.length > 0) return fail(activityIssues);

  const budget = resolveAuraBudget(state.current, context);

  root.children.push(budget.trace.root);

  if (!budget.success) return fail(budget.errors);

  const { pool, access } = budget.payload;

  const scheduled = [...(input.instantaneous ?? [])].sort(
    (left, right) => left.at - right.at,
  );

  for (const event of scheduled) {
    if (Number.isFinite(event.at) && Number.isFinite(event.amount) &&
      event.amount >= 0) {
      continue;
    }

    return fail([{
      code: "aura.time.event.invalid",
      message:
        "A scheduled Aura event needs a finite timestamp and a finite non-negative amount.",
      audience: "developer",
      required: "finite timestamp, finite amount >= 0",
      actual: `${String(event.at)} / ${String(event.amount)}`,
    }]);
  }

  const control = deriveAuraControl(context.attributes.dex);

  root.children.push(control.trace.root);

  if (!control.success) return fail(control.errors);

  /*
   * Suppression on an unawakened character is a caller bug for the same reason
   * an access override is: they have no principles to be suppressing anything
   * with.
   */
  for (const activity of [
    input.activity,
    ...(input.activityChanges ?? []).map((change) => change.activity),
  ]) {
    if (activity.suppression === undefined || access.awakened) continue;

    return fail([{
      code: "aura.time.suppression.unawakened",
      message: "An unawakened character has no Aura suppression to resolve.",
      audience: "developer",
      required: "awakened character",
      actual: activity.suppression.source,
    }]);
  }

  /* ── Fixed figures ────────────────────────────────────────────────── */

  const maximumAura = pool.maximum;
  const stamina = resolveStamina(context.attributes);
  const staminaMultiplier = deriveStaminaExpenditureMultiplier(stamina);
  const regenerationPerHour = deriveAuraRegeneration(context.attributes);

  const leakageRatePerHour = access.uncontained
    ? deriveUncontainedLeakage(maximumAura, pool.current).ratePerHour
    : 0;

  const commitments = input.upkeep ?? [];

  /*
   * Ordered once, worst-to-shed first, so that shedding is a pop rather than a
   * search and cannot depend on the order the caller assembled the array in.
   */
  const sheddingOrder = auraUpkeepSheddingOrder(commitments);

  /* ── Accumulators ─────────────────────────────────────────────────── */

  let current = pool.current;
  let hoursAwake = Math.max(0, input.wakefulness.hoursAwake);
  let activity = input.activity;

  let potentialRecovery = 0;
  let discardedRecovery = 0;
  let physicalTotal = 0;
  let deliberateTotal = 0;
  let upkeepTotal = 0;
  let leakageTotal = 0;
  let forcedDrainTotal = 0;
  let unmetDrain = 0;

  let collapse: AuraCollapse | null = null;
  let leaking = leakageRatePerHour > 0;

  const chargedById = new Map<string, number>();
  const shutdownIds = new Set<string>();
  const startedIds = new Set<string>();
  const shutdowns: AuraUpkeepShutdown[] = [];
  const events: AuraTimelineEvent[] = [];
  const segments: AuraTimeSegment[] = [];
  const recoveryBySource: AuraRecoveryContribution[] = [];

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

  const ratesFor = (at: GameTimestamp): SegmentRates => {
    const resolvedRecovery = resolveAuraRecoveryMultiplier({
      mode: activity.mode,
      ...(activity.suppression === undefined
        ? {}
        : { suppression: activity.suppression }),
    });

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

      leakage: leaking && !collapse ? leakageRatePerHour : 0,
    };
  };

  /*
   * Deliberate access is a per-instant fact, because suppression can begin
   * mid-interval. A Zetsu closing over a running Ren does not refuse the hour;
   * it drops the Ren at the moment it closes.
   */
  const deliberatePermittedNow = (): boolean =>
    hasDeliberateAuraAccess(access) && activity.suppression === undefined;

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

  let at = interval.startedAt;
  let scheduledIndex = 0;
  let activityIndex = 0;

  const changes = [...(input.activityChanges ?? [])].sort(
    (left, right) => left.at - right.at,
  );

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

    /* 1. Everything scheduled at, or already behind, this instant. */
    while (
      scheduledIndex < scheduled.length &&
      scheduled[scheduledIndex]!.at <= at + BOUNDARY_EPSILON_MS
    ) {
      const event = scheduled[scheduledIndex]!;

      scheduledIndex += 1;

      if (event.kind === "deliberate" && !deliberatePermittedNow()) {
        return fail([{
          code: "aura.access.deliberate.not_permitted",
          message:
            "A deliberate Aura expenditure was scheduled while the character cannot spend Aura deliberately.",
          audience: "player",
          required: "an access state permitting deliberate Aura expenditure",
          actual: access.state,
          resolution:
            "Resolve the action before suppression begins, or drop the deliberate component.",
        }]);
      }

      if (event.kind === "recovery") {
        const applied = Math.min(event.amount, maximumAura - current);

        current += applied;
        potentialRecovery += event.amount;
        discardedRecovery += event.amount - applied;
        recoveryBySource.push({
          source: "natural-regeneration",
          context: event.source,
          ratePerHour: 0,
          multiplier: 1,
          hours: 0,
          uncappedAmount: event.amount,
          amount: applied,
        });
      } else {
        /*
         * Reported in FULL, with whatever the empty pool could not cover in
         * unmetDrain — the same convention the continuous rates use. Reporting
         * only what was paid would make the balance's terms sum to the clamped
         * change and quietly hide a character being asked for more than they
         * had.
         */
        const paid = Math.min(event.amount, current);

        current -= paid;
        unmetDrain += event.amount - paid;

        if (event.kind === "physical") physicalTotal += event.amount;
        else if (event.kind === "deliberate") deliberateTotal += event.amount;
        else forcedDrainTotal += event.amount;
      }

      emit(event.at, "instantaneous", event.source);
    }

    /* Activity changes take effect at their instant. */
    while (
      activityIndex < changes.length &&
      changes[activityIndex]!.at <= at + BOUNDARY_EPSILON_MS
    ) {
      activity = changes[activityIndex]!.activity;
      activityIndex += 1;
      emit(at, "activity-changed", activity.mode);
    }

    /* Newly-started timed effects, reported once. */
    for (const commitment of sheddingOrder) {
      if (startedIds.has(commitment.id)) continue;
      if (!isUpkeepActiveAt(commitment, at)) continue;

      startedIds.add(commitment.id);

      if (commitment.startsAt !== undefined) {
        emit(at, "upkeep-started", commitment.id);
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
     * The rate test uses recovery against the two drains the character cannot
     * choose to stop. Upkeep can only make it more negative, so leaving it out
     * cannot turn a collapse into a non-collapse — and it lets this run before
     * upkeep has been resolved for the segment.
     */
    if (collapse === null && leaking && current <= 0) {
      const unavoidable = ratesFor(at);

      if (
        unavoidable.recovery - unavoidable.physical - unavoidable.leakage <= 0
      ) {
        collapse = uncontainedCollapse(at);
        emit(at, "collapse", "uncontained-leakage-exhausted");
        leaking = false;
      }
    }

    if (at >= interval.endedAt - BOUNDARY_EPSILON_MS) break;

    /* 2. Access, then affordability. */
    let running = runningAt(at);

    if (!deliberatePermittedNow()) {
      for (const entry of running) shutDown(entry, at, "access-lost");

      running = [];
    }

    const rates = ratesFor(at);

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

    /* 4. The nearest boundary. */
    const boundaries: number[] = [interval.endedAt];

    if (scheduledIndex < scheduled.length) {
      boundaries.push(scheduled[scheduledIndex]!.at);
    }

    if (activityIndex < changes.length) {
      boundaries.push(changes[activityIndex]!.at);
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

    /* 5. Integrate. */
    const startingAura = current;

    const unclamped = current + net * hours;

    current = Math.min(maximumAura, Math.max(0, unclamped));

    potentialRecovery += rates.recovery * hours;
    physicalTotal += rates.physical * hours;
    upkeepTotal += upkeepRate * hours;
    leakageTotal += rates.leakage * hours;

    discardedRecovery += Math.max(0, unclamped - maximumAura);
    unmetDrain += Math.max(0, -unclamped);

    for (const entry of running) {
      chargedById.set(
        entry.commitment.id,
        (chargedById.get(entry.commitment.id) ?? 0) + entry.ratePerHour * hours,
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

    /* 6. Expiries and pool boundaries, reported where they happened. */
    for (const commitment of sheddingOrder) {
      if (shutdownIds.has(commitment.id)) continue;
      if (commitment.endsAt === undefined) continue;
      if (Math.abs(commitment.endsAt - at) > BOUNDARY_EPSILON_MS) continue;

      emit(at, "upkeep-expired", commitment.id);
    }

    if (current >= maximumAura && startingAura < maximumAura) {
      emit(at, "aura-full", "");
    }

    if (current <= 0 && startingAura > 0) {
      emit(at, "aura-empty", "");
    }
  }

  emit(interval.endedAt, "interval-end", "");

  /* ── Assembly ─────────────────────────────────────────────────────── */

  const elapsedHours = intervalHours(interval);

  const resolvedRecovery = resolveAuraRecoveryMultiplier({
    mode: input.activity.mode,
    ...(input.activity.suppression === undefined
      ? {}
      : { suppression: input.activity.suppression }),
  });

  if (potentialRecovery > 0 && recoveryBySource.length === 0) {
    recoveryBySource.push({
      source: "natural-regeneration",
      context: resolvedRecovery.context,
      ratePerHour: regenerationPerHour,
      multiplier: resolvedRecovery.multiplier,
      hours: elapsedHours,
      uncappedAmount: potentialRecovery,
      amount: potentialRecovery - discardedRecovery,
    });
  }

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
        hours: elapsedHours,
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
    recoveryUsed: potentialRecovery - discardedRecovery,
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
        used: potentialRecovery - discardedRecovery,
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
