/*
 * Body Point resolution.
 *
 * This module combines:
 *
 * - resolved morphology;
 * - additive Base-BP modifiers;
 * - Constitution scaling;
 * - true BP multipliers;
 * - stored BodyPart damage;
 *
 * into the final resolved Body Point state of each BodyPart.
 *
 * Resolution order:
 *
 * template Base BP
 *      ×
 * morphology
 *      ↓
 * morphology-adjusted Base BP
 *      +
 * additive Base-BP modifiers
 *      ↓
 * resolved Base BP
 *      ×
 * Constitution multiplier
 *      ↓
 * Constitution-scaled BP
 *      ×
 * true BP multipliers
 *      ↓
 * raw Maximum BP
 *      ↓
 * round once
 *      ↓
 * Maximum BP
 *      -
 * stored damage
 *      ↓
 * Current BP
 *
 * A BodyPart whose Current BP reaches 0 is physically destroyed.
 *
 * This resolver reports destruction but does not mutate Anatomy. The caller
 * responsible for applying persistent damage must remove destroyed BodyParts
 * through the Anatomy modification system.
 */

import type {
  Anatomy,
  BodyPart,
  BodyPartId,
} from "../anatomy/types";
import {
  resolveBodyPointModifiersByPart,
} from "./modifiers";
import type {
  BodyPointModifier,
  ResolvedBodyPartBP,
  ResolvedBodyPartMorphology,
  ResolvedBodyPointModifiers,
  ResolvedBodyPoints,
  ResolvedMorphology,
} from "./types";


/*
 * Constitution reference used by Body Point scaling.
 *
 * CON 10:
 * ×1 BP
 *
 * Every +5 CON doubles BP.
 * Every -5 CON halves BP.
 */
export const REFERENCE_CONSTITUTION = 10;
export const CONSTITUTION_DOUBLING_INTERVAL = 5;


/*
 * Resolves the Constitution BP multiplier.
 *
 * Formula:
 *
 * 2 ^ ((CON - 10) / 5)
 *
 * Examples:
 *
 * CON 5  → ×0.5
 * CON 10 → ×1
 * CON 15 → ×2
 * CON 20 → ×4
 * CON 25 → ×8
 * CON 30 → ×16
 * CON 35 → ×32
 */
export function getConstitutionBPMultiplier(
  constitution: number,
): number {
  return Math.pow(
    2,
    (
      constitution -
      REFERENCE_CONSTITUTION
    ) /
      CONSTITUTION_DOUBLING_INTERVAL,
  );
}


/*
 * Performs the one and only rounding step in BP derivation.
 *
 * Intermediate morphology, modifier, and Constitution values remain at full
 * precision.
 *
 * Every existing BP-bearing BodyPart has a minimum resolved Maximum BP of 1.
 */
export function roundMaximumBP(
  rawMaximumBP: number,
): number {
  return Math.max(
    1,
    Math.round(rawMaximumBP),
  );
}


/*
 * Returns Current BP from Maximum BP and persistent stored damage.
 *
 * Damage itself is never clamped. It may exceed Maximum BP.
 *
 * Example:
 *
 * Maximum BP = 14
 * Damage     = 20
 *
 * Current BP = 0
 *
 * The stored Damage remains 20.
 */
export function getCurrentBP(
  maximumBP: number,
  damage: number,
): number {
  return Math.max(
    0,
    maximumBP - damage,
  );
}


/*
 * Creates a morphology lookup keyed by actual BodyPart instance ID.
 *
 * Duplicate morphology results should have been rejected during validation.
 */
function createMorphologyMap(
  morphology: ResolvedMorphology,
): ReadonlyMap<
  BodyPartId,
  ResolvedBodyPartMorphology
> {
  return new Map(
    morphology.parts.map(
      (part) => [
        part.partId,
        part,
      ],
    ),
  );
}


/*
 * Resolves complete BP state for one BodyPart.
 *
 * This function assumes its inputs have already passed Body Point validation.
 */
export function resolveBodyPartBP(
  part: BodyPart,
  morphology:
    ResolvedBodyPartMorphology,
  modifiers:
    ResolvedBodyPointModifiers,
  constitutionMultiplier: number,
): ResolvedBodyPartBP {
  /*
   * Additive Base-BP effects occur after morphology.
   */
  const resolvedBaseBP =
    morphology.morphologyAdjustedBaseBP +
    modifiers.additiveBaseBP;

  if (
    !Number.isFinite(resolvedBaseBP) ||
    resolvedBaseBP <= 0
  ) {
    throw new Error(
      `Cannot resolve BP for BodyPart "${part.id}": ` +
      `resolved Base BP must be finite and greater than 0.`,
    );
  }

  /*
   * Constitution scales the resolved physical base.
   */
  const constitutionScaledBP =
    resolvedBaseBP *
    constitutionMultiplier;

  /*
   * True BP multipliers occur after Constitution.
   */
  const rawMaximumBP =
    constitutionScaledBP *
    modifiers.multiplier;

  if (
    !Number.isFinite(rawMaximumBP) ||
    rawMaximumBP <= 0
  ) {
    throw new Error(
      `Cannot resolve BP for BodyPart "${part.id}": ` +
      `raw Maximum BP must be finite and greater than 0.`,
    );
  }

  /*
   * BP is rounded only after the complete derivation.
   */
  const maximumBP =
    roundMaximumBP(
      rawMaximumBP,
    );

  const currentBP =
    getCurrentBP(
      maximumBP,
      part.damage,
    );

  /*
   * 0 BP is the hard physical-destruction threshold.
   */
  const destroyed =
    currentBP === 0;

  return {
    partId: part.id,
    type: part.type,

    templateBaseBP:
      morphology.templateBaseBP,

    morphology:
      morphology.factors,

    morphologyAdjustedBaseBP:
      morphology.morphologyAdjustedBaseBP,

    additiveBaseBPAdjustment:
      modifiers.additiveBaseBP,

    resolvedBaseBP,

    constitutionMultiplier,
    constitutionScaledBP,

    trueMultiplier:
      modifiers.multiplier,

    rawMaximumBP,
    maximumBP,

    damage:
      part.damage,

    currentBP,

    destroyed,
  };
}


/*
 * Resolves complete per-part Body Point state for the current Anatomy.
 *
 * `anatomy`
 * should normally be the current Resolved Anatomy.
 *
 * `morphology`
 * should have been resolved from that exact same Anatomy.
 *
 * `constitution`
 * is supplied independently because CON belongs to the character's Attributes,
 * not to Body.
 *
 * `modifiers`
 * may originate from any data-driven source such as training, Species, Traits,
 * Conditions, Techniques, or other mechanics.
 *
 * The function assumes all supplied data has already passed validation.
 */
export function resolveBodyPoints(
  anatomy: Anatomy,
  morphology: ResolvedMorphology,
  constitution: number,
  modifiers: readonly BodyPointModifier[] = [],
): ResolvedBodyPoints {
  const constitutionMultiplier =
    getConstitutionBPMultiplier(
      constitution,
    );

  if (
    !Number.isFinite(
      constitutionMultiplier,
    ) ||
    constitutionMultiplier <= 0
  ) {
    throw new Error(
      "Cannot resolve Body Points: Constitution produced an invalid BP multiplier.",
    );
  }

  const morphologyByPart =
    createMorphologyMap(
      morphology,
    );

  const modifiersByPart =
    resolveBodyPointModifiersByPart(
      anatomy.parts,
      modifiers,
    );

  const parts =
    anatomy.parts.map(
      (part): ResolvedBodyPartBP => {
        const partMorphology =
          morphologyByPart.get(
            part.id,
          );

        if (
          partMorphology === undefined
        ) {
          throw new Error(
            `Cannot resolve BP for BodyPart "${part.id}": ` +
            "missing resolved morphology.",
          );
        }

        const partModifiers =
          modifiersByPart.get(
            part.id,
          );

        if (
          partModifiers === undefined
        ) {
          throw new Error(
            `Cannot resolve BP for BodyPart "${part.id}": ` +
            "missing resolved BP modifiers.",
          );
        }

        return resolveBodyPartBP(
          part,
          partMorphology,
          partModifiers,
          constitutionMultiplier,
        );
      },
    );

  const aggregateMaximumBP =
    parts.reduce(
      (total, part) =>
        total + part.maximumBP,
      0,
    );

  const destroyedPartIds =
    parts
      .filter(
        (part) => part.destroyed,
      )
      .map(
        (part) => part.partId,
      );

  return {
    parts,
    aggregateMaximumBP,
    destroyedPartIds,
  };
}