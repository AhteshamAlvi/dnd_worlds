/*
 * Validation for universal Effects and Requirements.
 *
 * This file validates the rule definitions themselves.
 *
 * It answers questions such as:
 *
 * - Is an Attribute modifier finite?
 * - Does a grant contain a non-empty referenced id?
 * - Is a Mastery requirement a positive integer?
 * - Is a compound Requirement empty?
 * - Has Requirement nesting become unreasonably deep?
 *
 * It does NOT:
 *
 * - determine whether a character satisfies a Requirement;
 * - determine whether an Effect is currently active;
 * - apply Effects;
 * - mutate character state;
 * - verify that referenced Traits, Skills, Techniques, Items, etc. actually
 *   exist in their catalogs.
 *
 * Catalog/reference existence checks remain the responsibility of the content
 * domain and cross-domain catalog validation.
 *
 * This matches the engine's existing validation pattern: domain validators
 * produce raw issue objects, and character/validation.ts later translates
 * relevant character issues into EngineError diagnostics.
 */

import type { Effect } from "./effects";
import type { Requirement } from "./requirements";


/* -------------------------------------------------------------------------- */
/* Validation issues                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Maximum supported nesting depth for compound Requirements.
 *
 * Authored JSON cannot contain actual object-reference cycles, but malformed
 * or machine-generated content could still produce an excessively deep tree.
 */
export const MAX_REQUIREMENT_DEPTH = 32;


/**
 * A universal rule-definition validation issue.
 *
 * `path` identifies the exact location inside the authored rule data so the
 * Workbench can eventually highlight the offending field directly.
 */
export type RuleValidationIssue =
  | InvalidEffectAmountIssue
  | InvalidCheckScopeIssue
  | MissingEffectReferenceIssue
  | InvalidRequirementNumberIssue
  | InvalidRequirementMasteryIssue
  | MissingRequirementReferenceIssue
  | EmptyCompoundRequirementIssue
  | RequirementDepthExceededIssue
  | InvalidBodyMultiplierIssue
  | SuppressOnBaseAnatomyIssue
  | MissingAnatomyReferenceIssue;


/*
 * A Body effect whose multiplier is not a usable one.
 *
 * Body multipliers are all around 1 and must stay finite and above zero. Zero
 * is rejected rather than treated as an extreme: a Scale of 0 is a body with
 * no size, a Muscularity of 0 drives Structural Capacity negative through the
 * structural factor, and a destruction resistance of 0 would be quietly
 * rescued to 1 by the Maximum BP floor — turning an authoring mistake into a
 * part that silently ignores the effect placed on it.
 */
export interface InvalidBodyMultiplierIssue {
  readonly type: "invalid-body-multiplier";
  readonly path: string;
  readonly effectType: string;
  readonly multiplier: number;
}


/*
 * A permanent anatomy effect trying to suppress.
 *
 * Suppression hides a part WITHOUT changing what the body plan expects, which
 * is coherent only while it is temporary. Permanently, the Reference Form
 * would go on expecting anatomy that is permanently not there, with nothing
 * ever able to resolve the disagreement — the form says one thing, the body
 * says another, and neither is wrong. A permanent removal is removeFromForm.
 */
export interface SuppressOnBaseAnatomyIssue {
  readonly type: "suppress-on-base-anatomy";
  readonly path: string;
}


/*
 * An anatomy operation missing the identifier it needs.
 */
export interface MissingAnatomyReferenceIssue {
  readonly type: "missing-anatomy-reference";
  readonly path: string;
  readonly field: string;
}


export interface InvalidEffectAmountIssue {
  readonly type: "invalid-effect-amount";
  readonly path: string;
  readonly effectType:
    | "modifyBaseAttribute"
    | "modifyResolvedAttribute"
    | "modifyCheck";
  readonly amount: number;
}


/**
 * A modifyCheck Effect whose scope does not name anything.
 *
 * The scope's `kind` is a closed union so a wrong kind cannot compile, but an
 * empty or whitespace attribute/Derived Attribute name can still arrive from
 * hand-edited or machine-generated JSON — and a check modifier scoped to
 * nothing would silently never apply.
 */
export interface InvalidCheckScopeIssue {
  readonly type: "invalid-check-scope";
  readonly path: string;
  readonly kind: "attribute" | "derivedAttribute";
}


export interface MissingEffectReferenceIssue {
  readonly type: "missing-effect-reference";
  readonly path: string;
  readonly effectType:
    | "grantTrait"
    | "grantSkill"
    | "grantTechnique";
  readonly field:
    | "traitId"
    | "skillId"
    | "techniqueId";
}


export interface InvalidRequirementNumberIssue {
  readonly type: "invalid-requirement-number";
  readonly path: string;
  readonly requirementType:
    | "attributeMinimum"
    | "derivedAttributeMinimum"
    | "levelMinimum";
  readonly field:
    | "minimum";
  readonly value: number;
}


export interface InvalidRequirementMasteryIssue {
  readonly type: "invalid-requirement-mastery";
  readonly path: string;
  readonly requirementType:
    | "skillMastery"
    | "techniqueMastery";
  readonly minimumMastery: number;
}


export interface MissingRequirementReferenceIssue {
  readonly type: "missing-requirement-reference";
  readonly path: string;
  readonly requirementType:
    | "hasSpecies"
    | "hasSubspecies"
    | "hasClan"
    | "hasTrait"
    | "hasSkill"
    | "skillMastery"
    | "hasTechnique"
    | "techniqueMastery"
    | "hasCondition"
    | "hasItem";
  readonly field:
    | "speciesId"
    | "subspeciesId"
    | "clanId"
    | "traitId"
    | "skillId"
    | "techniqueId"
    | "conditionId"
    | "itemId";
}


export interface EmptyCompoundRequirementIssue {
  readonly type: "empty-compound-requirement";
  readonly path: string;
  readonly requirementType:
    | "all"
    | "any";
}


export interface RequirementDepthExceededIssue {
  readonly type: "requirement-depth-exceeded";
  readonly path: string;
  readonly maximumDepth: number;
}


/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function isNonEmptyId(
  value: string,
): boolean {
  return value.trim().length > 0;
}


function isFiniteNumber(
  value: number,
): boolean {
  return Number.isFinite(value);
}


function isPositiveInteger(
  value: number,
): boolean {
  return (
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 1
  );
}


/* -------------------------------------------------------------------------- */
/* Effect validation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Validate one Effect definition.
 */
export function findEffectValidationIssues(
  effect: Effect,
  path = "effect",
): readonly RuleValidationIssue[] {
  const issues: RuleValidationIssue[] = [];


  switch (effect.type) {
    case "modifyBaseAttribute":
    case "modifyResolvedAttribute": {
      if (!isFiniteNumber(effect.amount)) {
        issues.push({
          type: "invalid-effect-amount",
          path: `${path}.amount`,
          effectType: effect.type,
          amount: effect.amount,
        });
      }

      break;
    }


    case "modifyCheck": {
      if (!isFiniteNumber(effect.amount)) {
        issues.push({
          type: "invalid-effect-amount",
          path: `${path}.amount`,
          effectType: effect.type,
          amount: effect.amount,
        });
      }

      const scopeName =
        effect.check.kind === "attribute"
          ? effect.check.attribute
          : effect.check.derivedAttribute;

      if (!isNonEmptyId(scopeName)) {
        issues.push({
          type: "invalid-check-scope",
          path: `${path}.check`,
          kind: effect.check.kind,
        });
      }

      break;
    }


    case "grantTrait": {
      if (!isNonEmptyId(effect.traitId)) {
        issues.push({
          type: "missing-effect-reference",
          path: `${path}.traitId`,
          effectType: effect.type,
          field: "traitId",
        });
      }

      break;
    }


    case "grantSkill": {
      if (!isNonEmptyId(effect.skillId)) {
        issues.push({
          type: "missing-effect-reference",
          path: `${path}.skillId`,
          effectType: effect.type,
          field: "skillId",
        });
      }

      break;
    }


    case "grantTechnique": {
      if (!isNonEmptyId(effect.techniqueId)) {
        issues.push({
          type: "missing-effect-reference",
          path: `${path}.techniqueId`,
          effectType: effect.type,
          field: "techniqueId",
        });
      }

      break;
    }


    case "modifyBaseBodyScale":
    case "modifyResolvedBodyScale":
    case "modifyBaseBodyMorphology":
    case "modifyResolvedBodyMorphology":
    case "modifyBaseIntrinsicPhysicalForce":
    case "modifyResolvedIntrinsicPhysicalForce":
    case "modifyBaseDestructionResistance":
    case "modifyResolvedDestructionResistance": {
      if (!isFiniteNumber(effect.multiplier) || effect.multiplier <= 0) {
        issues.push({
          type: "invalid-body-multiplier",
          path: `${path}.multiplier`,
          effectType: effect.type,
          multiplier: effect.multiplier,
        });
      }

      break;
    }


    case "modifyBaseBodyAnatomy":
    case "modifyResolvedBodyAnatomy": {
      const operation = effect.operation;

      if (
        effect.type === "modifyBaseBodyAnatomy" &&
        (operation as { readonly mode: string }).mode === "suppress"
      ) {
        issues.push({
          type: "suppress-on-base-anatomy",
          path: `${path}.operation.mode`,
        });

        break;
      }

      switch (operation.mode) {
        case "addToForm": {
          if (!isNonEmptyId(operation.slotId)) {
            issues.push({
              type: "missing-anatomy-reference",
              path: `${path}.operation.slotId`,
              field: "slotId",
            });
          }

          if (!isNonEmptyId(operation.type)) {
            issues.push({
              type: "missing-anatomy-reference",
              path: `${path}.operation.type`,
              field: "type",
            });
          }

          break;
        }

        case "removeFromForm": {
          if (!isNonEmptyId(operation.slotId)) {
            issues.push({
              type: "missing-anatomy-reference",
              path: `${path}.operation.slotId`,
              field: "slotId",
            });
          }

          break;
        }

        case "replaceForm": {
          if (!isNonEmptyId(operation.referenceFormId)) {
            issues.push({
              type: "missing-anatomy-reference",
              path: `${path}.operation.referenceFormId`,
              field: "referenceFormId",
            });
          }

          break;
        }

        case "suppress":
          break;
      }

      break;
    }
  }


  return issues;
}


/**
 * Validate an array of Effects.
 */
export function findEffectsValidationIssues(
  effects: readonly Effect[],
  path = "effects",
): readonly RuleValidationIssue[] {
  const issues: RuleValidationIssue[] = [];


  for (let index = 0; index < effects.length; index += 1) {
    const effect = effects[index];

    if (effect === undefined) continue;

    issues.push(
      ...findEffectValidationIssues(
        effect,
        `${path}[${index}]`,
      ),
    );
  }


  return issues;
}


/* -------------------------------------------------------------------------- */
/* Requirement validation                                                     */
/* -------------------------------------------------------------------------- */

function findRequirementIssuesInternal(
  requirement: Requirement,
  path: string,
  depth: number,
): readonly RuleValidationIssue[] {
  const issues: RuleValidationIssue[] = [];


  if (depth > MAX_REQUIREMENT_DEPTH) {
    return [
      {
        type: "requirement-depth-exceeded",
        path,
        maximumDepth: MAX_REQUIREMENT_DEPTH,
      },
    ];
  }


  switch (requirement.type) {
    case "attributeMinimum":
    case "derivedAttributeMinimum": {
      if (!isFiniteNumber(requirement.minimum)) {
        issues.push({
          type: "invalid-requirement-number",
          path: `${path}.minimum`,
          requirementType: requirement.type,
          field: "minimum",
          value: requirement.minimum,
        });
      }

      break;
    }


    case "levelMinimum": {
      if (!isPositiveInteger(requirement.minimum)) {
        issues.push({
          type: "invalid-requirement-number",
          path: `${path}.minimum`,
          requirementType: requirement.type,
          field: "minimum",
          value: requirement.minimum,
        });
      }

      break;
    }


    case "hasSpecies": {
      if (!isNonEmptyId(requirement.speciesId)) {
        issues.push({
          type: "missing-requirement-reference",
          path: `${path}.speciesId`,
          requirementType: requirement.type,
          field: "speciesId",
        });
      }

      break;
    }


    case "hasSubspecies": {
      if (!isNonEmptyId(requirement.subspeciesId)) {
        issues.push({
          type: "missing-requirement-reference",
          path: `${path}.subspeciesId`,
          requirementType: requirement.type,
          field: "subspeciesId",
        });
      }

      break;
    }


    case "hasClan": {
      if (!isNonEmptyId(requirement.clanId)) {
        issues.push({
          type: "missing-requirement-reference",
          path: `${path}.clanId`,
          requirementType: requirement.type,
          field: "clanId",
        });
      }

      break;
    }


    case "hasTrait": {
      if (!isNonEmptyId(requirement.traitId)) {
        issues.push({
          type: "missing-requirement-reference",
          path: `${path}.traitId`,
          requirementType: requirement.type,
          field: "traitId",
        });
      }

      break;
    }


    case "hasSkill": {
      if (!isNonEmptyId(requirement.skillId)) {
        issues.push({
          type: "missing-requirement-reference",
          path: `${path}.skillId`,
          requirementType: requirement.type,
          field: "skillId",
        });
      }

      break;
    }


    case "skillMastery": {
      if (!isNonEmptyId(requirement.skillId)) {
        issues.push({
          type: "missing-requirement-reference",
          path: `${path}.skillId`,
          requirementType: requirement.type,
          field: "skillId",
        });
      }

      if (!isPositiveInteger(requirement.minimumMastery)) {
        issues.push({
          type: "invalid-requirement-mastery",
          path: `${path}.minimumMastery`,
          requirementType: requirement.type,
          minimumMastery: requirement.minimumMastery,
        });
      }

      break;
    }


    case "hasTechnique": {
      if (!isNonEmptyId(requirement.techniqueId)) {
        issues.push({
          type: "missing-requirement-reference",
          path: `${path}.techniqueId`,
          requirementType: requirement.type,
          field: "techniqueId",
        });
      }

      break;
    }


    case "techniqueMastery": {
      if (!isNonEmptyId(requirement.techniqueId)) {
        issues.push({
          type: "missing-requirement-reference",
          path: `${path}.techniqueId`,
          requirementType: requirement.type,
          field: "techniqueId",
        });
      }

      if (!isPositiveInteger(requirement.minimumMastery)) {
        issues.push({
          type: "invalid-requirement-mastery",
          path: `${path}.minimumMastery`,
          requirementType: requirement.type,
          minimumMastery: requirement.minimumMastery,
        });
      }

      break;
    }


    case "hasCondition": {
      if (!isNonEmptyId(requirement.conditionId)) {
        issues.push({
          type: "missing-requirement-reference",
          path: `${path}.conditionId`,
          requirementType: requirement.type,
          field: "conditionId",
        });
      }

      break;
    }


    case "hasItem": {
      if (!isNonEmptyId(requirement.itemId)) {
        issues.push({
          type: "missing-requirement-reference",
          path: `${path}.itemId`,
          requirementType: requirement.type,
          field: "itemId",
        });
      }

      break;
    }


    case "all":
    case "any": {
      if (requirement.requirements.length === 0) {
        issues.push({
          type: "empty-compound-requirement",
          path: `${path}.requirements`,
          requirementType: requirement.type,
        });

        break;
      }


      for (
        let index = 0;
        index < requirement.requirements.length;
        index += 1
      ) {
        const child = requirement.requirements[index];

        if (child === undefined) continue;

        issues.push(
          ...findRequirementIssuesInternal(
            child,
            `${path}.requirements[${index}]`,
            depth + 1,
          ),
        );
      }

      break;
    }


    case "not": {
      issues.push(
        ...findRequirementIssuesInternal(
          requirement.requirement,
          `${path}.requirement`,
          depth + 1,
        ),
      );

      break;
    }
  }


  return issues;
}


/**
 * Validate one Requirement tree.
 */
export function findRequirementValidationIssues(
  requirement: Requirement,
  path = "requirement",
): readonly RuleValidationIssue[] {
  return findRequirementIssuesInternal(
    requirement,
    path,
    1,
  );
}


/**
 * Validate a list of Requirements.
 *
 * A top-level list represents an implicit AND:
 *
 *   [
 *     requirement A,
 *     requirement B,
 *   ]
 *
 * means both A and B must be satisfied.
 *
 * An empty top-level list is valid and simply means that the content has no
 * prerequisites.
 */
export function findRequirementsValidationIssues(
  requirements: readonly Requirement[],
  path = "requirements",
): readonly RuleValidationIssue[] {
  const issues: RuleValidationIssue[] = [];


  for (
    let index = 0;
    index < requirements.length;
    index += 1
  ) {
    const requirement = requirements[index];

    if (requirement === undefined) continue;

    issues.push(
      ...findRequirementValidationIssues(
        requirement,
        `${path}[${index}]`,
      ),
    );
  }


  return issues;
}


/* -------------------------------------------------------------------------- */
/* Combined rule validation                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Convenience function for content definitions that contain both Effects and
 * Requirements.
 *
 * This performs structural rule validation only.
 *
 * It does not check whether referenced ids exist in their respective catalogs.
 */
export function findRuleValidationIssues(
  effects: readonly Effect[] = [],
  requirements: readonly Requirement[] = [],
): readonly RuleValidationIssue[] {
  return [
    ...findEffectsValidationIssues(effects),
    ...findRequirementsValidationIssues(requirements),
  ];
}