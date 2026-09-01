/*
 * Permanent character stat progression.
 *
 * This file owns:
 *
 * - the Level 1 starting array for the seven normally trainable Attributes;
 * - ordinary Stat Points;
 * - natural Stat Point entitlement from character Level;
 * - post-cap Stat Point entitlement from Lifetime XP;
 * - spending ordinary Stat Points;
 * - granting additional ordinary Stat Points;
 * - Limited Stat Point grants.
 *
 * The Base Attribute cap, and which Attributes are ordinarily trainable
 * versus rolled at character creation, are owned by
 * foundation/attributes/base.ts — this file consumes those facts rather than
 * redefining them.
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
 * stats.ts consumes those rules to determine how many Stat Points normal
 * Level progression and post-cap progression naturally provide.
 *
 *
 * NORMAL STAT POINT ATTRIBUTES
 * ----------------------------
 *
 * Ordinary Stat Points may increase:
 *
 *   AGI, DEX, CON, VIT, INT, WIS, PER
 *
 * SPI and CHA are intentionally excluded. This classification is owned by
 * foundation/attributes/base.ts (ORDINARY_ATTRIBUTE_KEYS / ROLLED_ATTRIBUTE_KEYS).
 *
 * SPI and CHA are rolled separately during character creation and cannot be
 * increased by ordinary Stat Points.
 *
 * STR is absent for a different reason again, and a more fundamental one: it
 * is not stored. Strength is derived from the body's Structural Capacity and
 * force production, so there is nothing here for a Stat Point to increase.
 * Raising it means changing the body, which is what
 * foundation/body/strength/advancement.ts does — it solves for the Muscularity
 * that doubles normalized Strength Points and persists that instead. A Stat
 * Point spent on STR would write a number the physics would immediately
 * contradict.
 *
 * They may still be permanently increased through Limited Stat Point grants
 * from quests, events, items, special mechanics, or direct GM grants.
 *
 *
 * STARTING ARRAY
 * --------------
 *
 * The seven normally trainable Attributes begin from the assignable array:
 *
 *   11, 11, 10, 10, 10, 9, 9
 *
 * Total:   70
 * Average: 10
 *
 * SPI and CHA are not part of this array.
 *
 *
 * NORMAL LEVEL STAT POINTS
 * ------------------------
 *
 * Characters begin at Level 1 with:
 *
 *   2 Stat Points
 *
 * Every additional Level provides:
 *
 *   +2 Stat Points
 *
 * Therefore:
 *
 *   Level 1  = 2 natural SP
 *   Level 10 = 20 natural SP
 *   Level 20 = 40 natural SP
 *   Level 30 = 60 natural SP
 *
 *
 * POST-CAP STAT POINTS
 * --------------------
 *
 * Character Level remains capped at 30.
 *
 * Lifetime XP continues beyond the Level cap.
 *
 * Every Post-Cap XP Milestone reached provides:
 *
 *   +1 Stat Point
 *
 * Therefore:
 *
 *   Level 30, 3,000 XP = 60 natural SP
 *   Post-Cap I         = 61 natural SP
 *   Post-Cap II        = 62 natural SP
 *   Post-Cap III       = 63 natural SP
 *   ...
 *
 * The XP thresholds for those milestones are owned by levels.ts.
 *
 *
 * ADDITIONAL STAT POINTS
 * ----------------------
 *
 * Ordinary Stat Points may also be granted independently through external
 * systems such as:
 *
 * - quests;
 * - events;
 * - special rewards;
 * - direct GM grants;
 * - other mechanics that explicitly award ordinary Stat Points.
 *
 * Those systems determine why and how many Stat Points are awarded.
 *
 * stats.ts only manages the Stat Point currency itself.
 *
 *
 * STAT INCREASE COST
 * ------------------
 *
 * Every permanent +1 increase costs exactly:
 *
 *   1 Stat Point
 *
 * This cost never increases based on the current Attribute score.
 *
 * The increasing difficulty of high-stat progression is handled through
 * Level, XP, post-cap progression and external rewards rather than escalating
 * Stat Point costs.
 *
 *
 * LIMITED STAT POINTS
 * -------------------
 *
 * A Limited Stat Point grant permanently increases an explicitly specified
 * Attribute instead of entering the character's flexible Stat Point balance.
 *
 * Examples:
 *
 *   +1 SPI
 *   +2 CON
 *   +1 VIT
 *
 * Limited Stat Point grants:
 *
 * - do not consume ordinary Stat Points;
 * - do not add to the ordinary Stat Point balance;
 * - may increase any Attribute, including SPI and CHA;
 * - may come from quests, events, items, special mechanics, or the GM;
 * - remain subject to the normal Base Attribute cap unless another mechanic
 *   explicitly defines an exception.
 */


import type { EngineResult } from "../../infrastructure/result";
import { createTraceNode } from "../../infrastructure/trace";

import type { Attributes, AttributeKey } from "../foundation/attributes/types";
import {
  ATTRIBUTE_MAX,
  isOrdinaryAttributeKey,
  type OrdinaryAttributeKey,
} from "../foundation/attributes/base";

import {
  deriveExperienceProgress,
  validateCharacterLevel,
} from "./levels";


export const STARTING_STAT_POINTS = 2;
export const STAT_POINTS_PER_LEVEL_GAINED = 2;

export const POST_CAP_STAT_POINTS_PER_MILESTONE = 1;


/**
 * Assignable Level 1 array for the seven normally trainable Attributes.
 *
 * One entry per ORDINARY_ATTRIBUTE_KEYS entry, still averaging exactly 10.
 *
 * It lost a value rather than gaining one when STR stopped being stored. The
 * array assigns scores to Attributes a character HAS, and there is no longer
 * an eighth to assign one to: Strength is resolved from the body. Leaving the
 * eighth value in place would have handed every character a score with nowhere
 * to put it, and the shape — two above, two below, the rest at the reference —
 * is preserved by dropping a 10.
 *
 * SPI and CHA are rolled separately and are deliberately not represented here.
 */
export const STARTING_STAT_ARRAY = [
  11,
  11,
  10,
  10,
  10,
  9,
  9,
] as const;


export type { AttributeKey, OrdinaryAttributeKey };


/**
 * A permanent Limited Stat Point grant.
 *
 * The target Attribute is determined by the source of the reward rather than
 * freely selected using the character's ordinary Stat Point balance.
 *
 * Examples:
 *
 *   { attribute: "spi", amount: 1 }
 *   { attribute: "con", amount: 2 }
 */
export interface LimitedStatPointGrant {
  readonly attribute: AttributeKey;
  readonly amount: number;
}


/**
 * Result of spending ordinary Stat Points.
 */
export interface StatPointExpenditure {
  readonly attributes: Attributes;

  readonly previousStatPoints: number;
  readonly spentStatPoints: number;
  readonly remainingStatPoints: number;

  readonly attribute: OrdinaryAttributeKey;
  readonly previousScore: number;
  readonly newScore: number;
}


/**
 * Result of applying a Limited Stat Point grant.
 */
export interface LimitedStatPointGrantResult {
  readonly attributes: Attributes;

  readonly attribute: AttributeKey;
  readonly amount: number;

  readonly previousScore: number;
  readonly newScore: number;
}


/**
 * Derive the total number of natural Stat Points provided by actual character
 * Level before any post-cap rewards are considered.
 *
 * Character Level validity is owned by progression/levels.ts.
 *
 * Level 1 begins with 2 Stat Points.
 * Every additional Level provides another 2.
 *
 * Therefore:
 *
 *   naturalLevelStatPoints =
 *     STARTING_STAT_POINTS
 *     + ((level - 1) * STAT_POINTS_PER_LEVEL_GAINED)
 *
 * Examples:
 *
 *   Level 1  -> 2
 *   Level 5  -> 10
 *   Level 10 -> 20
 *   Level 30 -> 60
 */
export function deriveNaturalStatPointsForLevel(
  level: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id: "progression.stats.natural_points.level",
    label: "Derive natural Stat Points from Level",

    formula:
      "naturalLevelStatPoints = STARTING_STAT_POINTS + ((level - 1) * STAT_POINTS_PER_LEVEL_GAINED)",

    inputs: {
      level: {
        value: Number.isFinite(level)
          ? level
          : String(level),
      },
    },
  });


  const levelValidation =
    validateCharacterLevel(level);


  if (!levelValidation.success) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: levelValidation.errors,
    };
  }


  const naturalStatPoints =
    STARTING_STAT_POINTS +
    (
      (level - 1) *
      STAT_POINTS_PER_LEVEL_GAINED
    );


  traceNode.output = {
    level,

    startingStatPoints:
      STARTING_STAT_POINTS,

    statPointsPerLevelGained:
      STAT_POINTS_PER_LEVEL_GAINED,

    naturalStatPoints,
  };


  return {
    success: true,

    payload: naturalStatPoints,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Derive total natural Stat Point entitlement from Lifetime XP.
 *
 * This includes:
 *
 * - normal Stat Points earned from actual character Level;
 * - post-cap Stat Points earned from reached Post-Cap XP Milestones.
 *
 * It does NOT include:
 *
 * - quest Stat Points;
 * - event Stat Points;
 * - GM-granted Stat Points;
 * - Limited Stat Point grants;
 * - any other independent reward source.
 *
 * Examples:
 *
 *   0 XP:
 *     Level 1
 *     2 natural SP
 *
 *   3,000 XP:
 *     Level 30
 *     60 natural SP
 *
 *   Post-Cap Milestone I:
 *     61 natural SP
 *
 *   Post-Cap Milestone II:
 *     62 natural SP
 */
export function deriveNaturalStatPointsForLifetimeXp(
  lifetimeXp: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id:
      "progression.stats.natural_points.experience",
    label:
      "Derive natural Stat Points from Lifetime XP",

    formula:
      "totalNaturalStatPoints = naturalLevelStatPoints + (postCapMilestonesReached * POST_CAP_STAT_POINTS_PER_MILESTONE)",

    inputs: {
      lifetimeXp: {
        value: Number.isFinite(lifetimeXp)
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

      errors: progressResult.errors,
    };
  }


  const progress =
    progressResult.payload;


  const levelPointsResult =
    deriveNaturalStatPointsForLevel(
      progress.level,
    );


  if (!levelPointsResult.success) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: levelPointsResult.errors,
    };
  }


  const naturalLevelStatPoints =
    levelPointsResult.payload;


  const postCapStatPoints =
    progress.postCapMilestonesReached *
    POST_CAP_STAT_POINTS_PER_MILESTONE;


  const totalNaturalStatPoints =
    naturalLevelStatPoints +
    postCapStatPoints;


  traceNode.output = {
    lifetimeXp,

    level:
      progress.level,

    naturalLevelStatPoints,

    postCapMilestonesReached:
      progress.postCapMilestonesReached,

    postCapStatPoints,

    totalNaturalStatPoints,
  };


  return {
    success: true,

    payload:
      totalNaturalStatPoints,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Grant flexible ordinary Stat Points.
 *
 * This is used after an external system has already determined that Stat
 * Points should be awarded.
 *
 * Possible callers include:
 *
 * - quests;
 * - events;
 * - special rewards;
 * - direct GM grants;
 * - future mechanics that explicitly grant ordinary Stat Points.
 *
 * This function does not determine why the points were granted.
 */
export function grantStatPoints(
  currentStatPoints: number,
  amount: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id: "progression.stats.grant_points",
    label: "Grant ordinary Stat Points",

    formula:
      "newStatPoints = currentStatPoints + amount",

    inputs: {
      currentStatPoints: {
        value: Number.isFinite(currentStatPoints)
          ? currentStatPoints
          : String(currentStatPoints),
      },

      amount: {
        value: Number.isFinite(amount)
          ? amount
          : String(amount),
      },
    },
  });


  if (
    !Number.isFinite(currentStatPoints) ||
    !Number.isInteger(currentStatPoints) ||
    currentStatPoints < 0
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
            "progression.stats.points.invalid",
          message:
            "Current Stat Points must be a finite non-negative integer.",
          audience: "developer",
          required:
            "finite integer >= 0",
          actual:
            Number.isFinite(currentStatPoints)
              ? currentStatPoints
              : String(currentStatPoints),
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
            "progression.stats.grant.invalid",
          message:
            "Granted Stat Points must be a finite positive integer.",
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


  const newStatPoints =
    currentStatPoints + amount;


  traceNode.output = {
    previousStatPoints:
      currentStatPoints,

    grantedStatPoints:
      amount,

    newStatPoints,
  };


  return {
    success: true,

    payload:
      newStatPoints,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Spend ordinary Stat Points to permanently increase one normally trainable
 * Base Attribute.
 *
 * Rules:
 *
 * - AGI, DEX, CON, VIT, INT, WIS and PER are valid targets;
 * - SPI and CHA cannot consume ordinary Stat Points;
 * - 1 Stat Point always purchases exactly +1 Base Attribute;
 * - multiple Stat Points may be spent at once;
 * - the resulting Base Attribute may not exceed 30.
 */
export function spendStatPoints(
  attributes: Attributes,
  currentStatPoints: number,
  attribute: AttributeKey,
  amount: number = 1,
): EngineResult<StatPointExpenditure> {
  const traceNode = createTraceNode({
    id: "progression.stats.spend_points",
    label: "Spend ordinary Stat Points",

    formula:
      "newScore = previousScore + amount; remainingStatPoints = currentStatPoints - amount",

    inputs: {
      attribute: {
        value: attribute,
      },

      currentStatPoints: {
        value:
          Number.isFinite(currentStatPoints)
            ? currentStatPoints
            : String(currentStatPoints),
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
    !isOrdinaryAttributeKey(
      attribute,
    )
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
            "progression.stats.attribute.not_spendable",
          message:
            "Ordinary Stat Points may only increase AGI, DEX, CON, VIT, INT, WIS, or PER.",
          audience: "player",
          required:
            "AGI, DEX, CON, VIT, INT, WIS, or PER",
          actual:
            attribute,
        },
      ],
    };
  }


  if (
    !Number.isFinite(currentStatPoints) ||
    !Number.isInteger(currentStatPoints) ||
    currentStatPoints < 0
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
            "progression.stats.points.invalid",
          message:
            "Current Stat Points must be a finite non-negative integer.",
          audience: "developer",
          required:
            "finite integer >= 0",
          actual:
            Number.isFinite(currentStatPoints)
              ? currentStatPoints
              : String(currentStatPoints),
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
            "progression.stats.spend.invalid",
          message:
            "Stat Point expenditure must be a finite positive integer.",
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
    currentStatPoints <
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
            "progression.stats.points.insufficient",
          message:
            "The character does not have enough Stat Points for this increase.",
          audience: "player",
          required:
            amount,
          actual:
            currentStatPoints,
        },
      ],
    };
  }


  const previousScore =
    attributes[attribute];


  if (
    !Number.isFinite(previousScore) ||
    !Number.isInteger(previousScore)
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
            "progression.stats.attribute.invalid",
          message:
            "The target Base Attribute must be a finite integer.",
          audience: "developer",
          required:
            "finite integer",
          actual:
            Number.isFinite(previousScore)
              ? previousScore
              : String(previousScore),
        },
      ],
    };
  }


  const newScore =
    previousScore +
    amount;


  if (
    newScore >
    ATTRIBUTE_MAX
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
            "progression.stats.attribute.cap_exceeded",
          message:
            "This Stat Point expenditure would exceed the normal Base Attribute cap.",
          audience: "player",
          required:
            `result <= ${ATTRIBUTE_MAX}`,
          actual:
            newScore,
        },
      ],
    };
  }


  const updatedAttributes: Attributes = {
    ...attributes,

    [attribute]:
      newScore,
  };


  const remainingStatPoints =
    currentStatPoints -
    amount;


  const payload: StatPointExpenditure = {
    attributes:
      updatedAttributes,

    previousStatPoints:
      currentStatPoints,

    spentStatPoints:
      amount,

    remainingStatPoints,

    attribute,

    previousScore,

    newScore,
  };


  traceNode.output = {
    attribute,

    previousScore,

    spentStatPoints:
      amount,

    newScore,

    previousStatPoints:
      currentStatPoints,

    remainingStatPoints,
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


/**
 * Apply a permanent Limited Stat Point grant to a specific Base Attribute.
 *
 * This does not consume or modify the character's ordinary Stat Point balance.
 *
 * Because the reward explicitly determines the target, any Base Attribute may
 * be increased this way, including SPI and CHA.
 *
 * Examples:
 *
 * - a spiritual event grants +1 SPI;
 * - an item permanently grants +2 CHA;
 * - the GM directly grants +1 VIT.
 */
export function applyLimitedStatPointGrant(
  attributes: Attributes,
  grant: LimitedStatPointGrant,
): EngineResult<LimitedStatPointGrantResult> {
  const traceNode = createTraceNode({
    id:
      "progression.stats.limited_point_grant",
    label:
      "Apply Limited Stat Point grant",

    formula:
      "newScore = previousScore + amount",

    inputs: {
      attribute: {
        value:
          grant.attribute,
      },

      amount: {
        value:
          Number.isFinite(grant.amount)
            ? grant.amount
            : String(grant.amount),
      },
    },
  });


  if (
    !Number.isFinite(grant.amount) ||
    !Number.isInteger(grant.amount) ||
    grant.amount <= 0
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
            "progression.stats.limited_point_grant.invalid",
          message:
            "A Limited Stat Point grant must be a finite positive integer.",
          audience: "developer",
          required:
            "finite integer >= 1",
          actual:
            Number.isFinite(grant.amount)
              ? grant.amount
              : String(grant.amount),
        },
      ],
    };
  }


  const previousScore =
    attributes[
      grant.attribute
    ];


  if (
    !Number.isFinite(previousScore) ||
    !Number.isInteger(previousScore)
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
            "progression.stats.attribute.invalid",
          message:
            "The target Base Attribute must be a finite integer.",
          audience: "developer",
          required:
            "finite integer",
          actual:
            Number.isFinite(previousScore)
              ? previousScore
              : String(previousScore),
        },
      ],
    };
  }


  const newScore =
    previousScore +
    grant.amount;


  if (
    newScore >
    ATTRIBUTE_MAX
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
            "progression.stats.attribute.cap_exceeded",
          message:
            "This Limited Stat Point grant would exceed the normal Base Attribute cap.",
          audience: "player",
          required:
            `result <= ${ATTRIBUTE_MAX}`,
          actual:
            newScore,
        },
      ],
    };
  }


  const updatedAttributes: Attributes = {
    ...attributes,

    [grant.attribute]:
      newScore,
  };


  const payload: LimitedStatPointGrantResult = {
    attributes:
      updatedAttributes,

    attribute:
      grant.attribute,

    amount:
      grant.amount,

    previousScore,

    newScore,
  };


  traceNode.output = {
    attribute:
      grant.attribute,

    amount:
      grant.amount,

    previousScore,

    newScore,
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