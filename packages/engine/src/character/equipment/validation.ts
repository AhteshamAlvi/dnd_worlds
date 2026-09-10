/*
 * What an inventory entry is, and what one can get wrong.
 *
 * This moved out of equipment/index.ts when entries acquired an identity,
 * because the checks stopped being "is this id known" and became a set of
 * rules about entries — shape, identity, uniqueness, quantity, engagement —
 * that the catalog module has no other reason to know about.
 *
 * Three things changed in what is checked, and each is a consequence of the
 * entry model rather than new policy:
 *
 * A repeated `itemId` is no longer an error. It used to be reported as
 * "duplicate-item" on the theory that one inventory line per Item meant a
 * second line had lost track of a quantity. That theory is exactly what the
 * entry model rejects: two swords are two objects, one in the hand and one in
 * the pack, and no quantity on a single line can say that. What must be unique
 * is the ENTRY id, and that is now checked instead.
 *
 * An engaged entry must hold exactly one thing. A stack of three swords in the
 * "held" state names no particular sword, so nothing downstream — Shū, a
 * weapon attack, a trace — can say which object it is talking about. Refusing
 * it here is what lets every later system assume that a held or worn entry IS
 * an object. Stack splitting, which is how a player would legitimately get
 * there, is deferred.
 *
 * An INDIVIDUAL Item may not be stacked at all. That rule exists because
 * permitting repeated `itemId` values and quantities above one at the same
 * time made the same inventory mean two different things: one entry of two
 * Cursed Idols contributed one CHA penalty and two entries of one contributed
 * two, so a character gained or lost a modifier depending on how a host
 * happened to group identical objects. See ItemInventoryMode in types.ts —
 * effect-bearing content is individual, and an individual entry therefore has
 * exactly one representation.
 *
 * Every function here takes values that may be anything. Inventory arrives
 * from JSON, from hosts and from serialized state, so a validator that assumed
 * its input already matched CharacterItem would be assuming the answer to the
 * question it was asked. Nothing here throws, and nothing dereferences a value
 * it has not first checked.
 *
 * The Item catalog is handed in rather than imported. index.ts owns the
 * registry and imports this module to expose findItemValidationIssues(), so
 * reaching back for getItemDefinition would close a value-import cycle between
 * the two — the same shape the capability lifecycle is guarded against in
 * architecture.test.ts. It also means these rules can be run against a host's
 * own catalog, which is what "custom content is additive" is supposed to mean.
 *
 * The field predicates live HERE rather than beside the types they describe,
 * and references.ts imports them. The direction matters: a lookup has to be
 * able to refuse a malformed entry, so identity and shape rules must sit below
 * the reference module rather than beside it.
 */

import {
  findEffectsValidationIssues,
  findNamedRequirementsValidationIssues,
} from "../rules/validation";

import { isEquippedItemState, isItemEquipmentState, type ItemEquipmentState } from "./state";

import {
  ITEM_INVENTORY_MODES,
  isItemInventoryMode,
  isStackableItem,
  type CharacterItem,
  type ItemDefinition,
} from "./types";

import type { InventoryEntryId } from "./references";


/** How this module is told what the catalog contains. */
export type ItemDefinitionLookup =
  (itemId: string) => ItemDefinition | undefined;


/* -------------------------------------------------------------------------- */
/* Field rules                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Whether a value is a usable entry id.
 *
 * Whitespace is not identity. `"   "` reads as a filled-in field and prints as
 * nothing, so it is refused alongside the empty string rather than accepted as
 * an id nobody can see or type.
 */
export function isInventoryEntryId(value: unknown): value is InventoryEntryId {
  return typeof value === "string" && value.trim().length > 0;
}


/**
 * Whether a value is a legal entry quantity.
 *
 * Zero is legal — an emptied quiver is still a quiver — so the floor is zero
 * rather than one. Fractions are not: half a sword is not a thing a character
 * owns, and NaN and Infinity are neither integers nor counts. Number.isInteger
 * refuses all three.
 */
export function isInventoryQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}


/**
 * Whether an engaged entry is one identifiable object.
 *
 * Both engagement rules collapse into this one test. "A zero-quantity entry
 * must be carried" and "a held or worn entry must have quantity exactly one"
 * are the same rule read from either end, and writing them as two checks would
 * report an empty held quiver twice.
 */
function engagementIsCoherent(
  state: ItemEquipmentState,
  quantity: number,
): boolean {
  return !isEquippedItemState(state) || quantity === 1;
}


/**
 * Whether a value is structurally a CharacterItem.
 *
 * SHAPE only, and deliberately catalog-free: every field the interface
 * promises exists and holds a legal primitive, and the engagement rule holds
 * because a held entry of three is not an object no matter which catalog it
 * came from. What it cannot answer is whether the Item exists or whether an
 * individual definition is being stacked — both need a catalog, and a
 * predicate that silently needed one would be unusable from a lookup.
 *
 * So a value passing this is safe to READ. It is not thereby a valid entry on
 * a character sheet; findInventoryEntryIssues() is what says that.
 */
export function isCharacterItemShape(value: unknown): value is CharacterItem {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<Record<keyof CharacterItem, unknown>>;

  if (!isInventoryEntryId(candidate.entryId)) return false;
  if (typeof candidate.itemId !== "string") return false;
  if (candidate.itemId.trim().length === 0) return false;
  if (!isInventoryQuantity(candidate.quantity)) return false;
  if (!isItemEquipmentState(candidate.state)) return false;

  return engagementIsCoherent(candidate.state, candidate.quantity);
}


/* -------------------------------------------------------------------------- */
/* Definition validation                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What can be wrong with an Item DEFINITION, as opposed to an owned entry.
 *
 * One list, checked by everything that has to decide whether a definition is
 * usable. It was previously two: findItemCatalogIssues() checked the inventory
 * mode and the stackable-passive-Effects rule, while the equip transition
 * checked the inventory mode and the equip gate — so a stackable Item bearing
 * equippedEffects was reported broken by the catalog and equipped perfectly
 * happily a moment later, and a malformed passive Effect was caught by
 * neither. Two validators over one subject is two answers to one question, and
 * the caller who asked the more permissive one never finds out.
 */
export type ItemDefinitionIssue =
  | {
      readonly type: "invalid-inventory-mode";
      readonly mode: unknown;
    }
  | {
      readonly type: "stackable-passive-effects";
      readonly where: "possessedEffects" | "equippedEffects";
    }
  | {
      readonly type: "malformed-rule";
      readonly where: string;
      readonly issue: string;
      readonly path: string;
    };


/** One issue, rendered the same way wherever it is reported. */
export function describeItemDefinitionIssue(
  issue: ItemDefinitionIssue,
): string {
  switch (issue.type) {
    case "invalid-inventory-mode":
      return `must declare an inventoryMode of ${ITEM_INVENTORY_MODES.join(" or ")}`;

    case "stackable-passive-effects":
      return `is stackable and declares ${issue.where}, which apply once per entry regardless of quantity`;

    case "malformed-rule":
      return `has a malformed ${issue.where}: ${issue.issue} at ${issue.path}`;
  }
}


/**
 * Everything wrong with one Item definition.
 *
 * Covers what makes a definition unusable AS EQUIPMENT: the inventory mode,
 * the rule that stackable content carries no passive Effects, the structural
 * soundness of those Effects, and the equip gate's own metadata.
 *
 * `useEffects` and `useRequirements` are deliberately NOT checked here, and
 * the omission is a decision rather than an oversight. A potion whose healing
 * Effect is malformed is a broken potion; it is not a reason to refuse to
 * strap the belt it hangs from onto a character, and folding it in would make
 * an unrelated authoring mistake block a transition that never reads it. Use
 * content is validated by the use path — which does not exist yet — and by
 * catalogs.ts's reference walk, which already reaches it.
 *
 * Takes a definition that may be anything, because a host registers these.
 */
export function findItemDefinitionIssues(
  definition: ItemDefinition,
): readonly ItemDefinitionIssue[] {
  if (typeof definition !== "object" || definition === null) {
    return [{ type: "invalid-inventory-mode", mode: undefined }];
  }

  const issues: ItemDefinitionIssue[] = [];

  if (!isItemInventoryMode(definition.inventoryMode)) {
    /*
     * Reported and then STOPPED for the stacking rule only. Without a mode
     * there is no way to ask whether passive Effects are permitted, and
     * guessing one would answer a question the author did not.
     */
    issues.push({
      type: "invalid-inventory-mode",
      mode: definition.inventoryMode,
    });
  }

  const passive = [
    ["possessedEffects", definition.possessedEffects ?? []],
    ["equippedEffects", definition.equippedEffects ?? []],
  ] as const;

  for (const [where, effects] of passive) {
    if (
      isItemInventoryMode(definition.inventoryMode) &&
      isStackableItem(definition) &&
      effects.length > 0
    ) {
      issues.push({ type: "stackable-passive-effects", where });
    }

    for (const issue of findEffectsValidationIssues(effects)) {
      issues.push({
        type: "malformed-rule",
        where,
        issue: issue.type,
        path: issue.path,
      });
    }
  }

  for (const issue of findNamedRequirementsValidationIssues(
    definition.equipRequirements,
    "equipRequirements",
  )) {
    issues.push({
      type: "malformed-rule",
      where: "equipRequirements",
      issue: issue.type,
      path: issue.path,
    });
  }

  return issues;
}


/* -------------------------------------------------------------------------- */
/* Issues                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A problem with one inventory entry.
 *
 * Every variant but the first names the entry it is about, because a
 * diagnostic a player cannot trace back to a line is a diagnostic they cannot
 * act on — and with repeated definition ids now legal, `itemId` no longer
 * identifies a line. The first variant is the case where there is no such
 * identity to name, so it reports the position and the offending value
 * instead.
 *
 * The malformed values are typed `unknown` rather than as the field they were
 * found in. Declaring `quantity: number` on an issue that exists BECAUSE the
 * quantity was `"three"` would be the validator restating the assumption it
 * just disproved, and every consumer would inherit the lie.
 */
export type ItemValidationIssue =
  | {
      readonly type: "invalid-item-entry-id";
      readonly entryIndex: number;
      readonly entryId: unknown;
    }
  | {
      readonly type: "duplicate-item-entry-id";
      readonly entryId: InventoryEntryId;
    }
  | {
      readonly type: "unknown-item";
      readonly entryId: InventoryEntryId;
      readonly itemId: unknown;
    }
  | {
      readonly type: "invalid-item-quantity";
      readonly entryId: InventoryEntryId;
      readonly quantity: unknown;
    }
  | {
      readonly type: "invalid-item-state";
      readonly entryId: InventoryEntryId;
      readonly state: unknown;
    }
  | {
      readonly type: "invalid-engaged-item-quantity";
      readonly entryId: InventoryEntryId;
      readonly state: ItemEquipmentState;
      readonly quantity: number;
    }
  | {
      readonly type: "invalid-individual-item-quantity";
      readonly entryId: InventoryEntryId;
      readonly itemId: string;
      readonly quantity: number;
    };


/* -------------------------------------------------------------------------- */
/* Inventory validation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Every problem in an inventory.
 *
 * An entry with no usable identity is reported once and not examined further.
 * Its other fields may well be wrong too, but a complaint about them could
 * only be addressed to a line nobody can name — and the fix for the entry is
 * the same either way. The remaining checks are independent, so one entry may
 * legitimately produce several issues.
 */
export function findInventoryEntryIssues(
  items: readonly CharacterItem[] | undefined,
  getItemDefinition: ItemDefinitionLookup,
): readonly ItemValidationIssue[] {
  if (!Array.isArray(items)) return [];

  const issues: ItemValidationIssue[] = [];
  const seenEntryIds = new Set<InventoryEntryId>();

  for (const [index, candidate] of (items as readonly unknown[]).entries()) {
    const entry = (typeof candidate === "object" && candidate !== null
      ? candidate
      : {}) as Partial<Record<keyof CharacterItem, unknown>>;

    /* ---------------------------------------------------------------------- */
    /* Identity                                                               */
    /* ---------------------------------------------------------------------- */

    if (!isInventoryEntryId(entry.entryId)) {
      issues.push({
        type: "invalid-item-entry-id",
        entryIndex: index,
        entryId: entry.entryId,
      });

      continue;
    }

    const entryId = entry.entryId;

    if (seenEntryIds.has(entryId)) {
      issues.push({ type: "duplicate-item-entry-id", entryId });
    } else {
      seenEntryIds.add(entryId);
    }

    /* ---------------------------------------------------------------------- */
    /* Definition reference                                                   */
    /* ---------------------------------------------------------------------- */

    /*
     * Repeated definition ids are deliberately NOT checked. Two entries naming
     * one Item is a character with two of the thing, which is the case the
     * entry model exists to represent.
     */
    const definition = typeof entry.itemId === "string"
      ? getItemDefinition(entry.itemId)
      : undefined;

    if (definition === undefined) {
      issues.push({ type: "unknown-item", entryId, itemId: entry.itemId });
    }

    /* ---------------------------------------------------------------------- */
    /* Quantity and engagement                                                */
    /* ---------------------------------------------------------------------- */

    const quantityIsValid = isInventoryQuantity(entry.quantity);

    if (!quantityIsValid) {
      issues.push({
        type: "invalid-item-quantity",
        entryId,
        quantity: entry.quantity,
      });
    }

    /*
     * Only asked once the Item is known and the quantity is a count. An
     * unknown definition has no inventory mode to test against, and the
     * unknown-item message is the one that leads to the fix.
     */
    if (
      quantityIsValid &&
      definition !== undefined &&
      !isStackableItem(definition) &&
      (entry.quantity as number) > 1
    ) {
      issues.push({
        type: "invalid-individual-item-quantity",
        entryId,
        itemId: definition.id,
        quantity: entry.quantity as number,
      });
    }

    if (!isItemEquipmentState(entry.state)) {
      issues.push({ type: "invalid-item-state", entryId, state: entry.state });

      continue;
    }

    /*
     * Only asked once the quantity is known to be a count. "Held with a
     * quantity of NaN" is one problem reported twice, and the second report
     * would name a figure that is not a number in a message about how many
     * there are.
     */
    if (
      quantityIsValid &&
      !engagementIsCoherent(entry.state, entry.quantity as number)
    ) {
      issues.push({
        type: "invalid-engaged-item-quantity",
        entryId,
        state: entry.state,
        quantity: entry.quantity as number,
      });
    }
  }

  return issues;
}


/** Whether an entry is sound in its own right, against a catalog. */
export function isValidInventoryEntry(
  value: unknown,
  getItemDefinition: ItemDefinitionLookup,
): value is CharacterItem {
  return findInventoryEntryIssues([value as CharacterItem], getItemDefinition)
    .length === 0;
}
