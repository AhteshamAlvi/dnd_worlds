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
 * list the character ends up. It is 16 random lowercase alphanumeric
 * characters behind a `char-` prefix — hyphenated rather than underscored so
 * the id is a legal filename component wherever a consumer persists sheets
 * one-per-file (see the workbench's character-vault bridge).
 */

const ID_PREFIX = "char-";
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 16;

// Recognises any id this function could have produced. Exported so a
// consumer can distinguish a generated id from a hand-authored one (e.g. a
// lore character with a readable slug) without duplicating the format here.
export const CHARACTER_ID_PATTERN = new RegExp(
  `^${ID_PREFIX}[a-z0-9]{${ID_LENGTH}}$`,
);

// A plain string alias, not a branded type: Character.id is `string` at
// every boundary this crosses (JSON files, fetch bodies, React props), and
// branding it would force an unwrap at every one of those edges for no
// benefit an opaque-by-convention id doesn't already give.
export type CharacterId = string;

function randomAlphabetString(length: number): string {
  const bytes = new Uint8Array(length);

  // Web Crypto is global in every environment this engine actually runs in
  // (every browser, Node 20+). The Math.random fallback exists only so an
  // unusual embedding degrades instead of throwing — it is not expected to
  // execute in practice.
  const cryptoSource = globalThis.crypto;
  if (cryptoSource?.getRandomValues) {
    cryptoSource.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let out = "";
  for (let i = 0; i < length; i++) {
    out += ID_ALPHABET[(bytes[i] as number) % ID_ALPHABET.length];
  }
  return out;
}

export function createCharacterId(): CharacterId {
  return `${ID_PREFIX}${randomAlphabetString(ID_LENGTH)}`;
}
