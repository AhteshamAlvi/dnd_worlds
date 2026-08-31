/*
 * Core Body-Point-domain value shapes.
 *
 * Body Points measure one thing: how much destruction a BodyPart can absorb
 * before it stops existing. BP is not armor, not soak, not Aura, not a global
 * health pool, and not a statement about whether the character is alive.
 *
 * BP no longer has a base value of its own. It resolves from Structural
 * Capacity — the same number Strength Points resolve from — so a body that is
 * physically tougher is physically stronger by construction rather than by two
 * authored columns agreeing to be. The old `baseBP` column is gone; the two
 * columns had already drifted apart on five of eight parts while both summed
 * to 100 and hid it.
 *
 * The dependency direction is one-way and load-bearing:
 *
 *   Morphology -> Measurements -> Structure -> BP
 *
 * BP consumes resolved Structural Capacity and resolved morphology factors. It
 * must never compute morphology itself, and it must never feed anything back
 * into Structural Capacity.
 */

import type {
  BodyPartId,
  BodyPartTypeId,
} from "../anatomy/types";
import type {
  BodyPartSelector,
} from "../selectors";


/*
 * Multiplies how hard existing structure is to destroy.
 *
 * The single BP modifier operation, and deliberately the only one. The old
 * vocabulary also had an additive `adjust-base-bp` for training and Traits
 * that "permanently strengthen particular anatomy" — that has no home any
 * more, and its absence is the point. A body that is genuinely tougher is
 * tougher because it is bigger, thicker, or better muscled, so it should say
 * so through Scale, Bulk or Muscularity and let SC carry the consequence into
 * BP, Strength, Mass and Size together. Adding BP directly would have made a
 * character durable without making them heavy, large, or strong.
 *
 * What survives here is the genuinely exceptional case: an effect that changes
 * how difficult existing structure is to break WITHOUT changing the structure.
 * Stone skin, a hardening technique, a supernatural ward.
 */
export interface ModifyDestructionResistanceOperation {
  readonly kind: "modify-destruction-resistance";
  readonly multiplier: number;
}


export type BodyPointOperation = ModifyDestructionResistanceOperation;


/*
 * One generic Body Point modifier.
 *
 * The selector determines which resolved BodyPart instances receive the
 * operation. The Body Point system does not need to know whether a modifier
 * came from a Species, Trait, Skill, Technique, Condition, or anywhere else.
 */
export interface BodyPointModifier {
  readonly selector: BodyPartSelector;
  readonly operation: BodyPointOperation;
}


/*
 * Combined BP-modifier values resolved for one BodyPart.
 *
 * With no applicable modifiers, destructionResistance is 1.
 */
export interface ResolvedBodyPointModifiers {
  readonly destructionResistance: number;
}


/*
 * Full Body Point resolution for one BodyPart.
 *
 * Resolution order:
 *
 *   structuralCapacity          from body/structure/
 *        x
 *   buildFactor                 Bulk and Adiposity, additive within the factor
 *        x
 *   constitutionMultiplier      2^((CON - 10) / 2)
 *        x
 *   destructionResistance       exceptional effects only
 *        v
 *   rawMaximumBP
 *        v
 *   round, floored at 1
 *        v
 *   maximumBP
 *        x
 *   integrity                   persistent state on the BodyPart
 *        v
 *   exactCurrentBP
 *        v
 *   round half up, floored at 1
 *        v
 *   currentBP                   what a character sheet shows
 *
 * There is no `destroyed` field, and its absence is deliberate. Destruction
 * used to be "Current BP reached 0", which made it a rounding outcome — a part
 * could be destroyed by arithmetic nobody applied. It is now an explicit
 * anatomy state transition owned by damage application, so resolution only
 * ever describes parts that are still here. A destroyed part is not resolved
 * with zeroes; it is absent, the same way it is absent from Size, Mass, Height
 * and Strength Points.
 */
export interface ResolvedBodyPartBP {
  readonly partId: BodyPartId;
  readonly type: BodyPartTypeId;

  readonly structuralCapacity: number;

  readonly buildFactor: number;
  readonly constitutionMultiplier: number;
  readonly destructionResistance: number;

  readonly rawMaximumBP: number;
  readonly maximumBP: number;

  readonly integrity: number;

  readonly exactCurrentBP: number;
  readonly currentBP: number;
}


/*
 * Complete resolved Body Point state for the current Anatomy.
 *
 * `parts` covers active anatomy only. Suppressed and archived-removed parts
 * have left the body and have no Body Points, in the same way they have no
 * mass.
 *
 * `aggregateMaximumBP` is descriptive and diagnostic. It must not be treated
 * as a global combat health pool — BP is per-part, and a character does not
 * die because a sum reached zero.
 */
export interface ResolvedBodyPoints {
  readonly parts: readonly ResolvedBodyPartBP[];

  readonly byPartId: Readonly<Record<BodyPartId, ResolvedBodyPartBP>>;

  readonly aggregateMaximumBP: number;
}
