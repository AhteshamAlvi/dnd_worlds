/*
 * What happens to a fresh awakener who leaks their whole reserve away.
 *
 * The Aura time solver already detects this. It integrates the leak, notices
 * the reserve reaching zero, and returns an `AuraCollapse` — a set of typed
 * REQUESTS addressed to the domains that own the consequences, because Aura
 * owns neither unconsciousness nor Zetsu. This file is what answers them, and
 * it does not re-derive a single figure the solver already produced.
 *
 *
 * THE SEQUENCE, AND WHY THE FORCED ZETSU IS APPLIED AT THE COLLAPSE
 * -----------------------------------------------------------------
 *
 *   0 Aura  →  the body shuts its own nodes, the character blacks out, and an
 *              eight-hour qualifying-sleep recovery begins
 *   8 hours →  the reserve is restored to full, the character wakes, and they
 *              wake INSIDE the collapse-origin forced Zetsu
 *
 * The forced Zetsu is applied at the collapse rather than at the waking, and
 * that is load-bearing rather than a shortcut. Something durable has to stop
 * the leak, and "Current Aura is 0" is not it: the moment sleep restores any
 * Aura at all, an owner who is still uncontained would leak it straight back
 * out and could never accumulate the eight hours. So the state that stops the
 * bleeding has to exist for the whole of the recovery, which means it begins
 * when the bleeding stops — and the engine's own collapse request set has
 * always said so, asking for `end-uncontained-state` and `forced-zetsu`
 * together at the moment of collapse.
 *
 * The character therefore wakes awakened, full, conscious and in a
 * collapse-origin forced Zetsu, which is the state the rules describe. It is
 * applied ONCE: the recovery's `completedAt` is set once and never cleared, so
 * advancing past the threshold again completes nothing and emits nothing.
 *
 *
 * WHAT RECOVERY DOES NOT DO
 * -------------------------
 *
 * It does not heal Body trauma. An abrupt awakening that broke something left
 * an Injury, Body owns it, and eight hours of sleep is not a treatment — the
 * recovery restores the Aura reserve and nothing else about the character.
 *
 * It does not grant Zetsu Mastery. The character has been held shut by their
 * own physiology; they have learned nothing, and their Zetsu rank is whatever
 * it was, which is almost always none.
 *
 *
 * THE RELEASE TRAP
 * ----------------
 *
 * Lifting the forced Zetsu reopens the nodes. If the character still has no
 * usable Ten, that is exactly the state they collapsed from, and the leak
 * starts again — five minutes to the next collapse. If they have since learned
 * Ten, release is safe and the trap is over. The guard is the whole reason the
 * release is a transition rather than an array filter.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import { createTraceNode } from "../../infrastructure/trace";
import type { RuntimeEvent } from "../../runtime/events";
import type { RuntimeRequest } from "../../runtime/requests";
import { transitionOutcome } from "../../runtime/transition";
import type { GameTimestamp } from "../../time/types";

import type { AuraCollapse } from "../foundation/aura/leakage";
import {
  findForcedState,
  forcedStatesOfOrigin,
  hasEverAwakened,
  isAwakened,
} from "../foundation/nen/awakening/state";
import {
  COLLAPSE_RECOVERY_SLEEP_HOURS,
  type NenCollapseRecovery,
  type NenForcedState,
} from "../foundation/nen/awakening/types";
import { findAwakeningStateIssues } from "../foundation/nen/awakening/validation";
import { validateNenState } from "../foundation/nen/nen";
import type { NenState } from "../foundation/nen/types";

import { isNenUncontained } from "./access";
import { failAwakening, emitContextOf } from "./preflight";
import {
  auraRestoreRequest,
  noAwakeningChanges,
  type NenAwakeningChanges,
  type NenAwakeningContext,
  type NenAwakeningEvent,
  type NenAwakeningTransitionResult,
} from "./protocol";
import {
  applyForcedState,
  awakeningEvent,
  collapseRecoveryId,
  conditionRequest,
  forcedStateId,
  LEAKING_CONDITION_ID,
  releaseForcedState,
  sequenceAwakeningEvents,
  UNCONSCIOUS_CONDITION_ID,
} from "./settlement";


/* ── Collapse ───────────────────────────────────────────────────────────── */

export interface NenCollapseRequest {
  /*
   * The collapse the Aura time solver produced.
   *
   * Taken rather than detected. Aura owns the integration that found the zero,
   * and a second detector here would be a second opinion about the same
   * instant — free to disagree about whether an interval that ended exactly on
   * empty collapsed.
   */
  readonly collapse: AuraCollapse;
}


/**
 * Settle an uncontained collapse: unconscious, shut, and owing eight hours.
 *
 * Refused — with nothing changed — for a character who is not in the state
 * that produces one. A collapse handed to an unawakened character, or to one
 * already inside a collapse recovery, is a caller replaying an event rather
 * than a character collapsing twice.
 */
export function settleNenCollapse(
  context: NenAwakeningContext,
  request: NenCollapseRequest,
): NenAwakeningTransitionResult {
  const state = context.nen.awakening;

  const root = createTraceNode({
    id: "nen.awakening.collapse",
    label: "Settle an uncontained Aura collapse",
    formula:
      "0 Aura -> forced Zetsu (leak stops) + unconsciousness + an eight-hour qualifying-sleep recovery",
    inputs: {
      condition: { value: state.condition },
      reason: { value: request.collapse?.reason ?? "absent" },
      at: {
        value: Number.isFinite(request.collapse?.at)
          ? request.collapse.at
          : String(request.collapse?.at),
      },
    },
  });

  const issues: EngineError[] = [...findAwakeningStateIssues(state)];

  if (issues.length > 0) return failAwakening(root, issues);

  if (
    request.collapse === undefined ||
    request.collapse.reason !== "uncontained-leakage-exhausted" ||
    !Number.isFinite(request.collapse.at)
  ) {
    return failAwakening(root, [{
      code: "nen.awakening.collapse.invalid",
      message:
        "Settling a collapse requires the collapse the Aura time solver produced.",
      audience: "developer",
      required: "{ reason: \"uncontained-leakage-exhausted\", at }",
      actual: String(request.collapse?.reason),
    }]);
  }

  if (!isAwakened(context.nen.awakening)) {
    return failAwakening(root, [{
      code: "nen.awakening.collapse.not-awakened",
      message: "Only an awakened character's open nodes can bleed them dry.",
      audience: "developer",
      required: "an awakened character",
      actual: state.condition,
    }]);
  }

  /*
   * A character who is not uncontained cannot have leaked to zero, so a
   * collapse for one is a stale event being replayed. Refusing it is what
   * makes "collapse events cannot duplicate" true of the state rather than
   * only of a well-behaved caller.
   */
  if (!isNenUncontained(context.nen)) {
    return failAwakening(root, [{
      code: "nen.awakening.collapse.not-uncontained",
      message:
        "This character is not leaking Aura, so they cannot have collapsed from it.",
      audience: "developer",
      required: "an uncontained character",
      actual: state.forcedStates.length > 0
        ? "already in a forced state"
        : "contained",
    }]);
  }

  if (state.collapseRecovery !== null) {
    return failAwakening(root, [{
      code: "nen.awakening.collapse.already-recovering",
      message: "This character is already inside a collapse recovery.",
      audience: "developer",
      required: "no collapse recovery in progress",
      actual: state.collapseRecovery.id,
    }]);
  }

  const at = request.collapse.at;
  const zetsuId = forcedStateId(context.operationId, "uncontained-collapse");

  const forced: NenForcedState = {
    id: zetsuId,
    kind: "forced-zetsu",
    origin: "uncontained-collapse",
    appliedAt: at,

    /*
     * The body did this, not a teacher and not a piece of content. Recorded as
     * provenance so the release guard and a sheet can both say why the nodes
     * are shut.
     */
    source: { type: "nen-collapse", id: "uncontained-leakage-exhausted" },

    /*
     * No exemptions. Nothing works through a collapse Zetsu — not even an
     * Ability that works through an instinctive one, because that exception
     * names the forced state it was granted against and this is a different
     * one.
     */
    exemptions: [],
  };

  const recovery: NenCollapseRecovery = {
    id: collapseRecoveryId(context.operationId),
    beganAt: at,
    requiredSleepHours: COLLAPSE_RECOVERY_SLEEP_HOURS,
    accumulatedSleepHours: 0,
    completedAt: null,
  };

  const next: NenState = {
    ...context.nen,
    awakening: {
      ...applyForcedState(state, forced),
      collapseRecovery: recovery,
    },
  };

  const validated = validateNenState(next);

  root.children.push(validated.trace.root);

  if (!validated.success) return failAwakening(root, validated.errors);

  const emit = { ...emitContextOf(context), occurredAt: at };

  const changes: NenAwakeningChanges = {
    ...noAwakeningChanges(state.condition),
    condition: state.condition,
    leakageStopped: true,
    forcedStatesApplied: [zetsuId],
    collapseRecoveryStarted: true,
  };

  root.output = {
    forcedZetsu: zetsuId,
    recovery: recovery.id,
    requiredSleepHours: recovery.requiredSleepHours,
  };

  const events: readonly RuntimeEvent[] = sequenceAwakeningEvents([
    awakeningEvent(emit, "nen-collapse", request.collapse.reason),
    awakeningEvent(emit, "nen-leakage-stopped", zetsuId),
    awakeningEvent(emit, "nen-forced-zetsu-applied", zetsuId),
    awakeningEvent(emit, "nen-collapse-recovery-started", recovery.id),
  ]);

  const requests: readonly RuntimeRequest[] = [
    conditionRequest(
      emit,
      false,
      LEAKING_CONDITION_ID,
      "The nodes shut when the reserve emptied.",
    ),
    conditionRequest(
      emit,
      true,
      UNCONSCIOUS_CONDITION_ID,
      "Collapsed from uncontained Aura leakage.",
    ),
  ];

  return {
    success: true,
    payload: transitionOutcome(next, changes, events, requests),
    trace: { root },
    warnings: [],
  };
}


/* ── Recovery ───────────────────────────────────────────────────────────── */

export interface NenCollapseRecoveryRequest {
  /*
   * Qualifying sleep hours the HOST confirms happened.
   *
   * Supplied rather than read from a clock, because what counts as qualifying
   * sleep is a Body and GM judgement and this domain has no window into it.
   * Accumulated, never reset: a character woken after three hours resumes at
   * three, because three hours of sleep happened and nothing untold them.
   */
  readonly qualifyingSleepHours: number;

  /*
   * The character's Maximum Aura, for the restore request.
   *
   * Supplied because Aura derives it from Attributes and this domain must not
   * re-derive it — a second derivation is a second answer, and the one that is
   * wrong would silently set the reserve to a figure the pool validator then
   * rejects.
   */
  readonly maximumAura: number;

  readonly at: GameTimestamp;
}


/**
 * Add qualifying sleep to a collapse recovery, and complete it at eight hours.
 *
 * Returns a SUCCESS whether or not the threshold was reached — accumulating
 * three of the eight hours is a real thing that happened, not a failed
 * attempt. `changes.collapseRecoveryCompleted` is what says which it was.
 */
export function advanceNenCollapseRecovery(
  context: NenAwakeningContext,
  request: NenCollapseRecoveryRequest,
): NenAwakeningTransitionResult {
  const state = context.nen.awakening;

  const root = createTraceNode({
    id: "nen.awakening.collapse-recovery",
    label: "Advance a collapse recovery",
    formula:
      "accumulated + qualifying sleep >= 8 hours -> reserve restored, awake, still in the collapse Zetsu",
    inputs: {
      condition: { value: state.condition },
      qualifyingSleepHours: {
        value: Number.isFinite(request.qualifyingSleepHours)
          ? request.qualifyingSleepHours
          : String(request.qualifyingSleepHours),
      },
      accumulated: { value: state.collapseRecovery?.accumulatedSleepHours ?? 0 },
    },
  });

  const issues: EngineError[] = [...findAwakeningStateIssues(state)];

  if (issues.length > 0) return failAwakening(root, issues);

  const recovery = state.collapseRecovery;

  if (recovery === null) {
    return failAwakening(root, [{
      code: "nen.awakening.collapse-recovery.absent",
      message: "This character is not inside a collapse recovery.",
      audience: "developer",
      required: "a collapse recovery in progress",
      actual: "none",
    }]);
  }

  /*
   * Completed once, and once only. Advancing past the threshold a second time
   * completes nothing, restores nothing and emits nothing — which is what
   * makes duplicate recovery events impossible rather than merely unlikely.
   */
  if (recovery.completedAt !== null) {
    return failAwakening(root, [{
      code: "nen.awakening.collapse-recovery.already-complete",
      message: "This collapse recovery has already completed.",
      audience: "developer",
      required: "an incomplete collapse recovery",
      actual: String(recovery.completedAt),
    }]);
  }

  if (
    !Number.isFinite(request.qualifyingSleepHours) ||
    request.qualifyingSleepHours < 0
  ) {
    return failAwakening(root, [{
      code: "nen.awakening.collapse-recovery.hours.invalid",
      message: "Qualifying sleep must be a finite, non-negative number of hours.",
      audience: "developer",
      required: "finite number >= 0",
      actual: String(request.qualifyingSleepHours),
    }]);
  }

  if (!Number.isFinite(request.maximumAura) || request.maximumAura < 0) {
    return failAwakening(root, [{
      code: "nen.awakening.collapse-recovery.maximum-aura.invalid",
      message: "Completing a collapse recovery needs the character's Maximum Aura.",
      audience: "developer",
      required: "finite number >= 0",
      actual: String(request.maximumAura),
    }]);
  }

  if (!Number.isFinite(request.at)) {
    return failAwakening(root, [{
      code: "nen.awakening.collapse-recovery.timestamp.invalid",
      message: "A collapse recovery advances at a finite game timestamp.",
      audience: "developer",
      required: "finite GameTimestamp",
      actual: String(request.at),
    }]);
  }

  const accumulated =
    recovery.accumulatedSleepHours + request.qualifyingSleepHours;

  const complete = accumulated >= recovery.requiredSleepHours;

  const next: NenState = {
    ...context.nen,
    awakening: {
      ...state,
      collapseRecovery: {
        ...recovery,
        accumulatedSleepHours: accumulated,
        completedAt: complete ? request.at : null,
      },
    },
  };

  const validated = validateNenState(next);

  root.children.push(validated.trace.root);

  if (!validated.success) return failAwakening(root, validated.errors);

  const emit = { ...emitContextOf(context), occurredAt: request.at };

  const changes: NenAwakeningChanges = {
    ...noAwakeningChanges(state.condition),
    condition: state.condition,
    collapseRecoveryCompleted: complete,
  };

  root.output = {
    accumulatedSleepHours: accumulated,
    requiredSleepHours: recovery.requiredSleepHours,
    complete,
  };

  if (!complete) {
    return {
      success: true,
      payload: transitionOutcome(next, changes, [], []),
      trace: { root },
      warnings: [],
    };
  }

  /*
   * The character wakes INSIDE the collapse Zetsu they collapsed into. It is
   * not re-applied here — it has been holding their nodes shut for the whole
   * eight hours, which is the only reason the sleep restored anything.
   */
  const events = sequenceAwakeningEvents([
    awakeningEvent(emit, "nen-collapse-recovery-completed", recovery.id),
  ]);

  const requests: readonly RuntimeRequest[] = [
    /*
     * Aura owns the pool. This asks for the restore and reports the figure it
     * asked for; whether the pool ends up there is Aura's answer, not this
     * domain's claim.
     */
    auraRestoreRequest(emit, request.maximumAura),

    conditionRequest(
      emit,
      false,
      UNCONSCIOUS_CONDITION_ID,
      "Eight hours of qualifying sleep completed the collapse recovery.",
    ),
  ];

  return {
    success: true,
    payload: transitionOutcome(next, changes, events, requests),
    trace: { root },
    warnings: [],
  };
}


/* ── Release ────────────────────────────────────────────────────────────── */

export interface NenForcedStateReleaseRequest {
  readonly forcedStateId: string;
}


/**
 * Lift a forced state, and let the consequences follow.
 *
 * The NARROW transition Phase 5 owes and nothing more. It does not start,
 * stop, switch or price any principle; it removes one forced state and reports
 * what the character's Aura access then is.
 *
 * Releasing a collapse Zetsu from a character who still has no usable Ten
 * reopens exactly the trap they fell into: `leakageStarted` comes back true,
 * the `leaking` Condition is asked for again, and they have five minutes.
 * Releasing it from a character who has since learned Ten is safe, and the
 * difference is read from their effective Ten Mastery rather than from
 * anything stored on the forced state.
 */
export function releaseNenForcedState(
  context: NenAwakeningContext,
  request: NenForcedStateReleaseRequest,
): NenAwakeningTransitionResult {
  const state = context.nen.awakening;

  const root = createTraceNode({
    id: "nen.awakening.forced-state.release",
    label: "Release a Nen forced state",
    formula:
      "release -> nodes reopen; uncontained unless usable Ten has been learned since",
    inputs: {
      condition: { value: state.condition },
      forcedStateId: { value: request.forcedStateId ?? "absent" },
    },
  });

  const issues: EngineError[] = [...findAwakeningStateIssues(state)];

  if (issues.length > 0) return failAwakening(root, issues);

  const forced = typeof request.forcedStateId === "string"
    ? findForcedState(state, request.forcedStateId)
    : null;

  if (forced === null) {
    return failAwakening(root, [{
      code: "nen.awakening.forced-state.not-found",
      message: "This character is not being held in that forced state.",
      audience: "developer",
      required: "a forced state this character is in",
      actual: String(request.forcedStateId),
    }]);
  }

  /*
   * A collapse Zetsu cannot be lifted while the recovery it belongs to is
   * still running. The character is unconscious and owes sleep; releasing it
   * would reopen the nodes of somebody who cannot do anything about it, and
   * would restart the leak that put them there in the first place.
   */
  if (
    forced.origin === "uncontained-collapse" &&
    state.collapseRecovery !== null &&
    state.collapseRecovery.completedAt === null
  ) {
    return failAwakening(root, [{
      code: "nen.awakening.forced-state.recovery-incomplete",
      message:
        "A collapse-origin forced Zetsu cannot be released before its recovery completes.",
      audience: "player",
      required: `${state.collapseRecovery.requiredSleepHours} hours of qualifying sleep`,
      actual: state.collapseRecovery.accumulatedSleepHours,
    }]);
  }

  const next: NenState = {
    ...context.nen,
    awakening: releaseForcedState(state, forced.id),
  };

  const validated = validateNenState(next);

  root.children.push(validated.trace.root);

  if (!validated.success) return failAwakening(root, validated.errors);

  const emit = emitContextOf(context);

  /*
   * Asked of the state AFTER the release, which is the only way to get the
   * answer right: whether the trap reopens depends on the Ten the character
   * has now, not on anything recorded when the state was applied.
   */
  const leaking = isNenUncontained(next);

  const changes: NenAwakeningChanges = {
    ...noAwakeningChanges(state.condition),
    condition: state.condition,
    forcedStatesReleased: [forced.id],
    leakageStarted: leaking,
  };

  root.output = { released: forced.id, leaking };

  const events: NenAwakeningEvent[] = [
    awakeningEvent(emit, "nen-forced-zetsu-released", forced.id),
  ];

  if (leaking) {
    events.push(awakeningEvent(emit, "nen-leakage-started", forced.id));
  }

  return {
    success: true,
    payload: transitionOutcome(
      next,
      changes,
      sequenceAwakeningEvents(events),
      leaking
        ? [conditionRequest(
          emit,
          true,
          LEAKING_CONDITION_ID,
          "Released a forced Zetsu with no usable Ten.",
        )]
        : [],
    ),
    trace: { root },
    warnings: [],
  };
}


/** Every collapse-origin forced state this character is being held in. */
export function collapseForcedStates(
  nen: NenState,
): readonly NenForcedState[] {
  return forcedStatesOfOrigin(nen.awakening, "uncontained-collapse");
}


/** Whether this character has ever been through an awakening at all. */
export function hasAwakeningHistory(nen: NenState): boolean {
  return hasEverAwakened(nen.awakening);
}
