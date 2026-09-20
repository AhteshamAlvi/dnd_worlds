/*
 * What is emitted, versus what arrives.
 *
 *
 * TWO INTENSITIES, AND WHY BOTH SURVIVE
 *
 * A campfire does not get quieter because you walked away from it. It emits
 * what it emits; what reaches you is a different number, and both are real.
 * Overwriting the source with the attenuated value is the tempting
 * simplification and it destroys the ability to ask the source question ever
 * again — the second observer, standing somewhere else, would attenuate an
 * already-attenuated figure and hear a fire that quietens for everyone as soon
 * as one person walks away.
 *
 * So a propagated cue carries both, `source` untouched and `received` derived,
 * and the derivation is re-run per observer from the original.
 *
 *
 * WHERE THE NUMBERS COME FROM, AND WHERE THEY DO NOT
 *
 * Not from here. There is no table in this file saying what "heavy rain" costs
 * or how fast sound falls off, because those are balance decisions and a
 * global one would apply to channels nobody thought about — making darkness
 * attenuate scent and rain attenuate danger-sense. Attenuation is declared by
 * a CHANNEL PROFILE that content or a test supplies, entry by entry, and a
 * band no profile mentions does nothing at all.
 *
 * That is also why `adjustBy` is signed. Darkness makes a torch MORE
 * noticeable and a silhouette less, and any global rule that picked one of
 * those would be wrong about the other.
 *
 *
 * BLOCKED IS NOT ZERO
 *
 * A channel attenuated below 1 does not arrive, and a channel a wall stops
 * does not arrive, and these are different facts kept in different places: the
 * first simply drops out of the received emissions, while the second is
 * reported in `blockedChannels` and handed to SEN-1 as an exposure fact. The
 * distinction survives because "too faint to notice" and "physically stopped"
 * are different situations a GM will be asked to explain.
 */

import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import {
  contributionSourceKey,
  type ContributionSourceRef,
} from "../../infrastructure/contribution-source";
import { findDistanceIssues, type Distance } from "../../spatial";
import {
  isSensoryChannelId,
  MAXIMUM_SENSORY_INTENSITY,
  MINIMUM_SENSORY_INTENSITY,
  type SensoryChannelId,
  type SensoryIntensity,
} from "../../character/foundation/senses/channels";
import type {
  ResolvedSensoryCue,
  SensoryEmissions,
} from "../../character/foundation/senses/cues";
import {
  resolveSensoryAccess,
  type SensoryAccessResolution,
} from "../../character/foundation/senses/access";
import type { SensoryExposureFacts } from "../../character/foundation/senses/routes";
import type { ResolvedSensoryProfile } from "../../character/foundation/senses/types";
import {
  findActionEnvironmentIssues,
  type ActionEnvironmentSnapshot,
} from "./environment";
import type { ComposedSensoryCue } from "./sensory";


/**
 * The environment facts a profile may declare an interest in.
 *
 * Exactly the fields of `ActionEnvironmentSnapshot` that carry a band. A
 * profile naming anything else is refused, because a factor the snapshot
 * cannot supply is an entry that would never fire and would look like a rule
 * that simply does not work.
 */
export const ENVIRONMENT_FACTORS = [
  "illumination",
  "ambientNoise",
  "visibility",
  "precipitation",
  "wind",
  "windRelationship",
] as const;

export type EnvironmentFactor = typeof ENVIRONMENT_FACTORS[number];

export function isEnvironmentFactor(value: unknown): value is EnvironmentFactor {
  return typeof value === "string" &&
    (ENVIRONMENT_FACTORS as readonly string[]).includes(value);
}


/**
 * One distance band's effect on one channel.
 *
 * `beyondMetres` is a lower bound and the table is a STEP function: the single
 * entry with the greatest bound at or below the measured distance applies, and
 * it applies once. Entries do not accumulate, because a table read
 * cumulatively silently changes meaning every time an author inserts a band in
 * the middle of it.
 */
export interface DistanceAttenuationEntry {
  readonly beyondMetres: number;
  readonly adjustBy: number;
}


export interface EnvironmentAttenuationEntry {
  readonly factor: EnvironmentFactor;
  readonly band: string;

  /** Signed. Negative attenuates; positive makes it stand out more. */
  readonly adjustBy?: number;

  /** Stopped entirely, rather than merely reduced. */
  readonly blocks?: boolean;
}


export interface ChannelPropagationProfile {
  readonly channel: SensoryChannelId;

  /** Whose rule this is, for the trace. */
  readonly source: ContributionSourceRef;

  readonly distance?: readonly DistanceAttenuationEntry[];
  readonly environment?: readonly EnvironmentAttenuationEntry[];
}


export interface PropagationInput {
  readonly composed: ComposedSensoryCue;

  /** The exact separation, straight from the host's measurement. */
  readonly distance: Distance;

  readonly environment: ActionEnvironmentSnapshot;

  /** One per channel at most; channels with no profile propagate unchanged. */
  readonly profiles: readonly ChannelPropagationProfile[];
}


export interface PropagatedCue {
  /** Exactly what was composed. Never rewritten. */
  readonly source: ResolvedSensoryCue;

  /** What arrives here, at this distance, in these conditions. */
  readonly received: ResolvedSensoryCue;

  readonly blockedChannels: readonly SensoryChannelId[];

  readonly trace: TraceNode;
}


export function findChannelPropagationProfileIssues(
  profile: ChannelPropagationProfile,
  path = "profile",
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!isSensoryChannelId(profile?.channel)) {
    errors.push({
      code: "composition.propagation.channel.unknown",
      message: "A propagation profile must name a registered sensory channel.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.channel` },
      required: "a registered sensory channel id",
      actual: describeDiagnosticValue(profile?.channel),
    });
  }

  (profile?.distance ?? []).forEach((entry, index) => {
    if (!Number.isFinite(entry?.beyondMetres) || entry.beyondMetres < 0) {
      errors.push({
        code: "composition.propagation.distance.bound.invalid",
        message: "A distance attenuation band must start at a finite distance of zero or more.",
        audience: "developer",
        subject: { kind: "field", id: `${path}.distance[${index}].beyondMetres` },
        required: "finite metres >= 0",
        actual: describeDiagnosticValue(entry?.beyondMetres),
      });
    }

    if (!Number.isInteger(entry?.adjustBy)) {
      errors.push({
        code: "composition.propagation.distance.adjust.invalid",
        message: "A distance attenuation must adjust by a whole number of steps.",
        audience: "developer",
        subject: { kind: "field", id: `${path}.distance[${index}].adjustBy` },
        required: "integer",
        actual: describeDiagnosticValue(entry?.adjustBy),
      });
    }
  });

  (profile?.environment ?? []).forEach((entry, index) => {
    const entryPath = `${path}.environment[${index}]`;

    if (!isEnvironmentFactor(entry?.factor)) {
      errors.push({
        code: "composition.propagation.environment.factor.unknown",
        message: "A propagation profile may only react to a known environment factor.",
        audience: "developer",
        subject: { kind: "field", id: `${entryPath}.factor` },
        required: [...ENVIRONMENT_FACTORS],
        actual: describeDiagnosticValue(entry?.factor),
      });
    }

    if (typeof entry?.band !== "string" || entry.band.trim().length === 0) {
      errors.push({
        code: "composition.propagation.environment.band.missing",
        message: "A propagation profile entry must name the band it reacts to.",
        audience: "developer",
        subject: { kind: "field", id: `${entryPath}.band` },
        required: "non-empty band",
        actual: describeDiagnosticValue(entry?.band),
      });
    }

    if (entry?.adjustBy !== undefined && !Number.isInteger(entry.adjustBy)) {
      errors.push({
        code: "composition.propagation.environment.adjust.invalid",
        message: "An environment attenuation must adjust by a whole number of steps.",
        audience: "developer",
        subject: { kind: "field", id: `${entryPath}.adjustBy` },
        required: "integer",
        actual: describeDiagnosticValue(entry.adjustBy),
      });
    }

    /*
     * An entry that neither adjusts nor blocks is a rule an author believes
     * they wrote and which does nothing — the most expensive kind of silent
     * failure this validation can catch.
     */
    if (entry?.adjustBy === undefined && entry?.blocks !== true) {
      errors.push({
        code: "composition.propagation.environment.inert",
        message: "A propagation profile entry must either adjust or block.",
        audience: "developer",
        subject: { kind: "field", id: entryPath },
        required: "adjustBy or blocks",
        actual: "neither",
      });
    }
  });

  return errors;
}


export function findPropagationIssues(
  input: PropagationInput,
  path = "propagation",
): readonly EngineError[] {
  const errors: EngineError[] = [
    ...findDistanceIssues(input?.distance),
    ...findActionEnvironmentIssues(input?.environment ?? {}, `${path}.environment`),
  ];

  (input?.profiles ?? []).forEach((profile, index) => {
    errors.push(
      ...findChannelPropagationProfileIssues(profile, `${path}.profiles[${index}]`),
    );
  });

  const seen = new Set<string>();

  for (const profile of input?.profiles ?? []) {
    if (seen.has(profile?.channel)) {
      errors.push({
        code: "composition.propagation.profile.duplicate",
        message: "Two propagation profiles claim the same channel.",
        audience: "developer",
        subject: { kind: "field", id: `${path}.profiles` },
        required: "one profile per channel",
        actual: profile.channel,
      });
    }

    seen.add(profile?.channel);
  }

  return errors;
}


/** The single distance band that applies, if the table declares one. */
function distanceAdjustment(
  profile: ChannelPropagationProfile,
  distance: Distance,
): DistanceAttenuationEntry | undefined {
  let applicable: DistanceAttenuationEntry | undefined;

  for (const entry of profile.distance ?? []) {
    if (entry.beyondMetres > distance.metres) continue;

    if (
      applicable === undefined ||
      entry.beyondMetres > applicable.beyondMetres
    ) {
      applicable = entry;
    }
  }

  return applicable;
}


export function propagateCue(input: PropagationInput): PropagatedCue {
  const sourceCue = input.composed.cue;

  const byChannel = new Map(
    input.profiles.map((profile) => [profile.channel, profile]),
  );

  const received = new Map<SensoryChannelId, SensoryIntensity>();
  const blocked: SensoryChannelId[] = [];
  const children: TraceNode[] = [];

  const channels = (Object.keys(sourceCue.emissions) as SensoryChannelId[])
    .sort();

  for (const channel of channels) {
    const emitted = sourceCue.emissions[channel];

    if (emitted === undefined) continue;

    const profile = byChannel.get(channel);

    if (profile === undefined) {
      /*
       * No profile means no declared attenuation, which means it arrives as
       * emitted. NOT "arrives at zero": a channel nobody wrote a falloff rule
       * for is a missing rule, and silently deleting it would hide that.
       */
      received.set(channel, emitted);

      children.push(createTraceNode({
        id: `composition.propagation.${channel}`,
        label: `${channel} propagates unattenuated`,
        inputs: { emitted: { value: emitted } },
        output: emitted,
      }));

      continue;
    }

    const steps: { label: string; adjustBy: number }[] = [];
    let isBlocked = false;

    const distanceEntry = distanceAdjustment(profile, input.distance);

    if (distanceEntry !== undefined) {
      steps.push({
        label: `beyond ${distanceEntry.beyondMetres} m`,
        adjustBy: distanceEntry.adjustBy,
      });
    }

    for (const entry of profile.environment ?? []) {
      if (input.environment[entry.factor] !== entry.band) continue;

      if (entry.blocks === true) {
        isBlocked = true;
        continue;
      }

      if (entry.adjustBy !== undefined) {
        steps.push({
          label: `${entry.factor}: ${entry.band}`,
          adjustBy: entry.adjustBy,
        });
      }
    }

    const adjusted = steps.reduce(
      (total, step) => total + step.adjustBy,
      emitted as number,
    );

    const arrives = !isBlocked && adjusted >= MINIMUM_SENSORY_INTENSITY;

    if (isBlocked) blocked.push(channel);

    if (arrives) {
      received.set(
        channel,
        Math.min(MAXIMUM_SENSORY_INTENSITY, adjusted) as SensoryIntensity,
      );
    }

    children.push(createTraceNode({
      id: `composition.propagation.${channel}`,
      label: `Propagate ${channel}`,
      formula: "emitted + declared adjustments, clamped to 1-10",
      inputs: {
        emitted: { value: emitted },
        rule: { value: contributionSourceKey(profile.source) },
        distanceMetres: { value: input.distance.metres },
        adjustments: {
          value: steps.map((step) => `${step.label}: ${step.adjustBy}`),
        },
        blocked: { value: isBlocked },
      },
      output: arrives ? received.get(channel) ?? null : null,
    }));
  }

  const receivedCue: ResolvedSensoryCue = {
    ...sourceCue,
    id: `${sourceCue.id}#received`,
    emissions: Object.fromEntries([...received.entries()]) as SensoryEmissions,
  };

  return {
    source: sourceCue,
    received: receivedCue,
    blockedChannels: blocked,
    trace: createTraceNode({
      id: "composition.propagation",
      label: "Propagate cue",
      inputs: {
        cue: { value: sourceCue.id },
        distanceMetres: { value: input.distance.metres },
      },
      output: received.size,
      children,
    }),
  };
}


export interface CueReceptionInput {
  readonly propagated: PropagatedCue;

  /** The observer's own resolved Senses. SEN-1 owns everything about them. */
  readonly profile: ResolvedSensoryProfile;

  readonly exposure?: SensoryExposureFacts;
}


/**
 * Hand the arrived cue to SEN-1 and get out of the way.
 *
 * This is the whole handoff, and its shortness is the point. Everything after
 * this line — which receivers are compatible, which route is best, whether
 * Concealment applies, whether a roll happens and what is learned — belongs to
 * the sensory domain and is not reimplemented, wrapped or second-guessed here.
 *
 * Composition's only contribution to the decision is the two things only it
 * knows: how strong the cue is where the observer is standing, and which
 * channels were stopped on the way. The second is merged into the exposure
 * facts because `blockedChannels` is exactly the field SEN-1 already has for
 * "this did not arrive", and inventing a second way to say it here would give
 * route generation two sources of truth about the same wall.
 *
 * A cue with NOTHING left after propagation is refused rather than submitted:
 * an empty emission map is a cue cues.ts would reject, and passing one on so
 * SEN-1 can refuse it would be this module asking a downstream validator to
 * report a failure it already knows about.
 */
export function receiveCue(input: CueReceptionInput): SensoryAccessResolution {
  const { propagated } = input;

  if (Object.keys(propagated.received.emissions).length === 0) {
    return { accessible: false, reason: "no-compatible-route" };
  }

  const blocked = [
    ...(input.exposure?.blockedChannels ?? []),
    ...propagated.blockedChannels,
  ];

  const exposure: SensoryExposureFacts = {
    ...input.exposure,
    ...(blocked.length === 0 ? {} : { blockedChannels: blocked }),
  };

  return resolveSensoryAccess({
    profile: input.profile,
    cue: propagated.received,
    exposure,
  });
}
