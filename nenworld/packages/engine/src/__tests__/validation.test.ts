/*
 * Tests character and attribute validation, including failure diagnostics
 * and the explanation traces returned by the engine.
 */

import { describe, expect, it } from "vitest";

import { validateAttributes } from "../character/foundation/attributes/validation";
import { validateCharacter } from "../character/validation";

import { createTestCharacter, TEST_ATTRIBUTES } from "./fixtures/character";

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
      name: "",
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
