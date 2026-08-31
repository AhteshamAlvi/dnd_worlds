/*
 * Zetsu — the Nen principle of Aura suppression.
 *
 * Zetsu closes the user's Aura nodes and suppresses active Aura flow.
 *
 * While ordinary Zetsu is active:
 *
 *   Active Aura Output = 0
 *
 * This is true at every learned Mastery rank.
 *
 * Zetsu does not reduce or alter the character's underlying:
 *
 * - Maximum Aura;
 * - Physiological Aura Output Capacity;
 * - Aura Regeneration Capacity;
 * - Ten Mastery;
 * - Ren Mastery;
 * - other learned Nen Mastery.
 *
 * It suppresses the current active Aura state rather than changing the
 * character's underlying capacities.
 *
 * Ordinary Zetsu is indefinitely maintainable from Mastery I onward.
 *
 *
 * REPLENISHMENT
 * -------------
 *
 * Suppressing active Aura flow allows Aura to replenish more effectively.
 *
 * Mastery increases the multiplier applied to normal Aura Regeneration
 * Capacity:
 *
 *   I     -> x1.00
 *   II    -> x1.25
 *   III   -> x1.50
 *   IV    -> x1.75
 *   V     -> x2.00
 *   VI    -> x2.50
 *   VII   -> x3.00
 *   VIII  -> x3.50
 *   IX    -> x4.00
 *   X     -> x5.00
 *
 *
 * AURA CONCEALMENT
 * ----------------
 *
 * Zetsu suppresses the supernatural presence produced by Aura and Life Force.
 *
 * It therefore contributes a situational bonus to Concealment against aura
 * detection specifically — not to the character's Concealment score itself.
 *
 * Mastery progression:
 *
 *   I     -> +1
 *   II    -> +1
 *   III   -> +1
 *   IV    -> +2
 *   V     -> +2
 *   VI    -> +3
 *   VII   -> +3
 *   VIII  -> +4
 *   IX    -> +4
 *   X     -> +5
 *
 * Zetsu does not create a special Detection check.
 *
 * Aura Concealment is the ordinary Concealment Derived Attribute — round((DEX
 * + WIS) / 2), converted to a standard modifier the same way every other
 * score is — with Zetsu's Mastery-based value layered on top as a situational
 * modifier, the same shape a Trait's modifyCheck Effect produces. See
 * rules/resolution.ts's resolveCheckModifier for where the two are added.
 *
 * The value is derived from Mastery rather than authored as an Effect, so it
 * is not currently wired through the Effect pipeline; a caller resolving an
 * aura-concealment check supplies it alongside whatever check modifiers the
 * character's content contributed. Formalizing that connection waits on the
 * Detection/Concealment mechanics being rebuilt.
 *
 * Zetsu does NOT conceal ordinary physical presence through:
 *
 * - sight;
 * - hearing;
 * - smell;
 * - taste;
 * - touch;
 * - physical tracks;
 * - heat;
 * - other ordinary evidence.
 *
 *
 * COMPATIBILITY
 * -------------
 *
 * Ordinary Zetsu is incompatible with ordinary active Ten and Ren.
 *
 * Those rules do NOT belong here. Cross-Principle runtime compatibility will
 * be owned centrally by Nen compatibility mechanics.
 *
 *
 * This file owns:
 *
 * - Zetsu's I-X Mastery profile;
 * - Active Aura Output suppression;
 * - Zetsu replenishment multipliers;
 * - Zetsu Aura Concealment modifiers.
 *
 * This file does NOT own:
 *
 * - the universal Nen dependency graph or temporary seals;
 * - cross-Principle compatibility;
 * - Aura Pool derivation;
 * - Physiological Aura Output derivation;
 * - Aura Regeneration Capacity derivation;
 * - Detection or Concealment rolls;
 * - Detection contest resolution;
 * - ordinary physical concealment;
 * - Growth Point costs or breakthrough requirements;
 * - action-economy timing.
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
/* Mastery                                                                    */
/* -------------------------------------------------------------------------- */

export interface ZetsuMasteryProfile {
  readonly rank: MasteryRank;

  /*
   * Multiplier applied to normal Aura Regeneration Capacity while Zetsu is
   * active.
   */
  readonly replenishmentMultiplier: number;

  /*
   * Sense-specific bonus contributed to Aura Concealment.
   *
   * DEX and WIS are deliberately not included here. They remain inputs to the
   * generic Concealment mechanic.
   */
  readonly auraConcealmentModifier: number;
}


export const ZETSU_MASTERY_PROFILES = {
  1: {
    rank: 1,
    replenishmentMultiplier: 1.00,
    auraConcealmentModifier: 1,
  },

  2: {
    rank: 2,
    replenishmentMultiplier: 1.25,
    auraConcealmentModifier: 1,
  },

  3: {
    rank: 3,
    replenishmentMultiplier: 1.50,
    auraConcealmentModifier: 1,
  },

  4: {
    rank: 4,
    replenishmentMultiplier: 1.75,
    auraConcealmentModifier: 2,
  },

  5: {
    rank: 5,
    replenishmentMultiplier: 2.00,
    auraConcealmentModifier: 2,
  },

  6: {
    rank: 6,
    replenishmentMultiplier: 2.50,
    auraConcealmentModifier: 3,
  },

  7: {
    rank: 7,
    replenishmentMultiplier: 3.00,
    auraConcealmentModifier: 3,
  },

  8: {
    rank: 8,
    replenishmentMultiplier: 3.50,
    auraConcealmentModifier: 4,
  },

  9: {
    rank: 9,
    replenishmentMultiplier: 4.00,
    auraConcealmentModifier: 4,
  },

  10: {
    rank: 10,
    replenishmentMultiplier: 5.00,
    auraConcealmentModifier: 5,
  },
} as const satisfies Readonly<
  Record<MasteryRank, ZetsuMasteryProfile>
>;


/*
 * No Zetsu-specific attribute gate has been finalized.
 *
 * Do not invent one merely for symmetry with Ten's DEX requirement or Ren's
 * CON requirement. If Zetsu later receives an attribute requirement, that
 * progression belongs here.
 */
export const ZETSU_MASTERY_TRACK = {
  maximumMastery: STANDARD_MASTERY_MAX,

  ranks: MASTERY_RANKS.map((rank) => {
    const profile =
      ZETSU_MASTERY_PROFILES[rank];

    return {
      rank,

      description:
        rank === STANDARD_MASTERY_MAX
          ? "Perfect Zetsu: suppress Active Aura Output to zero, replenish Aura at 5x normal capacity, and gain +5 Aura Concealment."
          : `Suppress Active Aura Output to zero, replenish Aura at ${profile.replenishmentMultiplier}x normal capacity, and gain +${profile.auraConcealmentModifier} Aura Concealment.`,
    };
  }),
} satisfies MasteryTrack;


/**
 * Return Zetsu's complete mechanical profile for one learned Mastery rank.
 */
export function getZetsuMasteryProfile(
  mastery: MasteryRank,
): ZetsuMasteryProfile {
  return ZETSU_MASTERY_PROFILES[mastery];
}


/* -------------------------------------------------------------------------- */
/* Aura suppression                                                           */
/* -------------------------------------------------------------------------- */

export interface ZetsuSuppression {
  readonly mastery: MasteryRank;

  /*
   * Active Aura Output immediately before Zetsu suppression.
   *
   * This is retained for diagnostics and tracing. Zetsu does not modify the
   * character's underlying Physiological Aura Output Capacity.
   */
  readonly previousActiveAuraOutput: number;

  /*
   * Amount of active Output suppressed by entering Zetsu.
   */
  readonly suppressedAuraOutput: number;

  /*
   * Zetsu's defining mechanical state.
   *
   * Every learned Zetsu rank forces Active Aura Output to zero.
   */
  readonly activeAuraOutput: 0;
}


/**
 * Suppress the character's currently Active Aura Output.
 *
 * Formula:
 *
 *   activeAuraOutputAfterZetsu = 0
 *
 * Zetsu affects the active state only. It does not alter the body's
 * Physiological Aura Output Capacity.
 */
export function resolveZetsuSuppression(
  activeAuraOutput: number,
  mastery: number,
): EngineResult<ZetsuSuppression> {
  const traceNode = createTraceNode({
    id: "nen.zetsu.suppression",
    label: "Resolve Zetsu Aura suppression",

    formula:
      "activeAuraOutputAfterZetsu = 0",

    inputs: {
      activeAuraOutput: {
        value: Number.isFinite(activeAuraOutput)
          ? activeAuraOutput
          : String(activeAuraOutput),
      },

      mastery: {
        value: mastery,
      },
    },
  });


  if (
    !Number.isFinite(activeAuraOutput) ||
    activeAuraOutput < 0
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
            "nen.zetsu.active_output.invalid",
          message:
            "Zetsu suppression requires finite non-negative Active Aura Output.",
          audience: "developer",
          required: "finite number >= 0",
          actual:
            Number.isFinite(activeAuraOutput)
              ? activeAuraOutput
              : String(activeAuraOutput),
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
            "nen.zetsu.mastery.invalid",
          message:
            "Zetsu mechanics require a learned Mastery rank from I through X.",
          audience: "developer",
          required:
            `integer from 1 through ${STANDARD_MASTERY_MAX}`,
          actual: mastery,
        },
      ],
    };
  }


  const payload: ZetsuSuppression = {
    mastery,

    previousActiveAuraOutput:
      activeAuraOutput,

    suppressedAuraOutput:
      activeAuraOutput,

    activeAuraOutput: 0,
  };


  traceNode.output = {
    mastery,

    previousActiveAuraOutput:
      payload.previousActiveAuraOutput,

    suppressedAuraOutput:
      payload.suppressedAuraOutput,

    activeAuraOutput:
      payload.activeAuraOutput,
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


/* -------------------------------------------------------------------------- */
/* Replenishment                                                              */
/* -------------------------------------------------------------------------- */

export interface ZetsuReplenishment {
  readonly mastery: MasteryRank;

  readonly regenerationCapacityPerHour: number;

  readonly replenishmentMultiplier: number;

  readonly effectiveRegenerationPerHour: number;
}


/**
 * Return the multiplier applied to normal Aura Regeneration Capacity while
 * Zetsu is active.
 */
export function deriveZetsuReplenishmentMultiplier(
  mastery: MasteryRank,
): number {
  return (
    ZETSU_MASTERY_PROFILES[
      mastery
    ].replenishmentMultiplier
  );
}


/**
 * Resolve Aura replenishment while Zetsu is active.
 *
 * Formula:
 *
 *   effectiveRegeneration =
 *     regenerationCapacity
 *     * replenishmentMultiplier
 *
 * Zetsu I therefore restores Aura at the character's normal regeneration
 * rate, while Zetsu X restores Aura at five times that rate.
 */
export function resolveZetsuReplenishment(
  regenerationCapacityPerHour: number,
  mastery: number,
): EngineResult<ZetsuReplenishment> {
  const traceNode = createTraceNode({
    id: "nen.zetsu.replenishment",
    label: "Resolve Zetsu replenishment",

    formula:
      "effectiveRegeneration = regenerationCapacity * replenishmentMultiplier",

    inputs: {
      regenerationCapacityPerHour: {
        value:
          Number.isFinite(
            regenerationCapacityPerHour,
          )
            ? regenerationCapacityPerHour
            : String(
                regenerationCapacityPerHour,
              ),
      },

      mastery: {
        value: mastery,
      },
    },
  });


  if (
    !Number.isFinite(
      regenerationCapacityPerHour,
    ) ||
    regenerationCapacityPerHour < 0
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
            "nen.zetsu.regeneration.invalid",
          message:
            "Zetsu replenishment requires a finite non-negative Aura Regeneration Capacity.",
          audience: "developer",
          required: "finite number >= 0",
          actual:
            Number.isFinite(
              regenerationCapacityPerHour,
            )
              ? regenerationCapacityPerHour
              : String(
                  regenerationCapacityPerHour,
                ),
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
            "nen.zetsu.mastery.invalid",
          message:
            "Zetsu mechanics require a learned Mastery rank from I through X.",
          audience: "developer",
          required:
            `integer from 1 through ${STANDARD_MASTERY_MAX}`,
          actual: mastery,
        },
      ],
    };
  }


  const replenishmentMultiplier =
    deriveZetsuReplenishmentMultiplier(
      mastery,
    );

  const effectiveRegenerationPerHour =
    regenerationCapacityPerHour *
    replenishmentMultiplier;


  const payload: ZetsuReplenishment = {
    mastery,

    regenerationCapacityPerHour,

    replenishmentMultiplier,

    effectiveRegenerationPerHour,
  };


  traceNode.output = {
    mastery,

    regenerationCapacityPerHour,

    replenishmentMultiplier,

    effectiveRegenerationPerHour,
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


/* -------------------------------------------------------------------------- */
/* Aura Concealment                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Return Zetsu's sense-specific Aura Concealment modifier.
 *
 * A situational modifier, in the same sense as a modifyCheck Effect: it is
 * added when an aura-concealment check is resolved, and never becomes part of
 * the character's Concealment score.
 *
 * It does not include DEX or WIS — those reach the check through the
 * Concealment Derived Attribute's own standard modifier.
 *
 * Zetsu contributes nothing to Sight, Hearing, Smell, Taste, or Touch
 * Concealment.
 */
export function deriveZetsuAuraConcealmentModifier(
  mastery: MasteryRank,
): number {
  return (
    ZETSU_MASTERY_PROFILES[
      mastery
    ].auraConcealmentModifier
  );
}


/* -------------------------------------------------------------------------- */
/* Combined Zetsu state                                                       */
/* -------------------------------------------------------------------------- */

export interface ZetsuResolution {
  readonly mastery: MasteryRank;

  /*
   * Ordinary Zetsu has no duration limit.
   */
  readonly indefinitelyMaintainable: true;

  readonly suppression: ZetsuSuppression;

  readonly replenishment: ZetsuReplenishment;

  /*
   * Modifier contributed specifically to Aura Concealment.
   *
   * The generic Detection subsystem remains responsible for constructing and
   * resolving the actual Concealment check.
   */
  readonly auraConcealmentModifier: number;
}


/**
 * Resolve the direct mechanical effects of active Zetsu.
 *
 * This resolves:
 *
 * - Active Aura Output suppression;
 * - Aura replenishment;
 * - Aura Concealment contribution.
 *
 * It does not:
 *
 * - roll Concealment;
 * - resolve Detection;
 * - apply the modifier directly to a Detection profile;
 * - enforce Ten/Ren/Zetsu compatibility.
 */
export function resolveZetsu(
  activeAuraOutput: number,
  regenerationCapacityPerHour: number,
  mastery: number,
): EngineResult<ZetsuResolution> {
  const traceNode = createTraceNode({
    id: "nen.zetsu.resolve",
    label: "Resolve active Zetsu",

    formula:
      "activeAuraOutput = 0; effectiveRegeneration = regenerationCapacity * replenishmentMultiplier; apply Aura Concealment modifier",

    inputs: {
      activeAuraOutput: {
        value:
          Number.isFinite(activeAuraOutput)
            ? activeAuraOutput
            : String(activeAuraOutput),
      },

      regenerationCapacityPerHour: {
        value:
          Number.isFinite(
            regenerationCapacityPerHour,
          )
            ? regenerationCapacityPerHour
            : String(
                regenerationCapacityPerHour,
              ),
      },

      mastery: {
        value: mastery,
      },
    },
  });


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
            "nen.zetsu.mastery.invalid",
          message:
            "Zetsu mechanics require a learned Mastery rank from I through X.",
          audience: "developer",
          required:
            `integer from 1 through ${STANDARD_MASTERY_MAX}`,
          actual: mastery,
        },
      ],
    };
  }


  if (
    !Number.isFinite(activeAuraOutput) ||
    activeAuraOutput < 0
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
            "nen.zetsu.active_output.invalid",
          message:
            "Zetsu requires finite non-negative Active Aura Output.",
          audience: "developer",
          required: "finite number >= 0",
          actual:
            Number.isFinite(activeAuraOutput)
              ? activeAuraOutput
              : String(activeAuraOutput),
        },
      ],
    };
  }


  if (
    !Number.isFinite(
      regenerationCapacityPerHour,
    ) ||
    regenerationCapacityPerHour < 0
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
            "nen.zetsu.regeneration.invalid",
          message:
            "Zetsu requires a finite non-negative Aura Regeneration Capacity.",
          audience: "developer",
          required: "finite number >= 0",
          actual:
            Number.isFinite(
              regenerationCapacityPerHour,
            )
              ? regenerationCapacityPerHour
              : String(
                  regenerationCapacityPerHour,
                ),
        },
      ],
    };
  }


  /*
   * Mastery and numeric inputs have already been validated above, so these
   * child resolutions are expected to succeed. Calling the dedicated
   * functions keeps their formulas authoritative rather than duplicating the
   * calculations here.
   */
  const suppressionResult =
    resolveZetsuSuppression(
      activeAuraOutput,
      mastery,
    );

  const replenishmentResult =
    resolveZetsuReplenishment(
      regenerationCapacityPerHour,
      mastery,
    );


  if (
    !suppressionResult.success ||
    !replenishmentResult.success
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
            "nen.zetsu.resolution.failed",
          message:
            "Zetsu child resolution failed after validated inputs.",
          audience: "developer",
          actual: {
            suppressionSuccess:
              suppressionResult.success,

            replenishmentSuccess:
              replenishmentResult.success,
          },
        },
      ],
    };
  }


  const auraConcealmentModifier =
    deriveZetsuAuraConcealmentModifier(
      mastery,
    );


  const payload: ZetsuResolution = {
    mastery,

    indefinitelyMaintainable: true,

    suppression:
      suppressionResult.payload,

    replenishment:
      replenishmentResult.payload,

    auraConcealmentModifier,
  };


  traceNode.output = {
    mastery,

    indefinitelyMaintainable: true,

    previousActiveAuraOutput:
      payload.suppression
        .previousActiveAuraOutput,

    activeAuraOutput:
      payload.suppression
        .activeAuraOutput,

    replenishmentMultiplier:
      payload.replenishment
        .replenishmentMultiplier,

    effectiveRegenerationPerHour:
      payload.replenishment
        .effectiveRegenerationPerHour,

    auraConcealmentModifier,
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