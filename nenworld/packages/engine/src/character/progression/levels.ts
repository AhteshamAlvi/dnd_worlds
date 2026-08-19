/*
 * Character Level and Experience progression.
 *
 * This file is the authoritative source for:
 *
 * - the normal character Level range;
 * - Lifetime Experience Points;
 * - XP required for progression;
 * - deriving Level from Lifetime XP;
 * - Level transitions;
 * - post-Level-30 XP milestones.
 *
 *
 * LEVEL
 * -----
 *
 * Characters begin at:
 *
 *   Level 1
 *
 * The normal maximum character Level is:
 *
 *   Level 30
 *
 * Level does not continue beyond 30.
 *
 * Experience, however, continues accumulating indefinitely.
 *
 * Therefore two characters may both be Level 30 while possessing vastly
 * different quantities of Lifetime XP and post-cap progression.
 *
 *
 * EXPERIENCE
 * ----------
 *
 * Experience is stored as Lifetime XP.
 *
 * Lifetime XP:
 *
 * - begins at 0;
 * - is never spent;
 * - does not reset when a Level is gained;
 * - may continue increasing after Level 30;
 * - must be a finite non-negative integer.
 *
 * This file does NOT decide why Experience is awarded or how much a specific
 * activity should grant.
 *
 * Those decisions belong to systems such as:
 *
 * - Quests;
 * - Combat;
 * - Events;
 * - direct GM awards;
 * - other future reward systems.
 *
 * Those systems determine the XP award and then use this progression system
 * to add it to the character's Lifetime XP.
 *
 *
 * XP CURVE
 * --------
 *
 * Let L be the character's current progression Level.
 *
 * Raw XP required to advance from L to L + 1:
 *
 *   5 + (0.75 * L) + (L^3 / 75)
 *
 * The result is then rounded to one significant figure.
 *
 * Examples:
 *
 *   Level 1  -> 2:  5.76...  -> 6 XP
 *   Level 10 -> 11: 25.83... -> 30 XP
 *   Level 20 -> 21: 126.66... -> 100 XP
 *   Level 29 -> 30: 351.93... -> 400 XP
 *
 * Lifetime XP required to reach a Level is the sum of the ALREADY-ROUNDED
 * XP costs for every preceding Level transition.
 *
 * This produces:
 *
 *   Level 5  = 30 Lifetime XP
 *   Level 10 = 100 Lifetime XP
 *   Level 15 = 290 Lifetime XP
 *   Level 20 = 700 Lifetime XP
 *   Level 25 = 1,500 Lifetime XP
 *   Level 30 = 3,000 Lifetime XP
 *
 *
 * POST-CAP PROGRESSION
 * --------------------
 *
 * The XP formula continues mathematically beyond Level 30 even though actual
 * character Level does not.
 *
 * Every five continuing formula Levels after Level 30 creates one Post-Cap
 * XP Milestone.
 *
 * Therefore:
 *
 *   Post-Cap I   = formula threshold for Level 35 = 5,400 XP
 *   Post-Cap II  = formula threshold for Level 40 = 9,000 XP
 *   Post-Cap III = formula threshold for Level 45 = 13,900 XP
 *   ...
 *
 * These are NOT actual character Levels.
 *
 * A character with 9,000 Lifetime XP remains:
 *
 *   Level 30
 *
 * but has reached:
 *
 *   Post-Cap Milestone II
 *
 * The rewards produced by those milestones belong to the progression systems
 * that consume the milestone count:
 *
 * - stats.ts handles post-cap Stat Points;
 * - growth.ts handles post-cap Growth Points.
 *
 * levels.ts only determines when milestones have been reached.
 */


import type { EngineResult } from "../../infrastructure/result";
import { roundToOneSignificantFigure } from "../../infrastructure/rounding";
import { createTraceNode } from "../../infrastructure/trace";


export const MIN_CHARACTER_LEVEL = 1;
export const MAX_CHARACTER_LEVEL = 30;

export const POST_CAP_MILESTONE_LEVEL_INTERVAL = 5;


/**
 * Semantic type used anywhere a value represents actual character Level.
 *
 * Runtime validity is enforced through validateCharacterLevel().
 */
export type CharacterLevel = number;


/**
 * Summary of a character's current Level and Lifetime XP progression.
 */
export interface ExperienceProgress {
  readonly lifetimeXp: number;

  readonly level: CharacterLevel;

  readonly currentLevelLifetimeXp: number;

  readonly nextLevelLifetimeXp: number | null;

  readonly xpIntoCurrentLevel: number;

  readonly xpToNextLevel: number | null;

  readonly atLevelCap: boolean;

  readonly xpBeyondLevelCap: number;

  readonly postCapMilestonesReached: number;

  readonly nextPostCapMilestoneLifetimeXp: number | null;
}


/**
 * Internal Lifetime XP derivation.
 *
 * The supplied progression Level may extend beyond the normal character
 * Level cap because the same XP curve is used for post-cap milestones.
 *
 * The XP cost for every Level transition is rounded BEFORE being added to
 * Lifetime XP.
 */
function deriveLifetimeXpThresholdUnchecked(
  level: number,
): number {
  let lifetimeXp = 0;

  for (
    let currentLevel = 1;
    currentLevel < level;
    currentLevel += 1
  ) {
    lifetimeXp +=
      deriveXpToNextLevel(
        currentLevel,
      );
  }

  return lifetimeXp;
}


/**
 * Lifetime XP required to reach the normal Level cap.
 *
 * Under the current XP formula:
 *
 *   Level 30 = 3,000 Lifetime XP
 */
export const LEVEL_CAP_LIFETIME_XP =
  deriveLifetimeXpThresholdUnchecked(
    MAX_CHARACTER_LEVEL,
  );


/**
 * Determine whether a value is a valid actual character Level.
 *
 * Actual character Level is always an integer from 1 through 30.
 */
export function isCharacterLevel(
  level: number,
): boolean {
  return (
    Number.isFinite(level) &&
    Number.isInteger(level) &&
    level >= MIN_CHARACTER_LEVEL &&
    level <= MAX_CHARACTER_LEVEL
  );
}


/**
 * Validate an actual character Level.
 *
 * This validates the real Level stored on a character.
 *
 * It does NOT validate the continuing post-cap formula Levels used internally
 * to derive XP milestones.
 */
export function validateCharacterLevel(
  level: number,
): EngineResult<CharacterLevel> {
  const traceNode = createTraceNode({
    id: "progression.levels.validate",
    label: "Validate character Level",

    formula:
      "Level must be a finite integer from MIN_CHARACTER_LEVEL through MAX_CHARACTER_LEVEL.",

    inputs: {
      level: {
        value: Number.isFinite(level)
          ? level
          : String(level),
      },
    },
  });


  if (
    !Number.isFinite(level) ||
    !Number.isInteger(level)
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "progression.levels.invalid",
          message:
            "Character Level must be a finite integer.",
          audience: "developer",
          required: "finite integer",
          actual: Number.isFinite(level)
            ? level
            : String(level),
        },
      ],
    };
  }


  if (
    level < MIN_CHARACTER_LEVEL ||
    level > MAX_CHARACTER_LEVEL
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "progression.levels.out_of_range",
          message:
            "Character Level is outside the supported Level range.",
          audience: "developer",
          required:
            `${MIN_CHARACTER_LEVEL} <= level <= ${MAX_CHARACTER_LEVEL}`,
          actual: level,
        },
      ],
    };
  }


  traceNode.output = {
    level,
    minimumLevel:
      MIN_CHARACTER_LEVEL,
    maximumLevel:
      MAX_CHARACTER_LEVEL,
  };


  return {
    success: true,

    payload: level,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Validate Lifetime XP.
 *
 * Lifetime XP is never spent and may continue increasing after Level 30.
 */
export function validateLifetimeXp(
  lifetimeXp: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id: "progression.experience.validate",
    label: "Validate Lifetime XP",

    formula:
      "Lifetime XP must be a finite non-negative integer.",

    inputs: {
      lifetimeXp: {
        value: Number.isFinite(lifetimeXp)
          ? lifetimeXp
          : String(lifetimeXp),
      },
    },
  });


  if (
    !Number.isFinite(lifetimeXp) ||
    !Number.isInteger(lifetimeXp) ||
    lifetimeXp < 0
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "progression.experience.invalid",
          message:
            "Lifetime XP must be a finite non-negative integer.",
          audience: "developer",
          required:
            "finite integer >= 0",
          actual: Number.isFinite(lifetimeXp)
            ? lifetimeXp
            : String(lifetimeXp),
        },
      ],
    };
  }


  traceNode.output = {
    lifetimeXp,
    valid: true,
  };


  return {
    success: true,

    payload: lifetimeXp,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Derive the raw XP required to progress from Level L to Level L + 1.
 *
 * This formula is intentionally allowed to continue beyond Level 30 for
 * post-cap XP progression.
 *
 * Raw XP:
 *
 *   5 + (0.75 * L) + (L^3 / 75)
 *
 * This function performs the mathematical derivation only.
 */
export function deriveRawXpToNextLevel(
  level: number,
): number {
  return (
    5 +
    0.75 * level +
    level ** 3 / 75
  );
}


/**
 * Derive the actual XP required to progress from Level L to Level L + 1.
 *
 * The raw result is rounded to one significant figure.
 *
 * This formula continues beyond Level 30 even though actual character Level
 * remains capped at 30.
 */
export function deriveXpToNextLevel(
  level: number,
): number {
  return roundToOneSignificantFigure(
    deriveRawXpToNextLevel(
      level,
    ),
  );
}


/**
 * Derive the Lifetime XP threshold for any point on the progression curve.
 *
 * Unlike actual character Level, the supplied progression Level may exceed 30.
 *
 * This is intentional and is required for post-cap milestones.
 *
 * Examples:
 *
 *   Level 1  -> 0 XP
 *   Level 10 -> 100 XP
 *   Level 20 -> 700 XP
 *   Level 30 -> 3,000 XP
 *   Level 35 -> 5,400 XP
 *   Level 40 -> 9,000 XP
 */
export function deriveLifetimeXpThreshold(
  level: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id: "progression.experience.threshold",
    label: "Derive Lifetime XP threshold",

    formula:
      "Lifetime XP = sum of each rounded XP-to-next-Level cost from Level 1 through level - 1.",

    inputs: {
      level: {
        value: Number.isFinite(level)
          ? level
          : String(level),
      },
    },
  });


  if (
    !Number.isFinite(level) ||
    !Number.isInteger(level) ||
    level < MIN_CHARACTER_LEVEL
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code:
            "progression.experience.threshold_level.invalid",
          message:
            "Progression Level must be a finite integer of at least 1.",
          audience: "developer",
          required:
            "finite integer >= 1",
          actual: Number.isFinite(level)
            ? level
            : String(level),
        },
      ],
    };
  }


  const lifetimeXp =
    deriveLifetimeXpThresholdUnchecked(
      level,
    );


  if (!Number.isFinite(lifetimeXp)) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code:
            "progression.experience.threshold.unsupported",
          message:
            "The requested progression Level produces an XP threshold outside the supported numeric range.",
          audience: "developer",
          required:
            "finite Lifetime XP threshold",
          actual: String(lifetimeXp),
        },
      ],
    };
  }


  traceNode.output = {
    level,
    lifetimeXp,
  };


  return {
    success: true,

    payload: lifetimeXp,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Add Experience to Lifetime XP.
 *
 * This function does not determine why XP was awarded or how much should be
 * awarded.
 *
 * Combat, Quests, Events, the GM, or another external system determines the
 * award amount and calls this function to apply it.
 */
export function addExperience(
  currentLifetimeXp: number,
  amount: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id: "progression.experience.add",
    label: "Add Experience",

    formula:
      "newLifetimeXp = currentLifetimeXp + amount",

    inputs: {
      currentLifetimeXp: {
        value:
          Number.isFinite(currentLifetimeXp)
            ? currentLifetimeXp
            : String(currentLifetimeXp),
      },

      amount: {
        value: Number.isFinite(amount)
          ? amount
          : String(amount),
      },
    },
  });


  const currentValidation =
    validateLifetimeXp(
      currentLifetimeXp,
    );


  if (!currentValidation.success) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors:
        currentValidation.errors,
    };
  }


  if (
    !Number.isFinite(amount) ||
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code:
            "progression.experience.add.invalid",
          message:
            "Added Experience must be a finite positive integer.",
          audience: "developer",
          required:
            "finite integer >= 1",
          actual: Number.isFinite(amount)
            ? amount
            : String(amount),
        },
      ],
    };
  }


  const newLifetimeXp =
    currentLifetimeXp + amount;


  if (!Number.isFinite(newLifetimeXp)) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code:
            "progression.experience.add.overflow",
          message:
            "The resulting Lifetime XP exceeds the supported numeric range.",
          audience: "developer",
          required:
            "finite Lifetime XP",
          actual:
            String(newLifetimeXp),
        },
      ],
    };
  }


  traceNode.output = {
    previousLifetimeXp:
      currentLifetimeXp,

    addedXp:
      amount,

    newLifetimeXp,
  };


  return {
    success: true,

    payload: newLifetimeXp,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Derive actual character Level from Lifetime XP.
 *
 * Character Level is capped at 30.
 *
 * XP beyond the Level 30 threshold does not increase actual Level.
 */
export function deriveCharacterLevelFromLifetimeXp(
  lifetimeXp: number,
): EngineResult<CharacterLevel> {
  const traceNode = createTraceNode({
    id: "progression.levels.from_experience",
    label: "Derive character Level from Lifetime XP",

    formula:
      "Level = highest normal Level whose Lifetime XP threshold has been reached, capped at Level 30.",

    inputs: {
      lifetimeXp: {
        value:
          Number.isFinite(lifetimeXp)
            ? lifetimeXp
            : String(lifetimeXp),
      },
    },
  });


  const xpValidation =
    validateLifetimeXp(
      lifetimeXp,
    );


  if (!xpValidation.success) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors:
        xpValidation.errors,
    };
  }


  let level =
    MIN_CHARACTER_LEVEL;


  for (
    let candidateLevel =
      MIN_CHARACTER_LEVEL + 1;

    candidateLevel <=
      MAX_CHARACTER_LEVEL;

    candidateLevel += 1
  ) {
    const threshold =
      deriveLifetimeXpThresholdUnchecked(
        candidateLevel,
      );


    if (lifetimeXp < threshold) {
      break;
    }


    level =
      candidateLevel;
  }


  traceNode.output = {
    lifetimeXp,
    level,
    levelCap:
      MAX_CHARACTER_LEVEL,
    levelCapLifetimeXp:
      LEVEL_CAP_LIFETIME_XP,
  };


  return {
    success: true,

    payload: level,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Determine whether a character at the supplied Level is capable of gaining
 * another actual character Level.
 *
 * This checks the Level cap only.
 *
 * It does not determine whether the character has enough XP to advance.
 */
export function canGainCharacterLevel(
  level: number,
): EngineResult<boolean> {
  const traceNode = createTraceNode({
    id: "progression.levels.can_gain",
    label: "Determine whether character can gain a Level",

    formula:
      "canGainLevel = validLevel && level < MAX_CHARACTER_LEVEL",

    inputs: {
      level: {
        value: Number.isFinite(level)
          ? level
          : String(level),
      },
    },
  });


  const validation =
    validateCharacterLevel(
      level,
    );


  if (!validation.success) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors:
        validation.errors,
    };
  }


  const canGainLevel =
    level < MAX_CHARACTER_LEVEL;


  traceNode.output = {
    level,

    maximumLevel:
      MAX_CHARACTER_LEVEL,

    canGainLevel,
  };


  return {
    success: true,

    payload: canGainLevel,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Derive the next actual character Level.
 *
 * This performs the Level transition only.
 *
 * It does not check XP and does not grant Stat Points, Growth Points, or any
 * other progression reward.
 */
export function deriveNextCharacterLevel(
  level: number,
): EngineResult<CharacterLevel> {
  const traceNode = createTraceNode({
    id: "progression.levels.next",
    label: "Derive next character Level",

    formula:
      "nextLevel = currentLevel + 1",

    inputs: {
      level: {
        value: Number.isFinite(level)
          ? level
          : String(level),
      },
    },
  });


  const validation =
    validateCharacterLevel(
      level,
    );


  if (!validation.success) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors:
        validation.errors,
    };
  }


  if (level >= MAX_CHARACTER_LEVEL) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code:
            "progression.levels.maximum_reached",
          message:
            "The character is already at the maximum supported Level.",
          audience: "player",
          required:
            `current Level < ${MAX_CHARACTER_LEVEL}`,
          actual: level,
        },
      ],
    };
  }


  const nextLevel =
    level + 1;


  traceNode.output = {
    previousLevel:
      level,

    nextLevel,
  };


  return {
    success: true,

    payload: nextLevel,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Derive the Lifetime XP threshold for a Post-Cap XP Milestone.
 *
 * Every milestone represents five continuing formula Levels after Level 30.
 *
 * Formula:
 *
 *   equivalentProgressionLevel =
 *     MAX_CHARACTER_LEVEL
 *     + (milestone * POST_CAP_MILESTONE_LEVEL_INTERVAL)
 *
 * Examples:
 *
 *   Milestone I   -> Level-35-equivalent threshold -> 5,400 XP
 *   Milestone II  -> Level-40-equivalent threshold -> 9,000 XP
 *   Milestone III -> Level-45-equivalent threshold -> 13,900 XP
 *
 * These equivalent progression Levels are never actual character Levels.
 */
export function derivePostCapMilestoneThreshold(
  milestone: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id:
      "progression.experience.post_cap.threshold",
    label:
      "Derive Post-Cap XP Milestone threshold",

    formula:
      "equivalentProgressionLevel = MAX_CHARACTER_LEVEL + (milestone * POST_CAP_MILESTONE_LEVEL_INTERVAL)",

    inputs: {
      milestone: {
        value: Number.isFinite(milestone)
          ? milestone
          : String(milestone),
      },
    },
  });


  if (
    !Number.isFinite(milestone) ||
    !Number.isInteger(milestone) ||
    milestone <= 0
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code:
            "progression.experience.post_cap.milestone.invalid",
          message:
            "Post-Cap Milestone must be a finite positive integer.",
          audience: "developer",
          required:
            "finite integer >= 1",
          actual:
            Number.isFinite(milestone)
              ? milestone
              : String(milestone),
        },
      ],
    };
  }


  const equivalentProgressionLevel =
    MAX_CHARACTER_LEVEL +
    (
      milestone *
      POST_CAP_MILESTONE_LEVEL_INTERVAL
    );


  const lifetimeXp =
    deriveLifetimeXpThresholdUnchecked(
      equivalentProgressionLevel,
    );


  if (!Number.isFinite(lifetimeXp)) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code:
            "progression.experience.post_cap.threshold.unsupported",
          message:
            "The requested Post-Cap Milestone produces an XP threshold outside the supported numeric range.",
          audience: "developer",
          required:
            "finite Lifetime XP threshold",
          actual:
            String(lifetimeXp),
        },
      ],
    };
  }


  traceNode.output = {
    milestone,

    equivalentProgressionLevel,

    lifetimeXp,
  };


  return {
    success: true,

    payload: lifetimeXp,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Derive how many Post-Cap XP Milestones have been reached.
 *
 * Characters below the first Post-Cap threshold have reached 0 milestones,
 * including ordinary Level 30 characters at exactly 3,000 Lifetime XP.
 */
export function derivePostCapMilestonesReached(
  lifetimeXp: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id:
      "progression.experience.post_cap.reached",
    label:
      "Derive reached Post-Cap XP Milestones",

    formula:
      "Count successive Post-Cap Milestone thresholds not exceeding Lifetime XP.",

    inputs: {
      lifetimeXp: {
        value:
          Number.isFinite(lifetimeXp)
            ? lifetimeXp
            : String(lifetimeXp),
      },
    },
  });


  const xpValidation =
    validateLifetimeXp(
      lifetimeXp,
    );


  if (!xpValidation.success) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors:
        xpValidation.errors,
    };
  }


  if (
    lifetimeXp <
    LEVEL_CAP_LIFETIME_XP
  ) {
    traceNode.output = {
      lifetimeXp,
      milestonesReached: 0,
    };

    return {
      success: true,

      payload: 0,

      trace: {
        root: traceNode,
      },

      warnings: [],
    };
  }


  let milestonesReached = 0;


  while (true) {
    const nextMilestone =
      milestonesReached + 1;

    const equivalentProgressionLevel =
      MAX_CHARACTER_LEVEL +
      (
        nextMilestone *
        POST_CAP_MILESTONE_LEVEL_INTERVAL
      );

    const threshold =
      deriveLifetimeXpThresholdUnchecked(
        equivalentProgressionLevel,
      );


    if (
      !Number.isFinite(threshold) ||
      lifetimeXp < threshold
    ) {
      break;
    }


    milestonesReached =
      nextMilestone;
  }


  traceNode.output = {
    lifetimeXp,

    levelCapLifetimeXp:
      LEVEL_CAP_LIFETIME_XP,

    milestonesReached,
  };


  return {
    success: true,

    payload:
      milestonesReached,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Derive a complete Experience progression summary from Lifetime XP.
 *
 * Below Level 30 this reports progress toward the next actual Level.
 *
 * At Level 30 it reports post-cap progression instead.
 */
export function deriveExperienceProgress(
  lifetimeXp: number,
): EngineResult<ExperienceProgress> {
  const traceNode = createTraceNode({
    id:
      "progression.experience.progress",
    label:
      "Derive Experience progression",

    inputs: {
      lifetimeXp: {
        value:
          Number.isFinite(lifetimeXp)
            ? lifetimeXp
            : String(lifetimeXp),
      },
    },
  });


  const levelResult =
    deriveCharacterLevelFromLifetimeXp(
      lifetimeXp,
    );


  if (!levelResult.success) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors:
        levelResult.errors,
    };
  }


  const level =
    levelResult.payload;

  const currentLevelLifetimeXp =
    deriveLifetimeXpThresholdUnchecked(
      level,
    );

  const atLevelCap =
    level === MAX_CHARACTER_LEVEL;


  if (!atLevelCap) {
    const nextLevelLifetimeXp =
      deriveLifetimeXpThresholdUnchecked(
        level + 1,
      );

    const xpIntoCurrentLevel =
      lifetimeXp -
      currentLevelLifetimeXp;

    const xpToNextLevel =
      nextLevelLifetimeXp -
      lifetimeXp;


    const payload: ExperienceProgress = {
      lifetimeXp,

      level,

      currentLevelLifetimeXp,

      nextLevelLifetimeXp,

      xpIntoCurrentLevel,

      xpToNextLevel,

      atLevelCap: false,

      xpBeyondLevelCap: 0,

      postCapMilestonesReached: 0,

      nextPostCapMilestoneLifetimeXp:
        null,
    };


    traceNode.output = {
      ...payload,
    };


    return {
      success: true,

      payload,

      trace: {
        root: traceNode,
      },

      warnings: [],
    };
  }


  const milestonesResult =
    derivePostCapMilestonesReached(
      lifetimeXp,
    );


  if (!milestonesResult.success) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors:
        milestonesResult.errors,
    };
  }


  const postCapMilestonesReached =
    milestonesResult.payload;

  const nextMilestone =
    postCapMilestonesReached + 1;

  const nextEquivalentProgressionLevel =
    MAX_CHARACTER_LEVEL +
    (
      nextMilestone *
      POST_CAP_MILESTONE_LEVEL_INTERVAL
    );

  const nextPostCapMilestoneLifetimeXp =
    deriveLifetimeXpThresholdUnchecked(
      nextEquivalentProgressionLevel,
    );


  const payload: ExperienceProgress = {
    lifetimeXp,

    level,

    currentLevelLifetimeXp:
      LEVEL_CAP_LIFETIME_XP,

    nextLevelLifetimeXp:
      null,

    xpIntoCurrentLevel:
      lifetimeXp -
      LEVEL_CAP_LIFETIME_XP,

    xpToNextLevel:
      null,

    atLevelCap: true,

    xpBeyondLevelCap:
      lifetimeXp -
      LEVEL_CAP_LIFETIME_XP,

    postCapMilestonesReached,

    nextPostCapMilestoneLifetimeXp:
      Number.isFinite(
        nextPostCapMilestoneLifetimeXp,
      )
        ? nextPostCapMilestoneLifetimeXp
        : null,
  };


  traceNode.output = {
    ...payload,
  };


  return {
    success: true,

    payload,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}