/*
 * Tests for the trace node factory, and for the one trace a player is most
 * likely to actually read: why an attribute is not the number they wrote
 * down.
 *
 * Provenance is the point. A resolved score that cannot name what changed it
 * is a number the GM has to take on faith, which is exactly what the trace
 * system exists to avoid.
 */

import { afterEach, describe, expect, it } from "vitest";

import { createTraceNode } from "../infrastructure/trace";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";
import {
  createAttributeResolutionTrace,
  explainAttribute,
} from "../character/foundation/attributes/resolution";
import {
  createTestCharacter,
  resolveTestCharacter,
} from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});

describe("createTraceNode", () => {
    it("defaults collection fields when they are omitted", () => {
        const node = createTraceNode({
            id: "test.node",
            label: "Test Node",
            output: 42,
        });

        expect(node.inputs).toEqual({});
        expect(node.warnings).toEqual([]);
        expect(node.children).toEqual([]);
    });

    it("preserves supplied node data", () => {
        const node = createTraceNode({
            id: "aura.test",
            label: "Aura Test",
            formula: "a × b",
            inputs: {
                a: { value: 10 },
                b: { value: 5 },
            },
            output: 50,
            children: [],
        });

        expect(node.id).toBe("aura.test");
        expect(node.formula).toBe("a × b");
        expect(node.inputs.a?.value).toBe(10);
        expect(node.inputs.b?.value).toBe(5);
        expect(node.output).toBe(50);
    });
});

describe("attribute provenance", () => {
  /*
   * The ladder from the ticket:
   *
   *   DEX
   *   Stored              16
   *   Quickened           +3
   *   One Armed           -2
   *   ─────────────────────
   *   Base                17
   *   Poisoned            -3
   *   Swift Boots         +1
   *   ─────────────────────
   *   Resolved            15
   */
  function poisonedSwordsman() {
    registerDefinition("trait", {
      id: "quickened",
      name: "Quickened",
      description: "A test Trait.",
      effects: [{ type: "modifyBaseAttribute", attribute: "dex", amount: 3 }],
    });

    registerDefinition("condition", {
      id: "poisoned",
      name: "Poisoned",
      description: "A test Condition.",
      effects: [
        { type: "modifyResolvedAttribute", attribute: "dex", amount: -3 },
      ],
    });

    registerDefinition("item", {
      id: "swift-boots",
      name: "Swift Boots",
      description: "A test Item.",
      equippedEffects: [
        { type: "modifyResolvedAttribute", attribute: "dex", amount: 1 },
      ],
    });

    return resolveTestCharacter(
      createTestCharacter({
        attributes: { dex: 16 },
        traits: [{ traitId: "quickened" }, { traitId: "one-armed" }],
        conditions: [{ conditionId: "poisoned" }],
        items: [{ itemId: "swift-boots", quantity: 1, equipped: true }],
      }),
    );
  }

  it("explains every step between the stored score and the resolved one", () => {
    const resolved = poisonedSwordsman();

    const explanation = explainAttribute(
      "dex",
      resolved.attributes,
      resolved.baseAttributeModifiers,
      resolved.resolvedAttributeModifiers,
    );

    expect(explanation.stored).toBe(16);
    expect(explanation.base).toBe(17);
    expect(explanation.resolved).toBe(15);

    expect(explanation.baseContributions).toEqual([
      { source: "trait:quickened", amount: 3 },
      { source: "trait:one-armed", amount: -2 },
    ]);

    expect(explanation.resolvedContributions).toEqual([
      { source: "condition:poisoned", amount: -3 },
      { source: "item:swift-boots", amount: 1 },
    ]);
  });

  // The arithmetic has to close: stored plus every listed contribution is the
  // resolved score, or the explanation is hiding something.
  it("accounts for the whole difference", () => {
    const resolved = poisonedSwordsman();

    const explanation = explainAttribute(
      "dex",
      resolved.attributes,
      resolved.baseAttributeModifiers,
      resolved.resolvedAttributeModifiers,
    );

    const total = [
      ...explanation.baseContributions,
      ...explanation.resolvedContributions,
    ].reduce((sum, contribution) => sum + contribution.amount, explanation.stored);

    expect(total).toBe(explanation.resolved);
  });

  it("leaves an untouched attribute with nothing to explain", () => {
    const resolved = poisonedSwordsman();

    const explanation = explainAttribute(
      "int",
      resolved.attributes,
      resolved.baseAttributeModifiers,
      resolved.resolvedAttributeModifiers,
    );

    expect(explanation.baseContributions).toEqual([]);
    expect(explanation.resolvedContributions).toEqual([]);
    expect(explanation.resolved).toBe(explanation.stored);
  });

  it("builds one trace node per attribute, naming each contribution", () => {
    const resolved = poisonedSwordsman();

    const node = createAttributeResolutionTrace(
      resolved.attributes,
      resolved.baseAttributeModifiers,
      resolved.resolvedAttributeModifiers,
    );

    // Nine stored attributes. Strength is derived from the body and has no
    // stored value to trace a provenance for.
    expect(node.children).toHaveLength(9);

    const dex = node.children.find(
      (child) => child.id === "character.attributes.dex.resolve",
    );

    expect(dex?.output).toBe(15);
    expect(dex?.inputs["stored"]?.value).toBe(16);
    expect(dex?.inputs["base"]?.value).toBe(17);
    expect(dex?.inputs["base:trait:one-armed"]?.value).toBe(-2);
    expect(dex?.inputs["resolved:condition:poisoned"]?.value).toBe(-3);
  });

  /*
   * Two ranks of one Skill, both raising the same attribute. The naive
   * keying loses the second and leaves the trace claiming a total its own
   * inputs do not reach.
   */
  it("keeps both contributions when one source applies two to an attribute", () => {
    registerDefinition("skill", {
      id: "twin-boost",
      name: "Twin Boost",
      description: "A test Skill.",
      timings: ["action"],
      maximumMastery: 3,
      ranks: [
        {
          rank: 1,
          effects: [
            { type: "modifyBaseAttribute", attribute: "agi", amount: 1 },
          ],
        },
        {
          rank: 2,
          effects: [
            { type: "modifyBaseAttribute", attribute: "agi", amount: 1 },
          ],
        },
      ],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ skills: [{ skillId: "twin-boost", mastery: 2 }] }),
    );

    const explanation = explainAttribute(
      "agi",
      resolved.attributes,
      resolved.baseAttributeModifiers,
      resolved.resolvedAttributeModifiers,
    );

    expect(explanation.baseContributions).toHaveLength(2);
    expect(explanation.base).toBe(12);

    const node = createAttributeResolutionTrace(
      resolved.attributes,
      resolved.baseAttributeModifiers,
      resolved.resolvedAttributeModifiers,
    );

    const str = node.children.find(
      (child) => child.id === "character.attributes.agi.resolve",
    );

    const contributions = Object.entries(str?.inputs ?? {}).filter(([key]) =>
      key.startsWith("base:"),
    );

    expect(contributions).toHaveLength(2);

    const total = contributions.reduce(
      (sum, [, input]) => sum + Number(input.value),
      10,
    );

    expect(total).toBe(12);
  });

  it("counts how many attributes anything actually changed", () => {
    const resolved = poisonedSwordsman();

    expect(
      createAttributeResolutionTrace(
        resolved.attributes,
        resolved.baseAttributeModifiers,
        resolved.resolvedAttributeModifiers,
      ).output,
    ).toBe(1);
  });
});
