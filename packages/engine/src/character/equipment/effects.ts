/*
 * Which of an Item's passive Effects are actually applying, right now.
 *
 * This moved out of types.ts when integrity acquired mechanical consequences.
 * The question stopped being answerable from the definition and the entry's
 * engagement state alone — a broken sword is held, owned, quantity one, and
 * contributes nothing — and answering it needs `resolveItemFunctionality()`,
 * which types.ts cannot import as a value without closing a cycle through
 * validation.ts. So the helper lives one layer up, where both halves are
 * reachable, and types.ts keeps the DATA and none of the interpretation.
 *
 * One function, one rule. `collectItemEffectSources()` in index.ts is its only
 * caller inside the engine, and the gate lives here rather than there so that
 * a host calling the helper directly gets the same answer resolution does.
 */

import type { Effect } from "../rules/effects";

import { resolveItemFunctionality } from "./integrity";
import { isEquippedItemState } from "./state";
import type { CharacterItem, ItemDefinition } from "./types";


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
 * A BROKEN or DESTROYED entry contributes nothing either, and for the same
 * kind of reason: the object is on the sheet and is no longer the thing whose
 * Effects those are. The exception is authored per channel and never inferred
 * — an Item whose `brokenBehavior.persistentEffects` names "possessed" keeps
 * its possessed Effects through breakage, which is how a curse outlives the
 * idol it was carved into. Nothing here reads the SIGN of an Effect to guess
 * whether it ought to survive; "this one is a penalty, so it probably stays"
 * is a rule no author wrote.
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

  const functionality = resolveItemFunctionality(definition, state.integrity);

  const effects: Effect[] = functionality.possessedEffectsApply
    ? [...(definition.possessedEffects ?? [])]
    : [];

  if (isEquippedItemState(state.state) && functionality.equippedEffectsApply) {
    effects.push(
      ...(definition.equippedEffects ?? []),
    );
  }

  return effects;
}
