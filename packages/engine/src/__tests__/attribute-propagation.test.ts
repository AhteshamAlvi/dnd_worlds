/*
 * Tests that a change to an Attribute score propagates everywhere it should,
 * automatically.
 *
 * This is the load-bearing property of the whole Derived Attribute design:
 * nothing recalculates a Derived Attribute on purpose when a Trait fires.
 * Derived Attributes are computed from the RESOLVED layer at resolve time, so
 * they cannot be stale — and these tests are what would catch someone
 * "optimizing" that into a cached value or a second propagation path.
 *
 * The distinction from check modifiers (which must NOT propagate) is covered
 * in check-modifiers.test.ts.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import { resolveCharacter } from "../character/resolution";
import { DERIVED_ATTRIBUTE_SOURCES } from "../character/foundation/attributes/derived/resolution";
import { DERIVED_ATTRIBUTE_NAMES } from "../character/foundation/attributes/derived/types";

import { createTestCharacter } from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});

describe("a permanent score change reaches the Derived Attributes", () => {
  it("recalculates every Derived Attribute that draws on the changed score", () => {
    registerDefinition("trait", {
      id: "flexible",
      name: "Flexible",
      description: "A test Trait that raises AGI.",
      effects: [{ type: "modifyBaseAttribute", attribute: "agi", amount: 2 }],
    });

    const before = resolveCharacter(
      createTestCharacter({ attributes: { agi: 17 } }),
    );

    const after = resolveCharacter(
      createTestCharacter({
        attributes: { agi: 17 },
        traits: [{ traitId: "flexible" }],
      }),
    );

    expect(before.attributes.resolved.agi).toBe(17);
    expect(after.attributes.resolved.agi).toBe(19);

    // Athletics = round((STR 10 + AGI) / 2): 14 -> 15 (13.5 and 14.5 both
    // round up).
    expect(before.derivedAttributes.athletics).toBe(14);
    expect(after.derivedAttributes.athletics).toBe(15);

    // Acrobatics = round((AGI + DEX 10) / 2): 14 -> 15.
    expect(before.derivedAttributes.acrobatics).toBe(14);
    expect(after.derivedAttributes.acrobatics).toBe(15);

    // Combat Ability = round((STR + AGI + DEX + PER + WIS) / 5), four of them
    // at 10: 11 -> 12 (11.4 -> 11, 11.8 -> 12).
    expect(before.derivedAttributes.combatAbility).toBe(11);
    expect(after.derivedAttributes.combatAbility).toBe(12);
  });

  it("leaves Derived Attributes that do not draw on it untouched", () => {
    registerDefinition("trait", {
      id: "flexible",
      name: "Flexible",
      description: "A test Trait that raises AGI.",
      effects: [{ type: "modifyBaseAttribute", attribute: "agi", amount: 2 }],
    });

    const before = resolveCharacter(createTestCharacter());
    const after = resolveCharacter(
      createTestCharacter({ traits: [{ traitId: "flexible" }] }),
    );

    for (const name of DERIVED_ATTRIBUTE_NAMES) {
      const drawsOnAgi = (
        DERIVED_ATTRIBUTE_SOURCES[name] as readonly string[]
      ).includes("agi");

      if (drawsOnAgi) continue;

      expect(after.derivedAttributes[name]).toBe(
        before.derivedAttributes[name],
      );
    }
  });

  it("carries the change through to the Derived Attribute's standard modifier", () => {
    registerDefinition("trait", {
      id: "gifted",
      name: "Gifted",
      description: "A test Trait that raises WIS sharply.",
      effects: [{ type: "modifyBaseAttribute", attribute: "wis", amount: 6 }],
    });

    const resolved = resolveCharacter(
      createTestCharacter({
        attributes: { per: 16, wis: 10 },
        traits: [{ traitId: "gifted" }],
      }),
    );

    // WIS 10 + 6 = 16; Detection = round((PER 16 + WIS 16) / 2) = 16.
    expect(resolved.attributes.resolved.wis).toBe(16);
    expect(resolved.derivedScores.detection).toEqual({
      score: 16,
      standardModifier: 3,
    });
  });
});

describe("a temporary score change propagates the same way", () => {
  it("moves Derived Attributes through the resolved layer, not the base one", () => {
    registerDefinition("condition", {
      id: "hobbled",
      name: "Hobbled",
      description: "A test Condition that lowers AGI.",
      effects: [
        { type: "modifyResolvedAttribute", attribute: "agi", amount: -4 },
      ],
    });

    const resolved = resolveCharacter(
      createTestCharacter({
        attributes: { agi: 18, dex: 18 },
        conditions: [{ conditionId: "hobbled" }],
      }),
    );

    // Base is untouched; only Resolved carries the penalty.
    expect(resolved.attributes.base.agi).toBe(18);
    expect(resolved.attributes.resolved.agi).toBe(14);

    /*
     * Acrobatics = round((AGI + DEX) / 2). Reading Base would give 18;
     * reading Resolved gives round((14 + 18) / 2) = 16. This assertion is
     * the one that fails if Derived Attributes are ever moved onto the Base
     * layer.
     */
    expect(resolved.derivedAttributes.acrobatics).toBe(16);
  });

  it("stacks a permanent and a temporary change in the right order", () => {
    registerDefinition("trait", {
      id: "flexible",
      name: "Flexible",
      description: "A test Trait that raises AGI.",
      effects: [{ type: "modifyBaseAttribute", attribute: "agi", amount: 2 }],
    });

    registerDefinition("condition", {
      id: "hobbled",
      name: "Hobbled",
      description: "A test Condition that lowers AGI.",
      effects: [
        { type: "modifyResolvedAttribute", attribute: "agi", amount: -4 },
      ],
    });

    const resolved = resolveCharacter(
      createTestCharacter({
        attributes: { agi: 17, dex: 17 },
        traits: [{ traitId: "flexible" }],
        conditions: [{ conditionId: "hobbled" }],
      }),
    );

    expect(resolved.attributes.stored.agi).toBe(17);
    expect(resolved.attributes.base.agi).toBe(19);
    expect(resolved.attributes.resolved.agi).toBe(15);

    // Acrobatics = round((15 + 17) / 2) = 16.
    expect(resolved.derivedAttributes.acrobatics).toBe(16);
  });
});

describe("derived state is never stale", () => {
  it("agrees with derivedScores on every value", () => {
    registerDefinition("trait", {
      id: "flexible",
      name: "Flexible",
      description: "A test Trait that raises AGI.",
      effects: [{ type: "modifyBaseAttribute", attribute: "agi", amount: 2 }],
    });

    const resolved = resolveCharacter(
      createTestCharacter({
        attributes: { agi: 17 },
        traits: [{ traitId: "flexible" }],
      }),
    );

    for (const name of DERIVED_ATTRIBUTE_NAMES) {
      expect(resolved.derivedScores[name].score).toBe(
        resolved.derivedAttributes[name],
      );
    }
  });

  it("is stable across repeated resolutions of the same character", () => {
    const character = createTestCharacter({ attributes: { agi: 17, dex: 13 } });

    expect(resolveCharacter(character).derivedAttributes).toEqual(
      resolveCharacter(character).derivedAttributes,
    );
  });
});
