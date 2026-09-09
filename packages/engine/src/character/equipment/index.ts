/*
 * The Item catalog, and what a character's inventory contributes.
 *
 * Items are ordinary data-driven content: what makes an Item mechanical is
 * the Effects it declares, in exactly the vocabulary a Trait or a Condition
 * uses. That is why an Item needs no equipment-specific modifier path — the
 * difference between a Trait and an Item is when the Effects apply, not what
 * they are allowed to be.
 *
 *
 * KNOWN: THE WEIGHTED GAUNTLETS HAVE NO CORRECT HOME YET
 *
 * The Weighted Gauntlets below declare `modifyResolvedAttribute` on "str".
 * That is valid today and will not be: Strength stops being a stored Attribute
 * and becomes derived from Body, so there is no stored `str` for an Effect to
 * modify.
 *
 * The obvious replacement is wrong too. Body's design is explicit that
 * equipment leverage does NOT alter Intrinsic Max SP — "Situational Skills,
 * Techniques, maneuvers, equipment leverage, and action bonuses do not alter
 * Intrinsic Max SP. They apply later, to action resolution" — and folding
 * gauntlets in at that level would make a character permanently stronger for
 * holding a lever.
 *
 * So this Item is waiting on one of two things: a resolved-only Body effect
 * (defensible, since the weight really is on the body while worn), or the
 * action-resolution layer that does not exist yet. It is left as-is and
 * flagged rather than quietly re-pointed at the nearest Effect that compiles.
 *
 * Equipment slots, encumbrance and body integration are deliberately absent.
 * Nothing in the rules layer needs them to resolve an Item, and inventing a
 * slot model before the Body system asks for one would fix the answer to a
 * question nobody has posed.
 *
 * See types.ts for the Item shape and for which Effects apply when.
 */

import {
  contributesNothing,
  sourceContributions,
} from "../rules/content";
import { createRegistry } from "../../infrastructure/registry";

import type { RuleEffectSource } from "../rules/resolution";

import {
  findInventoryEntryIssues,
  isInventoryQuantity,
  isValidInventoryEntry,
  type ItemValidationIssue,
} from "./validation";

import {
  createInventoryItemRef,
  findInventoryEntry,
  isInventoryEntryId,
  isInventoryItemRef,
  resolveInventoryItemRef,
  type InventoryEntryId,
  type InventoryEntryResolution,
  type InventoryItemRef,
  type InventoryReferenceIssue,
} from "./references";

import {
  ITEM_EQUIPMENT_STATES,
  isConcreteInventoryObject,
  isEquippedItemState,
  isItemEquipmentState,
  type ItemEquipmentState,
} from "./state";

import { getActiveItemEffects, type CharacterItem, type ItemDefinition } from "./types";

export type ItemId = string;

export const ITEM_DEFINITIONS = {
  /*
   * One authored Item per kind of timing, so the three paths through
   * getActiveItemEffects are exercised by real content rather than only by
   * tests.
   */
  gauntlets: {
    id: "gauntlets",
    name: "Reinforced Gauntlets",
    description: "Weighted gauntlets that lend force to a blow when worn.",
    /*
     * Deliberately effect-less, and this is the honest answer rather than a
     * placeholder.
     *
     * These declared modifyResolvedAttribute on "str", which stopped being
     * expressible the moment Strength became derived from the body — there is
     * no stored str for an Effect to modify.
     *
     * The obvious replacement is also wrong. Body's design is explicit that
     * "situational Skills, Techniques, maneuvers, EQUIPMENT LEVERAGE, and
     * action bonuses do not alter Intrinsic Max SP; they apply later, to
     * action resolution" — so modifyResolvedIntrinsicPhysicalForce would make
     * a character permanently stronger for wearing gloves, which is the exact
     * thing that rule exists to prevent.
     *
     * The correct home turns out to already exist. A modifyCheck effect IS an
     * action-resolution bonus: it adds to the modifier of a kind of check
     * without touching any score, which is exactly what "applies later, to
     * action resolution" describes. Gauntlets make blows land harder while
     * worn and make the wearer no stronger the moment they come off, and that
     * is a situational modifier rather than a physical fact about the body.
     */
    equippedEffects: [
      {
        type: "modifyCheck",
        check: { kind: "derivedAttribute", derivedAttribute: "combatAbility" },
        amount: 2,
      },
    ],
  },

  "cursed-idol": {
    id: "cursed-idol",
    name: "Cursed Idol",
    description:
      "A small carved figure that unsettles everyone near whoever carries it.",
    possessedEffects: [
      {
        type: "modifyResolvedAttribute",
        attribute: "cha",
        amount: -1,
      },
    ],
  },
} as const satisfies Record<string, ItemDefinition>;

const ITEM_REGISTRY = createRegistry<ItemDefinition>("Item", ITEM_DEFINITIONS);

export type KnownItemId = keyof typeof ITEM_DEFINITIONS;

export function isKnownItemId(itemId: ItemId): boolean {
  return ITEM_REGISTRY.isKnownId(itemId);
}

export function getItemDefinition(
  itemId: ItemId,
): ItemDefinition | undefined {
  return ITEM_REGISTRY.get(itemId);
}

/**
 * The Effect sources contributed by a character's inventory.
 *
 * Possessed Effects apply to anything owned; equipped Effects apply on top
 * for what is worn. Use Effects are events and are not collected here — they
 * happen when a player uses the Item, not because it is in a bag.
 */
export function collectItemEffectSources(
  items: readonly CharacterItem[] = [],
): readonly RuleEffectSource[] {
  const sources: RuleEffectSource[] = [];

  for (const item of items) {
    const definition = getItemDefinition(item.itemId);

    if (definition === undefined) continue;

    const effects = getActiveItemEffects(definition, item);

    if (contributesNothing(definition, effects)) continue;

    sources.push({
      /*
       * BOTH facts, not one. The definition id is what a requirement asks
       * about and what a player recognises; the entry id is which of the two
       * gauntlets this particular +2 came from. Replacing the first with the
       * second would make `hasItem` unanswerable and every trace unreadable;
       * omitting the second makes two owned objects one indistinguishable
       * source, which anything deduplicating by provenance would collapse.
       */
      source: {
        type: "item",
        id: item.itemId,
        instanceId: item.entryId,
      },
      effects,
      ...sourceContributions(definition),
    });
  }

  return sources;
}

/**
 * The ids an Item requirement is tested against.
 *
 * DEFINITION ids, deliberately, and never entry ids. A requirement asks
 * whether the character has a rope, not whether they have that rope, so
 * feeding it entry identities would make every authored `hasItem` unsatisfiable
 * — the requirement names something from the catalog and an entry id names
 * something on one sheet.
 *
 * Which is also why repeats are collapsed. Two swords answer "do you have a
 * sword" exactly as loudly as one does, so the second occurrence carries no
 * information the question can use, and leaving it in would invite a later
 * reader to start counting a list that was never a count.
 *
 * An emptied entry contributes to neither list: a quiver with no arrows is not
 * possession of an arrow.
 */
export function collectItemState(
  items: readonly CharacterItem[] = [],
): { readonly possessed: readonly string[]; readonly equipped: readonly string[] } {
  const possessed = new Set<string>();
  const equipped = new Set<string>();

  for (const item of items) {
    if (item.quantity <= 0) continue;

    possessed.add(item.itemId);

    if (isEquippedItemState(item.state)) equipped.add(item.itemId);
  }

  return { possessed: [...possessed], equipped: [...equipped] };
}

/**
 * Every problem in a character's inventory, against the authored catalog.
 *
 * The rules live in equipment/validation.ts and take the catalog as an
 * argument; this is the binding that supplies the engine's own. See that file
 * for why the dependency points this way.
 */
export function findItemValidationIssues(
  items: readonly CharacterItem[] | undefined,
): readonly ItemValidationIssue[] {
  return findInventoryEntryIssues(items, isKnownItemId);
}


/** Whether one entry is sound against the authored catalog. */
export function isValidCharacterItem(value: unknown): value is CharacterItem {
  return isValidInventoryEntry(value, isKnownItemId);
}

export function findItemCatalogIssues(): readonly string[] {
  return ITEM_REGISTRY.findCatalogIssues();
}

// Exposed for the catalog index, which needs every registry in one map.
export const itemRegistry = ITEM_REGISTRY;

/* ── The public inventory contracts ─────────────────────────────────────── */

export type {
  CharacterItem,
  ItemDefinition,
  ItemEquipmentState,
  ItemValidationIssue,
  InventoryEntryId,
  InventoryEntryResolution,
  InventoryItemRef,
  InventoryReferenceIssue,
};

export {
  ITEM_EQUIPMENT_STATES,
  createInventoryItemRef,
  findInventoryEntry,
  getActiveItemEffects,
  isConcreteInventoryObject,
  isEquippedItemState,
  isInventoryEntryId,
  isInventoryItemRef,
  isInventoryQuantity,
  isItemEquipmentState,
  resolveInventoryItemRef,
};
