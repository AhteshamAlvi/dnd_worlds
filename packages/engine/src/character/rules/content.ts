/*
 * The shape every piece of authored content shares.
 *
 * Species, Traits, Skills, Techniques, Items, Conditions and injuries differ
 * in what they mean, not in how they reach the rules engine: each one may
 * declare Effects it contributes and Requirements that gate it. Spelling
 * those two fields out separately in seven files is how they drift apart, so
 * they are declared once here and extended by each domain.
 *
 * This is the file that makes "new content is data" true. A domain adds a
 * definition to its catalog; the rules layer already knows how to read the
 * effects and requirements on it.
 */

import type { Definition } from "../../infrastructure/registry";

import type { Effect } from "./effects";
import type { Requirement } from "./requirements";
import type { StatureAllowance } from "../foundation/body/stature/types";

/**
 * A catalog definition that participates in the universal rules system.
 *
 * `effects` are what the content does once it applies. `requirements` are
 * what must already be true for it to be acquired or to apply — which of the
 * two a domain means is the domain's business, and each documents it.
 */
export interface EffectfulDefinition extends Definition {
  readonly effects?: readonly Effect[];
  readonly requirements?: readonly Requirement[];

  /*
   * Exceptional stature this content permits.
   *
   * Not an Effect, and deliberately so. An Effect changes a body; this changes
   * whether a body the character already has is ALLOWED. A Species Trait for
   * unusual height explains a 210 cm Human without making anyone taller, and
   * conflating the two would mean every explanation also had to be a cause.
   *
   * The engine only checks coverage — per dimension and per direction. What
   * counts as a legitimate reason is content's business; see
   * foundation/body/stature/justification.ts.
   */
  readonly statureAllowances?: readonly StatureAllowance[];
}

/**
 * The optional parts of a RuleEffectSource an EffectfulDefinition supplies.
 *
 * A source used to be worth building only when it had Effects. Stature
 * allowances broke that: a Trait explaining an unusual height carries no
 * Effect at all, and dropping it would have silently made the character
 * illegal. Spread this into the source object so every builder answers the
 * "is there anything here" question the same way.
 */
export function sourceContributions(
  definition: EffectfulDefinition,
): { readonly statureAllowances?: readonly StatureAllowance[] } {
  const allowances = definition.statureAllowances ?? [];

  return allowances.length > 0 ? { statureAllowances: allowances } : {};
}


/**
 * Whether a definition contributes anything at all through the given Effects.
 */
export function contributesNothing(
  definition: EffectfulDefinition,
  effects: readonly Effect[],
): boolean {
  return effects.length === 0 && (definition.statureAllowances ?? []).length === 0;
}


/**
 * Every id a grant Effect points at, whatever kind of grant it is.
 *
 * Catalog validation uses this to check that authored content only grants
 * things that exist, without each domain re-walking the Effect union itself.
 */
export function collectGrantedIds(
  effects: readonly Effect[] = [],
): {
  readonly traitIds: readonly string[];
  readonly skillIds: readonly string[];
  readonly techniqueIds: readonly string[];
} {
  const traitIds: string[] = [];
  const skillIds: string[] = [];
  const techniqueIds: string[] = [];

  for (const effect of effects) {
    switch (effect.type) {
      case "grantTrait":
        traitIds.push(effect.traitId);
        break;

      case "grantSkill":
        skillIds.push(effect.skillId);
        break;

      case "grantTechnique":
        techniqueIds.push(effect.techniqueId);
        break;

      default:
        break;
    }
  }

  return { traitIds, skillIds, techniqueIds };
}

/**
 * Every id a Requirement tree refers to, paired with the domain it belongs
 * to, so a caller can check each against the right catalog.
 *
 * Compound requirements are walked recursively; the depth cap that protects
 * validation from a malformed tree lives in rules/validation.ts, and this
 * walk is only ever run over content that passed it.
 */
export type RequirementReferenceDomain =
  | "species"
  | "clan"
  | "trait"
  | "skill"
  | "technique"
  | "condition"
  | "item";

export interface RequirementReference {
  readonly domain: RequirementReferenceDomain;
  readonly id: string;
}

export function collectRequirementReferences(
  requirements: readonly Requirement[] = [],
): readonly RequirementReference[] {
  const references: RequirementReference[] = [];

  const walk = (requirement: Requirement): void => {
    switch (requirement.type) {
      // Sub-species are Species definitions with a parent, so both forms
      // resolve against the same catalog.
      case "hasSpecies":
        references.push({ domain: "species", id: requirement.speciesId });
        break;

      case "hasSubspecies":
        references.push({ domain: "species", id: requirement.subspeciesId });
        break;

      case "hasClan":
        references.push({ domain: "clan", id: requirement.clanId });
        break;

      case "hasTrait":
        references.push({ domain: "trait", id: requirement.traitId });
        break;

      case "hasSkill":
      case "skillMastery":
        references.push({ domain: "skill", id: requirement.skillId });
        break;

      case "hasTechnique":
      case "techniqueMastery":
        references.push({ domain: "technique", id: requirement.techniqueId });
        break;

      case "hasCondition":
        references.push({ domain: "condition", id: requirement.conditionId });
        break;

      case "hasItem":
        references.push({ domain: "item", id: requirement.itemId });
        break;

      case "all":
      case "any":
        for (const child of requirement.requirements) walk(child);
        break;

      case "not":
        walk(requirement.requirement);
        break;

      default:
        break;
    }
  };

  for (const requirement of requirements) walk(requirement);

  return references;
}
