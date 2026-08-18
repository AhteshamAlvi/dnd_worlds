/*
 * catalogStore — the only file that talks to the /__catalog filesystem bridge
 * (see vite.config.ts).
 *
 * Mirrors characterStore: one narrow surface per external boundary. What it
 * carries is the table's own Species, Clans, Traits and so on — content the
 * engine's source does not contain and therefore has to be handed to it on
 * every boot before any character that references it can be validated.
 */

import type { CatalogDomain, Definition } from "@nenworld/engine";

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

// Returns the empty catalog rather than null when nothing has been written
// yet, so callers have one shape to handle instead of two.
export async function loadCustomCatalog(): Promise<CustomCatalog> {
  const body = await parseOrThrow(await fetch("/__catalog"));

  if (body === null || typeof body !== "object") return EMPTY_CATALOG;

  const catalog = body as Partial<CustomCatalog>;

  return {
    schemaVersion: catalog.schemaVersion ?? CURRENT_CATALOG_SCHEMA_VERSION,
    definitions: catalog.definitions ?? {},
  };
}

export async function saveCustomCatalog(catalog: CustomCatalog): Promise<void> {
  await parseOrThrow(
    await fetch("/__catalog", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(catalog),
    }),
  );
}
