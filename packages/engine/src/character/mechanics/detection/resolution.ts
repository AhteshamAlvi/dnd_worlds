/*
 * Detection/Concealment contest resolution.
 *
 * Detection and Concealment are resolved independently for each sense.
 *
 * Single-sense rule:
 *
 *   Detection Score > Concealment Score
 *   → detected
 *
 *   Detection Score <= Concealment Score
 *   → undetected
 *
 * Ties therefore favor Concealment.
 *
 *
 * MULTIPLE SENSES
 * ---------------
 *
 * When an observer attempts Detection through multiple senses, each sense is
 * resolved independently.
 *
 * The target is considered detected overall if at least one sense succeeds.
 *
 * Example:
 *
 *   Sight   → undetected
 *   Hearing → detected
 *   Aura    → undetected
 *
 * Overall:
 *
 *   detected
 *
 * This file owns contest resolution only.
 *
 * It does NOT own:
 *
 * - Detection calculations;
 * - Concealment calculations;
 * - dice generation;
 * - attribute-modifier derivation;
 * - sense availability;
 * - whether a sense can perceive a particular target;
 * - range;
 * - line of sight;
 * - wall interaction;
 * - Foundry visibility;
 * - Nen-specific behavior;
 * - general validation.
 *
 * Sense eligibility must be established before a contest reaches this layer.
 */

import type {
  DetectionSenseId,
} from "./types";

import type {
  DetectionScore,
} from "./detection";

import type {
  ConcealmentScore,
} from "./concealment";


/* -------------------------------------------------------------------------- */
/* Single-sense contest                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Result of resolving Detection against Concealment through one sense.
 */
export interface DetectionContestResult {
  readonly sense: DetectionSenseId;

  readonly detection: DetectionScore;

  readonly concealment: ConcealmentScore;

  /**
   * Whether Detection successfully beat Concealment.
   *
   * Ties favor Concealment.
   */
  readonly detected: boolean;
}


/**
 * Resolves one Detection Score against one Concealment Score.
 *
 * Both scores must concern the same sense.
 *
 * Formula:
 *
 *   detection.score > concealment.score
 *
 * If the senses do not match, the contest is invalid. A Detection attempt
 * through one sense cannot be resolved against Concealment for another.
 */
export function resolveDetectionContest(
  detection: DetectionScore,
  concealment: ConcealmentScore,
): DetectionContestResult {
  if (detection.sense !== concealment.sense) {
    throw new Error(
      `Detection sense "${detection.sense}" cannot be resolved against `
      + `Concealment sense "${concealment.sense}".`,
    );
  }

  return {
    sense: detection.sense,
    detection,
    concealment,
    detected:
      detection.score > concealment.score,
  };
}


/* -------------------------------------------------------------------------- */
/* Multi-sense resolution                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Result of resolving Detection through multiple senses.
 *
 * Each contest remains independently available so consumers can determine
 * exactly how the target was or was not detected.
 *
 * `detected` is true when at least one sense succeeds.
 *
 * `successfulSenses` contains every sense through which Detection succeeded.
 */
export interface MultiSenseDetectionResult {
  readonly contests: readonly DetectionContestResult[];

  readonly detected: boolean;

  readonly successfulSenses: readonly DetectionSenseId[];
}


/**
 * Resolves multiple already-constructed Detection/Concealment contests.
 *
 * Each Detection Score is paired with the corresponding Concealment Score at
 * the same array position.
 *
 * Example:
 *
 *   detections:
 *     Sight Detection
 *     Hearing Detection
 *     Aura Detection
 *
 *   concealments:
 *     Sight Concealment
 *     Hearing Concealment
 *     Aura Concealment
 *
 * Each pair is resolved independently.
 *
 * The target is detected overall if any individual sense succeeds.
 */
export function resolveDetectionContests(
  detections: readonly DetectionScore[],
  concealments: readonly ConcealmentScore[],
): MultiSenseDetectionResult {
  if (detections.length !== concealments.length) {
    throw new Error(
      "Detection and Concealment contest counts must match.",
    );
  }

  const contests: DetectionContestResult[] = [];

  for (let index = 0; index < detections.length; index += 1) {
    const detection = detections[index];
    const concealment = concealments[index];

    if (detection === undefined || concealment === undefined) {
      throw new Error(
        `Missing Detection or Concealment score at contest index ${index}.`,
      );
    }

    contests.push(
      resolveDetectionContest(
        detection,
        concealment,
      ),
    );
  }

  const successfulSenses = contests
    .filter((contest) => contest.detected)
    .map((contest) => contest.sense);

  return {
    contests,
    detected: successfulSenses.length > 0,
    successfulSenses,
  };
}