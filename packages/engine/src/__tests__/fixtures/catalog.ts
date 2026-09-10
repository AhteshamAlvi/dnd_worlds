/*
 * One genuinely valid definition per catalog domain.
 *
 * The registration barrier made "a definition" a much stronger claim than it
 * used to be: every domain now has local structural rules, so a generic
 * `{ id, name, description }` is valid in none of them. A hand-written fixture
 * per domain would work and would rot — each one is a second, quieter copy of
 * that domain's requirements, and the copy is what drifts when a rule changes.
 *
 * So each fixture is CLONED from the engine's own authored content with a
 * fresh id. It is valid for exactly the reason the authored entry is, it stays
 * valid when a domain gains a field, and it fails loudly here rather than
 * subtly if the authored catalog itself ever stops being valid.
 */

import {
  CATALOG_DOMAINS,
  listDefinitions,
  type CatalogDomain,
} from "../../character/catalogs";


/*
 * The one domain with no authored content to clone.
 *
 * The engine ships no Injuries — `INJURY_DEFINITIONS` is deliberately empty,
 * since an authored Injury is a rule the moment it ships — so this fixture has
 * to be written out. It is the only hand-maintained one, and it is here rather
 * than inline in a test so there is exactly one copy to fix if the Injury
 * contract changes.
 */
const AUTHORED_NOWHERE: Partial<Record<CatalogDomain, Record<string, unknown>>> = {
  injury: {
    name: "Test Injury",
    description: "A structurally complete Injury, for fixtures.",
    applicability: { bodyParts: { types: ["torso"] } },
    recovery: { treatmentRequired: false },
  },
};


/** A registrable definition for `domain`, modelled on authored content. */
export function validDefinitionFor(
  domain: CatalogDomain,
  id = "house-rule",
): Record<string, unknown> {
  const authored = listDefinitions(domain)[0];

  if (authored !== undefined) {
    return { ...(authored as unknown as Record<string, unknown>), id };
  }

  const written = AUTHORED_NOWHERE[domain];

  if (written === undefined) {
    throw new Error(
      `No authored ${domain} to model a fixture on, and none written out. ` +
      `Either the catalog was emptied or the domain is new; a fixture has to ` +
      `be added to AUTHORED_NOWHERE rather than invented at the call site.`,
    );
  }

  return { ...written, id };
}


/** Every domain's fixture, for a table-driven test. */
export function validDefinitions(
  id = "house-rule",
): readonly (readonly [CatalogDomain, Record<string, unknown>])[] {
  return CATALOG_DOMAINS.map(
    (domain) => [domain, validDefinitionFor(domain, id)] as const,
  );
}
