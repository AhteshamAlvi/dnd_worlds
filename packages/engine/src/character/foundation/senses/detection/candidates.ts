import type { CheckModifierContribution } from "../../../../checks/types";
import {
  engineSuccess,
  type EngineResult,
} from "../../../../infrastructure/result";
import { createTraceNode } from "../../../../infrastructure/trace";
import type { ConcealmentRating } from "../concealment";
import { compareInformationBands, highestInformationBand, type InformationBand } from "../information";
import type { PerceivedCue } from "../signatures";
import type { ResolvedSensoryProfile } from "../types";
import { resolvePassiveDetection } from "./passive";
import type { DetectionResolution } from "./types";

export const DETECTION_IMPORTANCE = ["ambient", "relevant", "critical"] as const;
export type DetectionImportance = typeof DETECTION_IMPORTANCE[number];

export interface DetectionCandidateRoute {
  readonly cue: PerceivedCue;
  readonly concealment: ConcealmentRating;
}

export interface DetectionCandidate {
  readonly id: string;
  readonly importance: DetectionImportance;
  readonly routes: readonly DetectionCandidateRoute[];
  readonly groupId?: string;
  readonly minimumNotificationBand?: Exclude<InformationBand, "none">;
}

export interface DetectionNotification {
  readonly key: string;
  readonly candidateIds: readonly string[];
  readonly importance: DetectionImportance;
  readonly band: Exclude<InformationBand, "none">;
  readonly results: readonly DetectionResolution[];
}

const IMPORTANCE_WEIGHT: Readonly<Record<DetectionImportance, number>> = {
  ambient: 0,
  relevant: 1,
  critical: 2,
};

export function resolvePassiveDetectionCandidates(input: {
  readonly profile: ResolvedSensoryProfile;
  readonly candidates: readonly DetectionCandidate[];
  readonly modifiers?: readonly CheckModifierContribution[];
}): EngineResult<readonly DetectionNotification[]> {
  const collected = new Map<string, {
    candidateIds: string[];
    importance: DetectionImportance;
    results: DetectionResolution[];
  }>();

  for (const candidate of input.candidates) {
    const results: DetectionResolution[] = [];

    for (const { cue, concealment } of candidate.routes) {
      const result = resolvePassiveDetection({
        mode: "passive",
        profile: input.profile,
        cue,
        concealment,
        ...(input.modifiers === undefined ? {} : { modifiers: input.modifiers }),
      });

      /*
       * One malformed candidate fails the sweep rather than being dropped.
       * Silently skipping it would mean an observer quietly stopped being
       * notified about something, which is indistinguishable from correctly
       * not noticing it.
       */
      if (!result.success) return result;

      results.push(result.payload);
    }

    const best = highestInformationBand(results.map((result) => result.band));
    const minimum = candidate.minimumNotificationBand ?? "minimal";
    if (best === "none" || compareInformationBands(best, minimum) < 0) continue;

    const key = candidate.groupId ?? candidate.id;
    const entry = collected.get(key) ?? {
      candidateIds: [],
      importance: candidate.importance,
      results: [],
    };
    entry.candidateIds.push(candidate.id);
    entry.results.push(...results.filter((result) => result.band !== "none"));
    if (IMPORTANCE_WEIGHT[candidate.importance] > IMPORTANCE_WEIGHT[entry.importance]) {
      entry.importance = candidate.importance;
    }
    collected.set(key, entry);
  }

  const notifications = [...collected.entries()].map(([key, entry]) => ({
    key,
    candidateIds: entry.candidateIds,
    importance: entry.importance,
    band: highestInformationBand(entry.results.map((result) => result.band)) as Exclude<InformationBand, "none">,
    results: entry.results,
  })).sort((left, right) =>
    IMPORTANCE_WEIGHT[right.importance] - IMPORTANCE_WEIGHT[left.importance] ||
    compareInformationBands(right.band, left.band) ||
    Math.max(...right.results.map((result) => result.margin)) -
      Math.max(...left.results.map((result) => result.margin))
  );

  return engineSuccess(notifications, {
    root: createTraceNode({
      id: "character.senses.detection.passive.candidates",
      label: "Sweep passive Detection candidates",
      formula: "notify per group at the highest band any of its routes reached",
      inputs: { candidates: { value: input.candidates.length } },
      output: notifications.length,
    }),
  });
}
