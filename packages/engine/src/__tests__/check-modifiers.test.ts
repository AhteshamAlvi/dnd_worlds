/*
 * Tests the two halves of the ticket's central distinction:
 *
 *   a score modifier changes the character
 *   a check modifier changes one resolution
 *
 * Half of this file is therefore negative-space testing — proving a Skill's
 * "+3 to applicable AGI checks" does NOT appear anywhere on the sheet, which
 * is the property that would silently break first if the two kinds of
 * modifier were ever conflated.
 *
 * The worked example throughout is the ticket's own:
 *
 *   Stored AGI 17 + Flexible (+2 AGI)  -> Base/Resolved AGI 19
 *   AGI standard modifier              -> +4
 *   Contort (+3 to applicable AGI)     -> final check modifier +7
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import {
  collectApplicableCheckModifiers,
  createCheckModifierTraceNode,
  resolveCheckModifier,
  resolveRuleEffects,
  type SourcedCheckModifier,
} from "../character/rules/resolution";
import { findEffectValidationIssues } from "../character/rules/validation";
import { isSameCheckScope } from "../checks/matching";
import { resolveCheck } from "../checks";
import type { CheckScope } from "../character/rules/effects";

import { validateCharacter } from "../character/validation";

import {
  createTestCharacter,
  resolveTestCharacter,
} from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});

const AGI_CHECK = { kind: "attribute", attribute: "agi" } as const;
const ACROBATICS_CHECK = {
  kind: "derivedAttribute",
  derivedAttribute: "acrobatics",
} as const;

function registerFlexible(): void {
  registerDefinition("trait", {
    id: "flexible",
    name: "Flexible",
    description: "A test Trait that raises AGI.",
    effects: [{ type: "modifyBaseAttribute", attribute: "agi", amount: 2 }],
  });
}

function registerContort(): void {
  registerDefinition("skill", {
    id: "contort",
    name: "Contort",
    description: "A test Skill granting a situational AGI bonus.",
    timings: ["action"],
    maximumMastery: 10,
    effects: [{ type: "modifyCheck", check: AGI_CHECK, amount: 3 }],
  });
}

describe("scope matching", () => {
  it("matches structurally, not by reference", () => {
    expect(
      isSameCheckScope(AGI_CHECK, { kind: "attribute", attribute: "agi" }),
    ).toBe(true);
  });

  it("does not match a different attribute", () => {
    expect(
      isSameCheckScope(AGI_CHECK, { kind: "attribute", attribute: "dex" }),
    ).toBe(false);
  });

  it("does not match across kinds even for a same-named thing", () => {
    // Detection exists as a Derived Attribute; nothing should let a
    // derived-attribute scope satisfy an attribute-scoped modifier.
    expect(
      isSameCheckScope(
        { kind: "attribute", attribute: "per" },
        { kind: "derivedAttribute", derivedAttribute: "detection" },
      ),
    ).toBe(false);
  });

  it("matches a derived attribute scope", () => {
    expect(
      isSameCheckScope(ACROBATICS_CHECK, {
        kind: "derivedAttribute",
        derivedAttribute: "acrobatics",
      }),
    ).toBe(true);
  });
});

describe("collecting and resolving", () => {
  const modifiers: readonly SourcedCheckModifier[] = [
    { source: { type: "skill", id: "contort" }, check: AGI_CHECK, amount: 3 },
    {
      source: { type: "technique", id: "tumbling" },
      check: ACROBATICS_CHECK,
      amount: 2,
    },
    { source: { type: "item", id: "grease" }, check: AGI_CHECK, amount: 1 },
  ];

  it("collects only the modifiers matching the scope", () => {
    expect(
      collectApplicableCheckModifiers(modifiers, AGI_CHECK).map(
        (modifier) => modifier.source.id,
      ),
    ).toEqual(["contort", "grease"]);
  });

  it("sums the standard modifier with every applicable one", () => {
    const resolution = resolveCheckModifier(4, modifiers, AGI_CHECK);

    expect(resolution.standardModifier).toBe(4);
    expect(resolution.applicableModifiers).toHaveLength(2);
    expect(resolution.finalModifier).toBe(8); // 4 + 3 + 1
  });

  it("returns the standard modifier alone when nothing applies", () => {
    const resolution = resolveCheckModifier(4, modifiers, {
      kind: "attribute",
      attribute: "cha",
    });

    expect(resolution.applicableModifiers).toEqual([]);
    expect(resolution.finalModifier).toBe(4);
  });

  it("handles a negative situational modifier", () => {
    const penalty: readonly SourcedCheckModifier[] = [
      {
        source: { type: "condition", id: "restrained" },
        check: AGI_CHECK,
        amount: -2,
      },
    ];

    expect(resolveCheckModifier(4, penalty, AGI_CHECK).finalModifier).toBe(2);
  });

  it("names every contributing source in its trace", () => {
    const node = createCheckModifierTraceNode(
      resolveCheckModifier(4, modifiers, AGI_CHECK),
    );

    expect(Object.keys(node.inputs)).toEqual([
      "standard",
      "skill:contort",
      "item:grease",
    ]);
    expect(node.output).toBe(8);
  });

  it("keeps two contributions from one source distinct in its trace", () => {
    // A trace must never show a total its own inputs do not add up to.
    const doubled: readonly SourcedCheckModifier[] = [
      { source: { type: "skill", id: "contort" }, check: AGI_CHECK, amount: 3 },
      { source: { type: "skill", id: "contort" }, check: AGI_CHECK, amount: 2 },
    ];

    const node = createCheckModifierTraceNode(
      resolveCheckModifier(4, doubled, AGI_CHECK),
    );

    expect(Object.keys(node.inputs)).toEqual([
      "standard",
      "skill:contort",
      "skill:contort (2)",
    ]);
    expect(node.output).toBe(9);
  });
});

describe("modifyCheck flows through effect resolution", () => {
  it("reaches checkModifiers with its source attached", () => {
    const resolved = resolveRuleEffects([
      {
        source: { type: "skill", id: "contort" },
        effects: [{ type: "modifyCheck", check: AGI_CHECK, amount: 3 }],
      },
    ]);

    expect(resolved.checkModifiers).toEqual([
      { source: { type: "skill", id: "contort" }, check: AGI_CHECK, amount: 3 },
    ]);
  });

  it("does not leak into either attribute modifier list", () => {
    const resolved = resolveRuleEffects([
      {
        source: { type: "skill", id: "contort" },
        effects: [{ type: "modifyCheck", check: AGI_CHECK, amount: 3 }],
      },
    ]);

    expect(resolved.baseAttributeModifiers).toEqual([]);
    expect(resolved.resolvedAttributeModifiers).toEqual([]);
  });

  it("reaches a resolved character from a Trait", () => {
    registerDefinition("trait", {
      id: "keen-eyes",
      name: "Keen Eyes",
      description: "A test Trait granting a Detection check bonus.",
      effects: [
        {
          type: "modifyCheck",
          check: { kind: "derivedAttribute", derivedAttribute: "detection" },
          amount: 4,
        },
      ],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "keen-eyes" }] }),
    );

    expect(resolved.effects.checkModifiers).toEqual([
      {
        source: { type: "trait", id: "keen-eyes" },
        check: { kind: "derivedAttribute", derivedAttribute: "detection" },
        amount: 4,
      },
    ]);
  });

  it("reaches a resolved character from a Skill", () => {
    registerContort();

    const resolved = resolveTestCharacter(
      createTestCharacter({ skills: [{ skillId: "contort" }] }),
    );

    expect(resolved.effects.checkModifiers).toEqual([
      { source: { type: "skill", id: "contort" }, check: AGI_CHECK, amount: 3 },
    ]);
  });
});

describe("a check modifier never touches the sheet", () => {
  it("leaves the Attribute score and its standard modifier alone", () => {
    registerContort();

    const withoutSkill = resolveTestCharacter(
      createTestCharacter({ attributes: { agi: 19 } }),
    );

    const withSkill = resolveTestCharacter(
      createTestCharacter({
        attributes: { agi: 19 },
        skills: [{ skillId: "contort" }],
      }),
    );

    expect(withSkill.attributeScores.agi).toEqual({
      score: 19,
      standardModifier: 4,
    });
    expect(withSkill.attributeScores.agi).toEqual(
      withoutSkill.attributeScores.agi,
    );
  });

  it("leaves every Derived Attribute alone", () => {
    registerContort();

    const withoutSkill = resolveTestCharacter(
      createTestCharacter({ attributes: { agi: 19 } }),
    );

    const withSkill = resolveTestCharacter(
      createTestCharacter({
        attributes: { agi: 19 },
        skills: [{ skillId: "contort" }],
      }),
    );

    expect(withSkill.derivedAttributes).toEqual(withoutSkill.derivedAttributes);
    expect(withSkill.derivedScores).toEqual(withoutSkill.derivedScores);
  });
});

describe("the ticket's worked example, end to end", () => {
  it("produces AGI 19 (+4) on the sheet and +7 on an applicable check", () => {
    registerFlexible();
    registerContort();

    const resolved = resolveTestCharacter(
      createTestCharacter({
        attributes: { agi: 17 },
        traits: [{ traitId: "flexible" }],
        skills: [{ skillId: "contort" }],
      }),
    );

    // The score: a Trait raised it, so Base and Resolved both moved.
    expect(resolved.attributes.stored.agi).toBe(17);
    expect(resolved.attributes.base.agi).toBe(19);
    expect(resolved.attributes.resolved.agi).toBe(19);

    // The sheet: "AGI 19 (17)", standard modifier +4.
    expect(resolved.attributeScores.agi).toEqual({
      score: 19,
      standardModifier: 4,
    });

    // The check: +4 from the score, +3 from Contort.
    const check = resolveCheckModifier(
      resolved.attributeScores.agi.standardModifier,
      resolved.effects.checkModifiers,
      AGI_CHECK,
    );

    expect(check.finalModifier).toBe(7);
    expect(check.applicableModifiers.map((m) => m.source.id)).toEqual([
      "contort",
    ]);
  });

  it("works the same way for a Derived Attribute check", () => {
    // The ticket's second example: Acrobatics 17, +3 standard, +2 technique.
    registerDefinition("technique", {
      id: "tumbling",
      name: "Tumbling",
      description: "A test Technique granting an Acrobatics check bonus.",
      maximumMastery: 10,
      effects: [{ type: "modifyCheck", check: ACROBATICS_CHECK, amount: 2 }],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({
        attributes: { agi: 17, dex: 17 },
        techniques: [{ techniqueId: "tumbling" }],
      }),
    );

    expect(resolved.derivedScores.acrobatics).toEqual({
      score: 17,
      standardModifier: 3,
    });

    const check = resolveCheckModifier(
      resolved.derivedScores.acrobatics.standardModifier,
      resolved.effects.checkModifiers,
      ACROBATICS_CHECK,
    );

    expect(check.finalModifier).toBe(5);

    // And the Derived Attribute itself is untouched.
    expect(resolved.derivedAttributes.acrobatics).toBe(17);
  });
});

describe("validation", () => {
  it("accepts a well-formed modifyCheck", () => {
    expect(
      findEffectValidationIssues({
        type: "modifyCheck",
        check: AGI_CHECK,
        amount: 3,
      }),
    ).toEqual([]);
  });

  it("rejects a non-finite amount", () => {
    expect(
      findEffectValidationIssues({
        type: "modifyCheck",
        check: AGI_CHECK,
        amount: Number.NaN,
      }),
    ).toEqual([
      {
        type: "invalid-effect-amount",
        path: "effect.amount",
        effectType: "modifyCheck",
        amount: Number.NaN,
      },
    ]);
  });

  it("rejects a scope naming nothing", () => {
    expect(
      findEffectValidationIssues({
        type: "modifyCheck",
        check: { kind: "attribute", attribute: "  " as "agi" },
        amount: 3,
      }),
    ).toEqual([
      { type: "invalid-check-scope", path: "effect.check", kind: "attribute" },
    ]);
  });

  it("accepts a character carrying one", () => {
    registerContort();

    expect(
      validateCharacter(
        createTestCharacter({ skills: [{ skillId: "contort" }] }),
      ).success,
    ).toBe(true);
  });
});


describe("authored modifiers reach the gameplay check resolver", () => {
  /*
   * The gap this closes. character/rules/ and the check module each had their
   * own CheckScope and their own modifier matcher, so a Trait's "+3 to
   * applicable AGI checks" could not be handed to the thing that resolves an
   * AGI check. One vocabulary, in the top-level checks/ module, is what makes the
   * two halves the same conversation.
   */
  afterEach(() => {
    clearCustomDefinitions();
  });

  it("hands a Skill's modifyCheck straight to resolveCheck", () => {
    registerContort();

    const resolved = resolveRuleEffects([
      {
        source: { type: "skill", id: "contort" },
        effects: [{ type: "modifyCheck", check: AGI_CHECK, amount: 3 }],
      },
    ]);

    const result = resolveCheck({
      scope: { kind: "attribute", attribute: "agi" },
      dice: { advantage: 0, rolls: [11] },
      baseContributions: [{ id: "standard", amount: 4 }],

      /* No translation layer: the authored modifier IS a check contribution. */
      modifiers: resolved.checkModifiers.map((modifier) => ({
        source: modifier.source,
        scope: modifier.check,
        amount: modifier.amount,
        channel: "persistent" as const,
      })),
    });

    // 11 rolled + 4 standard + 3 from Contort.
    expect(result.total).toBe(18);
    expect(result.applicableModifiers).toHaveLength(1);
  });

  it("lets content author a scope the old two-variant union could not express", () => {
    registerDefinition("trait", {
      id: "keen-ears",
      name: "Keen Ears",
      description: "A test Trait scoped to one sense.",
      effects: [
        {
          type: "modifyCheck",
          check: { kind: "detection", sense: { kind: "specific", sense: "hearing" } },
          amount: 2,
        },
      ],
    });

    const resolved = resolveRuleEffects([
      {
        source: { type: "trait", id: "keen-ears" },
        effects: [
          {
            type: "modifyCheck",
            check: { kind: "detection", sense: { kind: "specific", sense: "hearing" } },
            amount: 2,
          },
        ],
      },
    ]);

    const heard = collectApplicableCheckModifiers(resolved.checkModifiers, {
      kind: "detection",
      mode: "active",
      sense: "hearing",
      phenomenon: "physical",
      subject: "entity",
    });

    const seen = collectApplicableCheckModifiers(resolved.checkModifiers, {
      kind: "detection",
      mode: "active",
      sense: "sight",
      phenomenon: "physical",
      subject: "entity",
    });

    expect(heard).toHaveLength(1);
    expect(seen).toHaveLength(0);
  });
});
