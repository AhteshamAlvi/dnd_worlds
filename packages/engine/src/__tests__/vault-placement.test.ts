/*
 * The placement graph: where a thing is, and who has it.
 *
 * Every derived answer in this file — effective location, holder, possession,
 * accessibility — is computed by walking one fact per node. The tests are mostly
 * about what happens when the chain is wrong, because a chain of one-parent facts
 * is trivially right when it is right.
 */

import { describe, expect, it } from "vitest";

import {
  findItemPlacementIssues,
  isAccessibleTo,
  isItemEngagementKind,
  resolveItemPlacement,
  validateTransfer,
  type ContainerFacts,
  type ItemPlacement,
  type LocationFact,
  type PlacementLookup,
  type PlacementWorld,
  type ResolvedPlacement,
} from "../vault";

import { isPossessedBy } from "../vault";


/* -------------------------------------------------------------------------- */
/* A world, stated rather than loaded                                         */
/* -------------------------------------------------------------------------- */

interface Node {
  readonly placement?: ItemPlacement;
  readonly container?: ContainerFacts;
}

/**
 * A `PlacementWorld` from plain declarations.
 *
 * Built from placements rather than from documents so that a cycle, a wrong-kind
 * parent and a dangling reference can each be stated in one line. Constructing
 * valid Item instance documents for those cases would mean building the invalid
 * thing out of valid parts, which is more code proving less.
 */
function world(
  nodes: Readonly<Record<string, Node>>,
  characterLocations: Readonly<Record<string, string>> = {},
): PlacementWorld {
  return {
    placementOf: (id): PlacementLookup => {
      const node = nodes[id];

      if (node === undefined) return { status: "unknown-item" };
      if (node.placement === undefined) return { status: "unstated" };

      return { status: "stated", placement: node.placement };
    },

    containerFactsOf: (id) => {
      const node = nodes[id];

      return node === undefined ? undefined : node.container ?? { isContainer: false };
    },

    locationOfCharacter: (characterId): LocationFact => {
      const locationId = characterLocations[characterId];

      return locationId === undefined
        ? { status: "unknown" }
        : { status: "known", locationId };
    },
  };
}

const CONTAINER: ContainerFacts = { isContainer: true };

function resolved(id: string, w: PlacementWorld): ResolvedPlacement {
  const outcome = resolveItemPlacement(id, w);

  if (!outcome.success) {
    throw new Error(`expected "${id}" to resolve: ${outcome.errors.map((e) => e.code).join(", ")}`);
  }

  return outcome.payload;
}

function failureCode(id: string, w: PlacementWorld): string {
  const outcome = resolveItemPlacement(id, w);

  if (outcome.success) throw new Error(`expected "${id}" to refuse`);

  return outcome.errors[0].code;
}

const codes = (issues: readonly { code: string }[]): readonly string[] =>
  issues.map((issue) => issue.code);


/* -------------------------------------------------------------------------- */

describe("T16 — one parent, exactly its fields", () => {
  it("accepts each discriminant with exactly the fields it owns", () => {
    const valid: readonly ItemPlacement[] = [
      { parent: "character", characterId: "gon", engagement: "held" },
      { parent: "character", characterId: "gon", engagement: "worn" },
      { parent: "container", containerId: "belt-1" },
      { parent: "location", locationId: "whale-island" },
      { parent: "unplaced" },
    ];

    for (const placement of valid) {
      expect(findItemPlacementIssues(placement)).toEqual([]);
    }
  });

  it("refuses two parents' worth of fields as the contradiction it is", () => {
    /*
     * M7. Two parents means two answers to one question. The extra field is refused
     * rather than ignored, because ignoring it means the document says something the
     * engine does not read — and the document is what a human edits.
     */
    const issues = findItemPlacementIssues({
      parent: "character",
      characterId: "gon",
      engagement: "held",
      locationId: "whale-island",
    });

    expect(codes(issues)).toEqual(["vault.placement.parent.conflict"]);
    expect(issues[0]?.actual).toEqual(["character", "location"]);
  });

  it("refuses a container placement that also names a character", () => {
    expect(codes(findItemPlacementIssues({
      parent: "container",
      containerId: "belt-1",
      characterId: "gon",
    }))).toEqual(["vault.placement.parent.conflict"]);
  });

  it("refuses an unplaced placement carrying anything else", () => {
    expect(codes(findItemPlacementIssues({ parent: "unplaced", locationId: "docks" })))
      .toEqual(["vault.placement.parent.conflict"]);
  });

  it("refuses a malformed or unknown discriminant", () => {
    expect(codes(findItemPlacementIssues(null))).toEqual(["vault.placement.malformed"]);
    expect(codes(findItemPlacementIssues([]))).toEqual(["vault.placement.malformed"]);
    expect(codes(findItemPlacementIssues({ parent: "pocket" })))
      .toEqual(["vault.placement.parent.unknown"]);
    expect(codes(findItemPlacementIssues({})))
      .toEqual(["vault.placement.parent.unknown"]);
  });

  it("keeps a missing placement distinct from an explicit unplaced one", () => {
    /*
     * M6. Absent is an unanswered question; unplaced is an answer. A loader that
     * treated the first as the second would turn every half-finished document into a
     * confident claim that its Item exists nowhere.
     */
    const w = world({ "rod-1": {}, "rod-2": { placement: { parent: "unplaced" } } });

    expect(failureCode("rod-1", w)).toBe("vault.placement.unstated");

    const explicit = resolved("rod-2", w);

    expect(explicit.root).toEqual({ kind: "unplaced" });
    expect(explicit.effectiveLocation).toEqual({ status: "unplaced" });
  });
});


describe("T17 — a held Item resolves to its custodian and their location", () => {
  it("names the character as root custodian and their location as effective", () => {
    const w = world(
      { "rod-1": { placement: { parent: "character", characterId: "gon", engagement: "held" } } },
      { gon: "whale-island" },
    );

    const placement = resolved("rod-1", w);

    expect(placement.containerAncestry).toEqual([]);
    expect(placement.root).toEqual({ kind: "character", characterId: "gon", engagement: "held" });
    expect(placement.holder).toBe("gon");
    expect(placement.effectiveLocation).toEqual({ status: "at", locationId: "whale-island" });
    expect(isPossessedBy(placement, "gon")).toBe(true);
    expect(isAccessibleTo(placement, "gon")).toBe(true);
  });
});


describe("T18 — sheathed is containment, not an engagement", () => {
  it("resolves a sword in a scabbard on a worn belt through both containers", () => {
    const w = world(
      {
        "sword-1": { placement: { parent: "container", containerId: "scabbard-1" } },
        "scabbard-1": {
          placement: { parent: "container", containerId: "belt-1" },
          container: CONTAINER,
        },
        "belt-1": {
          placement: { parent: "character", characterId: "gon", engagement: "worn" },
          container: CONTAINER,
        },
      },
      { gon: "whale-island" },
    );

    const placement = resolved("sword-1", w);

    expect(placement.containerAncestry).toEqual(["scabbard-1", "belt-1"]);
    expect(placement.root).toEqual({ kind: "character", characterId: "gon", engagement: "worn" });
    expect(placement.holder).toBe("gon");
    expect(placement.effectiveLocation).toEqual({ status: "at", locationId: "whale-island" });
    expect(isPossessedBy(placement, "gon")).toBe(true);
    expect(isAccessibleTo(placement, "gon")).toBe(true);
  });

  it("has no sheathed, pocketed, packed or quivered engagement kind", () => {
    /*
     * M8. Adding any of these as an engagement would be a second way to say what
     * containment already says, immediately free to disagree with it about whether a
     * sheathed sword is in your hand.
     */
    for (const candidate of ["sheathed", "pocketed", "packed", "quivered", "carried", "stowed"]) {
      expect(isItemEngagementKind(candidate)).toBe(false);

      expect(codes(findItemPlacementIssues({
        parent: "character",
        characterId: "gon",
        engagement: candidate,
      }))).toEqual(["vault.placement.engagement.unknown"]);
    }

    expect(isItemEngagementKind("held")).toBe(true);
    expect(isItemEngagementKind("worn")).toBe(true);
  });

  it("refuses to reach into a sealed container, while leaving possession intact", () => {
    const w = world(
      {
        "gem-1": { placement: { parent: "container", containerId: "strongbox-1" } },
        "strongbox-1": {
          placement: { parent: "character", characterId: "gon", engagement: "worn" },
          container: { isContainer: true, sealed: true },
        },
      },
      { gon: "whale-island" },
    );

    const placement = resolved("gem-1", w);

    expect(placement.reachableThroughContainers).toBe(false);
    expect(isPossessedBy(placement, "gon")).toBe(true);
    expect(isAccessibleTo(placement, "gon")).toBe(false);

    // Locked does not move it. It is still exactly where Gon is.
    expect(placement.effectiveLocation).toEqual({ status: "at", locationId: "whale-island" });
  });
});


describe("T19 — moving the root moves every descendant, rewriting none", () => {
  it("changes descendants' effective location without touching their placements", () => {
    /*
     * M10. The descendant's own placement still says "in the crate", before and
     * after. A resolver that copied the root location down would have to write it
     * somewhere, and that copy is what goes stale the next time the crate moves.
     */
    const descendantPlacement: ItemPlacement = { parent: "container", containerId: "box-1" };

    const nodes = {
      "gem-1": { placement: descendantPlacement },
      "box-1": {
        placement: { parent: "container", containerId: "crate-1" } as ItemPlacement,
        container: CONTAINER,
      },
      "crate-1": {
        placement: { parent: "location", locationId: "docks" } as ItemPlacement,
        container: CONTAINER,
      },
    };

    const atDocks = resolved("gem-1", world(nodes));

    expect(atDocks.effectiveLocation).toEqual({ status: "at", locationId: "docks" });

    const moved = {
      ...nodes,
      "crate-1": {
        placement: { parent: "location", locationId: "whale-island" } as ItemPlacement,
        container: CONTAINER,
      },
    };

    const atIsland = resolved("gem-1", world(moved));

    expect(atIsland.effectiveLocation).toEqual({ status: "at", locationId: "whale-island" });

    // The one edit was to the root. Both descendants are byte-identical to before.
    expect(moved["gem-1"].placement).toBe(descendantPlacement);
    expect(atIsland.containerAncestry).toEqual(["box-1", "crate-1"]);
    expect(atDocks.containerAncestry).toEqual(atIsland.containerAncestry);
  });
});


describe("T20 — cycles refuse deterministically", () => {
  it("refuses an Item contained in itself", () => {
    const w = world({
      "bag-1": {
        placement: { parent: "container", containerId: "bag-1" },
        container: CONTAINER,
      },
    });

    expect(failureCode("bag-1", w)).toBe("vault.placement.cycle");
  });

  it("refuses a two-container cycle, and reports it as a cycle", () => {
    /*
     * M9. Without cycle detection this walk does not terminate. With detection that
     * reported whichever node it revisited, the diagnostic would name an arbitrary
     * member rather than the loop.
     */
    const w = world({
      "bag-1": {
        placement: { parent: "container", containerId: "box-1" },
        container: CONTAINER,
      },
      "box-1": {
        placement: { parent: "container", containerId: "bag-1" },
        container: CONTAINER,
      },
    });

    expect(failureCode("bag-1", w)).toBe("vault.placement.cycle");
    expect(failureCode("box-1", w)).toBe("vault.placement.cycle");
  });

  it("refuses a three-node cycle reached from outside it", () => {
    const w = world({
      "gem-1": { placement: { parent: "container", containerId: "a" } },
      a: { placement: { parent: "container", containerId: "b" }, container: CONTAINER },
      b: { placement: { parent: "container", containerId: "c" }, container: CONTAINER },
      c: { placement: { parent: "container", containerId: "a" }, container: CONTAINER },
    });

    expect(failureCode("gem-1", w)).toBe("vault.placement.cycle");
  });
});


describe("T21 — three broken chains, three distinct outcomes", () => {
  const base = {
    "gem-1": { placement: { parent: "container", containerId: "missing-box" } as ItemPlacement },
    "ring-1": { placement: { parent: "container", containerId: "rock-1" } as ItemPlacement },
    "rock-1": { placement: { parent: "location", locationId: "docks" } as ItemPlacement },
    "rod-1": {
      placement: {
        parent: "character",
        characterId: "unmapped",
        engagement: "held",
      } as ItemPlacement,
    },
  };

  it("reports a missing parent separately from a wrong-kind one", () => {
    const w = world(base, {});

    expect(failureCode("gem-1", w)).toBe("vault.placement.parent.missing");
    expect(failureCode("ring-1", w)).toBe("vault.placement.parent.wrong-kind");
  });

  it("reports an unknown character location as unavailable, not as nowhere", () => {
    /*
     * The host owns the map. When it has not been asked, the answer is "unavailable"
     * — never a location the engine invented, and never `unplaced`, which would
     * report an Item as lost because nobody consulted the map.
     */
    const placement = resolved("rod-1", world(base, {}));

    expect(placement.root).toEqual({
      kind: "character",
      characterId: "unmapped",
      engagement: "held",
    });
    expect(placement.effectiveLocation).toEqual({
      status: "unavailable",
      reason: "character-location-unknown",
    });

    // Custody is still perfectly knowable. Only the location is not.
    expect(isPossessedBy(placement, "unmapped")).toBe(true);
  });

  it("reports an unknown Item distinctly from a broken chain", () => {
    expect(failureCode("nothing-1", world(base))).toBe("vault.placement.item.unknown");
  });

  it("reports a container that does not state where IT is", () => {
    const w = world({
      "gem-1": { placement: { parent: "container", containerId: "box-1" } },
      "box-1": { container: CONTAINER },
    });

    expect(failureCode("gem-1", w)).toBe("vault.placement.unstated");
  });
});


describe("T22, T23 — ownership is not possession", () => {
  const OWNER = { kind: "character", id: "gon" } as const;

  it("lets the owner and the holder be different people", () => {
    /*
     * M5. Nothing in this resolution reads an owner at all — possession is custody,
     * derived from the chain. So a knife Gon owns and Killua is holding is possessed
     * by Killua, and the owner field is untouched by that fact.
     */
    const w = world(
      { "knife-1": { placement: { parent: "character", characterId: "killua", engagement: "held" } } },
      { gon: "whale-island", killua: "whale-island" },
    );

    const placement = resolved("knife-1", w);

    expect(placement.holder).toBe("killua");
    expect(isPossessedBy(placement, "killua")).toBe(true);
    expect(isPossessedBy(placement, OWNER.id)).toBe(false);
  });

  it("keeps a Gon-owned Item at another location owned but neither possessed nor accessible", () => {
    /*
     * M11 and M12. The rod is his; it is at home; he is not. Equating ownership with
     * possession would let him fish from another island, and changing the owner when
     * he put it down would stop it being his.
     */
    const w = world(
      { "rod-1": { placement: { parent: "location", locationId: "whale-island" } } },
      { gon: "yorknew" },
    );

    const placement = resolved("rod-1", w);

    expect(placement.root).toEqual({ kind: "location", locationId: "whale-island" });
    expect(placement.holder).toBeUndefined();
    expect(placement.effectiveLocation).toEqual({ status: "at", locationId: "whale-island" });

    expect(isPossessedBy(placement, OWNER.id)).toBe(false);
    expect(isAccessibleTo(placement, OWNER.id)).toBe(false);
  });
});


describe("T24 — transfer preserves identity", () => {
  const w = world(
    {
      "rod-1": { placement: { parent: "character", characterId: "gon", engagement: "held" } },
      "pack-1": {
        placement: { parent: "character", characterId: "gon", engagement: "worn" },
        container: CONTAINER,
      },
      "box-1": { placement: { parent: "container", containerId: "pack-1" }, container: CONTAINER },
    },
    { gon: "whale-island" },
  );

  const HELD_BY_GON: ItemPlacement = {
    parent: "character",
    characterId: "gon",
    engagement: "held",
  };

  it("changes owner and placement on a permanent transfer, keeping the Item id", () => {
    const outcome = validateTransfer({
      itemInstanceId: "rod-1",
      kind: "permanent-stewardship",
      fromPlacement: HELD_BY_GON,
      toPlacement: { parent: "character", characterId: "killua", engagement: "held" },
      fromOwner: { kind: "character", id: "gon" },
      toOwner: { kind: "character", id: "killua" },
    }, w);

    expect(outcome.success).toBe(true);

    if (!outcome.success) return;

    // Same object under new management, not a new object.
    expect(outcome.payload.itemInstanceId).toBe("rod-1");
    expect(outcome.payload.owner).toEqual({ kind: "character", id: "killua" });
    expect(outcome.payload.ownerChanged).toBe(true);
    expect(outcome.payload.placementChanged).toBe(true);
  });

  it("refuses a permanent transfer that does not say who the new owner is", () => {
    const outcome = validateTransfer({
      itemInstanceId: "rod-1",
      kind: "permanent-stewardship",
      fromPlacement: HELD_BY_GON,
      toPlacement: { parent: "location", locationId: "docks" },
      fromOwner: { kind: "character", id: "gon" },
    }, w);

    expect(outcome.success).toBe(false);

    if (outcome.success) return;

    expect(codes(outcome.errors)).toContain("vault.transfer.permanent.owner-missing");
  });

  it("moves without changing owner on a temporary separation", () => {
    /*
     * M12. Lending is not giving. The placement changes; `ownerChanged` is false and
     * the owner comes back unchanged.
     */
    const outcome = validateTransfer({
      itemInstanceId: "rod-1",
      kind: "temporary-separation",
      fromPlacement: HELD_BY_GON,
      toPlacement: { parent: "location", locationId: "whale-island" },
      fromOwner: { kind: "character", id: "gon" },
    }, w);

    expect(outcome.success).toBe(true);

    if (!outcome.success) return;

    expect(outcome.payload.owner).toEqual({ kind: "character", id: "gon" });
    expect(outcome.payload.ownerChanged).toBe(false);
    expect(outcome.payload.placementChanged).toBe(true);
  });

  it("refuses a temporary separation that tries to change the owner", () => {
    const outcome = validateTransfer({
      itemInstanceId: "rod-1",
      kind: "temporary-separation",
      fromPlacement: HELD_BY_GON,
      toPlacement: { parent: "character", characterId: "killua", engagement: "held" },
      fromOwner: { kind: "character", id: "gon" },
      toOwner: { kind: "character", id: "killua" },
    }, w);

    expect(outcome.success).toBe(false);

    if (outcome.success) return;

    expect(codes(outcome.errors)).toContain("vault.transfer.temporary.owner-changed");
  });

  it("cannot create a second authority by placing an Item inside itself or its own contents", () => {
    const intoItself = validateTransfer({
      itemInstanceId: "pack-1",
      kind: "temporary-separation",
      fromPlacement: { parent: "character", characterId: "gon", engagement: "worn" },
      toPlacement: { parent: "container", containerId: "pack-1" },
    }, w);

    expect(intoItself.success).toBe(false);

    if (!intoItself.success) {
      expect(codes(intoItself.errors)).toContain("vault.transfer.self-containment");
    }

    // And into something it already contains, which is the two-node swap.
    const intoDescendant = validateTransfer({
      itemInstanceId: "pack-1",
      kind: "temporary-separation",
      fromPlacement: { parent: "character", characterId: "gon", engagement: "worn" },
      toPlacement: { parent: "container", containerId: "box-1" },
    }, w);

    expect(intoDescendant.success).toBe(false);

    if (!intoDescendant.success) {
      expect(codes(intoDescendant.errors)).toContain("vault.transfer.cycle");
    }
  });

  it("refuses a transfer whose destination names two parents", () => {
    const outcome = validateTransfer({
      itemInstanceId: "rod-1",
      kind: "temporary-separation",
      fromPlacement: HELD_BY_GON,
      toPlacement: {
        parent: "location",
        locationId: "docks",
        containerId: "box-1",
      } as unknown as ItemPlacement,
    }, w);

    expect(outcome.success).toBe(false);

    if (outcome.success) return;

    expect(codes(outcome.errors)).toContain("vault.placement.parent.conflict");
  });
});
