/*
 * Asset references — bundle-relative, and nothing else.
 *
 * A character's token lives beside their `character.json`, and the document
 * points at it with `assets/token.webp`. That is the whole contract, and every
 * other way of writing it is refused for a reason:
 *
 *   /Users/someone/vault/…   An absolute path is true on one machine. It also
 *                            leaks whose machine, into a file that gets
 *                            committed and shared.
 *   https://example.com/…    A URL makes rendering a character depend on a
 *                            server being up and on whoever controls that
 *                            host. A portable bundle carries its own art.
 *   ../../other/token.webp   Escaping the bundle means moving the bundle
 *                            breaks the reference — and a `..` chain is how a
 *                            document reaches files the person who published
 *                            it never meant to hand over.
 *   C:\art\token.webp        A backslash path is a drive letter away from the
 *                            first two problems at once.
 *
 * So the check is structural and happens in the engine, where it is pure.
 * Whether the file is actually THERE is a different question, asked at the
 * loader boundary because answering it requires a filesystem — and the two
 * have different severities: a malformed path is a refusal, because it can
 * never work, while a missing optional token is a warning, because a character
 * with no art is an ordinary character.
 *
 * ── THE TOKEN CONVENTION ────────────────────────────────────────────────
 *
 * The portable default is a square static WebP, normally 400 x 400, with
 * transparency where the art needs it and drawn facing south for overhead use.
 * PNG is allowed because plenty of existing art is PNG and re-encoding
 * somebody's drawing to satisfy a preference is not this ticket's business.
 *
 * Declared dimensions are validated when present and never required. Nothing
 * here fabricates art, invents a token for a character who has none, or treats
 * an absent optional asset as an error.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../infrastructure/diagnostics";


/** Image formats a portable bundle may declare. */
export const PORTABLE_ASSET_FORMATS = ["webp", "png"] as const;

export type PortableAssetFormat = typeof PORTABLE_ASSET_FORMATS[number];

/** The conventional edge length of a portable token, in pixels. */
export const CONVENTIONAL_TOKEN_EDGE_PIXELS = 400;


/**
 * One asset a bundle carries.
 *
 * `path` is bundle-relative and is the only required field: a bundle that knows
 * where its token is but not how big it is still renders. Dimensions are
 * declared metadata for a host laying out a sheet before it has decoded the
 * image, not a second source of truth about the file.
 */
export interface PortableAssetRef {
  readonly path: string;
  readonly widthPixels?: number;
  readonly heightPixels?: number;
}


export type AssetPathVerdict =
  | { readonly status: "valid"; readonly path: string }
  | {
      readonly status: "invalid";
      readonly reason:
        | "empty"
        | "absolute"
        | "url-scheme"
        | "escapes-bundle"
        | "not-normalized"
        | "backslash"
        | "unsupported-format";
    };


/*
 * A scheme prefix, as generously as a URL parser would read one. Matched on the
 * raw string before any segment splitting, because `data:image/png;base64,…`
 * has no separators to split on and would otherwise sail through as one
 * innocent-looking segment.
 */
const URL_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;


/**
 * Whether a string is a usable bundle-relative asset path.
 *
 * Returns a reason rather than a boolean because the reasons are what a person
 * fixing a document needs, and because a caller deciding between a refusal and
 * a warning cannot make that decision from `false`.
 */
export function judgeAssetPath(value: unknown): AssetPathVerdict {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { status: "invalid", reason: "empty" };
  }

  /*
   * Backslashes first. Checked before anything else because every later rule
   * splits on "/", and a Windows path contains none — so `..\..\secrets` would
   * be read as a single ordinary segment and pass every check after this one.
   */
  if (value.includes("\\")) return { status: "invalid", reason: "backslash" };

  // A leading "//" is protocol-relative, which is a URL wearing no scheme.
  if (value.startsWith("/")) return { status: "invalid", reason: "absolute" };

  if (URL_SCHEME.test(value)) return { status: "invalid", reason: "url-scheme" };

  const segments = value.split("/");

  if (segments.some((segment) => segment === "..")) {
    return { status: "invalid", reason: "escapes-bundle" };
  }

  /*
   * A normalized path has no empty segments ("assets//token.webp"), no "."
   * segments, and no trailing slash. These are refused rather than cleaned up,
   * because normalizing quietly means two documents can write the same asset
   * two ways and a duplicate-detection pass sees two assets.
   */
  if (segments.some((segment) => segment.length === 0 || segment === ".")) {
    return { status: "invalid", reason: "not-normalized" };
  }

  const extension = value.slice(value.lastIndexOf(".") + 1).toLowerCase();

  if (
    !value.includes(".") ||
    !(PORTABLE_ASSET_FORMATS as readonly string[]).includes(extension)
  ) {
    return { status: "invalid", reason: "unsupported-format" };
  }

  return { status: "valid", path: value };
}


const REASON_MESSAGES: Readonly<Record<
  Exclude<AssetPathVerdict, { status: "valid" }>["reason"],
  string
>> = {
  empty: "An asset reference needs a path.",
  absolute: "An asset path must be relative to its bundle, not absolute.",
  "url-scheme": "An asset path must be a file in the bundle, not a URL.",
  "escapes-bundle": "An asset path may not use \"..\" to escape its bundle.",
  "not-normalized": "An asset path must be normalized, with no empty or \".\" segments.",
  backslash: "An asset path must use forward slashes.",
  "unsupported-format": `A portable asset must be one of: ${PORTABLE_ASSET_FORMATS.join(", ")}.`,
};


/** Everything wrong with one asset reference. */
export function findPortableAssetIssues(
  candidate: unknown,
  path: string,
): readonly EngineError[] {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return [{
      code: "vault.asset.malformed",
      message: "An asset reference must be an object with a bundle-relative path.",
      audience: "developer",
      subject: { kind: "field", id: path },
      required: "{ path }",
      actual: describeDiagnosticValue(candidate),
    }];
  }

  const errors: EngineError[] = [];
  const asset = candidate as Record<string, unknown>;
  const verdict = judgeAssetPath(asset.path);

  if (verdict.status === "invalid") {
    errors.push({
      code: `vault.asset.path.${verdict.reason}`,
      message: REASON_MESSAGES[verdict.reason],
      audience: "developer",
      subject: { kind: "field", id: `${path}.path` },
      required: "a normalized bundle-relative path such as assets/token.webp",
      actual: describeDiagnosticValue(asset.path),
    });
  }

  for (const dimension of ["widthPixels", "heightPixels"] as const) {
    const value = asset[dimension];

    if (value === undefined) continue;

    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      errors.push({
        code: "vault.asset.dimension.invalid",
        message: "A declared asset dimension must be a positive whole number of pixels.",
        audience: "developer",
        subject: { kind: "field", id: `${path}.${dimension}` },
        required: "a positive integer",
        actual: describeDiagnosticValue(value),
      });
    }
  }

  return errors;
}


/**
 * Whether a token follows the portable convention, for a host that wants to say
 * so in a UI.
 *
 * A separate question from validity, and deliberately not an error. A 512 x 512
 * token is unconventional and works perfectly; refusing it would mean rejecting
 * art over a number this ticket chose as a default rather than as a rule.
 */
export function followsTokenConvention(asset: PortableAssetRef): boolean {
  return asset.widthPixels === CONVENTIONAL_TOKEN_EDGE_PIXELS &&
    asset.heightPixels === CONVENTIONAL_TOKEN_EDGE_PIXELS;
}


/** Whether a declared token is square, when it declares dimensions at all. */
export function isSquareToken(asset: PortableAssetRef): boolean | undefined {
  if (asset.widthPixels === undefined || asset.heightPixels === undefined) {
    return undefined;
  }

  return asset.widthPixels === asset.heightPixels;
}
