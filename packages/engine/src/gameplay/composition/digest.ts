/*
 * A stable fingerprint for a bound fact.
 *
 * Staleness is the whole reason this exists. A snapshot binds the positions
 * and conditions a decision was made against, and settlement has to be able to
 * ask "is any of that different now" without the host being made to invent and
 * maintain a revision string for every coordinate it reports. Fingerprinting
 * the bound value answers it from the value itself.
 *
 * `JSON.stringify` alone cannot do this: it preserves key insertion order, so
 * the same position built by two code paths produces two strings and every
 * settlement looks stale. Keys are therefore sorted at every depth, and array
 * order is preserved because in an array order IS the value.
 *
 * The output is a hex string over a plain 32-bit FNV-1a. This is a change
 * DETECTOR and explicitly not a security primitive — nothing here defends
 * against a crafted collision, and nothing should be built on it that would
 * need to. It is deterministic, dependency-free and identical on every host,
 * which is the entire requirement.
 */

import type { JsonValue } from "../../infrastructure/json";


/**
 * A value's canonical text, with object keys ordered and arrays left alone.
 *
 * `undefined` inside an object is dropped, matching what JSON does, so a
 * field explicitly set to undefined and a field never set fingerprint alike —
 * which is correct, because neither survives the serialization boundary these
 * shapes are required to cross.
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  return `{${
    entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")
  }}`;
}


const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;


/** A deterministic fingerprint of any JSON-safe value. */
export function digestOf(value: JsonValue | unknown): string {
  const text = canonicalJson(value);

  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }

  /* Unsigned, fixed width, so one value always prints one revision. */
  return (hash >>> 0).toString(16).padStart(8, "0");
}
