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
    const resolved = resolveTraits([{ traitId: "one-armed" }], []);

    expect(resolved["one-armed"]).toEqual({
      traitId: "one-armed",
      isAuthored: true,
      grantedBy: [],
    });
  });

  it("records who granted a Trait the sheet does not list", () => {
    const resolved = resolveTraits(
      [],
      [
        {
          source: { type: "species", id: "firebender" },
          traitId: "firebending",
        },
      ],
    );

    expect(resolved["firebending"]?.isAuthored).toBe(false);
    expect(resolved["firebending"]?.grantedBy).toEqual([
      { type: "species", id: "firebender" },
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
        },
        {
          source: { type: "item", id: "ember-ring" },
          traitId: "firebending",
        },
      ],
    );

    expect(resolved["firebending"]?.grantedBy).toHaveLength(2);
  });

  it("records one source once, however many times it grants", () => {
    const grant = {
      source: { type: "trait", id: "spider-mutation" },
      traitId: "superstrength",
    };

    const resolved = resolveTraits([], [grant, grant]);

    expect(resolved["superstrength"]?.grantedBy).toHaveLength(1);
  });

  it("keeps an authored Trait authored when something also grants it", () => {
    const resolved = resolveTraits(
      [{ traitId: "firebending" }],
      [
        {
          source: { type: "species", id: "firebender" },
          traitId: "firebending",
        },
      ],
    );

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
        },
      ],
    );

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
        { itemId: "gauntlets", quantity: 1, equipped: true },
      ]),
    ).toEqual([]);
  });

  it("rejects an unknown Item", () => {
    expect(
      findItemValidationIssues([
        { itemId: "not-real", quantity: 1, equipped: false },
      ]),
    ).toEqual([
      {
        type: "unknown-item",
        itemId: "not-real",
      },
    ]);
  });

  it("rejects a fractional quantity", () => {
    expect(
      findItemValidationIssues([
        { itemId: "gauntlets", quantity: 1.5, equipped: false },
      ]),
    ).toEqual([
      {
        type: "invalid-item-quantity",
        itemId: "gauntlets",
        quantity: 1.5,
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
