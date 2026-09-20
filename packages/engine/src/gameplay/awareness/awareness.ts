/*
 * What each endangered subject knows, and what they have already used it for.
 *
 *
 * ONE THREAT, ONE GATE, AND THE FOUR WAYS THAT GOES WRONG
 *
 * R5 and R6 are two halves of the same guarantee: a subject gets at most one
 * Reaction Gate out of one unchanged threat. Each half fails differently, and
 * this module holds both.
 *
 * Across PHASES, the failure is a fresh chance at every step. A fire blast
 * emits danger while it is gathered, while it crosses, and as it lands, and
 * asking "has this subject detected it yet" at each of those — without
 * remembering the answer — offers three Gates for one attack. So a success is
 * recorded, and it closes the question for good.
 *
 * Across ROUTES, the failure is the opposite: a subject who sees the flash,
 * hears the roar and feels the danger has three reasons to react and must
 * still react once. SEN-1 already settles this — `sweepPassiveDetectionRoutes`
 * compares every route for free and returns ONE result — so this module does
 * not re-derive it. It records the winner and keeps every loser as provenance,
 * because "why did they notice" is answered by seeing what else was in the
 * running.
 *
 *
 * WHY A SPENT GATE IS AS FINAL AS A PASSED ONE
 *
 * The obvious rule is "stop retrying once they detect it", and it is not
 * enough. A subject who detected the gathering, was offered a Gate and
 * DECLINED it has not detected the impact — under the obvious rule the impact
 * phase would look like a fresh opportunity and hand them the Gate they just
 * turned down. The same goes for a Gate that expired unanswered, one already
 * spent on a Reaction, and one the queue found unusable.
 *
 * So the disposition closes the question independently of detection, and R5
 * names all five endings for exactly this reason.
 *
 *
 * WHAT THIS IS NOT
 *
 * It is not a perception matrix. It holds entries only for subjects a real
 * threat projection endangered, it is created per threat rather than per
 * scene, and it answers nothing about subjects nobody asked about. A global
 * "who can see whom" table is explicitly out of scope, and the shape that
 * would grow into one is a map keyed by observer alone.
 */

import type { GameTimestamp } from "../../time/types";
import type { SensoryRoute } from "../../character/foundation/senses/routes";
import type { ActionPhase } from "../composition/phases";


/**
 * How this subject's one Gate ended, if it has been offered at all.
 *
 *   pending    no Gate has been offered yet
 *   opened     a Gate opened; the Reaction may or may not have been taken
 *   declined   offered and refused
 *   expired    offered and never answered
 *   spent      already used on a response
 *   unusable   the queue reached them with nothing left to spend
 *
 * Every value except `pending` closes the threat for this subject.
 */
export const AWARENESS_GATE_DISPOSITIONS = [
  "pending",
  "opened",
  "declined",
  "expired",
  "spent",
  "unusable",
] as const;

export type AwarenessGateDisposition =
  typeof AWARENESS_GATE_DISPOSITIONS[number];


/**
 * How the subject came to know, kept for the trace and never for arithmetic.
 *
 * `direct` is the threat's own danger, sight or sound. `warning` is somebody
 * telling them. The distinction matters to R15 and R16: a warning establishes
 * awareness and relieves concealment disadvantage for this threat alone, while
 * a direct route may have shown them rather more.
 */
export const AWARENESS_ORIGINS = ["direct", "warning"] as const;

export type AwarenessOrigin = typeof AWARENESS_ORIGINS[number];


/** One route that was compared, whether or not it won. */
export interface AwarenessRouteRecord {
  readonly route: SensoryRoute;
  readonly detected: boolean;
  readonly margin: number;
  readonly receivedIntensity: number;
}


export interface SubjectAwareness {
  readonly subjectId: string;

  readonly detected: boolean;

  /** The ordering key R9 makes primary. Absent until something succeeded. */
  readonly detectedAt?: GameTimestamp;

  readonly origin?: AwarenessOrigin;

  /** The one route acted through. */
  readonly route?: SensoryRoute;

  /** Every route compared, winner included. Provenance, per R6. */
  readonly routes: readonly AwarenessRouteRecord[];

  /** Phases this subject has already had a Detection attempt at. */
  readonly phasesAttempted: readonly ActionPhase[];

  readonly gate: AwarenessGateDisposition;
}


/**
 * Awareness of ONE threat, by subject.
 *
 * Keyed by threat rather than global, so nothing here can grow into the
 * perception matrix the scope forbids.
 */
export interface ThreatAwareness {
  readonly threatKey: string;
  readonly subjects: Readonly<Record<string, SubjectAwareness>>;
}


export function createThreatAwareness(threatKey: string): ThreatAwareness {
  return { threatKey, subjects: {} };
}


const UNAWARE: Omit<SubjectAwareness, "subjectId"> = {
  detected: false,
  routes: [],
  phasesAttempted: [],
  gate: "pending",
};


export function subjectAwareness(
  awareness: ThreatAwareness,
  subjectId: string,
): SubjectAwareness {
  return awareness.subjects[subjectId] ?? { subjectId, ...UNAWARE };
}


/**
 * Whether this subject may have a Detection attempt at this phase.
 *
 * Three independent closures, and each one is a rule R5 states:
 *
 *   already detected      the question is settled and stays settled
 *   gate no longer pending  offered once, however it ended
 *   phase already tried   one attempt per phase, not one per call
 *
 * The third is not in R5 by name and follows from it: without it, a caller
 * that resolved the same phase twice would get two attempts out of a phase
 * that emits one cue.
 */
export function mayAttemptDetection(
  awareness: ThreatAwareness,
  subjectId: string,
  phase: ActionPhase,
): boolean {
  const subject = subjectAwareness(awareness, subjectId);

  return !subject.detected &&
    subject.gate === "pending" &&
    !subject.phasesAttempted.includes(phase);
}


function withSubject(
  awareness: ThreatAwareness,
  subject: SubjectAwareness,
): ThreatAwareness {
  return {
    threatKey: awareness.threatKey,
    subjects: { ...awareness.subjects, [subject.subjectId]: subject },
  };
}


export interface DetectionAttemptRecord {
  readonly subjectId: string;
  readonly phase: ActionPhase;
  readonly origin: AwarenessOrigin;

  readonly detected: boolean;

  /** Required when detected; the moment R9 orders by. */
  readonly at?: GameTimestamp;

  readonly route?: SensoryRoute;

  /** Every route SEN-1 compared, so one result keeps many reasons. */
  readonly routes?: readonly AwarenessRouteRecord[];
}


/**
 * Record one attempt's outcome.
 *
 * Idempotent in the direction that matters: a success never becomes a failure,
 * and a second success does not overwrite the first `detectedAt`. The first
 * moment is the one R9 orders by, and letting a later corroborating route move
 * it would let a subject who noticed early lose the intervention selection to
 * somebody who noticed late.
 */
export function recordDetectionAttempt(
  awareness: ThreatAwareness,
  record: DetectionAttemptRecord,
): ThreatAwareness {
  const subject = subjectAwareness(awareness, record.subjectId);

  const phasesAttempted = subject.phasesAttempted.includes(record.phase)
    ? subject.phasesAttempted
    : [...subject.phasesAttempted, record.phase];

  const routes = [...subject.routes, ...(record.routes ?? [])];

  /* Already known: the new evidence is provenance and changes nothing else. */
  if (subject.detected) {
    return withSubject(awareness, { ...subject, phasesAttempted, routes });
  }

  if (!record.detected) {
    return withSubject(awareness, {
      ...subject,
      detected: false,
      phasesAttempted,
      routes,
    });
  }

  return withSubject(awareness, {
    ...subject,
    detected: true,
    ...(record.at === undefined ? {} : { detectedAt: record.at }),
    origin: record.origin,
    ...(record.route === undefined ? {} : { route: record.route }),
    phasesAttempted,
    routes,
  });
}


/**
 * Record how this subject's one Gate ended.
 *
 * Moving off `pending` is one-way. A caller that recorded a decline and then
 * an opening would be describing a Gate that was refused and then taken, which
 * is two Gates wearing one disposition.
 */
export function recordGateDisposition(
  awareness: ThreatAwareness,
  subjectId: string,
  disposition: Exclude<AwarenessGateDisposition, "pending">,
): ThreatAwareness {
  const subject = subjectAwareness(awareness, subjectId);

  if (subject.gate !== "pending") return awareness;

  return withSubject(awareness, { ...subject, gate: disposition });
}


/**
 * Whether this subject is still entitled to the one Gate this threat owes them.
 *
 * Detection alone is not the answer, and this is where R7's boundary sits: a
 * subject who has detected the threat and has NOT yet been offered anything is
 * entitled. One who has been offered anything at all is not, regardless of how
 * that offer went.
 */
export function mayOpenGate(
  awareness: ThreatAwareness,
  subjectId: string,
): boolean {
  const subject = subjectAwareness(awareness, subjectId);

  return subject.detected && subject.gate === "pending";
}
