/*
 * Established Concealment as retained state, and who has broken it.
 *
 *
 * WHY THIS IS A LIFECYCLE AND NOT A ROLL
 *
 * Hiding used to be a value a caller computed whenever it needed one, which
 * quietly meant a character re-hid every time anybody looked at them. Each
 * glance got a fresh roll, so the assassin who rolled badly once was found, and
 * the one who rolled badly on the fourth glance was found on the fourth glance
 * — concealment became a saving throw made repeatedly until it failed.
 *
 * An established attempt therefore resolves ONCE and is retained. It ends only
 * when something actually ends it:
 *
 *   - an observer detects the subject (for that observer);
 *   - the concealing source voluntarily stops;
 *   - the method materially changes and a new attempt is established;
 *   - an action or effect explicitly reveals it;
 *   - the concealment becomes impossible.
 *
 * Attacking is not on that list. An arrow arriving from somewhere tells you an
 * arrow arrived; a failed Reaction Detection is precisely the finding that you
 * could not tell from where. Breaking concealment because an attack happened
 * would make the Reaction Gate decorative.
 *
 *
 * WHY THE BROKEN STATE IS PER OBSERVER
 *
 * Detection is one observer's answer. Gon spotting the hider tells Killua
 * nothing, and collapsing the two into one boolean is the shortcut that makes
 * an ambush end the instant its least careful target notices — including
 * targets on the other side of a wall.
 *
 * So the retained ratings are shared (there is ONE hiding attempt, rolled once)
 * and the broken set is not. One observer's success removes that observer and
 * nobody else.
 *
 * ROUTE SPECIFICITY SURVIVES THE BREAK, AWARENESS DOES NOT. Which route may
 * produce a successful check, and which modifiers apply to it, stay per route.
 * But once an observer HAS detected the subject, they have detected the
 * subject: they are not required to independently rediscover the same person by
 * sight, then by hearing, then by smell before combat will admit they know
 * where the attacker is.
 */

import type { EngineError } from "../../../../infrastructure/diagnostics";
import {
  engineSuccess,
  type EngineResult,
} from "../../../../infrastructure/result";
import { createTraceNode } from "../../../../infrastructure/trace";
import { sensoryFailure } from "../diagnostics";
import { isPerceptionPhenomenon, isSenseId } from "../scopes";
import { DETECTION_SUBJECTS } from "../scopes";
import type { ConcealmentRating, ConcealmentResolution, ConcealmentRoute } from "./types";
import { shouldRerollEstablishedConcealment } from "./established";


export const CONCEALMENT_END_REASONS = [
  "voluntary",
  "revealed",
  "impossible",
  "replaced",
] as const;

export type ConcealmentEndReason = typeof CONCEALMENT_END_REASONS[number];


export interface EstablishedConcealmentState {
  /** Stable identity for THIS attempt. A new attempt gets a new id. */
  readonly attemptId: string;

  /** Who or what is concealed. */
  readonly subjectId: string;

  /** Who or what is doing the concealing. Often, but not always, the subject. */
  readonly sourceId: string;

  /** The retained ratings. Never rerolled while this attempt lives. */
  readonly ratings: readonly ConcealmentRating[];

  /** Observers who have detected the subject through this attempt. */
  readonly detectedByObserverIds: readonly string[];

  readonly status: "concealed" | "ended";

  readonly endReason?: ConcealmentEndReason;

  /** Caller-supplied ordering value; transitions may not move backwards. */
  readonly establishedAt: number;

  readonly lastChangedAt: number;
}


function identifierError(what: string, path: string): EngineError {
  return {
    code: "character.senses.concealment.state.identity.missing",
    message: `${what} requires a non-empty identifier.`,
    audience: "developer",
    required: "non-empty string",
    actual: path,
  };
}


function isValidRoute(route: ConcealmentRoute): boolean {
  return isSenseId(route.sense) &&
    isPerceptionPhenomenon(route.phenomenon) &&
    (DETECTION_SUBJECTS as readonly string[]).includes(route.subject);
}


function routeKey(route: ConcealmentRoute): string {
  return `${route.sense}/${route.phenomenon}/${route.subject}`;
}


function stateTrace(id: string, label: string, state: EstablishedConcealmentState) {
  return createTraceNode({
    id,
    label,
    inputs: {
      attempt: { value: state.attemptId },
      subject: { value: state.subjectId },
    },
    output: {
      status: state.status,
      detectedBy: [...state.detectedByObserverIds],
    },
  });
}


/**
 * Turn one resolved established Concealment into retained state.
 *
 * The resolution must genuinely be `established`: passive Concealment is a
 * permanent value nobody established, and an active one is a moment rather than
 * a state, so retaining either would be recording a lifecycle that never began.
 */
export function establishConcealmentState(input: {
  readonly attemptId: string;
  readonly subjectId: string;
  readonly sourceId: string;
  readonly resolution: ConcealmentResolution;
  readonly at: number;
}): EngineResult<EstablishedConcealmentState> {
  const fail = (error: EngineError) =>
    sensoryFailure(
      "character.senses.concealment.state.establish",
      "Establish retained Concealment",
      error,
    );

  for (
    const [value, what, path] of [
      [input.attemptId, "An established Concealment attempt", "attemptId"],
      [input.subjectId, "A concealed subject", "subjectId"],
      [input.sourceId, "A concealing source", "sourceId"],
    ] as const
  ) {
    if (typeof value !== "string" || value.trim().length === 0) {
      return fail(identifierError(what, path));
    }
  }

  if (!Number.isFinite(input.at)) {
    return fail({
      code: "character.senses.concealment.state.time.invalid",
      message: "Establishing Concealment requires a finite ordering value.",
      audience: "developer",
      required: "finite number",
      actual: String(input.at),
    });
  }

  if (input.resolution.mode !== "established") {
    return fail({
      code: "character.senses.concealment.state.mode.invalid",
      message: "Only established Concealment is retained across observers.",
      audience: "developer",
      required: "established",
      actual: input.resolution.mode,
    });
  }

  const ratings = input.resolution.ratings;

  if (ratings.length === 0) {
    return fail({
      code: "character.senses.concealment.state.routes.missing",
      message: "A retained Concealment attempt must cover at least one route.",
      audience: "developer",
      required: "one or more ratings",
      actual: "none",
    });
  }

  const seen = new Set<string>();

  for (const rating of ratings) {
    if (!isValidRoute(rating.route)) {
      return fail({
        code: "character.senses.concealment.state.route.invalid",
        message: "A retained Concealment route must name a real sense, phenomenon and subject.",
        audience: "developer",
        required: "SenseId/PerceptionPhenomenon/DetectionSubject",
        actual: routeKey(rating.route),
      });
    }

    if (!Number.isFinite(rating.total)) {
      return fail({
        code: "character.senses.concealment.state.total.invalid",
        message: "A retained Concealment total must be a finite number.",
        audience: "developer",
        required: "finite number",
        actual: String(rating.total),
      });
    }

    const key = routeKey(rating.route);

    if (seen.has(key)) {
      return fail({
        code: "character.senses.concealment.state.route.duplicate",
        message: "One retained Concealment attempt cannot rate the same route twice.",
        audience: "developer",
        required: "distinct routes",
        actual: key,
      });
    }

    seen.add(key);
  }

  const state: EstablishedConcealmentState = {
    attemptId: input.attemptId,
    subjectId: input.subjectId,
    sourceId: input.sourceId,
    ratings: [...ratings],
    detectedByObserverIds: [],
    status: "concealed",
    establishedAt: input.at,
    lastChangedAt: input.at,
  };

  return engineSuccess(state, {
    root: stateTrace(
      "character.senses.concealment.state.establish",
      "Establish retained Concealment",
      state,
    ),
  });
}


/** Whether this attempt still hides the subject from one particular observer. */
export function isConcealedFrom(
  state: EstablishedConcealmentState,
  observerId: string,
): boolean {
  if (state.status === "ended") return false;

  return !state.detectedByObserverIds.includes(observerId);
}


/** The retained rating for one route, if this attempt covers it. */
export function concealmentRatingForRoute(
  state: EstablishedConcealmentState,
  route: ConcealmentRoute,
): ConcealmentRating | undefined {
  const key = routeKey(route);

  return state.ratings.find((rating) => routeKey(rating.route) === key);
}


function guardTransition(
  state: EstablishedConcealmentState,
  input: { readonly attemptId: string; readonly at: number },
  traceId: string,
  label: string,
): EngineResult<never> | undefined {
  if (input.attemptId !== state.attemptId) {
    return sensoryFailure(traceId, label, {
      code: "character.senses.concealment.state.attempt.mismatch",
      message: "This transition names a different Concealment attempt.",
      audience: "developer",
      required: state.attemptId,
      actual: String(input.attemptId),
    });
  }

  if (!Number.isFinite(input.at)) {
    return sensoryFailure(traceId, label, {
      code: "character.senses.concealment.state.time.invalid",
      message: "A Concealment transition requires a finite ordering value.",
      audience: "developer",
      required: "finite number",
      actual: String(input.at),
    });
  }

  /*
   * Time may not run backwards over a retained attempt. A transition stamped
   * before the last one is a caller replaying stale state, and letting it
   * through would let a detection be undone by re-submitting an older reveal.
   */
  if (input.at < state.lastChangedAt) {
    return sensoryFailure(traceId, label, {
      code: "character.senses.concealment.state.time.contradiction",
      message: "A Concealment transition cannot predate the attempt's last change.",
      audience: "developer",
      required: `>= ${String(state.lastChangedAt)}`,
      actual: String(input.at),
    });
  }

  if (state.status === "ended") {
    return sensoryFailure(traceId, label, {
      code: "character.senses.concealment.state.ended",
      message: "This Concealment attempt has already ended.",
      audience: "developer",
      required: "concealed",
      actual: state.endReason ?? "ended",
    });
  }

  return undefined;
}


/**
 * Record that one observer has detected the subject.
 *
 * Exactly once per observer: a second success for the same observer is refused
 * rather than appended, so the broken set cannot grow duplicates that a caller
 * counting it would read as several separate discoveries.
 */
export function recordConcealmentDetection(
  state: EstablishedConcealmentState,
  input: {
    readonly attemptId: string;
    readonly observerId: string;
    readonly at: number;
  },
): EngineResult<EstablishedConcealmentState> {
  const traceId = "character.senses.concealment.state.detected";
  const label = "Record Concealment broken for one observer";

  const guard = guardTransition(state, input, traceId, label);

  if (guard !== undefined) return guard;

  if (typeof input.observerId !== "string" || input.observerId.trim().length === 0) {
    return sensoryFailure(traceId, label, identifierError("An observer", "observerId"));
  }

  if (state.detectedByObserverIds.includes(input.observerId)) {
    return sensoryFailure(traceId, label, {
      code: "character.senses.concealment.state.observer.duplicate",
      message: "This observer has already detected the subject through this attempt.",
      audience: "developer",
      required: "an observer who has not detected the subject",
      actual: input.observerId,
    });
  }

  const next: EstablishedConcealmentState = {
    ...state,
    detectedByObserverIds: [...state.detectedByObserverIds, input.observerId],
    lastChangedAt: input.at,
  };

  return engineSuccess(next, { root: stateTrace(traceId, label, next) });
}


/**
 * End the attempt outright, for everybody.
 *
 * The four reasons that actually do so, and no fifth: an attack is not here,
 * and a failed Reaction Detection is not here.
 */
export function endConcealmentAttempt(
  state: EstablishedConcealmentState,
  input: {
    readonly attemptId: string;
    readonly reason: ConcealmentEndReason;
    readonly at: number;
  },
): EngineResult<EstablishedConcealmentState> {
  const traceId = "character.senses.concealment.state.end";
  const label = "End retained Concealment";

  const guard = guardTransition(state, input, traceId, label);

  if (guard !== undefined) return guard;

  if (!(CONCEALMENT_END_REASONS as readonly string[]).includes(input.reason)) {
    return sensoryFailure(traceId, label, {
      code: "character.senses.concealment.state.reason.invalid",
      message: "A Concealment attempt ends for one of its declared reasons.",
      audience: "developer",
      required: CONCEALMENT_END_REASONS.join(" | "),
      actual: String(input.reason),
    });
  }

  const next: EstablishedConcealmentState = {
    ...state,
    status: "ended",
    endReason: input.reason,
    lastChangedAt: input.at,
  };

  return engineSuccess(next, { root: stateTrace(traceId, label, next) });
}


/**
 * Replace an attempt with a newly established one.
 *
 * Gated on the caller DECLARING a material change, through the same predicate
 * that has always answered that question. Without the gate this is a reroll
 * with extra steps, and a player who dislikes their hiding roll would simply
 * shuffle a foot and ask for another.
 *
 * The previous attempt ends as "replaced" and the new one starts clean: a
 * different hiding place is not the old one with its detections carried over.
 */
export function replaceConcealmentAttempt(
  previous: EstablishedConcealmentState,
  input: {
    readonly attemptId: string;
    readonly subjectId: string;
    readonly sourceId: string;
    readonly resolution: ConcealmentResolution;
    readonly at: number;
    readonly change: Parameters<typeof shouldRerollEstablishedConcealment>[0];
  },
): EngineResult<{
  readonly previous: EstablishedConcealmentState;
  readonly current: EstablishedConcealmentState;
}> {
  const traceId = "character.senses.concealment.state.replace";
  const label = "Replace retained Concealment";

  if (!shouldRerollEstablishedConcealment(input.change)) {
    return sensoryFailure(traceId, label, {
      code: "character.senses.concealment.state.change.immaterial",
      message:
        "Retained Concealment is replaced only when the caller declares a material change.",
      audience: "developer",
      required: "newAttempt | deliberateReconstruction | methodMateriallyChanged",
      actual: JSON.stringify(input.change),
    });
  }

  if (input.attemptId === previous.attemptId) {
    return sensoryFailure(traceId, label, {
      code: "character.senses.concealment.state.attempt.duplicate",
      message: "A replacing Concealment attempt needs its own identifier.",
      audience: "developer",
      required: "an attempt id other than the previous one",
      actual: input.attemptId,
    });
  }

  const established = establishConcealmentState({
    attemptId: input.attemptId,
    subjectId: input.subjectId,
    sourceId: input.sourceId,
    resolution: input.resolution,
    at: input.at,
  });

  if (!established.success) return established;

  /*
   * The old attempt is ended only once the new one is known to be valid, so a
   * malformed replacement leaves the character hidden rather than exposed.
   *
   * An attempt that had already ended stays as it is: re-ending it would be the
   * one transition guardTransition() refuses, and "replaced" is not a truer
   * account of it than the reason it actually ended for.
   */
  let previousState = previous;

  if (previous.status !== "ended") {
    const ended = endConcealmentAttempt(previous, {
      attemptId: previous.attemptId,
      reason: "replaced",
      at: input.at,
    });

    if (!ended.success) return ended;

    previousState = ended.payload;
  }

  return engineSuccess({
    previous: previousState,
    current: established.payload,
  }, {
    root: stateTrace(traceId, label, established.payload),
  });
}
