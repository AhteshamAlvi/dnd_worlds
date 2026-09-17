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
 * ZETSU, AS GENERIC SUPPRESSION
 * -----------------------------
 *
 * A running ordinary Zetsu is projected by its own adapter into a generic
 * suppression: a voluntary suppression every activity window carries, and a
 * suppressed access override. This coordinator passes both through and keeps
 * the Zetsu activity out of the active-Nen fact; the recovery that follows is
 * Aura's table, and nothing about Zetsu's Mastery is read here. A caller does
 * not restate it through the activity, and is refused if they try.
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
import { advanceAuraTime } from "../foundation/aura/time";
import {
  activeNenActivities,
  type NenActivityRuntime,
  type NenActivityStopCause,
} from "../foundation/nen/runtime";
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

  if (openingActivities !== undefined) {
    const opened = advanceNenActivities(openingActivities, {
      to: interval.startedAt,
      by: self,
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
   * A running activity holding the nodes shut, as generic suppression. Null
   * when none is.
   */
  const suppressing = openingActivities === undefined
    ? null
    : zetsuSuppression(openingActivities);

  /*
   * Whether some OTHER Nen activity is running as the interval opens.
   *
   * Generic, and asked of the runtime's own query — nothing here reads a
   * `definitionId`. Ten never appears, because passive derived state is not an
   * activity. Ren is excluded because its flow already makes the solver treat
   * every segment it runs across as active Nen, and stop doing so at the exact
   * instant it stops. A suppressing activity is excluded because shutting the
   * nodes is not using Nen; its recovery is the suppression branch.
   *
   * The opening fact only, for these others: a caller who wants the rest of
   * the hour resolved differently says so with an activity change.
   */
  const activeNenUse = openingActivities !== undefined &&
    activeNenActivities(openingActivities)
      .some((activity) =>
        activity.id !== flow?.id && activity.id !== suppressing?.activityId
      );

  if (suppressing !== null) {
    /*
     * One owner of the suppression. A caller restating it through the
     * activity — voluntary or forced — is describing the same closed nodes a
     * second time, and the two could disagree about when they opened.
     */
    const restated = [
      activity.initial,
      ...(activity.changes ?? []).map((change) => change?.activity),
    ].some((one) => one?.suppression !== undefined);

    if (restated) {
      return fail([{
        code: "character.time.suppression.contradictory",
        message:
          "This character's nodes are already held shut by a running activity; the interval's activity cannot supply suppression as well.",
        audience: "developer",
        subject: { kind: "character", id: character.id },
        required: "no activity suppression while a suppressing activity runs",
        actual: suppressing.activityId,
        resolution:
          "Drop the activity's suppression; the running activity supplies it.",
      }]);
    }

    /*
     * An activity that runs without deliberate access may outlast the
     * shutdown, but nothing yet says what recovering while shut AND using it
     * is. Refused rather than resolved by picking one branch. (A caller's own
     * `activeNenUse` beside the suppression is refused by Aura's timeline.)
     */
    if (activeNenUse) {
      return fail([{
        code: "character.time.suppression.active_nen.unresolved",
        message:
          "A Nen activity is still running while the character's nodes are held shut, and no recovery rule covers that combination.",
        audience: "developer",
        subject: { kind: "character", id: character.id },
        required: "no active Nen use while a suppressing activity runs",
        actual: suppressing.activityId,
      }]);
    }
  }

  const suppressedActivity = <T extends { readonly suppression?: unknown }>(
    one: T,
  ): T =>
    suppressing === null ? one : { ...one, suppression: suppressing.suppression };

  /*
   * The suppressed override replaces nothing: a stored forced state would have
   * ended the suppressing activity at the opening instant above, so the
   * ordinary access arrives here without an override of its own.
   */
  const context = suppressing === null
    ? ordinaryContext
    : {
      ...ordinaryContext,
      access: { ...ordinaryContext.access, override: suppressing.override },
    };

  const aura = advanceAuraTime({
    state: character.aura,
    wakefulness: character.wakefulness,
    context,
    interval,
    activity: activeNenUse
      ? { ...activity.initial, activeNenUse: true }
      : suppressedActivity(activity.initial),
    ...(activity.changes === undefined
      ? {}
      : {
        activityChanges: activity.changes.map((change) => ({
          ...change,
          activity: suppressedActivity(change.activity),
        })),
      }),
    ...(input.activeEffects?.upkeep === undefined
      ? {}
      : { upkeep: input.activeEffects.upkeep }),
    ...(input.activeEffects?.instantaneous === undefined
      ? {}
      : { instantaneous: input.activeEffects.instantaneous }),
    ...(flow === null ? {} : { outwardFlow: flow }),
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
     * Ren stopped inside the interval for a reason only the solver could see:
     * the reserve could not pay for it, or suppression closed over it. The
     * stop is recorded at the solver's instant, once. An expiry is left to the
     * lifecycle advance below, which dates it at the same instant from the
     * same function.
     */
    const flowStop = aura.payload.outwardFlowStop;

    if (flowStop !== null && flowStop.reason !== "ended") {
      const cause: NenActivityStopCause = flowStop.reason === "unfunded"
        ? "unfunded"
        : "suppressed";

      const stopped = stopNenActivity(carried, {
        activityId: flowStop.id,
        cause,
        at: flowStop.at,
        by: self,
        detail: flowStop.reason === "unfunded"
          ? "the reserve could no longer fund the selected Output"
          : "suppression closed the nodes",
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

  const advanced: Character = {
    ...character,
    aura: aura.payload.state,
    wakefulness: aura.payload.wakefulness,
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
    },
    trace: { root },
    warnings: aura.warnings,
  };
}
