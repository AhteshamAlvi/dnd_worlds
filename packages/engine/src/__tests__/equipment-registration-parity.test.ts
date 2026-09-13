/*
 * The Phase 4 Item and Skill surfaces, at the door and at the resolver.
 *
 * Four tickets added compound fields to `ItemDefinition` and to a Skill's
 * application — `families`, `useApplication`, `attack`, `defense`,
 * `integrity` with its bands, `implements`, `implementConditionalRules` — and
 * each was validated by whoever happened to read it. The registry checked
 * some of them, the direct resolvers checked others, and several were checked
 * by nobody: `families: 42` registered cleanly and then threw inside
 * cross-catalog reference checking, `integrity.bands: [null]` threw inside the
 * validator written to complain about it, and a `useApplication` that was not
 * an object reached `.allowedTimings.length`.
 *
 * Two properties, swept rather than sampled.
 *
 * NOTHING THROWS. Every one of these fields takes whatever a host puts in it,
 * and a validator that only holds for the values somebody thought of is not a
 * validator. The hostile list is the same one every other sweep in this
 * codebase uses, so the coverage is comparable across boundaries.
 *
 * REGISTRATION AND DIRECT RESOLUTION AGREE. A definition the catalog refuses
 * must not be resolvable through a lookup a host supplied instead — that is
 * the whole reason the two paths share validators rather than each having
 * their own. Every new compound field is swept through BOTH.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  clearCustomDefinitions,
  findCatalogReferenceIssues,
  getDefinition,
  registerDefinition,
} from "../character/catalogs";

import {
  buildItemOperationProfile,
  findItemActionSurfaceIssues,
  findItemAttackIssues,
  findItemCatalogIssues,
  findItemDefenseIssues,
  findItemFamilyIssues,
  findItemIntegrityIssues,
  findItemStructuralIssues,
  findItemUseApplicationIssues,
  resolveItemEnvelope,
  resolveItemIntegrityOperation,
  resolveItemPerformanceContribution,
  type ItemDefinition,
} from "../character/equipment/index";
import {
  findImplementConditionalRuleIssues,
  findImplementConditionalRulesIssues,
  findImplementRequirementsIssues,
  resolveSelectedImplements,
} from "../character/equipment/index";
import { findSkillDefinitionStructuralIssues } from "../character/capabilities/skills";
import type { ImplementResolution } from "../character/equipment/implements";
import type { CharacterItem } from "../character/equipment/index";

import { validDefinitionFor } from "./fixtures/catalog";
import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";


afterEach(() => {
  clearCustomDefinitions();
});


/*
 * The values a host actually manages to put in a field. Identical to the list
 * registration-barrier.test.ts sweeps with, deliberately — two hostile lists
 * would eventually diverge and the weaker one would be the one a new field
 * got swept against.
 */
const HOSTILE_VALUES: readonly unknown[] = [
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


/*
 * The two values in that list that are LEGAL in some of these fields.
 *
 * A sweep that demanded every field refuse every hostile value would be
 * asserting something untrue and would have to be weakened the first time
 * somebody authored an empty list. `[]` is a real, meaningful `families`,
 * `implements` or `implementConditionalRules` — the Item claims no family, the
 * application names no roles — and `{}` is a real `attack` or `defense`: every
 * field on a contribution is optional, so one that declares only its existence
 * is an Item that can be selected for a role and brings no Effects to it.
 *
 * Everything else in the list must be refused by every field, including `[]`
 * where a RECORD is wanted and `{}` where a LIST is.
 */
const SOUND_FOR_FIELD: Readonly<Record<string, readonly unknown[]>> = {
  families: [[]],
  implements: [[]],
  implementConditionalRules: [[]],
  attack: [{}],
  defense: [{}],
  useApplication: [],
  integrity: [],
};


function mustRefuse(field: string, value: unknown): boolean {
  return !(SOUND_FOR_FIELD[field] ?? []).some(
    (sound) => JSON.stringify(sound) === JSON.stringify(value),
  );
}


const SOUND_ITEM = {
  id: "test-blade",
  name: "Test Blade",
  description: "A structurally sound Item, for parity sweeps.",
  inventoryMode: "individual",
  shuInteraction: "compatible",
} as const;


function itemWith(fields: Record<string, unknown>): Record<string, unknown> {
  const definition: Record<string, unknown> = { ...SOUND_ITEM, ...fields };

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete definition[key];
  }

  return definition;
}


/** A lookup that answers with whatever a test hands it, malformed or not. */
function lookupOf(definition: unknown) {
  return (): ItemDefinition | undefined => definition as ItemDefinition;
}


function characterHolding(itemId: string): {
  readonly resolved: ReturnType<typeof resolveTestCharacter>;
  readonly entry: CharacterItem;
} {
  const entry: CharacterItem = {
    entryId: "e1",
    itemId,
    quantity: 1,
    state: "held",
  };

  return {
    resolved: resolveTestCharacter(createTestCharacter({ items: [entry] })),
    entry,
  };
}


/* -------------------------------------------------------------------------- */
/* 1. Every new compound field refuses hostile shapes without throwing        */
/* -------------------------------------------------------------------------- */

describe("every new Item surface refuses hostile shapes without throwing", () => {
  const ITEM_FIELDS = [
    "families",
    "useApplication",
    "attack",
    "defense",
    "integrity",
  ] as const;

  it.each(
    ITEM_FIELDS.flatMap((field) =>
      HOSTILE_VALUES.map((value, index) => [field, index, value] as const),
    ),
  )("survives %s holding hostile value %i", (field, _index, value) => {
    const definition = itemWith({ [field]: value });

    expect(() => findItemStructuralIssues(definition)).not.toThrow();
    expect(() => findItemActionSurfaceIssues(definition)).not.toThrow();
    expect(() => registerDefinition("item", definition as never)).not.toThrow();
  });

  it.each(
    ITEM_FIELDS.flatMap((field) =>
      HOSTILE_VALUES.map((value, index) => [field, index, value] as const),
    ),
  )("refuses registration of %s holding hostile value %i", (field, _index, value) => {
    /*
     * REFUSAL, not merely survival. "Did not throw" is satisfied by a
     * validator that shrugs and accepts, which is how `families: 42` used to
     * get into a catalog in the first place.
     */
    const result = registerDefinition("item", itemWith({ [field]: value }) as never);

    expect(result.ok).toBe(mustRefuse(field, value) ? false : true);

    if (mustRefuse(field, value)) {
      expect(getDefinition("item", "test-blade")).toBeUndefined();
    }
  });

  it("still accepts each of those fields when it is right", () => {
    /* The control. A sweep that refused everything would satisfy every case. */
    const sound = itemWith({
      families: ["blunt-weapon"],
      attack: { effects: [] },
      defense: { effects: [] },
      integrity: { maximum: 10, repairable: true, zeroBehavior: "broken" },
    });

    expect(registerDefinition("item", sound as never)).toEqual({ ok: true });
    expect(findItemCatalogIssues()).toEqual([]);
  });
});


describe("every new Skill surface refuses hostile shapes without throwing", () => {
  const SKILL_FIELDS = ["implements", "implementConditionalRules"] as const;

  function skillWith(field: string, value: unknown): Record<string, unknown> {
    const skill = validDefinitionFor("skill");
    const application = {
      ...(skill["application"] as Record<string, unknown>),
      [field]: value,
    };

    return { ...skill, application };
  }

  it.each(
    SKILL_FIELDS.flatMap((field) =>
      HOSTILE_VALUES.map((value, index) => [field, index, value] as const),
    ),
  )("survives application.%s holding hostile value %i", (field, _index, value) => {
    const definition = skillWith(field, value);

    expect(() => findSkillDefinitionStructuralIssues(definition)).not.toThrow();
    expect(() => registerDefinition("skill", definition as never)).not.toThrow();
  });

  it.each(
    SKILL_FIELDS.flatMap((field) =>
      HOSTILE_VALUES.map((value, index) => [field, index, value] as const),
    ),
  )("refuses application.%s holding hostile value %i", (field, _index, value) => {
    const result = registerDefinition("skill", skillWith(field, value) as never);

    expect(result.ok).toBe(mustRefuse(field, value) ? false : true);

    if (mustRefuse(field, value)) {
      expect(getDefinition("skill", "house-rule")).toBeUndefined();
    }
  });

  it("refuses a null list rather than reading it as an empty one", () => {
    /*
     * The specific collapse `?? []` used to cause at the three call sites that
     * had one. `null` is a malformed declaration, not an omitted field, and
     * defaulting it called a broken Skill clean.
     */
    expect(findImplementRequirementsIssues(null)).not.toEqual([]);
    expect(findImplementConditionalRulesIssues(null)).not.toEqual([]);

    /* Absent really is absent, which is what makes the distinction worth having. */
    expect(findImplementRequirementsIssues(undefined)).toEqual([]);
    expect(findImplementConditionalRulesIssues(undefined)).toEqual([]);
  });
});


/* -------------------------------------------------------------------------- */
/* 2. Registration and direct resolution return compatible failures           */
/* -------------------------------------------------------------------------- */

describe("registration and direct resolution agree about every new surface", () => {
  it("refuses a malformed useApplication at both the registry and the profile builder", () => {
    for (const value of HOSTILE_VALUES) {
      const definition = itemWith({ useApplication: value });

      expect(registerDefinition("item", definition as never).ok).toBe(false);

      const direct = buildItemOperationProfile(
        "use",
        definition as unknown as ItemDefinition,
        { characterId: "gon", entryId: "e1" },
      );

      expect(direct.success).toBe(false);
    }
  });

  it("refuses a malformed attack or defense at both the registry and contribution resolution", () => {
    const resolution: ImplementResolution = {
      role: "weapon",
      item: { characterId: "gon", entryId: "e1" },
      itemId: "test-blade",
      compatibility: "compatible",
      families: [],
      state: "held",
    };

    for (const slot of ["attack", "defense"] as const) {
      for (const value of HOSTILE_VALUES.filter((candidate) => mustRefuse(slot, candidate))) {
        const definition = itemWith({ [slot]: value });

        expect(registerDefinition("item", definition as never).ok).toBe(false);

        const direct = resolveItemPerformanceContribution(
          resolution,
          lookupOf(definition),
        );

        expect(direct.success).toBe(false);
      }
    }
  });

  it("refuses a malformed integrity policy at both the registry and the integrity resolver", () => {
    const { resolved } = characterHolding("test-blade");

    for (const value of HOSTILE_VALUES) {
      const definition = itemWith({ integrity: value });

      expect(registerDefinition("item", definition as never).ok).toBe(false);

      const direct = resolveItemIntegrityOperation(
        {
          resolved,
          item: { characterId: resolved.character.id, entryId: "e1" },
          operation: { type: "stress", amount: 3 },
        },
        lookupOf(definition),
      );

      /*
       * `{}` and `[]` are objects, so the policy is PRESENT and invalid rather
       * than absent — a failure, not the "not-durable" success an Item with no
       * policy at all gets. Every other hostile value is not an object, which
       * the same validator refuses for the same reason.
       */
      expect(direct.success).toBe(false);
    }
  });

  it("refuses a malformed families list at both the registry and implement selection", () => {
    const { resolved } = characterHolding("test-blade");

    for (const value of HOSTILE_VALUES.filter((candidate) => mustRefuse("families", candidate))) {
      const definition = itemWith({ families: value });

      expect(registerDefinition("item", definition as never).ok).toBe(false);

      const direct = resolveSelectedImplements(
        {
          resolved,
          requirements: [{
            role: "weapon",
            minimum: 1,
            maximum: 1,
            acceptedFamilies: ["blunt-weapon"],
            allowImprovised: true,
          }],
          selections: [{
            role: "weapon",
            item: { characterId: resolved.character.id, entryId: "e1" },
          }],
        },
        lookupOf(definition),
      );

      /*
       * A definite issue rather than a graded resolution. `allowImprovised` is
       * ON here on purpose: improvisation is a judgement about a real Item
       * that does not match the role, and a malformed one must not fall
       * through into it.
       */
      const selection = direct.success ? direct.payload : undefined;

      expect(selection?.resolutions ?? []).toEqual([]);
      expect(
        (selection?.issues ?? []).some((issue) => issue.kind === "definition-invalid"),
      ).toBe(true);
    }
  });
});


/* -------------------------------------------------------------------------- */
/* 3. `families: 42` in particular                                            */
/* -------------------------------------------------------------------------- */

describe("families: 42 can neither register nor crash reference validation", () => {
  it("is refused at registration", () => {
    const result = registerDefinition("item", itemWith({ families: 42 }) as never);

    expect(result.ok).toBe(false);
    expect(getDefinition("item", "test-blade")).toBeUndefined();
  });

  it("leaves cross-catalog reference checking able to run", () => {
    /*
     * The end-to-end claim. `findCatalogReferenceIssues()` walks every Item's
     * `families` with `.filter()`, which is a method a number does not have —
     * so before the barrier covered this field, one registered Item made the
     * whole check throw for every other definition in every catalog.
     */
    registerDefinition("item", itemWith({ families: 42 }) as never);

    expect(() => findCatalogReferenceIssues()).not.toThrow();
    expect(findCatalogReferenceIssues()).toEqual([]);
  });

  it("reports a duplicate family rather than collapsing it", () => {
    const result = registerDefinition("item", itemWith({
      families: ["blunt-weapon", "blunt-weapon"],
    }) as never);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("duplicate");
  });

  it("still accepts a real family list, and one registered later", () => {
    expect(registerDefinition("item", itemWith({
      families: ["blunt-weapon", "not-yet-authored"],
    }) as never).ok).toBe(true);

    /*
     * Structure now, EXISTENCE later — the barrier's standing rule. The
     * unknown family is a reference complaint, not a refusal.
     */
    expect(findCatalogReferenceIssues()).toEqual([
      expect.stringContaining('unknown Item Family "not-yet-authored"'),
    ]);
  });
});


/* -------------------------------------------------------------------------- */
/* 4. `integrity.bands: [null]`                                               */
/* -------------------------------------------------------------------------- */

describe("a malformed integrity band cannot throw", () => {
  function policyWith(bands: unknown): Record<string, unknown> {
    return { maximum: 10, repairable: true, zeroBehavior: "broken", bands };
  }

  it.each([
    ["a null band", [null]],
    ["a band that is a number", [42]],
    ["a band list that is not a list", {}],
    ["a band with no bounds", [{ state: "intact" }]],
    ["a band whose bounds are strings", [{ state: "intact", minimum: "0", maximum: "10" }]],
    ["a band naming an unknown state", [{ state: "chipped", minimum: 0, maximum: 10 }]],
  ])("survives %s", (_label, bands) => {
    const policy = policyWith(bands);

    expect(() => findItemIntegrityIssues(policy)).not.toThrow();
    expect(findItemIntegrityIssues(policy)).not.toEqual([]);

    expect(() =>
      registerDefinition("item", itemWith({ integrity: policy }) as never)
    ).not.toThrow();

    expect(
      registerDefinition("item", itemWith({ integrity: policy }) as never).ok,
    ).toBe(false);
  });
});


/* -------------------------------------------------------------------------- */
/* 19. No resolver throws on hostile caller-supplied values                   */
/* -------------------------------------------------------------------------- */

describe("no resolver throws on a hostile caller-supplied value", () => {
  const { resolved } = characterHolding("test-blade");
  const characterId = resolved.character.id;

  it.each(HOSTILE_VALUES.map((value, index) => [index, value] as const))(
    "survives an inventory reference of hostile value %i",
    (_index, value) => {
      expect(() =>
        resolveItemIntegrityOperation(
          {
            resolved,
            item: value as never,
            operation: { type: "stress", amount: 1 },
          },
          lookupOf(SOUND_ITEM),
        )
      ).not.toThrow();

      expect(() =>
        resolveItemEnvelope(
          characterId,
          value as never,
          resolved.character.items,
          lookupOf(SOUND_ITEM),
        )
      ).not.toThrow();

      expect(() =>
        resolveSelectedImplements(
          { resolved, requirements: [], selections: value },
          lookupOf(SOUND_ITEM),
        )
      ).not.toThrow();
    },
  );

  it.each(HOSTILE_VALUES.map((value, index) => [index, value] as const))(
    "survives an integrity operation of hostile value %i",
    (_index, value) => {
      const result = resolveItemIntegrityOperation(
        {
          resolved,
          item: { characterId, entryId: "e1" },
          operation: value as never,
        },
        lookupOf(SOUND_ITEM),
      );

      expect(result.success).toBe(false);
    },
  );

  it.each(HOSTILE_VALUES.map((value, index) => [index, value] as const))(
    "survives a lookup answering with hostile value %i",
    (_index, value) => {
      /*
       * A lookup is a function a host wrote, and nothing obliges it to return
       * an Item. Every resolver that takes one has to survive being lied to.
       */
      expect(() =>
        resolveItemEnvelope(
          characterId,
          { characterId, entryId: "e1" },
          resolved.character.items,
          lookupOf(value),
        )
      ).not.toThrow();

      expect(() =>
        resolveItemIntegrityOperation(
          {
            resolved,
            item: { characterId, entryId: "e1" },
            operation: { type: "stress", amount: 1 },
          },
          lookupOf(value),
        )
      ).not.toThrow();
    },
  );

  it.each(HOSTILE_VALUES.map((value, index) => [index, value] as const))(
    "survives every field validator called with hostile value %i",
    (_index, value) => {
      for (const validator of [
        findItemFamilyIssues,
        findItemUseApplicationIssues,
        findItemAttackIssues,
        findItemDefenseIssues,
        findItemIntegrityIssues,
        findImplementRequirementsIssues,
        findImplementConditionalRulesIssues,
      ]) {
        expect(() => validator(value)).not.toThrow();
      }
    },
  );
});


/* -------------------------------------------------------------------------- */
/* 7-9. The closed vocabularies INSIDE those fields                           */
/* -------------------------------------------------------------------------- */

/*
 * Proving a field is an array proves nothing about what is in it, and four
 * vocabularies on these surfaces were typed and never read. `["acton"]`
 * matches no timing and validated clean; a repeated entry said nothing the
 * first one did; an unrecognised `threatens` fell past every
 * `=== "declared-targets"` comparison downstream and silently disarmed the
 * weapon rather than failing.
 */
describe("a use application's timings are checked, not merely counted", () => {
  function useApplicationWith(overrides: Record<string, unknown>): Record<string, unknown> {
    return itemWith({
      useApplication: {
        allowedTimings: ["action"],
        structuredActionCost: { actions: 1 },
        targets: { cardinality: { minimum: 0, maximum: 0 } },
        executionDuration: 0,
        ...overrides,
      },
    });
  }

  function directProfile(definition: Record<string, unknown>) {
    return buildItemOperationProfile(
      "use",
      definition as unknown as ItemDefinition,
      { characterId: "gon", entryId: "e1" },
    );
  }

  it.each([
    ["an unknown timing", ["acton"]],
    ["a timing that is not a string", [42]],
    ["a null timing", [null]],
    ["a repeated timing", ["action", "action"]],
  ])("refuses %s at registration and at the profile builder", (_label, allowedTimings) => {
    const definition = useApplicationWith({ allowedTimings });

    expect(findItemUseApplicationIssues(definition["useApplication"])).not.toEqual([]);
    expect(registerDefinition("item", definition as never).ok).toBe(false);
    expect(directProfile(definition).success).toBe(false);
  });

  it("still accepts the real timings, each named once", () => {
    const definition = useApplicationWith({ allowedTimings: ["action", "reaction"] });

    expect(registerDefinition("item", definition as never).ok).toBe(true);
    expect(directProfile(definition).success).toBe(true);
  });

  it.each([
    ["an unknown focus kind", ["attention"]],
    ["a focus kind that is not a string", [7]],
    ["a repeated focus kind", ["none", "none"]],
    ["an empty list", []],
  ])("refuses %s", (_label, permittedFocusKinds) => {
    const definition = useApplicationWith({ permittedFocusKinds });

    expect(findItemUseApplicationIssues(definition["useApplication"])).not.toEqual([]);
    expect(registerDefinition("item", definition as never).ok).toBe(false);
    expect(directProfile(definition).success).toBe(false);
  });

  it("still accepts real focus kinds, each named once", () => {
    const definition = useApplicationWith({ permittedFocusKinds: ["none", "position"] });

    expect(registerDefinition("item", definition as never).ok).toBe(true);
  });
});


describe("an attack contribution's threat declaration is checked", () => {
  it.each([
    ["an unknown declaration", "declared-target"],
    ["a near miss", "declared_targets"],
    ["a boolean", true],
    ["a number", 1],
  ])("refuses %s", (_label, threatens) => {
    const definition = itemWith({ attack: { threatens } });

    expect(findItemAttackIssues(definition["attack"]).map((issue) => issue.code))
      .toContain("equipment.actions.attack-contribution.threatens.invalid");

    expect(registerDefinition("item", definition as never).ok).toBe(false);
  });

  it("still accepts every declaration the engine knows", () => {
    for (const threatens of ["none", "declared-targets"]) {
      expect(findItemAttackIssues({ threatens })).toEqual([]);
    }
  });
});


/* -------------------------------------------------------------------------- */
/* 10. Nested contribution Effects                                            */
/* -------------------------------------------------------------------------- */

describe("a contribution's nested Effects are validated on both paths", () => {
  const MALFORMED_EFFECTS: readonly (readonly [string, unknown])[] = [
    ["an Effect discriminant nothing recognises", [{ type: "bogus" }]],
    ["a null Effect", [null]],
    ["an Effect that is a number", [42]],
    ["a non-finite amount", [{ type: "modifyBaseAttribute", attribute: "dex", amount: Number.NaN }]],
    ["a modifyCheck with no check", [{ type: "modifyCheck", amount: 1 }]],
  ];

  it.each(
    (["attack", "defense"] as const).flatMap((slot) =>
      MALFORMED_EFFECTS.map(([label, effects]) => [slot, label, effects] as const),
    ),
  )("refuses %s.effects holding %s", (slot, _label, effects) => {
    const definition = itemWith({ [slot]: { effects } });

    const issues = slot === "attack"
      ? findItemAttackIssues(definition[slot])
      : findItemDefenseIssues(definition[slot]);

    expect(issues).not.toEqual([]);
    expect(registerDefinition("item", definition as never).ok).toBe(false);
  });

  it("returns a failure from direct contribution resolution rather than throwing", () => {
    /*
     * The reason this is not cosmetic: `resolveRuleEffects()` ends its switch
     * in a deliberate `never` exhaustiveness guard, so a malformed Effect
     * reaching it does not return a failure — it THROWS, out of a resolver
     * whose whole contract is to return one.
     */
    const resolution: ImplementResolution = {
      role: "weapon",
      item: { characterId: "gon", entryId: "e1" },
      itemId: "test-blade",
      compatibility: "compatible",
      families: [],
      state: "held",
    };

    for (const [, effects] of MALFORMED_EFFECTS) {
      const definition = itemWith({ attack: { effects } });

      let result: ReturnType<typeof resolveItemPerformanceContribution> | undefined;

      expect(() => {
        result = resolveItemPerformanceContribution(resolution, lookupOf(definition));
      }).not.toThrow();

      expect(result?.success).toBe(false);
    }
  });

  it("reports a malformed contribution Effect exactly once at registration", () => {
    /*
     * `findContentStructuralIssues` walks these Effects too, so the composer
     * the registry is handed deliberately skips them. One fault, one sentence.
     */
    const result = registerDefinition("item", itemWith({
      attack: { effects: [{ type: "bogus" }] },
    }) as never);

    expect(result.ok).toBe(false);

    const reason = result.ok === false ? result.reason : "";

    expect(reason).toContain("effects[0]");
    expect(reason.split("effects[0]").length - 1).toBe(1);
  });

  it("still accepts a well-formed contribution on both paths", () => {
    const definition = itemWith({
      attack: {
        effects: [{ type: "modifyCheck", check: { kind: "attribute", attribute: "dex" }, amount: 2 }],
        threatens: "declared-targets",
      },
      defense: { effects: [] },
    });

    expect(registerDefinition("item", definition as never).ok).toBe(true);
    expect(findItemAttackIssues(definition["attack"])).toEqual([]);
    expect(findItemDefenseIssues(definition["defense"])).toEqual([]);
  });
});


/* -------------------------------------------------------------------------- */
/* 11-12. What channel authored content may declare                           */
/* -------------------------------------------------------------------------- */

describe("an authored conditional check output may only use the authored channels", () => {
  function ruleWith(channel: unknown): Record<string, unknown> {
    return {
      id: "keen-edge-bonus",
      condition: { familyIds: ["blunt-weapon"] },
      output: {
        kind: "check",
        scope: { kind: "attribute", attribute: "dex" },
        amount: 2,
        ...(channel === undefined ? {} : { channel }),
      },
    };
  }

  function traitWith(channel: unknown) {
    return registerDefinition("trait", {
      id: "keen-edge",
      name: "Keen Edge",
      description: "A Trait declaring one implement-conditional rule.",
      implementConditionalRules: [ruleWith(channel)],
    } as never);
  }

  it.each(["persistent", "invoked"])("accepts %s", (channel) => {
    expect(findImplementConditionalRuleIssues(ruleWith(channel))).toEqual([]);
    expect(traitWith(channel).ok).toBe(true);
  });

  it("accepts an omitted channel, which reads as persistent", () => {
    expect(findImplementConditionalRuleIssues(ruleWith(undefined))).toEqual([]);
    expect(traitWith(undefined).ok).toBe(true);
  });

  it("refuses contextual, which is a channel no content supplies", () => {
    /*
     * A contextual modifier is what the GM, the environment or the calling
     * system hands in at check time. Content that could author one would be
     * content asserting it came from somewhere it did not.
     */
    expect(findImplementConditionalRuleIssues(ruleWith("contextual")).map((issue) => issue.code))
      .toContain("equipment.conditions.rule.output.channel.invalid");

    expect(traitWith("contextual").ok).toBe(false);
  });

  it.each([["a typo", "persistant"], ["a number", 3], ["null", null], ["empty", ""]])(
    "refuses %s",
    (_label, channel) => {
      expect(findImplementConditionalRuleIssues(ruleWith(channel)).map((issue) => issue.code))
        .toContain("equipment.conditions.rule.output.channel.invalid");

      expect(traitWith(channel).ok).toBe(false);
    },
  );
});
