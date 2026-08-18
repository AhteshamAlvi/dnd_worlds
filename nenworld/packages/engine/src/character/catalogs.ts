/*
 * The index of every catalog a character can reference.
 *
 * Eight domains, one shape. Without this file a host that wants to offer "pick
 * a feature" or "add your own" has to write the same eight-way switch for
 * listing, fetching and registering — and get all three of them right — before
 * it can render a single picker. With it, a UI is generic over the domain and
 * the engine stays the only place that knows what a Trait is.
 *
 * Registration is how a host tells the engine about definitions the engine's
 * own source does not contain: a GM's homebrew Species, their table's Clans.
 * Those live in the host's storage, not here — the engine holds them for the
 * length of the session and validates against them, but never persists them.
 * See infrastructure/registry.ts for why custom entries can never shadow an
 * authored one.
 */

import type {
  Definition,
  RegistrationResult,
  Registry,
} from "../infrastructure/registry";

import { clanRegistry, type ClanDefinition } from "./identity/clans";
import { mutationRegistry, type MutationDefinition } from "./identity/mutations";
import { speciesRegistry, type SpeciesDefinition } from "./identity/species";
import { traitRegistry, type TraitDefinition } from "./identity/traits";

import {
  abilityRegistry,
  type AbilityDefinition,
} from "./capabilities/abilities";
import {
  techniqueRegistry,
  type TechniqueDefinition,
} from "./capabilities/techniques";
import { skillRegistry, type SkillDefinition } from "./capabilities/skills";

import {
  conditionRegistry,
  type ConditionDefinition,
} from "./status/conditions";

// Singular on purpose: a domain names one kind of thing, and every message
// built from it reads "unknown Species", not "unknown species-list".
export type CatalogDomain =
  | "species"
  | "clan"
  | "mutation"
  | "trait"
  | "ability"
  | "technique"
  | "skill"
  | "condition";

// What each domain's definitions actually are, so a caller that names a
// domain literally gets that domain's own type back rather than the base one.
export interface CatalogDefinitions {
  species: SpeciesDefinition;
  clan: ClanDefinition;
  mutation: MutationDefinition;
  trait: TraitDefinition;
  ability: AbilityDefinition;
  technique: TechniqueDefinition;
  skill: SkillDefinition;
  condition: ConditionDefinition;
}

// Display order, and the order a host should render sections in: what a
// character *is*, then what it can *do*, then what is currently *true* of it.
export const CATALOG_DOMAINS = [
  "species",
  "clan",
  "mutation",
  "trait",
  "ability",
  "technique",
  "skill",
  "condition",
] as const satisfies readonly CatalogDomain[];

type RegistryByDomain = {
  readonly [D in CatalogDomain]: Registry<CatalogDefinitions[D]>;
};

const REGISTRIES: RegistryByDomain = {
  species: speciesRegistry,
  clan: clanRegistry,
  mutation: mutationRegistry,
  trait: traitRegistry,
  ability: abilityRegistry,
  technique: techniqueRegistry,
  skill: skillRegistry,
  condition: conditionRegistry,
};

// Human-readable domain names, for anything the host puts in front of a
// person. Kept beside the registries so a new domain cannot be added without
// deciding what to call it.
export const CATALOG_DOMAIN_LABELS: Readonly<Record<CatalogDomain, string>> = {
  species: "Species",
  clan: "Clan",
  mutation: "Mutation",
  trait: "Trait",
  ability: "Ability",
  technique: "Technique",
  skill: "Skill",
  condition: "Condition",
};

// Every definition in a domain, authored first, then custom in the order it
// was registered.
export function listDefinitions<D extends CatalogDomain>(
  domain: D,
): readonly CatalogDefinitions[D][] {
  return REGISTRIES[domain].all();
}

export function listCustomDefinitions<D extends CatalogDomain>(
  domain: D,
): readonly CatalogDefinitions[D][] {
  return REGISTRIES[domain].custom();
}

export function getDefinition<D extends CatalogDomain>(
  domain: D,
  id: string,
): CatalogDefinitions[D] | undefined {
  return REGISTRIES[domain].get(id);
}

export function isKnownDefinitionId(
  domain: CatalogDomain,
  id: string,
): boolean {
  return REGISTRIES[domain].isKnownId(id);
}

/*
 * Adds a definition the engine's own source does not contain.
 *
 * Returns a result rather than throwing: a host is usually registering a batch
 * loaded from a file the user hand-edited, and one bad entry should be a
 * message next to that entry, not an exception that loses the other forty.
 */
export function registerDefinition<D extends CatalogDomain>(
  domain: D,
  definition: CatalogDefinitions[D],
): RegistrationResult {
  return REGISTRIES[domain].register(definition);
}

export function unregisterDefinition(
  domain: CatalogDomain,
  id: string,
): boolean {
  return REGISTRIES[domain].unregister(id);
}

// Drops every custom definition in every domain. What a host calls before
// re-registering a catalog it has just reloaded, so entries deleted from the
// file actually disappear instead of lingering from the previous load.
export function clearCustomDefinitions(): void {
  for (const domain of CATALOG_DOMAINS) {
    REGISTRIES[domain].clearCustom();
  }
}

// Everything currently registered, in a shape a host can serialise straight
// back to whatever it loaded from.
export function exportCustomDefinitions(): Readonly<
  Record<CatalogDomain, readonly Definition[]>
> {
  const out = {} as Record<CatalogDomain, readonly Definition[]>;

  for (const domain of CATALOG_DOMAINS) {
    out[domain] = REGISTRIES[domain].custom();
  }

  return out;
}
