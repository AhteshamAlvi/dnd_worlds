/*
 * The character-time coordinator.
 *
 * ONE function applies an interval to a character, and everything
 * time-dependent about them goes through it: Aura recovery, sustained
 * expenditure, upkeep, Ren's outward flow, leakage, wakefulness, sleep debt and
 * the Fatigue that falls out of the last two.
 *
 * It exists because those things are not independent. The same eight hours
 * decide how much Aura came back AND how much sleep debt was paid, from one
 * answer to "what was the character doing"; Fatigue reads both. Three callers
 * each advancing one domain with its own idea of the span is three chances to
 * disagree, and the disagreement would be invisible.
 *
 *
 * WHAT IT REFUSES
 * ---------------
 *
 * An interval that does not begin exactly where the character's stored state
 * was last committed. That single check is what makes double-application
 * impossible: a system with both a live clock and a manual time skip will
 * eventually try to advance the same hour twice, and the alternative to
 * rejecting it is charging for it twice.
 *
 *
 * WHAT IT DOES NOT DO
 * -------------------
 *
 * It does not read the clock and it does not advance it. The interval arrives
 * from the caller, which got it from the clock, which is the only thing that
 * knows what time it is.
 *
 *
 * REN, AT ITS EXACT BOUNDARIES
 * ----------------------------
 *
 * A running Ren is projected — by its own adapter, never by an id compared
 * here — into a generic outward flow the Aura solver integrates. The solver
 * stops that flow at the first of its expiry, suppression or an empty reserve
 * and restores the ordinary access, Ten included, at that same instant; this
 * coordinator then records the stop on the activity at the instant the solver
 * reported. So the order at a shared timestamp is always: settle the rates up
 * to it, stop Ren once, release its Output, reproject access, resolve the
 * remainder — and a caller never re-runs the rest of the interval by hand.
 *
 * Adjusting and cancelling Ren are lifecycle transitions dated at their own
 * instants, applied between advances, exactly like every other transition.
 *
 *
 * SUPPRESSION, FROM ONE OWNER
 * ---------------------------
 *
 * Stored forced or involuntary suppression is projected by the Nen suppression
 * adapter; a running ordinary Zetsu by its own. Stored wins — it ended any
 * Zetsu at the opening instant — and the one result is laid on every activity
 * window. A caller does not restate either, and is refused if they try.
 *
 * Other running activities reach Aura as one generic active-Nen commitment
 * with the exact instant the last of them stops, so recovery changes there.
 * Under suppression only those EXPLICITLY authorized to function through it
 * may still be running; the rest were stopped by the path that suppressed the
 * character, or were assembled outside it and are refused.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../infrastructure/result";
import { createTraceNode } from "../../infrastructure/trace";
import { validateGameTimeInterval } from "../../time/interval";

import {
  hasDeliberateAuraAccess,
  resolveAuraAccess,
} from "../foundation/aura/access";
import { deriveMaximumAura } from "../foundation/aura/pool";
import { advanceAuraTime } from "../foundation/aura/time";
import {
  QUALIFYING_SLEEP_HOURS,
  consecutiveSleepHours,
} from "../foundation/body/endurance";
import { COLLAPSE_RECOVERY_SLEEP_HOURS } from "../foundation/nen/awakening/types";
import {
  advanceNenCollapseRecovery,
  settleNenCollapse,
} from "../nen/collapse";
import { projectNenUpkeep } from "../nen/upkeep";
import { NEN_AURA_RESTORE_REQUEST } from "../nen/protocol";
import type { RuntimeEvent } from "../../runtime/events";
import type { RuntimeRequest } from "../../runtime/requests";
import { GAME_MILLISECONDS_PER_HOUR } from "../../time/duration";
import {
  activeNenActivities,
  findNenActivity,
  nenActivityPermittedUnderSuppression,
  nenActivityRunsUntil,
  type NenActivityRuntime,
  type NenActivityStopCause,
  type NenSuppressionPolicy,
} from "../foundation/nen/runtime";
import {
  findNenStoredSuppressionIssues,
  nenCollapseRecoveryClock,
  nenStoredSuppression,
  nenStoredSuppressionPolicy,
} from "../nen/suppression";
import {
  activeRenActivity,
  renOutwardFlow,
  renStopCauseFor,
} from "../nen/ren";
import {
  activeZetsuActivity,
  zetsuStopCauseFor,
  zetsuSuppression,
} from "../nen/zetsu";
import {
  advanceNenActivities,
  stopNenActivity,
  type NenActivityTransition,
} from "../nen/runtime";
import { auraTransitionContext, resolveCharacter } from "../resolution";
import type { Character } from "../types";

import type {
  AdvanceCharacterTimeInput,
  CharacterTimeTransition,
} from "./types";


/*
 * What a running ordinary Zetsu lets keep running: the character chose it, so
 * an activity's own declared capability is enough.
 */
const VOLUNTARY_POLICY: NenSuppressionPolicy = { exemptions: "authorized" };


/**
 * Apply one authoritative interval to one character.
 *
 * The returned character is ready to persist: stored Aura and stored
 * wakefulness both brought up to `interval.endedAt`, with the temporal state
 * moved to match. Nothing is mutated — the input character is untouched, and a
 * caller that decides not to keep the result has lost nothing.
 */
export function advanceCharacterTime(
  input: AdvanceCharacterTimeInput,
): EngineResult<CharacterTimeTransition> {
  const { character, temporalState, interval, activity } = input;

  const root = createTraceNode({
    id: "character.time.advance",
    label: "Advance a character through an interval",
    formula:
      "temporalState.resolvedAt must equal interval.startedAt; every domain receives the same interval",
    inputs: {
      characterId: { value: character.id },
      resolvedAt: {
        value: Number.isFinite(temporalState.resolvedAt)
          ? temporalState.resolvedAt
          : String(temporalState.resolvedAt),
      },
      startedAt: {
        value: Number.isFinite(interval.startedAt)
          ? interval.startedAt
          : String(interval.startedAt),
      },
      endedAt: {
        value: Number.isFinite(interval.endedAt)
          ? interval.endedAt
          : String(interval.endedAt),
      },
    },
  });

  const fail = (
    errors: readonly EngineError[],
  ): EngineResult<CharacterTimeTransition> => {
    root.output = false;

    return {
      success: false,
      trace: { root },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  };

  const validInterval = validateGameTimeInterval(interval);

  root.children.push(validInterval.trace.root);

  if (!validInterval.success) return fail(validInterval.errors);

  /*
   * The synchronisation check, and the whole of it.
   *
   * An interval starting BEFORE the last commit would re-apply time already
   * charged for; one starting AFTER would skip time nobody accounted for. Both
   * are caller bugs and both are silent, so both are refused here rather than
   * absorbed.
   */
  if (temporalState.resolvedAt !== interval.startedAt) {
    return fail([{
      code: temporalState.resolvedAt > interval.startedAt
        ? "character.time.interval.stale"
        : "character.time.interval.gap",
      message: temporalState.resolvedAt > interval.startedAt
        ? "This interval has already been applied to this character, in whole or in part."
        : "This interval leaves a gap after the character's last resolved moment.",
      audience: "developer",
      subject: { kind: "character", id: character.id },
      required: temporalState.resolvedAt,
      actual: interval.startedAt,
      resolution:
        "Advance from the character's own resolvedAt, or project them forward to the interval's start first.",
    }]);
  }

  /*
   * Resolved once. Aura needs the physically-resolved stat block, the present
   * anatomy and its measurements, and the access state Nen implies; all four
   * come from one resolution rather than being assembled here, so a character
   * cannot be advanced against a different body than they resolve to.
   */
  const resolved = resolveCharacter(character);

  root.children.push(resolved.trace.root);

  if (!resolved.success) return fail(resolved.errors);

  const ordinaryContext = auraTransitionContext(
    resolved.payload.stats,
    resolved.payload.body,
    character.nen,
  );

  const self = { type: "character", id: character.id } as const;

  /*
   * The runtime, brought up to the interval's opening instant.
   *
   * Anything that expired in the gap since it was last described is stopped at
   * the instant it expired, and a Ren the character's authored state no
   * longer permits — unawakened, suppressed, sealed — is stopped at the
   * opening instant, because none of those facts can change inside an advance.
   * What remains is exactly what is running as the interval opens.
   */
  let openingActivities: NenActivityRuntime | undefined =
    input.activeEffects?.nenActivities;

  /*
   * Every stop this advance makes, in the order it made them, so the returned
   * transition reports all of them rather than only the last step's.
   */
  const runtimeSteps: NenActivityTransition[] = [];

  /*
   * Suppression stored on the character, as generic Aura vocabulary. It drives
   * recovery on its own; a caller never restates it.
   */
  const storedIssues = findNenStoredSuppressionIssues(character.nen);

  if (storedIssues.length > 0) return fail(storedIssues);

  const stored = nenStoredSuppression(character.nen);

  /*
   * What the stored suppression lets keep running among some activities —
   * capability AND this instance's exemption, or nothing at all. Null when
   * nothing is stored.
   */
  const storedPolicy = (
    runtime: NenActivityRuntime,
  ): NenSuppressionPolicy | null =>
    nenStoredSuppressionPolicy(character.nen, activeNenActivities(runtime));

  /*
   * ONE restoration streak, for sleep and for a blackout alike.
   *
   * Eight continuous qualifying hours restore the reserve, whether they were
   * slept or blacked out, and a collapse recovery ends exactly where that
   * happens. The streak the character already carries is what says how much of
   * it is behind them, so a character who collapses mid-sleep — or sleeps
   * through a blackout — continues one process instead of starting a second.
   */
  const restorationRemaining = Math.max(
    0,
    QUALIFYING_SLEEP_HOURS - consecutiveSleepHours(character.wakefulness),
  );

  const clock = nenCollapseRecoveryClock(
    character.nen,
    interval.startedAt,
    restorationRemaining,
  );

  const unconsciousness = clock === null || clock.completesAt <= interval.startedAt
    ? null
    : {
      source: clock.source,
      ...(clock.completesAt < interval.endedAt
        ? { endsAt: clock.completesAt }
        : {}),
    };

  if (openingActivities !== undefined) {
    /*
     * A stored suppression was in force before the interval opened, so what it
     * does not permit stops at the opening instant — everything under an
     * involuntary one, everything not explicitly authorized under a forced one.
     */
    const opened = advanceNenActivities(openingActivities, {
      to: interval.startedAt,
      by: self,
      ...(storedPolicy(openingActivities) === null
        ? {}
        : { suppression: storedPolicy(openingActivities)! }),
    });

    root.children.push(opened.trace.root);

    if (!opened.success) return fail(opened.errors);

    openingActivities = opened.payload.runtime;
    runtimeSteps.push(opened.payload);

    /*
     * Each principle adapter answers for its own activity. Neither answer is
     * formed here, and neither activity is resumed later: a stop at the
     * opening instant is an end.
     */
    const illegalActivities = [
      {
        activity: activeRenActivity(openingActivities),
        cause: renStopCauseFor(character.nen),
        detail: "Ren is not legal for this character's Nen state",
      },
      {
        activity: activeZetsuActivity(openingActivities),
        cause: zetsuStopCauseFor(character.nen),
        detail: "ordinary Zetsu is not legal for this character's Nen state",
      },
    ];

    for (const { activity: running, cause, detail } of illegalActivities) {
      if (running === undefined || cause === null) continue;

      const stopped = stopNenActivity(openingActivities, {
        activityId: running.id,
        cause,
        at: interval.startedAt,
        by: self,
        detail,
      });

      root.children.push(stopped.trace.root);

      if (!stopped.success) return fail(stopped.errors);

      openingActivities = stopped.payload.runtime;
      runtimeSteps.push(stopped.payload);
    }
  }

  /*
   * The running Ren, as the generic flow Aura integrates. Null when none is.
   */
  const flow = openingActivities === undefined
    ? null
    : renOutwardFlow(openingActivities);

  /*
   * What holds the nodes shut for this interval, from ONE owner.
   *
   * Stored suppression first — involuntary over forced, which the Nen adapter
   * decides — and ordinary Zetsu only when nothing is stored, since a stored
   * state ended any Zetsu at the opening instant above. Null when the
   * character is unsuppressed as the interval opens.
   */
  const zetsu = openingActivities === undefined
    ? null
    : zetsuSuppression(openingActivities);

  /*
   * Upkeep, judged against its stated owners and projected: inherited
   * capability, ends clipped to the owner's, and — under a stored forced
   * suppression — which commitments this instance exempts.
   */
  const upkeep = input.activeEffects?.upkeep === undefined
    ? null
    : projectNenUpkeep({
      nen: character.nen,
      upkeep: input.activeEffects.upkeep,
      suppliedRuntime: input.activeEffects.nenActivities,
      openingRuntime: openingActivities,
      storedPolicy: stored === null
        ? null
        : nenStoredSuppressionPolicy(
          character.nen,
          openingActivities === undefined ? [] : activeNenActivities(openingActivities),
        ),
      startedAt: interval.startedAt,
    });

  if (upkeep !== null && !upkeep.ok) return fail(upkeep.errors);

  const exemptUpkeepIds = upkeep?.ok ? upkeep.exemptUpkeepIds : undefined;

  const suppression = stored === null
    ? zetsu?.suppression ?? null
    : {
      ...stored,
      ...(exemptUpkeepIds === undefined ? {} : { exemptUpkeepIds }),
    };

  /*
   * Every OTHER Nen activity running as the interval opens.
   *
   * Generic, and asked of the runtime's own query — nothing here reads a
   * `definitionId`. Ten never appears, because passive derived state is not an
   * activity. Ren is excluded because its flow already makes the solver treat
   * every segment it runs across as active Nen. A suppressing activity is
   * excluded because shutting the nodes is not using Nen.
   */
  const users = openingActivities === undefined
    ? []
    : activeNenActivities(openingActivities)
      .filter((one) => one.id !== flow?.id && one.id !== zetsu?.activityId);

  if (suppression !== null) {
    /*
     * One owner of the suppression. A caller restating it through the
     * activity — duplicating the stored or running one, or contradicting it —
     * is describing the same closed nodes a second time, and the two could
     * disagree about when they opened.
     */
    const restated = [
      activity.initial,
      ...(activity.changes ?? []).map((change) => change?.activity),
    ].some((one) => one?.suppression !== undefined);

    if (restated) {
      return fail([{
        code: "character.time.suppression.contradictory",
        message:
          "This character's nodes are already held shut by their stored or running suppression; the interval's activity cannot supply suppression as well.",
        audience: "developer",
        subject: { kind: "character", id: character.id },
        required: "no activity suppression while a suppression is derived",
        actual: suppression.source,
        resolution:
          "Drop the activity's suppression; the character's state supplies it.",
      }]);
    }

    /*
     * Only what is EXPLICITLY authorized, under a suppression that permits it,
     * may still be running here. The legal paths — activation beside a
     * suppressing activity, and the opening advance under a stored one — never
     * leave anything else, so anything else was assembled outside them.
     */
    const policy = openingActivities === undefined
      ? null
      : storedPolicy(openingActivities) ?? VOLUNTARY_POLICY;

    if (
      policy !== null &&
      users.some((one) => !nenActivityPermittedUnderSuppression(one, policy))
    ) {
      return fail([{
        code: "character.time.suppression.active_nen.unresolved",
        message:
          "A Nen activity not authorized to function through suppression is still running while the character's nodes are held shut.",
        audience: "developer",
        subject: { kind: "character", id: character.id },
        required: "only explicitly authorized activities under a suppression permitting them",
        actual: suppression.source,
      }]);
    }
  }

  /*
   * The generic activities as Aura's active-Nen commitment, with the instant
   * the last of them stops on its own — so recovery changes at that timestamp,
   * not at the next advance. Authorized only when EVERY one of them is.
   */
  const ends = openingActivities === undefined
    ? []
    : users.map((one) => nenActivityRunsUntil(openingActivities!, one));

  const activeNen = users.length === 0
    ? null
    : {
      ids: users.map((one) => one.id),
      functionsThroughSuppression: users.every((one) =>
        nenActivityPermittedUnderSuppression(
          one,
          (openingActivities === undefined ? null : storedPolicy(openingActivities)) ??
            VOLUNTARY_POLICY,
        )
      ),
      ...(ends.some((end) => end === null)
        ? {}
        : { endsAt: Math.max(...(ends as number[])) }),
    };

  const suppressedActivity = <T extends { readonly suppression?: unknown }>(
    one: T,
  ): T => suppression === null ? one : { ...one, suppression };

  /*
   * A stored suppression already arrives on the access input as an override;
   * a running Zetsu lays its own, and only when nothing is stored, so the two
   * never stack.
   */
  const context = zetsu === null || stored !== null
    ? ordinaryContext
    : {
      ...ordinaryContext,
      access: { ...ordinaryContext.access, override: zetsu.override },
    };

  const aura = advanceAuraTime({
    state: character.aura,
    wakefulness: character.wakefulness,
    context,
    interval,
    activity: suppressedActivity(activity.initial),
    ...(activity.changes === undefined
      ? {}
      : {
        activityChanges: activity.changes.map((change) => ({
          ...change,
          activity: suppressedActivity(change.activity),
        })),
      }),
    ...(upkeep?.ok ? { upkeep: upkeep.commitments } : {}),
    ...(input.activeEffects?.instantaneous === undefined
      ? {}
      : { instantaneous: input.activeEffects.instantaneous }),
    ...(flow === null ? {} : { outwardFlow: flow }),
    ...(activeNen === null ? {} : { activeNen }),
    ...(unconsciousness === null
      ? {}
      : { qualifyingUnconsciousness: unconsciousness }),

    /* A collapse inside the interval blacks out for exactly its recovery. */
    collapseBlackout: { hours: COLLAPSE_RECOVERY_SLEEP_HOURS },
  });

  root.children.push(aura.trace.root);

  if (!aura.success) return fail(aura.errors);

  /*
   * The active runtime, carried across the SAME interval.
   *
   * After Aura, and against the access the advance actually produced. An
   * activity that needs deliberate projection cannot survive a character being
   * emptied into an involuntary Zetsu, and asking Aura first is what lets this
   * be told rather than guessed — `deliberateAccess` is a fact the advance
   * settled, not a second opinion formed here.
   *
   * Decommitting whatever stops costs nothing. The Aura state above is already
   * final; nothing below it touches the reserve.
   */
  let nenActivities: CharacterTimeTransition["nenActivities"];

  if (openingActivities !== undefined) {
    let carried = openingActivities;

    /*
     * Activities that stopped inside the interval for a reason only the solver
     * could see, each at the solver's own instant:
     *
     *   the flow     the reserve could not pay for it, or suppression closed
     *                over it (an expiry is left to the lifecycle advance below,
     *                which dates it at the same instant from the same function)
     *   an upkeep    the upkeep an activity is paid through shut down, so the
     *                activity stops with it — unfunded, or closed out by the
     *                suppression that shut the upkeep
     *
     * Applied in time order, each after carrying the runtime to its instant,
     * and each owner at most once. An `owner-stopped` shutdown is the
     * CONSEQUENCE of one of these and stops nothing of its own.
     */
    const stops: {
      readonly at: number;
      readonly activityId: string;
      readonly cause: NenActivityStopCause;
      readonly detail: string;
    }[] = [];

    const flowStop = aura.payload.outwardFlowStop;

    if (flowStop !== null && flowStop.reason !== "ended") {
      stops.push({
        at: flowStop.at,
        activityId: flowStop.id,
        cause: flowStop.reason === "unfunded" ? "unfunded" : "suppressed",
        detail: flowStop.reason === "unfunded"
          ? "the reserve could no longer fund the selected Output"
          : "suppression closed the nodes",
      });
    }

    const projected = new Map(
      (upkeep?.ok ? upkeep.commitments : []).map((one) => [one.id, one]),
    );

    for (const shutdown of aura.payload.upkeepShutdowns) {
      if (shutdown.reason === "owner-stopped") continue;

      const provenance = projected.get(shutdown.id)?.provenance;

      if (provenance?.kind !== "activity") continue;

      stops.push({
        at: shutdown.at,
        activityId: provenance.activityId,
        cause: shutdown.reason === "insufficient-aura"
          ? "unfunded"
          : suppression !== null || aura.payload.collapse !== null
            ? "suppressed"
            : "access-lost",
        detail: `its upkeep ${shutdown.id} shut down`,
      });
    }

    stops.sort((left, right) => left.at - right.at);

    for (const stop of stops) {
      if (stop.at > carried.at) {
        const caughtUp = advanceNenActivities(carried, { to: stop.at, by: self });

        root.children.push(caughtUp.trace.root);

        if (!caughtUp.success) return fail(caughtUp.errors);

        carried = caughtUp.payload.runtime;
        runtimeSteps.push(caughtUp.payload);
      }

      if (findNenActivity(carried, stop.activityId)?.condition !== "active") continue;

      const stopped = stopNenActivity(carried, {
        activityId: stop.activityId,
        cause: stop.cause,
        at: stop.at,
        by: self,
        detail: stop.detail,
      });

      root.children.push(stopped.trace.root);

      if (!stopped.success) return fail(stopped.errors);

      carried = stopped.payload.runtime;
      runtimeSteps.push(stopped.payload);
    }

    const access = resolveAuraAccess(ordinaryContext.access);

    root.children.push(access.trace.root);

    if (!access.success) return fail(access.errors);

    /*
     * Access AFTER the interval, not before it.
     *
     * A character emptied into an involuntary Zetsu part-way through eight
     * hours cannot still be holding a technique at the end of them, and
     * `collapse` is the advance's own record that it happened. Reading the
     * access the character started with would leave every activity standing
     * through the exact event that should have ended them.
     */
    const advancedActivities = advanceNenActivities(
      carried,
      {
        to: interval.endedAt,
        by: self,
        deliberateAccess: aura.payload.collapse === null &&
          hasDeliberateAuraAccess(access.payload),

        /*
         * A collapse inside the interval is an involuntary suppression from
         * its own instant, and nothing runs through one.
         */
        ...(aura.payload.collapse === null
          ? {}
          : { suppression: { exemptions: "none", since: aura.payload.collapse.at } }),
      },
    );

    root.children.push(advancedActivities.trace.root);

    if (!advancedActivities.success) return fail(advancedActivities.errors);

    runtimeSteps.push(advancedActivities.payload);

    nenActivities = {
      runtime: advancedActivities.payload.runtime,
      before: null,
      after: null,
      consequences: runtimeSteps.flatMap((step) =>
        step.after === null ? step.consequences : [step.after, ...step.consequences]
      ),
      events: runtimeSteps.flatMap((step) => step.events),
    };
  }

  /*
   * The collapse-recovery clock, owned here.
   *
   * A collapse the solver found is settled into the stored state at its own
   * instant — an involuntary Zetsu and an eight-hour recovery beginning there.
   * Any recovery in progress then accumulates exactly the unconscious hours
   * this interval covered, and completes at its exact instant: the same one
   * the solver ended the unconsciousness at, and the one the stored clock
   * snaps sliced advances to. A host never advances the recovery separately.
   */
  let nen = character.nen;
  const awakeningEvents: RuntimeEvent[] = [];
  const awakeningRequests: RuntimeRequest[] = [];

  const awakeningContext = (operation: string, at: number) => ({
    owner: { domain: "character", id: character.id } as const,
    operationId: `${character.id}:${operation}@${at}`,
    occurredAt: at,
    nen,
    requirements: resolved.payload.requirementContext,
  });

  const collapse = aura.payload.collapse;

  if (collapse !== null) {
    const settled = settleNenCollapse(
      awakeningContext("collapse", collapse.at),
      { collapse },
    );

    root.children.push(settled.trace.root);

    if (!settled.success) return fail(settled.errors);

    nen = settled.payload.state;
    awakeningEvents.push(...settled.payload.events);
    awakeningRequests.push(...settled.payload.requests);
  }

  /*
   * A collapse begins the restoration where the character stood: they cannot
   * have been sleeping, since a qualifying sleeper does not collapse, so the
   * streak reset when they woke and the blackout starts it from there.
   */
  const recoveryClock = nenCollapseRecoveryClock(
    nen,
    collapse?.at ?? interval.startedAt,
    collapse === null ? restorationRemaining : QUALIFYING_SLEEP_HOURS,
  );

  if (recoveryClock !== null) {
    const from = Math.max(interval.startedAt, recoveryClock.beganAt);
    const completes = recoveryClock.completesAt <= interval.endedAt;
    const to = completes
      ? Math.max(from, recoveryClock.completesAt)
      : interval.endedAt;

    const remaining =
      recoveryClock.requiredSleepHours - recoveryClock.accumulatedSleepHours;

    /*
     * The recovery's stored hours MIRROR the restoration streak rather than
     * counting separately: what it takes on is however much of the streak this
     * interval added. Completing hands over exactly what is owed — or, if
     * float residue would leave the sum a hair short, the whole requirement,
     * which the transition caps.
     */
    const hours = completes
      ? (recoveryClock.accumulatedSleepHours + remaining >=
          recoveryClock.requiredSleepHours
        ? remaining
        : recoveryClock.requiredSleepHours)
      : Math.max(
        0,
        consecutiveSleepHours(aura.payload.wakefulness) -
          recoveryClock.accumulatedSleepHours,
      );

    const advancedRecovery = advanceNenCollapseRecovery(
      awakeningContext("collapse-recovery", to),
      {
        qualifyingSleepHours: hours,
        maximumAura: deriveMaximumAura(resolved.payload.stats),
        at: to,
      },
    );

    root.children.push(advancedRecovery.trace.root);

    if (!advancedRecovery.success) return fail(advancedRecovery.errors);

    nen = advancedRecovery.payload.state;
    awakeningEvents.push(...advancedRecovery.payload.events);

    /*
     * The restore-to-maximum the completion asks Aura for is already applied:
     * the unconsciousness it ended was qualifying sleep, and the solver topped
     * the reserve off at that same instant. Reporting it again would invite a
     * second restore.
     */
    awakeningRequests.push(
      ...advancedRecovery.payload.requests.filter((request) =>
        request.kind !== NEN_AURA_RESTORE_REQUEST
      ),
    );
  }

  const advanced: Character = {
    ...character,
    aura: aura.payload.state,
    wakefulness: aura.payload.wakefulness,
    nen,
  };

  root.output = {
    startedAt: interval.startedAt,
    endedAt: interval.endedAt,
    currentAura: aura.payload.current,
    hoursAwake: aura.payload.wakefulness.hoursAwake,
    fatigue: aura.payload.fatigue.level,
  };

  return {
    success: true,
    payload: {
      interval,
      previousTemporalState: temporalState,
      temporalState: { resolvedAt: interval.endedAt },
      character: advanced,
      aura: aura.payload,
      wakefulness: aura.payload.wakefulness,
      fatigue: aura.payload.fatigue,
      ...(nenActivities === undefined ? {} : { nenActivities }),
      ...(awakeningEvents.length === 0 && awakeningRequests.length === 0
        ? {}
        : { awakening: { events: awakeningEvents, requests: awakeningRequests } }),
    },
    trace: { root },
    warnings: aura.warnings,
  };
}
