/*
 * Techniques — learned disciplines, styles and bodies of training.
 *
 * Techniques provide the foundation individual Skills require. See
 * abilities.ts for how the three capability layers fit together.
 */

import {
  createRegistry,
  type Definition,
} from "../../infrastructure/registry";

export type TechniqueId = string;

export type TechniqueDefinition = Definition;

export interface CharacterTechnique {
  readonly techniqueId: TechniqueId;
}

export const TECHNIQUE_DEFINITIONS = {
  "martial-arts": {
    id: "martial-arts",
    name: "Martial Arts",
    description:
      "Structured training in unarmed combat and bodily fighting techniques.",
  },

  lockpicking: {
    id: "lockpicking",
    name: "Lockpicking",
    description:
      "Structured knowledge of manually bypassing mechanical locks.",
  },

  "firebending-forms": {
    id: "firebending-forms",
    name: "Firebending Forms",
    description:
      "Structured training in the controlled application of Firebending.",
  },
} as const satisfies Record<string, TechniqueDefinition>;

const TECHNIQUE_REGISTRY = createRegistry<TechniqueDefinition>(
  "Technique",
  TECHNIQUE_DEFINITIONS,
);

export type KnownTechniqueId = keyof typeof TECHNIQUE_DEFINITIONS;

export function isKnownTechniqueId(
  techniqueId: TechniqueId,
): boolean {
  return TECHNIQUE_REGISTRY.isKnownId(techniqueId);
}

export function getTechniqueDefinition(
  techniqueId: TechniqueId,
): TechniqueDefinition | undefined {
  return TECHNIQUE_REGISTRY.get(techniqueId);
}

export function findTechniqueCatalogIssues(): readonly string[] {
  return TECHNIQUE_REGISTRY.findCatalogIssues();
}

// Exposed for the catalog index, which needs every registry in one map.
export const techniqueRegistry = TECHNIQUE_REGISTRY;
