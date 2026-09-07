/*
 * "Does not have it" and "nobody has said" are different answers.
 *
 * Character collections are optional so a half-built sheet still resolves.
 * Until this ticket, buildRequirementContext() answered `?? []` for every one
 * of them, so by the time a requirement was evaluated an unrecorded Trait list
 * and a recorded empty one were the same value — and every consumer confidently
 * reported the first as "you lack that Trait".
 *
 * These tests pin the distinction at both ends: in the evaluator, and through
 * the context builder that feeds it.
 */

import { describe, expect, it } from "vitest";

import type { Attributes } from "../character/foundation/attributes/types";
import type { Character } from "../character/types";
import type { Requirement } from "../character/rules/requirements";
import {
  meetsAllRequirements,
  meetsRequirement,
  resolveAllRequirements,
  resolveRequirement,
  type RequirementContext,
} from "../character/rules/resolution";
import {
  clearCustomDefinitions,
  registerDefinition,
} from "../character/catalogs";
import { findCapabilityValidationIssues } from "../character/capabilities/validation";
import { validateCharacter } from "../character/validation";
import { prepareCharacterActionInputs } from "../character/actions/preparation";
import {
  NO_FOCUS,
  NO_STRUCTURED_ACTION_COST,
  UNSTRUCTURED_EXECUTION,
  adjudicateAction,
  prepareAction,
  settleAction,
  type ActionIntent,
  type ActionProfile,
} from "../actions";
import { NO_TARGETS } from "../targeting";
import { seconds } from "../time/duration";
import { errorCodesOf, payloadOf } from "./fixtures/result";

/* A trivial action, so the only thing deciding its fate is the requirement. */
const GATED_PROFILE: ActionProfile = {
  id: "gated-action",
  source: { type: "skill", id: "presence-warning-skill" },
  allowedTimings: ["action"],
  structuredActionCost: NO_STRUCTURED_ACTION_COST,
  targets: { cardinality: NO_TARGETS },
  permittedFocusKinds: ["none"],
  executionDuration: seconds(1),
};

const GATED_INTENT: ActionIntent = {
  id: "gated-intent",
  profileId: GATED_PROFILE.id,
  actor: { type: "character", id: "gon" },
  targets: [],
  focus: NO_FOCUS,
  executionContext: UNSTRUCTURED_EXECUTION,
};
import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";

const FLAT: Attributes = {
  agi: 10, dex: 10, con: 10, vit: 10,
  int: 10, wis: 10, per: 10, spi: 10, cha: 10,
};

function contextWith(
  overrides: Partial<RequirementContext> = {},
): RequirementContext {
  return {
    attributes: { stored: FLAT, base: FLAT, resolved: FLAT },
    level: 1,
    ...overrides,
  };
}

const HAS_TRAIT: Requirement = { type: "hasTrait", traitId: "firebending" };
const DEX_10: Requirement = {
  type: "attributeMinimum",
  layer: "resolved",
  attribute: "dex",
  minimum: 10,
};
const DEX_99: Requirement = { ...DEX_10, minimum: 99 };

/* A sheet with one collection deliberately never recorded. */
function without<K extends keyof Character>(key: K): Character {
  const character = { ...createTestCharacter() };

  delete character[key];

  return character;
}


describe("absent and known-empty are different answers", () => {
  it("reports an unrecorded collection as unresolved", () => {
    expect(resolveRequirement(HAS_TRAIT, contextWith())).toBe("unresolved");
  });

  it("reports a recorded empty collection as unsatisfied", () => {
    expect(resolveRequirement(HAS_TRAIT, contextWith({ traitIds: [] })))
      .toBe("unsatisfied");
  });

  it("reports a recorded matching collection as satisfied", () => {
    expect(
      resolveRequirement(HAS_TRAIT, contextWith({ traitIds: ["firebending"] })),
    ).toBe("satisfied");
  });
});


describe("every collection a requirement reads keeps the distinction", () => {
  const cases: readonly (readonly [
    string,
    Requirement,
    Partial<RequirementContext>,
    Partial<RequirementContext>,
  ])[] = [
    [
      "species",
      { type: "hasSpecies", speciesId: "human" },
      { speciesIds: [] },
      { speciesIds: ["human"] },
    ],
    [
      "sub-species",
      { type: "hasSubspecies", subspeciesId: "firebender" },
      { subspeciesIds: [] },
      { subspeciesIds: ["firebender"] },
    ],
    [
      "clans",
      { type: "hasClan", clanId: "kurta" },
      { clanIds: [] },
      { clanIds: ["kurta"] },
    ],
    [
      "traits",
      HAS_TRAIT,
      { traitIds: [] },
      { traitIds: ["firebending"] },
    ],
    [
      "skills",
      { type: "hasSkill", skillId: "riposte" },
      { skillMastery: {} },
      { skillMastery: { riposte: 1 } },
    ],
    [
      "skill mastery",
      { type: "skillMastery", skillId: "riposte", minimumMastery: 3 },
      { skillMastery: {} },
      { skillMastery: { riposte: 3 } },
    ],
    [
      "techniques",
      { type: "hasTechnique", techniqueId: "ten" },
      { techniqueMastery: {} },
      { techniqueMastery: { ten: 1 } },
    ],
    [
      "technique mastery",
      { type: "techniqueMastery", techniqueId: "ten", minimumMastery: 2 },
      { techniqueMastery: {} },
      { techniqueMastery: { ten: 2 } },
    ],
    [
      "conditions",
      { type: "hasCondition", conditionId: "prone" },
      { conditionIds: [] },
      { conditionIds: ["prone"] },
    ],
    [
      "possessed items",
      { type: "hasItem", itemId: "rope", state: "possessed" },
      { items: { possessed: [], equipped: [] } },
      { items: { possessed: ["rope"], equipped: [] } },
    ],
    [
      "equipped items",
      { type: "hasItem", itemId: "blade", state: "equipped" },
      { items: { possessed: [], equipped: [] } },
      { items: { possessed: [], equipped: ["blade"] } },
    ],
  ];

  it.each(cases)(
    "%s: unresolved when absent, unsatisfied when empty, satisfied when present",
    (_name, requirement, empty, present) => {
      expect(resolveRequirement(requirement, contextWith())).toBe("unresolved");
      expect(resolveRequirement(requirement, contextWith(empty)))
        .toBe("unsatisfied");
      expect(resolveRequirement(requirement, contextWith(present)))
        .toBe("satisfied");
    },
  );

  it("always decides attributes and Level, which are never absent", () => {
    expect(resolveRequirement(DEX_10, contextWith())).toBe("satisfied");
    expect(resolveRequirement(DEX_99, contextWith())).toBe("unsatisfied");
    expect(resolveRequirement({ type: "levelMinimum", minimum: 1 }, contextWith()))
      .toBe("satisfied");
  });
});


describe("compound requirements propagate unresolved", () => {
  const recordedEmpty = contextWith({ traitIds: [] });
  const recordedHas = contextWith({ traitIds: ["firebending"] });

  it("all: a definite no outranks an open question", () => {
    expect(resolveRequirement(
      { type: "all", requirements: [DEX_99, HAS_TRAIT] },
      contextWith(),
    )).toBe("unsatisfied");
  });

  it("all: unresolved when nothing failed but something is unknown", () => {
    expect(resolveRequirement(
      { type: "all", requirements: [DEX_10, HAS_TRAIT] },
      contextWith(),
    )).toBe("unresolved");
  });

  it("all: satisfied only when every member is", () => {
    expect(resolveRequirement(
      { type: "all", requirements: [DEX_10, HAS_TRAIT] },
      recordedHas,
    )).toBe("satisfied");
  });

  it("any: a definite yes outranks an open question", () => {
    expect(resolveRequirement(
      { type: "any", requirements: [DEX_10, HAS_TRAIT] },
      contextWith(),
    )).toBe("satisfied");
  });

  it("any: unresolved when nothing passed but something is unknown", () => {
    expect(resolveRequirement(
      { type: "any", requirements: [DEX_99, HAS_TRAIT] },
      contextWith(),
    )).toBe("unresolved");
  });

  it("any: unsatisfied only when every member is decided and none passed", () => {
    expect(resolveRequirement(
      { type: "any", requirements: [DEX_99, HAS_TRAIT] },
      recordedEmpty,
    )).toBe("unsatisfied");
  });

  it("not: inverts the two definite answers", () => {
    expect(resolveRequirement({ type: "not", requirement: HAS_TRAIT }, recordedEmpty))
      .toBe("satisfied");
    expect(resolveRequirement({ type: "not", requirement: HAS_TRAIT }, recordedHas))
      .toBe("unsatisfied");
  });

  it("not: leaves unresolved alone", () => {
    /*
     * The one inversion that is not an inversion. Not knowing whether they
     * have it is not knowing whether they lack it either.
     */
    expect(resolveRequirement({ type: "not", requirement: HAS_TRAIT }, contextWith()))
      .toBe("unresolved");
  });

  it("nests to any depth", () => {
    expect(resolveRequirement({
      type: "all",
      requirements: [
        DEX_10,
        { type: "any", requirements: [{ type: "not", requirement: HAS_TRAIT }] },
      ],
    }, contextWith())).toBe("unresolved");
  });

  it("treats an empty list as no prerequisites", () => {
    expect(resolveAllRequirements([], contextWith())).toBe("satisfied");
  });
});


describe("incompleteness survives the context builder", () => {
  it.each([
    ["species", ["species", "subspecies"]],
    ["clans", ["clans"]],
    ["traits", ["traits"]],
    ["skills", ["skills"]],
    ["techniques", ["techniques"]],
    ["conditions", ["conditions"]],
    ["items", ["items"]],
  ] as const)("marks %s incomplete when the sheet never recorded it", (key, marked) => {
    const context = resolveTestCharacter(without(key)).requirementContext;

    for (const collection of marked) {
      expect(context.incomplete).toContain(collection);
    }
  });

  it("marks nothing incomplete on a fully recorded sheet", () => {
    expect(resolveTestCharacter(createTestCharacter()).requirementContext.incomplete)
      .toBeUndefined();
  });

  it("records an empty collection as complete and empty", () => {
    const context = resolveTestCharacter(
      createTestCharacter({ traits: [] }),
    ).requirementContext;

    expect(context.traitIds).toEqual([]);
    expect(context.incomplete).toBeUndefined();
    expect(resolveRequirement(HAS_TRAIT, context)).toBe("unsatisfied");
  });

  it("leaves an unobserved Trait unresolved while the list is unrecorded", () => {
    const context = resolveTestCharacter(without("traits")).requirementContext;

    expect(resolveRequirement(HAS_TRAIT, context)).toBe("unresolved");
  });

  it("gives a fully populated character its established answers", () => {
    /*
     * The regression guard. Every fixture character records every collection,
     * so nothing about a complete sheet changes: definite answers stay
     * definite, in both directions.
     */
    const context = resolveTestCharacter(
      createTestCharacter({ attributes: { dex: 14 } }),
    ).requirementContext;

    expect(resolveRequirement(DEX_10, context)).toBe("satisfied");
    expect(resolveRequirement(DEX_99, context)).toBe("unsatisfied");
    expect(resolveRequirement(HAS_TRAIT, context)).toBe("unsatisfied");
    expect(resolveRequirement({ type: "hasSpecies", speciesId: "human" }, context))
      .toBe("satisfied");

    expect(meetsRequirement(DEX_10, context)).toBe(true);
    expect(meetsRequirement(HAS_TRAIT, context)).toBe(false);
  });
});


describe("a known member satisfies even when the collection is incomplete", () => {
  /*
   * The asymmetry this amendment exists for. Seeing the id settles the
   * question; not seeing it settles nothing until the collection is complete.
   */
  const INCOMPLETE_TRAITS = { incomplete: ["traits"] } as const;

  it("satisfies on a known id inside an incomplete collection", () => {
    expect(resolveRequirement(HAS_TRAIT, contextWith({
      traitIds: ["firebending"],
      ...INCOMPLETE_TRAITS,
    }))).toBe("satisfied");
  });

  it("stays unresolved for an id the incomplete collection does not show", () => {
    expect(resolveRequirement(
      { type: "hasTrait", traitId: "waterbending" },
      contextWith({ traitIds: ["firebending"], ...INCOMPLETE_TRAITS }),
    )).toBe("unresolved");
  });

  it("answers definitively once the collection is complete", () => {
    expect(resolveRequirement(
      { type: "hasTrait", traitId: "waterbending" },
      contextWith({ traitIds: ["firebending"] }),
    )).toBe("unsatisfied");
  });

  it("treats a recorded mastery as definitive in both directions", () => {
    /*
     * A Skill cannot appear twice, so a rank below the minimum is a real
     * shortfall rather than a hint that a better entry is unrecorded. Only an
     * id absent altogether can be hiding in the unwritten part.
     */
    const partial = contextWith({
      skillMastery: { riposte: 1 },
      incomplete: ["skills"],
    });

    expect(resolveRequirement({ type: "hasSkill", skillId: "riposte" }, partial))
      .toBe("satisfied");

    expect(resolveRequirement(
      { type: "skillMastery", skillId: "riposte", minimumMastery: 3 },
      partial,
    )).toBe("unsatisfied");

    expect(resolveRequirement({ type: "hasSkill", skillId: "parry" }, partial))
      .toBe("unresolved");
  });
});


describe("a Species-granted Trait is known without an authored Trait list", () => {
  const GRANTED = "presence-granted-trait";
  const GRANTING_SPECIES = "presence-granting-species";

  function registerGrantingSpecies(): void {
    registerDefinition("trait", {
      id: GRANTED,
      name: "Granted Trait",
      description: "A test Trait handed out by a Species.",
    });

    registerDefinition("species", {
      id: GRANTING_SPECIES,
      name: "Granting Species",
      description: "A test Species that grants a Trait.",
      parentSpeciesId: "human",
      effects: [{ type: "grantTrait", traitId: GRANTED }],
    });
  }

  const NEEDS_GRANTED: Requirement = { type: "hasTrait", traitId: GRANTED };

  it("satisfies hasTrait even though authored Traits are unrecorded", () => {
    registerGrantingSpecies();

    const sheet: Character = {
      ...without("traits"),
      species: [{ speciesId: GRANTING_SPECIES, percentage: 100 }],
    };

    const context = resolveTestCharacter(sheet).requirementContext;

    expect(context.incomplete).toContain("traits");
    expect(context.traitIds).toContain(GRANTED);
    expect(resolveRequirement(NEEDS_GRANTED, context)).toBe("satisfied");

    clearCustomDefinitions();
  });

  it("leaves every OTHER Trait unresolved on the same sheet", () => {
    registerGrantingSpecies();

    const sheet: Character = {
      ...without("traits"),
      species: [{ speciesId: GRANTING_SPECIES, percentage: 100 }],
    };

    const context = resolveTestCharacter(sheet).requirementContext;

    expect(resolveRequirement(HAS_TRAIT, context)).toBe("unresolved");

    clearCustomDefinitions();
  });

  it("is unresolved when the Species data is also unrecorded", () => {
    /*
     * Nothing grants the Trait now, because nothing says what the character
     * is. Neither the Trait nor the Species can be confirmed or denied.
     */
    const bare: Record<string, unknown> = { ...createTestCharacter() };

    delete bare.traits;
    delete bare.species;

    const context = resolveTestCharacter(bare as never).requirementContext;

    expect(context.incomplete).toEqual(
      expect.arrayContaining(["species", "subspecies", "traits"]),
    );
    expect(resolveRequirement(NEEDS_GRANTED, context)).toBe("unresolved");
    expect(resolveRequirement(
      { type: "hasSpecies", speciesId: GRANTING_SPECIES },
      context,
    )).toBe("unresolved");
  });

  it("answers definitively once both collections are recorded", () => {
    registerGrantingSpecies();

    const complete = createTestCharacter({
      traits: [],
      species: [{ speciesId: GRANTING_SPECIES, percentage: 100 }],
    });

    const context = resolveTestCharacter(complete).requirementContext;

    expect(context.incomplete).toBeUndefined();
    expect(resolveRequirement(NEEDS_GRANTED, context)).toBe("satisfied");
    expect(resolveRequirement(HAS_TRAIT, context)).toBe("unsatisfied");

    clearCustomDefinitions();
  });
});


describe("the boolean helpers are explicitly lossy", () => {
  it("collapses unresolved to false, exactly like unsatisfied", () => {
    /*
     * Documented, not accidental. It is the right answer for "may this
     * proceed" and the wrong one for "why not" — which is why anything
     * producing a diagnostic uses the tri-state evaluator instead.
     */
    expect(resolveRequirement(HAS_TRAIT, contextWith())).toBe("unresolved");
    expect(meetsRequirement(HAS_TRAIT, contextWith())).toBe(false);

    expect(resolveRequirement(HAS_TRAIT, contextWith({ traitIds: [] })))
      .toBe("unsatisfied");
    expect(meetsRequirement(HAS_TRAIT, contextWith({ traitIds: [] }))).toBe(false);
  });

  it("agrees with the tri-state evaluator on every satisfied case", () => {
    const contexts = [
      contextWith(),
      contextWith({ traitIds: [] }),
      contextWith({ traitIds: ["firebending"] }),
    ];

    for (const context of contexts) {
      expect(meetsRequirement(HAS_TRAIT, context))
        .toBe(resolveRequirement(HAS_TRAIT, context) === "satisfied");

      expect(meetsAllRequirements([HAS_TRAIT], context))
        .toBe(resolveAllRequirements([HAS_TRAIT], context) === "satisfied");
    }
  });
});


describe("an incomplete sheet warns rather than failing validation", () => {
  const GATED = "presence-warning-skill";

  function registerGatedSkill(): void {
    registerDefinition("skill", {
      id: GATED,
      name: "Gated Skill",
      description: "A test Skill gated on one Trait and nothing else.",
      timings: ["action"],
      maximumMastery: 10,
      requirements: [HAS_TRAIT],
    });
  }

  function halfBuiltSheet(): Character {
    return {
      ...without("traits"),
      skills: [{ skillId: GATED, mastery: 1 }],
    };
  }

  it("validates successfully, with a warning naming the incompleteness", () => {
    /*
     * The Workbench is where characters get finished. An engine that refuses
     * to resolve a half-built one cannot help build it — the same reason a
     * missing Species has always been a warning.
     */
    registerGatedSkill();

    const result = validateCharacter(halfBuiltSheet());

    expect(result.success).toBe(true);

    const codes = result.warnings.map((warning) => warning.code);

    expect(codes).toContain("character.skill.requirements_unresolved");

    if (!result.success) throw new Error("unreachable");

    clearCustomDefinitions();
  });

  it("keeps the guidance that a Warning has no field for", () => {
    registerGatedSkill();

    const warning = validateCharacter(halfBuiltSheet()).warnings
      .find((one) => one.code === "character.skill.requirements_unresolved");

    expect(warning?.message).toContain("cannot be judged");
    expect(warning?.message).toContain("Record the Species");

    clearCustomDefinitions();
  });

  it("still fails validation when a requirement is genuinely unmet", () => {
    registerGatedSkill();

    const complete = createTestCharacter({
      traits: [],
      skills: [{ skillId: GATED, mastery: 1 }],
    });

    const result = validateCharacter(complete);

    expect(result.success).toBe(false);

    if (result.success) throw new Error("unreachable");

    expect(result.errors.map((error) => error.code))
      .toContain("character.skill.requirements_unsatisfied");

    clearCustomDefinitions();
  });

  it("does NOT make the requirement pass", () => {
    /*
     * The distinction the demotion must not blur. A resolvable sheet is not a
     * satisfied prerequisite: the requirement is still unresolved, the action
     * adapter still says so, the proposal reads missing-facts, and settlement
     * refuses to commit.
     */
    registerGatedSkill();

    const resolved = resolveTestCharacter(halfBuiltSheet());

    expect(resolveRequirement(HAS_TRAIT, resolved.requirementContext))
      .toBe("unresolved");

    const inputs = payloadOf(prepareCharacterActionInputs({
      resolved,
      requirements: [{ id: "gated", requirement: HAS_TRAIT }],
    }));

    expect(inputs.eligibility[0]?.status).toBe("unresolved");

    const proposal = payloadOf(prepareAction({
      operationId: "op-presence",
      profile: GATED_PROFILE,
      intent: GATED_INTENT,
      approach: "mechanical",
      eligibility: inputs.eligibility,
    }));

    expect(proposal.disposition).toBe("missing-facts");

    const adjudicated = payloadOf(adjudicateAction({
      operationId: "op-presence",
      proposal,
      approach: "mechanical",
      decision: { kind: "accept" },
    }));

    expect(errorCodesOf(settleAction({
      adjudicated,
      context: { operationId: "op-presence", occurredAt: 0 },
      states: {},
      handlers: { costs: [], effects: [] },
    }))).toContain("actions.settlement.not-settleable");

    clearCustomDefinitions();
  });
});


describe("capability validation does not call incomplete data a failure", () => {
  /*
   * A unique id on purpose. The shipped catalog already has a `fire-blast`
   * gated on a Trait AND a Technique, and registering over it silently leaves
   * the built-in in place — so the test would be measuring the catalog's
   * requirements rather than its own, and the extra Technique gate would
   * decide the result.
   */
  const GATED = "presence-gated-skill";

  function registerGatedSkill(): void {
    registerDefinition("skill", {
      id: GATED,
      name: "Gated Skill",
      description: "A test Skill gated on one Trait and nothing else.",
      timings: ["action"],
      maximumMastery: 10,
      requirements: [HAS_TRAIT],
    });
  }

  it("reports unresolved, not unsatisfied, for an unrecorded sheet", () => {
    registerGatedSkill();

    const halfBuilt: Character = {
      ...without("traits"),
      skills: [{ skillId: GATED, mastery: 1 }],
    };
    const context = resolveTestCharacter(halfBuilt).requirementContext;

    const issues = findCapabilityValidationIssues(
      halfBuilt.techniques ?? [],
      halfBuilt.skills ?? [],
      context,
    );

    expect(issues.map((issue) => issue.type))
      .toContain("unresolved-skill-requirements");
    expect(issues.map((issue) => issue.type))
      .not.toContain("unsatisfied-skill-requirements");

    clearCustomDefinitions();
  });

  it("still reports a genuine failure as unsatisfied", () => {
    registerGatedSkill();

    const complete = createTestCharacter({
      traits: [],
      skills: [{ skillId: GATED, mastery: 1 }],
    });

    const issues = findCapabilityValidationIssues(
      complete.techniques ?? [],
      complete.skills ?? [],
      resolveTestCharacter(complete).requirementContext,
    );

    expect(issues.map((issue) => issue.type))
      .toContain("unsatisfied-skill-requirements");
    expect(issues.map((issue) => issue.type))
      .not.toContain("unresolved-skill-requirements");

    clearCustomDefinitions();
  });
});
