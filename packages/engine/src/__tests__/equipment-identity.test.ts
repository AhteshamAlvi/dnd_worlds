/*
 * Inventory entries have identity; inventory ARRAYS do not.
 *
 * The old model said an Item was `{ itemId, quantity, equipped }` and a
 * character had one line per Item. Three facts were unrepresentable in it, and
 * each is a test below:
 *
 * - a character with two of the same thing, one in the hand and one packed,
 *   because a single quantity cannot say which one is in the hand;
 * - a reference to a particular owned object, because the only two ways to
 *   write one were an array index (which changes when the array is sorted) and
 *   a definition id (which names every copy at once);
 * - a trace saying which of two identical gauntlets produced a bonus, because
 *   both contributions carried the same source and compared equal.
 *
 * The state vocabulary is the fourth. `equipped: boolean` collapsed held and
 * worn into one bit, so hands, body slots and Shū would each have had to
 * recover the distinction from the Item definition — separately, and therefore
 * eventually differently.
 *
 * What is NOT tested here, because it is deliberately not built: equip and
 * unequip actions, equipRequirements, Item use, quantity decrement, stack
 * splitting, slots, conflicts, or any combat contribution.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  contributionSourceKey,
  isSameContributionSource,
} from "../infrastructure/contribution-source";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import {
  ITEM_DEFINITIONS,
  ITEM_EQUIPMENT_STATES,
  collectItemEffectSources,
  collectItemState,
  createInventoryItemRef,
  findInventoryEntry,
  findInventoryEntryOutcome,
  findItemCatalogIssues,
  findItemValidationIssues,
  getActiveItemEffects,
  getItemDefinition,
  isCharacterItemShape,
  isConcreteInventoryObject,
  isEquippedItemState,
  isInventoryEntryId,
  isInventoryItemRef,
  isInventoryQuantity,
  isItemEquipmentState,
  isStackableItem,
  resolveInventoryItemRef,
  type CharacterItem,
  type ItemEquipmentState,
} from "../character/equipment/index";

import { meetsRequirement, resolveRequirement } from "../character/rules/resolution";
import type { RequirementContext } from "../character/rules/resolution";

import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});


/*
 * Every value a field can hold that it must not.
 *
 * A list rather than a case per bug, for the reason spatial validation
 * settled on one: a case per bug tests the mistakes already found, while a
 * sweep catches the next field that grows a read. Each of these has broken
 * something in this codebase before — `""` and `"   "` look like ids and are
 * not, `{}` and `[]` survive a typeof check, and NaN and Infinity are numbers
 * that are not counts.
 */
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


function entry(overrides: Partial<CharacterItem> = {}): CharacterItem {
  return {
    entryId: "e1",
    itemId: "gauntlets",
    quantity: 1,
    state: "carried",
    ...overrides,
  };
}


/*
 * A stackable Item, registered per test rather than authored.
 *
 * The engine's own catalog holds two Items and both are individual, which is
 * correct: a stackable one would be authored content — a consumable or
 * ammunition — that this ticket explicitly does not design. Registering it
 * here exercises the mode without shipping a rule nobody chose.
 *
 * It declares no passive Effects, which is not incidental: findItemCatalog-
 * Issues() refuses a stackable definition that does, and a test fixture
 * breaking the catalog rule it is meant to sit beside would be the wrong kind
 * of convenient.
 */
const STACKABLE_ID = "trail-rations";

function registerStackable(): void {
  registerDefinition("item", {
    id: STACKABLE_ID,
    name: "Trail Rations",
    description: "A test Item whose copies are a count and nothing else.",
    inventoryMode: "stackable",
  });
}


function stack(overrides: Partial<CharacterItem> = {}): CharacterItem {
  return entry({ itemId: STACKABLE_ID, ...overrides });
}


/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

describe("inventory entry identity", () => {
  it("lets two entries name the same Item definition", () => {
    const inventory = [
      entry({ entryId: "left-hand", state: "held" }),
      entry({ entryId: "in-pack" }),
    ];

    expect(findItemValidationIssues(inventory)).toEqual([]);

    /* The definition is genuinely shared; only the entry ids differ. */
    expect(new Set(inventory.map((one) => one.itemId)).size).toBe(1);
  });

  it("refuses a repeated entry id", () => {
    expect(
      findItemValidationIssues([
        entry({ entryId: "same" }),
        entry({ entryId: "same", itemId: "cursed-idol" }),
      ]),
    ).toEqual([{ type: "duplicate-item-entry-id", entryId: "same" }]);
  });

  it("refuses empty and whitespace-only entry ids", () => {
    for (const entryId of ["", "   ", "\t\n"]) {
      expect(findItemValidationIssues([entry({ entryId })])).toEqual([
        { type: "invalid-item-entry-id", entryIndex: 0, entryId },
      ]);
    }
  });

  it("reports an unidentifiable entry once rather than field by field", () => {
    /*
     * The entry is wrong in three ways at once. Only the identity is
     * reported, because the other two complaints could not name a line for
     * anyone to go and fix.
     */
    expect(
      findItemValidationIssues([
        { entryId: "", itemId: "not-real", quantity: -1, state: "sheathed" } as
          unknown as CharacterItem,
      ]),
    ).toEqual([{ type: "invalid-item-entry-id", entryIndex: 0, entryId: "" }]);
  });

  it("accepts an entry id that looks nothing like a definition id", () => {
    /*
     * Entry ids are host-supplied and are NOT held to DEFINITION_ID_PATTERN:
     * a UUID, a Foundry document id or a hand-typed label are all legitimate,
     * and refusing them would make the engine the arbiter of a namespace it
     * does not own.
     */
    expect(isInventoryEntryId("A7F3-11e9_#2")).toBe(true);
    expect(findItemValidationIssues([entry({ entryId: "A7F3-11e9_#2" })]))
      .toEqual([]);
  });
});


describe("inventory references", () => {
  const CHARACTER = "char-abc";

  const inventory = [
    entry({ entryId: "first", state: "held" }),
    entry({ entryId: "second", itemId: "cursed-idol" }),
  ];

  it("resolves by entry id, not by array position", () => {
    const ref = createInventoryItemRef(CHARACTER, "second");
    const found = resolveInventoryItemRef(ref, CHARACTER, inventory);

    expect(found.ok).toBe(true);
    expect(found.ok && found.entry.itemId).toBe("cursed-idol");
  });

  it("identifies the same object after the inventory is reordered", () => {
    const ref = createInventoryItemRef(CHARACTER, "first");

    const before = resolveInventoryItemRef(ref, CHARACTER, inventory);
    const after = resolveInventoryItemRef(ref, CHARACTER, [...inventory].reverse());

    expect(before).toEqual(after);
    expect(after.ok && after.entry.entryId).toBe("first");

    /*
     * The point stated the other way round: position 0 is a DIFFERENT object
     * in the two lists, so anything reading by index would have moved.
     */
    expect(inventory[0]?.entryId).not.toBe([...inventory].reverse()[0]?.entryId);
  });

  it("answers an unknown reference with a diagnostic rather than an exception", () => {
    expect(
      resolveInventoryItemRef(
        createInventoryItemRef(CHARACTER, "sold-last-week"),
        CHARACTER,
        inventory,
      ),
    ).toEqual({ ok: false, issue: "unknown-entry" });
  });

  it("refuses a reference belonging to another character", () => {
    expect(
      resolveInventoryItemRef(
        createInventoryItemRef("char-somebody-else", "first"),
        CHARACTER,
        inventory,
      ),
    ).toEqual({ ok: false, issue: "character-mismatch" });
  });

  it("distinguishes a malformed reference from a missing object", () => {
    /*
     * Three answers rather than one absence, because they call for three
     * different responses: fix the caller, use the right sheet, or tell the
     * player the potion is gone.
     */
    expect(resolveInventoryItemRef({ entryId: "first" }, CHARACTER, inventory))
      .toEqual({ ok: false, issue: "invalid-reference" });
  });

  it("never throws on a hostile reference, owner or inventory", () => {
    for (const value of HOSTILE_VALUES) {
      expect(() => resolveInventoryItemRef(value, CHARACTER, inventory))
        .not.toThrow();

      expect(
        resolveInventoryItemRef(
          { characterId: CHARACTER, entryId: value },
          CHARACTER,
          inventory,
        ).ok,
      ).toBe(false);

      expect(() =>
        resolveInventoryItemRef(
          createInventoryItemRef(CHARACTER, "first"),
          CHARACTER,
          value as readonly CharacterItem[],
        ),
      ).not.toThrow();

      expect(isInventoryEntryId(value)).toBe(false);
      expect(isInventoryItemRef(value)).toBe(false);
    }
  });

  it("walks past a malformed entry rather than dereferencing it", () => {
    const ragged = [null, undefined, entry({ entryId: "real" })] as
      unknown as readonly CharacterItem[];

    expect(findInventoryEntry(ragged, "real")?.entryId).toBe("real");
    expect(findInventoryEntry(ragged, "absent")).toBeUndefined();
  });
});


describe("a lookup never hands back an unvalidated entry", () => {
  const CHARACTER = "char-abc";

  /*
   * The defect this suite exists for: findInventoryEntry() matched on entryId
   * alone and then narrowed the result to CharacterItem, so
   * `[{ entryId: "sword-1" }]` resolved ok:true and handed the caller an
   * "entry" with no itemId, no quantity and no state — typed as a complete
   * one. Matching an id proves an id matched. It proves nothing about the rest
   * of the object.
   */
  const MALFORMED: readonly unknown[] = [
    { entryId: "target" },
    { entryId: "target", itemId: null, quantity: 1, state: "carried" },
    { entryId: "target", itemId: "gauntlets", quantity: Number.NaN, state: "carried" },
    { entryId: "target", itemId: "gauntlets", quantity: 1, state: "invalid" },
    { entryId: "target", itemId: "", quantity: 1, state: "carried" },
    { entryId: "target", itemId: "gauntlets", quantity: -1, state: "carried" },
    /* Held with a quantity of three is not one object, whatever it claims. */
    { entryId: "target", itemId: "gauntlets", quantity: 3, state: "held" },
  ];

  it.each(MALFORMED.map((value, index) => [index, value] as const))(
    "refuses malformed entry %i rather than resolving it",
    (_index, malformed) => {
      const items = [malformed] as unknown as readonly CharacterItem[];

      const resolved = resolveInventoryItemRef(
        createInventoryItemRef(CHARACTER, "target"),
        CHARACTER,
        items,
      );

      expect(resolved.ok).toBe(false);
      expect(resolved.ok === false && resolved.issue).toBe("invalid-entry");

      expect(findInventoryEntry(items, "target")).toBeUndefined();
      expect(isCharacterItemShape(malformed)).toBe(false);
    },
  );

  it("distinguishes a corrupt entry from one that is gone", () => {
    /*
     * Not folded into unknown-entry on purpose. The object IS on the sheet and
     * cannot be used, and telling a host it does not exist invites the wrong
     * fix — dropping a line that needs repairing.
     */
    const corrupt = [{ entryId: "target" }] as unknown as readonly CharacterItem[];

    expect(findInventoryEntryOutcome(corrupt, "target"))
      .toEqual({ ok: false, issue: "invalid-entry" });

    expect(findInventoryEntryOutcome(corrupt, "never-owned"))
      .toEqual({ ok: false, issue: "unknown-entry" });
  });

  it("still returns a sound entry standing beside a corrupt one", () => {
    const ragged = [
      { entryId: "broken" },
      entry({ entryId: "sound" }),
    ] as unknown as readonly CharacterItem[];

    expect(findInventoryEntry(ragged, "sound")?.itemId).toBe("gauntlets");
    expect(findInventoryEntry(ragged, "broken")).toBeUndefined();
  });

  it("accepts every field of a sound entry, and says so structurally", () => {
    /* The positive half: the guard must not be refusing everything. */
    expect(isCharacterItemShape(entry())).toBe(true);
    expect(isCharacterItemShape(entry({ state: "held" }))).toBe(true);
    expect(isCharacterItemShape(entry({ quantity: 0 }))).toBe(true);

    /*
     * Catalog membership is deliberately NOT part of the shape: whether
     * "spirit-blade" exists depends on what a host registered, and a lookup
     * that answered differently before and after a catalog load would be one
     * nobody could reason about.
     */
    expect(isCharacterItemShape(entry({ itemId: "not-a-real-item" }))).toBe(true);
  });
});


/* -------------------------------------------------------------------------- */
/* Equipment state                                                            */
/* -------------------------------------------------------------------------- */

describe("equipment state", () => {
  it("treats held and worn as distinct states that are both equipped", () => {
    expect([...ITEM_EQUIPMENT_STATES]).toEqual(["carried", "held", "worn"]);

    expect(isEquippedItemState("held")).toBe(true);
    expect(isEquippedItemState("worn")).toBe(true);
    expect(isEquippedItemState("carried")).toBe(false);
  });

  it("refuses unknown states without throwing", () => {
    for (const value of [...HOSTILE_VALUES, "equipped", "Held", "sheathed"]) {
      expect(() => isItemEquipmentState(value)).not.toThrow();
      expect(isItemEquipmentState(value)).toBe(false);

      expect(
        findItemValidationIssues([
          entry({ state: value as ItemEquipmentState }),
        ]),
      ).toContainEqual({
        type: "invalid-item-state",
        entryId: "e1",
        state: value,
      });
    }
  });

  it("calls only a quantity of exactly one a concrete object", () => {
    expect(isConcreteInventoryObject(entry({ quantity: 1 }))).toBe(true);
    expect(isConcreteInventoryObject(entry({ quantity: 0 }))).toBe(false);
    expect(isConcreteInventoryObject(entry({ quantity: 3 }))).toBe(false);
  });

  it("refuses hostile quantities without throwing", () => {
    registerStackable();

    /*
     * 42 is dropped from the sweep because it is a perfectly good count of
     * rations. Keeping it would have this test assert that a legal quantity is
     * refused, which is the kind of hostile-input check that passes while
     * describing the wrong rule.
     */
    for (const value of HOSTILE_VALUES.filter((one) => one !== 42)) {
      expect(() => isInventoryQuantity(value)).not.toThrow();
      expect(isInventoryQuantity(value)).toBe(false);

      expect(
        findItemValidationIssues([stack({ quantity: value as number })]),
      ).toContainEqual({
        type: "invalid-item-quantity",
        entryId: "e1",
        quantity: value,
      });
    }

    /* Zero is legal: an emptied quiver is still a quiver. So is a real count. */
    expect(isInventoryQuantity(0)).toBe(true);
    expect(isInventoryQuantity(42)).toBe(true);
    expect(findItemValidationIssues([stack({ quantity: 0 })])).toEqual([]);
    expect(findItemValidationIssues([stack({ quantity: 42 })])).toEqual([]);

    /* Fractions and negatives are not counts of anything. */
    for (const value of [1.5, -1, -0.5]) {
      expect(isInventoryQuantity(value)).toBe(false);
    }
  });

  it("refuses a held or worn entry that is not exactly one object", () => {
    registerStackable();

    for (const state of ["held", "worn"] as const) {
      /*
       * Read off a STACKABLE Item, so the only rule under test is engagement.
       * An individual Item at quantity 3 is separately invalid, and asserting
       * both here would make the test pass for a reason it does not name.
       */
      for (const quantity of [0, 2, 3]) {
        expect(findItemValidationIssues([stack({ state, quantity })])).toEqual([
          {
            type: "invalid-engaged-item-quantity",
            entryId: "e1",
            state,
            quantity,
          },
        ]);
      }

      expect(findItemValidationIssues([stack({ state, quantity: 1 })]))
        .toEqual([]);

      /* And an individual Item engages the same way at one. */
      expect(findItemValidationIssues([entry({ state, quantity: 1 })]))
        .toEqual([]);
    }
  });

  it("lets a carried stackable entry hold any legal quantity", () => {
    registerStackable();

    for (const quantity of [0, 1, 7]) {
      expect(
        findItemValidationIssues([stack({ state: "carried", quantity })]),
      ).toEqual([]);
    }
  });

  it("refuses to stack an individual Item at all", () => {
    for (const quantity of [2, 7]) {
      expect(findItemValidationIssues([entry({ quantity })])).toEqual([
        {
          type: "invalid-individual-item-quantity",
          entryId: "e1",
          itemId: "gauntlets",
          quantity,
        },
      ]);
    }

    /* Zero and one are the two an individual entry may hold. */
    for (const quantity of [0, 1]) {
      expect(findItemValidationIssues([entry({ quantity })])).toEqual([]);
    }
  });

  it("does not report an engagement problem it cannot count", () => {
    /*
     * "Held with a quantity of NaN" is one problem. Reporting it twice would
     * put a figure that is not a number into a message about how many there
     * are.
     */
    const issues = findItemValidationIssues([
      entry({ state: "held", quantity: Number.NaN }),
    ]);

    expect(issues).toEqual([
      { type: "invalid-item-quantity", entryId: "e1", quantity: Number.NaN },
    ]);
  });

  it("survives an inventory that is not an array of anything", () => {
    for (const value of HOSTILE_VALUES) {
      expect(() =>
        findItemValidationIssues(value as readonly CharacterItem[]),
      ).not.toThrow();

      expect(() =>
        findItemValidationIssues([value] as readonly CharacterItem[]),
      ).not.toThrow();
    }
  });
});


/* -------------------------------------------------------------------------- */
/* What each state contributes                                                */
/* -------------------------------------------------------------------------- */

describe("effects by engagement state", () => {
  const gauntlets = getItemDefinition("gauntlets")!;
  const idol = getItemDefinition("cursed-idol")!;

  it("gives a carried Item its possessed effects only", () => {
    expect(getActiveItemEffects(idol, entry({ itemId: "cursed-idol" })))
      .toEqual(idol.possessedEffects);

    expect(getActiveItemEffects(gauntlets, entry())).toEqual([]);
  });

  it.each(["held", "worn"] as const)(
    "gives a %s Item its possessed and equipped effects",
    (state) => {
      expect(getActiveItemEffects(gauntlets, entry({ state })))
        .toEqual(gauntlets.equippedEffects);
    },
  );

  it("gives a zero-quantity entry nothing, whatever it declares", () => {
    expect(
      getActiveItemEffects(
        idol,
        entry({ itemId: "cursed-idol", quantity: 0 }),
      ),
    ).toEqual([]);
  });

  it("never collects useEffects", () => {
    registerDefinition("item", {
      id: "healing-draught",
      /* A consumable: nobody asks which draught, and it bears no passive rule. */
      inventoryMode: "stackable",
      name: "Healing Draught",
      description: "A test Item whose Effects are events.",
      useEffects: [
        { type: "modifyResolvedAttribute", attribute: "vit", amount: 5 },
      ],
    });

    const definition = getItemDefinition("healing-draught")!;

    for (const state of ITEM_EQUIPMENT_STATES) {
      expect(getActiveItemEffects(definition, entry({
        itemId: "healing-draught",
        state,
      }))).toEqual([]);
    }
  });

  it("applies a worn Item through full character resolution", () => {
    const resolved = resolveTestCharacter(
      createTestCharacter({
        items: [entry({ entryId: "worn", state: "worn" })],
      }),
    );

    expect(resolved.effects.persistentCheckModifiers).toHaveLength(1);
  });
});


/* -------------------------------------------------------------------------- */
/* Requirements                                                               */
/* -------------------------------------------------------------------------- */

describe("Item requirements stay definition-based", () => {
  function contextFor(items: readonly CharacterItem[]): RequirementContext {
    return {
      attributes: {
        stored: {} as never,
        base: {} as never,
        resolved: {} as never,
      },
      level: 1,
      speciesIds: [],
      clanIds: [],
      traitIds: [],
      skillIds: [],
      techniqueIds: [],
      skillMastery: {},
      techniqueMastery: {},
      conditionIds: [],
      items: collectItemState(items),
    };
  }

  const possessed = { type: "hasItem", itemId: "gauntlets", state: "possessed" } as const;
  const equipped = { type: "hasItem", itemId: "gauntlets", state: "equipped" } as const;

  it("lets a carried Item satisfy possession and not equipment", () => {
    const context = contextFor([entry({ quantity: 2 })]);

    expect(meetsRequirement(possessed, context)).toBe(true);
    expect(meetsRequirement(equipped, context)).toBe(false);
  });

  it.each(["held", "worn"] as const)("lets a %s Item satisfy both", (state) => {
    const context = contextFor([entry({ state })]);

    expect(meetsRequirement(possessed, context)).toBe(true);
    expect(meetsRequirement(equipped, context)).toBe(true);
  });

  it("gives a zero-quantity entry no requirement presence at all", () => {
    const context = contextFor([entry({ quantity: 0 })]);

    expect(meetsRequirement(possessed, context)).toBe(false);
    expect(meetsRequirement(equipped, context)).toBe(false);
  });

  it("is unchanged by repeated entries of one definition", () => {
    /*
     * Two swords answer "do you have a sword" exactly as loudly as one, so the
     * collected state is deduplicated and the answers are identical.
     */
    const one = collectItemState([entry({ entryId: "a", state: "held" })]);
    const many = collectItemState([
      entry({ entryId: "a", state: "held" }),
      entry({ entryId: "b" }),
      entry({ entryId: "c", quantity: 4 }),
    ]);

    expect(many).toEqual(one);

    expect(meetsRequirement(possessed, contextFor([
      entry({ entryId: "a", state: "held" }),
      entry({ entryId: "b" }),
    ]))).toBe(true);
  });

  it("collects definition ids, never entry ids", () => {
    const state = collectItemState([
      entry({ entryId: "totally-not-an-item-id", state: "worn" }),
    ]);

    expect(state).toEqual({
      possessed: ["gauntlets"],
      equipped: ["gauntlets"],
    });
  });

  it("leaves an omitted Item collection unresolved", () => {
    const { items: _omitted, ...withoutItems } = contextFor([]);

    expect(resolveRequirement(possessed, withoutItems)).toBe("unresolved");
    expect(resolveRequirement(equipped, withoutItems)).toBe("unresolved");
  });
});


/* -------------------------------------------------------------------------- */
/* Provenance                                                                 */
/* -------------------------------------------------------------------------- */

describe("Item provenance carries both the definition and the object", () => {
  const TWO_GAUNTLETS = [
    entry({ entryId: "left", state: "held" }),
    entry({ entryId: "right", state: "worn" }),
  ];

  it("produces one source per owned object", () => {
    const sources = collectItemEffectSources(TWO_GAUNTLETS);

    expect(sources).toHaveLength(2);
  });

  it("keeps the definition id on both, and a distinct instance on each", () => {
    const [left, right] = collectItemEffectSources(TWO_GAUNTLETS);

    expect(left?.source.id).toBe("gauntlets");
    expect(right?.source.id).toBe("gauntlets");

    expect(left?.source.instanceId).toBe("left");
    expect(right?.source.instanceId).toBe("right");
  });

  it("tells the two apart by equality and by key", () => {
    const [left, right] = collectItemEffectSources(TWO_GAUNTLETS);

    expect(isSameContributionSource(left!.source, right!.source)).toBe(false);
    expect(contributionSourceKey(left!.source))
      .not.toBe(contributionSourceKey(right!.source));

    /* Rebuilt structurally, it still matches its own object. */
    expect(
      isSameContributionSource(left!.source, {
        type: "item",
        id: "gauntlets",
        instanceId: "left",
      }),
    ).toBe(true);
  });

  it("reaches resolution with the instance intact", () => {
    const resolved = resolveTestCharacter(
      createTestCharacter({
        items: [
          entry({ entryId: "left", itemId: "cursed-idol", quantity: 1 }),
          entry({ entryId: "right", itemId: "cursed-idol", quantity: 1 }),
        ],
      }),
    );

    const idols = resolved.resolvedAttributeModifiers.filter(
      (modifier) => modifier.source.id === "cursed-idol",
    );

    expect(idols.map((modifier) => modifier.source.instanceId).sort())
      .toEqual(["left", "right"]);

    /* Two idols, two penalties — not one deduplicated away. */
    expect(resolved.attributes.resolved.cha).toBe(8);
  });

  it("leaves instance-less sources exactly as they were", () => {
    const trait = { type: "trait", id: "one-armed" };

    expect(contributionSourceKey(trait)).toBe("trait:one-armed");
    expect(isSameContributionSource(trait, { type: "trait", id: "one-armed" }))
      .toBe(true);

    /* An instance is a difference, not an optional detail to be ignored. */
    expect(
      isSameContributionSource(trait, {
        type: "trait",
        id: "one-armed",
        instanceId: "left",
      }),
    ).toBe(false);
  });

  it("cannot be made to collide by an entry id containing the separator", () => {
    const keys = new Set(
      [
        { type: "item", id: "gauntlets", instanceId: "a#b" },
        { type: "item", id: "gauntlets", instanceId: "a\\#b" },
        { type: "item", id: "gauntlets#a", instanceId: "b" },
      ].map(contributionSourceKey),
    );

    expect(keys.size).toBe(3);
  });
});


/* -------------------------------------------------------------------------- */
/* Representation invariance                                                  */
/* -------------------------------------------------------------------------- */

/*
 * The same objects must mean the same thing however they were written down.
 *
 * Permitting repeated `itemId` values and quantities above one at the same
 * time made that false: getActiveItemEffects() contributes a definition's
 * Effects once per ENTRY and cannot scale them by a count, so two Cursed Idols
 * written as one entry of two produced CHA -1 while two entries of one
 * produced CHA -2. A character gained a modifier because a host grouped
 * identical objects differently.
 *
 * The fix is not to guess a grouping. It is to leave exactly one legal way to
 * write each case, which is what ItemInventoryMode does.
 */
describe("inventory grouping cannot change a character", () => {
  it("refuses the ambiguous representation instead of picking a meaning", () => {
    const grouped = [
      entry({ entryId: "idols", itemId: "cursed-idol", quantity: 2 }),
    ];

    const split = [
      entry({ entryId: "left", itemId: "cursed-idol" }),
      entry({ entryId: "right", itemId: "cursed-idol" }),
    ];

    expect(findItemValidationIssues(grouped)).toEqual([
      {
        type: "invalid-individual-item-quantity",
        entryId: "idols",
        itemId: "cursed-idol",
        quantity: 2,
      },
    ]);

    expect(findItemValidationIssues(split)).toEqual([]);
  });

  it("resolves the only legal representation to the honest total", () => {
    const resolved = resolveTestCharacter(
      createTestCharacter({
        items: [
          entry({ entryId: "left", itemId: "cursed-idol" }),
          entry({ entryId: "right", itemId: "cursed-idol" }),
        ],
      }),
    );

    /* Two idols, two penalties. */
    expect(resolved.attributes.resolved.cha).toBe(8);
  });

  it("keeps a stackable Item free of the passive Effects it could not scale", () => {
    /*
     * The other half of the invariant, enforced at the catalog rather than the
     * sheet. A stackable definition with a possessedEffect would apply it once
     * for a stack of one and once for a stack of fifty, because no Effect in
     * the vocabulary carries a multiplier — so the catalog refuses it until
     * quantity-scaled Effects exist.
     */
    const result = registerDefinition("item", {
      id: "tainted-coins",
      name: "Tainted Coins",
      description: "A test Item that stacks and wrongly claims a passive rule.",
      inventoryMode: "stackable",
      possessedEffects: [
        { type: "modifyResolvedAttribute", attribute: "cha", amount: -1 },
      ],
    });

    /*
     * Refused at registration rather than reported afterwards. The rule is the
     * same one findItemCatalogIssues() applies to authored content — the
     * registry is handed the same validator — so a stackable Item bearing
     * passive Effects simply never becomes an Item anyone can carry.
     */
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason)
      .toContain("stackable and declares possessedEffects");

    expect(findItemCatalogIssues()).toEqual([]);
  });

  it("leaves the authored catalog clean, and its Items individual", () => {
    expect(findItemCatalogIssues()).toEqual([]);

    for (const definition of Object.values(ITEM_DEFINITIONS)) {
      /* Both authored Items bear passive Effects, so both must be individual. */
      expect(isStackableItem(definition)).toBe(false);
    }
  });

  it("lets a stackable Item carry use Effects, which are events", () => {
    /* A potion is used one at a time; a stack of them is still one event. */
    registerDefinition("item", {
      id: "smelling-salts",
      name: "Smelling Salts",
      description: "A test consumable.",
      inventoryMode: "stackable",
      useEffects: [
        { type: "modifyResolvedAttribute", attribute: "vit", amount: 1 },
      ],
    });

    expect(findItemCatalogIssues()).toEqual([]);
  });
});
