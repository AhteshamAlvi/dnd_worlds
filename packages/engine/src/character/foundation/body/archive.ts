/*
 * Archived anatomy, and when a record stops being restorable.
 *
 * Destroyed BodyParts stay where they always were — in the anatomy store, as
 * "archived-removed" — rather than moving to a second container. There is one
 * place a BodyPart can live, and its state says what has become of it. That
 * keeps the instance's identity, its position in the tree, its attachment
 * geometry, its slot association and its point associations all intact, none
 * of which survive being copied into a parallel archive.
 *
 * "ArchivedBodyPart" and "orphaned archive" are therefore views over that one
 * store, derived on demand. Neither is a new state and neither is stored.
 *
 *
 * WHAT ORPHANED MEANS
 *
 * An archived record is orphaned when the slot it belongs to is absent from
 * the currently relevant Reference Form.
 *
 *   form contains the slot      -> the record is restorable
 *   form does not contain it    -> the record is orphaned
 *
 * A permanent mutation that removes the left-arm slot from a body plan does
 * not erase the record of the left arm that was destroyed before it. The
 * record survives, inert, and becomes relevant again if the slot ever returns.
 *
 * Orphaned records contribute nothing to the current body — no Mass, Size,
 * Height, Structural Capacity, Strength Points, Body Points, and nothing to
 * normalization. They are history, not anatomy.
 *
 * Body resolution never deletes them. Removing one requires a deliberate
 * operation — a historical purge, a character reset, a reconstruction that
 * consumes the record, a schema migration — because the whole point of
 * retention is that some later mechanic may want what happened.
 */

import { anatomySlotKey } from "./anatomy/types";
import type {
  Anatomy,
  AnatomySlotKey,
  BodyPart,
  BodyPartId,
  ReferenceAnatomySlotId,
  ReferenceForm,
  ReferenceFormId,
} from "./anatomy/types";


/*
 * One destroyed instance, seen as history.
 *
 * Every field is read off the BodyPart it describes; nothing here is stored
 * separately, which is what makes it impossible for the view and the anatomy
 * to disagree.
 */
export interface ArchivedBodyPart {
  readonly instanceId: BodyPartId;

  readonly referenceFormId: ReferenceFormId;
  readonly referenceSlotId: ReferenceAnatomySlotId;
  readonly slotKey: AnatomySlotKey;

  readonly type: BodyPart["type"];

  /*
   * Whether the slot this record belongs to still exists in the Reference Form
   * it is being judged against.
   */
  readonly orphaned: boolean;
}


/*
 * How a Reference Form slot currently stands.
 *
 * The last two are mechanically different and must not be collapsed. A slot
 * with an archived instance is anatomy that EXISTED and was lost, which
 * ordinary regeneration can rebuild from. A slot with no instance at all is
 * anatomy that has never physically existed — congenital absence, incomplete
 * development, a failed metamorphosis — and there is nothing to regenerate.
 * Growing it is a different mechanic from regrowing it.
 */
export type SlotOccupancy =
  | "active"
  | "suppressed"
  | "destroyed"
  | "never-instantiated";


export interface ResolvedSlotOccupancy {
  readonly slotKey: AnatomySlotKey;
  readonly referenceSlotId: ReferenceAnatomySlotId;

  readonly occupancy: SlotOccupancy;

  /** The instance occupying or last occupying the slot, if there ever was one. */
  readonly instanceId: BodyPartId | undefined;

  /** True only for "destroyed": there is a record ordinary regeneration can use. */
  readonly restorable: boolean;
}


function slotKeyOf(part: BodyPart): AnatomySlotKey {
  return anatomySlotKey(part.referenceFormId, part.referenceSlotId);
}


/*
 * Every archived instance in a body, with its orphan status against one form.
 *
 * Pass the currently relevant Reference Form. Orphan status is a relationship
 * between a record and a form, not a property of the record, so the same
 * archive is orphaned against one form and restorable against another — which
 * is exactly what happens when a character transforms.
 */
export function selectArchivedBodyParts(
  anatomy: Anatomy,
  referenceForm: ReferenceForm,
): readonly ArchivedBodyPart[] {
  const formSlots = new Set(
    referenceForm.parts.map((part) =>
      anatomySlotKey(referenceForm.id, part.slotId),
    ),
  );

  return anatomy.parts
    .filter((part) => part.state === "archived-removed")
    .map((part) => {
      const slotKey = slotKeyOf(part);

      return {
        instanceId: part.id,
        referenceFormId: part.referenceFormId,
        referenceSlotId: part.referenceSlotId,
        slotKey,
        type: part.type,
        orphaned: !formSlots.has(slotKey),
      };
    });
}


export function selectOrphanedArchives(
  anatomy: Anatomy,
  referenceForm: ReferenceForm,
): readonly ArchivedBodyPart[] {
  return selectArchivedBodyParts(anatomy, referenceForm).filter(
    (archived) => archived.orphaned,
  );
}


/*
 * How every slot of a Reference Form currently stands.
 *
 * Walks the FORM rather than the anatomy, so a slot nothing has ever occupied
 * appears — which is the only way "never instantiated" can be distinguished
 * from "destroyed" at all.
 */
export function resolveSlotOccupancy(
  anatomy: Anatomy,
  referenceForm: ReferenceForm,
): readonly ResolvedSlotOccupancy[] {
  const bySlot = new Map<AnatomySlotKey, BodyPart>();

  for (const part of anatomy.parts) {
    const key = slotKeyOf(part);
    const existing = bySlot.get(key);

    /*
     * An active instance always wins the slot. A slot can accumulate several
     * records over a long enough life — destroyed, regrown, destroyed again —
     * and what matters for occupancy is what is there now, with the most
     * recent record standing in when nothing is.
     */
    if (existing === undefined || part.state === "active") {
      bySlot.set(key, part);
    }
  }

  return referenceForm.parts.map((slot) => {
    const slotKey = anatomySlotKey(referenceForm.id, slot.slotId);
    const part = bySlot.get(slotKey);

    if (part === undefined) {
      return {
        slotKey,
        referenceSlotId: slot.slotId,
        occupancy: "never-instantiated" as const,
        instanceId: undefined,
        restorable: false,
      };
    }

    const occupancy: SlotOccupancy =
      part.state === "active"
        ? "active"
        : part.state === "suppressed"
          ? "suppressed"
          : "destroyed";

    return {
      slotKey,
      referenceSlotId: slot.slotId,
      occupancy,
      instanceId: part.id,
      restorable: occupancy === "destroyed",
    };
  });
}


/*
 * Whether ordinary regeneration may rebuild a particular slot.
 *
 * Four conditions, and the last two are the interesting ones: regeneration
 * cannot restore an orphaned archive, because the current form is not supposed
 * to contain that anatomy and regeneration must never add anatomy a form does
 * not have; and it cannot create a slot nothing ever occupied, because there
 * is no record to rebuild from. That second one is a creation mechanic, not a
 * restoration.
 */
export function canOrdinaryRegenerationRestore(
  anatomy: Anatomy,
  referenceForm: ReferenceForm,
  referenceSlotId: ReferenceAnatomySlotId,
): boolean {
  const slot = resolveSlotOccupancy(anatomy, referenceForm).find(
    (candidate) => candidate.referenceSlotId === referenceSlotId,
  );

  return slot?.restorable === true;
}
