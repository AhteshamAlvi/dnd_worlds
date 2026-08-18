/*
 * Species — what a character is descended from.
 *
 * Not a single value. Mixed ancestry is ordinary in this world, so a
 * character carries a *mix*: a list of Species each with the share of them it
 * accounts for. A plain human is the one-entry case, Human 100%, rather than
 * a different shape from everyone else — which is what keeps every consumer
 * off the "if there's only one, then…" branch.
 *
 * The shares must total exactly 100. A mix that doesn't is not a character
 * who is 70% something and unexplained for the rest; it is a half-finished
 * edit, and the engine says so rather than normalising the numbers behind the
 * author's back.
 *
 * Source when the catalog is filled out: Rulebook "06 Races".
 */

import {
  createRegistry,
  scanReferences,
  type Definition,
} from "../../infrastructure/registry";

/**
 * Stable semantic identifier for a Species definition.
 *
 * Unlike CharacterId, these are authored rule identifiers and stay stable
 * across characters, saves, tests and consumers.
 *
 * Examples: "human", "yuki", "merfolk".
 */
export type SpeciesId = string;

export type SpeciesDefinition = Definition;

/**
 * One Species in a character's ancestry, and how much of it they are.
 */
export interface CharacterSpecies {
  readonly speciesId: SpeciesId;

  // Percentage points of ancestry, greater than 0 and at most 100. Fractions
  // are allowed so a three-way split can be expressed honestly.
  readonly percentage: number;
}

export const SPECIES_DEFINITIONS = {
  human: {
    id: "human",
    name: "Human",
    description: "A member of the human species.",
  },
} as const satisfies Record<string, SpeciesDefinition>;

const SPECIES_REGISTRY = createRegistry<SpeciesDefinition>(
  "Species",
  SPECIES_DEFINITIONS,
);

export type KnownSpeciesId = keyof typeof SPECIES_DEFINITIONS;

export function isKnownSpeciesId(speciesId: SpeciesId): boolean {
  return SPECIES_REGISTRY.isKnownId(speciesId);
}

export function getSpeciesDefinition(
  speciesId: SpeciesId,
): SpeciesDefinition | undefined {
  return SPECIES_REGISTRY.get(speciesId);
}

export const speciesRegistry = SPECIES_REGISTRY;

/* ── The 100% rule ──────────────────────────────────────────────────────── */

// What a complete ancestry adds up to.
export const SPECIES_TOTAL_PERCENTAGE = 100;

/*
 * How close to 100 counts as 100.
 *
 * Thirds cannot be written exactly in either decimal or binary, so an equal
 * three-way split is 33.33 + 33.33 + 33.34 and a strict equality test would
 * reject the most obvious mix a user could type. The tolerance is small
 * enough that no mix a person would consider wrong slips through it.
 */
const TOTAL_TOLERANCE = 0.011;

export function speciesTotalPercentage(
  species: readonly CharacterSpecies[],
): number {
  return species.reduce((total, entry) => total + entry.percentage, 0);
}

// Whether a mix is finished, and therefore safe to commit to a sheet.
export function isCompleteSpeciesMix(
  species: readonly CharacterSpecies[],
): boolean {
  if (species.length === 0) return false;

  return (
    Math.abs(speciesTotalPercentage(species) - SPECIES_TOTAL_PERCENTAGE) <=
    TOTAL_TOLERANCE
  );
}

function isValidPercentage(value: number): boolean {
  return (
    Number.isFinite(value) && value > 0 && value <= SPECIES_TOTAL_PERCENTAGE
  );
}

/* ── Validation ─────────────────────────────────────────────────────────── */

export type SpeciesValidationIssue =
  | {
      readonly type: "unknown-species";
      readonly speciesId: SpeciesId;
    }
  | {
      readonly type: "duplicate-species";
      readonly speciesId: SpeciesId;
    }
  | {
      readonly type: "invalid-species-percentage";
      readonly speciesId: SpeciesId;
      readonly percentage: number;
    }
  | {
      readonly type: "incomplete-species-mix";
      readonly total: number;
    };

/*
 * Internal structural validation of a character's ancestry.
 *
 * Returns issues rather than an EngineResult because it is a domain helper,
 * not a public entry point: validateCharacter turns these into EngineErrors
 * so every diagnostic the UI sees is built in one place.
 */
export function findSpeciesValidationIssues(
  species: readonly CharacterSpecies[],
): readonly SpeciesValidationIssue[] {
  const issues: SpeciesValidationIssue[] = scanReferences(
    species.map((entry) => entry.speciesId),
    isKnownSpeciesId,
  ).map((issue) => ({
    type: issue.kind === "unknown" ? "unknown-species" : "duplicate-species",
    speciesId: issue.id,
  }));

  for (const entry of species) {
    if (!isValidPercentage(entry.percentage)) {
      issues.push({
        type: "invalid-species-percentage",
        speciesId: entry.speciesId,
        percentage: entry.percentage,
      });
    }
  }

  // An empty ancestry is incompleteness, not a broken total — validateCharacter
  // reports that as a warning. Individually invalid percentages already
  // explain the arithmetic, so the total is only judged once they are sound.
  if (species.length > 0 && issues.every((issue) => issue.type !== "invalid-species-percentage")) {
    if (!isCompleteSpeciesMix(species)) {
      issues.push({
        type: "incomplete-species-mix",
        total: speciesTotalPercentage(species),
      });
    }
  }

  return issues;
}

export function findSpeciesCatalogIssues(): readonly string[] {
  return SPECIES_REGISTRY.findCatalogIssues();
}
