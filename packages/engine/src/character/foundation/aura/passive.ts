/*
 * Passive internal Aura — what an unawakened body does with its own reserve.
 *
 * An unawakened character's Aura nodes are half-open. They cannot project Aura
 * deliberately, but they are not inert: a fraction of the reserve sits inside
 * the body and reinforces it continuously, which is why an ordinary person can
 * take a fall that would break a body with no Aura at all.
 *
 * Three things about it are easy to get wrong, and this file exists to settle
 * all three.
 *
 * IT IS NOT OUTPUT. Physiological Output is what a body can force out through
 * open nodes, and half-open nodes cannot. Pseudo-Chu therefore consumes no
 * Output capacity and competes with nothing for it. Modelling it as an Output
 * trickle would give an unawakened character a spending budget they do not
 * have, and would make awakening look like a loss of capacity rather than a
 * change of kind.
 *
 * THE 20% IS A CONVERSION EFFICIENCY, NOT A COST. Nothing is deducted for it.
 * The reinforcement is drawn from the reserve continuously, so it weakens as
 * the character is drained and strengthens as they recover — a character at
 * half Aura is half as reinforced, without ever having spent anything.
 *
 * IT ENDS AT AWAKENING. Open nodes stop producing it, and nothing replaces it:
 * an awakened character's internal Density is zero until an access override
 * explicitly permits internal placement. There is no transition to run; the
 * effect simply is not resolved for an awakened character.
 *
 * Final Chu and reinforcement STRENGTH are not calculated here. What is
 * produced is the effective Aura, what it covers, the Volume it covers, and
 * the internal Density that follows — exactly what that later resolver needs.
 */

import type { EngineResult } from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";
import type { Anatomy } from "../body/anatomy/types";
import type { ResolvedBodyMeasurements } from "../body/measurements/types";

import { resolveAuraDistribution } from "./distribution";
import type {
  PassiveInternalReinforcement,
  ResolvedInternalAuraAllocation,
  ResolvedPassiveInternalAura,
} from "./types";


/** The single stored allocation id passive internal Aura resolves under. */
export const PSEUDO_CHU_ALLOCATION_ID = "unawakened-pseudo-chu";


export interface ResolvePassiveInternalAuraInput {
  readonly currentAura: number;
  readonly reinforcement: PassiveInternalReinforcement;
  readonly anatomy: Anatomy;
  readonly measurements: ResolvedBodyMeasurements;
}


/**
 * Spread an unawakened character's passive internal Aura through their body.
 *
 *   effectiveAura = Current Aura x efficiency
 *   A_i           = effectiveAura x (V_i / V_total)
 *   rho_i         = A_i / V_i
 *
 * Dividing by Volume is what makes the resulting Density equal everywhere
 * rather than merely equal per part. A Hand and a Leg holding the same Aura
 * would be a Hand reinforced fourteen times as hard.
 *
 * The expansion itself is resolveAuraDistribution's, deliberately. Whole-body
 * coverage over present anatomy is one problem with one answer, and a second
 * implementation here would be the one that forgot about suppressed limbs.
 * What this function does NOT reuse is the Output accounting: the ceiling
 * handed down is the effective Aura itself, because pseudo-Chu is not spending
 * Output and there is no budget for it to exceed.
 */
export function resolvePassiveInternalAura(
  input: ResolvePassiveInternalAuraInput,
): EngineResult<ResolvedPassiveInternalAura> {
  const { currentAura, reinforcement } = input;

  const traceNode = createTraceNode({
    id: "aura.passive.internal",
    label: "Resolve passive internal Aura",
    formula:
      "effectiveAura = currentAura * efficiency; A_i = effectiveAura * (V_i / V_total)",

    decisionId: "aura.unawakened.pseudo-chu-from-current-aura",
    inputs: {
      currentAura: {
        value: Number.isFinite(currentAura) ? currentAura : String(currentAura),
      },
      efficiency: { value: reinforcement.efficiency },
      source: { value: reinforcement.source },
    },
  });

  if (!Number.isFinite(currentAura) || currentAura < 0) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [{
        code: "aura.passive.current_aura.invalid",
        message:
          "Passive internal Aura requires a finite non-negative Current Aura.",
        audience: "developer",
        required: "finite number >= 0",
        actual: Number.isFinite(currentAura) ? currentAura : String(currentAura),
      }],
    };
  }

  const effectiveAura = currentAura * reinforcement.efficiency;

  const placed = resolveAuraDistribution({
    allocations: [],
    automatic: [{
      id: PSEUDO_CHU_ALLOCATION_ID,
      source: reinforcement.source,
      coverage: "whole-body",
      placement: "internal",
      aura: effectiveAura,
    }],
    anatomy: input.anatomy,
    measurements: input.measurements,
    availableOutput: effectiveAura,
  });

  if (!placed.success) {
    traceNode.output = false;
    traceNode.children = [placed.trace.root];

    return {
      success: false,
      trace: { root: traceNode },
      warnings: placed.warnings,
      errors: placed.errors,
    };
  }

  /*
   * Narrowing rather than casting. Only one internal whole-body allocation was
   * submitted, so everything that came back is internal — but a filter that
   * says so is a filter that stays correct if that ever stops being true.
   */
  const allocations = placed.payload.distribution.allocations.filter(
    (allocation): allocation is ResolvedInternalAuraAllocation =>
      allocation.placement === "internal",
  );

  const payload: ResolvedPassiveInternalAura = {
    source: reinforcement.source,
    efficiency: reinforcement.efficiency,
    sourceAura: currentAura,
    effectiveAura,
    allocations,
  };

  traceNode.output = {
    sourceAura: currentAura,
    efficiency: reinforcement.efficiency,
    effectiveAura,
    coveredParts: allocations.length,
    totalVolumeL: input.measurements.totalVolumeL,
  };
  traceNode.children = [placed.trace.root];

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: placed.warnings,
  };
}
