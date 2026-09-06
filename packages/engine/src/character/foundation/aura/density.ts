/*
 * Aura density — how concentrated Aura is over the body it covers.
 *
 * Two placements, two Body measurements, two units:
 *
 *   Internal Aura Density = allocated Aura / covered Volume in litres
 *   Surface  Aura Density = allocated Aura / covered Surface Area in m2
 *
 * This replaces the "Surface Units" placeholder, which divided every
 * allocation by the constant 100 regardless of what body it was on. That
 * constant existed because Body had no area measurement to offer; it does now,
 * so the denominator is the character's actual anatomy and a Giant no longer
 * gets a human's density.
 *
 * Body is authoritative in square centimetres. The conversion to square metres
 * happens HERE and only here.
 */

import type { EngineResult } from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";
import {
  SQUARE_CENTIMETRES_PER_SQUARE_METRE,
  type InternalAuraDensity,
  type SurfaceAuraDensity,
} from "./types";


function invalidAura(aura: number): boolean {
  return !Number.isFinite(aura) || aura < 0;
}


/*
 * Aura per litre of covered body volume.
 *
 * A zero-volume denominator is rejected rather than returned as Infinity: Aura
 * inside a body that occupies no space is not an extreme reading, it is a
 * question about anatomy that does not exist.
 */
export function resolveInternalAuraDensity(
  aura: number,
  coveredVolumeL: number,
): EngineResult<InternalAuraDensity> {
  const traceNode = createTraceNode({
    id: "aura.density.internal",
    label: "Internal Aura density",
    formula: "auraPerLiter = aura / coveredVolumeL",
    inputs: {
      aura: { value: Number.isFinite(aura) ? aura : String(aura) },
      coveredVolumeL: {
        value: Number.isFinite(coveredVolumeL)
          ? coveredVolumeL
          : String(coveredVolumeL),
      },
    },
  });

  if (invalidAura(aura)) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [{
        code: "aura.density.aura.invalid",
        message: "Allocated Aura must be a finite non-negative number.",
        audience: "developer",
        required: "finite number >= 0",
        actual: Number.isFinite(aura) ? aura : String(aura),
      }],
    };
  }

  if (!Number.isFinite(coveredVolumeL) || coveredVolumeL <= 0) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [{
        code: "aura.density.volume.invalid",
        message: "Internal Aura density requires a positive covered volume.",
        audience: "developer",
        required: "finite number > 0",
        actual: Number.isFinite(coveredVolumeL)
          ? coveredVolumeL
          : String(coveredVolumeL),
      }],
    };
  }

  const auraPerLiter = aura / coveredVolumeL;

  traceNode.output = auraPerLiter;

  return {
    success: true,
    payload: { placement: "internal", auraPerLiter },
    trace: { root: traceNode },
    warnings: [],
  };
}


/*
 * Aura per square metre of covered body surface.
 *
 * Takes CENTIMETRES because that is what Body measures in, and converts once.
 * Callers that already hold square metres are doing the conversion twice.
 */
export function resolveSurfaceAuraDensity(
  aura: number,
  coveredSurfaceAreaCm2: number,
): EngineResult<SurfaceAuraDensity> {
  const traceNode = createTraceNode({
    id: "aura.density.surface",
    label: "Surface Aura density",
    formula:
      "auraPerSquareMeter = aura / (coveredSurfaceAreaCm2 / 10000)",
    inputs: {
      aura: { value: Number.isFinite(aura) ? aura : String(aura) },
      coveredSurfaceAreaCm2: {
        value: Number.isFinite(coveredSurfaceAreaCm2)
          ? coveredSurfaceAreaCm2
          : String(coveredSurfaceAreaCm2),
      },
    },
  });

  if (invalidAura(aura)) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [{
        code: "aura.density.aura.invalid",
        message: "Allocated Aura must be a finite non-negative number.",
        audience: "developer",
        required: "finite number >= 0",
        actual: Number.isFinite(aura) ? aura : String(aura),
      }],
    };
  }

  if (
    !Number.isFinite(coveredSurfaceAreaCm2) ||
    coveredSurfaceAreaCm2 <= 0
  ) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [{
        code: "aura.density.surface_area.invalid",
        message:
          "Surface Aura density requires a positive covered surface area.",
        audience: "developer",
        required: "finite number > 0",
        actual: Number.isFinite(coveredSurfaceAreaCm2)
          ? coveredSurfaceAreaCm2
          : String(coveredSurfaceAreaCm2),
      }],
    };
  }

  const surfaceAreaM2 =
    coveredSurfaceAreaCm2 / SQUARE_CENTIMETRES_PER_SQUARE_METRE;

  const auraPerSquareMeter = aura / surfaceAreaM2;

  traceNode.output = { surfaceAreaM2, auraPerSquareMeter };

  return {
    success: true,
    payload: { placement: "surface", auraPerSquareMeter },
    trace: { root: traceNode },
    warnings: [],
  };
}
