/*
 * Tests that eligibility is data, not code.
 *
 * The claim being checked is that a prerequisite is satisfied by the state of
 * the character, never by the name of the content asking. Nothing in the
 * engine should know that Riposte needs Parry — Riposte should say so, and
 * the evaluator should not care which Skill it is looking at.
 *
 * The composition tests matter for the same reason: "Swordsmanship V and DEX
 * 16 and (Ambidextrous or Two-Weapon Training)" has to be expressible without
 * a line of TypeScript being written for it.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import {
  meetsAllRequirements,
  meetsRequirement,
  type RequirementContext,
} from "../character/rules/resolution";
import type { Requirement } from "../character/rules/requirements";
import { getSkillDefinition } from "../character/capabilities/skills";

import { resolveCharacter } from "../character/resolution";
import { createTestCharacter } from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});

const FLAT_ATTRIBUTES = {
  str: 10, agi: 10, dex: 10, con: 10, vit: 10,
  int: 10, wis: 10, per: 10, spi: 10, cha: 10,
};

function contextWith(
  overrides: Partial<RequirementContext> = {},
): RequirementContext {
  return {
    attributes: {
      stored: FLAT_ATTRIBUTES,
      base: FLAT_ATTRIBUTES,
      resolved: FLAT_ATTRIBUTES,
    },
    level: 1,
    ...overrides,
  };
}

describe("attribute requirements", () => {
  // Which layer a requirement names is the whole reason the layers exist: a
  // permanent prerequisite should not be met by a temporary buff, and an
  // in-the-moment check should not ignore a poison.
  it("checks the layer the requirement names", () => {
    const context = contextWith({
      attributes: {
        stored: { ...FLAT_ATTRIBUTES, dex: 16 },
        base: { ...FLAT_ATTRIBUTES, dex: 14 },
        resolved: { ...FLAT_ATTRIBUTES, dex: 11 },
      },
    });

    const atLeast14 = (
      layer: "stored" | "base" | "resolved",
    ): Requirement => ({
      type: "attributeMinimum",
      attribute: "dex",
      layer,
      minimum: 14,
    });

    expect(meetsRequirement(atLeast14("stored"), context)).toBe(true);
    expect(meetsRequirement(atLeast14("base"), context)).toBe(true);
    expect(meetsRequirement(atLeast14("resolved"), context)).toBe(false);
  });

  it("treats the minimum as inclusive", () => {
    expect(
      meetsRequirement(
        { type: "attributeMinimum", attribute: "str", layer: "base", minimum: 10 },
        contextWith(),
      ),
    ).toBe(true);
  });
});

describe("derived attribute requirements", () => {
  it("checks the Derived Attribute calculated from the layer it names", () => {
    // Athletics = round((STR + AGI) / 2), so 16/16 -> 16 and 10/10 -> 10.
    const context = contextWith({
      attributes: {
        stored: { ...FLAT_ATTRIBUTES, str: 16, agi: 16 },
        base: { ...FLAT_ATTRIBUTES, str: 16, agi: 16 },
        resolved: FLAT_ATTRIBUTES,
      },
    });

    const athleticsAtLeast14 = (
      layer: "stored" | "base" | "resolved",
    ): Requirement => ({
      type: "derivedAttributeMinimum",
      derivedAttribute: "athletics",
      layer,
      minimum: 14,
    });

    expect(meetsRequirement(athleticsAtLeast14("base"), context)).toBe(true);
    expect(meetsRequirement(athleticsAtLeast14("resolved"), context)).toBe(
      false,
    );
  });

  /*
   * The reason this requirement type exists rather than being composed from
   * attributeMinimum. Combat Ability is the AVERAGE of five Attributes, so a
   * character can clear it while individual contributors sit well below the
   * threshold — an `all` of five attributeMinimums is a strictly harder and
   * genuinely different requirement.
   */
  it("is satisfied by the average, not by every contributing Attribute", () => {
    // Combat Ability = round((STR + AGI + DEX + PER + WIS) / 5)
    //                = round((18 + 18 + 18 + 6 + 6) / 5) = round(13.2) = 13
    const lopsided = {
      ...FLAT_ATTRIBUTES,
      str: 18,
      agi: 18,
      dex: 18,
      per: 6,
      wis: 6,
    };

    const context = contextWith({
      attributes: {
        stored: lopsided,
        base: lopsided,
        resolved: lopsided,
      },
    });

    expect(
      meetsRequirement(
        {
          type: "derivedAttributeMinimum",
          derivedAttribute: "combatAbility",
          layer: "base",
          minimum: 12,
        },
        context,
      ),
    ).toBe(true);

    // The same character fails the naive composition, which is exactly why
    // the composition is not a substitute for this requirement.
    expect(
      meetsRequirement(
        {
          type: "all",
          requirements: (["str", "agi", "dex", "per", "wis"] as const).map(
            (attribute) => ({
              type: "attributeMinimum" as const,
              attribute,
              layer: "base" as const,
              minimum: 12,
            }),
          ),
        },
        context,
      ),
    ).toBe(false);
  });

  it("treats the minimum as inclusive", () => {
    // Every Attribute at 10 makes every Derived Attribute exactly 10.
    expect(
      meetsRequirement(
        {
          type: "derivedAttributeMinimum",
          derivedAttribute: "willpower",
          layer: "base",
          minimum: 10,
        },
        contextWith(),
      ),
    ).toBe(true);

    expect(
      meetsRequirement(
        {
          type: "derivedAttributeMinimum",
          derivedAttribute: "willpower",
          layer: "base",
          minimum: 11,
        },
        contextWith(),
      ),
    ).toBe(false);
  });

  it("gates real content through the resolved character", () => {
    registerDefinition("skill", {
      id: "riposte",
      name: "Riposte",
      description: "A test Skill gated on Combat Ability.",
      timings: ["reaction"],
      maximumMastery: 10,
      requirements: [
        {
          type: "derivedAttributeMinimum",
          derivedAttribute: "combatAbility",
          layer: "base",
          minimum: 14,
        },
      ],
    });

    // Combat Ability from five 10s is 10 — short of 14.
    const untrained = resolveCharacter(createTestCharacter());

    expect(
      meetsAllRequirements(
        getSkillDefinition("riposte")?.requirements ?? [],
        untrained.requirementContext,
      ),
    ).toBe(false);

    // Five 15s average to 15.
    const veteran = resolveCharacter(
      createTestCharacter({
        attributes: { str: 15, agi: 15, dex: 15, per: 15, wis: 15 },
      }),
    );

    expect(
      meetsAllRequirements(
        getSkillDefinition("riposte")?.requirements ?? [],
        veteran.requirementContext,
      ),
    ).toBe(true);
  });
});

describe("identity requirements", () => {
  it("is satisfied by an ancestor Species, not just the declared one", () => {
    const context = contextWith({
      speciesIds: ["firebender", "human"],
      subspeciesIds: ["firebender"],
    });

    expect(
      meetsRequirement({ type: "hasSpecies", speciesId: "human" }, context),
    ).toBe(true);
  });

  // The other direction: descending from Human does not make you every
  // Sub-species of Human.
  it("distinguishes being a Sub-species from descending from its parent", () => {
    const context = contextWith({
      speciesIds: ["human"],
      subspeciesIds: [],
    });

    expect(
      meetsRequirement({ type: "hasSpecies", speciesId: "human" }, context),
    ).toBe(true);

    expect(
      meetsRequirement(
        { type: "hasSubspecies", subspeciesId: "firebender" },
        context,
      ),
    ).toBe(false);
  });

  it("checks Clans and Traits by membership", () => {
    const context = contextWith({
      clanIds: ["uchiha"],
      traitIds: ["firebending"],
    });

    expect(meetsRequirement({ type: "hasClan", clanId: "uchiha" }, context)).toBe(true);
    expect(meetsRequirement({ type: "hasClan", clanId: "kurta" }, context)).toBe(false);
    expect(
      meetsRequirement({ type: "hasTrait", traitId: "firebending" }, context),
    ).toBe(true);
  });
});

describe("capability requirements", () => {
  const context = contextWith({
    skillMastery: { parry: 2 },
    techniqueMastery: { swordsmanship: 5 },
  });

  it("treats a missing capability as Mastery 0", () => {
    expect(
      meetsRequirement({ type: "hasSkill", skillId: "riposte" }, context),
    ).toBe(false);
  });

  it("checks a minimum Mastery rather than mere possession", () => {
    expect(
      meetsRequirement(
        { type: "skillMastery", skillId: "parry", minimumMastery: 2 },
        context,
      ),
    ).toBe(true);

    expect(
      meetsRequirement(
        { type: "skillMastery", skillId: "parry", minimumMastery: 3 },
        context,
      ),
    ).toBe(false);
  });

  it("checks Technique Mastery the same way", () => {
    expect(
      meetsRequirement(
        { type: "techniqueMastery", techniqueId: "swordsmanship", minimumMastery: 5 },
        context,
      ),
    ).toBe(true);

    expect(
      meetsRequirement(
        { type: "techniqueMastery", techniqueId: "swordsmanship", minimumMastery: 6 },
        context,
      ),
    ).toBe(false);
  });
});

describe("state requirements", () => {
  it("checks Conditions", () => {
    const context = contextWith({ conditionIds: ["prone"] });

    expect(
      meetsRequirement({ type: "hasCondition", conditionId: "prone" }, context),
    ).toBe(true);
  });

  it("distinguishes carrying an Item from wearing it", () => {
    const context = contextWith({
      items: { possessed: ["gauntlets"], equipped: [] },
    });

    expect(
      meetsRequirement(
        { type: "hasItem", itemId: "gauntlets", state: "possessed" },
        context,
      ),
    ).toBe(true);

    expect(
      meetsRequirement(
        { type: "hasItem", itemId: "gauntlets", state: "equipped" },
        context,
      ),
    ).toBe(false);
  });
});

describe("composition", () => {
  // The ticket's worked example, authored entirely as data.
  const TWIN_BLADE: Requirement = {
    type: "all",
    requirements: [
      { type: "techniqueMastery", techniqueId: "swordsmanship", minimumMastery: 5 },
      { type: "attributeMinimum", attribute: "dex", layer: "base", minimum: 16 },
      {
        type: "any",
        requirements: [
          { type: "hasTrait", traitId: "ambidextrous" },
          { type: "hasSkill", skillId: "two-weapon-training" },
        ],
      },
    ],
  };

  const swordsman = (overrides: Partial<RequirementContext> = {}) =>
    contextWith({
      attributes: {
        stored: { ...FLAT_ATTRIBUTES, dex: 16 },
        base: { ...FLAT_ATTRIBUTES, dex: 16 },
        resolved: { ...FLAT_ATTRIBUTES, dex: 16 },
      },
      techniqueMastery: { swordsmanship: 5 },
      ...overrides,
    });

  it("passes when the branch is satisfied either way", () => {
    expect(
      meetsRequirement(TWIN_BLADE, swordsman({ traitIds: ["ambidextrous"] })),
    ).toBe(true);

    expect(
      meetsRequirement(
        TWIN_BLADE,
        swordsman({ skillMastery: { "two-weapon-training": 1 } }),
      ),
    ).toBe(true);
  });

  it("fails when neither branch is", () => {
    expect(meetsRequirement(TWIN_BLADE, swordsman())).toBe(false);
  });

  it("fails when one of the required parts is missing", () => {
    expect(
      meetsRequirement(
        TWIN_BLADE,
        swordsman({ traitIds: ["ambidextrous"], techniqueMastery: { swordsmanship: 4 } }),
      ),
    ).toBe(false);
  });

  it("inverts with not", () => {
    const sealed = contextWith({ conditionIds: ["aura-sealed"] });

    const notSealed: Requirement = {
      type: "not",
      requirement: { type: "hasCondition", conditionId: "aura-sealed" },
    };

    expect(meetsRequirement(notSealed, sealed)).toBe(false);
    expect(meetsRequirement(notSealed, contextWith())).toBe(true);
  });

  it("treats an empty requirement list as no prerequisites", () => {
    expect(meetsAllRequirements([], contextWith())).toBe(true);
  });
});

describe("requirements against a real character", () => {
  // The evaluator sees only the resolved character, so a capability the
  // character was *given* is as good as one they trained. That is what makes
  // "content unlocks content" work without any of it being wired by name.
  it("counts a granted Technique towards a Skill's prerequisite", () => {
    registerDefinition("technique", {
      id: "dragon-forms",
      name: "Dragon Forms",
      description: "A test Technique.",
      maximumMastery: 5,
    });

    registerDefinition("trait", {
      id: "dragon-blooded",
      name: "Dragon Blooded",
      description: "A test Trait.",
      effects: [{ type: "grantTechnique", techniqueId: "dragon-forms" }],
    });

    registerDefinition("skill", {
      id: "dragon-breath",
      name: "Dragon Breath",
      description: "A test Skill.",
      timings: ["action"],
      maximumMastery: 5,
      requirements: [{ type: "hasTechnique", techniqueId: "dragon-forms" }],
    });

    const resolved = resolveCharacter(
      createTestCharacter({
        traits: [{ traitId: "dragon-blooded" }],
        skills: [{ skillId: "dragon-breath" }],
      }),
    );

    expect(
      meetsAllRequirements(
        [{ type: "hasTechnique", techniqueId: "dragon-forms" }],
        resolved.requirementContext,
      ),
    ).toBe(true);
  });

  // A Trait lowering DEX is what a Base-layer prerequisite has to see.
  it("evaluates an attribute prerequisite against the derived Base score", () => {
    const resolved = resolveCharacter(
      createTestCharacter({
        attributes: { dex: 15 },
        traits: [{ traitId: "one-armed" }],
      }),
    );

    const needs14: Requirement = {
      type: "attributeMinimum",
      attribute: "dex",
      layer: "base",
      minimum: 14,
    };

    expect(meetsRequirement(needs14, resolved.requirementContext)).toBe(false);
  });

  // Level is derived from lifetime XP rather than stored, so a levelMinimum
  // requirement reads the same number progression would.
  it("derives the Level a levelMinimum requirement is judged against", () => {
    const novice = resolveCharacter(createTestCharacter());

    expect(novice.requirementContext.level).toBe(1);

    const experienced = resolveCharacter(
      createTestCharacter({ lifetimeXp: 100_000 }),
    );

    expect(experienced.requirementContext.level).toBeGreaterThan(1);

    expect(
      meetsRequirement(
        { type: "levelMinimum", minimum: 2 },
        experienced.requirementContext,
      ),
    ).toBe(true);

    expect(
      meetsRequirement(
        { type: "levelMinimum", minimum: 2 },
        novice.requirementContext,
      ),
    ).toBe(false);
  });

  it("falls back to Level 1 rather than throwing on malformed experience", () => {
    const resolved = resolveCharacter(
      createTestCharacter({ lifetimeXp: -5 }),
    );

    expect(resolved.requirementContext.level).toBe(1);
  });

  it("counts an ancestor Species for a character who only lists a Sub-species", () => {
    const resolved = resolveCharacter(
      createTestCharacter({
        species: [{ speciesId: "bloodkin", percentage: 100 }],
      }),
    );

    expect(
      meetsRequirement(
        { type: "hasSpecies", speciesId: "human" },
        resolved.requirementContext,
      ),
    ).toBe(true);
  });
});
