/*
 * Generic Item and equipment definitions.
 *
 * Items are data-driven content.
 *
 * An Item may:
 *
 * - apply Effects simply by being possessed;
 * - apply Effects while equipped;
 * - produce Effects when explicitly used;
 * - declare Requirements for being equipped;
 * - declare Requirements for being used.
 *
 * Items use the same universal Effect and Requirement vocabulary as Species,
 * Traits, Skills, Techniques, Conditions, and other character content.
 *
 * This file defines Item DATA only.
 *
 * It does not:
 *
 * - determine whether an Item is currently active;
 * - apply Item Effects;
 * - resolve equip/use Requirements;
 * - mutate character state;
 * - consume Items;
 * - resolve inventory limits;
 * - determine equipment slots.
 *
 * Those responsibilities belong to the relevant resolution and inventory
 * systems.
 */

import type { Definition } from "../../infrastructure/registry";

import type { Effect } from "../rules/effects";
import type { NamedRequirement, Requirement } from "../rules/requirements";

import { isEquippedItemState, type ItemEquipmentState } from "./state";
import type { InventoryEntryId } from "./references";


/* -------------------------------------------------------------------------- */
/* Item definitions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Whether copies of an Item are interchangeable.
 *
 * individual — each copy is its own object with its own entry. A sword, a
 *   suit of armour, a cursed idol: things that get held, worn, enchanted,
 *   broken and named, and that a player expects to be able to point at.
 *
 * stackable — copies are a count and nothing else. Arrows, rations, coins:
 *   nobody asks which arrow.
 *
 * This exists because permitting repeated `itemId` values and quantities above
 * one AT THE SAME TIME made the same inventory mean two different things. Two
 * Cursed Idols written as one entry of quantity two produced one CHA penalty;
 * written as two entries of one they produced two. A character must not gain
 * or lose a modifier because a host grouped identical objects differently, and
 * the fix is not to guess a grouping — it is to make one grouping legal.
 *
 * So an individual Item may hold zero or one, and a stackable Item may hold
 * any count but may not declare passive Effects until quantity-scaled Effects
 * exist as a real mechanic. Either way one entry is exactly one mechanical
 * source, and neither representation of "two idols" is ambiguous because only
 * one of them validates.
 */
export const ITEM_INVENTORY_MODES = [
  "individual",
  "stackable",
] as const;

export type ItemInventoryMode = typeof ITEM_INVENTORY_MODES[number];


export function isItemInventoryMode(
  value: unknown,
): value is ItemInventoryMode {
  return typeof value === "string" &&
    (ITEM_INVENTORY_MODES as readonly string[]).includes(value);
}


/** Whether copies of this Item are a count rather than distinct objects. */
export function isStackableItem(definition: ItemDefinition): boolean {
  return definition.inventoryMode === "stackable";
}


/**
 * A reusable Item definition stored in the Item catalog.
 *
 * Character inventory should reference this definition by id rather than
 * duplicating the full Item definition into character state.
 */
export interface ItemDefinition extends Definition {
  /**
   * Whether copies of this Item are distinct objects or a count.
   *
   * Required, and deliberately not defaulted. A default would be applied
   * silently to every Item an author forgot to think about, and the two
   * choices differ in what a character's sheet is allowed to say — which is
   * not a question an omission should answer.
   */
  readonly inventoryMode: ItemInventoryMode;


  /**
   * Effects that apply while the character possesses the Item.
   *
   * These should be used only when simple ownership of the Item is enough for
   * its mechanics to apply.
   *
   * Example:
   *
   *   Cursed Idol
   *     → modifyResolvedAttribute CHA -1
   *
   * while carried.
   */
  readonly possessedEffects?: readonly Effect[];


  /**
   * Effects that apply only while this Item is equipped.
   *
   * Example:
   *
   *   Gauntlets of Strength
   *     → modifyResolvedAttribute STR +2
   */
  readonly equippedEffects?: readonly Effect[];


  /**
   * Effects produced when the Item is explicitly used.
   *
   * Unlike possessed/equipped Effects, these are events rather than passive
   * derived state.
   *
   * Example:
   *
   *   Healing Potion
   *     → restore health
   *
   *   Titan's Heart
   *     → permanently modify Base STR
   *
   * The universal Effect vocabulary will expand as additional reusable
   * mechanics such as healing are introduced.
   */
  readonly useEffects?: readonly Effect[];


  /**
   * Requirements that must be satisfied before the Item can be equipped.
   *
   * An empty or omitted list means there are no equip prerequisites.
   *
   * NAMED, unlike the use requirements below, because an equip attempt is
   * something a character does on purpose and is refused to their face. The
   * player is told which requirement stopped them, a GM may override it by
   * name, and both of those need an identity that survives the requirement
   * being rephrased or the list being reordered. `useRequirements` stay bare
   * until the shared Item application work gives them the same job.
   *
   * These are TRANSITION-TIME gates. They are asked when the Item is put on
   * and never again: an Item already worn stays worn when the character loses
   * the Trait that let them wear it, because a resolver that quietly undressed
   * a character would be writing to stored state during a read. An Item that
   * must keep requiring something to FUNCTION needs a use requirement or an
   * active contribution rule, which are different mechanics.
   */
  readonly equipRequirements?: readonly NamedRequirement[];


  /**
   * Requirements that must be satisfied before the Item can be used.
   *
   * An empty or omitted list means there are no use prerequisites.
   */
  readonly useRequirements?: readonly Requirement[];
}


/* -------------------------------------------------------------------------- */
/* Character Item state                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One owned inventory ENTRY.
 *
 * The character stores a reference to the Item definition rather than copying
 * its Effects, Requirements, name, description, and other authored content.
 *
 * An entry is not an Item and is not a quantity of Items: it is a line in an
 * inventory that has its own identity, names a definition, and says how much
 * of it there is and how it is currently engaged. Two entries may name the
 * same definition, which is what makes a character with two identical swords
 * representable — one in the hand, one in the pack — and what a single
 * `itemId`-keyed line could never express.
 *
 * The identity is `entryId` and nothing else. It is emphatically NOT the array
 * position: an inventory that is sorted, filtered or re-serialized changes
 * every position in it while changing nothing about what the character owns,
 * so a reference by index is a reference that silently starts pointing at a
 * different object. See references.ts.
 */
export interface CharacterItem {
  /**
   * Stable identity of this owned inventory entry.
   *
   * Unique within one character, and unrelated to `itemId` — two entries of
   * Reinforced Gauntlets share a definition id and must not share this one.
   */
  readonly entryId: InventoryEntryId;


  /** Catalog definition used by this entry. */
  readonly itemId: string;


  /**
   * Number currently contained in this entry.
   *
   * Zero is legal and means an emptied entry that still exists — a quiver with
   * no arrows left in it — which is why possession is a positive quantity
   * rather than the presence of a line.
   */
  readonly quantity: number;


  /**
   * How this entry is currently engaged by the character.
   *
   * Held and worn are both equipped; ask isEquippedItemState() rather than
   * comparing against "carried". Only an entry of exactly one may be held or
   * worn, because a stack of three has no way to say which one is in the hand.
   */
  readonly state: ItemEquipmentState;
}


/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Return the passive Effects contributed by one inventory entry in its current
 * state.
 *
 * Possessed Effects apply at any positive quantity: a Cursed Idol unsettles
 * the people around whoever carries it whether they are carrying one or three.
 * Equipped Effects apply on top while the entry is held or worn.
 *
 * An emptied entry contributes nothing at all. It is still a line in the
 * inventory — the quiver exists — but a rule that applied because a container
 * of nothing was still on the sheet would be a rule applying to an object the
 * character does not have.
 *
 * `useEffects` are excluded here and always will be: they are events produced
 * when a player uses the Item, not passive derived state, and collecting them
 * with the rest is how a Healing Potion heals continuously for being in a bag.
 *
 * This function only collects declared Effects. It does not execute them.
 */
export function getActiveItemEffects(
  definition: ItemDefinition,
  state: CharacterItem,
): readonly Effect[] {
  if (state.quantity <= 0) {
    return [];
  }

  const effects: Effect[] = [
    ...(definition.possessedEffects ?? []),
  ];

  if (isEquippedItemState(state.state)) {
    effects.push(
      ...(definition.equippedEffects ?? []),
    );
  }

  return effects;
}