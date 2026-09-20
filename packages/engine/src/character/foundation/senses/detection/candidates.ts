/*
 * The passive sweep: everything an observer might passively notice, in one
 * pass, ordered so a GM reads the assassin before the scenery.
 *
 * Binary now, like the rest of Detection. The old shape asked each candidate to
 * clear an authored information band and reported the band it reached, which
 * meant a hidden knife could be "partially" noticed — a state with no meaning
 * once Detection stopped grading itself. A candidate is now included when any
 * valid route DETECTS it, and excluded otherwise.
 *
 * What survives unchanged is the reason this file exists at all: crowd control.
 * Grouping, importance and deterministic order are what stop a busy market from
 * producing forty notifications, and none of that depended on bands.
 */

import type { CheckModifierContribution } from "../../../../checks/types";
import {
  engineSuccess,
  type EngineResult,
} from "../../../../infrastructure/result";
import { createTraceNode } from "../../../../infrastructure/trace";
import type { ConcealmentRating } from "../concealment";
import type { GeneratedSensoryRoute } from "../routes";
import type { ResolvedSensoryProfile } from "../types";
import { resolvePassiveDetection } from "./passive";
import type { DetectionResolution } from "./types";

export const DETECTION_IMPORTANCE = ["ambient", "relevant", "critical"] as const;
export type DetectionImportance = typeof DETECTION_IMPORTANCE[number];

export interface DetectionCandidateRoute {
  readonly route: GeneratedSensoryRoute;
  readonly concealment: ConcealmentRating;
}

export interface DetectionCandidate {
  readonly id: string;
  readonly importance: DetectionImportance;
  readonly routes: readonly DetectionCandidateRoute[];
  readonly groupId?: string;
}

export interface DetectionNotification {
  readonly key: string;
  readonly candidateIds: readonly string[];
  readonly importance: DetectionImportance;
  /** The clearest positive margin among this group's detecting routes. */
  readonly bestMargin: number;
  /** Only the routes that actually detected; a missed route notifies nothing. */
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

    for (const { route, concealment } of candidate.routes) {
      const result = resolvePassiveDetection({
        mode: "passive",
        profile: input.profile,
        route,
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

    const detecting = results.filter((result) => result.detected);

    if (detecting.length === 0) continue;

    const key = candidate.groupId ?? candidate.id;
    const entry = collected.get(key) ?? {
      candidateIds: [],
      importance: candidate.importance,
      results: [],
    };
    entry.candidateIds.push(candidate.id);
    entry.results.push(...detecting);
    if (IMPORTANCE_WEIGHT[candidate.importance] > IMPORTANCE_WEIGHT[entry.importance]) {
      entry.importance = candidate.importance;
    }
    collected.set(key, entry);
  }

  const notifications = [...collected.entries()].map(([key, entry]) => ({
    key,
    candidateIds: entry.candidateIds,
    importance: entry.importance,
    bestMargin: Math.max(...entry.results.map((result) => result.margin)),
    results: entry.results,
  })).sort((left, right) =>
    IMPORTANCE_WEIGHT[right.importance] - IMPORTANCE_WEIGHT[left.importance] ||
    right.bestMargin - left.bestMargin
  );

  return engineSuccess(notifications, {
    root: createTraceNode({
      id: "character.senses.detection.passive.candidates",
      label: "Sweep passive Detection candidates",
      formula: "notify per group when any of its routes passively detected it",
      inputs: { candidates: { value: input.candidates.length } },
      output: notifications.length,
    }),
  });
}
