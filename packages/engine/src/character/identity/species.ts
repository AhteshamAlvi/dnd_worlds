/*
 * Species — what a character is descended from, and the narrower kinds of it.
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
 * ── Sub-species ─────────────────────────────────────────────────────────
 *
 * A Sub-species is a Species with a parent, not a second kind of thing:
 *
 *   Human
 *   └── Firebender
 *
 * A character listing Firebender is a Human Firebender. Every rule that asks
 * about Human is satisfied by that character, because lineage is walked when
 * the question is asked (see speciesAncestry). This is why Sub-species need
 * no machinery of their own — one parent field buys the whole relationship.
 *
 * Species may contribute Effects like any other content: a Sub-species that
 * means something mechanically grants a Trait rather than special-casing
 * itself into attribute resolution.
 *
 * Source when the catalog is filled out: Rulebook "06 Races".
 */

import {
  createRegistry,
  scanReferences,
} from "../../infrastructure/registry";

import type { EffectfulDefinition } from "../rules/content";
import { STANDARD_HUMANOID_REFERENCE_FORM } from "../foundation/body/anatomy/standard-humanoid";
import { HUMAN_AGE_PROFILE } from "../foundation/body/age/human-age-profile";
import { DEFAULT_ADIPOSE_TISSUE_DENSITY_KG_PER_L } from "../foundation/body/measurements/resolution";
import { HUMAN_STATURE_BANDS } from "../foundation/body/stature/human-stature-bands";
import { NEUTRAL_MORPHOLOGY } from "../foundation/body/types";
import type { SpeciesBodyProfile } from "../foundation/body/species-profile";

/**
 * Stable semantic identifier for a Species definition.
 *
 * Unlike CharacterId, these are authored rule identifiers and stay stable
 * across characters, saves, tests and consumers.
 *
 * Examples: "human", "firebender", "merfolk".
 */
export type SpeciesId = string;

export interface SpeciesDefinition extends EffectfulDefinition {
  /**
   * The Species this one is a narrower kind of.
   *
   * Present makes this a Sub-species. Absent makes it a root Species.
   */
  readonly parentSpeciesId?: SpeciesId;

  /**
   * What kind of body this Species has.
   *
   * Optional, and inherited from the parent Species when absent — which is
   * what makes the six Bender lineages cost nothing to declare. They are
   * physically Human; only their capabilities differ, and a Sub-species that
   * repeated its parent's whole body profile would be six copies of one fact
   * waiting to disagree.
   *
   * A Sub-species that IS physically different says so and overrides it
   * outright rather than patching: half a body profile is not a body.
   */
  readonly body?: SpeciesBodyProfile;
}

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
  /*
   * The Basic Human Standard, and the calibration every other Species is
   * authored against. Standard Scale 1 is what "Scale" means; a Giant is 10
   * because it is ten times this.
   *
   * Nothing physical is authored here beyond that anchor and the stature
   * bands. Height, Mass, Size, Structural Capacity and Strength all resolve
   * from the anatomy and the reference table in body/anatomy/body-parts.ts —
   * 165 cm, 62.00 kg, 60.00 L, 100 SC, STR 10 — and a Species that restated
   * any of them would be a second source waiting to drift.
   */
  human: {
    id: "human",
    name: "Human",
    description: "A member of the human species.",
    body: {
      standardScale: 1,
      referenceForm: STANDARD_HUMANOID_REFERENCE_FORM,
      globalMorphology: NEUTRAL_MORPHOLOGY,
      localMorphology: {},
      stature: HUMAN_STATURE_BANDS,
      adiposeTissueDensityKgPerL: DEFAULT_ADIPOSE_TISSUE_DENSITY_KG_PER_L,
      ageProfile: HUMAN_AGE_PROFILE,
    },
  },

  /*
   * Benders were a Mutation with an element variant. They are Sub-species
   * now: the element is not a parameter of one thing, it is six different
   * things that happen to share an ancestor — which is exactly what a
   * Sub-species is, and it costs no variant rules to say so.
   *
   * Each grants the Trait that represents the capability itself. The Trait is
   * what other content asks about, so a character who gained Firebending some
   * other way satisfies the same requirements.
   */
  firebender: {
    id: "firebender",
    name: "Firebender",
    description: "A human lineage able to generate and manipulate fire.",
    parentSpeciesId: "human",
    effects: [{ type: "grantTrait", traitId: "firebending" }],
  },

  waterbender: {
    id: "waterbender",
    name: "Waterbender",
    description: "A human lineage able to manipulate water.",
    parentSpeciesId: "human",
    effects: [{ type: "grantTrait", traitId: "waterbending" }],
  },

  earthbender: {
    id: "earthbender",
    name: "Earthbender",
    description: "A human lineage able to manipulate earth and stone.",
    parentSpeciesId: "human",
    effects: [{ type: "grantTrait", traitId: "earthbending" }],
  },

  airbender: {
    id: "airbender",
    name: "Airbender",
    description: "A human lineage able to manipulate air.",
    parentSpeciesId: "human",
    effects: [{ type: "grantTrait", traitId: "airbending" }],
  },

  lightningbender: {
    id: "lightningbender",
    name: "Lightningbender",
    description: "A human lineage able to generate and direct lightning.",
    parentSpeciesId: "human",
    effects: [{ type: "grantTrait", traitId: "lightningbending" }],
  },

  metalbender: {
    id: "metalbender",
    name: "Metalbender",
    description: "A human lineage able to manipulate worked metal.",
    parentSpeciesId: "human",
    effects: [{ type: "grantTrait", traitId: "metalbending" }],
  },

  bloodkin: {
    id: "bloodkin",
    name: "Bloodkin",
    description:
      "A human lineage carrying the blood of a beast or monster.",
    parentSpeciesId: "human",
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

/* ── Lineage ────────────────────────────────────────────────────────────── */

// A parent chain longer than this is a malformed catalog, not a deep
// taxonomy. The walk stops rather than looping if one is ever registered.
const MAX_SPECIES_DEPTH = 16;

/** Whether this Species is a narrower kind of another one. */
export function isSubspecies(speciesId: SpeciesId): boolean {
  return getSpeciesDefinition(speciesId)?.parentSpeciesId !== undefined;
}

/**
 * A Species and every Species it descends from, nearest first.
 *
 * Firebender → ["firebender", "human"]. An unknown id returns just itself:
 * validation is what reports it, and a broken lineage should not take the
 * rest of resolution down with it.
 */
export function speciesAncestry(
  speciesId: SpeciesId,
): readonly SpeciesId[] {
  const lineage: SpeciesId[] = [speciesId];
  const seen = new Set<SpeciesId>([speciesId]);

  let current = getSpeciesDefinition(speciesId)?.parentSpeciesId;

  while (current !== undefined && lineage.length < MAX_SPECIES_DEPTH) {
    if (seen.has(current)) break;

    lineage.push(current);
    seen.add(current);

    current = getSpeciesDefinition(current)?.parentSpeciesId;
  }

  return lineage;
}

/**
 * Every Species a character counts as, across their whole ancestry mix.
 *
 * This is the set a "hasSpecies" requirement is tested against, which is why
 * a Human Firebender satisfies a Human requirement without the author of
 * either rule having to think about it.
 */
export function collectSpeciesAncestry(
  species: readonly CharacterSpecies[],
): readonly SpeciesId[] {
  const all = new Set<SpeciesId>();

  for (const entry of species) {
    for (const ancestor of speciesAncestry(entry.speciesId)) {
      all.add(ancestor);
    }
  }

  return [...all];
}

/** The Sub-species directly beneath one Species, for a picker to offer. */
export function listSubspecies(
  parentSpeciesId: SpeciesId,
): readonly SpeciesDefinition[] {
  return SPECIES_REGISTRY.all().filter(
    (definition) => definition.parentSpeciesId === parentSpeciesId,
  );
}

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
  const issues = [...SPECIES_REGISTRY.findCatalogIssues()];

  for (const definition of SPECIES_REGISTRY.all()) {
    const parentId = definition.parentSpeciesId;

    if (parentId === undefined) continue;

    if (parentId === definition.id) {
      issues.push(`Species "${definition.id}" is its own parent.`);
      continue;
    }

    if (!isKnownSpeciesId(parentId)) {
      issues.push(
        `Species "${definition.id}" descends from unknown Species "${parentId}".`,
      );
      continue;
    }

    // speciesAncestry stops at a repeat rather than looping, so a cycle shows
    // up as a lineage that never reaches a parentless root.
    const lineage = speciesAncestry(definition.id);
    const root = lineage[lineage.length - 1];

    if (root !== undefined && getSpeciesDefinition(root)?.parentSpeciesId !== undefined) {
      issues.push(
        `Species "${definition.id}" has a circular or excessively deep parent chain.`,
      );
    }
  }

  return issues;
}
