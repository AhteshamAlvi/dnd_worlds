/*
 * Where the Vault is, and how a path is allowed to appear in a diagnostic.
 *
 * Two kinds of path exist in this package and they must never be confused. An
 * ABSOLUTE path is what `fs` needs: it names a file on this machine and is
 * correct nowhere else. A REPOSITORY-RELATIVE path is what a diagnostic carries:
 * it names the same file in everybody's checkout and reveals nothing about whose
 * machine produced the message.
 *
 * So the rule is that absolute paths exist only inside this file's callers while
 * they are talking to the filesystem, and every path that leaves this package —
 * in a diagnostic, in provenance, in a generated index — has been through
 * `toRepositoryRelative`. Absolute paths in an index would also make the index
 * differ between checkouts, which is the determinism rule broken from a
 * different direction.
 */

import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";


/** The repository root, found from this file rather than from `process.cwd()`. */
export const REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);


export const WORLD_ROOT = resolve(REPOSITORY_ROOT, "World");
export const VAULT_ROOT = resolve(WORLD_ROOT, "Vault");

export const DEFINITIONS_ROOT = resolve(VAULT_ROOT, "Definitions");
export const AXIA_ROOT = resolve(VAULT_ROOT, "Axia");
export const INDEXES_ROOT = resolve(VAULT_ROOT, "Indexes");
export const CAMPAIGNS_ROOT = resolve(WORLD_ROOT, "Campaigns");


/**
 * The directories a load walks, in a fixed order.
 *
 * `Indexes/` is absent because it is generated: reading it back in would make the
 * generator's output an input to the generator.
 *
 * `Vault/character-vault/` is absent too, and deliberately. It holds the legacy
 * Workbench save format, which is not a canonical document and has not been
 * migrated — discovering it would report the file as an unknown kind on every
 * run, which is noise about something already known.
 */
export const LOAD_ROOTS: readonly string[] = [
  DEFINITIONS_ROOT,
  AXIA_ROOT,
  CAMPAIGNS_ROOT,
];


/**
 * An absolute path as it should appear in a message.
 *
 * Always forward-slashed, whatever the platform: a path in a diagnostic is an
 * identifier shared between machines, and a backslash would make the same file
 * read differently on Windows — including inside a generated index, whose whole
 * contract is that identical content produces identical bytes.
 */
export function toRepositoryRelative(absolute: string): string {
  const resolved = resolve(absolute);

  const relative = resolved.startsWith(REPOSITORY_ROOT + sep)
    ? resolved.slice(REPOSITORY_ROOT.length + sep.length)
    : resolved;

  return relative.split(sep).join("/");
}
