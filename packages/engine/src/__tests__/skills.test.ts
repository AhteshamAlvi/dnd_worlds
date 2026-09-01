/*
 * Tests the capability layer: Mastery ranks, the difference between breadth
 * and depth, and the difference between a capability a character trained and
 * one something else is currently lending them.
 *
 * The distinction that matters most here is the last one. Authored Mastery is
 * state the sheet owns; a grant is derived, and disappears with whatever
 * supplied it. Getting that wrong means a character keeps an Item's Skill
 * after selling the Item.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import {
  canIncreaseMastery,
  getMasteryTrackRanks,
  getNextMasteryRank,
  isMasteryRank,
  masteryRankToRoman,
  romanToMasteryRank,
  collectMasteryRankEffects,
  findMasteryTrackIssues,
  getHeldMasteryRanks,
  NO_MASTERY,
  STANDARD_MASTERY_MAX,
} from "../character/capabilities/mastery";

import {
  collectSkillEffects,
  findSkillCatalogIssues,
  getSkillDefinition,
  skillMastery,
  skillMaximumMastery,
  toSkillMasteryRecord,
} from "../character/capabilities/skills";

import {
  collectTechniqueEffects,
  getTechniqueDefinition,
  techniqueMastery,
  techniqueMaximumMastery,
} from "../character/capabilities/techniques";

import {
  getResolvedSkillMastery,
  hasResolvedSkill,
  resolveCapabilities,
} from "../character/capabilities/resolution";

import {
  findSkillValidationIssues,
  findTechniqueValidationIssues,
  satisfiesSkillRequirements,
} from "../character/capabilities/validation";

import { resolveCharacter } from "../character/resolution";
import { createTestCharacter } from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});

describe("mastery ranks", () => {
  it("converts ranks to the numerals a player reads", () => {
    expect(masteryRankToRoman(1)).toBe("I");
    expect(masteryRankToRoman(4)).toBe("IV");
    expect(masteryRankToRoman(10)).toBe("X");
  });

  it("reads a numeral back, whatever case it was typed in", () => {
    expect(romanToMasteryRank("iv")).toBe(4);
    expect(romanToMasteryRank(" X ")).toBe(10);
  });

  it("refuses a numeral outside the Mastery range", () => {
    expect(romanToMasteryRank("XI")).toBeNull();
    expect(romanToMasteryRank("")).toBeNull();
  });

  it("rejects non-ranks", () => {
    expect(isMasteryRank(0)).toBe(false);
    expect(isMasteryRank(2.5)).toBe(false);
    expect(isMasteryRank(11)).toBe(false);
  });

  // A track that ends at III is a complete track, not a truncated one.
  it("respects a track that ends before X", () => {
    expect(getMasteryTrackRanks(3)).toEqual([1, 2, 3]);
    expect(getMasteryTrackRanks(STANDARD_MASTERY_MAX)).toHaveLength(10);
  });

  it("stops advancing at the declared maximum, not at X", () => {
    expect(getNextMasteryRank(2, 3)).toBe(3);
    expect(getNextMasteryRank(3, 3)).toBeNull();
    expect(canIncreaseMastery(3, 3)).toBe(false);
  });

  it("starts an unlearned track at I", () => {
    expect(getNextMasteryRank(NO_MASTERY, 5)).toBe(1);
  });
});

describe("mastery tracks", () => {
  const track = {
    maximumMastery: 3 as const,
    ranks: [
      { rank: 1 as const, effects: [{ type: "grantSkill" as const, skillId: "a" }] },
      { rank: 2 as const, effects: [{ type: "grantSkill" as const, skillId: "b" }] },
      { rank: 3 as const, effects: [{ type: "grantSkill" as const, skillId: "c" }] },
    ],
  };

  // Ranks are cumulative: reaching III does not replace what I and II gave.
  it("holds every rank up to the one reached", () => {
    expect(getHeldMasteryRanks(track, 2).map((rank) => rank.rank)).toEqual([
      1, 2,
    ]);
  });

  it("holds nothing at Mastery 0", () => {
    expect(getHeldMasteryRanks(track, NO_MASTERY)).toEqual([]);
  });

  it("accumulates the effects of every rank held", () => {
    expect(collectMasteryRankEffects(track, 2)).toEqual([
      { type: "grantSkill", skillId: "a" },
      { type: "grantSkill", skillId: "b" },
    ]);
  });

  it("rejects a rank beyond the track's own maximum", () => {
    expect(
      findMasteryTrackIssues("Skill", "overreach", {
        maximumMastery: 3,
        ranks: [{ rank: 5 }],
      }),
    ).toEqual([expect.stringContaining("beyond its maximum")]);
  });

  it("rejects the same rank defined twice", () => {
    expect(
      findMasteryTrackIssues("Skill", "doubled", {
        maximumMastery: 3,
        ranks: [{ rank: 2 }, { rank: 2 }],
      }),
    ).toEqual([expect.stringContaining("more than once")]);
  });

  it("rejects a malformed effect on a rank", () => {
    expect(
      findMasteryTrackIssues("Technique", "broken", {
        maximumMastery: 3,
        ranks: [{ rank: 1, effects: [{ type: "grantSkill", skillId: "  " }] }],
      }),
    ).toEqual([expect.stringContaining("malformed rule")]);
  });
});

describe("technique mastery: breadth", () => {
  // Advancing a Technique widens it. Each rank hands over another of the
  // discipline's Skills, and none of that is Martial-Arts-specific code.
  it("grants another Skill at each rank", () => {
    const definition = getTechniqueDefinition("martial-arts");

    expect(definition).toBeDefined();

    if (definition === undefined) return;

    expect(collectTechniqueEffects(definition, 1)).toEqual([
      { type: "grantSkill", skillId: "punch" },
    ]);

    expect(collectTechniqueEffects(definition, 3)).toEqual([
      { type: "grantSkill", skillId: "punch" },
      { type: "grantSkill", skillId: "parry" },
      { type: "grantSkill", skillId: "defensive-stance" },
    ]);
  });

  it("reads an absent Mastery as I", () => {
    expect(techniqueMastery({ techniqueId: "martial-arts" })).toBe(1);
    expect(techniqueMastery({ techniqueId: "martial-arts", mastery: 4 })).toBe(4);
  });

  it("lets a Technique end its track early", () => {
    expect(techniqueMaximumMastery("lockpicking")).toBe(5);
    expect(techniqueMaximumMastery("martial-arts")).toBe(10);
  });

  it("rejects a Mastery past what the Technique defines", () => {
    expect(
      findTechniqueValidationIssues([
        { techniqueId: "lockpicking", mastery: 7 },
      ]),
    ).toEqual([
      {
        type: "invalid-technique-mastery",
        techniqueId: "lockpicking",
        mastery: 7,
        maximumMastery: 5,
      },
    ]);
  });
});

describe("skill mastery: depth", () => {
  it("reads an absent Mastery as I", () => {
    expect(skillMastery({ skillId: "punch" })).toBe(1);
    expect(skillMastery({ skillId: "punch", mastery: 3 })).toBe(3);
  });

  // Skill ranks mean whatever the Skill says they mean, so a track may end
  // wherever the Skill runs out of things to give.
  it("lets a Skill declare a shorter track than the standard", () => {
    expect(skillMaximumMastery("pick-lock")).toBe(5);
    expect(skillMaximumMastery("punch")).toBe(10);
  });

  it("rejects a Mastery past what the Skill defines", () => {
    expect(
      findSkillValidationIssues([{ skillId: "pick-lock", mastery: 9 }]),
    ).toEqual([
      {
        type: "invalid-skill-mastery",
        skillId: "pick-lock",
        mastery: 9,
        maximumMastery: 5,
      },
    ]);
  });

  it("accumulates a registered Skill's own rank effects", () => {
    registerDefinition("skill", {
      id: "wall-sticking",
      name: "Wall Sticking",
      description: "Adhere to surfaces.",
      timings: ["action"],
      maximumMastery: 3,
      ranks: [
        {
          rank: 2,
          description: "Controlled movement while adhered.",
          effects: [
            { type: "modifyResolvedAttribute", attribute: "agi", amount: 1 },
          ],
        },
        {
          rank: 3,
          description: "Adhesion under much greater force.",
          effects: [
            { type: "modifyResolvedAttribute", attribute: "agi", amount: 1 },
          ],
        },
      ],
    });

    const definition = getSkillDefinition("wall-sticking");

    expect(definition).toBeDefined();

    if (definition === undefined) return;

    expect(collectSkillEffects(definition, 1)).toEqual([]);
    expect(collectSkillEffects(definition, 2)).toHaveLength(1);
    expect(collectSkillEffects(definition, 3)).toHaveLength(2);
  });

  it("turns a character's Skills into the record resolution reads", () => {
    expect(
      toSkillMasteryRecord([
        { skillId: "punch", mastery: 4 },
        { skillId: "parry" },
      ]),
    ).toEqual({ punch: 4, parry: 1 });
  });
});

describe("skill requirements", () => {
  const context = (
    overrides: Partial<Parameters<typeof satisfiesSkillRequirements>[1]> = {},
  ) => {
    const attributes = { agi: 10, dex: 10, con: 10, vit: 10,
      int: 10, wis: 10, per: 10, spi: 10, cha: 10,
    };

    return {
      attributes: {
        stored: attributes,
        base: attributes,
        resolved: attributes,
      },
      level: 1,
      ...overrides,
    };
  };

  it("treats a Skill with no requirements as always available", () => {
    expect(
      satisfiesSkillRequirements(
        {
          id: "improvised-shove",
          name: "Improvised Shove",
          description: "A Skill with no prerequisite path.",
          timings: ["action"],
          maximumMastery: 3,
        },
        context(),
      ),
    ).toBe(true);
  });

  it("allows Punch to someone with Martial Arts", () => {
    const definition = getSkillDefinition("punch");

    expect(definition).toBeDefined();

    if (definition === undefined) return;

    expect(
      satisfiesSkillRequirements(
        definition,
        context({ techniqueMastery: { "martial-arts": 1 } }),
      ),
    ).toBe(true);
  });

  it("refuses Punch to someone without it", () => {
    const definition = getSkillDefinition("punch");

    expect(definition).toBeDefined();

    if (definition === undefined) return;

    expect(satisfiesSkillRequirements(definition, context())).toBe(false);
  });

  // Parry asks for Martial Arts II specifically, which is the thing the old
  // id-list requirements could not express at all.
  it("distinguishes having a Technique from having enough of it", () => {
    const definition = getSkillDefinition("parry");

    expect(definition).toBeDefined();

    if (definition === undefined) return;

    expect(
      satisfiesSkillRequirements(
        definition,
        context({ techniqueMastery: { "martial-arts": 1 } }),
      ),
    ).toBe(false);

    expect(
      satisfiesSkillRequirements(
        definition,
        context({ techniqueMastery: { "martial-arts": 2 } }),
      ),
    ).toBe(true);
  });

  it("requires both halves of Fire Blast's gate", () => {
    const definition = getSkillDefinition("fire-blast");

    expect(definition).toBeDefined();

    if (definition === undefined) return;

    expect(
      satisfiesSkillRequirements(
        definition,
        context({ techniqueMastery: { "firebending-forms": 1 } }),
      ),
    ).toBe(false);

    expect(
      satisfiesSkillRequirements(
        definition,
        context({
          traitIds: ["firebending"],
          techniqueMastery: { "firebending-forms": 1 },
        }),
      ),
    ).toBe(true);
  });

  it("rejects duplicate Skills", () => {
    expect(
      findSkillValidationIssues([{ skillId: "punch" }, { skillId: "punch" }]),
    ).toEqual([
      {
        type: "duplicate-skill",
        skillId: "punch",
      },
    ]);
  });

  it("does not judge prerequisites when given no character to judge against", () => {
    expect(findSkillValidationIssues([{ skillId: "punch" }])).toEqual([]);
  });
});

describe("authored versus granted capabilities", () => {
  it("keeps trained Mastery when something also grants the capability", () => {
    const resolved = resolveCapabilities({
      authoredTechniques: { swordsmanship: 4 },
      techniqueGrants: [
        { source: { type: "item", id: "spirit-blade" }, techniqueId: "swordsmanship" },
      ],
    });

    const swordsmanship = resolved.techniques["swordsmanship"];

    expect(swordsmanship?.mastery).toBe(4);
    expect(swordsmanship?.isAuthored).toBe(true);
    expect(swordsmanship?.isGranted).toBe(true);
  });

  it("gives a purely granted capability Mastery I", () => {
    const resolved = resolveCapabilities({
      skillGrants: [
        { source: { type: "trait", id: "spider-mutation" }, skillId: "wall-sticking" },
      ],
    });

    expect(getResolvedSkillMastery(resolved, "wall-sticking")).toBe(1);
    expect(resolved.skills["wall-sticking"]?.isAuthored).toBe(false);
  });

  it("remembers every source granting the same capability", () => {
    const resolved = resolveCapabilities({
      skillGrants: [
        { source: { type: "trait", id: "spider-mutation" }, skillId: "wall-sticking" },
        { source: { type: "item", id: "climbing-gloves" }, skillId: "wall-sticking" },
      ],
    });

    expect(resolved.skills["wall-sticking"]?.grantedBy).toHaveLength(2);
  });

  // The point of tracking sources separately: losing one is not losing the
  // capability while another still supplies it.
  it("keeps access when one of two granters is removed", () => {
    const withBoth = resolveCapabilities({
      skillGrants: [
        { source: { type: "trait", id: "spider-mutation" }, skillId: "wall-sticking" },
        { source: { type: "item", id: "climbing-gloves" }, skillId: "wall-sticking" },
      ],
    });

    const withOne = resolveCapabilities({
      skillGrants: [
        { source: { type: "item", id: "climbing-gloves" }, skillId: "wall-sticking" },
      ],
    });

    expect(hasResolvedSkill(withBoth, "wall-sticking")).toBe(true);
    expect(hasResolvedSkill(withOne, "wall-sticking")).toBe(true);
  });

  it("loses a purely granted capability when its only source goes", () => {
    const without = resolveCapabilities({});

    expect(hasResolvedSkill(without, "wall-sticking")).toBe(false);
  });

  it("keeps a trained capability when its granter goes", () => {
    const resolved = resolveCapabilities({
      authoredSkills: { "wall-sticking": 3 },
    });

    expect(getResolvedSkillMastery(resolved, "wall-sticking")).toBe(3);
  });
});

describe("technique mastery grants skills through resolution", () => {
  it("hands over the Skills of every rank the character reached", () => {
    const resolved = resolveCharacter(
      createTestCharacter({
        techniques: [{ techniqueId: "martial-arts", mastery: 2 }],
      }),
    );

    expect(Object.keys(resolved.capabilities.skills).sort()).toEqual([
      "parry",
      "punch",
    ]);

    expect(resolved.capabilities.skills["punch"]?.isGranted).toBe(true);
    expect(resolved.capabilities.skills["punch"]?.isAuthored).toBe(false);
  });

  it("stops at the ranks the character has actually reached", () => {
    const resolved = resolveCharacter(
      createTestCharacter({
        techniques: [{ techniqueId: "martial-arts", mastery: 1 }],
      }),
    );

    expect(Object.keys(resolved.capabilities.skills)).toEqual(["punch"]);
  });

  it("keeps trained depth in a Skill the Technique also grants", () => {
    const resolved = resolveCharacter(
      createTestCharacter({
        techniques: [{ techniqueId: "martial-arts", mastery: 1 }],
        skills: [{ skillId: "punch", mastery: 5 }],
      }),
    );

    expect(resolved.capabilities.skills["punch"]?.mastery).toBe(5);
  });
});

/*
 * A sheet listing one capability twice is a validation error, but the
 * workbench still renders resolved state for a sheet that has not been fixed
 * yet — so the Mastery it shows and the effects it applies have to agree.
 */
describe("a capability listed twice", () => {
  it("resolves effects at the same Mastery it reports", () => {
    registerDefinition("skill", {
      id: "stacker",
      name: "Stacker",
      description: "A test Skill.",
      timings: ["action"],
      maximumMastery: 5,
      ranks: [
        {
          rank: 1,
          effects: [
            { type: "modifyBaseAttribute", attribute: "con", amount: 1 },
          ],
        },
        {
          rank: 4,
          effects: [
            { type: "modifyBaseAttribute", attribute: "con", amount: 5 },
          ],
        },
      ],
    });

    const resolved = resolveCharacter(
      createTestCharacter({
        skills: [
          { skillId: "stacker", mastery: 1 },
          { skillId: "stacker", mastery: 4 },
        ],
      }),
    );

    expect(resolved.capabilities.skills["stacker"]?.mastery).toBe(4);

    // 10 base CON, +1 from rank I, +5 from rank IV.
    expect(resolved.attributes.base.con).toBe(16);
  });
});

describe("authored catalog", () => {
  it("has a valid Skill catalog", () => {
    expect(findSkillCatalogIssues()).toEqual([]);
  });

  it("defines Parry as a Reaction Skill", () => {
    expect(getSkillDefinition("parry")?.timings).toContain("reaction");
  });
});
