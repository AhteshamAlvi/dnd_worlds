/*
 * Stored Aura and Nen state on Character: what is written down, what is not,
 * and that both survive the round trip to JSON and back.
 *
 * The membership rule is the point. A field belongs here only if it cannot be
 * recomputed — Current Aura and the character's active allocations are the
 * whole list. Everything else about Aura derives from Attributes, Body and Nen
 * state, and storing any of it would be storing a number that can disagree
 * with the character it came from.
 *
 * The other claim under test is that Nen is a SIBLING of Aura rather than its
 * owner. An unawakened character has a pool, can lose Current Aura, and can be
 * reinforced internally. Awakening gates deliberate access, which is a
 * narrower thing than having Aura at all.
 */

import { describe, expect, it } from "vitest";

import { emptyAuraState } from "../character/foundation/aura/state";
import {
  createUnawakenedNenState,
  NEN_PRINCIPLE_IDS,
} from "../character/foundation/nen/nen";
import { continuityKey } from "../character/foundation/body/anatomy/types";
import { NO_MASTERY } from "../character/capabilities/mastery";
import { validateCharacter } from "../character/validation";
import type { Character } from "../character/types";
import type { AuraAllocation } from "../character/foundation/aura/state";

import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";

const RIGHT_ARM = continuityKey("upper-limb:right");

/*
 * Maximum Aura is derived from CON and VIT, and the neutral fixture's all-10
 * stat line derives a pool of 10. Every character here carries a stat line
 * that can actually hold the Aura it is storing, because validateCharacter now
 * enforces that — which is the point, and was worth finding.
 */
const AURA_CAPABLE = { con: 20, vit: 18 } as const;

const ALLOCATIONS: readonly AuraAllocation[] = [
  { id: "ten", coverage: "whole-body", placement: "surface", aura: 1690 },
  {
    id: "chu",
    coverage: "localized",
    placement: "internal",
    continuityKey: RIGHT_ARM,
    aura: 237,
  },
];

function roundTrip(character: Character): Character {
  return JSON.parse(JSON.stringify(character)) as Character;
}


describe("what Character stores about Aura", () => {
  it("carries Current Aura and the active allocations", () => {
    const character = createTestCharacter({
      attributes: AURA_CAPABLE,
      aura: { current: 5000, allocations: ALLOCATIONS },
    });

    expect(character.aura.current).toBe(5000);
    expect(character.aura.allocations).toHaveLength(2);
  });

  /*
   * Every one of these follows from something else that IS stored. A second
   * copy on the sheet is a second copy that can go stale.
   */
  it("stores nothing that can be recomputed", () => {
    const stored = createTestCharacter({
      attributes: AURA_CAPABLE,
      aura: { current: 5000, allocations: ALLOCATIONS },
    }).aura;

    for (const derived of [
      "maximum",
      "output",
      "outputCapacity",
      "regeneration",
      "regenerationCapacity",
      "control",
      "controlMultiplier",
      "density",
      "volumeL",
      "surfaceAreaCm2",
    ]) {
      expect(stored).not.toHaveProperty(derived);
    }
  });

  it("defaults to an empty reserve with nothing placed", () => {
    expect(emptyAuraState()).toEqual({ current: 0, allocations: [] });
    expect(createTestCharacter().aura).toEqual({
      current: 0,
      allocations: [],
    });
  });
});


describe("Nen state as a sibling of Aura", () => {
  it("gives an unawakened character a complete, real Nen state", () => {
    const nen = createUnawakenedNenState();

    expect(nen.awakened).toBe(false);
    expect(Object.keys(nen.mastery)).toHaveLength(NEN_PRINCIPLE_IDS.length);

    for (const principleId of NEN_PRINCIPLE_IDS) {
      expect(nen.mastery[principleId]).toBe(NO_MASTERY);
    }
  });

  /*
   * The distinction the split exists for. Not awakened is not the same as
   * having no Aura, so an unawakened character still carries a reserve.
   */
  it("lets an unawakened character hold and lose Current Aura", () => {
    const character = createTestCharacter({
      attributes: AURA_CAPABLE,
      aura: { current: 4000, allocations: [] },
      nen: createUnawakenedNenState(),
    });

    expect(character.nen.awakened).toBe(false);
    expect(character.aura.current).toBe(4000);

    const drained = {
      ...character,
      aura: { ...character.aura, current: 1200 },
    };

    expect(drained.nen.awakened).toBe(false);
    expect(drained.aura.current).toBe(1200);
  });

  it("keeps the Aura pool out of Nen state entirely", () => {
    const nen = createUnawakenedNenState();

    for (const auraField of ["current", "aura", "pool", "maximum"]) {
      expect(nen).not.toHaveProperty(auraField);
    }
  });

  it("records awakening independently of how much Aura is held", () => {
    const awakened = createTestCharacter({
      aura: { current: 0, allocations: [] },
      nen: { ...createUnawakenedNenState(), awakened: true },
    });

    expect(awakened.nen.awakened).toBe(true);
    expect(awakened.aura.current).toBe(0);
  });
});


describe("serialization", () => {
  const character = createTestCharacter({
    attributes: AURA_CAPABLE,
    aura: { current: 5000, allocations: ALLOCATIONS },
    nen: { ...createUnawakenedNenState(), awakened: true },
  });

  it("round-trips Aura state through JSON unchanged", () => {
    expect(roundTrip(character).aura).toEqual(character.aura);
  });

  it("round-trips Nen state through JSON unchanged", () => {
    expect(roundTrip(character).nen).toEqual(character.nen);
  });

  /*
   * ContinuityKey is a branded string. The brand is compile-time only, so it
   * has to survive JSON as a plain string and still address the same identity.
   */
  it("keeps a branded ContinuityKey addressable after a round trip", () => {
    const restored = roundTrip(character);
    const localized = restored.aura.allocations.find(
      (allocation) => allocation.coverage === "localized",
    );

    expect(localized).toBeDefined();
    expect(localized!.coverage === "localized" && localized!.continuityKey)
      .toBe(RIGHT_ARM);
  });

  it("produces no undefined or function values anywhere in the Aura state", () => {
    const serialized = JSON.stringify(character.aura);

    expect(serialized).not.toContain("undefined");
    expect(JSON.parse(serialized)).toEqual(character.aura);
  });

  it("survives a round trip well enough to still resolve", () => {
    const restored = roundTrip(character);

    expect(validateCharacter(restored).success).toBe(true);
    expect(resolveTestCharacter(restored).senses.senses.sight.available)
      .toBe(true);
  });
});
