/*
 * Tests that an Effect means the same thing wherever it comes from.
 *
 * This is the property the whole data-driven design rests on: the source of
 * an Effect decides *when* it applies, never *what* it is allowed to do. A
 * Trait, an Item, a Condition and a Technique rank all reach the character
 * through one path, so a new kind of content needs no new application code.
 *
 * The tests below therefore mostly compare one source against another, rather
 * than checking that any one of them works — an implementation that special-
 * cased Traits would pass the second kind of test and fail these.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import { resolveRuleEffects } from "../character/rules/resolution";
import type { Effect } from "../character/rules/effects";

import {
  createTestCharacter,
  resolveTestCharacter,
} from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});

const STRENGTH_UP: Effect = {
  type: "modifyResolvedAttribute",
  attribute: "agi",
  amount: 2,
};

describe("effects are independent of their source", () => {
  it("produces the same modifier from a Trait, an Item and a Condition", () => {
    const fromEach = (type: string) =>
      resolveRuleEffects([
        { source: { type, id: "whatever" }, effects: [STRENGTH_UP] },
      ]).resolvedAttributeModifiers.map(({ attribute, amount }) => ({
        attribute,
        amount,
      }));

    expect(fromEach("trait")).toEqual(fromEach("item"));
    expect(fromEach("item")).toEqual(fromEach("condition"));
    expect(fromEach("condition")).toEqual([{ attribute: "agi", amount: 2 }]);
  });

  it("keeps the source on every modifier it produces", () => {
    const resolved = resolveRuleEffects([
      { source: { type: "item", id: "gauntlets" }, effects: [STRENGTH_UP] },
    ]);

    expect(resolved.resolvedAttributeModifiers[0]?.source).toEqual({
      type: "item",
      id: "gauntlets",
    });
  });

  it("separates permanent modifiers from active ones", () => {
    const resolved = resolveRuleEffects([
      {
        source: { type: "trait", id: "one-armed" },
        effects: [
          { type: "modifyBaseAttribute", attribute: "dex", amount: -2 },
          { type: "modifyResolvedAttribute", attribute: "dex", amount: -3 },
        ],
      },
    ]);

    expect(resolved.baseAttributeModifiers).toHaveLength(1);
    expect(resolved.resolvedAttributeModifiers).toHaveLength(1);
  });

  // Nothing about modifyBaseAttribute belongs to Traits. An Item that
  // permanently changes a character is unusual, not illegal, and the engine
  // should not be the thing deciding otherwise.
  it("lets an Item modify the Base layer if that is what it says", () => {
    const resolved = resolveRuleEffects([
      {
        source: { type: "item", id: "titans-heart" },
        effects: [
          { type: "modifyBaseAttribute", attribute: "con", amount: 1 },
        ],
      },
    ]);

    expect(resolved.baseAttributeModifiers).toHaveLength(1);
    expect(resolved.resolvedAttributeModifiers).toHaveLength(0);
  });

  it("keeps both grants when two sources grant the same thing", () => {
    const resolved = resolveRuleEffects([
      {
        source: { type: "trait", id: "spider-mutation" },
        effects: [{ type: "grantSkill", skillId: "wall-sticking" }],
      },
      {
        source: { type: "item", id: "climbing-gloves" },
        effects: [{ type: "grantSkill", skillId: "wall-sticking" }],
      },
    ]);

    expect(resolved.skillGrants).toHaveLength(2);
  });
});

describe("effects reaching a character", () => {
  it("applies a Trait's Base modifier without touching the stored score", () => {
    const resolved = resolveTestCharacter(
      createTestCharacter({
        attributes: { dex: 16 },
        traits: [{ traitId: "one-armed" }],
      }),
    );

    expect(resolved.attributes.stored.dex).toBe(16);
    expect(resolved.attributes.base.dex).toBe(14);
    expect(resolved.attributes.resolved.dex).toBe(14);
  });

  it("applies a Condition to the Resolved layer only", () => {
    // The authored Conditions carry no Effects at all — see
    // status/conditions.ts — so this registers one rather than relying on
    // canon content, the same way every other test in this file that needs
    // an Effect-bearing Trait/Item/Condition does.
    registerDefinition("condition", {
      id: "weakened",
      name: "Weakened",
      description: "A test Condition.",
      effects: [
        { type: "modifyResolvedAttribute", attribute: "con", amount: -2 },
      ],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({
        attributes: { con: 12 },
        conditions: [{ conditionId: "weakened" }],
      }),
    );

    expect(resolved.attributes.base.con).toBe(12);
    expect(resolved.attributes.resolved.con).toBe(10);
  });

  it("applies an equipped Item and ignores it once unequipped", () => {
    const equipped = resolveTestCharacter(
      createTestCharacter({
        items: [{ itemId: "gauntlets", quantity: 1, equipped: true }],
      }),
    );

    const carried = resolveTestCharacter(
      createTestCharacter({
        items: [{ itemId: "gauntlets", quantity: 1, equipped: false }],
      }),
    );

    /*
     * The gauntlets are a situational check modifier rather than a score
     * change — equipment leverage belongs to action resolution, not to the
     * body — so what equipping them changes is the modifier a Combat Ability
     * check receives, not any Attribute.
     */
    expect(equipped.effects.checkModifiers).toHaveLength(1);
    expect(equipped.effects.checkModifiers[0]?.amount).toBe(2);

    expect(carried.effects.checkModifiers).toEqual([]);

    expect(equipped.attributes.resolved.agi).toBe(10);
    expect(carried.attributes.resolved.agi).toBe(10);
  });

  it("applies a possessed Item's effect without it being worn", () => {
    const resolved = resolveTestCharacter(
      createTestCharacter({
        items: [{ itemId: "cursed-idol", quantity: 1, equipped: false }],
      }),
    );

    expect(resolved.attributes.resolved.cha).toBe(9);
  });

  // The ladder from the ticket, end to end and from four different kinds of
  // source at once.
  it("stacks Base and Resolved effects from unrelated sources", () => {
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

    const resolved = resolveTestCharacter(
      createTestCharacter({
        attributes: { dex: 16 },
        traits: [{ traitId: "one-armed" }, { traitId: "quickened" }],
        conditions: [{ conditionId: "poisoned" }],
        items: [{ itemId: "swift-boots", quantity: 1, equipped: true }],
      }),
    );

    // 16 stored, -2 One Armed, +3 Quickened
    expect(resolved.attributes.base.dex).toBe(17);

    // 17 base, -3 poison, +1 boots
    expect(resolved.attributes.resolved.dex).toBe(15);
  });
});

describe("grant effects", () => {
  it("grants a Skill from a Trait", () => {
    registerDefinition("skill", {
      id: "wall-sticking",
      name: "Wall Sticking",
      description: "A test Skill.",
      timings: ["action"],
      maximumMastery: 3,
    });

    registerDefinition("trait", {
      id: "spider-mutation",
      name: "Spider Mutation",
      description: "A test Trait.",
      effects: [{ type: "grantSkill", skillId: "wall-sticking" }],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "spider-mutation" }] }),
    );

    expect(resolved.capabilities.skills["wall-sticking"]?.mastery).toBe(1);
  });

  // Sub-traits are Traits reached through a grant, which is why a Trait can
  // hand over a Sub-trait and a Skill in the same breath.
  it("follows a Trait that grants Sub-traits and a Skill", () => {
    for (const id of ["superstrength", "spider-sense"]) {
      registerDefinition("trait", {
        id,
        name: id,
        description: "A test Sub-trait.",
        parentTraitId: "spider-mutation",
        effects: [
          { type: "modifyBaseAttribute", attribute: "agi", amount: 1 },
        ],
      });
    }

    registerDefinition("skill", {
      id: "wall-sticking",
      name: "Wall Sticking",
      description: "A test Skill.",
      timings: ["action"],
      maximumMastery: 3,
    });

    registerDefinition("trait", {
      id: "spider-mutation",
      name: "Spider Mutation",
      description: "A test Trait.",
      effects: [
        { type: "grantTrait", traitId: "superstrength" },
        { type: "grantTrait", traitId: "spider-sense" },
        { type: "grantSkill", skillId: "wall-sticking" },
      ],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "spider-mutation" }] }),
    );

    expect(Object.keys(resolved.traits).sort()).toEqual([
      "spider-mutation",
      "spider-sense",
      "superstrength",
    ]);

    // Both Sub-traits contributed, so the grant chain ran to the end rather
    // than stopping at the first level.
    expect(resolved.attributes.base.agi).toBe(12);
    expect(resolved.capabilities.skills["wall-sticking"]).toBeDefined();
  });

  it("grants a Trait from a Sub-species through its ancestry", () => {
    const resolved = resolveTestCharacter(
      createTestCharacter({
        species: [{ speciesId: "firebender", percentage: 100 }],
      }),
    );

    expect(resolved.traits["firebending"]?.grantedBy).toEqual([
      { type: "species", id: "firebender" },
    ]);
  });

  // Authored content is written by hand, so a cycle is a mistake to survive
  // rather than an impossibility to assume away.
  it("settles rather than looping when two Traits grant each other", () => {
    registerDefinition("trait", {
      id: "yin",
      name: "Yin",
      description: "A test Trait.",
      effects: [{ type: "grantTrait", traitId: "yang" }],
    });

    registerDefinition("trait", {
      id: "yang",
      name: "Yang",
      description: "A test Trait.",
      effects: [{ type: "grantTrait", traitId: "yin" }],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "yin" }] }),
    );

    expect(Object.keys(resolved.traits).sort()).toEqual(["yang", "yin"]);
  });

  it("survives a Trait that grants itself", () => {
    registerDefinition("trait", {
      id: "recursion",
      name: "Recursion",
      description: "A test Trait.",
      effects: [{ type: "grantTrait", traitId: "recursion" }],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "recursion" }] }),
    );

    expect(Object.keys(resolved.traits)).toEqual(["recursion"]);
  });

  it("ignores a grant pointing at content that does not exist", () => {
    registerDefinition("trait", {
      id: "broken-grant",
      name: "Broken Grant",
      description: "A test Trait.",
      effects: [{ type: "grantSkill", skillId: "not-real" }],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "broken-grant" }] }),
    );

    // The grant is still recorded — validation is what reports it — but it
    // contributes no effects of its own, because there are none to find.
    expect(resolved.capabilities.skills["not-real"]).toBeDefined();
    expect(resolved.attributes.resolved).toEqual(resolved.attributes.stored);
  });
});
