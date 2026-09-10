/*
 * Malformed content is refused at the door.
 *
 * The engine used to accept any structurally-typed definition a host offered
 * and discover the problem later, somewhere else. That "later" was not a
 * diagnostic: `resolveRuleEffects()` ends its switch with a deliberate `never`
 * exhaustiveness guard, so an Item registered with `possessedEffects: [{ type:
 * "bogus" }]` made resolveCharacter() THROW for anyone carrying it — not
 * return an EngineFailure, throw. The fault surfaced three layers from the
 * mistake, addressed to whoever happened to resolve a character rather than to
 * whoever wrote the content.
 *
 * The guard is not the thing to fix. It exists because ten Body effect
 * variants were once added and silently dropped, and softening it into a skip
 * would delete that protection to paper over a different problem. What was
 * missing is a barrier: a definition whose rules are malformed should never
 * become something a character can reference.
 *
 * Three properties, and the third is the one that is easy to get wrong.
 *
 * REFUSED means nothing was stored. A refusal that left a half-registered
 * entry behind would be worse than no barrier at all.
 *
 * ATOMIC means a refused REPLACEMENT leaves the previous definition intact.
 * Re-registering an existing custom id is an edit, so a validate-after-write —
 * or a write followed by a later failing check — would let a host correcting a
 * typo lose the entry it was correcting and end up with neither version.
 *
 * FORWARD REFERENCES still work. The barrier checks structure, never
 * existence: a Trait may grant a Technique registered a moment later, and
 * making load order a rule would break content nobody wrote wrong.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  clearCustomDefinitions,
  findCatalogReferenceIssues,
  getDefinition,
  isKnownDefinitionId,
  registerDefinition,
} from "../character/catalogs";

import { resolveCharacter } from "../character/resolution";

import { createTestCharacter } from "./fixtures/character";
import { validDefinitionFor, validDefinitions } from "./fixtures/catalog";

import { findSpeciesCatalogIssues } from "../character/identity/species";
import { findClanCatalogIssues } from "../character/identity/clans";
import { findTraitCatalogIssues } from "../character/identity/traits";
import { findSkillCatalogIssues } from "../character/capabilities/skills";
import { findTechniqueCatalogIssues } from "../character/capabilities/techniques";
import { findConditionCatalogIssues } from "../character/status/conditions";
import { findInjuryCatalogIssues } from "../character/status/injuries";
import { findItemCatalogIssues } from "../character/equipment/index";
import { findBodyPartCatalogIssues } from "../character/foundation/body/anatomy/body-parts";
import { findReferenceFormCatalogIssues } from "../character/foundation/body/anatomy/reference-forms";
import { findSpecialPointCatalogIssues } from "../character/foundation/body/critical-points/special-points";

import type { CatalogDomain } from "../character/catalogs";
import type { RegistrationResult } from "../infrastructure/registry";


/* Each domain's own catalog check, so "clean" means clean to its owner. */
function findCatalogIssuesFor(domain: CatalogDomain): readonly string[] {
  const checks: Record<CatalogDomain, () => readonly string[]> = {
    species: findSpeciesCatalogIssues,
    clan: findClanCatalogIssues,
    trait: findTraitCatalogIssues,
    skill: findSkillCatalogIssues,
    technique: findTechniqueCatalogIssues,
    condition: findConditionCatalogIssues,
    injury: findInjuryCatalogIssues,
    item: findItemCatalogIssues,
    "body-part": findBodyPartCatalogIssues,
    "reference-form": findReferenceFormCatalogIssues,
    "special-point": findSpecialPointCatalogIssues,
  };

  return checks[domain]();
}

afterEach(() => {
  clearCustomDefinitions();
});


const SOUND_TRAIT = {
  id: "steady-hand",
  name: "Steady Hand",
  description: "A test Trait that is entirely well formed.",
  effects: [{ type: "modifyBaseAttribute", attribute: "dex", amount: 1 }],
} as const;


/* -------------------------------------------------------------------------- */
/* Refusal                                                                    */
/* -------------------------------------------------------------------------- */

describe("a malformed definition is refused and stores nothing", () => {
  const MALFORMED: readonly (readonly [string, Record<string, unknown>])[] = [
    [
      "an Effect discriminant nothing recognises",
      { effects: [{ type: "bogus" }] },
    ],
    [
      "an Effect that is null",
      { effects: [null] },
    ],
    [
      "an effects field that is not a list",
      { effects: {} },
    ],
    [
      "a non-finite Attribute amount",
      {
        effects: [
          { type: "modifyBaseAttribute", attribute: "dex", amount: Number.NaN },
        ],
      },
    ],
    [
      "a modifyCheck with no check",
      { effects: [{ type: "modifyCheck", amount: 1 }] },
    ],
    [
      "a misspelled check activation",
      {
        effects: [
          {
            type: "modifyCheck",
            check: { kind: "attribute", attribute: "agi" },
            amount: 1,
            activation: "persistant",
          },
        ],
      },
    ],
    [
      "a requirement that is null",
      { requirements: [null] },
    ],
    [
      "a compound requirement with no children",
      { requirements: [{ type: "all" }] },
    ],
    [
      "a requirement naming no id",
      { requirements: [{ type: "hasTrait" }] },
    ],
  ];

  it.each(MALFORMED)("refuses %s", (_label, fields) => {
    const result = registerDefinition("trait", {
      id: "malformed",
      name: "Malformed",
      description: "A test Trait.",
      ...fields,
    } as never);

    expect(result.ok).toBe(false);

    /* And the refusal says what is wrong, not merely that something is. */
    expect(result.ok === false && result.reason.length).toBeGreaterThan(20);

    expect(isKnownDefinitionId("trait", "malformed")).toBe(false);
    expect(getDefinition("trait", "malformed")).toBeUndefined();
  });

  it("cannot later reach resolveCharacter()", () => {
    /*
     * The end-to-end claim, and the reason the barrier exists. Effect
     * resolution still throws on an unrecognised discriminant — on purpose —
     * so the only protection is that such content never gets into a catalog.
     */
    registerDefinition("item", {
      id: "bogus-charm",
      name: "Bogus Charm",
      description: "A test Item with an Effect the engine has never heard of.",
      inventoryMode: "individual",
      possessedEffects: [{ type: "bogus" }],
    } as never);

    expect(isKnownDefinitionId("item", "bogus-charm")).toBe(false);

    const carrying = createTestCharacter({
      items: [
        {
          entryId: "e1",
          itemId: "bogus-charm",
          quantity: 1,
          state: "carried",
        },
      ],
    });

    /*
     * Resolution does not throw, because the Item is not there to resolve. An
     * unknown reference is an ordinary validation problem with an ordinary
     * answer.
     */
    expect(() => resolveCharacter(carrying)).not.toThrow();
    expect(resolveCharacter(carrying).success).toBe(true);
  });

  it("refuses a definition that is not an object at all", () => {
    for (const value of [undefined, null, "", 42, true, []]) {
      expect(() => registerDefinition("trait", value as never)).not.toThrow();
      expect(registerDefinition("trait", value as never).ok).toBe(false);
    }
  });

  /*
   * The positive control, and it has to be a REAL definition per domain.
   *
   * A generic { id, name, description } is valid in no domain now: a Skill
   * needs an application, a Reference Form needs a rooted part graph, an
   * Anatomical Point needs a category. Asserting the barrier accepts nothing
   * would be easy to pass by accident, which is why each fixture is cloned
   * from authored content rather than invented — see fixtures/catalog.ts.
   */
  it.each(validDefinitions())("accepts sound %s content", (domain, definition) => {
    const result = registerDefinition(domain, definition as never);

    expect(result).toEqual({ ok: true });
    expect(isKnownDefinitionId(domain, "house-rule")).toBe(true);
  });

  it.each(validDefinitions())(
    "leaves the %s catalog clean after registering it",
    (domain, definition) => {
      /*
       * Registration and catalog validation are the same rules asked at two
       * moments, so anything the barrier accepts must survive the second
       * asking. A disagreement between them would mean content that registers
       * and then reports itself broken forever.
       */
      expect(registerDefinition(domain, definition as never).ok).toBe(true);
      expect(findCatalogIssuesFor(domain)).toEqual([]);
    },
  );
});


/* -------------------------------------------------------------------------- */
/* Identity and naming                                                        */
/* -------------------------------------------------------------------------- */

describe("the universal fields are checked before the domain's own", () => {
  it.each([
    ["missing", undefined],
    ["null", null],
    ["a number", 42],
    ["an object", {}],
    ["empty", ""],
    ["blank", "   "],
  ])("refuses a %s description", (_label, description) => {
    const definition = {
      ...validDefinitionFor("trait"),
      description,
    };

    let result: RegistrationResult | undefined;

    expect(() => {
      result = registerDefinition("trait", definition as never);
    }).not.toThrow();

    expect(result).toBeDefined();

    expect(result?.ok).toBe(false);
    expect(result?.ok === false && result.reason).toContain("needs a description");

    expect(isKnownDefinitionId("trait", "house-rule")).toBe(false);
  });

  it("refuses a blank name the same way", () => {
    const result = registerDefinition("trait", {
      ...validDefinitionFor("trait"),
      name: "   ",
    } as never);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("needs a name");
  });

  it("reports the identity fault rather than the domain's", () => {
    /*
     * Order, not merely coverage. A definition with no id AND three malformed
     * Effects produces a complaint nobody can act on if the id is missing from
     * it, so identity is settled first and the domain rules are not even run.
     */
    const result = registerDefinition("trait", {
      id: "NOT VALID",
      name: "Broken",
      description: "A test Trait wrong in two ways at once.",
      effects: [{ type: "bogus" }],
    } as never);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason)
      .toContain("must be lowercase letters");
    expect(result.ok === false && result.reason).not.toContain("bogus");
  });
});


/* -------------------------------------------------------------------------- */
/* Each domain's own structure                                                */
/* -------------------------------------------------------------------------- */

/*
 * Every domain now has local rules of its own, and the barrier is only
 * complete if each of them runs at registration.
 *
 * These were previously reported by catalog validation, AFTER the malformed
 * definition had been stored and could already be referenced by a character.
 * A representative fault per domain, so a domain whose validator is dropped
 * from its registry fails here rather than silently accepting content again.
 */
describe("each domain's local structure is refused at registration", () => {
  const CASES: readonly (readonly [CatalogDomain, string, Record<string, unknown>])[] = [
    ["skill", "no application", { application: undefined }],
    [
      "skill",
      "a Mastery maximum that is not a rank",
      { mastery: { maximumMastery: 12 } },
    ],
    [
      "technique",
      "a rank past its own maximum",
      { mastery: { maximumMastery: 3, ranks: [{ rank: 5 }] } },
    ],
    ["species", "itself as its parent", { parentSpeciesId: "house-rule" }],
    ["trait", "itself as its parent", { parentTraitId: "house-rule" }],
    [
      "injury",
      "a recovery ceiling outside 0..1",
      { recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 3 } },
    ],
    ["injury", "no anatomical applicability", { applicability: {} }],
    ["item", "no inventory mode", { inventoryMode: undefined }],
    [
      "item",
      "passive Effects on a stackable Item",
      {
        inventoryMode: "stackable",
        possessedEffects: [
          { type: "modifyResolvedAttribute", attribute: "cha", amount: -1 },
        ],
      },
    ],
    [
      "body-part",
      "a Volume of zero",
      { reference: { lengthCm: 10, volumeL: 0, surfaceAreaCm2: 10, massKg: 1, structuralCapacity: 1, intrinsicPhysicalForce: 1, heightContribution: 0, heightAxisSign: 1 } },
    ],
    ["reference-form", "no parts", { parts: [] }],
    [
      "reference-form",
      "a part attached to a slot it does not contain",
      {
        parts: [
          {
            slotId: "only",
            type: "torso",
            continuityKey: "torso:only",
            attachment: {
              parentSlotId: "nowhere",
              parentPosition: 0.5,
              childPosition: 0.5,
            },
          },
        ],
      },
    ],
    ["special-point", "no categories", { categories: [] }],
  ];

  it.each(CASES)("refuses a %s with %s", (domain, _label, overrides) => {
    const definition: Record<string, unknown> = {
      ...validDefinitionFor(domain),
      ...overrides,
    };

    /* `undefined` in the override means "remove this field entirely". */
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete definition[key];
    }

    let result: RegistrationResult | undefined;

    expect(() => {
      result = registerDefinition(domain, definition as never);
    }).not.toThrow();

    expect(result?.ok).toBe(false);
    expect(getDefinition(domain, "house-rule")).toBeUndefined();
  });
});


/* -------------------------------------------------------------------------- */
/* Atomicity                                                                  */
/* -------------------------------------------------------------------------- */

describe("a refused replacement leaves the good definition standing", () => {
  it("keeps the previous version when the new one is malformed", () => {
    expect(registerDefinition("trait", SOUND_TRAIT).ok).toBe(true);

    const replacement = registerDefinition("trait", {
      ...SOUND_TRAIT,
      description: "An edit that got the Effect wrong.",
      effects: [
        { type: "modifyBaseAttribute", attribute: "dex", amount: Number.NaN },
      ],
    } as never);

    expect(replacement.ok).toBe(false);

    /*
     * The original is not merely still present — it is UNCHANGED. A barrier
     * that refused the edit and kept the new description would have written
     * half of it.
     */
    expect(getDefinition("trait", "steady-hand")).toEqual(SOUND_TRAIT);
  });

  it("keeps it working, not merely present", () => {
    registerDefinition("trait", SOUND_TRAIT);

    registerDefinition("trait", {
      ...SOUND_TRAIT,
      effects: [{ type: "bogus" }],
    } as never);

    const resolved = resolveCharacter(
      createTestCharacter({ traits: [{ traitId: "steady-hand" }] }),
    );

    expect(resolved.success).toBe(true);
    expect(resolved.success && resolved.payload.attributes.base.dex).toBe(11);
  });

  it("keeps it when the replacement breaks a DOMAIN rule rather than a universal one", () => {
    /*
     * The same property one layer in. A Skill whose replacement carries an
     * impossible Mastery track is refused by the Skill's own validator, and
     * the version already in the catalog has to survive that exactly as it
     * survives a malformed Effect.
     */
    const sound = validDefinitionFor("skill");

    expect(registerDefinition("skill", sound as never).ok).toBe(true);

    const replacement = registerDefinition("skill", {
      ...sound,
      mastery: { maximumMastery: 12 },
    } as never);

    expect(replacement.ok).toBe(false);
    expect(getDefinition("skill", "house-rule")).toEqual(sound);
  });

  it("lets a sound replacement through", () => {
    registerDefinition("trait", SOUND_TRAIT);

    const replacement = {
      ...SOUND_TRAIT,
      effects: [{ type: "modifyBaseAttribute", attribute: "dex", amount: 3 }],
    };

    expect(registerDefinition("trait", replacement as never).ok).toBe(true);
    expect(getDefinition("trait", "steady-hand")).toEqual(replacement);
  });
});


/* -------------------------------------------------------------------------- */
/* What the barrier deliberately does not do                                  */
/* -------------------------------------------------------------------------- */

describe("existence is still checked after every catalog has loaded", () => {
  it("accepts a definition naming something registered later", () => {
    expect(registerDefinition("trait", {
      id: "initiate",
      name: "Initiate",
      description: "A test Trait granting a Technique that arrives later.",
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

    /*
     * The complaint goes when the thing it named turns up. Refusing the first
     * registration would have made load order a rule nobody authored, and a
     * host loading its catalog alphabetically would see failures a host
     * loading it in dependency order would not.
     */
    expect(findCatalogReferenceIssues()).toEqual([]);
  });

  it("refuses a definition that is malformed AND names something absent", () => {
    /*
     * Structure is judged now; existence later. Both faults are real, and only
     * the first one gets to stop the registration.
     */
    const result = registerDefinition("trait", {
      id: "doubly-wrong",
      name: "Doubly Wrong",
      description: "A test Trait.",
      effects: [
        { type: "grantTechnique", techniqueId: "" },
        { type: "grantTrait", traitId: "never-registered" },
      ],
    } as never);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason)
      .toContain("missing-effect-reference");
  });
});
