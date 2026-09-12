/*
 * Per-entry integrity: explicit stress, degradation, breakage and repair,
 * kept apart from stack quantity and consumption.
 *
 * Three properties this suite exists to prove, each of which the obvious
 * implementation gets wrong.
 *
 * STATE IS DERIVED. Intact/degraded/broken/destroyed is never a stored flag —
 * it comes from the stored number and the authored bands every time, so a
 * sheet cannot say "broken" while integrity reads positive.
 *
 * QUANTITY AND INTEGRITY ARE INDEPENDENT AXES. A broken sword is still
 * quantity one; nothing about damaging an entry touches how many there are.
 *
 * A REFUSAL SETTLES NOTHING. Stress on a non-durable Item, or repair a policy
 * refuses, is a real zero-effect outcome — never a coordinator failure — and
 * never mutates the character either way.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  clearCustomDefinitions,
  getDefinition,
  registerDefinition,
} from "../character/catalogs";

import {
  createCharacterIntegrityEffectHandler,
  currentIntegrityBand,
  findItemIntegrityBandIssues,
  findItemIntegrityDefinitionIssues,
  getItemDefinition,
  resolveIntegrityState,
  resolveItemIntegrityOperation,
  resolveItemPerformanceContribution,
  type ItemDefinition,
  type ItemIntegrityDefinition,
} from "../character/equipment/index";
import type { ImplementResolution } from "../character/equipment/implements";
import type { CharacterItem } from "../character/equipment/index";

import {
  NO_FOCUS,
  UNSTRUCTURED_EXECUTION,
  adjudicateAction,
  itemIntegrityConsequence,
  prepareAction,
  settleAction,
  type ActionProfile,
  type AdjudicatedAction,
} from "../actions";
import { NO_TARGETS } from "../targeting";
import type { RuntimeOperationContext } from "../runtime/context";
import { ownerKey } from "../runtime/domains";

import { errorCodesOf, payloadOf } from "./fixtures/result";
import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});


/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const DEGRADED_PENALTY = {
  type: "modifyCheck",
  check: { kind: "attribute", attribute: "dex" },
  amount: -2,
} as const;

const DURABLE_POLICY: ItemIntegrityDefinition = {
  maximum: 10,
  repairable: true,
  zeroBehavior: "broken",
  bands: [
    { state: "intact", minimum: 6, maximum: 10 },
    { state: "degraded", minimum: 1, maximum: 5, effects: [DEGRADED_PENALTY] },
    { state: "broken", minimum: 0, maximum: 0 },
  ],
};

function registerItem(id: string, fields: Record<string, unknown> = {}): ItemDefinition {
  const result = registerDefinition("item", {
    id,
    name: id,
    description: "A test Item registered for integrity.",
    inventoryMode: "individual",
    shuInteraction: "compatible",
    ...fields,
  } as never);

  if (!result.ok) throw new Error(result.reason);

  return getDefinition("item", id)!;
}

function registerDurableSword(id = "sword", overrides: Record<string, unknown> = {}): ItemDefinition {
  return registerItem(id, {
    integrity: DURABLE_POLICY,
    attack: { effects: [{ type: "modifyCheck", check: { kind: "attribute", attribute: "dex" }, amount: 3 }] },
    ...overrides,
  });
}

function entry(overrides: Partial<CharacterItem> = {}): CharacterItem {
  return {
    entryId: "e1",
    itemId: "sword",
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

const OPERATION: RuntimeOperationContext = { operationId: "op-1", occurredAt: 1_000 };

function characterState(character: unknown) {
  return { [ownerKey({ domain: "character", id: (character as { id: string }).id })]: character };
}


/* -------------------------------------------------------------------------- */
/* State is derived                                                          */
/* -------------------------------------------------------------------------- */

describe("integrity state is derived, never stored", () => {
  it("derives intact/degraded/broken from bands", () => {
    expect(resolveIntegrityState(DURABLE_POLICY, 10)).toBe("intact");
    expect(resolveIntegrityState(DURABLE_POLICY, 6)).toBe("intact");
    expect(resolveIntegrityState(DURABLE_POLICY, 5)).toBe("degraded");
    expect(resolveIntegrityState(DURABLE_POLICY, 1)).toBe("degraded");
    expect(resolveIntegrityState(DURABLE_POLICY, 0)).toBe("broken");
  });

  it("falls back to intact/zeroBehavior with no bands authored", () => {
    const bare: ItemIntegrityDefinition = { maximum: 5, repairable: true, zeroBehavior: "destroyed" };

    expect(resolveIntegrityState(bare, 5)).toBe("intact");
    expect(resolveIntegrityState(bare, 1)).toBe("intact");
    expect(resolveIntegrityState(bare, 0)).toBe("destroyed");
  });
});


/* -------------------------------------------------------------------------- */
/* The pure resolver                                                         */
/* -------------------------------------------------------------------------- */

describe("resolveItemIntegrityOperation", () => {
  it("stresses only the referenced entry, immutably", () => {
    registerDurableSword();

    const { character, resolved } = characterWith([
      entry({ entryId: "e1" }),
      entry({ entryId: "e2" }),
    ]);
    const before = character.items;

    const result = payloadOf(resolveItemIntegrityOperation(
      { resolved, item: { characterId: character.id, entryId: "e1" }, operation: { type: "stress", amount: 4 } },
      getItemDefinition,
    ));

    expect(result.disposition).toBe("applied");

    if (result.disposition === "applied") {
      expect(result.change.integrityBefore).toBe(10);
      expect(result.change.integrityAfter).toBe(6);
      expect(result.nextCharacter.items![0]!.integrity).toBe(6);
      expect(result.nextCharacter.items![1]!.integrity).toBeUndefined();
    }

    /* The input character is untouched either way. */
    expect(character.items).toBe(before);
  });

  it("clamps stress at zero and repair at maximum", () => {
    registerDurableSword();

    const { character, resolved } = characterWith([entry({ integrity: 1 })]);

    const stressed = payloadOf(resolveItemIntegrityOperation(
      { resolved, item: { characterId: character.id, entryId: "e1" }, operation: { type: "stress", amount: 999 } },
      getItemDefinition,
    ));

    expect(stressed.disposition === "applied" && stressed.change.integrityAfter).toBe(0);

    const { character: fresh, resolved: freshResolved } = characterWith([entry({ integrity: 9 })]);

    const repaired = payloadOf(resolveItemIntegrityOperation(
      { resolved: freshResolved, item: { characterId: fresh.id, entryId: "e1" }, operation: { type: "repair", amount: 999 } },
      getItemDefinition,
    ));

    expect(repaired.disposition === "applied" && repaired.change.integrityAfter).toBe(10);
  });

  it("reports not-durable for an Item with no integrity policy, never a refusal about the reference", () => {
    registerItem("rock");

    const { character, resolved } = characterWith([entry({ itemId: "rock" })]);

    const result = payloadOf(resolveItemIntegrityOperation(
      { resolved, item: { characterId: character.id, entryId: "e1" }, operation: { type: "stress", amount: 1 } },
      getItemDefinition,
    ));

    expect(result.disposition).toBe("not-durable");
  });

  it("refuses repair when the policy says not repairable", () => {
    registerDurableSword("unrepairable-sword", { integrity: { ...DURABLE_POLICY, repairable: false } });

    const { character, resolved } = characterWith([entry({ itemId: "unrepairable-sword", integrity: 2 })]);

    const result = payloadOf(resolveItemIntegrityOperation(
      { resolved, item: { characterId: character.id, entryId: "e1" }, operation: { type: "repair", amount: 1 } },
      getItemDefinition,
    ));

    expect(result.disposition).toBe("not-repairable");
  });

  it("treats a destroyed Item at zero as terminal, even when repairable is true", () => {
    registerDurableSword("vial", { integrity: { ...DURABLE_POLICY, zeroBehavior: "destroyed" } });

    const { character, resolved } = characterWith([entry({ itemId: "vial", integrity: 0 })]);

    const result = payloadOf(resolveItemIntegrityOperation(
      { resolved, item: { characterId: character.id, entryId: "e1" }, operation: { type: "repair", amount: 1 } },
      getItemDefinition,
    ));

    expect(result.disposition).toBe("not-repairable");
  });

  it("respects Shū compatibility for mitigation without calculating Shū", () => {
    registerDurableSword("compatible-blade", { shuInteraction: "compatible" });
    registerDurableSword("incompatible-blade", { shuInteraction: "incompatible" });

    const compatible = characterWith([entry({ itemId: "compatible-blade" })]);
    const incompatible = characterWith([entry({ itemId: "incompatible-blade" })]);

    const mitigated = payloadOf(resolveItemIntegrityOperation(
      {
        resolved: compatible.resolved,
        item: { characterId: compatible.character.id, entryId: "e1" },
        operation: { type: "stress", amount: 5, mitigation: 3 },
      },
      getItemDefinition,
    ));

    const unmitigated = payloadOf(resolveItemIntegrityOperation(
      {
        resolved: incompatible.resolved,
        item: { characterId: incompatible.character.id, entryId: "e1" },
        operation: { type: "stress", amount: 5, mitigation: 3 },
      },
      getItemDefinition,
    ));

    expect(mitigated.disposition === "applied" && mitigated.change.integrityAfter).toBe(8);
    expect(unmitigated.disposition === "applied" && unmitigated.change.integrityAfter).toBe(5);
  });

  it("quantity and integrity remain independent", () => {
    registerDurableSword();

    const { character, resolved } = characterWith([entry({ quantity: 1, integrity: 10 })]);

    const result = payloadOf(resolveItemIntegrityOperation(
      { resolved, item: { characterId: character.id, entryId: "e1" }, operation: { type: "stress", amount: 10 } },
      getItemDefinition,
    ));

    expect(result.disposition === "applied" && result.change.integrityAfter).toBe(0);
    expect(result.disposition === "applied" && result.nextCharacter.items![0]!.quantity).toBe(1);
  });
});


/* -------------------------------------------------------------------------- */
/* Bands modify contributions deterministically                             */
/* -------------------------------------------------------------------------- */

describe("bands deterministically modify contributions", () => {
  function resolutionAt(integrity: number): ImplementResolution {
    return {
      role: "weapon",
      item: { characterId: "gon", entryId: "e1" },
      itemId: "sword",
      compatibility: "compatible",
      families: [],
      state: "held",
      integrity,
    };
  }

  it("carries the current band's effects, and only that band's", () => {
    registerDurableSword();

    const intact = payloadOf(resolveItemPerformanceContribution(resolutionAt(10), getItemDefinition));
    const degraded = payloadOf(resolveItemPerformanceContribution(resolutionAt(3), getItemDefinition));
    const broken = payloadOf(resolveItemPerformanceContribution(resolutionAt(0), getItemDefinition));

    expect(intact.integrity?.state).toBe("intact");
    expect(intact.integrity?.effects.effects).toEqual([]);

    expect(degraded.integrity?.state).toBe("degraded");
    expect(degraded.integrity?.effects.effects).toHaveLength(1);

    expect(broken.integrity?.state).toBe("broken");
    expect(broken.integrity?.effects.effects).toEqual([]);

    /* The base attack contribution is unaffected by the band's own bucket. */
    expect(intact.attack?.effects.effects).toHaveLength(1);
    expect(degraded.attack?.effects.effects).toHaveLength(1);
  });

  it("reports no integrity contribution for a non-durable Item", () => {
    registerItem("rock");

    const contribution = payloadOf(resolveItemPerformanceContribution(
      { role: "weapon", item: { characterId: "gon", entryId: "e1" }, itemId: "rock", compatibility: "compatible", families: [], state: "held" },
      getItemDefinition,
    ));

    expect(contribution.integrity).toBeUndefined();
  });
});


/* -------------------------------------------------------------------------- */
/* An Item breaking mid-action still resolved at its pre-break performance   */
/* -------------------------------------------------------------------------- */

it("resolves a contribution at the Item's state BEFORE this operation's own damage settles", () => {
  registerDurableSword();

  /* The Item is intact going into the attack. */
  const preBreak = payloadOf(resolveItemPerformanceContribution(
    { role: "weapon", item: { characterId: "gon", entryId: "e1" }, itemId: "sword", compatibility: "compatible", families: [], state: "held", integrity: 6 },
    getItemDefinition,
  ));

  expect(preBreak.integrity?.state).toBe("intact");
  expect(preBreak.attack?.effects.effects).toHaveLength(1);

  /* THEN the stress from this same attack settles, breaking it. */
  const { character, resolved } = characterWith([entry({ integrity: 6 })]);

  const settled = payloadOf(resolveItemIntegrityOperation(
    { resolved, item: { characterId: character.id, entryId: "e1" }, operation: { type: "stress", amount: 6 } },
    getItemDefinition,
  ));

  expect(settled.disposition === "applied" && settled.change.stateAfter).toBe("broken");

  /* A SUBSEQUENT resolution now sees the broken state. */
  const postBreak = payloadOf(resolveItemPerformanceContribution(
    { role: "weapon", item: { characterId: "gon", entryId: "e1" }, itemId: "sword", compatibility: "compatible", families: [], state: "held", integrity: 0 },
    getItemDefinition,
  ));

  expect(postBreak.integrity?.state).toBe("broken");
});


/* -------------------------------------------------------------------------- */
/* Settlement: an effect, atomic, never a coordinator failure                */
/* -------------------------------------------------------------------------- */

describe("settling integrity through the runtime effect handler", () => {
  const TEST_PROFILE: ActionProfile = {
    id: "test-strike",
    source: { type: "skill", id: "test-strike" },
    allowedTimings: ["action"],
    structuredActionCost: { actions: 0 },
    targets: { cardinality: NO_TARGETS },
    permittedFocusKinds: ["none"],
    executionDuration: 0,
  };

  function acceptedAdjudication(character: ReturnType<typeof createTestCharacter>): AdjudicatedAction {
    const proposal = payloadOf(prepareAction({
      operationId: OPERATION.operationId,
      profile: TEST_PROFILE,
      intent: {
        id: "intent-1",
        profileId: TEST_PROFILE.id,
        actor: { type: "character", id: character.id },
        targets: [],
        focus: NO_FOCUS,
        executionContext: UNSTRUCTURED_EXECUTION,
      },
      approach: "mechanical",
    }));

    return payloadOf(adjudicateAction({
      operationId: OPERATION.operationId,
      proposal,
      approach: "mechanical",
      decision: { kind: "accept" },
    }));
  }

  it("commits a stress consequence, replacing only the referenced entry", () => {
    registerDurableSword();

    const { character } = characterWith([entry({ integrity: 10 })]);
    const adjudicated = acceptedAdjudication(character);

    const outcome = payloadOf(settleAction({
      adjudicated,
      context: OPERATION,
      states: characterState(character),
      handlers: { costs: [], effects: [createCharacterIntegrityEffectHandler(getItemDefinition)] },
      consequences: [itemIntegrityConsequence(
        { operationId: OPERATION.operationId, occurredAt: OPERATION.occurredAt, from: { domain: "caller", id: "gm" } },
        { requestId: "stress-1", characterId: character.id, entryId: "e1", operation: "stress", amount: 4 },
      )],
    }));

    const settled = outcome.states[ownerKey({ domain: "character", id: character.id })] as typeof character;

    expect(settled.items![0]!.integrity).toBe(6);
    expect(character.items![0]!.integrity).toBe(10);
  });

  it("a refusal (non-durable target) settles as zero, never a coordinator failure", () => {
    registerItem("rock");

    const { character } = characterWith([entry({ itemId: "rock" })]);
    const adjudicated = acceptedAdjudication(character);

    const outcome = payloadOf(settleAction({
      adjudicated,
      context: OPERATION,
      states: characterState(character),
      handlers: { costs: [], effects: [createCharacterIntegrityEffectHandler(getItemDefinition)] },
      consequences: [itemIntegrityConsequence(
        { operationId: OPERATION.operationId, occurredAt: OPERATION.occurredAt, from: { domain: "caller", id: "gm" } },
        { requestId: "stress-1", characterId: character.id, entryId: "e1", operation: "stress", amount: 4 },
      )],
    }));

    expect(outcome.effectOutcomes[0]).toEqual({ requestId: "stress-1", requested: 4, actual: 0 });

    const settled = outcome.states[ownerKey({ domain: "character", id: character.id })] as typeof character;

    expect(settled.items![0]!.quantity).toBe(1);
  });

  it("commits multiple requests atomically, one settlement, one commit", () => {
    registerDurableSword();
    registerDurableSword("shield", { integrity: DURABLE_POLICY });

    const { character } = characterWith([
      entry({ entryId: "e1", itemId: "sword", integrity: 10 }),
      entry({ entryId: "e2", itemId: "shield", integrity: 10 }),
    ]);
    const adjudicated = acceptedAdjudication(character);

    const context = { operationId: OPERATION.operationId, occurredAt: OPERATION.occurredAt, from: { domain: "caller" as const, id: "gm" } };

    const outcome = payloadOf(settleAction({
      adjudicated,
      context: OPERATION,
      states: characterState(character),
      handlers: { costs: [], effects: [createCharacterIntegrityEffectHandler(getItemDefinition)] },
      consequences: [
        itemIntegrityConsequence(context, { requestId: "s1", characterId: character.id, entryId: "e1", operation: "stress", amount: 6 }),
        itemIntegrityConsequence(context, { requestId: "s2", characterId: character.id, entryId: "e2", operation: "repair", amount: 2 }),
      ],
    }));

    const settled = outcome.states[ownerKey({ domain: "character", id: character.id })] as typeof character;
    const byEntry = new Map(settled.items!.map((item) => [item.entryId, item]));

    expect(byEntry.get("e1")?.integrity).toBe(4);
    expect(byEntry.get("e2")?.integrity).toBe(10);
    expect(outcome.events.filter((e) => e.kind === "item-integrity-applied")).toHaveLength(2);
  });

  it("resolves multiple requests on ONE entry deterministically, independent of caller order", () => {
    /*
     * Simultaneous effects on one owner settle from ONE pre-batch state, per
     * the coordinator's own contract (runtime/requests.ts) — member order
     * within a batch is for the log only. This handler processes a batch in
     * the coordinator's canonical (kind, then requestId) order rather than
     * the caller's array order, so "repair" sorts before "stress" here; the
     * two orderings below must agree with each other, not with insertion
     * order, which is the property this test actually pins.
     */
    registerDurableSword();

    const context = { operationId: OPERATION.operationId, occurredAt: OPERATION.occurredAt, from: { domain: "caller" as const, id: "gm" } };

    function settleBoth(character: ReturnType<typeof createTestCharacter>) {
      const adjudicated = acceptedAdjudication(character);

      return payloadOf(settleAction({
        adjudicated,
        context: OPERATION,
        states: characterState(character),
        handlers: { costs: [], effects: [createCharacterIntegrityEffectHandler(getItemDefinition)] },
        consequences: [
          itemIntegrityConsequence(context, { requestId: "s1", characterId: character.id, entryId: "e1", operation: "stress", amount: 6 }),
          itemIntegrityConsequence(context, { requestId: "s2", characterId: character.id, entryId: "e1", operation: "repair", amount: 2 }),
        ],
      }));
    }

    const { character: forward } = characterWith([entry({ integrity: 10 })]);
    const forwardOutcome = settleBoth(forward);

    const { character: backward } = characterWith([entry({ integrity: 10 })]);
    const backwardAdjudicated = acceptedAdjudication(backward);

    const backwardOutcome = payloadOf(settleAction({
      adjudicated: backwardAdjudicated,
      context: OPERATION,
      states: characterState(backward),
      handlers: { costs: [], effects: [createCharacterIntegrityEffectHandler(getItemDefinition)] },
      consequences: [
        itemIntegrityConsequence(context, { requestId: "s2", characterId: backward.id, entryId: "e1", operation: "repair", amount: 2 }),
        itemIntegrityConsequence(context, { requestId: "s1", characterId: backward.id, entryId: "e1", operation: "stress", amount: 6 }),
      ],
    }));

    const forwardEntry = (forwardOutcome.states[ownerKey({ domain: "character", id: forward.id })] as typeof forward).items![0];
    const backwardEntry = (backwardOutcome.states[ownerKey({ domain: "character", id: backward.id })] as typeof backward).items![0];

    expect(forwardEntry!.integrity).toBe(backwardEntry!.integrity);
  });
});


/* -------------------------------------------------------------------------- */
/* Hostile input                                                            */
/* -------------------------------------------------------------------------- */

describe("hostile integrity data is refused without throwing", () => {
  it("refuses a hostile integrity definition", () => {
    const hostileDefinitions: readonly unknown[] = [
      { maximum: -1, repairable: true, zeroBehavior: "broken" },
      { maximum: "ten", repairable: true, zeroBehavior: "broken" },
      { maximum: 10, repairable: "yes", zeroBehavior: "broken" },
      { maximum: 10, repairable: true, zeroBehavior: "sometimes" },
      { maximum: 10, repairable: true, zeroBehavior: "broken", bands: "not-a-list" },
    ];

    for (const definition of hostileDefinitions) {
      expect(() => {
        const issues = findItemIntegrityDefinitionIssues(definition as never);

        expect(issues.length).toBeGreaterThan(0);
      }).not.toThrow();
    }
  });

  it("refuses a hostile integrity band", () => {
    const hostileBands: readonly unknown[] = [
      { state: "bogus", minimum: 0, maximum: 5 },
      { state: "intact", minimum: 5, maximum: 1 },
      { state: "intact", minimum: "a", maximum: 5 },
      { state: "intact", minimum: 0, maximum: 5, effects: "nope" },
      { state: "intact", minimum: 0, maximum: 5, effects: [{ type: "bogus" }] },
    ];

    for (const band of hostileBands) {
      expect(() => {
        const issues = findItemIntegrityBandIssues(band as never);

        expect(issues.length).toBeGreaterThan(0);
      }).not.toThrow();
    }
  });

  it("refuses registering a stackable Item that declares integrity", () => {
    const result = registerDefinition("item", {
      id: "stack-of-blades",
      name: "Stack of Blades",
      description: "A test Item.",
      inventoryMode: "stackable",
      shuInteraction: "compatible",
      integrity: DURABLE_POLICY,
    } as never);

    expect(result.ok).toBe(false);
  });

  it("refuses a malformed reference without throwing", () => {
    registerDurableSword();

    const { resolved } = characterWith([entry()]);

    expect(() => {
      const result = resolveItemIntegrityOperation(
        { resolved, item: { characterId: "somebody-else", entryId: "e1" }, operation: { type: "stress", amount: 1 } },
        getItemDefinition,
      );

      expect(errorCodesOf(result)).toContain("equipment.integrity.character_mismatch");
    }).not.toThrow();
  });
});
