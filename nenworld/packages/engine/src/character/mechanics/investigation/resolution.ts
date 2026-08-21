/*
 * Investigation resolution.
 *
 * Investigation is resolved against a fixed Difficulty Class.
 *
 * Resolution rule:
 *
 *   Investigation Score >= Investigation DC
 *   → success
 *
 *   Investigation Score < Investigation DC
 *   → failure
 *
 * Ties therefore favor the investigator.
 *
 * This file owns Investigation resolution only.
 *
 * It does NOT own:
 *
 * - Investigation calculations;
 * - attribute-modifier derivation;
 * - dice generation;
 * - choosing Investigation DCs;
 * - Detection;
 * - environmental eligibility;
 * - validation.
 */

import type {
  InvestigationScore,
} from "./investigation";


/* -------------------------------------------------------------------------- */
/* Investigation resolution                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Result of resolving an Investigation Score against a Difficulty Class.
 *
 * `margin` records how far above or below the DC the Investigation landed.
 *
 * Examples:
 *
 *   score 18 vs DC 15
 *   → margin = 3
 *   → succeeded
 *
 *   score 15 vs DC 15
 *   → margin = 0
 *   → succeeded
 *
 *   score 12 vs DC 15
 *   → margin = -3
 *   → failed
 */
export interface InvestigationResolution {
  readonly investigation: InvestigationScore;

  readonly difficultyClass: number;

  readonly margin: number;

  readonly succeeded: boolean;
}


/**
 * Resolves an Investigation Score against a Difficulty Class.
 *
 * Formula:
 *
 *   score >= difficultyClass
 */
export function resolveInvestigation(
  investigation: InvestigationScore,
  difficultyClass: number,
): InvestigationResolution {
  const margin =
    investigation.score
    - difficultyClass;

  return {
    investigation,
    difficultyClass,
    margin,
    succeeded: margin >= 0,
  };
}