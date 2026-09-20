/*
 * The bridge: prepared danger, through the real senses, to a real route.
 *
 *
 * THE SHORTCUT THIS FILE EXISTS TO NOT TAKE
 *
 * Composition computes a danger intensity. It is right there on the cue, it is
 * already scaled 1-10, and comparing it against something would be one line.
 * That one line is M3, and it is wrong in every way that matters: it grants a
 * Reaction to a character with no Sense that receives `danger`, through a wall
 * that stops it, at any distance, while blindfolded, and it does so without
 * ever consulting the Concealment standing against the observer.
 *
 * So there is no intensity comparison here. The cue is propagated, handed to
 * SEN-1's own access resolution, and whatever routes come back are what the
 * observer actually has. An observer with no route gets no Gate, and the
 * reason they got none is reported rather than collapsed into a boolean.
 *
 * The three lines that would each be a shortcut, and are each absent:
 * reading `danger` off the emissions to decide anything, treating declared
 * targets as awareness, and treating a host's candidate list as awareness.
 * Membership of a candidate list means the host found somebody in the area;
 * it says nothing about whether they noticed.
 *
 *
 * WHY DISCLOSURE IS A SEPARATE SHAPE
 *
 * R3 limits what a danger cue tells you: something is coming, roughly how
 * urgent, roughly when, roughly from where. Not who, not with what, not how
 * much damage. The tempting implementation is to hand the caller the
 * projection and trust it not to read the rest, and that trust fails the first
 * time a UI renders an object it was given.
 *
 * `DangerDisclosure` therefore carries the four permitted facts and has no
 * field for the others — the same reason threat.ts has two describe functions
 * instead of one with an audience flag. A GM who is entitled to more already
 * has `describeThreatForGm` and the projection itself.
 */

import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import {
  engineSuccess,
  type EngineResult,
} from "../../infrastructure/result";
import { sensoryFailure } from "../../character/foundation/senses/diagnostics";
import type { ConcealmentRating } from "../../character/foundation/senses/concealment";
import type { DetectionRouteCandidate } from "../../character/foundation/senses/detection";
import {
  sameSensoryRouteTerms,
  type GeneratedSensoryRoute,
} from "../../character/foundation/senses/routes";
import type { SensoryExposureFacts } from "../../character/foundation/senses/routes";
import type { ResolvedSensoryProfile } from "../../character/foundation/senses/types";
import type { SensoryAccessFailureReason } from "../../character/foundation/senses/access";
import {
  isMetricPosition,
  type Distance,
  type SpatialPosition,
} from "../../spatial";
import type { ActionEnvironmentSnapshot } from "../composition/environment";
import {
  propagateCue,
  receiveCue,
  type ChannelPropagationProfile,
  type PropagatedCue,
} from "../composition/propagation";
import type { ComposedSensoryCue } from "../composition/sensory";
import type { ThreatUrgency } from "../composition/threat";


const TRACE_ID = "gameplay.awareness.reception";


/**
 * Roughly where it is coming from.
 *
 * Eight points and no distance, because R3 permits a coarse direction and
 * nothing finer. A bearing in degrees would be an exact trajectory wearing a
 * compass, and the difference between "from your left" and "from 274 degrees"
 * is the difference between a danger sense and a targeting computer.
 */
export const COARSE_DIRECTIONS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
] as const;

export type CoarseDirection = typeof COARSE_DIRECTIONS[number];


/**
 * The compass point from one position towards another.
 *
 * Undefined when either end is a host-opaque position, which is the honest
 * answer: an opaque position has no coordinates to subtract, and inventing a
 * direction from one would be this module guessing at the host's geometry.
 * Undefined is also the answer when the two coincide, because a direction from
 * a point to itself is not a direction.
 */
export function coarseDirection(
  from: SpatialPosition | undefined,
  to: SpatialPosition | undefined,
): CoarseDirection | undefined {
  if (from === undefined || to === undefined) return undefined;
  if (!isMetricPosition(from) || !isMetricPosition(to)) return undefined;
  if (from.contextId !== to.contextId) return undefined;

  const dx = to.xMetres - from.xMetres;
  const dy = to.yMetres - from.yMetres;

  if (dx === 0 && dy === 0) return undefined;

  /*
   * Rotated so that +y is north and the eight sectors are 45 degrees wide,
   * then rounded to the nearest sector. The modulo is there because the
   * rounding can land on 8, which is north again.
   */
  const radians = Math.atan2(dx, dy);
  const sector = Math.round((radians / (Math.PI / 4)) + 8) % 8;

  return COARSE_DIRECTIONS[sector]!;
}


/**
 * Everything a detected danger cue is allowed to tell the character.
 *
 * Note what has no field here: the attacker, the Skill, the Item, the
 * trajectory, the damage, the severity and the danger intensity itself.
 */
export interface DangerDisclosure {
  /** Always true. A disclosure exists only because something was detected. */
  readonly threatened: true;

  readonly urgency: ThreatUrgency;

  /** When it lands. The character feels how long they have, not the schedule. */
  readonly impactAt: number;

  /** Roughly where from, when the geometry supports saying. */
  readonly direction?: CoarseDirection;

  /** The same wording `describeThreatForPlayer` produces, for one voice. */
  readonly wording: string;
}


/** Why a subject could not receive the danger at all. */
export type ThreatReceptionFailure =
  | SensoryAccessFailureReason
  /* Propagation left nothing: too far, or the conditions swallowed it. */
  | "attenuated"
  /* Routes generated, but no Concealment rating covers any of them. */
  | "unrated";


export type ThreatReception =
  | {
      readonly received: true;

      /** What SEN-1 will actually compare. One per route, ratings attached. */
      readonly candidates: readonly DetectionRouteCandidate[];

      readonly propagated: PropagatedCue;
      readonly trace: TraceNode;
    }
  | {
      readonly received: false;
      readonly reason: ThreatReceptionFailure;
      readonly propagated: PropagatedCue;
      readonly trace: TraceNode;
    };


export interface ThreatReceptionInput {
  /**
   * What this reception is about, for the trace alone.
   *
   * A key rather than the whole identity, because warnings come through this
   * same pipeline and a warning is not a threat. Taking the narrower value
   * keeps one implementation of propagate-receive-rate instead of two that
   * could drift.
   */
  readonly reference: string;

  readonly subjectId: string;

  /** The step's composed cue, as composition produced it. Never rewritten. */
  readonly composed: ComposedSensoryCue;

  readonly observerProfile: ResolvedSensoryProfile;

  /** The host's measurement between the cue's origin and the observer. */
  readonly distance: Distance;

  readonly environment: ActionEnvironmentSnapshot;

  readonly profiles: readonly ChannelPropagationProfile[];

  readonly exposure?: SensoryExposureFacts;

  /**
   * The Concealment standing against this observer, per route.
   *
   * Supplied rather than resolved here, because Concealment is SEN-1's and
   * belongs to whoever owns the source's hiding attempt. A route with no
   * matching rating is dropped, and a reception with no rated route at all
   * fails as `unrated` rather than being rolled against nothing.
   */
  readonly concealment: readonly ConcealmentRating[];
}


/**
 * Pair every generated route with the Concealment standing against it.
 *
 * Matched on route TERMS rather than on the complete route, because a
 * Concealment attempt hides a subject from sight — it does not hide them from
 * one particular eye. A rating that named a receiver would have to be restated
 * for every receiver an observer happens to have.
 */
function rate(
  routes: readonly GeneratedSensoryRoute[],
  ratings: readonly ConcealmentRating[],
): readonly DetectionRouteCandidate[] {
  const candidates: DetectionRouteCandidate[] = [];

  for (const route of routes) {
    const rating = ratings.find((entry) =>
      sameSensoryRouteTerms(entry.route, route.route)
    );

    if (rating === undefined) continue;

    candidates.push({ route, concealment: rating });
  }

  return candidates;
}


/**
 * Put one subject's prepared danger through propagation and SEN-1.
 *
 * Returns routes, never a verdict. Whether the subject NOTICES is Detection's
 * answer and is resolved through the Reaction Gate or the passive sweep — this
 * function's entire job is to make sure that answer is reached honestly.
 */
export function receiveComposedCue(
  input: ThreatReceptionInput,
): ThreatReception {
  const propagated = propagateCue({
    composed: input.composed,
    distance: input.distance,
    environment: input.environment,
    profiles: input.profiles,
  });

  const traceOf = (output: string | number, children: readonly TraceNode[] = []) =>
    createTraceNode({
      id: TRACE_ID,
      label: "Receive a composed cue",
      formula: "propagate, then hand the arrival to SEN-1; never compare the intensity",
      inputs: {
        reference: { value: input.reference },
        subject: { value: input.subjectId },
        cue: { value: input.composed.cue.id },
      },
      output,
      children: [propagated.trace, ...children],
    });

  if (Object.keys(propagated.received.emissions).length === 0) {
    return {
      received: false,
      reason: "attenuated",
      propagated,
      trace: traceOf("attenuated"),
    };
  }

  const access = receiveCue({
    propagated,
    profile: input.observerProfile,
    ...(input.exposure === undefined ? {} : { exposure: input.exposure }),
  });

  if (!access.accessible) {
    return {
      received: false,
      reason: access.reason,
      propagated,
      trace: traceOf(access.reason),
    };
  }

  const candidates = rate(access.routes, input.concealment);

  if (candidates.length === 0) {
    return {
      received: false,
      reason: "unrated",
      propagated,
      trace: traceOf("unrated"),
    };
  }

  return {
    received: true,
    candidates,
    propagated,
    trace: traceOf(candidates.length),
  };
}


export interface DangerDisclosureInput {
  readonly urgency: ThreatUrgency;
  readonly impactAt: number;
  readonly wording: string;
  readonly observerPosition?: SpatialPosition;
  readonly cueOrigin?: SpatialPosition;
}


/** Build the four permitted facts, and only those. */
export function describeDangerDisclosure(
  input: DangerDisclosureInput,
): DangerDisclosure {
  const direction = coarseDirection(input.observerPosition, input.cueOrigin);

  return {
    threatened: true,
    urgency: input.urgency,
    impactAt: input.impactAt,
    ...(direction === undefined ? {} : { direction }),
    wording: input.wording,
  };
}


/**
 * Refuse a reception that produced no route, with the reason intact.
 *
 * A convenience for callers that need an `EngineResult` rather than a union,
 * kept here so the diagnostic code is spelled once.
 */
export function requireReception(
  reception: ThreatReception,
): EngineResult<readonly DetectionRouteCandidate[]> {
  if (reception.received) {
    return engineSuccess(reception.candidates, { root: reception.trace });
  }

  return sensoryFailure(TRACE_ID, "Receive a composed cue", {
    code: `gameplay.awareness.reception.${reception.reason}`,
    message: "This cue did not reach the subject through any usable sensory route.",
    audience: "developer",
    required: "one rated sensory route",
    actual: reception.reason,
  });
}
