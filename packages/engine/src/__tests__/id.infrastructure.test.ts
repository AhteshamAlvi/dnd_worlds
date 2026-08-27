/*
 * Tests the shared generator behind createCharacterId and
 * createDefinitionId: format for an arbitrary prefix, and that generating a
 * lot of ids in a tight loop never collides.
 */

import { describe, expect, it } from "vitest";

import { createId, idPattern } from "../infrastructure/id";

describe("createId", () => {
  it("produces a prefixed, fixed-length, lowercase-alphanumeric id", () => {
    const id = createId("species-");

    expect(id).toMatch(idPattern("species-"));
    expect(id).toMatch(/^species-[a-z0-9]{16}$/);
  });

  it("never repeats across a large batch generated back-to-back", () => {
    const ids = new Set<string>();

    for (let i = 0; i < 20_000; i++) {
      ids.add(createId("test-"));
    }

    expect(ids.size).toBe(20_000);
  });

  it("does not depend on anything but the prefix it is given", () => {
    const a = createId("item-");
    const b = createId("item-");

    expect(a).not.toBe(b);
  });
});

describe("idPattern", () => {
  it("rejects an id built for a different prefix", () => {
    expect(createId("clan-")).not.toMatch(idPattern("trait-"));
  });
});
