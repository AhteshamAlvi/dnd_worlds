/*
 * Tests the generic Anatomy layer: creation, the four structural
 * modification operations (add/remove/replace/reattach) plus the new
 * damage-storage operation, resolution helpers, and structural validation.
 *
 * Anatomy is data-driven — these tests deliberately use small ad hoc part
 * collections rather than the standard humanoid, to prove nothing here
 * assumes a particular body plan.
 */

import { describe, expect, it } from "vitest";

import {
  applyBodyPartDamage,
  applyAnatomyModifications,
  reattachBodyPart,
  removeBodyPart,
  replaceBodyPart,
  setBodyPartState,
} from "../character/foundation/body/anatomy/modification";
import type { AnatomyModification } from "../character/foundation/body/anatomy/modification";
import { createAnatomy, createBodyPart } from "../character/foundation/body/anatomy/creation";
import type { BodyPartCreationSpec } from "../character/foundation/body/anatomy/creation";
import {
  getAnatomyRoots,
  getBodyPart,
  getBodyPartAncestors,
  getBodyPartChildren,
  getBodyPartDescendants,
  getBodyPartParent,
  resolveAnatomy,
} from "../character/foundation/body/anatomy/resolution";
import {
  validateAnatomy,
  validateBodyPartDefinition,
} from "../character/foundation/body/anatomy/validation";
import { TEST_PART_PHYSICALS } from "./fixtures/body";
import type {
  Anatomy,
  BodyPartDefinition,
} from "../character/foundation/body/anatomy/types";

const NEUTRAL_SENSITIVITY = {
  height: 1,
  mass: 1,
  muscularity: 1,
  adiposity: 1,
};

const DEFINITIONS: readonly BodyPartDefinition[] = [
  { id: "torso", name: "Torso", description: "Test torso.", tags: ["core"], baseBP: 10, morphologySensitivity: NEUTRAL_SENSITIVITY, ...TEST_PART_PHYSICALS },
  { id: "limb", name: "Limb", description: "Test limb.", tags: ["limb"], baseBP: 5, morphologySensitivity: NEUTRAL_SENSITIVITY, ...TEST_PART_PHYSICALS },
];

function threeArmAnatomy(): Anatomy {
  return createAnatomy([
    { id: "torso-1", type: "torso", attachment: null },
    { id: "limb-1", type: "limb", attachment: { parentId: "torso-1" } },
    { id: "limb-2", type: "limb", attachment: { parentId: "torso-1" } },
    { id: "limb-3", type: "limb", attachment: { parentId: "torso-1" } },
  ]);
}

describe("createBodyPart / createAnatomy", () => {
  it("creates parts deterministically from a spec, starting at zero damage", () => {
    const spec: BodyPartCreationSpec = {
      id: "torso-1",
      type: "torso",
      name: "Torso",
      attachment: null,
    };

    const part = createBodyPart(spec);

    expect(part).toEqual({
      id: "torso-1",
      type: "torso",
      name: "Torso",
      attachment: null,
      state: "active",
      damage: 0,
      recoveryProgress: 0,
    });
  });

  it("omits name when not supplied, rather than storing undefined", () => {
    const part = createBodyPart({ id: "torso-1", type: "torso", attachment: null });

    expect("name" in part).toBe(false);
  });

  it("is insensitive to input order between parent and child specs", () => {
    const anatomy = createAnatomy([
      { id: "limb-1", type: "limb", attachment: { parentId: "torso-1" } },
      { id: "torso-1", type: "torso", attachment: null },
    ]);

    expect(anatomy.parts).toHaveLength(2);
    expect(getBodyPartParent(anatomy, "limb-1")?.id).toBe("torso-1");
  });
});

describe("addBodyPart / removeBodyPart / replaceBodyPart / reattachBodyPart", () => {
  it("removing a part cascades through its entire descendant subtree", () => {
    const anatomy = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
      { id: "limb-1", type: "limb", attachment: { parentId: "torso-1" } },
      { id: "hand-1", type: "limb", attachment: { parentId: "limb-1" } },
    ]);

    const result = removeBodyPart(anatomy, "limb-1");

    expect(result.parts.map((part) => part.id)).toEqual(["torso-1"]);
  });

  it("removing an unknown id is a no-op", () => {
    const anatomy = threeArmAnatomy();
    const result = removeBodyPart(anatomy, "does-not-exist");

    expect(result).toEqual(anatomy);
  });

  it("replacing a part preserves its old parent and transfers its direct children", () => {
    const anatomy = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
      { id: "limb-1", type: "limb", attachment: { parentId: "torso-1" } },
      { id: "hand-1", type: "limb", attachment: { parentId: "limb-1" } },
    ]);

    const replaced = replaceBodyPart(anatomy, "limb-1", {
      id: "prosthetic-1",
      type: "limb",
      name: "Prosthetic Arm",
    });

    expect(getBodyPart(replaced, "limb-1")).toBeUndefined();
    expect(getBodyPartParent(replaced, "prosthetic-1")?.id).toBe("torso-1");
    expect(getBodyPartParent(replaced, "hand-1")?.id).toBe("prosthetic-1");
  });

  it("a replacement starts with zero damage even if the original was damaged", () => {
    const anatomy: Anatomy = {
      parts: [
        { id: "torso-1", type: "torso", attachment: null, state: "active", damage: 0, recoveryProgress: 0 },
        { id: "limb-1", type: "limb", attachment: { parentId: "torso-1", parentPosition: 1, childPosition: 0 }, state: "active", damage: 7, recoveryProgress: 0 },
      ],
    };

    const replaced = replaceBodyPart(anatomy, "limb-1", {
      id: "prosthetic-1",
      type: "limb",
    });

    expect(getBodyPart(replaced, "prosthetic-1")?.damage).toBe(0);
  });

  it("reattaching changes only structural parent/site, nothing else", () => {
    const anatomy = threeArmAnatomy();
    const reattached = reattachBodyPart(anatomy, "limb-3", { parentId: "limb-1" });

    expect(getBodyPartParent(reattached, "limb-3")?.id).toBe("limb-1");
    expect(getBodyPart(reattached, "limb-3")?.type).toBe("limb");
  });

  it("reattaching to null makes a part a new anatomical root", () => {
    const anatomy = threeArmAnatomy();
    const reattached = reattachBodyPart(anatomy, "limb-3", null);

    const roots = getAnatomyRoots(reattached).map((part) => part.id).sort();
    expect(roots).toEqual(["limb-3", "torso-1"]);
  });
});

describe("applyBodyPartDamage", () => {
  it("adds to a part's stored damage", () => {
    const anatomy = threeArmAnatomy();
    const damaged = applyBodyPartDamage(anatomy, "limb-1", 6);

    expect(getBodyPart(damaged, "limb-1")?.damage).toBe(6);
  });

  it("clamps at zero rather than going negative", () => {
    const anatomy = threeArmAnatomy();
    const healed = applyBodyPartDamage(anatomy, "limb-1", -100);

    expect(getBodyPart(healed, "limb-1")?.damage).toBe(0);
  });

  it("accumulates across repeated calls", () => {
    let anatomy = threeArmAnatomy();
    anatomy = applyBodyPartDamage(anatomy, "limb-1", 3);
    anatomy = applyBodyPartDamage(anatomy, "limb-1", 4);

    expect(getBodyPart(anatomy, "limb-1")?.damage).toBe(7);
  });

  it("is a no-op against an unknown id", () => {
    const anatomy = threeArmAnatomy();
    const result = applyBodyPartDamage(anatomy, "does-not-exist", 5);

    expect(result).toEqual(anatomy);
  });

  it("does not mutate the input Anatomy", () => {
    const anatomy = threeArmAnatomy();
    const before = JSON.parse(JSON.stringify(anatomy));

    applyBodyPartDamage(anatomy, "limb-1", 5);

    expect(anatomy).toEqual(before);
  });
});

describe("applyAnatomyModifications", () => {
  it("applies an ordered sequence, letting a reattach precede a removal", () => {
    const anatomy = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
      { id: "limb-1", type: "limb", attachment: { parentId: "torso-1" } },
      { id: "hand-1", type: "limb", attachment: { parentId: "limb-1" } },
    ]);

    const modifications: readonly AnatomyModification[] = [
      { kind: "reattach-part", partId: "hand-1", attachment: { parentId: "torso-1" } },
      { kind: "remove-part", partId: "limb-1" },
    ];

    const result = applyAnatomyModifications(anatomy, modifications);

    expect(result.parts.map((part) => part.id).sort()).toEqual(["hand-1", "torso-1"]);
  });

  it("does not mutate the input Anatomy", () => {
    const anatomy = threeArmAnatomy();
    const before = JSON.parse(JSON.stringify(anatomy));

    applyAnatomyModifications(anatomy, [
      { kind: "remove-part", partId: "limb-2" },
    ]);

    expect(anatomy).toEqual(before);
  });
});

describe("Anatomy resolution helpers", () => {
  it("returns direct children, not deeper descendants", () => {
    const anatomy = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
      { id: "limb-1", type: "limb", attachment: { parentId: "torso-1" } },
      { id: "hand-1", type: "limb", attachment: { parentId: "limb-1" } },
    ]);

    expect(getBodyPartChildren(anatomy, "torso-1").map((p) => p.id)).toEqual(["limb-1"]);
  });

  it("returns ancestors from nearest to farthest", () => {
    const anatomy = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
      { id: "limb-1", type: "limb", attachment: { parentId: "torso-1" } },
      { id: "hand-1", type: "limb", attachment: { parentId: "limb-1" } },
    ]);

    expect(getBodyPartAncestors(anatomy, "hand-1").map((p) => p.id)).toEqual([
      "limb-1",
      "torso-1",
    ]);
  });

  it("returns every descendant, not just direct children", () => {
    const anatomy = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
      { id: "limb-1", type: "limb", attachment: { parentId: "torso-1" } },
      { id: "hand-1", type: "limb", attachment: { parentId: "limb-1" } },
    ]);

    expect(getBodyPartDescendants(anatomy, "torso-1").map((p) => p.id).sort()).toEqual(
      ["hand-1", "limb-1"].sort(),
    );
  });

  it("supports multiple anatomical roots", () => {
    const anatomy = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
      { id: "limb-1", type: "limb", attachment: null },
    ]);

    expect(getAnatomyRoots(anatomy).map((p) => p.id).sort()).toEqual(["limb-1", "torso-1"]);
  });

  it("resolves stored Anatomy plus temporary modifications, without mutating storage", () => {
    const stored = createAnatomy([{ id: "torso-1", type: "torso", attachment: null }]);

    const resolved = resolveAnatomy(stored, [
      { kind: "add-part", part: { id: "limb-1", type: "limb", attachment: { parentId: "torso-1" } } },
    ]);

    expect(resolved.parts.map((p) => p.id).sort()).toEqual(["limb-1", "torso-1"]);
    expect(stored.parts.map((p) => p.id)).toEqual(["torso-1"]);
  });

  it("temporary parts vanish once the modification is no longer applied", () => {
    const stored = createAnatomy([{ id: "torso-1", type: "torso", attachment: null }]);
    const resolvedAgain = resolveAnatomy(stored, []);

    expect(resolvedAgain.parts.map((p) => p.id)).toEqual(["torso-1"]);
  });
});

describe("Anatomy validation", () => {
  it("accepts a valid Anatomy", () => {
    const result = validateAnatomy(threeArmAnatomy(), DEFINITIONS);
    expect(result.valid).toBe(true);
  });

  it("accepts an empty Anatomy", () => {
    const result = validateAnatomy({ parts: [] }, DEFINITIONS);
    expect(result.valid).toBe(true);
  });

  it("accepts multiple anatomical roots", () => {
    const anatomy: Anatomy = {
      parts: [
        { id: "a", type: "torso", attachment: null, state: "active", damage: 0, recoveryProgress: 0 },
        { id: "b", type: "torso", attachment: null, state: "active", damage: 0, recoveryProgress: 0 },
      ],
    };

    expect(validateAnatomy(anatomy, DEFINITIONS).valid).toBe(true);
  });

  it("rejects a duplicate BodyPart id", () => {
    const anatomy: Anatomy = {
      parts: [
        { id: "a", type: "torso", attachment: null, state: "active", damage: 0, recoveryProgress: 0 },
        { id: "a", type: "torso", attachment: null, state: "active", damage: 0, recoveryProgress: 0 },
      ],
    };

    const result = validateAnatomy(anatomy, DEFINITIONS);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "duplicate-body-part-id")).toBe(true);
  });

  it("rejects a missing parent", () => {
    const anatomy: Anatomy = {
      parts: [{ id: "a", type: "torso", attachment: { parentId: "ghost", parentPosition: 1, childPosition: 0 }, state: "active", damage: 0, recoveryProgress: 0 }],
    };

    const result = validateAnatomy(anatomy, DEFINITIONS);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "missing-parent")).toBe(true);
  });

  it("rejects self-parenting", () => {
    const anatomy: Anatomy = {
      parts: [{ id: "a", type: "torso", attachment: { parentId: "a", parentPosition: 1, childPosition: 0 }, state: "active", damage: 0, recoveryProgress: 0 }],
    };

    const result = validateAnatomy(anatomy, DEFINITIONS);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "self-parent")).toBe(true);
  });

  it("rejects an attachment cycle", () => {
    const anatomy: Anatomy = {
      parts: [
        { id: "a", type: "torso", attachment: { parentId: "b", parentPosition: 1, childPosition: 0 }, state: "active", damage: 0, recoveryProgress: 0 },
        { id: "b", type: "torso", attachment: { parentId: "a", parentPosition: 1, childPosition: 0 }, state: "active", damage: 0, recoveryProgress: 0 },
      ],
    };

    const result = validateAnatomy(anatomy, DEFINITIONS);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "attachment-cycle")).toBe(true);
  });

  it("rejects an unknown BodyPart type", () => {
    const anatomy: Anatomy = {
      parts: [{ id: "a", type: "wing", attachment: null, state: "active", damage: 0, recoveryProgress: 0 }],
    };

    const result = validateAnatomy(anatomy, DEFINITIONS);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "unknown-body-part-type")).toBe(true);
  });

  it("rejects negative stored damage", () => {
    const anatomy: Anatomy = {
      parts: [{ id: "a", type: "torso", attachment: null, state: "active", damage: -1, recoveryProgress: 0 }],
    };

    const result = validateAnatomy(anatomy, DEFINITIONS);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "invalid-damage")).toBe(true);
  });
});


/*
 * The schema the Height model needs: a presence state on every instance, and
 * connection coordinates on both ends of every attachment. Both were skipped
 * in earlier phases and land here, because Measurements is the first subsystem
 * that cannot work without them.
 */
describe("physical presence state and connection geometry", () => {
  it("creates anatomy active, with the ordinary distal-to-proximal geometry", () => {
    const part = createBodyPart({
      id: "hand-1",
      type: "limb",
      attachment: { parentId: "limb-1" },
    });

    expect(part.state).toBe("active");
    expect(part.attachment).toEqual({
      parentId: "limb-1",
      parentPosition: 1,
      childPosition: 0,
    });
  });

  it("keeps authored coordinates rather than defaulting over them", () => {
    const part = createBodyPart({
      id: "leg-1",
      type: "limb",
      attachment: {
        parentId: "torso-1",
        site: "hip",
        parentPosition: 0,
        childPosition: 0,
      },
    });

    expect(part.attachment).toEqual({
      parentId: "torso-1",
      site: "hip",
      parentPosition: 0,
      childPosition: 0,
    });
  });

  /*
   * Presence state is instance state, and setting it must never touch anything
   * else — least of all the Reference Form, which is what keeps amputation from
   * cancelling itself out of the Strength normalization.
   */
  it("changes only the targeted part's state", () => {
    const anatomy = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
      { id: "limb-1", type: "limb", attachment: { parentId: "torso-1" } },
    ]);

    const severed = setBodyPartState(anatomy, "limb-1", "archived-removed");

    expect(severed.parts.map((p) => p.state)).toEqual([
      "active",
      "archived-removed",
    ]);

    expect(severed.parts[1]).toEqual({
      ...anatomy.parts[1],
      state: "archived-removed",
    });
  });

  it("leaves an unknown part id alone", () => {
    const anatomy = createAnatomy([
      { id: "torso-1", type: "torso", attachment: null },
    ]);

    expect(setBodyPartState(anatomy, "ghost", "suppressed")).toEqual(anatomy);
  });

  /*
   * Pre-refactor Body JSON has no coordinates at all. It must fail loudly here
   * rather than silently acquire a body plan nobody authored — there is no
   * migration layer, deliberately.
   */
  it("rejects an attachment missing its coordinates", () => {
    const anatomy = {
      parts: [
        { id: "torso-1", type: "torso", attachment: null, state: "active", damage: 0, recoveryProgress: 0 },
        {
          id: "limb-1",
          type: "limb",
          attachment: { parentId: "torso-1" },
          state: "active",
          damage: 0,
          recoveryProgress: 0,
        },
      ],
    } as unknown as Anatomy;

    const result = validateAnatomy(anatomy, DEFINITIONS);

    expect(result.valid).toBe(false);
    expect(
      result.issues.filter((i) => i.code === "invalid-attachment-position"),
    ).toHaveLength(2);
  });

  it("rejects a coordinate off the end of the part it sits on", () => {
    const anatomy = {
      parts: [
        { id: "torso-1", type: "torso", attachment: null, state: "active", damage: 0, recoveryProgress: 0 },
        {
          id: "limb-1",
          type: "limb",
          attachment: { parentId: "torso-1", parentPosition: 1.5, childPosition: 0 },
          state: "active",
          damage: 0,
          recoveryProgress: 0,
        },
      ],
    } as unknown as Anatomy;

    const result = validateAnatomy(anatomy, DEFINITIONS);

    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.code === "invalid-attachment-position"),
    ).toBe(true);
  });

  it("rejects an unknown presence state", () => {
    const anatomy = {
      parts: [
        { id: "torso-1", type: "torso", attachment: null, state: "gone", damage: 0, recoveryProgress: 0 },
      ],
    } as unknown as Anatomy;

    const result = validateAnatomy(anatomy, DEFINITIONS);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "invalid-body-part-state")).toBe(
      true,
    );
  });

  /*
   * heightContribution is a fraction of the part's own Length, so it cannot
   * exceed 1 — a part cannot be taller than it is long. Inversion is
   * heightAxisSign's job; letting either field express it makes the pair
   * ambiguous.
   */
  it("rejects a height contribution outside [0, 1]", () => {
    const definition = {
      ...DEFINITIONS[0]!,
      reference: { ...DEFINITIONS[0]!.reference, heightContribution: 1.4 },
    };

    const result = validateBodyPartDefinition(definition);

    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.code === "invalid-height-contribution"),
    ).toBe(true);
  });

  it("rejects a height axis sign that is not exactly 1 or -1", () => {
    const definition = {
      ...DEFINITIONS[0]!,
      reference: { ...DEFINITIONS[0]!.reference, heightAxisSign: 0 },
    } as unknown as BodyPartDefinition;

    const result = validateBodyPartDefinition(definition);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "invalid-height-axis-sign")).toBe(
      true,
    );
  });
});
