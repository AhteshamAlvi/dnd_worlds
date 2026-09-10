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

import type { Effect } from "../rules/effects";

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
 * What can be wrong with an Item definition, on any of its surfaces.
 *
 * An Item is asked three different questions by different callers, and each
 * question has exactly one validator over this one vocabulary of issues:
 *
 * CORE — whether this is an Item at all: an object with an inventory mode.
 *   Both operational surfaces need it, so both include it.
 *
 * EQUIPMENT — whether the Item may be worn: the stackable-no-passive-Effects
 *   rule, the passive Effect lists and the equip gate. Asked by the equip
 *   transition.
 *
 * USE — whether the Item may be used: `useEffects`, the named use gate and the
 *   consumption declaration. Asked by the use resolver.
 *
 * The operational surfaces are kept apart in BOTH directions. A potion whose
 * healing Effect is malformed is a broken potion, not a reason to refuse to
 * take off the belt it hangs from; and a belt whose equippedEffects are
 * malformed is not a reason to refuse to drink from the flask on it. They meet
 * at registration, through findItemStructuralIssues(), because a definition
 * broken in either half is malformed content and does not belong in a catalog.
 *
 * One validator per surface is the point rather than a tidiness. The catalog
 * and the equip transition once each held half of the equipment rules, and a
 * stackable Item bearing equippedEffects was reported broken by one and
 * equipped by the other. Two validators over one subject are two answers to
 * one question, and the caller who asked the more permissive one never finds
 * out.
 */
export type ItemDefinitionIssue =
  | {
      /** Not an Item definition at all: no object to read fields off. */
      readonly type: "malformed-definition";
    }
  | {
      readonly type: "invalid-inventory-mode";
      readonly mode: unknown;
    }
  | {
      readonly type: "stackable-passive-effects";
      readonly where: "possessedEffects" | "equippedEffects";
    }
  | {
      readonly type: "invalid-consumes-on-use";
      readonly value: unknown;
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
    case "malformed-definition":
      return "is not an Item definition";

    case "invalid-inventory-mode":
      return `must declare an inventoryMode of ${ITEM_INVENTORY_MODES.join(" or ")}`;

    case "stackable-passive-effects":
      return `is stackable and declares ${issue.where}, which apply once per entry regardless of quantity`;

    case "invalid-consumes-on-use":
      return "declares a consumesOnUse that is neither true nor false";

    case "malformed-rule":
      return `has a malformed ${issue.where}: ${issue.issue} at ${issue.path}`;
  }
}


/** A definition's fields, readable without trusting any of them. */
type ItemFields = Partial<Record<keyof ItemDefinition, unknown>>;


function fieldsOf(candidate: unknown): ItemFields | undefined {
  return typeof candidate === "object" && candidate !== null
    ? candidate as ItemFields
    : undefined;
}


/**
 * One Effect list, checked as a list before its contents.
 *
 * A non-array is refused explicitly rather than left to the Effect validator's
 * own guard, because the message a caller needs is about the FIELD —
 * `equippedEffects: {}` is not an Effect that is malformed, it is a list that
 * is not a list, and it used to pass silently because an object has no
 * `length` for a loop to run over.
 */
function findEffectListIssues(
  where: "possessedEffects" | "equippedEffects" | "useEffects",
  effects: unknown,
): readonly ItemDefinitionIssue[] {
  if (effects === undefined) return [];

  if (!Array.isArray(effects)) {
    return [{ type: "malformed-rule", where, issue: "not-a-list", path: where }];
  }

  return findEffectsValidationIssues(
    effects as unknown as readonly Effect[],
    where,
  ).map((issue): ItemDefinitionIssue => ({
    type: "malformed-rule",
    where,
    issue: issue.type,
    path: issue.path,
  }));
}


/**
 * One named gate, checked as a NAMED gate.
 *
 * The complete wrapper — every id, every summary, repeated ids, and the
 * Requirement tree inside each entry — because a gate is refused to a player
 * by name, and a blank or repeated id is a refusal nobody can address or
 * override.
 */
function findNamedGateIssues(
  where: "equipRequirements" | "useRequirements",
  requirements: unknown,
): readonly ItemDefinitionIssue[] {
  return findNamedRequirementsValidationIssues(requirements, where).map(
    (issue): ItemDefinitionIssue => ({
      type: "malformed-rule",
      where,
      issue: issue.type,
      path: issue.path,
    }),
  );
}


function coreIssuesOf(definition: ItemFields): readonly ItemDefinitionIssue[] {
  return isItemInventoryMode(definition.inventoryMode)
    ? []
    : [{ type: "invalid-inventory-mode", mode: definition.inventoryMode }];
}


function equipmentIssuesOf(
  definition: ItemFields,
): readonly ItemDefinitionIssue[] {
  const issues: ItemDefinitionIssue[] = [];

  /*
   * The mode gates only the STACKING rule, not the structural checks. Without
   * a mode there is no way to ask whether passive Effects are permitted, and
   * guessing one would answer a question the author did not — but a malformed
   * Effect is malformed whatever the mode was going to be, and reporting both
   * at once saves an author a round trip.
   */
  const stacks = isItemInventoryMode(definition.inventoryMode) &&
    isStackableItem(definition as ItemDefinition);

  for (const where of ["possessedEffects", "equippedEffects"] as const) {
    const effects = definition[where];

    if (stacks && Array.isArray(effects) && effects.length > 0) {
      issues.push({ type: "stackable-passive-effects", where });
    }

    issues.push(...findEffectListIssues(where, effects));
  }

  issues.push(
    ...findNamedGateIssues("equipRequirements", definition.equipRequirements),
  );

  return issues;
}


function useIssuesOf(definition: ItemFields): readonly ItemDefinitionIssue[] {
  const issues: ItemDefinitionIssue[] = [
    ...findEffectListIssues("useEffects", definition.useEffects),
    ...findNamedGateIssues("useRequirements", definition.useRequirements),
  ];

  /*
   * Present means a real yes or no. `"true"` and `1` read as yes to a person
   * and as not-`true` to a resolver asking `=== true`, so an author who meant
   * a consumable would get a reusable Item and nothing would say so.
   */
  const consumes = definition.consumesOnUse;

  if (consumes !== undefined && typeof consumes !== "boolean") {
    issues.push({ type: "invalid-consumes-on-use", value: consumes });
  }

  return issues;
}


/**
 * Whether a value is an Item definition at all.
 *
 * The rules both operational surfaces depend on and neither owns. Takes
 * `unknown`, because a host registers these and a definition reaching here
 * may be anything; nothing is read before it has been checked, and nothing
 * throws. The same holds for every validator below.
 */
export function findItemCoreDefinitionIssues(
  candidate: unknown,
): readonly ItemDefinitionIssue[] {
  const definition = fieldsOf(candidate);

  return definition === undefined
    ? [{ type: "malformed-definition" }]
    : coreIssuesOf(definition);
}


/**
 * Everything wrong with one Item definition's equipment surface.
 *
 * The core, the rule that stackable content carries no passive Effects, the
 * structural soundness of those Effects, and the equip gate. Use-time content
 * is excluded — see ItemDefinitionIssue for why that is a decision rather than
 * an omission.
 */
export function findItemEquipmentDefinitionIssues(
  candidate: unknown,
): readonly ItemDefinitionIssue[] {
  const definition = fieldsOf(candidate);

  if (definition === undefined) return [{ type: "malformed-definition" }];

  return [...coreIssuesOf(definition), ...equipmentIssuesOf(definition)];
}


/**
 * Everything wrong with one Item definition's use surface.
 *
 * The core, `useEffects`, the named use gate with its ids, summaries and
 * nested Requirement trees, and `consumesOnUse`. Passive and equip content is
 * excluded for the same reason use content is excluded from the equipment
 * surface.
 *
 * The use resolver asks this and the registry asks findItemStructuralIssues(),
 * which is built from the same rules, so a definition one refuses the other
 * refuses too.
 */
export function findItemUseDefinitionIssues(
  candidate: unknown,
): readonly ItemDefinitionIssue[] {
  const definition = fieldsOf(candidate);

  if (definition === undefined) return [{ type: "malformed-definition" }];

  return [...coreIssuesOf(definition), ...useIssuesOf(definition)];
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


/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Every structural fault in an Item definition, as readable strings.
 *
 * What the Item registry is handed, so a host offering a malformed Item gets a
 * refusal instead of a catalog entry that breaks something later.
 *
 * EVERY SURFACE, WITH THE CORE COUNTED ONCE. The surfaces are kept apart
 * everywhere else — equipping never depends on use validity, and using never
 * depends on equipment validity — and meet here because a definition broken in
 * either half is malformed content.
 *
 * Composed from the per-surface rules rather than from the two public
 * validators' results. Both of those include the core, so concatenating them
 * would report a missing inventory mode twice. The rules themselves are shared,
 * which is what keeps registration and the use resolver in agreement: neither
 * can accept a use surface the other refuses.
 */
export function findItemStructuralIssues(
  candidate: unknown,
): readonly string[] {
  const definition = fieldsOf(candidate);

  const issues: readonly ItemDefinitionIssue[] = definition === undefined
    ? [{ type: "malformed-definition" }]
    : [
        ...coreIssuesOf(definition),
        ...equipmentIssuesOf(definition),
        ...useIssuesOf(definition),
      ];

  return issues.map((issue) => `${describeItemDefinitionIssue(issue)}.`);
}
