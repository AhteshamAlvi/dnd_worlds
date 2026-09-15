/*
 * Ten — the Nen principle of Aura containment.
 *
 * Ten is the passive Nen foundation that keeps Aura gathered around the body
 * instead of letting it dissipate. It is AUTOMATIC once it is usable at all:
 * there is nothing to declare, nothing to pay, nothing to renew. A character
 * with Ten is running Ten, indefinitely, and the only things that stop it are
 * losing the Mastery and having the nodes shut.
 *
 * It costs NOTHING. No activation, no upkeep, no duration, no passive leak,
 * and no share of Aura Regeneration Capacity. Functioning Ten is not a slow
 * expenditure the character is winning against; it is containment, and
 * containment is the absence of loss rather than a cheaper form of it.
 *
 *
 * WHAT TEN PLACES
 * ---------------
 *
 * One even coating over the whole bodily surface, resolved as the GREATER of
 * two terms:
 *
 *   renAccessibleOutput = physiologicalOutput * renAccessFraction
 *   masteryCoating      = renAccessibleOutput * containmentFraction
 *   minimumCoating      = physiologicalOutput * 0.05
 *   intendedCoating     = max(masteryCoating, minimumCoating)
 *
 * The Mastery term is what the character's containment skill makes of the
 * Output Ren has actually opened, and it is the term that grows. The 5% floor
 * is what a body holding a coating does regardless of skill, and it is what
 * answers the character who has learned Ten and no Ren at all: with no Ren,
 * `renAccessFraction` is zero, the Mastery term is zero, and the floor is the
 * whole of the coating.
 *
 * So Ten and Ren multiply rather than compete. Ren decides how much Output is
 * reachable; Ten decides how much of THAT is held against the body. Neither
 * one substitutes for the other, and Ren never calculates a coating of its own.
 *
 * Worked example — Physiological Output 20, Ren I (10%), Ten I (10%):
 *
 *   renAccessibleOutput = 2
 *   masteryCoating      = 0.2
 *   minimumCoating      = 1
 *   intendedCoating     = 1      (the floor, by a factor of five)
 *
 * INTENDED, not final. Runtime funding may cap what is actually resolved by
 * usable Output and by Current Aura — but allocating the coating never DEDUCTS
 * Current Aura, because holding Aura against the skin is not spending it.
 *
 *
 * This file owns:
 *
 * - Ten's I-X Mastery profile;
 * - Ten's DEX eligibility gates;
 * - Ten's containment fraction;
 * - the 5% minimum coating;
 * - the resolved coating, and the projection of it Aura consumes.
 *
 * This file does NOT own:
 *
 * - active Aura Output, Ren endurance, or Ren's waste above what Ten holds;
 * - Body surface area, density arithmetic, or how one coating is spread;
 * - reinforcement, damage, defense, Fatigue, Stamina, or physical expenditure;
 * - Aura Pool, Output, Regeneration, Control or Distribution math;
 * - recovery, reserve mutation, or collapse settlement;
 * - uncontained leakage, which belongs to the character who never learned Ten;
 * - action-economy timing;
 * - Growth Point costs or breakthrough requirements;
 * - the universal Nen dependency graph or temporary mastery seals.
 */

import type { EngineError } from "../../../../infrastructure/diagnostics";
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

  /** Share of REN-ACCESSIBLE Output this rank holds against the body. */
  readonly containmentFraction: number;
}

export const TEN_MASTERY_PROFILES = {
  1: { rank: 1, minimumDex: 12, containmentFraction: 0.10 },
  2: { rank: 2, minimumDex: 12, containmentFraction: 0.20 },
  3: { rank: 3, minimumDex: 13, containmentFraction: 0.30 },
  4: { rank: 4, minimumDex: 13, containmentFraction: 0.40 },
  5: { rank: 5, minimumDex: 14, containmentFraction: 0.50 },
  6: { rank: 6, minimumDex: 14, containmentFraction: 0.60 },
  7: { rank: 7, minimumDex: 15, containmentFraction: 0.70 },
  8: { rank: 8, minimumDex: 15, containmentFraction: 0.80 },
  9: { rank: 9, minimumDex: 16, containmentFraction: 0.90 },
  10: { rank: 10, minimumDex: 16, containmentFraction: 1.00 },
} as const satisfies Readonly<Record<MasteryRank, TenMasteryProfile>>;

export const TEN_MASTERY_TRACK = {
  maximumMastery: STANDARD_MASTERY_MAX,
  ranks: MASTERY_RANKS.map((rank) => ({
    rank,
    description:
      rank === STANDARD_MASTERY_MAX
        ? "Perfect Aura containment: coat the body with the whole of the Aura Output Ren makes accessible."
        : `Coat the body with up to ${rank * 10}% of the Aura Output Ren makes accessible.`,
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

export function deriveTenContainmentFraction(
  mastery: MasteryRank,
): number {
  return TEN_MASTERY_PROFILES[mastery].containmentFraction;
}


/* -------------------------------------------------------------------------- */
/* Coating                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * The coating a body holds regardless of containment skill.
 *
 * It lives here rather than in the Aura resolver because it is Ten's floor,
 * not a property of a default access state — and because a second copy of it
 * anywhere would be a second answer to how much Aura a novice is wearing. Aura
 * is HANDED the resolved fraction and never spells this number.
 */
export const TEN_MINIMUM_COATING_OUTPUT_FRACTION = 0.05;


/** Which of the two terms the resolved coating actually came from. */
export type TenCoatingSource = "mastery" | "minimum";


export interface TenCoating {
  readonly mastery: MasteryRank;

  readonly physiologicalOutput: number;
  readonly renAccessFraction: number;
  readonly renAccessibleOutput: number;

  readonly containmentFraction: number;

  /** Ten's Mastery share of what Ren has opened. */
  readonly masteryCoating: number;

  /** The 5% floor, which applies whether or not Ren is available at all. */
  readonly minimumCoating: number;

  /** The greater of the two, before any runtime funding cap. */
  readonly intendedCoating: number;

  readonly source: TenCoatingSource;
}


/*
 * The coating as a SHARE OF PHYSIOLOGICAL OUTPUT.
 *
 * The same formula as resolveTenCoating with the Output factored out, which is
 * what lets the Aura budget apply it against a physiological maximum it
 * derives for itself. Both go through this, so there is one place the `max`
 * is written.
 */
function coatingOutputFraction(
  mastery: MasteryRank,
  renAccessFraction: number,
): { readonly fraction: number; readonly mastery: number; readonly minimum: number } {
  const masteryFraction =
    renAccessFraction * deriveTenContainmentFraction(mastery);

  return {
    fraction: Math.max(masteryFraction, TEN_MINIMUM_COATING_OUTPUT_FRACTION),
    mastery: masteryFraction,
    minimum: TEN_MINIMUM_COATING_OUTPUT_FRACTION,
  };
}


export interface TenCoatingInput {
  /** The body's Physiological Aura Output Capacity. */
  readonly physiologicalOutput: number;

  /** Ren's share of that Output, 0 through 1. Zero when Ren is unavailable. */
  readonly renAccessFraction: number;

  /** Effective Ten Mastery, after seals. */
  readonly mastery: number;
}


/**
 * How much Aura Ten intends to hold against the whole bodily surface.
 *
 * Pure arithmetic over plain numbers: it reads no character, no body and no
 * Aura state, so the Aura domain can be handed its result without either
 * domain importing the other's resolver.
 */
export function resolveTenCoating(
  input: TenCoatingInput,
): EngineResult<TenCoating> {
  const { physiologicalOutput, renAccessFraction, mastery } = input;

  const traceNode = createTraceNode({
    id: "nen.ten.coating",
    label: "Resolve the Ten coating",
    formula:
      "intendedCoating = max(physiologicalOutput * renAccessFraction * containmentFraction, physiologicalOutput * 0.05)",
    inputs: {
      physiologicalOutput: {
        value: Number.isFinite(physiologicalOutput)
          ? physiologicalOutput
          : String(physiologicalOutput),
      },
      renAccessFraction: {
        value: Number.isFinite(renAccessFraction)
          ? renAccessFraction
          : String(renAccessFraction),
      },
      mastery: { value: mastery },
    },
  });

  const errors: EngineError[] = [];

  if (
    !Number.isFinite(physiologicalOutput) ||
    physiologicalOutput < 0
  ) {
    errors.push({
      code: "nen.ten.physiological_output.invalid",
      message:
        "Ten requires a finite non-negative Physiological Aura Output.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(physiologicalOutput)
        ? physiologicalOutput
        : String(physiologicalOutput),
    });
  }

  /*
   * Zero is the ordinary case, not an edge one: it is every character who has
   * learned Ten and no Ren. Anything ABOVE 1 is a caller who has mistaken a
   * percentage for a fraction, and is refused rather than clamped.
   */
  if (
    !Number.isFinite(renAccessFraction) ||
    renAccessFraction < 0 ||
    renAccessFraction > 1
  ) {
    errors.push({
      code: "nen.ten.ren_access_fraction.invalid",
      message:
        "Ten's coating reads Ren's share of Output as a fraction from 0 through 1.",
      audience: "developer",
      required: "finite number between 0 and 1",
      actual: Number.isFinite(renAccessFraction)
        ? renAccessFraction
        : String(renAccessFraction),
    });
  }

  if (!isMasteryRank(mastery)) {
    errors.push({
      code: "nen.ten.mastery.invalid",
      message:
        "Ten mechanics require a learned Mastery rank from I through X.",
      audience: "developer",
      required: `integer from 1 through ${STANDARD_MASTERY_MAX}`,
      actual: mastery,
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

  const fractions = coatingOutputFraction(rank, renAccessFraction);

  const renAccessibleOutput = physiologicalOutput * renAccessFraction;

  const masteryCoating = physiologicalOutput * fractions.mastery;
  const minimumCoating = physiologicalOutput * fractions.minimum;
  const intendedCoating = physiologicalOutput * fractions.fraction;

  const payload: TenCoating = {
    mastery: rank,
    physiologicalOutput,
    renAccessFraction,
    renAccessibleOutput,
    containmentFraction: deriveTenContainmentFraction(rank),
    masteryCoating,
    minimumCoating,
    intendedCoating,

    /*
     * A tie reads as the floor deliberately. The two terms coincide only when
     * Mastery has just caught up with what the body does anyway, and reporting
     * that as a Mastery-derived coating would tell a player their training had
     * started paying before it had.
     */
    source: masteryCoating > minimumCoating ? "mastery" : "minimum",
  };

  traceNode.output = {
    mastery: rank,
    renAccessibleOutput,
    containmentFraction: payload.containmentFraction,
    masteryCoating,
    minimumCoating,
    intendedCoating,
    source: payload.source,
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}


/**
 * Ten's coating in the vocabulary the Aura resolver consumes.
 *
 * The ONE-WAY projection that keeps Aura ignorant of Nen. Aura never imports
 * this file; the Nen integration layer calls this and hands the result down as
 * part of the flat access input, exactly as it hands down effective Mastery.
 *
 * Returns null when Ten is not available at all — an unlearned or fully sealed
 * rank — which is the character the Aura resolver reports as uncontained.
 *
 * A malformed `renAccessFraction` resolves as zero rather than throwing. The
 * override carrying it is refused by Aura's own access validation, so a
 * coating built from it never reaches a budget; producing the floor here keeps
 * one bad field from also being reported as a missing coating.
 */
export function tenSurfaceCoating(
  effectiveTenMastery: number,
  renAccessFraction: number,
): AutomaticSurfaceCoating | null {
  if (!isMasteryRank(effectiveTenMastery)) return null;

  const usableFraction =
    Number.isFinite(renAccessFraction) && renAccessFraction > 0
      ? renAccessFraction
      : 0;

  const fractions = coatingOutputFraction(effectiveTenMastery, usableFraction);

  return {
    source: "baseline-ten",
    outputFraction: fractions.fraction,
    masteryFraction: fractions.mastery,
    minimumFraction: fractions.minimum,
  };
}
