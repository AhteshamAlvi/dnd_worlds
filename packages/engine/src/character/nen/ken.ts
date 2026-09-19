/*
 * The Ken adapter — where the Ken principle meets the generic runtime and Aura.
 *
 * Ken opens Output through Ren and then CONTAINS it: the same nodes, the same
 * reachable share, and none of it leaving the body. That is the whole of the
 * difference from Ren, and it is why this file looks like `ren.ts` with one
 * thing removed and one thing added.
 *
 *   removed   the outward flow. Ren's continuous Oactive-per-minute drain does
 *             not exist here, at any rank, and there is no reduced version of
 *             it either. Ken's Output is HELD, and holding Output commits
 *             capacity without spending the reserve.
 *
 *   added     a second endurance clock. Ren can only run out one way — the
 *             body stops being able to hold the nodes open. Ken can run out
 *             that way OR by the character losing their grip on what they are
 *             containing, and the two have different capacities and are spent
 *             at different rates. Both are declared; the earliest wins.
 *
 *
 * TWO MASTERIES, TWO DIFFERENT QUESTIONS
 * --------------------------------------
 *
 *   Ken mastery decides how much can be CONTAINED    Cken = P * fraction
 *   Ren mastery decides how much can be OPENED       Oren = P * fraction
 *
 * and the Ken actually running is bounded by the smaller of those, by what
 * Output is left uncommitted, and by the Aura available to fund it. Neither
 * mastery caps the other's RANK — that was the old progression edge KGS-1
 * removed, and the reason it was wrong is visible here: Ken III with Ren II is
 * a character who can contain far more than they can currently open, which is
 * a perfectly ordinary thing to be and not a reason to call them Ken II.
 *
 *
 * KEN I IS TEN'S COATING
 * ----------------------
 *
 * Ten holds 10% of Physiological Output against the body. Ken I holds 10% of
 * Physiological Output against the body. They are the same coating at the same
 * density and they do the same thing when something hits it; what Ken adds is
 * the ability to hold NINE more tenths of it. There is no Ken-only force
 * bonus, no offensive and defensive coating types, and nothing here that makes
 * the same Aura worth more because of which principle placed it.
 *
 *
 * WHAT DISPLACES TEN
 * ------------------
 *
 * An `explicit` access override, projected while the activity runs, exactly as
 * Ren projects an outward-flow one. Ten's coating is set aside for as long as
 * Ken is up and is back the instant it is not — there is no moment with both
 * and no moment with neither, because the override is derived from the running
 * activity rather than written into any state.
 *
 * The override says `uncontained: false` and carries no leak, because Ken has
 * none: not a reduced leak, not a leak that falls with mastery, and not a zero
 * placeholder that something could later make non-zero.
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
  NEN_CONTAINMENT_CLOCK_ID,
  reduceKenSelectionTo,
  resolveKenSelection,
  type KenSelection,
} from "../foundation/nen/principles/ken";
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
  KEN_ACTIVITY_DEFINITION_ID as KEN_ID,
  NEN_PRINCIPLE_DEFINITIONS,
} from "./definitions";
import {
  activateNenActivity,
  adjustNenActivity,
  type NenActivityTransition,
} from "./runtime/transitions";


export {
  KEN_ACTIVITY_DEFINITION,
  KEN_ACTIVITY_DEFINITION_ID,
} from "./definitions";


/** The provenance Ken's access override carries into Aura. */
export const KEN_ACCESS_SOURCE = "ken";


/** Whether an activity is a Ken. The one place that question is asked. */
export function isKenActivity(activity: NenActivity): boolean {
  return activity.definitionId === KEN_ID;
}


/** The running Ken, if there is one. */
export function activeKenActivity(
  runtime: NenActivityRuntime,
): NenActivity | undefined {
  return activeNenActivities(runtime).find(isKenActivity);
}


/*
 * Why Ken cannot run for this character right now, if it cannot.
 *
 * Read from authored state alone, which cannot change inside a time advance —
 * so a Ken that is illegal is illegal from the advance's first instant, and
 * the coordinator stops it there rather than at the end.
 *
 * Ten and Ren are both checked, and Ken itself: Ken is Output opened through
 * Ren and held by a body that is already containing with Ten, so a seal that
 * takes either to zero takes the Ken with it. What it does NOT do is reduce
 * Ken's rank — the character still knows Ken VIII, they simply have nothing to
 * hold — which is why this returns a stop cause and never a number.
 */
export function kenStopCauseFor(nen: NenState): NenActivityStopCause | null {
  if (!isNenAwakened(nen)) return "access-lost";
  if (isSuppressed(nen.awakening)) return "suppressed";

  for (const capability of ["ten", "ren", "ken"] as const) {
    if (deriveEffectiveNenMastery(nen, capability) < 1) return "sealed";
  }

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


export interface KenCharacterFacts {
  readonly nen: NenState;

  /** The resolved stat block Physiological Output is derived from. */
  readonly attributes: Attributes;

  /** Current Aura at the transition instant, already projected to it. */
  readonly currentAura: number;
}


/*
 * Output already held by everything except one activity.
 *
 * Ken competes for the SAME Output budget as every other Nen activity, so what
 * it may open is what is left over. Excluding one activity by id is what makes
 * an adjustment work: a Ken raising itself from 200 to 300 is competing with
 * everything else, not with the 200 it is about to stop holding.
 */
function committedByOthers(
  runtime: NenActivityRuntime,
  exceptActivityId?: string,
): number {
  return activeNenActivities(runtime)
    .filter((one) => one.id !== exceptActivityId)
    .reduce((sum, one) => sum + one.funding.committed, 0);
}


/*
 * Everything a Ken selection needs to be legal and fully funded.
 *
 * Shared by activation and adjustment so neither can accept a selection the
 * other would refuse. Returns the resolved selection and the settled funding,
 * or the refusal — never a partially-funded Ken.
 */
function resolveFundedSelection(
  root: TraceNode,
  runtime: NenActivityRuntime,
  facts: KenCharacterFacts,
  selectedOutput: number,
  requestId: string,
  source: ContributionSourceRef,
  priority: number,
  exceptActivityId?: string,
):
  | {
    readonly ok: true;
    readonly selection: KenSelection;
    readonly funding: AuraFundingOutcome;
  }
  | { readonly ok: false; readonly errors: readonly EngineError[] } {
  const cause = kenStopCauseFor(facts.nen);

  if (cause !== null) {
    return {
      ok: false,
      errors: [{
        code: `nen.ken.unavailable.${cause}`,
        message: cause === "sealed"
          ? "This character has no usable Ten, Ren or Ken Mastery."
          : cause === "suppressed"
            ? "A suppressed character cannot open their nodes into Ken."
            : "Only an awakened character can use Ken.",
        audience: "player",
        required:
          "an awakened, unsuppressed character with Ten, Ren and Ken at I or higher",
        actual: cause,
      }],
    };
  }

  const current = facts.currentAura;

  if (typeof current !== "number" || !Number.isFinite(current) || current < 0) {
    return {
      ok: false,
      errors: [{
        code: "nen.ken.current_aura.invalid",
        message: "Ken is funded from a finite non-negative Current Aura.",
        audience: "developer",
        required: "finite number >= 0",
        actual: describeDiagnosticValue(current),
      }],
    };
  }

  const physiological = deriveAuraOutputLimit(facts.attributes).maximum;

  const selection = resolveKenSelection({
    physiologicalOutput: physiological,
    kenMastery: deriveEffectiveNenMastery(facts.nen, "ken"),
    renMastery: deriveEffectiveNenMastery(facts.nen, "ren"),
    sharedOutputRemaining: Math.max(
      0,
      physiological - committedByOthers(runtime, exceptActivityId),
    ),
    availableAura: current,
    requestedOutput: selectedOutput,
  });

  root.children.push(selection.trace.root);

  if (!selection.success) return { ok: false, errors: selection.errors };

  const { activeOutput, ceiling } = selection.payload;

  /*
   * FULL funding. A Ken running at less than was asked for is a different Ken
   * — a different coating density on every Body Part — so a selection the
   * reserve cannot meet is refused rather than scaled to fit.
   */
  const settlement = settleAuraFunding(
    ceiling.ceiling,
    activeOutput,
    { kind: "require-full" },
  );

  if (settlement.status !== "funded") {
    return {
      ok: false,
      errors: [{
        code: "nen.ken.unfunded",
        message: "This character cannot fund the selected Ken Output in full.",
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
 * The generic configuration a selection becomes.
 *
 * TWO named clocks, and they are genuinely independent:
 *
 *   output       Ren's dimension. How long the body can keep the nodes open
 *                at this share of what Ren can reach. Capacity comes from the
 *                REN rank, so a Ren VIII Ken never runs out this way.
 *   containment  Ken's own. How long the character can keep this much Aura
 *                held against the body. Capacity comes from the KEN rank.
 *
 * Either can be the one that gives out, which is exactly why one clock could
 * not express this. A Ken X holding a trickle through a Ren I is limited by
 * Ren; a Ken I holding everything a Ren X can open is limited by Ken.
 *
 * NO UPKEEP, at any rank. Ken commits Output and spends no Current Aura to
 * keep it committed, so there is no per-round figure for anything to bill —
 * and the absence is deliberate rather than an omission, because a
 * `upkeepPerRound: 0` here would be a field somebody could later make
 * non-zero without noticing what it contradicts.
 */
function kenConfiguration(selection: KenSelection): NenActivityConfiguration {
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
  };
}


/* ── Starting Ken ───────────────────────────────────────────────────────── */

export interface StartKenInput {
  /** Oactive: 0 < selectedOutput <= min(Cken, Oren, budget, Aura). */
  readonly selectedOutput: number;
  readonly at: GameTimestamp;
}

export interface StartKenRequest extends StartKenInput, KenCharacterFacts {
  readonly activityId: string;
  readonly source: ContributionSourceRef;
  readonly priority?: number;
}


/**
 * Start Ken at a selected Output.
 *
 * Refuses — leaving the runtime exactly as it was — an unawakened, suppressed
 * or sealed character, a selection outside the resolved ceiling, a selection
 * the reserve cannot fund in full, and a second Ken. A running Ren or Gyō is
 * ENDED rather than refused: the declarations say Ken replaces both, and
 * swapping between them is a legal transition rather than a mistake.
 *
 * A running Shū survives, because Shū extends whatever coating is in force and
 * Ken supplies one.
 */
export function startKen(
  runtime: NenActivityRuntime,
  request: StartKenRequest,
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.ken.start",
    label: "Start Ken",
    inputs: {
      activityId: { value: describeDiagnosticValue(request?.activityId) },
      selectedOutput: { value: describeDiagnosticValue(request?.selectedOutput) },
      at: { value: describeDiagnosticValue(request?.at) },
    },
  });

  if (request === null || typeof request !== "object") {
    return refuse(root, [{
      code: "nen.ken.request.malformed",
      message: "A Ken activation must be an object.",
      audience: "developer",
      required: "StartKenRequest",
      actual: describeDiagnosticValue(request),
    }]);
  }

  const structural = findNenActivityRuntimeIssues(runtime);

  if (structural.length > 0) return refuse(root, structural);

  const existing = activeKenActivity(runtime);

  if (existing !== undefined) {
    return refuse(root, [{
      code: "nen.ken.already_active",
      message: "Ken is already running; adjust its Output instead.",
      audience: "player",
      required: "no active Ken",
      actual: existing.id,
    }]);
  }

  const priority = request.priority ?? 0;

  const resolved = resolveFundedSelection(
    root,
    runtime,
    request,
    request.selectedOutput,
    `${describeDiagnosticValue(request.activityId)}:ken-activation`,
    request.source,
    priority,
  );

  if (!resolved.ok) return refuse(root, resolved.errors);

  const activated = activateNenActivity(
    runtime,
    {
      activityId: request.activityId,
      definitionId: KEN_ID,
      source: request.source,
      at: request.at,
      requested: kenConfiguration(resolved.selection),
      priority,
      funding: resolved.funding,
    },
    NEN_PRINCIPLE_DEFINITIONS,
  );

  root.children.push(activated.trace.root);

  if (!activated.success) return refuse(root, activated.errors);

  root.output = {
    activeOutput: resolved.selection.activeOutput,
    outputLoad: resolved.selection.outputLoad,
    containmentLoad: resolved.selection.containmentLoad,
  };

  return { ...activated, trace: { root } };
}


/* ── Adjusting Ken ──────────────────────────────────────────────────────── */

export interface AdjustKenRequest extends KenCharacterFacts {
  readonly activityId: string;
  readonly selectedOutput: number;
  readonly at: GameTimestamp;
  readonly by: ContributionSourceRef;
}


/**
 * Change a running Ken's Output.
 *
 * An adjustment, not a stop and a start: the activity keeps its id, source,
 * start time and — the part that matters — the endurance it has already spent
 * on BOTH clocks. Restarting would hand back a fresh thirty minutes for the
 * price of nudging the Output by one point.
 *
 * The new selection is validated and fully funded before anything changes, so
 * a refusal leaves the running Ken exactly as it was.
 */
export function adjustKen(
  runtime: NenActivityRuntime,
  request: AdjustKenRequest,
): EngineResult<NenActivityTransition> {
  const root = createTraceNode({
    id: "nen.ken.adjust",
    label: "Adjust Ken Output",
    inputs: {
      activityId: { value: describeDiagnosticValue(request?.activityId) },
      selectedOutput: { value: describeDiagnosticValue(request?.selectedOutput) },
      at: { value: describeDiagnosticValue(request?.at) },
    },
  });

  if (request === null || typeof request !== "object") {
    return refuse(root, [{
      code: "nen.ken.request.malformed",
      message: "A Ken adjustment must be an object.",
      audience: "developer",
      required: "AdjustKenRequest",
      actual: describeDiagnosticValue(request),
    }]);
  }

  const structural = findNenActivityRuntimeIssues(runtime);

  if (structural.length > 0) return refuse(root, structural);

  const activity = activeKenActivity(runtime);

  if (activity === undefined || activity.id !== request.activityId) {
    return refuse(root, [{
      code: "nen.ken.not_active",
      message: "Only a running Ken can have its Output adjusted.",
      audience: "player",
      required: "the active Ken activity",
      actual: describeDiagnosticValue(request.activityId),
    }]);
  }

  const resolved = resolveFundedSelection(
    root,
    runtime,
    request,
    request.selectedOutput,
    `${activity.id}:ken-adjustment@${describeDiagnosticValue(request.at)}`,
    activity.source,
    activity.priority,
    activity.id,
  );

  if (!resolved.ok) return refuse(root, resolved.errors);

  const adjusted = adjustNenActivity(runtime, {
    activityId: activity.id,
    at: request.at,
    by: request.by,
    requested: kenConfiguration(resolved.selection),
    funding: resolved.funding,
  });

  root.children.push(adjusted.trace.root);

  if (!adjusted.success) return refuse(root, adjusted.errors);

  root.output = {
    activeOutput: resolved.selection.activeOutput,
    outputLoad: resolved.selection.outputLoad,
    containmentLoad: resolved.selection.containmentLoad,
  };

  return { ...adjusted, trace: { root } };
}


/* ── Shortfall ──────────────────────────────────────────────────────────── */

/**
 * The most Ken this character could still hold, given what has changed.
 *
 * For the caller that has to REDUCE a Ken rather than refuse a request: a
 * budget or reserve that fell below what is committed does not make the Ken
 * illegal, it makes it too big. Zero means the Ken must end.
 *
 * Deliberately separate from the adjustment path and deliberately silent about
 * Actions. A forced reduction is not something the character chose to do, so
 * it costs nothing, and routing it through `adjustKen` would have charged for
 * it — see `gameplay/nen`, which spends an Action only on the voluntary route.
 */
export function kenShortfallOutput(
  runtime: NenActivityRuntime,
  facts: KenCharacterFacts,
): number | null {
  const activity = activeKenActivity(runtime);

  if (activity === undefined) return null;
  if (kenStopCauseFor(facts.nen) !== null) return 0;

  const physiological = deriveAuraOutputLimit(facts.attributes).maximum;

  const selection = resolveKenSelection({
    physiologicalOutput: physiological,
    kenMastery: deriveEffectiveNenMastery(facts.nen, "ken"),
    renMastery: deriveEffectiveNenMastery(facts.nen, "ren"),
    sharedOutputRemaining: Math.max(
      0,
      physiological - committedByOthers(runtime, activity.id),
    ),
    availableAura: Math.max(0, facts.currentAura),
    requestedOutput: activity.funding.committed,
  });

  if (selection.success) return activity.funding.committed;

  /*
   * The request no longer fits, so the answer is the greatest amount that
   * does. Resolved from the ceiling rather than guessed at, which is why this
   * re-resolves with a request the ceiling is guaranteed to admit.
   */
  const probe = resolveKenSelection({
    physiologicalOutput: physiological,
    kenMastery: deriveEffectiveNenMastery(facts.nen, "ken"),
    renMastery: deriveEffectiveNenMastery(facts.nen, "ren"),
    sharedOutputRemaining: Math.max(
      0,
      physiological - committedByOthers(runtime, activity.id),
    ),
    availableAura: Math.max(0, facts.currentAura),
    requestedOutput: Number.MIN_VALUE,
  });

  return probe.success
    ? reduceKenSelectionTo(probe.payload.ceiling, activity.funding.committed)
    : 0;
}


/* ── Access ─────────────────────────────────────────────────────────────── */

/**
 * An access input with the running Ken laid over it.
 *
 * Unchanged when no Ken is running — the character's ordinary state, Ten
 * included, is exactly what they have, which is what makes Ten's return at the
 * end of a Ken automatic rather than something anything has to restore.
 *
 * `automaticSurfaceCoating: false` sets Ten's coating aside; Ken's own coating
 * is the committed Output and is placed by `gameplay/nen`, not here.
 * `uncontained: false` is Ken's defining property: the Output is held, so
 * nothing escapes, at every rank.
 */
export function withKenAccess(
  input: AuraAccessInput,
  runtime: NenActivityRuntime,
  attributes: Attributes,
): AuraAccessInput {
  const activity = activeKenActivity(runtime);

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


/** The Output a running Ken is holding, or null when none is. */
export function kenHeldOutput(runtime: NenActivityRuntime): number | null {
  return activeKenActivity(runtime)?.funding.committed ?? null;
}
