/*
 * Tests for the character sort comparators: ordering, tie-breaking, and that
 * Age/Race are present but marked unavailable rather than sorting against
 * data Character doesn't have. Runs entirely on plain CharacterSheet
 * fixtures — no React, no roster reducer.
 */

import { describe, expect, it } from "vitest";

import type { CharacterSheet } from "../sheet";
import {
  combinedAttributeScore,
  findSortOption,
  SORT_OPTIONS,
  sortCharacterIds,
} from "../query/sort";

function fixtureSheet(
  id: string,
  name: string,
  attributeOverrides: Partial<CharacterSheet["character"]["attributes"]> = {},
): CharacterSheet {
  return {
    schemaVersion: 1,
    id,
    name,
    character: {
      id,
      name,
      attributes: {
        str: 10, agi: 10, dex: 10, con: 10, vit: 10,
        int: 10, wis: 10, per: 10, spi: 10, cha: 10,
        ...attributeOverrides,
      },
      body: { surfaceUnits: 100 },
    },
    workbench: {
      auraPool: { current: 0 },
      renAccessFraction: 0,
      notes: "",
    },
    updatedAt: new Date().toISOString(),
  };
}

describe("combinedAttributeScore", () => {
  it("sums all ten attributes", () => {
    const sheet = fixtureSheet("a", "A", { str: 18, agi: 8 });
    // Eight attributes at 10, plus str 18 and agi 8: 8*10 + 18 + 8.
    expect(combinedAttributeScore(sheet)).toBe(106);
  });
});

describe("sortCharacterIds", () => {
  const sheets: Record<string, CharacterSheet> = {
    b: fixtureSheet("b", "Bisky"),
    g: fixtureSheet("g", "Gon", { str: 14 }),
    k: fixtureSheet("k", "Killua", { str: 14 }), // ties Gon on name-free sorts
  };
  const ids = ["k", "g", "b"];

  it("orders by name A → Z", () => {
    const option = findSortOption("name:asc");
    expect(sortCharacterIds(ids, sheets, option)).toEqual(["b", "g", "k"]);
  });

  it("orders by name Z → A", () => {
    const option = findSortOption("name:desc");
    expect(sortCharacterIds(ids, sheets, option)).toEqual(["k", "g", "b"]);
  });

  it("orders by combined attributes low → high, tying on id when scores match", () => {
    // Gon and Killua both score higher than Bisky and tie each other.
    const option = findSortOption("attributes:asc");
    expect(sortCharacterIds(ids, sheets, option)).toEqual(["b", "g", "k"]);
  });

  it("orders by combined attributes high → low", () => {
    const option = findSortOption("attributes:desc");
    const result = sortCharacterIds(ids, sheets, option);

    expect(result[2]).toBe("b"); // lowest score, sorts last
    expect(new Set(result.slice(0, 2))).toEqual(new Set(["g", "k"]));
  });

  it("passes ids through unchanged when no option is given", () => {
    expect(sortCharacterIds(ids, sheets, null)).toEqual(ids);
  });

  it("never mutates the input array", () => {
    const original = [...ids];
    sortCharacterIds(ids, sheets, findSortOption("name:asc"));
    expect(ids).toEqual(original);
  });
});

describe("findSortOption", () => {
  it("resolves a known, available option id", () => {
    expect(findSortOption("name:asc")).not.toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(findSortOption("nope")).toBeNull();
  });

  it("returns null for an unavailable option rather than a broken comparator", () => {
    expect(findSortOption("age:asc")).toBeNull();
    expect(findSortOption("race:asc")).toBeNull();
  });
});

describe("SORT_OPTIONS", () => {
  it("marks Age and Race unavailable, each with a stated reason", () => {
    const reserved = SORT_OPTIONS.filter((option) => !option.available);

    expect(reserved.map((option) => option.id).sort()).toEqual([
      "age:asc",
      "age:desc",
      "race:asc",
      "race:desc",
    ]);

    for (const option of reserved) {
      expect(option.available).toBe(false);
      if (!option.available) {
        expect(option.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it("ships exactly the required minimum set of available sorts", () => {
    const available = SORT_OPTIONS.filter((option) => option.available).map(
      (option) => option.id,
    );

    expect(available.sort()).toEqual([
      "attributes:asc",
      "attributes:desc",
      "name:asc",
      "name:desc",
    ]);
  });
});
