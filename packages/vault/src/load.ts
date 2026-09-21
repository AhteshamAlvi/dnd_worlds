/*
 * The pipeline, in the order the stages have to happen.
 *
 *   discover -> parse -> migrate -> structural -> duplicates
 *            -> semantic (references) -> dependency order
 *
 * The order is not a preference. Each stage needs the previous one's guarantee:
 *
 * PARSE before anything, because `{ "kind": "species"` with a missing brace has no
 * fields to validate.
 *
 * MIGRATE before validation, because an old document is not an invalid document —
 * judging a version-1 file by version-3 rules would report a dozen faults whose
 * single real cause is that nobody has migrated it yet.
 *
 * STRUCTURAL before semantic, because "does the referenced id exist" is
 * unanswerable for a document whose reference field is a number.
 *
 * DUPLICATES before references, because a reference index built over two documents
 * claiming one id would resolve to whichever won, and nothing should win.
 *
 * DEPENDENCY ORDER last, because it is an ordering over documents already known to
 * be individually valid and collectively unambiguous.
 *
 * ── ONE BAD FILE DOES NOT HIDE THE OTHERS ───────────────────────────────
 *
 * Every stage collects rather than throwing. A malformed file is recorded with its
 * repository-relative path and the walk continues, so somebody fixing a Vault gets
 * the whole list in one run rather than one fault per run. The load as a WHOLE
 * still fails — a partial Vault must never reach gameplay — but it fails knowing
 * everything that is wrong with it.
 */

import { readFileSync } from "node:fs";

import {
  VAULT_SCHEMA_VERSIONS,
  findCharacterDocumentIssues,
  findDuplicateIdIssues,
  findEmissionProfileDocumentIssues,
  findItemDefinitionDocumentIssues,
  findItemInstanceIssues,
  findPropagationPresetIssues,
  findSpeciesDocumentIssues,
  isVaultDocumentKind,
  lookupOver,
  migrateDocument,
  referenceVerdictIssue,
  resolveVaultReference,
  type EngineError,
  type IdentifiedDocument,
  type JsonObject,
  type MigrationStep,
  type VaultDocument,
  type VaultDocumentKind,
  type VaultProvenance,
  type Warning,
} from "@nenworld/engine";

import { discoverJsonFiles, type DiscoveredFile } from "./discover";
import { LOAD_ROOTS } from "./paths";


/** One document that made it all the way through, with where it came from. */
export interface LoadedDocument {
  readonly document: VaultDocument;
  readonly provenance: VaultProvenance;
  readonly path: string;
  readonly absolutePath: string;
}


export interface VaultLoadResult {
  /** Dependency-ordered: a referent always precedes anything referencing it. */
  readonly documents: readonly LoadedDocument[];

  readonly errors: readonly EngineError[];
  readonly warnings: readonly Warning[];

  /** Files that were read, whether or not they became documents. */
  readonly filesRead: number;
}


export interface VaultLoadOptions {
  readonly roots?: readonly string[];

  /**
   * Migrations to apply. Empty is the honest default: every kind is at version 1
   * and there is nothing to migrate yet.
   */
  readonly migrations?: readonly MigrationStep[];
}


/*
 * Which validator owns each kind.
 *
 * A lookup rather than a switch, so adding a kind is adding an entry. A switch
 * with a `default:` that silently accepted an unmapped kind is exactly how a
 * document type ends up loading with nothing checking it.
 */
const VALIDATORS: Readonly<
  Record<VaultDocumentKind, (candidate: unknown, path?: string) => readonly EngineError[]>
> = {
  species: findSpeciesDocumentIssues,
  "item-definition": findItemDefinitionDocumentIssues,
  "emission-profile": findEmissionProfileDocumentIssues,
  "propagation-preset": findPropagationPresetIssues,
  character: findCharacterDocumentIssues,
  "item-instance": findItemInstanceIssues,
};


export function loadVault(options: VaultLoadOptions = {}): VaultLoadResult {
  const files = discoverJsonFiles(options.roots ?? LOAD_ROOTS);
  const migrations = options.migrations ?? [];

  const errors: EngineError[] = [];
  const warnings: Warning[] = [];
  const loaded: LoadedDocument[] = [];

  for (const file of files) {
    const parsed = parseFile(file);

    if (parsed.status === "failed") {
      errors.push(parsed.error);
      continue;
    }

    const kind = parsed.value.kind;

    if (!isVaultDocumentKind(kind)) {
      errors.push({
        code: "vault.load.kind.unknown",
        message: `${file.path} does not declare a document kind this engine implements.`,
        audience: "developer",
        subject: { kind: "file", id: file.path },
        required: Object.keys(VALIDATORS),
        actual: typeof kind === "string" ? kind : null,
      });
      continue;
    }

    const migrated = migrateDocument(kind, parsed.value, migrations);

    if (migrated.status === "refused") {
      for (const error of migrated.errors) {
        errors.push(withFile(error, file.path));
      }
      continue;
    }

    if (migrated.status === "migrated") {
      for (const warning of migrated.warnings) warnings.push(warning);
    }

    const document = migrated.document;
    const structural = VALIDATORS[kind](document, kind);

    if (structural.length > 0) {
      for (const error of structural) errors.push(withFile(error, file.path));
      continue;
    }

    const validated = document as VaultDocument;

    loaded.push({
      document: validated,
      provenance: {
        source: "vault",
        kind,
        id: validated.id,
        schemaVersion: validated.schemaVersion,
        path: file.path,
      },
      path: file.path,
      absolutePath: file.absolutePath,
    });
  }

  const identified: readonly IdentifiedDocument[] = loaded.map((entry) => ({
    kind: entry.provenance.kind,
    id: entry.provenance.id,
    path: entry.path,
  }));

  const duplicates = findDuplicateIdIssues(identified);

  errors.push(...duplicates);

  /*
   * References are resolved only once ids are known to be unique. A lookup built
   * over a duplicated id would answer with whichever document was seen first,
   * which would make a wrong-kind reference resolve cleanly against the wrong
   * document — a silent pass where there should be a refusal.
   */
  if (duplicates.length === 0) {
    const lookup = lookupOver(identified);

    for (const entry of loaded) {
      for (const [path, reference] of referencesIn(entry.document)) {
        const issue = referenceVerdictIssue(
          resolveVaultReference(reference, lookup),
          path,
        );

        if (issue !== undefined) errors.push(withFile(issue, entry.path));
      }
    }
  }

  return {
    documents: orderByDependency(loaded),
    errors,
    warnings,
    filesRead: files.length,
  };
}


type ParseOutcome =
  | { readonly status: "parsed"; readonly value: JsonObject }
  | { readonly status: "failed"; readonly error: EngineError };


function parseFile(file: DiscoveredFile): ParseOutcome {
  let text: string;

  try {
    text = readFileSync(file.absolutePath, "utf8");
  } catch (cause) {
    return {
      status: "failed",
      error: {
        code: "vault.load.unreadable",
        message: `${file.path} could not be read: ${describeCause(cause)}`,
        audience: "developer",
        subject: { kind: "file", id: file.path },
        required: "a readable file",
        actual: file.path,
      },
    };
  }

  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch (cause) {
    /*
     * The file is named in the message because `JSON.parse` does not name it. A
     * bare "Unexpected token } in JSON at position 412" for one of forty files is
     * a message that requires a search to act on.
     */
    return {
      status: "failed",
      error: {
        code: "vault.load.malformed-json",
        message: `${file.path} is not valid JSON: ${describeCause(cause)}`,
        audience: "developer",
        subject: { kind: "file", id: file.path },
        required: "valid JSON",
        actual: file.path,
      },
    };
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      status: "failed",
      error: {
        code: "vault.load.not-an-object",
        message: `${file.path} must contain a JSON object.`,
        audience: "developer",
        subject: { kind: "file", id: file.path },
        required: "a JSON object",
        actual: Array.isArray(value) ? "array" : typeof value,
      },
    };
  }

  return { status: "parsed", value: value as JsonObject };
}


function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}


/** The same diagnostic, with the file it came from named in its subject. */
function withFile(error: EngineError, path: string): EngineError {
  return {
    ...error,
    message: `${path}: ${error.message}`,
    subject: error.subject ?? { kind: "file", id: path },
    resolution: error.resolution ?? `See ${path}.`,
  };
}


/*
 * Every reference a document makes, with the field path that made it.
 *
 * A generic walk rather than a per-kind list of fields, because the alternative is
 * a table somebody has to extend every time a document gains a reference — and the
 * failure of forgetting is silent: the new reference is simply never checked.
 *
 * A reference is recognised structurally: an object with exactly a `kind` that is a
 * known document kind and a string `id`. That shape is specific enough not to
 * collide with the other two-field objects in these documents (`appliesTo` carries
 * `type`, not `kind`).
 */
function referencesIn(
  document: VaultDocument,
): readonly [string, { kind: VaultDocumentKind; id: string }][] {
  const found: [string, { kind: VaultDocumentKind; id: string }][] = [];

  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`));
      return;
    }

    if (typeof node !== "object" || node === null) return;

    const record = node as Record<string, unknown>;
    const keys = Object.keys(record);

    if (
      keys.length === 2 && keys.includes("kind") && keys.includes("id") &&
      isVaultDocumentKind(record.kind) && typeof record.id === "string"
    ) {
      found.push([path, { kind: record.kind, id: record.id }]);
      return;
    }

    for (const [key, value] of Object.entries(record)) walk(value, `${path}.${key}`);
  };

  /*
   * The envelope is skipped rather than walked. A document's own `kind` and `id`
   * sit at the top level, and a walk that started there would read the document
   * as a reference to itself.
   */
  for (const [key, value] of Object.entries(document)) {
    if (key === "kind" || key === "id" || key === "schemaVersion") continue;

    walk(value, `${document.kind}:${document.id}.${key}`);
  }

  return found;
}


/**
 * Documents ordered so that nothing references something later in the list.
 *
 * Needed because hydration is staged: an emission profile cannot be assembled
 * until the propagation preset it borrows has been loaded, and an Item instance
 * cannot resolve until its definition has. A caller walking the list in order can
 * build each document knowing its referents are already built.
 *
 * Kahn's algorithm with a CANONICAL tie-break. That tie-break is the whole
 * subtlety: a topological sort is not unique, so choosing the next ready node by
 * insertion order would make the output depend on discovery order, and every
 * artifact built from it would differ between machines. Ready nodes are taken in
 * id order instead.
 *
 * A cycle cannot strand documents here. Anything still unemitted after the ready
 * set empties is appended in id order, because reference cycles are diagnosed by
 * the reference pass — and dropping documents from a list whose job is to carry
 * all of them would turn one reported fault into a second, silent one.
 */
function orderByDependency(loaded: readonly LoadedDocument[]): readonly LoadedDocument[] {
  const byId = new Map(loaded.map((entry) => [entry.provenance.id, entry]));

  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  for (const entry of loaded) {
    dependencies.set(entry.provenance.id, new Set());
  }

  for (const entry of loaded) {
    for (const [, reference] of referencesIn(entry.document)) {
      if (!byId.has(reference.id) || reference.id === entry.provenance.id) continue;

      dependencies.get(entry.provenance.id)?.add(reference.id);

      const existing = dependents.get(reference.id) ?? new Set<string>();

      existing.add(entry.provenance.id);
      dependents.set(reference.id, existing);
    }
  }

  const ordered: LoadedDocument[] = [];
  const emitted = new Set<string>();

  const readyIds = (): readonly string[] =>
    [...dependencies.entries()]
      .filter(([id, needs]) => !emitted.has(id) && [...needs].every((need) => emitted.has(need)))
      .map(([id]) => id)
      .sort();

  for (let ready = readyIds(); ready.length > 0; ready = readyIds()) {
    for (const id of ready) {
      const entry = byId.get(id);

      if (entry === undefined) continue;

      ordered.push(entry);
      emitted.add(id);
    }
  }

  const stranded = loaded
    .filter((entry) => !emitted.has(entry.provenance.id))
    .sort((left, right) =>
      left.provenance.id < right.provenance.id ? -1 : 1
    );

  return [...ordered, ...stranded];
}


/**
 * Just the ids one document points at, sorted and deduplicated.
 *
 * The reference index's view. Exported because the index generator must derive
 * relationships from the SAME walk the reference validation used — two walks over
 * the same documents would be two definitions of "what counts as a reference",
 * and an index that disagreed with validation would show backlinks that nothing
 * checked.
 */
export function documentReferenceIds(document: VaultDocument): readonly string[] {
  return [...new Set(referencesIn(document).map(([, reference]) => reference.id))].sort();
}


/** The supported version window, for a CLI or a host reporting its capabilities. */
export const SUPPORTED_SCHEMA_VERSIONS = VAULT_SCHEMA_VERSIONS;
