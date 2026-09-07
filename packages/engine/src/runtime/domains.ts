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


/** A thing an event or request points at, without naming what kind it is. */
export interface RuntimeActorRef {
  readonly domain: RuntimeDomain;

  /**
   * Stable within its domain. Used as the final ordering key when two
   * simultaneous changes cannot be aggregated, so it must not be an array
   * index or anything else that moves when the caller reorders its input.
   */
  readonly id: string;
}


export function isRuntimeDomain(value: unknown): value is RuntimeDomain {
  return (
    typeof value === "string" &&
    (RUNTIME_DOMAINS as readonly string[]).includes(value)
  );
}
