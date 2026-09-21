/*
 * How one document points at another, and why it is never a path.
 *
 * A relative path is the obvious way to link two files and it is wrong here for
 * one reason: it stops being true when somebody tidies a folder. The Vault
 * lives inside an Obsidian vault that a human is expected to reorganize —
 * moving a character into a campaign, splitting a Definitions folder by
 * category, renaming `Item-Instances` — and a link that encodes location turns
 * every such reorganization into silent breakage of content nobody touched.
 *
 * So a reference is (kind, id). `kind` is carried as well as `id` because an id
 * alone cannot be checked: "elf" is a perfectly good Species id and a perfectly
 * good nothing-at-all if the field wanted an Item, and a reference that omitted
 * the kind would resolve against whichever table the consumer happened to
 * consult. Carrying the kind makes "you pointed at the wrong sort of thing" a
 * verdict this file can reach rather than a type error somewhere downstream.
 *
 * ── THREE FAILURES, THREE ANSWERS ───────────────────────────────────────
 *
 * Missing, wrong-kind and duplicate are genuinely different problems with
 * genuinely different fixes — add the document, correct the reference, delete
 * one of two files — so they are three verdicts and three diagnostic codes
 * rather than one "bad reference".
 *
 * Duplicate is the one that must never be resolved by picking. Two files
 * claiming the same id is a mistake whose two candidates may differ in any
 * field at all, and last-write-wins makes the answer depend on the order a
 * filesystem enumerated a directory in — which is to say, on nothing.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../infrastructure/diagnostics";
import { DEFINITION_ID_PATTERN } from "../infrastructure/registry";

import {
  isVaultDocumentKind,
  type VaultDocumentKind,
  VAULT_DOCUMENT_KINDS,
} from "./document";


/**
 * A typed pointer at another document.
 *
 * Generic in the kind so a field can require one: an Item instance's
 * `definition` is a `VaultReference<"item-definition">`, and a Species
 * reference in that slot is a compile error as well as a validation one.
 */
export interface VaultReference<K extends VaultDocumentKind = VaultDocumentKind> {
  readonly kind: K;
  readonly id: string;
}


/** A reference rendered for a diagnostic or an index key. */
export function referenceKey(reference: VaultReference): string {
  return `${reference.kind}:${reference.id}`;
}


export function isVaultReference(value: unknown): value is VaultReference {
  if (typeof value !== "object" || value === null) return false;

  const reference = value as { kind?: unknown; id?: unknown };

  return isVaultDocumentKind(reference.kind) &&
    typeof reference.id === "string" &&
    DEFINITION_ID_PATTERN.test(reference.id);
}


/** Everything structurally wrong with a reference field. */
export function findVaultReferenceIssues(
  candidate: unknown,
  expected: VaultDocumentKind | undefined,
  path: string,
): readonly EngineError[] {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return [{
      code: "vault.reference.malformed",
      message: "A reference must be an object naming a kind and an id.",
      audience: "developer",
      subject: { kind: "field", id: path },
      required: expected === undefined
        ? "{ kind, id }"
        : `{ kind: "${expected}", id }`,
      actual: describeDiagnosticValue(candidate),
    }];
  }

  const errors: EngineError[] = [];
  const reference = candidate as { kind?: unknown; id?: unknown };

  if (!isVaultDocumentKind(reference.kind)) {
    errors.push({
      code: "vault.reference.kind.unknown",
      message: "A reference must name a kind this engine implements.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.kind` },
      required: [...VAULT_DOCUMENT_KINDS],
      actual: describeDiagnosticValue(reference.kind),
    });
  } else if (expected !== undefined && reference.kind !== expected) {
    /*
     * Reported here as well as at resolution time, and the two are different
     * questions. This one is "the field wanted a Species and you wrote an
     * Item", answerable from the reference alone. Resolution's version is "you
     * wrote a Species id that turns out to name an Item", which needs the
     * index. A document can be wrong in either way independently.
     */
    errors.push({
      code: "vault.reference.kind.unexpected",
      message: `This field references a ${expected}, not a ${reference.kind}.`,
      audience: "developer",
      subject: { kind: "field", id: `${path}.kind` },
      required: expected,
      actual: reference.kind,
    });
  }

  if (
    typeof reference.id !== "string" ||
    reference.id.trim().length === 0 ||
    !DEFINITION_ID_PATTERN.test(reference.id)
  ) {
    errors.push({
      code: "vault.reference.id.invalid",
      message:
        "A reference must name a stable id of lowercase letters, digits and single hyphens.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.id` },
      required: "lowercase letters, digits and single hyphens",
      actual: describeDiagnosticValue(reference.id),
    });
  }

  return errors;
}


/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What the Vault knows about which ids exist and what kind each one is.
 *
 * An interface rather than a concrete map, because the engine must resolve
 * against whatever the loader built without knowing how it was built — and
 * because a test proving wrong-kind detection should be able to state two
 * entries rather than construct a document set.
 */
export interface VaultReferenceLookup {
  /** The kind of document with this id, or undefined if no document has it. */
  readonly kindOf: (id: string) => VaultDocumentKind | undefined;
}


export type ReferenceVerdict =
  | { readonly status: "resolved"; readonly kind: VaultDocumentKind; readonly id: string }
  | { readonly status: "missing"; readonly id: string }
  | {
      readonly status: "wrong-kind";
      readonly id: string;
      readonly expected: VaultDocumentKind;
      readonly actual: VaultDocumentKind;
    };


export function resolveVaultReference(
  reference: VaultReference,
  lookup: VaultReferenceLookup,
): ReferenceVerdict {
  const actual = lookup.kindOf(reference.id);

  if (actual === undefined) return { status: "missing", id: reference.id };

  if (actual !== reference.kind) {
    return {
      status: "wrong-kind",
      id: reference.id,
      expected: reference.kind,
      actual,
    };
  }

  return { status: "resolved", kind: actual, id: reference.id };
}


/** The verdict as a diagnostic, or nothing when it resolved. */
export function referenceVerdictIssue(
  verdict: ReferenceVerdict,
  path: string,
): EngineError | undefined {
  switch (verdict.status) {
    case "resolved":
      return undefined;

    case "missing":
      return {
        code: "vault.reference.unresolved",
        message: `Nothing in this Vault has the id "${verdict.id}".`,
        audience: "developer",
        subject: { kind: "field", id: path },
        required: "an id present in the Vault",
        actual: verdict.id,
      };

    case "wrong-kind":
      return {
        code: "vault.reference.kind.mismatch",
        message:
          `"${verdict.id}" is a ${verdict.actual}, but this field references a ${verdict.expected}.`,
        audience: "developer",
        subject: { kind: "field", id: path },
        required: verdict.expected,
        actual: verdict.actual,
      };
  }
}


/* -------------------------------------------------------------------------- */
/* Duplicates                                                                 */
/* -------------------------------------------------------------------------- */

/** One document's identity as the duplicate scan sees it. */
export interface IdentifiedDocument {
  readonly kind: VaultDocumentKind;
  readonly id: string;

  /** Repository-relative, for a diagnostic that says WHICH two files. */
  readonly path: string;
}


/**
 * Every id claimed by more than one document.
 *
 * Reported per later claimant rather than once per id, so a diagnostic can name
 * the file that has to move. The first claimant is named in the message as the
 * incumbent — not because it wins, but because "this collides with that" is
 * only actionable if you know what "that" is. Neither is chosen: the caller is
 * expected to refuse the whole set.
 *
 * Scoped across ALL kinds, deliberately. An id is unique in the Vault, not
 * unique per folder, because a reference carries a kind for checking rather
 * than for disambiguation — so a Species and an Item both called "shield"
 * would make `kindOf("shield")` a question with two answers.
 */
export function findDuplicateIdIssues(
  documents: readonly IdentifiedDocument[],
): readonly EngineError[] {
  const firstClaim = new Map<string, IdentifiedDocument>();
  const errors: EngineError[] = [];

  for (const document of documents) {
    const incumbent = firstClaim.get(document.id);

    if (incumbent === undefined) {
      firstClaim.set(document.id, document);
      continue;
    }

    errors.push({
      code: "vault.document.id.duplicate",
      message:
        `The id "${document.id}" is claimed by two documents: ${incumbent.path} and ${document.path}.`,
      audience: "developer",
      subject: { kind: "document", id: document.id },
      required: "one document per id",
      actual: [incumbent.path, document.path],
      resolution: "Give one of them a different id, or delete the file that should not exist.",
    });
  }

  return errors;
}


/** A lookup over a set of documents whose ids have already been proved unique. */
export function lookupOver(
  documents: readonly IdentifiedDocument[],
): VaultReferenceLookup {
  const kinds = new Map<string, VaultDocumentKind>();

  for (const document of documents) {
    if (!kinds.has(document.id)) kinds.set(document.id, document.kind);
  }

  return { kindOf: (id) => kinds.get(id) };
}
