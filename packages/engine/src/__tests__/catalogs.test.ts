/*
 * Tests the custom-definition layer: the mechanism a host uses to teach the
 * engine about content the engine's own source does not contain.
 *
 * The rules worth pinning are the ones that protect canon — an authored id
 * cannot be redefined, and an unregistered id is still unknown — because both
 * are the difference between "this GM has homebrew" and "two people compute
 * different numbers from the same sheet".
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  collectRuleBundles,
  ruleBundleRequirementTrees,
} from "../character/rules/definitions";

import { minimalSkillApplication } from "../character/capabilities/applications";

import {
  CATALOG_DOMAINS,
  clearCustomDefinitions,
  createDefinitionId,
  definitionIdPattern,
  exportCustomDefinitions,
  findCatalogReferenceIssues,
  getDefinition,
  isKnownDefinitionId,
  listCustomDefinitions,
  listDefinitions,
  registerDefinition,
  unregisterDefinition,
} from "../character/catalogs";

import { DEFINITION_ID_PATTERN } from "../infrastructure/registry";
import { validateCharacter } from "../character/validation";
import { validDefinitions } from "./fixtures/catalog";
import { createTestCharacter } from "./fixtures/character";

import { createAnatomy } from "../character/foundation/body/anatomy/creation";
import {
  morphologyTargetsForAnatomy,
  resolveMorphology,
} from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import { resolveBodyPoints } from "../character/foundation/body/body-points/resolution";
import { resolveCriticalPoints } from "../character/foundation/body/critical-points/resolution";
import { TEST_PART_PHYSICALS } from "./fixtures/body";

afterEach(() => {
  clearCustomDefinitions();
});

const YUKI = {
  id: "yuki",
  name: "Yuki",
  description: "A snow-born people of the northern range.",
};

describe("registerDefinition", () => {
  it("makes a new definition resolvable and known", () => {
    expect(registerDefinition("species", YUKI)).toEqual({ ok: true });

    expect(isKnownDefinitionId("species", "yuki")).toBe(true);
    expect(getDefinition("species", "yuki")?.name).toBe("Yuki");
  });

  it("lists custom entries after the authored ones", () => {
    registerDefinition("species", YUKI);

    const ids = listDefinitions("species").map((entry) => entry.id);

    expect(ids[0]).toBe("human");
    expect(ids).toContain("yuki");
  });

  it("refuses to redefine an authored definition", () => {
    const result = registerDefinition("species", {
      id: "human",
      name: "Not Human",
      description: "An attempt to overwrite canon.",
    });

    expect(result.ok).toBe(false);
    expect(getDefinition("species", "human")?.name).toBe("Human");
  });

  it("refuses an id that is not a clean slug", () => {
    for (const id of ["Yuki", "yuki onna", "../escape", "yuki--onna", "-yuki"]) {
      expect(
        registerDefinition("species", { ...YUKI, id }).ok,
      ).toBe(false);
    }
  });

  it("refuses a definition with no name", () => {
    expect(
      registerDefinition("species", { ...YUKI, name: "   " }).ok,
    ).toBe(false);
  });

  it("replaces an existing custom definition, since that is an edit", () => {
    registerDefinition("species", YUKI);
    registerDefinition("species", { ...YUKI, name: "Yuki-onna" });

    expect(listCustomDefinitions("species")).toHaveLength(1);
    expect(getDefinition("species", "yuki")?.name).toBe("Yuki-onna");
  });

  it("keeps domains separate", () => {
    registerDefinition("trait", {
      id: "yuki",
      name: "Yuki",
      description: "Same id, different domain.",
    });

    expect(isKnownDefinitionId("trait", "yuki")).toBe(true);
    expect(isKnownDefinitionId("species", "yuki")).toBe(false);
  });

  it.each(validDefinitions())("works in the %s domain", (domain, definition) => {
    /*
     * A real definition per domain, cloned from authored content. A generic
     * { id, name, description } is valid in none of them now — a Skill needs
     * an application, a Reference Form a rooted part graph, an Anatomical
     * Point a category — and inventing eleven fixtures by hand would be
     * eleven quiet copies of rules that live somewhere else.
     */
    const result = registerDefinition(domain, definition as never);

    expect(result).toEqual({ ok: true });
    expect(isKnownDefinitionId(domain, "house-rule")).toBe(true);
  });
});

describe("unregisterDefinition", () => {
  it("removes a custom definition", () => {
    registerDefinition("species", YUKI);

    expect(unregisterDefinition("species", "yuki")).toBe(true);
    expect(isKnownDefinitionId("species", "yuki")).toBe(false);
  });

  it("cannot remove an authored definition", () => {
    expect(unregisterDefinition("species", "human")).toBe(false);
    expect(isKnownDefinitionId("species", "human")).toBe(true);
  });
});

describe("exportCustomDefinitions", () => {
  it("round-trips what the host registered", () => {
    registerDefinition("species", YUKI);
    registerDefinition("clan", {
      id: "kurta",
      name: "Kurta",
      description: "A test Clan.",
    });

    const exported = exportCustomDefinitions();

    expect(exported.species).toEqual([YUKI]);
    expect(exported.clan.map((entry) => entry.id)).toEqual(["kurta"]);
    expect(exported.trait).toEqual([]);
  });
});

/*
 * Cross-catalog references are the check that keeps data-driven content
 * honest. A Trait granting a Skill and a Skill requiring a Technique are both
 * claims about another catalog, and neither domain can verify its own.
 */
describe("findCatalogReferenceIssues", () => {
  it("passes over the authored catalogs", () => {
    expect(findCatalogReferenceIssues()).toEqual([]);
  });

  it("reports a grant pointing at a Skill that does not exist", () => {
    registerDefinition("trait", {
      id: "spider-mutation",
      name: "Spider Mutation",
      description: "A test Trait.",
      effects: [{ type: "grantSkill", skillId: "wall-stickng" }],
    });

    expect(findCatalogReferenceIssues()).toEqual([
      expect.stringContaining('grants unknown Skill "wall-stickng"'),
    ]);
  });

  it("reports a requirement pointing at a Technique that does not exist", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "riposte",
      name: "Riposte",
      description: "A test Skill.",
      mastery: { maximumMastery: 10 },
      requirements: [
        { type: "techniqueMastery", techniqueId: "swordsmanshp", minimumMastery: 4 },
      ],
    });

    expect(findCatalogReferenceIssues()).toEqual([
      expect.stringContaining('requires unknown Technique "swordsmanshp"'),
    ]);
  });

  it("looks inside compound requirements", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "twin-strike",
      name: "Twin Strike",
      description: "A test Skill.",
      mastery: { maximumMastery: 10 },
      requirements: [
        {
          type: "all",
          requirements: [
            { type: "hasTechnique", techniqueId: "martial-arts" },
            {
              type: "any",
              requirements: [
                { type: "hasTrait", traitId: "ambidextrous" },
                { type: "hasTrait", traitId: "one-armed" },
              ],
            },
          ],
        },
      ],
    });

    expect(findCatalogReferenceIssues()).toEqual([
      expect.stringContaining('requires unknown Trait "ambidextrous"'),
    ]);
  });

  it("checks the ranks of a Mastery track, not only the definition", () => {
    registerDefinition("technique", {
      id: "swordsmanship",
      name: "Swordsmanship",
      description: "A test Technique.",
      mastery: {
        maximumMastery: 10,
        ranks: [
          { rank: 1, effects: [{ type: "grantSkill", skillId: "direct-thrust" }] },
        ],
      },
    });

    expect(findCatalogReferenceIssues()).toEqual([
      expect.stringContaining('(rank 1) grants unknown Skill "direct-thrust"'),
    ]);
  });

  // Conditions and injuries progress through stages rather than Mastery
  // ranks, but the cross-reference walk is the same machinery.
  it("checks the stages of a Condition's progression, not only the definition", () => {
    registerDefinition("condition", {
      id: "worsening-curse",
      name: "Worsening Curse",
      description: "A test Condition.",
      stages: [
        {
          stage: 2,
          effects: [{ type: "grantTrait", traitId: "cursed-mark" }],
        },
      ],
    });

    expect(findCatalogReferenceIssues()).toEqual([
      expect.stringContaining('(stage 2) grants unknown Trait "cursed-mark"'),
    ]);
  });

  it("checks both halves of an Item's rules", () => {
    registerDefinition("item", {
      id: "spirit-blade",
      inventoryMode: "individual",
      shuInteraction: "compatible",
      name: "Spirit Blade",
      description: "A test Item.",
      equippedEffects: [
        { type: "grantTechnique", techniqueId: "spirit-forms" },
      ],
      equipRequirements: [
        {
          id: "spirit-touched",
          requirement: { type: "hasTrait", traitId: "spirit-touched" },
          summary: "The blade answers only to the spirit-touched.",
        },
      ],
    });

    expect(findCatalogReferenceIssues()).toEqual(
      expect.arrayContaining([
        expect.stringContaining('grants unknown Technique "spirit-forms"'),
        expect.stringContaining('requires unknown Trait "spirit-touched"'),
      ]),
    );
  });

  it("checks the references inside an Item's named use requirements", () => {
    /*
     * An Item with ONLY a use gate, deliberately. The walk used to recognise
     * an Item by its Effect lists and its equip gate, so a definition like
     * this fell through to the generic walk, which looks for `requirements`
     * and found nothing to check.
     */
    const result = registerDefinition("item", {
      id: "spirit-key",
      inventoryMode: "individual",
      shuInteraction: "compatible",
      name: "Spirit Key",
      description: "A test Item.",
      useRequirements: [
        {
          id: "spirit-touched",
          requirement: { type: "hasTrait", traitId: "spirit-touched" },
          summary: "The key turns only for the spirit-touched.",
        },
        {
          id: "moonless-or-one-armed",
          requirement: {
            type: "any",
            requirements: [
              { type: "hasClan", clanId: "moonless" },
              { type: "hasTrait", traitId: "one-armed" },
            ],
          },
        },
      ],
    });

    expect(result.ok).toBe(true);

    expect(findCatalogReferenceIssues()).toEqual([
      expect.stringContaining('Item "spirit-key" (used) requires unknown Trait "spirit-touched"'),
      expect.stringContaining('Item "spirit-key" (used) requires unknown Clan "moonless"'),
    ]);
  });

  it("refuses a use gate whose requirements cannot be told apart", () => {
    const result = registerDefinition("item", {
      id: "spirit-key",
      inventoryMode: "individual",
      shuInteraction: "compatible",
      name: "Spirit Key",
      description: "A test Item.",
      useRequirements: [
        { id: "same", requirement: { type: "hasTrait", traitId: "one-armed" } },
        { id: "same", requirement: { type: "levelMinimum", minimum: 2 } },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason)
      .toContain("duplicate-named-requirement-id at used[1].id");
    expect(isKnownDefinitionId("item", "spirit-key")).toBe(false);
  });

  it("refuses a use requirement with a blank id or an empty summary", () => {
    for (const entry of [
      { id: "   ", requirement: { type: "hasTrait", traitId: "one-armed" } },
      { id: "ok", summary: "", requirement: { type: "hasTrait", traitId: "one-armed" } },
    ]) {
      const result = registerDefinition("item", {
        id: "spirit-key",
        inventoryMode: "individual",
        shuInteraction: "compatible",
        name: "Spirit Key",
        description: "A test Item.",
        useRequirements: [entry] as never,
      });

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason)
        .toMatch(/invalid-named-requirement-(id|summary)/);
    }
  });

  it("refuses a malformed named list rather than reading it as an empty one", () => {
    for (const useRequirements of [{}, null, 42, "requires-awakening", [null], [42]]) {
      const result = registerDefinition("item", {
        id: "spirit-key",
        inventoryMode: "individual",
        shuInteraction: "compatible",
        name: "Spirit Key",
        description: "A test Item.",
        useRequirements: useRequirements as never,
      });

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason)
        .toContain("malformed-named-requirement");
    }
  });

  it("refuses a structurally malformed rule at registration", () => {
    /*
     * This used to register the Trait and then assert that catalog validation
     * complained about it. The registration barrier makes that impossible, and
     * the impossibility is the improvement: malformed content is refused
     * before it can be referenced, so the fault is reported to whoever offered
     * it rather than to whoever later resolved a character carrying it.
     */
    const result = registerDefinition("trait", {
      id: "broken",
      name: "Broken",
      description: "A test Trait.",
      effects: [
        { type: "modifyBaseAttribute", attribute: "agi", amount: Number.NaN },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason)
      .toContain("invalid-effect-amount");

    expect(isKnownDefinitionId("trait", "broken")).toBe(false);
  });

  it("reports a missing reference, and still lets content refer forward", () => {
    /*
     * The half the registration barrier deliberately does NOT take over.
     *
     * A structurally sound definition registers even though the id it names
     * does not exist yet, because content legitimately refers forward: a Clan
     * may grant a Technique registered a moment later, and refusing it at
     * registration would make load order a rule nobody authored. So existence
     * is checked after every catalog has loaded, and the complaint disappears
     * when the thing it named turns up.
     */
    expect(registerDefinition("trait", {
      id: "initiate",
      name: "Initiate",
      description: "A test Trait granting a Technique registered later.",
      effects: [{ type: "grantTechnique", techniqueId: "late-arrival" }],
    }).ok).toBe(true);

    expect(findCatalogReferenceIssues()).toEqual([
      expect.stringContaining('grants unknown Technique "late-arrival"'),
    ]);

    expect(registerDefinition("technique", {
      id: "late-arrival",
      name: "Late Arrival",
      description: "A test Technique.",
      mastery: { maximumMastery: 3 },
    }).ok).toBe(true);

    expect(findCatalogReferenceIssues()).toEqual([]);
  });

  // Content is resolvable the moment it is registered, so a reference to
  // another custom definition is as valid as one to an authored definition.
  it("accepts a reference between two registered definitions", () => {
    registerDefinition("skill", {
      application: minimalSkillApplication(),
      id: "wall-sticking",
      name: "Wall Sticking",
      description: "A test Skill.",
      mastery: { maximumMastery: 3 },
    });

    registerDefinition("trait", {
      id: "spider-mutation",
      name: "Spider Mutation",
      description: "A test Trait.",
      effects: [{ type: "grantSkill", skillId: "wall-sticking" }],
    });

    expect(findCatalogReferenceIssues()).toEqual([]);
  });
});

describe("character validation against custom definitions", () => {
  it("accepts a character built from a registered Species", () => {
    registerDefinition("species", YUKI);

    const result = validateCharacter(
      createTestCharacter({
        species: [
          { speciesId: "human", percentage: 50 },
          { speciesId: "yuki", percentage: 50 },
        ],
      }),
    );

    expect(result.success).toBe(true);
  });

  // The host is responsible for registering before it validates. This is what
  // a sheet looks like when it forgot to.
  it("rejects the same character when the Species was never registered", () => {
    const result = validateCharacter(
      createTestCharacter({
        species: [
          { speciesId: "human", percentage: 50 },
          { speciesId: "yuki", percentage: 50 },
        ],
      }),
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors[0]?.code).toBe("character.species.unknown");
    }
  });
});

/*
 * Tests createDefinitionId: format, uniqueness, and that a generated id is
 * still something register() accepts — the same guarantee createCharacterId
 * gives characters, extended to every domain a table can add its own entries
 * to. See character/id.ts for the full rationale.
 */
describe("createDefinitionId", () => {
  it("produces a domain-prefixed, fixed-length, lowercase-alphanumeric id", () => {
    const id = createDefinitionId("species");

    expect(id).toMatch(definitionIdPattern("species"));
    expect(id).toMatch(/^species-[a-z0-9]{16}$/);
  });

  it("is accepted by DEFINITION_ID_PATTERN, the shape register() enforces", () => {
    for (const domain of CATALOG_DOMAINS) {
      expect(createDefinitionId(domain)).toMatch(DEFINITION_ID_PATTERN);
    }
  });

  it("never repeats across a large batch generated back-to-back", () => {
    const ids = new Set<string>();

    for (let i = 0; i < 20_000; i++) {
      ids.add(createDefinitionId("trait"));
    }

    expect(ids.size).toBe(20_000);
  });

  it("does not depend on a name or any argument beyond the domain", () => {
    const a = createDefinitionId("clan");
    const b = createDefinitionId("clan");

    expect(a).not.toBe(b);
  });

  it("registers successfully under its own generated id", () => {
    const id = createDefinitionId("trait");

    const result = registerDefinition("trait", {
      id,
      name: "Generated Trait",
      description: "A trait registered under a random id.",
    });

    expect(result.ok).toBe(true);
    expect(isKnownDefinitionId("trait", id)).toBe(true);
  });
});

/*
 * The concrete regression for "add a Tail with zero engine code": registers
 * a custom "body-part" and "special-point" definition — the same
 * registerDefinition path a GM's homebrew Species goes through — and proves
 * the generic Body mechanics resolve against them exactly like the standard
 * humanoid content, with nothing in anatomy/, body-points/, or
 * critical-points/ needing to change.
 */
describe("registering custom Body content", () => {
  it("a registered Tail BodyPartDefinition and Joint resolve through the ordinary Body pipeline", () => {
    const tailDefinition = {
      id: "tail",
      name: "Tail",
      description: "A homebrew prehensile tail.",
      tags: ["limb"],
      ...TEST_PART_PHYSICALS,
      reference: { ...TEST_PART_PHYSICALS.reference, structuralCapacity: 6 },
    };

    expect(registerDefinition("body-part", tailDefinition)).toEqual({ ok: true });

    const tailBaseJoint = {
      id: "tail-base",
      name: "Tail Base",
      description: "A homebrew Joint hosted by the Tail.",
      categories: ["joint"] as const,
      jointDesignation: { kind: "host" as const },
      placement: { kind: "per-part" as const, selector: { types: ["tail"] } },
    };

    expect(registerDefinition("special-point", tailBaseJoint)).toEqual({ ok: true });

    const anatomy = createAnatomy([
      { id: "torso-1", type: "upper-body", attachment: null },
      { id: "tail-1", type: "tail", attachment: { parentId: "torso-1" } },
    ]);

    const bodyPartDefinitions = listDefinitions("body-part");
    const specialPointDefinitions = listDefinitions("special-point");

    const neutral = { global: NEUTRAL_MORPHOLOGY, local: {} };

    const morphology = resolveMorphology(
      {
        species: neutral,
        age: neutral,
        character: neutral,
        individual: {},
        strengthDevelopmentMuscularity: 1,
        effectLayers: [],
      },
      morphologyTargetsForAnatomy(anatomy),
    );

    const bodyPoints = resolveBodyPoints({
      anatomy,
      definitions: bodyPartDefinitions,
      morphologyByPartId: morphology,
      effectiveScale: 1,
      constitution: 10,
    });
    const tailBP = bodyPoints.parts.find((part) => part.partId === "tail-1");

    expect(tailBP?.maximumBP).toBe(6);

    const criticalPoints = resolveCriticalPoints(
      anatomy,
      bodyPartDefinitions,
      specialPointDefinitions,
    );

    expect(criticalPoints.points.map((point) => point.id)).toContain("tail-base:tail-1");
  });
});


/* -------------------------------------------------------------------------- */
/* Rule bundles                                                               */
/* -------------------------------------------------------------------------- */

describe("collectRuleBundles", () => {
  const NAMED = {
    id: "needs-one-arm",
    requirement: { type: "hasTrait", traitId: "one-armed" },
  };

  const BARE = { type: "levelMinimum", minimum: 2 };

  it("says which form each requirement list is written in", () => {
    const item = collectRuleBundles({
      possessedEffects: [],
      equipRequirements: [NAMED],
      useRequirements: [NAMED],
    });

    expect(item.map((bundle) => [bundle.where, bundle.requirements.kind]))
      .toEqual([
        ["possessed", "bare"],
        ["equipped", "named"],
        ["used", "named"],
      ]);

    const skill = collectRuleBundles({
      requirements: [BARE],
      application: { requirements: [NAMED] },
      mastery: { ranks: [{ rank: 2, requirements: [BARE] }] },
    });

    expect(skill.map((bundle) => [bundle.where, bundle.requirements.kind]))
      .toEqual([
        ["definition", "bare"],
        ["application", "named"],
        ["rank 2", "bare"],
      ]);
  });

  it("keeps a named list exactly as authored, malformed or not", () => {
    for (const entries of [{}, null, [null], [NAMED]]) {
      const used = collectRuleBundles({ useRequirements: entries })
        .find((bundle) => bundle.where === "used");

      expect(used?.requirements).toEqual({ kind: "named", entries });
    }
  });

  it("projects named entries to their trees only when asked", () => {
    const [, equipped] = collectRuleBundles({ equipRequirements: [NAMED] });

    expect(ruleBundleRequirementTrees(equipped!)).toEqual([NAMED.requirement]);

    const [definition] = collectRuleBundles({ requirements: [BARE] });

    expect(ruleBundleRequirementTrees(definition!)).toEqual([BARE]);
  });
});
