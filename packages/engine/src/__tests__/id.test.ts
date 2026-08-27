/*
 * Tests createCharacterId: format, and that generating a lot of them in a
 * tight loop (the case that would surface both a weak RNG and any hidden
 * dependency on the clock) never collides.
 */

import { describe, expect, it } from "vitest";

import { CHARACTER_ID_PATTERN, createCharacterId } from "../character/id";

describe("createCharacterId", () => {
  it("produces a char-prefixed, fixed-length, lowercase-alphanumeric id", () => {
    const id = createCharacterId();

    expect(id).toMatch(CHARACTER_ID_PATTERN);
    expect(id).toMatch(/^char-[a-z0-9]{16}$/);
  });

  it("never repeats across a large batch generated back-to-back", () => {
    const ids = new Set<string>();

    for (let i = 0; i < 20_000; i++) {
      ids.add(createCharacterId());
    }

    expect(ids.size).toBe(20_000);
  });

  it("does not depend on a name, timestamp, or any argument", () => {
    // The type signature already forbids arguments; this just confirms two
    // calls made in the same tick — same clock millisecond, no name in play
    // — still diverge.
    const a = createCharacterId();
    const b = createCharacterId();

    expect(a).not.toBe(b);
  });
});
