/*
 * The real production content, read from the real files.
 *
 * Fire Blast, Ordinary Shout and the ordinary-sound falloff used to be
 * TypeScript objects in `gameplay/composition/profiles.ts`, and the suites that
 * prove their behaviour imported them from there. They are JSON now, in
 * `World/Vault/Definitions/`, and those suites import them from HERE — which
 * means they load the same bytes an Obsidian user edits.
 *
 * That indirection is the point rather than a convenience. If this fixture built
 * the profiles in TypeScript instead, the Vault documents could be wrong, empty
 * or absent and every Fire Blast test would still pass — and the claim that JSON
 * is the single authority would be proved by nothing. Reading the files makes the
 * existing suites the parity check: they pass only if the JSON says what the
 * TypeScript used to say.
 *
 * `node:fs` in a fixture is fine and is not a hole in engine purity. The engine's
 * PRODUCTION code performs no I/O, which the architecture suite checks by walking
 * source files and excluding tests; a test that reads a file is how a test
 * observes the world. What the engine is handed here is parsed values, exactly as
 * `@nenworld/vault` will hand them over in production.
 *
 * This fixture deliberately does not depend on `@nenworld/vault`. The loader
 * depends on the engine, so the engine's tests depending on the loader would make
 * a cycle between two workspaces. The loader's own suites prove the full
 * discovery, migration and indexing pipeline; this one proves parity of content.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveEmissionProfileDocument,
  type EmissionProfileDefinition,
  type EmissionProfileDocument,
  type PropagationPresetDocument,
} from "../../index";


const DEFINITIONS = fileURLToPath(
  new URL("../../../../../World/Vault/Definitions/", import.meta.url),
);


function readDocuments<T>(category: string): readonly T[] {
  const directory = join(DEFINITIONS, category);

  return readdirSync(directory)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => JSON.parse(readFileSync(join(directory, entry), "utf8")) as T);
}


export const CANONICAL_PROPAGATION_PRESETS: readonly PropagationPresetDocument[] =
  readDocuments<PropagationPresetDocument>("Propagation-Presets");

export const CANONICAL_EMISSION_PROFILE_DOCUMENTS: readonly EmissionProfileDocument[] =
  readDocuments<EmissionProfileDocument>("Emission-Profiles");

export const CANONICAL_SPECIES_DOCUMENTS = readDocuments<Record<string, unknown>>("Species");


/**
 * One canonical emission profile, resolved through the real hydration path.
 *
 * Throws rather than returning undefined, because every caller is a test naming a
 * profile it expects to exist. A silent undefined would surface as an unrelated
 * assertion failure ten lines later, and the actual fault — a renamed file, a
 * malformed document — would be invisible.
 */
export function canonicalEmissionProfile(id: string): EmissionProfileDefinition {
  const document = CANONICAL_EMISSION_PROFILE_DOCUMENTS.find(
    (candidate) => candidate.id === id,
  );

  if (document === undefined) {
    throw new Error(
      `No canonical emission profile "${id}" in World/Vault/Definitions/Emission-Profiles/.`,
    );
  }

  const resolved = resolveEmissionProfileDocument(document, CANONICAL_PROPAGATION_PRESETS);

  if (!resolved.success) {
    throw new Error(
      `Canonical emission profile "${id}" did not resolve: ${resolved.errors.map((error) => error.message).join(" ")}`,
    );
  }

  return resolved.payload;
}
