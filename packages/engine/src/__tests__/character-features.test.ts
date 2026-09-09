/*
 * Tests the per-character feature lists that are validated the same way:
 * Traits, Techniques, Conditions, injuries and inventory.
 *
 * All of them are "does this id exist, and is it listed once" over an
 * authored catalog, so they share a file. Traits carry the extra weight of
 * being resolvable from other sources as well as from the sheet, which is
 * checked here too.
 *
 * Abilities used to be a fourth list. They were a capability category that
 * only ever said "this character can do this at all" — which is what a Trait
 * says — so Firebending is a Trait now and the Ability tests are gone rather
 * than rewritten.
 */

import { describe, expect, it } from "vitest";
import {
  findInjuryCatalogIssues,
  listAnatomicalInjuryDefinitions,
} from "../character/status/injuries";

import { continuityKey } from "../character/foundation/body/anatomy/types";

import {
  findTraitCatalogIssues,
  findTraitValidationIssues,
  getTraitDefinition,
  isKnownTraitId,
  resolveTraits,
  resolvedTraitIds,
  TRAIT_DEFINITIONS,
} from "../character/identity/traits";

import { findTechniqueCatalogIssues } from "../character/capabilities/techniques";

import { findTechniqueValidationIssues } from "../character/capabilities/validation";

import {
  findConditionCatalogIssues,
  findConditionValidationIssues,
  getConditionDefinition,
} from "../character/status/conditions";

import {
  findInjuryValidationIssues,
} from "../character/foundation/body/injuries";

import {
  findItemCatalogIssues,
  findItemValidationIssues,
} from "../character/equipment/index";

describe("traits", () => {
  it("resolves a known Trait", () => {
    expect(isKnownTraitId("one-armed")).toBe(true);

    expect(getTraitDefinition("one-armed")).toEqual(
      TRAIT_DEFINITIONS["one-armed"],
    );
  });

  it("expresses its mechanics as universal Effects", () => {
    expect(getTraitDefinition("one-armed")?.effects).toEqual([
      {
        type: "modifyBaseAttribute",
        attribute: "dex",
        amount: -2,
      },
    ]);
  });

  it("rejects an unknown Trait id", () => {
    expect(
      findTraitValidationIssues([
        {
          traitId: "not-a-real-trait",
        },
      ]),
    ).toEqual([
      {
        type: "unknown-trait",
        traitId: "not-a-real-trait",
      },
    ]);
  });

  it("rejects duplicate Traits", () => {
    expect(
      findTraitValidationIssues([
        {
          traitId: "one-armed",
        },
        {
          traitId: "one-armed",
        },
      ]),
    ).toEqual([
      {
        type: "duplicate-trait",
        traitId: "one-armed",
      },
    ]);
  });

  it("has a valid authored Trait catalog", () => {
    expect(findTraitCatalogIssues()).toEqual([]);
  });

  it("does not resolve inherited object properties as Trait ids", () => {
    expect(isKnownTraitId("constructor")).toBe(false);
    expect(isKnownTraitId("toString")).toBe(false);
  });
});

describe("resolved traits", () => {
  it("marks a Trait on the sheet as authored", () => {
    const resolved = resolveTraits([{ traitId: "one-armed" }], []).traits;

    expect(resolved["one-armed"]).toEqual({
      id: "one-armed",
      isAuthored: true,
      isGranted: false,
      grantedBy: [],
      availability: "available",
      unlockedBy: [],
      subsumedBy: [],
    });
  });

  it("records who granted a Trait the sheet does not list", () => {
    const resolved = resolveTraits(
      [],
      [
        {
          source: { type: "species", id: "firebender" },
          traitId: "firebending",
          mode: "granted-while-present",
        },
      ],
    ).traits;

    expect(resolved["firebending"]?.isAuthored).toBe(false);
    expect(resolved["firebending"]?.grantedBy).toEqual([
      {
        source: { type: "species", id: "firebender" },
        mode: "granted-while-present",
      },
    ]);
  });

  // Removing one granter must not remove access another still supplies, so
  // both have to be remembered rather than the second being folded away.
  it("keeps every source that grants the same Trait", () => {
    const resolved = resolveTraits(
      [],
      [
        {
          source: { type: "species", id: "firebender" },
          traitId: "firebending",
          mode: "granted-while-present",
        },
        {
          source: { type: "item", id: "ember-ring" },
          traitId: "firebending",
          mode: "granted-while-present",
        },
      ],
    ).traits;

    expect(resolved["firebending"]?.grantedBy).toHaveLength(2);
  });

  it("records one source once, however many times it grants", () => {
    const grant = {
      source: { type: "trait", id: "spider-mutation" },
      traitId: "superstrength",
      mode: "granted-while-present",
    } as const;

    const resolved = resolveTraits([], [grant, grant]).traits;

    expect(resolved["superstrength"]?.grantedBy).toHaveLength(1);
  });

  it("keeps an authored Trait authored when something also grants it", () => {
    const resolved = resolveTraits(
      [{ traitId: "firebending" }],
      [
        {
          source: { type: "species", id: "firebender" },
          traitId: "firebending",
          mode: "granted-while-present",
        },
      ],
    ).traits;

    expect(resolved["firebending"]?.isAuthored).toBe(true);
    expect(resolved["firebending"]?.grantedBy).toHaveLength(1);
  });

  it("lists every Trait the character has, from either source", () => {
    const resolved = resolveTraits(
      [{ traitId: "one-armed" }],
      [
        {
          source: { type: "species", id: "firebender" },
          traitId: "firebending",
          mode: "granted-while-present",
        },
      ],
    ).traits;

    expect([...resolvedTraitIds(resolved)].sort()).toEqual([
      "firebending",
      "one-armed",
    ]);
  });
});

describe("techniques", () => {
  it("allows no Techniques", () => {
    expect(findTechniqueValidationIssues([])).toEqual([]);
  });

  it("accepts a known Technique", () => {
    expect(
      findTechniqueValidationIssues([
        {
          techniqueId: "martial-arts",
        },
      ]),
    ).toEqual([]);
  });

  it("rejects an unknown Technique", () => {
    expect(
      findTechniqueValidationIssues([
        {
          techniqueId: "not-real",
        },
      ]),
    ).toEqual([
      {
        type: "unknown-technique",
        techniqueId: "not-real",
      },
    ]);
  });

  it("rejects duplicate Techniques", () => {
    expect(
      findTechniqueValidationIssues([
        {
          techniqueId: "martial-arts",
        },
        {
          techniqueId: "martial-arts",
        },
      ]),
    ).toEqual([
      {
        type: "duplicate-technique",
        techniqueId: "martial-arts",
      },
    ]);
  });
});

describe("conditions", () => {
  it("allows no Conditions", () => {
    expect(findConditionValidationIssues([])).toEqual([]);
  });

  it("resolves a known Condition", () => {
    expect(getConditionDefinition("exhausted")?.name).toBe("Exhausted");
  });

  it("rejects an unknown Condition", () => {
    expect(
      findConditionValidationIssues([
        {
          conditionId: "not-real",
        },
      ]),
    ).toEqual([
      {
        type: "unknown-condition",
        conditionId: "not-real",
      },
    ]);
  });

  it("rejects the same Condition applied twice", () => {
    expect(
      findConditionValidationIssues([
        {
          conditionId: "prone",
        },
        {
          conditionId: "prone",
        },
      ]),
    ).toEqual([
      {
        type: "duplicate-condition",
        conditionId: "prone",
      },
    ]);
  });
});

describe("injuries", () => {
  it("allows no injuries", () => {
    expect(findInjuryValidationIssues([], listAnatomicalInjuryDefinitions())).toEqual([]);
  });

  // The catalog is empty until the d10 table is authored, so every id is
  // unknown — which is the honest answer, not a gap in validation.
  it("rejects an injury the catalog does not define", () => {
    expect(
      findInjuryValidationIssues([
        {
          id: "injury-1",
          injuryId: "battered",
          location: { continuityKeys: [continuityKey("upper-limb:left")] },
        },
      ],
        listAnatomicalInjuryDefinitions(),
      ),
    ).toEqual([
      {
        type: "unknown-injury",
        id: "injury-1",
        injuryId: "battered",
      },
    ]);
  });
});

describe("items", () => {
  it("allows an empty inventory", () => {
    expect(findItemValidationIssues([])).toEqual([]);
  });

  it("accepts a known Item", () => {
    expect(
      findItemValidationIssues([
        { entryId: "e1", itemId: "gauntlets", quantity: 1, state: "worn" },
      ]),
    ).toEqual([]);
  });

  it("rejects an unknown Item, naming the entry rather than the line", () => {
    expect(
      findItemValidationIssues([
        { entryId: "e1", itemId: "not-real", quantity: 1, state: "carried" },
      ]),
    ).toEqual([
      {
        type: "unknown-item",
        entryId: "e1",
        itemId: "not-real",
      },
    ]);
  });

  it("rejects a fractional quantity", () => {
    expect(
      findItemValidationIssues([
        { entryId: "e1", itemId: "gauntlets", quantity: 1.5, state: "carried" },
      ]),
    ).toEqual([
      {
        type: "invalid-item-quantity",
        entryId: "e1",
        quantity: 1.5,
      },
    ]);
  });

  /*
   * The rule that replaced duplicate-item. Two gauntlets on one sheet is a
   * character with two gauntlets, and the old check called it a lost quantity.
   */
  it("accepts two entries naming the same Item", () => {
    expect(
      findItemValidationIssues([
        { entryId: "left", itemId: "gauntlets", quantity: 1, state: "worn" },
        { entryId: "right", itemId: "gauntlets", quantity: 1, state: "carried" },
      ]),
    ).toEqual([]);
  });

  it("rejects a repeated entry id", () => {
    expect(
      findItemValidationIssues([
        { entryId: "same", itemId: "gauntlets", quantity: 1, state: "worn" },
        { entryId: "same", itemId: "cursed-idol", quantity: 1, state: "carried" },
      ]),
    ).toEqual([
      {
        type: "duplicate-item-entry-id",
        entryId: "same",
      },
    ]);
  });
});

describe("authored catalogs", () => {
  it("has valid Technique, Condition, injury and Item catalogs", () => {
    expect(findTechniqueCatalogIssues()).toEqual([]);
    expect(findConditionCatalogIssues()).toEqual([]);
    expect(findInjuryCatalogIssues()).toEqual([]);
    expect(findItemCatalogIssues()).toEqual([]);
  });
});
