/*
 * Body Point resolution.
 *
 * Maximum BP is Structural Capacity seen through two lenses the Structural
 * Capacity subsystem deliberately refuses to look through: how the body is
 * built, and how hardy the character is.
 *
 *   MaxBP = SC x BuildFactor x CONFactor x DestructionResistance
 *
 * Note what is NOT in that formula. There is no Strength term: the old
 * STR -> BP direction is deleted outright, and Muscularity now reaches BP only
 * the honest way, through Structural Capacity. There is no morphology
 * calculation either — the factors below are applied here but derived
 * upstream, because BP computing its own morphology is exactly how the engine
 * ended up with two morphology systems that disagreed.
 */

import {
  resolveAdipositySizeFactor,
  resolveEffectiveBulk,
} from "../measurements/resolution";
import { resolveBodyStructuralCapacity } from "../structure/resolution";
import { createBodyPartDefinitionMap } from "../selectors";
import { NEUTRAL_MORPHOLOGY } from "../types";
import { resolveBodyPointModifiersByPart } from "./modifiers";
import type { BodyMorphology } from "../types";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
  BodyPartMorphologySensitivity,
} from "../anatomy/types";
import type {
  BodyPointModifier,
  ResolvedBodyPartBP,
  ResolvedBodyPoints,
} from "./types";


/*
 * Constitution reference used by Body Point scaling.
 *
 * CON 10 is x1. Every +2 CON doubles BP; every -2 halves it.
 *
 * WHY 2 AND NOT 5
 *
 * The interval is calibrated against what a point of Strength buys. Buying
 * +1 STR solves for the Muscularity that doubles normalized Strength Points,
 * and that Muscularity raises whole-body Structural Capacity from 100 to
 * 143.85 — a x1.438 durability gain thrown in free with a Strength purchase.
 * At an interval of 2, +1 CON is x1.414. So a point spent on Strength and a
 * point spent on Constitution buy about the same durability, which is the
 * intended relationship between them.
 *
 * At the old interval of 5, +1 CON was x1.149, and one Strength point was
 * worth roughly two and a half Constitution points of toughness.
 *
 * WHAT IT COSTS, AND WHY IT IS A NAMED CONSTANT
 *
 *   interval    per +1 CON    CON 30       CON 1-30 range
 *   5           x1.149        x16              56x
 *   3           x1.260        x102            813x
 *   2           x1.414        x1024        23,170x
 *
 * A 23,000x spread across the legal CON range is enormous, and this number is
 * a reasoned guess rather than a measured one: the parity argument above is
 * made at the Structural Capacity layer, and nothing yet defines how Strength
 * Points become damage against Body Points, so there is no way to check
 * whether parity in SC survives into parity in actual combat. It stays a named
 * constant precisely so it is a one-line retune once a damage model exists.
 * 3 is the obvious alternative.
 */
/* One of four independent baseline-10 anchors; see
 * attributes/resolution.ts's STANDARD_MODIFIER_REFERENCE_SCORE. */
export const REFERENCE_CONSTITUTION = 10;
export const CONSTITUTION_DOUBLING_INTERVAL = 2;


/*
 * How much Bulk and Adiposity each contribute to durability.
 *
 * Both are halved or quartered relative to their effect on Size and Mass: a
 * thick body is harder to destroy, but not in proportion to how much larger it
 * is, and fat contributes half again less than frame does. They add rather
 * than multiply inside the factor, so a broad AND heavy character is not
 * compounded twice for one body.
 */
export const BULK_BP_CONTRIBUTION = 0.5;
export const ADIPOSITY_BP_CONTRIBUTION = 0.25;


/*
 * Resolves the Constitution BP multiplier.
 *
 *   2 ^ ((CON - 10) / 2)
 *
 *   CON  4 -> x0.125     CON 14 -> x4
 *   CON  6 -> x0.25      CON 16 -> x8
 *   CON  8 -> x0.5       CON 20 -> x32
 *   CON 10 -> x1         CON 30 -> x1024
 */
export function getConstitutionBPMultiplier(
  constitution: number,
): number {
  return Math.pow(
    2,
    (constitution - REFERENCE_CONSTITUTION) / CONSTITUTION_DOUBLING_INTERVAL,
  );
}


/*
 * How this body's build changes its durability.
 *
 *   BuildFactor = 1 + ((EffectiveBulk - 1) x 0.50)
 *                   + ((EffectiveAdiposity - 1) x 0.25)
 *
 * EffectiveBulk and EffectiveAdiposity are the same per-part morphology
 * responses the measurement subsystem uses, imported rather than recomputed.
 * Two implementations of one factor is how the previous BP system drifted away
 * from the physical model, and importing costs nothing: both are pure
 * functions of a morphology and a sensitivity.
 */
export function resolveBuildFactor(
  morphology: BodyMorphology,
  sensitivity: BodyPartMorphologySensitivity,
): number {
  const effectiveBulk = resolveEffectiveBulk(morphology, sensitivity);
  const effectiveAdiposity = resolveAdipositySizeFactor(morphology, sensitivity);

  return (
    1 +
    ((effectiveBulk - 1) * BULK_BP_CONTRIBUTION) +
    ((effectiveAdiposity - 1) * ADIPOSITY_BP_CONTRIBUTION)
  );
}


/*
 * The one and only rounding step in Maximum BP.
 *
 * The floor of 1 is load-bearing and gets more load-bearing the higher the
 * Constitution interval goes. A Human Neck has reference SC 2; at CON 4 the
 * multiplier is 0.125 and raw Maximum BP resolves to 0.25, which rounds to
 * zero. A part with zero Maximum BP is a part that is destroyed the instant it
 * is created and can never be healed, because every fraction of nothing is
 * nothing. Small anatomy on a frail character has to stay destroyable-only-by-
 * damage, so it is floored at one point rather than allowed to round out of
 * existence.
 */
export function roundMaximumBP(rawMaximumBP: number): number {
  return Math.max(1, Math.round(rawMaximumBP));
}


/*
 * The displayed Current BP of an active BodyPart.
 *
 * Floored at 1 for exactly the reason Maximum BP is: 0 is reserved for
 * destruction, which is an anatomy state transition and never a rounding
 * result. A Neck at Maximum BP 2 and integrity 0.20 has 0.4 exact BP and shows
 * 1 — catastrophically damaged and still attached. Rounding it to 0 would
 * silently kill a part that damage application never destroyed, and would then
 * un-kill it the moment the character's Maximum BP went up.
 */
export function displayCurrentBP(exactCurrentBP: number): number {
  return Math.max(1, Math.round(exactCurrentBP));
}


/*
 * Resolves one BodyPart's Body Points.
 *
 * Takes already-resolved Structural Capacity rather than deriving it, so this
 * function cannot accidentally become a second implementation of SC.
 */
export function resolveBodyPartBP(
  partId: BodyPartId,
  type: string,
  structuralCapacity: number,
  sensitivity: BodyPartMorphologySensitivity,
  morphology: BodyMorphology,
  constitutionMultiplier: number,
  destructionResistance: number,
  integrity: number,
): ResolvedBodyPartBP {
  const buildFactor = resolveBuildFactor(morphology, sensitivity);

  const rawMaximumBP =
    structuralCapacity *
    buildFactor *
    constitutionMultiplier *
    destructionResistance;

  if (!Number.isFinite(rawMaximumBP) || rawMaximumBP <= 0) {
    throw new Error(
      `Cannot resolve BP for BodyPart "${partId}": raw Maximum BP must be ` +
      `finite and greater than 0, got ${rawMaximumBP}.`,
    );
  }

  const maximumBP = roundMaximumBP(rawMaximumBP);
  const exactCurrentBP = maximumBP * integrity;

  return {
    partId,
    type,

    structuralCapacity,

    buildFactor,
    constitutionMultiplier,
    destructionResistance,

    rawMaximumBP,
    maximumBP,

    integrity,

    exactCurrentBP,
    currentBP: displayCurrentBP(exactCurrentBP),
  };
}


export interface BodyPointsResolutionInput {
  readonly anatomy: Anatomy;
  readonly definitions: readonly BodyPartDefinition[];

  readonly morphologyByPartId: Readonly<Record<BodyPartId, BodyMorphology>>;
  readonly effectiveScale: number;

  readonly constitution: number;

  readonly modifiers?: readonly BodyPointModifier[];
}


/*
 * Resolves Body Points for a whole body.
 *
 * Only active anatomy participates, matching Structural Capacity and
 * measurements. A suppressed or archived-removed part has left the body: it
 * has no volume, no mass, and nothing left to destroy.
 */
export function resolveBodyPoints(
  input: BodyPointsResolutionInput,
): ResolvedBodyPoints {
  const definitionsById = createBodyPartDefinitionMap(input.definitions);

  const structure = resolveBodyStructuralCapacity(
    input.anatomy,
    input.definitions,
    input.morphologyByPartId,
    input.effectiveScale,
  );

  const modifiersByPartId = resolveBodyPointModifiersByPart(
    input.anatomy.parts,
    input.definitions,
    input.modifiers ?? [],
  );

  const constitutionMultiplier = getConstitutionBPMultiplier(
    input.constitution,
  );

  const parts: ResolvedBodyPartBP[] = [];
  const byPartId: Record<BodyPartId, ResolvedBodyPartBP> = {};

  for (const part of input.anatomy.parts) {
    if (part.state !== "active") continue;

    const definition = definitionsById.get(part.type);

    /*
     * Anatomy is assumed validated, so an unknown type is an invalid engine
     * state rather than an input to tolerate. Same convention as the
     * measurement and Structural Capacity resolvers.
     */
    if (definition === undefined) {
      throw new Error(
        `Cannot resolve BP for BodyPart "${part.id}": ` +
        `unknown BodyPartDefinition "${part.type}".`,
      );
    }

    const partStructure = structure.byPartId[part.id];

    if (partStructure === undefined) {
      throw new Error(
        `Cannot resolve BP for BodyPart "${part.id}": ` +
        `no Structural Capacity was resolved for it.`,
      );
    }

    const resolved = resolveBodyPartBP(
      part.id,
      part.type,
      partStructure.structuralCapacity,
      definition.sensitivity,
      input.morphologyByPartId[part.id] ?? NEUTRAL_MORPHOLOGY,
      constitutionMultiplier,
      modifiersByPartId.get(part.id)?.destructionResistance ?? 1,
      part.integrity,
    );

    parts.push(resolved);
    byPartId[part.id] = resolved;
  }

  return {
    parts,
    byPartId,

    aggregateMaximumBP: parts.reduce(
      (total, part) => total + part.maximumBP,
      0,
    ),
  };
}
