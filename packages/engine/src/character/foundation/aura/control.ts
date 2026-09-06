/*
 * Aura Control and expenditure efficiency.
 *
 * Aura Control is not a stored or independently levelled statistic. It is
 * derived directly from resolved DEX whenever Aura is actually expended, and
 * it modifies DELIBERATE EXPENDITURE COST and nothing else.
 *
 * It does NOT affect:
 *
 *   - Maximum Aura
 *   - physiological, accessible or usable Output
 *   - Distribution or Density
 *   - reinforcement strength
 *   - Nen mastery
 *   - whether an application is ALLOWED — access and application requirements
 *     own permission, which is why there is no longer an availability flag on
 *     AuraControl for a caller to mistake for one
 *   - involuntary Aura loss, which bypasses Control entirely (see drainAura)
 *
 *
 * THE PROGRESSION
 * ---------------
 *
 * Two curves meeting at DEX 22, which is the point of perfect mortal control:
 * no Aura wasted, no Aura saved, exactly x1.0.
 *
 * Mortal, DEX 7 through 22:
 *
 *   M(D) = (1 + (D - 22) / 20) ^ -log_4(5)
 *
 * Superhuman, DEX above 22:
 *
 *   M(D) = (1 + (D - 22) / 10) ^ -2.75
 *
 * Below DEX 7 the curve would climb towards a vertical asymptote at DEX 2, so
 * the DEX 7 result holds flat instead. A character that clumsy wastes five
 * times the Aura an application needs; they are not infinitely wasteful.
 *
 *
 * ROUNDING IS PART OF THE CALCULATION
 * -----------------------------------
 *
 * Mortal values round to TWO significant figures and superhuman values to ONE.
 * That is not display formatting: the rounded figure is what the engine
 * multiplies a Base Cost by, so two characters whose raw curves differ in the
 * third decimal genuinely pay the same.
 *
 * The asymmetry follows the curves. Below 22 the multiplier moves slowly
 * enough that one significant figure would flatten four DEX points into one
 * answer; above 22 it falls fast enough that two would imply a precision the
 * progression does not have.
 *
 * Resolved checkpoints:
 *
 *   <=7  x5.0     22  x1.0     26  x0.4     36  x0.09
 *    10  x2.9     23  x0.8     27  x0.3     40  x0.06
 *    15  x1.6     24  x0.6     30  x0.2     50  x0.03
 *    20  x1.1     25  x0.5
 *
 * There is no maximum supported DEX. The superhuman curve stays defined,
 * positive and falling for every DEX above 30, so a character far past the
 * mortal range resolves rather than erroring.
 *
 *
 * Final Aura Cost = Base Aura Cost x resolved Control Multiplier
 *
 * The multiplier is rounded; the Final Cost is NOT. Fractional Aura
 * expenditure stays precise internally, which matters for continuous-time Nen
 * upkeep.
 */


import type { EngineError } from "../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import { roundToSignificantFigures } from "../../../infrastructure/rounding";
import { createTraceNode } from "../../../infrastructure/trace";

import type { AuraControl, AuraExpenditure } from "./types";


/*
 * Below this, the DEX 7 result holds. The mortal curve's base reaches zero at
 * DEX 2, so continuing it downward would run to infinity through a handful of
 * scores.
 */
export const CONTROL_DEX_FLOOR = 7;

/** Perfect mortal control: the two curves meet here at exactly x1.0. */
export const CONTROL_DEX_PIVOT = 22;

/*
 * -log_4(5).
 *
 * Written as the logarithm rather than as -1.16096 so the curve's defining
 * property survives: it is the exponent for which the DEX 7 base of 1/4
 * produces exactly x5.
 */
export const MORTAL_CONTROL_EXPONENT = -Math.log(5) / Math.log(4);

export const SUPERHUMAN_CONTROL_EXPONENT = -2.75;

/** Significant figures the resolved multiplier is rounded to, by branch. */
const MORTAL_CONTROL_FIGURES = 2;
const SUPERHUMAN_CONTROL_FIGURES = 1;


/**
 * The raw, unrounded Control multiplier for a DEX.
 *
 * The mathematical derivation only. Validation of the supported DEX range is
 * the public functions' job.
 */
export function deriveRawAuraControlMultiplier(
  dex: number,
): number {
  const effectiveDex = Math.max(dex, CONTROL_DEX_FLOOR);

  if (effectiveDex <= CONTROL_DEX_PIVOT) {
    return (
      (1 + (effectiveDex - CONTROL_DEX_PIVOT) / 20) **
      MORTAL_CONTROL_EXPONENT
    );
  }

  return (
    (1 + (effectiveDex - CONTROL_DEX_PIVOT) / 10) **
    SUPERHUMAN_CONTROL_EXPONENT
  );
}


/**
 * Round a raw multiplier the way its own side of the progression is rounded.
 *
 * Exported so a caller that already holds a raw figure rounds it identically
 * rather than picking a precision of its own.
 */
export function roundAuraControlMultiplier(
  rawMultiplier: number,
  dex: number,
): number {
  return roundToSignificantFigures(
    rawMultiplier,
    Math.max(dex, CONTROL_DEX_FLOOR) <= CONTROL_DEX_PIVOT
      ? MORTAL_CONTROL_FIGURES
      : SUPERHUMAN_CONTROL_FIGURES,
  );
}


/*
 * A DEX that cannot produce a Control multiplier at all.
 *
 * The only remaining failure. A DEX below the floor is a FACT about a clumsy
 * character rather than a problem, and a DEX far above the mortal range is a
 * fact about an extraordinary one; both resolve. Non-finite, fractional and
 * negative scores are developer-facing bugs, and they are the whole list.
 */
function invalidDexError(dex: number): EngineError | null {
  if (
    !Number.isFinite(dex) ||
    !Number.isInteger(dex) ||
    dex < 0
  ) {
    return {
      code: "aura.control.dex.invalid",
      message:
        "DEX must be a finite non-negative integer to derive Aura Control.",
      audience: "developer",
      required: "integer >= 0",
      actual: Number.isFinite(dex) ? dex : String(dex),
    };
  }

  return null;
}


/**
 * The resolved Control multiplier for a DEX.
 *
 * Defined for every non-negative integer DEX. There is no upper bound and no
 * lower cut-off: the only failure is a DEX that is not a score.
 */
export function deriveAuraControlMultiplier(
  dex: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id: "aura.control.multiplier",
    label: "Derive Aura Control multiplier",

    formula:
      "D <= 22: (1 + (D - 22)/20)^(-log4(5)) to 2 s.f.; D > 22: (1 + (D - 22)/10)^-2.75 to 1 s.f.; D < 7 uses D = 7",

    decisionId: "aura.control.dex-22-pivot",

    inputs: {
      dex: {
        value: Number.isFinite(dex) ? dex : String(dex),
      },
    },
  });

  const invalid = invalidDexError(dex);

  if (invalid !== null) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [invalid] as NonEmptyArray<EngineError>,
    };
  }

  const effectiveDex = Math.max(dex, CONTROL_DEX_FLOOR);
  const rawMultiplier = deriveRawAuraControlMultiplier(dex);
  const multiplier = roundAuraControlMultiplier(rawMultiplier, dex);

  traceNode.output = {
    dex,
    effectiveDex,
    branch: effectiveDex <= CONTROL_DEX_PIVOT ? "mortal" : "superhuman",
    rawMultiplier,
    multiplier,
  };

  return {
    success: true,
    payload: multiplier,
    trace: { root: traceNode },
    warnings: [],
  };
}


/**
 * The character's resolved Control.
 *
 * ResolvedAuraProfile.control has one producer, and this is it.
 *
 * There is no longer a `deliberateExpenditureAvailable` companion. It claimed
 * to answer "may this character spend Aura deliberately", which Control is not
 * in a position to know: awakening, access state and an application's own
 * requirements decide that, and a DEX-derived cost multiplier that also
 * reports permission is two answers wearing one name. Control now says only
 * how expensive a deliberate expenditure is, for every DEX.
 */
export function deriveAuraControl(
  dex: number,
): EngineResult<AuraControl> {
  const result = deriveAuraControlMultiplier(dex);

  if (!result.success) return result;

  return {
    success: true,
    payload: { multiplier: result.payload },
    trace: result.trace,
    warnings: [],
  };
}


/**
 * Apply an ALREADY RESOLVED Control multiplier to a Base Aura Cost.
 *
 * Split out from deriveAuraExpenditure so that a caller holding a resolved
 * profile — spendAura is the one that matters — charges the same multiplier
 * the profile reports rather than re-deriving one from a DEX it would have to
 * be handed separately. Two derivations are two chances to disagree.
 *
 * Final Cost is deliberately unrounded.
 */
export function applyAuraControl(
  baseCost: number,
  control: AuraControl,
): AuraExpenditure {
  return {
    baseCost,
    controlMultiplier: control.multiplier,
    finalCost: baseCost * control.multiplier,
  };
}


/**
 * Derive the Aura cost of one expenditure from a Base Cost and a DEX.
 *
 * Base Aura Cost is determined by whatever Nen principle, Nen Ability, action
 * or other mechanic is producing the expenditure. Control then decides how
 * much Aura is actually deducted.
 *
 * Examples, Base Cost 100:
 *
 *   DEX 10  ->  100 x 2.9  =  290 Aura
 *   DEX 22  ->  100 x 1.0  =  100 Aura
 *   DEX 25  ->  100 x 0.5  =   50 Aura
 *   DEX 30  ->  100 x 0.2  =   20 Aura
 */
export function deriveAuraExpenditure(
  baseCost: number,
  dex: number,
): EngineResult<AuraExpenditure> {
  const traceNode = createTraceNode({
    id: "aura.control.expenditure",
    label: "Derive Aura expenditure",

    formula: "finalCost = baseCost * controlMultiplier",

    inputs: {
      baseCost: {
        value: Number.isFinite(baseCost) ? baseCost : String(baseCost),
      },

      dex: {
        value: Number.isFinite(dex) ? dex : String(dex),
      },
    },
  });

  const errors: EngineError[] = [];

  if (!Number.isFinite(baseCost) || baseCost < 0) {
    errors.push({
      code: "aura.control.base_cost.invalid",
      message: "Base Aura Cost must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(baseCost) ? baseCost : String(baseCost),
    });
  }

  const invalidDex = invalidDexError(dex);

  if (invalidDex !== null) errors.push(invalidDex);

  if (errors.length > 0) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  }

  const rawMultiplier = deriveRawAuraControlMultiplier(dex);
  const controlMultiplier = roundAuraControlMultiplier(rawMultiplier, dex);

  const payload = applyAuraControl(baseCost, { multiplier: controlMultiplier });

  traceNode.output = {
    baseCost,
    dex,
    rawMultiplier,
    controlMultiplier,
    finalCost: payload.finalCost,

    /*
     * Positive: additional Aura spent through imperfect control.
     * Zero:     perfect control.
     * Negative: Aura saved through superhuman control.
     */
    costDifference: payload.finalCost - baseCost,
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}
