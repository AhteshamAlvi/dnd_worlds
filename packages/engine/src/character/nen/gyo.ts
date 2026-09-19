/*
 * The Gyō adapter — Ken's coating, with part of it moved into one place.
 *
 * Gyō is not a bigger Ken and it is not a second kind of Output. It opens
 * exactly what Ken opens, through exactly the same Ren access and the same
 * Ken containment capacity, and then redistributes it: a share moves into one
 * contiguous region, and what is left still covers the whole boundary.
 *
 *     Oshifted = Oactive * shift
 *     Ouniform = Oactive - Oshifted
 *
 * Nothing is created and nothing is destroyed by the shift — which is why this
 * file has no Output table of its own, and why Gyō's ceiling is resolved by
 * `ken.ts`'s resolver rather than by a copy of it.
 *
 *
 * WHAT THE SHIFT COSTS
 * --------------------
 *
 * Concentration is harder than spreading, and the price is paid on the
 * containment clock alone:
 *
 *     gyoContainmentLoad = (Oactive / Cken) * (1 + shift / maximumShift)
 *
 * At the rank's maximum shift the strain is DOUBLE; at half of it, one and a
 * half times. The Output clock is untouched, because the nodes are no more
 * open than they were — the same Aura is coming out, it is simply being piled
 * up somewhere. That asymmetry is the mechanic, and it is why the runtime had
 * to learn about two clocks with different loads before Gyō could exist.
 *
 *
 * THE FOCUS IS OPAQUE TO EVERYTHING BELOW THIS FILE
 * -------------------------------------------------
 *
 * A focus region — which body identities, which Shū Items — cannot be a field
 * on the generic activity configuration without that configuration acquiring a
 * `gyo` key, which is the moment fifteen principles stop being instances of
 * one contract. So it travels as the runtime's ONE opaque payload: validated
 * for being JSON-safe by the runtime, preserved through every transition, and
 * decoded here and nowhere else.
 *
 * The connectivity rule itself lives in the pure principle file, because "one
 * region" is Gyō's rule rather than this adapter's plumbing. What this file
 * adds is the encoding and the promise that nothing else reads it.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import { describeDiagnosticValue } from "../../infrastructure/diagnostics";
import type { JsonValue } from "../../infrastructure/json";
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
import { NEN_CONTAINMENT_CLOCK_ID } from "../foundation/nen/principles/ken";
import {
  resolveGyoFocus,
  resolveGyoSelection,
  type GyoFocus,
  type GyoFocusEdge,
  type GyoSelection,
} from "../foundation/nen/principles/gyo";
import { NEN_OUTPUT_CLOCK_ID } from "../foundation/nen/principles/ren";
import {
  activeNenActivities,
  findNenActivityRuntimeIssues,
} from "../foundation/nen/runtime/state";
import type {
  NenActivity,
  NenActivityConfiguration,
  NenActivityRuntime,
  NenActivityStopCause,
} from "../foundation/nen/runtime/types";
import type { NenState } from "../foundation/nen/types";

import {
  GYO_ACTIVITY_DEFINITION_ID as GYO_ID,
  NEN_PRINCIPLE_DEFINITIONS,
} from "./definitions";
import { KEN_ACCESS_SOURCE } from "./ken";
import {
  activateNenActivity,
  adjustNenActivity,
  type NenActivityTransition,
} from "./runtime/transitions";


export {
  GYO_ACTIVITY_DEFINITION,
  GYO_ACTIVITY_DEFINITION_ID,
} from "./definitions";


/** Whether an activity is a Gyō. The one place that question is asked. */
export function isGyoActivity(activity: NenActivity): boolean {
  return activity.definitionId === GYO_ID;
}


/** The running Gyō, if there is one. */
export function activeGyoActivity(
  runtime: NenActivityRuntime,
): NenActivity | undefined {
  return activeNenActivities(runtime).find(isGyoActivity);
}


/*
 * Why Gyō cannot run for this character right now, if it cannot.
 *
 * Four capabilities, because Gyō stands on all four: it is Ken's containment,
 * holding Ren's Output, over Ten's body, shaped by Gyō's own skill. A seal
 * that empties any of them ends it — and, as everywhere else, ends the
 * ACTIVITY without touching a single stored rank.
 */
export function gyoStopCauseFor(nen: NenState): NenActivityStopCause | null {
  if (!isNenAwakened(nen)) return "access-lost";
  if (isSuppressed(nen.awakening)) return "suppressed";

  for (const capability of ["ten", "ren", "ken", "gyo"] as const) {
    if (deriveEffectiveNenMastery(nen, capability) < 1) return "sealed";
  }

  return null;
}


/* ── The opaque payload ─────────────────────────────────────────────────── */

/*
 * What Gyō stores in the runtime's one opaque slot.
 *
 * JSON-safe by construction — two numbers and a list of strings — so a scene
 * saved mid-Gyō comes back as the same Gyō. The runtime validates that it
 * round-trips and reads nothing inside it.
 */
export interface GyoActivityPayload {
  readonly selectedShift: number;
  readonly focus: readonly string[];
}


function encodeGyoPayload(
  selection: GyoSelection,
  focus: GyoFocus,
): JsonValue {
  return {
    selectedShift: selection.selectedShift,
    focus: [...focus.sites],
  };
}


/**
 * The focus and shift a running Gyō is holding.
 *
 * `null` for anything that is not a well-formed Gyō payload rather than a
 * throw or a guess: a host can hand back a runtime it edited, and a focus that
 * cannot be read is a Gyō that cannot be placed, which the caller has to be
 * able to see.
 */
export function decodeGyoPayload(
  activity: NenActivity,
): GyoActivityPayload | null {
  const payload = activity.requested.payload;

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const { selectedShift, focus } = payload as {
    readonly selectedShift?: unknown;
    readonly focus?: unknown;
  };

  if (
    typeof selectedShift !== "number" || !Number.isFinite(selectedShift) ||
    !Array.isArray(focus) || focus.some((one) => typeof one !== "string")
  ) {
    return null;
  }

  return { selectedShift, focus: focus as readonly string[] };
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


export interface GyoCharacterFacts {
  readonly nen: NenState;
  readonly attributes: Attributes;
  readonly currentAura: number;
}


function committedByOthers(
  runtime: NenActivityRuntime,
  exceptActivityId?: string,
): number {
  return activeNenActivities(runtime)
    .filter((one) => one.id !== exceptActivityId)
    .reduce((sum, one) => sum + one.funding.committed, 0);
}


interface GyoIntent {
  readonly selectedOutput: number;
  readonly selectedShift: number;
  readonly focus: readonly string[];
  readonly focusEdges: readonly GyoFocusEdge[];
}


function resolveFundedGyo(
  root: TraceNode,
  runtime: NenActivityRuntime,
  facts: GyoCharacterFacts,
  intent: GyoIntent,
  requestId: string,
  source: ContributionSourceRef,
  priority: number,
  exceptActivityId?: string,
):
  | {
    readonly ok: true;
    readonly selection: GyoSelection;
    readonly focus: GyoFocus;
    readonly funding: AuraFundingOutcome;
  }
  | { readonly ok: false; readonly errors: readonly EngineError[] } {
  const cause = gyoStopCauseFor(facts.nen);

  if (cause !== null) {
    return {
      ok: false,
      errors: [{
        code: `nen.gyo.unavailable.${cause}`,
        message: cause === "sealed"
          ? "This character has no usable Ten, Ren, Ken or Gyō Mastery."
          : cause === "suppressed"
            ? "A suppressed character cannot open their nodes into Gyō."
            : "Only an awakened character can use Gyō.",
        audience: "player",
        required:
          "an awakened, unsuppressed character with Ten, Ren, Ken and Gyō at I or higher",
        actual: cause,
      }],
    };
  }

  const current = facts.currentAura;

  if (typeof current !== "number" || !Number.isFinite(current) || current < 0) {
    return {
      ok: false,
      errors: [{
        code: "nen.gyo.current_aura.invalid",
        message: "Gyō is funded from a finite non-negative Current Aura.",
        audience: "developer",
        required: "finite number >= 0",
        actual: describeDiagnosticValue(current),
      }],
    };
  }

  /*
   * The focus is resolved BEFORE the funding, so that a disconnected region is
   * reported as what it is rather than as an Output problem — and so that a
   * refused activation has touched neither.
   */
  const focus = resolveGyoFocus({
    sites: intent.focus,
    edges: intent.focusEdges,
  });

  root.children.push(focus.trace.root);

  if (!focus.success) return { ok: false, errors: focus.errors };

  const physiological = deriveAuraOutputLimit(facts.attributes).maximum;

  const selection = resolveGyoSelection({
    physiologicalOutput: physiological,
    kenMastery: deriveEffectiveNenMastery(facts.nen, "ken"),
    renMastery: deriveEffectiveNenMastery(facts.nen, "ren"),
    gyoMastery: deriveEffectiveNenMastery(facts.nen, "gyo"),
    sharedOutputRemaining: Math.max(
      0,
      physiological - committedByOthers(runtime, exceptActivityId),
    ),
    availableAura: current,
    requestedOutput: intent.selectedOutput,
    selectedShift: intent.selectedShift,
  });

  root.children.push(selection.trace.root);

  if (!selection.success) return { ok: false, errors: selection.errors };

  const { activeOutput, ceiling } = selection.payload;

  const settlement = settleAuraFunding(
    ceiling.ceiling,
    activeOutput,
    { kind: "require-full" },
  );

  if (settlement.status !== "funded") {
    return {
      ok: false,
      errors: [{
        code: "nen.gyo.unfunded",
        message: "This character cannot fund the selected Gyō Output in full.",
        audience: "player",
        required: { selectedOutput: activeOutput },
        actual: { currentAura: current, ceiling: ceiling.ceiling },
        resolution: "Select a lower Output, or recover Aura first.",
      }],
    };
  }

  return {
    ok: true,
    selection: selection.payload,
    focus: focus.payload,
    funding: {
      requestId,
      owner: `aura:${ownerIdFromKey(runtime.owner)}`,
      source: contributionSourceKey(source),
      priority,
      policy: { kind: "require-full" },
      requested: activeOutput,
      authoritativeCost: activeOutput,
      accessibleCapacity: ceiling.ceiling,
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
 * The generic configuration a Gyō becomes.
 *
 * The same two clocks Ken declares, with the containment one carrying the
 * concentration strain, plus the opaque payload. Note which clock the strain
 * is on: `output` reads exactly as Ken's would at the same Output, because
 * concentrating costs nothing extra in how far the nodes are open.
 */
function gyoConfiguration(
  selection: GyoSelection,
  focus: GyoFocus,
): NenActivityConfiguration {
  return {
    aura: selection.activeOutput,
    clocks: [
      {
        id: NEN_OUTPUT_CLOCK_ID,
        load: selection.outputLoad,
        ...(selection.outputDurationSeconds === null
          ? {}
          : { fullLoadDurationSeconds: selection.outputDurationSeconds }),
      },
      {
        id: NEN_CONTAINMENT_CLOCK_ID,
        load: selection.containmentLoad,
        ...(selection.containmentDurationSeconds === null
          ? {}
          : { fullLoadDurationSeconds: selection.containmentDurationSeconds }),
      },
    ],
    payload: encodeGyoPayload(selection, focus),
  };
}


/* ── Starting Gyō ───────────────────────────────────────────────────────── */

export interface StartGyoRequest extends GyoCharacterFacts {
  readonly activityId: string;
  readonly source: ContributionSourceRef;
  readonly at: GameTimestamp;
  readonly priority?: number;

  readonly selectedOutput: number;

  /** The share moved into the focus, in (0, the rank's maximum]. */
  readonly selectedShift: number;

  /** Namespaced site identities — see the pure file's prefixes. */
  readonly focus: readonly string[];

  /**
   * Every adjacency that authoritatively exists, supplied by the composition
   * layer. Body attachment and Shū contact arrive as the same kind of edge.
   */
  readonly focusEdges: readonly GyoFocusEdge[];
}


/**
 * Start Gyō at a selected Output, shift and focus.
 *
 * Ends a running Ren or Ken as `replaced` and leaves a running Shū alone. A
 * refusal — for a seal, a disconnected focus, a shift above the rank, or an
 * Output the reserve cannot fund in full — changes nothing at all.
 */
export function startGyo(
  runtime: NenActivityRuntime,
  request: StartGyoRequest,
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.gyo.start",
    label: "Start Gyō",
    inputs: {
      activityId: { value: describeDiagnosticValue(request?.activityId) },
      selectedOutput: { value: describeDiagnosticValue(request?.selectedOutput) },
      selectedShift: { value: describeDiagnosticValue(request?.selectedShift) },
      at: { value: describeDiagnosticValue(request?.at) },
    },
  });

  if (request === null || typeof request !== "object") {
    return refuse(root, [{
      code: "nen.gyo.request.malformed",
      message: "A Gyō activation must be an object.",
      audience: "developer",
      required: "StartGyoRequest",
      actual: describeDiagnosticValue(request),
    }]);
  }

  const structural = findNenActivityRuntimeIssues(runtime);

  if (structural.length > 0) return refuse(root, structural);

  const existing = activeGyoActivity(runtime);

  if (existing !== undefined) {
    return refuse(root, [{
      code: "nen.gyo.already_active",
      message: "Gyō is already running; adjust it instead.",
      audience: "player",
      required: "no active Gyō",
      actual: existing.id,
    }]);
  }

  const priority = request.priority ?? 0;

  const resolved = resolveFundedGyo(
    root,
    runtime,
    request,
    request,
    `${describeDiagnosticValue(request.activityId)}:gyo-activation`,
    request.source,
    priority,
  );

  if (!resolved.ok) return refuse(root, resolved.errors);

  const activated = activateNenActivity(
    runtime,
    {
      activityId: request.activityId,
      definitionId: GYO_ID,
      source: request.source,
      at: request.at,
      requested: gyoConfiguration(resolved.selection, resolved.focus),
      priority,
      funding: resolved.funding,
    },
    NEN_PRINCIPLE_DEFINITIONS,
  );

  root.children.push(activated.trace.root);

  if (!activated.success) return refuse(root, activated.errors);

  root.output = {
    activeOutput: resolved.selection.activeOutput,
    selectedShift: resolved.selection.selectedShift,
    containmentLoad: resolved.selection.containmentLoad,
    focus: resolved.focus.sites.length,
  };

  return { ...activated, trace: { root } };
}


/* ── Adjusting Gyō ──────────────────────────────────────────────────────── */

export interface AdjustGyoRequest extends StartGyoRequest {
  readonly by: ContributionSourceRef;
}


/**
 * Change a running Gyō's Output, shift and focus, in one atomic adjustment.
 *
 * ONE adjustment, deliberately. Moving the focus, changing how much is moved
 * into it, and changing how much is held are three descriptions of a single
 * act of concentration; charging separately for each would make "shift my
 * Gyō from my hand to my sword while easing off" cost three Actions for a
 * thing that happens in one motion.
 *
 * Accumulated endurance survives on both clocks, matched by clock id — so
 * repeatedly nudging the focus is not a way to rest.
 */
export function adjustGyo(
  runtime: NenActivityRuntime,
  request: AdjustGyoRequest,
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.gyo.adjust",
    label: "Adjust Gyō",
    inputs: {
      activityId: { value: describeDiagnosticValue(request?.activityId) },
      selectedOutput: { value: describeDiagnosticValue(request?.selectedOutput) },
      selectedShift: { value: describeDiagnosticValue(request?.selectedShift) },
      at: { value: describeDiagnosticValue(request?.at) },
    },
  });

  if (request === null || typeof request !== "object") {
    return refuse(root, [{
      code: "nen.gyo.request.malformed",
      message: "A Gyō adjustment must be an object.",
      audience: "developer",
      required: "AdjustGyoRequest",
      actual: describeDiagnosticValue(request),
    }]);
  }

  const structural = findNenActivityRuntimeIssues(runtime);

  if (structural.length > 0) return refuse(root, structural);

  const activity = activeGyoActivity(runtime);

  if (activity === undefined || activity.id !== request.activityId) {
    return refuse(root, [{
      code: "nen.gyo.not_active",
      message: "Only a running Gyō can be adjusted.",
      audience: "player",
      required: "the active Gyō activity",
      actual: describeDiagnosticValue(request.activityId),
    }]);
  }

  const resolved = resolveFundedGyo(
    root,
    runtime,
    request,
    request,
    `${activity.id}:gyo-adjustment@${describeDiagnosticValue(request.at)}`,
    activity.source,
    activity.priority,
    activity.id,
  );

  if (!resolved.ok) return refuse(root, resolved.errors);

  const adjusted = adjustNenActivity(runtime, {
    activityId: activity.id,
    at: request.at,
    by: request.by,
    requested: gyoConfiguration(resolved.selection, resolved.focus),
    funding: resolved.funding,
  });

  root.children.push(adjusted.trace.root);

  if (!adjusted.success) return refuse(root, adjusted.errors);

  root.output = {
    activeOutput: resolved.selection.activeOutput,
    selectedShift: resolved.selection.selectedShift,
    containmentLoad: resolved.selection.containmentLoad,
    focus: resolved.focus.sites.length,
  };

  return { ...adjusted, trace: { root } };
}


/* ── Access ─────────────────────────────────────────────────────────────── */

/**
 * An access input with the running Gyō laid over it.
 *
 * IDENTICAL in form to Ken's, and it shares Ken's provenance label, because to
 * Aura they are the same event: a share of Output opened, held against the
 * body, contained, with Ten's coating set aside. Where the Aura SITS is a
 * placement question, and placement is not access.
 */
export function withGyoAccess(
  input: AuraAccessInput,
  runtime: NenActivityRuntime,
  attributes: Attributes,
): AuraAccessInput {
  const activity = activeGyoActivity(runtime);

  if (activity === undefined) return input;

  const physiological = deriveAuraOutputLimit(attributes).maximum;

  return {
    ...input,
    override: {
      kind: "explicit",
      source: KEN_ACCESS_SOURCE,
      accessFraction: physiological > 0
        ? activity.funding.committed / physiological
        : 1,
      deliberateInternalAccess: false,
      deliberateExternalAccess: true,
      automaticSurfaceCoating: false,
      uncontained: false,
    },
  };
}
