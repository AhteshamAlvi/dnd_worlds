/*
 * The active-Nen lifecycle: the pure operations that produce a new runtime.
 *
 * Foundation owns the SHAPE of an activity and what makes one malformed. This
 * file owns what may happen to one, which is a rules question and therefore
 * sits above Foundation — the same split Phase 5 made between
 * foundation/nen/awakening/ and character/nen/.
 *
 *
 * ONE ORDER, EVERY TRANSITION
 *
 *   1. structure          is this a runtime and a request at all
 *   2. owner and state    is it this character's, and in a condition that
 *                         permits what is being asked
 *   3. prerequisites      supplied by the caller, never evaluated here
 *   4. compatibility      what the authored declarations say
 *   5. funding            the Aura outcome, supplied, never recomputed
 *   6. transition         one immutable replacement
 *   7. consequences       what else the change forces
 *
 * Steps 3 and 5 take RESULTS rather than doing the work. A requirement is
 * evaluated by the requirement system and Aura is funded by Aura; recomputing
 * either here would be a second authority on a settled question, and the two
 * would disagree the first time one of them changed.
 *
 *
 * WHAT A STOPPED ACTIVITY COSTS
 *
 * Nothing. Decommitting Output returns capacity and spends no Current Aura,
 * because holding Aura is not the same as burning it. A suppression that
 * drained the character would be inventing a cost the resource rules do not
 * have — and would let an attacker empty somebody by repeatedly closing their
 * nodes.
 *
 * FORCED STATES GRANT NOTHING. A character held shut by somebody else's
 * Ability has learned no Zetsu, and nothing here touches mastery at all. That
 * is not a rule this file enforces so much as one it has no way to break:
 * `NenState` is not an input to any function below.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../../infrastructure/trace";
import {
  contributionSourceKey,
  isSameContributionSource,
  type ContributionSourceRef,
} from "../../../infrastructure/contribution-source";
import { ownerIdFromKey } from "../../../runtime/domains";
import type { GameTimestamp } from "../../../time/types";

import {
  auraFundingSucceeded,
  type AuraFundingOutcome,
} from "../../foundation/aura/funding";
import {
  findNenActivityDefinitionIssues,
  findNenActivityRuntimeIssues,
  findNenActivity,
  orderNenActivities,
} from "../../foundation/nen/runtime/state";
import type {
  NenActivity,
  NenActivityConfiguration,
  NenActivityConstraint,
  NenActivityDefinition,
  NenActivityRuntime,
  NenActivityStop,
  NenActivityStopCause,
} from "../../foundation/nen/runtime/types";


/* ── What a transition reports ──────────────────────────────────────────── */

/*
 * One lifecycle change: the new runtime, and enough to explain it.
 *
 * `before` and `after` are both carried for the activity that changed. A
 * caller rendering "Ren was interrupted" needs the state it was in as much as
 * the state it reached, and diffing two whole runtimes to recover one of them
 * is work the transition already did.
 */
export interface NenActivityTransition {
  readonly runtime: NenActivityRuntime;

  /** The activity this was about. `null` when an activation was refused. */
  readonly before: NenActivity | null;
  readonly after: NenActivity | null;

  /** Activities this change forced to stop — components, replacements. */
  readonly consequences: readonly NenActivity[];

  readonly events: readonly NenActivityEvent[];
}


export interface NenActivityEvent {
  readonly kind:
    | "nen-activity-started"
    | "nen-activity-adjusted"
    | "nen-activity-stopped"
    | "nen-activity-resumed";

  readonly activityId: string;
  readonly owner: string;
  readonly at: GameTimestamp;

  /** Present on a stop. The cause, so a log never has to infer it. */
  readonly cause?: NenActivityStopCause;

  readonly by?: ContributionSourceRef;
}


/* ── Shared plumbing ────────────────────────────────────────────────────── */

function fail(
  root: TraceNode,
  errors: readonly EngineError[],
): EngineResult<NenActivityTransition> {
  root.output = false;

  return {
    success: false,
    trace: { root },
    warnings: [],
    errors: errors as NonEmptyArray<EngineError>,
  };
}


function succeed(
  root: TraceNode,
  payload: NenActivityTransition,
): EngineResult<NenActivityTransition> {
  root.output = {
    activities: payload.runtime.activities.length,
    consequences: payload.consequences.length,
  };

  return { success: true, payload, trace: { root }, warnings: [] };
}


/*
 * A timestamp that is legal for this runtime.
 *
 * Monotonic, because the runtime carries the instant it is described at and a
 * transition dated before it would rewrite history: an activation at t=5 in a
 * runtime already advanced to t=10 would overlap intervals that were settled
 * five seconds ago, and every upkeep charged in between would be wrong.
 */
function findTimeIssues(
  at: GameTimestamp,
  runtime: NenActivityRuntime,
): readonly EngineError[] {
  if (!Number.isFinite(at)) {
    return [{
      code: "nen.activity.time.invalid",
      message: "A Nen lifecycle transition must happen at a finite timestamp.",
      audience: "developer",
      required: "finite GameTimestamp",
      actual: String(at),
    }];
  }

  if (at < runtime.at) {
    return [{
      code: "nen.activity.time.retrograde",
      message:
        "A Nen lifecycle transition cannot be dated before the runtime it " +
        "is applied to.",
      audience: "developer",
      required: `>= ${runtime.at}`,
      actual: String(at),
    }];
  }

  return [];
}


/* ── Activation ─────────────────────────────────────────────────────────── */

export interface NenActivationRequest {
  readonly activityId: string;
  readonly definitionId: string;
  readonly source: ContributionSourceRef;
  readonly at: GameTimestamp;

  readonly requested: NenActivityConfiguration;
  readonly priority: number;

  /**
   * The Aura funding outcome, ALREADY SETTLED.
   *
   * Supplied rather than derived. Aura owns the pool, Control, the priority
   * order and the shortfall policy, and an activation that priced its own cost
   * would be a second copy of all four — free to drift, and authoritative
   * looking while it did. What arrives here is the answer.
   */
  readonly funding: AuraFundingOutcome;

  /** Stored allocations the activation committed, by id. */
  readonly allocationIds?: readonly string[];

  /**
   * Whether the requirements this activation depends on were met.
   *
   * A RESULT, not a request to evaluate. The requirement system distinguishes
   * satisfied, unsatisfied and unresolved, and this preserves that distinction
   * rather than flattening it to a boolean: an unresolved prerequisite is a
   * question nobody has answered yet, and refusing it as though it had been
   * answered "no" would be the engine inventing a verdict.
   */
  readonly prerequisites?: "satisfied" | "unsatisfied" | "unresolved";

  readonly constraints?: readonly NenActivityConstraint[];
}


/**
 * Start an activity.
 *
 * The funding outcome decides whether anything starts at all, and the three
 * cases are genuinely different:
 *
 *   funded / scaled          an activity exists, committing what was funded
 *   consumed-below-minimum   NO activity exists, and the Aura is still gone
 *   refused                  no activity, nothing spent
 *
 * The middle one is the reason this returns a SUCCESS carrying no activity
 * rather than a failure. The expenditure happened; rolling the transition back
 * would refund Aura the shortfall policy says is spent, and refusing it as an
 * error would make a designed mechanic look like a malformed call.
 */
export function activateNenActivity(
  runtime: NenActivityRuntime,
  request: NenActivationRequest,
  definitions: ReadonlyMap<string, NenActivityDefinition> = new Map(),
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.activity.activate",
    label: "Activate a Nen activity",
    inputs: {
      activityId: { value: describeDiagnosticValue(request?.activityId) },
      definitionId: { value: describeDiagnosticValue(request?.definitionId) },
      owner: { value: String(runtime?.owner) },
      fundingStatus: { value: describeDiagnosticValue(request?.funding?.status) },
    },
  });

  /* 1. Structure. */
  const structural = [
    ...findNenActivityRuntimeIssues(runtime),
    ...findActivationIssues(request),
  ];

  if (structural.length > 0) return fail(root, structural);

  const timeIssues = findTimeIssues(request.at, runtime);

  if (timeIssues.length > 0) return fail(root, timeIssues);

  /* 2. Owner and current state. */
  if (findNenActivity(runtime, request.activityId) !== undefined) {
    return fail(root, [{
      code: "nen.activity.id.duplicate",
      message:
        `An activity with the id "${request.activityId}" is already in this ` +
        "runtime.",
      audience: "developer",
      required: "an unused activity id",
      actual: request.activityId,
    }]);
  }

  /*
   * The same CHARACTER, not the same owner key.
   *
   * A character's Aura is keyed `aura:gon` and their activities `nen:gon` —
   * two states belonging to one person, exactly as the ownership vocabulary
   * intends. Comparing the whole keys asks a question that is false for every
   * legitimate activation, which makes it useless as the guard it is meant to
   * be; comparing the subject catches the case that matters, which is Killua's
   * funding starting Gon's technique.
   */
  if (
    ownerIdFromKey(request.funding.owner) !== ownerIdFromKey(runtime.owner)
  ) {
    return fail(root, [{
      code: "nen.activity.funding.owner.mismatched",
      message:
        "The Aura funding for this activation was charged to a different " +
        "character.",
      audience: "developer",
      required: runtime.owner,
      actual: request.funding.owner,
    }]);
  }

  /* 3. Prerequisites, as supplied. */
  const prerequisites = request.prerequisites ?? "satisfied";

  if (prerequisites !== "satisfied") {
    return fail(root, [{
      code: prerequisites === "unresolved"
        ? "nen.activity.prerequisites.unresolved"
        : "nen.activity.prerequisites.unsatisfied",
      message: prerequisites === "unresolved"
        ? "This activation depends on a prerequisite nothing has answered yet."
        : "This activation's prerequisites are not met.",
      audience: "player",
      required: "satisfied prerequisites",
      actual: prerequisites,
    }]);
  }

  /* 4. Compatibility, from the authored declarations. */
  const definition = definitions.get(request.definitionId);

  if (definition !== undefined) {
    const definitionIssues = findNenActivityDefinitionIssues(definition);

    if (definitionIssues.length > 0) return fail(root, definitionIssues);
  }

  const blocked = findCompatibilityIssues(runtime, request, definitions);

  if (blocked.length > 0) return fail(root, blocked);

  /* 5. Funding. A below-minimum attempt stops here, having paid. */
  if (!auraFundingSucceeded(request.funding.status)) {
    root.output = {
      started: false,
      fundingStatus: request.funding.status,
      spent: request.funding.funded,
    };

    return {
      success: true,
      payload: {
        /* The instant advances: the attempt happened, even though it failed. */
        runtime: { ...runtime, at: request.at },
        before: null,
        after: null,
        consequences: [],
        events: [],
      },
      trace: { root },
      warnings: [],
    };
  }

  /* 6. The transition. */
  const replaced = activitiesReplacedBy(runtime, request, definitions);

  const stopped = replaced.map((one) =>
    stoppedActivity(one, {
      cause: "replaced",
      at: request.at,
      by: request.source,
      resume: null,
      detail: `replaced by ${request.activityId}`,
    })
  );

  const activity: NenActivity = {
    id: request.activityId,
    owner: runtime.owner,
    definitionId: request.definitionId,
    source: request.source,
    requested: request.requested,
    priority: request.priority,
    funding: {
      requestId: request.funding.requestId,

      /*
       * What was FUNDED, not what was asked for. An activity committing the
       * requested figure after a scaled funding would be holding Output the
       * reserve never paid for.
       */
      committed: request.funding.funded,
      allocationIds: request.allocationIds ?? [],
      status: request.funding.status,
      unmet: request.funding.unmet,
    },
    condition: "active",
    startedAt: request.at,
    endedAt: null,
    constraints: [
      ...(definition?.constraints ?? []),
      ...(request.constraints ?? []),
    ],
    stop: null,
  };

  const stoppedById = new Map(stopped.map((one) => [one.id, one]));

  const activities = [
    ...runtime.activities.map((one) => stoppedById.get(one.id) ?? one),
    activity,
  ];

  return succeed(root, {
    runtime: { ...runtime, at: request.at, activities },
    before: null,
    after: activity,
    consequences: stopped,
    events: [
      ...stopped.map((one) => stopEvent(one, runtime.owner)),
      {
        kind: "nen-activity-started" as const,
        activityId: activity.id,
        owner: runtime.owner,
        at: request.at,
      },
    ],
  });
}


function findActivationIssues(
  request: NenActivationRequest,
): readonly EngineError[] {
  if (request === null || typeof request !== "object") {
    return [{
      code: "nen.activity.request.malformed",
      message: "A Nen activation request must be an object.",
      audience: "developer",
      required: "NenActivationRequest",
      actual: describeDiagnosticValue(request),
    }];
  }

  const errors: EngineError[] = [];

  if (
    typeof request.activityId !== "string" ||
    request.activityId.trim().length === 0
  ) {
    errors.push({
      code: "nen.activity.id.invalid",
      message: "A Nen activation must name the activity it creates.",
      audience: "developer",
      required: "non-empty string",
      actual: describeDiagnosticValue(request.activityId),
    });
  }

  if (
    typeof request.definitionId !== "string" ||
    request.definitionId.trim().length === 0
  ) {
    errors.push({
      code: "nen.activity.definition.invalid",
      message: "A Nen activation must name the definition it instantiates.",
      audience: "developer",
      required: "non-empty string",
      actual: describeDiagnosticValue(request.definitionId),
    });
  }

  if (!Number.isFinite(request.priority)) {
    errors.push({
      code: "nen.activity.priority.invalid",
      message: "A Nen activation must carry a finite priority.",
      audience: "developer",
      required: "finite number",
      actual: describeDiagnosticValue(request.priority),
    });
  }

  const aura = request.requested?.aura;

  if (!Number.isFinite(aura) || (aura as number) < 0) {
    errors.push({
      code: "nen.activity.configuration.invalid",
      message:
        "A Nen activation must request a finite non-negative amount of Aura.",
      audience: "developer",
      required: "finite number >= 0",
      actual: String(aura),
    });
  }

  const upkeep = request.requested?.upkeepPerRound;

  if (upkeep !== undefined && (!Number.isFinite(upkeep) || upkeep < 0)) {
    errors.push({
      code: "nen.activity.configuration.invalid",
      message: "An upkeep rate must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: String(upkeep),
    });
  }

  const duration = request.requested?.durationSeconds;

  if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) {
    errors.push({
      code: "nen.activity.configuration.invalid",
      message: "A declared duration must be a finite positive number.",
      audience: "developer",
      required: "finite number > 0",
      actual: String(duration),
    });
  }

  if (
    request.funding === null || typeof request.funding !== "object" ||
    typeof request.funding.status !== "string"
  ) {
    errors.push({
      code: "nen.activity.funding.invalid",
      message: "A Nen activation must carry the Aura funding outcome it got.",
      audience: "developer",
      required: "an AuraFundingOutcome",
      actual: describeDiagnosticValue(request.funding),
    });
  }

  return errors;
}


/*
 * What the authored declarations say about starting this alongside what is
 * already running.
 *
 * Reads relations in BOTH directions — the incoming definition's own, and
 * those of every active definition pointing back at it — because "Zetsu is
 * incompatible with Ren" and "Ren is incompatible with Zetsu" are the same
 * fact and content should only have to state it once.
 *
 * No principle id appears. A relation is a pair of opaque definition ids and a
 * verb; which pairs exist is authored content this runtime never sees.
 */
function findCompatibilityIssues(
  runtime: NenActivityRuntime,
  request: NenActivationRequest,
  definitions: ReadonlyMap<string, NenActivityDefinition>,
): readonly EngineError[] {
  const active = runtime.activities.filter((one) => one.condition === "active");
  const errors: EngineError[] = [];

  const incoming = definitions.get(request.definitionId);

  const conflicts = (
    from: string,
    to: string,
  ): readonly string[] =>
    (definitions.get(from)?.relations ?? [])
      .filter((one) =>
        one.other === to &&
        (one.relation === "incompatible" || one.relation === "sealed-by")
      )
      .map((one) => one.relation);

  for (const other of active) {
    const both = [
      ...conflicts(request.definitionId, other.definitionId),
      ...conflicts(other.definitionId, request.definitionId),
    ];

    if (both.length === 0) continue;

    errors.push({
      code: "nen.activity.incompatible",
      message:
        `"${request.definitionId}" cannot run while "${other.definitionId}" ` +
        "is active.",
      audience: "player",
      required: `${other.definitionId} inactive`,
      actual: `${both[0]} with ${other.id}`,
      resolution: `Stop ${other.definitionId} first.`,
    });
  }

  /*
   * `requires` is the other direction: something that must ALREADY be running.
   * Checked against active activities only, because a suspended prerequisite
   * is not supporting anything.
   */
  for (const relation of incoming?.relations ?? []) {
    if (relation.relation !== "requires") continue;

    const present = active.some(
      (one) => one.definitionId === relation.other,
    );

    if (present) continue;

    errors.push({
      code: "nen.activity.requirement.absent",
      message:
        `"${request.definitionId}" requires "${relation.other}" to be active.`,
      audience: "player",
      required: `${relation.other} active`,
      actual: "not active",
    });
  }

  return errors;
}


/** Active activities this activation declares it replaces. */
function activitiesReplacedBy(
  runtime: NenActivityRuntime,
  request: NenActivationRequest,
  definitions: ReadonlyMap<string, NenActivityDefinition>,
): readonly NenActivity[] {
  const replaces = new Set(
    (definitions.get(request.definitionId)?.relations ?? [])
      .filter((one) => one.relation === "replaces")
      .map((one) => one.other),
  );

  if (replaces.size === 0) return [];

  return runtime.activities.filter(
    (one) => one.condition === "active" && replaces.has(one.definitionId),
  );
}


/* ── Stopping ───────────────────────────────────────────────────────────── */

/*
 * Apply a stop to one activity, without deciding anything.
 *
 * `suspended` when the stop granted permission to resume, `ended` when it did
 * not — which is the whole difference between the two conditions and is why it
 * is derived from the grant rather than asked for separately. Two fields that
 * could disagree about whether something may come back is one field too many.
 */
function stoppedActivity(
  activity: NenActivity,
  stop: NenActivityStop,
): NenActivity {
  return {
    ...activity,
    condition: stop.resume === null ? "ended" : "suspended",
    endedAt: stop.at,

    /*
     * A stopped activity holds no Output. Releasing it costs no Current Aura —
     * decommitting never does — so the reserve is untouched and only the
     * capacity comes back.
     */
    funding: { ...activity.funding, committed: 0 },
    stop,
  };
}


function stopEvent(
  activity: NenActivity,
  owner: string,
): NenActivityEvent {
  return {
    kind: "nen-activity-stopped",
    activityId: activity.id,
    owner,
    at: activity.stop!.at,
    cause: activity.stop!.cause,
    by: activity.stop!.by,
  };
}


export interface NenStopRequest {
  readonly activityId: string;
  readonly cause: NenActivityStopCause;
  readonly at: GameTimestamp;

  /** Who is stopping it. Checked for a voluntary cancellation. */
  readonly by: ContributionSourceRef;

  readonly resume?: NenActivityStop["resume"];
  readonly detail?: string;
}


/**
 * Stop one activity, for any reason.
 *
 * ONE operation rather than six. Cancellation, suppression, sealing,
 * interruption, collapse and access loss differ in their cause, their
 * authority and whether they may be resumed — all of which are recorded — and
 * in nothing else. Six functions would be six copies of the same state change
 * with six chances for one of them to forget to release the commitment.
 *
 * The one rule that does vary by cause is authority. A VOLUNTARY cancellation
 * may only be performed by the source that started the activity; everything
 * else is imposed from outside by definition, and a character who could
 * "cancel" somebody else's suppression could lift it at will.
 */
export function stopNenActivity(
  runtime: NenActivityRuntime,
  request: NenStopRequest,
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.activity.stop",
    label: "Stop a Nen activity",
    inputs: {
      activityId: { value: describeDiagnosticValue(request?.activityId) },
      cause: { value: describeDiagnosticValue(request?.cause) },
    },
  });

  const structural = findNenActivityRuntimeIssues(runtime);

  if (structural.length > 0) return fail(root, structural);

  const timeIssues = findTimeIssues(request?.at, runtime);

  if (timeIssues.length > 0) return fail(root, timeIssues);

  const activity = findNenActivity(runtime, request?.activityId);

  if (activity === undefined) {
    return fail(root, [{
      code: "nen.activity.absent",
      message: `No activity "${describeDiagnosticValue(request?.activityId)}" is in this runtime.`,
      audience: "developer",
      required: "a known activity id",
      actual: describeDiagnosticValue(request?.activityId),
    }]);
  }

  if (activity.condition !== "active") {
    return fail(root, [{
      code: "nen.activity.transition.illegal",
      message: `"${activity.id}" is not running and cannot be stopped again.`,
      audience: "developer",
      required: "an active activity",
      actual: activity.condition,
    }]);
  }

  /*
   * Only the source that started an activity may cancel it. Without this,
   * "cancelled" is a way for anybody to end anybody's technique with no
   * authority and no record that it was imposed.
   */
  if (
    request.cause === "cancelled" &&
    !isSameContributionSource(request.by, activity.source)
  ) {
    return fail(root, [{
      code: "nen.activity.authority.refused",
      message:
        `"${activity.id}" may only be cancelled by the source that started it.`,
      audience: "developer",
      required: contributionSourceKey(activity.source),
      actual: describeDiagnosticValue(request.by),
    }]);
  }

  const stopped = stoppedActivity(activity, {
    cause: request.cause,
    at: request.at,
    by: request.by,
    resume: request.resume ?? null,
    ...(request.detail === undefined ? {} : { detail: request.detail }),
  });

  /*
   * Anything composed of this one goes with it. Collapse is a CONSEQUENCE of
   * the component ending rather than a separate thing somebody has to remember
   * to call, which is what stops a composite outliving its parts.
   */
  const collapsed = collapseDependents(
    runtime,
    stopped,
    request.at,
    request.by,
  );

  const changed = new Map<string, NenActivity>([
    [stopped.id, stopped],
    ...collapsed.map((one) => [one.id, one] as const),
  ]);

  return succeed(root, {
    runtime: {
      ...runtime,
      at: request.at,
      activities: runtime.activities.map((one) => changed.get(one.id) ?? one),
    },
    before: activity,
    after: stopped,
    consequences: collapsed,
    events: [
      stopEvent(stopped, runtime.owner),
      ...collapsed.map((one) => stopEvent(one, runtime.owner)),
    ],
  });
}


/*
 * Activities that cannot survive one of theirs ending.
 *
 * Transitive, because a composite built from a composite is legal and a single
 * pass would leave the outer one standing on a part that is gone. Bounded by
 * the number of activities, since each can only collapse once.
 */
function collapseDependents(
  runtime: NenActivityRuntime,
  stopped: NenActivity,
  at: GameTimestamp,
  by: ContributionSourceRef,
): readonly NenActivity[] {
  const gone = new Set<string>([stopped.id]);
  const collapsed: NenActivity[] = [];

  let changed = true;

  while (changed) {
    changed = false;

    for (const activity of runtime.activities) {
      if (activity.condition !== "active") continue;
      if (gone.has(activity.id)) continue;

      const depends = activity.constraints.some(
        (one) => one.kind === "component" && gone.has(one.activityId),
      );

      if (!depends) continue;

      gone.add(activity.id);
      collapsed.push(stoppedActivity(activity, {
        cause: "collapsed",
        at,
        by,
        resume: null,
        detail: `a component it depended on stopped`,
      }));

      changed = true;
    }
  }

  return collapsed;
}


/* ── Resumption ─────────────────────────────────────────────────────────── */

export interface NenResumeRequest {
  readonly activityId: string;
  readonly at: GameTimestamp;

  /** Must match the authority the stop granted. */
  readonly by: ContributionSourceRef;

  /** The funding for the commitment being retaken. */
  readonly funding: AuraFundingOutcome;
}


/**
 * Resume a suspended activity.
 *
 * Permitted only where the STOP said so, by the authority the stop named, and
 * not before the time it set. A resumption that inferred permission from the
 * cause would mean every interruption was temporary and every suppression
 * self-lifting, which is exactly the rule Phase 5 refused to let a forced
 * Zetsu have.
 *
 * The commitment has to be funded again, because it was released when the
 * activity stopped. Resuming for free would let a character park a technique
 * through a shortage and take it back the moment the shortage ended, without
 * ever competing for the Output again.
 */
export function resumeNenActivity(
  runtime: NenActivityRuntime,
  request: NenResumeRequest,
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.activity.resume",
    label: "Resume a suspended Nen activity",
    inputs: { activityId: { value: describeDiagnosticValue(request?.activityId) } },
  });

  const structural = findNenActivityRuntimeIssues(runtime);

  if (structural.length > 0) return fail(root, structural);

  const timeIssues = findTimeIssues(request?.at, runtime);

  if (timeIssues.length > 0) return fail(root, timeIssues);

  const activity = findNenActivity(runtime, request?.activityId);

  if (activity === undefined || activity.condition !== "suspended") {
    return fail(root, [{
      code: "nen.activity.transition.illegal",
      message:
        `Only a suspended activity may be resumed; "${describeDiagnosticValue(request?.activityId)}" is not.`,
      audience: "developer",
      required: "a suspended activity",
      actual: activity === undefined ? "absent" : activity.condition,
    }]);
  }

  const permission = activity.stop?.resume ?? null;

  if (permission === null) {
    return fail(root, [{
      code: "nen.activity.resume.refused",
      message: `"${activity.id}" was stopped with no permission to resume.`,
      audience: "player",
      required: "a resume permission",
      actual: "absent",
    }]);
  }

  if (!isSameContributionSource(request.by, permission.authority)) {
    return fail(root, [{
      code: "nen.activity.authority.refused",
      message: `"${activity.id}" may only be resumed by the authority that suspended it.`,
      audience: "developer",
      required: contributionSourceKey(permission.authority),
      actual: describeDiagnosticValue(request.by),
    }]);
  }

  if (permission.notBefore !== undefined && request.at < permission.notBefore) {
    return fail(root, [{
      code: "nen.activity.resume.too-early",
      message: `"${activity.id}" may not be resumed yet.`,
      audience: "player",
      required: `>= ${permission.notBefore}`,
      actual: describeDiagnosticValue(request.at),
    }]);
  }

  if (!auraFundingSucceeded(request.funding?.status)) {
    return fail(root, [{
      code: "nen.activity.resume.unfunded",
      message: `"${activity.id}" could not retake the Output it needs to run.`,
      audience: "player",
      required: "funded or scaled",
      actual: describeDiagnosticValue(request.funding?.status),
    }]);
  }

  const resumed: NenActivity = {
    ...activity,
    condition: "active",

    /*
     * A NEW interval. The suspension was real time in which the activity was
     * not running, so extending the original interval across it would claim
     * upkeep and effect for a period when nothing was happening.
     */
    startedAt: request.at,
    endedAt: null,
    funding: {
      ...activity.funding,
      requestId: request.funding.requestId,
      committed: request.funding.funded,
      status: request.funding.status,
      unmet: request.funding.unmet,
    },
    stop: null,
  };

  return succeed(root, {
    runtime: {
      ...runtime,
      at: request.at,
      activities: runtime.activities.map(
        (one) => one.id === resumed.id ? resumed : one,
      ),
    },
    before: activity,
    after: resumed,
    consequences: [],
    events: [{
      kind: "nen-activity-resumed",
      activityId: resumed.id,
      owner: runtime.owner,
      at: request.at,
    }],
  });
}


/* ── Adjustment ─────────────────────────────────────────────────────────── */

export interface NenAdjustRequest {
  readonly activityId: string;
  readonly at: GameTimestamp;
  readonly by: ContributionSourceRef;

  readonly requested: NenActivityConfiguration;

  /** The funding for the NEW configuration, already settled. */
  readonly funding: AuraFundingOutcome;

  readonly allocationIds?: readonly string[];
}


/**
 * Change what a running activity is holding.
 *
 * Validated and funded BEFORE anything is replaced, so a refused adjustment
 * leaves the previous configuration standing rather than a character holding
 * neither. That ordering is the whole rule: an implementation that released
 * the old commitment first and then discovered the new one could not be funded
 * would have turned a failed redistribution into a cancellation.
 *
 * The identity is preserved. Adjusting Ren from 200 to 180 is the same
 * activity at a new level, not a stop and a start, so its id, source and start
 * time survive — otherwise anything watching the activity would see it end.
 */
export function adjustNenActivity(
  runtime: NenActivityRuntime,
  request: NenAdjustRequest,
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.activity.adjust",
    label: "Adjust a running Nen activity",
    inputs: { activityId: { value: describeDiagnosticValue(request?.activityId) } },
  });

  const structural = findNenActivityRuntimeIssues(runtime);

  if (structural.length > 0) return fail(root, structural);

  const timeIssues = findTimeIssues(request?.at, runtime);

  if (timeIssues.length > 0) return fail(root, timeIssues);

  const activity = findNenActivity(runtime, request?.activityId);

  if (activity === undefined || activity.condition !== "active") {
    return fail(root, [{
      code: "nen.activity.transition.illegal",
      message:
        `Only a running activity may be adjusted; "${describeDiagnosticValue(request?.activityId)}" is not.`,
      audience: "developer",
      required: "an active activity",
      actual: activity === undefined ? "absent" : activity.condition,
    }]);
  }

  if (!isSameContributionSource(request.by, activity.source)) {
    return fail(root, [{
      code: "nen.activity.authority.refused",
      message:
        `"${activity.id}" may only be adjusted by the source that started it.`,
      audience: "developer",
      required: contributionSourceKey(activity.source),
      actual: describeDiagnosticValue(request.by),
    }]);
  }

  const aura = request.requested?.aura;

  if (!Number.isFinite(aura) || (aura as number) < 0) {
    return fail(root, [{
      code: "nen.activity.configuration.invalid",
      message: "An adjustment must request a finite non-negative amount of Aura.",
      audience: "developer",
      required: "finite number >= 0",
      actual: String(aura),
    }]);
  }

  if (!auraFundingSucceeded(request.funding?.status)) {
    return fail(root, [{
      code: "nen.activity.adjust.unfunded",
      message:
        `"${activity.id}" could not be adjusted: the new configuration was ` +
        "not funded, and the previous one still stands.",
      audience: "player",
      required: "funded or scaled",
      actual: describeDiagnosticValue(request.funding?.status),
    }]);
  }

  const adjusted: NenActivity = {
    ...activity,
    requested: request.requested,
    funding: {
      requestId: request.funding.requestId,
      committed: request.funding.funded,
      allocationIds: request.allocationIds ?? activity.funding.allocationIds,
      status: request.funding.status,
      unmet: request.funding.unmet,
    },
  };

  return succeed(root, {
    runtime: {
      ...runtime,
      at: request.at,
      activities: runtime.activities.map(
        (one) => one.id === adjusted.id ? adjusted : one,
      ),
    },
    before: activity,
    after: adjusted,
    consequences: [],
    events: [{
      kind: "nen-activity-adjusted",
      activityId: adjusted.id,
      owner: runtime.owner,
      at: request.at,
    }],
  });
}


/* ── Elapsed time ───────────────────────────────────────────────────────── */

export interface NenAdvanceRequest {
  readonly to: GameTimestamp;
  readonly by: ContributionSourceRef;

  /**
   * Whether the character can still deliberately project Aura.
   *
   * Supplied rather than derived. Aura access depends on awakening,
   * suppression and node state, all of which Phase 5 and the Aura access
   * resolver already decide; asking again here would be a second answer.
   */
  readonly deliberateAccess?: boolean;

  /** Host facts currently true, for `host` constraints. */
  readonly hostFacts?: ReadonlySet<string>;

  /** Effective ranks now, for `minimum-mastery` constraints. */
  readonly effectiveMastery?: ReadonlyMap<string, number>;
}


/**
 * Carry the runtime forward to an instant, stopping whatever can no longer run.
 *
 * INTERVAL INVARIANT. One advance to t and sixty advances of one second each
 * must produce the same runtime, because an activity's fate depends on the
 * declared duration and the constraints and not on how the caller chose to
 * chop up the time. The one thing that could break it is a stop dated at the
 * advance's END rather than at the moment the condition actually became true —
 * so an expiry is dated at `startedAt + duration`, which is the same instant
 * however many advances it took to reach it.
 *
 * Constraint failures are dated at `to`, and honestly so: a constraint is
 * evaluated against facts supplied for this advance, and the engine genuinely
 * does not know when within the interval an access loss happened. A caller who
 * needs that precision advances in smaller steps, which is exactly what the
 * invariant guarantees is safe.
 */
export function advanceNenActivities(
  runtime: NenActivityRuntime,
  request: NenAdvanceRequest,
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.activity.advance",
    label: "Advance active Nen activities",
    inputs: {
      from: { value: Number.isFinite(runtime?.at) ? runtime.at : String(runtime?.at) },
      to: { value: Number.isFinite(request?.to) ? request.to : describeDiagnosticValue(request?.to) },
    },
  });

  const structural = findNenActivityRuntimeIssues(runtime);

  if (structural.length > 0) return fail(root, structural);

  const timeIssues = findTimeIssues(request?.to, runtime);

  if (timeIssues.length > 0) return fail(root, timeIssues);

  const stopped: NenActivity[] = [];
  const changed = new Map<string, NenActivity>();

  /*
   * Priority order, so that same-time stops are reported deterministically
   * however the host happened to hold the array. Nothing here depends on the
   * order mechanically — each activity is judged against the supplied facts
   * and not against the others — which is what makes the ordering safe to use
   * for reporting alone.
   */
  for (const activity of orderNenActivities(runtime.activities)) {
    if (activity.condition !== "active") continue;

    const verdict = advanceVerdictFor(activity, request);

    if (verdict === null) continue;

    const next = stoppedActivity(activity, {
      cause: verdict.cause,
      at: verdict.at,
      by: request.by,
      resume: null,
      detail: verdict.detail,
    });

    stopped.push(next);
    changed.set(next.id, next);
  }

  /* Composites whose components just stopped go with them. */
  for (const one of stopped) {
    for (const dependent of collapseDependents(
      { ...runtime, activities: runtime.activities.map((a) => changed.get(a.id) ?? a) },
      one,
      request.to,
      request.by,
    )) {
      if (changed.has(dependent.id)) continue;

      stopped.push(dependent);
      changed.set(dependent.id, dependent);
    }
  }

  return succeed(root, {
    runtime: {
      ...runtime,
      at: request.to,
      activities: runtime.activities.map((one) => changed.get(one.id) ?? one),
    },
    before: null,
    after: null,
    consequences: stopped,
    events: stopped.map((one) => stopEvent(one, runtime.owner)),
  });
}


/*
 * Why one activity cannot survive this advance, if it cannot.
 *
 * Expiry is checked first and is dated at the instant it actually expired,
 * which is what makes one long advance agree with many short ones. Everything
 * else is a fact supplied for this advance and is dated at its end.
 */
function advanceVerdictFor(
  activity: NenActivity,
  request: NenAdvanceRequest,
): {
  readonly cause: NenActivityStopCause;
  readonly at: GameTimestamp;
  readonly detail: string;
} | null {
  const duration = activity.requested.durationSeconds;

  if (duration !== undefined) {
    const expiresAt = activity.startedAt + duration;

    if (request.to >= expiresAt) {
      return {
        cause: "expired",
        at: expiresAt,
        detail: "its declared duration ran out",
      };
    }
  }

  for (const constraint of activity.constraints) {
    switch (constraint.kind) {
      case "deliberate-access":
        if (request.deliberateAccess === false) {
          return {
            cause: "access-lost",
            at: request.to,
            detail: "the character can no longer project Aura deliberately",
          };
        }

        break;

      case "minimum-mastery": {
        const rank = request.effectiveMastery?.get(constraint.capability);

        if (rank !== undefined && rank < constraint.rank) {
          return {
            cause: "sealed",
            at: request.to,
            detail:
              `effective ${constraint.capability} fell below ${constraint.rank}`,
          };
        }

        break;
      }

      case "host":
        if (
          request.hostFacts !== undefined &&
          !request.hostFacts.has(constraint.factId)
        ) {
          return {
            cause: "interrupted",
            at: request.to,
            detail: `the host fact "${constraint.factId}" no longer holds`,
          };
        }

        break;

      /*
       * Component constraints are settled by collapseDependents after the
       * stops are known, not here — a component that is still active at this
       * point has not stopped anything.
       */
      case "component":
        break;
    }
  }

  return null;
}
