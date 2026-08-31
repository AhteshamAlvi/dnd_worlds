/*
 * Tests the ten Derived Attributes: their formulas, the shared rounding rule,
 * and the explanation/trace layer.
 *
 * The property under test throughout is that a Derived Attribute is nothing
 * but a rounded mean of resolved Attributes — no situational modifier, no
 * stored state, nothing a Trait can write to directly. Propagation from a
 * changed Attribute is covered in attribute-propagation.test.ts; check
 * modifiers in check-modifiers.test.ts.
 */

import { describe, expect, it } from "vitest";

import {
  DERIVED_ATTRIBUTE_SOURCES,
  createDerivedAttributeResolutionTrace,
  createDerivedAttributeTraceNode,
  explainDerivedAttribute,
  resolveAccuracy,
  resolveAcrobatics,
  resolveAthletics,
  resolveCombatAbility,
  resolveConcealment,
  resolveDerivedAttribute,
  resolveDerivedAttributes,
  resolveDerivedScores,
  resolveDetection,
  resolveIntimidation,
  resolveInvestigation,
  resolveStamina,
  resolveWillpower,
} from "../character/foundation/attributes/derived/resolution";
import {
  DERIVED_ATTRIBUTE_NAMES,
} from "../character/foundation/attributes/derived/types";
import { validateDerivedAttributes } from "../character/foundation/attributes/derived/validation";
import type { Attributes } from "../character/foundation/attributes/types";

import { TEST_ATTRIBUTES } from "./fixtures/character";

// Every attribute distinct, so a formula reading the wrong key produces a
// visibly wrong number rather than coincidentally the right one.
const DISTINCT: Attributes = {
  str: 11,
  agi: 13,
  dex: 15,
  con: 17,
  vit: 19,
  int: 12,
  wis: 14,
  per: 16,
  spi: 18,
  cha: 20,
};

describe("the ticket's baseline case", () => {
  it("gives every Derived Attribute 10 when every Attribute is 10", () => {
    const derived = resolveDerivedAttributes(TEST_ATTRIBUTES);

    for (const name of DERIVED_ATTRIBUTE_NAMES) {
      expect(derived[name]).toBe(10);
    }
  });

  it("gives every Derived Attribute a +0 standard modifier at 10", () => {
    const scores = resolveDerivedScores(
      resolveDerivedAttributes(TEST_ATTRIBUTES),
    );

    for (const name of DERIVED_ATTRIBUTE_NAMES) {
      expect(scores[name]).toEqual({ score: 10, standardModifier: 0 });
    }
  });
});

describe("the ten formulas", () => {
  it.each([
    // name, function, expected against DISTINCT
    ["combatAbility", resolveCombatAbility, 14], // (11+13+15+16+14)/5 = 13.8 -> 14
    ["athletics", resolveAthletics, 12], //         (11+13)/2 = 12
    ["acrobatics", resolveAcrobatics, 14], //       (13+15)/2 = 14
    ["accuracy", resolveAccuracy, 16], //           (15+16)/2 = 15.5 -> 16
    ["detection", resolveDetection, 15], //         (16+14)/2 = 15
    ["concealment", resolveConcealment, 15], //     (15+14)/2 = 14.5 -> 15
    ["investigation", resolveInvestigation, 14], // (12+14+16)/3 = 14
    ["stamina", resolveStamina, 18], //             (17+19)/2 = 18
    ["willpower", resolveWillpower, 16], //         (14+18)/2 = 16
    ["intimidation", resolveIntimidation, 19], //   (20+18)/2 = 19
  ] as const)("%s", (_name, resolve, expected) => {
    expect(resolve(DISTINCT)).toBe(expected);
  });

  it("the named functions agree with resolveDerivedAttribute by name", () => {
    const byName = resolveDerivedAttributes(DISTINCT);

    for (const name of DERIVED_ATTRIBUTE_NAMES) {
      expect(byName[name]).toBe(resolveDerivedAttribute(name, DISTINCT));
    }
  });
});

describe("the source table matches the Rulebook formulas", () => {
  // The table is what the arithmetic actually reads, so pinning it is what
  // stops a silent formula change.
  it.each([
    ["combatAbility", ["str", "agi", "dex", "per", "wis"]],
    ["athletics", ["str", "agi"]],
    ["acrobatics", ["agi", "dex"]],
    ["accuracy", ["dex", "per"]],
    ["detection", ["per", "wis"]],
    ["concealment", ["dex", "wis"]],
    ["investigation", ["int", "wis", "per"]],
    ["stamina", ["con", "vit"]],
    ["willpower", ["wis", "spi"]],
    ["intimidation", ["cha", "spi"]],
  ] as const)("%s draws on %s", (name, sources) => {
    expect(DERIVED_ATTRIBUTE_SOURCES[name]).toEqual(sources);
  });

  it("covers every Derived Attribute exactly once", () => {
    expect(Object.keys(DERIVED_ATTRIBUTE_SOURCES).sort()).toEqual(
      [...DERIVED_ATTRIBUTE_NAMES].sort(),
    );
  });
});

describe("rounding", () => {
  // Half-up, per decisions/log.ts's attributes.derived.rounding-direction.
  it("rounds a half-point up", () => {
    // (15 + 14) / 2 = 14.5
    expect(resolveConcealment({ ...DISTINCT, dex: 15, wis: 14 })).toBe(15);
  });

  it("rounds below a half-point down", () => {
    // (15 + 13) / 2 = 14
    expect(resolveConcealment({ ...DISTINCT, dex: 15, wis: 13 })).toBe(14);
  });

  it("always produces a whole number", () => {
    const derived = resolveDerivedAttributes(DISTINCT);

    for (const name of DERIVED_ATTRIBUTE_NAMES) {
      expect(Number.isInteger(derived[name])).toBe(true);
    }
  });

  /*
   * Derived Attributes can go negative: the 1-30 range binds stored scores
   * only, and Conditions/injuries may drive a Resolved score below it.
   */
  it("handles negative scores, rounding toward positive infinity on a tie", () => {
    const penalized: Attributes = { ...DISTINCT, dex: -15, wis: -14 };

    // (-15 + -14) / 2 = -14.5 -> -14, not -15
    expect(resolveConcealment(penalized)).toBe(-14);
  });
});

describe("explanation and traces", () => {
  it("explains a Derived Attribute with its contributing scores", () => {
    const explanation = explainDerivedAttribute("acrobatics", DISTINCT);

    expect(explanation).toEqual({
      name: "acrobatics",
      contributions: [
        { attribute: "agi", score: 13 },
        { attribute: "dex", score: 15 },
      ],
      average: 14,
      score: 14,
      standardModifier: 2,
    });
  });

  it("keeps the unrounded average visible when rounding moved the score", () => {
    const explanation = explainDerivedAttribute("concealment", DISTINCT);

    expect(explanation.average).toBe(14.5);
    expect(explanation.score).toBe(15);
  });

  it("names every contributing attribute as a trace input", () => {
    const node = createDerivedAttributeTraceNode("investigation", DISTINCT);

    expect(Object.keys(node.inputs)).toEqual(["int", "wis", "per", "average"]);
    expect(node.output).toBe(14);
    expect(node.formula).toBe("round((INT + WIS + PER) / 3)");
  });

  it("produces one child node per Derived Attribute", () => {
    const trace = createDerivedAttributeResolutionTrace(DISTINCT);

    expect(trace.children.map((child) => child.label)).toEqual(
      DERIVED_ATTRIBUTE_NAMES.map((name) => `Resolve ${name}`),
    );
  });
});

describe("validation", () => {
  it("accepts a normally resolved set", () => {
    expect(
      validateDerivedAttributes(resolveDerivedAttributes(DISTINCT)).success,
    ).toBe(true);
  });

  it("rejects a non-finite value", () => {
    const derived = {
      ...resolveDerivedAttributes(DISTINCT),
      athletics: Number.NaN,
    };

    const result = validateDerivedAttributes(derived);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.map((error) => error.code)).toContain(
        "attributes.derived.athletics.non-finite",
      );
    }
  });

  it("rejects a fractional value", () => {
    const derived = {
      ...resolveDerivedAttributes(DISTINCT),
      stamina: 14.5,
    };

    const result = validateDerivedAttributes(derived);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.map((error) => error.code)).toContain(
        "attributes.derived.stamina.non-integer",
      );
    }
  });
});
