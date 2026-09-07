/*
 * Who owns what.
 *
 * The state-ownership matrix, as a vocabulary the protocol can name rather
 * than as prose in a document that can drift from the code. Every event names
 * the domain that produced it and every request names the domain that must
 * resolve it, so a domain acting outside its own state is visible in the data
 * rather than only in a review.
 *
 * The full matrix, with the reasoning, is RUNTIME_PROTOCOL.md. This file is
 * the part of it the type system enforces.
 */


/**
 * The state owners.
 *
 * `character` is permanent: Attributes, learned mastery, persistent Conditions
 * and Injuries. `runtime` is temporary: what is true right now and stops being
 * true later. The split is the whole point of the vocabulary — an active Ren
 * belongs to `runtime` and the Ren mastery that permits it belongs to
 * `character`, and nothing may put an activation flag on the permanent side.
 */
export const RUNTIME_DOMAINS = [
  /* Permanent character data: Attributes, learned mastery, progression. */
  "character",

  /* Current Aura and persistent Aura allocations. */
  "aura",

  /* Anatomical structure, integrity and Body Points. */
  "body",

  /* Persistent Conditions and Injuries. */
  "character-status",

  /* Temporary facts currently true: active applications, transformations. */
  "runtime",

  /*
   * Remaining Actions, Turn, Reaction, Initiative.
   *
   * Named here so requests can be addressed to it. Nothing in this folder
   * imports Combat — see the coordinator's header.
   */
  "combat",

  /* The world clock and the intervals it produces. */
  "time",

  /* The host: dice, commands, operation identity. */
  "caller",
] as const;

export type RuntimeDomain = typeof RUNTIME_DOMAINS[number];


/**
 * WHICH state, not just which kind of state.
 *
 * A domain alone cannot address anything in a scene with two characters in it.
 * "aura" is a KIND of state; Gon's Aura and Killua's Aura are two of them, and
 * an operation where one strikes the other touches both. Keying anything by
 * domain alone silently merges them — the second write wins, and a fight
 * between two people resolves as though it were one person hitting themselves.
 *
 * So every request, event and stored state names a domain AND an id. Handlers
 * are still registered per domain, because the RULES are per domain: there is
 * one Aura mechanic and it applies to everybody. What differs is the state it
 * is handed.
 */
export interface RuntimeOwnerRef {
  readonly domain: RuntimeDomain;

  /**
   * Stable within its domain. Used as the final ordering key for simultaneous
   * changes, so it must not be an array index or anything else that moves when
   * the caller reorders its input.
   *
   * A domain with exactly one instance in the world — the clock, the caller —
   * conventionally uses its own domain name.
   */
  readonly id: string;
}


/**
 * The key one owner's state is stored under.
 *
 * Deliberately not just the id: two domains may legitimately use the same id
 * for their own view of one character, and Gon's Body and Gon's Aura are
 * different states that must not collide.
 */
export function ownerKey(owner: RuntimeOwnerRef): string {
  return `${owner.domain}:${owner.id}`;
}


export function sameOwner(
  left: RuntimeOwnerRef,
  right: RuntimeOwnerRef,
): boolean {
  return left.domain === right.domain && left.id === right.id;
}


export function isRuntimeOwnerRef(value: unknown): value is RuntimeOwnerRef {
  if (value === null || typeof value !== "object") return false;

  const candidate = value as RuntimeOwnerRef;

  return (
    isRuntimeDomain(candidate.domain) &&
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0
  );
}


export function isRuntimeDomain(value: unknown): value is RuntimeDomain {
  return (
    typeof value === "string" &&
    (RUNTIME_DOMAINS as readonly string[]).includes(value)
  );
}
