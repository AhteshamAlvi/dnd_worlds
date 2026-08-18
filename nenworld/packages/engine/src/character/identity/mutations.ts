/*
 * Mutations — what a character has been altered into.
 *
 * The only identity domain with subtypes: a Bender is always a Bender of
 * something, while a Bloodkin is just a Bloodkin. That asymmetry is what the
 * variant rules below exist to police.
 */

import {
  createRegistry,
  scanReferences,
  type Definition,
} from "../../infrastructure/registry";

export type MutationId = string;
export type MutationVariantId = string;

export type MutationVariantDefinition = Definition;

export interface MutationDefinition extends Definition {
  /**
   * Available subtypes of this Mutation.
   *
   * Example: Bender -> Fire, Water, Earth, Air, Lightning, Metal.
   */
  readonly variants?: readonly MutationVariantDefinition[];

  /**
   * Whether a character possessing this Mutation must specify one of its
   * variants.
   */
  readonly requiresVariant?: boolean;
}

export interface CharacterMutation {
  readonly mutationId: MutationId;

  /**
   * Optional subtype of the Mutation.
   *
   * Example: { mutationId: "bender", variantId: "fire" }.
   */
  readonly variantId?: MutationVariantId;
}

export const MUTATION_DEFINITIONS = {
  bender: {
    id: "bender",
    name: "Bender",
    description: "A Mutant capable of manipulating one specific element.",
    requiresVariant: true,
    variants: [
      {
        id: "fire",
        name: "Fire",
        description: "The character possesses Firebending.",
      },
      {
        id: "water",
        name: "Water",
        description: "The character possesses Waterbending.",
      },
      {
        id: "earth",
        name: "Earth",
        description: "The character possesses Earthbending.",
      },
      {
        id: "air",
        name: "Air",
        description: "The character possesses Airbending.",
      },
      {
        id: "lightning",
        name: "Lightning",
        description: "The character possesses Lightningbending.",
      },
      {
        id: "metal",
        name: "Metal",
        description: "The character possesses Metalbending.",
      },
    ],
  },

  bloodkin: {
    id: "bloodkin",
    name: "Bloodkin",
    description: "A Mutant altered through the blood of a beast or monster.",
  },

  "devil-fruit-user": {
    id: "devil-fruit-user",
    name: "Devil Fruit User",
    description: "A Mutant altered by consuming a Devil Fruit.",
  },

  infernal: {
    id: "infernal",
    name: "Infernal",
    description: "A Mutant altered by the Burning Man disease.",
  },

  jinchuriki: {
    id: "jinchuriki",
    name: "Jinchūriki",
    description: "A Mutant who contains a sealed beast or entity.",
  },

  "heavenly-restriction": {
    id: "heavenly-restriction",
    name: "Heavenly Restriction",
    description:
      "A Mutant whose body and Aura are altered by a Heavenly Restriction.",
  },
} as const satisfies Record<string, MutationDefinition>;

const MUTATION_REGISTRY = createRegistry<MutationDefinition>(
  "Mutation",
  MUTATION_DEFINITIONS,
);

export type KnownMutationId = keyof typeof MUTATION_DEFINITIONS;

export function isKnownMutationId(
  mutationId: MutationId,
): boolean {
  return MUTATION_REGISTRY.isKnownId(mutationId);
}

export function getMutationDefinition(
  mutationId: MutationId,
): MutationDefinition | undefined {
  return MUTATION_REGISTRY.get(mutationId);
}

export function getMutationVariantDefinition(
  mutationId: MutationId,
  variantId: MutationVariantId,
): MutationVariantDefinition | undefined {
  return getMutationDefinition(mutationId)?.variants?.find(
    (variant) => variant.id === variantId,
  );
}

export type MutationValidationIssue =
  | {
      readonly type: "unknown-mutation";
      readonly mutationId: MutationId;
    }
  | {
      readonly type: "duplicate-mutation";
      readonly mutationId: MutationId;
    }
  | {
      readonly type: "missing-mutation-variant";
      readonly mutationId: MutationId;
    }
  | {
      readonly type: "unexpected-mutation-variant";
      readonly mutationId: MutationId;
      readonly variantId: MutationVariantId;
    }
  | {
      readonly type: "unknown-mutation-variant";
      readonly mutationId: MutationId;
      readonly variantId: MutationVariantId;
    };

// Checks one Mutation's variant against its definition. Only reached for a
// Mutation already known to exist and not to be a repeat.
function findVariantIssues(
  mutation: CharacterMutation,
  definition: MutationDefinition,
): readonly MutationValidationIssue[] {
  if (mutation.variantId === undefined) {
    return definition.requiresVariant === true
      ? [
          {
            type: "missing-mutation-variant",
            mutationId: mutation.mutationId,
          },
        ]
      : [];
  }

  if (definition.variants === undefined || definition.variants.length === 0) {
    return [
      {
        type: "unexpected-mutation-variant",
        mutationId: mutation.mutationId,
        variantId: mutation.variantId,
      },
    ];
  }

  if (
    getMutationVariantDefinition(mutation.mutationId, mutation.variantId) ===
    undefined
  ) {
    return [
      {
        type: "unknown-mutation-variant",
        mutationId: mutation.mutationId,
        variantId: mutation.variantId,
      },
    ];
  }

  return [];
}

export function findMutationValidationIssues(
  mutations: readonly CharacterMutation[],
): readonly MutationValidationIssue[] {
  const issues: MutationValidationIssue[] = scanReferences(
    mutations.map((mutation) => mutation.mutationId),
    isKnownMutationId,
  ).map((issue) => ({
    type: issue.kind === "unknown" ? "unknown-mutation" : "duplicate-mutation",
    mutationId: issue.id,
  }));

  // Unknown ids have no definition to judge a variant against. Repeats are
  // skipped rather than re-checked: the second Bender's element is not a
  // separate problem from the second Bender.
  const unknown = new Set(
    issues
      .filter((issue) => issue.type === "unknown-mutation")
      .map((issue) => issue.mutationId),
  );

  const checked = new Set<MutationId>();

  for (const mutation of mutations) {
    if (unknown.has(mutation.mutationId) || checked.has(mutation.mutationId)) {
      continue;
    }

    checked.add(mutation.mutationId);

    const definition = getMutationDefinition(mutation.mutationId);

    if (definition !== undefined) {
      issues.push(...findVariantIssues(mutation, definition));
    }
  }

  return issues;
}

export function findMutationCatalogIssues(): readonly string[] {
  const issues = [...MUTATION_REGISTRY.findCatalogIssues()];

  for (const mutation of MUTATION_REGISTRY.all()) {
    const variants = mutation.variants ?? [];

    // A Mutation that demands a variant but offers none can never validate.
    if (mutation.requiresVariant === true && variants.length === 0) {
      issues.push(
        `Mutation "${mutation.id}" requires a variant but defines none.`,
      );
    }

    const seen = new Set<MutationVariantId>();

    for (const variant of variants) {
      if (seen.has(variant.id)) {
        issues.push(
          `Mutation "${mutation.id}" defines variant "${variant.id}" more than once.`,
        );
      }

      seen.add(variant.id);
    }
  }

  return issues;
}

// Exposed for the catalog index, which needs every registry in one map.
export const mutationRegistry = MUTATION_REGISTRY;
