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

import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";
import { validDefinitionFor, validDefinitions } from "./fixtures/catalog";

import { findSpeciesCatalogIssues } from "../character/identity/species";
import { findClanCatalogIssues } from "../character/identity/clans";
import { findTraitCatalogIssues } from "../character/identity/traits";
import { findSkillCatalogIssues } from "../character/capabilities/skills";
import { findTechniqueCatalogIssues } from "../character/capabilities/techniques";
import { findConditionCatalogIssues } from "../character/status/conditions";
import { findInjuryCatalogIssues } from "../character/status/injuries";
import {
  findItemCatalogIssues,
  findItemStructuralIssues,
  findItemUseDefinitionIssues,
} from "../character/equipment/index";
import { findItemFamilyCatalogIssues } from "../character/equipment/families";
import { resolveItemUse as resolveItemUseWith } from "../character/equipment/use";
import { findBodyPartCatalogIssues } from "../character/foundation/body/anatomy/body-parts";
import { findReferenceFormCatalogIssues } from "../character/foundation/body/anatomy/reference-forms";
import { findSpecialPointCatalogIssues } from "../character/foundation/body/critical-points/special-points";

import type { CatalogDomain } from "../character/catalogs";
import type { RegistrationResult } from "../infrastructure/registry";
import { validateBodyPartSelector } from "../character/foundation/body/selectors";
import { BODY_PART_STATES } from "../character/foundation/body/anatomy/types";


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
    "item-family": findItemFamilyCatalogIssues,
    "body-part": findBodyPartCatalogIssues,
    "reference-form": findReferenceFormCatalogIssues,
    "special-point": findSpecialPointCatalogIssues,
  };

  return checks[domain]();
}

afterEach(() => {
  clearCustomDefinitions();
});


/*
 * The values a host actually manages to put in a field, drawn from the same
 * list every hostile sweep in this codebase uses so the coverage is comparable
 * across boundaries rather than per-author.
 */
const HOSTILE_VALUES: readonly unknown[] = [
  undefined,
  null,
  "",
  "   ",
  42,
  true,
  {},
  [],
  Number.NaN,
  Number.POSITIVE_INFINITY,
];


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
      shuInteraction: "compatible",
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
        shuInteraction: "compatible",
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

    /*
     * The compound fields that used to THROW rather than refuse. Asserted as
     * refusals here as well as swept for survival above, because "did not
     * throw" is satisfied by a validator that shrugs and accepts — which is
     * how a null Mastery track would have become a Skill with no ranks
     * instead of a Skill nobody can register.
     */
    ["skill", "a null Mastery track", { mastery: null }],
    ["skill", "a null application", { application: null }],
    ["skill", "a Mastery track that is a number", { mastery: 42 }],
    ["technique", "a null Mastery track", { mastery: null }],
    ["technique", "a rank list that is not a list", { mastery: { maximumMastery: 3, ranks: {} } }],
    ["condition", "stages that are not a list", { stages: {} }],
    ["condition", "a null stage", { stages: [null] }],
    ["injury", "a null applicability", { applicability: null }],
    ["injury", "a null recovery", { recovery: null }],
    ["injury", "no recovery at all", { recovery: undefined }],
    ["special-point", "a placement with no selector", { placement: {} }],
    ["body-part", "a repeated tag", { tags: ["limb", "limb"] }],

    /*
     * The four that were ACCEPTED rather than throwing, which is the quieter
     * half of the same problem. Each looked like a validator doing its job and
     * was letting content through.
     */
    [
      "skill",
      "a malformed entry in its rank list",
      { mastery: { maximumMastery: 3, ranks: [null] } },
    ],
    [
      "skill",
      "a rank list entry that is not a rank at all",
      { mastery: { maximumMastery: 3, ranks: [42] } },
    ],
    ["injury", "a recovery contract that answers nothing", { recovery: {} }],
    [
      "injury",
      "a treatmentRequired that is not a yes or a no",
      { recovery: { treatmentRequired: "yes" } },
    ],
    [
      "injury",
      "a BodyPart applicability that is not a selector",
      { applicability: { bodyParts: 42 } },
    ],
    [
      "injury",
      "a BodyPart applicability selector that selects nothing",
      { applicability: { bodyParts: {} } },
    ],

    /* The two reported nested shapes, named rather than left to the sweep. */
    [
      "injury",
      "an applicability id filter that is not a list",
      { applicability: { bodyParts: { ids: 42 } } },
    ],
    [
      "special-point",
      "a placement state filter that is not a list",
      { placement: { kind: "per-part", selector: { states: {} } } },
    ],
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
/* Hostile compound fields                                                    */
/* -------------------------------------------------------------------------- */

/*
 * The domain validators delegate to older ones that were written for typed
 * content, and for a while they cast hostile values across that boundary.
 * `mastery: null`, `application: null`, a non-array `stages`, a missing
 * `recovery` — each reached a validator that read a field off it and threw
 * from inside the function whose job was to complain about that exact fault.
 *
 * A guard that only holds for the values someone thought of is not a guard, so
 * this sweeps every compound field a domain owns rather than the cases that
 * were reported. A domain that gains a field and forgets to guard it fails
 * here.
 */
describe("no domain-owned compound field can throw", () => {
  const COMPOUND_FIELDS: readonly (readonly [CatalogDomain, string])[] = [
    ["skill", "mastery"],
    ["skill", "application"],
    ["technique", "mastery"],
    ["condition", "stages"],
    ["injury", "applicability"],
    ["injury", "recovery"],
    ["injury", "treatmentEffects"],
    ["species", "parentSpeciesId"],
    ["species", "body"],
    ["trait", "parentTraitId"],
    ["trait", "effects"],
    ["item", "inventoryMode"],
    ["item", "possessedEffects"],
    ["item", "equippedEffects"],
    ["item", "equipRequirements"],
    ["item", "useEffects"],
    ["item", "useRequirements"],
    ["item", "consumesOnUse"],
    ["body-part", "tags"],
    ["body-part", "reference"],
    ["body-part", "sensitivity"],
    ["reference-form", "parts"],
    ["special-point", "placement"],
    ["special-point", "categories"],
    ["special-point", "jointDesignation"],
  ];

  it.each(
    COMPOUND_FIELDS.flatMap(([domain, field]) =>
      HOSTILE_VALUES.map((value, index) =>
        [domain, field, index, value] as const
      ),
    ),
  )("survives %s.%s holding hostile value %i", (domain, field, _index, value) => {
    const definition: Record<string, unknown> = {
      ...validDefinitionFor(domain),
      [field]: value,
    };

    /* `undefined` means the field is absent entirely, not present and empty. */
    if (value === undefined) delete definition[field];

    let result: RegistrationResult | undefined;

    expect(() => {
      result = registerDefinition(domain, definition as never);
    }).not.toThrow();

    expect(result).toBeDefined();
  });

  /*
   * The sweep above proves only that nothing throws, and that is ALL it is
   * for.
   *
   * It used to also assert that storage agreed with the verdict, which reads
   * like coverage and is not: register() returns the verdict it just acted on,
   * so the two agree by construction and the assertion could never fail. An
   * aggregate "most were refused" threshold was the same mistake at a
   * distance — it stays green while any one required field is wrongly
   * accepted, which is exactly the failure worth catching.
   *
   * What follows is the honest version: every REQUIRED compound field, with
   * the values it must refuse named one at a time.
   */
  const REQUIRED_REFUSALS: readonly (readonly [CatalogDomain, string, unknown])[] =
    ([
      ["skill", "application"],
      ["injury", "applicability"],
      ["injury", "recovery"],
      ["item", "inventoryMode"],
      ["body-part", "reference"],
      ["body-part", "sensitivity"],
      ["reference-form", "parts"],
      ["special-point", "placement"],
      ["special-point", "categories"],
    ] as const).flatMap(([domain, field]) =>
      [undefined, null, 42, true, "", "   ", Number.NaN, {}].map(
        (value) => [domain, field, value] as const,
      ),
    );

  it.each(REQUIRED_REFUSALS)(
    "refuses %s with a %s of %s",
    (domain, field, value) => {
      const definition: Record<string, unknown> = {
        ...validDefinitionFor(domain),
        [field]: value,
      };

      if (value === undefined) delete definition[field];

      expect(registerDefinition(domain, definition as never).ok).toBe(false);
      expect(getDefinition(domain, "house-rule")).toBeUndefined();
    },
  );

  it("still accepts each of those fields when it is right", () => {
    /*
     * The control the rule above needs. A required-field check that refused
     * every value would satisfy every case in the table and be useless.
     */
    for (const [domain] of COMPOUND_FIELDS) {
      expect(
        registerDefinition(domain, validDefinitionFor(domain) as never).ok,
      ).toBe(true);
    }
  });
});


/* -------------------------------------------------------------------------- */
/* The shared selector boundary                                               */
/* -------------------------------------------------------------------------- */

/*
 * One validator, two registration paths, and a nesting level deeper than the
 * guards that were added first.
 *
 * An Injury's `applicability.bodyParts` and an Anatomical Point's
 * `placement.selector` both end up in validateBodyPartSelector(), which took a
 * typed BodyPartSelector on nothing more than the caller's cast and then
 * measured and iterated every filter inside it without checking. Guarding the
 * OUTER field — "is this an object" — was necessary and not sufficient:
 * `{ ids: 42 }` is an object, and threw on `.length` one level down.
 *
 * Fixed at the selector rather than at either caller, because two guards would
 * be two copies of the same rule and the copies are what drift. Swept through
 * BOTH callers, because a fix at a shared boundary is only worth anything if
 * every path to it is covered.
 */
describe("a nested selector filter can neither throw nor slip through", () => {
  const FILTERS = ["ids", "types", "tags", "states", "tagMode"] as const;

  function withInjurySelector(selector: unknown): Record<string, unknown> {
    return {
      ...validDefinitionFor("injury"),
      applicability: { bodyParts: selector },
    };
  }

  function withPointSelector(selector: unknown): Record<string, unknown> {
    const base = validDefinitionFor("special-point");

    return {
      ...base,
      placement: {
        ...(base["placement"] as Record<string, unknown>),
        selector,
      },
    };
  }

  const PATHS = [
    ["injury", withInjurySelector],
    ["special-point", withPointSelector],
  ] as const;

  it.each(
    PATHS.flatMap(([domain, build]) =>
      FILTERS.flatMap((filter) =>
        HOSTILE_VALUES.map((value, index) =>
          [domain, filter, index, value, build] as const
        ),
      ),
    ),
  )(
    "refuses a %s whose selector %s holds hostile value %i",
    (domain, filter, _index, value, build) => {
      const selector: Record<string, unknown> = { [filter]: value };

      if (value === undefined) delete selector[filter];

      let result: RegistrationResult | undefined;

      expect(() => {
        result = registerDefinition(domain, build(selector) as never);
      }).not.toThrow();

      /*
       * Refusal, not merely survival. Every one of these selectors is either
       * malformed or empty — an absent filter leaves a selector that selects
       * nothing at all — so none of them describes anatomy an Injury could
       * apply to or a point could sit on.
       */
      expect(result?.ok).toBe(false);
      expect(getDefinition(domain, "house-rule")).toBeUndefined();
    },
  );

  it.each(PATHS)("refuses a %s whose selector is not an object", (domain, build) => {
    for (const value of HOSTILE_VALUES) {
      expect(() => registerDefinition(domain, build(value) as never)).not.toThrow();
      expect(registerDefinition(domain, build(value) as never).ok).toBe(false);
    }
  });

  it.each(PATHS)("still accepts a %s with a real selector", (domain, build) => {
    /*
     * The control. Both an explicit `all` and a filtered selector are valid,
     * and a boundary that refused them would satisfy every case above.
     */
    expect(registerDefinition(domain, build({ all: true }) as never).ok).toBe(true);

    expect(
      registerDefinition(domain, build({ types: ["torso"] }) as never).ok,
    ).toBe(true);
  });

  it("tells a malformed filter apart from an empty one", () => {
    /*
     * Different faults with different fixes. `ids: []` is a filter that exists
     * and holds nothing — add an id. `ids: 42` is a caller who did not write a
     * filter — replace the field. Reporting both as "empty" would send an
     * author to do the first when they need the second.
     */
    const empty = validateBodyPartSelector({ ids: [] });
    const malformed = validateBodyPartSelector({ ids: 42 });

    expect(empty.issues.map((issue) => issue.code)).toEqual(["empty-id-filter"]);
    expect(malformed.issues.map((issue) => issue.code)).toEqual(["malformed-filter"]);
  });

  it("reports a state that is not a state, rather than iterating it", () => {
    expect(validateBodyPartSelector({ states: {} }).issues.map((i) => i.code))
      .toEqual(["malformed-filter"]);

    /*
     * A list that is not a list and a list of things that are not states are
     * different faults: the first needs the field replaced, the second needs
     * each entry replaced, and one complaint per bad entry is what says so.
     */
    expect(
      validateBodyPartSelector({ states: [null, null] })
        .issues.map((issue) => issue.code),
    ).toEqual(["invalid-state", "invalid-state"]);

    /* And a real duplicate is still a duplicate. */
    expect(
      validateBodyPartSelector({ states: ["active", "active"] })
        .issues.map((issue) => issue.code),
    ).toEqual(["duplicate-state"]);
  });


  /*
   * SEMANTICS, on top of shape.
   *
   * Each of these validated and was then quietly reinterpreted by matching,
   * which is worse than being refused outright: the content is accepted, runs,
   * and means something the author did not write. `{ all: true, ids: [...] }`
   * selects everything and the ids are dead text; a tagMode of "bogus" falls
   * past the `=== "all"` branch and loosens "has all these tags" into "has any
   * of them"; a state of "bogus" matches nothing a body can be, so a filter
   * that reads as narrow selects nothing at all.
   */
  const SEMANTIC_CASES: readonly (readonly [string, unknown, string])[] = [
    ["all combined with a filter", { all: true, ids: ["arm-1"] }, "all-with-filters"],
    ["all combined with types", { all: true, types: ["torso"] }, "all-with-filters"],
    ["all combined with a tagMode", { all: true, tagMode: "any" }, "all-with-filters"],
    ["an all that is not a boolean", { all: 42, types: ["torso"] }, "invalid-all"],
    ["an all of \"no\"", { all: "no", types: ["torso"] }, "invalid-all"],
    ["a tagMode outside the vocabulary", { tags: ["limb"], tagMode: "bogus" }, "invalid-tag-mode"],
    ["a tagMode of ALL in the wrong case", { tags: ["limb"], tagMode: "All" }, "invalid-tag-mode"],
    ["a state outside the vocabulary", { states: ["bogus"] }, "invalid-state"],
    ["a state that is nearly right", { states: ["archived"] }, "invalid-state"],
  ];

  it.each(SEMANTIC_CASES)("refuses %s", (_label, selector, code) => {
    expect(validateBodyPartSelector(selector).issues.map((issue) => issue.code))
      .toContain(code);
  });

  it.each(
    PATHS.flatMap(([domain, build]) =>
      SEMANTIC_CASES.map(([label, selector]) =>
        [domain, label, selector, build] as const
      ),
    ),
  )(
    "refuses a %s registered with %s",
    (domain, _label, selector, build) => {
      /*
       * Through REGISTRATION, not only through the validator. The selector is
       * two levels down inside an Injury's applicability and an Anatomical
       * Point's placement, and a rule that only holds when called directly is
       * a rule neither of those paths has.
       */
      const result = registerDefinition(domain, build(selector) as never);

      expect(result.ok).toBe(false);
      expect(getDefinition(domain, "house-rule")).toBeUndefined();
    },
  );

  const VALID_SELECTORS: readonly (readonly [string, unknown])[] = [
    ["a bare all", { all: true }],
    ["an explicit all: false beside a filter", { all: false, types: ["torso"] }],
    ["a tagMode of all", { tags: ["limb"], tagMode: "all" }],
    ["a tagMode of any", { tags: ["limb"], tagMode: "any" }],
    ["tags with no tagMode at all", { tags: ["limb"] }],
    ["every real BodyPart state", { states: [...BODY_PART_STATES] }],
    ["one real state", { states: ["suppressed"] }],
  ];

  it.each(VALID_SELECTORS)("still accepts %s", (_label, selector) => {
    expect(validateBodyPartSelector(selector).valid).toBe(true);
  });

  it.each(
    PATHS.flatMap(([domain, build]) =>
      VALID_SELECTORS.map(([label, selector]) =>
        [domain, label, selector, build] as const
      ),
    ),
  )(
    "still registers a %s with %s",
    (domain, _label, selector, build) => {
      /*
       * The controls, through the same two paths. Without them every rule
       * above would be satisfied by a validator that refused everything.
       */
      expect(registerDefinition(domain, build(selector) as never).ok).toBe(true);
    },
  );
});


/* -------------------------------------------------------------------------- */
/* Body topology                                                              */
/* -------------------------------------------------------------------------- */

/*
 * "Exactly one root" is not acyclicity, and the gap is not hypothetical.
 *
 * A form with a perfectly good root plus two slots parented to each other has
 * one root and no dangling parent reference, and is still two disconnected
 * components with a cycle in the second. A slot parented to itself passes both
 * checks the same way. Every slot has to actually REACH the root.
 */
describe("a Reference Form is a tree, not merely rooted", () => {
  function joint(parentSlotId: string): Record<string, unknown> {
    return { parentSlotId, parentPosition: 0.5, childPosition: 0.5 };
  }

  function part(
    slotId: string,
    attachment: Record<string, unknown> | null,
  ): Record<string, unknown> {
    return {
      slotId,
      type: "torso",
      continuityKey: `torso:${slotId}`,
      attachment,
    };
  }

  function formWith(parts: readonly Record<string, unknown>[]) {
    return registerDefinition("reference-form", {
      ...validDefinitionFor("reference-form"),
      parts,
    } as never);
  }

  it("refuses a valid root beside a disconnected cycle", () => {
    const result = formWith([
      part("root", null),
      part("left", joint("right")),
      part("right", joint("left")),
    ]);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("loops");

    expect(getDefinition("reference-form", "house-rule")).toBeUndefined();
  });

  it("refuses a self-parenting non-root slot", () => {
    const result = formWith([
      part("root", null),
      part("loop", joint("loop")),
    ]);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("loops");
  });

  it("refuses a longer cycle that still has a root", () => {
    const result = formWith([
      part("root", null),
      part("a", joint("b")),
      part("b", joint("c")),
      part("c", joint("a")),
    ]);

    expect(result.ok).toBe(false);
  });

  it("refuses two slots claiming one continuity identity", () => {
    /*
     * A continuity key is what makes two forms comparable — a Wolf's
     * front-right leg and a Human's right arm are the same identity said
     * twice. Repeating one inside a single form makes that identity ambiguous
     * in the one place it must not be: an Injury names continuity keys and a
     * transformation matches on them, so two slots claiming one identity is a
     * fracture that could be on either limb with no way to say which.
     */
    const result = registerDefinition("reference-form", {
      ...validDefinitionFor("reference-form"),
      parts: [
        { ...part("root", null), continuityKey: "upper-limb:right" },
        { ...part("arm", joint("root")), continuityKey: "upper-limb:right" },
      ],
    } as never);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason)
      .toContain("continuity identity");

    expect(getDefinition("reference-form", "house-rule")).toBeUndefined();
  });

  it.each(["   ", "", 42, null, true])(
    "refuses an attachment site of %s",
    (site) => {
      /*
       * Optional, and constrained when present. A blank site prints as nothing
       * and matches nothing, which is indistinguishable from having declared
       * no site — except that the author believed they had.
       */
      const result = formWith([
        part("root", null),
        { ...part("arm", joint("root")), attachment: { ...joint("root"), site } },
      ]);

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toContain("attachment site");
    },
  );

  it("accepts an attachment that names a real site, and one that names none", () => {
    expect(formWith([
      part("root", null),
      { ...part("arm", joint("root")), attachment: { ...joint("root"), site: "shoulder" } },
    ]).ok).toBe(true);

    expect(formWith([part("root", null), part("arm", joint("root"))]).ok)
      .toBe(true);
  });

  it("accepts a real tree, including one authored out of order", () => {
    /*
     * The positive control, and the case that would break a naive fix: order
     * within a form carries no meaning, so a child may be listed before the
     * parent it hangs from.
     */
    expect(formWith([
      part("hand", joint("arm")),
      part("arm", joint("root")),
      part("root", null),
    ]).ok).toBe(true);
  });
});


/* -------------------------------------------------------------------------- */
/* Body measurements                                                          */
/* -------------------------------------------------------------------------- */

describe("a BodyPart's own invariants", () => {
  function bodyPartWith(overrides: Record<string, unknown>) {
    return registerDefinition("body-part", {
      ...validDefinitionFor("body-part"),
      ...overrides,
    } as never);
  }

  it("refuses a repeated tag", () => {
    /*
     * Tags are membership, and every consumer asks "does this part have X".
     * A duplicate means the author meant two tags and wrote one twice, or
     * believed repetition carried weight — neither is what the list does.
     */
    const result = bodyPartWith({ tags: ["limb", "limb"] });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("more than once");
  });

  it.each([0, 2, -2, 0.5, Number.NaN, "1", null])(
    "refuses a heightAxisSign of %s",
    (heightAxisSign) => {
      const reference = {
        ...(validDefinitionFor("body-part")["reference"] as Record<string, unknown>),
        heightAxisSign,
      };

      const result = bodyPartWith({ reference });

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toContain("heightAxisSign");
    },
  );

  it.each([1, -1])("accepts a heightAxisSign of %s", (heightAxisSign) => {
    const reference = {
      ...(validDefinitionFor("body-part")["reference"] as Record<string, unknown>),
      heightAxisSign,
    };

    expect(bodyPartWith({ reference }).ok).toBe(true);
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


/* -------------------------------------------------------------------------- */
/* Item use: one verdict, two doors                                           */
/* -------------------------------------------------------------------------- */

/*
 * A definition reaches Item use through two doors. Registration is one; the
 * unbound resolver, handed a lookup by a host or a test, is the other — and the
 * engine's own authored catalog is never registered, so the barrier alone does
 * not cover it.
 *
 * The property worth testing is PARITY, not either side of it. A test of the
 * resolver alone would pass again the day a use rule was added to registration
 * only, which is exactly how the equip transition and the catalog once came to
 * disagree about a stackable Item.
 */
describe("registration and Item use refuse the same use surfaces", () => {
  const NEEDS_ONE_ARM = { type: "hasTrait", traitId: "one-armed" } as const;

  const MALFORMED_USE: readonly (readonly [string, Record<string, unknown>])[] = [
    ["a consumesOnUse that is a string", { consumesOnUse: "true" }],
    ["a consumesOnUse that is a number", { consumesOnUse: 1 }],
    ["a consumesOnUse that is null", { consumesOnUse: null }],
    ["a consumesOnUse that is an object", { consumesOnUse: {} }],
    ["use Effects that are not a list", { useEffects: {} }],
    ["a null use Effect", { useEffects: [null] }],
    [
      "a use Effect with an amount that is not a number",
      {
        useEffects: [
          { type: "modifyResolvedAttribute", attribute: "wis", amount: Number.NaN },
        ],
      },
    ],
    ["a use Effect nothing recognises", { useEffects: [{ type: "modifyMorale" }] }],
    ["use requirements that are not a list", { useRequirements: {} }],
    ["use requirements that are null", { useRequirements: null }],
    ["a null use requirement", { useRequirements: [null] }],
    ["a BARE use requirement", { useRequirements: [NEEDS_ONE_ARM] }],
    [
      "a use requirement with a blank id",
      { useRequirements: [{ id: "  ", requirement: NEEDS_ONE_ARM }] },
    ],
    [
      "two use requirements sharing an id",
      {
        useRequirements: [
          { id: "same", requirement: NEEDS_ONE_ARM },
          { id: "same", requirement: { type: "levelMinimum", minimum: 2 } },
        ],
      },
    ],
    [
      "a use requirement with an empty summary",
      { useRequirements: [{ id: "x", summary: "", requirement: NEEDS_ONE_ARM }] },
    ],
    [
      "a use requirement whose rule is null",
      { useRequirements: [{ id: "x", requirement: null }] },
    ],
    [
      "a use requirement compound with no children",
      { useRequirements: [{ id: "x", requirement: { type: "all" } }] },
    ],
  ];

  const SOUND_USE: readonly (readonly [string, Record<string, unknown>])[] = [
    ["no use surface at all", {}],
    ["an explicit reusable declaration", { consumesOnUse: false }],
    ["an empty use Effect list", { useEffects: [] }],
    ["an empty use gate", { useRequirements: [] }],
    ["a consumable with nothing else", { consumesOnUse: true }],
    [
      "a named use gate with a summary",
      {
        useRequirements: [
          { id: "needs-one-arm", summary: "One-armed only.", requirement: NEEDS_ONE_ARM },
        ],
      },
    ],
    [
      "a use Effect",
      {
        useEffects: [
          { type: "modifyResolvedAttribute", attribute: "wis", amount: 1 },
        ],
      },
    ],
  ];

  function definitionWith(fields: Record<string, unknown>): Record<string, unknown> {
    return { ...validDefinitionFor("item"), ...fields };
  }

  function useWith(definition: unknown) {
    const character = createTestCharacter({
      items: [
        { entryId: "e1", itemId: "house-rule", quantity: 1, state: "carried" },
      ],
    });

    return resolveItemUseWith(
      {
        resolved: {
          ...resolveTestCharacter(createTestCharacter()),
          character,
        },
        item: { characterId: character.id, entryId: "e1" },
      },
      () => definition as never,
    );
  }

  it.each(MALFORMED_USE)("refuses %s through both doors", (_label, fields) => {
    const definition = definitionWith(fields);

    /* 1. It never enters a catalog... */
    expect(registerDefinition("item", definition as never).ok).toBe(false);
    expect(getDefinition("item", "house-rule")).toBeUndefined();

    /* 2. ...the use validator says why, as does the whole-Item one... */
    expect(findItemUseDefinitionIssues(definition)).not.toEqual([]);
    expect(findItemStructuralIssues(definition)).not.toEqual([]);

    /* 3. ...and a resolver handed it anyway still refuses it. */
    const result = useWith(definition);

    expect(result.success).toBe(false);
    expect(!result.success && result.errors[0].code)
      .toBe("equipment.use.definition_invalid");
  });

  it.each(SOUND_USE)("accepts %s through both doors", (_label, fields) => {
    const definition = definitionWith(fields);

    expect(findItemUseDefinitionIssues(definition)).toEqual([]);
    expect(registerDefinition("item", definition as never).ok).toBe(true);

    const result = useWith(definition);

    expect(result.success).toBe(true);
  });

  it("has no use rule that only one door knows", () => {
    /*
     * The tables above can only test the faults somebody listed. This asks the
     * question the other way round, over every hostile value in every use
     * field: whatever registration decides, the use validator decides too.
     */
    for (const field of ["useEffects", "useRequirements", "consumesOnUse"]) {
      for (const value of HOSTILE_VALUES) {
        const definition = definitionWith({ [field]: value });

        if (value === undefined) delete definition[field];

        const registered = registerDefinition("item", definition as never).ok;
        const useIsClean = findItemUseDefinitionIssues(definition).length === 0;

        expect({ field, value, useIsClean }).toEqual({
          field,
          value,
          useIsClean: registered,
        });

        expect(useWith(definition).success).toBe(registered);

        clearCustomDefinitions();
      }
    }
  });
});
