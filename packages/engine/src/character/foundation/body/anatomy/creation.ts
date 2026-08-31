/*
 * Persistent Anatomy creation.
 *
 * This module converts starting body-plan data into the BodyPart instances
 * stored on a character.
 *
 * Anatomy creation is intentionally content-agnostic. It does not know about
 * species, mutations, traits, or any other source of anatomy. Those systems
 * provide BodyPartCreationSpec data and/or later Anatomy modifications.
 *
 * Newly created body parts always begin with zero stored damage and zero
 * banked recovery progress.
 */

import type {
  Anatomy,
  BodyAttachmentSiteId,
  BodyPart,
  BodyPartAttachment,
  BodyPartId,
  BodyPartTypeId,
} from "./types";


/*
 * The longitudinal coordinates assumed when a creation spec does not author
 * them: the child hangs off the far end of its parent and meets it with its
 * own near end.
 *
 * This is the ordinary proximal-to-distal chain — Neck onto the top of the
 * Upper Body, Head onto the top of the Neck, Hand onto the end of the Arm —
 * and it is the shape most anatomy actually has. Anything that branches,
 * doubles back, or meets its parent partway along says so explicitly; the
 * standard humanoid does exactly that for its Lower Body, Arms and Legs.
 *
 * Defaults exist on the CREATION spec only. The persistent BodyPartAttachment
 * requires both coordinates outright, so stored anatomy is always explicit and
 * pre-refactor Body JSON that lacks them fails validation instead of silently
 * acquiring a body plan nobody authored.
 */
export const DEFAULT_ATTACHMENT_PARENT_POSITION = 1;
export const DEFAULT_ATTACHMENT_CHILD_POSITION = 0;


/*
 * Structural attachment used while creating starting anatomy.
 *
 * parentId refers to another BodyPart instance being created as part of the
 * same Anatomy.
 */
export interface BodyPartCreationAttachment {
  readonly parentId: BodyPartId;
  readonly site?: BodyAttachmentSiteId;

  /** Defaults to DEFAULT_ATTACHMENT_PARENT_POSITION. */
  readonly parentPosition?: number;

  /** Defaults to DEFAULT_ATTACHMENT_CHILD_POSITION. */
  readonly childPosition?: number;
}


/*
 * Description of one body-part instance to create.
 *
 * Unlike BodyPart, this shape contains no damage field. Newly instantiated
 * anatomy always begins undamaged.
 *
 * IDs are supplied by the body-plan data rather than generated here. This
 * keeps creation deterministic and allows attachment references to remain
 * simple and stable.
 */
export interface BodyPartCreationSpec {
  readonly id: BodyPartId;
  readonly type: BodyPartTypeId;

  readonly name?: string;

  readonly attachment: BodyPartCreationAttachment | null;
}


/*
 * Resolves a creation attachment into the total persistent shape.
 *
 * Shared by creation and by the modification operations that rebuild an
 * attachment, so the coordinate defaults live in exactly one place.
 */
export function createBodyPartAttachment(
  attachment: BodyPartCreationAttachment,
): BodyPartAttachment {
  return {
    parentId: attachment.parentId,

    ...(attachment.site !== undefined
      ? { site: attachment.site }
      : {}),

    parentPosition:
      attachment.parentPosition ?? DEFAULT_ATTACHMENT_PARENT_POSITION,

    childPosition:
      attachment.childPosition ?? DEFAULT_ATTACHMENT_CHILD_POSITION,
  };
}


/*
 * Creates one persistent BodyPart instance from its starting specification.
 *
 * New anatomy is always "active". A body plan describes what a creature has,
 * so a part that is created is by definition present; suppression and removal
 * are things that happen to a body afterwards, and belong to the effect and
 * damage pipelines rather than to construction.
 */
export function createBodyPart(
  spec: BodyPartCreationSpec,
): BodyPart {
  return {
    id: spec.id,
    type: spec.type,
    ...(spec.name !== undefined
      ? { name: spec.name }
      : {}),
    attachment:
      spec.attachment === null
        ? null
        : createBodyPartAttachment(spec.attachment),
    state: "active",
    damage: 0,
    recoveryProgress: 0,
  };
}


/*
 * Creates a character's initial persistent Anatomy.
 *
 * This function performs construction only. Structural and content validation
 * belongs to anatomy/validation.ts.
 *
 * The order of `parts` is not mechanically significant. Parent parts therefore
 * do not need to appear before their children in the input.
 */
export function createAnatomy(
  specs: readonly BodyPartCreationSpec[],
): Anatomy {
  return {
    parts: specs.map(createBodyPart),
  };
}