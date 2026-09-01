/*
 * Persistent Anatomy modification.
 *
 * This module provides the generic structural operations used to change a
 * character's physical Anatomy.
 *
 * These operations are content-agnostic. Species, Traits, mutations,
 * transformations, Injuries, prosthetics, and other systems may request
 * Anatomy modifications, but this module does not know what caused them.
 *
 * Permanent changes may be committed to Body.anatomy.
 * The same operations may later be applied transiently during Anatomy
 * resolution without mutating the stored Anatomy.
 *
 * Structural validation belongs to anatomy/validation.ts.
 */

import {
  DEFAULT_REFERENCE_FORM_ID,
  createBodyPart,
  createBodyPartAttachment,
} from "./creation";
import type {
  BodyPartCreationAttachment,
  BodyPartCreationSpec,
} from "./creation";
import type {
  Anatomy,
  ReferenceFormId,
  BodyPart,
  BodyPartId,
  BodyPartState,
  BodyPartTypeId,
} from "./types";


/*
 * Adds one new physical body-part instance.
 *
 * The new part begins with zero stored damage.
 */
export interface AddBodyPartOperation {
  readonly kind: "add-part";
  readonly part: BodyPartCreationSpec;
}


/*
 * Removes one physical body-part instance.
 *
 * Removal always cascades through the target's complete descendant subtree.
 *
 * For example:
 *
 * arm-1
 * └── hand-1
 *
 * Removing arm-1 removes both arm-1 and hand-1.
 *
 * Descendants that should survive must be explicitly reattached before the
 * parent is removed.
 */
export interface RemoveBodyPartOperation {
  readonly kind: "remove-part";
  readonly partId: BodyPartId;
}


/*
 * Description of the new physical part created by a replacement.
 *
 * Attachment is intentionally omitted because a replacement inherits the
 * structural position of the part being replaced.
 *
 * The replacement begins with zero stored damage.
 */
export interface BodyPartReplacementSpec {
  readonly id: BodyPartId;
  readonly type: BodyPartTypeId;

  readonly name?: string;
}


/*
 * Replaces one physical body-part instance with another.
 *
 * Replacement differs from removal:
 *
 * - the replacement inherits the old part's parent attachment;
 * - direct children of the old part are transferred to the replacement;
 * - descendants therefore remain structurally connected;
 * - the replacement begins with zero stored damage.
 *
 * Example:
 *
 * upper-body
 * └── arm-1
 *     └── hand-1
 *
 * Replacing arm-1 with prosthetic-arm-1 becomes:
 *
 * upper-body
 * └── prosthetic-arm-1
 *     └── hand-1
 */
export interface ReplaceBodyPartOperation {
  readonly kind: "replace-part";
  readonly partId: BodyPartId;
  readonly replacement: BodyPartReplacementSpec;
}


/*
 * Changes the structural attachment of one existing BodyPart.
 *
 * Setting attachment to null makes the part an anatomical root.
 *
 * This operation changes structure only. It does not alter damage, type, or
 * any other persistent state on the part.
 */
export interface ReattachBodyPartOperation {
  readonly kind: "reattach-part";
  readonly partId: BodyPartId;
  readonly attachment: BodyPartCreationAttachment | null;
}


/*
 * Generic structural Anatomy operation.
 */
export type AnatomyModification =
  | AddBodyPartOperation
  | RemoveBodyPartOperation
  | ReplaceBodyPartOperation
  | ReattachBodyPartOperation;


/*
 * Returns all descendants of the requested BodyPart.
 *
 * The returned set does not include the starting part itself.
 */
export function getDescendantBodyPartIds(
  anatomy: Anatomy,
  partId: BodyPartId,
): ReadonlySet<BodyPartId> {
  const descendants = new Set<BodyPartId>();
  const pending: BodyPartId[] = [partId];

  while (pending.length > 0) {
    const parentId = pending.pop()!;

    for (const part of anatomy.parts) {
      if (part.attachment?.parentId !== parentId) {
        continue;
      }

      if (descendants.has(part.id)) {
        continue;
      }

      descendants.add(part.id);
      pending.push(part.id);
    }
  }

  return descendants;
}


/*
 * Adds one new BodyPart to an Anatomy.
 *
 * Duplicate IDs and invalid parent references are intentionally left to
 * anatomy/validation.ts so that batches of operations can be constructed and
 * validated as a complete result.
 */
export function addBodyPart(
  anatomy: Anatomy,
  spec: BodyPartCreationSpec,
  referenceFormId: ReferenceFormId = DEFAULT_REFERENCE_FORM_ID,
): Anatomy {
  return {
    parts: [
      ...anatomy.parts,
      createBodyPart(spec, referenceFormId),
    ],
  };
}


/*
 * Removes a BodyPart and every structural descendant beneath it.
 *
 * If the requested ID does not exist, the returned Anatomy is unchanged.
 * Validation of modification targets may be performed separately before or
 * after applying a modification set.
 */
export function removeBodyPart(
  anatomy: Anatomy,
  partId: BodyPartId,
): Anatomy {
  const removedIds = new Set<BodyPartId>([
    partId,
    ...getDescendantBodyPartIds(anatomy, partId),
  ]);

  return {
    parts: anatomy.parts.filter(
      (part) => !removedIds.has(part.id),
    ),
  };
}


/*
 * Replaces one BodyPart while preserving its structural position.
 *
 * Direct children of the old part are reattached to the new replacement ID.
 * Deeper descendants remain connected through those children automatically.
 *
 * If the requested part does not exist, the returned Anatomy is unchanged.
 */
export function replaceBodyPart(
  anatomy: Anatomy,
  partId: BodyPartId,
  replacement: BodyPartReplacementSpec,
): Anatomy {
  const existing = anatomy.parts.find(
    (part) => part.id === partId,
  );

  if (existing === undefined) {
    return anatomy;
  }

  const replacementPart: BodyPart = createBodyPart(
      {
      slotId: existing.referenceSlotId,
      id: replacement.id,
      type: replacement.type,

      ...(replacement.name !== undefined
      ? { name: replacement.name }
      : {}),

      /*
       * The replacement inherits the old part's structural position wholesale,
       * connection geometry included. A prosthetic arm bolts onto the same
       * shoulder at the same point along the torso the original grew from;
       * re-deriving those coordinates from the replacement's own type would
       * quietly move the joint.
       */
      attachment:
      existing.attachment === null
        ? null
        : {
            parentId: existing.attachment.parentId,

            ...(existing.attachment.site !== undefined
              ? { site: existing.attachment.site }
              : {}),

            parentPosition: existing.attachment.parentPosition,
            childPosition: existing.attachment.childPosition,
          },
    },
    existing.referenceFormId,
  );

  return {
    parts: anatomy.parts.map((part) => {
      if (part.id === partId) {
        return replacementPart;
      }

      if (part.attachment?.parentId !== partId) {
        return part;
      }

      return {
        ...part,
        attachment: {
          ...part.attachment,
          parentId: replacement.id,
        },
      };
    }),
  };
}


/*
 * Changes the structural attachment of one BodyPart.
 *
 * If the requested part does not exist, the returned Anatomy is unchanged.
 *
 * Cycles, self-parenting, and dangling parent references are not resolved here.
 * Those structural invariants belong to anatomy/validation.ts.
 */
export function reattachBodyPart(
  anatomy: Anatomy,
  partId: BodyPartId,
  attachment: BodyPartCreationAttachment | null,
): Anatomy {
  return {
    parts: anatomy.parts.map((part) => {
      if (part.id !== partId) {
        return part;
      }

      return {
        ...part,
        attachment:
          attachment === null
            ? null
            : createBodyPartAttachment(attachment),
      };
    }),
  };
}


/*
 * Adds to (or, with a negative amount, subtracts from) one BodyPart's stored
 * damage.
 *
 * Clamped at 0 — damage cannot go negative, which both upholds
 * anatomy/validation.ts's invalid-damage rule and lets this same function
 * serve future healing with a negative amount.
 *
 * If the requested part does not exist, the returned Anatomy is unchanged —
 * matching addBodyPart/removeBodyPart/replaceBodyPart's convention, and
 * letting a caller apply damage against a temporary-only BodyPart (present in
 * a resolved Anatomy but not in stored Anatomy) without special-casing it:
 * the call is simply a no-op against the tree that doesn't have that part.
 *
 * Deliberately NOT part of the AnatomyModification union: that union is
 * structural-only (see ReattachBodyPartOperation's comment) and is applied by
 * resolveAnatomy as *temporary* modifications. Persistent damage going
 * through that path would let a transient effect masquerade as accumulated
 * damage, so this is called directly by the damage pipeline instead.
 *
 * Takes the new integrity rather than an amount of damage, because deciding
 * how much integrity a hit costs needs Maximum BP, and Maximum BP is derived
 * from Structural Capacity, morphology and Constitution — none of which
 * Anatomy knows about. body/damage.ts owns that arithmetic; this function only
 * stores the answer.
 *
 * It cannot destroy a part. An integrity of 0 is not a legal stored value, so
 * a hit that would reach it is a destruction transition instead — see
 * setBodyPartState. Keeping the two operations separate is what stops a
 * rounding result from ever severing a limb.
 */
export function setBodyPartIntegrity(
  anatomy: Anatomy,
  partId: BodyPartId,
  integrity: number,
): Anatomy {
  return {
    parts: anatomy.parts.map((part) => {
      if (part.id !== partId) {
        return part;
      }

      return {
        ...part,
        integrity: Math.min(1, Math.max(0, integrity)),
      };
    }),
  };
}


/*
 * Sets one BodyPart's physical presence state.
 *
 * If the requested part does not exist, the returned Anatomy is unchanged,
 * matching the convention of every other operation in this file.
 *
 * Deliberately NOT part of the AnatomyModification union, and for the same
 * reason setBodyPartIntegrity is not: that union is structural, and is applied
 * by resolveAnatomy as *temporary* modification. Presence state is persistent
 * instance state. A destroyed Arm becoming "archived-removed" is a fact about
 * the character that outlives whatever effect was being resolved at the time,
 * and it must not be reachable through a path that a transient effect can also
 * take.
 *
 * Note what this does not touch: the Reference Form. Setting a part to
 * archived-removed says the body no longer has it, never that the body was
 * never supposed to. Rewriting the form here would shrink the Strength
 * normalization denominator alongside the numerator and make amputation cancel
 * itself out.
 */
export function setBodyPartState(
  anatomy: Anatomy,
  partId: BodyPartId,
  state: BodyPartState,
): Anatomy {
  return {
    parts: anatomy.parts.map((part) => {
      if (part.id !== partId) {
        return part;
      }

      return {
        ...part,
        state,

        /*
         * A part that leaves the body keeps no integrity. It is not damaged,
         * it is absent, and a stored fraction would invite a restoration
         * mechanic to read it as "how hurt was this when we lost it" — a
         * question the archive record does not answer. Returning to active is
         * a restoration, and restoration decides its own integrity.
         */
        integrity: state === "active" ? part.integrity : 0,
      };
    }),
  };
}


/*
 * Destroys a BodyPart and every structural descendant beneath it.
 *
 * This is what damage does when a part runs out of Body Points, and it is
 * deliberately NOT removeBodyPart. Destroyed anatomy stays in the tree as
 * "archived-removed" rather than disappearing from it, for two reasons that
 * both matter:
 *
 *   - the record is what extraordinary regeneration regrows FROM. A severed
 *     arm that was deleted is an arm nobody can put back specifically;
 *   - the Reference Form goes on expecting the part regardless, and keeping
 *     the instance beside it is what makes "supposed to have" and "actually
 *     has" two separately inspectable facts.
 *
 * The cascade is physical, not bookkeeping: severing an Arm takes the Hand
 * with it because the Hand was attached to the Arm. Descendants are archived
 * rather than deleted for the same reason the target is.
 */
export function destroyBodyPart(
  anatomy: Anatomy,
  partId: BodyPartId,
): { readonly anatomy: Anatomy; readonly archivedPartIds: readonly BodyPartId[] } {
  if (!anatomy.parts.some((part) => part.id === partId)) {
    return { anatomy, archivedPartIds: [] };
  }

  const affected = new Set<BodyPartId>([
    partId,
    ...getDescendantBodyPartIds(anatomy, partId),
  ]);

  return {
    anatomy: {
      parts: anatomy.parts.map((part) =>
        affected.has(part.id)
          ? { ...part, state: "archived-removed" as const, integrity: 0 }
          : part,
      ),
    },

    archivedPartIds: [...affected],
  };
}


/*
 * Applies one generic Anatomy modification.
 */
export function applyAnatomyModification(
  anatomy: Anatomy,
  modification: AnatomyModification,
): Anatomy {
  switch (modification.kind) {
    case "add-part":
      return addBodyPart(
        anatomy,
        modification.part,
      );

    case "remove-part":
      return removeBodyPart(
        anatomy,
        modification.partId,
      );

    case "replace-part":
      return replaceBodyPart(
        anatomy,
        modification.partId,
        modification.replacement,
      );

    case "reattach-part":
      return reattachBodyPart(
        anatomy,
        modification.partId,
        modification.attachment,
      );
  }
}


/*
 * Applies an ordered sequence of Anatomy modifications.
 *
 * Order is mechanically significant.
 *
 * For example, descendants that should survive removal of their current parent
 * may first be reattached and then the parent may be removed.
 *
 * No mutation is performed on the input Anatomy.
 */
export function applyAnatomyModifications(
  anatomy: Anatomy,
  modifications: readonly AnatomyModification[],
): Anatomy {
  return modifications.reduce(
    (current, modification) =>
      applyAnatomyModification(
        current,
        modification,
      ),
    anatomy,
  );
}