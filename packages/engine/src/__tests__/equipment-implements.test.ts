/*
 * Selecting concrete implements for authored roles, and grading how well each
 * one fills its role.
 *
 * Selection and compatibility are different questions, and this suite is
 * built around keeping them apart. A malformed reference is refused the same
 * way regardless of what role it was offered for; a resolvable reference is
 * then graded against that role's own family lists, never the other way
 * round. Multiple problems in one call are reported together, because a
 * player choosing three implements for one attempt should not have to fix
 * them one submission at a time.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  clearCustomDefinitions,
  findCatalogReferenceIssues,
  getDefinition,
  registerDefinition,
} from "../character/catalogs";

import {
  findImplementRequirementIssues,
  resolveSelectedImplements,
  type ImplementRequirement,
  type SelectedImplement,
} from "../character/equipment/implements";
import { getItemDefinition } from "../character/equipment/index";
import type { CharacterItem } from "../character/equipment/index";

import { errorCodesOf, payloadOf } from "./fixtures/result";
import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});


/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function registerFamily(id: string): void {
  const result = registerDefinition("item-family", {
    id,
    name: id,
    description: `A test Item family "${id}".`,
  });

  if (!result.ok) throw new Error(result.reason);
}

function registerItem(id: string, fields: Record<string, unknown> = {}): void {
  const result = registerDefinition("item", {
    id,
    name: id,
    description: "A test Item registered for implement selection.",
    inventoryMode: "individual",
    shuInteraction: "compatible",
    ...fields,
  } as never);

  if (!result.ok) throw new Error(result.reason);
}

const WEAPON_ROLE: ImplementRequirement = {
  role: "weapon",
  minimum: 1,
  maximum: 1,
  acceptedFamilies: ["blunt", "bladed"],
  preferredFamilies: ["bladed"],
};

function entry(overrides: Partial<CharacterItem> = {}): CharacterItem {
  return {
    entryId: "e1",
    itemId: "mace",
    quantity: 1,
    state: "held",
    ...overrides,
  };
}

function characterWith(items: readonly CharacterItem[]) {
  const character = createTestCharacter({ items });
  const resolved = resolveTestCharacter(character);

  return { character, resolved };
}

function selection(role: string, entryId: string, characterId: string): SelectedImplement {
  return { role, item: { characterId, entryId } };
}


/* -------------------------------------------------------------------------- */
/* Compatibility grading                                                     */
/* -------------------------------------------------------------------------- */

describe("compatibility grading", () => {
  it("distinguishes all four grades", () => {
    registerFamily("blunt");
    registerFamily("bladed");
    registerFamily("thrown");
    registerItem("mace", { families: ["blunt"] });
    registerItem("rapier", { families: ["bladed"] });
    registerItem("rock", { families: ["thrown"] });
    registerItem("bare-hand");

    const { character, resolved } = characterWith([
      entry({ entryId: "e1", itemId: "mace" }),
      entry({ entryId: "e2", itemId: "rapier" }),
      entry({ entryId: "e3", itemId: "rock" }),
      entry({ entryId: "e4", itemId: "bare-hand" }),
    ]);

    const grade = (entryId: string, allowImprovised: boolean) =>
      payloadOf(resolveSelectedImplements({
        resolved,
        requirements: [{ ...WEAPON_ROLE, allowImprovised }],
        selections: [selection("weapon", entryId, character.id)],
      }, getItemDefinition));

    expect(grade("e1", false).resolutions[0]?.compatibility).toBe("compatible");
    expect(grade("e2", false).resolutions[0]?.compatibility).toBe("preferred");
    expect(grade("e3", true).issues).toEqual([]);
    expect(grade("e3", true).resolutions[0]?.compatibility).toBe("improvised");
    expect(grade("e3", false).issues[0]?.kind).toBe("incompatible");
    expect(grade("e4", true).resolutions[0]?.compatibility).toBe("improvised");
  });

  it("survives identical definitions with distinct entries", () => {
    registerFamily("bladed");
    registerItem("rapier", { families: ["bladed"] });

    const { character, resolved } = characterWith([
      entry({ entryId: "e1", itemId: "rapier" }),
      entry({ entryId: "e2", itemId: "rapier" }),
    ]);

    const result = payloadOf(resolveSelectedImplements({
      resolved,
      requirements: [WEAPON_ROLE],
      selections: [selection("weapon", "e2", character.id)],
    }, getItemDefinition));

    expect(result.issues).toEqual([]);
    expect(result.resolutions).toEqual([{
      role: "weapon",
      item: { characterId: character.id, entryId: "e2" },
      itemId: "rapier",
      compatibility: "preferred",
      families: ["bladed"],
      state: "held",
    }]);
  });
});


/* -------------------------------------------------------------------------- */
/* Precise refusals                                                          */
/* -------------------------------------------------------------------------- */

describe("precise refusals", () => {
  it("reports a role below its minimum", () => {
    const { resolved } = characterWith([]);

    const result = payloadOf(resolveSelectedImplements({
      resolved,
      requirements: [WEAPON_ROLE],
      selections: [],
    }, getItemDefinition));

    expect(result.issues).toEqual([{
      kind: "role-below-minimum",
      role: "weapon",
      message: expect.stringContaining("at least 1"),
    }]);
  });

  it("reports a role above its maximum", () => {
    registerFamily("bladed");
    registerItem("rapier", { families: ["bladed"] });

    const { character, resolved } = characterWith([
      entry({ entryId: "e1", itemId: "rapier" }),
      entry({ entryId: "e2", itemId: "rapier" }),
    ]);

    const result = payloadOf(resolveSelectedImplements({
      resolved,
      requirements: [WEAPON_ROLE],
      selections: [
        selection("weapon", "e1", character.id),
        selection("weapon", "e2", character.id),
      ],
    }, getItemDefinition));

    expect(result.issues.some((issue) => issue.kind === "role-above-maximum")).toBe(true);
  });

  it("reports a repeated selection for one role", () => {
    registerFamily("bladed");
    registerItem("rapier", { families: ["bladed"] });

    const { character, resolved } = characterWith([entry({ itemId: "rapier" })]);

    const result = payloadOf(resolveSelectedImplements({
      resolved,
      requirements: [{ ...WEAPON_ROLE, maximum: 2 }],
      selections: [
        selection("weapon", "e1", character.id),
        selection("weapon", "e1", character.id),
      ],
    }, getItemDefinition));

    expect(result.issues.some((issue) => issue.kind === "duplicate-selection")).toBe(true);
  });

  it("reports one entry filling two roles as refused, unless explicitly shared", () => {
    registerFamily("bladed");
    registerItem("rapier", { families: ["bladed"] });

    const { character, resolved } = characterWith([entry({ itemId: "rapier" })]);

    const requirements: readonly ImplementRequirement[] = [
      WEAPON_ROLE,
      { role: "focus", minimum: 1, maximum: 1, acceptedFamilies: ["bladed"] },
    ];

    const selections = [
      selection("weapon", "e1", character.id),
      selection("focus", "e1", character.id),
    ];

    const refused = payloadOf(resolveSelectedImplements(
      { resolved, requirements, selections },
      getItemDefinition,
    ));

    expect(refused.issues.some((issue) => issue.kind === "entry-shared-across-roles")).toBe(true);

    const shared = payloadOf(resolveSelectedImplements(
      { resolved, requirements, selections, allowSharedEntries: true },
      getItemDefinition,
    ));

    expect(shared.issues).toEqual([]);
    expect(shared.resolutions).toHaveLength(2);
  });

  it("reports a reference naming a different character (wrong owner)", () => {
    const { resolved } = characterWith([entry()]);

    const result = payloadOf(resolveSelectedImplements({
      resolved,
      requirements: [WEAPON_ROLE],
      selections: [selection("weapon", "e1", "somebody-else")],
    }, getItemDefinition));

    expect(result.issues[0]?.kind).toBe("character-mismatch");
  });

  it("reports an unknown entry", () => {
    const { character, resolved } = characterWith([]);

    const result = payloadOf(resolveSelectedImplements({
      resolved,
      requirements: [WEAPON_ROLE],
      selections: [selection("weapon", "ghost", character.id)],
    }, getItemDefinition));

    expect(result.issues[0]?.kind).toBe("unknown-entry");
  });

  it("reports a zero-quantity entry", () => {
    registerFamily("bladed");
    registerItem("rapier", { families: ["bladed"] });

    const { character, resolved } = characterWith([
      entry({ itemId: "rapier", quantity: 0, state: "carried" }),
    ]);

    const result = payloadOf(resolveSelectedImplements({
      resolved,
      requirements: [WEAPON_ROLE],
      selections: [selection("weapon", "e1", character.id)],
    }, getItemDefinition));

    expect(result.issues[0]?.kind).toBe("quantity-zero");
  });

  it("reports a selection naming a role nobody declared", () => {
    const { character, resolved } = characterWith([entry()]);

    const result = payloadOf(resolveSelectedImplements({
      resolved,
      requirements: [WEAPON_ROLE],
      selections: [selection("shield", "e1", character.id)],
    }, getItemDefinition));

    expect(result.issues.some((issue) => issue.kind === "role-unknown")).toBe(true);
  });

  it("collects every problem in one pass, not just the first", () => {
    const { character, resolved } = characterWith([]);

    const result = payloadOf(resolveSelectedImplements({
      resolved,
      requirements: [WEAPON_ROLE],
      selections: [selection("weapon", "ghost", character.id), selection("shield", "e1", character.id)],
    }, getItemDefinition));

    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
});


/* -------------------------------------------------------------------------- */
/* Engagement state gates                                                    */
/* -------------------------------------------------------------------------- */

describe("permitted states apply only when authored", () => {
  it("refuses a carried entry when the role requires held or worn", () => {
    registerFamily("bladed");
    registerItem("rapier", { families: ["bladed"] });

    const { character, resolved } = characterWith([
      entry({ itemId: "rapier", state: "carried" }),
    ]);

    const result = payloadOf(resolveSelectedImplements({
      resolved,
      requirements: [{ ...WEAPON_ROLE, permittedStates: ["held", "worn"] }],
      selections: [selection("weapon", "e1", character.id)],
    }, getItemDefinition));

    expect(result.issues[0]?.kind).toBe("state-not-permitted");
  });

  it("accepts any state when the role names none", () => {
    registerFamily("bladed");
    registerItem("rapier", { families: ["bladed"] });

    const { character, resolved } = characterWith([
      entry({ itemId: "rapier", state: "carried" }),
    ]);

    const result = payloadOf(resolveSelectedImplements({
      resolved,
      requirements: [WEAPON_ROLE],
      selections: [selection("weapon", "e1", character.id)],
    }, getItemDefinition));

    expect(result.issues).toEqual([]);
  });
});


/* -------------------------------------------------------------------------- */
/* Order independence                                                        */
/* -------------------------------------------------------------------------- */

it("reordering selections does not change the result", () => {
  registerFamily("bladed");
  registerItem("rapier", { families: ["bladed"] });

  const { character, resolved } = characterWith([
    entry({ entryId: "e1", itemId: "rapier" }),
    entry({ entryId: "e2", itemId: "rapier" }),
  ]);

  const requirements: readonly ImplementRequirement[] = [
    { ...WEAPON_ROLE, maximum: 2 },
  ];

  const forward = payloadOf(resolveSelectedImplements({
    resolved,
    requirements,
    selections: [
      selection("weapon", "e1", character.id),
      selection("weapon", "e2", character.id),
    ],
  }, getItemDefinition));

  const backward = payloadOf(resolveSelectedImplements({
    resolved,
    requirements,
    selections: [
      selection("weapon", "e2", character.id),
      selection("weapon", "e1", character.id),
    ],
  }, getItemDefinition));

  expect(new Set(forward.resolutions.map((r) => r.item.entryId)))
    .toEqual(new Set(backward.resolutions.map((r) => r.item.entryId)));
  expect(forward.issues).toEqual(backward.issues);
});


/* -------------------------------------------------------------------------- */
/* Hostile input                                                             */
/* -------------------------------------------------------------------------- */

describe("hostile host data is refused without throwing", () => {
  const HOSTILE_SELECTIONS: readonly unknown[] = [
    null,
    undefined,
    "not-an-array",
    42,
    {},
    [null],
    [{}],
    [{ role: "", item: { characterId: "x", entryId: "e1" } }],
    [{ role: "weapon", item: null }],
    [{ role: "weapon", item: {} }],
  ];

  it.each(HOSTILE_SELECTIONS)("refuses %p without throwing", (hostile) => {
    const { resolved } = characterWith([entry()]);

    expect(() => {
      const result = resolveSelectedImplements({
        resolved,
        requirements: [WEAPON_ROLE],
        selections: hostile,
      }, getItemDefinition);

      expect(result.success).toBe(false);
    }).not.toThrow();
  });
});


/* -------------------------------------------------------------------------- */
/* Authoring validation                                                      */
/* -------------------------------------------------------------------------- */

describe("authoring validation", () => {
  it("refuses a preferred family the role does not also accept", () => {
    const issues = findImplementRequirementIssues({
      role: "weapon",
      minimum: 1,
      maximum: 1,
      acceptedFamilies: ["blunt"],
      preferredFamilies: ["bladed"],
    });

    expect(issues.some((issue) => issue.code === "equipment.implements.preferred-families.not-accepted"))
      .toBe(true);
  });

  it("refuses an inverted cardinality", () => {
    const issues = findImplementRequirementIssues({
      role: "weapon",
      minimum: 2,
      maximum: 1,
      acceptedFamilies: ["blunt"],
    });

    expect(issues.some((issue) => issue.code === "equipment.implements.cardinality.inverted"))
      .toBe(true);
  });

  it("refuses an empty accepted-families list", () => {
    const issues = findImplementRequirementIssues({
      role: "weapon",
      minimum: 1,
      maximum: 1,
      acceptedFamilies: [],
    });

    expect(issues.some((issue) => issue.code === "equipment.implements.families.empty")).toBe(true);
  });
});


/* -------------------------------------------------------------------------- */
/* Family forward references, post-load                                     */
/* -------------------------------------------------------------------------- */

describe("family references are checked post-load, forward or not", () => {
  it("flags a Skill application role naming an unregistered family", () => {
    const result = registerDefinition("skill", {
      id: "test-called-shot",
      name: "Test Called Shot",
      description: "A test Skill for family reference checking.",
      application: {
        action: {
          allowedTimings: ["action"],
          structuredActionCost: { actions: 1 },
          targets: { cardinality: { minimum: 1, maximum: 1 } },
          permittedFocusKinds: ["none"],
          range: { kind: "none" },
          executionDuration: { kind: "fixed", value: 0 },
        },
        role: "utility",
        implements: [{
          role: "weapon",
          minimum: 1,
          maximum: 1,
          acceptedFamilies: ["no-such-family"],
        }],
        cost: { exertionLoad: 0, aura: { kind: "none" } },
        check: { kind: "adjudicated" },
        outcome: { kind: "free-adjudication" },
      },
    } as never);

    expect(result.ok).toBe(true);

    const issues = findCatalogReferenceIssues();

    expect(issues.some((issue) => issue.includes('unknown Item Family "no-such-family"'))).toBe(true);
  });

  it("accepts a role naming a family registered afterward (forward reference)", () => {
    registerDefinition("skill", {
      id: "test-called-shot-2",
      name: "Test Called Shot 2",
      description: "A test Skill for family reference checking.",
      application: {
        action: {
          allowedTimings: ["action"],
          structuredActionCost: { actions: 1 },
          targets: { cardinality: { minimum: 1, maximum: 1 } },
          permittedFocusKinds: ["none"],
          range: { kind: "none" },
          executionDuration: { kind: "fixed", value: 0 },
        },
        role: "utility",
        implements: [{
          role: "weapon",
          minimum: 1,
          maximum: 1,
          acceptedFamilies: ["later-family"],
        }],
        cost: { exertionLoad: 0, aura: { kind: "none" } },
        check: { kind: "adjudicated" },
        outcome: { kind: "free-adjudication" },
      },
    } as never);

    registerFamily("later-family");

    const issues = findCatalogReferenceIssues();

    expect(issues.some((issue) => issue.includes("later-family"))).toBe(false);
  });
});


/* -------------------------------------------------------------------------- */
/* Purity                                                                     */
/* -------------------------------------------------------------------------- */

it("resolveSelectedImplements never mutates the character or consumes anything", () => {
  registerFamily("bladed");
  registerItem("rapier", { families: ["bladed"] });

  const { character, resolved } = characterWith([entry({ itemId: "rapier" })]);
  const before = character.items;

  payloadOf(resolveSelectedImplements({
    resolved,
    requirements: [WEAPON_ROLE],
    selections: [selection("weapon", "e1", character.id)],
  }, getItemDefinition));

  expect(character.items).toBe(before);
  expect(character.items![0]!.quantity).toBe(1);

  /* A refused resolution changes nothing either. */
  payloadOf(resolveSelectedImplements({
    resolved,
    requirements: [WEAPON_ROLE],
    selections: [selection("weapon", "ghost", character.id)],
  }, getItemDefinition));

  expect(character.items).toBe(before);
});
