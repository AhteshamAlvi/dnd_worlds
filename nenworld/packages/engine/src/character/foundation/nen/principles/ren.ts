/*
 * Ren — the Nen principle of active Aura Output.
 *
 * Ren deliberately raises Aura Output toward the body's Physiological Aura
 * Output Capacity.
 *
 * Ten and Ren measure different ceilings against that same physiological
 * maximum:
 *
 *   Ten -> how much Output can be handled efficiently
 *   Ren -> how much Output can be actively produced
 *
 * Ren owns the active runtime problem:
 *
 * - how much Physiological Aura Output Mastery makes accessible;
 * - whether a chosen Output is legal;
 * - how hard that chosen Output strains Ren;
 * - how long that level of Ren can be maintained;
 * - what happens when Ren produces more Output than Ten can efficiently
 *   contain.
 *
 * Ren Mastery is based on CON.
 *
 * Ren I-X grants 10%-100% access to Physiological Aura Output.
 *
 * Unlike Ten, Ren normally has finite endurance. Lower chosen Output consumes
 * that endurance more slowly. Mastery X removes the Ren endurance limit
 * entirely.
 *
 * Producing Output above Ten's Containment Limit remains legal if it is still
 * within Ren's Output Limit. The mismatch causes Aura waste and diminishing
 * effective returns.
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

import type { AuraOutput } from "../../aura/types";

/* -------------------------------------------------------------------------- */
/* Mastery                                                                    */
/* -------------------------------------------------------------------------- */

export interface RenMasteryProfile {
  readonly rank: MasteryRank;
  readonly minimumCon: number;
  readonly accessFraction: number;

  /*
   * Minutes this rank can sustain its own maximum accessible Output.
   * null means unlimited.
   */
  readonly fullOutputDurationMinutes: number | null;
}

export const REN_MASTERY_PROFILES = {
  1: { rank: 1, minimumCon: 12, accessFraction: 0.10, fullOutputDurationMinutes: 1 },
  2: { rank: 2, minimumCon: 12, accessFraction: 0.20, fullOutputDurationMinutes: 2 },
  3: { rank: 3, minimumCon: 13, accessFraction: 0.30, fullOutputDurationMinutes: 5 },
  4: { rank: 4, minimumCon: 13, accessFraction: 0.40, fullOutputDurationMinutes: 10 },
  5: { rank: 5, minimumCon: 14, accessFraction: 0.50, fullOutputDurationMinutes: 20 },
  6: { rank: 6, minimumCon: 14, accessFraction: 0.60, fullOutputDurationMinutes: 30 },
  7: { rank: 7, minimumCon: 15, accessFraction: 0.70, fullOutputDurationMinutes: 60 },
  8: { rank: 8, minimumCon: 15, accessFraction: 0.80, fullOutputDurationMinutes: 120 },
  9: { rank: 9, minimumCon: 16, accessFraction: 0.90, fullOutputDurationMinutes: 240 },
  10: { rank: 10, minimumCon: 16, accessFraction: 1.00, fullOutputDurationMinutes: null },
} as const satisfies Readonly<Record<MasteryRank, RenMasteryProfile>>;

export const REN_MASTERY_TRACK = {
  maximumMastery: STANDARD_MASTERY_MAX,
  ranks: MASTERY_RANKS.map((rank) => ({
    rank,
    description:
      rank === STANDARD_MASTERY_MAX
        ? "Access and indefinitely sustain the body's full Physiological Aura Output, subject to Ten efficiency and available Aura."
        : `Actively access up to ${rank * 10}% of Physiological Aura Output with increasing sustained-output endurance.`,
  })),
} satisfies MasteryTrack;

export function getRenMasteryProfile(
  mastery: MasteryRank,
): RenMasteryProfile {
  return REN_MASTERY_PROFILES[mastery];
}

export function deriveRenMinimumCon(
  mastery: MasteryRank,
): number {
  return REN_MASTERY_PROFILES[mastery].minimumCon;
}

export function meetsRenConRequirement(
  baseCon: number,
  mastery: MasteryRank,
): boolean {
  return (
    Number.isFinite(baseCon) &&
    baseCon >= deriveRenMinimumCon(mastery)
  );
}

/* -------------------------------------------------------------------------- */
/* Output access                                                              */
/* -------------------------------------------------------------------------- */

export interface RenOutputLimit {
  readonly mastery: MasteryRank;
  readonly physiologicalOutput: number;
  readonly accessFraction: number;
  readonly outputLimit: number;
}

export function deriveRenAccessFraction(
  mastery: MasteryRank,
): number {
  return REN_MASTERY_PROFILES[mastery].accessFraction;
}

export function resolveRenOutputLimit(
  physiologicalOutput: number,
  mastery: number,
): EngineResult<RenOutputLimit> {
  const traceNode = createTraceNode({
    id: "nen.ren.output-limit",
    label: "Resolve Ren Output limit",
    formula:
      "outputLimit = physiologicalOutput * accessFraction",
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
          code: "nen.ren.physiological_output.invalid",
          message:
            "Ren requires a finite non-negative Physiological Aura Output.",
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
          code: "nen.ren.mastery.invalid",
          message:
            "Ren mechanics require a learned Mastery rank from I through X.",
          audience: "developer",
          required: `integer from 1 through ${STANDARD_MASTERY_MAX}`,
          actual: mastery,
        },
      ],
    };
  }

  const accessFraction =
    deriveRenAccessFraction(mastery);

  const outputLimit =
    physiologicalOutput * accessFraction;

  const payload: RenOutputLimit = {
    mastery,
    physiologicalOutput,
    accessFraction,
    outputLimit,
  };

  traceNode.output = {
    mastery,
    physiologicalOutput,
    accessFraction,
    outputLimit,
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Endurance                                                                  */
/* -------------------------------------------------------------------------- */

export interface RenEndurance {
  readonly mastery: MasteryRank;
  readonly outputLimit: number;
  readonly chosenOutput: number;
  readonly renLoad: number;
  readonly fullOutputDurationMinutes: number | null;
  readonly maximumMaintenanceMinutes: number | null;
}

export function resolveRenEndurance(
  outputLimit: number,
  chosenOutput: number,
  mastery: number,
): EngineResult<RenEndurance> {
  const traceNode = createTraceNode({
    id: "nen.ren.endurance",
    label: "Resolve Ren endurance",
    formula:
      "renLoad = chosenOutput / outputLimit; maximumMaintenance = fullOutputDuration / renLoad",
    inputs: {
      outputLimit: {
        value: Number.isFinite(outputLimit)
          ? outputLimit
          : String(outputLimit),
      },
      chosenOutput: {
        value: Number.isFinite(chosenOutput)
          ? chosenOutput
          : String(chosenOutput),
      },
      mastery: { value: mastery },
    },
  });

  if (
    !Number.isFinite(outputLimit) ||
    outputLimit < 0
  ) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ren.output_limit.invalid",
          message:
            "Ren endurance requires a finite non-negative Output Limit.",
          audience: "developer",
          required: "finite number >= 0",
          actual: Number.isFinite(outputLimit)
            ? outputLimit
            : String(outputLimit),
        },
      ],
    };
  }

  if (
    !Number.isFinite(chosenOutput) ||
    chosenOutput < 0
  ) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ren.chosen_output.invalid",
          message:
            "Chosen Ren Output must be a finite non-negative number.",
          audience: "player",
          required: "finite number >= 0",
          actual: Number.isFinite(chosenOutput)
            ? chosenOutput
            : String(chosenOutput),
        },
      ],
    };
  }

  if (chosenOutput > outputLimit) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ren.output_limit.exceeded",
          message:
            "Chosen Ren Output cannot exceed the character's current Ren Output Limit.",
          audience: "player",
          required: { maximumOutput: outputLimit },
          actual: { chosenOutput },
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
          code: "nen.ren.mastery.invalid",
          message:
            "Ren mechanics require a learned Mastery rank from I through X.",
          audience: "developer",
          required: `integer from 1 through ${STANDARD_MASTERY_MAX}`,
          actual: mastery,
        },
      ],
    };
  }

  const profile = REN_MASTERY_PROFILES[mastery];

  const renLoad =
    outputLimit > 0
      ? chosenOutput / outputLimit
      : 0;

  const maximumMaintenanceMinutes =
    chosenOutput === 0 ||
    profile.fullOutputDurationMinutes === null
      ? null
      : profile.fullOutputDurationMinutes / renLoad;

  const payload: RenEndurance = {
    mastery,
    outputLimit,
    chosenOutput,
    renLoad,
    fullOutputDurationMinutes:
      profile.fullOutputDurationMinutes,
    maximumMaintenanceMinutes,
  };

  traceNode.output = {
    mastery,
    outputLimit,
    chosenOutput,
    renLoad,
    fullOutputDurationMinutes:
      profile.fullOutputDurationMinutes,
    maximumMaintenanceMinutes:
      maximumMaintenanceMinutes ?? "unlimited",
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}

export function deriveRenExertionMinutes(
  renLoad: number,
  elapsedMinutes: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id: "nen.ren.exertion",
    label: "Derive Ren exertion",
    formula:
      "exertionMinutes = renLoad * elapsedMinutes",
    inputs: {
      renLoad: {
        value: Number.isFinite(renLoad)
          ? renLoad
          : String(renLoad),
      },
      elapsedMinutes: {
        value: Number.isFinite(elapsedMinutes)
          ? elapsedMinutes
          : String(elapsedMinutes),
      },
    },
  });

  if (
    !Number.isFinite(renLoad) ||
    renLoad < 0 ||
    renLoad > 1
  ) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ren.load.invalid",
          message:
            "Ren Load must be a finite number from 0 through 1.",
          audience: "developer",
          required: "finite number between 0 and 1",
          actual: Number.isFinite(renLoad)
            ? renLoad
            : String(renLoad),
        },
      ],
    };
  }

  if (
    !Number.isFinite(elapsedMinutes) ||
    elapsedMinutes < 0
  ) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ren.duration.invalid",
          message:
            "Ren exertion duration must be a finite non-negative number of minutes.",
          audience: "player",
          required: "finite number >= 0",
          actual: Number.isFinite(elapsedMinutes)
            ? elapsedMinutes
            : String(elapsedMinutes),
        },
      ],
    };
  }

  const exertionMinutes =
    renLoad * elapsedMinutes;

  traceNode.output = {
    renLoad,
    elapsedMinutes,
    exertionMinutes,
  };

  return {
    success: true,
    payload: exertionMinutes,
    trace: { root: traceNode },
    warnings: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Ten mismatch                                                               */
/* -------------------------------------------------------------------------- */

export interface RenContainmentEfficiency {
  readonly chosenOutput: number;
  readonly tenContainmentLimit: number;
  readonly efficientlyHandledOutput: number;
  readonly inefficientOutput: number;
  readonly containmentOverloadRatio: number;
  readonly auraWastePerMinute: number;
  readonly effectiveOutput: number;
  readonly isBeyondTenContainment: boolean;
}

export function resolveRenContainmentEfficiency(
  chosenOutput: number,
  tenContainmentLimit: number,
): EngineResult<RenContainmentEfficiency> {
  const traceNode = createTraceNode({
    id: "nen.ren.containment-efficiency",
    label: "Resolve Ren containment efficiency",
    formula:
      "inefficientOutput = max(0, chosenOutput - tenContainmentLimit); auraWastePerMinute = inefficientOutput^2 / tenContainmentLimit",
    inputs: {
      chosenOutput: {
        value: Number.isFinite(chosenOutput)
          ? chosenOutput
          : String(chosenOutput),
      },
      tenContainmentLimit: {
        value: Number.isFinite(tenContainmentLimit)
          ? tenContainmentLimit
          : String(tenContainmentLimit),
      },
    },
  });

  if (
    !Number.isFinite(chosenOutput) ||
    chosenOutput < 0
  ) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ren.chosen_output.invalid",
          message:
            "Chosen Ren Output must be a finite non-negative number.",
          audience: "player",
          required: "finite number >= 0",
          actual: Number.isFinite(chosenOutput)
            ? chosenOutput
            : String(chosenOutput),
        },
      ],
    };
  }

  if (
    !Number.isFinite(tenContainmentLimit) ||
    tenContainmentLimit < 0
  ) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ren.ten_containment.invalid",
          message:
            "Ren containment efficiency requires a finite non-negative Ten Containment Limit.",
          audience: "developer",
          required: "finite number >= 0",
          actual: Number.isFinite(tenContainmentLimit)
            ? tenContainmentLimit
            : String(tenContainmentLimit),
        },
      ],
    };
  }

  const efficientlyHandledOutput =
    Math.min(chosenOutput, tenContainmentLimit);

  const inefficientOutput =
    Math.max(0, chosenOutput - tenContainmentLimit);

  if (
    inefficientOutput > 0 &&
    tenContainmentLimit === 0
  ) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code:
            "nen.ren.ten_containment.absent",
          message:
            "Active Ren Output cannot be resolved without any Ten containment capacity.",
          audience: "developer",
          required:
            "positive Ten Containment Limit before producing active Ren Output",
          actual: {
            chosenOutput,
            tenContainmentLimit,
          },
        },
      ],
    };
  }

  const containmentOverloadRatio =
    tenContainmentLimit > 0
      ? inefficientOutput / tenContainmentLimit
      : 0;

  const auraWastePerMinute =
    inefficientOutput > 0
      ? inefficientOutput ** 2 / tenContainmentLimit
      : 0;

  const effectiveOutput =
    inefficientOutput > 0
      ? (
          tenContainmentLimit +
          inefficientOutput /
            (1 + containmentOverloadRatio)
        )
      : chosenOutput;

  const payload: RenContainmentEfficiency = {
    chosenOutput,
    tenContainmentLimit,
    efficientlyHandledOutput,
    inefficientOutput,
    containmentOverloadRatio,
    auraWastePerMinute,
    effectiveOutput,
    isBeyondTenContainment:
      inefficientOutput > 0,
  };

  traceNode.output = {
    chosenOutput,
    tenContainmentLimit,
    efficientlyHandledOutput,
    inefficientOutput,
    containmentOverloadRatio,
    auraWastePerMinute,
    effectiveOutput,
    isBeyondTenContainment:
      payload.isBeyondTenContainment,
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}

export function deriveRenContainmentAuraLoss(
  efficiency: RenContainmentEfficiency,
  minutes: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id: "nen.ren.containment-aura-loss",
    label: "Derive Ren containment Aura loss",
    formula:
      "auraLoss = auraWastePerMinute * minutes",
    inputs: {
      auraWastePerMinute: {
        value: Number.isFinite(efficiency.auraWastePerMinute)
          ? efficiency.auraWastePerMinute
          : String(efficiency.auraWastePerMinute),
      },
      minutes: {
        value: Number.isFinite(minutes)
          ? minutes
          : String(minutes),
      },
    },
  });

  if (
    !Number.isFinite(efficiency.auraWastePerMinute) ||
    efficiency.auraWastePerMinute < 0
  ) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ren.aura_waste.invalid",
          message:
            "Ren Aura waste must be a finite non-negative rate.",
          audience: "developer",
          required: "finite number >= 0",
          actual: Number.isFinite(efficiency.auraWastePerMinute)
            ? efficiency.auraWastePerMinute
            : String(efficiency.auraWastePerMinute),
        },
      ],
    };
  }

  if (
    !Number.isFinite(minutes) ||
    minutes < 0
  ) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ren.duration.invalid",
          message:
            "Ren Aura-loss duration must be a finite non-negative number of minutes.",
          audience: "player",
          required: "finite number >= 0",
          actual: Number.isFinite(minutes)
            ? minutes
            : String(minutes),
        },
      ],
    };
  }

  const auraLoss =
    efficiency.auraWastePerMinute * minutes;

  traceNode.output = {
    auraWastePerMinute:
      efficiency.auraWastePerMinute,
    minutes,
    auraLoss,
  };

  return {
    success: true,
    payload: auraLoss,
    trace: { root: traceNode },
    warnings: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Combined runtime resolution                                                */
/* -------------------------------------------------------------------------- */

export interface RenResolution {
  readonly mastery: MasteryRank;
  readonly physiologicalOutput: number;
  readonly accessFraction: number;
  readonly renAccessibleMaximum: number;
  readonly usableMaximum: number;
  readonly chosenOutput: number;
  readonly endurance: RenEndurance;
  readonly containment: RenContainmentEfficiency;
}

export function resolveRen(
  output: AuraOutput,
  tenContainmentLimit: number,
  chosenOutput: number,
  mastery: number,
): EngineResult<RenResolution> {
  const traceNode = createTraceNode({
    id: "nen.ren.resolve",
    label: "Resolve active Ren",
    formula:
      "chosenOutput <= usableMaximum; resolve endurance; compare chosenOutput against Ten containment",
    inputs: {
      physiologicalOutput: {
        value: Number.isFinite(output.physiologicalMaximum)
          ? output.physiologicalMaximum
          : String(output.physiologicalMaximum),
      },
      renAccessibleMaximum: {
        value: Number.isFinite(output.renAccessibleMaximum)
          ? output.renAccessibleMaximum
          : String(output.renAccessibleMaximum),
      },
      usableMaximum: {
        value: Number.isFinite(output.usableMaximum)
          ? output.usableMaximum
          : String(output.usableMaximum),
      },
      tenContainmentLimit: {
        value: Number.isFinite(tenContainmentLimit)
          ? tenContainmentLimit
          : String(tenContainmentLimit),
      },
      chosenOutput: {
        value: Number.isFinite(chosenOutput)
          ? chosenOutput
          : String(chosenOutput),
      },
      mastery: { value: mastery },
    },
  });

  if (!isMasteryRank(mastery)) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ren.mastery.invalid",
          message:
            "Ren mechanics require a learned Mastery rank from I through X.",
          audience: "developer",
          required: `integer from 1 through ${STANDARD_MASTERY_MAX}`,
          actual: mastery,
        },
      ],
    };
  }

  if (
    !Number.isFinite(chosenOutput) ||
    chosenOutput < 0 ||
    chosenOutput > output.usableMaximum
  ) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "nen.ren.chosen_output.invalid",
          message:
            "Chosen Ren Output must be finite, non-negative, and no greater than current Usable Aura Output.",
          audience: "player",
          required: {
            minimum: 0,
            maximum: output.usableMaximum,
          },
          actual: Number.isFinite(chosenOutput)
            ? chosenOutput
            : String(chosenOutput),
        },
      ],
    };
  }

  const enduranceResult =
    resolveRenEndurance(
      output.renAccessibleMaximum,
      chosenOutput,
      mastery,
    );

  if (!enduranceResult.success) {
    return enduranceResult;
  }

  const containmentResult =
    resolveRenContainmentEfficiency(
      chosenOutput,
      tenContainmentLimit,
    );

  if (!containmentResult.success) {
    return containmentResult;
  }

  const accessFraction =
    deriveRenAccessFraction(mastery);

  const payload: RenResolution = {
    mastery,
    physiologicalOutput:
      output.physiologicalMaximum,
    accessFraction,
    renAccessibleMaximum:
      output.renAccessibleMaximum,
    usableMaximum:
      output.usableMaximum,
    chosenOutput,
    endurance:
      enduranceResult.payload,
    containment:
      containmentResult.payload,
  };

  traceNode.output = {
    mastery,
    physiologicalOutput:
      payload.physiologicalOutput,
    accessFraction,
    renAccessibleMaximum:
      payload.renAccessibleMaximum,
    usableMaximum:
      payload.usableMaximum,
    chosenOutput,
    renLoad:
      payload.endurance.renLoad,
    maximumMaintenanceMinutes:
      payload.endurance.maximumMaintenanceMinutes ??
      "unlimited",
    tenContainmentLimit,
    inefficientOutput:
      payload.containment.inefficientOutput,
    auraWastePerMinute:
      payload.containment.auraWastePerMinute,
    effectiveOutput:
      payload.containment.effectiveOutput,
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}
