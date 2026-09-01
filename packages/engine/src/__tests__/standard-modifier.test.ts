/*
 * Tests the standard modifier ladder — floor((score - 10) / 2) — and the
 * ResolvedScore bundlers built on it.
 *
 * The point of these tests is that there is exactly ONE ladder: an Attribute
 * score and a Derived Attribute score of the same value must produce the same
 * modifier, because the Rulebook prints one table, not two.
 */

import { describe, expect, it } from "vitest";

import {
  STANDARD_MODIFIER_DIVISOR,
  STANDARD_MODIFIER_REFERENCE_SCORE,
  deriveStandardModifier,
  resolveAttributeScores,
} from "../character/foundation/attributes/resolution";
import { ATTRIBUTE_KEYS } from "../character/foundation/attributes/base";
import {
  resolveDerivedAttributes,
  resolveDerivedScores,
} from "../character/foundation/attributes/derived/resolution";
import { DERIVED_ATTRIBUTE_NAMES } from "../character/foundation/attributes/derived/types";
import type { Attributes } from "../character/foundation/attributes/types";

import { TEST_ATTRIBUTES } from "./fixtures/character";
import { createCharacterStats } from "../character/foundation/attributes/stats";

describe("the ladder printed in the Rulebook", () => {
  it.each([
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [13, 1],
    [14, 2],
    [15, 2],
    [16, 3],
    [17, 3],
    [18, 4],
    [19, 4],
    [20, 5],
    [21, 5],
    [22, 6],
    [23, 6],
    [24, 7],
    [25, 7],
    [26, 8],
    [27, 8],
    [28, 9],
    [29, 9],
    [30, 10],
  ])("score %i -> %i", (score, expected) => {
    expect(deriveStandardModifier(score)).toBe(expected);
  });
});

describe("beyond the printed table", () => {
  /*
   * The printed table stops at the stored 1-30 range, but Base and Resolved
   * scores are not bound by it — a Condition may drive a score below 1, and
   * unusual content may push one above 30. A formula extends; a lookup table
   * would not, which is why this is a formula.
   */
  it.each([
    [7, -2],
    [6, -2],
    [1, -5],
    [0, -5],
    [-1, -6],
    [-10, -10],
    [31, 10],
    [40, 15],
  ])("score %i -> %i", (score, expected) => {
    expect(deriveStandardModifier(score)).toBe(expected);
  });

  it("floors rather than truncates, so odd negatives round down", () => {
    // -1 / 2 is -0.5; truncation would give 0, flooring gives -1.
    expect(deriveStandardModifier(9)).toBe(-1);
    // 7 - 10 = -3; -3 / 2 is -1.5 -> -2, not -1.
    expect(deriveStandardModifier(7)).toBe(-2);
  });
});

describe("the constants describe the formula", () => {
  it("puts +0 at the reference score", () => {
    expect(deriveStandardModifier(STANDARD_MODIFIER_REFERENCE_SCORE)).toBe(0);
  });

  it("takes one divisor's worth of score per point of modifier", () => {
    const score = STANDARD_MODIFIER_REFERENCE_SCORE;

    expect(deriveStandardModifier(score + STANDARD_MODIFIER_DIVISOR)).toBe(1);
    expect(deriveStandardModifier(score - STANDARD_MODIFIER_DIVISOR)).toBe(-1);
  });
});

describe("one ladder for both kinds of score", () => {
  it("gives an Attribute and a Derived Attribute of the same value the same modifier", () => {
    const attributes: Attributes = { ...TEST_ATTRIBUTES, agi: 17, dex: 17 };

    const attributeScores = resolveAttributeScores(attributes);
    const derivedScores = resolveDerivedScores(
      resolveDerivedAttributes(createCharacterStats(attributes, 10)),
    );

    // AGI 17 and Acrobatics round((17+17)/2) = 17 are the same number, so
    // they must convert identically.
    expect(attributeScores.agi.score).toBe(17);
    expect(derivedScores.acrobatics.score).toBe(17);

    expect(derivedScores.acrobatics.standardModifier).toBe(
      attributeScores.agi.standardModifier,
    );
    expect(derivedScores.acrobatics.standardModifier).toBe(3);
  });
});

describe("ResolvedScore bundlers", () => {
  it("pairs every Attribute with its own modifier", () => {
    const attributes: Attributes = { ...TEST_ATTRIBUTES, agi: 19, con: 8 };
    const scores = resolveAttributeScores(attributes);

    expect(scores.agi).toEqual({ score: 19, standardModifier: 4 });
    expect(scores.con).toEqual({ score: 8, standardModifier: -1 });
  });

  it("covers every Attribute", () => {
    const scores = resolveAttributeScores(TEST_ATTRIBUTES);

    expect(Object.keys(scores).sort()).toEqual([...ATTRIBUTE_KEYS].sort());
  });

  it("covers every Derived Attribute", () => {
    const scores = resolveDerivedScores(
      resolveDerivedAttributes(createCharacterStats(TEST_ATTRIBUTES, 10)),
    );

    expect(Object.keys(scores).sort()).toEqual(
      [...DERIVED_ATTRIBUTE_NAMES].sort(),
    );
  });

  it("agrees with deriveStandardModifier for every Attribute", () => {
    const attributes: Attributes = {
      agi: 30,
      dex: 15,
      con: 8,
      vit: 22,
      int: 11,
      wis: 14,
      per: 17,
      spi: 1,
      cha: 26,
    };

    const scores = resolveAttributeScores(attributes);

    for (const key of ATTRIBUTE_KEYS) {
      expect(scores[key]).toEqual({
        score: attributes[key],
        standardModifier: deriveStandardModifier(attributes[key]),
      });
    }
  });
});
