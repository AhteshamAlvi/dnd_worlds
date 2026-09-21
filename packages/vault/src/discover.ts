/*
 * Finding the documents, and being quiet about everything else.
 *
 * The Vault lives inside an Obsidian vault. That means the walk runs past prose,
 * images, Obsidian's own configuration and whatever else a human has left in a
 * folder — and none of that is an error. A loader that reported every `.md` file
 * it did not understand would produce hundreds of complaints about a vault that
 * is working exactly as intended, and the real fault in the JSON would be
 * somewhere on page four.
 *
 * So discovery is positive rather than exclusionary: it collects `.json` and says
 * nothing at all about anything else. There is no ignore list to keep in step
 * with what people add, because a new kind of narrative file needs no permission
 * to be ignored.
 *
 * Results come back sorted by repository-relative path. `readdir` order is
 * filesystem- and platform-dependent, and every artifact built downstream —
 * snapshots, indexes, diagnostics — would inherit that nondeterminism. Sorting
 * once here means nothing after this point has to remember to.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { LOAD_ROOTS, toRepositoryRelative } from "./paths";


export interface DiscoveredFile {
  readonly absolutePath: string;
  readonly path: string;
}


/*
 * Directories never worth walking into.
 *
 * Obsidian's own state and a macOS `.DS_Store` sibling. Deliberately NOT a
 * content filter — this is about not descending into thousands of irrelevant
 * entries, not about deciding which documents count.
 */
const SKIPPED_DIRECTORIES = new Set([".obsidian", ".claudian", ".git", "node_modules"]);


export function discoverJsonFiles(
  roots: readonly string[] = LOAD_ROOTS,
): readonly DiscoveredFile[] {
  const found: DiscoveredFile[] = [];

  for (const root of roots) walk(root, found);

  return found.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
}


function walk(directory: string, found: DiscoveredFile[]): void {
  let entries: readonly string[];

  try {
    entries = readdirSync(directory);
  } catch {
    /*
     * A missing root is not a failure. `World/Campaigns/` legitimately holds
     * nothing until somebody starts a campaign, and refusing to load a Vault
     * because an empty category has not been created would make the structure
     * mandatory rather than conventional.
     */
    return;
  }

  for (const entry of entries) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue;

    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      walk(path, found);
      continue;
    }

    if (!entry.endsWith(".json")) continue;

    found.push({ absolutePath: path, path: toRepositoryRelative(path) });
  }
}
