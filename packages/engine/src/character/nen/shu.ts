/*
 * The Shū adapter — the boundary overlay that creates nothing.
 *
 * Every other principle in this directory answers "how much Aura, and where
 * does it come from". Shū answers neither, and the absence is the mechanic:
 *
 *     Output after Shū = Output before Shū
 *
 * Shū does not open the nodes, commit capacity, select a density, leak, cost
 * upkeep, or run out. It takes the coating that Ten, Ken or Gyō is ALREADY
 * holding and extends the surface that coating covers onto Items the character
 * is touching. The Aura does not increase; it spreads thinner over a larger
 * boundary, which is why a greatsword dilutes a coating and brass knuckles
 * barely do.
 *
 * So this file has no funding arithmetic, no clocks, and no access override.
 * `funding.committed` is zero, and it is zero deliberately: a Shū that
 * committed Output would be taking capacity from the very Ken it depends on.
 *
 *
 * WHAT ENDS IT
 * ------------
 *
 *   Ren      ends it as `replaced`, declared on Ren's side. Ren holds no
 *            coating, and a Shū with nothing to extend is absent rather than
 *            reduced. The reverse — starting Shū while Ren runs — is refused
 *            here rather than by a relation, because declaring Shū
 *            `incompatible` with Ren would also refuse starting REN while Shū
 *            was up, which is meant to be a legal transition.
 *   Zetsu    ends it through `deliberate-access`, which Shū carries and Zetsu
 *            revokes. Neither names the other.
 *   a seal   on Ten or Shū. NOT on Ren: Shū is built on Ten alone, so a
 *            character whose Ren is sealed to nothing still has a coating and
 *            can still extend it.
 *   loss     of the Items themselves, which is recomputation rather than a
 *            lifecycle event — see `gameplay/nen`.
 *
 *
 * WHAT THIS FILE DOES NOT KNOW
 * ----------------------------
 *
 * What an Item is. Not its surface, not its boundary mode, not its
 * conductivity, not its envelope — `character/nen` may not import
 * `character/equipment`, and the composition that joins the two lives one
 * layer up in `gameplay/nen`. What arrives here is a selection of opaque entry
 * ids plus the authoritative contact edges between them, and what this file
 * enforces is the part that is genuinely Shū's rule: how MANY the rank allows,
 * and that every one of them is connected to the body through Items that were
 * also selected.
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

import type { MasteryRank } from "../capabilities/mastery";
import type { AuraFundingOutcome } from "../foundation/aura/funding";
import { isSuppressed } from "../foundation/nen/awakening/state";
import {
  deriveEffectiveNenMastery,
  isNenAwakened,
} from "../foundation/nen/nen";
import {
  deriveShuMaximumItems,
  resolveShuNetwork,
  withinShuItemLimit,
  type ShuContactEdge,
  type ShuNetwork,
} from "../foundation/nen/principles/shu";
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
  NEN_PRINCIPLE_DEFINITIONS,
  REN_ACTIVITY_DEFINITION_ID as REN_ID,
  SHU_ACTIVITY_DEFINITION_ID as SHU_ID,
} from "./definitions";
import {
  activateNenActivity,
  adjustNenActivity,
  type NenActivityTransition,
} from "./runtime/transitions";


export {
  SHU_ACTIVITY_DEFINITION,
  SHU_ACTIVITY_DEFINITION_ID,
} from "./definitions";


/** Whether an activity is a Shū. The one place that question is asked. */
export function isShuActivity(activity: NenActivity): boolean {
  return activity.definitionId === SHU_ID;
}


/** The running Shū, if there is one. */
export function activeShuActivity(
  runtime: NenActivityRuntime,
): NenActivity | undefined {
  return activeNenActivities(runtime).find(isShuActivity);
}


/*
 * Why Shū cannot run for this character right now, if it cannot.
 *
 * TEN AND SHŪ, and nothing else. Ren is deliberately absent from this list:
 * Shū unlocks from Ten, needs only a coating to extend, and a character whose
 * Ren has been sealed to zero still has Ten's. Adding Ren here would be the
 * single cheapest way to break the rule that a Ren seal leaves Shū working.
 */
export function shuStopCauseFor(nen: NenState): NenActivityStopCause | null {
  if (!isNenAwakened(nen)) return "access-lost";
  if (isSuppressed(nen.awakening)) return "suppressed";

  for (const capability of ["ten", "shu"] as const) {
    if (deriveEffectiveNenMastery(nen, capability) < 1) return "sealed";
  }

  return null;
}


/* ── The opaque payload ─────────────────────────────────────────────────── */

/** What Shū stores in the runtime's one opaque slot. JSON-safe by shape. */
export interface ShuActivityPayload {
  readonly selection: readonly string[];
}


/**
 * The Item selection a running Shū is holding.
 *
 * `null` for anything that is not a well-formed payload — a host can hand back
 * a runtime it edited, and a selection that cannot be read is a Shū that
 * cannot be placed, which the caller has to be able to see rather than have
 * guessed at.
 */
export function decodeShuPayload(
  activity: NenActivity,
): ShuActivityPayload | null {
  const payload = activity.requested.payload;

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const { selection } = payload as { readonly selection?: unknown };

  if (
    !Array.isArray(selection) ||
    selection.some((one) => typeof one !== "string")
  ) {
    return null;
  }

  return { selection: selection as readonly string[] };
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


export interface ShuCharacterFacts {
  readonly nen: NenState;
}


export interface ShuSelectionRequest {
  /** The Items to extend the coating onto, by stable inventory entry id. */
  readonly selection: readonly string[];

  /** Each selected Item's authored conductivity, resolved by the caller. */
  readonly conductivity: Readonly<Record<string, number>>;

  /** Authoritative current contact. `body` is a legal endpoint. */
  readonly contactEdges: readonly ShuContactEdge[];
}


/*
 * Everything a Shū selection needs to be legal.
 *
 * No funding step, because there is nothing to fund. What replaces it is the
 * count rule and the contact rule, and they are checked in that order so that
 * a selection of twelve Items at Shū I is reported as "too many" rather than
 * as whichever of the twelve happened to be unreachable.
 */
function resolveSelection(
  root: TraceNode,
  runtime: NenActivityRuntime,
  facts: ShuCharacterFacts,
  request: ShuSelectionRequest,
):
  | { readonly ok: true; readonly network: ShuNetwork }
  | { readonly ok: false; readonly errors: readonly EngineError[] } {
  const cause = shuStopCauseFor(facts.nen);

  if (cause !== null) {
    return {
      ok: false,
      errors: [{
        code: `nen.shu.unavailable.${cause}`,
        message: cause === "sealed"
          ? "This character has no usable Ten or Shū Mastery."
          : cause === "suppressed"
            ? "A suppressed character holds no coating to extend."
            : "Only an awakened character can use Shū.",
        audience: "player",
        required: "an awakened, unsuppressed character with Ten and Shū at I or higher",
        actual: cause,
      }],
    };
  }

  /*
   * Refused here rather than by a relation. Shū extends a coating, and raw Ren
   * holds none — but declaring the incompatibility on Shū's side would make
   * the runtime refuse STARTING Ren while a Shū was up, and that transition is
   * meant to succeed and end the Shū.
   */
  if (activeNenActivities(runtime).some((one) => one.definitionId === REN_ID)) {
    return {
      ok: false,
      errors: [{
        code: "nen.shu.unavailable.ren",
        message:
          "Raw Ren holds no coating against the body, so there is nothing for " +
          "Shū to extend onto an Item.",
        audience: "player",
        required: "Ten, Ken or Gyō",
        actual: "Ren",
        resolution: "Return to Ten, or hold the Output in Ken, then use Shū.",
      }],
    };
  }

  /*
   * Narrowed, not assumed: `shuStopCauseFor` above returns `"sealed"` for any
   * effective rank below I, so reaching this line proves the rank is a learned
   * one. The cast is the proof written down rather than a hope.
   */
  const mastery = deriveEffectiveNenMastery(facts.nen, "shu") as MasteryRank;
  const maximum = deriveShuMaximumItems(mastery);

  if (!Array.isArray(request?.selection) || request.selection.length === 0) {
    return {
      ok: false,
      errors: [{
        code: "nen.shu.selection.empty",
        message: "Shū must name the Items it extends the coating onto.",
        audience: "player",
        required: "one or more Items",
        actual: describeDiagnosticValue(request?.selection),
      }],
    };
  }

  if (!withinShuItemLimit(mastery, request.selection.length)) {
    return {
      ok: false,
      errors: [{
        code: "nen.shu.selection.too_many",
        message:
          `Shū ${mastery} can hold the coating on ${String(maximum)} Items.`,
        audience: "player",
        required: maximum,
        actual: request.selection.length,
        resolution: "Select fewer Items, or advance Shū.",
      }],
    };
  }

  const network = resolveShuNetwork({
    selection: request.selection,
    conductivity: request.conductivity,
    edges: request.contactEdges,
  });

  root.children.push(network.trace.root);

  if (!network.success) return { ok: false, errors: network.errors };

  return { ok: true, network: network.payload };
}


/*
 * The generic configuration a Shū becomes.
 *
 * `aura: 0` and NO clocks, which together say the whole of what Shū is: it
 * commits nothing and it does not run out. The endurance that bounds it is
 * Ken's or Gyō's, spent on their clocks, and a clock here would be a second
 * one measuring the same thing.
 */
function shuConfiguration(network: ShuNetwork): NenActivityConfiguration {
  return {
    aura: 0,
    payload: {
      selection: network.items.map((one) => one.itemId),
    } satisfies ShuActivityPayload as unknown as JsonValue,
  };
}


/*
 * A funding outcome for something that is not funded.
 *
 * Required by the generic activation contract, which every activity goes
 * through — and stating it explicitly here is better than an exemption, since
 * "Shū committed nothing" is exactly what the Output ledger should record.
 */
function unfundedOutcome(
  runtime: NenActivityRuntime,
  requestId: string,
  source: ContributionSourceRef,
  priority: number,
): AuraFundingOutcome {
  return {
    requestId,
    owner: `aura:${ownerIdFromKey(runtime.owner)}`,
    source: contributionSourceKey(source),
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
}


/* ── Starting Shū ───────────────────────────────────────────────────────── */

export interface StartShuRequest
  extends ShuCharacterFacts, ShuSelectionRequest {
  readonly activityId: string;
  readonly source: ContributionSourceRef;
  readonly at: GameTimestamp;
  readonly priority?: number;
}


/**
 * Extend the current coating onto a selection of Items.
 *
 * Changes no Output and commits none. Refuses — leaving the runtime exactly as
 * it was — a sealed or suppressed character, a character running raw Ren, an
 * empty selection, more Items than the rank allows, and any selection with an
 * Item that does not connect to the body through other selected Items.
 */
export function startShu(
  runtime: NenActivityRuntime,
  request: StartShuRequest,
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.shu.start",
    label: "Start Shū",
    inputs: {
      activityId: { value: describeDiagnosticValue(request?.activityId) },
      items: { value: describeDiagnosticValue(request?.selection?.length) },
      at: { value: describeDiagnosticValue(request?.at) },
    },
  });

  if (request === null || typeof request !== "object") {
    return refuse(root, [{
      code: "nen.shu.request.malformed",
      message: "A Shū activation must be an object.",
      audience: "developer",
      required: "StartShuRequest",
      actual: describeDiagnosticValue(request),
    }]);
  }

  const structural = findNenActivityRuntimeIssues(runtime);

  if (structural.length > 0) return refuse(root, structural);

  const existing = activeShuActivity(runtime);

  if (existing !== undefined) {
    return refuse(root, [{
      code: "nen.shu.already_active",
      message: "Shū is already running; adjust its selection instead.",
      audience: "player",
      required: "no active Shū",
      actual: existing.id,
    }]);
  }

  const resolved = resolveSelection(root, runtime, request, request);

  if (!resolved.ok) return refuse(root, resolved.errors);

  const priority = request.priority ?? 0;

  const activated = activateNenActivity(
    runtime,
    {
      activityId: request.activityId,
      definitionId: SHU_ID,
      source: request.source,
      at: request.at,
      requested: shuConfiguration(resolved.network),
      priority,
      funding: unfundedOutcome(
        runtime,
        `${describeDiagnosticValue(request.activityId)}:shu-activation`,
        request.source,
        priority,
      ),
    },
    NEN_PRINCIPLE_DEFINITIONS,
  );

  root.children.push(activated.trace.root);

  if (!activated.success) return refuse(root, activated.errors);

  root.output = { items: resolved.network.items.length, committed: 0 };

  return { ...activated, trace: { root } };
}


/* ── Adjusting Shū ──────────────────────────────────────────────────────── */

export interface AdjustShuRequest
  extends ShuCharacterFacts, ShuSelectionRequest {
  readonly activityId: string;
  readonly at: GameTimestamp;
  readonly by: ContributionSourceRef;
}


/**
 * Change which Items a running Shū covers.
 *
 * The VOLUNTARY route, and the one that costs an Action. When an Item is
 * dropped, destroyed or loses contact, the selection changes too — but that is
 * a recomputation the world forced, it costs nothing, and it goes through
 * `gameplay/nen` rather than through here.
 */
export function adjustShu(
  runtime: NenActivityRuntime,
  request: AdjustShuRequest,
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.shu.adjust",
    label: "Adjust the Shū selection",
    inputs: {
      activityId: { value: describeDiagnosticValue(request?.activityId) },
      items: { value: describeDiagnosticValue(request?.selection?.length) },
      at: { value: describeDiagnosticValue(request?.at) },
    },
  });

  if (request === null || typeof request !== "object") {
    return refuse(root, [{
      code: "nen.shu.request.malformed",
      message: "A Shū adjustment must be an object.",
      audience: "developer",
      required: "AdjustShuRequest",
      actual: describeDiagnosticValue(request),
    }]);
  }

  const structural = findNenActivityRuntimeIssues(runtime);

  if (structural.length > 0) return refuse(root, structural);

  const activity = activeShuActivity(runtime);

  if (activity === undefined || activity.id !== request.activityId) {
    return refuse(root, [{
      code: "nen.shu.not_active",
      message: "Only a running Shū can have its selection adjusted.",
      audience: "player",
      required: "the active Shū activity",
      actual: describeDiagnosticValue(request.activityId),
    }]);
  }

  const resolved = resolveSelection(root, runtime, request, request);

  if (!resolved.ok) return refuse(root, resolved.errors);

  const adjusted = adjustNenActivity(runtime, {
    activityId: activity.id,
    at: request.at,
    by: request.by,
    requested: shuConfiguration(resolved.network),
    funding: unfundedOutcome(
      runtime,
      `${activity.id}:shu-adjustment@${describeDiagnosticValue(request.at)}`,
      activity.source,
      activity.priority,
    ),
  });

  root.children.push(adjusted.trace.root);

  if (!adjusted.success) return refuse(root, adjusted.errors);

  root.output = { items: resolved.network.items.length, committed: 0 };

  return { ...adjusted, trace: { root } };
}
