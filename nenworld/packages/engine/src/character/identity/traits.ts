/*
 * Traits — what has become part of a character.
 *
 * The line between a Trait and a Condition is whether it is still happening
 * *to* the character or has been integrated *into* them. Poison is a
 * Condition. The scar it left is a Trait.
 *
 * A Trait's mechanics are universal Effects, the same ones a Sub-species, an
 * Item or a Technique rank uses. Traits used to carry their own
 * attributeModifiers field and their own collection function, which meant
 * attribute resolution had to import this module by name; now a Trait that
 * costs DEX 2 says so with modifyBaseAttribute and the rules layer does the
 * rest.
 *
 * ── Sub-traits ──────────────────────────────────────────────────────────
 *
 * A Sub-trait is a Trait whose parent is another Trait:
 *
 *   Spider Mutation
 *   ├── Superstrength
 *   ├── Spider Sense
 *   └── Wall Sticking          (a Skill, not a Sub-trait)
 *
 * parentTraitId records the taxonomy, for grouping and for a picker that
 * wants to show them together. What actually gives the character a Sub-trait
 * is an ordinary grantTrait Effect on the parent — so a Trait is free to
 * grant a Skill directly, without a Sub-trait in between, whenever that is
 * what the content means.
 */

import {
  createRegistry,
  scanReferences,
} from "../../infrastructure/registry";

import type { EffectfulDefinition } from "../rules/content";
import type { RuleSourceRef, TraitGrant } from "../rules/resolution";

/**
 * Stable semantic identifier for a Trait definition.
 *
 * Examples: "one-armed", "spider-mutation", "heavenly-restriction".
 */
export type TraitId = string;

export interface TraitDefinition extends EffectfulDefinition {
  /**
   * The Trait this one is part of.
   *
   * Present makes this a Sub-trait. It does not by itself grant anything —
   * the parent's grantTrait Effect does that.
   */
  readonly parentTraitId?: TraitId;
}

/**
 * A Trait possessed by a particular character.
 */
export interface CharacterTrait {
  readonly traitId: TraitId;
}

export const TRAIT_DEFINITIONS = {
  "one-armed": {
    id: "one-armed",
    name: "One Armed",
    description: "The character permanently has only one functional arm.",
    effects: [
      {
        type: "modifyBaseAttribute",
        attribute: "dex",
        amount: -2,
      },
    ],
  },

  /*
   * The bending capabilities. Previously Abilities — a third capability
   * category that existed only to say "this character can do this at all",
   * which is what a Trait says.
   *
   * A Sub-species grants these, but nothing about them depends on that: a
   * Trait acquired some other way satisfies the same requirements.
   */
  firebending: {
    id: "firebending",
    name: "Firebending",
    description:
      "The character can generate and manipulate fire.",
  },

  waterbending: {
    id: "waterbending",
    name: "Waterbending",
    description: "The character can manipulate water.",
  },

  earthbending: {
    id: "earthbending",
    name: "Earthbending",
    description: "The character can manipulate earth and stone.",
  },

  airbending: {
    id: "airbending",
    name: "Airbending",
    description: "The character can manipulate air.",
  },

  lightningbending: {
    id: "lightningbending",
    name: "Lightningbending",
    description: "The character can generate and direct lightning.",
  },

  metalbending: {
    id: "metalbending",
    name: "Metalbending",
    description: "The character can manipulate worked metal.",
  },

  /*
   * Alterations that were Mutations. Each is something that has become part
   * of the character rather than something currently happening to them, which
   * is what makes them Traits and not Conditions.
   */
  jinchuriki: {
    id: "jinchuriki",
    name: "Jinchūriki",
    description: "The character contains a sealed beast or entity.",
  },

  "heavenly-restriction": {
    id: "heavenly-restriction",
    name: "Heavenly Restriction",
    description:
      "The character's body and Aura are permanently altered by a Heavenly Restriction.",
  },

  "devil-fruit-user": {
    id: "devil-fruit-user",
    name: "Devil Fruit User",
    description: "The character has been altered by consuming a Devil Fruit.",
  },

  infernal: {
    id: "infernal",
    name: "Infernal",
    description:
      "The character has been permanently transformed by the Burning Man disease.",
  },
} as const satisfies Record<string, TraitDefinition>;

const TRAIT_REGISTRY = createRegistry<TraitDefinition>(
  "Trait",
  TRAIT_DEFINITIONS,
);

export type KnownTraitId = keyof typeof TRAIT_DEFINITIONS;

export function isKnownTraitId(traitId: TraitId): boolean {
  return TRAIT_REGISTRY.isKnownId(traitId);
}

export function getTraitDefinition(
  traitId: TraitId,
): TraitDefinition | undefined {
  return TRAIT_REGISTRY.get(traitId);
}

/** The Sub-traits directly beneath one Trait, for grouping in a picker. */
export function listSubtraits(
  parentTraitId: TraitId,
): readonly TraitDefinition[] {
  return TRAIT_REGISTRY.all().filter(
    (definition) => definition.parentTraitId === parentTraitId,
  );
}

/* ── Resolved Traits ────────────────────────────────────────────────────── */

/**
 * A Trait the character currently has, and how they came by it.
 *
 * The distinction matters when something is removed. A Trait the sheet lists
 * survives its granter disappearing; one that exists only through a grant
 * disappears with the last source that supplied it.
 */
export interface ResolvedTrait {
  readonly traitId: TraitId;

  readonly isAuthored: boolean;
  readonly grantedBy: readonly RuleSourceRef[];
}

export type ResolvedTraits = Readonly<Record<TraitId, ResolvedTrait>>;

/**
 * Fold a character's own Traits together with the ones granted to them.
 *
 * Multiple sources granting the same Trait are all recorded, because removing
 * one of them must not remove access the others still supply.
 */
export function resolveTraits(
  authored: readonly CharacterTrait[] = [],
  grants: readonly TraitGrant[] = [],
): ResolvedTraits {
  const resolved: Record<TraitId, ResolvedTrait> = {};

  for (const trait of authored) {
    resolved[trait.traitId] = {
      traitId: trait.traitId,
      isAuthored: true,
      grantedBy: [],
    };
  }

  for (const grant of grants) {
    const existing = resolved[grant.traitId] ?? {
      traitId: grant.traitId,
      isAuthored: false,
      grantedBy: [],
    };

    const alreadyRecorded = existing.grantedBy.some(
      (source) =>
        source.type === grant.source.type && source.id === grant.source.id,
    );

    resolved[grant.traitId] = {
      ...existing,
      grantedBy: alreadyRecorded
        ? existing.grantedBy
        : [...existing.grantedBy, grant.source],
    };
  }

  return resolved;
}

/** Every Trait id the character currently has, authored or granted. */
export function resolvedTraitIds(traits: ResolvedTraits): readonly TraitId[] {
  return Object.keys(traits);
}

/* ── Validation ─────────────────────────────────────────────────────────── */

export type TraitValidationIssue =
  | {
      readonly type: "unknown-trait";
      readonly traitId: TraitId;
    }
  | {
      readonly type: "duplicate-trait";
      readonly traitId: TraitId;
    };

export function findTraitValidationIssues(
  traits: readonly CharacterTrait[],
): readonly TraitValidationIssue[] {
  return scanReferences(
    traits.map((trait) => trait.traitId),
    isKnownTraitId,
  ).map((issue) => ({
    type: issue.kind === "unknown" ? "unknown-trait" : "duplicate-trait",
    traitId: issue.id,
  }));
}

/*
 * Development-time validation of the authored Trait catalog itself.
 *
 * Character validation checks whether characters reference valid Traits.
 * This checks whether our own definitions are malformed. The Effects on them
 * are checked generically by catalogs.ts, which runs the shared rule
 * validator over every domain rather than each domain rechecking its own.
 */
export function findTraitCatalogIssues(): readonly string[] {
  const issues = [...TRAIT_REGISTRY.findCatalogIssues()];

  for (const trait of TRAIT_REGISTRY.all()) {
    const parentId = trait.parentTraitId;

    if (parentId === undefined) continue;

    if (parentId === trait.id) {
      issues.push(`Trait "${trait.id}" is its own parent.`);
      continue;
    }

    if (!isKnownTraitId(parentId)) {
      issues.push(
        `Trait "${trait.id}" belongs to unknown Trait "${parentId}".`,
      );
    }
  }

  return issues;
}

// Exposed for the catalog index, which needs every registry in one map.
export const traitRegistry = TRAIT_REGISTRY;
