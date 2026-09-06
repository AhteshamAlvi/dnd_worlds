/*
 * Deliberate upkeep — what holding an effect open costs per unit time.
 *
 *   C_upkeep = Base Upkeep Rate x M_Control x t
 *
 * Control applies because upkeep is deliberate expenditure: the character is
 * choosing to keep projecting, and how efficiently they project is exactly
 * what Control describes. This is the same multiplier a one-off activation
 * pays, applied continuously.
 *
 *
 * WHAT COSTS NOTHING, AND WHY THAT IS NOT AN OVERSIGHT
 * ----------------------------------------------------
 *
 * Baseline Ten has zero net waking expenditure. It occupies Output — a
 * Ten-only character has no free Output at all — but occupying Output is not
 * spending Aura, and a Ten that drained the reserve would make the default
 * state of every awakened character a slow death.
 *
 * Unawakened pseudo-Chu likewise costs nothing. It is a conversion of Current
 * Aura, not a withdrawal from it.
 *
 * Elevated Output is the thing that costs. Ren, and every sustained Nen effect
 * above the baseline, will supply a Base Upkeep Rate; none of those rates are
 * decided here, and this file never asks which principle is asking.
 *
 *
 * RATES ARE QUOTED IN THE UNIT THE MECHANIC THINKS IN
 * ---------------------------------------------------
 *
 * A Nen ability held across a fight is naturally quoted per Combat Round; one
 * held across a journey is naturally quoted per hour. Both are accepted and
 * both are converted to a per-hour rate here, so the balance equation adds one
 * kind of number.
 *
 *
 * UNAFFORDABLE UPKEEP HAS TWO ANSWERS, AND BOTH ARE CORRECT
 * ---------------------------------------------------------
 *
 * Asked to pay upkeep directly, this fails ATOMICALLY: the caller wanted a
 * transaction, and a half-paid upkeep is not one.
 *
 * Asked to advance time with upkeep running, the time transition SHUTS THE
 * EFFECT DOWN instead. Hours passing is not a request that can be refused, and
 * a Ren that ran out of Aura at 03:00 did not fail to happen — it dropped.
 */

import type { EngineError } from "../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";
import { COMBAT_ROUNDS_PER_HOUR } from "../../../time/duration";

import { deriveAuraControl } from "./control";
import type { AuraControl } from "./types";


/** The unit a Base Upkeep Rate is quoted in. */
export const AURA_UPKEEP_PERIODS = ["hour", "round"] as const;

export type AuraUpkeepPeriod = typeof AURA_UPKEEP_PERIODS[number];


/*
 * One maintained effect's claim on the reserve.
 *
 * `id` is how a shutdown points back at what dropped, so a caller holding
 * three running effects can tell which one it lost. `source` is the provenance
 * label — "ren", an ability id — and nothing branches on it.
 */
export interface AuraUpkeepCommitment {
  readonly id: string;
  readonly source: string;

  /** Before Control. The mechanic's own number. */
  readonly baseRate: number;

  readonly period: AuraUpkeepPeriod;
}


/** One commitment's resolved cost over an interval. */
export interface AuraUpkeepCharge {
  readonly id: string;
  readonly source: string;
  readonly baseRate: number;
  readonly period: AuraUpkeepPeriod;

  /** The base rate expressed per hour, before Control. */
  readonly baseRatePerHour: number;

  readonly controlMultiplier: number;

  /** After Control, per hour. */
  readonly ratePerHour: number;

  readonly hours: number;
  readonly cost: number;
}


/*
 * A maintained effect that ran out of Aura.
 *
 * A RESULT, not an error. The character did not do anything wrong; they ran
 * out, and the effect ended. Whoever owns the effect reads this and stops
 * applying it.
 */
export interface AuraUpkeepShutdown {
  readonly id: string;
  readonly source: string;
  readonly reason: "insufficient-aura";

  /** What the interval would have cost. */
  readonly requiredAura: number;

  /** What was left when it was asked for. */
  readonly availableAura: number;
}


/** Convert a rate in its own period into Aura per hour. */
export function upkeepRatePerHour(
  baseRate: number,
  period: AuraUpkeepPeriod,
): number {
  return period === "round" ? baseRate * COMBAT_ROUNDS_PER_HOUR : baseRate;
}


function commitmentErrors(
  commitments: readonly AuraUpkeepCommitment[],
): readonly EngineError[] {
  const errors: EngineError[] = [];
  const seen = new Set<string>();

  commitments.forEach((commitment, index) => {
    if (
      typeof commitment.id !== "string" ||
      commitment.id.trim().length === 0
    ) {
      errors.push({
        code: "aura.upkeep.id.missing",
        message: "Every Aura upkeep commitment needs a non-empty id.",
        audience: "developer",
        required: "non-empty string",
        actual: index,
      });
    } else if (seen.has(commitment.id)) {
      errors.push({
        code: "aura.upkeep.id.duplicate",
        message:
          `More than one Aura upkeep commitment uses the id "${commitment.id}".`,
        audience: "developer",
        required: "unique ids",
        actual: commitment.id,
      });
    } else {
      seen.add(commitment.id);
    }

    if (!Number.isFinite(commitment.baseRate) || commitment.baseRate < 0) {
      errors.push({
        code: "aura.upkeep.rate.invalid",
        message: "A Base Upkeep Rate must be a finite non-negative number.",
        audience: "developer",
        required: "finite number >= 0",
        actual: Number.isFinite(commitment.baseRate)
          ? commitment.baseRate
          : String(commitment.baseRate),
      });
    }

    if (
      !(AURA_UPKEEP_PERIODS as readonly string[]).includes(commitment.period)
    ) {
      errors.push({
        code: "aura.upkeep.period.invalid",
        message:
          `An upkeep period must be one of: ${AURA_UPKEEP_PERIODS.join(", ")}.`,
        audience: "developer",
        required: AURA_UPKEEP_PERIODS.join(" | "),
        actual: String(commitment.period),
      });
    }
  });

  return errors;
}


/**
 * Resolve what a set of maintained effects costs over an interval.
 *
 * Derivation only — nothing is deducted and nothing is shut down. The two
 * callers that do act on this differ in what they do when the reserve cannot
 * cover it, so neither behaviour belongs here.
 */
export function deriveAuraUpkeep(
  commitments: readonly AuraUpkeepCommitment[],
  control: AuraControl,
  hours: number,
): EngineResult<readonly AuraUpkeepCharge[]> {
  const traceNode = createTraceNode({
    id: "aura.upkeep.derive",
    label: "Derive Aura upkeep",
    formula: "cost = baseRatePerHour * controlMultiplier * hours",
    inputs: {
      commitments: { value: commitments.length },
      controlMultiplier: { value: control.multiplier },
      hours: { value: Number.isFinite(hours) ? hours : String(hours) },
    },
  });

  const errors: EngineError[] = [...commitmentErrors(commitments)];

  if (!Number.isFinite(hours) || hours < 0) {
    errors.push({
      code: "aura.upkeep.duration.invalid",
      message: "Upkeep duration must be a finite non-negative number of hours.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(hours) ? hours : String(hours),
    });
  }

  if (errors.length > 0) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  }

  const charges = commitments.map((commitment): AuraUpkeepCharge => {
    const baseRatePerHour = upkeepRatePerHour(
      commitment.baseRate,
      commitment.period,
    );

    const ratePerHour = baseRatePerHour * control.multiplier;

    return {
      id: commitment.id,
      source: commitment.source,
      baseRate: commitment.baseRate,
      period: commitment.period,
      baseRatePerHour,
      controlMultiplier: control.multiplier,
      ratePerHour,
      hours,
      cost: ratePerHour * hours,
    };
  });

  traceNode.output = {
    total: charges.reduce((sum, charge) => sum + charge.cost, 0),
    charges: charges.map((charge) => ({ id: charge.id, cost: charge.cost })),
  };

  return {
    success: true,
    payload: charges,
    trace: { root: traceNode },
    warnings: [],
  };
}


export interface AuraUpkeepPayment {
  readonly charges: readonly AuraUpkeepCharge[];
  readonly total: number;
  readonly current: number;
  readonly previousCurrent: number;
}


/**
 * Pay upkeep out of the reserve, all of it or none.
 *
 * The transactional entry point. A caller asking "can this character hold
 * these effects for another hour" gets a yes with the deduction applied or a
 * no with nothing touched; there is no third answer where two of three effects
 * were paid for.
 *
 * The time transition does NOT use this. Hours passing cannot be refused, so
 * it shuts unaffordable effects down instead — see time.ts.
 */
export function payAuraUpkeep(
  current: number,
  dex: number,
  commitments: readonly AuraUpkeepCommitment[],
  hours: number,
): EngineResult<AuraUpkeepPayment> {
  const control = deriveAuraControl(dex);

  if (!control.success) return control;

  const derived = deriveAuraUpkeep(commitments, control.payload, hours);

  if (!derived.success) return derived;

  const total = derived.payload.reduce((sum, charge) => sum + charge.cost, 0);

  const traceNode = createTraceNode({
    id: "aura.upkeep.pay",
    label: "Pay Aura upkeep",
    inputs: {
      currentAura: {
        value: Number.isFinite(current) ? current : String(current),
      },
      hours: { value: hours },
    },
    children: [control.trace.root, derived.trace.root],
  });

  if (!Number.isFinite(current) || current < 0) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [{
        code: "aura.upkeep.current_aura.invalid",
        message: "Current Aura must be a finite non-negative number.",
        audience: "developer",
        required: "finite number >= 0",
        actual: Number.isFinite(current) ? current : String(current),
      }],
    };
  }

  if (total > current) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [{
        code: "aura.upkeep.insufficient",
        message: "The character cannot afford this upkeep.",
        audience: "player",
        required: total,
        actual: current,
        resolution:
          "Drop a maintained effect, recover Aura, or advance time instead — a time transition shuts unaffordable effects down rather than refusing.",
      }],
    };
  }

  traceNode.output = { total, current: current - total };

  return {
    success: true,
    payload: {
      charges: derived.payload,
      total,
      current: current - total,
      previousCurrent: current,
    },
    trace: { root: traceNode },
    warnings: [],
  };
}
