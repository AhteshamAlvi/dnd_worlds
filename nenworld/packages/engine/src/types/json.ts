/*
 * The shape of anything that can safely cross a serialization boundary.
 *
 * Traces and engine results must survive JSON.stringify intact: they get
 * copied into bug reports, committed as golden-test snapshots, and passed to
 * the Foundry and Obsidian adapters. Constraining those types to JsonValue
 * makes that a compile error rather than a runtime surprise — no functions,
 * no class instances, no Map/Set, no circular references.
 */

export type JsonPrimitive =
    | string
    | number
    | boolean
    | null;

export type JsonObject = {
    [key: string]: JsonValue;
};

export type JsonArray = JsonValue[];

export type JsonValue = 
    | JsonPrimitive
    | JsonObject
    | JsonArray;