/*
 * Generated indexes: the same content must always produce the same bytes.
 *
 * These files are committed, so any dependence on anything other than the content
 * would make every developer produce a different index from the same Vault — and the
 * diff would be noise hiding the one line that really changed.
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildDocumentIndex,
  buildReferenceIndex,
  documentReferenceIds,
  indexesAreCurrent,
  loadVault,
  serializeIndex,
} from "../index";

import type { LoadedDocument } from "../load";


const VALID = join(fileURLToPath(new URL("./fixtures/", import.meta.url)), "valid-vault");

function loaded(): readonly LoadedDocument[] {
  return loadVault({ roots: [VALID] }).documents;
}

function build(documents: readonly LoadedDocument[]): readonly [string, string] {
  return [
    serializeIndex(buildDocumentIndex(documents)),
    serializeIndex(buildReferenceIndex(documents, (entry) => documentReferenceIds(entry.document))),
  ];
}


describe("T33 — enumeration order does not reach the bytes", () => {
  it("produces byte-identical indexes from every ordering of the same documents", () => {
    /*
     * M14 and M15 both land here. The documents are permuted explicitly rather than
     * relying on the filesystem to hand them over differently, because a test that
     * depended on `readdir` being unstable would pass vacuously on a machine where it
     * happens to be stable.
     */
    const documents = loaded();

    expect(documents.length).toBeGreaterThan(2);

    const orderings: readonly (readonly LoadedDocument[])[] = [
      documents,
      [...documents].reverse(),
      [...documents].slice(1).concat(documents[0]!),
      [...documents].sort((left, right) =>
        left.path > right.path ? -1 : left.path < right.path ? 1 : 0
      ),
    ];

    const rendered = orderings.map(build);
    const [expectedDocuments, expectedReferences] = rendered[0]!;

    for (const [documentIndex, referenceIndex] of rendered) {
      expect(documentIndex).toBe(expectedDocuments);
      expect(referenceIndex).toBe(expectedReferences);
    }
  });

  it("is stable across repeated generation from the same tree", () => {
    expect(build(loaded())).toEqual(build(loaded()));
  });
});


describe("T34 — what an index entry contains, and what it must not", () => {
  it("records id, kind, schema version and a relative path", () => {
    const index = buildDocumentIndex(loaded());

    expect(index.documents.length).toBeGreaterThan(0);

    for (const entry of index.documents) {
      expect(Object.keys(entry).sort()).toEqual(["id", "kind", "path", "schemaVersion"]);
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.kind).toBe("string");
      expect(Number.isInteger(entry.schemaVersion)).toBe(true);
      expect(entry.path.startsWith("/")).toBe(false);
      expect(entry.path).not.toContain("\\");
    }

    // Sorted by id, so a diff is about content rather than about who ran it.
    expect(index.documents.map((entry) => entry.id))
      .toEqual([...index.documents.map((entry) => entry.id)].sort());
  });

  it("contains no timestamp and no absolute path", () => {
    /* M15. Either one would make every rebuild a diff. */
    const [documentIndex, referenceIndex] = build(loaded());

    for (const serialized of [documentIndex, referenceIndex]) {
      expect(serialized).not.toContain("/Users/");
      expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      expect(serialized).not.toMatch(/"(generatedAt|timestamp|createdAt|updatedAt)"/);
      expect(serialized).not.toMatch(/[A-Za-z]:\\\\/);
    }
  });

  it("records backlinks, which is what a plugin needs and no document stores", () => {
    const index = buildReferenceIndex(
      loaded(),
      (entry) => documentReferenceIds(entry.document),
    );

    const preset = index.relationships.find((entry) => entry.id === "fixture-sound");

    expect(preset?.references).toEqual([]);
    expect(preset?.referencedBy).toEqual(["fixture-clang"]);

    const profile = index.relationships.find((entry) => entry.id === "fixture-clang");

    expect(profile?.references).toEqual(["fixture-sound"]);
    expect(profile?.referencedBy).toEqual([]);

    // Every id appears exactly once, sorted.
    const ids = index.relationships.map((entry) => entry.id);

    expect(ids).toEqual([...new Set(ids)].sort());
  });

  it("ends with a newline and uses two-space indentation", () => {
    const [documentIndex] = build(loaded());

    expect(documentIndex.endsWith("\n")).toBe(true);
    expect(documentIndex).toContain('\n  "documents": [');
  });

  it("reports a directory with no index as not current, rather than throwing", () => {
    const documents = loaded();

    expect(indexesAreCurrent(
      buildDocumentIndex(documents),
      buildReferenceIndex(documents, (entry) => documentReferenceIds(entry.document)),
      join(VALID, "no-such-indexes"),
    )).toBe(false);
  });
});
