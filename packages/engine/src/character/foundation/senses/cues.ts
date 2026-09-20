/*
 * Resolved sensory cues — the one thing that crosses into this domain.
 *
 * A cue says: something happened, it put THIS much energy into THESE channels,
 * and here is what kind of thing it was. It does not say which Sense notices
 * it, which organ receives it, or how hard it is to spot. Those are answers,
 * and answers are what this domain produces.
 *
 *
 * THE BOUNDARY THIS FILE DEFENDS
 *
 * Emissions arrive RESOLVED. Nothing here inspects a Skill, an Item, an
 * attack, a projectile, a material, a damage roll or an action definition in
 * order to work out how loud a sword is. That derivation is a genuinely large
 * piece of game-model composition — it has to know about materials, velocities,
 * distances and environments — and half of it living in the sensory domain
 * would be worse than none of it, because a partial composer is a set of rules
 * nobody can find and nobody can override.
 *
 * So the caller supplies the numbers, and an explicit host or GM override is a
 * first-class way to do that rather than an escape hatch. When the producer
 * pipeline is built it will sit ABOVE this boundary and hand cues down through
 * exactly this shape.
 *
 * architecture.test.ts fails if anything under foundation/senses starts
 * importing the content domains that would let it guess.
 *
 *
 * ZERO IS NOT AN INTENSITY
 *
 * A channel a cue is not emitting on is ABSENT from the map. Zero was
 * available and is refused, because "emitting at strength zero" and "not
 * emitting" are the same physical situation with two spellings, and the two
 * spellings would take different paths through route generation — one
 * producing a route worth -5 and the other producing none.
 */

import {
  isSensoryChannelId,
  isSensoryIntensity,
  type SensoryChannelId,
  type SensoryIntensity,
} from "./channels";
import type { ContributionSourceRef } from "../../../infrastructure/contribution-source";
import type { InformationBand } from "./information";
import {
  isDetectionSubject,
  isPerceptionPhenomenon,
  type DetectionSubject,
  type PerceptionPhenomenon,
} from "./scopes";


/** One intensity per channel, with absent meaning "not emitting". */
export type SensoryEmissions = Readonly<
  Partial<Record<SensoryChannelId, SensoryIntensity>>
>;


/*
 * How hard a cue is to make sense of ONCE IT HAS ARRIVED.
 *
 * This is Perception's question and not Detection's, and the split matters:
 * Detection asks whether you found a hidden thing, Perception asks how much
 * you understood of a thing that was never hidden. A concealed subject is
 * resolved through Detection alone and never consults this — rolling an
 * uncertain reception and THEN a Detection would charge one cue two checks.
 */
export type SensoryReception =
  | { readonly kind: "automatic"; readonly band?: Exclude<InformationBand, "none"> }
  | { readonly kind: "uncertain"; readonly difficulty: number }
  | { readonly kind: "impossible"; readonly reason?: string };


export interface ResolvedSensoryCue {
  readonly id: string;

  /** What produced it. Preserved verbatim through every route it generates. */
  readonly source: ContributionSourceRef;

  readonly phenomenon: PerceptionPhenomenon;
  readonly subject: DetectionSubject;

  readonly emissions: SensoryEmissions;

  /**
   * Present only for informational stimuli a standalone Perception may read.
   * Absent means "this cue exists to be detected", which is the ordinary case.
   */
  readonly reception?: SensoryReception;

  readonly informationIds?: readonly string[];
}


export type SensoryCueIssue =
  | { readonly type: "identifier-missing"; readonly path: string }
  | { readonly type: "phenomenon-invalid"; readonly path: string }
  | { readonly type: "subject-invalid"; readonly path: string }
  | { readonly type: "emissions-empty"; readonly path: string }
  | {
      readonly type: "channel-unknown";
      readonly path: string;
      readonly channel: string;
    }
  | {
      readonly type: "intensity-invalid";
      readonly path: string;
      readonly channel: string;
      readonly actual: unknown;
    }
  | { readonly type: "difficulty-invalid"; readonly path: string; readonly actual: number };


/**
 * Everything wrong with one cue.
 *
 * A cue with no emissions at all is refused rather than treated as silence: an
 * emitter that emits nothing generates no routes, so submitting one is a
 * caller who believes something is happening when nothing is.
 *
 * Note what is NOT checked here — whether any Sense receives these channels.
 * That is an observer-dependent question and belongs to route generation. A
 * cue emitting on `magnetic-field` in a room full of Humans is perfectly well
 * formed; it simply goes unnoticed.
 */
export function findSensoryCueIssues(
  cue: ResolvedSensoryCue,
  path = "cue",
): readonly SensoryCueIssue[] {
  const issues: SensoryCueIssue[] = [];

  if (typeof cue.id !== "string" || cue.id.trim().length === 0) {
    issues.push({ type: "identifier-missing", path: `${path}.id` });
  }

  if (!isPerceptionPhenomenon(cue.phenomenon)) {
    issues.push({ type: "phenomenon-invalid", path: `${path}.phenomenon` });
  }

  if (!isDetectionSubject(cue.subject)) {
    issues.push({ type: "subject-invalid", path: `${path}.subject` });
  }

  const emissions = cue.emissions;
  const entries = typeof emissions === "object" && emissions !== null
    ? Object.entries(emissions)
    : [];

  if (entries.length === 0) {
    issues.push({ type: "emissions-empty", path: `${path}.emissions` });
  }

  for (const [channel, intensity] of entries) {
    if (!isSensoryChannelId(channel)) {
      issues.push({
        type: "channel-unknown",
        path: `${path}.emissions.${channel}`,
        channel,
      });
    }

    /*
     * Checked even for an unknown channel. A caller who mistyped the channel
     * AND passed 0 has two problems, and reporting only the first sends them
     * back for a second round.
     */
    if (!isSensoryIntensity(intensity)) {
      issues.push({
        type: "intensity-invalid",
        path: `${path}.emissions.${channel}`,
        channel,
        actual: intensity,
      });
    }
  }

  if (
    cue.reception?.kind === "uncertain" &&
    (!Number.isInteger(cue.reception.difficulty) ||
      cue.reception.difficulty < 1 ||
      cue.reception.difficulty > 20)
  ) {
    issues.push({
      type: "difficulty-invalid",
      path: `${path}.reception.difficulty`,
      actual: cue.reception.difficulty,
    });
  }

  return issues;
}


/**
 * The channels one cue is actually emitting on, in a stable order.
 *
 * Sorted, so route generation produces the same candidate order on every host
 * — a best-route tie broken by iteration order would otherwise depend on which
 * JavaScript engine built the object.
 */
export function emittedChannels(
  cue: ResolvedSensoryCue,
): readonly SensoryChannelId[] {
  return Object.keys(cue.emissions)
    .filter((channel) => isSensoryIntensity(cue.emissions[channel]))
    .sort();
}
