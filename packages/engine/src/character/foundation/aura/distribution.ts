/*
 * Whole-body Aura distribution.
 *
 * Version 1 distributes all active Aura across the entire body.
 */

import type { Body } from "../body/types";
import type { EngineResult } from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";
import { STANDARD_BODY_SURFACE_UNITS } from "../../../constants/surface-units";
import type {
  AuraDistribution,
  AuraOutput,
} from "./types";

export function distributeAura(
  output: AuraOutput,
  body: Body,
): EngineResult<AuraDistribution> {
  // TEMPORARY: Body no longer carries surfaceUnits (Surface Units were
  // removed — see character/foundation/body/types.ts). This constant is an
  // explicitly temporary placeholder pending a dedicated follow-up ticket
  // that redesigns Aura density around the new Body/Body-Points model — see
  // constants/surface-units.ts. `body` is kept as a parameter for signature
  // stability; it isn't consulted for this value today.
  const surfaceUnits = STANDARD_BODY_SURFACE_UNITS;

  const traceNode = createTraceNode({
    id: "aura.distribution.whole-body",
    label: "Whole-body Aura distribution",

    formula: "distributedAura = auraOutput",

    // The 100-vs-101 Surface Unit discrepancy in the Rulebook is resolved in
    // the decision log; the surfaceUnits input below is that decision made
    // concrete, so the node points at it.
    decisionId: "body.surface-units.total",

    inputs: {
      auraOutput: {
        value: output.usableMaximum,
      },

      surfaceUnits: {
        value: surfaceUnits,
      },
    },
  });

  if (!Number.isFinite(output.usableMaximum) || output.usableMaximum < 0) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.output.invalid",
          message: "Usable Aura Output must be a finite non-negative number.",
          audience: "player",
          required: "finite number >= 0",
          actual: Number.isFinite(output.usableMaximum)
            ? output.usableMaximum
            : String(output.usableMaximum),
        },
      ],
    };
  }

  const distribution: AuraDistribution = {
    aura: output.usableMaximum,
    surfaceUnits,
  };

  traceNode.output = {
    aura: distribution.aura,
    surfaceUnits: distribution.surfaceUnits,
  };

  return {
    success: true,
    payload: distribution,

    trace: {
      root: traceNode,
    },

    warnings: [],
  };
}