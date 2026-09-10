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

import { isValidCheckScopeSelector } from "../../checks/validation";
import {
  CHECK_MODIFIER_ACTIVATIONS,
  type CheckModifierActivation,
} from "../../checks/types";
import {
  ACTION_CAPACITY_KINDS,
  type ActionCapacityKind,
} from "../foundation/actions/types";
import { isValidActionCapacityAmount } from "../foundation/actions/validation";
import { isSenseId } from "../foundation/senses/scopes";
import { isValidSenseSelector } from "../foundation/senses/validation";
/*
 * No Effect, Requirement or NamedRequirement type is imported here any more,
 * and their absence is the point. Every entry point takes `unknown` and
 * narrows through predicates; naming the validated shapes would only be useful
 * for an `as`, which is the assertion these functions exist to avoid making.
 */
import { isCapabilityGrantMode } from "./effects";


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
  | InvalidCheckActivationIssue
  | InvalidActionCapacityKindIssue
  | MissingEffectReferenceIssue
  | InvalidGrantModeIssue
  | InvalidRequirementNumberIssue
  | InvalidRequirementMasteryIssue
  | MissingRequirementReferenceIssue
  | EmptyCompoundRequirementIssue
  | RequirementDepthExceededIssue
  | MalformedRuleNodeIssue
  | UnknownRuleTypeIssue
  | InvalidNamedRequirementIdIssue
  | DuplicateNamedRequirementIdIssue
  | InvalidNamedRequirementSummaryIssue
  | MalformedNamedRequirementIssue
  | InvalidBodyMultiplierIssue
  | SuppressOnBaseAnatomyIssue
  | MissingAnatomyReferenceIssue
  | InvalidSenseEffectIssue;

/*
 * An omitted mode is legal and means granted-while-present; anything present
 * has to be one the engine knows.
 */
function findGrantModeIssues(
  path: string,
  effectType: "grantTrait" | "grantSkill" | "grantTechnique",
  mode: unknown,
): readonly InvalidGrantModeIssue[] {
  if (mode === undefined) return [];

  if (isCapabilityGrantMode(mode)) return [];

  return [
    {
      type: "invalid-grant-mode",
      path: `${path}.mode`,
      effectType,
      mode,
    },
  ];
}


export interface InvalidSenseEffectIssue {
  readonly type: "invalid-sense-effect";
  readonly path: string;
}


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
  readonly multiplier: unknown;
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
    | "modifyCheck"
    | "modifyActionCapacity"
    | "modifySense";
  /*
   * `unknown`, not `number`. This issue exists BECAUSE the amount was not a
   * number, and declaring it as one would be the validator restating the
   * assumption it just disproved — every consumer inheriting the lie.
   */
  readonly amount: unknown;
}


/**
 * A modifyActionCapacity Effect naming a capacity kind that is not "round",
 * "turn", or "reaction".
 *
 * The type system already closes this off for hand-authored TypeScript
 * content, but homebrew or machine-generated JSON can still cross the engine
 * boundary with a typo'd kind.
 */
export interface InvalidActionCapacityKindIssue {
  readonly type: "invalid-action-capacity-kind";
  readonly path: string;
  readonly kind: unknown;
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
  readonly kind: unknown;
}


/**
 * A modifyCheck Effect whose `activation` is not one the engine recognizes.
 *
 * The field is optional and its type is a closed union, so hand-authored
 * TypeScript cannot get this wrong — but homebrew or machine-generated JSON
 * can, and this is the one Effect field where a typo is silently CATASTROPHIC
 * rather than merely wrong. `"invoke"`, `"Invoked"` or `"always"` all fail the
 * `?? default` fallback in rules/resolution.ts and land in the channel
 * verbatim, where nothing matches them: `collectPersistentCheckModifiers`
 * skips them, `collectInvokedCheckModifiers` skips them, and the modifier
 * quietly never applies to anything, ever.
 *
 * A scope typo at least produces a modifier that visibly applies to the wrong
 * checks. An activation typo produces a modifier that applies to none, and
 * looks exactly like content that was never written.
 */
export interface InvalidCheckActivationIssue {
  readonly type: "invalid-check-activation";
  readonly path: string;
  readonly activation: unknown;
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


/**
 * A grant naming a mode the engine does not have.
 *
 * Worth its own issue rather than being ignored: an unrecognised mode string
 * would fall through to the default and grant temporary access, so a typo in
 * "granted-permanently" would silently produce an award that never happens.
 */
export interface InvalidGrantModeIssue {
  readonly type: "invalid-grant-mode";
  readonly path: string;
  readonly effectType:
    | "grantTrait"
    | "grantSkill"
    | "grantTechnique";
  readonly mode: unknown;
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
  readonly value: unknown;
}


export interface InvalidRequirementMasteryIssue {
  readonly type: "invalid-requirement-mastery";
  readonly path: string;
  readonly requirementType:
    | "skillMastery"
    | "techniqueMastery";
  readonly minimumMastery: unknown;
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


/*
 * The two things a rule can be that are not a rule at all.
 *
 * Both used to be invisible in opposite directions. A null or non-object node
 * THREW on the first read of `.type`, and a node carrying a discriminant
 * nothing recognises fell off the end of the switch and was reported as
 * perfectly valid — so a typo in an Effect type produced content that
 * validated cleanly and then did nothing forever, which is the worst of the
 * two outcomes.
 *
 * `kind` distinguishes the two vocabularies rather than duplicating the
 * variants, since the mistake and the fix read identically for both.
 */
export interface MalformedRuleNodeIssue {
  readonly type: "malformed-rule-node";
  readonly path: string;
  readonly kind: "effect" | "requirement";
}


export interface UnknownRuleTypeIssue {
  readonly type: "unknown-rule-type";
  readonly path: string;
  readonly kind: "effect" | "requirement";
  readonly value: unknown;
}


/*
 * What a named requirement bundle can get wrong.
 *
 * The id is the addressable half of a NamedRequirement, so these are not
 * cosmetic: a blank or repeated id makes a finding a caller cannot act on and
 * a GM override that lands on the wrong requirement — or on two of them.
 *
 * The offending values are typed `unknown` rather than `string`, for the same
 * reason inventory validation does it: declaring `id: string` on an issue that
 * exists BECAUSE the id was 42 is the validator restating the assumption it
 * just disproved.
 */
export interface InvalidNamedRequirementIdIssue {
  readonly type: "invalid-named-requirement-id";
  readonly path: string;
  readonly id: unknown;
}


export interface DuplicateNamedRequirementIdIssue {
  readonly type: "duplicate-named-requirement-id";
  readonly path: string;
  readonly id: string;
}


export interface InvalidNamedRequirementSummaryIssue {
  readonly type: "invalid-named-requirement-summary";
  readonly path: string;
  readonly summary: unknown;
}


/** The entry is not a named requirement at all — no object, or no rule in it. */
export interface MalformedNamedRequirementIssue {
  readonly type: "malformed-named-requirement";
  readonly path: string;
}


/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

/*
 * Every field predicate takes `unknown`.
 *
 * isNonEmptyId used to take `string` and call `.trim()` on it, which is a
 * promise the caller could not keep: these fields come out of authored JSON
 * and a host's registered catalog, where `traitId` is as likely to be absent
 * as to be a string. The type said the check was safe and the runtime threw on
 * `{ type: "hasTrait" }` — a requirement missing exactly the field the
 * validator exists to complain about.
 */
function isNonEmptyId(
  value: unknown,
): boolean {
  return typeof value === "string" && value.trim().length > 0;
}


function isFiniteNumber(
  value: unknown,
): boolean {
  return Number.isFinite(value);
}


/*
 * Body multipliers are all around 1 and must stay finite and above zero.
 * Written as one predicate rather than `isFiniteNumber(x) && x > 0`, because
 * the second half of that expression compares a value the first half has only
 * just established is a number — and TypeScript is right to refuse it when the
 * value arrives as `unknown`.
 */
function isPositiveFiniteNumber(
  value: unknown,
): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}


function isPositiveInteger(
  value: unknown,
): boolean {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1;
}


/*
 * Membership against the authoritative activation vocabulary.
 *
 * CHECK_MODIFIER_ACTIVATIONS lives beside the channel it feeds, in
 * checks/types.ts, for the same reason the scope lists do: a second copy here
 * is a second thing to keep in step, and the one that drifts is always the
 * copy.
 */
function isKnownCheckModifierActivation(
  value: unknown,
): value is CheckModifierActivation {
  return (
    typeof value === "string" &&
    (CHECK_MODIFIER_ACTIVATIONS as readonly string[]).includes(value)
  );
}


function isKnownActionCapacityKind(
  value: unknown,
): value is ActionCapacityKind {
  return (
    typeof value === "string" &&
    (ACTION_CAPACITY_KINDS as readonly string[]).includes(value)
  );
}


/*
 * Whether a value is shaped like a rule node at all: an object carrying a
 * non-empty string discriminant.
 *
 * Checked before ANY field is read, in both vocabularies. A guard placed after
 * the first dereference is the specific mistake spatial validation was
 * hardened against, and it looks fixed in review because the guard is visibly
 * there.
 *
 * These are type PREDICATES rather than assertions, which is what lets the
 * validators take `unknown` and narrow without a single `as`. That matters
 * more than it looks: `candidate as Effect` tells the compiler the value is a
 * valid Effect, which is precisely the claim this function exists to test, so
 * every field read afterwards is well-typed and unfounded. Narrowing to a
 * record of `unknown` fields keeps the reads honest — each one hands an
 * unknown to a predicate that takes unknown.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}


type RuleNode = Record<string, unknown> & { readonly type: string };

function isRuleNode(value: unknown): value is RuleNode {
  return isRecord(value) &&
    typeof value.type === "string" &&
    value.type.length > 0;
}


/* -------------------------------------------------------------------------- */
/* Effect validation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Validate one Effect definition.
 *
 * Takes `unknown`, because an Effect arrives from authored JSON and from a
 * host's registered catalog and may be anything at all — including null, which
 * used to throw here on the first read of `.type`.
 */
export function findEffectValidationIssues(
  candidate: unknown,
  path = "effect",
): readonly RuleValidationIssue[] {
  if (!isRuleNode(candidate)) {
    return [{ type: "malformed-rule-node", path, kind: "effect" }];
  }

  const issues: RuleValidationIssue[] = [];

  const effect: RuleNode = candidate;

  /*
   * The discriminant is read into a LOCAL before the switch, and that is not
   * cosmetic. TypeScript narrows a discriminated union through `switch
   * (obj.kind)`, but this object is not a union — it is a record of unknowns —
   * so narrowing the property access would do nothing. Narrowing the local
   * string does exactly what the issue payloads need: inside each case, `type`
   * is the literal set that case matched.
   */
  const type = effect.type;

  switch (type) {
    case "modifyBaseAttribute":
    case "modifyResolvedAttribute": {
      if (!isFiniteNumber(effect.amount)) {
        issues.push({
          type: "invalid-effect-amount",
          path: `${path}.amount`,
          effectType: type,
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
          effectType: type,
          amount: effect.amount,
        });
      }

      /*
       * Delegated to the vocabulary's own rule rather than re-derived here.
       * The closed sense, mode and subject lists live beside the scopes, and a
       * second membership check against a second copy of them is exactly the
       * drift this consolidation removed.
       */
      /*
       * The kind is read BEFORE the guard. isValidCheckScopeSelector narrows,
       * so inside the failure branch the value is `never` — and a malformed
       * scope still has to be able to say which variant it was claiming to be.
       */
      const scope: unknown = effect.check;

      if (!isValidCheckScopeSelector(scope)) {
        issues.push({
          type: "invalid-check-scope",
          path: `${path}.check`,
          /*
           * Read THROUGH an optional access rather than off the value. An
           * absent `check` is the commonest way this Effect is malformed and
           * used to throw here, one line before the guard that would have
           * caught it.
           */
          /*
           * Read THROUGH the record guard rather than off the value. An absent
           * `check` is the commonest way this Effect is malformed and used to
           * throw here, one line before the guard that would have caught it.
           */
          kind: isRecord(scope) ? scope.kind : undefined,
        });
      }

      /*
       * Absent is legal and means "let the source kind decide" — see
       * rules/resolution.ts's defaultCheckModifierActivation. Anything present
       * must be a member of the authoritative list rather than of a second
       * copy of it spelled out here.
       */
      if (
        effect.activation !== undefined &&
        !isKnownCheckModifierActivation(effect.activation)
      ) {
        issues.push({
          type: "invalid-check-activation",
          path: `${path}.activation`,
          activation: effect.activation,
        });
      }

      break;
    }


    case "modifyActionCapacity": {
      /*
       * Judged by the Action domain's own rule, not by a weaker local one.
       *
       * An Action-capacity amount must be a WHOLE number of Actions; finite
       * was not enough. An authored 2.5 used to pass here and be rejected
       * later by foundation/actions/validation.ts, which is the same value
       * validated two different ways — content that authors cleanly and then
       * fails as a character. isValidActionCapacityAmount also subsumes the
       * finiteness check, since NaN and Infinity are not integers.
       */
      if (!isValidActionCapacityAmount(effect.amount)) {
        issues.push({
          type: "invalid-effect-amount",
          path: `${path}.amount`,
          effectType: type,
          amount: effect.amount,
        });
      }

      if (!isKnownActionCapacityKind(effect.capacity)) {
        issues.push({
          type: "invalid-action-capacity-kind",
          path: `${path}.capacity`,
          kind: effect.capacity,
        });
      }

      break;
    }

    case "modifySense": {
      if (!isFiniteNumber(effect.amount)) {
        issues.push({
          type: "invalid-effect-amount",
          path: `${path}.amount`,
          effectType: type,
          amount: effect.amount,
        });
      }
      if (!isValidSenseSelector(effect.sense)) {
        issues.push({ type: "invalid-sense-effect", path: `${path}.sense` });
      }
      break;
    }

    case "grantSense": {
      if (!isSenseId(effect.sense)) {
        issues.push({ type: "invalid-sense-effect", path: `${path}.sense` });
      }
      break;
    }

    case "suppressSense": {
      if (!isValidSenseSelector(effect.sense)) {
        issues.push({ type: "invalid-sense-effect", path: `${path}.sense` });
      }
      break;
    }

    case "grantNenPerception":
    case "suppressNenPerception":
      break;


    case "grantTrait": {
      if (!isNonEmptyId(effect.traitId)) {
        issues.push({
          type: "missing-effect-reference",
          path: `${path}.traitId`,
          effectType: type,
          field: "traitId",
        });
      }

      issues.push(...findGrantModeIssues(path, type, effect.mode));

      break;
    }


    case "grantSkill": {
      if (!isNonEmptyId(effect.skillId)) {
        issues.push({
          type: "missing-effect-reference",
          path: `${path}.skillId`,
          effectType: type,
          field: "skillId",
        });
      }

      issues.push(...findGrantModeIssues(path, type, effect.mode));

      break;
    }


    case "grantTechnique": {
      if (!isNonEmptyId(effect.techniqueId)) {
        issues.push({
          type: "missing-effect-reference",
          path: `${path}.techniqueId`,
          effectType: type,
          field: "techniqueId",
        });
      }

      issues.push(...findGrantModeIssues(path, type, effect.mode));

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
      if (!isPositiveFiniteNumber(effect.multiplier)) {
        issues.push({
          type: "invalid-body-multiplier",
          path: `${path}.multiplier`,
          effectType: type,
          multiplier: effect.multiplier,
        });
      }

      break;
    }


    case "modifyBaseBodyAnatomy":
    case "modifyResolvedBodyAnatomy": {
      const operation = effect.operation;

      if (!isRecord(operation)) {
        issues.push({
          type: "malformed-rule-node",
          path: `${path}.operation`,
          kind: "effect",
        });

        break;
      }

      if (
        type === "modifyBaseBodyAnatomy" &&
        operation.mode === "suppress"
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

        default:
          issues.push({
            type: "unknown-rule-type",
            path: `${path}.operation.mode`,
            kind: "effect",
            value: operation.mode,
          });
      }

      break;
    }

    default:
      /*
       * A discriminant the union does not contain. Unreachable by the types
       * and perfectly reachable from JSON, and reporting it is the point: this
       * used to fall off the end of the switch, so a typo in an Effect type
       * validated cleanly and then did nothing for the rest of the content's
       * life.
       */
      issues.push({
        type: "unknown-rule-type",
        path: `${path}.type`,
        kind: "effect",
        value: type,
      });
  }


  return issues;
}


/**
 * Validate an array of Effects.
 */
export function findEffectsValidationIssues(
  effects: unknown,
  path = "effects",
): readonly RuleValidationIssue[] {
  if (effects === undefined) return [];

  /*
   * A non-array used to pass SILENTLY, which is the more dangerous half of
   * this bug: `effects: {}` has no `length`, so the loop ran zero times and
   * the content was pronounced clean. Absence is legal; a value that is not a
   * list of Effects is not.
   */
  if (!Array.isArray(effects)) {
    return [{ type: "malformed-rule-node", path, kind: "effect" }];
  }

  const issues: RuleValidationIssue[] = [];

  for (const [index, effect] of (effects as readonly unknown[]).entries()) {
    /*
     * A hole is reported rather than skipped. `[undefined]` and `[null]` are
     * both an author having lost an Effect, and skipping the first was how a
     * two-Effect list could validate as a one-Effect list.
     */
    issues.push(
      ...findEffectValidationIssues(effect, `${path}[${index}]`),
    );
  }

  return issues;
}


/* -------------------------------------------------------------------------- */
/* Requirement validation                                                     */
/* -------------------------------------------------------------------------- */

function findRequirementIssuesInternal(
  candidate: unknown,
  path: string,
  depth: number,
): readonly RuleValidationIssue[] {
  if (depth > MAX_REQUIREMENT_DEPTH) {
    return [
      {
        type: "requirement-depth-exceeded",
        path,
        maximumDepth: MAX_REQUIREMENT_DEPTH,
      },
    ];
  }

  /*
   * The same guard the Effect validator gets, for the same reason and with one
   * extra consequence: a compound requirement recurses, so an unguarded child
   * turns one malformed node deep in a tree into a throw from a public
   * boundary several layers up — including the equip transition, which reaches
   * here through an Item's named equip requirements.
   */
  if (!isRuleNode(candidate)) {
    return [{ type: "malformed-rule-node", path, kind: "requirement" }];
  }

  const issues: RuleValidationIssue[] = [];

  const requirement: RuleNode = candidate;

  const type = requirement.type;

  switch (type) {
    case "attributeMinimum":
    case "derivedAttributeMinimum": {
      if (!isFiniteNumber(requirement.minimum)) {
        issues.push({
          type: "invalid-requirement-number",
          path: `${path}.minimum`,
          requirementType: type,
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
          requirementType: type,
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
          requirementType: type,
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
          requirementType: type,
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
          requirementType: type,
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
          requirementType: type,
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
          requirementType: type,
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
          requirementType: type,
          field: "skillId",
        });
      }

      if (!isPositiveInteger(requirement.minimumMastery)) {
        issues.push({
          type: "invalid-requirement-mastery",
          path: `${path}.minimumMastery`,
          requirementType: type,
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
          requirementType: type,
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
          requirementType: type,
          field: "techniqueId",
        });
      }

      if (!isPositiveInteger(requirement.minimumMastery)) {
        issues.push({
          type: "invalid-requirement-mastery",
          path: `${path}.minimumMastery`,
          requirementType: type,
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
          requirementType: type,
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
          requirementType: type,
          field: "itemId",
        });
      }

      break;
    }


    case "all":
    case "any": {
      if (!Array.isArray(requirement.requirements)) {
        issues.push({
          type: "malformed-rule-node",
          path: `${path}.requirements`,
          kind: "requirement",
        });

        break;
      }

      if (requirement.requirements.length === 0) {
        issues.push({
          type: "empty-compound-requirement",
          path: `${path}.requirements`,
          requirementType: type,
        });

        break;
      }


      for (const [index, child] of
        (requirement.requirements as readonly unknown[]).entries()
      ) {
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
      /*
       * An absent inner requirement needs no guard here: the recursion's own
       * structural check reports it, and duplicating that test would be two
       * places deciding what a requirement node is.
       */
      issues.push(
        ...findRequirementIssuesInternal(
          requirement.requirement,
          `${path}.requirement`,
          depth + 1,
        ),
      );

      break;
    }

    default:
      issues.push({
        type: "unknown-rule-type",
        path: `${path}.type`,
        kind: "requirement",
        value: type,
      });
  }


  return issues;
}


/**
 * Validate one Requirement tree.
 */
export function findRequirementValidationIssues(
  requirement: unknown,
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
  requirements: unknown,
  path = "requirements",
): readonly RuleValidationIssue[] {
  if (requirements === undefined) return [];

  if (!Array.isArray(requirements)) {
    return [{ type: "malformed-rule-node", path, kind: "requirement" }];
  }

  const issues: RuleValidationIssue[] = [];

  for (const [index, requirement] of
    (requirements as readonly unknown[]).entries()
  ) {
    issues.push(
      ...findRequirementValidationIssues(requirement, `${path}[${index}]`),
    );
  }

  return issues;
}


/**
 * Validate a bundle of NAMED requirements.
 *
 * Two things beyond the requirement trees themselves, and both are about the
 * id, because the id is what makes a named requirement different from a bare
 * one. It must be a real string — a blank id produces a finding nothing can
 * address — and it must be unique within its bundle, because a GM override or
 * a UI selection that names a repeated id has selected two requirements and
 * cannot say which.
 *
 * Uniqueness is scoped to the BUNDLE rather than globally: "has-the-trait" is
 * a perfectly good id on two different Items, and forcing a global namespace
 * on content authors would buy nothing — nothing ever holds two bundles' ids
 * in one list.
 *
 * A present `summary` must be a non-empty string. An empty one renders as a
 * blank explanation, which is worse than no summary at all because the caller
 * stops looking for the reason it was going to compose itself.
 *
 * Takes `unknown` entries, because these arrive from authored JSON and from a
 * host's registered catalog. A malformed entry is reported and skipped rather
 * than dereferenced.
 */
export function findNamedRequirementsValidationIssues(
  requirements: unknown,
  path = "requirements",
): readonly RuleValidationIssue[] {
  if (requirements === undefined) return [];

  if (!Array.isArray(requirements)) {
    return [{ type: "malformed-named-requirement", path }];
  }

  const issues: RuleValidationIssue[] = [];
  const seen = new Set<string>();

  for (const [index, candidate] of (requirements as readonly unknown[]).entries()) {
    const where = `${path}[${index}]`;

    if (!isRecord(candidate)) {
      issues.push({ type: "malformed-named-requirement", path: where });
      continue;
    }

    const entry = candidate;

    if (typeof entry.id !== "string" || !isNonEmptyId(entry.id)) {
      issues.push({
        type: "invalid-named-requirement-id",
        path: `${where}.id`,
        id: entry.id,
      });
    } else if (seen.has(entry.id)) {
      issues.push({
        type: "duplicate-named-requirement-id",
        path: `${where}.id`,
        id: entry.id,
      });
    } else {
      seen.add(entry.id);
    }

    if (
      entry.summary !== undefined &&
      (typeof entry.summary !== "string" || !isNonEmptyId(entry.summary))
    ) {
      issues.push({
        type: "invalid-named-requirement-summary",
        path: `${where}.summary`,
        summary: entry.summary,
      });
    }

    if (!isRecord(entry.requirement)) {
      issues.push({
        type: "malformed-named-requirement",
        path: `${where}.requirement`,
      });
      continue;
    }

    issues.push(
      ...findRequirementValidationIssues(
        entry.requirement,
        `${where}.requirement`,
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
  effects: unknown = [],
  requirements: unknown = [],
): readonly RuleValidationIssue[] {
  return [
    ...findEffectsValidationIssues(effects),
    ...findRequirementsValidationIssues(requirements),
  ];
}
