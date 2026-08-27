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
  BodyPartId,
  BodyPartTypeId,
} from "./types";


/*
 * Structural attachment used while creating starting anatomy.
 *
 * parentId refers to another BodyPart instance being created as part of the
 * same Anatomy.
 */
export interface BodyPartCreationAttachment {
  readonly parentId: BodyPartId;
  readonly site?: BodyAttachmentSiteId;
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
 * Creates one persistent BodyPart instance from its starting specification.
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
        : {
            parentId: spec.attachment.parentId,
            ...(spec.attachment.site !== undefined
              ? { site: spec.attachment.site }
              : {}),
          },
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