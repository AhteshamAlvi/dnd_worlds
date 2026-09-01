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

import {
  continuityIntegrity,
  isContinuityDestroyed,
} from "../continuity";
import type { ContinuityStates } from "../continuity";
import { continuityKey } from "./types";
import type {
  Anatomy,
  ContinuityKey,
  ReferenceFormAttachment,
  ReferenceFormPart,
  ReferenceAnatomySlotId,
  ReferenceFormId,
  BodyAttachmentSiteId,
  BodyPart,
  BodyPartAttachment,
  BodyPartId,
  BodyPartTypeId,
  ReferenceForm,
} from "./types";


/*
 * The Reference Form id used when a body plan does not name one.
 *
 * Slots are namespaced by form so that a Human left-arm can never silently
 * match a Dragon left-foreleg. A body plan built without a form still needs a
 * namespace to live in, and this is it.
 */
export const DEFAULT_REFERENCE_FORM_ID = "default";


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
  /*
   * The anatomical position this part occupies. Defaults to the instance id,
   * which is correct for a body plan where each entry is its own position.
   */
  readonly slotId?: ReferenceAnatomySlotId;

  readonly id: BodyPartId;
  readonly type: BodyPartTypeId;

  /*
   * What this anatomy persistently is, across forms and regenerations.
   * Defaults to a key derived from the form and slot — see createBodyPart.
   */
  readonly continuityKey?: ContinuityKey;

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
 * New anatomy is always "active" and always at full integrity. A body plan
 * describes what a creature has, so a part that is created is by definition
 * present and whole; suppression, removal and damage are things that happen to
 * a body afterwards, and belong to the effect and damage pipelines rather than
 * to construction.
 */
export function createBodyPart(
  spec: BodyPartCreationSpec,
  referenceFormId: ReferenceFormId,
): BodyPart {
  return {
    id: spec.id,
    type: spec.type,
    referenceFormId,

    /*
     * A spec that names no continuity identity gets one derived from its slot.
     *
     * That is right for a one-off body plan where each position is its own
     * identity, and wrong for anything that has to correspond across forms —
     * which is why every authored Reference Form states it outright. Derived
     * keys are namespaced by form so two unrelated plans can never collide
     * into an accidental correspondence.
     */
    continuityKey:
      spec.continuityKey ??
      continuityKey(`${referenceFormId}:${spec.slotId ?? spec.id}`),

    /*
     * A creation spec that names no slot uses its own instance id as one. That
     * is right for a body plan authored as a flat list of parts, where each
     * entry IS an anatomical position; anatomy that genuinely reuses a slot —
     * a replacement limb occupying the same position — says so explicitly.
     */
    referenceSlotId: spec.slotId ?? spec.id,
    ...(spec.name !== undefined
      ? { name: spec.name }
      : {}),
    attachment:
      spec.attachment === null
        ? null
        : createBodyPartAttachment(spec.attachment),
    state: "active",
    integrity: 1,
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
  referenceFormId: ReferenceFormId = DEFAULT_REFERENCE_FORM_ID,
): Anatomy {
  return {
    parts: specs.map((spec) => createBodyPart(spec, referenceFormId)),
  };
}

/*
 * Creates the Reference Form a body plan describes.
 *
 * Derived from the SPECS rather than from a live Anatomy, and that is the
 * whole point. The Reference Form says what a body is supposed to contain, so
 * reading it off the parts a character currently has would make it agree with
 * damage — and a form that shrinks alongside the body is not a reference at
 * all. A Human who loses both Arms is still a Human-shaped form that expects
 * them, which is exactly what makes amputation lower Strength instead of
 * cancelling itself out.
 *
 * A Reference Form changes only when the intended body plan changes: Species
 * anatomy, ordinary age development, permanent anatomy modification, or an
 * active form-replacing transformation. Never because of damage.
 */
export function createReferenceForm(
  specs: readonly BodyPartCreationSpec[],
  referenceFormId: ReferenceFormId = DEFAULT_REFERENCE_FORM_ID,
): ReferenceForm {
  /*
   * Attachments are expressed between SLOTS in a form, and the specs express
   * them between instance ids, so parents are translated on the way through.
   * A spec whose parent is not in the same list keeps its id as a slot id —
   * form validation is what reports that, not construction.
   */
  const slotIdByInstanceId = new Map(
    specs.map((spec) => [spec.id, spec.slotId ?? spec.id] as const),
  );

  return {
    id: referenceFormId,

    parts: specs.map((spec): ReferenceFormPart => {
      const slotId = spec.slotId ?? spec.id;

      const attachment: ReferenceFormAttachment | null =
        spec.attachment === null
          ? null
          : {
              parentSlotId:
                slotIdByInstanceId.get(spec.attachment.parentId) ??
                spec.attachment.parentId,
              ...(spec.attachment.site !== undefined
                ? { site: spec.attachment.site }
                : {}),
              parentPosition:
                spec.attachment.parentPosition ??
                DEFAULT_ATTACHMENT_PARENT_POSITION,
              childPosition:
                spec.attachment.childPosition ??
                DEFAULT_ATTACHMENT_CHILD_POSITION,
            };

      return {
        slotId,
        type: spec.type,
        continuityKey:
          spec.continuityKey ?? continuityKey(`${referenceFormId}:${slotId}`),
        ...(spec.name !== undefined ? { name: spec.name } : {}),
        attachment,
      };
    }),
  };
}


/*
 * Builds the anatomy a form and a character's persistent state produce
 * together.
 *
 * This is where the two halves meet, and it is the reason anatomy is no longer
 * stored:
 *
 *   ReferenceForm      what a body of this kind is arranged like
 *   ContinuityStates   what has become of THIS body
 *   -> Anatomy         the instances that exist right now
 *
 * Deriving it means a character cannot carry anatomy their current form does
 * not have. Storing it alongside the form is what let a transformed body keep
 * its old limbs.
 *
 *
 * DESTRUCTION IS INSTANTIATED, NOT OMITTED
 *
 * A destroyed identity still produces a BodyPart, as "archived-removed". The
 * alternative — leaving it out entirely — would lose the record that this body
 * is missing something, which is exactly what archive.ts reports and what
 * regeneration needs to find. Every physical resolver already skips non-active
 * anatomy, so an archived part costs nothing but stays visible.
 *
 * Destruction cascades down the blueprint: anatomy hanging off something that
 * is gone is gone too, because there is nothing left holding it on.
 */
export function instantiateAnatomy(
  form: ReferenceForm,
  continuity: ContinuityStates,
  instanceIdFor: (part: ReferenceFormPart) => BodyPartId = (part) => part.slotId,
): Anatomy {
  const childrenBySlot = new Map<ReferenceAnatomySlotId, ReferenceFormPart[]>();

  for (const part of form.parts) {
    if (part.attachment === null) continue;

    const siblings = childrenBySlot.get(part.attachment.parentSlotId) ?? [];

    siblings.push(part);
    childrenBySlot.set(part.attachment.parentSlotId, siblings);
  }

  /* Every slot that is absent, whether in its own right or because whatever
   * carried it is. */
  const absent = new Set<ReferenceAnatomySlotId>();

  const markAbsent = (part: ReferenceFormPart): void => {
    if (absent.has(part.slotId)) return;

    absent.add(part.slotId);

    for (const child of childrenBySlot.get(part.slotId) ?? []) {
      markAbsent(child);
    }
  };

  for (const part of form.parts) {
    if (isContinuityDestroyed(continuity, part.continuityKey)) markAbsent(part);
  }

  const instanceIdBySlot = new Map<ReferenceAnatomySlotId, BodyPartId>(
    form.parts.map((part) => [part.slotId, instanceIdFor(part)] as const),
  );

  return {
    parts: form.parts.map((part): BodyPart => {
      const gone = absent.has(part.slotId);

      return {
        id: instanceIdBySlot.get(part.slotId) ?? part.slotId,
        type: part.type,
        referenceFormId: form.id,
        referenceSlotId: part.slotId,
        continuityKey: part.continuityKey,
        ...(part.name !== undefined ? { name: part.name } : {}),
        attachment:
          part.attachment === null
            ? null
            : {
                parentId:
                  instanceIdBySlot.get(part.attachment.parentSlotId) ??
                  part.attachment.parentSlotId,
                ...(part.attachment.site !== undefined
                  ? { site: part.attachment.site }
                  : {}),
                parentPosition: part.attachment.parentPosition,
                childPosition: part.attachment.childPosition,
              },
        state: gone ? "archived-removed" : "active",

        /*
         * Anatomy that is not present carries no fraction — it is absent, not
         * damaged. anatomy/validation.ts enforces that, and it is the same rule
         * setBodyPartState applies to a part leaving the body.
         */
        integrity: gone
          ? 0
          : continuityIntegrity(continuity, part.continuityKey),
      };
    }),
  };
}
