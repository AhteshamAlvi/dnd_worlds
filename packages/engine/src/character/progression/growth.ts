/*
 * Growth Point progression.
 *
 * Growth Points are the general progression currency used to develop learned
 * character capabilities.
 *
 * They are separate from Stat Points.
 *
 *
 * GROWTH POINT PURPOSE
 * --------------------
 *
 * Stat Points permanently improve raw Attributes.
 *
 * Growth Points are spent by systems representing learned development,
 * including things such as:
 *
 * - Skills;
 * - Techniques;
 * - Abilities;
 * - Nen Principles;
 * - other future trainable capabilities.
 *
 * This file does NOT determine what a Growth Point purchases.
 *
 * Individual capability systems define:
 *
 * - their Growth Point costs;
 * - their mastery structure;
 * - their Attribute requirements;
 * - their prerequisites;
 * - training requirements;
 * - breakthrough requirements;
 * - any other advancement conditions.
 *
 * Once another system has determined that an advancement is valid, this file
 * handles the Growth Point expenditure itself.
 *
 *
 * LEVEL / EXPERIENCE DEPENDENCY
 * -----------------------------
 *
 * This file does NOT define:
 *
 * - what a valid character Level is;
 * - how Lifetime XP works;
 * - XP thresholds;
 * - when post-cap milestones are reached.
 *
 * Those rules belong to progression/levels.ts.
 *
 * growth.ts consumes those rules to determine how many Growth Points normal
 * Level progression and post-cap progression naturally provide.
 *
 *
 * NORMAL LEVEL GROWTH POINTS
 * --------------------------
 *
 * Characters receive:
 *
 *   3 Growth Points per Level
 *
 * Level 1 therefore begins with:
 *
 *   3 Growth Points
 *
 * Every additional Level provides:
 *
 *   +3 Growth Points
 *
 * Therefore:
 *
 *   Level 1  = 3 natural GP
 *   Level 10 = 30 natural GP
 *   Level 20 = 60 natural GP
 *   Level 30 = 90 natural GP
 *
 *
 * POST-CAP GROWTH POINTS
 * ----------------------
 *
 * Character Level remains capped at 30.
 *
 * Lifetime XP continues beyond the Level cap.
 *
 * Every Post-Cap XP Milestone reached provides:
 *
 *   +3 Growth Points
 *
 * Therefore:
 *
 *   Level 30, 3,000 XP = 90 natural GP
 *   Post-Cap I         = 93 natural GP
 *   Post-Cap II        = 96 natural GP
 *   Post-Cap III       = 99 natural GP
 *   ...
 *
 * The XP thresholds for those milestones are owned by levels.ts.
 *
 *
 * ADDITIONAL GROWTH POINTS
 * ------------------------
 *
 * Growth Points may also be granted independently through external systems
 * such as:
 *
 * - quests;
 * - events;
 * - training rewards;
 * - special rewards;
 * - direct GM grants;
 * - other mechanics that explicitly award Growth Points.
 *
 * Those systems determine why and how many Growth Points are awarded.
 *
 * growth.ts only manages the Growth Point currency itself.
 *
 * Growth Points may remain unspent indefinitely.
 */


import type { EngineResult } from "../../infrastructure/result";
import { createTraceNode } from "../../infrastructure/trace";

import {
  deriveExperienceProgress,
  validateCharacterLevel,
} from "./levels";


export const GROWTH_POINTS_PER_LEVEL = 3;

export const POST_CAP_GROWTH_POINTS_PER_MILESTONE = 3;


/**
 * Result of spending Growth Points.
 *
 * The system requesting the expenditure determines what the Growth Points are
 * being spent on.
 *
 * growth.ts only resolves the currency transaction.
 */
export interface GrowthPointExpenditure {
  readonly previousGrowthPoints: number;
  readonly spentGrowthPoints: number;
  readonly remainingGrowthPoints: number;
}


/**
 * Derive the total number of natural Growth Points provided by actual
 * character Level before any post-cap rewards are considered.
 *
 * Character Level validity is owned by progression/levels.ts.
 *
 * Every Level provides exactly 3 Growth Points, including Level 1.
 *
 * Therefore:
 *
 *   naturalLevelGrowthPoints =
 *     level * GROWTH_POINTS_PER_LEVEL
 *
 * Examples:
 *
 *   Level 1  -> 3
 *   Level 5  -> 15
 *   Level 10 -> 30
 *   Level 20 -> 60
 *   Level 30 -> 90
 */
export function deriveNaturalGrowthPointsForLevel(
  level: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id:
      "progression.growth.natural_points.level",
    label:
      "Derive natural Growth Points from Level",

    formula:
      "naturalLevelGrowthPoints = level * GROWTH_POINTS_PER_LEVEL",

    inputs: {
      level: {
        value:
          Number.isFinite(level)
            ? level
            : String(level),
      },
    },
  });


  const levelValidation =
    validateCharacterLevel(
      level,
    );


  if (!levelValidation.success) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors:
        levelValidation.errors,
    };
  }


  const naturalGrowthPoints =
    level *
    GROWTH_POINTS_PER_LEVEL;


  traceNode.output = {
    level,

    growthPointsPerLevel:
      GROWTH_POINTS_PER_LEVEL,

    naturalGrowthPoints,
  };


  return {
    success: true,

    payload:
      naturalGrowthPoints,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Derive total natural Growth Point entitlement from Lifetime XP.
 *
 * This includes:
 *
 * - normal Growth Points earned from actual character Level;
 * - post-cap Growth Points earned from reached Post-Cap XP Milestones.
 *
 * It does NOT include:
 *
 * - quest Growth Points;
 * - event Growth Points;
 * - training rewards;
 * - GM-granted Growth Points;
 * - any other independent reward source.
 *
 * Examples:
 *
 *   0 XP:
 *     Level 1
 *     3 natural GP
 *
 *   3,000 XP:
 *     Level 30
 *     90 natural GP
 *
 *   Post-Cap Milestone I:
 *     93 natural GP
 *
 *   Post-Cap Milestone II:
 *     96 natural GP
 */
export function deriveNaturalGrowthPointsForLifetimeXp(
  lifetimeXp: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id:
      "progression.growth.natural_points.experience",
    label:
      "Derive natural Growth Points from Lifetime XP",

    formula:
      "totalNaturalGrowthPoints = naturalLevelGrowthPoints + (postCapMilestonesReached * POST_CAP_GROWTH_POINTS_PER_MILESTONE)",

    inputs: {
      lifetimeXp: {
        value:
          Number.isFinite(lifetimeXp)
            ? lifetimeXp
            : String(lifetimeXp),
      },
    },
  });


  const progressResult =
    deriveExperienceProgress(
      lifetimeXp,
    );


  if (!progressResult.success) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors:
        progressResult.errors,
    };
  }


  const progress =
    progressResult.payload;


  const levelPointsResult =
    deriveNaturalGrowthPointsForLevel(
      progress.level,
    );


  if (!levelPointsResult.success) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors:
        levelPointsResult.errors,
    };
  }


  const naturalLevelGrowthPoints =
    levelPointsResult.payload;


  const postCapGrowthPoints =
    progress.postCapMilestonesReached *
    POST_CAP_GROWTH_POINTS_PER_MILESTONE;


  const totalNaturalGrowthPoints =
    naturalLevelGrowthPoints +
    postCapGrowthPoints;


  traceNode.output = {
    lifetimeXp,

    level:
      progress.level,

    naturalLevelGrowthPoints,

    postCapMilestonesReached:
      progress.postCapMilestonesReached,

    postCapGrowthPoints,

    totalNaturalGrowthPoints,
  };


  return {
    success: true,

    payload:
      totalNaturalGrowthPoints,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Grant flexible Growth Points.
 *
 * This is used after an external system has already determined that Growth
 * Points should be awarded.
 *
 * Possible callers include:
 *
 * - quests;
 * - events;
 * - training rewards;
 * - special rewards;
 * - direct GM grants;
 * - future mechanics that explicitly grant Growth Points.
 *
 * This function does not determine why the points were granted.
 */
export function grantGrowthPoints(
  currentGrowthPoints: number,
  amount: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id:
      "progression.growth.grant_points",
    label:
      "Grant Growth Points",

    formula:
      "newGrowthPoints = currentGrowthPoints + amount",

    inputs: {
      currentGrowthPoints: {
        value:
          Number.isFinite(currentGrowthPoints)
            ? currentGrowthPoints
            : String(currentGrowthPoints),
      },

      amount: {
        value:
          Number.isFinite(amount)
            ? amount
            : String(amount),
      },
    },
  });


  if (
    !Number.isFinite(currentGrowthPoints) ||
    !Number.isInteger(currentGrowthPoints) ||
    currentGrowthPoints < 0
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
            "progression.growth.points.invalid",
          message:
            "Current Growth Points must be a finite non-negative integer.",
          audience: "developer",
          required:
            "finite integer >= 0",
          actual:
            Number.isFinite(currentGrowthPoints)
              ? currentGrowthPoints
              : String(currentGrowthPoints),
        },
      ],
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
            "progression.growth.grant.invalid",
          message:
            "Granted Growth Points must be a finite positive integer.",
          audience: "developer",
          required:
            "finite integer >= 1",
          actual:
            Number.isFinite(amount)
              ? amount
              : String(amount),
        },
      ],
    };
  }


  const newGrowthPoints =
    currentGrowthPoints +
    amount;


  traceNode.output = {
    previousGrowthPoints:
      currentGrowthPoints,

    grantedGrowthPoints:
      amount,

    newGrowthPoints,
  };


  return {
    success: true,

    payload:
      newGrowthPoints,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Spend Growth Points.
 *
 * This function intentionally does not know what the Growth Points are being
 * spent on.
 *
 * The calling capability system is responsible for checking:
 *
 * - the Growth Point cost;
 * - mastery requirements;
 * - Attribute requirements;
 * - prerequisite capabilities;
 * - training;
 * - breakthroughs;
 * - any other advancement rules.
 *
 * Once those checks succeed, this function performs the currency deduction.
 */
export function spendGrowthPoints(
  currentGrowthPoints: number,
  amount: number,
): EngineResult<GrowthPointExpenditure> {
  const traceNode = createTraceNode({
    id:
      "progression.growth.spend_points",
    label:
      "Spend Growth Points",

    formula:
      "remainingGrowthPoints = currentGrowthPoints - amount",

    inputs: {
      currentGrowthPoints: {
        value:
          Number.isFinite(currentGrowthPoints)
            ? currentGrowthPoints
            : String(currentGrowthPoints),
      },

      amount: {
        value:
          Number.isFinite(amount)
            ? amount
            : String(amount),
      },
    },
  });


  if (
    !Number.isFinite(currentGrowthPoints) ||
    !Number.isInteger(currentGrowthPoints) ||
    currentGrowthPoints < 0
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
            "progression.growth.points.invalid",
          message:
            "Current Growth Points must be a finite non-negative integer.",
          audience: "developer",
          required:
            "finite integer >= 0",
          actual:
            Number.isFinite(currentGrowthPoints)
              ? currentGrowthPoints
              : String(currentGrowthPoints),
        },
      ],
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
            "progression.growth.spend.invalid",
          message:
            "Growth Point expenditure must be a finite positive integer.",
          audience: "developer",
          required:
            "finite integer >= 1",
          actual:
            Number.isFinite(amount)
              ? amount
              : String(amount),
        },
      ],
    };
  }


  if (
    currentGrowthPoints <
    amount
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
            "progression.growth.points.insufficient",
          message:
            "The character does not have enough Growth Points for this expenditure.",
          audience: "player",
          required:
            amount,
          actual:
            currentGrowthPoints,
        },
      ],
    };
  }


  const remainingGrowthPoints =
    currentGrowthPoints -
    amount;


  const payload: GrowthPointExpenditure = {
    previousGrowthPoints:
      currentGrowthPoints,

    spentGrowthPoints:
      amount,

    remainingGrowthPoints,
  };


  traceNode.output = {
    previousGrowthPoints:
      currentGrowthPoints,

    spentGrowthPoints:
      amount,

    remainingGrowthPoints,
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