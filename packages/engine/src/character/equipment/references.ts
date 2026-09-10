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
 *
 * They also refuse to HAND BACK an unvalidated value, which is a separate
 * promise and the one that is easy to break. A lookup that matched on
 * `entryId` alone and then narrowed the result to CharacterItem would return
 * `{ entryId: "sword-1" }` — no itemId, no quantity, no state — typed as a
 * complete entry, and every caller downstream would dereference fields that
 * are not there. Matching an id proves an id matched; it proves nothing about
 * the rest of the object, so the shape is checked before the value leaves.
 */

import type { CharacterId } from "../id";

import { isCharacterItemShape, isInventoryEntryId } from "./validation";

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

/*
 * isInventoryEntryId lives in validation.ts, beside the other field rules, and
 * is re-exported here because an entry id is a reference concept to everyone
 * outside this directory.
 */
export { isInventoryEntryId };


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
 * Four distinguishable answers rather than one absence, because they call for
 * four different responses: a malformed REFERENCE is a caller bug, a
 * mismatched owner is a reference used against the wrong sheet, an unknown
 * entry is an object that has been consumed, dropped or merged away — the only
 * one a player can cause — and a malformed ENTRY is corrupt stored state,
 * which is a repair job on the sheet rather than anything the caller did.
 *
 * The last is deliberately not folded into "unknown-entry". The object IS
 * there and cannot be used, and telling a host it does not exist would invite
 * exactly the wrong fix.
 */
export type InventoryReferenceIssue =
  | "invalid-reference"
  | "character-mismatch"
  | "unknown-entry"
  | "invalid-entry";

/**
 * One reference issue, as a sentence addressed to a developer.
 *
 * Shared by every resolver that takes an InventoryItemRef, so the equip
 * transition and the use resolver describe one failure the same way while each
 * keeps its own diagnostic code.
 */
export function describeInventoryReferenceIssue(
  issue: InventoryReferenceIssue,
): string {
  switch (issue) {
    case "invalid-reference":
      return "The inventory reference is not a well-formed { characterId, entryId }.";

    case "character-mismatch":
      return "The inventory reference names a different character than the one supplied.";

    case "unknown-entry":
      return "The character owns no inventory entry with that id.";

    case "invalid-entry":
      return "The named inventory entry is present but structurally invalid.";
  }
}


export type InventoryEntryResolution =
  | { readonly ok: true; readonly entry: CharacterItem }
  | { readonly ok: false; readonly issue: InventoryReferenceIssue };


/**
 * Find a STRUCTURALLY SOUND entry by identity.
 *
 * Never by position: this is the function that exists so no caller writes
 * `items[index]`. An inventory holding a malformed entry is walked past rather
 * than dereferenced, so a lookup over half-validated state still answers.
 *
 * A candidate whose id matches but whose shape does not is not returned, which
 * is what makes the CharacterItem in the signature true. Catalog membership is
 * a separate question and stays outside: whether "spirit-blade" is an Item the
 * engine knows depends on what a host registered, and a lookup that answered
 * differently before and after a catalog load would be a lookup nobody could
 * reason about. See findInventoryEntryOutcome() for telling the two apart.
 */
export function findInventoryEntry(
  items: readonly CharacterItem[] | undefined,
  entryId: unknown,
): CharacterItem | undefined {
  const found = findInventoryEntryOutcome(items, entryId);

  return found.ok ? found.entry : undefined;
}


/**
 * The same lookup, keeping the difference between absent and malformed.
 *
 * findInventoryEntry() collapses both to `undefined`, which is the right
 * answer for a caller that only wants the object. A caller that has to explain
 * itself needs to know which happened, because "you no longer have that" and
 * "that entry is corrupt" lead to opposite fixes.
 */
export function findInventoryEntryOutcome(
  items: readonly CharacterItem[] | undefined,
  entryId: unknown,
): InventoryEntryResolution {
  if (!Array.isArray(items) || !isInventoryEntryId(entryId)) {
    return { ok: false, issue: "unknown-entry" };
  }

  const candidate = (items as readonly unknown[]).find((entry) =>
    typeof entry === "object" &&
    entry !== null &&
    (entry as { entryId?: unknown }).entryId === entryId
  );

  if (candidate === undefined) return { ok: false, issue: "unknown-entry" };

  return isCharacterItemShape(candidate)
    ? { ok: true, entry: candidate }
    : { ok: false, issue: "invalid-entry" };
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

  return findInventoryEntryOutcome(items, ref.entryId);
}
