/*
 * Aura Control and expenditure efficiency.
 *
 * Aura Control is not a stored or independently leveled statistic.
 * It is derived directly from DEX whenever Aura is actually expended.
 *
 * Control affects Aura expenditure/cost only.
 *
 * It does NOT affect:
 *
 * - Maximum Aura Pool
 * - Aura Output
 * - Aura Distribution
 * - Aura Density
 * - what a Nen principle is capable of doing
 * - whether a character meets a mastery requirement
 *
 *
 * CONTROL INTERPRETATION
 * ----------------------
 *
 * DEX < 25:
 *   Imperfect Aura control.
 *   Some Aura is wasted, so the character spends more Aura than the
 *   application fundamentally requires.
 *
 * DEX = 25:
 *   Perfect Aura control.
 *   No Aura is wasted.
 *
 * DEX > 25:
 *   Superhuman Aura control.
 *   Aura is applied with such precision that the same effect can be achieved
 *   using less Aura than would normally be required.
 *
 *
 * FORMULA
 * -------
 *
 * Let:
 *
 *   x = (DEX - 25) / 5
 *
 * Then:
 *
 *   Raw Control Multiplier =
 *
 *   e^(
 *     -0.00850107x^4
 *     -0.14447086x^3
 *     -0.54024269x^2
 *     -0.91622329x
 *   )
 *
 * The resolved Control Multiplier is rounded to one decimal place.
 *
 *
 * Important resolved values:
 *
 *   DEX 7  = x5.0 cost
 *   DEX 10 = x3.0 cost
 *   DEX 25 = x1.0 cost
 *   DEX 26 = x0.8 cost
 *   DEX 27 = x0.6 cost
 *   DEX 28 = x0.5 cost
 *   DEX 29 = x0.3 cost
 *   DEX 30 = x0.2 cost
 *
 *
 * Final Aura Cost =
 *
 *   Base Aura Cost × Control Multiplier
 *
 * The multiplier is rounded, but Final Aura Cost is not.
 * Fractional Aura expenditure remains precise internally.
 */


import type { EngineResult } from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";

import type { AuraExpenditure } from "./types";


const MIN_CONTROL_DEX = 7;
const MAX_CONTROL_DEX = 30;


/**
 * Round the resolved Aura Control multiplier to one decimal place.
 *
 * Examples:
 *
 *   0.813... -> 0.8
 *   0.629... -> 0.6
 *   0.460... -> 0.5
 */
function roundAuraControlMultiplier(
  value: number,
): number {
  return Math.round(value * 10) / 10;
}


/**
 * Derive the raw Aura Control cost multiplier directly from DEX.
 *
 * This function performs the mathematical derivation only.
 * Validation of the supported DEX range is handled by the public functions.
 */
export function deriveRawAuraControlMultiplier(
  dex: number,
): number {
  const x = (dex - 25) / 5;

  return Math.exp(
    -0.00850107 * x ** 4
    -0.14447086 * x ** 3
    -0.54024269 * x ** 2
    -0.91622329 * x
  );
}


/**
 * Derive the resolved Aura Control multiplier from DEX.
 *
 * DEX 0-6 cannot perform deliberate controlled Aura expenditure.
 *
 * The resolved multiplier is rounded to one decimal place.
 */
export function deriveAuraControlMultiplier(
  dex: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id: "aura.control.multiplier",
    label: "Derive Aura Control multiplier",

    formula:
      "controlMultiplier = round1decimal(exp(-0.00850107*x^4 - 0.14447086*x^3 - 0.54024269*x^2 - 0.91622329*x)), x = (DEX - 25) / 5",

    inputs: {
      dex: {
        value: Number.isFinite(dex)
          ? dex
          : String(dex),
      },
    },
  });


  if (
    !Number.isFinite(dex) ||
    !Number.isInteger(dex)
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.control.dex.invalid",
          message:
            "DEX must be a finite integer to derive Aura Control.",
          audience: "developer",
          required: "finite integer",
          actual: Number.isFinite(dex)
            ? dex
            : String(dex),
        },
      ],
    };
  }


  if (dex < MIN_CONTROL_DEX) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.control.dex.insufficient",
          message:
            "DEX is too low for deliberate controlled Aura expenditure.",
          audience: "player",
          required: `DEX >= ${MIN_CONTROL_DEX}`,
          actual: dex,
        },
      ],
    };
  }


  if (dex > MAX_CONTROL_DEX) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.control.dex.unsupported",
          message:
            "Aura Control scaling above DEX 30 has not been defined.",
          audience: "developer",
          required: `DEX <= ${MAX_CONTROL_DEX}`,
          actual: dex,
        },
      ],
    };
  }


  const rawMultiplier =
    deriveRawAuraControlMultiplier(dex);


  const multiplier =
    roundAuraControlMultiplier(
      rawMultiplier,
    );


  traceNode.output = {
    dex,
    rawMultiplier,
    multiplier,
  };


  return {
    success: true,
    payload: multiplier,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}


/**
 * Apply DEX-derived Aura Control to a Base Aura Cost.
 *
 * Base Aura Cost is determined by whatever Nen principle, Nen Ability,
 * action, or other mechanic is producing the expenditure.
 *
 * Aura Control then determines how much Aura is actually deducted from
 * Current Aura.
 *
 *
 * Examples:
 *
 *   Base Cost 100, DEX 10:
 *
 *     100 × 3.0 = 300 Aura spent
 *
 *
 *   Base Cost 100, DEX 25:
 *
 *     100 × 1.0 = 100 Aura spent
 *
 *
 *   Base Cost 100, DEX 28:
 *
 *     100 × 0.5 = 50 Aura spent
 *
 *
 *   Base Cost 100, DEX 30:
 *
 *     100 × 0.2 = 20 Aura spent
 */
export function deriveAuraExpenditure(
  baseCost: number,
  dex: number,
): EngineResult<AuraExpenditure> {
  const traceNode = createTraceNode({
    id: "aura.control.expenditure",
    label: "Derive Aura expenditure",

    formula:
      "finalCost = baseCost * controlMultiplier",

    inputs: {
      baseCost: {
        value: Number.isFinite(baseCost)
          ? baseCost
          : String(baseCost),
      },

      dex: {
        value: Number.isFinite(dex)
          ? dex
          : String(dex),
      },
    },
  });


  if (
    !Number.isFinite(baseCost) ||
    baseCost < 0
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.control.base_cost.invalid",
          message:
            "Base Aura Cost must be a finite non-negative number.",
          audience: "developer",
          required: "finite number >= 0",
          actual: Number.isFinite(baseCost)
            ? baseCost
            : String(baseCost),
        },
      ],
    };
  }


  if (
    !Number.isFinite(dex) ||
    !Number.isInteger(dex)
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.control.dex.invalid",
          message:
            "DEX must be a finite integer to derive Aura expenditure.",
          audience: "developer",
          required: "finite integer",
          actual: Number.isFinite(dex)
            ? dex
            : String(dex),
        },
      ],
    };
  }


  if (dex < MIN_CONTROL_DEX) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.control.dex.insufficient",
          message:
            "DEX is too low for deliberate controlled Aura expenditure.",
          audience: "player",
          required: `DEX >= ${MIN_CONTROL_DEX}`,
          actual: dex,
        },
      ],
    };
  }


  if (dex > MAX_CONTROL_DEX) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.control.dex.unsupported",
          message:
            "Aura Control scaling above DEX 30 has not been defined.",
          audience: "developer",
          required: `DEX <= ${MAX_CONTROL_DEX}`,
          actual: dex,
        },
      ],
    };
  }


  const rawMultiplier =
    deriveRawAuraControlMultiplier(dex);


  const controlMultiplier =
    roundAuraControlMultiplier(
      rawMultiplier,
    );


  /*
   * Final Aura Cost is deliberately not rounded.
   *
   * Fractional Aura expenditure must remain precise internally,
   * especially for continuous-time Nen upkeep.
   */
  const finalCost =
    baseCost * controlMultiplier;


  const payload: AuraExpenditure = {
    baseCost,
    controlMultiplier,
    finalCost,
  };


  traceNode.output = {
    baseCost,
    dex,
    rawMultiplier,
    controlMultiplier,
    finalCost,

    /*
     * Positive:
     *   Additional Aura spent because of imperfect control.
     *
     * Zero:
     *   Perfect Aura control.
     *
     * Negative:
     *   Aura saved through superhuman control.
     */
    costDifference:
      finalCost - baseCost,
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