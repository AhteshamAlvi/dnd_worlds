/*
 * Aura replenishment.
 *
 * Aura Regeneration Capacity is derived directly from VIT and represents
 * the maximum quantity of depleted Aura the body can restore per hour.
 *
 * Replenishment cannot increase Current Aura beyond Maximum Aura.
 */

import type { Attributes } from "../attributes/types";
import type { EngineResult } from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";
import type { AuraPool } from "./types";

function roundToOneSignificantFigure(value: number): number {
  if (value === 0) {
    return 0;
  }

  const magnitude =
    10 ** Math.floor(Math.log10(Math.abs(value)));

  return Math.round(value / magnitude) * magnitude;
}

/**
 * Derive the body's raw Aura Regeneration Capacity from VIT.
 *
 * n = (VIT - 10) / 5
 *
 * Regeneration = 50^n × 2^[n(n - 1) / 2]
 *
 * The resulting value is Aura restored per hour.
 */
export function deriveRawAuraRegeneration(
  attributes: Attributes,
): number {
  const n = (attributes.vit - 10) / 5;

  return (
    50 ** n *
    2 ** ((n * (n - 1)) / 2)
  );
}

/**
 * Derive the resolved Aura Regeneration Capacity.
 *
 * The result is rounded to one significant figure and represents
 * the maximum amount of Aura the body can replenish per hour.
 */
export function deriveAuraRegeneration(
  attributes: Attributes,
): number {
  return roundToOneSignificantFigure(
    deriveRawAuraRegeneration(attributes),
  );
}

/**
 * Replenish Current Aura over a specified number of hours.
 *
 * Replenishment is capped at the amount of Aura actually missing,
 * so Current Aura can never exceed Maximum Aura.
 */
export function replenishAura(
  pool: AuraPool,
  attributes: Attributes,
  hours: number,
): EngineResult<AuraPool> {
  const rawRegeneration =
    deriveRawAuraRegeneration(attributes);

  const regenerationPerHour =
    roundToOneSignificantFigure(rawRegeneration);

  const traceNode = createTraceNode({
    id: "aura.replenishment.apply",
    label: "Replenish Aura",

    formula:
      "recoveredAura = min(maximumAura - currentAura, regenerationPerHour * hours)",

    inputs: {
      vit: {
        value: attributes.vit,
      },

      currentAura: {
        value: Number.isFinite(pool.current)
          ? pool.current
          : String(pool.current),
      },

      maximumAura: {
        value: Number.isFinite(pool.maximum)
          ? pool.maximum
          : String(pool.maximum),
      },

      hours: {
        value: Number.isFinite(hours)
          ? hours
          : String(hours),
      },
    },
  });

  if (
    !Number.isFinite(regenerationPerHour) ||
    regenerationPerHour < 0
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.replenishment.rate.invalid",
          message:
            "Derived Aura Regeneration must be a finite non-negative number.",
          audience: "developer",
          required: "finite number >= 0",
          actual: Number.isFinite(regenerationPerHour)
            ? regenerationPerHour
            : String(regenerationPerHour),
        },
      ],
    };
  }

  if (!Number.isFinite(hours) || hours < 0) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.replenishment.duration.invalid",
          message:
            "Aura replenishment duration must be a finite non-negative number of hours.",
          audience: "player",
          required: "finite number >= 0",
          actual: Number.isFinite(hours)
            ? hours
            : String(hours),
        },
      ],
    };
  }

  if (
    !Number.isFinite(pool.current) ||
    !Number.isFinite(pool.maximum) ||
    pool.current < 0 ||
    pool.maximum < 0 ||
    pool.current > pool.maximum
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.replenishment.pool.invalid",
          message:
            "Aura cannot be replenished from an invalid Aura Pool.",
          audience: "developer",
          required:
            "0 <= current Aura <= maximum Aura",
          actual: {
            current: pool.current,
            maximum: pool.maximum,
          },
        },
      ],
    };
  }

  const missingAura =
    pool.maximum - pool.current;

  const possibleRecovery =
    regenerationPerHour * hours;

  const recoveredAura = Math.min(
    missingAura,
    possibleRecovery,
  );

  const replenishedPool: AuraPool = {
    current: pool.current + recoveredAura,
    maximum: pool.maximum,
  };

  traceNode.output = {
    rawRegeneration,
    regenerationPerHour,
    missingAura,
    possibleRecovery,
    recoveredAura,
    currentAura: replenishedPool.current,
  };

  return {
    success: true,
    payload: replenishedPool,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}