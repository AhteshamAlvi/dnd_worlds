/*
 * What breaking an Item actually costs it, and what a batch of consequences
 * means when they all describe one instant.
 *
 * Four failures this suite exists to keep fixed, and each of them made
 * integrity a number with no mechanical consequence.
 *
 * ZERO WAS NEGOTIABLE. `resolveIntegrityState()` took the first authored band
 * that matched, so a band claiming `{ state: "intact", minimum: 0 }` made a
 * broken Item report itself whole — and every gate downstream stayed open.
 * Bands narrow the range above zero; they do not relabel the bottom of it.
 *
 * BREAKING CHANGED NOTHING. An Item at zero still filled implement roles,
 * still contributed its attack and defense facts, could still be used, and
 * still applied its possessed and equipped Effects. "Broken" was a word in a
 * trace.
 *
 * THE BATCH WAS A SEQUENCE. The effect handler folded each request into a
 * running Character and re-resolved between them, so two stresses and a repair
 * on one sword came out differently depending on where the repair sat — and
 * the batch's order is the coordinator's `(kind, requestId)` sort, which makes
 * the answer depend on what the requests are CALLED.
 *
 * MITIGATION EVAPORATED. `itemIntegrityRequest()` took an operation carrying
 * `mitigation`, wrote `requested`, and dropped it; the handler then rebuilt a
 * bare stress. Every protection a caller offered survived exactly as far as
 * the function meant to carry it.
 */

import { afterEach, describe, expect, it } from "vitest";

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

import {
  clearCustomDefinitions,
  getDefinition,
  registerDefinition,
} from "../character/catalogs";

import {
  aggregateItemIntegrity,
  createCharacterIntegrityEffectHandler,
  findItemIntegrityIssues,
  findItemIntegrityOperationIssues,
  getItemDefinition,
  resolveEffectiveStress,
  resolveIntegrityState,
  resolveItemFunctionality,
  resolveItemIntegrityOperation,
  resolveItemPerformanceContribution,
  resolveSelectedImplements,
  collectItemEffectSources,
  itemIntegrityRequest,
  type ItemDefinition,
  type ItemIntegrityDefinition,
} from "../character/equipment/index";
import { resolveItemUse } from "../character/equipment/use";
import { getActiveItemEffects } from "../character/equipment/effects";
import type { ImplementResolution } from "../character/equipment/implements";
import type { CharacterItem } from "../character/equipment/index";

import { errorCodesOf, payloadOf } from "./fixtures/result";
import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";


afterEach(() => {
  clearCustomDefinitions();
});


const OPERATION: RuntimeOperationContext = { operationId: "op-1", occurredAt: 1_000 };

const DEX_BONUS = {
  type: "modifyCheck",
  check: { kind: "attribute", attribute: "dex" },
  amount: 3,
} as const;

const CURSE = {
  type: "modifyResolvedAttribute",
  attribute: "cha",
  amount: -1,
} as const;

const PLAIN_POLICY: ItemIntegrityDefinition = {
  maximum: 10,
  repairable: true,
  zeroBehavior: "broken",
};


function registerItem(id: string, fields: Record<string, unknown> = {}): ItemDefinition {
  const result = registerDefinition("item", {
    id,
    name: id,
    description: "A test Item registered for integrity behaviour.",
    inventoryMode: "individual",
    shuInteraction: "compatible",
    ...fields,
  } as never);

  if (!result.ok) throw new Error(result.reason);

  return getDefinition("item", id)!;
}


/** A durable weapon that does everything an Item can do. */
function registerSword(overrides: Record<string, unknown> = {}): ItemDefinition {
  return registerItem("sword", {
    families: ["blunt-weapon"],
    integrity: PLAIN_POLICY,
    attack: { effects: [DEX_BONUS] },
    defense: { effects: [DEX_BONUS] },
    possessedEffects: [CURSE],
    equippedEffects: [DEX_BONUS],
    consumesOnUse: false,
    useEffects: [DEX_BONUS],
    ...overrides,
  });
}


function entry(overrides: Partial<CharacterItem> = {}): CharacterItem {
  return { entryId: "e1", itemId: "sword", quantity: 1, state: "held", ...overrides };
}


function characterWith(items: readonly CharacterItem[]) {
  const character = createTestCharacter({ items });

  return { character, resolved: resolveTestCharacter(character) };
}


function characterState(character: unknown) {
  return { [ownerKey({ domain: "character", id: (character as { id: string }).id })]: character };
}


const CONSEQUENCE_PROFILE: ActionProfile = {
  id: "integrity-behaviour",
  source: { type: "improvised", id: "test" },
  allowedTimings: ["action"],
  structuredActionCost: { actions: 1 },
  targets: { cardinality: NO_TARGETS },
  permittedFocusKinds: ["none"],
  executionDuration: 0,
  threatens: "none",
};


function acceptedAdjudication(characterId: string): AdjudicatedAction {
  const proposal = payloadOf(prepareAction({
    operationId: OPERATION.operationId,
    profile: CONSEQUENCE_PROFILE,
    intent: {
      id: "intent-1",
      profileId: CONSEQUENCE_PROFILE.id,
      actor: { type: "character", id: characterId },
      targets: [],
      focus: NO_FOCUS,
      executionContext: UNSTRUCTURED_EXECUTION,
    },
    approach: "mechanical",
    eligibility: [],
  }));

  return payloadOf(adjudicateAction({
    operationId: OPERATION.operationId,
    proposal,
    approach: "mechanical",
    decision: { kind: "accept" },
  }));
}


function maceResolution(characterId: string, integrity?: number): ImplementResolution {
  return {
    role: "weapon",
    item: { characterId, entryId: "e1" },
    itemId: "sword",
    compatibility: "compatible",
    families: ["blunt-weapon"],
    state: "held",
    ...(integrity === undefined ? {} : { integrity }),
  };
}


/* -------------------------------------------------------------------------- */
/* 10. Malformed operations are refused                                       */
/* -------------------------------------------------------------------------- */

describe("an integrity operation is validated before it is applied", () => {
  it.each([
    ["an unknown discriminant", { type: "shatter", amount: 3 }],
    ["no discriminant at all", { amount: 3 }],
    ["a zero amount", { type: "stress", amount: 0 }],
    ["a negative stress", { type: "stress", amount: -4 }],
    ["a negative repair", { type: "repair", amount: -4 }],
    ["a NaN amount", { type: "stress", amount: Number.NaN }],
    ["an infinite amount", { type: "stress", amount: Number.POSITIVE_INFINITY }],
    ["a negative mitigation", { type: "stress", amount: 4, mitigation: -1 }],
    ["a NaN mitigation", { type: "stress", amount: 4, mitigation: Number.NaN }],
    ["mitigation on a repair", { type: "repair", amount: 4, mitigation: 1 }],
  ])("refuses %s", (_label, operation) => {
    expect(findItemIntegrityOperationIssues(operation)).not.toEqual([]);

    registerSword();

    const { character, resolved } = characterWith([entry({ integrity: 10 })]);

    const result = resolveItemIntegrityOperation(
      {
        resolved,
        item: { characterId: character.id, entryId: "e1" },
        operation: operation as never,
      },
      getItemDefinition,
    );

    expect(result.success).toBe(false);
    expect(character.items![0]!.integrity).toBe(10);
  });

  it("does not normalise a negative amount into a positive one", () => {
    /*
     * The specific silent reinterpretation `Math.abs()` used to perform.
     * "Repair -5" is a caller's sign error, and answering it with five points
     * of free maintenance is worse than refusing it.
     */
    registerSword();

    const { character, resolved } = characterWith([entry({ integrity: 4 })]);

    const result = resolveItemIntegrityOperation(
      {
        resolved,
        item: { characterId: character.id, entryId: "e1" },
        operation: { type: "repair", amount: -5 },
      },
      getItemDefinition,
    );

    expect(errorCodesOf(result))
      .toContain("equipment.integrity.operation.amount.invalid");
  });

  it("cannot bypass the repairability gate through a malformed discriminant", () => {
    /*
     * The other half of the same bug: an unknown discriminant fell through to
     * the repair branch, which meant it also skipped the check that branch
     * exists to run.
     */
    registerItem("relic", {
      integrity: { maximum: 10, repairable: false, zeroBehavior: "destroyed" },
    });

    const { character, resolved } = characterWith([
      entry({ itemId: "relic", integrity: 2 }),
    ]);

    const result = resolveItemIntegrityOperation(
      {
        resolved,
        item: { characterId: character.id, entryId: "e1" },
        operation: { type: "mend", amount: 5 } as never,
      },
      getItemDefinition,
    );

    expect(result.success).toBe(false);
  });

  it("still applies a well-formed stress and repair", () => {
    registerSword();

    const { character, resolved } = characterWith([entry({ integrity: 6 })]);

    for (const [operation, expected] of [
      [{ type: "stress", amount: 2 } as const, 4],
      [{ type: "repair", amount: 2 } as const, 8],
    ] as const) {
      const resolution = payloadOf(resolveItemIntegrityOperation(
        { resolved, item: { characterId: character.id, entryId: "e1" }, operation },
        getItemDefinition,
      ));

      expect(resolution.disposition).toBe("applied");
      expect(
        resolution.disposition === "applied" && resolution.change.integrityAfter,
      ).toBe(expected);
    }
  });
});


/* -------------------------------------------------------------------------- */
/* 11. Mitigation survives settlement and reduces effective stress            */
/* -------------------------------------------------------------------------- */

describe("mitigation is carried through settlement and honoured", () => {
  it("reduces effective stress observably in the resolved change", () => {
    registerSword();

    const { character, resolved } = characterWith([entry({ integrity: 10 })]);

    const resolution = payloadOf(resolveItemIntegrityOperation(
      {
        resolved,
        item: { characterId: character.id, entryId: "e1" },
        operation: { type: "stress", amount: 6, mitigation: 4 },
      },
      getItemDefinition,
    ));

    expect(resolution.disposition).toBe("applied");

    if (resolution.disposition !== "applied") return;

    /* max(0, 6 - 4) = 2, and every term of it is on the change. */
    expect(resolution.change.stress).toEqual({
      requested: 6,
      mitigated: 4,
      effective: 2,
    });

    expect(resolution.change.integrityAfter).toBe(8);
  });

  it("never reverses stress into a repair, however much is offered", () => {
    expect(resolveEffectiveStress("compatible", { amount: 3, mitigation: 100 }))
      .toEqual({ requested: 3, mitigated: 3, effective: 0 });
  });

  it("ignores mitigation offered to an incompatible Item", () => {
    /*
     * The boundary, honoured without calculating anything. A future whole-Item
     * enhancement never applies to an incompatible Item, so a caller passing
     * protection for one must not quietly reduce the damage.
     */
    registerItem("relic", {
      shuInteraction: "incompatible",
      integrity: PLAIN_POLICY,
    });

    const { character, resolved } = characterWith([
      entry({ itemId: "relic", integrity: 10 }),
    ]);

    const resolution = payloadOf(resolveItemIntegrityOperation(
      {
        resolved,
        item: { characterId: character.id, entryId: "e1" },
        operation: { type: "stress", amount: 6, mitigation: 4 },
      },
      getItemDefinition,
    ));

    expect(
      resolution.disposition === "applied" && resolution.change.integrityAfter,
    ).toBe(4);
  });

  it("is carried by the request builder, not dropped by it", () => {
    /*
     * `itemIntegrityRequest()` is the equipment-side builder, and it is where
     * mitigation used to die: it read the operation, wrote `requested`, and
     * discarded everything else, so the effect handler rebuilt a bare stress
     * from a request that had never carried the protection.
     */
    registerSword();

    const { character } = characterWith([entry({ integrity: 10 })]);

    const request = itemIntegrityRequest({
      requestId: "s1",
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      from: { domain: "character", id: character.id },
      to: { domain: "character", id: character.id },
      operation: { type: "stress", amount: 6, mitigation: 4 },
      entryId: "e1",
    });

    expect(request.mitigation).toBe(4);
    expect(request.requested).toBe(6);

    const batch = createCharacterIntegrityEffectHandler(getItemDefinition)
      .applyBatch([request], character);

    expect((batch.state as typeof character).items![0]!.integrity).toBe(8);
    expect(batch.outcomes[0]).toEqual({ requestId: "s1", requested: 6, actual: 2 });
  });

  it("survives the whole runtime path from consequence to settled state", () => {
    /*
     * The end-to-end claim, and the one the old code could not make: the
     * figure left the consequence builder and did not arrive anywhere.
     */
    registerSword();

    const { character } = characterWith([entry({ integrity: 10 })]);
    const context = {
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      from: { domain: "caller" as const, id: "gm" },
    };

    const outcome = payloadOf(settleAction({
      adjudicated: acceptedAdjudication(character.id),
      context: OPERATION,
      states: characterState(character),
      handlers: { costs: [], effects: [createCharacterIntegrityEffectHandler(getItemDefinition)] },
      consequences: [
        itemIntegrityConsequence(context, {
          requestId: "s1",
          characterId: character.id,
          entryId: "e1",
          operation: "stress",
          amount: 6,
          mitigation: 4,
        }),
      ],
    }));

    const settled = outcome.states[ownerKey({ domain: "character", id: character.id })] as typeof character;

    expect(settled.items![0]!.integrity).toBe(8);

    const event = outcome.events.find((candidate) => candidate.kind === "item-integrity-applied");

    expect(event).toBeDefined();
    expect((event as { readonly mitigated?: number }).mitigated).toBe(4);
  });
});


/* -------------------------------------------------------------------------- */
/* 12. Batch permutations produce identical results                           */
/* -------------------------------------------------------------------------- */

describe("a batch of integrity requests is simultaneous, not sequential", () => {
  function settleWith(
    requests: readonly {
      readonly requestId: string;
      readonly entryId: string;
      readonly operation: "stress" | "repair";
      readonly amount: number;
    }[],
    items: readonly CharacterItem[],
    reuse?: ReturnType<typeof createTestCharacter>,
  ) {
    const character = reuse ?? characterWith(items).character;
    const context = {
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      from: { domain: "caller" as const, id: "gm" },
    };

    const outcome = payloadOf(settleAction({
      adjudicated: acceptedAdjudication(character.id),
      context: OPERATION,
      states: characterState(character),
      handlers: { costs: [], effects: [createCharacterIntegrityEffectHandler(getItemDefinition)] },
      consequences: requests.map((request) =>
        itemIntegrityConsequence(context, { ...request, characterId: character.id })
      ),
    }));

    const settled = outcome.states[ownerKey({ domain: "character", id: character.id })] as typeof character;

    return {
      integrity: Object.fromEntries(
        (settled.items ?? []).map((item) => [item.entryId, item.integrity]),
      ),
      /*
       * The events too, because "the same result" has to include what was
       * REPORTED. A handler that reached one state by three different routes
       * and said so differently each time would still be order-dependent
       * everywhere a log, a UI or a replay can see.
       */
      events: outcome.events
        .filter((event) => event.kind === "item-integrity-applied")
        .map(({ sequence: _sequence, ...event }) => event),
    };
  }

  /* Every ordering of a list, so "independent of order" is not sampled. */
  function permutations<T>(values: readonly T[]): readonly (readonly T[])[] {
    if (values.length <= 1) return [values];

    return values.flatMap((value, index) =>
      permutations([...values.slice(0, index), ...values.slice(index + 1)])
        .map((rest) => [value, ...rest]),
    );
  }

  const BATCH = [
    { requestId: "a", entryId: "e1", operation: "stress" as const, amount: 6 },
    { requestId: "b", entryId: "e1", operation: "repair" as const, amount: 4 },
    { requestId: "c", entryId: "e1", operation: "stress" as const, amount: 3 },
  ];

  it("produces the same result for every permutation of one batch", () => {
    registerSword();

    /*
     * ONE character, every ordering. A fresh fixture per run would differ by
     * its random id alone, which is noise this comparison has no business
     * tolerating — the results must be identical, not merely equivalent.
     */
    const { character } = characterWith([entry({ integrity: 10 })]);

    const results = permutations(BATCH).map((order) =>
      settleWith(order, [], character)
    );

    expect(results).toHaveLength(6);

    for (const result of results) {
      expect(result).toEqual(results[0]);
    }
  });

  it("combines stress and repair algebraically from the pre-batch figure", () => {
    /*
     * 10 - 6 - 3 + 4 = 5. Sequentially, the same three requests could reach 0
     * (both stresses first, clamped) and then 4, which is a different Item.
     */
    registerSword();

    expect(settleWith(BATCH, [entry({ integrity: 10 })]).integrity["e1"]).toBe(5);
  });

  it("determines zero behaviour from the FINAL aggregate, not from a midpoint", () => {
    registerSword();

    /* 4 - 6 + 5 = 3: never actually broken, though a sequence would break it. */
    const result = settleWith(
      [
        { requestId: "a", entryId: "e1", operation: "stress", amount: 6 },
        { requestId: "b", entryId: "e1", operation: "repair", amount: 5 },
      ],
      [entry({ integrity: 4 })],
    );

    expect(result.integrity["e1"]).toBe(3);
  });

  it("does not let an entry already destroyed be repaired", () => {
    registerItem("relic", {
      integrity: { maximum: 10, repairable: true, zeroBehavior: "destroyed" },
    });

    const result = settleWith(
      [{ requestId: "a", entryId: "e1", operation: "repair", amount: 5 }],
      [entry({ itemId: "relic", integrity: 0 })],
    );

    expect(result.integrity["e1"]).toBe(0);
  });

  it("lets an authored contract permit restoration after all", () => {
    registerItem("phoenix-blade", {
      integrity: {
        maximum: 10,
        repairable: true,
        zeroBehavior: "destroyed",
        restorableWhenDestroyed: true,
      },
    });

    const result = settleWith(
      [{ requestId: "a", entryId: "e1", operation: "repair", amount: 5 }],
      [entry({ itemId: "phoenix-blade", integrity: 0 })],
    );

    expect(result.integrity["e1"]).toBe(5);
  });

  it("settles two entries independently in one batch", () => {
    registerSword();
    registerItem("shield", { integrity: PLAIN_POLICY });

    const result = settleWith(
      [
        { requestId: "a", entryId: "e1", operation: "stress", amount: 3 },
        { requestId: "b", entryId: "e2", operation: "stress", amount: 7 },
      ],
      [entry({ integrity: 10 }), entry({ entryId: "e2", itemId: "shield", integrity: 10 })],
    );

    expect(result.integrity).toEqual({ e1: 7, e2: 3 });
  });

  it("apportions the clamp proportionally rather than by position", () => {
    /*
     * Two stresses of 6 and 3 against an Item at 4. Only 4 of the 9 can land,
     * and each request is reported with its own share of that — never "the
     * first one used it all up", which is the ordering coming back in through
     * the reporting.
     */
    const aggregate = aggregateItemIntegrity(PLAIN_POLICY, 4, { stress: 9, repair: 0 });

    expect(aggregate.integrityAfter).toBe(0);
    expect(aggregate.honouredStress).toBe(4);
    expect(aggregate.stateAfter).toBe("broken");
  });
});


/* -------------------------------------------------------------------------- */
/* 13. Zero overrides bands; malformed and overlapping bands are refused      */
/* -------------------------------------------------------------------------- */

describe("zero integrity is authoritative and bands are a partition", () => {
  it("resolves zero to zeroBehavior even when a band claims it is intact", () => {
    const lying: ItemIntegrityDefinition = {
      maximum: 10,
      repairable: true,
      zeroBehavior: "broken",
      bands: [{ state: "intact", minimum: 0, maximum: 10 }],
    };

    expect(resolveIntegrityState(lying, 0)).toBe("broken");
    expect(resolveIntegrityState(lying, 5)).toBe("intact");
  });

  it("resolves zero to \"destroyed\" when that is what the Item declares", () => {
    const terminal: ItemIntegrityDefinition = {
      maximum: 10,
      repairable: true,
      zeroBehavior: "destroyed",
      bands: [{ state: "degraded", minimum: 0, maximum: 4 }],
    };

    expect(resolveIntegrityState(terminal, 0)).toBe("destroyed");
    expect(resolveIntegrityState(terminal, 4)).toBe("degraded");
  });

  it("refuses overlapping bands", () => {
    const overlapping = {
      maximum: 10,
      repairable: true,
      zeroBehavior: "broken",
      bands: [
        { state: "intact", minimum: 5, maximum: 10 },
        { state: "degraded", minimum: 1, maximum: 6 },
      ],
    };

    expect(findItemIntegrityIssues(overlapping).map((issue) => issue.code))
      .toContain("equipment.integrity.bands.overlap");

    expect(registerDefinition("item", {
      id: "overlapper",
      name: "Overlapper",
      description: "An Item whose bands claim the same integrity twice.",
      inventoryMode: "individual",
      shuInteraction: "compatible",
      integrity: overlapping,
    } as never).ok).toBe(false);
  });

  it("refuses a band reaching past the Item's own maximum", () => {
    expect(findItemIntegrityIssues({
      maximum: 10,
      repairable: true,
      zeroBehavior: "broken",
      bands: [{ state: "intact", minimum: 0, maximum: 40 }],
    }).map((issue) => issue.code))
      .toContain("equipment.integrity.band.out-of-range");
  });

  it("refuses a band beginning below zero, and a repeated state", () => {
    expect(findItemIntegrityIssues({
      maximum: 10,
      repairable: true,
      zeroBehavior: "broken",
      bands: [{ state: "intact", minimum: -3, maximum: 10 }],
    }).map((issue) => issue.code))
      .toContain("equipment.integrity.band.minimum.negative");

    expect(findItemIntegrityIssues({
      maximum: 10,
      repairable: true,
      zeroBehavior: "broken",
      bands: [
        { state: "degraded", minimum: 1, maximum: 4 },
        { state: "degraded", minimum: 5, maximum: 10 },
      ],
    }).map((issue) => issue.code))
      .toContain("equipment.integrity.band.state.duplicate");
  });

  it("derives the same state whichever order the bands were authored in", () => {
    const ascending: ItemIntegrityDefinition = {
      maximum: 10,
      repairable: true,
      zeroBehavior: "broken",
      bands: [
        { state: "degraded", minimum: 1, maximum: 5 },
        { state: "intact", minimum: 6, maximum: 10 },
      ],
    };

    const descending: ItemIntegrityDefinition = {
      ...ascending,
      bands: [...ascending.bands!].reverse(),
    };

    for (const figure of [0, 1, 5, 6, 10]) {
      expect(resolveIntegrityState(ascending, figure))
        .toBe(resolveIntegrityState(descending, figure));
    }
  });
});


/* -------------------------------------------------------------------------- */
/* 14-16. What a broken Item can and cannot do                                */
/* -------------------------------------------------------------------------- */

describe("a broken Item stops contributing unless its contract says otherwise", () => {
  it("answers every channel at once, from one place", () => {
    registerSword();

    const definition = getItemDefinition("sword")!;

    expect(resolveItemFunctionality(definition, 10)).toMatchObject({
      state: "intact",
      broken: false,
      selectableAsImplement: true,
      attackAvailable: true,
      defenseAvailable: true,
      useAvailable: true,
      possessedEffectsApply: true,
      equippedEffectsApply: true,
    });

    expect(resolveItemFunctionality(definition, 0)).toMatchObject({
      state: "broken",
      broken: true,
      selectableAsImplement: false,
      attackAvailable: false,
      defenseAvailable: false,
      useAvailable: false,
      possessedEffectsApply: false,
      equippedEffectsApply: false,
    });
  });

  it("treats an Item with no integrity policy as fully functional", () => {
    /*
     * "Declares no integrity" must never come to mean "is permanently
     * broken". Most Items in an inventory are in exactly this case.
     */
    const plain = registerItem("rope");

    expect(resolveItemFunctionality(plain, undefined).broken).toBe(false);
    expect(resolveItemFunctionality(plain, undefined).useAvailable).toBe(true);
  });

  it("fills no implement role once broken", () => {
    registerSword();

    const { character, resolved } = characterWith([entry({ integrity: 0 })]);

    const selection = payloadOf(resolveSelectedImplements(
      {
        resolved,
        requirements: [{
          role: "weapon",
          minimum: 1,
          maximum: 1,
          acceptedFamilies: ["blunt-weapon"],
          allowImprovised: true,
        }],
        selections: [{ role: "weapon", item: { characterId: character.id, entryId: "e1" } }],
      },
      getItemDefinition,
    ));

    expect(selection.resolutions).toEqual([]);
    expect(selection.issues.map((issue) => issue.kind)).toContain("broken");
  });

  it("contributes no attack and no defense once broken", () => {
    registerSword();

    const { character } = characterWith([entry({ integrity: 0 })]);

    const contribution = payloadOf(resolveItemPerformanceContribution(
      maceResolution(character.id, 0),
      getItemDefinition,
    ));

    expect(contribution.attack).toBeUndefined();
    expect(contribution.defense).toBeUndefined();
    expect(contribution.integrity?.state).toBe("broken");
  });

  it("cannot be used once broken", () => {
    registerSword();

    const { character, resolved } = characterWith([entry({ integrity: 0 })]);

    const resolution = payloadOf(resolveItemUse(
      { resolved, item: { characterId: character.id, entryId: "e1" } },
      getItemDefinition,
    ));

    expect(resolution.disposition).toBe("broken");
  });

  it("applies no possessed or equipped Effects once broken", () => {
    registerSword();

    const definition = getItemDefinition("sword")!;

    expect(getActiveItemEffects(definition, entry({ integrity: 10 })))
      .toEqual([CURSE, DEX_BONUS]);

    expect(getActiveItemEffects(definition, entry({ integrity: 0 }))).toEqual([]);
  });

  it("keeps an explicitly persistent channel through breakage", () => {
    /*
     * AUTHORED, never inferred. This curse survives because the Item says so —
     * not because the amount is negative. The equipped bonus beside it stops,
     * which is what makes the distinction visible.
     */
    registerSword({
      integrity: {
        ...PLAIN_POLICY,
        brokenBehavior: { persistentEffects: ["possessed"] },
      },
    });

    const definition = getItemDefinition("sword")!;

    expect(getActiveItemEffects(definition, entry({ integrity: 0 }))).toEqual([CURSE]);
  });

  it("keeps an explicitly permitted attack through breakage", () => {
    registerSword({
      integrity: { ...PLAIN_POLICY, brokenBehavior: { attackAvailable: true } },
    });

    const { character } = characterWith([entry({ integrity: 0 })]);

    const contribution = payloadOf(resolveItemPerformanceContribution(
      maceResolution(character.id, 0),
      getItemDefinition,
    ));

    expect(contribution.attack).toBeDefined();
    expect(contribution.defense).toBeUndefined();
  });

  it("does not infer persistence from an Effect being a penalty", () => {
    /*
     * The rule stated as a negative, because the tempting implementation is
     * exactly the one that reads intent off a sign. `CURSE` is a penalty and a
     * default-behaviour broken Item drops it, same as the bonus.
     */
    registerSword();

    expect(getActiveItemEffects(getItemDefinition("sword")!, entry({ integrity: 0 })))
      .toEqual([]);
  });

  it("stops contributing through the character's own effect collection", () => {
    registerSword();

    expect(collectItemEffectSources([entry({ integrity: 10 })])).toHaveLength(1);
    expect(collectItemEffectSources([entry({ integrity: 0 })])).toEqual([]);
  });
});


/* -------------------------------------------------------------------------- */
/* 14. Snapshot timing: the action that breaks it still gets the Item         */
/* -------------------------------------------------------------------------- */

describe("an Item contributes to the action that breaks it, and not to the next", () => {
  it("resolves the contribution before the consequence settles, and not after", () => {
    registerSword();

    const { character } = characterWith([entry({ integrity: 3 })]);

    /*
     * The attack is resolved from the entry as it stands — integrity 3, a
     * working sword — and the stress that breaks it is a CONSEQUENCE, settled
     * afterwards. Both facts are true of the same action, in that order.
     */
    const during = payloadOf(resolveItemPerformanceContribution(
      maceResolution(character.id, 3),
      getItemDefinition,
    ));

    expect(during.attack).toBeDefined();
    expect(during.integrity?.state).toBe("intact");

    const context = {
      operationId: OPERATION.operationId,
      occurredAt: OPERATION.occurredAt,
      from: { domain: "caller" as const, id: "gm" },
    };

    const outcome = payloadOf(settleAction({
      adjudicated: acceptedAdjudication(character.id),
      context: OPERATION,
      states: characterState(character),
      handlers: { costs: [], effects: [createCharacterIntegrityEffectHandler(getItemDefinition)] },
      consequences: [
        itemIntegrityConsequence(context, {
          requestId: "s1",
          characterId: character.id,
          entryId: "e1",
          operation: "stress",
          amount: 5,
        }),
      ],
    }));

    const settled = outcome.states[ownerKey({ domain: "character", id: character.id })] as typeof character;

    expect(settled.items![0]!.integrity).toBe(0);

    /* The NEXT action sees the broken sword. */
    const after = payloadOf(resolveItemPerformanceContribution(
      maceResolution(character.id, settled.items![0]!.integrity),
      getItemDefinition,
    ));

    expect(after.attack).toBeUndefined();
    expect(after.integrity?.state).toBe("broken");

    /* And the stress that caused it did not unwind the action. */
    expect(outcome.events.some((event) => event.kind === "item-integrity-applied")).toBe(true);
  });
});
