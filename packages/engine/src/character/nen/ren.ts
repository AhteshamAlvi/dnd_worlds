/*
 * The Ren adapter — where the Ren principle meets the generic runtime and Aura.
 *
 * Ren is something a character DOES, so unlike Ten it is not derived from the
 * sheet. It is a maintained activity in the generic `NenActivityRuntime`, and
 * this file is the one place that knows which activity that is. Everything
 * below it stays definition-opaque:
 *
 *   the runtime    sees an activity committing Oactive of Output, with a
 *                  duration in full-output-equivalent seconds and a load
 *   Aura           sees an outward flow of Oactive per minute that replaces
 *                  the ordinary surface state while it runs
 *   the time loop  sees an optional flow commitment with an optional end
 *
 * Nothing downstream compares an id to "ren". The comparison happens here,
 * against a named constant, at the principle integration boundary the ticket
 * put it at.
 *
 *
 * TEN AND REN NEVER RUN TOGETHER
 * ------------------------------
 *
 * Ten is not an activity, so there is nothing to stop when Ren starts and
 * nothing to restart when it ends. Exclusion is a property of ACCESS: while
 * Ren's flow is in force the Aura resolver applies an outward-flow override,
 * which sets Ten's coating and residual leak aside; the instant the flow
 * stops, the ordinary access — Ten, if Ten is legal — is what the solver reads
 * again. There is no instant with both and no instant with neither.
 *
 *
 * THE ONE SETTLEMENT AUTHORITY
 * ----------------------------
 *
 * Ren's continuous cost is charged by the Aura time solver's outward flow and
 * nowhere else. The activity this file creates carries no `upkeepPerRound`,
 * so there is no second figure anything could bill.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import { describeDiagnosticValue } from "../../infrastructure/diagnostics";
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

import type { Attributes } from "../foundation/attributes/types";
import type { AuraOutwardFlowCommitment } from "../foundation/aura/flow";
import {
  settleAuraFunding,
  type AuraFundingOutcome,
} from "../foundation/aura/funding";
import { deriveAuraOutputLimit } from "../foundation/aura/output";
import type { AuraAccessInput } from "../foundation/aura/types";
import { isSuppressed } from "../foundation/nen/awakening/state";
import {
  deriveEffectiveNenMastery,
  isNenAwakened,
} from "../foundation/nen/nen";
import {
  NEN_OUTPUT_CLOCK_ID,
  resolveRawRenAttackOutput,
  resolveRenSelection,
  type RawRenAttackOutput,
  type RenAttackBody,
  type RenSelection,
} from "../foundation/nen/principles/ren";
import {
  activeNenActivities,
  findNenActivityRuntimeIssues,
  nenActivityExpiryAt,
} from "../foundation/nen/runtime/state";
import type {
  NenActivity,
  NenActivityConfiguration,
  NenActivityDefinition,
  NenActivityRuntime,
  NenActivityStopCause,
} from "../foundation/nen/runtime/types";
import type { NenState } from "../foundation/nen/types";

import {
  NEN_PRINCIPLE_DEFINITIONS,
  REN_ACTIVITY_DEFINITION_ID as REN_ID,
} from "./definitions";
import {
  activateNenActivity,
  adjustNenActivity,
  type NenActivityTransition,
} from "./runtime/transitions";


/*
 * Ren's identity and declaration, re-exported from where they are authored.
 *
 * They moved to `nen/definitions.ts` when KGS-1 gave Ren relations for the
 * first time: "Ren replaces Ken" and "Ken replaces Ren" are one rule, and a
 * rule split across two adapter files is a rule that can be half-changed. The
 * re-export keeps every existing caller and the package barrel working.
 */
export {
  REN_ACTIVITY_DEFINITION,
  REN_ACTIVITY_DEFINITION_ID,
} from "./definitions";

/** The provenance Ren's flow carries into Aura. */
export const REN_OUTWARD_FLOW_SOURCE = "ren";


/** Whether an activity is a Ren. The one place that question is asked. */
export function isRenActivity(activity: NenActivity): boolean {
  return activity.definitionId === REN_ID;
}


/** The running Ren, if there is one. */
export function activeRenActivity(
  runtime: NenActivityRuntime,
): NenActivity | undefined {
  return activeNenActivities(runtime).find(isRenActivity);
}


/*
 * Why Ren cannot run for this character right now, if it cannot.
 *
 * Read from authored state alone, which cannot change inside a time advance —
 * so a Ren that is illegal is illegal from the advance's first instant, and
 * the coordinator stops it there.
 */
export function renStopCauseFor(nen: NenState): NenActivityStopCause | null {
  if (!isNenAwakened(nen)) return "access-lost";
  if (isSuppressed(nen.awakening)) return "suppressed";
  if (deriveEffectiveNenMastery(nen, "ren") < 1) return "sealed";

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


interface RenCharacterFacts {
  readonly nen: NenState;

  /** The resolved stat block Physiological Output is derived from. */
  readonly attributes: Attributes;

  /** Current Aura at the transition instant, already projected to it. */
  readonly currentAura: number;
}


/*
 * Everything a Ren selection needs to be legal and fully funded.
 *
 * Shared by activation and adjustment so neither can accept a selection the
 * other would refuse. Returns the resolved selection and the settled funding,
 * or the refusal — never a partially-funded Ren.
 */
function resolveFundedSelection(
  root: TraceNode,
  runtime: NenActivityRuntime,
  facts: RenCharacterFacts,
  selectedOutput: number,
  requestId: string,
  source: ContributionSourceRef,
  priority: number,
):
  | { readonly ok: true; readonly selection: RenSelection; readonly funding: AuraFundingOutcome }
  | { readonly ok: false; readonly errors: readonly EngineError[] } {
  const cause = renStopCauseFor(facts.nen);

  if (cause !== null) {
    return {
      ok: false,
      errors: [{
        code: `nen.ren.unavailable.${cause}`,
        message: cause === "sealed"
          ? "This character has no usable Ren Mastery."
          : cause === "suppressed"
            ? "A suppressed character cannot open their nodes into Ren."
            : "Only an awakened character can use Ren.",
        audience: "player",
        required: "an awakened, unsuppressed character with Ren I or higher",
        actual: cause,
      }],
    };
  }

  const current = facts.currentAura;

  if (typeof current !== "number" || !Number.isFinite(current) || current < 0) {
    return {
      ok: false,
      errors: [{
        code: "nen.ren.current_aura.invalid",
        message: "Ren is funded from a finite non-negative Current Aura.",
        audience: "developer",
        required: "finite number >= 0",
        actual: describeDiagnosticValue(current),
      }],
    };
  }

  const selection = resolveRenSelection({
    physiologicalOutput: deriveAuraOutputLimit(facts.attributes).maximum,
    mastery: deriveEffectiveNenMastery(facts.nen, "ren"),
    selectedOutput,
  });

  root.children.push(selection.trace.root);

  if (!selection.success) return { ok: false, errors: selection.errors };

  const { activeOutput, outputLimit } = selection.payload;

  /*
   * FULL funding, from the Output the reserve can actually put out. Usable
   * Output is capped by Current Aura, so a selection above what is in the
   * reserve is refused outright rather than scaled to fit — a Ren running at
   * less than was asked for is a different Ren.
   */
  const settlement = settleAuraFunding(
    Math.min(current, outputLimit),
    activeOutput,
    { kind: "require-full" },
  );

  if (settlement.status !== "funded") {
    return {
      ok: false,
      errors: [{
        code: "nen.ren.unfunded",
        message:
          "This character cannot fund the selected Ren Output in full.",
        audience: "player",
        required: { selectedOutput: activeOutput },
        actual: { currentAura: current, outputLimit },
        resolution: "Select a lower Output, or recover Aura first.",
      }],
    };
  }

  return {
    ok: true,
    selection: selection.payload,
    funding: {
      requestId,
      owner: `aura:${ownerIdFromKey(runtime.owner)}`,
      source: contributionSourceKey(source),
      priority,
      policy: { kind: "require-full" },
      requested: activeOutput,
      authoritativeCost: activeOutput,
      accessibleCapacity: outputLimit,
      funded: settlement.funded,
      committed: settlement.funded,
      controlDelta: 0,
      unmet: settlement.unmet,
      usefulAura: activeOutput,
      status: settlement.status,
    },
  };
}


/*
 * The generic configuration a selection becomes.
 *
 * ONE named clock — `output` — carrying the physiological limit on how long
 * the nodes can be held open at this share of the ceiling. Capacity in
 * full-load-equivalent seconds, load as the share of the ceiling in use; the
 * runtime integrates the clock from those two alone.
 *
 * Ren VIII through X declare the clock with NO capacity rather than declaring
 * no clock. The dimension is real and is the one Ken borrows to bound its own
 * Output; what those ranks have is an unlimited capacity on it, not an absent
 * one, and an adapter that dropped the clock would leave nothing for a trace
 * to name when Ken's Output endurance is the binding constraint.
 *
 * No upkeep: the flow is charged by the Aura time solver, once.
 */
function renConfiguration(selection: RenSelection): NenActivityConfiguration {
  return {
    aura: selection.activeOutput,
    clocks: [{
      id: NEN_OUTPUT_CLOCK_ID,
      load: selection.load,
      ...(selection.fullOutputDurationSeconds === null
        ? {}
        : { fullLoadDurationSeconds: selection.fullOutputDurationSeconds }),
    }],
  };
}


/* ── Starting Ren ───────────────────────────────────────────────────────── */

export interface StartRenInput {
  /** Oactive: 0 < selectedOutput <= the Ren Mastery ceiling. */
  readonly selectedOutput: number;
  readonly at: GameTimestamp;
}

export interface StartRenRequest extends StartRenInput, RenCharacterFacts {
  readonly activityId: string;
  readonly source: ContributionSourceRef;
  readonly priority?: number;
}


/**
 * Start Ren at a selected Output.
 *
 * Refuses — leaving the runtime exactly as it was — an unawakened, suppressed
 * or sealed character, a selection outside the Mastery ceiling, a selection
 * the reserve cannot fund in full, and a second Ren. On success Ten is not
 * touched at all: Ten is not in the runtime, and the flow this activity
 * projects is what replaces it in Aura from `at` onward.
 */
export function startRen(
  runtime: NenActivityRuntime,
  request: StartRenRequest,
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.ren.start",
    label: "Start Ren",
    inputs: {
      activityId: { value: describeDiagnosticValue(request?.activityId) },
      selectedOutput: { value: describeDiagnosticValue(request?.selectedOutput) },
      at: { value: describeDiagnosticValue(request?.at) },
    },
  });

  if (request === null || typeof request !== "object") {
    return refuse(root, [{
      code: "nen.ren.request.malformed",
      message: "A Ren activation must be an object.",
      audience: "developer",
      required: "StartRenRequest",
      actual: describeDiagnosticValue(request),
    }]);
  }

  const structural = findNenActivityRuntimeIssues(runtime);

  if (structural.length > 0) return refuse(root, structural);

  const existing = activeRenActivity(runtime);

  if (existing !== undefined) {
    return refuse(root, [{
      code: "nen.ren.already_active",
      message: "Ren is already running; adjust its Output instead.",
      audience: "player",
      required: "no active Ren",
      actual: existing.id,
    }]);
  }

  const priority = request.priority ?? 0;

  const resolved = resolveFundedSelection(
    root,
    runtime,
    request,
    request.selectedOutput,
    `${describeDiagnosticValue(request.activityId)}:ren-activation`,
    request.source,
    priority,
  );

  if (!resolved.ok) return refuse(root, resolved.errors);

  const activated = activateNenActivity(
    runtime,
    {
      activityId: request.activityId,
      definitionId: REN_ID,
      source: request.source,
      at: request.at,
      requested: renConfiguration(resolved.selection),
      priority,
      funding: resolved.funding,
    },
    NEN_PRINCIPLE_DEFINITIONS,
  );

  root.children.push(activated.trace.root);

  if (!activated.success) return refuse(root, activated.errors);

  root.output = {
    activeOutput: resolved.selection.activeOutput,
    load: resolved.selection.load,
  };

  return { ...activated, trace: { root } };
}


/* ── Adjusting Ren ──────────────────────────────────────────────────────── */

export interface AdjustRenRequest extends RenCharacterFacts {
  readonly activityId: string;
  readonly selectedOutput: number;
  readonly at: GameTimestamp;
  readonly by: ContributionSourceRef;
}


/**
 * Change a running Ren's Output.
 *
 * An adjustment, not a stop and a start: the activity keeps its id, source,
 * start time and accumulated exertion, and there is no instant between the
 * old Output and the new one at which Ten comes back. The new selection is
 * validated and fully funded BEFORE anything changes, so a refusal leaves the
 * running Ren exactly as it was.
 */
export function adjustRen(
  runtime: NenActivityRuntime,
  request: AdjustRenRequest,
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.ren.adjust",
    label: "Adjust Ren Output",
    inputs: {
      activityId: { value: describeDiagnosticValue(request?.activityId) },
      selectedOutput: { value: describeDiagnosticValue(request?.selectedOutput) },
      at: { value: describeDiagnosticValue(request?.at) },
    },
  });

  if (request === null || typeof request !== "object") {
    return refuse(root, [{
      code: "nen.ren.request.malformed",
      message: "A Ren adjustment must be an object.",
      audience: "developer",
      required: "AdjustRenRequest",
      actual: describeDiagnosticValue(request),
    }]);
  }

  const structural = findNenActivityRuntimeIssues(runtime);

  if (structural.length > 0) return refuse(root, structural);

  const activity = activeRenActivity(runtime);

  if (activity === undefined || activity.id !== request.activityId) {
    return refuse(root, [{
      code: "nen.ren.not_active",
      message: "Only a running Ren can have its Output adjusted.",
      audience: "player",
      required: "the active Ren activity",
      actual: describeDiagnosticValue(request.activityId),
    }]);
  }

  const resolved = resolveFundedSelection(
    root,
    runtime,
    request,
    request.selectedOutput,
    `${activity.id}:ren-adjustment@${describeDiagnosticValue(request.at)}`,
    activity.source,
    activity.priority,
  );

  if (!resolved.ok) return refuse(root, resolved.errors);

  const adjusted = adjustNenActivity(runtime, {
    activityId: activity.id,
    at: request.at,
    by: request.by,
    requested: renConfiguration(resolved.selection),
    funding: resolved.funding,
  });

  root.children.push(adjusted.trace.root);

  if (!adjusted.success) return refuse(root, adjusted.errors);

  root.output = {
    activeOutput: resolved.selection.activeOutput,
    load: resolved.selection.load,
  };

  return { ...adjusted, trace: { root } };
}


/* ── Projection into Aura ───────────────────────────────────────────────── */

/**
 * The running Ren as a generic outward flow, or null when none is running.
 *
 * `endsAt` is the runtime's own expiry instant — the same function the
 * lifecycle advance stops the activity at — so Aura and the runtime cannot
 * disagree about when the Ren ran out. Absent at Mastery X.
 */
export function renOutwardFlow(
  runtime: NenActivityRuntime,
): AuraOutwardFlowCommitment | null {
  const activity = activeRenActivity(runtime);

  if (activity === undefined) return null;

  const endsAt = nenActivityExpiryAt(activity);

  return {
    id: activity.id,
    source: REN_OUTWARD_FLOW_SOURCE,
    output: activity.funding.committed,
    ...(endsAt === null ? {} : { endsAt }),
  };
}


/**
 * An access input with the running Ren laid over it, for a caller resolving
 * a budget or profile at an instant rather than across an interval.
 *
 * Unchanged when no Ren is running — the character's ordinary state, Ten
 * included, is exactly what they have.
 */
export function withRenAccess(
  input: AuraAccessInput,
  runtime: NenActivityRuntime,
  attributes: Attributes,
): AuraAccessInput {
  const flow = renOutwardFlow(runtime);

  if (flow === null) return input;

  const physiological = deriveAuraOutputLimit(attributes).maximum;

  return {
    ...input,
    override: {
      kind: "outward-flow",
      source: flow.source,
      accessFraction: physiological > 0 ? flow.output / physiological : 1,
    },
  };
}


/* ── Offense ────────────────────────────────────────────────────────────── */

export interface RenAttackRequest {
  /** Exactly one: the Body Part that makes contact or carries the attack. */
  readonly attackingPartIds: readonly string[];
  readonly body: RenAttackBody;
}

export interface RenAttackContribution {
  /** False when no Ren is running; the contribution is then zero. */
  readonly available: boolean;
  readonly output: number;
  readonly projection: RawRenAttackOutput | null;
}


/**
 * The raw Ren a strike carries, for the combat or action layer.
 *
 * Zero and unavailable when Ren is not running. Otherwise the running Output,
 * shared over the one declared attacking part by surface. A skill with its own
 * concentrated, carried or converted effect uses its own effect path; nothing
 * here widens the raw rule for everybody.
 */
export function resolveRenAttackContribution(
  runtime: NenActivityRuntime,
  request: RenAttackRequest,
): EngineResult<RenAttackContribution> {
  const root = createTraceNode({
    id: "nen.ren.attack-contribution",
    label: "Resolve a strike's raw Ren",
  });

  const structural = findNenActivityRuntimeIssues(runtime);

  if (structural.length > 0) return refuse(root, structural);

  const activity = activeRenActivity(runtime);

  if (activity === undefined) {
    root.output = { available: false, output: 0 };

    return {
      success: true,
      payload: { available: false, output: 0, projection: null },
      trace: { root },
      warnings: [],
    };
  }

  const projection = resolveRawRenAttackOutput({
    activeOutput: activity.funding.committed,
    attackingPartIds: request?.attackingPartIds,
    body: request?.body,
  });

  root.children.push(projection.trace.root);

  if (!projection.success) return refuse(root, projection.errors);

  root.output = { available: true, output: projection.payload.output };

  return {
    success: true,
    payload: {
      available: true,
      output: projection.payload.output,
      projection: projection.payload,
    },
    trace: { root },
    warnings: [],
  };
}
