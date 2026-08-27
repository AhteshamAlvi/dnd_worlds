/*
 * Ten — the Nen principle of Aura containment.
 *
 * Ten is the passive Nen foundation that keeps Aura gathered around the body
 * instead of allowing it to dissipate freely.
 *
 * Ten is indefinitely maintainable from Mastery I onward.
 *
 * Ten does NOT determine how much Aura the character can actively force out.
 * Ren owns active Aura Output. Ten instead determines how much of the body's
 * Physiological Aura Output the character is capable of handling efficiently.
 *
 * Ten and Ren therefore measure different ceilings against the same
 * Physiological Aura Output Capacity:
 *
 *   Ten -> efficient containment
 *   Ren -> active Output access
 *
 * Aura produced through Ren above Ten's Containment Limit is not resolved
 * here. Ren owns the waste and diminishing-return consequences of forcing
 * Output beyond what Ten can efficiently contain.
 *
 * Ordinary passive Ten leakage is also separate from active Ren waste.
 * Imperfect Ten consumes part of the body's Aura Regeneration Capacity
 * replacing Aura that would otherwise leak away. It never drains Current Aura
 * by itself.
 *
 * This file owns:
 *
 * - Ten's I-X Mastery profile;
 * - Ten's DEX eligibility gates;
 * - Ten's containment fraction;
 * - Ten's Containment Limit;
 * - passive Ten leakage;
 * - Ten's replenishment multiplier.
 *
 * This file does NOT own:
 *
 * - active Aura Output;
 * - Ren endurance;
 * - Aura waste above the Ten Containment Limit;
 * - diminishing returns above the Ten Containment Limit;
 * - Aura Pool, Output, Regeneration, Control, Distribution, or Density math;
 * - final Aura Density -> physical reinforcement math;
 * - action-economy timing;
 * - Growth Point costs or breakthrough requirements;
 * - the universal Nen dependency graph or temporary mastery seals.
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

export interface TenMasteryProfile {
  readonly rank: MasteryRank;
  readonly minimumDex: number;
  readonly containmentFraction: number;
  readonly passiveLeakageFractionOfRegeneration: number;
}

export const TEN_MASTERY_PROFILES = {
  1: { rank: 1, minimumDex: 12, containmentFraction: 0.10, passiveLeakageFractionOfRegeneration: 1.00 },
  2: { rank: 2, minimumDex: 12, containmentFraction: 0.20, passiveLeakageFractionOfRegeneration: 0.80 },
  3: { rank: 3, minimumDex: 13, containmentFraction: 0.30, passiveLeakageFractionOfRegeneration: 0.60 },
  4: { rank: 4, minimumDex: 13, containmentFraction: 0.40, passiveLeakageFractionOfRegeneration: 0.45 },
  5: { rank: 5, minimumDex: 14, containmentFraction: 0.50, passiveLeakageFractionOfRegeneration: 0.30 },
  6: { rank: 6, minimumDex: 14, containmentFraction: 0.60, passiveLeakageFractionOfRegeneration: 0.20 },
  7: { rank: 7, minimumDex: 15, containmentFraction: 0.70, passiveLeakageFractionOfRegeneration: 0.125 },
  8: { rank: 8, minimumDex: 15, containmentFraction: 0.80, passiveLeakageFractionOfRegeneration: 0.075 },
  9: { rank: 9, minimumDex: 16, containmentFraction: 0.90, passiveLeakageFractionOfRegeneration: 0.025 },
  10: { rank: 10, minimumDex: 16, containmentFraction: 1.00, passiveLeakageFractionOfRegeneration: 0.00 },
} as const satisfies Readonly<Record<MasteryRank, TenMasteryProfile>>;

export const TEN_MASTERY_TRACK = {
  maximumMastery: STANDARD_MASTERY_MAX,
  ranks: MASTERY_RANKS.map((rank) => ({
    rank,
    description:
      rank === STANDARD_MASTERY_MAX
        ? "Perfect Aura containment: efficiently contain the body's full Physiological Aura Output while ordinary Ten causes no passive leakage."
        : `Efficiently contain up to ${rank * 10}% of Physiological Aura Output while progressively reducing passive Aura leakage.`,
  })),
} satisfies MasteryTrack;

export function getTenMasteryProfile(
  mastery: MasteryRank,
): TenMasteryProfile {
  return TEN_MASTERY_PROFILES[mastery];
}

export function deriveTenMinimumDex(
  mastery: MasteryRank,
): number {
  return TEN_MASTERY_PROFILES[mastery].minimumDex;
}

export function meetsTenDexRequirement(
  baseDex: number,
  mastery: MasteryRank,
): boolean {
  return (
    Number.isFinite(baseDex) &&
    baseDex >= deriveTenMinimumDex(mastery)
  );
}

/* -------------------------------------------------------------------------- */
/* Containment                                                                */
/* -------------------------------------------------------------------------- */

export interface TenContainment {
  readonly mastery: MasteryRank;
  readonly physiologicalOutput: number;
  readonly containmentFraction: number;
  readonly containmentLimit: number;
}

export function deriveTenContainmentFraction(
  mastery: MasteryRank,
): number {
  return TEN_MASTERY_PROFILES[mastery].containmentFraction;
}

export function resolveTenContainment(
  physiologicalOutput: number,
  mastery: number,
): EngineResult<TenContainment> {
  const traceNode = createTraceNode({
    id: "nen.ten.containment",
    label: "Resolve Ten containment",
    formula:
      "containmentLimit = physiologicalOutput * containmentFraction",
    inputs: {
      physiologicalOutput: {
        value: Number.isFinite(physiologicalOutput)
          ? physiologicalOutput
          : String(physiologicalOutput),
      },
      mastery: { value: mastery },
    },
  });

  if (
    !Number.isFinite(physiologicalOutput) ||
    physiologicalOutput < 0
  ) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ten.physiological_output.invalid",
          message:
            "Ten requires a finite non-negative Physiological Aura Output.",
          audience: "developer",
          required: "finite number >= 0",
          actual: Number.isFinite(physiologicalOutput)
            ? physiologicalOutput
            : String(physiologicalOutput),
        },
      ],
    };
  }

  if (!isMasteryRank(mastery)) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ten.mastery.invalid",
          message:
            "Ten mechanics require a learned Mastery rank from I through X.",
          audience: "developer",
          required: `integer from 1 through ${STANDARD_MASTERY_MAX}`,
          actual: mastery,
        },
      ],
    };
  }

  const containmentFraction =
    deriveTenContainmentFraction(mastery);

  const containmentLimit =
    physiologicalOutput * containmentFraction;

  const payload: TenContainment = {
    mastery,
    physiologicalOutput,
    containmentFraction,
    containmentLimit,
  };

  traceNode.output = {
    mastery,
    physiologicalOutput,
    containmentFraction,
    containmentLimit,
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Passive containment                                                        */
/* -------------------------------------------------------------------------- */

export interface TenPassiveContainment {
  readonly mastery: MasteryRank;
  readonly regenerationCapacityPerHour: number;
  readonly leakageFractionOfRegeneration: number;
  readonly passiveLeakagePerHour: number;
  readonly replenishmentMultiplier: number;
  readonly effectiveRegenerationPerHour: number;
}

export function resolveTenPassiveContainment(
  regenerationCapacityPerHour: number,
  mastery: number,
): EngineResult<TenPassiveContainment> {
  const traceNode = createTraceNode({
    id: "nen.ten.passive-containment",
    label: "Resolve passive Ten containment",
    formula:
      "passiveLeakage = regenerationCapacity * leakageFraction; effectiveRegeneration = regenerationCapacity - passiveLeakage",
    inputs: {
      regenerationCapacityPerHour: {
        value: Number.isFinite(regenerationCapacityPerHour)
          ? regenerationCapacityPerHour
          : String(regenerationCapacityPerHour),
      },
      mastery: { value: mastery },
    },
  });

  if (
    !Number.isFinite(regenerationCapacityPerHour) ||
    regenerationCapacityPerHour < 0
  ) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ten.regeneration.invalid",
          message:
            "Ten passive containment requires a finite non-negative Aura Regeneration Capacity.",
          audience: "developer",
          required: "finite number >= 0",
          actual: Number.isFinite(regenerationCapacityPerHour)
            ? regenerationCapacityPerHour
            : String(regenerationCapacityPerHour),
        },
      ],
    };
  }

  if (!isMasteryRank(mastery)) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ten.mastery.invalid",
          message:
            "Ten mechanics require a learned Mastery rank from I through X.",
          audience: "developer",
          required: `integer from 1 through ${STANDARD_MASTERY_MAX}`,
          actual: mastery,
        },
      ],
    };
  }

  const profile = TEN_MASTERY_PROFILES[mastery];

  const passiveLeakagePerHour =
    regenerationCapacityPerHour *
    profile.passiveLeakageFractionOfRegeneration;

  const replenishmentMultiplier =
    1 - profile.passiveLeakageFractionOfRegeneration;

  const effectiveRegenerationPerHour =
    regenerationCapacityPerHour *
    replenishmentMultiplier;

  const payload: TenPassiveContainment = {
    mastery,
    regenerationCapacityPerHour,
    leakageFractionOfRegeneration:
      profile.passiveLeakageFractionOfRegeneration,
    passiveLeakagePerHour,
    replenishmentMultiplier,
    effectiveRegenerationPerHour,
  };

  traceNode.output = {
    mastery,
    regenerationCapacityPerHour,
    leakageFractionOfRegeneration:
      payload.leakageFractionOfRegeneration,
    passiveLeakagePerHour,
    replenishmentMultiplier,
    effectiveRegenerationPerHour,
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}

export function deriveTenReplenishmentMultiplier(
  mastery: MasteryRank,
): number {
  return (
    1 -
    TEN_MASTERY_PROFILES[
      mastery
    ].passiveLeakageFractionOfRegeneration
  );
}
