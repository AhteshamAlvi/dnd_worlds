/*
 * Tests the per-character feature lists that are validated the same way:
 * Traits, Abilities, Techniques and Conditions.
 *
 * All four are "does this id exist, and is it listed once" over an authored
 * catalog, so they share a file. Traits carry the extra weight of feeding
 * attribute resolution, which is checked here too.
 */

import { describe, expect, it } from "vitest";

import {
  findTraitCatalogIssues,
  findTraitValidationIssues,
  getTraitDefinition,
  isKnownTraitId,
  TRAIT_DEFINITIONS,
} from "../character/identity/traits";

import {
  findAbilityCatalogIssues,
  isKnownAbilityId,
} from "../character/capabilities/abilities";

import { findTechniqueCatalogIssues } from "../character/capabilities/techniques";

import {
  findAbilityValidationIssues,
  findTechniqueValidationIssues,
} from "../character/capabilities/validation";

import {
  findConditionCatalogIssues,
  findConditionValidationIssues,
  getConditionDefinition,
} from "../character/status/conditions";

import { resolveAttributes } from "../character/foundation/attributes/resolution";
import type { Attributes } from "../character/foundation/attributes/types";

const TEST_ATTRIBUTES: Attributes = {
  str: 10,
  agi: 10,
  dex: 15,
  con: 10,
  vit: 10,
  int: 10,
  wis: 10,
  per: 10,
  spi: 10,
  cha: 10,
};

describe("traits", () => {
  it("resolves a known Trait", () => {
    expect(isKnownTraitId("one-armed")).toBe(true);

    expect(getTraitDefinition("one-armed")).toEqual(
      TRAIT_DEFINITIONS["one-armed"],
    );
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
});

describe("attribute resolution", () => {
  it("applies permanent Attribute modifiers", () => {
    const resolved = resolveAttributes(TEST_ATTRIBUTES, [
      {
        traitId: "one-armed",
      },
    ]);

    expect(resolved.dex).toBe(13);
  });

  it("does not mutate the stored/base Attributes", () => {
    resolveAttributes(TEST_ATTRIBUTES, [
      {
        traitId: "one-armed",
      },
    ]);

    expect(TEST_ATTRIBUTES.dex).toBe(15);
  });

  it("leaves unrelated Attributes unchanged", () => {
    const resolved = resolveAttributes(TEST_ATTRIBUTES, [
      {
        traitId: "one-armed",
      },
    ]);

    expect(resolved.str).toBe(10);
    expect(resolved.agi).toBe(10);
    expect(resolved.con).toBe(10);
  });

  it("ignores an unknown Trait rather than throwing", () => {
    const resolved = resolveAttributes(TEST_ATTRIBUTES, [
      {
        traitId: "not-a-real-trait",
      },
    ]);

    expect(resolved).toEqual(TEST_ATTRIBUTES);
  });

  it("returns the stored Attributes when there are no Traits", () => {
    expect(resolveAttributes(TEST_ATTRIBUTES)).toEqual(TEST_ATTRIBUTES);
  });
});

describe("abilities", () => {
  it("allows no Abilities", () => {
    expect(findAbilityValidationIssues([])).toEqual([]);
  });

  it("accepts a known Ability", () => {
    expect(
      findAbilityValidationIssues([
        {
          abilityId: "firebending",
        },
      ]),
    ).toEqual([]);
  });

  it("rejects an unknown Ability", () => {
    expect(
      findAbilityValidationIssues([
        {
          abilityId: "not-real",
        },
      ]),
    ).toEqual([
      {
        type: "unknown-ability",
        abilityId: "not-real",
      },
    ]);
  });

  it("rejects duplicate Abilities", () => {
    expect(
      findAbilityValidationIssues([
        {
          abilityId: "firebending",
        },
        {
          abilityId: "firebending",
        },
      ]),
    ).toEqual([
      {
        type: "duplicate-ability",
        abilityId: "firebending",
      },
    ]);
  });

  it("does not resolve inherited object properties as Ability ids", () => {
    expect(isKnownAbilityId("constructor")).toBe(false);
    expect(isKnownAbilityId("toString")).toBe(false);
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

describe("authored catalogs", () => {
  it("has valid Ability, Technique and Condition catalogs", () => {
    expect(findAbilityCatalogIssues()).toEqual([]);
    expect(findTechniqueCatalogIssues()).toEqual([]);
    expect(findConditionCatalogIssues()).toEqual([]);
  });
});
