/*
 * How much of a body's locomotion still works.
 *
 * Speed says how fast an intact body of this build moves. This says how much of
 * that a damaged body can currently deliver, and the two are deliberately
 * separate: a character with a ruined leg still has Speed 10 and simply cannot
 * use all of it.
 *
 *
 * CHAINS, NOT A GLOBAL FRACTION
 *
 * Locomotion resolves per limb chain and averages, rather than from a
 * whole-body figure like presentIntrinsicSP. Losing an Arm must not slow a
 * character down, and a global measure cannot tell an Arm from a Leg.
 *
 * A chain is a locomotor part plus its locomotor descendants — a Leg and the
 * Foot hanging off it. Chains are DERIVED from the anatomy tree and the
 * "locomotor" tag, never hardcoded: a hexapod resolves six chains and a
 * humanoid two, with no engine change and no assumption that legs come in
 * pairs.
 *
 * Within a chain the WEAKEST link governs, because a working leg on a
 * destroyed foot is not half a working leg. Across chains the mean applies,
 * because two legs share the work.
 *
 *   both chains whole          -> 1.00
 *   one at half, one whole     -> 0.75
 *   one unusable, one whole    -> 0.50
 *   both unusable              -> 0.00
 *
 *
 * A BODY WITH NO LOCOMOTOR ANATOMY IS NOT IMMOBILE
 *
 * A snake, a floating entity, a creature that swims with its whole body: none
 * declares a locomotor chain, and the mean of no chains is not zero, it is
 * undefined. Resolving to 1.00 says "this mechanic does not constrain you",
 * which is right — a form that moves some other way should not be paralysed by
 * a rule about legs it was never supposed to have.
 */

import { getBodyPartChildren } from "./anatomy/resolution";
import { createBodyPartDefinitionMap } from "./selectors";
import type { Anatomy, BodyPartDefinition, BodyPartId } from "./anatomy/types";
import type { ResolvedBodyCapability } from "./capability";

/** The tag marking a BodyPart as carrying the body's movement. */
export const LOCOMOTOR_TAG = "locomotor";


export interface LocomotorChain {
  readonly rootPartId: BodyPartId;
  readonly partIds: readonly BodyPartId[];

  /** The weakest link. 0 when any required part is unusable. */
  readonly fraction: number;
}


export interface ResolvedLocomotion {
  readonly chains: readonly LocomotorChain[];

  /** Mean across chains; 1 when a form declares none. */
  readonly fraction: number;
}


function isLocomotor(
  definitionsById: ReturnType<typeof createBodyPartDefinitionMap>,
  type: string,
): boolean {
  return definitionsById.get(type)?.tags.includes(LOCOMOTOR_TAG) ?? false;
}


/*
 * Finds the locomotor chains in an anatomy.
 *
 * A chain begins at a locomotor part whose parent is NOT locomotor — the Leg
 * hanging off a Lower Body — and continues through its locomotor descendants.
 * That rule needs no knowledge of what a leg is.
 */
export function resolveLocomotorChains(
  anatomy: Anatomy,
  definitions: readonly BodyPartDefinition[],
  capability: ResolvedBodyCapability,
): readonly LocomotorChain[] {
  const definitionsById = createBodyPartDefinitionMap(definitions);
  const partsById = new Map(anatomy.parts.map((part) => [part.id, part]));

  const chains: LocomotorChain[] = [];

  for (const part of anatomy.parts) {
    if (!isLocomotor(definitionsById, part.type)) continue;

    const parent =
      part.attachment === null
        ? undefined
        : partsById.get(part.attachment.parentId);

    if (parent !== undefined && isLocomotor(definitionsById, parent.type)) {
      continue;
    }

    const partIds: BodyPartId[] = [];
    const pending = [part];

    while (pending.length > 0) {
      const current = pending.shift()!;

      partIds.push(current.id);

      for (const child of getBodyPartChildren(anatomy, current.id)) {
        if (isLocomotor(definitionsById, child.type)) pending.push(child);
      }
    }

    /*
     * The weakest link. Accessibility is a hard gate — an inaccessible part
     * contributes 0 however intact it is — and effectiveness already carries
     * BP fraction with any upstream Joint penalty applied.
     */
    const fraction = partIds.reduce((weakest, partId) => {
      const resolved = capability.byPartId[partId];

      if (resolved === undefined) return 0;

      return Math.min(
        weakest,
        resolved.accessible ? resolved.effectiveness : 0,
      );
    }, 1);

    chains.push({ rootPartId: part.id, partIds, fraction });
  }

  return chains;
}


export function resolveLocomotion(
  anatomy: Anatomy,
  definitions: readonly BodyPartDefinition[],
  capability: ResolvedBodyCapability,
): ResolvedLocomotion {
  const chains = resolveLocomotorChains(anatomy, definitions, capability);

  if (chains.length === 0) return { chains, fraction: 1 };

  return {
    chains,
    fraction:
      chains.reduce((total, chain) => total + chain.fraction, 0) /
      chains.length,
  };
}
