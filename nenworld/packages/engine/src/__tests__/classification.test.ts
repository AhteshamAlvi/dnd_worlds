/*
 * Tests the identity catalogs: Species, Clans and Mutations.
 *
 * The interesting rules here are the Mutation variant ones — a Bender is
 * always a Bender of something, while a Bloodkin is just a Bloodkin.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import {
  findClanCatalogIssues,
  findClanValidationIssues,
} from "../character/identity/clans";

import {
  findMutationCatalogIssues,
  findMutationValidationIssues,
} from "../character/identity/mutations";

import {
  findSpeciesCatalogIssues,
  findSpeciesValidationIssues,
  isCompleteSpeciesMix,
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

  describe("mutations", () => {
    it("allows no Mutations", () => {
      expect(findMutationValidationIssues([])).toEqual([]);
    });

    it("accepts a Fire Bender", () => {
      expect(
        findMutationValidationIssues([
          {
            mutationId: "bender",
            variantId: "fire",
          },
        ]),
      ).toEqual([]);
    });

    it("accepts a variantless Mutation", () => {
      expect(
        findMutationValidationIssues([
          {
            mutationId: "bloodkin",
          },
        ]),
      ).toEqual([]);
    });

    it("requires a Bender element", () => {
      expect(
        findMutationValidationIssues([
          {
            mutationId: "bender",
          },
        ]),
      ).toEqual([
        {
          type: "missing-mutation-variant",
          mutationId: "bender",
        },
      ]);
    });

    it("rejects an unknown Bender element", () => {
      expect(
        findMutationValidationIssues([
          {
            mutationId: "bender",
            variantId: "ice",
          },
        ]),
      ).toEqual([
        {
          type: "unknown-mutation-variant",
          mutationId: "bender",
          variantId: "ice",
        },
      ]);
    });

    it("rejects multiple Bender variants", () => {
      expect(
        findMutationValidationIssues([
          {
            mutationId: "bender",
            variantId: "fire",
          },
          {
            mutationId: "bender",
            variantId: "lightning",
          },
        ]),
      ).toEqual([
        {
          type: "duplicate-mutation",
          mutationId: "bender",
        },
      ]);
    });

    it("rejects variants on non-variant Mutations", () => {
      expect(
        findMutationValidationIssues([
          {
            mutationId: "bloodkin",
            variantId: "wolf",
          },
        ]),
      ).toEqual([
        {
          type: "unexpected-mutation-variant",
          mutationId: "bloodkin",
          variantId: "wolf",
        },
      ]);
    });

    it("does not check the variant of an unknown Mutation", () => {
      expect(
        findMutationValidationIssues([
          {
            mutationId: "not-real",
            variantId: "fire",
          },
        ]),
      ).toEqual([
        {
          type: "unknown-mutation",
          mutationId: "not-real",
        },
      ]);
    });
  });

  describe("authored catalogs", () => {
    it("has valid Species, Clan and Mutation catalogs", () => {
      expect(findSpeciesCatalogIssues()).toEqual([]);
      expect(findClanCatalogIssues()).toEqual([]);
      expect(findMutationCatalogIssues()).toEqual([]);
    });
  });
});
