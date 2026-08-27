/*
 * Anatomy resolution.
 *
 * Stored Anatomy represents the character's permanent physical body.
 *
 * Temporary Anatomy modifications may alter that body for the purposes of the
 * current resolved state without changing the persistent character data.
 *
 * Examples:
 *
 * Stored Anatomy:
 *   arm-1
 *   arm-2
 *
 * Temporary transformation:
 *   add arm-3
 *   add arm-4
 *
 * Resolved Anatomy:
 *   arm-1
 *   arm-2
 *   arm-3
 *   arm-4
 *
 * When the temporary modifications stop applying, resolution begins again
 * from the unchanged stored Anatomy and the extra parts disappear naturally.
 *
 * This module performs structural resolution only. Body Points, morphology,
 * Critical Points, Injuries, and other Body mechanics are resolved elsewhere.
 */

import {
  applyAnatomyModification,
  applyAnatomyModifications,
} from "./modification";
import type {
  AnatomyModification,
} from "./modification";
import type {
  Anatomy,
  BodyPart,
  BodyPartId,
} from "./types";


/*
 * Resolves the character's current Anatomy.
 *
 * `storedAnatomy`
 * → permanent character state.
 *
 * `temporaryModifications`
 * → transient structural changes currently affecting the character.
 *
 * The input Anatomy is never mutated.
 *
 * Modification order is significant and is preserved exactly.
 */
export function resolveAnatomy(
  storedAnatomy: Anatomy,
  temporaryModifications: readonly AnatomyModification[] = [],
): Anatomy {
  return applyAnatomyModifications(
    storedAnatomy,
    temporaryModifications,
  );
}


/*
 * Resolves Anatomy with one additional temporary modification.
 *
 * This is primarily useful for callers incrementally constructing a temporary
 * resolved state.
 *
 * It does not modify the supplied Anatomy.
 */
export function resolveAnatomyModification(
  anatomy: Anatomy,
  modification: AnatomyModification,
): Anatomy {
  return applyAnatomyModification(
    anatomy,
    modification,
  );
}


/*
 * Finds one BodyPart in a resolved Anatomy.
 *
 * Returns undefined when the requested part does not exist.
 */
export function getBodyPart(
  anatomy: Anatomy,
  partId: BodyPartId,
): BodyPart | undefined {
  return anatomy.parts.find(
    (part) => part.id === partId,
  );
}


/*
 * Returns the direct structural children of one BodyPart.
 *
 * Children are derived from parent references rather than stored redundantly.
 */
export function getBodyPartChildren(
  anatomy: Anatomy,
  partId: BodyPartId,
): readonly BodyPart[] {
  return anatomy.parts.filter(
    (part) => part.attachment?.parentId === partId,
  );
}


/*
 * Returns the direct structural parent of one BodyPart.
 *
 * Returns undefined when:
 *
 * - the requested BodyPart does not exist;
 * - the BodyPart is an anatomical root;
 * - the Anatomy contains an invalid dangling parent reference.
 *
 * Invalid structural relationships are handled by anatomy/validation.ts.
 */
export function getBodyPartParent(
  anatomy: Anatomy,
  partId: BodyPartId,
): BodyPart | undefined {
  const part = getBodyPart(
    anatomy,
    partId,
  );

  if (
    part === undefined ||
    part.attachment === null
  ) {
    return undefined;
  }

  return getBodyPart(
    anatomy,
    part.attachment.parentId,
  );
}


/*
 * Returns every anatomical root.
 *
 * A root is any BodyPart whose attachment is explicitly null.
 *
 * Multiple roots are permitted because Anatomy is structurally a forest rather
 * than requiring every possible organism to have exactly one root.
 */
export function getAnatomyRoots(
  anatomy: Anatomy,
): readonly BodyPart[] {
  return anatomy.parts.filter(
    (part) => part.attachment === null,
  );
}


/*
 * Returns every structural ancestor of one BodyPart, beginning with its direct
 * parent and continuing toward the root.
 *
 * This helper assumes valid acyclic Anatomy. Cycle detection belongs to
 * anatomy/validation.ts.
 */
export function getBodyPartAncestors(
  anatomy: Anatomy,
  partId: BodyPartId,
): readonly BodyPart[] {
  const ancestors: BodyPart[] = [];

  let current = getBodyPart(
    anatomy,
    partId,
  );

  while (
    current !== undefined &&
    current.attachment !== null
  ) {
    const parent = getBodyPart(
      anatomy,
      current.attachment.parentId,
    );

    if (parent === undefined) {
      break;
    }

    ancestors.push(parent);
    current = parent;
  }

  return ancestors;
}


/*
 * Returns every structural descendant of one BodyPart.
 *
 * Descendants are returned in traversal order. The starting BodyPart itself is
 * not included.
 *
 * This helper assumes valid acyclic Anatomy. Cycle detection belongs to
 * anatomy/validation.ts.
 */
export function getBodyPartDescendants(
  anatomy: Anatomy,
  partId: BodyPartId,
): readonly BodyPart[] {
  const descendants: BodyPart[] = [];

  const pending = [
    ...getBodyPartChildren(
      anatomy,
      partId,
    ),
  ];

  while (pending.length > 0) {
    const part = pending.shift()!;

    descendants.push(part);

    pending.push(
      ...getBodyPartChildren(
        anatomy,
        part.id,
      ),
    );
  }

  return descendants;
}