/*
 * Item instances: one object, its rules kept elsewhere, and where it actually is.
 *
 * The fixtures here are fixtures on purpose, and the reason is recorded rather than
 * assumed. Axia has no canonical world-associated Item and no canonical container,
 * so proving containment, stewardship and accessibility against real content would
 * mean inventing a crate, a strongbox and a place to put them — content the setting
 * did not ask for, existing so a directory would not be empty.
 *
 * So the generic contracts are proved here, in full, against declared fixtures; the
 * production Item vault stays empty and says why in its own README.
 */

import { describe, expect, it } from "vitest";

import {
  containerFactsOf,
  findItemInstanceIssues,
  findOwnerIssues,
  isAccessibleTo,
  isPossessedBy,
  resolveItemInstance,
  resolveItemPlacement,
  type ContainerFacts,
  type ItemInstanceDocument,
  type LocationFact,
  type PlacementLookup,
  type PlacementWorld,
} from "../vault";


const DEFINITION = {
  id: "reinforced-gauntlets",
  name: "Reinforced Gauntlets",
  description: "Weighted gauntlets that lend force to a blow when worn.",
  inventoryMode: "individual",
} as const;

function instance(
  overrides: Partial<ItemInstanceDocument> & { readonly id: string },
): ItemInstanceDocument {
  return {
    schemaVersion: 1,
    kind: "item-instance",
    name: "A pair of gauntlets",
    definition: { kind: "item-definition", id: DEFINITION.id },
    ...overrides,
  } as ItemInstanceDocument;
}

const codes = (issues: readonly { code: string }[]): readonly string[] =>
  issues.map((issue) => issue.code);


/** A world built from Item instance documents, the way the loader will build one. */
function worldOf(
  instances: readonly ItemInstanceDocument[],
  characterLocations: Readonly<Record<string, string>> = {},
): PlacementWorld {
  const byId = new Map(instances.map((entry) => [entry.id, entry]));

  return {
    placementOf: (id): PlacementLookup => {
      const found = byId.get(id);

      if (found === undefined) return { status: "unknown-item" };
      if (found.placement === undefined) return { status: "unstated" };

      return { status: "stated", placement: found.placement };
    },
    containerFactsOf: (id): ContainerFacts | undefined => {
      const found = byId.get(id);

      return found === undefined ? undefined : containerFactsOf(found);
    },
    locationOfCharacter: (characterId): LocationFact => {
      const locationId = characterLocations[characterId];

      return locationId === undefined
        ? { status: "unknown" }
        : { status: "known", locationId };
    },
  };
}


describe("T9 — an instance resolves its definition without copying it", () => {
  it("returns the registry's own definition object, unmerged and unmutated", () => {
    const document = instance({ id: "gauntlets-1" });
    const outcome = resolveItemInstance(document, (id) =>
      id === DEFINITION.id ? DEFINITION : undefined
    );

    expect(outcome.success).toBe(true);

    if (!outcome.success) return;

    /*
     * `toBe`, not `toEqual`. The definition is THE object the registry holds, not a
     * copy — a copy would be a second authority over what gauntlets do, diverging
     * invisibly the next time the definition is edited.
     */
    expect(outcome.payload.definition).toBe(DEFINITION);
    expect(outcome.payload.instance).toBe(document);

    // And the instance has not absorbed any of the definition's fields.
    expect(document).not.toHaveProperty("inventoryMode");
    expect(document).not.toHaveProperty("equippedEffects");
  });
});


describe("T10 — a missing definition refuses; an absent owner does not", () => {
  it("refuses an instance whose definition is not registered", () => {
    /*
     * M13. An Item with no rules has no mechanics at all. Resolving it to a bare
     * instance would hand every consumer an object that looks resolvable and answers
     * every mechanical question with silence.
     */
    const outcome = resolveItemInstance(instance({ id: "gauntlets-1" }), () => undefined);

    expect(outcome.success).toBe(false);

    if (outcome.success) return;

    expect(codes(outcome.errors)).toEqual(["vault.item-instance.definition.missing"]);
  });

  it("accepts an absent owner and refuses a malformed one", () => {
    expect(findItemInstanceIssues(instance({ id: "gauntlets-1" }))).toEqual([]);

    expect(findItemInstanceIssues(instance({
      id: "gauntlets-1",
      owner: { kind: "character", id: "gon" },
    }))).toEqual([]);

    expect(codes(findOwnerIssues({ kind: "character" }, "owner")))
      .toEqual(["vault.owner.id.invalid"]);
    expect(codes(findOwnerIssues("gon", "owner"))).toEqual(["vault.owner.malformed"]);
  });

  it("refuses an organization owner, because nothing could resolve one", () => {
    /*
     * Axia's groups exist as prose with no id anything can validate. An owner kind
     * nothing resolves is a field that always passes and never means anything, which
     * is worse than its absence: a document could claim an owner that does not exist
     * and be told it was fine.
     */
    expect(codes(findOwnerIssues({ kind: "organization", id: "hunter-association" }, "owner")))
      .toEqual(["vault.owner.kind.unsupported"]);
  });

  it("never reads an owner out of the folder the instance is filed in", () => {
    /*
     * M5. Validation is handed the document and nothing else — no path, no bundle, no
     * steward. An instance under Gon's bundle with no owner field is UNOWNED, not
     * Gon's, and that is the honest reading of a document that did not say.
     */
    const unowned = instance({ id: "gauntlets-1" });

    expect(findItemInstanceIssues(unowned)).toEqual([]);
    expect(unowned.owner).toBeUndefined();
  });

  it("refuses a wrong-kind definition reference", () => {
    expect(codes(findItemInstanceIssues(instance({
      id: "gauntlets-1",
      definition: { kind: "species", id: "elf" } as never,
    })))).toContain("vault.reference.kind.unexpected");
  });
});


describe("T49, T50 — a character-bundle Item is stewarded, not necessarily carried", () => {
  const OWNED_BY_GON = { kind: "character", id: "gon" } as const;

  it("resolves in the steward's inventory when it is physically on them", () => {
    const gauntlets = instance({
      id: "gauntlets-1",
      owner: OWNED_BY_GON,
      placement: { parent: "character", characterId: "gon", engagement: "worn" },
    });

    const placement = resolveItemPlacement(
      "gauntlets-1",
      worldOf([gauntlets], { gon: "whale-island" }),
    );

    expect(placement.success).toBe(true);

    if (!placement.success) return;

    expect(isPossessedBy(placement.payload, "gon")).toBe(true);
    expect(isAccessibleTo(placement.payload, "gon")).toBe(true);
    expect(placement.payload.effectiveLocation)
      .toEqual({ status: "at", locationId: "whale-island" });

    /*
     * No copied inventory authority. The character document holds no list of these;
     * the answer is derived from the instances that name the character.
     */
    expect(gauntlets.placement).toEqual({
      parent: "character",
      characterId: "gon",
      engagement: "worn",
    });
  });

  it("stays owned but absent from possession when temporarily left elsewhere", () => {
    /*
     * The file has not moved and the owner has not changed — only the placement. This
     * is the whole point of keeping the two independent.
     */
    const gauntlets = instance({
      id: "gauntlets-1",
      owner: OWNED_BY_GON,
      placement: { parent: "location", locationId: "whale-island" },
    });

    const placement = resolveItemPlacement(
      "gauntlets-1",
      worldOf([gauntlets], { gon: "yorknew" }),
    );

    expect(placement.success).toBe(true);

    if (!placement.success) return;

    expect(gauntlets.owner).toEqual(OWNED_BY_GON);
    expect(isPossessedBy(placement.payload, "gon")).toBe(false);
    expect(isAccessibleTo(placement.payload, "gon")).toBe(false);
  });
});


describe("T51 — a world-associated Item has a location and no owner", () => {
  it("resolves its location with no character owner at all", () => {
    const crate = instance({
      id: "supply-crate-1",
      name: "A supply crate",
      placement: { parent: "location", locationId: "docks" },
      containment: {},
    });

    expect(findItemInstanceIssues(crate)).toEqual([]);
    expect(crate.owner).toBeUndefined();

    const placement = resolveItemPlacement("supply-crate-1", worldOf([crate]));

    expect(placement.success).toBe(true);

    if (!placement.success) return;

    expect(placement.payload.root).toEqual({ kind: "location", locationId: "docks" });
    expect(placement.payload.holder).toBeUndefined();
    expect(containerFactsOf(crate)).toEqual({ isContainer: true });
  });
});


describe("T52 — a nested container resolves the whole chain at once", () => {
  it("gives ancestry, holder, possession, accessibility and location together", () => {
    const instances = [
      instance({
        id: "gem-1",
        name: "A cut gem",
        owner: { kind: "character", id: "gon" },
        placement: { parent: "container", containerId: "pouch-1" },
      }),
      instance({
        id: "pouch-1",
        name: "A small pouch",
        placement: { parent: "container", containerId: "pack-1" },
        containment: {},
      }),
      instance({
        id: "pack-1",
        name: "A backpack",
        placement: { parent: "character", characterId: "gon", engagement: "worn" },
        containment: { sealed: false },
      }),
    ];

    for (const document of instances) {
      expect(findItemInstanceIssues(document)).toEqual([]);
    }

    const placement = resolveItemPlacement(
      "gem-1",
      worldOf(instances, { gon: "whale-island" }),
    );

    expect(placement.success).toBe(true);

    if (!placement.success) return;

    expect(placement.payload.containerAncestry).toEqual(["pouch-1", "pack-1"]);
    expect(placement.payload.holder).toBe("gon");
    expect(placement.payload.reachableThroughContainers).toBe(true);
    expect(isPossessedBy(placement.payload, "gon")).toBe(true);
    expect(isAccessibleTo(placement.payload, "gon")).toBe(true);
    expect(placement.payload.effectiveLocation)
      .toEqual({ status: "at", locationId: "whale-island" });
  });

  it("stops being accessible when any container in the chain is sealed", () => {
    const instances = [
      instance({ id: "gem-1", placement: { parent: "container", containerId: "pouch-1" } }),
      instance({
        id: "pouch-1",
        placement: { parent: "container", containerId: "pack-1" },
        containment: { sealed: true },
      }),
      instance({
        id: "pack-1",
        placement: { parent: "character", characterId: "gon", engagement: "worn" },
        containment: {},
      }),
    ];

    const placement = resolveItemPlacement(
      "gem-1",
      worldOf(instances, { gon: "whale-island" }),
    );

    expect(placement.success).toBe(true);

    if (!placement.success) return;

    expect(isPossessedBy(placement.payload, "gon")).toBe(true);
    expect(isAccessibleTo(placement.payload, "gon")).toBe(false);
  });

  it("refuses an Item placed inside something that is not a container", () => {
    const instances = [
      instance({ id: "gem-1", placement: { parent: "container", containerId: "gauntlets-1" } }),
      instance({
        id: "gauntlets-1",
        placement: { parent: "character", characterId: "gon", engagement: "worn" },
      }),
    ];

    const placement = resolveItemPlacement("gem-1", worldOf(instances, { gon: "whale-island" }));

    expect(placement.success).toBe(false);

    if (placement.success) return;

    expect(codes(placement.errors)).toEqual(["vault.placement.parent.wrong-kind"]);
  });
});
