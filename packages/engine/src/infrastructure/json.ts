/*
 * The shape of anything that can safely cross a serialization boundary.
 *
 * Traces and engine results must survive JSON.stringify intact: they get
 * copied into bug reports, committed as golden-test snapshots, and passed to
 * the Foundry and Obsidian adapters. Constraining those types to JsonValue
 * makes that a compile error rather than a runtime surprise — no functions,
 * no class instances, no Map/Set, no circular references.
 */

// The leaf types JSON allows.
export type JsonPrimitive =
    | string
    | number
    | boolean
    | null;

// A JSON object; every value is itself a JsonValue.
export type JsonObject = {
    [key: string]: JsonValue;
};

// A JSON array of JsonValues.
export type JsonArray = JsonValue[];

// Anything that survives JSON.stringify intact.
export type JsonValue =
    | JsonPrimitive
    | JsonObject
    | JsonArray;

/*
 * Whether a value really would survive `JSON.stringify` and come back equal.
 *
 * The runtime counterpart to the types above, needed wherever a value crosses
 * the boundary as `unknown` — an opaque payload a host assembled, restored
 * from a save file, or handed over by content the engine did not author. The
 * type alone cannot refuse those, and the failure it misses is silent: a
 * `Map`, a function or a `Date` stringifies to `{}` or disappears, so the
 * value that comes back is not the value that went in.
 *
 * Deliberately stricter than "stringify did not throw":
 *
 *   `undefined`     is not JSON. As an object VALUE it vanishes on the way
 *                   through, so a record containing one does not round-trip.
 *   `NaN`/Infinity  stringify to `null`, which is a different value.
 *   cycles          are refused by walking with a seen-set rather than by
 *                   catching the throw, so the answer is the same for a cycle
 *                   and for every other rejection.
 *
 * Prototype-bearing objects are refused too: only plain objects and arrays
 * pass, because a class instance's methods are exactly what stringify drops.
 */
export function isJsonValue(value: unknown): value is JsonValue {
  const seen = new Set<unknown>();

  const walk = (node: unknown): boolean => {
    if (node === null) return true;

    const type = typeof node;

    if (type === "string" || type === "boolean") return true;

    if (type === "number") return Number.isFinite(node as number);

    if (type !== "object") return false;

    if (seen.has(node)) return false;

    seen.add(node);

    const ok = Array.isArray(node)
      ? node.every(walk)
      : Object.getPrototypeOf(node) === Object.prototype ||
          Object.getPrototypeOf(node) === null
      ? Object.values(node as Record<string, unknown>).every(walk)
      : false;

    seen.delete(node);

    return ok;
  };

  return walk(value);
}
