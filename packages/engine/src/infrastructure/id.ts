/*
 * Random id generation — the scheme behind every opaque, permanent
 * identifier the engine hands out: characters, and every catalog domain a
 * table can add its own entries to (Species, Clans, Traits, ...).
 *
 * An id built this way never depends on a name (names change and collide), a
 * creation timestamp, or where in a list something ends up. That property
 * used to be reinvented per domain — see character/id.ts's history with
 * `character-${n}` counters — so it lives here once, and every domain that
 * needs a fresh id (rather than a stable id it derives from something else)
 * calls createId with its own prefix.
 */

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 16;

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

// A fixed prefix plus 16 random lowercase-alphanumeric characters —
// hyphenated rather than underscored so the id is a legal filename component
// wherever a consumer persists one entry per file (see the workbench's vault
// bridges).
export function createId(prefix: string): string {
  return `${prefix}${randomAlphabetString(ID_LENGTH)}`;
}

// Recognises any id createId(prefix) could have produced, so a consumer can
// distinguish a generated id from a hand-authored one (e.g. a canon Species
// like "human") without duplicating the format here.
export function idPattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}[a-z0-9]{${ID_LENGTH}}$`);
}
