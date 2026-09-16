/*
 * Ten — the Nen principle of Aura containment.
 *
 * Ten is the passive Nen foundation that keeps Aura gathered around the body
 * instead of letting it pour out of open nodes. It is AUTOMATIC once it is
 * usable at all: there is nothing to declare, nothing to pay, nothing to renew.
 * A character with Ten is running Ten, indefinitely, unless something stops it
 * — losing the Mastery, having the nodes shut, or deliberately opening them
 * into Ren, which REPLACES Ten for as long as it runs.
 *
 * It costs nothing to hold. No activation, no upkeep, no duration, and no
 * active-Nen use, so it never suppresses natural recovery.
 *
 *
 * WHAT TEN PLACES
 * ---------------
 *
 * One even coating over the whole bodily surface, the same size at every rank:
 *
 *   intendedCoating = physiologicalOutput * 0.10
 *
 * Mastery does not make the coating denser, stronger or larger, and Ren plays
 * no part in it. Ten and Ren are alternative operating states rather than
 * stacked modifiers, so neither principle's arithmetic reads the other's.
 *
 * INTENDED, not final. Runtime funding may cap what is actually resolved by
 * usable Output and by Current Aura — but allocating the coating never DEDUCTS
 * Current Aura, because holding Aura against the skin is not spending it.
 *
 *
 * WHAT MASTERY BUYS
 * -----------------
 *
 * Containment. Learning Ten turns open, uncontrolled nodes into ordinary
 * pores that still let a little escape, and every rank above I closes more of
 * that residual leak until Mastery X holds all of it:
 *
 *   leakagePerHour(m) = 2R * (10 - m) / 9
 *
 * where R is the character's Aura Regeneration unit. Mastery I leaks 2R an
 * hour, which is exactly what a contained ordinary hour recovers, so a novice
 * breaks even by existing; Mastery X leaks nothing. The formula is evaluated
 * from the exact rank every time — the two-decimal coefficients a rules page
 * prints (1.78R, 0.22R) are display values, never constants.
 *
 * Residual Ten leakage is CONTAINED leakage. It can empty a reserve, and the
 * ordinary depletion rules then apply, but it is not open nodes bleeding out
 * and it never produces the uncontained collapse.
 *
 *
 * This file owns:
 *
 * - Ten's I-X Mastery profile and DEX eligibility gates;
 * - the fixed coating fraction;
 * - the residual-leakage formula;
 * - the projection of both that Aura consumes.
 *
 * This file does NOT own:
 *
 * - Ren, active Output, or anything about the state that replaces Ten;
 * - Body surface area, density arithmetic, or how one coating is spread;
 * - reinforcement, damage, defense, Fatigue, Stamina, or physical expenditure;
 * - Aura Pool, Output, Regeneration, Control or Distribution math;
 * - recovery, reserve mutation, or collapse settlement;
 * - uncontained leakage, which belongs to the character who never learned Ten;
 * - Growth Point costs or breakthrough requirements;
 * - the universal Nen dependency graph or temporary mastery seals.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../../../infrastructure/diagnostics";
import type { JsonValue } from "../../../../infrastructure/json";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../../infrastructure/result";
import { createTraceNode } from "../../../../infrastructure/trace";

import {
  isMasteryRank,
  MASTERY_RANKS,
  STANDARD_MASTERY_MAX,
  type MasteryRank,
  type MasteryTrack,
} from "../../../capabilities/mastery";

import type { AutomaticSurfaceCoating } from "../../aura/types";

/* -------------------------------------------------------------------------- */
/* Mastery                                                                    */
/* -------------------------------------------------------------------------- */

export interface TenMasteryProfile {
  readonly rank: MasteryRank;
  readonly minimumDex: number;
}

export const TEN_MASTERY_PROFILES = {
  1: { rank: 1, minimumDex: 12 },
  2: { rank: 2, minimumDex: 12 },
  3: { rank: 3, minimumDex: 13 },
  4: { rank: 4, minimumDex: 13 },
  5: { rank: 5, minimumDex: 14 },
  6: { rank: 6, minimumDex: 14 },
  7: { rank: 7, minimumDex: 15 },
  8: { rank: 8, minimumDex: 15 },
  9: { rank: 9, minimumDex: 16 },
  10: { rank: 10, minimumDex: 16 },
} as const satisfies Readonly<Record<MasteryRank, TenMasteryProfile>>;

export const TEN_MASTERY_TRACK = {
  maximumMastery: STANDARD_MASTERY_MAX,
  ranks: MASTERY_RANKS.map((rank) => ({
    rank,
    description:
      rank === STANDARD_MASTERY_MAX
        ? "Perfect Aura containment: the whole-body coating leaks nothing."
        : "Contain Aura in a whole-body coating, leaking less residual Aura with each rank.",
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
/* Coating and containment                                                    */
/* -------------------------------------------------------------------------- */

/*
 * The share of Physiological Output Ten holds against the body, at every rank.
 *
 * Lives here rather than in the Aura resolver because it is Ten's number, and a
 * second copy anywhere would be a second answer to how much Aura a character
 * is wearing. Aura is HANDED the fraction and never spells it.
 */
export const TEN_COATING_OUTPUT_FRACTION = 0.10;

/*
 * The residual leak at Mastery I, as a multiple of Aura Regeneration.
 *
 * Two, which is exactly the contained ordinary-hour recovery — the same
 * calibration half-open pores use, and the reason a fresh Ten user neither
 * gains nor loses by going about their day.
 */
export const TEN_MASTERY_I_LEAKAGE_REGENERATION_MULTIPLE = 2;


/**
 * Ten's residual leakage as a multiple of R, for an exact Mastery rank.
 *
 *   multiple(m) = 2 * (10 - m) / 9
 *
 * The ONE producer of the rate. Everything that needs Ten's leak — the pure
 * resolver below, the Aura projection, a sheet — derives it here, so a rounded
 * display coefficient has nowhere to be substituted.
 */
export function deriveTenLeakageRegenerationMultiple(
  mastery: MasteryRank,
): number {
  return (
    TEN_MASTERY_I_LEAKAGE_REGENERATION_MULTIPLE *
    (STANDARD_MASTERY_MAX - mastery) /
    (STANDARD_MASTERY_MAX - 1)
  );
}


export interface TenContainment {
  readonly mastery: MasteryRank;

  readonly physiologicalOutput: number;
  readonly regenerationPerHour: number;

  /** Always Physiological Output x 0.10, before any runtime funding cap. */
  readonly intendedCoating: number;

  /** Residual leakage as a multiple of R: 2 at Mastery I, 0 at Mastery X. */
  readonly leakageRegenerationMultiple: number;

  /** The residual leak in Aura per hour: 2R * (10 - m) / 9. */
  readonly leakagePerHour: number;
}


export interface TenContainmentInput {
  /** The body's Physiological Aura Output Capacity, P. */
  readonly physiologicalOutput: number;

  /** The character's Aura Regeneration unit per hour, R. */
  readonly regenerationPerHour: number;

  /** Effective Ten Mastery, after seals. */
  readonly mastery: number;
}


function describeNumber(value: number): JsonValue {
  return describeDiagnosticValue(value);
}


/**
 * How much Aura Ten intends to hold against the body, and how much it leaks.
 *
 * Pure arithmetic over plain numbers: it reads no character, no body and no
 * Aura state, so the Aura domain can be handed its result without either
 * domain importing the other's resolver.
 */
export function resolveTenContainment(
  input: TenContainmentInput,
): EngineResult<TenContainment> {
  const { physiologicalOutput, regenerationPerHour, mastery } = input;

  const traceNode = createTraceNode({
    id: "nen.ten.containment",
    label: "Resolve Ten containment",
    formula:
      "intendedCoating = P * 0.10; leakagePerHour = 2R * (10 - mastery) / 9",
    inputs: {
      physiologicalOutput: { value: describeNumber(physiologicalOutput) },
      regenerationPerHour: { value: describeNumber(regenerationPerHour) },
      mastery: { value: describeNumber(mastery) },
    },
  });

  const errors: EngineError[] = [];

  if (
    typeof physiologicalOutput !== "number" ||
    !Number.isFinite(physiologicalOutput) ||
    physiologicalOutput < 0
  ) {
    errors.push({
      code: "nen.ten.physiological_output.invalid",
      message:
        "Ten requires a finite non-negative Physiological Aura Output.",
      audience: "developer",
      required: "finite number >= 0",
      actual: describeNumber(physiologicalOutput),
    });
  }

  if (
    typeof regenerationPerHour !== "number" ||
    !Number.isFinite(regenerationPerHour) ||
    regenerationPerHour < 0
  ) {
    errors.push({
      code: "nen.ten.regeneration.invalid",
      message:
        "Ten's residual leakage requires a finite non-negative Aura Regeneration rate.",
      audience: "developer",
      required: "finite number >= 0",
      actual: describeNumber(regenerationPerHour),
    });
  }

  if (!isMasteryRank(mastery)) {
    errors.push({
      code: "nen.ten.mastery.invalid",
      message:
        "Ten mechanics require a learned Mastery rank from I through X.",
      audience: "developer",
      required: `integer from 1 through ${STANDARD_MASTERY_MAX}`,
      actual: describeNumber(mastery),
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

  const rank = mastery as MasteryRank;

  const leakageRegenerationMultiple =
    deriveTenLeakageRegenerationMultiple(rank);

  const payload: TenContainment = {
    mastery: rank,
    physiologicalOutput,
    regenerationPerHour,
    intendedCoating: physiologicalOutput * TEN_COATING_OUTPUT_FRACTION,
    leakageRegenerationMultiple,
    leakagePerHour: regenerationPerHour * leakageRegenerationMultiple,
  };

  traceNode.output = {
    mastery: rank,
    intendedCoating: payload.intendedCoating,
    leakageRegenerationMultiple,
    leakagePerHour: payload.leakagePerHour,
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}


/**
 * Ten's containment in the vocabulary the Aura resolver consumes.
 *
 * The ONE-WAY projection that keeps Aura ignorant of Nen. Aura never imports
 * this file; the Nen integration layer calls this and hands the result down as
 * part of the flat access input, exactly as it hands down effective Mastery.
 *
 * Returns null when Ten is not available at all — an unlearned or fully sealed
 * rank — which is the character the Aura resolver reports as uncontained.
 */
export function tenSurfaceCoating(
  effectiveTenMastery: number,
): AutomaticSurfaceCoating | null {
  if (!isMasteryRank(effectiveTenMastery)) return null;

  return {
    source: "baseline-ten",
    outputFraction: TEN_COATING_OUTPUT_FRACTION,
    leakageRegenerationMultiple:
      deriveTenLeakageRegenerationMultiple(effectiveTenMastery),
  };
}
