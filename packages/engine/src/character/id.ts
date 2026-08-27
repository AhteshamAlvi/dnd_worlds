/*
 * Character identity — opaque, random, and permanent.
 *
 * Ids used to be assigned by the workbench as `character-${n}`, a counter
 * that baked creation order into identity: deleting a character left a gap
 * or invited reusing its number, duplicating one had to invent a new counter
 * value, and every consumer had to agree on what "next" meant. None of that
 * is a rule a player would ever argue about, but it is exactly the kind of
 * cross-cutting concern the three consumers (workbench, Foundry module,
 * Obsidian plugin) need to agree on identically — which is why it lives here
 * rather than being reinvented per UI.
 *
 * createCharacterId takes no arguments on purpose: an id must never depend on
 * a name (names change and collide), a creation timestamp, or where in a
 * list the character ends up. It is built on the shared generator in
 * infrastructure/id.ts, which every catalog domain (Species, Clans, Traits,
 * ...) now uses the same way — see character/catalogs.ts.
 */

import { createId, idPattern } from "../infrastructure/id";

const ID_PREFIX = "char-";

// Recognises any id this function could have produced. Exported so a
// consumer can distinguish a generated id from a hand-authored one (e.g. a
// lore character with a readable slug) without duplicating the format here.
export const CHARACTER_ID_PATTERN = idPattern(ID_PREFIX);

// A plain string alias, not a branded type: Character.id is `string` at
// every boundary this crosses (JSON files, fetch bodies, React props), and
// branding it would force an unwrap at every one of those edges for no
// benefit an opaque-by-convention id doesn't already give.
export type CharacterId = string;

export function createCharacterId(): CharacterId {
  return createId(ID_PREFIX);
}
