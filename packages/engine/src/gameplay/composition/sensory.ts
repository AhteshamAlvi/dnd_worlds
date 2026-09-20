/*
 * Turning what content says an action DOES into what it EMITS.
 *
 * This is the producer the sensory domain was deliberately built without. It
 * reads phase-scoped contributions from the Items, Skills and Effects involved
 * in one action and derives `ResolvedSensoryCue`s — and then it stops. It does
 * not know what an ear is, it never asks who is nearby, and it resolves no
 * Detection. Everything downstream of "this is what happened and this is how
 * loud it was" still belongs to SEN-1.
 *
 *
 * WHY THE STRONGEST WINS INSTEAD OF THE SUM
 *
 * Intensity is an ORDINAL 1-10 scale whose midpoint is 5 and whose modifier is
 * `I - 5`. Adding on that scale is a category error with a very concrete
 * consequence: a bowstring at 3 plus fletching at 2 plus an arrowhead at 2
 * would be a 7, louder than a shout, for a shot nobody in the room would
 * actually turn around for. Three quiet things are not one loud thing — they
 * are three quiet things, and what a listener hears is the loudest of them.
 *
 * So ordinary contributions compete and the maximum wins. Every loser is kept
 * in the trace, because "why is this a 3" is answered by seeing what else was
 * in the running and lost.
 *
 * The ONLY way to exceed the maximum is an authorized `add`, which is exactly
 * the exceptional case the ordinal scale cannot express and a GM sometimes
 * needs — and it is signed, reasoned and clamped at 10.
 *
 *
 * WHY ONE ACTION CAN PRODUCE SEVERAL CUES
 *
 * A cue is one thing happening in one place, of one kind, at one moment. An
 * arrow's release and its impact are two of those and are never merged: they
 * have different origins, different times, and a listener at the target end
 * will plausibly notice one and not the other. Grouping by anchor, subject and
 * phenomenon keeps them apart, and grouping by channel WITHIN a cue keeps the
 * thud and the flash of one impact together, which is what they are.
 */

import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import type { EngineError, Warning } from "../../infrastructure/diagnostics";
import {
  contributionSourceKey,
  type ContributionSourceRef,
} from "../../infrastructure/contribution-source";
import type { SpatialPosition } from "../../spatial";
import {
  MAXIMUM_SENSORY_INTENSITY,
  MINIMUM_SENSORY_INTENSITY,
  type SensoryChannelId,
  type SensoryIntensity,
} from "../../character/foundation/senses/channels";
import type {
  ResolvedSensoryCue,
  SensoryEmissions,
} from "../../character/foundation/senses/cues";
import type {
  DetectionSubject,
  PerceptionPhenomenon,
} from "../../character/foundation/senses/scopes";
import {
  findSensoryEmissionAdjustmentIssues,
  findSensoryEmissionContributionIssues,
  type EmissionAnchor,
  type PhaseApplicability,
  type SensoryEmissionAdjustment,
  type SensoryEmissionContribution,
} from "./contributions";
import { actionPhaseKey, type ActionPhaseRef } from "./phases";


/** Where each anchor actually is, for this step. */
export interface EmissionAnchorPositions {
  readonly actor?: SpatialPosition;
  readonly target?: SpatialPosition;
  readonly step?: SpatialPosition;
}


export interface SensoryCompositionInput {
  /**
   * What the resulting cues are attributed to.
   *
   * The ACTION's source, not each contributing Item's. A bow, its arrow and
   * the Skill loosing it are three contributors to one event, and attributing
   * their cues separately would make them three events that never combine —
   * which is the exact opposite of what the maximum rule is for. Each
   * contribution keeps its own source in the trace.
   */
  readonly source: ContributionSourceRef;

  readonly actionId: string;
  readonly step: ActionPhaseRef;

  readonly anchors: EmissionAnchorPositions;

  readonly contributions: readonly SensoryEmissionContribution[];
  readonly adjustments?: readonly SensoryEmissionAdjustment[];
}


export interface ComposedSensoryCue {
  readonly cue: ResolvedSensoryCue;
  readonly anchor: EmissionAnchor;
  readonly origin?: SpatialPosition;
  readonly trace: TraceNode;
}


export interface SensoryCompositionResult {
  readonly cues: readonly ComposedSensoryCue[];
  readonly trace: TraceNode;
  readonly warnings: readonly Warning[];
}


/** Whether a contribution or adjustment speaks for this particular step. */
export function appliesToStep(
  appliesTo: PhaseApplicability,
  step: ActionPhaseRef,
): boolean {
  if (appliesTo.phase !== step.phase) return false;

  return appliesTo.stepId === undefined || appliesTo.stepId === step.stepId;
}


function anchorOf(contribution: SensoryEmissionContribution): EmissionAnchor {
  return contribution.anchor ?? "step";
}


function positionFor(
  anchor: EmissionAnchor,
  anchors: EmissionAnchorPositions,
  step: ActionPhaseRef,
): SpatialPosition | undefined {
  if (anchor === "actor") return anchors.actor;
  if (anchor === "target") return anchors.target;

  return anchors.step ?? step.origin;
}


function clampIntensity(value: number): SensoryIntensity {
  const bounded = Math.min(
    MAXIMUM_SENSORY_INTENSITY,
    Math.max(MINIMUM_SENSORY_INTENSITY, Math.round(value)),
  );

  return bounded as SensoryIntensity;
}


interface CueGroup {
  readonly key: string;
  readonly anchor: EmissionAnchor;
  readonly subject: DetectionSubject;
  readonly phenomenon: PerceptionPhenomenon;
  readonly contributions: SensoryEmissionContribution[];
}


function groupKey(
  anchor: EmissionAnchor,
  subject: DetectionSubject,
  phenomenon: PerceptionPhenomenon,
): string {
  return `${anchor}|${subject}|${phenomenon}`;
}


/**
 * Everything structurally wrong with the inputs.
 *
 * Every contribution and every adjustment is checked, rather than stopping at
 * the first — an author fixing one typo at a time through five rounds of
 * refusals is a worse experience than seeing all five at once.
 */
export function findSensoryCompositionIssues(
  input: SensoryCompositionInput,
  path = "composition",
): readonly EngineError[] {
  const errors: EngineError[] = [];

  (input?.contributions ?? []).forEach((contribution, index) => {
    errors.push(
      ...findSensoryEmissionContributionIssues(
        contribution,
        `${path}.contributions[${index}]`,
      ),
    );
  });

  (input?.adjustments ?? []).forEach((adjustment, index) => {
    errors.push(
      ...findSensoryEmissionAdjustmentIssues(
        adjustment,
        `${path}.adjustments[${index}]`,
      ),
    );
  });

  return errors;
}


/**
 * Compose one step's cues.
 *
 * Deterministic in every respect a host could otherwise differ on: groups are
 * emitted in sorted key order, channels within a cue are built in sorted
 * order, and the cue id is derived from the identity rather than generated.
 * A composition that produced the same cues in a different order on a
 * different host would make every golden trace host-specific.
 */
export function composeSensoryCues(
  input: SensoryCompositionInput,
): SensoryCompositionResult {
  const step = input.step;
  const stepKey = actionPhaseKey(step);

  const applicable = input.contributions.filter((contribution) =>
    appliesToStep(contribution.appliesTo, step)
  );

  const groups = new Map<string, CueGroup>();

  for (const contribution of applicable) {
    const anchor = anchorOf(contribution);
    const key = groupKey(anchor, contribution.subject, contribution.phenomenon);

    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(key, {
        key,
        anchor,
        subject: contribution.subject,
        phenomenon: contribution.phenomenon,
        contributions: [contribution],
      });
    } else {
      existing.contributions.push(contribution);
    }
  }

  const adjustments = (input.adjustments ?? []).filter((adjustment) =>
    appliesToStep(adjustment.appliesTo, step)
  );

  const appliedAdjustments = new Set<number>();
  const composed: ComposedSensoryCue[] = [];
  const children: TraceNode[] = [];

  for (const group of [...groups.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  )) {
    const result = composeGroup({
      group,
      step,
      stepKey,
      input,
      adjustments,
      appliedAdjustments,
    });

    children.push(result.trace);

    if (result.composed !== undefined) composed.push(result.composed);
  }

  const warnings: Warning[] = [];

  adjustments.forEach((adjustment, index) => {
    if (appliedAdjustments.has(index)) return;

    /*
     * An adjustment that matched nothing is a warning and not an error. The
     * author of a silencing Effect has not done anything wrong by silencing a
     * step that turned out to make no noise — but an override that silently
     * did nothing is also exactly what a mistyped channel looks like, so it
     * is reported rather than dropped.
     */
    warnings.push({
      code: "composition.sensory.adjustment.unapplied",
      message:
        "An authorized adjustment matched no emission at this step and changed nothing.",
      audience: "gm",
      subject: { kind: "channel", id: adjustment.channel },
    });
  });

  return {
    cues: composed,
    warnings,
    trace: createTraceNode({
      id: "composition.sensory",
      label: "Compose sensory emissions",
      inputs: {
        step: { value: stepKey },
        phase: { value: step.phase },
        contributions: { value: applicable.length },
        adjustments: { value: adjustments.length },
      },
      output: composed.length,
      children,
    }),
  };
}


interface GroupCompositionInput {
  readonly group: CueGroup;
  readonly step: ActionPhaseRef;
  readonly stepKey: string;
  readonly input: SensoryCompositionInput;
  readonly adjustments: readonly SensoryEmissionAdjustment[];
  readonly appliedAdjustments: Set<number>;
}


function composeGroup(
  context: GroupCompositionInput,
): { composed?: ComposedSensoryCue; trace: TraceNode } {
  const { group, step, stepKey, input, adjustments, appliedAdjustments } =
    context;

  /* Channel -> the winning contribution, and everyone it beat. */
  const winners = new Map<
    SensoryChannelId,
    { winner: SensoryEmissionContribution; beaten: SensoryEmissionContribution[] }
  >();

  for (const contribution of group.contributions) {
    const existing = winners.get(contribution.channel);

    if (existing === undefined) {
      winners.set(contribution.channel, { winner: contribution, beaten: [] });
      continue;
    }

    /*
     * Strictly greater, so a tie leaves the FIRST one holding the channel.
     * Contributions arrive in the caller's order and that order is stable, so
     * a tie resolves identically everywhere — whereas `>=` would hand the
     * channel to whichever equal contribution happened to be listed last.
     */
    if (contribution.intensity > existing.winner.intensity) {
      winners.set(contribution.channel, {
        winner: contribution,
        beaten: [...existing.beaten, existing.winner],
      });
    } else {
      existing.beaten.push(contribution);
    }
  }

  const emissions = new Map<SensoryChannelId, SensoryIntensity>();
  const channelTraces: TraceNode[] = [];

  for (const [channel, entry] of [...winners.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
  )) {
    emissions.set(channel, entry.winner.intensity);

    channelTraces.push(createTraceNode({
      id: `composition.sensory.${group.key}.${channel}`,
      label: `Strongest contribution on ${channel}`,
      formula: "maximum of ordinary contributions",
      inputs: {
        winner: { value: contributionSourceKey(entry.winner.source) },
        winningIntensity: { value: entry.winner.intensity },
        beaten: {
          value: entry.beaten.map((beatenEntry) =>
            `${contributionSourceKey(beatenEntry.source)}@${beatenEntry.intensity}`
          ),
        },
      },
      output: entry.winner.intensity,
    }));
  }

  const adjustmentTraces: TraceNode[] = [];

  adjustments.forEach((adjustment, index) => {
    if (
      adjustment.subject !== undefined &&
      adjustment.subject !== group.subject
    ) {
      return;
    }

    if (
      adjustment.phenomenon !== undefined &&
      adjustment.phenomenon !== group.phenomenon
    ) {
      return;
    }

    const before = emissions.get(adjustment.channel);

    /*
     * A suppression of a channel that is not emitting changes nothing and is
     * NOT counted as applied, so it still surfaces as an unapplied-adjustment
     * warning. A replace or an add, by contrast, legitimately creates the
     * channel: "make this audible" is a thing an override is for.
     */
    if (adjustment.operation === "suppress") {
      if (before === undefined) return;

      emissions.delete(adjustment.channel);
    } else {
      /*
       * Narrowed rather than asserted. `findSensoryEmissionAdjustmentIssues`
       * already refuses an add or a replace with no amount, but this function
       * must not depend on having been validated first: an unchecked `!` here
       * would turn a caller who skipped validation into `NaN` emissions
       * rather than into no change at all.
       */
      const amount = adjustment.amount;

      if (amount === undefined) return;

      emissions.set(
        adjustment.channel,
        adjustment.operation === "replace"
          ? clampIntensity(amount)
          : clampIntensity((before ?? 0) + amount),
      );
    }

    appliedAdjustments.add(index);

    adjustmentTraces.push(createTraceNode({
      id: `composition.sensory.${group.key}.${adjustment.channel}.adjustment`,
      label: `Authorized ${adjustment.operation} on ${adjustment.channel}`,
      inputs: {
        authorizedBy: { value: adjustment.authorization.authorizedBy },
        reason: { value: adjustment.authorization.reason },
        source: { value: contributionSourceKey(adjustment.source) },
        before: { value: before ?? null },
      },
      output: emissions.get(adjustment.channel) ?? null,
    }));
  });

  const anchor = group.anchor;
  const origin = positionFor(anchor, input.anchors, step);

  const trace = createTraceNode({
    id: `composition.sensory.${group.key}`,
    label: `Cue for ${group.subject}/${group.phenomenon} at ${anchor}`,
    inputs: {
      anchor: { value: anchor },
      subject: { value: group.subject },
      phenomenon: { value: group.phenomenon },
    },
    output: emissions.size,
    children: [...channelTraces, ...adjustmentTraces],
  });

  /*
   * A cue with nothing left to emit is not submitted. cues.ts refuses empty
   * emissions on purpose — an emitter emitting nothing generates no routes —
   * so a fully suppressed group is the ABSENCE of a cue rather than a silent
   * one.
   */
  if (emissions.size === 0) return { trace };

  const cue: ResolvedSensoryCue = {
    id: `${input.actionId}:${stepKey}:${group.key}`,
    source: input.source,
    phenomenon: group.phenomenon,
    subject: group.subject,
    emissions: Object.fromEntries([...emissions.entries()]) as SensoryEmissions,
  };

  return {
    composed: {
      cue,
      anchor,
      ...(origin === undefined ? {} : { origin }),
      trace,
    },
    trace,
  };
}
