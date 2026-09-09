/*
 * How to name one concrete owned object.
 *
 * Every system arriving after this one has to be able to point at a particular
 * thing a character owns: Shū applies to the object in the hand, an Item use
 * consumes a specific potion, a weapon attack is made with a specific sword,
 * and a trace has to say which of two identical gauntlets produced a bonus.
 * There are three ways to write that reference and two of them are wrong.
 *
 * By ARRAY INDEX is wrong because the index is not a property of the object.
 * Sorting an inventory by name, filtering it for the equipment panel, dropping
 * an earlier entry, or round-tripping it through JSON with a different key
 * order all renumber every line while changing nothing the character owns — so
 * a stored index quietly begins naming a different object, and nothing
 * anywhere can detect that it has.
 *
 * By `itemId` is wrong because the definition id is deliberately not unique:
 * two entries may name the same Item, which is the whole point of entries. A
 * reference by itemId to a character carrying two swords names both, and the
 * consumer has to pick one — silently, by position, which is the first mistake
 * again wearing a different hat.
 *
 * So the reference is (characterId, entryId), and this file owns it. Later
 * Shū and action-selection work must use InventoryItemRef rather than an index
 * or a bare itemId.
 *
 * The lookups here take `unknown` and return results rather than throwing,
 * because a reference is exactly the kind of value that arrives from a host,
 * from a saved macro, or from a UI whose state is one render behind the sheet.
 * "The object this names is gone" is an ordinary answer, not an exception.
 */

import type { CharacterId } from "../id";

import type { CharacterItem } from "./types";


/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The stable identity of one owned inventory entry, unique within a character.
 *
 * A plain string alias for the same reason CharacterId is one: this crosses
 * JSON files, fetch bodies and host props at every edge, and branding it would
 * buy an unwrap at each of them.
 */
export type InventoryEntryId = string;


/**
 * A reference to one owned inventory ENTRY.
 *
 * This identifies an entry, not an Item definition. It may be treated as one
 * concrete object only when the entry's quantity is exactly one — see
 * isConcreteInventoryObject() in state.ts.
 *
 * The character is part of the reference because an entry id is unique within
 * a character and nowhere else: two characters may each have an entry called
 * "e1", and a reference that omitted the owner would resolve against whichever
 * inventory the caller happened to hand it.
 */
export interface InventoryItemRef {
  readonly characterId: CharacterId;
  readonly entryId: InventoryEntryId;
}


/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
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


/** Whether a value is a well-formed reference to some character's entry. */
export function isInventoryItemRef(value: unknown): value is InventoryItemRef {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as { characterId?: unknown; entryId?: unknown };

  return typeof candidate.characterId === "string" &&
    candidate.characterId.trim().length > 0 &&
    isInventoryEntryId(candidate.entryId);
}


export function createInventoryItemRef(
  characterId: CharacterId,
  entryId: InventoryEntryId,
): InventoryItemRef {
  return { characterId, entryId };
}


/* -------------------------------------------------------------------------- */
/* Lookup                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Why a reference did not resolve.
 *
 * Three distinguishable answers rather than one absence, because they call for
 * three different responses: a malformed reference is a caller bug, a
 * mismatched owner is a reference used against the wrong sheet, and an unknown
 * entry is an object that has been consumed, dropped or merged away — the only
 * one of the three a player can cause.
 */
export type InventoryReferenceIssue =
  | "invalid-reference"
  | "character-mismatch"
  | "unknown-entry";

export type InventoryEntryResolution =
  | { readonly ok: true; readonly entry: CharacterItem }
  | { readonly ok: false; readonly issue: InventoryReferenceIssue };


/**
 * Find an entry by identity.
 *
 * Never by position: this is the function that exists so no caller writes
 * `items[index]`. An inventory holding a malformed entry is walked past rather
 * than dereferenced, so a lookup over half-validated state still answers.
 */
export function findInventoryEntry(
  items: readonly CharacterItem[] | undefined,
  entryId: unknown,
): CharacterItem | undefined {
  if (!Array.isArray(items) || !isInventoryEntryId(entryId)) return undefined;

  return (items as readonly unknown[]).find((entry): entry is CharacterItem =>
    typeof entry === "object" &&
    entry !== null &&
    (entry as { entryId?: unknown }).entryId === entryId
  );
}


/**
 * Resolve a reference against the inventory of the character it names.
 *
 * Returns a result rather than throwing or returning bare undefined, so a
 * caller that has to explain itself to a player — "that potion is gone" —
 * has something to explain WITH.
 */
export function resolveInventoryItemRef(
  ref: unknown,
  characterId: CharacterId,
  items: readonly CharacterItem[] | undefined,
): InventoryEntryResolution {
  if (!isInventoryItemRef(ref)) {
    return { ok: false, issue: "invalid-reference" };
  }

  if (ref.characterId !== characterId) {
    return { ok: false, issue: "character-mismatch" };
  }

  const entry = findInventoryEntry(items, ref.entryId);

  return entry === undefined
    ? { ok: false, issue: "unknown-entry" }
    : { ok: true, entry };
}
