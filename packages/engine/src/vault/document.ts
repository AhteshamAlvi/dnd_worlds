/*
 * The envelope every portable document wears, and the four different ways a
 * version can be wrong.
 *
 * A Vault document is a JSON file somebody may edit by hand, in Obsidian, with
 * no schema-aware editor in front of them. So the first thing the engine does
 * with one is refuse to guess. It does not infer what kind of thing a file is
 * from the directory it sits in, and it does not infer the thing's identity
 * from the filename — both are organization, and both change when a human
 * tidies a folder. Kind and id are fields, present and validated, or the
 * document does not load.
 *
 * ── WHY FOUR VERSION OUTCOMES AND NOT A BOOLEAN ─────────────────────────
 *
 * "Unsupported version" collapses four situations that need four different
 * responses from whoever is reading the diagnostic:
 *
 *   missing            Not a Vault document at all, or hand-written from
 *                      scratch by someone who did not know the field exists.
 *                      The fix is to add it.
 *   malformed          Present and not a supported integer — "4", 4.5, null.
 *                      The fix is to correct it.
 *   unsupported-past   A real version this kind no longer knows how to read,
 *                      because the migration for it was retired. The fix is
 *                      an older toolchain, or a hand edit.
 *   unsupported-future Written by a NEWER engine than this one. The fix is to
 *                      upgrade, and emphatically not to load the file: a
 *                      future document's fields mean whatever the future says
 *                      they mean, and reading it with today's rules is how a
 *                      save gets silently downgraded and written back.
 *
 * A caller that cannot tell the last two apart cannot tell "your data is old"
 * from "your program is old", which are opposite instructions.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../infrastructure/diagnostics";
import { DEFINITION_ID_PATTERN } from "../infrastructure/registry";
import { isJsonValue, type JsonObject, type JsonValue } from "../infrastructure/json";


/**
 * Every kind of document this Vault can hold.
 *
 * A closed vocabulary rather than an open string, because the whole point of
 * declaring a kind is that the loader can dispatch on it. An unrecognised kind
 * is a refusal — a file naming a kind nobody implements is not a document with
 * an exotic type, it is a typo or a file from a future release.
 *
 * Deliberately NOT one entry per folder. `Definitions/Species/` and
 * `Axia/Characters/` are where a human keeps things; `species` and `character`
 * are what those things are. The two agreeing is convenient and unenforced.
 */
export const VAULT_DOCUMENT_KINDS = [
  "species",
  "item-definition",
  "emission-profile",
  "propagation-preset",
  "character",
  "item-instance",
] as const;

export type VaultDocumentKind = typeof VAULT_DOCUMENT_KINDS[number];

export function isVaultDocumentKind(value: unknown): value is VaultDocumentKind {
  return typeof value === "string" &&
    (VAULT_DOCUMENT_KINDS as readonly string[]).includes(value);
}


/**
 * The version window each kind can read, and the one it writes.
 *
 * `current` is what a migration migrates *to* and what a freshly written
 * document carries. `earliest` is the oldest version still readable — a
 * document below it is `unsupported-past` rather than something to attempt.
 *
 * Every kind starts at 1 and there is nothing to migrate yet, which is the
 * honest state rather than a pre-invented version history. The version
 * machinery is here now because retrofitting it after files exist in somebody's
 * vault means migrating documents that never declared a version.
 */
export const VAULT_SCHEMA_VERSIONS: Readonly<
  Record<VaultDocumentKind, { readonly earliest: number; readonly current: number }>
> = {
  species: { earliest: 1, current: 1 },
  "item-definition": { earliest: 1, current: 1 },
  "emission-profile": { earliest: 1, current: 1 },
  "propagation-preset": { earliest: 1, current: 1 },
  character: { earliest: 1, current: 1 },
  "item-instance": { earliest: 1, current: 1 },
};


/**
 * What every portable document carries, whatever kind it is.
 *
 * `name` is a display name for a human picking this out of a list. It is not
 * an identifier, nothing resolves by it, and two documents may share one.
 */
export interface VaultDocumentEnvelope {
  readonly schemaVersion: number;
  readonly kind: VaultDocumentKind;
  readonly id: string;
  readonly name: string;
}

/** An envelope plus whatever the kind itself declares. */
export type VaultDocument = VaultDocumentEnvelope & JsonObject;


export type SchemaVersionVerdict =
  | { readonly status: "supported"; readonly version: number }
  | { readonly status: "missing" }
  | { readonly status: "malformed" }
  | { readonly status: "unsupported-past"; readonly version: number }
  | { readonly status: "unsupported-future"; readonly version: number };


/**
 * Which of the five things is true of a candidate's `schemaVersion`.
 *
 * Separated from the diagnostic that reports it, because the loader needs the
 * verdict to decide whether to migrate, and a caller that had to pattern-match
 * an error code string to find out would be parsing prose.
 */
export function judgeSchemaVersion(
  kind: VaultDocumentKind,
  value: unknown,
): SchemaVersionVerdict {
  if (value === undefined || value === null) return { status: "missing" };

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return { status: "malformed" };
  }

  const window = VAULT_SCHEMA_VERSIONS[kind];

  if (value < window.earliest) return { status: "unsupported-past", version: value };
  if (value > window.current) return { status: "unsupported-future", version: value };

  return { status: "supported", version: value };
}


/**
 * Everything wrong with a candidate's envelope.
 *
 * Reads through `unknown` throughout. This is the function standing between a
 * hand-edited JSON file and the rest of the engine, so it may be handed a
 * number, an array, `null`, or an object whose every field is a lie — and a
 * validator that trusted its parameter type would throw on the first field it
 * read instead of reporting on it.
 *
 * Kind is judged before version because the version window is per-kind: there
 * is no way to say whether 3 is readable without knowing what it is 3 of.
 */
export function findVaultEnvelopeIssues(
  candidate: unknown,
  path = "document",
): readonly EngineError[] {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return [{
      code: "vault.document.not-an-object",
      message: "A Vault document must be a JSON object.",
      audience: "developer",
      subject: { kind: "field", id: path },
      required: "object",
      actual: describeDiagnosticValue(candidate),
    }];
  }

  const errors: EngineError[] = [];
  const document = candidate as Record<string, unknown>;

  if (!isVaultDocumentKind(document.kind)) {
    errors.push({
      code: "vault.document.kind.unknown",
      message: "A Vault document must declare a kind this engine implements.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.kind` },
      required: [...VAULT_DOCUMENT_KINDS],
      actual: describeDiagnosticValue(document.kind),
    });
  } else {
    errors.push(...findSchemaVersionIssues(document.kind, document.schemaVersion, path));
  }

  /*
   * Identity is held to the same pattern as an authored definition id, so that
   * one id is usable as a JSON key, a URL segment and a filename component
   * without escaping anywhere. A document whose id needed quoting somewhere
   * would be a document some consumer down the line spells differently.
   */
  if (
    typeof document.id !== "string" ||
    document.id.trim().length === 0 ||
    !DEFINITION_ID_PATTERN.test(document.id)
  ) {
    errors.push({
      code: "vault.document.id.invalid",
      message:
        "A Vault document must carry a stable id of lowercase letters, digits and single hyphens.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.id` },
      required: "lowercase letters, digits and single hyphens",
      actual: describeDiagnosticValue(document.id),
    });
  }

  if (typeof document.name !== "string" || document.name.trim().length === 0) {
    errors.push({
      code: "vault.document.name.missing",
      message: "A Vault document must carry a display name.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.name` },
      required: "a non-empty string",
      actual: describeDiagnosticValue(document.name),
    });
  }

  /*
   * Checked LAST and over the whole document, because it is the one rule about
   * the file rather than about a field. A value that does not survive
   * JSON.stringify cannot have come from a parsed file — it came from a caller
   * assembling a document in memory — and letting it through would put a Date
   * or a Map into something the Obsidian and Foundry adapters will stringify.
   */
  if (!isJsonValue(candidate)) {
    errors.push({
      code: "vault.document.not-json-safe",
      message: "A Vault document must contain only values that survive JSON round tripping.",
      audience: "developer",
      subject: { kind: "field", id: path },
      required: "JSON-safe values only",
      actual: describeDiagnosticValue(candidate),
    });
  }

  return errors;
}


function findSchemaVersionIssues(
  kind: VaultDocumentKind,
  value: unknown,
  path: string,
): readonly EngineError[] {
  const verdict = judgeSchemaVersion(kind, value);
  const subject = { kind: "field", id: `${path}.schemaVersion` };
  const window = VAULT_SCHEMA_VERSIONS[kind];

  switch (verdict.status) {
    case "supported":
      return [];

    case "missing":
      return [{
        code: "vault.document.version.missing",
        message: `A ${kind} document must declare its schemaVersion.`,
        audience: "developer",
        subject,
        required: `integer ${window.earliest}-${window.current}`,
        actual: describeDiagnosticValue(value),
        resolution: `Add "schemaVersion": ${window.current}.`,
      }];

    case "malformed":
      return [{
        code: "vault.document.version.malformed",
        message: `A ${kind} document's schemaVersion must be a positive whole number.`,
        audience: "developer",
        subject,
        required: `integer ${window.earliest}-${window.current}`,
        actual: describeDiagnosticValue(value),
      }];

    case "unsupported-past":
      return [{
        code: "vault.document.version.unsupported-past",
        message: `This engine no longer reads ${kind} schemaVersion ${verdict.version}.`,
        audience: "developer",
        subject,
        required: `integer ${window.earliest}-${window.current}`,
        actual: verdict.version,
        resolution: "Migrate the document with an older toolchain first.",
      }];

    case "unsupported-future":
      return [{
        code: "vault.document.version.unsupported-future",
        message: `This ${kind} document was written by a newer engine (schemaVersion ${verdict.version}).`,
        audience: "developer",
        subject,
        required: `integer ${window.earliest}-${window.current}`,
        actual: verdict.version,
        /*
         * Upgrade, never load. A future document's fields mean whatever the
         * future decided they mean; reading it with today's rules and writing
         * it back is how a newer save quietly loses what today cannot see.
         */
        resolution: "Upgrade the engine. Do not load or re-save this document.",
      }];
  }
}


/** Whether a candidate is a well-formed envelope of the expected kind. */
export function isVaultDocumentOfKind(
  candidate: unknown,
  kind: VaultDocumentKind,
): candidate is VaultDocument {
  if (typeof candidate !== "object" || candidate === null) return false;
  if ((candidate as { kind?: unknown }).kind !== kind) return false;

  return findVaultEnvelopeIssues(candidate).length === 0;
}


/**
 * The envelope, and nothing else, from a validated document.
 *
 * For an index entry or a diagnostic that needs to name a document without
 * carrying its whole body around.
 */
export function vaultEnvelopeOf(document: VaultDocument): VaultDocumentEnvelope {
  return {
    schemaVersion: document.schemaVersion,
    kind: document.kind,
    id: document.id,
    name: document.name,
  };
}


/** Reads a member of a document as an unknown, without trusting its type. */
export function documentMember(document: VaultDocument, key: string): JsonValue | undefined {
  return (document as JsonObject)[key];
}
