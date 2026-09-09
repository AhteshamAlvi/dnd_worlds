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
import type { Requirement } from "../rules/requirements";

import { isEquippedItemState, type ItemEquipmentState } from "./state";
import type { InventoryEntryId } from "./references";


/* -------------------------------------------------------------------------- */
/* Item definitions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A reusable Item definition stored in the Item catalog.
 *
 * Character inventory should reference this definition by id rather than
 * duplicating the full Item definition into character state.
 */
export interface ItemDefinition extends Definition {
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
   */
  readonly equipRequirements?: readonly Requirement[];


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