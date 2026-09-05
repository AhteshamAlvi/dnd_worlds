import { createTraceNode } from "../../../infrastructure/trace";
import { deriveStandardModifier } from "../attributes/resolution";
import { resolveDerivedAttribute } from "../attributes/derived/resolution";
import type { CharacterStats } from "../attributes/stats";
import { EMPTY_SENSORY_EFFECTS, type ResolvedSensoryEffects } from "./modifiers";
import {
  PHYSICAL_SENSE_IDS,
  SENSE_IDS,
  matchesSenseSelector,
  type SenseId,
} from "./scopes";
import {
  NATURAL_EXTRASENSORY_PERCEPTION_REQUIREMENTS,
  type ResolvedSense,
  type ResolvedSensoryProfile,
} from "./types";

export interface ResolveSensoryProfileOptions {
  readonly effects?: ResolvedSensoryEffects;
  readonly nenAwakened?: boolean;
  readonly unavailablePhysicalSenses?: readonly SenseId[];
}

export function resolveSensoryProfile(
  stats: CharacterStats,
  options: ResolveSensoryProfileOptions = {},
): ResolvedSensoryProfile {
  const effects = options.effects ?? EMPTY_SENSORY_EFFECTS;
  const unavailable = new Set(options.unavailablePhysicalSenses ?? []);
  const naturallyExtrasensory =
    stats.per >= NATURAL_EXTRASENSORY_PERCEPTION_REQUIREMENTS.per &&
    stats.spi >= NATURAL_EXTRASENSORY_PERCEPTION_REQUIREMENTS.spi;

  const senses = {} as Record<SenseId, ResolvedSense>;

  for (const id of SENSE_IDS) {
    const matchingModifiers = effects.senseModifiers.filter((modifier) =>
      matchesSenseSelector(modifier.sense, id)
    );
    const score = stats.per + matchingModifiers.reduce(
      (total, modifier) => total + modifier.amount,
      0,
    );
    const granted = effects.senseGrants.some((grant) => grant.sense === id);
    const suppressed = effects.senseSuppressions.some((entry) =>
      matchesSenseSelector(entry.sense, id)
    ) || unavailable.has(id);
    const ordinaryPhysical = (PHYSICAL_SENSE_IDS as readonly SenseId[]).includes(id);
    const unlocked = ordinaryPhysical || naturallyExtrasensory || granted;
    const senseAdjustedStats = { ...stats, per: score };
    const detectionScore = resolveDerivedAttribute("detection", senseAdjustedStats);
    const investigationScore = resolveDerivedAttribute("investigation", senseAdjustedStats);

    senses[id] = {
      id,
      score,
      standardModifier: deriveStandardModifier(score),
      available: unlocked && !suppressed,
      availabilityReason: suppressed
        ? "suppressed"
        : granted
          ? "granted"
          : ordinaryPhysical
            ? "normally-available"
            : naturallyExtrasensory
              ? "natural-extrasensory-unlock"
              : "not-unlocked",
      contributions: matchingModifiers.map(({ source, amount }) => ({ source, amount })),
      detection: {
        score: detectionScore,
        standardModifier: deriveStandardModifier(detectionScore),
      },
      investigation: {
        score: investigationScore,
        standardModifier: deriveStandardModifier(investigationScore),
      },
      passiveDetectionBase:
        deriveStandardModifier(score) + deriveStandardModifier(stats.wis),
    };
  }

  const nenSuppressed = effects.nenPerceptionSuppressions.length > 0;
  const nenAvailable = Boolean(options.nenAwakened) ||
    effects.nenPerceptionGrants.length > 0;

  return {
    senses,
    nenPerception: {
      available: nenAvailable && !nenSuppressed,
      sources: [...effects.nenPerceptionGrants],
      suppressedBy: [...effects.nenPerceptionSuppressions],
    },
    passiveConcealmentBase:
      deriveStandardModifier(stats.dex) + deriveStandardModifier(stats.wis),
    trace: createTraceNode({
      id: "character.senses.profile",
      label: "Resolve sensory profile",
      formula: "effective sense = PER + matching sense modifiers",
      inputs: {
        per: { value: stats.per },
        spi: { value: stats.spi },
        naturalExtrasensory: { value: naturallyExtrasensory },
        nenAwakened: { value: Boolean(options.nenAwakened) },
      },
      output: Object.fromEntries(SENSE_IDS.map((id) => [id, senses[id].score])),
    }),
  };
}
