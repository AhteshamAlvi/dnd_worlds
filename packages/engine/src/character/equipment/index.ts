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

import { createRegistry, scanReferences } from "../../infrastructure/registry";

import type { RuleEffectSource } from "../rules/resolution";

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
    equippedEffects: [
      {
        type: "modifyResolvedAttribute",
        attribute: "str",
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

    if (effects.length === 0) continue;

    sources.push({
      source: { type: "item", id: item.itemId },
      effects,
    });
  }

  return sources;
}

/** The ids an Item requirement is tested against. */
export function collectItemState(
  items: readonly CharacterItem[] = [],
): { readonly possessed: readonly string[]; readonly equipped: readonly string[] } {
  const possessed: string[] = [];
  const equipped: string[] = [];

  for (const item of items) {
    if (item.quantity <= 0) continue;

    possessed.push(item.itemId);

    if (item.equipped) equipped.push(item.itemId);
  }

  return { possessed, equipped };
}

export type ItemValidationIssue =
  | {
      readonly type: "unknown-item";
      readonly itemId: ItemId;
    }
  | {
      readonly type: "duplicate-item";
      readonly itemId: ItemId;
    }
  | {
      readonly type: "invalid-item-quantity";
      readonly itemId: ItemId;
      readonly quantity: number;
    };

export function findItemValidationIssues(
  items: readonly CharacterItem[],
): readonly ItemValidationIssue[] {
  // One inventory line per Item: two entries for the same id is an inventory
  // that has lost track of a quantity, not a character with two piles.
  const issues: ItemValidationIssue[] = scanReferences(
    items.map((item) => item.itemId),
    isKnownItemId,
  ).map((issue) => ({
    type: issue.kind === "unknown" ? "unknown-item" : "duplicate-item",
    itemId: issue.id,
  }));

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 0) {
      issues.push({
        type: "invalid-item-quantity",
        itemId: item.itemId,
        quantity: item.quantity,
      });
    }
  }

  return issues;
}

export function findItemCatalogIssues(): readonly string[] {
  return ITEM_REGISTRY.findCatalogIssues();
}

// Exposed for the catalog index, which needs every registry in one map.
export const itemRegistry = ITEM_REGISTRY;

export type { CharacterItem, ItemDefinition };
export { getActiveItemEffects };
