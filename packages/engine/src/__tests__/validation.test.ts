/*
 * Tests character and attribute validation, including failure diagnostics
 * and the explanation traces returned by the engine.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";
import { validateAttributes } from "../character/foundation/attributes/validation";
import { validateCharacter } from "../character/validation";

import {
  findEffectsValidationIssues,
  findRequirementValidationIssues,
  findRequirementsValidationIssues,
  findRuleValidationIssues,
  MAX_REQUIREMENT_DEPTH,
} from "../character/rules/validation";
import type { Requirement } from "../character/rules/requirements";

import { createTestCharacter, TEST_ATTRIBUTES } from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});

describe("validateAttributes", () => {
  it("accepts valid attributes", () => {
    const result = validateAttributes(TEST_ATTRIBUTES);

    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.trace.root).toBeDefined();
  });

  it("rejects an attribute below the minimum", () => {
    const result = validateAttributes({
      ...TEST_ATTRIBUTES,
      str: 0,
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "character.attribute.out_of_range",
            actual: 0,
          }),
        ]),
      );
    }
  });

  it("rejects an attribute above the maximum", () => {
    const result = validateAttributes({
      ...TEST_ATTRIBUTES,
      dex: 31,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a non-integer attribute", () => {
    const result = validateAttributes({
      ...TEST_ATTRIBUTES,
      con: 10.5,
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors[0].code).toBe("character.attribute.not_integer");
    }
  });

  it("reports a non-finite attribute as a JSON-safe string", () => {
    const result = validateAttributes({
      ...TEST_ATTRIBUTES,
      vit: Number.NaN,
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          code: "character.attribute.not_integer",
          actual: "NaN",
        }),
      );
    }
  });
});

describe("validateCharacter", () => {
  it("accepts a valid character", () => {
    const character = createTestCharacter();

    const result = validateCharacter(character);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.payload).toBe(character);
    }
  });

  it("rejects an empty name", () => {
    const character = createTestCharacter({
      details: { name: "" },
    });

    const result = validateCharacter(character);

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          code: "character.name.empty",
          audience: "player",
        }),
      );
    }
  });

  it("propagates attribute errors onto the character", () => {
    const character = createTestCharacter({
      attributes: {
        vit: 31,
      },
    });

    const result = validateCharacter(character);

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "character.attribute.out_of_range",
            subject: {
              kind: "character",
              id: character.id,
            },
          }),
        ]),
      );
    }
  });

  it("includes attribute and reference validation beneath the character trace", () => {
    const result = validateCharacter(createTestCharacter());

    expect(result.trace.root.children.map((child) => child.id)).toEqual([
      "character.attributes.validate",
      "character.references.validate",
    ]);
  });

  it("reports a broken catalog reference as a character error", () => {
    const character = createTestCharacter({
      traits: [
        {
          traitId: "not-a-real-trait",
        },
      ],
    });

    const result = validateCharacter(character);

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "character.trait.unknown",
            message: 'Unknown Trait "not-a-real-trait".',
            subject: {
              kind: "character",
              id: character.id,
            },
          }),
        ]),
      );
    }
  });

  it("reports an unsatisfied Skill prerequisite as a character error", () => {
    const result = validateCharacter(
      createTestCharacter({
        skills: [
          {
            skillId: "punch",
          },
        ],
      }),
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "character.skill.requirements_unsatisfied",
          }),
        ]),
      );
    }
  });

  // Prerequisites are judged against the resolved character, so a Skill the
  // sheet lists is legal when something else supplies what it asks for.
  it("accepts a Skill whose prerequisite is met by a Technique", () => {
    const result = validateCharacter(
      createTestCharacter({
        techniques: [{ techniqueId: "martial-arts" }],
        skills: [{ skillId: "punch" }],
      }),
    );

    expect(result.success).toBe(true);
  });

  it("accepts a Skill whose prerequisite is met through a Sub-species grant", () => {
    const result = validateCharacter(
      createTestCharacter({
        species: [{ speciesId: "firebender", percentage: 100 }],
        techniques: [{ techniqueId: "firebending-forms" }],
        skills: [{ skillId: "fire-blast" }],
      }),
    );

    expect(result.success).toBe(true);
  });

  // The same character without the ancestry that grants the Trait: the
  // training alone is not enough, which is the rule the old two-part gate
  // expressed and this one still does.
  it("rejects the same Skill when the granting ancestry is absent", () => {
    const result = validateCharacter(
      createTestCharacter({
        techniques: [{ techniqueId: "firebending-forms" }],
        skills: [{ skillId: "fire-blast" }],
      }),
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors.map((error) => error.code)).toContain(
        "character.skill.requirements_unsatisfied",
      );
    }
  });

  it("rejects a Mastery beyond what the capability's track allows", () => {
    const result = validateCharacter(
      createTestCharacter({
        techniques: [{ techniqueId: "lockpicking", mastery: 8 }],
      }),
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "character.technique.mastery_invalid",
          }),
        ]),
      );
    }
  });

  it("reports a broken inventory reference", () => {
    const result = validateCharacter(
      createTestCharacter({
        items: [{ itemId: "not-real", quantity: 1, equipped: false }],
      }),
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors.map((error) => error.code)).toContain(
        "character.item.unknown",
      );
    }
  });

  // Resolution runs during validation, so content that grants in a loop must
  // not hang the validator that is trying to report it.
  it("validates a character whose Traits grant each other", () => {
    registerDefinition("trait", {
      id: "yin",
      name: "Yin",
      description: "A test Trait.",
      effects: [{ type: "grantTrait", traitId: "yang" }],
    });

    registerDefinition("trait", {
      id: "yang",
      name: "Yang",
      description: "A test Trait.",
      effects: [{ type: "grantTrait", traitId: "yin" }],
    });

    expect(
      validateCharacter(createTestCharacter({ traits: [{ traitId: "yin" }] }))
        .success,
    ).toBe(true);
  });

  // An unfinished character is not a malformed one: the workbench needs to be
  // able to compute with a sheet that is still being filled in.
  it("warns rather than fails when the Species is missing", () => {
    const { species, ...withoutSpecies } = createTestCharacter();

    const result = validateCharacter(withoutSpecies);

    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "character.species.missing",
      }),
    ]);
  });
});


/*
 * Rule validation is about the shape of authored data, not about whether a
 * character satisfies it. A Workbench author needs to be told their effect is
 * malformed while they are writing it, before any character references it.
 */
describe("rule validation", () => {
  it("accepts well-formed rules", () => {
    expect(
      findRuleValidationIssues(
        [{ type: "modifyBaseAttribute", attribute: "str", amount: 2 }],
        [{ type: "hasTrait", traitId: "firebending" }],
      ),
    ).toEqual([]);
  });

  it("rejects a non-finite modifier", () => {
    expect(
      findEffectsValidationIssues([
        {
          type: "modifyResolvedAttribute",
          attribute: "str",
          amount: Number.POSITIVE_INFINITY,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        type: "invalid-effect-amount",
        path: "effects[0].amount",
      }),
    ]);
  });

  it("rejects a grant with a blank reference", () => {
    expect(
      findEffectsValidationIssues([{ type: "grantSkill", skillId: "   " }]),
    ).toEqual([
      expect.objectContaining({
        type: "missing-effect-reference",
        field: "skillId",
      }),
    ]);
  });

  it("rejects a Mastery requirement that is not a rank", () => {
    expect(
      findRequirementValidationIssues({
        type: "skillMastery",
        skillId: "parry",
        minimumMastery: 0,
      }),
    ).toEqual([
      expect.objectContaining({ type: "invalid-requirement-mastery" }),
    ]);
  });

  // An empty "all" is not a requirement nobody has to meet; it is an
  // unfinished edit, and reading it as a pass would silently open the gate.
  it("rejects an empty compound requirement", () => {
    expect(
      findRequirementValidationIssues({ type: "all", requirements: [] }),
    ).toEqual([
      expect.objectContaining({ type: "empty-compound-requirement" }),
    ]);
  });

  it("points at the exact field inside a nested requirement", () => {
    const issues = findRequirementsValidationIssues([
      {
        type: "all",
        requirements: [
          {
            type: "any",
            requirements: [{ type: "hasTrait", traitId: "" }],
          },
        ],
      },
    ]);

    expect(issues[0]?.path).toBe(
      "requirements[0].requirements[0].requirements[0].traitId",
    );
  });

  it("stops at an unreasonably deep requirement tree", () => {
    let requirement: Requirement = { type: "levelMinimum", minimum: 1 };

    for (let depth = 0; depth < MAX_REQUIREMENT_DEPTH + 2; depth += 1) {
      requirement = { type: "not", requirement };
    }

    expect(findRequirementValidationIssues(requirement)).toEqual([
      expect.objectContaining({ type: "requirement-depth-exceeded" }),
    ]);
  });
});
