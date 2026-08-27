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
 * The portion of an Item that belongs in persisted character state.
 *
 * The character stores a reference to the Item definition rather than copying
 * its Effects, Requirements, name, description, and other authored content.
 */
export interface CharacterItem {
  readonly itemId: string;

  /**
   * Number of this Item currently possessed.
   *
   * Unique equipment will normally have quantity 1.
   */
  readonly quantity: number;


  /**
   * Whether this Item is currently equipped.
   *
   * Equipment-slot handling can be added separately when the equipment/body
   * systems require it.
   */
  readonly equipped: boolean;
}


/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Return the passive Effects contributed by an Item in its current character
 * state.
 *
 * Possessed Effects always apply while at least one copy is owned.
 * Equipped Effects additionally apply while the Item is equipped.
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

  if (state.equipped) {
    effects.push(
      ...(definition.equippedEffects ?? []),
    );
  }

  return effects;
}