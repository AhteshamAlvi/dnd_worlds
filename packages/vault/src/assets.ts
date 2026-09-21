/*
 * Whether the art a document promises is actually there.
 *
 * The engine already judged the PATH — relative, normalized, inside the bundle, a
 * supported format. That check is pure and belongs there. Whether a file exists at
 * that path is a different question, it needs a filesystem, and the two have
 * different severities:
 *
 *   a malformed path      REFUSES. It can never work, on any machine, and no
 *                         amount of adding files will make `../../etc/passwd`
 *                         into a portable token.
 *   a missing OPTIONAL    WARNS. A character with no token is an ordinary
 *   asset                 character; the document simply named art nobody has
 *                         drawn yet.
 *   a missing REQUIRED    REFUSES, if anything ever declares one. Nothing does
 *   asset                 today, and inventing a required asset so the branch has
 *                         a user would be requiring art this ticket must not
 *                         fabricate.
 *
 * Bundle-relative means relative to the directory holding the document, which is
 * what makes a character bundle movable: `assets/token.webp` resolves beside
 * whichever `character.json` referenced it, wherever that has been filed.
 */

import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { judgeAssetPath, type EngineError, type Warning } from "@nenworld/engine";

import { toRepositoryRelative } from "./paths";


export interface AssetExpectation {
  /** Bundle-relative, exactly as the document wrote it. */
  readonly path: string;

  /** The document that referenced it, repository-relative. */
  readonly documentPath: string;

  /** Absolute path of the document, for resolving the bundle root. */
  readonly documentAbsolutePath: string;

  /** A missing required asset refuses; a missing optional one warns. */
  readonly required: boolean;

  /** Field path, for the diagnostic. */
  readonly field: string;
}


export interface AssetCheckResult {
  readonly errors: readonly EngineError[];
  readonly warnings: readonly Warning[];
}


export function checkAssets(
  expectations: readonly AssetExpectation[],
): AssetCheckResult {
  const errors: EngineError[] = [];
  const warnings: Warning[] = [];

  for (const expectation of expectations) {
    const verdict = judgeAssetPath(expectation.path);

    if (verdict.status === "invalid") {
      /*
       * Should already have been refused by the engine's structural validation.
       * Checked again rather than trusted, because this function resolves the path
       * against a real directory — and doing that with an unvalidated `..` is how a
       * loader reads a file outside the bundle it was asked about.
       */
      errors.push({
        code: `vault.asset.path.${verdict.reason}`,
        message: `${expectation.documentPath}: "${expectation.path}" is not a usable bundle-relative asset path.`,
        audience: "developer",
        subject: { kind: "field", id: expectation.field },
        required: "a normalized bundle-relative path",
        actual: expectation.path,
      });
      continue;
    }

    const absolute = resolve(dirname(expectation.documentAbsolutePath), verdict.path);
    const exists = existsSync(absolute) && statSync(absolute).isFile();

    if (exists) continue;

    if (expectation.required) {
      errors.push({
        code: "vault.asset.missing-required",
        message: `${expectation.documentPath}: required asset "${expectation.path}" does not exist.`,
        audience: "developer",
        subject: { kind: "field", id: expectation.field },
        required: toRepositoryRelative(absolute),
        actual: null,
      });
      continue;
    }

    warnings.push({
      code: "vault.asset.missing-optional",
      message: `${expectation.documentPath}: optional asset "${expectation.path}" does not exist yet.`,
      audience: "developer",
      subject: { kind: "field", id: expectation.field },
    });
  }

  return { errors, warnings };
}


/**
 * Every asset a character document expects.
 *
 * All optional. No role is required — a character with no token is ordinary, and a
 * contract that demanded one would demand art for every NPC anybody sketches.
 */
export function characterAssetExpectations(
  document: { readonly id: string; readonly assets?: Readonly<Record<string, { readonly path: string }>> },
  documentPath: string,
  documentAbsolutePath: string,
): readonly AssetExpectation[] {
  return Object.entries(document.assets ?? {})
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([role, asset]) => ({
      path: asset.path,
      documentPath,
      documentAbsolutePath,
      required: false,
      field: `character:${document.id}.assets.${role}`,
    }));
}
