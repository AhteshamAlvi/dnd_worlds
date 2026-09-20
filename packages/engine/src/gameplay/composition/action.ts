/*
 * The thing a caller actually holds: one action's projections, on demand.
 *
 *
 * WHY THIS RETURNS AN OBJECT WITH METHODS RATHER THAN A RESULT
 *
 * Because most of what could be computed never needs to be. A GM previewing
 * options wants the range and nothing else. A Reaction Gate wants the danger
 * and nothing else. A settlement wants the impact cues and has no interest in
 * what the preparation sounded like. Computing all of it up front and handing
 * over a fat result would do four or five projections' work to answer one
 * question, every time, for every option on a menu.
 *
 * So `prepareActionProjections` validates and binds, and then computes
 * nothing. Each accessor is the request, and the session behind them makes a
 * repeated request free without making an unmade one happen.
 *
 * The validation still happens eagerly, and deliberately: a malformed profile
 * should be refused when the action is prepared, not when somebody later
 * happens to ask a question that touches it.
 *
 *
 * WHERE THE THREAT DIMENSIONS COME FROM
 *
 * Severity is content's — only a Skill knows whether it bruises or kills.
 * Urgency and commitment are not: they are facts about how far through the
 * action you are, identical for every action at the same point. A fire blast
 * being gathered and an arrow being drawn are equally "declared but not yet
 * loosed", and making each Skill restate that would be a table every author
 * copies and one author eventually gets wrong.
 *
 * So the phase supplies them, which also gives the danger channel the
 * behaviour a danger sense is supposed to have: the same attack registers
 * more urgently as it gets closer to landing, without anything re-deriving it
 * from a damage roll that has not happened.
 */

import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../../infrastructure/result";
import type { EngineError } from "../../infrastructure/diagnostics";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import type { GameTimestamp } from "../../time/types";
import type { Distance, DistanceInterval } from "../../spatial";
import type { ActionProposal } from "../../actions/proposal";
import {
  collectEmissionContributions,
  collectPropagationProfiles,
  collectThreatSeverity,
  type EmissionProfileDefinition,
} from "./profiles";
import {
  composeSensoryCues,
  findSensoryCompositionIssues,
  type ComposedSensoryCue,
  type EmissionAnchorPositions,
} from "./sensory";
import type { ChannelPropagationProfile } from "./propagation";
import {
  findPreparedActionSnapshotIssues,
  type PreparedActionSnapshot,
} from "./snapshot";
import {
  actionPhaseKey,
  findActionPhaseSequenceIssues,
  orderActionPhases,
  type ActionPhase,
  type ActionPhaseRef,
} from "./phases";
import {
  projectRange,
  findRangeProjectionIssues,
  type RangeProjection,
} from "./range";
import {
  projectThreat,
  type ThreatCommitment,
  type ThreatProjection,
  type ThreatUrgency,
} from "./threat";
import {
  createCompositionSession,
  projectionKey,
  type CompositionSession,
} from "./session";


/**
 * How soon the threat is, by where in the action it is.
 *
 * `aftermath` is 0 and not 3: a scorch mark is not about to do anything. The
 * danger channel going quiet once the thing has already happened is the
 * correct behaviour for a sense that warns.
 */
export function urgencyForPhase(phase: ActionPhase): ThreatUrgency {
  if (phase === "preparation") return 1;
  if (phase === "release" || phase === "travel") return 2;
  if (phase === "impact") return 3;

  return 0;
}


/**
 * How committed the actor is, by where in the action it is.
 *
 * Never 0 for a declared action: 0 is "possible or conditional", which
 * describes a threat that has not been declared at all — a drawn bow pointed
 * at nobody. Once an action exists, it is at least armed.
 */
export function commitmentForPhase(phase: ActionPhase): ThreatCommitment {
  return phase === "preparation" ? 1 : 2;
}


export interface ActionProjectionInput {
  readonly snapshot: PreparedActionSnapshot;

  /** Every step of this action, not only the snapshot's own. */
  readonly steps: readonly ActionPhaseRef[];

  /** The content involved: the Skill, its implement, its ammunition. */
  readonly sources: readonly ContributionSourceRef[];

  readonly profiles: readonly EmissionProfileDefinition[];

  /** Absent means this action threatens nobody. */
  readonly threatens: boolean;

  /** Supplied only when someone intends to ask a range question. */
  readonly capability?: DistanceInterval;

  readonly anchors: EmissionAnchorPositions;

  /** Supplied to share memoization with a wider preparation. */
  readonly session?: CompositionSession;
}


export interface ActionProjector {
  readonly snapshot: PreparedActionSnapshot;
  readonly steps: readonly ActionPhaseRef[];
  readonly session: CompositionSession;

  /** Undefined when no capability or measurement was supplied to compare. */
  range(): RangeProjection | undefined;

  /** The danger at one step, before anything is rolled. */
  threatAt(step: ActionPhaseRef): ThreatProjection;

  /** What one step emits. Steps nobody asks about are never composed. */
  cuesAt(step: ActionPhaseRef): readonly ComposedSensoryCue[];

  /** The falloff rules the involved content declares. */
  propagation(): readonly ChannelPropagationProfile[];
}


/**
 * The steps a real proposal implies.
 *
 * Derived from the lifecycle's own facts rather than authored per Skill:
 * `travelDuration` is already on the proposal, and an action that arrives
 * instantly has no travel phase to emit from. That is R4's "an action may omit
 * a phase" happening by itself rather than by every author remembering to.
 *
 * `aftermath` is included for every action, because something is always true
 * afterwards even when it is only "nothing happened" — and a step that emits
 * nothing produces no cue, so an action with no lasting trace costs nothing to
 * have asked about.
 */
export function stepsForProposal(
  proposal: ActionProposal,
  declaredAt: GameTimestamp,
): readonly ActionPhaseRef[] {
  const executionDuration = proposal.executionDuration;
  const travelDuration = proposal.travelDuration ?? 0;

  const releaseAt = declaredAt + executionDuration;
  const impactAt = releaseAt + travelDuration;

  const steps: ActionPhaseRef[] = [
    { phase: "preparation", stepId: "preparation", sequence: 0, occursAt: declaredAt },
    { phase: "release", stepId: "release", sequence: 1, occursAt: releaseAt },
  ];

  if (travelDuration > 0) {
    steps.push({
      phase: "travel",
      stepId: "travel",
      sequence: 2,
      occursAt: releaseAt,
    });
  }

  steps.push(
    { phase: "impact", stepId: "impact", sequence: 3, occursAt: impactAt },
    { phase: "aftermath", stepId: "aftermath", sequence: 4, occursAt: impactAt },
  );

  return steps;
}


export function prepareActionProjections(
  input: ActionProjectionInput,
): EngineResult<ActionProjector> {
  const errors: EngineError[] = [
    ...findPreparedActionSnapshotIssues(input.snapshot),
    ...findActionPhaseSequenceIssues(input.steps),
  ];

  const contributions = collectEmissionContributions(
    input.sources,
    input.profiles,
  );

  errors.push(
    ...findSensoryCompositionIssues({
      source: input.snapshot.implementation.implement,
      actionId: input.snapshot.actionId,
      step: input.snapshot.phase,
      anchors: input.anchors,
      contributions,
      adjustments: input.snapshot.adjustments,
    }),
  );

  const measured = input.snapshot.spatial.separation;

  if (input.capability !== undefined && measured !== undefined) {
    errors.push(
      ...findRangeProjectionIssues({
        measured,
        capability: input.capability,
        ...(input.snapshot.spatial.facts === undefined
          ? {}
          : { facts: input.snapshot.spatial.facts }),
      }),
    );
  }

  const root = createTraceNode({
    id: "composition.action",
    label: "Prepare action projections",
    inputs: {
      action: { value: input.snapshot.actionId },
      proposal: { value: input.snapshot.proposalId },
      steps: { value: input.steps.map((step) => actionPhaseKey(step)) },
      contributions: { value: contributions.length },
    },
    output: errors.length === 0,
  });

  const firstError = errors[0];

  if (firstError !== undefined) {
    return engineFailure({ root }, errors as NonEmptyArray<EngineError>);
  }

  const session = input.session ?? createCompositionSession();
  const steps = orderActionPhases(input.steps);
  const severity = collectThreatSeverity(input.sources, input.profiles);

  const projector: ActionProjector = {
    snapshot: input.snapshot,
    steps,
    session,

    range() {
      if (input.capability === undefined || measured === undefined) {
        return undefined;
      }

      return session.resolve(
        projectionKey("range", measured, input.capability, input.snapshot.spatial.facts),
        () =>
          projectRange({
            measured: measured as Distance,
            capability: input.capability as DistanceInterval,
            ...(input.snapshot.spatial.facts === undefined
              ? {}
              : { facts: input.snapshot.spatial.facts }),
          }),
      );
    },

    threatAt(step) {
      return session.resolve(
        projectionKey("threat", actionPhaseKey(step), severity, input.threatens),
        () =>
          projectThreat({
            source: input.snapshot.implementation.implement,
            appliesTo: { phase: step.phase, stepId: step.stepId },
            /*
             * Three conditions, and the third is the one that makes a danger
             * sense behave like a warning rather than like a commentary.
             *
             * The action must declare that it endangers its targets, content
             * must have stated a severity — a Skill that says it is dangerous
             * but not how dangerous has not given this projector a number, and
             * inventing one would be the unaccepted balance value this whole
             * domain refuses to guess at — and the action must not already be
             * over.
             *
             * `aftermath` is excluded outright rather than given urgency 0.
             * Urgency 0 is a real threat that is merely latent: an untriggered
             * trap, a sleeping predator. A scorch mark is not latent, it is
             * finished, and emitting danger from it would have a character's
             * danger sense screaming about a fireball that already landed.
             */
            ...(input.threatens &&
              severity !== undefined &&
              step.phase !== "aftermath"
              ? {
                  threat: {
                    severity,
                    urgency: urgencyForPhase(step.phase),
                    commitment: commitmentForPhase(step.phase),
                    confidence: "probable" as const,
                  },
                }
              : {}),
          }),
      );
    },

    cuesAt(step) {
      return session.resolve(
        projectionKey("cues", actionPhaseKey(step)),
        () => {
          const threat = projector.threatAt(step);

          /*
           * The danger contribution joins the ordinary ones and goes through
           * the same composer. That is what stops danger from being a special
           * case: it combines, it can be suppressed by an authorized
           * adjustment, and it appears in the trace beside everything else.
           */
          const stepContributions = threat.kind === "threat"
            ? [...contributions, threat.contribution]
            : contributions;

          return composeSensoryCues({
            source: input.snapshot.implementation.implement,
            actionId: input.snapshot.actionId,
            step,
            anchors: input.anchors,
            contributions: stepContributions,
            adjustments: input.snapshot.adjustments,
          }).cues;
        },
      );
    },

    propagation() {
      return session.resolve(
        projectionKey("propagation", input.sources),
        () => collectPropagationProfiles(input.sources, input.profiles),
      );
    },
  };

  return engineSuccess(projector, { root });
}
