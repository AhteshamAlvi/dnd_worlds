/*
 * Asking a continuing phenomenon what it is doing, at a stated moment.
 *
 * This is the ONLY way a persistent source produces anything. There is no
 * scheduler here, no tick handler, no subscription and no list of observers —
 * a query comes in with an authoritative time, and a cue either comes back or
 * does not. Time advancing on its own produces nothing, which is what "no
 * event spam" means concretely: the mechanism by which a fire could spam does
 * not exist rather than being switched off.
 *
 *
 * WHY QUERYING CANNOT CHANGE ANYTHING
 *
 * Every function here takes the source and returns a result. None of them
 * returns a new source, and none of them mutates the one they were handed.
 * That is what makes subdividing a span harmless: the eighth query sees
 * exactly what the first saw, because the first left nothing behind for it to
 * see. A source with a burn-down counter would answer differently depending on
 * how often it had been looked at, and "how often did anyone glance at the
 * fire" is not a fact about the fire.
 */

import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import type { GameTimestamp } from "../../time/types";
import type { GameTimeInterval } from "../../time/interval";
import {
  areaContextId,
  type SpatialPosition,
} from "../../spatial";
import type { ResolvedSensoryCue, SensoryEmissions } from "../../character/foundation/senses/cues";
import type { SensoryChannelId, SensoryIntensity } from "../../character/foundation/senses/channels";
import type {
  CandidateQuerySpec,
  CandidateRelationshipRequirement,
} from "../composition/candidates";
import {
  isPhenomenonActive,
  isPhenomenonActiveDuring,
  type PersistentPhenomenonSource,
} from "./sources";
import {
  phenomenonSourceRef,
  type PhenomenonProfileDefinition,
} from "./profiles";


export type PhenomenonQueryResult =
  | {
      readonly kind: "active";
      readonly cue: ResolvedSensoryCue;
      readonly origin?: SpatialPosition;
      readonly trace: TraceNode;
    }
  | { readonly kind: "inactive"; readonly trace: TraceNode };


function originOf(
  source: PersistentPhenomenonSource,
): SpatialPosition | undefined {
  if (source.origin !== undefined) return source.origin;

  const area = source.area;

  if (area === undefined) return undefined;

  return area.kind === "cone" || area.kind === "line" ? area.origin : area.centre;
}


function cueFor(
  source: PersistentPhenomenonSource,
  profile: PhenomenonProfileDefinition,
): ResolvedSensoryCue {
  const emissions = new Map<SensoryChannelId, SensoryIntensity>();

  /*
   * Built in sorted channel order so one source always produces one cue, byte
   * for byte, however the profile happened to be written.
   */
  for (const emission of [...profile.emissions].sort((a, b) =>
    a.channel < b.channel ? -1 : a.channel > b.channel ? 1 : 0
  )) {
    emissions.set(emission.channel, emission.intensity);
  }

  const first = profile.emissions[0];

  return {
    /*
     * Derived from identity alone, and deliberately NOT from the query time.
     * A cue id that moved with the clock would make the same fire a different
     * thing every time it was looked at, and anything deduplicating cues would
     * see an endless stream of new ones — the event spam this design refuses,
     * reintroduced through the id.
     */
    id: `phenomenon:${source.id}`,
    source: phenomenonSourceRef(profile.id, source.id),
    phenomenon: first?.phenomenon ?? "physical",
    subject: first?.subject ?? "environment",
    emissions: Object.fromEntries([...emissions.entries()]) as SensoryEmissions,
  };
}


/** What the phenomenon is emitting at one instant. */
export function queryPhenomenonAt(
  source: PersistentPhenomenonSource,
  profile: PhenomenonProfileDefinition,
  at: GameTimestamp,
): PhenomenonQueryResult {
  const active = isPhenomenonActive(source, at);

  const trace = createTraceNode({
    id: "phenomena.query",
    label: "Query persistent source",
    inputs: {
      source: { value: source.id },
      profile: { value: profile.id },
      at: { value: at },
      startedAt: { value: source.activeInterval.startedAt },
      endedAt: { value: source.activeInterval.endedAt },
    },
    output: active,
  });

  if (!active) return { kind: "inactive", trace };

  const origin = originOf(source);

  return {
    kind: "active",
    cue: cueFor(source, profile),
    ...(origin === undefined ? {} : { origin }),
    trace,
  };
}


/**
 * What it was emitting across a span.
 *
 * The same answer as an instant query, and that is the entire point. A span is
 * not an accumulation: a fire that burned for an hour was exactly as bright
 * the whole time, so asking about the hour and asking about any minute of it
 * return the same intensities. Anything else would make "how finely did you
 * slice the evening" a mechanical input.
 */
export function queryPhenomenonOver(
  source: PersistentPhenomenonSource,
  profile: PhenomenonProfileDefinition,
  interval: GameTimeInterval,
): PhenomenonQueryResult {
  const active = isPhenomenonActiveDuring(source, interval);

  const trace = createTraceNode({
    id: "phenomena.query",
    label: "Query persistent source over a span",
    inputs: {
      source: { value: source.id },
      profile: { value: profile.id },
      startedAt: { value: interval.startedAt },
      endedAt: { value: interval.endedAt },
    },
    output: active,
  });

  if (!active) return { kind: "inactive", trace };

  const origin = originOf(source);

  return {
    kind: "active",
    cue: cueFor(source, profile),
    ...(origin === undefined ? {} : { origin }),
    trace,
  };
}


export interface PhenomenonCandidateQueryInput {
  readonly source: PersistentPhenomenonSource;

  /** The host's version of the space, echoed back on the answer. */
  readonly contextRevision: string;

  /**
   * How far to look. Supplied by the caller rather than derived from the
   * profile, because "how far could this possibly matter" is a question about
   * the scene's scale and the question being asked, not about the fire.
   */
  readonly maximumDistanceM?: number;

  readonly requiredRelationships?: readonly CandidateRelationshipRequirement[];
}


/**
 * The question to put to the host about who is near enough to bother asking.
 *
 * Objective only. It asks for proximity and line of effect and stops there;
 * whether any of the returned candidates actually notices the fire is decided
 * afterwards, on this side of the boundary, by propagation and SEN-1.
 */
export function phenomenonCandidateQuery(
  input: PhenomenonCandidateQueryInput,
): CandidateQuerySpec | undefined {
  const { source } = input;

  const origin = originOf(source);

  /*
   * No origin means nothing to measure from, and a query with an invented one
   * would return candidates near a place the host never said the fire was.
   */
  if (origin === undefined) return undefined;

  const contextId = source.area === undefined
    ? source.contextId
    : areaContextId(source.area);

  return {
    /*
     * Derived from the source and the revision it is being asked about, so the
     * same question asked twice carries the same id and an answer computed
     * against a changed scene can never be mistaken for a current one.
     */
    queryId: `phenomenon:${source.id}@${input.contextRevision}`,
    contextId,
    origin,
    ...(input.maximumDistanceM === undefined
      ? {}
      : { maximumDistanceM: input.maximumDistanceM }),
    ...(source.area === undefined ? {} : { area: source.area }),
    requiredRelationships: input.requiredRelationships ?? [],
    contextRevision: input.contextRevision,
  };
}
