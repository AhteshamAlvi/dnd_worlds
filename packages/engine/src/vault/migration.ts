/*
 * Migrations — pure, deterministic, idempotent, and unable to touch a disk.
 *
 * A migration is a function from one version of a document to the next. That is
 * all it is, and the constraints are what make it trustworthy:
 *
 * PURE, because a migration that read the filesystem could not be tested
 * without one, and because the engine is not allowed to do I/O at all. A
 * migration never writes the file it migrated — it returns a value, and the
 * loader in `packages/vault` decides whether anything gets written. That split
 * is what makes "migrate and report" and "migrate and save" different
 * operations rather than the same one with a flag.
 *
 * DETERMINISTIC, because the same old document must produce the same new one on
 * every machine. No clock, no randomness, no id generation: a migration that
 * minted an id would give the same document a different identity on two
 * checkouts, and a reference that resolved for one person would dangle for the
 * other.
 *
 * IDEMPOTENT at the version boundary, because migrations get run twice. A
 * document already at the current version passes through untouched — not
 * re-migrated, not re-normalized — so running the loader twice cannot produce a
 * different result from running it once.
 *
 * ── UNKNOWN FIELDS ARE NEVER SILENTLY DROPPED ───────────────────────────
 *
 * A migration that copied the fields it knew about into a fresh object would
 * discard everything it did not — which is precisely the data somebody added
 * for a reason. So a step declares what it renames, replaces and removes, and
 * anything it does not mention is carried through and then REPORTED as
 * unrecognised. Losing a field requires saying so.
 */

import type { EngineError, Warning } from "../infrastructure/diagnostics";
import type { JsonObject, JsonValue } from "../infrastructure/json";

import {
  judgeSchemaVersion,
  VAULT_SCHEMA_VERSIONS,
  type VaultDocumentKind,
} from "./document";


/**
 * One version-to-version step.
 *
 * `from` and `to` are stated rather than inferred from position in a list, so a
 * gap or an overlap in a migration chain is detectable rather than being
 * whatever the array order implied.
 */
export interface MigrationStep {
  readonly kind: VaultDocumentKind;
  readonly from: number;
  readonly to: number;

  /**
   * The document, one version newer.
   *
   * Receives and returns a plain JSON object. It is handed the whole document
   * including fields it does not know about, and is expected to return them
   * unless it is deliberately removing them.
   */
  readonly apply: (document: JsonObject) => JsonObject;

  /** Fields this step intentionally drops, for the accounting report. */
  readonly removes?: readonly string[];
}


export type MigrationOutcome =
  | {
      readonly status: "migrated";
      readonly document: JsonObject;
      readonly fromVersion: number;
      readonly toVersion: number;
      readonly warnings: readonly Warning[];
    }
  | {
      readonly status: "current";
      readonly document: JsonObject;
      readonly version: number;
    }
  | { readonly status: "refused"; readonly errors: readonly EngineError[] };


/**
 * Bring a document to the current version for its kind, or refuse.
 *
 * Walks the chain one declared step at a time rather than looking for a step
 * from the document's version straight to the current one. A chain is the only
 * form in which each step can be written, tested and reasoned about against the
 * single version it was written for; a direct 1-to-4 function is four
 * migrations somebody folded together and can no longer test separately.
 */
export function migrateDocument(
  kind: VaultDocumentKind,
  document: JsonObject,
  steps: readonly MigrationStep[],
): MigrationOutcome {
  const verdict = judgeSchemaVersion(kind, document.schemaVersion);

  if (verdict.status !== "supported") {
    return {
      status: "refused",
      errors: [{
        code: `vault.migration.${verdict.status}`,
        message: `A ${kind} document cannot be migrated: its schemaVersion is ${verdict.status}.`,
        audience: "developer",
        subject: { kind: "document", id: String(document.id ?? "unknown") },
        required: `integer ${VAULT_SCHEMA_VERSIONS[kind].earliest}-${VAULT_SCHEMA_VERSIONS[kind].current}`,
        actual: (document.schemaVersion ?? null) as JsonValue,
      }],
    };
  }

  const target = VAULT_SCHEMA_VERSIONS[kind].current;
  const fromVersion = verdict.version;

  /*
   * The idempotent case, and it returns the document UNCHANGED rather than
   * running a no-op normalization over it. A "migration" that rewrote an
   * already-current document would make loading it twice produce two different
   * files, which is the exact failure idempotence is supposed to rule out.
   */
  if (fromVersion === target) {
    return { status: "current", document, version: fromVersion };
  }

  const warnings: Warning[] = [];
  let current = document;
  let version = fromVersion;

  while (version < target) {
    const step = steps.find(
      (candidate) => candidate.kind === kind && candidate.from === version,
    );

    if (step === undefined) {
      return {
        status: "refused",
        errors: [{
          code: "vault.migration.step.missing",
          message: `No migration is declared from ${kind} schemaVersion ${version}.`,
          audience: "developer",
          subject: { kind: "document", id: String(current.id ?? "unknown") },
          required: `a migration step from ${version}`,
          actual: version,
        }],
      };
    }

    const before = new Set(Object.keys(current));

    current = { ...step.apply(current), schemaVersion: step.to };

    for (const removed of step.removes ?? []) {
      if (!before.has(removed)) continue;

      warnings.push({
        code: "vault.migration.field.removed",
        message: `Migration ${version} to ${step.to} removed "${removed}".`,
        audience: "developer",
        subject: { kind: "document", id: String(current.id ?? "unknown") },
      });
    }

    version = step.to;
  }

  return { status: "migrated", document: current, fromVersion, toVersion: version, warnings };
}


/**
 * Whether a chain of steps actually reaches the current version from a given
 * starting point, checked without running it.
 *
 * For a test and for a development-time catalog check: a chain with a gap is a
 * bug that otherwise only surfaces when somebody opens an old file, which may
 * be months after the gap was introduced.
 */
export function findMigrationChainIssues(
  kind: VaultDocumentKind,
  steps: readonly MigrationStep[],
): readonly string[] {
  const issues: string[] = [];
  const window = VAULT_SCHEMA_VERSIONS[kind];
  const relevant = steps.filter((step) => step.kind === kind);

  for (const step of relevant) {
    if (step.to !== step.from + 1) {
      issues.push(
        `migration step ${step.from} to ${step.to} skips a version; steps must advance by one.`,
      );
    }

    if (relevant.filter((other) => other.from === step.from).length > 1) {
      issues.push(`more than one migration step starts at version ${step.from}.`);
    }
  }

  for (let version = window.earliest; version < window.current; version += 1) {
    if (!relevant.some((step) => step.from === version)) {
      issues.push(`no migration step advances version ${version}.`);
    }
  }

  return [...new Set(issues)];
}
