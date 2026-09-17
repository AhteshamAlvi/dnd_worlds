/*
 * The Zetsu adapter — where learned, voluntary Zetsu meets the generic runtime
 * and Aura.
 *
 * Ordinary Zetsu is something a character DOES: a maintained activity in the
 * generic `NenActivityRuntime`, started and stopped at exact instants. This
 * file is the one place that knows which activity that is. Below it everything
 * stays principle-neutral:
 *
 *   the runtime    sees an activity committing nothing, with no upkeep and no
 *                  duration, that revokes the `deliberate-access` constraint
 *   Aura           sees a voluntary suppression and a suppressed access
 *                  override, both labelled with a provenance nothing branches on
 *   the time loop  sees a generic suppression projection it passes through
 *
 *
 * ENTERING IS A SHUTDOWN, NOT A PAUSE
 * -----------------------------------
 *
 * Closing the nodes ends everything that needs deliberate access — Ren, and any
 * other activity carrying that constraint — at the activation instant, as
 * `replaced`, with no permission to resume. The runtime does that from the
 * declaration below; no list of techniques is written here. An activity
 * authored to function without deliberate access carries no such constraint
 * and is left alone.
 *
 * Leaving Zetsu restores only what is passive. Ten is derived state rather than
 * an activity, so it is simply what access resolves to again once the override
 * is gone. Nothing that Zetsu ended comes back.
 *
 *
 * NOT THE FORCED STATES
 * ---------------------
 *
 * Forced and involuntary Zetsu are stored suppression on `NenState`, owned by
 * awakening and collapse. They are not this activity, they never produce it,
 * and they grant none of its concealment. Their presence ends an ordinary
 * Zetsu (`suppressed`) rather than stacking a second owner on the same nodes,
 * and their release does not restart it.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import {
  contributionSourceKey,
  type ContributionSourceRef,
} from "../../infrastructure/contribution-source";
import { ownerIdFromKey } from "../../runtime/domains";
import type { GameTimestamp } from "../../time/types";

import type { MasteryRank } from "../capabilities/mastery";
import type { AuraFundingOutcome } from "../foundation/aura/funding";
import type { AuraAccessInput } from "../foundation/aura/types";
import { isSuppressed } from "../foundation/nen/awakening/state";
import {
  deriveEffectiveNenMastery,
  isNenAwakened,
  validateNenState,
} from "../foundation/nen/nen";
import { deriveZetsuAuraConcealmentModifier } from "../foundation/nen/principles/zetsu";
import {
  activeNenActivities,
  findNenActivityRuntimeIssues,
} from "../foundation/nen/runtime/state";
import type {
  NenActivity,
  NenActivityDefinition,
  NenActivityRuntime,
  NenActivityStopCause,
  NenActivitySuppression,
} from "../foundation/nen/runtime/types";
import type { NenState } from "../foundation/nen/types";

import {
  activateNenActivity,
  stopNenActivity,
  type NenActivityTransition,
} from "./runtime/transitions";


/** The authored definition every ordinary Zetsu activity instantiates. */
export const ZETSU_ACTIVITY_DEFINITION_ID = "zetsu";

/*
 * Zetsu's declaration to the runtime.
 *
 * It REVOKES deliberate access rather than requiring it: closing the nodes is
 * its effect, so carrying the constraint would have it stop itself. No
 * relations, because what it ends is chosen by constraint, not by name.
 */
export const ZETSU_ACTIVITY_DEFINITION: NenActivityDefinition = {
  id: ZETSU_ACTIVITY_DEFINITION_ID,
  relations: [],
  revokes: ["deliberate-access"],
};

/** The provenance ordinary Zetsu's suppression carries into Aura. */
export const ZETSU_SUPPRESSION_SOURCE = "zetsu";

/** What Zetsu's concealment modifier applies to, and nothing else. */
export const ZETSU_AURA_CONCEALMENT_SCOPE = "aura-presence";


/** Whether an activity is an ordinary Zetsu. The one place that is asked. */
export function isZetsuActivity(activity: NenActivity): boolean {
  return activity.definitionId === ZETSU_ACTIVITY_DEFINITION_ID;
}


/** The running ordinary Zetsu, if there is one. */
export function activeZetsuActivity(
  runtime: NenActivityRuntime,
): NenActivity | undefined {
  return activeNenActivities(runtime).find(isZetsuActivity);
}


/*
 * Why ordinary Zetsu cannot run for this character right now, if it cannot.
 *
 * Read from authored state alone, which cannot change inside an advance, so an
 * illegal Zetsu is stopped at the coordinator's next opening instant.
 */
export function zetsuStopCauseFor(nen: NenState): NenActivityStopCause | null {
  if (!isNenAwakened(nen)) return "access-lost";
  if (isSuppressed(nen.awakening)) return "suppressed";
  if (deriveEffectiveNenMastery(nen, "zetsu") < 1) return "sealed";

  return null;
}


/* ── Shared plumbing ────────────────────────────────────────────────────── */

function refuse<T>(
  root: TraceNode,
  errors: readonly EngineError[],
): EngineResult<T> {
  root.output = false;

  return {
    success: false,
    trace: { root },
    warnings: [],
    errors: errors as NonEmptyArray<EngineError>,
  };
}


function isSourceRef(value: unknown): value is ContributionSourceRef {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as ContributionSourceRef).type === "string" &&
    (value as ContributionSourceRef).type.trim().length > 0 &&
    typeof (value as ContributionSourceRef).id === "string" &&
    (value as ContributionSourceRef).id.trim().length > 0
  );
}


/*
 * Whether a Nen state can be read at all, before any rule reads it.
 *
 * The permanent-state validator is the authority; the shape guard in front of
 * it only keeps a non-object from reaching a validator that expects one.
 */
function findNenStateIssues(nen: unknown): readonly EngineError[] {
  if (
    nen === null || typeof nen !== "object" ||
    (nen as NenState).awakening === null ||
    typeof (nen as NenState).awakening !== "object" ||
    (nen as NenState).mastery === null ||
    typeof (nen as NenState).mastery !== "object"
  ) {
    return [{
      code: "nen.zetsu.nen_state.invalid",
      message: "Zetsu is resolved against a structurally valid Nen state.",
      audience: "developer",
      required: "NenState",
      actual: describeDiagnosticValue(nen),
    }];
  }

  const validated = validateNenState(nen as NenState);

  return validated.success ? [] : validated.errors;
}


function unavailable(cause: NenActivityStopCause): EngineError {
  return {
    code: `nen.zetsu.unavailable.${cause}`,
    message: cause === "sealed"
      ? "This character has no usable Zetsu Mastery."
      : cause === "suppressed"
        ? "A character whose nodes are already held shut cannot enter Zetsu."
        : "Only an awakened character can use Zetsu.",
    audience: "player",
    required: "an awakened, unsuppressed character with Zetsu I or higher",
    actual: cause,
  };
}


/* ── Starting Zetsu ─────────────────────────────────────────────────────── */

export interface StartZetsuRequest {
  readonly activityId: string;
  readonly source: ContributionSourceRef;
  readonly at: GameTimestamp;
  readonly nen: NenState;
  readonly priority?: number;
}


/**
 * Enter ordinary Zetsu.
 *
 * Atomic. Every refusal — malformed input, an unawakened, sealed or externally
 * suppressed character, a Zetsu already running — leaves the runtime exactly
 * as it was. On success, every activity needing deliberate access ends at `at`
 * as `replaced`, and the Zetsu begins at that same instant.
 *
 * Costs nothing and commits nothing, so it starts at zero Current Aura too.
 */
export function startZetsu(
  runtime: NenActivityRuntime,
  request: StartZetsuRequest,
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.zetsu.start",
    label: "Enter Zetsu",
    inputs: {
      activityId: { value: describeDiagnosticValue(request?.activityId) },
      at: { value: describeDiagnosticValue(request?.at) },
    },
  });

  if (request === null || typeof request !== "object") {
    return refuse(root, [{
      code: "nen.zetsu.request.malformed",
      message: "A Zetsu activation must be an object.",
      audience: "developer",
      required: "StartZetsuRequest",
      actual: describeDiagnosticValue(request),
    }]);
  }

  const structural = [
    ...findNenActivityRuntimeIssues(runtime),
    ...(isSourceRef(request.source)
      ? []
      : [{
        code: "nen.zetsu.source.invalid",
        message: "A Zetsu activation must name what started it.",
        audience: "developer" as const,
        required: "{ type, id }",
        actual: describeDiagnosticValue(request.source),
      }]),
    ...findNenStateIssues(request.nen),
  ];

  if (structural.length > 0) return refuse(root, structural);

  const existing = activeZetsuActivity(runtime);

  if (existing !== undefined) {
    return refuse(root, [{
      code: "nen.zetsu.already_active",
      message: "This character is already in Zetsu.",
      audience: "player",
      required: "no active Zetsu",
      actual: existing.id,
    }]);
  }

  const cause = zetsuStopCauseFor(request.nen);

  if (cause !== null) return refuse(root, [unavailable(cause)]);

  const priority = request.priority ?? 0;

  /*
   * A settled outcome for a cost of nothing. Zetsu takes no Output, so there
   * is no allocation to hold and no reserve to consult — the record exists
   * because every activity links into the ledger the same way.
   */
  const funding: AuraFundingOutcome = {
    requestId: `${describeDiagnosticValue(request.activityId)}:zetsu-activation`,
    owner: `aura:${ownerIdFromKey(runtime.owner)}`,
    source: contributionSourceKey(request.source),
    priority,
    policy: { kind: "require-full" },
    requested: 0,
    authoritativeCost: 0,
    accessibleCapacity: 0,
    funded: 0,
    committed: 0,
    controlDelta: 0,
    unmet: 0,
    usefulAura: 0,
    status: "funded",
  };

  const activated = activateNenActivity(
    runtime,
    {
      activityId: request.activityId,
      definitionId: ZETSU_ACTIVITY_DEFINITION_ID,
      source: request.source,
      at: request.at,
      requested: { aura: 0 },
      priority,
      funding,
    },
    new Map([[ZETSU_ACTIVITY_DEFINITION_ID, ZETSU_ACTIVITY_DEFINITION]]),
  );

  root.children.push(activated.trace.root);

  if (!activated.success) return refuse(root, activated.errors);

  root.output = {
    started: activated.payload.after?.id ?? null,
    replaced: activated.payload.consequences.map((one) => one.id),
  };

  return { ...activated, trace: { root } };
}


/* ── Leaving Zetsu ──────────────────────────────────────────────────────── */

export interface StopZetsuRequest {
  readonly activityId: string;
  readonly at: GameTimestamp;

  /** Must be the source that started it; the runtime enforces that. */
  readonly by: ContributionSourceRef;
}


/**
 * Leave ordinary Zetsu voluntarily.
 *
 * Ends it — never suspends it — at `at`. Nothing it replaced is restarted:
 * from `at` the character's access is whatever their passive state resolves
 * to, which is normally Ten.
 */
export function stopZetsu(
  runtime: NenActivityRuntime,
  request: StopZetsuRequest,
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.zetsu.stop",
    label: "Leave Zetsu",
    inputs: {
      activityId: { value: describeDiagnosticValue(request?.activityId) },
      at: { value: describeDiagnosticValue(request?.at) },
    },
  });

  if (request === null || typeof request !== "object") {
    return refuse(root, [{
      code: "nen.zetsu.request.malformed",
      message: "A Zetsu cancellation must be an object.",
      audience: "developer",
      required: "StopZetsuRequest",
      actual: describeDiagnosticValue(request),
    }]);
  }

  const structural = findNenActivityRuntimeIssues(runtime);

  if (structural.length > 0) return refuse(root, structural);

  const activity = activeZetsuActivity(runtime);

  if (activity === undefined || activity.id !== request.activityId) {
    return refuse(root, [{
      code: "nen.zetsu.not_active",
      message: "Only a running Zetsu can be left.",
      audience: "player",
      required: "the active Zetsu activity",
      actual: describeDiagnosticValue(request.activityId),
    }]);
  }

  const stopped = stopNenActivity(runtime, {
    activityId: activity.id,
    cause: "cancelled",
    at: request.at,
    by: request.by,
  });

  root.children.push(stopped.trace.root);

  if (!stopped.success) return refuse(root, stopped.errors);

  root.output = { stopped: activity.id };

  return { ...stopped, trace: { root } };
}


/* ── Projection into Aura ───────────────────────────────────────────────── */

/**
 * The running Zetsu as generic suppression, or null when none is running.
 *
 * The only producer of ordinary learned-Zetsu suppression. Voluntary, so Aura
 * resolves recovery from the activity table; Mastery plays no part in it.
 */
export function zetsuSuppression(
  runtime: NenActivityRuntime,
): NenActivitySuppression | null {
  const activity = activeZetsuActivity(runtime);

  if (activity === undefined) return null;

  return {
    activityId: activity.id,
    source: activity.source,
    suppression: { source: ZETSU_SUPPRESSION_SOURCE, forced: false },
    override: { kind: "suppressed", source: ZETSU_SUPPRESSION_SOURCE },
  };
}


/**
 * An access input with a running Zetsu laid over it, for a caller resolving a
 * profile or budget at an instant rather than across an interval.
 *
 * Closed nodes: no Output, no coating, no deliberate placement. Unchanged when
 * no Zetsu is running, and unchanged when the input already carries an
 * override — a forced state already holds the nodes, and ends an ordinary
 * Zetsu rather than stacking on it.
 */
export function withZetsuAccess(
  input: AuraAccessInput,
  runtime: NenActivityRuntime,
): AuraAccessInput {
  const projected = zetsuSuppression(runtime);

  if (projected === null || input.override !== undefined) return input;

  return { ...input, override: projected.override };
}


/* ── Concealment ────────────────────────────────────────────────────────── */

export type ZetsuAuraConcealmentContribution =
  | {
    /** No ordinary Zetsu is running, or it can no longer legally run. */
    readonly available: false;
    readonly modifier: 0;
  }
  | {
    readonly available: true;

    /** Aura and supernatural presence only; never physical evidence. */
    readonly scope: typeof ZETSU_AURA_CONCEALMENT_SCOPE;

    readonly activityId: string;
    readonly source: ContributionSourceRef;

    /** Effective Mastery at the instant asked — seals applied. */
    readonly mastery: MasteryRank;

    /** Situational: added to an aura-concealment check, never to the score. */
    readonly modifier: number;
  };


/**
 * What a running ordinary Zetsu adds to concealing the character's Aura.
 *
 * A typed contribution for a future Detection contest to consume, not a roll.
 * Nothing when no Zetsu runs, and nothing for a forced or involuntary state —
 * those are not this activity and teach no Zetsu.
 */
export function resolveZetsuAuraConcealment(
  runtime: NenActivityRuntime,
  nen: NenState,
): EngineResult<ZetsuAuraConcealmentContribution> {
  const root = createTraceNode({
    id: "nen.zetsu.aura-concealment",
    label: "Resolve Zetsu's Aura Concealment contribution",
  });

  const structural = [
    ...findNenActivityRuntimeIssues(runtime),
    ...findNenStateIssues(nen),
  ];

  if (structural.length > 0) return refuse(root, structural);

  const activity = activeZetsuActivity(runtime);

  const none = (): EngineResult<ZetsuAuraConcealmentContribution> => {
    root.output = { available: false, modifier: 0 };

    return {
      success: true,
      payload: { available: false, modifier: 0 },
      trace: { root },
      warnings: [],
    };
  };

  if (activity === undefined || zetsuStopCauseFor(nen) !== null) return none();

  const mastery = deriveEffectiveNenMastery(nen, "zetsu") as MasteryRank;
  const modifier = deriveZetsuAuraConcealmentModifier(mastery);

  root.output = { available: true, activityId: activity.id, mastery, modifier };

  return {
    success: true,
    payload: {
      available: true,
      scope: ZETSU_AURA_CONCEALMENT_SCOPE,
      activityId: activity.id,
      source: activity.source,
      mastery,
      modifier,
    },
    trace: { root },
    warnings: [],
  };
}
