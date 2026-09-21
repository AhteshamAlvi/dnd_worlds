#!/usr/bin/env node
/*
 * Two commands, both of which are just the pipeline with different reporting.
 *
 *   validate   load the Vault, hydrate the engine, print every problem, exit 1
 *              if there was one.
 *   index      rebuild World/Vault/Indexes/ from the documents. With --check it
 *              rebuilds in memory and compares instead of writing, which is the
 *              form a CI step wants.
 *
 * `index` validates first and refuses to write from an invalid Vault. An index
 * built over documents that failed validation would be a map of a Vault nobody
 * should be using — and being derived, it would look exactly as authoritative as
 * a correct one.
 *
 * Output names repository-relative paths only. Absolute paths would name somebody's
 * home directory in a log that gets pasted into an issue.
 */

import {
  buildDocumentIndex,
  buildReferenceIndex,
  documentReferenceIds,
  indexesAreCurrent,
  loadVault,
  writeIndexes,
} from "./index";
import { characterAssetExpectations, checkAssets } from "./assets";
import { hydrateEngine } from "./hydrate";

import type { CharacterDocument } from "@nenworld/engine";


function run(): number {
  const [command, ...flags] = process.argv.slice(2);

  if (command !== "validate" && command !== "index") {
    process.stderr.write("usage: nenworld-vault <validate|index> [--check]\n");
    return 2;
  }

  const load = loadVault();

  const assetExpectations = load.documents
    .filter((entry) => entry.provenance.kind === "character")
    .flatMap((entry) =>
      characterAssetExpectations(
        entry.document as unknown as CharacterDocument,
        entry.path,
        entry.absolutePath,
      )
    );

  const assets = checkAssets(assetExpectations);
  const hydration = hydrateEngine(load);

  const errors = [...hydration.errors, ...assets.errors];
  const warnings = [...load.warnings, ...assets.warnings];

  process.stdout.write(
    `Read ${load.filesRead} JSON file(s); ${load.documents.length} document(s) loaded.\n`,
  );

  for (const [kind, count] of Object.entries(hydration.counts).sort()) {
    process.stdout.write(`  ${kind}: ${count}\n`);
  }

  for (const warning of warnings) {
    process.stdout.write(`warning  ${warning.code}  ${warning.message}\n`);
  }

  for (const error of errors) {
    process.stderr.write(`error    ${error.code}  ${error.message}\n`);
  }

  if (errors.length > 0) {
    process.stderr.write(`\n${errors.length} problem(s). The Vault was not accepted.\n`);
    return 1;
  }

  const documentIndex = buildDocumentIndex(load.documents);
  const referenceIndex = buildReferenceIndex(
    load.documents,
    (entry) => documentReferenceIds(entry.document),
  );

  if (command === "validate") {
    process.stdout.write(
      indexesAreCurrent(documentIndex, referenceIndex)
        ? "Indexes are current.\n"
        : "Indexes are stale. Run: npm run index -w @nenworld/vault\n",
    );

    process.stdout.write("Vault is valid.\n");
    return 0;
  }

  if (flags.includes("--check")) {
    const current = indexesAreCurrent(documentIndex, referenceIndex);

    process.stdout.write(current ? "Indexes are current.\n" : "Indexes are stale.\n");
    return current ? 0 : 1;
  }

  for (const written of writeIndexes(documentIndex, referenceIndex)) {
    process.stdout.write(`${written.changed ? "wrote   " : "current "} ${written.path}\n`);
  }

  return 0;
}


process.exitCode = run();
