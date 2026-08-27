/*
 * Aura density calculations.
 *
 * Density measures how much Aura occupies each Surface Unit.
 */

import type { EngineResult } from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";
import type {
  AuraDensity,
  AuraDistribution,
} from "./types";

export function calculateAuraDensity(
  distribution: AuraDistribution,
): EngineResult<AuraDensity> {
  const traceNode = createTraceNode({
    id: "aura.density",
    label: "Aura density",

    formula: "density = aura / surfaceUnits",

    inputs: {
      aura: {
        value: distribution.aura,
      },

      surfaceUnits: {
        value: distribution.surfaceUnits,
      },
    },
  });

  if (
    !Number.isFinite(distribution.surfaceUnits) ||
    distribution.surfaceUnits <= 0
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.surface_units.invalid",
          message: "Aura density requires a positive surface area.",
          audience: "developer",
          required: "finite number > 0",
          actual: Number.isFinite(distribution.surfaceUnits)
            ? distribution.surfaceUnits
            : String(distribution.surfaceUnits),
        },
      ],
    };
  }

  const density = distribution.aura / distribution.surfaceUnits;

  const payload: AuraDensity = {
    auraPerSurfaceUnit: density,
  };

  traceNode.output = density;

  return {
    success: true,
    payload,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}