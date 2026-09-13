/*
 * Where an implement-conditional rule comes from, and who may say it applies.
 *
 * `equipment/conditions.ts` evaluates a rule against the resolved implements
 * and routes its one output to a check modifier or to an Item's performance
 * contribution. It deliberately knows nothing about Skills, Techniques or
 * Traits — assembling the list was "the caller's job", which in practice meant
 * anybody's job.
 *
 * That was the hole. A host, a UI or a test could hand preparation
 * `[{ source: { type: "trait", id: "iron-grip" }, rule: <anything> }]` and get
 * a check modifier sourced to a Trait the character has never had, stacking
 * with the real ones and tracing identically to them. Provenance a caller
 * asserts is a field, not provenance.
 *
 * So the collection is now branded, `collectImplementConditionalRules()` is
 * the only thing that can produce one, and the brand's symbol is module-private
 * — TypeScript refuses a forged literal and the runtime check refuses one
 * arriving from untyped host JavaScript.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  clearCustomDefinitions,
  registerDefinition,
} from "../character/catalogs";

import {
  collectMatchedCheckModifiers,
  collectMatchedPerformanceEffects,
  isAuthorizedImplementConditionalRules,
  NO_IMPLEMENT_CONDITIONAL_RULES,
  resolveItemPerformanceContribution,
  getItemDefinition,
  type ItemDefinition,
} from "../character/equipment/index";
import {
  characterContentCatalogs,
  collectImplementConditionalRules,
} from "../character/capabilities/implement-rules";
import { resolveSkillApplication } from "../character/capabilities/application-resolution";
import { prepareCharacterActionInputs } from "../character/actions/preparation";
import type { ImplementResolution } from "../character/equipment/implements";
import type { CharacterItem } from "../character/equipment/index";

import { errorCodesOf, payloadOf } from "./fixtures/result";
import { validDefinitionFor } from "./fixtures/catalog";
import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";


afterEach(() => {
  clearCustomDefinitions();
});


/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

const BLADED_CHECK_RULE = {
  id: "keen-edge-bonus",
  condition: { familyIds: ["blunt-weapon"] },
  output: { kind: "check", scope: { kind: "attribute", attribute: "dex" }, amount: 2 },
} as const;

const BLADED_PERFORMANCE_RULE = {
  id: "heavy-swing",
  condition: { familyIds: ["blunt-weapon"] },
  output: {
    kind: "performance",
    slot: "attack",
    effects: [{ type: "modifyCheck", check: { kind: "attribute", attribute: "dex" }, amount: 1 }],
  },
} as const;


function register(domain: "trait" | "technique" | "skill", fields: Record<string, unknown>): void {
  const base = domain === "skill"
    ? validDefinitionFor("skill")
    : { name: `Test ${domain}`, description: `A test ${domain} for conditional rules.` };

  const result = registerDefinition(domain, { ...base, ...fields } as never);

  if (!result.ok) throw new Error(result.reason);
}


function registerMace(): ItemDefinition {
  const result = registerDefinition("item", {
    id: "test-mace",
    name: "Test Mace",
    description: "A blunt weapon, for conditional-rule matching.",
    inventoryMode: "individual",
    shuInteraction: "compatible",
    families: ["blunt-weapon"],
    attack: { effects: [{ type: "modifyCheck", check: { kind: "attribute", attribute: "dex" }, amount: 3 }] },
  } as never);

  if (!result.ok) throw new Error(result.reason);

  return getItemDefinition("test-mace")!;
}


const MACE_ENTRY: CharacterItem = {
  entryId: "e1",
  itemId: "test-mace",
  quantity: 1,
  state: "held",
};


function maceResolution(characterId: string): ImplementResolution {
  return {
    role: "weapon",
    item: { characterId, entryId: "e1" },
    itemId: "test-mace",
    compatibility: "compatible",
    families: ["blunt-weapon"],
    state: "held",
  };
}


/* -------------------------------------------------------------------------- */
/* 9. Content the character actually has is collected, once, and routed       */
/* -------------------------------------------------------------------------- */

describe("the engine collects rules from content the character actually has", () => {
  it("collects a possessed Trait's rule and sources it to the Trait", () => {
    register("trait", {
      id: "keen-edge",
      implementConditionalRules: [BLADED_CHECK_RULE],
    });

    const character = createTestCharacter({ traits: [{ traitId: "keen-edge" }] });

    const collected = payloadOf(collectImplementConditionalRules(
      character,
      undefined,
      characterContentCatalogs(),
    ));

    expect(collected.rules).toHaveLength(1);
    expect(collected.rules[0]!.source).toEqual({ type: "trait", id: "keen-edge" });
  });

  it("collects a known Technique's rule and sources it to the Technique", () => {
    register("technique", {
      id: "heavy-hands",
      mastery: { maximumMastery: 3 },
      implementConditionalRules: [BLADED_CHECK_RULE],
    });

    const character = createTestCharacter({
      techniques: [{ techniqueId: "heavy-hands", mastery: 1 }],
    });

    const collected = payloadOf(collectImplementConditionalRules(
      character,
      undefined,
      characterContentCatalogs(),
    ));

    expect(collected.rules.map((entry) => entry.source))
      .toEqual([{ type: "technique", id: "heavy-hands" }]);
  });

  it("collects the invoked Skill's rule and sources it to the Skill", () => {
    const skill = validDefinitionFor("skill");

    register("skill", {
      ...skill,
      id: "house-rule",
      requirements: [],
      application: {
        ...(skill["application"] as Record<string, unknown>),
        implementConditionalRules: [BLADED_CHECK_RULE],
      },
    });

    const character = createTestCharacter({
      skills: [{ skillId: "house-rule", mastery: 1 }],
    });
    const resolved = resolveTestCharacter(character);

    /*
     * The collector is told WHICH Skill, not what to think of it — it resolves
     * the application itself. This assertion is the control: the Skill really
     * is available, so the empty result below cannot be mistaken for the
     * collector simply never finding one.
     */
    expect(payloadOf(resolveSkillApplication({
      skillId: "house-rule",
      capabilities: resolved.capabilities,
      context: resolved.requirementContext,
    })).disposition).toBe("available");

    const collected = payloadOf(collectImplementConditionalRules(
      character,
      "house-rule",
      characterContentCatalogs(),
    ));

    expect(collected.rules.map((entry) => entry.source))
      .toEqual([{ type: "skill", id: "house-rule" }]);
  });

  it("collects a Trait the character does NOT have not at all", () => {
    register("trait", {
      id: "keen-edge",
      implementConditionalRules: [BLADED_CHECK_RULE],
    });

    const collected = payloadOf(collectImplementConditionalRules(
      createTestCharacter(),
      undefined,
      characterContentCatalogs(),
    ));

    expect(collected.rules).toEqual([]);
  });

  it("collects a Skill's rule only while the Skill is actually available", () => {
    const skill = validDefinitionFor("skill");

    register("skill", {
      ...skill,
      id: "house-rule",
      requirements: [],
      application: {
        ...(skill["application"] as Record<string, unknown>),
        implementConditionalRules: [BLADED_CHECK_RULE],
      },
    });

    /* Not held — an unlock is permission to acquire, not possession. */
    const character = createTestCharacter();
    const resolved = resolveTestCharacter(character);

    expect(payloadOf(resolveSkillApplication({
      skillId: "house-rule",
      capabilities: resolved.capabilities,
      context: resolved.requirementContext,
    })).disposition).toBe("skill-not-held");

    expect(payloadOf(collectImplementConditionalRules(
      character,
      "house-rule",
      characterContentCatalogs(),
    )).rules).toEqual([]);
  });

  it("collects each rule exactly once, in a stable order", () => {
    register("trait", { id: "keen-edge", implementConditionalRules: [BLADED_CHECK_RULE] });
    register("trait", { id: "awkward-grip", implementConditionalRules: [BLADED_PERFORMANCE_RULE] });

    const character = createTestCharacter({
      traits: [{ traitId: "awkward-grip" }, { traitId: "keen-edge" }],
    });

    const first = payloadOf(collectImplementConditionalRules(
      character,
      undefined,
      characterContentCatalogs(),
    ));

    const second = payloadOf(collectImplementConditionalRules(
      { ...character, traits: [{ traitId: "keen-edge" }, { traitId: "awkward-grip" }] },
      undefined,
      characterContentCatalogs(),
    ));

    expect(first.rules).toHaveLength(2);
    expect(first.rules.map((entry) => entry.rule.id)).toEqual(second.rules.map((entry) => entry.rule.id));
  });

  it("routes a check rule to the check modifiers and a performance rule to the Item", () => {
    /*
     * ONE collection, TWO destinations — the contract the repair unified. A
     * "check" rule must reach `collectMatchedCheckModifiers()` and nothing
     * else; a "performance" rule must reach the Item's contribution and
     * nothing else.
     */
    registerMace();
    register("trait", { id: "keen-edge", implementConditionalRules: [BLADED_CHECK_RULE] });
    register("trait", { id: "heavy-swinger", implementConditionalRules: [BLADED_PERFORMANCE_RULE] });

    const character = createTestCharacter({
      traits: [{ traitId: "keen-edge" }, { traitId: "heavy-swinger" }],
      items: [MACE_ENTRY],
    });
    const resolved = resolveTestCharacter(character);

    const collected = payloadOf(collectImplementConditionalRules(
      character,
      undefined,
      characterContentCatalogs(),
    ));

    const resolution = maceResolution(character.id);

    const checks = collectMatchedCheckModifiers(collected, [resolution]);

    expect(checks).toHaveLength(1);
    expect(checks[0]!.source).toEqual({ type: "trait", id: "keen-edge" });

    const performance = collectMatchedPerformanceEffects(collected, resolution);

    expect(performance.attack).toHaveLength(1);
    expect(performance.attack[0]!.source).toEqual({ type: "trait", id: "heavy-swinger" });
    expect(performance.defense).toEqual([]);

    /* And through the adapter, which is the path an action actually takes. */
    const contribution = payloadOf(prepareCharacterActionInputs({
      resolved,
      implements: {
        requirements: [{
          role: "weapon",
          minimum: 1,
          maximum: 1,
          acceptedFamilies: ["blunt-weapon"],
        }],
        selections: [{ role: "weapon", item: { characterId: character.id, entryId: "e1" } }],
        getItemDefinition,
        conditionalRules: collected,
      },
    }));

    expect(
      contribution.modifiers.filter((modifier) => modifier.source.type === "trait"),
    ).toHaveLength(1);
  });
});


/* -------------------------------------------------------------------------- */
/* 8. A caller-manufactured rule cannot enter resolution                     */
/* -------------------------------------------------------------------------- */

describe("a caller cannot manufacture a Trait, Technique or Skill rule", () => {
  it("refuses a plain array where an authorized collection is wanted", () => {
    const forged = [
      { source: { type: "trait", id: "never-had-it" }, rule: BLADED_CHECK_RULE },
    ];

    /*
     * TypeScript already refuses this — the brand's key is a module-private
     * symbol that cannot be named from outside — so the cast is what a host
     * writing untyped JavaScript effectively does. The runtime guard is what
     * catches them.
     */
    expect(isAuthorizedImplementConditionalRules(forged)).toBe(false);

    expect(collectMatchedCheckModifiers(forged as never, [maceResolution("gon")]))
      .toEqual([]);

    expect(collectMatchedPerformanceEffects(forged as never, maceResolution("gon")))
      .toEqual({ attack: [], defense: [] });
  });

  it("refuses an object wearing the collection's shape", () => {
    const forged = { rules: [{ source: { type: "trait", id: "nope" }, rule: BLADED_CHECK_RULE }] };

    expect(isAuthorizedImplementConditionalRules(forged)).toBe(false);
    expect(collectMatchedCheckModifiers(forged as never, [maceResolution("gon")])).toEqual([]);
  });

  it("accepts the engine's own empty collection, which is not the same as none", () => {
    expect(isAuthorizedImplementConditionalRules(NO_IMPLEMENT_CONDITIONAL_RULES)).toBe(true);
    expect(collectMatchedCheckModifiers(NO_IMPLEMENT_CONDITIONAL_RULES, [maceResolution("gon")]))
      .toEqual([]);
  });

  it("lets no forged rule reach an Item's performance contribution", () => {
    registerMace();

    const character = createTestCharacter({ items: [MACE_ENTRY] });
    const forged = [
      { source: { type: "trait", id: "never-had-it" }, rule: BLADED_PERFORMANCE_RULE },
    ];

    const contribution = payloadOf(resolveItemPerformanceContribution(
      maceResolution(character.id),
      getItemDefinition,
      forged as never,
    ));

    /*
     * The Item's own Effect survives — it is the Item's — and nothing the
     * caller invented is beside it.
     */
    const sources = (contribution.attack?.effects.effects ?? []).map(
      (entry) => entry.source.type,
    );

    expect(sources).toEqual(["item"]);
  });

  it("fails rather than skipping when possessed content is malformed", () => {
    /*
     * A Trait whose rules are not a list is a registration-barrier fault that
     * reached here anyway — a host's unchecked JSON. Dropping it silently
     * would make a character lose a bonus their sheet says they have.
     */
    register("trait", { id: "keen-edge", implementConditionalRules: [BLADED_CHECK_RULE] });

    const result = collectImplementConditionalRules(
      createTestCharacter({ traits: [{ traitId: "keen-edge" }] }),
      undefined,
      {
        ...characterContentCatalogs(),
        getTraitDefinition: () => ({
          id: "keen-edge",
          name: "Keen Edge",
          description: "A Trait whose rules are not a list.",
          implementConditionalRules: 42,
        }) as never,
      },
    );

    expect(result.success).toBe(false);
  });
});


/* -------------------------------------------------------------------------- */
/* 13-15. The invoked Skill is resolved here, not accepted                    */
/* -------------------------------------------------------------------------- */

/*
 * The brand stopped a caller inventing a RULE. It did nothing about a caller
 * inventing the VERDICT that authorizes one: the collector took a
 * `ResolvedSkillApplication` and read `disposition === "available"` off it, so
 * a plain object saying `{ skillId: "forbidden-art", disposition: "available" }`
 * authorized a Skill nobody had learned, whose execution requirements nobody
 * evaluated — and the branded output then certified it.
 *
 * The caller now names the Skill and nothing else.
 */
describe("the invoked Skill's availability is resolved, not asserted", () => {
  const SKILL_RULE = {
    id: "measured-strike",
    condition: { familyIds: ["blunt-weapon"] },
    output: { kind: "check", scope: { kind: "attribute", attribute: "dex" }, amount: 2 },
  } as const;

  function registerGatedSkill(
    id: string,
    overrides: Record<string, unknown> = {},
  ): void {
    const skill = validDefinitionFor("skill");

    register("skill", {
      ...skill,
      id,
      requirements: [],
      application: {
        ...(skill["application"] as Record<string, unknown>),
        implementConditionalRules: [SKILL_RULE],
      },
      ...overrides,
    });
  }

  function collectFor(
    character: ReturnType<typeof createTestCharacter>,
    skillId: string | undefined,
    catalogs = characterContentCatalogs(),
  ) {
    return payloadOf(collectImplementConditionalRules(character, skillId, catalogs));
  }

  it("takes a Skill id, so there is no disposition to fabricate", () => {
    /*
     * The structural half, and it is the fix. `collectImplementConditionalRules`
     * accepts `SkillId | undefined`; a `ResolvedSkillApplication` — forged or
     * genuine — is not assignable to it, so the forgery below does not compile
     * and the cast is what an untyped host effectively writes. It names no
     * Skill any catalog holds, so it is refused rather than believed.
     */
    registerGatedSkill("forbidden-art");

    const forged = { skillId: "forbidden-art", disposition: "available" };

    const result = collectImplementConditionalRules(
      createTestCharacter(),
      forged as unknown as string,
      characterContentCatalogs(),
    );

    expect(result.success).toBe(false);
  });

  it("collects nothing for a Skill the character has never learned", () => {
    /*
     * The Skill is real and defined; the character has not learned it. That is
     * a fact about the CHARACTER, so the collection succeeds and is empty —
     * unlike a broken catalog, which fails below.
     */
    registerGatedSkill("forbidden-art");

    expect(collectFor(createTestCharacter(), "forbidden-art").rules).toEqual([]);
  });

  it("collects nothing when the Skill's execution requirements are unsatisfied", () => {
    /*
     * Held, and refused. The disposition this function produces is
     * "requirements-unsatisfied", which is a definite no — and a caller
     * asserting "available" over the top of it is exactly the case the old
     * signature could not tell apart from a real one.
     */
    registerGatedSkill("measured-art", {
      application: {
        ...(validDefinitionFor("skill")["application"] as Record<string, unknown>),
        implementConditionalRules: [SKILL_RULE],
        requirements: [{
          id: "needs-a-trait",
          summary: "Requires a Trait nobody has.",
          requirement: { type: "hasTrait", traitId: "never-registered" },
        }],
      },
    });

    const character = createTestCharacter({
      skills: [{ skillId: "measured-art", mastery: 1 }],
    });
    const resolved = resolveTestCharacter(character);

    expect(payloadOf(resolveSkillApplication({
      skillId: "measured-art",
      capabilities: resolved.capabilities,
      context: resolved.requirementContext,
    })).disposition).toBe("requirements-unsatisfied");

    expect(collectFor(character, "measured-art").rules).toEqual([]);
  });

  it("refuses a catalog that answers with a different Skill", () => {
    /*
     * The same substitution `resolveItemDefinition()` refuses on the equipment
     * side. A definition answering to an id that is not its own would let one
     * Skill's rules be collected under another's name.
     */
    registerGatedSkill("measured-art");
    registerGatedSkill("other-art");

    const character = createTestCharacter({
      skills: [{ skillId: "measured-art", mastery: 1 }],
    });

    const result = collectImplementConditionalRules(character, "measured-art", {
      ...characterContentCatalogs(),
      getSkillDefinition: () => characterContentCatalogs().getSkillDefinition("other-art"),
    });

    expect(errorCodesOf(result))
      .toContain("capabilities.implement-rules.skill.definition_mismatch");
  });

  it("refuses a Skill no catalog defines", () => {
    expect(errorCodesOf(collectImplementConditionalRules(
      createTestCharacter(),
      "no-such-skill",
      characterContentCatalogs(),
    ))).toContain("capabilities.implement-rules.skill.unknown");
  });

  it("still collects a held, available Skill's rules — exactly once", () => {
    /* The control. Every case above would pass against a collector that
     * refused everything. */
    registerGatedSkill("measured-art");

    const character = createTestCharacter({
      skills: [{ skillId: "measured-art", mastery: 1 }],
    });

    const collected = collectFor(character, "measured-art");

    expect(collected.rules).toHaveLength(1);
    expect(collected.rules[0]!.source).toEqual({ type: "skill", id: "measured-art" });
    expect(collected.rules[0]!.rule.id).toBe("measured-strike");
  });

  it("keeps Trait and Technique rules coming from possession alone", () => {
    /*
     * The Skill half changed; the other two did not, and this pins that. A
     * Trait contributes because the character HAS it, with no invoked Skill in
     * the picture at all.
     */
    register("trait", { id: "keen-edge", implementConditionalRules: [BLADED_CHECK_RULE] });

    expect(collectFor(
      createTestCharacter({ traits: [{ traitId: "keen-edge" }] }),
      undefined,
    ).rules.map((entry) => entry.source)).toEqual([{ type: "trait", id: "keen-edge" }]);
  });
});


/* -------------------------------------------------------------------------- */
/* Every catalog lookup, not just the Skill's                                 */
/* -------------------------------------------------------------------------- */

/*
 * The Skill branch grew a shape-and-identity check and the other two did not
 * — the same "a rule one caller enforces is a rule the others do not have"
 * failure the Item lookup had, one revision later and one layer up.
 *
 * A Trait lookup answering with a DIFFERENT Trait had that Trait's rules
 * collected, branded authorized, and sourced to the Trait the character
 * actually possesses: a bonus from content nobody has, wearing the name of
 * content they do. A lookup answering `null` threw from
 * `definition.implementConditionalRules`, out of a function whose entire
 * contract is to return an `EngineResult`.
 */
describe("every catalog lookup is proved before it is read", () => {
  const OWNED_RULE = {
    id: "owned-bonus",
    condition: { familyIds: ["blunt-weapon"] },
    output: { kind: "check", scope: { kind: "attribute", attribute: "dex" }, amount: 1 },
  } as const;

  const OTHER_RULE = {
    id: "other-bonus",
    condition: { familyIds: ["blunt-weapon"] },
    output: { kind: "check", scope: { kind: "attribute", attribute: "dex" }, amount: 9 },
  } as const;

  function registerPair(domain: "trait" | "technique"): void {
    const extra = domain === "technique" ? { mastery: { maximumMastery: 3 } } : {};

    register(domain, {
      id: `owned-${domain}`,
      ...extra,
      implementConditionalRules: [OWNED_RULE],
    });

    register(domain, {
      id: `other-${domain}`,
      ...extra,
      implementConditionalRules: [OTHER_RULE],
    });
  }

  function characterHolding(domain: "trait" | "technique") {
    return domain === "trait"
      ? createTestCharacter({ traits: [{ traitId: "owned-trait" }] })
      : createTestCharacter({ techniques: [{ techniqueId: "owned-technique", mastery: 1 }] });
  }

  function catalogsAnswering(
    domain: "trait" | "technique",
    answer: (id: string) => unknown,
  ) {
    const base = characterContentCatalogs();

    return domain === "trait"
      ? { ...base, getTraitDefinition: answer as never }
      : { ...base, getTechniqueDefinition: answer as never };
  }

  it.each(["trait", "technique"] as const)(
    "refuses a %s catalog answering with a different definition",
    (domain) => {
      registerPair(domain);

      const other = domain === "trait"
        ? characterContentCatalogs().getTraitDefinition(`other-${domain}`)
        : characterContentCatalogs().getTechniqueDefinition(`other-${domain}`);

      const result = collectImplementConditionalRules(
        characterHolding(domain),
        undefined,
        catalogsAnswering(domain, () => other),
      );

      expect(errorCodesOf(result))
        .toContain(`capabilities.implement-rules.${domain}.definition_mismatch`);
    },
  );

  it.each(["trait", "technique"] as const)(
    "brands no borrowed %s rule, under any name",
    (domain) => {
      /*
       * The substance of the mismatch, stated separately from the code: the
       * borrowed rule must not reach the collection at all — not sourced to
       * the content it came from, and emphatically not sourced to the content
       * the character actually has.
       */
      registerPair(domain);

      const other = domain === "trait"
        ? characterContentCatalogs().getTraitDefinition(`other-${domain}`)
        : characterContentCatalogs().getTechniqueDefinition(`other-${domain}`);

      const result = collectImplementConditionalRules(
        characterHolding(domain),
        undefined,
        catalogsAnswering(domain, () => other),
      );

      expect(result.success).toBe(false);

      if (result.success) return;

      expect(JSON.stringify(result)).not.toContain("other-bonus");
    },
  );

  it.each(
    (["trait", "technique"] as const).flatMap((domain) =>
      [null, 42, "owned", true, [], {}, { id: 7 }].map(
        (answer, index) => [domain, index, answer] as const,
      ),
    ),
  )("neither throws nor brands when the %s lookup answers hostile value %i", (domain, _index, answer) => {
    registerPair(domain);

    let result: ReturnType<typeof collectImplementConditionalRules> | undefined;

    expect(() => {
      result = collectImplementConditionalRules(
        characterHolding(domain),
        undefined,
        catalogsAnswering(domain, () => answer),
      );
    }).not.toThrow();

    expect(result?.success).toBe(false);
  });

  it.each(["trait", "technique"] as const)(
    "refuses a %s the catalog does not define at all",
    (domain) => {
      /*
       * The character's own resolution says they have it. A catalog that
       * cannot answer for it is disagreeing with the sheet, and skipping would
       * mean quietly losing a bonus the sheet says they have — the same
       * reasoning malformed authored rules already get.
       */
      registerPair(domain);

      const result = collectImplementConditionalRules(
        characterHolding(domain),
        undefined,
        catalogsAnswering(domain, () => undefined),
      );

      expect(errorCodesOf(result))
        .toContain(`capabilities.implement-rules.${domain}.unknown`);
    },
  );

  it.each(["trait", "technique"] as const)(
    "still collects the %s the character really has",
    (domain) => {
      /* The control every refusal above needs. */
      registerPair(domain);

      const collected = payloadOf(collectImplementConditionalRules(
        characterHolding(domain),
        undefined,
        characterContentCatalogs(),
      ));

      expect(collected.rules).toHaveLength(1);
      expect(collected.rules[0]!.source).toEqual({ type: domain, id: `owned-${domain}` });
      expect(collected.rules[0]!.rule.id).toBe("owned-bonus");
    },
  );

  it("does not throw when the Skill lookup answers with null", () => {
    /*
     * The Skill branch refused a well-shaped definition with the wrong id and
     * still dereferenced a `null`, because its identity check read `.id` off
     * the answer before anything had proved there was an answer to read.
     */
    const skill = validDefinitionFor("skill");

    register("skill", { ...skill, id: "measured-art", requirements: [] });

    const character = createTestCharacter({
      skills: [{ skillId: "measured-art", mastery: 1 }],
    });

    for (const answer of [null, 42, [], { id: 7 }]) {
      let result: ReturnType<typeof collectImplementConditionalRules> | undefined;

      expect(() => {
        result = collectImplementConditionalRules(character, "measured-art", {
          ...characterContentCatalogs(),
          getSkillDefinition: (() => answer) as never,
        });
      }).not.toThrow();

      expect(result?.success).toBe(false);
    }
  });
});


/* -------------------------------------------------------------------------- */
/* A matching id is not a sound definition                                    */
/* -------------------------------------------------------------------------- */

/*
 * The identity boundary proves WHICH Skill answered. It proves nothing about
 * whether the answer is a Skill anyone can use, and
 * `{ id: "measured-art", application: 42 }` passed it: the id matched, the
 * branch proceeded, `resolveSkillApplication()` refused the nonsense
 * application, no rules were collected, and the collector returned an ordinary
 * EMPTY SUCCESS. A broken catalog read as a character with no bonuses.
 *
 * `application: null` was worse. `resolveSkillApplication()` resolves the
 * effective application as `input.definition ?? getSkillDefinition(skillId)
 * ?.application`, so a null supplied definition fell back to the ENGINE's own
 * registry — availability from the global catalog, rules from the caller's,
 * with nothing saying so.
 */
describe("a Skill definition is validated before its application is read", () => {
  const RULE = {
    id: "measured-strike",
    condition: { familyIds: ["blunt-weapon"] },
    output: { kind: "check", scope: { kind: "attribute", attribute: "dex" }, amount: 2 },
  } as const;

  /** A sound Skill in the ENGINE's own catalog, with no conditional rules. */
  function registerSoundSkill(id = "measured-art"): Record<string, unknown> {
    const skill = validDefinitionFor("skill");
    const definition = { ...skill, id, requirements: [] };

    register("skill", definition);

    return definition;
  }

  function holding(id = "measured-art") {
    return createTestCharacter({ skills: [{ skillId: id, mastery: 1 }] });
  }

  function collectWith(
    character: ReturnType<typeof createTestCharacter>,
    answer: unknown,
    skillId = "measured-art",
  ) {
    return collectImplementConditionalRules(character, skillId, {
      ...characterContentCatalogs(),
      getSkillDefinition: (() => answer) as never,
    });
  }

  it.each([
    ["null", null],
    ["a number", 42],
    ["an array", []],
    ["a string", "application"],
    ["a boolean", true],
    ["absent", undefined],
    ["an empty record", {}],
    ["a record with no action", { role: "offense" }],
    ["a record whose targets declare no cardinality", { action: { targets: {} } }],
  ])("refuses a matching-id Skill whose application is %s", (_label, application) => {
    registerSoundSkill();

    const answer: Record<string, unknown> = { id: "measured-art", name: "Measured Art", description: "A Skill a host registered as unchecked JSON.", application };

    if (application === undefined) delete answer["application"];

    let result: ReturnType<typeof collectImplementConditionalRules> | undefined;

    expect(() => {
      result = collectWith(holding(), answer);
    }).not.toThrow();

    expect(result?.success).toBe(false);

    expect(result !== undefined && !result.success && result.errors.map((error) => error.code))
      .toContain("capabilities.implement-rules.skill.definition_invalid");
  });

  it("never falls back to the engine's own catalog for availability", () => {
    /*
     * The split-authority case, stated as its own claim. The engine's
     * "measured-art" is perfectly usable, so a fallback would resolve
     * `available` and then read rules off the caller's broken definition. The
     * refusal is what proves both halves come from one catalog.
     */
    registerSoundSkill();

    const result = collectWith(holding(), {
      id: "measured-art",
      name: "Measured Art",
      description: "A Skill whose application is null.",
      application: null,
    });

    expect(result.success).toBe(false);
  });

  it("carries no authorized collection on a failure", () => {
    registerSoundSkill();

    const result = collectWith(holding(), { id: "measured-art", application: 42 });

    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty("payload");

    /*
     * And nothing resembling a collection travels on the failure by another
     * name — the brand is the only thing the matchers accept, and a refusal
     * must hand over nothing they could take.
     */
    expect(JSON.stringify(result)).not.toContain("rules\":[");
  });

  it("does not let an unlearned Skill hide a malformed conditional rule", () => {
    /*
     * Validation runs BEFORE availability, so a definition broken in a way
     * only a held Skill would ever have reached is still reported. Reading the
     * rules first and the definition second would mean a fault that surfaced
     * the day somebody learned the Skill.
     */
    registerSoundSkill();

    const skill = validDefinitionFor("skill");

    const answer = {
      ...skill,
      id: "measured-art",
      requirements: [],
      application: {
        ...(skill["application"] as Record<string, unknown>),
        implementConditionalRules: 42,
      },
    };

    /* Not held — and still a failure. */
    const result = collectWith(createTestCharacter(), answer);

    expect(errorCodesOf(result))
      .toContain("capabilities.implement-rules.skill.definition_invalid");
  });

  it("takes BOTH availability and rules from the caller's own definition", () => {
    /*
     * The positive form of the split-authority claim. The engine's catalog
     * holds a usable Skill with no conditional rules; the caller supplies a
     * sound definition of the same Skill that declares one. The collected rule
     * has to be the caller's.
     */
    registerSoundSkill();

    const skill = validDefinitionFor("skill");

    const collected = payloadOf(collectWith(holding(), {
      ...skill,
      id: "measured-art",
      requirements: [],
      application: {
        ...(skill["application"] as Record<string, unknown>),
        implementConditionalRules: [RULE],
      },
    }));

    expect(collected.rules).toHaveLength(1);
    expect(collected.rules[0]!.rule.id).toBe("measured-strike");
    expect(collected.rules[0]!.source).toEqual({ type: "skill", id: "measured-art" });

    /* And the engine's own definition really does declare none. */
    expect(payloadOf(collectImplementConditionalRules(
      holding(),
      "measured-art",
      characterContentCatalogs(),
    )).rules).toEqual([]);
  });

  it("reads availability from the caller's definition too", () => {
    /*
     * The other half. The caller's definition gates the attempt behind a
     * Trait nobody has; the engine's does not. If availability came from the
     * engine's catalog the rule would be collected, which is exactly the
     * fallback this repair removed.
     */
    registerSoundSkill();

    const skill = validDefinitionFor("skill");

    const collected = payloadOf(collectWith(holding(), {
      ...skill,
      id: "measured-art",
      requirements: [],
      application: {
        ...(skill["application"] as Record<string, unknown>),
        implementConditionalRules: [RULE],
        requirements: [{
          id: "needs-a-trait",
          summary: "Requires a Trait nobody has.",
          requirement: { type: "hasTrait", traitId: "never-registered" },
        }],
      },
    }));

    expect(collected.rules).toEqual([]);
  });

  it("still leaves a sound, unlearned Skill an empty success", () => {
    /*
     * The control that keeps every refusal above meaningful. "The character
     * has not learned it" is a fact about the character, not a broken catalog.
     */
    registerSoundSkill();

    const result = collectImplementConditionalRules(
      createTestCharacter(),
      "measured-art",
      characterContentCatalogs(),
    );

    expect(result.success).toBe(true);
    expect(payloadOf(result).rules).toEqual([]);
  });
});
