/*
 * Using an Item, as one pure resolution.
 *
 * Four properties are what this suite is for, and each is something the
 * obvious implementation gets wrong.
 *
 * A use is an EVENT. useEffects appear in the use result and nowhere else —
 * not on the sheet before the use, not after it, and not because the Item is
 * in a hand. Collecting them with the passive timings is how a potion heals
 * continuously for being in a bag.
 *
 * A use happens ONCE. One activation resolves the declared list exactly once,
 * whether the stack holds one draught or fifty.
 *
 * Consumption is DECLARED. Only `consumesOnUse: true` removes a unit, and only
 * one, and only from the entry the reference names.
 *
 * A refusal changes NOTHING. No Effects, no Character, no decrement — and a
 * malformed question is a failure, never a refusal.
 *
 * Every consumable here is registered by the test rather than authored. An
 * authored potion would be a game rule the moment it shipped, and this ticket
 * designs the mechanic, not the content.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  clearCustomDefinitions,
  getDefinition,
  registerDefinition,
} from "../character/catalogs";

/*
 * The UNBOUND resolver, which takes its catalog as an argument. The
 * registration barrier stops a malformed definition reaching the bound one, so
 * the resolver's own defensive checks are driven through a lookup this file
 * supplies — the resolver's real signature, not a test-only door.
 */
import { resolveItemUse as resolveItemUseWith } from "../character/equipment/use";
import { resolveEquipmentTransition as resolveTransitionWith }
  from "../character/equipment/transitions";

import {
  collectItemEffectSources,
  findItemCoreDefinitionIssues,
  findItemEquipmentDefinitionIssues,
  findItemStructuralIssues,
  findItemUseDefinitionIssues,
  isActivelyUsableItem,
  resolveItemUse,
  type CharacterItem,
  type ItemDefinition,
  type ItemUseResolution,
} from "../character/equipment/index";

import * as engine from "../index";

import type { EngineResult } from "../infrastructure/result";
import type { NamedRequirement } from "../character/rules/requirements";
import {
  resolveNamedRequirements,
  type RequirementContext,
} from "../character/rules/resolution";
import {
  EVERY_CONTEXT_FIELD_GATE,
  hostileRequirementContexts,
} from "./fixtures/requirement-context";
import type { Character } from "../character/types";

import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});


const HOSTILE_VALUES: readonly unknown[] = [
  undefined,
  null,
  "",
  "   ",
  42,
  true,
  {},
  [],
  Number.NaN,
  Number.POSITIVE_INFINITY,
];


/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const STEADY_WIS = {
  type: "modifyResolvedAttribute",
  attribute: "wis",
  amount: 1,
} as const;

const STEADY_PER = {
  type: "modifyResolvedAttribute",
  attribute: "per",
  amount: 2,
} as const;

const NEEDS_ONE_ARM = {
  id: "needs-one-arm",
  summary: "Only the one-armed can work the stopper.",
  requirement: { type: "hasTrait", traitId: "one-armed" },
} as const;

const NEEDS_WINGS = {
  id: "needs-wings",
  requirement: { type: "hasTrait", traitId: "winged" },
} as const;

const NEEDS_GAUNTLETS = {
  id: "needs-gauntlets",
  summary: "The vial is too hot to hold bare-handed.",
  requirement: { type: "hasItem", itemId: "gauntlets", state: "possessed" },
} as const;


function registerItem(
  id: string,
  fields: Record<string, unknown>,
): ItemDefinition {
  const result = registerDefinition("item", {
    id,
    name: "Test Item",
    description: "A test Item registered for Item use.",
    inventoryMode: "stackable",
    shuInteraction: "compatible",
    ...fields,
  } as unknown as ItemDefinition);

  if (!result.ok) throw new Error(result.reason);

  return getDefinition("item", id)!;
}


/** A stackable consumable: nobody asks which draught. */
function registerDraught(fields: Record<string, unknown> = {}): ItemDefinition {
  return registerItem("calming-draught", {
    consumesOnUse: true,
    useEffects: [STEADY_WIS],
    ...fields,
  });
}


/** A stackable Item that is NOT consumed: a whetstone survives a sharpening. */
function registerWhetstone(): ItemDefinition {
  return registerItem("whetstone", { useEffects: [STEADY_WIS] });
}


/** An individual consumable: one vial, pointed at, used up. */
function registerVial(): ItemDefinition {
  return registerItem("last-breath-vial", {
    inventoryMode: "individual",
    shuInteraction: "compatible",
    consumesOnUse: true,
    useEffects: [STEADY_WIS],
  });
}


function entry(overrides: Partial<CharacterItem> = {}): CharacterItem {
  return {
    entryId: "e1",
    itemId: "calming-draught",
    quantity: 3,
    state: "carried",
    ...overrides,
  };
}


/** Resolve a use against a character built from `items`. */
function use(
  items: readonly CharacterItem[],
  entryId = "e1",
  extra: Partial<Character> = {},
) {
  const character = createTestCharacter({ items, ...extra });
  const resolved = resolveTestCharacter(character);

  return {
    character,
    resolved,
    result: resolveItemUse({
      resolved,
      item: { characterId: character.id, entryId },
    }),
  };
}


/*
 * A resolved character whose stored `character` has been swapped afterwards.
 *
 * For the malformed-question cases: a corrupt entry or an unknown Item is what
 * the use resolver has to survive, and resolveCharacter() is a different entry
 * point with its own contract for them.
 */
function swapped(items: readonly unknown[]) {
  const character = createTestCharacter({
    items: items as readonly CharacterItem[],
  });

  return {
    character,
    resolved: { ...resolveTestCharacter(createTestCharacter()), character },
  };
}


type Executed = Extract<ItemUseResolution, { disposition: "executed" }>;

function executed(result: EngineResult<ItemUseResolution>): Executed {
  if (!result.success || result.payload.disposition !== "executed") {
    throw new Error(
      `expected an executed use, got ${JSON.stringify(
        result.success ? result.payload.disposition : result.errors,
      )}`,
    );
  }

  return result.payload;
}


function failureCode(result: EngineResult<ItemUseResolution>): string | undefined {
  return result.success ? undefined : result.errors[0].code;
}


/*
 * See equipment-transitions.test.ts: an omitted collection is "the sheet does
 * not say", distinct from an empty one, and exactOptionalPropertyTypes makes
 * deleting the field the only way to say it.
 */
function withoutItems(context: RequirementContext): RequirementContext {
  const { items: _omitted, ...rest } = context;

  return rest;
}


function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);

    for (const child of Object.values(value)) deepFreeze(child);
  }

  return value;
}


/* -------------------------------------------------------------------------- */
/* Executed uses                                                              */
/* -------------------------------------------------------------------------- */

describe("a reusable Item", () => {
  it("executes its useEffects without changing quantity", () => {
    registerWhetstone();

    const { character, result } = use([entry({ itemId: "whetstone" })]);
    const payload = executed(result);

    expect(payload.effects.effects.map((one) => one.effect)).toEqual([STEADY_WIS]);

    expect(payload.use).toMatchObject({
      itemId: "whetstone",
      quantityBefore: 3,
      quantityAfter: 3,
      consumed: 0,
    });

    /* Nothing stored changed, so the Character is the one supplied. */
    expect(payload.nextCharacter).toBe(character);
    expect(payload.nextCharacter.items?.[0]?.quantity).toBe(3);
  });

  it("is not consumed for being stackable", () => {
    /* Declared, never inferred: stackable with useEffects is still reusable. */
    registerWhetstone();

    const { result } = use([entry({ itemId: "whetstone", quantity: 1 })]);

    expect(executed(result).use.consumed).toBe(0);
  });

  it("is not consumed when it declares consumesOnUse: false", () => {
    registerItem("worry-stone", {
      consumesOnUse: false,
      useEffects: [STEADY_WIS],
    });

    const { result } = use([entry({ itemId: "worry-stone" })]);

    expect(executed(result).use.quantityAfter).toBe(3);
  });
});


describe("a consumable", () => {
  it("removes one unit from a stack of three", () => {
    registerDraught();

    const { character, result } = use([entry({ quantity: 3 })]);
    const payload = executed(result);

    expect(payload.use).toMatchObject({
      quantityBefore: 3,
      quantityAfter: 2,
      consumed: 1,
    });

    expect(payload.effects.effects).toHaveLength(1);
    expect(payload.nextCharacter).not.toBe(character);
    expect(payload.nextCharacter.items).toEqual([entry({ quantity: 2 })]);
  });

  it("empties an individual consumable and keeps the entry", () => {
    registerVial();

    const { result } = use([
      entry({ itemId: "last-breath-vial", quantity: 1 }),
    ]);

    const payload = executed(result);

    expect(payload.use).toMatchObject({ quantityBefore: 1, quantityAfter: 0, consumed: 1 });

    /* An emptied quiver is still a quiver: the line stays on the sheet. */
    expect(payload.nextCharacter.items).toEqual([
      entry({ itemId: "last-breath-vial", quantity: 0 }),
    ]);
  });

  it.each([
    ["last-breath-vial", "held"],
    ["last-breath-vial", "worn"],
    ["calming-draught", "held"],
  ] as const)("returns an emptied %s that was %s to carried", (itemId, state) => {
    registerDraught();
    registerVial();

    const { result } = use([entry({ itemId, quantity: 1, state })]);
    const next = executed(result).nextCharacter.items?.[0];

    expect(next).toEqual(entry({ itemId, quantity: 0, state: "carried" }));
  });

  it("leaves the replacement Character a valid one", () => {
    /*
     * The point of returning an emptied held entry to carried: a Character
     * that could not be resolved again would be a replacement nobody can use.
     */
    registerVial();

    const { result } = use([
      entry({ itemId: "last-breath-vial", quantity: 1, state: "held" }),
    ]);

    expect(() => resolveTestCharacter(executed(result).nextCharacter))
      .not.toThrow();
  });

  it("refuses at quantity zero and executes nothing", () => {
    registerDraught();

    const { character, result } = use([entry({ quantity: 0 })]);

    expect(result.success && result.payload).toEqual({
      disposition: "quantity-unavailable",
      item: { characterId: character.id, entryId: "e1" },
      quantity: 0,
    });
  });

  it("refuses a reusable Item at quantity zero too", () => {
    /* A whetstone nobody has left is not a whetstone to use. */
    registerWhetstone();

    const { result } = use([entry({ itemId: "whetstone", quantity: 0 })]);

    expect(result.success && result.payload.disposition)
      .toBe("quantity-unavailable");
  });

  it("asks for a unit before it asks the gate", () => {
    registerDraught({ useRequirements: [NEEDS_ONE_ARM] });

    const { result } = use([entry({ quantity: 0 })]);

    expect(result.success && result.payload.disposition)
      .toBe("quantity-unavailable");
  });
});


/* -------------------------------------------------------------------------- */
/* Use requirements                                                           */
/* -------------------------------------------------------------------------- */

describe("use requirements", () => {
  it("executes when every named requirement is satisfied", () => {
    registerDraught({ useRequirements: [NEEDS_ONE_ARM] });

    const { result } = use([entry()], "e1", {
      traits: [{ traitId: "one-armed" }],
    });

    expect(executed(result).requirements).toEqual([
      { ...NEEDS_ONE_ARM, disposition: "satisfied" },
    ]);
  });

  it("refuses by name, and consumes and executes nothing", () => {
    registerDraught({ useRequirements: [NEEDS_ONE_ARM] });

    const { character, result } = use([entry()]);

    if (!result.success) throw new Error("expected a refusal, not a failure");

    expect(result.payload).toEqual({
      disposition: "requirements-unsatisfied",
      use: {
        source: { type: "item", id: "calming-draught", instanceId: "e1" },
        item: { characterId: character.id, entryId: "e1" },
        itemId: "calming-draught",
        quantityBefore: 3,
        quantityAfter: 3,
        consumed: 0,
      },
      requirements: [{ ...NEEDS_ONE_ARM, disposition: "unsatisfied" }],
    });

    /* Nothing to half-apply. */
    expect("effects" in result.payload).toBe(false);
    expect("nextCharacter" in result.payload).toBe(false);
    expect(character.items).toEqual([entry()]);
  });

  it("keeps unresolved apart from unsatisfied", () => {
    registerDraught({ useRequirements: [NEEDS_GAUNTLETS] });

    const character = createTestCharacter({ items: [entry()] });
    const base = resolveTestCharacter(character);

    const result = resolveItemUse({
      resolved: {
        ...base,
        requirementContext: withoutItems(base.requirementContext),
      },
      item: { characterId: character.id, entryId: "e1" },
    });

    if (!result.success || result.payload.disposition !== "requirements-unresolved") {
      throw new Error("expected an unresolved use");
    }

    expect(result.payload.requirements).toEqual([
      { ...NEEDS_GAUNTLETS, disposition: "unresolved" },
    ]);
    expect(result.payload.use.consumed).toBe(0);
    expect("effects" in result.payload).toBe(false);
  });

  it("lets a definite refusal outrank an unresolved one", () => {
    registerDraught({ useRequirements: [NEEDS_GAUNTLETS, NEEDS_WINGS] });

    const character = createTestCharacter({ items: [entry()] });
    const base = resolveTestCharacter(character);

    const result = resolveItemUse({
      resolved: {
        ...base,
        requirementContext: withoutItems(base.requirementContext),
      },
      item: { characterId: character.id, entryId: "e1" },
    });

    expect(result.success && result.payload.disposition)
      .toBe("requirements-unsatisfied");
  });

  it("asks the character as they stand before the use", () => {
    /*
     * The gate names the draught itself. Asked of the character AFTER the use,
     * the last draught would fail its own requirement; asked before, it is
     * there to be used.
     */
    registerDraught({
      useRequirements: [
        {
          id: "holding-one",
          requirement: { type: "hasItem", itemId: "calming-draught", state: "possessed" },
        },
      ],
    });

    const { result } = use([entry({ quantity: 1 })]);

    expect(executed(result).use.quantityAfter).toBe(0);
  });

  it("preserves authored ids and summaries, in authored order", () => {
    const gate: readonly NamedRequirement[] = [
      NEEDS_ONE_ARM,
      NEEDS_WINGS,
      {
        id: "seasoned",
        summary: "Must have seen a few things.",
        requirement: { type: "levelMinimum", minimum: 1 },
      },
    ];

    registerDraught({ useRequirements: gate });

    const { result } = use([entry()], "e1", {
      traits: [{ traitId: "one-armed" }],
    });

    if (!result.success || result.payload.disposition !== "requirements-unsatisfied") {
      throw new Error("expected a refusal");
    }

    expect(result.payload.requirements.map(({ id, summary }) => ({ id, summary })))
      .toEqual(gate.map(({ id, summary }) => ({ id, summary })));

    expect(result.payload.requirements.map((one) => one.disposition))
      .toEqual(["satisfied", "unsatisfied", "satisfied"]);
  });

  it("identifies each requirement by id however the list is ordered", () => {
    registerDraught({ useRequirements: [NEEDS_ONE_ARM, NEEDS_WINGS] });
    registerItem("reordered-draught", {
      consumesOnUse: true,
      useEffects: [STEADY_WIS],
      useRequirements: [NEEDS_WINGS, NEEDS_ONE_ARM],
    });

    const verdicts = (itemId: string) => {
      const { result } = use([entry({ itemId })], "e1", {
        traits: [{ traitId: "one-armed" }],
      });

      if (!result.success || !("requirements" in result.payload)) {
        throw new Error("expected requirement resolutions");
      }

      return Object.fromEntries(
        result.payload.requirements.map((one) => [one.id, one.disposition]),
      );
    };

    expect(verdicts("reordered-draught")).toEqual(verdicts("calming-draught"));
  });

  it("executes a use gate with nothing else to do", () => {
    /* A key that opens nothing yet: usable, with an empty Effect answer. */
    registerItem("spirit-key", { useRequirements: [NEEDS_ONE_ARM] });

    const { result } = use([entry({ itemId: "spirit-key" })], "e1", {
      traits: [{ traitId: "one-armed" }],
    });

    const payload = executed(result);

    expect(payload.effects.effects).toEqual([]);
    expect(payload.use.consumed).toBe(0);
  });
});


/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

describe("the referenced entry and no other", () => {
  it("decrements only the referenced one of two identical stacks", () => {
    registerDraught();

    const first = entry({ entryId: "e1", quantity: 3 });
    const second = entry({ entryId: "e2", quantity: 3 });
    const unrelated = entry({ entryId: "e3", itemId: "gauntlets", quantity: 1 });

    const { result } = use([first, second, unrelated], "e2");
    const items = executed(result).nextCharacter.items!;

    expect(items.map((one) => one.entryId)).toEqual(["e1", "e2", "e3"]);

    /* Every unrelated entry is the object it already was. */
    expect(items[0]).toBe(first);
    expect(items[2]).toBe(unrelated);

    expect(items[1]).toEqual({ ...second, quantity: 2 });
    expect(items[1]).not.toBe(second);
  });

  it("carries both identities as provenance", () => {
    registerDraught();

    const { result } = use(
      [entry({ entryId: "e1" }), entry({ entryId: "e2" })],
      "e2",
    );

    const payload = executed(result);
    const source = { type: "item", id: "calming-draught", instanceId: "e2" };

    expect(payload.use.source).toEqual(source);
    expect(payload.effects.effects.map((one) => one.source)).toEqual([source]);
    expect(payload.effects.resolvedAttributeModifiers.map((one) => one.source))
      .toEqual([source]);
  });

  it("resolves the list once, whatever the stack holds", () => {
    registerDraught({ useEffects: [STEADY_WIS, STEADY_PER] });

    const effectsAt = (quantity: number) =>
      executed(use([entry({ quantity })]).result).effects;

    const one = effectsAt(1);
    const fifty = effectsAt(50);

    expect(one.effects.map((sourced) => sourced.effect))
      .toEqual([STEADY_WIS, STEADY_PER]);
    expect(fifty).toEqual(one);
  });
});


/* -------------------------------------------------------------------------- */
/* Three timings                                                              */
/* -------------------------------------------------------------------------- */

describe("possessed, equipped and use Effects stay apart", () => {
  const POSSESSED = { type: "modifyResolvedAttribute", attribute: "cha", amount: -1 } as const;
  const EQUIPPED = { type: "modifyResolvedAttribute", attribute: "int", amount: 1 } as const;

  function registerFieldKit(): void {
    registerItem("field-kit", {
      inventoryMode: "individual",
      shuInteraction: "compatible",
      possessedEffects: [POSSESSED],
      equippedEffects: [EQUIPPED],
      useEffects: [STEADY_WIS],
    });
  }

  function itemEffectsOn(character: Character) {
    return resolveTestCharacter(character).effects.effects
      .filter((sourced) => sourced.source.type === "item")
      .map((sourced) => sourced.effect);
  }

  it("keeps possessed Effects passive and use Effects out of the sheet", () => {
    registerFieldKit();

    const { character, result } = use([
      entry({ itemId: "field-kit", quantity: 1 }),
    ]);

    expect(itemEffectsOn(character)).toEqual([POSSESSED]);
    expect(collectItemEffectSources(character.items).flatMap((one) => one.effects))
      .toEqual([POSSESSED]);

    const payload = executed(result);

    /* The use result holds the use Effects and only those... */
    expect(payload.effects.effects.map((one) => one.effect)).toEqual([STEADY_WIS]);

    /* ...and the sheet after the use still does not. */
    expect(itemEffectsOn(payload.nextCharacter)).toEqual([POSSESSED]);
  });

  it("keeps equipped Effects state-dependent, and use Effects out of the hand", () => {
    registerFieldKit();

    const { character, result } = use([
      entry({ itemId: "field-kit", quantity: 1, state: "held" }),
    ]);

    expect(itemEffectsOn(character)).toEqual([POSSESSED, EQUIPPED]);
    expect(executed(result).effects.effects.map((one) => one.effect))
      .toEqual([STEADY_WIS]);
  });

  it("stops the passive Effects of a consumable once it is used up", () => {
    registerItem("field-kit", {
      inventoryMode: "individual",
      shuInteraction: "compatible",
      consumesOnUse: true,
      possessedEffects: [POSSESSED],
      equippedEffects: [EQUIPPED],
      useEffects: [STEADY_WIS],
    });

    const { result } = use([
      entry({ itemId: "field-kit", quantity: 1, state: "worn" }),
    ]);

    /* The last one is gone, so nothing is owned to contribute anything. */
    expect(itemEffectsOn(executed(result).nextCharacter)).toEqual([]);
  });
});


/* -------------------------------------------------------------------------- */
/* Not usable                                                                 */
/* -------------------------------------------------------------------------- */

describe("an Item with nothing to use", () => {
  it.each(["gauntlets", "cursed-idol"])(
    "reports authored %s as not usable",
    (itemId) => {
      const { character, result } = use([entry({ itemId, quantity: 1 })]);

      expect(result.success && result.payload).toEqual({
        disposition: "not-usable",
        item: { characterId: character.id, entryId: "e1" },
      });
    },
  );

  it("does not treat an explicit reusable declaration as a use", () => {
    registerItem("inert-pebble", { consumesOnUse: false });

    const { result } = use([entry({ itemId: "inert-pebble" })]);

    expect(result.success && result.payload.disposition).toBe("not-usable");
  });

  it("says which declarations make an Item usable", () => {
    const base = {
      id: "x",
      name: "X",
      description: "X.",
      inventoryMode: "stackable",
      shuInteraction: "compatible",
    } as const;

    expect(isActivelyUsableItem(base)).toBe(false);
    expect(isActivelyUsableItem({ ...base, useEffects: [] })).toBe(false);
    expect(isActivelyUsableItem({ ...base, useRequirements: [] })).toBe(false);
    expect(isActivelyUsableItem({ ...base, consumesOnUse: false })).toBe(false);

    expect(isActivelyUsableItem({ ...base, useEffects: [STEADY_WIS] })).toBe(true);
    expect(isActivelyUsableItem({ ...base, useRequirements: [NEEDS_ONE_ARM] })).toBe(true);
    expect(isActivelyUsableItem({ ...base, consumesOnUse: true })).toBe(true);
  });
});


/* -------------------------------------------------------------------------- */
/* Malformed questions                                                        */
/* -------------------------------------------------------------------------- */

describe("malformed questions are failures, not refusals", () => {
  it("distinguishes every reference failure", () => {
    registerDraught();

    const { character, resolved } = swapped([
      entry({ entryId: "e1" }),
      { entryId: "corrupt", itemId: "calming-draught", quantity: "three", state: "carried" },
    ]);

    const cases = [
      [{ characterId: "", entryId: "e1" }, "equipment.use.reference_invalid"],
      [{ characterId: character.id }, "equipment.use.reference_invalid"],
      [{ characterId: "someone-else", entryId: "e1" }, "equipment.use.character_mismatch"],
      [{ characterId: character.id, entryId: "e404" }, "equipment.use.entry_unknown"],
      [{ characterId: character.id, entryId: "corrupt" }, "equipment.use.entry_invalid"],
    ] as const;

    for (const [item, code] of cases) {
      const result = resolveItemUse({ resolved, item: item as never });

      expect(failureCode(result)).toBe(code);
    }
  });

  it("refuses an input with no readable resolved character", () => {
    const resolved = resolveTestCharacter(createTestCharacter());
    const item = { characterId: resolved.character.id, entryId: "e1" };

    const { requirementContext: _omitted, ...withoutContext } = resolved;

    for (const input of [
      undefined,
      null,
      {},
      { item },
      { resolved: null, item },
      { resolved: { ...resolved, character: null }, item },
      { resolved: { ...resolved, character: { ...resolved.character, id: 42 } }, item },
      { resolved: withoutContext, item },
    ]) {
      expect(failureCode(resolveItemUse(input as never)))
        .toBe("equipment.use.input_invalid");
    }
  });

  it("refuses an entry naming an Item no catalog defines", () => {
    const { character, resolved } = swapped([entry({ itemId: "nothing-defines-this" })]);

    const result = resolveItemUse({
      resolved,
      item: { characterId: character.id, entryId: "e1" },
    });

    expect(failureCode(result)).toBe("equipment.use.item_unknown");
  });

  it.each([
    ["a consumesOnUse that is not a boolean", { consumesOnUse: "yes" }],
    ["use Effects that are not a list", { useEffects: {} }],
    ["a bare use requirement", { useRequirements: [NEEDS_ONE_ARM.requirement] }],
    [
      "two use requirements sharing an id",
      { useRequirements: [NEEDS_ONE_ARM, { ...NEEDS_WINGS, id: "needs-one-arm" }] },
    ],
    ["no inventory mode", { inventoryMode: undefined }],
  ] as const)("refuses a definition with %s", (_label, fields) => {
    const { character, resolved } = swapped([entry()]);

    const definition = {
      id: "calming-draught",
      name: "Calming Draught",
      description: "A test Item.",
      inventoryMode: "stackable",
      shuInteraction: "compatible",
      consumesOnUse: true,
      useEffects: [STEADY_WIS],
      ...fields,
    };

    const result = resolveItemUseWith(
      { resolved, item: { characterId: character.id, entryId: "e1" } },
      () => definition as unknown as ItemDefinition,
    );

    expect(failureCode(result)).toBe("equipment.use.definition_invalid");
    expect(!result.success && result.errors[0].audience).toBe("developer");
  });

  it("refuses a lookup that hands back something that is not a definition", () => {
    const { character, resolved } = swapped([entry()]);

    for (const value of [null, 42, "calming-draught", []]) {
      const result = resolveItemUseWith(
        { resolved, item: { characterId: character.id, entryId: "e1" } },
        () => value as never,
      );

      expect(failureCode(result)).toBe("equipment.use.definition_invalid");
    }
  });

  it("carries a trace on every failure, naming no unvalidated fact", () => {
    const { character, resolved } = swapped([entry()]);

    const result = resolveItemUse({
      resolved,
      item: { characterId: character.id, entryId: "UNVALIDATED-ENTRY" },
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.trace)).toContain("character.equipment.use");
    expect(JSON.stringify(result.trace)).not.toContain("UNVALIDATED-ENTRY");
  });
});


/* -------------------------------------------------------------------------- */
/* The requirement context                                                    */
/* -------------------------------------------------------------------------- */

/*
 * The resolver checked only that `requirementContext` was an object. So
 * `{ ...resolved, requirementContext: {} }` passed the guard, and an
 * attributeMinimum gate then threw reading `attributes.base` — a malformed
 * input becoming the exception this resolver promises never to raise.
 *
 * The gate below reads EVERY field of a context, one requirement type each, so
 * a field the boundary forgot would reach the evaluator here and throw rather
 * than pass unnoticed.
 */
describe("a malformed requirement context is a failure, not a throw", () => {
  function gatedUse() {
    registerDraught({ useRequirements: EVERY_CONTEXT_FIELD_GATE });

    const character = createTestCharacter({ items: [entry()] });
    const resolved = resolveTestCharacter(character);

    return {
      character,
      resolved,
      item: { characterId: character.id, entryId: "e1" },
    };
  }

  it("answers normally against the context resolution built", () => {
    const { resolved, item } = gatedUse();

    const result = resolveItemUse({ resolved, item });

    expect(result.success && result.payload.disposition)
      .toBe("requirements-unsatisfied");
  });

  it("refuses the reported context rather than throwing inside the gate", () => {
    const { resolved, item } = gatedUse();

    const hostile = { ...resolved, requirementContext: {} } as never;

    /* The evaluator alone would throw on it; the resolver must not. */
    expect(() => resolveNamedRequirements(EVERY_CONTEXT_FIELD_GATE, {} as never)).toThrow();

    let result: ReturnType<typeof resolveItemUse> | undefined;

    expect(() => {
      result = resolveItemUse({ resolved: hostile, item });
    }).not.toThrow();

    expect(result && failureCode(result)).toBe("equipment.use.input_invalid");
  });

  it("refuses every hostile nested field, naming it", () => {
    const { resolved, item } = gatedUse();

    for (const [label, path, context] of hostileRequirementContexts(
      resolved.requirementContext,
    )) {
      let result: ReturnType<typeof resolveItemUse> | undefined;

      expect(() => {
        result = resolveItemUse({
          resolved: { ...resolved, requirementContext: context } as never,
          item,
        });
      }, label).not.toThrow();

      expect(result && failureCode(result), label).toBe("equipment.use.input_invalid");
      expect(result && !result.success && result.errors[0].message, label)
        .toContain(path);

      /* Refused before the gate: nothing was consumed or resolved. */
      expect(JSON.stringify(result?.trace), label).not.toContain("requirement.stored");
    }
  });

  it("refuses a hostile context even for an Item with no gate to read it", () => {
    /*
     * The context is validated as part of the INPUT, not lazily when a
     * requirement happens to read it — so whether a malformed context is
     * accepted does not depend on which Item the caller picked.
     */
    registerWhetstone();

    const character = createTestCharacter({ items: [entry({ itemId: "whetstone" })] });
    const resolved = resolveTestCharacter(character);

    const result = resolveItemUse({
      resolved: { ...resolved, requirementContext: { ...resolved.requirementContext, level: "1" } } as never,
      item: { characterId: character.id, entryId: "e1" },
    });

    expect(failureCode(result)).toBe("equipment.use.input_invalid");
  });
});


/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

describe("the use surface is validated on its own", () => {
  const BAD_EFFECT = {
    type: "modifyResolvedAttribute",
    attribute: "wis",
    amount: Number.NaN,
  };

  it("does not let a malformed use Effect block an unequip", () => {
    const definition = {
      id: "warded-band",
      name: "Warded Band",
      description: "A test Item.",
      inventoryMode: "individual",
      shuInteraction: "compatible",
      useEffects: [BAD_EFFECT],
    } as unknown as ItemDefinition;

    expect(findItemEquipmentDefinitionIssues(definition)).toEqual([]);
    expect(findItemUseDefinitionIssues(definition)).not.toEqual([]);

    const { character, resolved } = swapped([
      entry({ itemId: "warded-band", quantity: 1, state: "held" }),
    ]);

    /*
     * Through the unbound transition, since the definition cannot register:
     * a broken potion is not a reason to refuse to take off the belt.
     */
    const transition = resolveTransitionWith(
      {
        resolved,
        item: { characterId: character.id, entryId: "e1" },
        destination: "carried",
      },
      () => definition,
    );

    expect(transition.success && transition.payload.disposition).toBe("available");
  });

  it("does not let a malformed passive Effect block a use", () => {
    const definition = {
      id: "calming-draught",
      name: "Calming Draught",
      description: "A test Item.",
      inventoryMode: "individual",
      shuInteraction: "compatible",
      consumesOnUse: true,
      equippedEffects: [BAD_EFFECT],
      useEffects: [STEADY_WIS],
    } as unknown as ItemDefinition;

    expect(findItemEquipmentDefinitionIssues(definition)).not.toEqual([]);
    expect(findItemUseDefinitionIssues(definition)).toEqual([]);

    const { character, resolved } = swapped([entry({ quantity: 1 })]);

    const result = resolveItemUseWith(
      { resolved, item: { characterId: character.id, entryId: "e1" } },
      () => definition,
    );

    expect(executed(result).use.consumed).toBe(1);
  });

  it("reports a shared core fault once across the whole definition", () => {
    const definition = {
      id: "calming-draught",
      name: "Calming Draught",
      description: "A test Item.",
      useEffects: [STEADY_WIS],
    };

    /* Two core faults now: no inventoryMode, and no shuInteraction. */
    expect(findItemCoreDefinitionIssues(definition)).toHaveLength(2);
    expect(findItemEquipmentDefinitionIssues(definition)).toHaveLength(2);
    expect(findItemUseDefinitionIssues(definition)).toHaveLength(2);

    expect(findItemStructuralIssues(definition)).toEqual([
      expect.stringContaining("must declare an inventoryMode"),
      expect.stringContaining("must declare a shuInteraction"),
    ]);
  });

  it("names the field a use fault is in", () => {
    expect(findItemStructuralIssues({
      id: "calming-draught",
      name: "Calming Draught",
      description: "A test Item.",
      inventoryMode: "stackable",
      shuInteraction: "compatible",
      consumesOnUse: "true",
      useRequirements: [{ id: "", requirement: NEEDS_ONE_ARM.requirement }],
    })).toEqual([
      expect.stringContaining("malformed useRequirements: invalid-named-requirement-id at useRequirements[0].id"),
      expect.stringContaining("consumesOnUse that is neither true nor false"),
    ]);
  });

  it.each(
    ["useEffects", "useRequirements", "consumesOnUse"].flatMap((field) =>
      HOSTILE_VALUES.map((value, index) => [field, index, value] as const),
    ),
  )("survives %s holding hostile value %i", (field, _index, value) => {
    const definition: Record<string, unknown> = {
      id: "calming-draught",
      name: "Calming Draught",
      description: "A test Item.",
      inventoryMode: "stackable",
      shuInteraction: "compatible",
      [field]: value,
    };

    expect(() => findItemUseDefinitionIssues(definition)).not.toThrow();
    expect(() => findItemStructuralIssues(definition)).not.toThrow();

    const { character, resolved } = swapped([entry()]);

    expect(() =>
      resolveItemUseWith(
        { resolved, item: { characterId: character.id, entryId: "e1" } },
        () => definition as unknown as ItemDefinition,
      ),
    ).not.toThrow();
  });
});


/* -------------------------------------------------------------------------- */
/* Purity                                                                     */
/* -------------------------------------------------------------------------- */

describe("purity", () => {
  it("mutates no input, definition, inventory, entry or resolved character", () => {
    const definition = deepFreeze({
      id: "calming-draught",
      name: "Calming Draught",
      description: "A test Item.",
      inventoryMode: "stackable",
      shuInteraction: "compatible",
      consumesOnUse: true,
      useRequirements: [NEEDS_ONE_ARM],
      useEffects: [STEADY_WIS, STEADY_PER],
    } as ItemDefinition);

    const selected = entry({ entryId: "e1", quantity: 3 });
    const other = entry({ entryId: "e2", quantity: 5 });

    /*
     * The character, its inventory and every entry are frozen; its body is a
     * shared fixture and is left alone rather than frozen for every later test.
     */
    const character = Object.freeze(createTestCharacter({
      items: Object.freeze([Object.freeze(selected), Object.freeze(other)]),
      traits: [{ traitId: "one-armed" }],
    }));

    const resolved = resolveTestCharacter(character);
    const resolvedBefore = JSON.stringify(resolved);

    const result = resolveItemUseWith(
      { resolved, item: { characterId: character.id, entryId: "e1" } },
      () => definition,
    );

    const payload = executed(result);

    expect(payload.use.consumed).toBe(1);
    expect(payload.nextCharacter).not.toBe(character);

    expect(character.items).toEqual([
      entry({ entryId: "e1", quantity: 3 }),
      entry({ entryId: "e2", quantity: 5 }),
    ]);
    expect(JSON.stringify(resolved)).toBe(resolvedBefore);
    expect(definition.useEffects).toEqual([STEADY_WIS, STEADY_PER]);
  });

  it("answers the same question the same way twice", () => {
    registerDraught({ useRequirements: [NEEDS_ONE_ARM] });

    const character = createTestCharacter({
      items: [entry()],
      traits: [{ traitId: "one-armed" }],
    });
    const resolved = resolveTestCharacter(character);
    const input = { resolved, item: { characterId: character.id, entryId: "e1" } };

    expect(JSON.stringify(resolveItemUse(input)))
      .toBe(JSON.stringify(resolveItemUse(input)));
  });

  it("survives JSON, which is what a trace is for", () => {
    registerDraught({ useRequirements: [NEEDS_ONE_ARM] });

    const { result } = use([entry()], "e1", { traits: [{ traitId: "one-armed" }] });
    const trace = JSON.stringify(result.trace);

    expect(JSON.parse(trace)).toEqual(result.trace);
    expect(trace).toContain("requirement.needs-one-arm");
    expect(trace).toContain("calming-draught");
  });
});


/* -------------------------------------------------------------------------- */
/* Public surface                                                             */
/* -------------------------------------------------------------------------- */

describe("the public engine surface", () => {
  it("exports the catalog-bound resolver", () => {
    expect(engine.resolveItemUse).toBe(resolveItemUse);
    expect(engine.isActivelyUsableItem).toBe(isActivelyUsableItem);
  });
});
