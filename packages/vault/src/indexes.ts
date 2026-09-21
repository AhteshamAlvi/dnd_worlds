/*
 * Generated indexes: byte-deterministic, and never authority.
 *
 * An index answers two questions fast without opening forty files: which file holds
 * the document with this id, and what references what. Both answers are derived —
 * delete the whole directory and a rebuild loses nothing.
 *
 * That is what makes staleness a non-problem rather than a correctness hazard. A
 * stale index is never consulted as truth: `validate` rebuilds from the documents
 * and compares, and a mismatch means the index is out of date, never that the
 * documents are wrong.
 *
 * ── WHY BYTE-DETERMINISM IS THE POINT ───────────────────────────────────
 *
 * These files are committed. If the generator's output depended on anything but the
 * content, every developer would produce a different index from the same Vault, and
 * the diff would be noise that hides the one line that really changed.
 *
 * Three things are therefore excluded by construction:
 *
 *   TIMESTAMPS      A "generated at" field changes every run. It would make every
 *                   rebuild a diff and tell a reader nothing the commit does not.
 *   ABSOLUTE PATHS  They name somebody's home directory, and differ per machine.
 *   ENUMERATION     Entries are sorted by id in UTF-16 code-unit order, not by
 *   ORDER           `readdir` order and not with `localeCompare` — which is
 *                   locale-sensitive and would sort differently for a developer
 *                   with a different system locale.
 *
 * The output is JSON with two-space indentation and a trailing newline, which is
 * what an editor and a diff both expect.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { VaultDocumentKind } from "@nenworld/engine";

import { INDEXES_ROOT, toRepositoryRelative } from "./paths";
import type { LoadedDocument } from "./load";


export const DOCUMENT_INDEX_FILE = "documents.json";
export const REFERENCE_INDEX_FILE = "references.json";


export interface DocumentIndexEntry {
  readonly id: string;
  readonly kind: VaultDocumentKind;
  readonly schemaVersion: number;
  readonly path: string;
}


export interface DocumentIndex {
  readonly documents: readonly DocumentIndexEntry[];
}


export interface ReferenceIndexEntry {
  readonly id: string;

  /** Ids this document points at, sorted. */
  readonly references: readonly string[];

  /** Ids that point at this document, sorted. The backlinks an editor needs. */
  readonly referencedBy: readonly string[];
}


export interface ReferenceIndex {
  readonly relationships: readonly ReferenceIndexEntry[];
}


function byText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}


export function buildDocumentIndex(
  documents: readonly LoadedDocument[],
): DocumentIndex {
  return {
    documents: [...documents]
      .map((entry) => ({
        id: entry.provenance.id,
        kind: entry.provenance.kind,
        schemaVersion: entry.provenance.schemaVersion,
        path: entry.path,
      }))
      .sort((left, right) => byText(left.id, right.id)),
  };
}


export function buildReferenceIndex(
  documents: readonly LoadedDocument[],
  referencesOf: (document: LoadedDocument) => readonly string[],
): ReferenceIndex {
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();

  for (const entry of documents) {
    const id = entry.provenance.id;

    outgoing.set(id, outgoing.get(id) ?? new Set());
    incoming.set(id, incoming.get(id) ?? new Set());
  }

  for (const entry of documents) {
    const id = entry.provenance.id;

    for (const target of referencesOf(entry)) {
      if (target === id) continue;

      outgoing.get(id)?.add(target);

      const back = incoming.get(target) ?? new Set<string>();

      back.add(id);
      incoming.set(target, back);
    }
  }

  return {
    relationships: [...outgoing.keys()]
      .sort(byText)
      .map((id) => ({
        id,
        references: [...(outgoing.get(id) ?? [])].sort(byText),
        referencedBy: [...(incoming.get(id) ?? [])].sort(byText),
      })),
  };
}


/** The exact bytes an index file holds. */
export function serializeIndex(index: DocumentIndex | ReferenceIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}


export interface IndexWriteResult {
  readonly path: string;
  readonly changed: boolean;
}


export function writeIndexes(
  documentIndex: DocumentIndex,
  referenceIndex: ReferenceIndex,
  directory = INDEXES_ROOT,
): readonly IndexWriteResult[] {
  mkdirSync(directory, { recursive: true });

  return [
    writeIfChanged(join(directory, DOCUMENT_INDEX_FILE), serializeIndex(documentIndex)),
    writeIfChanged(join(directory, REFERENCE_INDEX_FILE), serializeIndex(referenceIndex)),
  ];
}


/*
 * Written only when the bytes differ.
 *
 * Not an optimization. Rewriting an identical file updates its mtime, which makes
 * every watcher, build cache and `make`-style tool downstream believe the Vault
 * changed. Determinism is only useful if it is also observable.
 */
function writeIfChanged(path: string, contents: string): IndexWriteResult {
  let existing: string | undefined;

  try {
    existing = readFileSync(path, "utf8");
  } catch {
    existing = undefined;
  }

  if (existing === contents) {
    return { path: toRepositoryRelative(path), changed: false };
  }

  writeFileSync(path, contents, "utf8");

  return { path: toRepositoryRelative(path), changed: true };
}


/** Whether what is on disk matches what the documents imply. */
export function indexesAreCurrent(
  documentIndex: DocumentIndex,
  referenceIndex: ReferenceIndex,
  directory = INDEXES_ROOT,
): boolean {
  const pairs: readonly [string, string][] = [
    [join(directory, DOCUMENT_INDEX_FILE), serializeIndex(documentIndex)],
    [join(directory, REFERENCE_INDEX_FILE), serializeIndex(referenceIndex)],
  ];

  return pairs.every(([path, expected]) => {
    try {
      return readFileSync(path, "utf8") === expected;
    } catch {
      return false;
    }
  });
}
