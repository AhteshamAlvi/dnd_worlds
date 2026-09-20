/*
 * Shouting. As an Action, with a price, that somebody may or may not hear.
 *
 *
 * WHY THERE IS NO AUTOMATIC ALERT
 *
 * The rule that makes every other rule here matter is R11's: nothing tells the
 * party. A character who sees the ambush knows about the ambush, and their
 * friend three metres away does not, until somebody deliberately does
 * something about it and pays for it.
 *
 * The version without this is the one every system drifts into — a detecting
 * character sets `aware = true` on their allies, and Concealment, Detection,
 * distance, language, deafness and line of sight all stop existing between
 * party members. It reads as a convenience. It is a telepathy Trait that every
 * character has and nobody bought.
 *
 * So a warning is a real Action, charged through Combat's own
 * `spendCombatAction` against the shared Round pool — not a warning budget,
 * not a free interjection, not a reaction resource. Combat's own comment says
 * incidental speech is not inherently an Action, and that is still true: this
 * is not incidental speech, it is deliberately conveying mechanical
 * information in time to matter.
 *
 *
 * WHY THE METHOD IS REFERENCED AND NOT BUILT IN
 *
 * A shout, a hand signal, a radio and telepathy are not one mechanic. They
 * travel on different channels, reach different distances, are intercepted by
 * different people and fail for different reasons. A generic Warning Action
 * with a channel of its own would collapse all four into whichever one the
 * author happened to pick.
 *
 * So the declaration NAMES a communication profile and carries no emissions of
 * its own, and the cues come out of composition exactly as a Skill's do. The
 * engine ships one such profile, `ordinary-shout`; everything else is content.
 *
 *
 * WHY IT EMITS THROUGH COMPOSITION AND NOT FROM HERE
 *
 * R24: composition is the only automatic producer of resolved cues, and that
 * stays true for warnings. This module assembles a step and hands it to
 * `composeSensoryCues` — the same function a fire blast goes through — so a
 * warning can be suppressed by an authorized adjustment, combines by the same
 * maximum rule, and appears in a trace in the same shape. Constructing a cue
 * here would have been three lines and a second producer.
 *
 *
 * WHAT A WARNING CARRIES
 *
 * The same four facts a danger cue discloses, and no more. A warning that
 * revealed the attacker's identity would be a better information channel than
 * seeing them, which is backwards — R16 is explicit that being warned does not
 * reveal an invisible assailant. What it does is tell you something is coming,
 * roughly when, and roughly from where.
 */

import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../../infrastructure/result";
import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import {
  contributionSourceKey,
  type ContributionSourceRef,
} from "../../infrastructure/contribution-source";
import type { GameDuration, GameTimestamp } from "../../time/types";
import { ONE_ACTION, type StructuredActionCost } from "../../actions/cost";
import type { CombatantId, NeutralCombatAction } from "../combat/types";
import {
  collectEmissionContributions,
  collectPropagationProfiles,
  type EmissionProfileDefinition,
} from "../composition/profiles";
import {
  composeSensoryCues,
  type ComposedSensoryCue,
  type EmissionAnchorPositions,
} from "../composition/sensory";
import type { ChannelPropagationProfile } from "../composition/propagation";
import type { ActionPhaseRef } from "../composition/phases";
import { subjectAwareness, type ThreatAwareness } from "./awareness";
import type { ThreatIdentity } from "./identity";
import { defaultEffectPoint, type ActionEffectPoint } from "./timing";
import type { DangerDisclosure } from "./reception";


const TRACE_ID = "gameplay.awareness.warning";


/**
 * How the warning is being conveyed.
 *
 * A `ContributionSourceRef` like every other piece of content, so a
 * communication method is looked up in the emission profile registry by the
 * same mechanism a Skill is. Hosts add methods by registering profiles.
 */
export type CommunicationMethodRef = ContributionSourceRef;


export interface WarningDeclarationInput {
  readonly warningId: string;

  /** The ONE threat this warning is about. R12 permits no second. */
  readonly threat: ThreatIdentity;

  readonly speakerId: string;

  /** Absent outside structured time, where there is no Action to charge. */
  readonly speakerCombatantId?: CombatantId;

  readonly method: CommunicationMethodRef;

  readonly declaredAt: GameTimestamp;

  /**
   * How long conveying it takes.
   *
   * Supplied by the caller from the same `combat.action-duration` contextual
   * profile every other Action resolves its duration through. There is no
   * constant in this file: inventing a speech duration is exactly the balance
   * value this engine keeps declining to choose.
   */
  readonly executionDuration: GameDuration;

  /** An authored effect point, for methods that do not wait to finish. */
  readonly effectiveAt?: GameTimestamp;

  /** What the speaker is passing on. Four facts, per R3 and R16. */
  readonly disclosure: DangerDisclosure;

  /** Proof the speaker knows. A warning about something unnoticed is a lie. */
  readonly awareness: ThreatAwareness;
}


export interface PreparedWarning {
  readonly warningId: string;
  readonly threatKey: string;
  readonly speakerId: string;
  readonly speakerCombatantId?: CombatantId;

  readonly method: CommunicationMethodRef;

  /** One Action from the shared pool. Never a separate resource. */
  readonly cost: StructuredActionCost;

  readonly effect: ActionEffectPoint;

  readonly disclosure: DangerDisclosure;

  readonly trace: TraceNode;
}


function warningFailure(
  errors: NonEmptyArray<EngineError>,
  label = "Declare a warning",
): EngineResult<never> {
  return engineFailure({
    root: createTraceNode({ id: TRACE_ID, label, output: false }),
  }, errors);
}


/**
 * Declare a warning, and prove the speaker has something to warn about.
 *
 * The awareness check is the one that keeps R12 honest. Without it a caller
 * could produce a warning about a threat nobody detected — which is awareness
 * appearing from nothing, one indirection further along than the direct
 * mutation R12 forbids.
 */
export function declareWarning(
  input: WarningDeclarationInput,
): EngineResult<PreparedWarning> {
  const errors: EngineError[] = [];

  if (
    typeof input?.warningId !== "string" ||
    input.warningId.trim().length === 0
  ) {
    errors.push({
      code: "awareness.warning.id.missing",
      message: "A warning must have an identifier.",
      audience: "developer",
      required: "a non-empty id",
      actual: describeDiagnosticValue(input?.warningId),
    });
  }

  if (
    typeof input?.method?.type !== "string" ||
    typeof input?.method?.id !== "string" ||
    input.method.type.trim().length === 0 ||
    input.method.id.trim().length === 0
  ) {
    errors.push({
      code: "awareness.warning.method.missing",
      message:
        "A warning must name the communication method it is conveyed through.",
      audience: "developer",
      required: "a communication profile reference",
      actual: describeDiagnosticValue(input?.method),
    });
  }

  if (!Number.isFinite(input?.declaredAt)) {
    errors.push({
      code: "awareness.warning.declared-at.invalid",
      message: "A warning must say when it was declared.",
      audience: "developer",
      required: "a finite timestamp",
      actual: describeDiagnosticValue(input?.declaredAt),
    });
  }

  if (
    !Number.isFinite(input?.executionDuration) ||
    (input?.executionDuration ?? -1) < 0
  ) {
    errors.push({
      code: "awareness.warning.duration.invalid",
      message:
        "A warning must carry the duration its communication method takes.",
      audience: "developer",
      required: "a non-negative duration",
      actual: describeDiagnosticValue(input?.executionDuration),
    });
  }

  const speaker = input?.awareness === undefined
    ? undefined
    : subjectAwareness(input.awareness, input.speakerId);

  if (speaker === undefined || !speaker.detected) {
    errors.push({
      code: "awareness.warning.speaker.unaware",
      message: "A character cannot warn anybody about a threat they have not detected.",
      audience: "developer",
      required: "a speaker who detected this threat",
      actual: input?.speakerId ?? "unknown",
    });
  }

  if (input?.awareness !== undefined && input.awareness.threatKey !== input.threat?.key) {
    errors.push({
      code: "awareness.warning.threat.mismatch",
      message: "This warning's awareness record belongs to a different threat.",
      audience: "developer",
      required: input.threat?.key ?? "a threat key",
      actual: input.awareness.threatKey,
    });
  }

  const first = errors[0];

  if (first !== undefined) {
    return warningFailure(errors as NonEmptyArray<EngineError>);
  }

  const effect = input.effectiveAt === undefined
    ? defaultEffectPoint(input.declaredAt, input.executionDuration)
    : {
      startedAt: input.declaredAt,
      effectiveAt: input.effectiveAt,
      authored: true,
    };

  const trace = createTraceNode({
    id: TRACE_ID,
    label: "Declare a warning",
    formula: "one Action from the shared Round pool; effective when the Action completes",
    inputs: {
      threat: { value: input.threat.key },
      speaker: { value: input.speakerId },
      method: { value: contributionSourceKey(input.method) },
      declaredAt: { value: input.declaredAt },
      authoredEffect: { value: effect.authored },
    },
    output: effect.effectiveAt,
  });

  return engineSuccess({
    warningId: input.warningId,
    threatKey: input.threat.key,
    speakerId: input.speakerId,
    ...(input.speakerCombatantId === undefined
      ? {}
      : { speakerCombatantId: input.speakerCombatantId }),
    method: input.method,
    cost: ONE_ACTION,
    effect,
    disclosure: input.disclosure,
    trace,
  }, { root: trace });
}


/**
 * The warning as an Action Combat can charge.
 *
 * `threatenedCombatantIds` is empty and that is not an oversight: warning
 * somebody endangers nobody, so the shout opens no Reaction queue of its own.
 * A warning that threatened its listeners would have them rolling Gates
 * against being shouted at.
 *
 * Returns undefined outside structured time, where there is no Round to
 * charge. The warning still happens and is still heard; it simply costs
 * nothing, which is the same rule every other Action follows.
 */
export function warningCombatAction(
  warning: PreparedWarning,
): NeutralCombatAction | undefined {
  if (warning.speakerCombatantId === undefined) return undefined;

  return {
    kind: "neutral",
    id: warning.warningId,
    actorCombatantId: warning.speakerCombatantId,
    intentId: warning.warningId,
    actionCost: warning.cost.actions,
    threatenedCombatantIds: [],
  };
}


export interface WarningEmissionInput {
  readonly warning: PreparedWarning;

  /** The step at which it is conveyed: the Action's own completion. */
  readonly step: ActionPhaseRef;

  readonly anchors: EmissionAnchorPositions;

  readonly profiles: readonly EmissionProfileDefinition[];
}


export interface WarningEmission {
  readonly cues: readonly ComposedSensoryCue[];
  readonly propagation: readonly ChannelPropagationProfile[];
  readonly trace: TraceNode;
}


/**
 * What the warning puts into the world, composed the ordinary way.
 *
 * A method with no registered profile emits nothing, and that is a real
 * answer rather than an error: an unregistered method is one this engine
 * cannot make a noise for, and the warning then reaches nobody. R13's
 * "missing communication facts must refuse or remain unavailable" is this,
 * structurally — no profile, no cue, no recipient.
 */
export function composeWarningCues(
  input: WarningEmissionInput,
): WarningEmission {
  const sources = [input.warning.method];

  const contributions = collectEmissionContributions(sources, input.profiles);

  const composed = composeSensoryCues({
    source: input.warning.method,
    actionId: input.warning.warningId,
    step: input.step,
    anchors: input.anchors,
    contributions,
  });

  const trace = createTraceNode({
    id: `${TRACE_ID}.emission`,
    label: "Compose a warning's cues",
    inputs: {
      warning: { value: input.warning.warningId },
      method: { value: contributionSourceKey(input.warning.method) },
      contributions: { value: contributions.length },
    },
    output: composed.cues.length,
    children: [composed.trace],
  });

  return {
    cues: composed.cues,
    propagation: collectPropagationProfiles(sources, input.profiles),
    trace,
  };
}
