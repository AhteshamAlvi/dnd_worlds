/*
 * Things that are simply GOING ON, and how the engine holds them.
 *
 *
 * THE PROBLEM A CAMPFIRE POSES
 *
 * A fire burns for four hours. During those four hours it is continuously
 * visible, audible, warm and smoky to anyone near it — and there are two
 * obvious ways to model that, both of which are wrong.
 *
 * The first is to emit an event per tick. A fire that produces a cue every six
 * seconds produces 2,400 of them per evening, per fire, and every one is
 * delivered to every observer whether or not anybody was looking. That is not
 * a performance concern so much as a correctness one: the log becomes
 * unreadable, and "the fire is still burning" starts to look like 2,400 things
 * happening rather than one thing continuing.
 *
 * The second is to scan. Every tick, for every source, for every observer,
 * work out who can perceive what. That is the all-pairs matrix this
 * architecture explicitly refuses, and it does the work whether or not anyone
 * asked.
 *
 * So a persistent source does neither. It is a STORED FACT with an active
 * interval, and it produces nothing at all until somebody asks it a question
 * at a particular time. Time passing does not touch it. Nobody is scanned.
 * "Is the fire still burning at 21:40" is answered by comparing two numbers,
 * and only the query produces a cue.
 *
 *
 * WHY THE INTERVAL IS THE STATE
 *
 * Because it makes the awkward question — what happens if you ask about a
 * span rather than an instant — answer itself. A source has no accumulator, no
 * per-tick counter and nothing that advances, so asking about [0, 4h] and
 * asking about eight half-hour slices produce the same answer eight times
 * rather than a total. A fire is not twice as bright because you looked twice.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import type { GameTimestamp } from "../../time/types";
import {
  findGameTimeIntervalIssues,
  intervalOwns,
  type GameTimeInterval,
} from "../../time/interval";
import {
  areaContextId,
  findAreaIssues,
  findPositionIssues,
  isValidSpatialContextId,
  type SpatialArea,
  type SpatialContextId,
  type SpatialPosition,
} from "../../spatial";
import { digestOf } from "../composition/digest";


/**
 * One continuing phenomenon.
 *
 * `origin` and `area` are alternatives rather than a pair: the existing
 * spatial vocabulary already anchors every area to a position of its own, so
 * carrying both would mean two places recording where the fire is, free to
 * disagree. A point source names its origin; an extended one names its area
 * and the area names its anchor.
 */
export interface PersistentPhenomenonSource {
  readonly id: string;
  readonly contextId: SpatialContextId;

  readonly origin?: SpatialPosition;
  readonly area?: SpatialArea;

  readonly activeInterval: GameTimeInterval;

  readonly profileId: string;

  /** Derived from the fields above; see `phenomenonRevision`. */
  readonly stateRevision: string;
}


/**
 * The revision a source's current definition hashes to.
 *
 * Derived rather than supplied, so it cannot be forgotten. A caller that
 * extinguished a fire and left the revision alone would have a source that
 * changed without anything downstream being able to notice, which is the exact
 * staleness hole `composition/snapshot.ts` exists to close.
 */
export function phenomenonRevision(
  source: Omit<PersistentPhenomenonSource, "stateRevision">,
): string {
  return digestOf({
    id: source.id,
    contextId: source.contextId,
    origin: source.origin,
    area: source.area,
    activeInterval: source.activeInterval,
    profileId: source.profileId,
  });
}


export function findPersistentPhenomenonSourceIssues(
  source: PersistentPhenomenonSource,
  path = "source",
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (typeof source?.id !== "string" || source.id.trim().length === 0) {
    errors.push({
      code: "phenomena.source.id.missing",
      message: "A persistent source must have an identity.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.id` },
      required: "non-empty source id",
      actual: describeDiagnosticValue(source?.id),
    });
  }

  if (
    typeof source?.profileId !== "string" ||
    source.profileId.trim().length === 0
  ) {
    errors.push({
      code: "phenomena.source.profile.missing",
      message: "A persistent source must name the profile that says what it emits.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.profileId` },
      required: "non-empty profile id",
      actual: describeDiagnosticValue(source?.profileId),
    });
  }

  if (!isValidSpatialContextId(source?.contextId)) {
    errors.push({
      code: "phenomena.source.context.invalid",
      message: "A persistent source must name the space it exists in.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.contextId` },
      required: "a valid spatial context id",
      actual: describeDiagnosticValue(source?.contextId),
    });
  }

  const hasOrigin = source?.origin !== undefined;
  const hasArea = source?.area !== undefined;

  if (hasOrigin === hasArea) {
    errors.push({
      code: "phenomena.source.place.ambiguous",
      message:
        "A persistent source must be placed by exactly one of an origin or an area.",
      audience: "developer",
      subject: { kind: "field", id: path },
      required: "exactly one of origin or area",
      actual: hasOrigin ? "both" : "neither",
    });
  }

  if (hasOrigin) errors.push(...findPositionIssues(source.origin));

  if (hasArea && source.area !== undefined) {
    errors.push(...findAreaIssues(source.area));
  }

  /*
   * The place and the source must agree about which space they are in. A fire
   * whose origin sits in a different context from its own declaration is a
   * fire in two places, and every distance measured from it would be
   * measured against whichever field the caller happened to read.
   */
  const placeContext = hasOrigin
    ? source.origin?.contextId
    : source.area !== undefined
    ? areaContextId(source.area)
    : undefined;

  if (
    placeContext !== undefined &&
    isValidSpatialContextId(source?.contextId) &&
    placeContext !== source.contextId
  ) {
    errors.push({
      code: "phenomena.source.context.mismatch",
      message: "A persistent source is placed in a different space from the one it declares.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.contextId` },
      required: source.contextId,
      actual: placeContext,
    });
  }

  errors.push(...findGameTimeIntervalIssues(source?.activeInterval));

  if (
    typeof source?.stateRevision !== "string" ||
    source.stateRevision.trim().length === 0
  ) {
    errors.push({
      code: "phenomena.source.revision.missing",
      message: "A persistent source must carry the revision of its current state.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.stateRevision` },
      required: "non-empty revision",
      actual: describeDiagnosticValue(source?.stateRevision),
    });
  }

  return errors;
}


/**
 * Whether the phenomenon is going on at this instant.
 *
 * Half-open, `[startedAt, endedAt)`, reusing the interval domain's own
 * `intervalOwns` rather than comparing here. That is what makes subdivision
 * exact: splitting a burn into consecutive spans gives every instant to
 * exactly one of them, so no instant is counted twice and none is lost at a
 * boundary.
 */
export function isPhenomenonActive(
  source: PersistentPhenomenonSource,
  at: GameTimestamp,
): boolean {
  return intervalOwns(source.activeInterval, at);
}


/** Whether a queried span overlaps the burn at all. */
export function isPhenomenonActiveDuring(
  source: PersistentPhenomenonSource,
  interval: GameTimeInterval,
): boolean {
  const active = source.activeInterval;

  /*
   * Overlap of two half-open spans. A query that ends exactly when the fire
   * starts saw no fire, which is the same boundary rule `intervalOwns` uses —
   * and using a different one here would make the instant query and the span
   * query disagree about the first moment.
   */
  return interval.startedAt < active.endedAt &&
    active.startedAt < interval.endedAt;
}


export interface StartPhenomenonInput {
  readonly id: string;
  readonly profileId: string;
  readonly activeInterval: GameTimeInterval;
  readonly origin?: SpatialPosition;
  readonly area?: SpatialArea;
  readonly contextId: SpatialContextId;
}


/** Light the fire. Produces a source; emits nothing and schedules nothing. */
export function startPhenomenon(
  input: StartPhenomenonInput,
): PersistentPhenomenonSource {
  const base = {
    id: input.id,
    contextId: input.contextId,
    ...(input.origin === undefined ? {} : { origin: input.origin }),
    ...(input.area === undefined ? {} : { area: input.area }),
    activeInterval: input.activeInterval,
    profileId: input.profileId,
  };

  return { ...base, stateRevision: phenomenonRevision(base) };
}


/**
 * Put it out, at a stated time.
 *
 * Truncation rather than deletion, because "burned from 18:00 to 19:30" stays
 * true afterwards and a query about 18:30 asked later must still answer yes. A
 * source that was removed would answer no, silently rewriting what happened.
 *
 * Stopping before it started collapses the interval to nothing rather than
 * producing a negative one: a fire doused at the moment of lighting burned for
 * zero time, which the interval domain accepts and a negative span does not.
 */
export function stopPhenomenon(
  source: PersistentPhenomenonSource,
  at: GameTimestamp,
): PersistentPhenomenonSource {
  const endedAt = Math.max(source.activeInterval.startedAt, at);

  if (endedAt >= source.activeInterval.endedAt) return source;

  const base = {
    id: source.id,
    contextId: source.contextId,
    ...(source.origin === undefined ? {} : { origin: source.origin }),
    ...(source.area === undefined ? {} : { area: source.area }),
    activeInterval: {
      startedAt: source.activeInterval.startedAt,
      endedAt,
      elapsed: endedAt - source.activeInterval.startedAt,
    },
    profileId: source.profileId,
  };

  return { ...base, stateRevision: phenomenonRevision(base) };
}
