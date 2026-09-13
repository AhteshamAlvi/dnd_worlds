/*
 * The whole-Item Shū boundary: one identity, one verdict, every surface.
 *
 * `shuInteraction` has been required on `ItemDefinition` since Ticket 4.6, and
 * everything downstream read the verdict from wherever it happened to be
 * handed one — which is not the same as reading it from the Item. A caller
 * holding a reference and a compatibility string could describe an Item that
 * does not exist, and nothing between there and a resolver could tell.
 *
 * Three properties.
 *
 * THE ITEM SAYS. `resolveItemEnvelope()` reads the entry, follows its own
 * `itemId` to the definition, validates it, and takes the verdict from there.
 * A caller chooses which entry; it does not get to say what that entry is.
 *
 * BINARY, AND FOR EVERYTHING THE ITEM OWNS. Attack and defense facts,
 * possessed, equipped, use and integrity-band Effects — positive and negative
 * alike, because a cursed blade's penalty is still something the Item does.
 * There are no enhancement channels; architecture.test.ts refuses a
 * per-channel compatibility field by name.
 *
 * AND NOTHING THE CHARACTER OWNS. A matched implement-conditional rule keeps
 * its Trait, Technique or Skill source precisely so a future enhancement can
 * reinforce the sword without also reinforcing the swordsman.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  clearCustomDefinitions,
  registerDefinition,
} from "../character/catalogs";

import {
  ITEM_OWNED_SURFACES,
  envelopeIsItemOwned,
  getItemDefinition,
  resolveItemEnvelope,
  resolveItemPerformanceContribution,
  type ItemDefinition,
} from "../character/equipment/index";
import {
  characterContentCatalogs,
  collectImplementConditionalRules,
} from "../character/capabilities/implement-rules";
import { resolveItemUse } from "../character/equipment/use";
import type { ImplementResolution } from "../character/equipment/implements";
import type { CharacterItem } from "../character/equipment/index";

import { errorCodesOf, payloadOf } from "./fixtures/result";
import { createTestCharacter, resolveTestCharacter } from "./fixtures/character";


afterEach(() => {
  clearCustomDefinitions();
});


const ATTACK_BONUS = {
  type: "modifyCheck",
  check: { kind: "attribute", attribute: "dex" },
  amount: 3,
} as const;

const DEFENSE_BONUS = {
  type: "modifyCheck",
  check: { kind: "attribute", attribute: "agi" },
  amount: 2,
} as const;

const CURSE = {
  type: "modifyResolvedAttribute",
  attribute: "cha",
  amount: -2,
} as const;

const WORN_BONUS = {
  type: "modifyResolvedAttribute",
  attribute: "wis",
  amount: 1,
} as const;

const USE_EFFECT = {
  type: "modifyResolvedAttribute",
  attribute: "vit",
  amount: 1,
} as const;

const CHIPPED_PENALTY = {
  type: "modifyCheck",
  check: { kind: "attribute", attribute: "dex" },
  amount: -1,
} as const;


/** An Item that declares every Item-owned surface at once, good and bad. */
function registerEverything(
  id = "cursed-blade",
  overrides: Record<string, unknown> = {},
): ItemDefinition {
  const result = registerDefinition("item", {
    id,
    name: "Cursed Blade",
    description: "An Item declaring every surface a future enhancement could reach.",
    inventoryMode: "individual",
    shuInteraction: "compatible",
    families: ["blunt-weapon"],
    attack: { effects: [ATTACK_BONUS] },
    defense: { effects: [DEFENSE_BONUS] },
    possessedEffects: [CURSE],
    equippedEffects: [WORN_BONUS],
    useEffects: [USE_EFFECT],
    consumesOnUse: true,
    integrity: {
      maximum: 10,
      repairable: true,
      zeroBehavior: "broken",
      bands: [
        { state: "intact", minimum: 6, maximum: 10 },
        { state: "degraded", minimum: 1, maximum: 5, effects: [CHIPPED_PENALTY] },
      ],
    },
    ...overrides,
  } as never);

  if (!result.ok) throw new Error(result.reason);

  return getItemDefinition(id)!;
}


function entry(overrides: Partial<CharacterItem> = {}): CharacterItem {
  return {
    entryId: "e1",
    itemId: "cursed-blade",
    quantity: 1,
    state: "held",
    ...overrides,
  };
}


function characterWith(items: readonly CharacterItem[]) {
  const character = createTestCharacter({ items });

  return { character, resolved: resolveTestCharacter(character) };
}


/* -------------------------------------------------------------------------- */
/* 17. The verdict comes from the Item, and covers every surface it owns     */
/* -------------------------------------------------------------------------- */

describe("Shū compatibility is the Item's, and covers everything the Item owns", () => {
  it("reads the verdict from the definition the entry names", () => {
    registerEverything();

    const { character } = characterWith([entry()]);

    const envelope = payloadOf(resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "e1" },
      character.items,
      getItemDefinition,
    ));

    expect(envelope.definitionId).toBe("cursed-blade");
    expect(envelope.item).toEqual({ characterId: character.id, entryId: "e1" });
    expect(envelope.shuInteraction).toBe("compatible");
  });

  it("cannot be made compatible by a caller argument", () => {
    /*
     * There is no argument to make it with, and that is the fix. The envelope
     * takes a REFERENCE; the verdict arrives from the catalog behind it.
     */
    registerEverything("stubborn-idol", { shuInteraction: "incompatible" });

    const { character } = characterWith([entry({ itemId: "stubborn-idol" })]);

    const envelope = payloadOf(resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "e1" },
      character.items,
      getItemDefinition,
    ));

    expect(envelope.shuInteraction).toBe("incompatible");
  });

  it("carries every Item-owned surface, positive and negative alike", () => {
    registerEverything();

    const { character } = characterWith([entry({ integrity: 3 })]);

    const envelope = payloadOf(resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "e1" },
      character.items,
      getItemDefinition,
    ));

    /* Physical performance, both directions. */
    expect(envelope.attack.flatMap((c) => c.effects.map((e) => e.effect)))
      .toEqual([ATTACK_BONUS]);
    expect(envelope.defense.flatMap((c) => c.effects.map((e) => e.effect)))
      .toEqual([DEFENSE_BONUS]);

    /* Passive, active, and durability — including the NEGATIVE curse. */
    expect(envelope.possessedEffects.map((e) => e.effect)).toEqual([CURSE]);
    expect(envelope.equippedEffects.map((e) => e.effect)).toEqual([WORN_BONUS]);
    expect(envelope.useEffects.map((e) => e.effect)).toEqual([USE_EFFECT]);
    expect(envelope.integrityEffects.map((e) => e.effect)).toEqual([CHIPPED_PENALTY]);

    expect(envelope.integrityState).toBe("degraded");
  });

  it("names every surface exactly once, so none can be quietly dropped", () => {
    registerEverything();

    const { character } = characterWith([entry()]);

    const envelope = payloadOf(resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "e1" },
      character.items,
      getItemDefinition,
    ));

    for (const surface of ITEM_OWNED_SURFACES) {
      expect(envelope).toHaveProperty(surface);
    }

    expect(new Set(ITEM_OWNED_SURFACES).size).toBe(ITEM_OWNED_SURFACES.length);
  });

  it("refuses an entry, a definition or a shape it cannot vouch for", () => {
    registerEverything();

    const { character } = characterWith([entry()]);

    expect(errorCodesOf(resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "gone" },
      character.items,
      getItemDefinition,
    ))).toContain("equipment.envelope.unknown_entry");

    expect(errorCodesOf(resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "e1" },
      character.items,
      () => undefined,
    ))).toContain("equipment.envelope.item_unknown");

    expect(errorCodesOf(resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "e1" },
      character.items,
      () => ({
        ...getItemDefinition("cursed-blade")!,
        shuInteraction: "sometimes",
      }) as unknown as ItemDefinition,
    ))).toContain("equipment.envelope.definition_invalid");
  });

  it("keeps a consumed Item's snapshot through the action that consumes it", () => {
    /*
     * A grenade is gone the instant it is used, and whatever a future
     * enhancement did to it has to survive the action it went off in. The
     * envelope on an executed use is taken BEFORE the decrement and travels
     * with the result, so nothing downstream has to re-resolve an entry whose
     * quantity has since changed.
     */
    registerEverything();

    const { character, resolved } = characterWith([entry()]);

    const resolution = payloadOf(resolveItemUse(
      { resolved, item: { characterId: character.id, entryId: "e1" } },
      getItemDefinition,
    ));

    expect(resolution.disposition).toBe("executed");

    if (resolution.disposition !== "executed") return;

    expect(resolution.use.consumed).toBe(1);
    expect(resolution.use.quantityAfter).toBe(0);

    /* Gone, and still fully described. */
    expect(resolution.envelope.definitionId).toBe("cursed-blade");
    expect(resolution.envelope.shuInteraction).toBe("compatible");
    expect(resolution.envelope.useEffects.map((e) => e.effect)).toEqual([USE_EFFECT]);
    expect(resolution.envelope.attack).toHaveLength(1);
  });
});


/* -------------------------------------------------------------------------- */
/* 18. Character-sourced bonuses stay outside the envelope                   */
/* -------------------------------------------------------------------------- */

describe("what the character contributed stays outside the Item's envelope", () => {
  const TRAIT_RULE = {
    id: "practised-swing",
    condition: { familyIds: ["blunt-weapon"] },
    output: {
      kind: "performance",
      slot: "attack",
      effects: [{ type: "modifyCheck", check: { kind: "attribute", attribute: "dex" }, amount: 5 }],
    },
  } as const;

  it("holds only Item-sourced Effects, by construction", () => {
    registerEverything();

    const { character } = characterWith([entry({ integrity: 3 })]);

    const envelope = payloadOf(resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "e1" },
      character.items,
      getItemDefinition,
    ));

    expect(envelopeIsItemOwned(envelope)).toBe(true);

    const sources = [
      ...envelope.possessedEffects,
      ...envelope.equippedEffects,
      ...envelope.useEffects,
      ...envelope.integrityEffects,
      ...envelope.attack.flatMap((c) => c.effects),
      ...envelope.defense.flatMap((c) => c.effects),
    ].map((entry_) => entry_.source);

    expect(sources.every((source) => source.type === "item")).toBe(true);
    expect(new Set(sources.map((source) => source.id))).toEqual(new Set(["cursed-blade"]));
    expect(new Set(sources.map((source) => source.instanceId))).toEqual(new Set(["e1"]));
  });

  it("excludes a Trait's matched performance bonus, which the contribution still carries", () => {
    /*
     * The two live side by side and stay distinguishable. The Trait's +5
     * belongs to the character and appears in the resolved CONTRIBUTION; the
     * envelope — what a future enhancement would reinforce — has only the
     * Item's own +3.
     */
    registerEverything();

    const trait = registerDefinition("trait", {
      id: "practised",
      name: "Practised",
      description: "A Trait that improves a blunt weapon's swing.",
      implementConditionalRules: [TRAIT_RULE],
    } as never);

    expect(trait.ok).toBe(true);

    const character = createTestCharacter({
      traits: [{ traitId: "practised" }],
      items: [entry()],
    });

    const collected = payloadOf(collectImplementConditionalRules(
      character,
      undefined,
      characterContentCatalogs(),
    ));

    const resolution: ImplementResolution = {
      role: "weapon",
      item: { characterId: character.id, entryId: "e1" },
      itemId: "cursed-blade",
      compatibility: "compatible",
      families: ["blunt-weapon"],
      state: "held",
    };

    const contribution = payloadOf(resolveItemPerformanceContribution(
      resolution,
      getItemDefinition,
      collected,
    ));

    const contributionSources = (contribution.attack?.effects.effects ?? [])
      .map((effect) => effect.source.type);

    expect(contributionSources).toEqual(["item", "trait"]);

    const envelope = payloadOf(resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "e1" },
      character.items,
      getItemDefinition,
    ));

    expect(envelopeIsItemOwned(envelope)).toBe(true);
    expect(envelope.attack.flatMap((c) => c.effects.map((e) => e.effect)))
      .toEqual([ATTACK_BONUS]);
  });

  it("would notice a character-sourced Effect smuggled into an envelope", () => {
    /*
     * The control for the invariant above. `envelopeIsItemOwned()` has to be
     * capable of returning false, or asserting it proves nothing.
     */
    registerEverything();

    const { character } = characterWith([entry()]);

    const envelope = payloadOf(resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "e1" },
      character.items,
      getItemDefinition,
    ));

    expect(envelopeIsItemOwned({
      ...envelope,
      possessedEffects: [
        ...envelope.possessedEffects,
        { source: { type: "trait", id: "practised" }, effect: CURSE },
      ],
    })).toBe(false);
  });
});
