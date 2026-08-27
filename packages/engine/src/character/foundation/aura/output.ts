/*
 * Aura Output derivation.
 *
 * Aura Output is not manually set.
 *
 * CON determines the body's Physiological Aura Output Capacity.
 * Ren determines what fraction of that capacity can be consciously accessed.
 * Current Aura provides the final availability cap.
 *
 * Magnitude curve:
 *
 *   n = (CON - 10) / 5
 *
 *   M(CON) =
 *     50^n × 2^[n(n - 1) / 2]
 *
 * Physiological Output Capacity:
 *
 *   O_phys,raw = 2 × M(CON)
 *
 *   O_phys = R(O_phys,raw)
 *
 * Usable Aura Output:
 *
 *   Ren Accessible Output =
 *     O_phys × Ren Access Fraction
 *
 *   Usable Output =
 *     min(Current Aura, Ren Accessible Output)
 *
 * Ren Access Fraction is resolved by the Nen/Ren system and supplied here.
 */


import type { Attributes } from "../attributes/types";
import type { EngineResult } from "../../../infrastructure/result";
import { roundToOneSignificantFigure } from "../../../infrastructure/rounding";
import { createTraceNode } from "../../../infrastructure/trace";

import type {
  AuraOutput,
  AuraOutputLimit,
  AuraPool,
} from "./types";


/**
 * Derive the body's raw Physiological Aura Output Capacity from CON.
 *
 * n = (CON - 10) / 5
 *
 * M(CON) =
 *   50^n × 2^[n(n - 1) / 2]
 *
 * O_phys,raw =
 *   2 × M(CON)
 */
export function deriveRawAuraOutputLimit(
  attributes: Attributes,
): number {
  const n = (attributes.con - 10) / 5;

  return (
    2 *
    50 ** n *
    2 ** ((n * (n - 1)) / 2)
  );
}


/**
 * Derive the resolved Physiological Aura Output Capacity.
 *
 * Major derived Aura statistics are rounded to one significant figure.
 */
export function deriveAuraOutputLimit(
  attributes: Attributes,
): AuraOutputLimit {
  return {
    maximum: roundToOneSignificantFigure(
      deriveRawAuraOutputLimit(attributes),
    ),
  };
}


/**
 * Derive the character's currently usable Aura Output.
 *
 * renAccessFraction is supplied by the Nen/Ren system:
 *
 *   Ren I   = 0.10
 *   Ren II  = 0.20
 *   Ren III = 0.30
 *   ...
 *   Ren X   = 1.00
 *
 * This file does not derive Ren mastery or Ren access.
 */
export function deriveAuraOutput(
  attributes: Attributes,
  pool: AuraPool,
  renAccessFraction: number,
): EngineResult<AuraOutput> {
  const rawPhysiologicalMaximum =
    deriveRawAuraOutputLimit(attributes);

  const physiologicalMaximum =
    roundToOneSignificantFigure(
      rawPhysiologicalMaximum,
    );


  const traceNode = createTraceNode({
    id: "aura.output.derive",
    label: "Derive Aura Output",

    formula:
      "usableMaximum = min(currentAura, physiologicalMaximum * renAccessFraction)",

    inputs: {
      con: {
        value: attributes.con,
      },

      currentAura: {
        value: Number.isFinite(pool.current)
          ? pool.current
          : String(pool.current),
      },

      renAccessFraction: {
        value: Number.isFinite(renAccessFraction)
          ? renAccessFraction
          : String(renAccessFraction),
      },
    },
  });


  if (
    !Number.isFinite(physiologicalMaximum) ||
    physiologicalMaximum < 0
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.output.physiological_limit.invalid",
          message:
            "Derived Physiological Aura Output Capacity must be a finite non-negative number.",
          audience: "developer",
          required: "finite number >= 0",
          actual: Number.isFinite(physiologicalMaximum)
            ? physiologicalMaximum
            : String(physiologicalMaximum),
        },
      ],
    };
  }


  if (
    !Number.isFinite(renAccessFraction) ||
    renAccessFraction < 0 ||
    renAccessFraction > 1
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.output.ren_access.invalid",
          message:
            "Ren Access Fraction must be a finite number from 0 through 1.",
          audience: "developer",
          required: "finite number between 0 and 1",
          actual: Number.isFinite(renAccessFraction)
            ? renAccessFraction
            : String(renAccessFraction),
        },
      ],
    };
  }


  if (
    !Number.isFinite(pool.current) ||
    pool.current < 0
  ) {
    return {
      success: false,

      trace: {
        root: traceNode,
      },

      warnings: [],

      errors: [
        {
          code: "aura.output.current_aura.invalid",
          message:
            "Current Aura must be a finite non-negative number.",
          audience: "developer",
          required: "finite number >= 0",
          actual: Number.isFinite(pool.current)
            ? pool.current
            : String(pool.current),
        },
      ],
    };
  }


  const renAccessibleMaximum =
    physiologicalMaximum * renAccessFraction;

  const usableMaximum = Math.min(
    pool.current,
    renAccessibleMaximum,
  );


  const payload: AuraOutput = {
    physiologicalMaximum,
    renAccessibleMaximum,
    usableMaximum,
  };


  traceNode.output = {
    rawPhysiologicalMaximum,
    physiologicalMaximum,
    renAccessFraction,
    renAccessibleMaximum,
    currentAura: pool.current,
    usableMaximum,
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