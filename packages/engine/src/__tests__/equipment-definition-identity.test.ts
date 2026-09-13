/*
 * An entry gets the definition it names, and no other.
 *
 * `prepareItemOperation()` checked that a lookup answered with the definition
 * it had been asked for. It was the only consumer that did. Transitions, use,
 * implement selection, performance contributions, integrity resolution, its
 * runtime handler, the envelope and inventory validation all read whatever
 * came back — so an entry naming a potion, answered with a grenade, took the
 * grenade's families, its Shū verdict, its Effects, its use behaviour, its
 * integrity policy and its action profile, and every one of those reads
 * succeeded. The one consumer that refused the substitution was the one place
 * it could do no damage.
 *
 * The check now lives in `resolveItemDefinition()`, the shared boundary all
 * nine already go through, and it reports THREE failures rather than two:
 * absent, not-an-Item, and a real Item answering to somebody else's id. Those
 * are three different faults with three different fixes, exactly as
 * `InventoryReferenceIssue` distinguishes an entry that is gone from one that
 * is corrupt.
 */

import { afterEach, describe, expect, it } from "vitest";

import { NO_FOCUS, UNSTRUCTURED_EXECUTION } from "../actions";
import { NO_TARGETS } from "../targeting";

import {
  clearCustomDefinitions,
  registerDefinition,
} from "../character/catalogs";

import {
  findItemValidationIssues,
  getItemDefinition,
  prepareItemOperation,
  resolveItemEnvelope,
  resolveItemIntegrityOperation,
  resolveItemPerformanceContribution,
  resolveSelectedImplements,
  type ItemDefinition,
  type ItemOperationIntentInput,
} from "../character/equipment/index";
import { resolveItemUse } from "../character/equipment/use";
import { resolveEquipmentTransition } from "../character/equipment/transitions";
import { createCharacterIntegrityEffectHandler } from "../character/equipment/runtime";
import {
  describeItemDefinitionOutcome,
  findInventoryEntryIssues,
  resolveItemDefinition,
} from "../character/equipment/validation";
import type { ImplementResolution } from "../character/equipment/implements";
import type { CharacterItem } from "../character/equipment/index";

import { errorCodesOf, payloadOf } from "./fixtures/result";
import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";


afterEach(() => {
  clearCustomDefinitions();
});


/* -------------------------------------------------------------------------- */
/* Two real, registered, completely different Items                           */
/* -------------------------------------------------------------------------- */

const DRAUGHT_EFFECT = {
  type: "modifyResolvedAttribute",
  attribute: "vit",
  amount: 2,
} as const;

const GRENADE_EFFECT = {
  type: "modifyResolvedAttribute",
  attribute: "cha",
  amount: -3,
} as const;


function register(id: string, fields: Record<string, unknown>): ItemDefinition {
  const result = registerDefinition("item", {
    id,
    name: id,
    description: "A test Item registered for definition identity.",
    inventoryMode: "individual",
    ...fields,
  } as never);

  if (!result.ok) throw new Error(result.reason);

  return getItemDefinition(id)!;
}


/** The entry's own Item: incompatible, fragile, not a weapon, not consumed. */
function registerDraught(): ItemDefinition {
  return register("calming-draught", {
    shuInteraction: "incompatible",
    families: [],
    useEffects: [DRAUGHT_EFFECT],
    consumesOnUse: true,
    integrity: { maximum: 2, repairable: false, zeroBehavior: "destroyed" },
  });
}


/** The impostor: compatible, tough, a blunt weapon, thrown. */
function registerGrenade(): ItemDefinition {
  return register("shatter-grenade", {
    shuInteraction: "compatible",
    families: ["blunt-weapon"],
    attack: { effects: [GRENADE_EFFECT] },
    useEffects: [GRENADE_EFFECT],
    consumesOnUse: true,
    equipRequirements: [{
      id: "steady-hands",
      summary: "A grenade may not be picked up carelessly.",
      requirement: { type: "hasTrait", traitId: "never-registered" },
    }],
    integrity: { maximum: 40, repairable: true, zeroBehavior: "broken" },
    useApplication: {
      allowedTimings: ["action"],
      structuredActionCost: { actions: 2 },
      targets: { cardinality: NO_TARGETS },
      executionDuration: 0,
    },
  });
}


const ENTRY: CharacterItem = {
  entryId: "e1",
  itemId: "calming-draught",
  quantity: 1,
  state: "carried",
  integrity: 2,
};


function characterWith(items: readonly CharacterItem[] = [ENTRY]) {
  const character = createTestCharacter({ items });

  return { character, resolved: resolveTestCharacter(character) };
}


/** A lookup that answers every question with the grenade. */
const IMPOSTOR = (): ItemDefinition | undefined => getItemDefinition("shatter-grenade");


function draughtResolution(characterId: string): ImplementResolution {
  return {
    role: "weapon",
    item: { characterId, entryId: "e1" },
    itemId: "calming-draught",
    compatibility: "compatible",
    families: [],
    state: "carried",
  };
}


/* -------------------------------------------------------------------------- */
/* 1. The shared boundary, and every resolver through it                      */
/* -------------------------------------------------------------------------- */

describe("the shared lookup boundary proves identity", () => {
  it("distinguishes absent, not-an-Item and impersonating", () => {
    registerDraught();
    registerGrenade();

    expect(resolveItemDefinition(() => undefined, "calming-draught"))
      .toEqual({ ok: false, issue: "unknown", requestedId: "calming-draught" });

    expect(resolveItemDefinition(() => null as never, "calming-draught"))
      .toEqual({ ok: false, issue: "malformed", requestedId: "calming-draught" });

    expect(resolveItemDefinition(IMPOSTOR, "calming-draught")).toEqual({
      ok: false,
      issue: "mismatched",
      requestedId: "calming-draught",
      actualId: "shatter-grenade",
    });

    expect(resolveItemDefinition(getItemDefinition, "calming-draught"))
      .toEqual({ ok: true, definition: getItemDefinition("calming-draught") });
  });

  it("describes a mismatch as a mismatch rather than as an absence", () => {
    registerGrenade();

    const outcome = resolveItemDefinition(IMPOSTOR, "calming-draught");

    expect(outcome.ok).toBe(false);

    if (outcome.ok) return;

    /*
     * The message matters: "no catalog defines it" sends a host looking for a
     * definition they already have, which is the opposite of the fix.
     */
    expect(describeItemDefinitionOutcome(outcome))
      .toBe('The catalog answered Item "calming-draught" with definition "shatter-grenade".');
  });

  it("refuses an array, which is an object and is not an Item", () => {
    expect(resolveItemDefinition(() => [] as never, "calming-draught"))
      .toEqual({ ok: false, issue: "malformed", requestedId: "calming-draught" });
  });
});


describe("every Item resolver refuses a lookup answering with another definition", () => {
  it("refuses it in preparation", () => {
    registerDraught();
    registerGrenade();

    const { character, resolved } = characterWith();

    const intent: ItemOperationIntentInput = {
      operation: "equip",
      item: { characterId: character.id, entryId: "e1" },
      actor: { type: "character", id: character.id },
      targets: [],
      focus: NO_FOCUS,
      executionContext: UNSTRUCTURED_EXECUTION,
      destination: "held",
    };

    expect(errorCodesOf(prepareItemOperation({
      operationId: "op-1",
      occurredAt: 1_000,
      resolved,
      intent,
      approach: "mechanical",
      getItemDefinition: IMPOSTOR,
    }))).toContain("equipment.actions.preparation.definition_mismatch");
  });

  it("refuses it in the equipment transition", () => {
    registerDraught();
    registerGrenade();

    const { character, resolved } = characterWith();

    expect(errorCodesOf(resolveEquipmentTransition(
      { resolved, item: { characterId: character.id, entryId: "e1" }, destination: "held" },
      IMPOSTOR,
    ))).toContain("equipment.transition.definition_mismatch");
  });

  it("refuses it in the use resolver", () => {
    registerDraught();
    registerGrenade();

    const { character, resolved } = characterWith();

    expect(errorCodesOf(resolveItemUse(
      { resolved, item: { characterId: character.id, entryId: "e1" } },
      IMPOSTOR,
    ))).toContain("equipment.use.definition_mismatch");
  });

  it("refuses it in integrity resolution", () => {
    registerDraught();
    registerGrenade();

    const { character, resolved } = characterWith();

    expect(errorCodesOf(resolveItemIntegrityOperation(
      {
        resolved,
        item: { characterId: character.id, entryId: "e1" },
        operation: { type: "stress", amount: 3 },
      },
      IMPOSTOR,
    ))).toContain("equipment.integrity.definition_mismatch");
  });

  it("refuses it in performance contribution resolution", () => {
    registerDraught();
    registerGrenade();

    const { character } = characterWith();

    expect(errorCodesOf(resolveItemPerformanceContribution(
      draughtResolution(character.id),
      IMPOSTOR,
    ))).toContain("equipment.contributions.definition_mismatch");
  });

  it("refuses it in envelope resolution", () => {
    registerDraught();
    registerGrenade();

    const { character } = characterWith();

    expect(errorCodesOf(resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "e1" },
      character.items,
      IMPOSTOR,
    ))).toContain("equipment.envelope.definition_mismatch");
  });

  it("refuses it in implement selection", () => {
    registerDraught();
    registerGrenade();

    const { character, resolved } = characterWith();

    const selection = payloadOf(resolveSelectedImplements(
      {
        resolved,
        requirements: [{
          role: "weapon",
          minimum: 1,
          maximum: 1,
          acceptedFamilies: ["blunt-weapon"],
        }],
        selections: [{ role: "weapon", item: { characterId: character.id, entryId: "e1" } }],
      },
      IMPOSTOR,
    ));

    expect(selection.resolutions).toEqual([]);
    expect(selection.issues.map((issue) => issue.kind))
      .toContain("definition-mismatched");
  });

  it("refuses it in integrity runtime settlement", () => {
    registerDraught();
    registerGrenade();

    const { character } = characterWith();

    const batch = createCharacterIntegrityEffectHandler(IMPOSTOR).applyBatch(
      [{
        requestId: "s1",
        kind: "item.stress",
        phase: "effect",
        operationId: "op-1",
        occurredAt: 1_000,
        from: { domain: "character", id: character.id },
        to: { domain: "character", id: character.id },
        requested: 1,
        entryId: "e1",
      } as never],
      character,
    );

    /*
     * The draught tops out at 2 and the grenade at 40. Settling against the
     * grenade's policy would have written a number the draught's own entry
     * validation refuses.
     */
    expect((batch.state as typeof character).items![0]!.integrity).toBe(2);
    expect(batch.outcomes[0]?.actual).toBe(0);
    expect(batch.events).toEqual([]);
  });

  it("refuses it in inventory validation", () => {
    registerDraught();
    registerGrenade();

    expect(findInventoryEntryIssues([ENTRY], IMPOSTOR)).toEqual([
      {
        type: "mismatched-item-definition",
        entryId: "e1",
        itemId: "calming-draught",
        definitionId: "shatter-grenade",
      },
    ]);
  });
});


/* -------------------------------------------------------------------------- */
/* 2-5. What the substitution would have handed over                          */
/* -------------------------------------------------------------------------- */

describe("no borrowed facts survive the refusal", () => {
  it("cannot give an incompatible Item a compatible Item's Shū verdict", () => {
    registerDraught();
    registerGrenade();

    const { character } = characterWith();

    /* The honest answer, for contrast. */
    const own = payloadOf(resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "e1" },
      character.items,
      getItemDefinition,
    ));

    expect(own.shuInteraction).toBe("incompatible");
    expect(getItemDefinition("shatter-grenade")!.shuInteraction).toBe("compatible");

    /* And the substitution produces no envelope at all, not a compatible one. */
    const borrowed = resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "e1" },
      character.items,
      IMPOSTOR,
    );

    expect(borrowed.success).toBe(false);
  });

  it("cannot borrow another Item's families for implement selection", () => {
    registerDraught();
    registerGrenade();

    const { character, resolved } = characterWith();

    const select = (lookup: typeof getItemDefinition) =>
      payloadOf(resolveSelectedImplements(
        {
          resolved,
          requirements: [{
            role: "weapon",
            minimum: 1,
            maximum: 1,
            acceptedFamilies: ["blunt-weapon"],
          }],
          selections: [{ role: "weapon", item: { characterId: character.id, entryId: "e1" } }],
        },
        lookup,
      ));

    /*
     * The draught claims no family, so honestly it does not satisfy the role.
     * The grenade is a blunt weapon and WOULD. The substitution must produce
     * neither answer: it is not a graded selection at all.
     */
    expect(select(getItemDefinition).issues.map((issue) => issue.kind))
      .toContain("incompatible");

    expect(select(IMPOSTOR).issues.map((issue) => issue.kind))
      .toEqual(["definition-mismatched", "role-below-minimum"]);
  });

  it("cannot attribute another Item's Effects to the selected entry", () => {
    registerDraught();
    registerGrenade();

    const { character } = characterWith();

    /* The draught declares no attack at all; the grenade declares one. */
    const own = payloadOf(resolveItemPerformanceContribution(
      draughtResolution(character.id),
      getItemDefinition,
    ));

    expect(own.attack).toBeUndefined();

    const borrowed = resolveItemPerformanceContribution(
      draughtResolution(character.id),
      IMPOSTOR,
    );

    expect(borrowed.success).toBe(false);
  });

  it("cannot borrow another definition's use behaviour", () => {
    registerDraught();
    registerGrenade();

    const { character, resolved } = characterWith();

    const own = payloadOf(resolveItemUse(
      { resolved, item: { characterId: character.id, entryId: "e1" } },
      getItemDefinition,
    ));

    expect(own.disposition).toBe("executed");

    if (own.disposition === "executed") {
      expect(own.effects.effects.map((effect) => effect.effect))
        .toEqual([DRAUGHT_EFFECT]);
    }

    expect(resolveItemUse(
      { resolved, item: { characterId: character.id, entryId: "e1" } },
      IMPOSTOR,
    ).success).toBe(false);
  });

  it("cannot borrow another definition's equip gate", () => {
    registerDraught();
    registerGrenade();

    const { character, resolved } = characterWith();

    /* The draught has no gate; the grenade's names a Trait nobody has. */
    const own = payloadOf(resolveEquipmentTransition(
      { resolved, item: { characterId: character.id, entryId: "e1" }, destination: "held" },
      getItemDefinition,
    ));

    expect(own.disposition).toBe("available");

    expect(resolveEquipmentTransition(
      { resolved, item: { characterId: character.id, entryId: "e1" }, destination: "held" },
      IMPOSTOR,
    ).success).toBe(false);
  });

  it("cannot borrow another definition's integrity policy", () => {
    registerDraught();
    registerGrenade();

    const { character, resolved } = characterWith();

    /*
     * The draught is destroyed at zero and can never be repaired. The grenade
     * is merely broken and is repairable. Under the substitution the draught
     * would come back.
     */
    const own = payloadOf(resolveItemIntegrityOperation(
      {
        resolved,
        item: { characterId: character.id, entryId: "e1" },
        operation: { type: "stress", amount: 5 },
      },
      getItemDefinition,
    ));

    expect(own.disposition === "applied" && own.change.stateAfter).toBe("destroyed");

    expect(resolveItemIntegrityOperation(
      {
        resolved,
        item: { characterId: character.id, entryId: "e1" },
        operation: { type: "stress", amount: 5 },
      },
      IMPOSTOR,
    ).success).toBe(false);
  });
});


/* -------------------------------------------------------------------------- */
/* 6. Inventory validation, against everything a lookup can return            */
/* -------------------------------------------------------------------------- */

describe("inventory validation survives whatever a lookup answers", () => {
  const HOSTILE_ANSWERS: readonly (readonly [string, unknown])[] = [
    ["null", null],
    ["a number", 42],
    ["a string", "calming-draught"],
    ["a boolean", true],
    ["an array", []],
    ["an empty object", {}],
    ["an object with no id", { name: "Nameless", inventoryMode: "individual" }],
    ["an object whose id is a number", { id: 42, inventoryMode: "individual" }],
  ];

  it.each(HOSTILE_ANSWERS)("does not throw when the lookup answers %s", (_label, answer) => {
    registerDraught();

    let issues: unknown;

    expect(() => {
      issues = findInventoryEntryIssues([ENTRY], () => answer as never);
    }).not.toThrow();

    /*
     * And it is an ISSUE rather than a shrug. The entry declares integrity and
     * a quantity, both of which this function reads off the definition —
     * `isStackableItem()`, `definition.integrity` — so shrugging would mean
     * validating an entry against nothing.
     */
    expect(issues).not.toEqual([]);
  });

  it("reports absent, malformed and mismatched as three different issues", () => {
    registerDraught();
    registerGrenade();

    expect(findInventoryEntryIssues([ENTRY], () => undefined).map((i) => i.type))
      .toEqual(["unknown-item"]);

    expect(findInventoryEntryIssues([ENTRY], () => null as never).map((i) => i.type))
      .toEqual(["invalid-item-definition"]);

    expect(findInventoryEntryIssues([ENTRY], IMPOSTOR).map((i) => i.type))
      .toEqual(["mismatched-item-definition"]);
  });

  it("still validates a sound inventory against the real catalog", () => {
    registerDraught();

    expect(findItemValidationIssues([ENTRY])).toEqual([]);
  });

  it("does not read definition fields off an answer it has refused", () => {
    /*
     * The specific throw. This entry carries `integrity`, which sends the
     * validator to `definition.integrity.maximum`, and a quantity above one on
     * an individual Item, which sends it to `isStackableItem(definition)`.
     * Both used to run against whatever the lookup returned.
     */
    registerDraught();

    const hostile: CharacterItem = { ...ENTRY, quantity: 3, integrity: 99 };

    for (const answer of [null, 42, [], { id: "shatter-grenade" }]) {
      expect(() =>
        findInventoryEntryIssues([hostile], () => answer as never)
      ).not.toThrow();
    }
  });
});
