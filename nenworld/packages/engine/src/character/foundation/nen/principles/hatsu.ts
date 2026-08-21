/*
 * Hatsu — the Nen principle of Aura expression.
 *
 * Hatsu governs the user's ability to express Aura as a supernatural effect.
 *
 * Unlike Ten, Ren, or Zetsu, Hatsu does not directly define a particular Aura
 * state. Instead, it acts as a universal effectiveness multiplier for effects
 * produced through Hatsu.
 *
 *
 * NEN ABILITY CREATION
 * --------------------
 *
 * Hatsu Mastery III is the minimum required to create a personal Nen Ability.
 *
 *   I-II  -> cannot create a personal Nen Ability
 *   III+  -> can create a personal Nen Ability
 *
 *
 * EFFECT MULTIPLIER
 * -----------------
 *
 * From Mastery III onward, Hatsu modifies the magnitude of eligible
 * Aura-produced effects.
 *
 *   III   -> -40% -> x0.60
 *   IV    -> -20% -> x0.80
 *   V     ->   0% -> x1.00
 *   VI    -> +20% -> x1.20
 *   VII   -> +40% -> x1.40
 *   VIII  -> +60% -> x1.60
 *   IX    -> +80% -> x1.80
 *   X     -> +100% -> x2.00
 *
 * Formula:
 *
 *   finalEffect =
 *     baseEffect
 *     * Hatsu multiplier
 *
 * The multiplier is intentionally generic.
 *
 * Hatsu does not need to know what the scaled value represents. The caller
 * determines whether a value is an eligible Hatsu-produced effect.
 *
 * The same multiplier may therefore be applied to any appropriate numeric
 * effect such as:
 *
 * - force;
 * - speed;
 * - damage;
 * - range;
 * - duration;
 * - strength;
 * - healing;
 * - size;
 * - capacity;
 * - other effect magnitudes.
 *
 * Costs, cooldowns, requirements, restrictions, and other non-effect values
 * are not automatically modified by Hatsu. The calling mechanic determines
 * which values constitute scalable effects.
 *
 *
 * This file owns:
 *
 * - Hatsu's I-X Mastery profile;
 * - the minimum Mastery for Nen Ability creation;
 * - Hatsu effect multipliers;
 * - generic Hatsu effect scaling.
 *
 * This file does NOT own:
 *
 * - Nen Ability definitions;
 * - individual effect definitions;
 * - Nen affinity/category efficiency;
 * - Aura costs;
 * - cooldowns;
 * - restrictions or vows;
 * - the universal Nen dependency graph;
 * - cross-Principle compatibility;
 * - Growth Point costs or breakthrough requirements.
 *
 * The generic Mastery vocabulary lives in capabilities/mastery.ts.
 * Universal Nen structure lives in ../nen.ts.
 */


import type { EngineResult } from "../../../../infrastructure/result";
import { createTraceNode } from "../../../../infrastructure/trace";

import {
  isMasteryRank,
  MASTERY_RANKS,
  STANDARD_MASTERY_MAX,
  type MasteryRank,
  type MasteryTrack,
} from "../../../capabilities/mastery";


/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Minimum Hatsu Mastery required to create a personal Nen Ability and access
 * the universal Hatsu effect multiplier.
 */
export const HATSU_EFFECT_MINIMUM_MASTERY: MasteryRank = 3;


/* -------------------------------------------------------------------------- */
/* Mastery                                                                    */
/* -------------------------------------------------------------------------- */

export interface HatsuMasteryProfile {
  readonly rank: MasteryRank;

  /**
   * Whether this Mastery rank permits creation of a personal Nen Ability.
   */
  readonly canCreateNenAbility: boolean;

  /**
   * Additive percentage adjustment represented as a decimal.
   *
   * Examples:
   *
   *   -0.40 -> -40%
   *    0.00 ->   0%
   *    1.00 -> +100%
   *
   * Null means the Hatsu effect multiplier has not yet been unlocked.
   */
  readonly effectModifier: number | null;

  /**
   * Final multiplier applied to eligible Hatsu-produced effects.
   *
   * Null means the multiplier has not yet been unlocked.
   */
  readonly effectMultiplier: number | null;
}


export const HATSU_MASTERY_PROFILES = {
  1: {
    rank: 1,
    canCreateNenAbility: false,
    effectModifier: null,
    effectMultiplier: null,
  },

  2: {
    rank: 2,
    canCreateNenAbility: false,
    effectModifier: null,
    effectMultiplier: null,
  },

  3: {
    rank: 3,
    canCreateNenAbility: true,
    effectModifier: -0.40,
    effectMultiplier: 0.60,
  },

  4: {
    rank: 4,
    canCreateNenAbility: true,
    effectModifier: -0.20,
    effectMultiplier: 0.80,
  },

  5: {
    rank: 5,
    canCreateNenAbility: true,
    effectModifier: 0.00,
    effectMultiplier: 1.00,
  },

  6: {
    rank: 6,
    canCreateNenAbility: true,
    effectModifier: 0.20,
    effectMultiplier: 1.20,
  },

  7: {
    rank: 7,
    canCreateNenAbility: true,
    effectModifier: 0.40,
    effectMultiplier: 1.40,
  },

  8: {
    rank: 8,
    canCreateNenAbility: true,
    effectModifier: 0.60,
    effectMultiplier: 1.60,
  },

  9: {
    rank: 9,
    canCreateNenAbility: true,
    effectModifier: 0.80,
    effectMultiplier: 1.80,
  },

  10: {
    rank: 10,
    canCreateNenAbility: true,
    effectModifier: 1.00,
    effectMultiplier: 2.00,
  },
} as const satisfies Readonly<
  Record<MasteryRank, HatsuMasteryProfile>
>;


/*
 * No Hatsu-specific attribute gate has been finalized.
 *
 * If Hatsu later receives an attribute requirement, that progression should
 * be added deliberately rather than inferred from another Nen Principle.
 */
export const HATSU_MASTERY_TRACK = {
  maximumMastery: STANDARD_MASTERY_MAX,

  ranks: MASTERY_RANKS.map((rank) => {
    const profile =
      HATSU_MASTERY_PROFILES[rank];

    if (profile.effectMultiplier === null) {
      return {
        rank,
        description:
          "Develop Hatsu proficiency. Personal Nen Ability creation and the Hatsu effect multiplier unlock at Mastery III.",
      };
    }

    const percent =
      profile.effectModifier === null
        ? 0
        : Math.round(profile.effectModifier * 100);

    const signedPercent =
      percent > 0
        ? `+${percent}%`
        : `${percent}%`;

    return {
      rank,
      description:
        `Hatsu-produced effects resolve at ${profile.effectMultiplier}x effectiveness (${signedPercent}).`,
    };
  }),
} satisfies MasteryTrack;


/**
 * Return Hatsu's complete mechanical profile for one learned Mastery rank.
 */
export function getHatsuMasteryProfile(
  mastery: MasteryRank,
): HatsuMasteryProfile {
  return HATSU_MASTERY_PROFILES[mastery];
}


/* -------------------------------------------------------------------------- */
/* Nen Ability creation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Return whether a Hatsu Mastery rank is sufficient to create a personal
 * Nen Ability.
 */
export function canCreateNenAbilityWithHatsu(
  mastery: MasteryRank,
): boolean {
  return mastery >= HATSU_EFFECT_MINIMUM_MASTERY;
}


/* -------------------------------------------------------------------------- */
/* Effect multiplier                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Return Hatsu's universal effect multiplier.
 *
 * Hatsu I-II have not yet unlocked effect scaling and therefore return null.
 *
 * The caller decides whether the value being scaled is an eligible
 * Aura-produced effect.
 */
export function deriveHatsuEffectMultiplier(
  mastery: MasteryRank,
): number | null {
  return (
    HATSU_MASTERY_PROFILES[
      mastery
    ].effectMultiplier
  );
}


/**
 * Return Hatsu's additive percentage modifier.
 *
 * Examples:
 *
 *   Hatsu III -> -0.40
 *   Hatsu V   ->  0.00
 *   Hatsu X   ->  1.00
 *
 * Hatsu I-II return null because effect scaling has not yet been unlocked.
 */
export function deriveHatsuEffectModifier(
  mastery: MasteryRank,
): number | null {
  return (
    HATSU_MASTERY_PROFILES[
      mastery
    ].effectModifier
  );
}


/* -------------------------------------------------------------------------- */
/* Generic effect scaling                                                     */
/* -------------------------------------------------------------------------- */

export interface HatsuScaledEffect {
  readonly mastery: MasteryRank;

  /**
   * Numeric effect magnitude before Hatsu scaling.
   */
  readonly baseEffect: number;

  /**
   * Hatsu's additive percentage modifier.
   */
  readonly effectModifier: number;

  /**
   * Hatsu's multiplicative scaling factor.
   */
  readonly effectMultiplier: number;

  /**
   * Final numeric effect magnitude after Hatsu scaling.
   */
  readonly finalEffect: number;
}


/**
 * Apply Hatsu's universal multiplier to one eligible numeric effect.
 *
 * Formula:
 *
 *   finalEffect =
 *     baseEffect
 *     * effectMultiplier
 *
 * This function intentionally has no knowledge of what `baseEffect`
 * represents.
 *
 * The caller is responsible for deciding that the supplied value is an effect
 * which Hatsu is allowed to modify.
 */
export function applyHatsuEffectMultiplier(
  baseEffect: number,
  mastery: number,
): EngineResult<HatsuScaledEffect> {
  const traceNode = createTraceNode({
    id: "nen.hatsu.effect",
    label: "Apply Hatsu effect multiplier",

    formula:
      "finalEffect = baseEffect * Hatsu effectMultiplier",

    inputs: {
      baseEffect: {
        value:
          Number.isFinite(baseEffect)
            ? baseEffect
            : String(baseEffect),
      },

      mastery: {
        value: mastery,
      },
    },
  });


  if (!Number.isFinite(baseEffect)) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code:
            "nen.hatsu.effect.invalid",
          message:
            "Hatsu effect scaling requires a finite numeric base effect.",
          audience: "developer",
          required: "finite number",
          actual: String(baseEffect),
        },
      ],
    };
  }


  if (!isMasteryRank(mastery)) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code:
            "nen.hatsu.mastery.invalid",
          message:
            "Hatsu mechanics require a learned Mastery rank from I through X.",
          audience: "developer",
          required:
            `integer from 1 through ${STANDARD_MASTERY_MAX}`,
          actual: mastery,
        },
      ],
    };
  }


  const profile =
    getHatsuMasteryProfile(mastery);


  if (
    profile.effectMultiplier === null ||
    profile.effectModifier === null
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
            "nen.hatsu.effect.locked",
          message:
            "The Hatsu effect multiplier requires Hatsu Mastery III or higher.",
          audience: "developer",
          required:
            `Hatsu Mastery ${HATSU_EFFECT_MINIMUM_MASTERY} or higher`,
          actual: mastery,
        },
      ],
    };
  }


  const finalEffect =
    baseEffect *
    profile.effectMultiplier;


  const payload: HatsuScaledEffect = {
    mastery,

    baseEffect,

    effectModifier:
      profile.effectModifier,

    effectMultiplier:
      profile.effectMultiplier,

    finalEffect,
  };


  traceNode.output = {
    mastery,

    baseEffect,

    effectModifier:
      payload.effectModifier,

    effectMultiplier:
      payload.effectMultiplier,

    finalEffect:
      payload.finalEffect,
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