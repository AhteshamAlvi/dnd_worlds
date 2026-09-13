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
 *              wake INSIDE the involuntary Zetsu
 *
 * INVOLUNTARY, never forced. Nobody imposes this state: the body does it to
 * itself when the reserve runs out, which is why there is no source to
 * authorise lifting it and why the character may lift it themselves once the
 * eight hours are served. A forced Zetsu is the other mechanic entirely —
 * imposed from outside, released only on its source's authority — and the two
 * were one type until the repair separated them.
 *
 * The involuntary Zetsu begins at the collapse rather than at the waking, and
 * that is load-bearing rather than a shortcut. Something durable has to stop
 * the leak, and "Current Aura is 0" is not it: the moment sleep restores any
 * Aura at all, an owner who is still uncontained would leak it straight back
 * out and could never accumulate the eight hours. So the state that stops the
 * bleeding has to exist for the whole of the recovery, which means it begins
 * when the bleeding stops.
 *
 * The character therefore wakes awakened, full, conscious and in an
 * involuntary Zetsu, which is the state the rules describe. It is applied
 * ONCE: the recovery's `completedAt` is set once and never cleared, so
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
 * Lifting the involuntary Zetsu reopens the nodes. If the character still has
 * no usable Ten, that is exactly the state they collapsed from, and the leak
 * starts again — five minutes to the next collapse. If they have since learned
 * Ten, release is safe and the trap is over. The guard is the whole reason the
 * release is a transition rather than an array filter.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import {
  contributionSourceKey,
  isSameContributionSource,
} from "../../infrastructure/contribution-source";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import type { RuntimeEvent } from "../../runtime/events";
import type { RuntimeRequest } from "../../runtime/requests";
import { transitionOutcome } from "../../runtime/transition";
import type { GameTimestamp } from "../../time/types";

import type { AuraCollapse } from "../foundation/aura/leakage";
import {
  findSuppression,
  hasEverAwakened,
  isAwakened,
  suppressionOfKind,
} from "../foundation/nen/awakening/state";
import {
  COLLAPSE_RECOVERY_SLEEP_HOURS,
  type NenCollapseRecovery,
  type NenInvoluntaryZetsuState,
  type NenSuppressionKind,
  type NenSuppressionState,
} from "../foundation/nen/awakening/types";
import { findAwakeningStateIssues } from "../foundation/nen/awakening/validation";
import { validateNenState } from "../foundation/nen/nen";
import type { NenState } from "../foundation/nen/types";

import { isNenUncontained } from "./access";
import {
  emitContextOf,
  failAwakening,
  findRequestShapeIssues,
  findRoutingMetadataIssues,
} from "./preflight";
import {
  auraRestoreRequest,
  noAwakeningChanges,
  suppressionEventKind,
  type NenAwakeningChanges,
  type NenAwakeningContext,
  type NenAwakeningEvent,
  type NenAwakeningTransitionResult,
} from "./protocol";
import {
  applySuppression,
  awakeningEvent,
  collapseRecoveryId,
  conditionRequest,
  LEAKING_CONDITION_ID,
  removeSuppression,
  sequenceAwakeningEvents,
  suppressionId,
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
      "0 Aura -> involuntary Zetsu (leak stops) + unconsciousness + an eight-hour qualifying-sleep recovery",
    inputs: {
      condition: { value: state.condition },
    },
  });

  const shape = findRequestShapeIssues(
    request,
    "nen.awakening.collapse.request.invalid",
    "Settling a collapse requires a request record.",
    "{ collapse }",
  );

  if (shape.length > 0) return failAwakening(root, shape);

  root.inputs.reason = {
    value: describeDiagnosticValue(request.collapse?.reason ?? "absent"),
  };
  root.inputs.at = { value: describeDiagnosticValue(request.collapse?.at) };

  const issues: EngineError[] = [...findAwakeningStateIssues(state)];

  if (issues.length > 0) return failAwakening(root, issues);

  const routing = findRoutingMetadataIssues(context);

  if (routing.length > 0) return failAwakening(root, routing);

  if (
    request.collapse === null ||
    typeof request.collapse !== "object" ||
    request.collapse.reason !== "uncontained-leakage-exhausted" ||
    !Number.isFinite(request.collapse.at)
  ) {
    return failAwakening(root, [{
      code: "nen.awakening.collapse.invalid",
      message:
        "Settling a collapse requires the collapse the Aura time solver produced.",
      audience: "developer",
      required: "{ reason: \"uncontained-leakage-exhausted\", at }",
      actual: describeDiagnosticValue(request.collapse),
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
      actual: state.suppression.length > 0
        ? "already suppressed"
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
  const zetsuId = suppressionId(context.operationId, "involuntary-zetsu");
  const recoveryId = collapseRecoveryId(context.operationId);

  /*
   * INVOLUNTARY, not forced. Nobody imposed this: the body shut its own nodes
   * because the reserve ran out, so there is no source to authorise lifting it
   * and no Ability it could ever have exempted. The character lifts it
   * themselves, once the eight hours are served.
   */
  const involuntary: NenInvoluntaryZetsuState = {
    id: zetsuId,
    kind: "involuntary-zetsu",
    appliedAt: at,
    cause: "uncontained-aura-collapse",
    recoveryId,
  };

  const recovery: NenCollapseRecovery = {
    id: recoveryId,
    beganAt: at,
    requiredSleepHours: COLLAPSE_RECOVERY_SLEEP_HOURS,
    accumulatedSleepHours: 0,
    completedAt: null,
  };

  const next: NenState = {
    ...context.nen,
    awakening: {
      ...applySuppression(state, involuntary),
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
    suppressionApplied: [{ id: zetsuId, kind: "involuntary-zetsu" }],
    collapseRecoveryStarted: true,
  };

  root.output = {
    involuntaryZetsu: zetsuId,
    recovery: recovery.id,
    requiredSleepHours: recovery.requiredSleepHours,
  };

  const events: readonly RuntimeEvent[] = sequenceAwakeningEvents([
    awakeningEvent(emit, "nen-collapse", request.collapse.reason),
    awakeningEvent(emit, "nen-leakage-stopped", zetsuId),
    awakeningEvent(emit, "nen-involuntary-zetsu-applied", zetsuId),
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
      "accumulated + qualifying sleep >= 8 hours -> reserve restored, awake, still in the involuntary Zetsu",
    inputs: {
      condition: { value: state.condition },
      accumulated: { value: state.collapseRecovery?.accumulatedSleepHours ?? 0 },
    },
  });

  const shape = findRequestShapeIssues(
    request,
    "nen.awakening.collapse-recovery.request.invalid",
    "Advancing a collapse recovery requires a request record.",
    "{ qualifyingSleepHours, maximumAura, at }",
  );

  if (shape.length > 0) return failAwakening(root, shape);

  root.inputs.qualifyingSleepHours = {
    value: describeDiagnosticValue(request.qualifyingSleepHours),
  };

  const issues: EngineError[] = [...findAwakeningStateIssues(state)];

  if (issues.length > 0) return failAwakening(root, issues);

  const routingIssues = findRoutingMetadataIssues(context);

  if (routingIssues.length > 0) return failAwakening(root, routingIssues);

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
      actual: describeDiagnosticValue(recovery.completedAt),
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
      actual: describeDiagnosticValue(request.qualifyingSleepHours),
    }]);
  }

  if (!Number.isFinite(request.maximumAura) || request.maximumAura < 0) {
    return failAwakening(root, [{
      code: "nen.awakening.collapse-recovery.maximum-aura.invalid",
      message: "Completing a collapse recovery needs the character's Maximum Aura.",
      audience: "developer",
      required: "finite number >= 0",
      actual: describeDiagnosticValue(request.maximumAura),
    }]);
  }

  if (!Number.isFinite(request.at)) {
    return failAwakening(root, [{
      code: "nen.awakening.collapse-recovery.timestamp.invalid",
      message: "A collapse recovery advances at a finite game timestamp.",
      audience: "developer",
      required: "finite GameTimestamp",
      actual: describeDiagnosticValue(request.at),
    }]);
  }

  /*
   * Sleep cannot be served before the collapse that demanded it. A recovery
   * completing at an instant earlier than it began would record a completedAt
   * the history could never have produced, and the ordering is checked against
   * the recovery's own stored start rather than against a second clock.
   */
  if (request.at < recovery.beganAt) {
    return failAwakening(root, [{
      code: "nen.awakening.collapse-recovery.timestamp.before-start",
      message: "A collapse recovery cannot advance to before it began.",
      audience: "developer",
      required: `>= ${recovery.beganAt}`,
      actual: request.at,
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
   * The character wakes INSIDE the involuntary Zetsu they collapsed into. It
   * is not re-applied here — it has been holding their nodes shut for the
   * whole eight hours, which is the only reason the sleep restored anything.
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

/*
 * Two release transitions, because there are two mechanics.
 *
 * There used to be one, `releaseNenForcedState`, and it was wrong in a way the
 * type system could not see: it located a state by id, checked a single guard
 * that applied only to the collapse case, and filtered. An instinctive
 * forced Zetsu — described three files away as something the character "did
 * not choose and cannot lift" — went straight through it.
 *
 * Splitting the API is what makes each rule enforceable. Neither entry point
 * can act on the other's kind, so a caller cannot reach the wrong guard by
 * passing the wrong id.
 */

function suppressionKindMismatch(
  expected: NenSuppressionKind,
  actual: NenSuppressionKind,
): EngineError {
  return {
    code: expected === "involuntary-zetsu"
      ? "nen.suppression.involuntary.wrong-kind"
      : "nen.suppression.forced.wrong-kind",
    message: expected === "involuntary-zetsu"
      ? "This is an externally imposed forced Zetsu; only its source can lift it."
      : "This is the body's own involuntary Zetsu; it has no source to authorise a release.",
    audience: "developer",
    required: expected,
    actual,
  };
}


/*
 * What a release did to the character's containment, and the events it owes.
 *
 * Shared because the CONSEQUENCE of lifting a suppression is identical
 * whichever kind it was — the nodes reopen, and whether that restarts the leak
 * depends on the Ten the character has NOW. Only the authority to lift it
 * differs, and that is settled before this runs.
 */
function settleRelease(
  context: NenAwakeningContext,
  root: TraceNode,
  held: NenSuppressionState,
): NenAwakeningTransitionResult {
  const state = context.nen.awakening;

  const next: NenState = {
    ...context.nen,
    awakening: removeSuppression(state, held.id),
  };

  const validated = validateNenState(next);

  root.children.push(validated.trace.root);

  if (!validated.success) return failAwakening(root, validated.errors);

  const emit = emitContextOf(context);

  /*
   * Asked of the state AFTER the release, which is the only way to get the
   * answer right: whether the trap reopens depends on the Ten the character
   * has now, not on anything recorded when the suppression was applied.
   */
  const leaking = isNenUncontained(next);

  const changes: NenAwakeningChanges = {
    ...noAwakeningChanges(state.condition),
    condition: state.condition,
    suppressionReleased: [{ id: held.id, kind: held.kind }],
    leakageStarted: leaking,
  };

  root.output = { released: held.id, kind: held.kind, leaking };

  const events: NenAwakeningEvent[] = [
    awakeningEvent(
      emit,
      suppressionEventKind(held.kind, "released"),
      held.id,
    ),
  ];

  if (leaking) {
    events.push(awakeningEvent(emit, "nen-leakage-started", held.id));
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
          "Released a Zetsu with no usable Ten.",
        )]
        : [],
    ),
    trace: { root },
    warnings: [],
  };
}


function locateSuppression(
  context: NenAwakeningContext,
  root: TraceNode,
  id: unknown,
): NenSuppressionState | NenAwakeningTransitionResult {
  const state = context.nen.awakening;

  const issues: EngineError[] = [...findAwakeningStateIssues(state)];

  if (issues.length > 0) return failAwakening(root, issues);

  const routing = findRoutingMetadataIssues(context);

  if (routing.length > 0) return failAwakening(root, routing);

  const held = typeof id === "string" ? findSuppression(state, id) : null;

  if (held === null) {
    return failAwakening(root, [{
      code: "nen.suppression.not-found",
      message: "This character is not being held in that suppression state.",
      audience: "developer",
      required: "a suppression state this character is in",
      actual: describeDiagnosticValue(id),
    }]);
  }

  return held;
}


function isTransitionResult(
  value: NenSuppressionState | NenAwakeningTransitionResult,
): value is NenAwakeningTransitionResult {
  return "success" in value;
}


export interface NenSuppressionReleaseRequest {
  readonly suppressionId: string;
}


/**
 * Lift the body's own involuntary Zetsu. The character's to lift.
 *
 * Refused before the eight hours are served: the character is unconscious and
 * owes sleep, and reopening the nodes of somebody who can do nothing about it
 * would restart the leak that put them there.
 *
 * Afterwards it is theirs to take. Doing so without usable Ten walks straight
 * back into the trap — `leakageStarted` comes back true, the leaking Condition
 * is asked for again, and they have five minutes. With Ten it is safe, and the
 * difference is read from their effective Ten Mastery rather than from
 * anything stored on the suppression.
 */
export function releaseInvoluntaryZetsu(
  context: NenAwakeningContext,
  request: NenSuppressionReleaseRequest,
): NenAwakeningTransitionResult {
  const state = context.nen.awakening;

  const root = createTraceNode({
    id: "nen.suppression.involuntary.release",
    label: "Release an involuntary Zetsu",
    formula:
      "recovery complete -> nodes reopen; uncontained unless usable Ten has been learned since",
    inputs: {
      condition: { value: state.condition },
      suppressionId: {
        value: describeDiagnosticValue(request?.suppressionId ?? "absent"),
      },
    },
  });

  const shape = findRequestShapeIssues(
    request,
    "nen.suppression.request.invalid",
    "Releasing a suppression requires a request record.",
    "{ suppressionId }",
  );

  if (shape.length > 0) return failAwakening(root, shape);

  const located = locateSuppression(context, root, request.suppressionId);

  if (isTransitionResult(located)) return located;

  if (located.kind !== "involuntary-zetsu") {
    return failAwakening(root, [
      suppressionKindMismatch("involuntary-zetsu", located.kind),
    ]);
  }

  /*
   * The recovery it NAMES, not whichever recovery happens to be in progress.
   * Validation keeps the two in step; reading the link is what makes the guard
   * about this suppression rather than about the character.
   */
  const recovery = state.collapseRecovery;

  if (
    recovery === null ||
    recovery.id !== located.recoveryId ||
    recovery.completedAt === null
  ) {
    return failAwakening(root, [{
      code: "nen.suppression.involuntary.recovery-incomplete",
      message:
        "An involuntary Zetsu cannot be released before its recovery completes.",
      audience: "player",
      required: `${recovery?.requiredSleepHours ?? COLLAPSE_RECOVERY_SLEEP_HOURS} hours of qualifying sleep`,
      actual: recovery?.accumulatedSleepHours ?? 0,
    }]);
  }

  return settleRelease(context, root, located);
}


export interface NenForcedZetsuReleaseRequest {
  readonly suppressionId: string;

  /*
   * Who is lifting it.
   *
   * Required, and checked against the state's own release authority. A forced
   * Zetsu is imposed from outside; the character cannot end it, and neither
   * can a caller who simply knows its id.
   */
  readonly authorization: ContributionSourceRef;
}


/**
 * Lift an externally imposed forced Zetsu, on the authority that imposed it.
 *
 * The minimal authorisation contract Phase 5 needs. Today the only forced
 * Zetsu is the one an instinctive awakening arrives inside, whose authority is
 * whoever authorised that awakening — so a GM ruling can undo a GM ruling, and
 * nothing else can. When Abilities and statuses gain the power to impose one,
 * they supply their own authority and this transition already serves them.
 *
 * Reversion is the one other path that lifts a forced Zetsu, and legitimately:
 * it removes the awakening the Zetsu was attached to, so there is nothing left
 * to hold shut.
 */
export function releaseForcedZetsu(
  context: NenAwakeningContext,
  request: NenForcedZetsuReleaseRequest,
): NenAwakeningTransitionResult {
  const state = context.nen.awakening;

  const root = createTraceNode({
    id: "nen.suppression.forced.release",
    label: "Release a forced Zetsu",
    formula:
      "the imposing source authorises it -> nodes reopen; uncontained unless Ten is usable",
    inputs: {
      condition: { value: state.condition },
      suppressionId: {
        value: describeDiagnosticValue(request?.suppressionId ?? "absent"),
      },
      authorization: {
        value: describeDiagnosticValue(request?.authorization?.id ?? "absent"),
      },
    },
  });

  const shape = findRequestShapeIssues(
    request,
    "nen.suppression.request.invalid",
    "Releasing a suppression requires a request record.",
    "{ suppressionId, authorization }",
  );

  if (shape.length > 0) return failAwakening(root, shape);

  const located = locateSuppression(context, root, request.suppressionId);

  if (isTransitionResult(located)) return located;

  if (located.kind !== "forced-zetsu") {
    return failAwakening(root, [
      suppressionKindMismatch("forced-zetsu", located.kind),
    ]);
  }

  const authorization = request.authorization;

  if (
    authorization === undefined ||
    authorization === null ||
    typeof authorization.type !== "string" ||
    authorization.type.trim().length === 0 ||
    typeof authorization.id !== "string" ||
    authorization.id.trim().length === 0
  ) {
    return failAwakening(root, [{
      code: "nen.suppression.forced.authorization.invalid",
      message:
        "Releasing a forced Zetsu requires the source authorising it.",
      audience: "developer",
      required: "{ type, id }",
      actual: describeDiagnosticValue(authorization),
    }]);
  }

  if (!isSameContributionSource(authorization, located.release.authority)) {
    return failAwakening(root, [{
      code: "nen.suppression.forced.unauthorized",
      message:
        "Only the source that imposed this forced Zetsu can release it.",
      audience: "player",
      required: contributionSourceKey(located.release.authority),
      actual: contributionSourceKey(authorization),
    }]);
  }

  return settleRelease(context, root, located);
}


/** Every involuntary Zetsu this character is being held in. */
export function involuntaryZetsuStates(
  nen: NenState,
): readonly NenSuppressionState[] {
  return suppressionOfKind(nen.awakening, "involuntary-zetsu");
}


/** Whether this character has ever been through an awakening at all. */
export function hasAwakeningHistory(nen: NenState): boolean {
  return hasEverAwakened(nen.awakening);
}
