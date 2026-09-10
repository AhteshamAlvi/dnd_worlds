/*
 * Putting an Item on and taking it off, as one pure resolution.
 *
 * Three properties are what this suite is actually for, and each is a thing
 * the obvious implementation gets wrong.
 *
 * The gate is a MOMENT. It would be easy to re-check equipRequirements during
 * character resolution so a sheet is always "correct" — and that turns
 * resolveTestCharacter() into a function that writes, makes equipment depend on
 * the order facts were entered, and drops a character's armour the round a
 * Condition suppresses the Trait that let them wear it. The timing suite below
 * proves it does not happen.
 *
 * The transition touches no Effects. It changes one stored field and hands
 * back a Character; equippedEffects appear and disappear because resolution
 * reads the new state. A transition that added modifiers itself would be a
 * second implementation of effect resolution.
 *
 * A rule saying no is an ANSWER. Ordinary refusals are dispositions inside a
 * successful result; only a malformed question is a failure. Collapsing the
 * two would tell a player "you cannot equip that" when the truth is that the
 * host asked something meaningless.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import {
  equipmentTransitionKind,
  resolveEquipmentTransition,
  type CharacterItem,
  type EquipmentTransitionResolution,
  type ItemEquipmentState,
} from "../character/equipment/index";

import { createCharacterId } from "../character/id";

import type { RequirementContext } from "../character/rules/resolution";

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
 * A gated Item, registered rather than authored.
 *
 * The engine's two Items declare no equip requirements, and giving one a gate
 * would be authoring a rule this ticket did not design — "the Reinforced
 * Gauntlets need a Trait" is a content decision, and an authored requirement
 * is a rule the moment it ships.
 */
function registerGated(
  requirements: readonly unknown[],
  id = "warded-band",
): void {
  registerDefinition("item", {
    id,
    name: "Warded Band",
    description: "A test Item whose wearing is gated.",
    inventoryMode: "individual",
    equippedEffects: [
      { type: "modifyResolvedAttribute", attribute: "wis", amount: 1 },
    ],
    equipRequirements: requirements as never,
  });
}


const NEEDS_TRAIT = {
  id: "spirit-touched",
  requirement: { type: "hasTrait", traitId: "one-armed" },
  summary: "Only the one-armed may wear it.",
} as const;

const NEEDS_MISSING_TRAIT = {
  id: "needs-wings",
  requirement: { type: "hasTrait", traitId: "winged" },
} as const;


function characterWith(items: readonly CharacterItem[], extra: Partial<Character> = {}) {
  return createTestCharacter({ items, ...extra });
}


/*
 * A requirement context that does not record an inventory at all.
 *
 * Distinct from one recording an EMPTY inventory: the first is "the sheet does
 * not say", which the evaluator answers `unresolved`, and the second is "they
 * have nothing", which is a definite no. The field is deleted rather than set
 * to undefined because the engine compiles with exactOptionalPropertyTypes,
 * where those two are not the same value.
 */
function withoutItems(context: RequirementContext): RequirementContext {
  const { items: _omitted, ...rest } = context;

  return rest;
}


/** Resolve a transition against a character built from `items`. */
function transition(
  items: readonly CharacterItem[],
  entryId: string,
  destination: unknown,
  extra: Partial<Character> = {},
) {
  const character = characterWith(items, extra);
  const resolved = resolveTestCharacter(character);

  return {
    character,
    resolved,
    result: resolveEquipmentTransition({
      resolved,
      item: { characterId: character.id, entryId },
      destination: destination as ItemEquipmentState,
    }),
  };
}


/* -------------------------------------------------------------------------- */
/* Which transitions are equips                                               */
/* -------------------------------------------------------------------------- */

describe("the destination decides the kind", () => {
  it.each([
    ["carried", "unequip"],
    ["held", "equip"],
    ["worn", "equip"],
  ] as const)("makes %s an %s", (destination, kind) => {
    expect(equipmentTransitionKind(destination)).toBe(kind);
  });

  it("reads the destination alone, never the pair", () => {
    /*
     * held -> worn is an equip, and this is the case a rule derived from the
     * pair gets wrong: the character was already equipped, so "are they
     * equipping?" looks like no, and the gate would be skipped for a
     * transition that ends with the Item on their body.
     *
     * Asserted by the requirement actually being EVALUATED rather than only by
     * the label, because a `kind` of "equip" attached to a transition that
     * asked nothing would be the same bug wearing the right name.
     */
    registerGated([NEEDS_TRAIT]);

    const { result } = transition(
      [entry({ itemId: "warded-band", state: "held" })],
      "e1",
      "worn",
      { traits: [{ traitId: "one-armed" }] },
    );

    if (!result.success || result.payload.disposition !== "available") {
      throw new Error("expected an available transition");
    }

    expect(result.payload.transition.kind).toBe("equip");
    expect(result.payload.transition.from).toBe("held");
    expect(result.payload.transition.to).toBe("worn");

    expect(result.payload.requirements.map((one) => one.id))
      .toEqual(["spirit-touched"]);
  });
});


/* -------------------------------------------------------------------------- */
/* Successful transitions                                                     */
/* -------------------------------------------------------------------------- */

describe("permitted transitions", () => {
  const PAIRS = [
    ["carried", "held"],
    ["carried", "worn"],
    ["held", "carried"],
    ["worn", "carried"],
    ["held", "worn"],
    ["worn", "held"],
  ] as const;

  it.each(PAIRS)("moves an Item from %s to %s", (from, to) => {
    const { result } = transition([entry({ state: from })], "e1", to);

    expect(result.success).toBe(true);

    if (!result.success) return;

    expect(result.payload.disposition).toBe("available");

    if (result.payload.disposition !== "available") return;

    expect(result.payload.transition.from).toBe(from);
    expect(result.payload.transition.to).toBe(to);
    expect(result.payload.nextCharacter.items?.[0]?.state).toBe(to);
  });

  it("permits a quantity-one stackable Item to be held", () => {
    registerDefinition("item", {
      id: "trail-rations",
      name: "Trail Rations",
      description: "A test Item whose copies are a count.",
      inventoryMode: "stackable",
    });

    const { result } = transition(
      [entry({ itemId: "trail-rations" })],
      "e1",
      "held",
    );

    expect(result.success && result.payload.disposition).toBe("available");
  });

  it("returns a new Character and mutates neither the old one nor its inventory", () => {
    const items = [entry()];
    const { character, result } = transition(items, "e1", "worn");

    expect(result.success).toBe(true);

    if (!result.success || result.payload.disposition !== "available") return;

    const next = result.payload.nextCharacter;

    expect(next).not.toBe(character);
    expect(next.items).not.toBe(character.items);

    /* The inputs are exactly what they were. */
    expect(character.items?.[0]?.state).toBe("carried");
    expect(items[0]?.state).toBe("carried");
  });

  it("changes only the selected entry, and preserves order", () => {
    const items = [
      entry({ entryId: "first", itemId: "cursed-idol" }),
      entry({ entryId: "second" }),
      entry({ entryId: "third", itemId: "cursed-idol" }),
    ];

    const { character, result } = transition(items, "second", "held");

    if (!result.success || result.payload.disposition !== "available") {
      throw new Error("expected an available transition");
    }

    const next = result.payload.nextCharacter.items ?? [];

    expect(next.map((one) => one.entryId)).toEqual(["first", "second", "third"]);
    expect(next[1]?.state).toBe("held");

    /* Untouched entries are the SAME objects, not equal copies. */
    expect(next[0]).toBe(character.items?.[0]);
    expect(next[2]).toBe(character.items?.[2]);
  });

  it("preserves the selected entry's id, Item and quantity", () => {
    const { result } = transition([entry({ quantity: 1 })], "e1", "held");

    if (!result.success || result.payload.disposition !== "available") {
      throw new Error("expected an available transition");
    }

    expect(result.payload.nextCharacter.items?.[0]).toEqual({
      entryId: "e1",
      itemId: "gauntlets",
      quantity: 1,
      state: "held",
    });
  });

  it("preserves every unrelated Character field", () => {
    const { character, result } = transition([entry()], "e1", "held");

    if (!result.success || result.payload.disposition !== "available") {
      throw new Error("expected an available transition");
    }

    const { items: _wasItems, ...restBefore } = character;
    const { items: _isItems, ...restAfter } = result.payload.nextCharacter;

    expect(restAfter).toEqual(restBefore);
  });

  it("leaves an identical Item in another entry alone", () => {
    /*
     * The reason a reference is (character, entry) rather than an itemId: two
     * gauntlets differ only by entry, so a lookup by definition would have
     * equipped whichever came first.
     */
    const { result } = transition(
      [entry({ entryId: "left" }), entry({ entryId: "right" })],
      "right",
      "held",
    );

    if (!result.success || result.payload.disposition !== "available") {
      throw new Error("expected an available transition");
    }

    const next = result.payload.nextCharacter.items ?? [];

    expect(next[0]).toEqual(entry({ entryId: "left" }));
    expect(next[1]?.state).toBe("held");
  });
});


/* -------------------------------------------------------------------------- */
/* Requirements                                                               */
/* -------------------------------------------------------------------------- */

describe("equip requirements", () => {
  it("permits equipping when the Item declares none", () => {
    const { result } = transition([entry()], "e1", "held");

    expect(result.success && result.payload.disposition).toBe("available");

    if (result.success && result.payload.disposition === "available") {
      expect(result.payload.requirements).toEqual([]);
    }
  });

  it("permits equipping on an empty requirement list", () => {
    registerGated([]);

    const { result } = transition(
      [entry({ itemId: "warded-band" })],
      "e1",
      "worn",
    );

    expect(result.success && result.payload.disposition).toBe("available");
  });

  it("permits equipping when every requirement is satisfied", () => {
    registerGated([NEEDS_TRAIT]);

    const { result } = transition(
      [entry({ itemId: "warded-band" })],
      "e1",
      "worn",
      { traits: [{ traitId: "one-armed" }] },
    );

    if (!result.success || result.payload.disposition !== "available") {
      throw new Error("expected an available transition");
    }

    expect(result.payload.requirements).toEqual([
      {
        id: "spirit-touched",
        requirement: NEEDS_TRAIT.requirement,
        summary: NEEDS_TRAIT.summary,
        disposition: "satisfied",
      },
    ]);
  });

  it("refuses when one requirement is unsatisfied", () => {
    registerGated([NEEDS_TRAIT]);

    const { result } = transition(
      [entry({ itemId: "warded-band" })],
      "e1",
      "worn",
    );

    expect(result.success).toBe(true);
    expect(result.success && result.payload.disposition)
      .toBe("requirements-unsatisfied");
  });

  it("reports unresolved when nothing definitely refused", () => {
    /*
     * An omitted Item collection is the engine's one honest "I do not know":
     * a character who records no inventory has not failed the test, and
     * saying so is different from saying they failed it.
     */
    registerGated([
      {
        id: "needs-a-focus",
        requirement: { type: "hasItem", itemId: "gauntlets", state: "possessed" },
      },
    ]);

    const character = createTestCharacter({
      items: [entry({ itemId: "warded-band" })],
    });

    const withoutInventoryRecord = resolveTestCharacter(character);

    const result = resolveEquipmentTransition({
      resolved: {
        ...withoutInventoryRecord,
        requirementContext: withoutItems(withoutInventoryRecord.requirementContext),
      },
      item: { characterId: character.id, entryId: "e1" },
      destination: "worn",
    });

    expect(result.success && result.payload.disposition)
      .toBe("requirements-unresolved");
  });

  it("lets a definite refusal outrank an unresolved one", () => {
    registerGated([NEEDS_MISSING_TRAIT, {
      id: "needs-a-focus",
      requirement: { type: "hasItem", itemId: "gauntlets", state: "possessed" },
    }]);

    const character = createTestCharacter({
      items: [entry({ itemId: "warded-band" })],
    });

    const base = resolveTestCharacter(character);

    const result = resolveEquipmentTransition({
      resolved: {
        ...base,
        requirementContext: withoutItems(base.requirementContext),
      },
      item: { characterId: character.id, entryId: "e1" },
      destination: "worn",
    });

    if (!result.success) throw new Error("expected a resolution");

    /* Both are reported; the aggregate takes the definite answer. */
    expect(result.payload.disposition).toBe("requirements-unsatisfied");

    if (result.payload.disposition !== "requirements-unsatisfied") return;

    expect(result.payload.requirements.map((one) => one.disposition))
      .toEqual(["unsatisfied", "unresolved"]);
  });

  it("keeps the universal evaluator's compound semantics", () => {
    registerGated([
      {
        id: "either-way",
        requirement: {
          type: "any",
          requirements: [
            { type: "hasTrait", traitId: "winged" },
            { type: "hasTrait", traitId: "one-armed" },
          ],
        },
      },
    ]);

    const satisfied = transition(
      [entry({ itemId: "warded-band" })],
      "e1",
      "worn",
      { traits: [{ traitId: "one-armed" }] },
    );

    const refused = transition(
      [entry({ itemId: "warded-band" })],
      "e1",
      "worn",
    );

    expect(satisfied.result.success && satisfied.result.payload.disposition)
      .toBe("available");
    expect(refused.result.success && refused.result.payload.disposition)
      .toBe("requirements-unsatisfied");
  });

  it.each([
    ["held", "worn"],
    ["worn", "held"],
  ] as const)("re-evaluates requirements moving from %s to %s", (from, to) => {
    registerGated([NEEDS_MISSING_TRAIT]);

    const { result } = transition(
      [entry({ itemId: "warded-band", state: from })],
      "e1",
      to,
    );

    expect(result.success && result.payload.disposition)
      .toBe("requirements-unsatisfied");
  });

  it.each(["held", "worn"] as const)(
    "ignores equip requirements unequipping from %s",
    (from) => {
      registerGated([NEEDS_MISSING_TRAIT]);

      const { result } = transition(
        [entry({ itemId: "warded-band", state: from })],
        "e1",
        "carried",
      );

      if (!result.success || result.payload.disposition !== "available") {
        throw new Error("expected an available transition");
      }

      /*
       * A character who no longer meets the gate must still be able to take
       * the thing off. Reporting no requirements is the honest form of that:
       * none were asked.
       */
      expect(result.payload.requirements).toEqual([]);
      expect(result.payload.transition.kind).toBe("unequip");
    },
  );

  it("retains stable ids and summaries in the result", () => {
    registerGated([NEEDS_TRAIT, NEEDS_MISSING_TRAIT]);

    const { result } = transition(
      [entry({ itemId: "warded-band" })],
      "e1",
      "worn",
    );

    if (!result.success) throw new Error("expected a resolution");
    if (result.payload.disposition !== "requirements-unsatisfied") {
      throw new Error("expected a refusal");
    }

    expect(result.payload.requirements.map((one) => one.id))
      .toEqual(["spirit-touched", "needs-wings"]);

    /* A summary is carried when authored and omitted when not. */
    expect(result.payload.requirements[0]?.summary).toBe(NEEDS_TRAIT.summary);
    expect(result.payload.requirements[1]).not.toHaveProperty("summary");
  });
});


/* -------------------------------------------------------------------------- */
/* Timing                                                                     */
/* -------------------------------------------------------------------------- */

describe("an equip requirement is a gate, not a condition", () => {
  it("keeps an Item worn after its requirement lapses", () => {
    registerGated([NEEDS_TRAIT]);

    /* 1. Equip while the requirement holds. */
    const armed = transition(
      [entry({ itemId: "warded-band" })],
      "e1",
      "worn",
      { traits: [{ traitId: "one-armed" }] },
    );

    if (!armed.result.success || armed.result.payload.disposition !== "available") {
      throw new Error("expected the equip to be permitted");
    }

    const worn = armed.result.payload.nextCharacter;

    /* 2. The Trait goes away. */
    const lapsed: Character = { ...worn, traits: [] };
    const afterwards = resolveTestCharacter(lapsed);

    /* 3. The Item is still worn: nothing rewrote stored state. */
    expect(afterwards.character.items?.[0]?.state).toBe("worn");

    /* 4. Its equipped Effects are still live. */
    expect(afterwards.attributes.resolved.wis).toBe(11);

    /* 5. A NEW equip attempt would now be refused. */
    const again = resolveEquipmentTransition({
      resolved: afterwards,
      item: { characterId: lapsed.id, entryId: "e1" },
      destination: "held",
    });

    expect(again.success && again.payload.disposition)
      .toBe("requirements-unsatisfied");
  });

  it("never rewrites stored equipment state during resolution", () => {
    registerGated([NEEDS_MISSING_TRAIT]);

    /* Worn despite a gate nobody could pass — a sheet an importer might hand in. */
    const character = createTestCharacter({
      items: [entry({ itemId: "warded-band", state: "worn" })],
    });

    const once = resolveTestCharacter(character);
    const twice = resolveTestCharacter(once.character);

    expect(once.character.items).toEqual(character.items);
    expect(twice.character.items).toEqual(character.items);
    expect(once.character).toBe(character);
  });
});


/* -------------------------------------------------------------------------- */
/* Identity and quantity                                                      */
/* -------------------------------------------------------------------------- */

describe("identity and quantity", () => {
  it("targets one of two identical definitions by entry id", () => {
    const { result } = transition(
      [entry({ entryId: "left" }), entry({ entryId: "right" })],
      "left",
      "worn",
    );

    if (!result.success || result.payload.disposition !== "available") {
      throw new Error("expected an available transition");
    }

    expect(result.payload.transition.item.entryId).toBe("left");
    expect(result.payload.transition.itemId).toBe("gauntlets");
    expect(result.payload.transition.source).toEqual({
      type: "item",
      id: "gauntlets",
      instanceId: "left",
    });
  });

  it("returns not-concrete-object for an emptied entry", () => {
    const { result } = transition(
      [entry({ itemId: "cursed-idol", quantity: 0 })],
      "e1",
      "held",
    );

    expect(result.success).toBe(true);

    if (!result.success) return;

    expect(result.payload.disposition).toBe("not-concrete-object");

    if (result.payload.disposition !== "not-concrete-object") return;

    expect(result.payload.quantity).toBe(0);
  });

  it("returns not-concrete-object for a carried stack", () => {
    registerDefinition("item", {
      id: "trail-rations",
      name: "Trail Rations",
      description: "A test Item whose copies are a count.",
      inventoryMode: "stackable",
    });

    const { result } = transition(
      [entry({ itemId: "trail-rations", quantity: 5 })],
      "e1",
      "held",
    );

    if (!result.success) throw new Error("expected a resolution");

    expect(result.payload.disposition).toBe("not-concrete-object");
  });

  it("lets a stack be unequipped, which needs no single object", () => {
    /*
     * Only an EQUIP needs to name one thing. Moving a stack to carried asks
     * nothing of it, and refusing that would strand an inventory that arrived
     * in a state this engine would not have produced.
     */
    registerDefinition("item", {
      id: "trail-rations",
      name: "Trail Rations",
      description: "A test Item whose copies are a count.",
      inventoryMode: "stackable",
    });

    const { result } = transition(
      [entry({ itemId: "trail-rations", quantity: 5, state: "carried" })],
      "e1",
      "carried",
    );

    expect(result.success && result.payload.disposition).toBe("already-in-state");
  });

  it("returns already-in-state rather than a no-op success", () => {
    const { result } = transition([entry({ state: "worn" })], "e1", "worn");

    if (!result.success) throw new Error("expected a resolution");

    expect(result.payload.disposition).toBe("already-in-state");

    if (result.payload.disposition !== "already-in-state") return;

    expect(result.payload.state).toBe("worn");
    expect(result.payload.item.entryId).toBe("e1");
  });
});


/* -------------------------------------------------------------------------- */
/* Structural failures                                                        */
/* -------------------------------------------------------------------------- */

describe("malformed questions are failures, not refusals", () => {
  it("refuses a destination that is not a state", () => {
    const { result } = transition([entry()], "e1", "equipped");

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors[0].code)
      .toBe("equipment.transition.destination_invalid");
  });

  it("distinguishes every reference failure", () => {
    const character = createTestCharacter({ items: [entry()] });
    const resolved = resolveTestCharacter(character);

    const cases = [
      [{ entryId: "e1" }, "equipment.transition.reference_invalid"],
      [
        { characterId: createCharacterId(), entryId: "e1" },
        "equipment.transition.character_mismatch",
      ],
      [
        { characterId: character.id, entryId: "never-owned" },
        "equipment.transition.entry_unknown",
      ],
    ] as const;

    for (const [ref, code] of cases) {
      const result = resolveEquipmentTransition({
        resolved,
        item: ref as never,
        destination: "held",
      });

      expect(result.success).toBe(false);
      expect(!result.success && result.errors[0].code).toBe(code);
    }
  });

  it("reports a corrupt entry as invalid rather than missing", () => {
    const character = createTestCharacter({
      items: [{ entryId: "e1" } as unknown as CharacterItem],
    });

    const result = resolveEquipmentTransition({
      resolved: { ...resolveTestCharacter(createTestCharacter()), character },
      item: { characterId: character.id, entryId: "e1" },
      destination: "held",
    });

    expect(result.success).toBe(false);
    expect(!result.success && result.errors[0].code)
      .toBe("equipment.transition.entry_invalid");
  });

  it("refuses an entry naming an Item no catalog defines", () => {
    const character = createTestCharacter({
      items: [entry({ itemId: "not-a-real-item" })],
    });

    const result = resolveEquipmentTransition({
      resolved: { ...resolveTestCharacter(createTestCharacter()), character },
      item: { characterId: character.id, entryId: "e1" },
      destination: "held",
    });

    expect(result.success).toBe(false);
    expect(!result.success && result.errors[0].code)
      .toBe("equipment.transition.item_unknown");
  });

  it("refuses a definition whose own equip gate is malformed", () => {
    /*
     * Guessing past a blank requirement id would be the engine deciding a rule
     * the author did not write, and the character has done nothing wrong — so
     * it is a developer diagnostic rather than a refusal aimed at a player.
     */
    registerGated([{ id: "   ", requirement: { type: "hasTrait", traitId: "one-armed" } }]);

    const { result } = transition(
      [entry({ itemId: "warded-band" })],
      "e1",
      "worn",
    );

    expect(result.success).toBe(false);
    expect(!result.success && result.errors[0].code)
      .toBe("equipment.transition.definition_invalid");
  });

  it("refuses a definition with two requirements sharing an id", () => {
    registerGated([NEEDS_TRAIT, { ...NEEDS_MISSING_TRAIT, id: NEEDS_TRAIT.id }]);

    const { result } = transition(
      [entry({ itemId: "warded-band" })],
      "e1",
      "worn",
    );

    expect(result.success).toBe(false);
    expect(!result.success && result.errors[0].code)
      .toBe("equipment.transition.definition_invalid");
  });

  it("carries a trace on every failure", () => {
    const { result } = transition([entry()], "e1", 42);

    expect(result.trace.root.id).toBe("character.equipment.transition");
    expect(result.trace.root.output).toBe("destination_invalid");
  });
});


/* -------------------------------------------------------------------------- */
/* Trace                                                                      */
/* -------------------------------------------------------------------------- */

describe("the trace explains the resolution", () => {
  it("records every fact it safely knows", () => {
    registerGated([NEEDS_TRAIT]);

    const { character, result } = transition(
      [entry({ itemId: "warded-band" })],
      "e1",
      "worn",
      { traits: [{ traitId: "one-armed" }] },
    );

    const inputs = result.trace.root.inputs;

    expect(inputs["characterId"]?.value).toBe(character.id);
    expect(inputs["entryId"]?.value).toBe("e1");
    expect(inputs["itemId"]?.value).toBe("warded-band");
    expect(inputs["source"]?.value).toBe("item:warded-band#e1");
    expect(inputs["from"]?.value).toBe("carried");
    expect(inputs["destination"]?.value).toBe("worn");
    expect(inputs["kind"]?.value).toBe("equip");
    expect(inputs["requirement.spirit-touched"]?.value).toBe("satisfied");
    expect(result.trace.root.output).toBe("available");
  });

  it("states no fact it has not validated", () => {
    /*
     * A trace is serialized into bug reports and golden snapshots, so a
     * malformed value reaching it reaches every consumer downstream. Nothing
     * about the entry is recorded while the destination is still nonsense.
     */
    const { result } = transition([entry()], "e1", { evil: true });

    expect(Object.keys(result.trace.root.inputs)).toEqual(["characterId"]);
  });

  it("survives JSON, which is what a trace is for", () => {
    const { result } = transition([entry()], "e1", "held");

    expect(() => JSON.stringify(result.trace)).not.toThrow();
    expect(JSON.parse(JSON.stringify(result.trace)).root.output)
      .toBe("available");
  });
});


/* -------------------------------------------------------------------------- */
/* Effects, through ordinary resolution                                       */
/* -------------------------------------------------------------------------- */

describe("effects follow the stored state, not the transition", () => {
  function wisOf(character: Character): number {
    return resolveTestCharacter(character).attributes.resolved.wis;
  }

  it("activates equipped effects after equipping", () => {
    registerGated([]);

    const { character, result } = transition(
      [entry({ itemId: "warded-band" })],
      "e1",
      "worn",
    );

    if (!result.success || result.payload.disposition !== "available") {
      throw new Error("expected an available transition");
    }

    expect(wisOf(character)).toBe(10);
    expect(wisOf(result.payload.nextCharacter)).toBe(11);
  });

  it("removes them after unequipping", () => {
    registerGated([]);

    const { character, result } = transition(
      [entry({ itemId: "warded-band", state: "held" })],
      "e1",
      "carried",
    );

    if (!result.success || result.payload.disposition !== "available") {
      throw new Error("expected an available transition");
    }

    expect(wisOf(character)).toBe(11);
    expect(wisOf(result.payload.nextCharacter)).toBe(10);
  });

  it("keeps possessed effects live in all three states", () => {
    for (const state of ["carried", "held", "worn"] as const) {
      const character = createTestCharacter({
        items: [entry({ itemId: "cursed-idol", state })],
      });

      expect(resolveTestCharacter(character).attributes.resolved.cha).toBe(9);
    }
  });

  it("keeps both identities on the effect source across the transition", () => {
    registerGated([]);

    const { result } = transition(
      [entry({ entryId: "band-1", itemId: "warded-band" })],
      "band-1",
      "worn",
    );

    if (!result.success || result.payload.disposition !== "available") {
      throw new Error("expected an available transition");
    }

    const after = resolveTestCharacter(result.payload.nextCharacter);

    const fromBand = after.resolvedAttributeModifiers.filter(
      (modifier) => modifier.source.id === "warded-band",
    );

    expect(fromBand).toHaveLength(1);
    expect(fromBand[0]?.source.instanceId).toBe("band-1");
  });

  it("changes nothing physical", () => {
    /*
     * Equipping is not a Body event. Strength and BP are derived from anatomy,
     * and an Item that moved either by being picked up would be equipment
     * leverage applied at the wrong layer — the failure the gauntlets comment
     * in equipment/index.ts exists to record.
     */
    registerGated([]);

    const { character, result } = transition(
      [entry({ itemId: "warded-band" })],
      "e1",
      "worn",
    );

    if (!result.success || result.payload.disposition !== "available") {
      throw new Error("expected an available transition");
    }

    const before = resolveTestCharacter(character);
    const after = resolveTestCharacter(result.payload.nextCharacter);

    expect(after.stats.str).toBe(before.stats.str);
    expect(after.body.points.aggregateMaximumBP)
      .toBe(before.body.points.aggregateMaximumBP);
  });
});


/* -------------------------------------------------------------------------- */
/* Hostile values                                                             */
/* -------------------------------------------------------------------------- */

describe("no boundary throws", () => {
  it.each(HOSTILE_VALUES.map((value, index) => [index, value] as const))(
    "survives hostile destination %i",
    (_index, value) => {
      expect(() => transition([entry()], "e1", value)).not.toThrow();

      const { result } = transition([entry()], "e1", value);

      expect(result.success).toBe(false);
    },
  );

  it.each(HOSTILE_VALUES.map((value, index) => [index, value] as const))(
    "survives hostile reference %i",
    (_index, value) => {
      const resolved = resolveTestCharacter(
        createTestCharacter({ items: [entry()] }),
      );

      const run = () =>
        resolveEquipmentTransition({
          resolved,
          item: value as never,
          destination: "held",
        });

      expect(run).not.toThrow();
      expect(run().success).toBe(false);
    },
  );

  it.each(HOSTILE_VALUES.map((value, index) => [index, value] as const))(
    "survives a hostile entry %i",
    (_index, value) => {
      const character = createTestCharacter({
        items: [value] as unknown as readonly CharacterItem[],
      });

      const run = () =>
        resolveEquipmentTransition({
          resolved: {
            ...resolveTestCharacter(createTestCharacter()),
            character,
          },
          item: { characterId: character.id, entryId: "e1" },
          destination: "held",
        });

      expect(run).not.toThrow();
      expect(run().success).toBe(false);
    },
  );

  it.each(HOSTILE_VALUES.map((value, index) => [index, value] as const))(
    "survives hostile requirement metadata %i",
    (_index, value) => {
      registerGated([
        { id: value, requirement: { type: "hasTrait", traitId: "one-armed" } },
        { id: "summary-broken", requirement: { type: "hasTrait", traitId: "one-armed" }, summary: value },
        value,
      ]);

      const run = () =>
        transition([entry({ itemId: "warded-band" })], "e1", "worn");

      expect(run).not.toThrow();
      expect(run().result.success).toBe(false);
    },
  );

  it("survives a hostile input object entirely", () => {
    for (const value of HOSTILE_VALUES) {
      expect(() =>
        resolveEquipmentTransition(value as never),
      ).not.toThrow();

      expect(resolveEquipmentTransition(value as never).success).toBe(false);
    }
  });
});
