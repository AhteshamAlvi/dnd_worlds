/*
 * Core Body-Point-domain value shapes.
 *
 * Body Points represent the underlying physical value of individual BodyParts.
 *
 * BP serves two related purposes:
 *
 * - structural durability against penetrating physical damage;
 * - the underlying physical value consumed by later strengthening mechanics.
 *
 * BP is not armor, soak, Aura, a global health pool, or a direct measure of
 * whether the character is alive.
 *
 * Maximum BP is derived rather than stored.
 * Persistent BodyPart state stores accumulated damage.
 */

import type {
  BodyPartId,
  BodyPartTypeId,
} from "../anatomy/types";
import type {
  BodyPartSelector,
} from "../selectors";


/*
 * Adds directly to a BodyPart's Base BP.
 *
 * Additive Base-BP adjustments occur after morphology and before Constitution.
 *
 * Typical uses include:
 *
 * - physical training;
 * - species/body modifications;
 * - Traits that permanently strengthen particular anatomy.
 *
 * Example:
 *
 * Human leg template Base BP: 14
 * Training adjustment:        +6
 *
 * Resolved Base BP before CON: 20
 */
export interface AdjustBaseBPOperation {
  readonly kind: "adjust-base-bp";
  readonly amount: number;
}


/*
 * Multiplies BP after Base BP has been resolved and Constitution has applied.
 *
 * This is intentionally distinct from adjust-base-bp.
 *
 * True multipliers represent mechanics that multiply the already-developed
 * physical value of the BodyPart rather than changing its underlying Base BP.
 */
export interface MultiplyBPOperation {
  readonly kind: "multiply-bp";
  readonly multiplier: number;
}


/*
 * Generic BP operation contributed by data-driven content.
 */
export type BodyPointOperation =
  | AdjustBaseBPOperation
  | MultiplyBPOperation;


/*
 * One generic Body Point modifier.
 *
 * The selector determines which resolved BodyPart instances receive the
 * operation.
 *
 * The Body Point system does not need to know whether the modifier originated
 * from a Species, Trait, Skill, Technique, training system, Condition, or
 * another source.
 */
export interface BodyPointModifier {
  readonly selector: BodyPartSelector;
  readonly operation: BodyPointOperation;
}


/*
 * Combined BP-modifier values resolved for one BodyPart.
 *
 * Additive Base-BP modifiers are summed.
 * True BP multipliers are multiplied together.
 *
 * With no applicable modifiers:
 *
 * additiveBaseBP = 0
 * multiplier     = 1
 */
export interface ResolvedBodyPointModifiers {
  readonly additiveBaseBP: number;
  readonly multiplier: number;
}


/*
 * Character-wide values used while resolving morphology.
 *
 * These values are useful for diagnostics and tracing and prevent each
 * BodyPart from independently recalculating the same character-wide values.
 *
 * heightRatio:
 *
 *   actual height / reference height
 *
 * buildMassFactor:
 *
 *   expected relative mass contribution from structural mass, muscularity,
 *   and adiposity.
 *
 * expectedMassKg:
 *
 *   predicted mass for the character's height and stated build.
 *
 * residualMassRatio:
 *
 *   actual mass / expected mass
 *
 * residualMassFactor:
 *
 *   the softened residual-mass factor used by individual BodyParts before
 *   their own mass sensitivities are applied.
 */
export interface MorphologyContext {
  readonly heightRatio: number;

  readonly buildMassFactor: number;

  readonly expectedMassKg: number;

  readonly residualMassRatio: number;
  readonly residualMassFactor: number;
}


/*
 * Morphology factors resolved for one BodyPart.
 *
 * Each factor is centered on 1:
 *
 * 1
 * → no change from reference morphology.
 *
 * > 1
 * → increases the part's morphology-adjusted Base BP.
 *
 * < 1
 * → decreases the part's morphology-adjusted Base BP.
 *
 * combinedMultiplier is the product of all four factors.
 */
export interface BodyPartMorphologyFactors {
  readonly height: number;
  readonly mass: number;
  readonly muscularity: number;
  readonly adiposity: number;

  readonly combinedMultiplier: number;
}


/*
 * Complete morphology result for one BodyPart.
 *
 * `templateBaseBP` is taken from its BodyPartDefinition.
 *
 * `morphologyAdjustedBaseBP` is:
 *
 * templateBaseBP × factors.combinedMultiplier
 *
 * No rounding occurs at this stage.
 */
export interface ResolvedBodyPartMorphology {
  readonly partId: BodyPartId;
  readonly type: BodyPartTypeId;

  readonly templateBaseBP: number;

  readonly factors: BodyPartMorphologyFactors;

  readonly morphologyAdjustedBaseBP: number;
}


/*
 * Complete morphology resolution for a character.
 *
 * The character-wide context is calculated once and reused across all parts.
 */
export interface ResolvedMorphology {
  readonly context: MorphologyContext;

  readonly parts: readonly ResolvedBodyPartMorphology[];
}


/*
 * Full Body Point resolution trace for one BodyPart.
 *
 * Resolution order:
 *
 * templateBaseBP
 *      ×
 * morphologyMultiplier
 *      ↓
 * morphologyAdjustedBaseBP
 *      +
 * additiveBaseBPAdjustment
 *      ↓
 * resolvedBaseBP
 *      ×
 * constitutionMultiplier
 *      ↓
 * constitutionScaledBP
 *      ×
 * trueMultiplier
 *      ↓
 * rawMaximumBP
 *      ↓
 * final rounding
 *      ↓
 * maximumBP
 *      -
 * stored damage
 *      ↓
 * currentBP
 *
 * `damage` is persistent character state copied into the resolved result for
 * convenience. It is not clamped to maximumBP.
 *
 * `destroyed` becomes true when currentBP reaches 0. Reaching that threshold
 * means the BodyPart has been physically destroyed and must be permanently
 * removed from Anatomy through the Anatomy modification pipeline.
 */
export interface ResolvedBodyPartBP {
  readonly partId: BodyPartId;
  readonly type: BodyPartTypeId;

  readonly templateBaseBP: number;

  readonly morphology: BodyPartMorphologyFactors;
  readonly morphologyAdjustedBaseBP: number;

  readonly additiveBaseBPAdjustment: number;
  readonly resolvedBaseBP: number;

  readonly constitutionMultiplier: number;
  readonly constitutionScaledBP: number;

  readonly trueMultiplier: number;

  readonly rawMaximumBP: number;
  readonly maximumBP: number;

  readonly damage: number;
  readonly currentBP: number;

  readonly destroyed: boolean;
}


/*
 * Complete resolved Body Point state for the current Anatomy.
 *
 * BP remains fundamentally per-body-part. `aggregateMaximumBP` is exposed as a
 * useful descriptive/diagnostic value and must not be treated as a global
 * combat health pool.
 *
 * `destroyedPartIds` identifies parts whose resolved Current BP has reached 0.
 * Damage application can use this result to trigger permanent Anatomy removal.
 */
export interface ResolvedBodyPoints {
  readonly parts: readonly ResolvedBodyPartBP[];

  readonly aggregateMaximumBP: number;

  readonly destroyedPartIds: readonly BodyPartId[];
}