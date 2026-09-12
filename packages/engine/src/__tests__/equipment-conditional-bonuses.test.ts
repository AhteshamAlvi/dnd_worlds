/*
 * Letting a Skill, Technique or Trait modify an action from the canonical
 * selected-implement facts (Ticket 4.5), without equipment ever learning what
 * a Skill, Technique or Trait is.
 *
 * The property this suite protects most: the matched rule's source is always
 * the character content that declared it, never the Item the condition
 * matched against — even when the output lands inside the Item's own
 * performance contribution. A nonmatch contributes nothing and is not
 * distinguishable from "this rule does not apply here" by anything reading
 * the result.
 */

import { describe, expect, it } from "vitest";

import {
  collectMatchedCheckModifiers,
  collectMatchedPerformanceEffects,
  findImplementConditionIssues,
  findImplementConditionalRuleIssues,
  findImplementConditionalRuleListIssues,
  matchesImplementCondition,
  type ImplementConditionalRule,
  type SourcedImplementConditionalRule,
} from "../character/equipment/conditions";
import type { ImplementResolution } from "../character/equipment/implements";

const BLADED_BONUS: ImplementConditionalRule = {
  id: "bladed-bonus",
  condition: { familyIds: ["bladed"] },
  output: { kind: "check", scope: { kind: "attribute", attribute: "dex" }, amount: 2 },
};

const BLADED_PENALTY: ImplementConditionalRule = {
  id: "bladed-penalty",
  condition: { familyIds: ["bladed"] },
  output: { kind: "check", scope: { kind: "attribute", attribute: "dex" }, amount: -1 },
};

const PERFORMANCE_BONUS: ImplementConditionalRule = {
  id: "performance-bonus",
  condition: { compatibility: ["preferred"] },
  output: {
    kind: "performance",
    slot: "attack",
    effects: [{ type: "modifyCheck", check: { kind: "attribute", attribute: "dex" }, amount: 3 }],
  },
};

function resolution(overrides: Partial<ImplementResolution> = {}): ImplementResolution {
  return {
    role: "weapon",
    item: { characterId: "gon", entryId: "e1" },
    itemId: "rapier",
    compatibility: "compatible",
    families: ["bladed"],
    state: "held",
    ...overrides,
  };
}

function sourced(
  source: { readonly type: string; readonly id: string },
  rule: ImplementConditionalRule,
): SourcedImplementConditionalRule {
  return { source, rule };
}


/* -------------------------------------------------------------------------- */
/* Sources: Skill, Technique, Trait, each matching a concrete Item           */
/* -------------------------------------------------------------------------- */

describe("each content type's rule keeps its own source", () => {
  it("matches a Trait, Technique and Skill rule independently against one resolution", () => {
    const rules: readonly SourcedImplementConditionalRule[] = [
      sourced({ type: "trait", id: "keen-edge" }, BLADED_BONUS),
      sourced({ type: "technique", id: "swordsmanship" }, { ...BLADED_BONUS, id: "swordsmanship-bonus" }),
      sourced({ type: "skill", id: "direct-thrust" }, { ...BLADED_BONUS, id: "thrust-bonus" }),
    ];

    const contributions = collectMatchedCheckModifiers(rules, [resolution()]);

    expect(contributions).toHaveLength(3);
    expect(contributions.map((c) => c.source.type).sort())
      .toEqual(["skill", "technique", "trait"]);
    expect(contributions.every((c) => c.amount === 2)).toBe(true);
  });

  it("keeps the Item's own contribution source separate from a matched rule's", () => {
    const rules = [sourced({ type: "trait", id: "keen-edge" }, PERFORMANCE_BONUS)];
    const matched = collectMatchedPerformanceEffects(rules, resolution({ compatibility: "preferred" }));

    expect(matched.attack).toHaveLength(1);
    expect(matched.attack[0]?.source).toEqual({ type: "trait", id: "keen-edge" });
  });
});


/* -------------------------------------------------------------------------- */
/* Role, family, compatibility, state — alone and together                   */
/* -------------------------------------------------------------------------- */

describe("condition fields filter alone and together", () => {
  const resolutions = [resolution()];

  it("matches by role alone", () => {
    expect(matchesImplementCondition({ role: "weapon" }, resolutions)).toBe(true);
    expect(matchesImplementCondition({ role: "shield" }, resolutions)).toBe(false);
  });

  it("matches by family alone", () => {
    expect(matchesImplementCondition({ familyIds: ["bladed"] }, resolutions)).toBe(true);
    expect(matchesImplementCondition({ familyIds: ["blunt"] }, resolutions)).toBe(false);
  });

  it("matches by compatibility alone", () => {
    expect(matchesImplementCondition({ compatibility: ["compatible"] }, resolutions)).toBe(true);
    expect(matchesImplementCondition({ compatibility: ["preferred"] }, resolutions)).toBe(false);
  });

  it("matches by state alone", () => {
    expect(matchesImplementCondition({ states: ["held"] }, resolutions)).toBe(true);
    expect(matchesImplementCondition({ states: ["worn"] }, resolutions)).toBe(false);
  });

  it("ANDs every field together", () => {
    expect(matchesImplementCondition(
      { role: "weapon", familyIds: ["bladed"], compatibility: ["compatible"], states: ["held"] },
      resolutions,
    )).toBe(true);

    expect(matchesImplementCondition(
      { role: "weapon", familyIds: ["bladed"], compatibility: ["preferred"], states: ["held"] },
      resolutions,
    )).toBe(false);
  });
});


/* -------------------------------------------------------------------------- */
/* Any/all across multiple selected implements for one role                 */
/* -------------------------------------------------------------------------- */

describe("any/all across multiple selected implements", () => {
  const mixed = [
    resolution({ item: { characterId: "gon", entryId: "e1" }, families: ["bladed"] }),
    resolution({ item: { characterId: "gon", entryId: "e2" }, families: ["blunt"] }),
  ];

  it("\"any\" (the default) matches if at least one candidate satisfies the filters", () => {
    expect(matchesImplementCondition({ role: "weapon", familyIds: ["bladed"] }, mixed)).toBe(true);
  });

  it("\"all\" requires every candidate to satisfy the filters", () => {
    expect(matchesImplementCondition(
      { role: "weapon", familyIds: ["bladed"], match: "all" },
      mixed,
    )).toBe(false);

    const allBladed = mixed.map((r) => ({ ...r, families: ["bladed"] }));

    expect(matchesImplementCondition(
      { role: "weapon", familyIds: ["bladed"], match: "all" },
      allBladed,
    )).toBe(true);
  });
});


/* -------------------------------------------------------------------------- */
/* Duplicate entries of one definition remain distinguishable                */
/* -------------------------------------------------------------------------- */

it("distinguishes duplicate entries of one Item definition by entryId", () => {
  const e1 = resolution({ item: { characterId: "gon", entryId: "e1" } });
  const e2 = resolution({ item: { characterId: "gon", entryId: "e2" }, compatibility: "preferred" });

  const rules = [sourced({ type: "trait", id: "keen-edge" }, PERFORMANCE_BONUS)];

  const matchedE1 = collectMatchedPerformanceEffects(rules, e1);
  const matchedE2 = collectMatchedPerformanceEffects(rules, e2);

  /* Same definition (rapier), different entries — only the preferred one matches. */
  expect(matchedE1.attack).toHaveLength(0);
  expect(matchedE2.attack).toHaveLength(1);
});


/* -------------------------------------------------------------------------- */
/* Nonmatch, malformed, and unresolved stay distinct                         */
/* -------------------------------------------------------------------------- */

describe("nonmatch, malformed and unresolved are distinct", () => {
  it("a nonmatch contributes nothing, and is not an error", () => {
    const rules = [sourced({ type: "trait", id: "keen-edge" }, { ...BLADED_BONUS, condition: { role: "shield" } })];

    expect(collectMatchedCheckModifiers(rules, [resolution()])).toEqual([]);
  });

  it("a malformed rule is a structural issue, distinct from a nonmatch", () => {
    const issues = findImplementConditionalRuleIssues({
      id: "broken",
      condition: { familyIds: [] },
      output: { kind: "check", scope: { kind: "bogus" } as never, amount: Number.NaN },
    });

    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((issue) => issue.code.includes("family"))).toBe(true);
    expect(issues.some((issue) => issue.code.includes("scope"))).toBe(true);
    expect(issues.some((issue) => issue.code.includes("amount"))).toBe(true);
  });

  it("an unknown output discriminant is refused, distinct from a missing one", () => {
    const unknownKind = findImplementConditionalRuleIssues({
      id: "x",
      condition: {},
      output: { kind: "bogus" } as never,
    });

    const missing = findImplementConditionalRuleIssues({
      id: "x",
      condition: {},
      output: undefined as never,
    });

    expect(unknownKind.some((issue) => issue.code === "equipment.conditions.rule.output.kind.invalid")).toBe(true);
    expect(missing.some((issue) => issue.code === "equipment.conditions.rule.output.missing")).toBe(true);
  });
});


/* -------------------------------------------------------------------------- */
/* Positive and negative modifiers share one path                           */
/* -------------------------------------------------------------------------- */

it("positive and negative check outputs stack through the same collection", () => {
  const rules = [
    sourced({ type: "trait", id: "keen-edge" }, BLADED_BONUS),
    sourced({ type: "condition", id: "trembling-hands" }, BLADED_PENALTY),
  ];

  const contributions = collectMatchedCheckModifiers(rules, [resolution()]);

  expect(contributions.map((c) => c.amount).sort()).toEqual([-1, 2]);
});


/* -------------------------------------------------------------------------- */
/* Order independence                                                       */
/* -------------------------------------------------------------------------- */

it("reordering rules or resolutions does not change what matches", () => {
  const rules = [
    sourced({ type: "trait", id: "a" }, BLADED_BONUS),
    sourced({ type: "trait", id: "b" }, BLADED_PENALTY),
  ];

  const resolutions = [
    resolution({ item: { characterId: "gon", entryId: "e1" } }),
    resolution({ item: { characterId: "gon", entryId: "e2" }, families: ["blunt"] }),
  ];

  const forward = collectMatchedCheckModifiers(rules, resolutions);
  const backwardRules = collectMatchedCheckModifiers([...rules].reverse(), resolutions);
  const backwardResolutions = collectMatchedCheckModifiers(rules, [...resolutions].reverse());

  expect(new Set(forward.map((c) => c.source.id))).toEqual(new Set(backwardRules.map((c) => c.source.id)));
  expect(new Set(forward.map((c) => c.source.id))).toEqual(new Set(backwardResolutions.map((c) => c.source.id)));
});


/* -------------------------------------------------------------------------- */
/* Hostile input                                                            */
/* -------------------------------------------------------------------------- */

describe("hostile rule data is refused without throwing", () => {
  const HOSTILE: readonly unknown[] = [
    null,
    undefined,
    "not-a-rule",
    42,
    {},
    { id: "x" },
    { id: "x", condition: null, output: { kind: "check" } },
    { id: "x", condition: {}, output: null },
    { id: "x", condition: {}, output: { kind: "performance", slot: "bogus", effects: [] } },
  ];

  it.each(HOSTILE)("refuses %p without throwing", (hostile) => {
    expect(() => {
      const issues = findImplementConditionalRuleIssues(hostile);

      expect(Array.isArray(issues)).toBe(true);
    }).not.toThrow();
  });

  it("refuses a list containing hostile entries without throwing", () => {
    expect(() => {
      const issues = findImplementConditionalRuleListIssues(HOSTILE);

      expect(issues.length).toBeGreaterThan(0);
    }).not.toThrow();
  });

  it("refuses a hostile condition shape without throwing", () => {
    const hostileConditions: readonly unknown[] = [
      { familyIds: [] },
      { compatibility: [] },
      { states: [] },
      { states: ["bogus-state"] },
      { match: "sometimes" },
      { role: "" },
    ];

    for (const condition of hostileConditions) {
      expect(() => findImplementConditionIssues(condition as never)).not.toThrow();
      expect(findImplementConditionIssues(condition as never).length).toBeGreaterThan(0);
    }
  });
});
