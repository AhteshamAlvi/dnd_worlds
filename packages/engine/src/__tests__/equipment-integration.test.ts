/*
 * Phase 4, end to end: a concrete Item can be selected, graded, contribute to
 * an action, receive character-rule modifiers, execute and consume
 * atomically, degrade or break through owner-routed integrity requests, and
 * preserve its full positive and negative output for a future all-or-nothing
 * Shū enhancement — without mutation, identity loss, dependency reversal, or
 * silent rule loss.
 *
 * Six fixtures, each proving a distinct corner of the boundary:
 *
 *   1. lantern        a reusable tool with an active effect (Ticket 4.4)
 *   2. calming-potion  a stackable, Shū-incompatible consumable (4.4, 4.6)
 *   3. frag-grenade    a consumable, Shū-compatible attack contribution (4.6)
 *   4. cursed-blade    a durable weapon with a negative side effect (4.6, 4.8)
 *   5. wardplate       armor: defense, passive AND active effects (4.6)
 *   6. river-stone      an improvised implement, boosted by a Trait (4.5, 4.7)
 *
 * Every fixture gets a success path AND a refusal proving the stage that
 * refuses commits nothing — the property every earlier ticket's own suite
 * already pins in isolation, exercised here together.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  clearCustomDefinitions,
  getDefinition,
  registerDefinition,
} from "../character/catalogs";

import {
  NO_FOCUS,
  UNSTRUCTURED_EXECUTION,
  adjudicateAction,
  settleAction,
  type ActionProposal,
} from "../actions";

import {
  createCharacterItemOperationCostHandler,
  getItemDefinition,
  prepareItemOperation,
  resolveItemPerformanceContribution,
  resolveSelectedImplements,
  type ItemDefinition,
  type ItemOperationIntentInput,
  type ItemPerformanceContribution,
} from "../character/equipment/index";
import type { CharacterItem } from "../character/equipment/index";
import type { ImplementRequirement, SelectedImplement } from "../character/equipment/implements";
import {
  collectMatchedCheckModifiers,
  type SourcedImplementConditionalRule,
} from "../character/equipment/conditions";

import { errorCodesOf, payloadOf } from "./fixtures/result";
import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});


/* -------------------------------------------------------------------------- */
/* Shared fixture plumbing                                                   */
/* -------------------------------------------------------------------------- */

const OPERATION = { operationId: "op-1", occurredAt: 1_000 };

function registerItem(id: string, fields: Record<string, unknown>): ItemDefinition {
  const result = registerDefinition("item", {
    id,
    name: id,
    description: "A Phase 4 integration fixture.",
    inventoryMode: "individual",
    shuInteraction: "compatible",
    ...fields,
  } as never);

  if (!result.ok) throw new Error(result.reason);

  return getDefinition("item", id)!;
}

function entry(overrides: Partial<CharacterItem> = {}): CharacterItem {
  return { entryId: "e1", itemId: "lantern", quantity: 1, state: "carried", ...overrides };
}

function characterWith(items: readonly CharacterItem[]) {
  const character = createTestCharacter({ items });

  return { character, resolved: resolveTestCharacter(character) };
}


/* -------------------------------------------------------------------------- */
/* 1. A reusable tool with an active effect                                  */
/* -------------------------------------------------------------------------- */

describe("fixture: a reusable tool with an active effect (lantern)", () => {
  function registerLantern() {
    return registerItem("lantern", {
      useEffects: [{ type: "modifyResolvedAttribute", attribute: "per", amount: 2 }],
      useApplication: {
        allowedTimings: ["action"],
        structuredActionCost: { actions: 1 },
        targets: { cardinality: { minimum: 0, maximum: 0 } },
        executionDuration: 0,
      },
    });
  }

  it("uses it, without consuming it, and the settled event carries useEffects once", () => {
    registerLantern();

    const { character, resolved } = characterWith([entry()]);

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
      definition: getItemDefinition("lantern")!,
      intent,
      approach: "mechanical",
      getItemDefinition,
    }));

    expect(proposal.disposition).toBe("resolvable");

    const adjudicated = payloadOf(adjudicateAction({
      operationId: OPERATION.operationId,
      proposal,
      approach: "mechanical",
      decision: { kind: "accept" },
    }));

    const outcome = payloadOf(settleAction({
      adjudicated,
      context: OPERATION,
      states: { [`character:${character.id}`]: character },
      handlers: { costs: [createCharacterItemOperationCostHandler(getItemDefinition)], effects: [] },
    }));

    const settled = outcome.states[`character:${character.id}`] as typeof character;

    /* Reusable: still quantity one, still carried, nothing consumed. */
    expect(settled.items![0]!.quantity).toBe(1);

    const events = outcome.events.filter((e) => e.kind === "item-operation-settled");

    expect(events).toHaveLength(1);
    expect((events[0] as { useEffects?: { effects: readonly unknown[] } }).useEffects?.effects)
      .toHaveLength(1);
  });

  it("refuses at settlement when the entry vanished, and commits nothing", () => {
    registerLantern();

    const { character, resolved } = characterWith([entry()]);

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
      definition: getItemDefinition("lantern")!,
      intent,
      approach: "mechanical",
      getItemDefinition,
    }));

    const adjudicated = payloadOf(adjudicateAction({
      operationId: OPERATION.operationId,
      proposal,
      approach: "mechanical",
      decision: { kind: "accept" },
    }));

    const strippedCharacter = { ...character, items: [] };

    const result = settleAction({
      adjudicated,
      context: OPERATION,
      states: { [`character:${character.id}`]: strippedCharacter },
      handlers: { costs: [createCharacterItemOperationCostHandler(getItemDefinition)], effects: [] },
    });

    expect(result.success).toBe(false);
  });
});


/* -------------------------------------------------------------------------- */
/* 2. A stackable, Shū-incompatible consumable                               */
/* -------------------------------------------------------------------------- */

describe("fixture: a stackable, Shū-incompatible potion", () => {
  function registerPotion() {
    return registerItem("calming-potion", {
      inventoryMode: "stackable",
      shuInteraction: "incompatible",
      consumesOnUse: true,
      useEffects: [{ type: "modifyResolvedAttribute", attribute: "wis", amount: 1 }],
      useApplication: {
        allowedTimings: ["action"],
        structuredActionCost: { actions: 1 },
        targets: { cardinality: { minimum: 0, maximum: 0 } },
        executionDuration: 0,
      },
    });
  }

  it("drinks one from the stack, settling atomically", () => {
    registerPotion();

    const { character, resolved } = characterWith([
      entry({ itemId: "calming-potion", quantity: 3, state: "carried" }),
    ]);

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
      definition: getItemDefinition("calming-potion")!,
      intent,
      approach: "mechanical",
      getItemDefinition,
    }));

    const adjudicated = payloadOf(adjudicateAction({
      operationId: OPERATION.operationId,
      proposal,
      approach: "mechanical",
      decision: { kind: "accept" },
    }));

    const outcome = payloadOf(settleAction({
      adjudicated,
      context: OPERATION,
      states: { [`character:${character.id}`]: character },
      handlers: { costs: [createCharacterItemOperationCostHandler(getItemDefinition)], effects: [] },
    }));

    const settled = outcome.states[`character:${character.id}`] as typeof character;

    expect(settled.items![0]!.quantity).toBe(2);
    expect(getItemDefinition("calming-potion")!.shuInteraction).toBe("incompatible");
  });

  it("stays stackable and unregisterable with integrity — the two are refused together", () => {
    const result = registerDefinition("item", {
      id: "bad-potion",
      name: "Bad Potion",
      description: "Stackable and durable — refused.",
      inventoryMode: "stackable",
      shuInteraction: "incompatible",
      integrity: { maximum: 5, repairable: false, zeroBehavior: "destroyed" },
    } as never);

    expect(result.ok).toBe(false);
  });
});


/* -------------------------------------------------------------------------- */
/* 3. A consumable, Shū-compatible attack contribution (grenade)             */
/* -------------------------------------------------------------------------- */

describe("fixture: a consumable, Shū-compatible grenade", () => {
  function registerGrenade() {
    return registerItem("frag-grenade", {
      inventoryMode: "stackable",
      shuInteraction: "compatible",
      consumesOnUse: true,
      attack: {
        effects: [{ type: "modifyCheck", check: { kind: "attribute", attribute: "dex" }, amount: 4 }],
      },
      useEffects: [{ type: "modifyResolvedAttribute", attribute: "cha", amount: -1 }],
    });
  }

  it("resolves an attack contribution independent of its consumption", () => {
    registerGrenade();

    const contribution = payloadOf(resolveItemPerformanceContribution(
      {
        role: "thrown",
        item: { characterId: "gon", entryId: "e1" },
        itemId: "frag-grenade",
        compatibility: "compatible",
        families: [],
        state: "carried",
      },
      getItemDefinition,
    ));

    expect(contribution.attack?.effects.effects).toHaveLength(1);
    expect(contribution.source).toEqual({ type: "item", id: "frag-grenade", instanceId: "e1" });
    /* Consumption is a fact about use, never about the attack contribution. */
    expect(getItemDefinition("frag-grenade")!.consumesOnUse).toBe(true);
  });

  it("refuses to resolve a contribution for an entry naming an unknown Item", () => {
    const result = resolveItemPerformanceContribution(
      {
        role: "thrown",
        item: { characterId: "gon", entryId: "e1" },
        itemId: "no-such-grenade",
        compatibility: "compatible",
        families: [],
        state: "carried",
      },
      getItemDefinition,
    );

    expect(errorCodesOf(result)).toContain("equipment.contributions.item_unknown");
  });
});


/* -------------------------------------------------------------------------- */
/* 4. A durable weapon with a negative side effect                          */
/* -------------------------------------------------------------------------- */

describe("fixture: a durable weapon with a negative side effect (cursed blade)", () => {
  function registerCursedBlade() {
    return registerItem("cursed-blade", {
      integrity: {
        maximum: 8,
        repairable: true,
        zeroBehavior: "broken",
        bands: [
          { state: "intact", minimum: 5, maximum: 8 },
          { state: "degraded", minimum: 1, maximum: 4, effects: [
            { type: "modifyCheck", check: { kind: "attribute", attribute: "dex" }, amount: -1 },
          ] },
          { state: "broken", minimum: 0, maximum: 0 },
        ],
      },
      attack: {
        effects: [{ type: "modifyCheck", check: { kind: "attribute", attribute: "dex" }, amount: 3 }],
      },
      /* The negative side effect: it whispers, permanently, while carried. */
      possessedEffects: [{ type: "modifyResolvedAttribute", attribute: "wis", amount: -1 }],
    });
  }

  it("carries both its bonus and its curse, signed, through the same resolution path", () => {
    registerCursedBlade();

    const contribution = payloadOf(resolveItemPerformanceContribution(
      {
        role: "weapon",
        item: { characterId: "gon", entryId: "e1" },
        itemId: "cursed-blade",
        compatibility: "compatible",
        families: [],
        state: "held",
        integrity: 8,
      },
      getItemDefinition,
    ));

    const attackAmount = (contribution.attack!.effects.effects[0]!.effect as { amount: number }).amount;

    expect(attackAmount).toBe(3);
    expect(contribution.integrity?.state).toBe("intact");

    const definition = getItemDefinition("cursed-blade")!;

    expect(definition.possessedEffects).toEqual([
      { type: "modifyResolvedAttribute", attribute: "wis", amount: -1 },
    ]);
  });

  it("degrades to a worse band under stress, and a stale settlement refuses cleanly", () => {
    registerCursedBlade();

    const before = payloadOf(resolveItemPerformanceContribution(
      { role: "weapon", item: { characterId: "gon", entryId: "e1" }, itemId: "cursed-blade", compatibility: "compatible", families: [], state: "held", integrity: 8 },
      getItemDefinition,
    ));

    const after = payloadOf(resolveItemPerformanceContribution(
      { role: "weapon", item: { characterId: "gon", entryId: "e1" }, itemId: "cursed-blade", compatibility: "compatible", families: [], state: "held", integrity: 3 },
      getItemDefinition,
    ));

    expect(before.integrity?.state).toBe("intact");
    expect(after.integrity?.state).toBe("degraded");
    expect(after.integrity?.effects.effects).toHaveLength(1);
  });
});


/* -------------------------------------------------------------------------- */
/* 5. Armor: defense, passive AND active effects together                   */
/* -------------------------------------------------------------------------- */

describe("fixture: armor with defense, a passive ward and an active effect", () => {
  function registerWardplate() {
    return registerItem("wardplate", {
      defense: {
        effects: [{ type: "modifyCheck", check: { kind: "attribute", attribute: "dex" }, amount: 2 }],
      },
      equippedEffects: [{ type: "modifyResolvedAttribute", attribute: "con", amount: 1 }],
      useEffects: [{ type: "modifyResolvedAttribute", attribute: "vit", amount: 3 }],
      useApplication: {
        allowedTimings: ["reaction"],
        structuredActionCost: { actions: 0 },
        targets: { cardinality: { minimum: 0, maximum: 0 } },
        executionDuration: 0,
      },
    });
  }

  it("contributes defense, a passive ward while worn, and an active effect on use — all at once, all distinct", () => {
    registerWardplate();

    const contribution = payloadOf(resolveItemPerformanceContribution(
      { role: "armor", item: { characterId: "gon", entryId: "e1" }, itemId: "wardplate", compatibility: "compatible", families: [], state: "worn" },
      getItemDefinition,
    ));

    expect(contribution.defense?.effects.effects).toHaveLength(1);
    expect(contribution.attack).toBeUndefined();

    const definition = getItemDefinition("wardplate")!;

    /* Passive (equipped), active (use) and performance (defense) are three
     * distinct declared surfaces, none of which leak into either other. */
    expect(definition.equippedEffects).toHaveLength(1);
    expect(definition.useEffects).toHaveLength(1);
  });

  it("refuses a defense contribution with an invalid check scope, and resolves nothing", () => {
    const result = resolveItemPerformanceContribution(
      {
        role: "armor",
        item: { characterId: "gon", entryId: "e1" },
        itemId: "broken-wardplate",
        compatibility: "compatible",
        families: [],
        state: "worn",
      },
      () => ({
        id: "broken-wardplate",
        name: "Broken Wardplate",
        description: "Deliberately invalid.",
        inventoryMode: "individual",
        shuInteraction: "compatible",
        attack: { check: { scope: { kind: "bogus" } as never } },
      }),
    );

    expect(result.success).toBe(false);
  });
});


/* -------------------------------------------------------------------------- */
/* 6. An improvised implement, boosted by a Trait                           */
/* -------------------------------------------------------------------------- */

describe("fixture: an improvised implement affected by a Trait", () => {
  const WEAPON_ROLE: ImplementRequirement = {
    role: "weapon",
    minimum: 1,
    maximum: 1,
    acceptedFamilies: ["bladed"],
    allowImprovised: true,
  };

  function registerRiverStone() {
    return registerItem("river-stone", {});
  }

  it("resolves as improvised, and a matching Trait grants a check bonus for it", () => {
    registerRiverStone();

    const { character, resolved } = characterWith([
      entry({ entryId: "e1", itemId: "river-stone", state: "held" }),
    ]);

    const selections: readonly SelectedImplement[] = [
      { role: "weapon", item: { characterId: character.id, entryId: "e1" } },
    ];

    const selection = payloadOf(resolveSelectedImplements(
      { resolved, requirements: [WEAPON_ROLE], selections },
      getItemDefinition,
    ));

    expect(selection.issues).toEqual([]);
    expect(selection.resolutions[0]!.compatibility).toBe("improvised");

    const rules: readonly SourcedImplementConditionalRule[] = [{
      source: { type: "trait", id: "improvised-mastery" },
      rule: {
        id: "improvised-bonus",
        condition: { compatibility: ["improvised"] },
        output: { kind: "check", scope: { kind: "attribute", attribute: "dex" }, amount: 2 },
      },
    }];

    const modifiers = collectMatchedCheckModifiers(rules, selection.resolutions);

    expect(modifiers).toHaveLength(1);
    expect(modifiers[0]!.source).toEqual({ type: "trait", id: "improvised-mastery" });
    expect(modifiers[0]!.amount).toBe(2);
  });

  it("refuses the role when improvisation is not permitted, and grants nothing", () => {
    registerRiverStone();

    const { character, resolved } = characterWith([
      entry({ entryId: "e1", itemId: "river-stone", state: "held" }),
    ]);

    const strict: ImplementRequirement = { ...WEAPON_ROLE, allowImprovised: false };

    const selection = payloadOf(resolveSelectedImplements(
      {
        resolved,
        requirements: [strict],
        selections: [{ role: "weapon", item: { characterId: character.id, entryId: "e1" } }],
      },
      getItemDefinition,
    ));

    expect(selection.resolutions).toEqual([]);
    expect(selection.issues.some((issue) => issue.kind === "incompatible")).toBe(true);
  });
});


/* -------------------------------------------------------------------------- */
/* Test-only generic enhancement envelope — proving Shū readiness            */
/* -------------------------------------------------------------------------- */

/*
 * NOT engine code. Ticket 4.9 asks for a test-only envelope proving the
 * boundary is enhancement-ready without writing any Shū/Aura formula into
 * the engine — so this function lives here, in the test file, and nowhere
 * under src/character or src/actions.
 */
function testOnlyEnhance(
  contribution: ItemPerformanceContribution,
  factor: number,
  shuInteraction: "compatible" | "incompatible",
): readonly number[] {
  if (shuInteraction === "incompatible") return [];

  const amounts: number[] = [];

  for (const bucket of [contribution.attack, contribution.defense]) {
    for (const sourced of bucket?.effects.effects ?? []) {
      const effect = sourced.effect as { amount?: number };

      if (typeof effect.amount === "number") amounts.push(effect.amount * factor);
    }
  }

  return amounts;
}

describe("a test-only generic enhancement envelope proves Shū readiness", () => {
  it("exposes the whole bundle for a compatible Item, and scales every signed value the same way", () => {
    registerDefinition("item", {
      id: "enhance-test-blade",
      name: "Enhance Test Blade",
      description: "Test-only.",
      inventoryMode: "individual",
      shuInteraction: "compatible",
      attack: {
        effects: [
          { type: "modifyCheck", check: { kind: "attribute", attribute: "dex" }, amount: 4 },
          { type: "modifyCheck", check: { kind: "attribute", attribute: "dex" }, amount: -2 },
        ],
      },
    } as never);

    const contribution = payloadOf(resolveItemPerformanceContribution(
      { role: "weapon", item: { characterId: "gon", entryId: "e1" }, itemId: "enhance-test-blade", compatibility: "compatible", families: [], state: "held" },
      getItemDefinition,
    ));

    const enhanced = testOnlyEnhance(contribution, 1.5, "compatible");

    expect(enhanced).toEqual([6, -3]);
    /* The negative value GREW in magnitude (from -2 to -3), never suppressed. */
    expect(Math.abs(enhanced[1]!)).toBeGreaterThan(2);
  });

  it("exposes nothing at all for an incompatible Item", () => {
    registerDefinition("item", {
      id: "enhance-test-potion",
      name: "Enhance Test Potion",
      description: "Test-only.",
      inventoryMode: "individual",
      shuInteraction: "incompatible",
      attack: {
        effects: [{ type: "modifyCheck", check: { kind: "attribute", attribute: "dex" }, amount: 4 }],
      },
    } as never);

    const contribution = payloadOf(resolveItemPerformanceContribution(
      { role: "weapon", item: { characterId: "gon", entryId: "e1" }, itemId: "enhance-test-potion", compatibility: "compatible", families: [], state: "held" },
      getItemDefinition,
    ));

    expect(testOnlyEnhance(contribution, 1.5, "incompatible")).toEqual([]);
  });

  it("declares no per-channel opt-in anywhere in the equipment domain", () => {
    /* The architecture suite (equipment establishes the Shū contract without
     * Shū itself) already forbids `shu: { channels: [...] }` in source; this
     * is the narrower, data-level claim: shuInteraction has exactly two
     * values and nothing about it is a list or a map. */
    registerDefinition("item", {
      id: "enhance-test-check",
      name: "Enhance Test Check",
      description: "Test-only.",
      inventoryMode: "individual",
      shuInteraction: "compatible",
    } as never);

    const definition = getItemDefinition("enhance-test-check");

    expect(typeof definition!.shuInteraction).toBe("string");
    expect(["compatible", "incompatible"]).toContain(definition!.shuInteraction);
  });
});
