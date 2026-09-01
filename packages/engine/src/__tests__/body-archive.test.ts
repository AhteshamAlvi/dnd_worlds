/*
 * Slot identity and archived anatomy.
 *
 * Three identities do three jobs and none can cover for another:
 *
 *   BodyPartTypeId          what KIND of part           "arm"
 *   ReferenceAnatomySlotId  which POSITION it occupies  "left-arm"
 *   BodyPartId              which INSTANCE is there     "arm-1"
 *
 * Everything here follows from the middle one existing. A slot outlives the
 * tissue occupying it, which is what lets a record point back at somewhere,
 * lets this character's own morphology survive regeneration, and lets
 * "orphaned" be a relationship rather than a state.
 */

import { describe, expect, it } from "vitest";

import { createAnatomy, createReferenceForm } from "../character/foundation/body/anatomy/creation";
import { setBodyPartState } from "../character/foundation/body/anatomy/modification";
import { anatomySlotKey } from "../character/foundation/body/anatomy/types";
import {
  canOrdinaryRegenerationRestore,
  resolveSlotOccupancy,
  selectArchivedBodyParts,
  selectOrphanedArchives,
} from "../character/foundation/body/archive";
import type { Anatomy, ReferenceForm } from "../character/foundation/body/anatomy/types";
import { getSpeciesDefinition } from "../character/identity/species";
import { HUMAN_AGE_PROFILE } from "../character/foundation/body/age/human-age-profile";
import { HUMAN_STATURE_BANDS } from "../character/foundation/body/stature/human-stature-bands";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";

const SPECS = [
  { id: "torso-1", slotId: "torso", type: "upper-body", attachment: null },
  { id: "arm-1", slotId: "left-arm", type: "arm", attachment: { parentId: "torso-1" } },
  { id: "arm-2", slotId: "right-arm", type: "arm", attachment: { parentId: "torso-1" } },
] as const;

const HUMAN_FORM = createReferenceForm(SPECS, "HumanForm");
const ANATOMY = createAnatomy(SPECS, "HumanForm");

/** The same form with the left arm no longer part of the body plan. */
const ARMLESS_FORM: ReferenceForm = {
  id: "HumanForm",
  parts: HUMAN_FORM.parts.filter((part) => part.slotId !== "left-arm"),
};

function destroy(anatomy: Anatomy, id: string): Anatomy {
  return setBodyPartState(anatomy, id, "archived-removed");
}


describe("slot identity", () => {
  it("separates position from instance and from type", () => {
    const arm = ANATOMY.parts.find((part) => part.id === "arm-1");

    expect(arm?.type).toBe("arm");
    expect(arm?.referenceSlotId).toBe("left-arm");
    expect(arm?.referenceFormId).toBe("HumanForm");
  });

  /*
   * Two Arms share one BodyPartDefinition and occupy different positions.
   * Without slots there is nothing to say that with.
   */
  it("gives same-type parts distinct positions", () => {
    const slots = ANATOMY.parts.map((part) => part.referenceSlotId);

    expect(new Set(slots).size).toBe(slots.length);
    expect(slots).toContain("left-arm");
    expect(slots).toContain("right-arm");
  });

  /*
   * Namespacing is what stops a destroyed Human Arm matching a Dragon
   * foreleg. Equivalence between forms is a transformation's business to
   * declare, never something generic resolution infers from a shared type.
   */
  it("namespaces slots by form", () => {
    expect(anatomySlotKey("HumanForm", "left-arm")).toBe("HumanForm:left-arm");
    expect(anatomySlotKey("DragonForm", "left-arm")).not.toBe(
      anatomySlotKey("HumanForm", "left-arm"),
    );
  });
});


describe("archives are a view, not a container", () => {
  it("leaves a destroyed part in the anatomy store", () => {
    const damaged = destroy(ANATOMY, "arm-1");

    expect(damaged.parts).toHaveLength(3);
    expect(
      damaged.parts.find((part) => part.id === "arm-1")?.state,
    ).toBe("archived-removed");
  });

  it("derives the archive from state rather than storing one", () => {
    const archived = selectArchivedBodyParts(destroy(ANATOMY, "arm-1"), HUMAN_FORM);

    expect(archived).toHaveLength(1);
    expect(archived[0]?.instanceId).toBe("arm-1");
    expect(archived[0]?.referenceSlotId).toBe("left-arm");
    expect(archived[0]?.slotKey).toBe("HumanForm:left-arm");
  });

  it("keeps the instance's tree position and geometry", () => {
    const arm = destroy(ANATOMY, "arm-1").parts.find((p) => p.id === "arm-1");

    expect(arm?.attachment?.parentId).toBe("torso-1");
  });
});


describe("orphaned is a relationship, not a state", () => {
  const damaged = destroy(ANATOMY, "arm-1");

  it("is not orphaned while the form still expects the slot", () => {
    expect(selectArchivedBodyParts(damaged, HUMAN_FORM)[0]?.orphaned).toBe(false);
    expect(selectOrphanedArchives(damaged, HUMAN_FORM)).toEqual([]);
  });

  /*
   * A permanent change to the body plan does not erase what happened before
   * it. The record survives, inert, against a form that no longer has anywhere
   * to put it.
   */
  it("becomes orphaned when the slot leaves the form", () => {
    const orphans = selectOrphanedArchives(damaged, ARMLESS_FORM);

    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.referenceSlotId).toBe("left-arm");
  });

  it("becomes relevant again if the slot returns", () => {
    expect(selectOrphanedArchives(damaged, ARMLESS_FORM)).toHaveLength(1);
    expect(selectOrphanedArchives(damaged, HUMAN_FORM)).toHaveLength(0);
  });

  /*
   * The same record judged against two forms gives two answers, because the
   * question is about the pair. Nothing about the archive itself changed.
   */
  it("gives different answers for the same record against different forms", () => {
    const againstHuman = selectArchivedBodyParts(damaged, HUMAN_FORM)[0];
    const againstArmless = selectArchivedBodyParts(damaged, ARMLESS_FORM)[0];

    expect(againstHuman?.instanceId).toBe(againstArmless?.instanceId);
    expect(againstHuman?.orphaned).toBe(false);
    expect(againstArmless?.orphaned).toBe(true);
  });
});


describe("slot occupancy", () => {
  it("reports an intact body as fully occupied", () => {
    for (const slot of resolveSlotOccupancy(ANATOMY, HUMAN_FORM)) {
      expect(slot.occupancy).toBe("active");
      expect(slot.restorable).toBe(false);
    }
  });

  it("distinguishes suppressed from destroyed", () => {
    const suppressed = setBodyPartState(ANATOMY, "arm-1", "suppressed");

    const bySlot = (anatomy: Anatomy, slotId: string) =>
      resolveSlotOccupancy(anatomy, HUMAN_FORM).find(
        (slot) => slot.referenceSlotId === slotId,
      );

    expect(bySlot(suppressed, "left-arm")?.occupancy).toBe("suppressed");
    expect(bySlot(destroy(ANATOMY, "arm-1"), "left-arm")?.occupancy).toBe(
      "destroyed",
    );
  });

  /*
   * The distinction that decides which mechanic applies. A slot with a
   * destroyed instance is anatomy that existed and was lost — regeneration can
   * rebuild it. A slot nothing ever occupied is anatomy that has never
   * physically existed, and there is nothing to rebuild FROM; growing it is a
   * creation mechanic, not a restoration.
   */
  it("distinguishes destroyed from never-instantiated", () => {
    const formExpectingATail: ReferenceForm = {
      id: "HumanForm",
      parts: [...HUMAN_FORM.parts, { slotId: "tail", type: "tail" }],
    };

    const slots = resolveSlotOccupancy(
      destroy(ANATOMY, "arm-1"),
      formExpectingATail,
    );

    const lost = slots.find((slot) => slot.referenceSlotId === "left-arm");
    const never = slots.find((slot) => slot.referenceSlotId === "tail");

    expect(lost?.occupancy).toBe("destroyed");
    expect(lost?.instanceId).toBe("arm-1");
    expect(lost?.restorable).toBe(true);

    expect(never?.occupancy).toBe("never-instantiated");
    expect(never?.instanceId).toBeUndefined();
    expect(never?.restorable).toBe(false);
  });
});


describe("ordinary regeneration", () => {
  const damaged = destroy(ANATOMY, "arm-1");

  it("can rebuild a destroyed slot the form still expects", () => {
    expect(canOrdinaryRegenerationRestore(damaged, HUMAN_FORM, "left-arm")).toBe(
      true,
    );
  });

  /*
   * It must never add anatomy the current form is not supposed to contain,
   * which is what makes an orphaned archive inert rather than merely unlucky.
   */
  it("cannot rebuild an orphaned archive", () => {
    expect(
      canOrdinaryRegenerationRestore(damaged, ARMLESS_FORM, "left-arm"),
    ).toBe(false);
  });

  it("cannot rebuild anatomy that never existed", () => {
    const formExpectingATail: ReferenceForm = {
      id: "HumanForm",
      parts: [...HUMAN_FORM.parts, { slotId: "tail", type: "tail" }],
    };

    expect(
      canOrdinaryRegenerationRestore(ANATOMY, formExpectingATail, "tail"),
    ).toBe(false);
  });

  it("has nothing to do for a slot that is already occupied", () => {
    expect(canOrdinaryRegenerationRestore(ANATOMY, HUMAN_FORM, "left-arm")).toBe(
      false,
    );
  });
});


describe("Species body profiles", () => {
  /*
   * The Human profile anchors everything. Standard Scale 1 is what "Scale"
   * means, and a Giant is 10 because it is ten times this.
   */
  it("gives the Human the Basic Human Standard", () => {
    const human = getSpeciesDefinition("human");

    expect(human?.body?.standardScale).toBe(1);
    expect(human?.body?.referenceForm.id).toBe("standard-humanoid");
    expect(human?.body?.stature).toBe(HUMAN_STATURE_BANDS);
    expect(human?.body?.ageProfile).toBe(HUMAN_AGE_PROFILE);
  });

  /*
   * Nothing physical is restated. Height, Mass, Size, SC and STR all resolve
   * from the anatomy and the reference table; a Species that authored any of
   * them would be a second source waiting to drift.
   */
  it("authors no physical measurement directly", () => {
    const body = getSpeciesDefinition("human")?.body;

    expect(body).not.toHaveProperty("heightCm");
    expect(body).not.toHaveProperty("massKg");
    expect(body).not.toHaveProperty("structuralCapacity");
    expect(body?.globalMorphology).toEqual(NEUTRAL_MORPHOLOGY);
  });

  /*
   * The six Bender lineages are physically Human and say nothing about bodies.
   * Repeating the parent's profile would be six copies of one fact waiting to
   * disagree; inheritance is what makes "physically Human, differently
   * capable" free to express.
   */
  it("lets physically-identical Sub-species inherit rather than repeat", () => {
    for (const id of ["firebender", "waterbender"]) {
      const sub = getSpeciesDefinition(id);

      expect(sub?.parentSpeciesId).toBe("human");
      expect(sub?.body).toBeUndefined();
    }
  });
});
