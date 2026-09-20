/*
 * The five semantic phases an action passes through, and nothing else.
 *
 * An arrow is not one event. It is drawn, it is loosed, it crosses a gap, it
 * arrives, and something is true afterwards — and those are five different
 * moments with different origins, different timings and different things to
 * notice. Collapsing them is what forces every consumer to re-derive "was
 * this the bit where the bowstring snapped or the bit where the head hit the
 * shield" from data that no longer says.
 *
 *
 * WHY THE LIST IS CLOSED
 *
 * Content may not invent a phase. The vocabulary is closed because every
 * projector in this domain switches on it exhaustively — a sensory composer
 * asks "what does release sound like", a threat projector asks "has this been
 * committed yet" — and a sixth phase invented by a Skill would silently mean
 * "none of the above" everywhere at once, which is the failure mode a closed
 * union exists to prevent.
 *
 * What content MAY do is omit a phase or repeat one. A stance has only a
 * preparation; a punch has no travel; a volley has three releases and three
 * impacts. Repetition is expressed through `stepId` and `sequence` rather than
 * through a new phase id, so the semantic question ("is this an impact?")
 * stays answerable while the bookkeeping question ("which impact?") gets its
 * own field.
 *
 *
 * WHY A STEP CARRIES ITS OWN ORIGIN AND TIME
 *
 * The release happens at the bow and the impact happens at the target, and
 * those are different places; travel happens between them and takes time. An
 * action that carried one origin and one timestamp would make every phase
 * claim to have happened where and when the FIRST one did, which is wrong for
 * exactly the phases anyone wants to reason about.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import type { GameTimestamp } from "../../time/types";
import { findPositionIssues, type SpatialPosition } from "../../spatial";


export const ACTION_PHASES = [
  /* Declared, aimed, drawn. Nothing has left the actor yet. */
  "preparation",

  /* The moment it leaves: the loose, the swing, the word spoken. */
  "release",

  /* Crossing the gap. Absent entirely for anything that arrives at once. */
  "travel",

  /* Arrival, whether or not it lands the way it was meant to. */
  "impact",

  /* What is true once it is over: the embedded shaft, the smoke, the body. */
  "aftermath",
] as const;

export type ActionPhase = typeof ACTION_PHASES[number];


export function isActionPhase(value: unknown): value is ActionPhase {
  return typeof value === "string" &&
    (ACTION_PHASES as readonly string[]).includes(value);
}


/**
 * One occurrence of one phase.
 *
 * `stepId` is the identity and `sequence` is the order. Both are required even
 * for an action with a single step, because "this action has one impact" is a
 * fact about today's content rather than about the shape, and a field that
 * appears only once things get complicated is a field half the consumers will
 * have been written without.
 */
export interface ActionPhaseRef {
  readonly phase: ActionPhase;

  /** Stable within one action. Two steps may never share it. */
  readonly stepId: string;

  /** Deterministic ordering across every step of one action. */
  readonly sequence: number;

  readonly occursAt: GameTimestamp;

  /**
   * Where this step happens, when it is somewhere in particular.
   *
   * Optional because a preparation frequently has no place worth naming
   * separately from the actor, and inventing one would be a coordinate the
   * host never asserted.
   */
  readonly origin?: SpatialPosition;
}


export function findActionPhaseRefIssues(
  ref: ActionPhaseRef,
  path = "phase",
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!isActionPhase(ref.phase)) {
    errors.push({
      code: "composition.phase.unknown",
      message: "An action step must name one of the five semantic phases.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.phase` },
      required: [...ACTION_PHASES],
      actual: describeDiagnosticValue(ref.phase),
    });
  }

  if (typeof ref.stepId !== "string" || ref.stepId.trim().length === 0) {
    errors.push({
      code: "composition.phase.step-id.missing",
      message: "An action step must carry a stable step identity.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.stepId` },
      required: "non-empty step id",
      actual: describeDiagnosticValue(ref.stepId),
    });
  }

  if (!Number.isInteger(ref.sequence) || ref.sequence < 0) {
    errors.push({
      code: "composition.phase.sequence.invalid",
      message: "An action step's sequence must be a whole number of zero or more.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.sequence` },
      required: "integer >= 0",
      actual: describeDiagnosticValue(ref.sequence),
    });
  }

  if (!Number.isFinite(ref.occursAt)) {
    errors.push({
      code: "composition.phase.time.invalid",
      message: "An action step must happen at a finite authoritative time.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.occursAt` },
      required: "finite timestamp",
      actual: describeDiagnosticValue(ref.occursAt),
    });
  }

  if (ref.origin !== undefined) {
    errors.push(...findPositionIssues(ref.origin));
  }

  return errors;
}


/** A stable key for one step, for maps and cue identity. */
export function actionPhaseKey(ref: ActionPhaseRef): string {
  return `${ref.phase}#${ref.stepId}`;
}


/**
 * Everything wrong with a whole action's step list.
 *
 * Checked as a SET rather than per step, because the two rules that matter
 * here — unique identity and deterministic order — are not properties any
 * single step has. A duplicate `stepId` makes two genuinely different impacts
 * indistinguishable to anything that keys on identity, and a duplicate
 * `sequence` leaves the order to whatever sort happens to be stable today.
 */
export function findActionPhaseSequenceIssues(
  refs: readonly ActionPhaseRef[],
  path = "phases",
): readonly EngineError[] {
  const errors: EngineError[] = [];

  refs.forEach((ref, index) => {
    errors.push(...findActionPhaseRefIssues(ref, `${path}[${index}]`));
  });

  const seenSteps = new Set<string>();
  const seenSequences = new Set<number>();

  for (const ref of refs) {
    if (seenSteps.has(ref.stepId)) {
      errors.push({
        code: "composition.phase.step-id.duplicate",
        message: "Two steps of one action share a step identity.",
        audience: "developer",
        subject: { kind: "field", id: path },
        required: "unique step ids",
        actual: ref.stepId,
      });
    }

    seenSteps.add(ref.stepId);

    if (seenSequences.has(ref.sequence)) {
      errors.push({
        code: "composition.phase.sequence.duplicate",
        message: "Two steps of one action share a sequence number.",
        audience: "developer",
        subject: { kind: "field", id: path },
        required: "unique sequence numbers",
        actual: describeDiagnosticValue(ref.sequence),
      });
    }

    seenSequences.add(ref.sequence);
  }

  return errors;
}


/**
 * The steps in the order they happen.
 *
 * By `sequence` alone, and never by `occursAt`: two steps can legitimately
 * share a timestamp at the clock's resolution — a volley loosed in one instant
 * — and sorting by time would then leave their order to the sort's stability.
 * Sequence is required precisely so this function never has to guess.
 */
export function orderActionPhases(
  refs: readonly ActionPhaseRef[],
): readonly ActionPhaseRef[] {
  return [...refs].sort((left, right) => left.sequence - right.sequence);
}
