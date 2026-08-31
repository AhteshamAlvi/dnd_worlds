/*
 * Structural Capacity — the shared physical foundation beneath durability and
 * force.
 *
 * SC is deliberately neither Body Points nor Strength Points. It is the thing
 * both are derived from, by different formulas, and keeping it as its own
 * quantity is what lets a body be tough and weak, or strong and fragile,
 * without either being a special case: BP and SP read the same underlying
 * number through different lenses.
 *
 * Nothing here migrates Body Points. BP still resolves from the transitional
 * `BodyPartDefinition.baseBP`, which deliberately disagrees with
 * `reference.structuralCapacity` per part — old Neck BP 4 against new Neck
 * reference SC 2, old Leg BP 14 against new Leg reference SC 16. That
 * disagreement is expected during a staged refactor and is not a bug to fix
 * here; the shim dies when BP is rewritten to consume SC.
 */

import type { BodyPartId } from "../anatomy/types";


/*
 * One BodyPart's resolved Structural Capacity.
 *
 * `muscularityStructuralFactor` is carried alongside the result rather than
 * discarded because it is the single lever Strength advancement operates
 * through, and being able to read it directly is what makes an advancement
 * step inspectable instead of a number that simply changed.
 */
export interface ResolvedPartStructuralCapacity {
  readonly partId: BodyPartId;

  readonly structuralCapacity: number;

  readonly muscularityStructuralFactor: number;
}


/*
 * The whole body's resolved Structural Capacity.
 *
 * `parts` carries only anatomy that is physically present, for the same reason
 * measurements does: absent anatomy is absent, not zero-valued.
 */
export interface ResolvedBodyStructuralCapacity {
  readonly parts: readonly ResolvedPartStructuralCapacity[];

  readonly byPartId: Readonly<
    Record<BodyPartId, ResolvedPartStructuralCapacity>
  >;

  readonly totalStructuralCapacity: number;
}
