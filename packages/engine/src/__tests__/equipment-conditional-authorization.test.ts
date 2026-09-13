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

import { payloadOf } from "./fixtures/result";
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
     * and the cast is what an untyped host effectively writes.
     */
    registerGatedSkill("forbidden-art");

    const forged = { skillId: "forbidden-art", disposition: "available" };

    const character = createTestCharacter();

    expect(collectFor(character, forged as unknown as string).rules).toEqual([]);
  });

  it("collects nothing for a Skill the character has never learned", () => {
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

  it("collects nothing when a catalog answers with a different Skill", () => {
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

    expect(collectFor(character, "measured-art", {
      ...characterContentCatalogs(),
      getSkillDefinition: () => characterContentCatalogs().getSkillDefinition("other-art"),
    }).rules).toEqual([]);
  });

  it("collects nothing for a Skill no catalog defines", () => {
    expect(collectFor(createTestCharacter(), "no-such-skill").rules).toEqual([]);
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
