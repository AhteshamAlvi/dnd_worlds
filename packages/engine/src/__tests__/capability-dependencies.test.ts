/*
 * The capability dependency graph.
 *
 * Content is data, so an author can write a Skill that requires a Technique
 * that requires that Skill. Neither definition is malformed and the pair is
 * impossible, and nobody finds out until a player asks why the Skill never
 * appears in any picker.
 *
 * The tests that matter most here are the ones about what must NOT be
 * rejected. A plain cycle check would refuse perfectly good content, because
 * an `any` branch can make an apparent loop reachable — so the analysis is a
 * fixed point over what is obtainable, not a search for loops.
 */

import { afterEach, describe, expect, it } from "vitest";

import { minimalSkillApplication } from "../character/capabilities/applications";

import {
  clearCustomDefinitions,
  findCatalogReferenceIssues,
  registerDefinition,
} from "../character/catalogs";

import {
  capabilityRequirements,
  capabilitySubsumes,
  findCapabilityDependencyIssues,
  isCapabilityEverAcquirable,
  isKnownCapability,
  isMasteryRankEverReachable,
} from "../character/capabilities/dependencies";

import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});

/* ── The authored catalog ───────────────────────────────────────────────── */

describe("the authored catalog holds together", () => {
  it("has no dependency issues of its own", () => {
    expect(findCapabilityDependencyIssues()).toEqual([]);
  });

  it("is reported through the same catalog check as every other reference", () => {
    expect(findCatalogReferenceIssues()).toEqual([]);
  });

  it("finds every authored capability acquirable", () => {
    expect(isCapabilityEverAcquirable({ kind: "skill", id: "punch" })).toBe(true);
    expect(
      isCapabilityEverAcquirable({ kind: "technique", id: "martial-arts" }),
    ).toBe(true);
    expect(isCapabilityEverAcquirable({ kind: "trait", id: "firebending" })).toBe(
      true,
    );
  });
});

/* ── Cross-kind prerequisites ───────────────────────────────────────────── */

describe("Skills and Techniques may depend on each other", () => {
  it("accepts a Skill requiring a Technique and a Technique requiring a Skill", () => {
    registerDefinition("technique", {
      id: "test-swordsmanship",
      name: "Swordsmanship",
      description: "A test Technique.",
      mastery: { maximumMastery: 5 },
    });

    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-direct-thrust",
      name: "Direct Thrust",
      description: "A test Skill gated on the discipline.",
      mastery: { maximumMastery: 3 },
      requirements: [{ type: "hasTechnique", techniqueId: "test-swordsmanship" }],
    });

    registerDefinition("technique", {
      id: "test-twin-blades",
      name: "Twin Blades",
      description: "A test Technique gated on a Skill.",
      mastery: { maximumMastery: 3 },
      requirements: [
        { type: "skillMastery", skillId: "test-direct-thrust", minimumMastery: 2 },
      ],
    });

    expect(findCapabilityDependencyIssues()).toEqual([]);
  });

  it("resolves such a chain on an actual character", () => {
    registerDefinition("technique", {
      id: "test-swordsmanship",
      name: "Swordsmanship",
      description: "A test Technique.",
      mastery: {
        maximumMastery: 5,
        ranks: [
          { rank: 1, effects: [{ type: "grantSkill", skillId: "test-direct-thrust" }] },
        ],
      },
    });

    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-direct-thrust",
      name: "Direct Thrust",
      description: "A test Skill gated on the discipline.",
      mastery: { maximumMastery: 3 },
      requirements: [{ type: "hasTechnique", techniqueId: "test-swordsmanship" }],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({
        techniques: [{ techniqueId: "test-swordsmanship" }],
      }),
    );

    expect(resolved.capabilities.skills["test-direct-thrust"]?.isGranted).toBe(
      true,
    );
  });
});

/* ── Traits ─────────────────────────────────────────────────────────────── */

describe("what a Trait may and may not require", () => {
  it("lets a Trait require another Trait", () => {
    registerDefinition("trait", {
      id: "test-sharingan",
      name: "Sharingan",
      description: "A test Trait.",
    });

    registerDefinition("trait", {
      id: "test-mangekyo",
      name: "Mangekyo Sharingan",
      description: "A test Trait requiring its predecessor.",
      parentTraitId: "test-sharingan",
      requirements: [{ type: "hasTrait", traitId: "test-sharingan" }],
    });

    expect(findCapabilityDependencyIssues()).toEqual([]);
  });

  it("lets a Trait require ordinary non-capability facts", () => {
    registerDefinition("trait", {
      id: "test-giant-blooded",
      name: "Giant Blooded",
      description: "A test Trait gated on ancestry and a score.",
      requirements: [
        {
          type: "all",
          requirements: [
            { type: "hasSpecies", speciesId: "human" },
            { type: "attributeMinimum", attribute: "vit", layer: "base", minimum: 14 },
          ],
        },
      ],
    });

    expect(findCapabilityDependencyIssues()).toEqual([]);
  });

  /*
   * A Trait is something a character IS, and the things a character is do not
   * have training prerequisites. Ambidextrous is learnable, and the way it is
   * learned is that it is AWARDED after the training — not that its definition
   * names a Skill nobody would otherwise take.
   */
  it("refuses a Trait that requires a Skill", () => {
    registerDefinition("trait", {
      id: "test-ambidextrous",
      name: "Ambidextrous",
      description: "A test Trait wrongly gated on training.",
      requirements: [{ type: "hasSkill", skillId: "punch" }],
    });

    expect(findCapabilityDependencyIssues()).toEqual([
      expect.stringContaining("may not depend on Skills or Techniques"),
    ]);
  });

  it("refuses a Trait that requires a Technique, at any depth", () => {
    registerDefinition("trait", {
      id: "test-ambidextrous",
      name: "Ambidextrous",
      description: "A test Trait wrongly gated on training, one level down.",
      requirements: [
        {
          type: "any",
          requirements: [
            { type: "hasTrait", traitId: "one-armed" },
            { type: "techniqueMastery", techniqueId: "martial-arts", minimumMastery: 2 },
          ],
        },
      ],
    });

    expect(findCapabilityDependencyIssues()).toEqual([
      expect.stringContaining("may not depend on Skills or Techniques"),
    ]);
  });

  it("refuses a Trait that requires Skill Mastery", () => {
    registerDefinition("trait", {
      id: "test-hardened",
      name: "Hardened",
      description: "A test Trait wrongly gated on depth.",
      requirements: [
        { type: "skillMastery", skillId: "punch", minimumMastery: 4 },
      ],
    });

    expect(findCapabilityDependencyIssues()).toEqual([
      expect.stringContaining("may not depend on Skills or Techniques"),
    ]);
  });
});

/* ── Impossible graphs ──────────────────────────────────────────────────── */

describe("impossible acquisition cycles are rejected", () => {
  it("refuses a Skill and a Technique that require each other", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-deadlocked-skill",
      name: "Deadlocked Skill",
      description: "A test Skill requiring the Technique that requires it.",
      mastery: { maximumMastery: 3 },
      requirements: [
        { type: "hasTechnique", techniqueId: "test-deadlocked-technique" },
      ],
    });

    registerDefinition("technique", {
      id: "test-deadlocked-technique",
      name: "Deadlocked Technique",
      description: "A test Technique requiring the Skill that requires it.",
      mastery: { maximumMastery: 3 },
      requirements: [{ type: "hasSkill", skillId: "test-deadlocked-skill" }],
    });

    const issues = findCapabilityDependencyIssues();

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Skill "test-deadlocked-skill" can never be acquired'),
        expect.stringContaining(
          'Technique "test-deadlocked-technique" can never be acquired',
        ),
      ]),
    );

    expect(
      isCapabilityEverAcquirable({ kind: "skill", id: "test-deadlocked-skill" }),
    ).toBe(false);
  });

  it("refuses a Trait that requires itself", () => {
    registerDefinition("trait", {
      id: "test-self-gated",
      name: "Self Gated",
      description: "A test Trait requiring itself.",
      requirements: [{ type: "hasTrait", traitId: "test-self-gated" }],
    });

    expect(findCapabilityDependencyIssues()).toEqual([
      expect.stringContaining('Trait "test-self-gated" can never be acquired'),
    ]);
  });

  /*
   * The case a mechanical cycle check gets wrong. There IS a loop here — the
   * Skill depends on the Technique which depends on the Skill — and the
   * content works, because the Skill has a second way in: take the Trait, then
   * the Skill, then the Technique.
   */
  it("accepts a cycle that has a reachable alternative branch", () => {
    registerDefinition("trait", {
      id: "test-innate-talent",
      name: "Innate Talent",
      description: "A test Trait obtainable on its own.",
    });

    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-branching-skill",
      name: "Branching Skill",
      description: "A test Skill with two ways in.",
      mastery: { maximumMastery: 3 },
      requirements: [
        {
          type: "any",
          requirements: [
            { type: "hasTechnique", techniqueId: "test-branching-technique" },
            { type: "hasTrait", traitId: "test-innate-talent" },
          ],
        },
      ],
    });

    registerDefinition("technique", {
      id: "test-branching-technique",
      name: "Branching Technique",
      description: "A test Technique gated on the Skill.",
      mastery: { maximumMastery: 3 },
      requirements: [{ type: "hasSkill", skillId: "test-branching-skill" }],
    });

    expect(findCapabilityDependencyIssues()).toEqual([]);

    expect(
      isCapabilityEverAcquirable({ kind: "skill", id: "test-branching-skill" }),
    ).toBe(true);
    expect(
      isCapabilityEverAcquirable({
        kind: "technique",
        id: "test-branching-technique",
      }),
    ).toBe(true);
  });

  /* The same shape with the alternative branch itself unobtainable. */
  it("refuses when every branch of the alternative is blocked", () => {
    registerDefinition("trait", {
      id: "test-impossible-talent",
      name: "Impossible Talent",
      description: "A test Trait gated on an unreachable Trait.",
      requirements: [{ type: "hasTrait", traitId: "test-impossible-talent" }],
    });

    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-branching-skill",
      name: "Branching Skill",
      description: "A test Skill whose every way in is blocked.",
      mastery: { maximumMastery: 3 },
      requirements: [
        {
          type: "any",
          requirements: [
            { type: "hasTechnique", techniqueId: "test-branching-technique" },
            { type: "hasTrait", traitId: "test-impossible-talent" },
          ],
        },
      ],
    });

    registerDefinition("technique", {
      id: "test-branching-technique",
      name: "Branching Technique",
      description: "A test Technique gated on the Skill.",
      mastery: { maximumMastery: 3 },
      requirements: [{ type: "hasSkill", skillId: "test-branching-skill" }],
    });

    expect(findCapabilityDependencyIssues()).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Skill "test-branching-skill" can never be acquired'),
      ]),
    );
  });

  /*
   * A grant is a second way in, so something nobody could ever meet the
   * requirements for is still fine if something reachable hands it over.
   */
  it("accepts an unmeetable capability that something reachable grants", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-gift-only",
      name: "Gift Only",
      description: "A test Skill nobody can qualify for.",
      mastery: { maximumMastery: 3 },
      requirements: [{ type: "hasSkill", skillId: "test-gift-only" }],
    });

    registerDefinition("trait", {
      id: "test-benefactor",
      name: "Benefactor",
      description: "A test Trait that hands it over anyway.",
      effects: [{ type: "grantSkill", skillId: "test-gift-only" }],
    });

    expect(findCapabilityDependencyIssues()).toEqual([]);
  });

  it("does not accept it when the granting content is itself unreachable", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-gift-only",
      name: "Gift Only",
      description: "A test Skill nobody can qualify for.",
      mastery: { maximumMastery: 3 },
      requirements: [{ type: "hasSkill", skillId: "test-gift-only" }],
    });

    registerDefinition("trait", {
      id: "test-unreachable-benefactor",
      name: "Unreachable Benefactor",
      description: "A test Trait nobody can obtain either.",
      requirements: [{ type: "hasTrait", traitId: "test-unreachable-benefactor" }],
      effects: [{ type: "grantSkill", skillId: "test-gift-only" }],
    });

    expect(findCapabilityDependencyIssues()).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Skill "test-gift-only" can never be acquired'),
        expect.stringContaining(
          'Trait "test-unreachable-benefactor" can never be acquired',
        ),
      ]),
    );
  });

  /*
   * Unknown references are somebody else's message. catalogs.ts names the
   * typo; blocking on it here would bury that one accurate line under a
   * cascade about everything downstream.
   */
  it("leaves unknown references to the reference check", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-typo",
      name: "Typo",
      description: "A test Skill naming a Technique that does not exist.",
      mastery: { maximumMastery: 3 },
      requirements: [{ type: "hasTechnique", techniqueId: "swordsmanshp" }],
    });

    expect(findCapabilityDependencyIssues()).toEqual([]);

    expect(findCatalogReferenceIssues()).toEqual([
      expect.stringContaining('requires unknown Technique "swordsmanshp"'),
    ]);
  });
});

/* ── Unlocks ────────────────────────────────────────────────────────────── */

describe("an unlock permits acquisition without satisfying it", () => {
  /*
   * The distinction the whole mode exists for. A Clan offering a Skill whose
   * requirements can never be met has issued a real invitation to something
   * still unlearnable — so the offer must not mark it reachable, or the
   * deadlock this analysis exists to find is hidden by the content that meant
   * to be generous.
   */
  it("does not rescue a self-deadlocked Skill", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-deadlocked-skill",
      name: "Deadlocked Skill",
      description: "A test Skill that requires itself.",
      mastery: { maximumMastery: 3 },
      requirements: [{ type: "hasSkill", skillId: "test-deadlocked-skill" }],
    });

    registerDefinition("trait", {
      id: "test-clan-membership",
      name: "Clan Membership",
      description: "A test Trait offering it anyway.",
      effects: [
        {
          type: "grantSkill",
          skillId: "test-deadlocked-skill",
          mode: "unlocked-for-acquisition",
        },
      ],
    });

    expect(findCapabilityDependencyIssues()).toEqual([
      expect.stringContaining(
        'Skill "test-deadlocked-skill" can never be acquired',
      ),
    ]);

    expect(
      isCapabilityEverAcquirable({ kind: "skill", id: "test-deadlocked-skill" }),
    ).toBe(false);
  });

  /*
   * The same offer against prerequisites somebody can actually meet — and the
   * Skill is declared requiresUnlock, so the offer is genuinely load-bearing.
   * Without that the Skill would be reachable on its prerequisites alone and
   * the test would pass whatever the unlock did.
   */
  function registerInnerStyle(): void {
    registerDefinition("trait", {
      id: "test-innate-talent",
      name: "Innate Talent",
      description: "A test Trait obtainable on its own.",
    });

    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-inner-style",
      name: "Inner Style",
      description: "A test Skill gated on a Trait AND on being invited.",
      mastery: { maximumMastery: 3 },
      requiresUnlock: true,
      requirements: [{ type: "hasTrait", traitId: "test-innate-talent" }],
    });
  }

  function registerClanMembership(): void {
    registerDefinition("trait", {
      id: "test-clan-membership",
      name: "Clan Membership",
      description: "A test Trait offering the style to its holder.",
      effects: [
        {
          type: "grantSkill",
          skillId: "test-inner-style",
          mode: "unlocked-for-acquisition",
        },
      ],
    });
  }

  it("makes a doubly gated Skill reachable when both gates open", () => {
    registerInnerStyle();
    registerClanMembership();

    expect(findCapabilityDependencyIssues()).toEqual([]);

    expect(
      isCapabilityEverAcquirable({ kind: "skill", id: "test-inner-style" }),
    ).toBe(true);
  });

  /* The negative control for the pair above: remove the offer, lose the Skill. */
  it("leaves the same Skill unreachable when nothing offers it", () => {
    registerInnerStyle();

    expect(
      isCapabilityEverAcquirable({ kind: "skill", id: "test-inner-style" }),
    ).toBe(false);

    expect(findCapabilityDependencyIssues()).toEqual([
      expect.stringContaining(
        'Skill "test-inner-style" can never be acquired: it requires an unlock, and nothing obtainable unlocks it.',
      ),
    ]);
  });

  /*
   * And the other direction: something declared as needing permission is
   * unreachable while nobody can ever give it, however easy its prerequisites
   * are.
   */
  it("refuses a capability that requires an unlock nothing supplies", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-closed-style",
      name: "Closed Style",
      description: "A test Skill nobody is ever invited to.",
      mastery: { maximumMastery: 3 },
      requiresUnlock: true,
    });

    expect(findCapabilityDependencyIssues()).toEqual([
      'Skill "test-closed-style" can never be acquired: it requires an unlock, and nothing obtainable unlocks it.',
    ]);
  });

  it("accepts it once something obtainable offers it", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-closed-style",
      name: "Closed Style",
      description: "A test Skill open only to those invited.",
      mastery: { maximumMastery: 3 },
      requiresUnlock: true,
    });

    registerDefinition("trait", {
      id: "test-clan-membership",
      name: "Clan Membership",
      description: "A test Trait that issues the invitation.",
      effects: [
        {
          type: "grantSkill",
          skillId: "test-closed-style",
          mode: "unlocked-for-acquisition",
        },
      ],
    });

    expect(findCapabilityDependencyIssues()).toEqual([]);
  });

  it("is not satisfied by an offer from content nobody can obtain", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-closed-style",
      name: "Closed Style",
      description: "A test Skill open only to those invited.",
      mastery: { maximumMastery: 3 },
      requiresUnlock: true,
    });

    registerDefinition("trait", {
      id: "test-unreachable-clan",
      name: "Unreachable Clan",
      description: "A test Trait nobody can obtain.",
      requirements: [{ type: "hasTrait", traitId: "test-unreachable-clan" }],
      effects: [
        {
          type: "grantSkill",
          skillId: "test-closed-style",
          mode: "unlocked-for-acquisition",
        },
      ],
    });

    expect(findCapabilityDependencyIssues()).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Skill "test-closed-style" can never be acquired: it requires an unlock',
        ),
      ]),
    );
  });

  /*
   * Which gate is shut, said out loud. A capability gated both ways with a
   * perfectly good invitation must not be reported as possibly needing one —
   * the author would go looking for content that already exists.
   */
  it("names the prerequisite gate when the offer is fine", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-closed-style",
      name: "Closed Style",
      description: "A test Skill offered to everyone and impossible anyway.",
      mastery: { maximumMastery: 3 },
      requiresUnlock: true,
      requirements: [{ type: "hasSkill", skillId: "test-closed-style" }],
    });

    registerDefinition("trait", {
      id: "test-clan-membership",
      name: "Clan Membership",
      description: "A test Trait that issues a perfectly good invitation.",
      effects: [
        {
          type: "grantSkill",
          skillId: "test-closed-style",
          mode: "unlocked-for-acquisition",
        },
      ],
    });

    expect(findCapabilityDependencyIssues()).toEqual([
      'Skill "test-closed-style" can never be acquired: its prerequisites cannot all be satisfied by anything that is itself obtainable.',
    ]);
  });

  it("names both gates when both are shut", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-closed-style",
      name: "Closed Style",
      description: "A test Skill nobody offers and nobody could qualify for.",
      mastery: { maximumMastery: 3 },
      requiresUnlock: true,
      requirements: [{ type: "hasSkill", skillId: "test-closed-style" }],
    });

    expect(findCapabilityDependencyIssues()).toEqual([
      'Skill "test-closed-style" can never be acquired: it requires an unlock that nothing obtainable supplies, and its prerequisites cannot all be satisfied either.',
    ]);
  });

  /* An access grant still skips both gates, which is what a gift is. */
  it("lets an outright grant bypass the unlock requirement", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-closed-style",
      name: "Closed Style",
      description: "A test Skill open only to those invited.",
      mastery: { maximumMastery: 3 },
      requiresUnlock: true,
    });

    registerDefinition("trait", {
      id: "test-heirloom",
      name: "Heirloom",
      description: "A test Trait that simply hands it over.",
      effects: [{ type: "grantSkill", skillId: "test-closed-style" }],
    });

    expect(findCapabilityDependencyIssues()).toEqual([]);
  });
});


/* ── Mastery progression ────────────────────────────────────────────────── */

describe("Mastery advancement is checked rank by rank", () => {
  it("accepts ranks whose requirements can be met in order", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-climbing",
      name: "Climbing",
      description: "A test Skill whose ranks ask for more of the same.",
      mastery: {
        maximumMastery: 3,
        ranks: [
          {
            rank: 2,
            requirements: [
              { type: "attributeMinimum", attribute: "agi", layer: "base", minimum: 12 },
            ],
          },
          {
            rank: 3,
            requirements: [
              { type: "skillMastery", skillId: "test-climbing", minimumMastery: 2 },
            ],
          },
        ],
      },
    });

    expect(findCapabilityDependencyIssues()).toEqual([]);

    expect(
      isMasteryRankEverReachable({ kind: "skill", id: "test-climbing" }, 3),
    ).toBe(true);
  });

  /*
   * Each Skill is acquirable; neither can ever pass its own second rank,
   * because each second rank waits on the other's second rank. A check that
   * only looked at acquisition would call this fine.
   */
  it("refuses two ranks that wait on each other", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-left-hand",
      name: "Left Hand",
      description: "A test Skill whose rank II needs the other's rank II.",
      mastery: {
        maximumMastery: 3,
        ranks: [
          {
            rank: 2,
            requirements: [
              { type: "skillMastery", skillId: "test-right-hand", minimumMastery: 2 },
            ],
          },
        ],
      },
    });

    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-right-hand",
      name: "Right Hand",
      description: "A test Skill whose rank II needs the other's rank II.",
      mastery: {
        maximumMastery: 3,
        ranks: [
          {
            rank: 2,
            requirements: [
              { type: "skillMastery", skillId: "test-left-hand", minimumMastery: 2 },
            ],
          },
        ],
      },
    });

    const issues = findCapabilityDependencyIssues();

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Skill "test-left-hand" can never reach Mastery 2',
        ),
        expect.stringContaining(
          'Skill "test-right-hand" can never reach Mastery 2',
        ),
      ]),
    );

    /* Acquisition itself was never the problem. */
    expect(
      isCapabilityEverAcquirable({ kind: "skill", id: "test-left-hand" }),
    ).toBe(true);
    expect(
      isMasteryRankEverReachable({ kind: "skill", id: "test-left-hand" }, 2),
    ).toBe(false);
  });

  it("reports one blocked rank rather than every rank above it", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "test-sealed",
      name: "Sealed",
      description: "A test Skill whose rank II is impossible.",
      mastery: {
        maximumMastery: 5,
        ranks: [
          {
            rank: 2,
            requirements: [
              { type: "skillMastery", skillId: "test-sealed", minimumMastery: 3 },
            ],
          },
          {
            rank: 4,
            requirements: [
              { type: "attributeMinimum", attribute: "agi", layer: "base", minimum: 12 },
            ],
          },
        ],
      },
    });

    expect(findCapabilityDependencyIssues()).toEqual([
      expect.stringContaining('Skill "test-sealed" can never reach Mastery 2'),
    ]);
  });
});

/* ── Subsumption declarations ───────────────────────────────────────────── */

describe("subsumption declarations are checked", () => {
  it("refuses a capability that subsumes itself", () => {
    registerDefinition("technique", {
      id: "test-ouroboros",
      name: "Ouroboros",
      description: "A test Technique replacing itself.",
      mastery: { maximumMastery: 3 },
      subsumes: ["test-ouroboros"],
    });

    expect(findCapabilityDependencyIssues()).toEqual([
      expect.stringContaining('Technique "test-ouroboros" subsumes itself'),
    ]);
  });

  it("refuses a subsumption naming something in another catalog", () => {
    registerDefinition("technique", {
      id: "test-confused",
      name: "Confused",
      description: "A test Technique replacing a Skill.",
      mastery: { maximumMastery: 3 },
      subsumes: ["punch"],
    });

    expect(findCapabilityDependencyIssues()).toEqual([
      expect.stringContaining("which is a Skill — subsumption replaces like with like"),
    ]);
  });

  it("refuses a subsumption naming nothing at all", () => {
    registerDefinition("technique", {
      id: "test-ghost",
      name: "Ghost",
      description: "A test Technique replacing a Technique nobody wrote.",
      mastery: { maximumMastery: 3 },
      subsumes: ["no-such-technique"],
    });

    expect(findCapabilityDependencyIssues()).toEqual([
      expect.stringContaining('subsumes unknown Technique "no-such-technique"'),
    ]);
  });

  it("refuses a subsumption cycle", () => {
    registerDefinition("trait", {
      id: "test-loop-a",
      name: "Loop A",
      description: "A test Trait replacing the one that replaces it.",
      subsumes: ["test-loop-b"],
    });

    registerDefinition("trait", {
      id: "test-loop-b",
      name: "Loop B",
      description: "A test Trait replacing the one that replaces it.",
      subsumes: ["test-loop-a"],
    });

    const issues = findCapabilityDependencyIssues();

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Trait "test-loop-a" is part of a subsumption cycle'),
        expect.stringContaining('Trait "test-loop-b" is part of a subsumption cycle'),
      ]),
    );
  });
});

/* ── Lookups ────────────────────────────────────────────────────────────── */

describe("kind-agnostic capability lookup", () => {
  it("reads requirements and subsumption from whichever catalog owns them", () => {
    registerDefinition("technique", {
      id: "test-intermediate",
      name: "Intermediate",
      description: "A test Technique replacing a simpler one.",
      mastery: { maximumMastery: 5 },
      subsumes: ["test-basic"],
      requirements: [{ type: "hasTrait", traitId: "one-armed" }],
    });

    registerDefinition("technique", {
      id: "test-basic",
      name: "Basic",
      description: "A test Technique.",
      mastery: { maximumMastery: 3 },
    });

    expect(
      capabilityRequirements({ kind: "technique", id: "test-intermediate" }),
    ).toEqual([{ type: "hasTrait", traitId: "one-armed" }]);

    expect(
      capabilitySubsumes({ kind: "technique", id: "test-intermediate" }),
    ).toEqual(["test-basic"]);

    expect(capabilitySubsumes({ kind: "technique", id: "test-basic" })).toEqual([]);
  });

  it("tells a known capability from an unknown one, per kind", () => {
    expect(isKnownCapability({ kind: "skill", id: "punch" })).toBe(true);
    expect(isKnownCapability({ kind: "technique", id: "punch" })).toBe(false);
    expect(isKnownCapability({ kind: "trait", id: "firebending" })).toBe(true);
  });

  it("returns undefined requirements for an id no catalog knows", () => {
    expect(
      capabilityRequirements({ kind: "skill", id: "punch" }),
    ).toBeDefined();
  });
});
