/*
 * Aura-pool derivation and validation.
 *
 * Maximum Aura is derived directly from CON and VIT.
 * Current Aura is stored state and may not exceed the derived maximum.
 */

import type { Attributes } from "../attributes/types";
import type { EngineError } from "../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import { roundToOneSignificantFigure } from "../../../infrastructure/rounding";
import { createTraceNode } from "../../../infrastructure/trace";
import type { AuraPool } from "./types";

export function deriveRawMaximumAura(
  attributes: Attributes,
): number {
  const { con, vit } = attributes;

  return (
    10 *
    50 ** ((con + vit - 20) / 10) *
    2 ** (((con + vit - 20) * (con + vit - 30)) / 200)
  );
}

export function deriveMaximumAura(
  attributes: Attributes,
): number {
  return roundToOneSignificantFigure(
    deriveRawMaximumAura(attributes),
  );
}

export function validateAuraPool(
  current: number,
  attributes: Attributes,
): EngineResult<AuraPool> {
  const errors: EngineError[] = [];

  const rawMaximum = deriveRawMaximumAura(attributes);
  const maximum = roundToOneSignificantFigure(rawMaximum);

  const traceNode = createTraceNode({
    id: "aura.pool.validate",
    label: "Derive and validate Aura pool",

    inputs: {
      con: {
        value: attributes.con,
      },

      vit: {
        value: attributes.vit,
      },

      current: {
        value: Number.isFinite(current)
          ? current
          : String(current),
      },
    },
  });

  if (!Number.isFinite(current) || current < 0) {
    errors.push({
      code: "aura.pool.current.invalid",
      message: "Current Aura must be a finite non-negative number.",
      audience: "player",
      required: "finite number >= 0",
      actual: Number.isFinite(current)
        ? current
        : String(current),
    });
  }

  if (
    Number.isFinite(current) &&
    current > maximum
  ) {
    errors.push({
      code: "aura.pool.current.exceeds_maximum",
      message: "Current Aura cannot exceed Maximum Aura.",
      audience: "player",
      required: maximum,
      actual: current,
    });
  }

  traceNode.output = {
    rawMaximum,
    maximum,
    valid: errors.length === 0,
  };

  if (errors.length > 0) {
    return {
      success: false,
      trace: {
        root: traceNode,
      },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  }

  return {
    success: true,
    payload: {
      current,
      maximum,
    },
    trace: {
      root: traceNode,
    },
    warnings: [],
  };
}