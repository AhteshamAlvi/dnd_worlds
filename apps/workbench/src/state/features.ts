/*
 * The bridge between "a feature domain" as the UI talks about it and the
 * differently-named field each one occupies on a Character.
 *
 * The engine names things precisely — `clans` holds `{ clanId }`, `skills`
 * holds `{ skillId }` — which is right for the engine and miserable for a UI
 * that wants one component to render all seven. Rather than seven copies of
 * the same list-with-a-remove-button, everything above this file works in
 * terms of `{ id, variantId? }` and this file does the seven small
 * translations, in one place, where a mistake is visible.
 *
 * Species is not here: it is a set of shares totalling 100, not a list of
 * present-or-absent features, and it has its own operation for that reason.
 */

import type { Character } from "@nenworld/engine";
import type { FeatureDomain } from "./operations";

// A feature on a character, in the shape the UI works in.
export interface FeatureEntry {
  readonly id: string;
  readonly variantId?: string;
}

interface FeatureDomainSpec {
  // Plural heading for the section this domain renders as.
  readonly label: string;

  readonly read: (character: Character) => readonly FeatureEntry[];
  readonly write: (
    character: Character,
    entries: readonly FeatureEntry[],
  ) => Character;
}

// Only Mutations carry a variant, so every other writer drops it rather than
// storing a field the engine would reject as unexpected.
export const FEATURE_DOMAINS: Readonly<
  Record<FeatureDomain, FeatureDomainSpec>
> = {
  clan: {
    label: "Clans",
    read: (character) =>
      (character.clans ?? []).map((entry) => ({ id: entry.clanId })),
    write: (character, entries) => ({
      ...character,
      clans: entries.map((entry) => ({ clanId: entry.id })),
    }),
  },

  mutation: {
    label: "Mutations",
    read: (character) =>
      (character.mutations ?? []).map((entry) =>
        entry.variantId === undefined
          ? { id: entry.mutationId }
          : { id: entry.mutationId, variantId: entry.variantId },
      ),
    write: (character, entries) => ({
      ...character,
      mutations: entries.map((entry) =>
        entry.variantId === undefined
          ? { mutationId: entry.id }
          : { mutationId: entry.id, variantId: entry.variantId },
      ),
    }),
  },

  trait: {
    label: "Traits",
    read: (character) =>
      (character.traits ?? []).map((entry) => ({ id: entry.traitId })),
    write: (character, entries) => ({
      ...character,
      traits: entries.map((entry) => ({ traitId: entry.id })),
    }),
  },

  ability: {
    label: "Abilities",
    read: (character) =>
      (character.abilities ?? []).map((entry) => ({ id: entry.abilityId })),
    write: (character, entries) => ({
      ...character,
      abilities: entries.map((entry) => ({ abilityId: entry.id })),
    }),
  },

  technique: {
    label: "Techniques",
    read: (character) =>
      (character.techniques ?? []).map((entry) => ({ id: entry.techniqueId })),
    write: (character, entries) => ({
      ...character,
      techniques: entries.map((entry) => ({ techniqueId: entry.id })),
    }),
  },

  skill: {
    label: "Skills",
    read: (character) =>
      (character.skills ?? []).map((entry) => ({ id: entry.skillId })),
    write: (character, entries) => ({
      ...character,
      skills: entries.map((entry) => ({ skillId: entry.id })),
    }),
  },

  condition: {
    label: "Conditions",
    read: (character) =>
      (character.conditions ?? []).map((entry) => ({ id: entry.conditionId })),
    write: (character, entries) => ({
      ...character,
      conditions: entries.map((entry) => ({ conditionId: entry.id })),
    }),
  },
};

// Display order for feature sections, matching the engine's own catalog order
// minus Species: what a character is, then what it can do, then what is
// currently true of it.
export const FEATURE_DOMAIN_ORDER = [
  "clan",
  "mutation",
  "trait",
  "ability",
  "technique",
  "skill",
  "condition",
] as const satisfies readonly FeatureDomain[];

export function readFeatures(
  character: Character,
  domain: FeatureDomain,
): readonly FeatureEntry[] {
  return FEATURE_DOMAINS[domain].read(character);
}

/*
 * Adds a feature, or replaces it if the character already has it.
 *
 * Replacing matters for Mutations: picking Bender (Water) when the character
 * is already Bender (Fire) is a change of element, not a second Bender — and
 * a second Bender is exactly what the engine rejects as a duplicate.
 */
export function addFeature(
  character: Character,
  domain: FeatureDomain,
  entry: FeatureEntry,
): Character {
  const current = readFeatures(character, domain);
  const existing = current.findIndex((held) => held.id === entry.id);

  const next =
    existing === -1
      ? [...current, entry]
      : current.map((held, index) => (index === existing ? entry : held));

  return FEATURE_DOMAINS[domain].write(character, next);
}

export function removeFeature(
  character: Character,
  domain: FeatureDomain,
  featureId: string,
): Character {
  return FEATURE_DOMAINS[domain].write(
    character,
    readFeatures(character, domain).filter((held) => held.id !== featureId),
  );
}
