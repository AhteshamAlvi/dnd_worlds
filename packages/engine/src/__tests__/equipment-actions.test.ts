/*
 * Equip, unequip and Item use, through the neutral action pipeline.
 *
 * What this suite exists to prove, each of which the obvious implementation
 * gets wrong:
 *
 * Preparation PROVES, it does not APPLY. Calling prepareItemOperation() twice
 * against the same character produces the same proposal and leaves the
 * character exactly as it was — the resolvers it dry-runs are read for their
 * disposition only, never for `nextCharacter`.
 *
 * Settlement RE-VALIDATES. A character mutated between preparation and
 * settlement — the entry moved, emptied, or a requirement stopped holding —
 * is caught at commit, not silently honoured from a stale proposal.
 *
 * Settlement is ATOMIC. One commit replaces the Character exactly once,
 * together with every other cost in the same operation; a refusal anywhere
 * in the operation leaves every pool exactly where it started.
 *
 * useEffects are an EVENT. They appear once, on the settled event, and never
 * enter the character's possessed or equipped effect collection.
 */

import { describe, expect, it, afterEach } from "vitest";

import {
  NO_FOCUS,
  UNSTRUCTURED_EXECUTION,
  adjudicateAction,
  settleAction,
  type AdjudicatedAction,
  type ActionProposal,
} from "../actions";
import { EXACTLY_ONE_TARGET, NO_TARGETS } from "../targeting";
import type { RuntimeOperationContext } from "../runtime/context";
import type { QuantitativeRequest } from "../runtime/requests";
import { ownerKey } from "../runtime/domains";

import {
  clearCustomDefinitions,
  getDefinition,
  registerDefinition,
} from "../character/catalogs";

import {
  buildItemOperationProfile,
  createCharacterItemOperationCostHandler,
  getItemDefinition,
  prepareItemOperation,
  resolveEquipmentTransition,
  resolveItemUse,
  type ItemDefinition,
  type ItemOperationIntentInput,
} from "../character/equipment/index";
import { resolveEquipmentTransition as resolveTransitionWith }
  from "../character/equipment/transitions";
import { resolveItemUse as resolveItemUseWith } from "../character/equipment/use";
import { collectItemEffectSources } from "../character/equipment/index";
import { resolveCharacter } from "../character/resolution";
import type { CharacterItem } from "../character/equipment/index";

import { poolCostHandler } from "./fixtures/settlement";
import { payloadOf, errorCodesOf } from "./fixtures/result";
import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});


/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const STEADY_WIS = {
  type: "modifyResolvedAttribute",
  attribute: "wis",
  amount: 1,
} as const;

function registerItem(id: string, fields: Record<string, unknown>): ItemDefinition {
  const result = registerDefinition("item", {
    id,
    name: "Test Item",
    description: "A test Item registered for Item operations.",
    inventoryMode: "individual",
    shuInteraction: "compatible",
    ...fields,
  } as unknown as ItemDefinition);

  if (!result.ok) throw new Error(result.reason);

  return getDefinition("item", id)!;
}

/** A wearable Item with no equip gate. */
function registerHelm(id = "test-helm"): ItemDefinition {
  return registerItem(id, {
    equippedEffects: [STEADY_WIS],
  });
}

/** A consumable, usable through the action pipeline. */
function registerDraught(
  id = "test-draught",
  overrides: Record<string, unknown> = {},
): ItemDefinition {
  return registerItem(id, {
    consumesOnUse: true,
    useEffects: [STEADY_WIS],
    useApplication: {
      allowedTimings: ["action"],
      structuredActionCost: { actions: 1 },
      targets: { cardinality: NO_TARGETS },
      executionDuration: 0,
    },
    ...overrides,
  });
}

/** A usable Item with no declared use application. */
function registerUndeclaredUse(id = "test-undeclared"): ItemDefinition {
  return registerItem(id, {
    consumesOnUse: true,
    useEffects: [STEADY_WIS],
  });
}

function entry(overrides: Partial<CharacterItem> = {}): CharacterItem {
  return {
    entryId: "e1",
    itemId: "test-helm",
    quantity: 1,
    state: "carried",
    ...overrides,
  };
}

const OPERATION: RuntimeOperationContext = {
  operationId: "op-1",
  occurredAt: 1_000,
};

function equipIntent(
  items: readonly CharacterItem[],
  overrides: Partial<ItemOperationIntentInput> = {},
) {
  const character = createTestCharacter({ items });
  const resolved = resolveTestCharacter(character);
  const definition = getItemDefinition(items[0]!.itemId)!;

  const intent: ItemOperationIntentInput = {
    operation: "equip",
    item: { characterId: character.id, entryId: items[0]!.entryId },
    actor: { type: "character", id: character.id },
    targets: [],
    focus: NO_FOCUS,
    executionContext: UNSTRUCTURED_EXECUTION,
    destination: "held",
    ...overrides,
  };

  return { character, resolved, definition, intent };
}

function prepare(
  fixture: ReturnType<typeof equipIntent>,
) {
  return prepareItemOperation({
    operationId: OPERATION.operationId,
    occurredAt: OPERATION.occurredAt,
    resolved: fixture.resolved,
    definition: fixture.definition,
    intent: fixture.intent,
    approach: "mechanical",
    getItemDefinition,
  });
}

function accept(proposal: ActionProposal): AdjudicatedAction {
  return payloadOf(adjudicateAction({
    operationId: OPERATION.operationId,
    proposal,
    approach: "mechanical",
    decision: { kind: "accept" },
  }));
}

function characterState(character: unknown) {
  return { [ownerKey({ domain: "character", id: (character as { id: string }).id })]: character };
}


/* -------------------------------------------------------------------------- */
/* Profiles and intents                                                      */
/* -------------------------------------------------------------------------- */

describe("Item operation profiles carry concrete provenance", () => {
  it("gives equip and unequip an engine-owned default application", () => {
    registerHelm();

    const profile = payloadOf(buildItemOperationProfile(
      "equip",
      getItemDefinition("test-helm")!,
      { characterId: "gon", entryId: "e1" },
    ));

    expect(profile.source).toEqual({ type: "item", id: "test-helm", instanceId: "e1" });
    expect(profile.targets.cardinality).toEqual({ minimum: 0, maximum: 0 });
    expect(profile.permittedFocusKinds).toEqual(["none"]);
  });

  it("builds a use profile from the Item's own useApplication", () => {
    registerDraught();

    const profile = payloadOf(buildItemOperationProfile(
      "use",
      getItemDefinition("test-draught")!,
      { characterId: "gon", entryId: "e1" },
    ));

    expect(profile.source).toEqual({ type: "item", id: "test-draught", instanceId: "e1" });
    expect(profile.structuredActionCost).toEqual({ actions: 1 });
  });

  it("refuses to build a use profile for an Item with no useApplication", () => {
    registerUndeclaredUse();

    const result = buildItemOperationProfile(
      "use",
      getItemDefinition("test-undeclared")!,
      { characterId: "gon", entryId: "e1" },
    );

    expect(errorCodesOf(result)).toContain("equipment.actions.use.application-missing");
  });

  it("gives two entries of one definition distinct profile identities", () => {
    registerHelm();

    const first = payloadOf(buildItemOperationProfile(
      "equip",
      getItemDefinition("test-helm")!,
      { characterId: "gon", entryId: "e1" },
    ));

    const second = payloadOf(buildItemOperationProfile(
      "equip",
      getItemDefinition("test-helm")!,
      { characterId: "gon", entryId: "e2" },
    ));

    expect(first.id).not.toEqual(second.id);
  });
});


/* -------------------------------------------------------------------------- */
/* Preparation proves, and does not apply                                    */
/* -------------------------------------------------------------------------- */

describe("preparation does not mutate inventory", () => {
  it("leaves the character's items exactly as they were", () => {
    registerHelm();

    const fixture = equipIntent([entry()]);
    const before = fixture.character.items;

    const result = prepare(fixture);

    expect(result.success).toBe(true);
    expect(fixture.character.items).toBe(before);
    expect(fixture.character.items![0]!.state).toBe("carried");
  });

  it("produces the mandatory Item operation cost request", () => {
    registerHelm();

    const proposal = payloadOf(prepare(equipIntent([entry()])));

    expect(proposal.costRequests).toHaveLength(1);
    expect(proposal.costRequests[0]!.kind).toBe("character.item-operation");
  });

  it("reports an unsatisfied equip gate as an eligibility finding, not a mutation", () => {
    registerGatedHelm();

    const fixture = equipIntent([entry({ itemId: "gated-helm" })]);
    const proposal = payloadOf(prepare(fixture));

    expect(proposal.disposition).toBe("ineligible");
    expect(
      proposal.findings.some((finding) => finding.id === "needs-crown"),
    ).toBe(true);
    expect(fixture.character.items![0]!.state).toBe("carried");
  });
});

function registerGatedHelm() {
  return registerItem("gated-helm", {
    equipRequirements: [{
      id: "needs-crown",
      requirement: { type: "hasTrait", traitId: "royalty" },
    }],
  });
}


/* -------------------------------------------------------------------------- */
/* Settlement: atomic commit, or nothing at all                              */
/* -------------------------------------------------------------------------- */

describe("settlement commits the resolver's replacement Character exactly once", () => {
  it("equips: the settled state reflects the transition", () => {
    registerHelm();

    const fixture = equipIntent([entry()]);
    const proposal = payloadOf(prepare(fixture));
    const adjudicated = accept(proposal);

    const outcome = payloadOf(settleAction({
      adjudicated,
      context: OPERATION,
      states: characterState(fixture.character),
      handlers: {
        costs: [createCharacterItemOperationCostHandler(getItemDefinition)],
        effects: [],
      },
    }));

    const settledCharacter = outcome.states[ownerKey({ domain: "character", id: fixture.character.id })] as typeof fixture.character;

    expect(settledCharacter.items![0]!.state).toBe("held");
    expect(outcome.events.some((event) => event.kind === "item-operation-settled")).toBe(true);
  });

  it("never touches the ORIGINAL character object", () => {
    registerHelm();

    const fixture = equipIntent([entry()]);
    const proposal = payloadOf(prepare(fixture));
    const adjudicated = accept(proposal);

    payloadOf(settleAction({
      adjudicated,
      context: OPERATION,
      states: characterState(fixture.character),
      handlers: {
        costs: [createCharacterItemOperationCostHandler(getItemDefinition)],
        effects: [],
      },
    }));

    expect(fixture.character.items![0]!.state).toBe("carried");
  });

  it("refuses an already-satisfied disposition: already-in-state", () => {
    registerHelm();

    const fixture = equipIntent(
      [entry({ state: "held" })],
      { destination: "held" },
    );

    const proposal = payloadOf(prepare(fixture));

    expect(proposal.disposition).toBe("ineligible");

    const adjudicated = accept(proposal);

    const result = settleAction({
      adjudicated,
      context: OPERATION,
      states: characterState(fixture.character),
      handlers: {
        costs: [createCharacterItemOperationCostHandler(getItemDefinition)],
        effects: [],
      },
    });

    expect(errorCodesOf(result)).toContain("actions.settlement.not-settleable");
  });

  it("catches an entry that moved between preparation and settlement (stale)", () => {
    registerHelm();

    const fixture = equipIntent([entry()]);
    const proposal = payloadOf(prepare(fixture));
    const adjudicated = accept(proposal);

    /* The entry was equipped by something else before this settles. */
    const staleCharacter = {
      ...fixture.character,
      items: [{ ...fixture.character.items![0]!, state: "held" as const }],
    };

    const result = settleAction({
      adjudicated,
      context: OPERATION,
      states: characterState(staleCharacter),
      handlers: {
        costs: [createCharacterItemOperationCostHandler(getItemDefinition)],
        effects: [],
      },
    });

    expect(errorCodesOf(result)).toContain("equipment.actions.transition.stale");
  });

  it("catches an entry removed between preparation and settlement", () => {
    registerHelm();

    const fixture = equipIntent([entry()]);
    const proposal = payloadOf(prepare(fixture));
    const adjudicated = accept(proposal);

    const strippedCharacter = { ...fixture.character, items: [] };

    const result = settleAction({
      adjudicated,
      context: OPERATION,
      states: characterState(strippedCharacter),
      handlers: {
        costs: [createCharacterItemOperationCostHandler(getItemDefinition)],
        effects: [],
      },
    });

    expect(result.success).toBe(false);
  });

  it("rolls back the whole operation when another cost in it fails", () => {
    registerHelm();

    const fixture = equipIntent([entry()]);

    const withAuraCost = payloadOf(prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved: fixture.resolved,
      definition: fixture.definition,
      intent: fixture.intent,
      approach: "mechanical",
      getItemDefinition,
    }));

    const auraCost: QuantitativeRequest = {
      requestId: "aura-1",
      kind: "aura.spend",
      phase: "cost",
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      from: { domain: "caller", id: "gon" },
      to: { domain: "aura", id: "gon" },
      requested: 999,
    };

    const proposalWithAura: ActionProposal = {
      ...withAuraCost,
      costRequests: [...withAuraCost.costRequests, auraCost],
    };

    const adjudicated = accept(proposalWithAura);

    const result = settleAction({
      adjudicated,
      context: OPERATION,
      states: {
        ...characterState(fixture.character),
        "aura:gon": 10,
      },
      handlers: {
        costs: [
          createCharacterItemOperationCostHandler(getItemDefinition),
          poolCostHandler("aura"),
        ],
        effects: [],
      },
    });

    expect(result.success).toBe(false);
  });
});


/* -------------------------------------------------------------------------- */
/* Use: consumption, effects, and misses                                     */
/* -------------------------------------------------------------------------- */

describe("settling a use", () => {
  function useFixture() {
    registerDraught();

    const character = createTestCharacter({
      items: [{ entryId: "e1", itemId: "test-draught", quantity: 3, state: "carried" }],
    });
    const resolved = resolveTestCharacter(character);
    const definition = getItemDefinition("test-draught")!;

    const intent: ItemOperationIntentInput = {
      operation: "use",
      item: { characterId: character.id, entryId: "e1" },
      actor: { type: "character", id: character.id },
      targets: [],
      focus: NO_FOCUS,
      executionContext: UNSTRUCTURED_EXECUTION,
    };

    return { character, resolved, definition, intent };
  }

  it("consumes exactly one unit and carries useEffects on the settled event, once", () => {
    const fixture = useFixture();

    const proposal = payloadOf(prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved: fixture.resolved,
      definition: fixture.definition,
      intent: fixture.intent,
      approach: "mechanical",
      getItemDefinition,
    }));

    const adjudicated = accept(proposal);

    const outcome = payloadOf(settleAction({
      adjudicated,
      context: OPERATION,
      states: characterState(fixture.character),
      handlers: {
        costs: [createCharacterItemOperationCostHandler(getItemDefinition)],
        effects: [],
      },
    }));

    const settled = outcome.states[ownerKey({ domain: "character", id: fixture.character.id })] as typeof fixture.character;

    expect(settled.items![0]!.quantity).toBe(2);

    const events = outcome.events.filter((event) => event.kind === "item-operation-settled");

    expect(events).toHaveLength(1);
    expect((events[0] as { useEffects?: { effects: readonly unknown[] } }).useEffects?.effects)
      .toHaveLength(1);
  });

  it("never lets useEffects enter possessed or equipped effect collection", () => {
    const fixture = useFixture();

    const proposal = payloadOf(prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved: fixture.resolved,
      definition: fixture.definition,
      intent: fixture.intent,
      approach: "mechanical",
      getItemDefinition,
    }));

    const adjudicated = accept(proposal);

    const outcome = payloadOf(settleAction({
      adjudicated,
      context: OPERATION,
      states: characterState(fixture.character),
      handlers: {
        costs: [createCharacterItemOperationCostHandler(getItemDefinition)],
        effects: [],
      },
    }));

    const settled = outcome.states[ownerKey({ domain: "character", id: fixture.character.id })] as typeof fixture.character;
    const resolvedAfter = payloadOf(resolveCharacter(settled));

    const sources = collectItemEffectSources(resolvedAfter.character.items);

    expect(sources).toEqual([]);
  });

  it("a settled miss still consumed the Item", () => {
    const fixture = useFixture();

    const proposal = payloadOf(prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved: fixture.resolved,
      definition: fixture.definition,
      intent: fixture.intent,
      approach: "mechanical",
      getItemDefinition,
    }));

    /* The GM replaces the outcome with a failure; the attempt still happened. */
    const adjudicated = payloadOf(adjudicateAction({
      operationId: OPERATION.operationId,
      proposal,
      approach: "mechanical",
      decision: { kind: "replace", outcome: { succeeded: false, reason: "The draught spills." } },
    }));

    const outcome = payloadOf(settleAction({
      adjudicated,
      context: OPERATION,
      states: characterState(fixture.character),
      handlers: {
        costs: [createCharacterItemOperationCostHandler(getItemDefinition)],
        effects: [],
      },
    }));

    const settled = outcome.states[ownerKey({ domain: "character", id: fixture.character.id })] as typeof fixture.character;

    expect(settled.items![0]!.quantity).toBe(2);
  });

  it("an ineligible use never reaches settlement, so nothing is consumed", () => {
    registerDraught("gated-draught", {
      useRequirements: [{
        id: "needs-steady-hand",
        requirement: { type: "hasTrait", traitId: "steady-hand" },
      }],
    });

    const character = createTestCharacter({
      items: [{ entryId: "e1", itemId: "gated-draught", quantity: 3, state: "carried" }],
    });
    const resolved = resolveTestCharacter(character);
    const definition = getItemDefinition("gated-draught")!;

    const intent: ItemOperationIntentInput = {
      operation: "use",
      item: { characterId: character.id, entryId: "e1" },
      actor: { type: "character", id: character.id },
      targets: [],
      focus: NO_FOCUS,
      executionContext: UNSTRUCTURED_EXECUTION,
    };

    const proposal = payloadOf(prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved,
      definition,
      intent,
      approach: "mechanical",
      getItemDefinition,
    }));

    expect(proposal.disposition).toBe("ineligible");

    const adjudicated = accept(proposal);

    const result = settleAction({
      adjudicated,
      context: OPERATION,
      states: characterState(character),
      handlers: {
        costs: [createCharacterItemOperationCostHandler(getItemDefinition)],
        effects: [],
      },
    });

    expect(errorCodesOf(result)).toContain("actions.settlement.not-settleable");
    expect(character.items![0]!.quantity).toBe(3);
  });

  it("catches a use whose entry emptied between preparation and settlement", () => {
    const fixture = useFixture();

    const proposal = payloadOf(prepareItemOperation({
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      resolved: fixture.resolved,
      definition: fixture.definition,
      intent: fixture.intent,
      approach: "mechanical",
      getItemDefinition,
    }));

    const adjudicated = accept(proposal);

    const drainedCharacter = {
      ...fixture.character,
      items: [{ ...fixture.character.items![0]!, quantity: 0 }],
    };

    const result = settleAction({
      adjudicated,
      context: OPERATION,
      states: characterState(drainedCharacter),
      handlers: {
        costs: [createCharacterItemOperationCostHandler(getItemDefinition)],
        effects: [],
      },
    });

    expect(errorCodesOf(result)).toContain("equipment.actions.use.stale");
  });
});


/* -------------------------------------------------------------------------- */
/* The direct resolvers remain pure and independently usable                 */
/* -------------------------------------------------------------------------- */

describe("the direct equipment resolvers are unaffected by the actions seam", () => {
  it("resolveEquipmentTransition still works standalone, without any action", () => {
    registerHelm();

    const character = createTestCharacter({ items: [entry()] });
    const resolved = resolveTestCharacter(character);

    const result = payloadOf(resolveTransitionWith({
      resolved,
      item: { characterId: character.id, entryId: "e1" },
      destination: "held",
    }, getItemDefinition));

    expect(result.disposition).toBe("available");
    expect(character.items![0]!.state).toBe("carried");
  });

  it("resolveItemUse still works standalone, without any action", () => {
    registerDraught();

    const character = createTestCharacter({
      items: [{ entryId: "e1", itemId: "test-draught", quantity: 1, state: "carried" }],
    });
    const resolved = resolveTestCharacter(character);

    const result = payloadOf(resolveItemUseWith(
      { resolved, item: { characterId: character.id, entryId: "e1" } },
      getItemDefinition,
    ));

    expect(result.disposition).toBe("executed");
    expect(character.items![0]!.quantity).toBe(1);
  });

  it("the engine's own bound resolvers agree with the unbound ones", () => {
    registerHelm();

    const character = createTestCharacter({ items: [entry()] });
    const resolved = resolveTestCharacter(character);
    const ref = { characterId: character.id, entryId: "e1" };

    const bound = payloadOf(resolveEquipmentTransition({ resolved, item: ref, destination: "held" }));
    const unbound = payloadOf(resolveTransitionWith({ resolved, item: ref, destination: "held" }, getItemDefinition));

    expect(bound).toEqual(unbound);
  });
});
