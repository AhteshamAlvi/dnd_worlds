/*
 * catalogStore — the only file that talks to the /__catalog filesystem bridge
 * (see vite.config.ts).
 *
 * Mirrors characterStore: one narrow surface per external boundary. What it
 * carries is the table's own Species, Clans, Traits and so on — content the
 * engine's source does not contain and therefore has to be handed to it on
 * every boot before any character that references it can be validated.
 *
 * On disk this is one vault directory per domain (species-vault, trait-vault,
 * ...), one JSON file per entry — see vite.config.ts's catalogPlugin. That
 * shape is entirely hidden behind this file: callers still deal in one
 * CustomCatalog object, load once, save the whole thing on change. Nothing
 * above this file needed to change when the storage moved from a single
 * workbench-catalog.json to per-domain vault folders.
 */

import { CATALOG_DOMAINS, type CatalogDomain, type Definition } from "@nenworld/engine";

export const CURRENT_CATALOG_SCHEMA_VERSION = 1;

/*
 * A custom Skill needs a timing and a custom Trait may carry Attribute
 * modifiers, so an entry is a Definition plus whatever its domain requires.
 * Kept loose here on purpose: the file is hand-editable, and the engine's
 * registerDefinition is what judges an entry, not this type.
 */
export type CustomDefinition = Definition & {
  readonly [key: string]: unknown;
};

export interface CustomCatalog {
  readonly schemaVersion: number;
  readonly definitions: Readonly<
    Partial<Record<CatalogDomain, readonly Definition[]>>
  >;
}

export const EMPTY_CATALOG: CustomCatalog = {
  schemaVersion: CURRENT_CATALOG_SCHEMA_VERSION,
  definitions: {},
};

async function parseOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return body;
}

async function loadDomainVault(
  domain: CatalogDomain,
): Promise<readonly Definition[]> {
  const body = await parseOrThrow(await fetch(`/__catalog/${domain}`));

  return Array.isArray(body) ? (body as Definition[]) : [];
}

async function saveDomainVault(
  domain: CatalogDomain,
  entries: readonly Definition[],
): Promise<void> {
  await parseOrThrow(
    await fetch(`/__catalog/${domain}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entries),
    }),
  );
}

// Loads every domain's vault in parallel and assembles them into one
// CustomCatalog, so a caller that only cares about "the whole registry"
// never has to know there are eight directories behind it.
export async function loadCustomCatalog(): Promise<CustomCatalog> {
  const perDomain = await Promise.all(
    CATALOG_DOMAINS.map(
      async (domain) => [domain, await loadDomainVault(domain)] as const,
    ),
  );

  const definitions: Partial<Record<CatalogDomain, readonly Definition[]>> = {};

  for (const [domain, entries] of perDomain) {
    if (entries.length > 0) definitions[domain] = entries;
  }

  return {
    schemaVersion: CURRENT_CATALOG_SCHEMA_VERSION,
    definitions,
  };
}

// Replaces every domain's vault wholesale, in parallel. A domain absent from
// `catalog.definitions` is saved as an empty array — the same "nothing left
// here" signal an empty array already carried in the single-file format,
// now expressed as an empty (or absent) vault directory.
export async function saveCustomCatalog(catalog: CustomCatalog): Promise<void> {
  await Promise.all(
    CATALOG_DOMAINS.map((domain) =>
      saveDomainVault(domain, catalog.definitions[domain] ?? []),
    ),
  );
}
