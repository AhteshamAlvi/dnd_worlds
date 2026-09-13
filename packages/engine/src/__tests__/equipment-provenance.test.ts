/*
 * Where an Item action's facts come from, and who is allowed to say.
 *
 * Preparation used to take BOTH an inventory reference and an `ItemDefinition`
 * argument. That is two answers to one question — "what Item is this" — and
 * the argument won every time: the profile, the source, the Action cost, the
 * targets, the Range and the settlement request were all built from it, while
 * settlement later re-resolved the ENTRY and got the other answer. A potion's
 * entry prepared with a grenade's definition produced a perfectly well-formed
 * proposal to throw a potion.
 *
 * It also never asked whose entry it was. The reference had to name an entry
 * of the resolved character, and the ACTOR was a separate field nobody
 * compared to it, so Killua could prepare an equip against Gon's sheet and
 * receive a proposal whose actor was Killua and whose cost request was
 * addressed to Gon's inventory.
 *
 * And implement selection turned a missing definition into an improvised one:
 * `definition?.families ?? []` graded an Item no catalog defines as
 * "improvised" for any role that allowed improvisation. Improvisation is a
 * judgement about a real object that does not fit the role. There is no object
 * there to judge.
 */

import { afterEach, describe, expect, it } from "vitest";

import { NO_FOCUS, UNSTRUCTURED_EXECUTION, adjudicateAction, settleAction } from "../actions";
import { NO_TARGETS } from "../targeting";
import type { RuntimeOperationContext } from "../runtime/context";
import { ownerKey } from "../runtime/domains";

import {
  clearCustomDefinitions,
  getDefinition,
  registerDefinition,
} from "../character/catalogs";

import {
  createCharacterItemOperationCostHandler,
  getItemDefinition,
  prepareItemOperation,
  resolveSelectedImplements,
  type ItemDefinition,
  type ItemOperationIntentInput,
} from "../character/equipment/index";
import type { CharacterItem } from "../character/equipment/index";

import { errorCodesOf, payloadOf } from "./fixtures/result";
import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";


afterEach(() => {
  clearCustomDefinitions();
});


const OPERATION: RuntimeOperationContext = {
  operationId: "op-1",
  occurredAt: 1_000,
};


function registerItem(id: string, fields: Record<string, unknown> = {}): ItemDefinition {
  const result = registerDefinition("item", {
    id,
    name: id,
    description: "A test Item registered for provenance.",
    inventoryMode: "individual",
    shuInteraction: "compatible",
    ...fields,
  } as never);

  if (!result.ok) throw new Error(result.reason);

  return getDefinition("item", id)!;
}


/** A wearable Item with no equip gate. */
function registerHelm(id = "test-helm"): ItemDefinition {
  return registerItem(id, {
    equippedEffects: [{ type: "modifyResolvedAttribute", attribute: "wis", amount: 1 }],
  });
}


/** A thrown consumable: a completely different shape of attempt. */
function registerGrenade(id = "test-grenade"): ItemDefinition {
  return registerItem(id, {
    consumesOnUse: true,
    useEffects: [{ type: "modifyResolvedAttribute", attribute: "wis", amount: -1 }],
    useApplication: {
      allowedTimings: ["action"],
      structuredActionCost: { actions: 2 },
      targets: { cardinality: NO_TARGETS },
      executionDuration: 0,
    },
  });
}


function characterWith(items: readonly CharacterItem[]) {
  const character = createTestCharacter({ items });

  return { character, resolved: resolveTestCharacter(character) };
}


function intentFor(
  characterId: string,
  overrides: Partial<ItemOperationIntentInput> = {},
): ItemOperationIntentInput {
  return {
    operation: "equip",
    item: { characterId, entryId: "e1" },
    actor: { type: "character", id: characterId },
    targets: [],
    focus: NO_FOCUS,
    executionContext: UNSTRUCTURED_EXECUTION,
    destination: "held",
    ...overrides,
  };
}


/* -------------------------------------------------------------------------- */
/* 5. An entry cannot be prepared using another definition                   */
/* -------------------------------------------------------------------------- */

describe("an entry is prepared with the definition it names, and no other", () => {
  it("takes no definition argument at all", () => {
    /*
     * The structural half of the claim, asserted because it is the fix. A
     * caller with no way to supply a second answer cannot supply a wrong one,
     * and every case below is downstream of that.
     */
    registerHelm();

    const { character, resolved } = characterWith([
      { entryId: "e1", itemId: "test-helm", quantity: 1, state: "carried" },
    ]);

    const input = {
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved,
      intent: intentFor(character.id),
      approach: "mechanical" as const,
      getItemDefinition,
    };

    expect(Object.keys(input)).not.toContain("definition");
    expect(payloadOf(prepareItemOperation(input)).source).toEqual({
      type: "item",
      id: "test-helm",
      instanceId: "e1",
    });
  });

  it("builds the profile from the entry even when another definition is registered", () => {
    /*
     * The grenade is a real, valid, registered Item with a two-Action throw.
     * The entry is a helm. Preparing the entry must describe the helm.
     */
    registerHelm();
    registerGrenade();

    const { character, resolved } = characterWith([
      { entryId: "e1", itemId: "test-helm", quantity: 1, state: "carried" },
    ]);

    const proposal = payloadOf(prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved,
      intent: intentFor(character.id),
      approach: "mechanical",
      getItemDefinition,
    }));

    expect(proposal.source).toEqual({
      type: "item",
      id: "test-helm",
      instanceId: "e1",
    });

    expect(proposal.profileId).toContain("item-operation:equip:e1");
  });

  it("will not borrow the other definition's use application", () => {
    /*
     * The sharpest form of the same claim. The grenade declares a
     * `useApplication`; the helm declares none. Preparing a USE of the helm's
     * entry has to fail for the helm's reason — there is no authored way to
     * use it — rather than succeed by reaching the only application in the
     * room.
     */
    registerHelm();
    registerGrenade();

    const { character, resolved } = characterWith([
      { entryId: "e1", itemId: "test-helm", quantity: 1, state: "carried" },
    ]);

    const { destination: _unused, ...withoutDestination } = intentFor(character.id);
    const useIntent: ItemOperationIntentInput = {
      ...withoutDestination,
      operation: "use",
    };

    const result = prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved,
      intent: useIntent,
      approach: "mechanical",
      getItemDefinition,
    });

    expect(errorCodesOf(result)).toContain("equipment.actions.use.application-missing");
  });

  it("refuses a lookup that answers with a different definition", () => {
    registerHelm();
    registerGrenade();

    const { character, resolved } = characterWith([
      { entryId: "e1", itemId: "test-helm", quantity: 1, state: "carried" },
    ]);

    const result = prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved,
      intent: intentFor(character.id),
      approach: "mechanical",
      getItemDefinition: () => getItemDefinition("test-grenade"),
    });

    expect(errorCodesOf(result))
      .toContain("equipment.actions.preparation.definition_mismatch");
  });

  it("refuses a stale entry reference before preparing anything", () => {
    registerHelm();

    const { character, resolved } = characterWith([
      { entryId: "e1", itemId: "test-helm", quantity: 1, state: "carried" },
    ]);

    const result = prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved,
      intent: intentFor(character.id, {
        item: { characterId: character.id, entryId: "sold-last-week" },
      }),
      approach: "mechanical",
      getItemDefinition,
    });

    expect(errorCodesOf(result))
      .toContain("equipment.actions.preparation.unknown_entry");
  });

  it("refuses an entry whose definition nothing defines", () => {
    registerHelm();

    const { character, resolved } = characterWith([
      { entryId: "e1", itemId: "test-helm", quantity: 1, state: "carried" },
    ]);

    const result = prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved,
      intent: intentFor(character.id),
      approach: "mechanical",
      getItemDefinition: () => undefined,
    });

    expect(errorCodesOf(result))
      .toContain("equipment.actions.preparation.item_unknown");
  });

  it("refuses an entry whose definition is structurally malformed", () => {
    registerHelm();

    const { character, resolved } = characterWith([
      { entryId: "e1", itemId: "test-helm", quantity: 1, state: "carried" },
    ]);

    const result = prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved,
      intent: intentFor(character.id),
      approach: "mechanical",
      /* A host's lookup, answering with content the catalog would refuse. */
      getItemDefinition: () => ({
        id: "test-helm",
        name: "Test Helm",
        description: "A helm with an Effect the engine has never heard of.",
        inventoryMode: "individual",
        shuInteraction: "compatible",
        equippedEffects: [{ type: "bogus" }],
      }) as unknown as ItemDefinition,
    });

    expect(errorCodesOf(result))
      .toContain("equipment.actions.preparation.definition_invalid");
  });
});


/* -------------------------------------------------------------------------- */
/* 6. An actor cannot act on another character's entry                       */
/* -------------------------------------------------------------------------- */

describe("the actor has to own the entry", () => {
  it("refuses an actor who is not the character the entry belongs to", () => {
    registerHelm();

    const { character, resolved } = characterWith([
      { entryId: "e1", itemId: "test-helm", quantity: 1, state: "carried" },
    ]);

    const result = prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved,
      intent: intentFor(character.id, { actor: { type: "character", id: "killua" } }),
      approach: "mechanical",
      getItemDefinition,
    });

    expect(errorCodesOf(result))
      .toContain("equipment.actions.preparation.actor_mismatch");
  });

  it("refuses a reference naming another character's inventory", () => {
    /*
     * The other direction, and it was already covered — the reference must
     * resolve against the sheet it is asked of. Asserted here so the pair is
     * visible together: one rule is about WHOSE entry, the other about WHO is
     * acting, and neither implies the other.
     */
    registerHelm();

    const { character, resolved } = characterWith([
      { entryId: "e1", itemId: "test-helm", quantity: 1, state: "carried" },
    ]);

    const result = prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved,
      intent: intentFor(character.id, {
        item: { characterId: "killua", entryId: "e1" },
        actor: { type: "character", id: "killua" },
      }),
      approach: "mechanical",
      getItemDefinition,
    });

    expect(errorCodesOf(result))
      .toContain("equipment.actions.preparation.character_mismatch");
  });

  it("still prepares an operation the actor does own", () => {
    registerHelm();

    const { character, resolved } = characterWith([
      { entryId: "e1", itemId: "test-helm", quantity: 1, state: "carried" },
    ]);

    expect(prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved,
      intent: intentFor(character.id),
      approach: "mechanical",
      getItemDefinition,
    }).success).toBe(true);
  });
});


/* -------------------------------------------------------------------------- */
/* 7. A missing definition is not an improvised implement                    */
/* -------------------------------------------------------------------------- */

describe("a missing definition never grades as improvised", () => {
  const REQUIREMENT = {
    role: "weapon",
    minimum: 1,
    maximum: 1,
    acceptedFamilies: ["blunt-weapon"],
    allowImprovised: true,
  } as const;

  function selectWith(
    lookup: (itemId: string) => ItemDefinition | undefined,
  ) {
    const { character, resolved } = characterWith([
      { entryId: "e1", itemId: "ghost-item", quantity: 1, state: "held" },
    ]);

    return payloadOf(resolveSelectedImplements(
      {
        resolved,
        requirements: [REQUIREMENT],
        selections: [{ role: "weapon", item: { characterId: character.id, entryId: "e1" } }],
      },
      lookup,
    ));
  }

  it("reports the missing definition rather than an improvised resolution", () => {
    const selection = selectWith(() => undefined);

    expect(selection.resolutions).toEqual([]);
    expect(selection.issues.map((issue) => issue.kind))
      .toContain("definition-unknown");

    /* And emphatically not a graded selection somebody could swing. */
    expect(selection.resolutions.map((resolution) => resolution.compatibility))
      .not.toContain("improvised");
  });

  it("reports a malformed definition apart from a missing one", () => {
    const selection = selectWith(() => null as unknown as ItemDefinition);

    expect(selection.issues.map((issue) => issue.kind))
      .toContain("definition-invalid");
  });

  it("still grades a REAL Item improvised when the role allows it", () => {
    /*
     * The control, and the reason the rule is about existence rather than
     * about improvisation. A registered Item claiming no family is exactly
     * what `allowImprovised` is for.
     */
    registerItem("ghost-item", { families: [] });

    const selection = selectWith(getItemDefinition);

    expect(selection.resolutions.map((resolution) => resolution.compatibility))
      .toEqual(["improvised"]);
  });
});


/* -------------------------------------------------------------------------- */
/* 20. A failed settlement replaces no Character at all                      */
/* -------------------------------------------------------------------------- */

describe("a failed settlement leaves the character exactly where it was", () => {
  it("commits nothing when the operation went stale between preparation and settlement", () => {
    registerHelm();

    const { character, resolved } = characterWith([
      { entryId: "e1", itemId: "test-helm", quantity: 1, state: "carried" },
    ]);

    const proposal = payloadOf(prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved,
      intent: intentFor(character.id),
      approach: "mechanical",
      getItemDefinition,
    }));

    const adjudicated = payloadOf(adjudicateAction({
      operationId: OPERATION.operationId,
      proposal,
      approach: "mechanical",
      decision: { kind: "accept" },
    }));

    /* The world moves on: the helm is already on by the time this settles. */
    const moved = {
      ...character,
      items: [{ entryId: "e1", itemId: "test-helm", quantity: 1, state: "held" as const }],
    };

    const result = settleAction({
      adjudicated,
      context: OPERATION,
      states: { [ownerKey({ domain: "character", id: character.id })]: moved },
      handlers: {
        costs: [createCharacterItemOperationCostHandler(getItemDefinition)],
        effects: [],
      },
    });

    expect(result.success).toBe(false);

    /*
     * And nothing partial came back. A refusal that returned a replacement
     * Character — even an unchanged-looking one — is a caller being handed
     * state produced by an operation that did not happen.
     */
    expect((result as { readonly payload?: unknown }).payload).toBeUndefined();
    expect(moved.items[0]!.state).toBe("held");
    expect(character.items![0]!.state).toBe("carried");
  });
});
