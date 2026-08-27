/*
 * Tests for the palette group taxonomy itself — not the accordion UI, which
 * has no DOM test harness in this repo. What matters here is the mapping
 * staying exhaustive and non-overlapping as domains/categories are added:
 * every engine catalog domain and every workbench package category should
 * land in exactly one group, so nothing silently falls out of the palette.
 */

import { describe, expect, it } from "vitest";
import { CATALOG_DOMAINS } from "@nenworld/engine";

import { PALETTE_CATEGORY_VALUES } from "../items";
import { PALETTE_GROUPS } from "../groups";

describe("PALETTE_GROUPS", () => {
  it("has no duplicate group ids", () => {
    const ids = PALETTE_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("places every engine catalog domain in exactly one group", () => {
    for (const domain of CATALOG_DOMAINS) {
      const owners = PALETTE_GROUPS.filter((group) =>
        (group.catalogDomains ?? []).includes(domain),
      );
      expect(owners, `domain "${domain}"`).toHaveLength(1);
    }
  });

  it("places every workbench package category in exactly one group", () => {
    for (const category of PALETTE_CATEGORY_VALUES) {
      const owners = PALETTE_GROUPS.filter((group) =>
        (group.packageCategories ?? []).includes(category),
      );
      expect(owners, `category "${category}"`).toHaveLength(1);
    }
  });

  it("gives every locked group a non-empty reason", () => {
    for (const group of PALETTE_GROUPS) {
      if (!group.locked) continue;
      expect(group.locked.reason.length, group.id).toBeGreaterThan(0);
    }
  });

  it("never lets a group be both locked and backed by real content", () => {
    for (const group of PALETTE_GROUPS) {
      if (!group.locked) continue;
      expect(group.catalogDomains ?? [], group.id).toHaveLength(0);
      expect(group.packageCategories ?? [], group.id).toHaveLength(0);
    }
  });
});
