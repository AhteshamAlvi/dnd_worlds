/*
 * Optional Mastery: the difference between having a capability and having a
 * rank in one.
 *
 * The engine used to treat those as one fact. Every Skill and Technique
 * carried a mandatory track, possession was inferred from `mastery > 0`, and a
 * requirement context recorded both questions in a single id -> rank map. That
 * arrangement makes a Skill with no ranks unrepresentable: entering it at 0
 * says the character does not have it, and entering it at I gives them a rank
 * they can never spend a Growth Point on and content can then require.
 *
 * These tests pin the separation. A capability may declare a track of any
 * length or none; a character HAS a capability by appearing in the resolved
 * record, whatever `mastery` says; and a rank requirement is answerable only
 * against something that has ranks.
 *
 * The definitions here are registered rather than added to the authored
 * catalog, because none of them is content the world needs — they exist to
 * exercise shapes the authored catalog does not currently contain.
 */

import { afterEach, describe, expect, it } from "vitest";

import { minimalSkillApplication } from "../character/capabilities/applications";

import {
  clearCustomDefinitions,
  findCatalogReferenceIssues,
  registerDefinition,
} from "../character/catalogs";

import {
  getMasteryRankDefinition,
  getMasteryTrackRanks,
  trackMastery,
  type MasteryRank,
} from "../character/capabilities/mastery";

import {
  collectSkillEffects,
  findSkillCatalogIssues,
  getSkillDefinition,
  skillMastery,
  skillMasteryTrack,
  skillMaximumMastery,
  skillSupportsMastery,
  toSkillMasteryRecord,
} from "../character/capabilities/skills";

import {
  collectTechniqueEffects,
  getTechniqueDefinition,
  TECHNIQUE_DEFINITIONS,
  techniqueMastery,
  techniqueMaximumMastery,
  techniqueSupportsMastery,
} from "../character/capabilities/techniques";

import { TRAIT_DEFINITIONS } from "../character/identity/traits";

import {
  resolveCapabilities,
  hasResolvedSkill,
  hasResolvedTechnique,
} from "../character/capabilities/resolution";

import {
  findSkillValidationIssues,
  findTechniqueValidationIssues,
} from "../character/capabilities/validation";

import { resolveRequirement } from "../character/rules/resolution";

import { validateCharacter } from "../character/validation";

import {
  createTestCharacter,
  resolveTestCharacter,
} from "./fixtures/character";

/* ── Test content ───────────────────────────────────────────────────────── */

/* Depth, and a short track: three ranks is everything this Skill has. */
const PICKING = "test-precision-picking";

/* Breadth, over five ranks. */
const BLADE_ARTS = "test-blade-arts";

/* A Skill you can do or cannot. No ranks, and none to reach. */
const DOOR_RUNE = "test-door-rune";

/* A body of knowledge with nothing to widen into. */
const HEIRLOOM_LORE = "test-heirloom-lore";

function registerCapabilities(): void {
  registerDefinition("skill", {
    application: minimalSkillApplication(),
    id: PICKING,
    name: "Precision Picking",
    description: "A test Skill with a three-rank track.",
    mastery: {
      maximumMastery: 3,
      ranks: [
        {
          rank: 2,
          description: "Sophisticated locks.",
          effects: [
            { type: "modifyBaseAttribute", attribute: "dex", amount: 1 },
          ],
        },
        {
          rank: 3,
          description: "Locks that fight back.",
          growthPointCost: 4,
          requirements: [
            { type: "attributeMinimum", attribute: "dex", layer: "base", minimum: 12 },
          ],
          effects: [
            { type: "modifyBaseAttribute", attribute: "dex", amount: 1 },
          ],
        },
      ],
    },
  });

  registerDefinition("technique", {
    id: BLADE_ARTS,
    name: "Blade Arts",
    description: "A test Technique with a five-rank track.",
    mastery: {
      maximumMastery: 5,
      ranks: [{ rank: 1, effects: [{ type: "grantSkill", skillId: PICKING }] }],
    },
  });

  registerDefinition("skill", {
    application: minimalSkillApplication(),
    id: DOOR_RUNE,
    name: "Door Rune",
    description: "A test Skill with no Mastery at all.",
    effects: [{ type: "modifyBaseAttribute", attribute: "wis", amount: 2 }],
  });

  registerDefinition("technique", {
    id: HEIRLOOM_LORE,
    name: "Heirloom Lore",
    description: "A test Technique with no Mastery at all.",
    effects: [{ type: "modifyBaseAttribute", attribute: "int", amount: 2 }],
  });
}

afterEach(() => {
  clearCustomDefinitions();
});

/* ── Track lengths, including no track ──────────────────────────────────── */

describe("a capability declares its own Mastery, or none", () => {
  it("lets a Skill run I to III", () => {
    registerCapabilities();

    expect(skillSupportsMastery(PICKING)).toBe(true);
    expect(skillMaximumMastery(PICKING)).toBe(3);
    expect(getMasteryTrackRanks(3)).toEqual([1, 2, 3]);
  });

  it("lets a Technique run I to V", () => {
    registerCapabilities();

    expect(techniqueSupportsMastery(BLADE_ARTS)).toBe(true);
    expect(techniqueMaximumMastery(BLADE_ARTS)).toBe(5);
    expect(getMasteryTrackRanks(5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("lets a Skill and a Technique have no Mastery at all", () => {
    registerCapabilities();

    expect(getSkillDefinition(DOOR_RUNE)?.mastery).toBeUndefined();
    expect(skillSupportsMastery(DOOR_RUNE)).toBe(false);
    expect(skillMaximumMastery(DOOR_RUNE)).toBeNull();

    expect(getTechniqueDefinition(HEIRLOOM_LORE)?.mastery).toBeUndefined();
    expect(techniqueSupportsMastery(HEIRLOOM_LORE)).toBe(false);
    expect(techniqueMaximumMastery(HEIRLOOM_LORE)).toBeNull();
  });
});

/* ── What an absent stored rank means ───────────────────────────────────── */

describe("a missing stored Mastery is read against the definition", () => {
  it("means I when there is a track, and no Mastery when there is not", () => {
    registerCapabilities();

    expect(skillMastery({ skillId: PICKING })).toBe(1);
    expect(skillMastery({ skillId: DOOR_RUNE })).toBeNull();

    expect(techniqueMastery({ techniqueId: BLADE_ARTS })).toBe(1);
    expect(techniqueMastery({ techniqueId: HEIRLOOM_LORE })).toBeNull();
  });

  it("uses the stored rank when one is stored", () => {
    registerCapabilities();

    expect(skillMastery({ skillId: PICKING, mastery: 3 })).toBe(3);
    expect(techniqueMastery({ techniqueId: BLADE_ARTS, mastery: 4 })).toBe(4);
  });

  // The rule lives in one function so that no caller has to restate it.
  it("decides all four cases in trackMastery", () => {
    expect(trackMastery({ maximumMastery: 3 }, undefined)).toBe(1);
    expect(trackMastery({ maximumMastery: 3 }, 2)).toBe(2);
    expect(trackMastery(undefined, undefined)).toBeNull();

    /* A rank on a trackless capability is data validation reports, not a
     * rank to honour. */
    expect(trackMastery(undefined, 2)).toBeNull();
  });

  it("carries the null through the record resolution reads", () => {
    registerCapabilities();

    expect(
      toSkillMasteryRecord([
        { skillId: PICKING, mastery: 2 },
        { skillId: DOOR_RUNE },
      ]),
    ).toEqual({ [PICKING]: 2, [DOOR_RUNE]: null });
  });
});

/* ── Possession versus rank ─────────────────────────────────────────────── */

describe("having a capability is not having a rank in it", () => {
  it("resolves a non-mastered Skill with a null Mastery, not Mastery I", () => {
    registerCapabilities();

    const resolved = resolveTestCharacter(
      createTestCharacter({ skills: [{ skillId: DOOR_RUNE }] }),
    );

    const rune = resolved.capabilities.skills[DOOR_RUNE];

    expect(rune?.mastery).toBeNull();
    expect(rune?.supportsMastery).toBe(false);
    expect(rune?.authoredMastery).toBeUndefined();
    expect(rune?.isAuthored).toBe(true);
  });

  it("counts it as possessed all the same", () => {
    registerCapabilities();

    const capabilities = resolveCapabilities({
      authoredSkills: [{ skillId: DOOR_RUNE }],
      authoredTechniques: [{ techniqueId: HEIRLOOM_LORE }],
    });

    expect(hasResolvedSkill(capabilities, DOOR_RUNE)).toBe(true);
    expect(hasResolvedTechnique(capabilities, HEIRLOOM_LORE)).toBe(true);
  });

  it("leaves a capability the character does not have out of the record", () => {
    registerCapabilities();

    const capabilities = resolveCapabilities({});

    expect(capabilities.skills[DOOR_RUNE]).toBeUndefined();
    expect(hasResolvedSkill(capabilities, DOOR_RUNE)).toBe(false);
  });
});

describe("presence and rank requirements read different fields", () => {
  const contextFor = (skills: readonly { skillId: string; mastery?: MasteryRank }[]) =>
    resolveTestCharacter(createTestCharacter({ skills: [...skills] }))
      .requirementContext;

  it("satisfies hasSkill from a Skill with no Mastery", () => {
    registerCapabilities();

    expect(
      resolveRequirement(
        { type: "hasSkill", skillId: DOOR_RUNE },
        contextFor([{ skillId: DOOR_RUNE }]),
      ),
    ).toBe("satisfied");
  });

  it("satisfies hasTechnique from a Technique with no Mastery", () => {
    registerCapabilities();

    const context = resolveTestCharacter(
      createTestCharacter({ techniques: [{ techniqueId: HEIRLOOM_LORE }] }),
    ).requirementContext;

    expect(
      resolveRequirement(
        { type: "hasTechnique", techniqueId: HEIRLOOM_LORE },
        context,
      ),
    ).toBe("satisfied");
  });

  /*
   * The answer that matters most. There is no rank there to meet the minimum
   * with and there never will be, so this is UNSATISFIED — a definite no, not
   * an unresolved "the sheet does not say".
   */
  it("never satisfies a Mastery requirement from a non-mastered Skill", () => {
    registerCapabilities();

    expect(
      resolveRequirement(
        { type: "skillMastery", skillId: DOOR_RUNE, minimumMastery: 1 },
        contextFor([{ skillId: DOOR_RUNE }]),
      ),
    ).toBe("unsatisfied");
  });

  it("says the same about a non-mastered Technique", () => {
    registerCapabilities();

    const context = resolveTestCharacter(
      createTestCharacter({ techniques: [{ techniqueId: HEIRLOOM_LORE }] }),
    ).requirementContext;

    expect(
      resolveRequirement(
        {
          type: "techniqueMastery",
          techniqueId: HEIRLOOM_LORE,
          minimumMastery: 1,
        },
        context,
      ),
    ).toBe("unsatisfied");
  });

  it("still answers rank requirements about a mastered Skill", () => {
    registerCapabilities();

    const context = contextFor([{ skillId: PICKING, mastery: 2 }]);

    expect(
      resolveRequirement(
        { type: "skillMastery", skillId: PICKING, minimumMastery: 2 },
        context,
      ),
    ).toBe("satisfied");

    expect(
      resolveRequirement(
        { type: "skillMastery", skillId: PICKING, minimumMastery: 3 },
        context,
      ),
    ).toBe("unsatisfied");
  });

  // The projections are separate on purpose: one list of what is held, one
  // record of what carries a rank.
  it("keeps a non-mastered Skill out of the Mastery record and in the id list", () => {
    registerCapabilities();

    const context = contextFor([
      { skillId: DOOR_RUNE },
      { skillId: PICKING, mastery: 2 },
    ]);

    expect(context.skillIds).toEqual(
      expect.arrayContaining([DOOR_RUNE, PICKING]),
    );
    expect(context.skillMastery).toEqual({ [PICKING]: 2 });
  });
});

/* ── Grants ─────────────────────────────────────────────────────────────── */

describe("a grant hands over what the capability actually has", () => {
  it("gives Mastery I to a masterable capability and bare access otherwise", () => {
    registerCapabilities();

    registerDefinition("trait", {
      id: "test-locksmiths-hands",
      name: "Locksmith's Hands",
      description: "A test Trait granting one Skill of each kind.",
      effects: [
        { type: "grantSkill", skillId: PICKING },
        { type: "grantSkill", skillId: DOOR_RUNE },
      ],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "test-locksmiths-hands" }] }),
    );

    const picking = resolved.capabilities.skills[PICKING];
    const rune = resolved.capabilities.skills[DOOR_RUNE];

    expect(picking?.mastery).toBe(1);
    expect(picking?.isGranted).toBe(true);
    expect(picking?.isAuthored).toBe(false);

    expect(rune?.mastery).toBeNull();
    expect(rune?.isGranted).toBe(true);
    expect(rune?.supportsMastery).toBe(false);
  });

  it("keeps trained depth over a grant of the same Skill", () => {
    registerCapabilities();

    registerDefinition("trait", {
      id: "test-locksmiths-hands",
      name: "Locksmith's Hands",
      description: "A test Trait granting one Skill.",
      effects: [{ type: "grantSkill", skillId: PICKING }],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({
        traits: [{ traitId: "test-locksmiths-hands" }],
        skills: [{ skillId: PICKING, mastery: 3 }],
      }),
    );

    expect(resolved.capabilities.skills[PICKING]?.mastery).toBe(3);
    expect(resolved.capabilities.skills[PICKING]?.authoredMastery).toBe(3);
  });
});

/* ── Effects ────────────────────────────────────────────────────────────── */

describe("effects apply with and without a track", () => {
  it("applies a non-mastered Skill's and Technique's own effects", () => {
    registerCapabilities();

    const resolved = resolveTestCharacter(
      createTestCharacter({
        skills: [{ skillId: DOOR_RUNE }],
        techniques: [{ techniqueId: HEIRLOOM_LORE }],
      }),
    );

    expect(resolved.attributes.base.wis).toBe(12);
    expect(resolved.attributes.base.int).toBe(12);
  });

  it("keeps rank effects cumulative for a mastered Skill", () => {
    registerCapabilities();

    const definition = getSkillDefinition(PICKING);

    expect(definition).toBeDefined();

    if (definition === undefined) return;

    expect(collectSkillEffects(definition, 1)).toEqual([]);
    expect(collectSkillEffects(definition, 2)).toHaveLength(1);
    expect(collectSkillEffects(definition, 3)).toHaveLength(2);

    /* And through a whole character: 10 base DEX, +1 at II, +1 at III. */
    expect(
      resolveTestCharacter(
        createTestCharacter({ skills: [{ skillId: PICKING, mastery: 3 }] }),
      ).attributes.base.dex,
    ).toBe(12);
  });

  it("contributes no rank effects at all from a trackless capability", () => {
    registerCapabilities();

    const definition = getTechniqueDefinition(HEIRLOOM_LORE);

    expect(definition).toBeDefined();

    if (definition === undefined) return;

    expect(collectTechniqueEffects(definition, null)).toEqual([
      { type: "modifyBaseAttribute", attribute: "int", amount: 2 },
    ]);
  });

  it("leaves advancement requirements on the individual rank", () => {
    registerCapabilities();

    const track = skillMasteryTrack(PICKING);

    expect(track).toBeDefined();

    if (track === undefined) return;

    expect(getMasteryRankDefinition(track, 2)?.requirements).toBeUndefined();

    expect(getMasteryRankDefinition(track, 3)).toMatchObject({
      growthPointCost: 4,
      requirements: [
        { type: "attributeMinimum", attribute: "dex", layer: "base", minimum: 12 },
      ],
    });
  });
});

/* ── Validation ─────────────────────────────────────────────────────────── */

describe("validation of Mastery a capability does not have", () => {
  it("rejects a stored rank on a non-mastered Skill", () => {
    registerCapabilities();

    expect(
      findSkillValidationIssues([{ skillId: DOOR_RUNE, mastery: 2 }]),
    ).toEqual([
      { type: "skill-mastery-not-supported", skillId: DOOR_RUNE, mastery: 2 },
    ]);
  });

  it("rejects a stored rank on a non-mastered Technique", () => {
    registerCapabilities();

    expect(
      findTechniqueValidationIssues([
        { techniqueId: HEIRLOOM_LORE, mastery: 3 },
      ]),
    ).toEqual([
      {
        type: "technique-mastery-not-supported",
        techniqueId: HEIRLOOM_LORE,
        mastery: 3,
      },
    ]);
  });

  it("accepts the same capability with no rank stored", () => {
    registerCapabilities();

    expect(findSkillValidationIssues([{ skillId: DOOR_RUNE }])).toEqual([]);
    expect(
      findTechniqueValidationIssues([{ techniqueId: HEIRLOOM_LORE }]),
    ).toEqual([]);
  });

  it("reaches a whole character as an error a person can act on", () => {
    registerCapabilities();

    const result = validateCharacter(
      createTestCharacter({ skills: [{ skillId: DOOR_RUNE, mastery: 2 }] }),
    );

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors.map((error) => error.code)).toContain(
      "character.skill.mastery_unsupported",
    );
  });

  it("still rejects a rank past the end of a real track", () => {
    registerCapabilities();

    expect(findSkillValidationIssues([{ skillId: PICKING, mastery: 5 }])).toEqual([
      {
        type: "invalid-skill-mastery",
        skillId: PICKING,
        mastery: 5,
        maximumMastery: 3,
      },
    ]);
  });

  /*
   * These moved from "reported by catalog validation" to "refused at
   * registration", and the move is the improvement: a Skill whose track is
   * impossible never becomes a capability anyone can train. The rule itself is
   * unchanged — the registry runs the same validator over authored content.
   */
  it("refuses a track whose maximum is not a rank", () => {
    const result = registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-overreaching",
      name: "Overreaching",
      description: "A test Skill with an impossible maximum.",
      mastery: { maximumMastery: 12 as MasteryRank },
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason)
      .toContain("which is not a rank");

    expect(findSkillCatalogIssues()).toEqual([]);
  });

  it("refuses a rank defined past the track's own maximum", () => {
    const result = registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-overreaching",
      name: "Overreaching",
      description: "A test Skill with a rank beyond its track.",
      mastery: { maximumMastery: 3, ranks: [{ rank: 5 }] },
    });

    expect(result.ok).toBe(false);
    expect(findSkillCatalogIssues()).toEqual([]);
  });

  it("still walks the rules on a rank now that ranks live on the track", () => {
    registerDefinition("technique", {
      id: "test-broken-rank",
      name: "Broken Rank",
      description: "A test Technique whose rank grants nothing real.",
      mastery: {
        maximumMastery: 3,
        ranks: [
          { rank: 1, effects: [{ type: "grantSkill", skillId: "no-such-skill" }] },
        ],
      },
    });

    expect(findCatalogReferenceIssues()).toEqual([
      expect.stringContaining('(rank 1) grants unknown Skill "no-such-skill"'),
    ]);
  });
});

describe("Mastery requirements are checked against the target's own track", () => {
  it("rejects a requirement for Mastery in a capability that has none", () => {
    registerCapabilities();

    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-rune-scholar",
      name: "Rune Scholar",
      description: "A test Skill asking for depth that does not exist.",
      requirements: [
        { type: "skillMastery", skillId: DOOR_RUNE, minimumMastery: 2 },
      ],
    });

    expect(findCatalogReferenceIssues()).toEqual([
      expect.stringContaining(
        `requires Mastery 2 in Skill "${DOOR_RUNE}", which has no Mastery`,
      ),
    ]);
  });

  it("rejects a minimum past the end of the target's track", () => {
    registerCapabilities();

    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-master-picker",
      name: "Master Picker",
      description: "A test Skill asking for a rank the target cannot reach.",
      requirements: [
        { type: "skillMastery", skillId: PICKING, minimumMastery: 5 },
      ],
    });

    expect(findCatalogReferenceIssues()).toEqual([
      expect.stringContaining(
        `requires Mastery 5 in Skill "${PICKING}", whose track ends at 3`,
      ),
    ]);
  });

  it("says the same about a Technique Mastery requirement", () => {
    registerCapabilities();

    registerDefinition("technique", {
      id: "test-twin-blades",
      name: "Twin Blades",
      description: "A test Technique asking for an unreachable rank.",
      requirements: [
        {
          type: "techniqueMastery",
          techniqueId: HEIRLOOM_LORE,
          minimumMastery: 2,
        },
      ],
    });

    expect(findCatalogReferenceIssues()).toEqual([
      expect.stringContaining(
        `requires Mastery 2 in Technique "${HEIRLOOM_LORE}", which has no Mastery`,
      ),
    ]);
  });

  it("accepts a minimum the target's track actually reaches", () => {
    registerCapabilities();

    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-competent-picker",
      name: "Competent Picker",
      description: "A test Skill asking for a rank that exists.",
      requirements: [
        { type: "skillMastery", skillId: PICKING, minimumMastery: 3 },
        { type: "hasSkill", skillId: DOOR_RUNE },
      ],
    });

    expect(findCatalogReferenceIssues()).toEqual([]);
  });
});

/* ── Traits, and the content that already existed ───────────────────────── */

describe("Traits have no Mastery", () => {
  it("declares no Mastery on any authored Trait", () => {
    for (const trait of Object.values(TRAIT_DEFINITIONS)) {
      expect(trait).not.toHaveProperty("mastery");
    }
  });

  /*
   * And no resolution path either: resolved Traits are held or not held, with
   * nothing rank-shaped on them to read.
   */
  it("resolves a Trait without any Mastery field", () => {
    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "firebending" }] }),
    );

    const firebending = resolved.traits["firebending"];

    expect(firebending).toBeDefined();
    expect(firebending).not.toHaveProperty("mastery");
    expect(firebending).not.toHaveProperty("supportsMastery");
  });
});

describe("existing content behaves as it did before the migration", () => {
  it("keeps Martial Arts granting one Skill per rank", () => {
    const definition = getTechniqueDefinition("martial-arts");

    expect(definition).toBeDefined();

    if (definition === undefined) return;

    expect(collectTechniqueEffects(definition, 3)).toEqual([
      { type: "grantSkill", skillId: "punch" },
      { type: "grantSkill", skillId: "parry" },
      { type: "grantSkill", skillId: "defensive-stance" },
    ]);
  });

  it("keeps every authored capability on a Mastery track", () => {
    for (const technique of Object.values(TECHNIQUE_DEFINITIONS)) {
      expect(technique.mastery).toBeDefined();
    }

    expect(skillMaximumMastery("pick-lock")).toBe(5);
    expect(skillMaximumMastery("punch")).toBe(10);
    expect(techniqueMaximumMastery("lockpicking")).toBe(5);
  });

  it("keeps the authored catalog clean under the new validation", () => {
    expect(findSkillCatalogIssues()).toEqual([]);
    expect(findCatalogReferenceIssues()).toEqual([]);
  });

  it("still resolves a Technique's granted Skills at the ranks reached", () => {
    const resolved = resolveTestCharacter(
      createTestCharacter({
        techniques: [{ techniqueId: "martial-arts", mastery: 2 }],
      }),
    );

    expect(Object.keys(resolved.capabilities.skills).sort()).toEqual([
      "parry",
      "punch",
    ]);

    expect(resolved.capabilities.skills["punch"]?.mastery).toBe(1);
    expect(resolved.capabilities.skills["punch"]?.supportsMastery).toBe(true);
  });
});
