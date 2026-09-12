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
import type { NamedRequirement } from "../rules/requirements";

import { isEquippedItemState, type ItemEquipmentState } from "./state";
import type { InventoryEntryId } from "./references";
import type { ItemFamilyId } from "./families";
import type { ItemIntegrityDefinition } from "./integrity";

/*
 * ItemUseApplication is declared in ./actions, not here.
 *
 * It is built from the neutral `actions/`, `targeting/` and `spatial/`
 * vocabularies, and this file must not reach up into any of them —
 * architecture.test.ts enforces that for every file under character/ except
 * the declared seams. ./actions is one of those seams, exactly as
 * capabilities/applications.ts is for a Skill's application; this file only
 * imports the TYPE it defines, which is erased at compile time and adds no
 * runtime edge back into it.
 */
import type { ItemAttackContribution, ItemDefenseContribution, ItemUseApplication } from "./actions";


/* -------------------------------------------------------------------------- */
/* Shū compatibility                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Whether a future whole-Item Shū enhancement may ever apply to this Item.
 *
 * Closed and required, never inferred. Whether an Item is consumed, what
 * inventory mode it uses, which family it belongs to, and what it contributes
 * are all independent of this: a potion may be incompatible; a grenade may be
 * compatible even though it is consumed. Guessing from any of those facts
 * would be an invented rule wearing the shape of an authored one.
 *
 * The verdict is BINARY and covers the WHOLE Item — its performance, its
 * integrity protection, its passive effects, its equipped effects, its active
 * effects and its special abilities together. There is no per-channel
 * selection (`shu: { channels: [...] }`), and there will not be one: Ticket
 * 4.6 establishes only this contract, not Aura cost, allocation or the
 * enhancement formula itself, which belong to the Shū mechanic when it is
 * built.
 */
export const SHU_INTERACTIONS = ["compatible", "incompatible"] as const;

export type ShuInteraction = typeof SHU_INTERACTIONS[number];

export function isShuInteraction(value: unknown): value is ShuInteraction {
  return typeof value === "string" &&
    (SHU_INTERACTIONS as readonly string[]).includes(value);
}


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
   *
   * Resolved by resolveItemUse(), exactly once per use and never scaled by
   * quantity, into the use result and nowhere else. They are never collected
   * as possessed or equipped Effects — not before a use, not after one, and
   * not while the Item is held.
   */
  readonly useEffects?: readonly Effect[];


  /**
   * Requirements that must be satisfied before the Item can be equipped.
   *
   * An empty or omitted list means there are no equip prerequisites.
   *
   * NAMED, as use requirements are, because an equip attempt is something a
   * character does on purpose and is refused to their face. The player is
   * told which requirement stopped them, a GM may override it by name, and
   * both of those need an identity that survives the requirement being
   * rephrased or the list being reordered.
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
   *
   * NAMED for the reason equip requirements are: a use is attempted on
   * purpose and refused by name, so each requirement carries an id that stays
   * stable when the list is reordered or the summary reworded.
   *
   * Asked against the character as they stand BEFORE the use, and asked every
   * time — unlike the equip gate, which is a moment, a use gate is the
   * "must keep requiring something to function" mechanic that the equip gate
   * deliberately is not.
   */
  readonly useRequirements?: readonly NamedRequirement[];


  /**
   * When true, one successful use removes one unit from the selected entry.
   * False or omitted means the Item is reusable.
   *
   * Declared, never inferred. Stackable is not consumable — a whetstone is a
   * count and survives a sharpening — and neither is having use Effects, a
   * name, a tag or a quantity. A guess right for potions would be wrong,
   * silently, for the first reusable thing an author made stackable.
   */
  readonly consumesOnUse?: boolean;


  /**
   * How a USE of this Item is presented to the neutral action pipeline.
   *
   * Required for any Item an actions adapter will run a use through — see
   * ItemUseApplication. Absent on an Item that is only ever resolved directly
   * through resolveItemUse() and never attempted as an action.
   */
  readonly useApplication?: ItemUseApplication;


  /**
   * The kinds of Item this one counts as, for implement-role matching.
   *
   * Absent or empty means the Item claims no family membership — it can still
   * fill a role whose requirement sets `allowImprovised: true`, graded
   * "improvised", but it satisfies no role by family match. See
   * `ImplementRequirement` in implements.ts for how a role reads this list;
   * this field only declares membership; it decides nothing about how good a
   * fit any particular role considers it.
   */
  readonly families?: readonly ItemFamilyId[];


  /**
   * A typed attack fact this Item contributes when selected for a role.
   *
   * Not exclusive with `defense` — a glaive may cut and parry — and not
   * exclusive with `possessedEffects`/`equippedEffects` either. This Item does
   * not become "a weapon" by declaring it; it is simply an Item that, when an
   * action selects it for a role, has an attack fact to contribute. See
   * `ItemAttackContribution` and `contributions.ts` for how it resolves.
   */
  readonly attack?: ItemAttackContribution;


  /**
   * A typed defense fact this Item contributes when selected for a role.
   *
   * See `attack` — the same non-exclusivity applies in both directions. A
   * shield may declare only `defense`, a spear only `attack`, and a glaive
   * both; nothing here forces an Item into a single class.
   */
  readonly defense?: ItemDefenseContribution;


  /**
   * Whether a future whole-Item Shū enhancement may ever apply to this Item.
   *
   * REQUIRED. See ShuInteraction's own comment for why this is never
   * defaulted or inferred — an omission here is exactly the kind of authoring
   * gap `findItemStructuralIssues()` refuses at registration, alongside
   * `inventoryMode`.
   */
  readonly shuInteraction: ShuInteraction;


  /**
   * This Item's integrity policy — how much it can take, whether it comes
   * back, and what zero means for it. Absent means the Item is not durable at
   * all: `CharacterItem.integrity` may never be set on an entry of it (see
   * `equipment/validation.ts`'s core checks), and stress/repair resolve as
   * "not-durable" rather than a refusal a player did anything wrong to earn.
   *
   * A STACKABLE Item may not declare this — see the `stackable-durable`
   * validation issue and `ItemInventoryMode`'s own header for why one
   * integrity figure cannot stand for an independently damageable stack.
   */
  readonly integrity?: ItemIntegrityDefinition;
}


/**
 * Whether an Item declares anything that makes USING it meaningful.
 *
 * At least one of: a use Effect to resolve, a use gate to pass, or a unit to
 * consume. A sword, a cursed idol, or gauntlets with only passive Effects are
 * not actively usable merely because they exist, and resolving a "use" of one
 * would report a successful event in which nothing happened.
 *
 * Reads the definition as typed, so ask it only of a definition whose use
 * surface has passed findItemUseDefinitionIssues().
 */
export function isActivelyUsableItem(definition: ItemDefinition): boolean {
  return (definition.useEffects?.length ?? 0) > 0 ||
    (definition.useRequirements?.length ?? 0) > 0 ||
    definition.consumesOnUse === true;
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


  /**
   * Current integrity, for a durable entry only.
   *
   * Absent on a non-durable Item's entry, and absent is also legal on a
   * durable one — it then reads as full (`ItemIntegrityDefinition.maximum`)
   * rather than as zero, so an ordinary sword bought new needs nothing
   * written here at all. Once present it is history, not policy: how much
   * this ENTRY has taken, never how much its kind of Item can take.
   */
  readonly integrity?: number;
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