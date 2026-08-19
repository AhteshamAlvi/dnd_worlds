/*
 * Tests the identity catalogs: Species, Sub-species and Clans.
 *
 * The interesting rules here are ancestry: shares that must total 100, and
 * the lineage walk that makes a Human Firebender count as Human without
 * either rule's author having to arrange it.
 *
 * Mutations used to live here as a third identity domain with a variant
 * system of its own. A Bender-of-fire is now a Sub-species, which is why
 * those tests are gone rather than rewritten — the concept they covered no
 * longer exists.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import {
  findClanCatalogIssues,
  findClanValidationIssues,
} from "../character/identity/clans";

import {
  collectSpeciesAncestry,
  findSpeciesCatalogIssues,
  findSpeciesValidationIssues,
  isCompleteSpeciesMix,
  isSubspecies,
  listSubspecies,
  speciesAncestry,
  speciesTotalPercentage,
} from "../character/identity/species";

// Registrations are process-wide, so a test that adds one must not leave it
// visible to the next.
afterEach(() => {
  clearCustomDefinitions();
});

describe("character classifications", () => {
  describe("species", () => {
    it("accepts a single Species at 100%", () => {
      expect(
        findSpeciesValidationIssues([
          { speciesId: "human", percentage: 100 },
        ]),
      ).toEqual([]);
    });

    it("rejects an unknown Species", () => {
      expect(
        findSpeciesValidationIssues([
          { speciesId: "not-real", percentage: 100 },
        ]),
      ).toEqual([
        {
          type: "unknown-species",
          speciesId: "not-real",
        },
      ]);
    });

    it("accepts a mixed ancestry that totals 100", () => {
      registerDefinition("species", {
        id: "yuki",
        name: "Yuki",
        description: "A test Species.",
      });

      expect(
        findSpeciesValidationIssues([
          { speciesId: "human", percentage: 75 },
          { speciesId: "yuki", percentage: 25 },
        ]),
      ).toEqual([]);
    });

    // Thirds are the case a strict equality test would wrongly reject.
    it("accepts an even three-way split", () => {
      registerDefinition("species", {
        id: "yuki",
        name: "Yuki",
        description: "A test Species.",
      });
      registerDefinition("species", {
        id: "merfolk",
        name: "Merfolk",
        description: "A test Species.",
      });

      expect(
        findSpeciesValidationIssues([
          { speciesId: "human", percentage: 33.33 },
          { speciesId: "yuki", percentage: 33.33 },
          { speciesId: "merfolk", percentage: 33.34 },
        ]),
      ).toEqual([]);
    });

    it("rejects a mix that does not total 100", () => {
      expect(
        findSpeciesValidationIssues([
          { speciesId: "human", percentage: 60 },
        ]),
      ).toEqual([
        {
          type: "incomplete-species-mix",
          total: 60,
        },
      ]);
    });

    it("rejects the same Species listed twice", () => {
      expect(
        findSpeciesValidationIssues([
          { speciesId: "human", percentage: 50 },
          { speciesId: "human", percentage: 50 },
        ]),
      ).toEqual([
        {
          type: "duplicate-species",
          speciesId: "human",
        },
      ]);
    });

    it("rejects a share of zero or less", () => {
      expect(
        findSpeciesValidationIssues([
          { speciesId: "human", percentage: 0 },
        ]),
      ).toEqual([
        {
          type: "invalid-species-percentage",
          speciesId: "human",
          percentage: 0,
        },
      ]);
    });

    // A broken share already explains the arithmetic; reporting the total on
    // top of it would be two messages about one mistake.
    it("does not also report the total when a share is invalid", () => {
      const issues = findSpeciesValidationIssues([
        { speciesId: "human", percentage: -10 },
      ]);

      expect(issues).toHaveLength(1);
    });

    it("treats no Species as incomplete rather than invalid", () => {
      expect(findSpeciesValidationIssues([])).toEqual([]);
      expect(isCompleteSpeciesMix([])).toBe(false);
    });

    it("totals the shares for a UI to display", () => {
      expect(
        speciesTotalPercentage([
          { speciesId: "human", percentage: 70 },
          { speciesId: "yuki", percentage: 20 },
        ]),
      ).toBe(90);
    });
  });

  describe("sub-species", () => {
    it("knows which Species are narrower kinds of another", () => {
      expect(isSubspecies("firebender")).toBe(true);
      expect(isSubspecies("human")).toBe(false);
    });

    it("walks a Sub-species up to its root", () => {
      expect(speciesAncestry("firebender")).toEqual(["firebender", "human"]);
      expect(speciesAncestry("human")).toEqual(["human"]);
    });

    // The whole reason Sub-species are Species with a parent: a rule written
    // about Human applies to a Firebender without naming them.
    it("counts a Human Firebender as Human", () => {
      expect(
        collectSpeciesAncestry([
          { speciesId: "firebender", percentage: 100 },
        ]),
      ).toEqual(["firebender", "human"]);
    });

    it("does not repeat a shared ancestor across a mix", () => {
      expect(
        collectSpeciesAncestry([
          { speciesId: "firebender", percentage: 50 },
          { speciesId: "waterbender", percentage: 50 },
        ]),
      ).toEqual(["firebender", "human", "waterbender"]);
    });

    it("lists what descends directly from a Species", () => {
      const ids = listSubspecies("human").map((entry) => entry.id);

      expect(ids).toContain("firebender");
      expect(ids).toContain("bloodkin");
      expect(ids).not.toContain("human");
    });

    it("treats an unknown Species as its own root rather than throwing", () => {
      expect(speciesAncestry("not-real")).toEqual(["not-real"]);
    });

    it("rejects a registered Sub-species whose parent does not exist", () => {
      registerDefinition("species", {
        id: "orphan",
        name: "Orphan",
        description: "Descends from nothing that exists.",
        parentSpeciesId: "not-real",
      });

      expect(findSpeciesCatalogIssues()).toEqual([
        expect.stringContaining("unknown Species"),
      ]);
    });

    it("survives a Sub-species registered as its own parent", () => {
      registerDefinition("species", {
        id: "ouroboros",
        name: "Ouroboros",
        description: "Its own ancestor.",
        parentSpeciesId: "ouroboros",
      });

      expect(speciesAncestry("ouroboros")).toEqual(["ouroboros"]);
      expect(findSpeciesCatalogIssues()).toEqual([
        expect.stringContaining("its own parent"),
      ]);
    });
  });

  describe("clans", () => {
    it("allows no Clan", () => {
      expect(findClanValidationIssues([])).toEqual([]);
    });

    it("accepts a known Clan", () => {
      expect(
        findClanValidationIssues([
          {
            clanId: "uchiha",
          },
        ]),
      ).toEqual([]);
    });

    it("rejects an unknown Clan", () => {
      expect(
        findClanValidationIssues([
          {
            clanId: "not-real",
          },
        ]),
      ).toEqual([
        {
          type: "unknown-clan",
          clanId: "not-real",
        },
      ]);
    });

    it("rejects duplicate Clans", () => {
      expect(
        findClanValidationIssues([
          {
            clanId: "uchiha",
          },
          {
            clanId: "uchiha",
          },
        ]),
      ).toEqual([
        {
          type: "duplicate-clan",
          clanId: "uchiha",
        },
      ]);
    });
  });

  describe("authored catalogs", () => {
    it("has valid Species and Clan catalogs", () => {
      expect(findSpeciesCatalogIssues()).toEqual([]);
      expect(findClanCatalogIssues()).toEqual([]);
    });
  });
});
