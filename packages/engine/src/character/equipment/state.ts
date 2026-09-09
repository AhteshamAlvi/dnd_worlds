/*
 * How an owned object is currently engaged by its owner.
 *
 * `equipped: boolean` answered one question with one bit and could not tell
 * two different facts apart. A sword in the hand and a breastplate on the
 * chest are both "equipped", but they are engaged by different parts of a
 * body, become unavailable for different reasons, and are put on and taken off
 * at different costs. A single boolean forces every later system — hands, body
 * slots, Shū, weapon selection, readiness — to re-derive that distinction from
 * the Item definition, which means each of them derives it separately and the
 * derivations disagree.
 *
 * So the state is a closed vocabulary of three values, and the question
 * "is this equipped?" becomes a function over it rather than a field.
 *
 * What this file deliberately does NOT model: hands, body slots, conflicts,
 * dual-wielding, readiness costs, or which of them a given Item requires. The
 * state says how an object is currently engaged; it does not say what engaging
 * it costs or what it excludes, and inventing those before the equip pipeline
 * exists would be answering a question nobody has asked yet.
 */

import type { CharacterItem } from "./types";


/**
 * The three ways a character can currently be engaging an owned object.
 *
 * carried — possessed and not equipped: in a pack, on a belt, in a pocket.
 * held    — possessed and equipped, in a hand.
 * worn    — possessed and equipped, on the body.
 */
export const ITEM_EQUIPMENT_STATES = [
  "carried",
  "held",
  "worn",
] as const;

export type ItemEquipmentState = typeof ITEM_EQUIPMENT_STATES[number];


/**
 * Whether an arbitrary value is one of the three states.
 *
 * Takes `unknown` because inventory arrives from JSON, from a host, and from
 * serialized character state, where "carried" and 42 are equally likely to
 * turn up in the field. A guard that took ItemEquipmentState would only ever
 * be called on values already assumed to be valid.
 */
export function isItemEquipmentState(
  value: unknown,
): value is ItemEquipmentState {
  return typeof value === "string" &&
    (ITEM_EQUIPMENT_STATES as readonly string[]).includes(value);
}


/**
 * Whether a state counts as equipped.
 *
 * Held and worn are DISTINCT states that both answer this question yes, which
 * is the whole reason the vocabulary replaced a boolean: the difference
 * between them matters to hands and slots, and does not matter at all to an
 * `equippedEffects` bundle or to a `hasItem` requirement asking for
 * `"equipped"`.
 *
 * Every such test in the engine goes through here. A `state !== "carried"`
 * written inline is the same rule spelled a second way, and it is the spelling
 * that silently changes meaning the day a fourth state is added — a stowed or
 * sheathed object would become equipped by default, which is exactly backwards.
 */
export function isEquippedItemState(state: ItemEquipmentState): boolean {
  return state === "held" || state === "worn";
}


/**
 * Whether an inventory entry denotes ONE concrete object.
 *
 * A stack of three swords is one entry with one identity and no way to say
 * which sword is in the hand, so it cannot be treated as an object that can be
 * held, thrown, enchanted or destroyed. Only a quantity of exactly one makes
 * the entry and the object the same thing.
 *
 * Splitting a stack to obtain such an entry is deferred; this predicate says
 * when the question is answerable, not how to make it answerable.
 */
export function isConcreteInventoryObject(item: CharacterItem): boolean {
  return item.quantity === 1;
}
