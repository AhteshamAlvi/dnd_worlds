/*
 * Letting character rules modify actions from canonical selected-implement
 * facts — without teaching equipment about Skills, Techniques, or Traits.
 *
 *
 * ONE RULE, ONE OUTPUT, TWO PLACES IT CAN LAND
 *
 * An `ImplementConditionalRule` evaluates its `condition` once and declares
 * EXACTLY one output kind: `"check"` routes an ordinary `CheckModifierContribution`
 * into the existing check-modifier assembly (`character/checks/invocation.ts`);
 * `"performance"` routes Effects into an Item's own performance contribution
 * (`contributions.ts`, Ticket 4.6), alongside the Item's base Effects. A Skill,
 * Technique or Trait that wants both writes two separately identified rules
 * rather than one rule producing two things — a rule with a single output is
 * easier to reason about, override, and trace than one that fans out.
 *
 * The SOURCE of a matched rule is always the content that declared it — a
 * Trait id, a Technique id, a Skill id — never the Item. The Item is context:
 * it is what the condition is tested against, and its own base contribution
 * keeps its own `{type:"item", ...}` source regardless of which character
 * rules also matched. This is why a future Shū enhancement can enhance
 * everything the Item itself contributed, negative effects included, without
 * also silently enhancing a character's learned proficiency bonus that merely
 * happened to fire alongside it — the two remain distinguishable by source
 * for exactly this reason.
 *
 *
 * THIS FILE KNOWS ONLY IMPLEMENTS
 *
 * `ImplementCondition`, the rule shape and the matcher are all generic over a
 * `ContributionSourceRef` — this file never imports a Skill, Technique or
 * Trait definition, and never will. `SourcedImplementConditionalRule` pairs a
 * rule with whatever source a CALLER supplies; assembling that list from a
 * resolved character's applicable Traits, Techniques and the Skill currently
 * being attempted is the caller's job — `character/actions/preparation.ts`
 * for check outputs, `contributions.ts`'s caller for performance outputs —
 * exactly as `CharacterActionInputs.requirements` is already caller-supplied
 * rather than looked up here.
 *
 *
 * NO NEW LOOKUP
 *
 * A condition is tested entirely against fields `ImplementResolution` already
 * carries — `role`, `families`, `compatibility`, `state` — because those were
 * captured once, at implement-selection time (Ticket 4.5), specifically so
 * this stage never re-reads the inventory or the Item catalog to answer a
 * question resolution already answered.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import {
  isValidCheckScopeSelector,
  type CheckModifierChannel,
  type CheckModifierContribution,
  type CheckScopeSelector,
} from "../../checks";

import type { Effect } from "../rules/effects";
import { findEffectsValidationIssues } from "../rules/validation";

import type { ItemFamilyId } from "./families";
import type { ImplementCompatibility, ImplementResolution } from "./implements";
import type { ItemEquipmentState } from "./state";
import { ITEM_EQUIPMENT_STATES, isItemEquipmentState } from "./state";


/* -------------------------------------------------------------------------- */
/* Condition                                                                  */
/* -------------------------------------------------------------------------- */

export const IMPLEMENT_CONDITION_MATCH_MODES = ["any", "all"] as const;

export type ImplementConditionMatchMode = typeof IMPLEMENT_CONDITION_MATCH_MODES[number];


/**
 * What a rule tests the resolved implements against.
 *
 * Every field is an independent, ANDed filter: a condition naming both `role`
 * and `compatibility` requires both to hold of whichever resolution(s) it is
 * tested against. Omitting a field means that filter does not narrow — a
 * condition with every field omitted matches whatever `match` requires of an
 * otherwise-unfiltered set, which is a legitimate (if unusual) way to author
 * "while I am carrying any selected implement at all."
 */
export interface ImplementCondition {
  readonly role?: string;
  readonly familyIds?: readonly ItemFamilyId[];
  readonly compatibility?: readonly ImplementCompatibility[];
  readonly states?: readonly ItemEquipmentState[];

  /**
   * How multiple candidate resolutions are combined. Only visible when a role
   * accepts more than one implement (Ticket 4.5's `ImplementRequirement.maximum`
   * above 1) — irrelevant, and harmless either way, against a single
   * resolution. Defaults to "any": a condition on "the weapon is bladed" is
   * ordinarily satisfied by having at least one bladed weapon in hand, not by
   * requiring every selected implement across every role to be bladed.
   */
  readonly match?: ImplementConditionMatchMode;
}


function nonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 &&
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
}


export function findImplementConditionIssues(
  condition: ImplementCondition,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (condition.role !== undefined && (typeof condition.role !== "string" || condition.role.trim().length === 0)) {
    errors.push({
      code: "equipment.conditions.role.invalid",
      message: "A condition's role must be a non-empty string when present.",
      audience: "developer",
      required: "non-empty string, or omit the field",
      actual: String(condition.role),
    });
  }

  if (condition.familyIds !== undefined && !nonEmptyStringArray(condition.familyIds)) {
    errors.push({
      code: "equipment.conditions.family-ids.empty",
      message: "A condition's familyIds must be a non-empty list of ids, or omitted.",
      audience: "developer",
      required: "one or more non-empty family ids, or omit the field",
      actual: JSON.stringify(condition.familyIds),
    });
  }

  if (condition.compatibility !== undefined) {
    if (!Array.isArray(condition.compatibility) || condition.compatibility.length === 0) {
      errors.push({
        code: "equipment.conditions.compatibility.empty",
        message: "A condition's compatibility list must be non-empty, or omitted.",
        audience: "developer",
        required: "one or more compatibility grades, or omit the field",
        actual: JSON.stringify(condition.compatibility),
      });
    }
  }

  if (condition.states !== undefined) {
    if (!Array.isArray(condition.states) || condition.states.length === 0) {
      errors.push({
        code: "equipment.conditions.states.empty",
        message: "A condition's states list must be non-empty, or omitted.",
        audience: "developer",
        required: "one or more engagement states, or omit the field",
        actual: JSON.stringify(condition.states),
      });
    } else {
      for (const state of condition.states) {
        if (!isItemEquipmentState(state)) {
          errors.push({
            code: "equipment.conditions.states.invalid",
            message: "A condition names an unknown engagement state.",
            audience: "developer",
            required: [...ITEM_EQUIPMENT_STATES],
            actual: String(state),
          });
        }
      }
    }
  }

  if (
    condition.match !== undefined &&
    !(IMPLEMENT_CONDITION_MATCH_MODES as readonly string[]).includes(condition.match)
  ) {
    errors.push({
      code: "equipment.conditions.match.invalid",
      message: "A condition's match mode must be \"any\" or \"all\", or omitted.",
      audience: "developer",
      required: [...IMPLEMENT_CONDITION_MATCH_MODES],
      actual: String(condition.match),
    });
  }

  return errors;
}


/* -------------------------------------------------------------------------- */
/* The rule, and its two outputs                                             */
/* -------------------------------------------------------------------------- */

export interface CheckModifierConditionalOutput {
  readonly kind: "check";
  readonly scope: CheckScopeSelector;
  readonly amount: number;
  readonly channel?: CheckModifierChannel;
}


export interface PerformanceConditionalOutput {
  readonly kind: "performance";
  readonly slot: "attack" | "defense";
  readonly effects: readonly Effect[];
}


export type ImplementConditionalOutput =
  | CheckModifierConditionalOutput
  | PerformanceConditionalOutput;


export const IMPLEMENT_CONDITIONAL_OUTPUT_KINDS = ["check", "performance"] as const;


/**
 * One authored implement-conditional rule.
 *
 * NAMED, for the reason every gate a player is refused or granted by is named
 * elsewhere in this engine (`NamedRequirement`, an Item's equip/use gates): a
 * GM overriding one result, or a UI listing what fired and what did not,
 * needs an identity that survives the condition being reworded.
 */
export interface ImplementConditionalRule {
  readonly id: string;
  readonly condition: ImplementCondition;
  readonly output: ImplementConditionalOutput;
}


export function findImplementConditionalRuleIssues(
  rule: unknown,
): readonly EngineError[] {
  if (typeof rule !== "object" || rule === null) {
    return [{
      code: "equipment.conditions.rule.invalid",
      message: "An implement-conditional rule must be an object.",
      audience: "developer",
      required: "an ImplementConditionalRule object",
      actual: String(rule),
    }];
  }

  const errors: EngineError[] = [];
  const { id, condition, output } = rule as Partial<ImplementConditionalRule>;

  if (typeof id !== "string" || id.trim().length === 0) {
    errors.push({
      code: "equipment.conditions.rule.id.missing",
      message: "An implement-conditional rule must be identified.",
      audience: "developer",
      required: "non-empty rule id",
      actual: String(id),
    });
  }

  if (typeof condition !== "object" || condition === null) {
    errors.push({
      code: "equipment.conditions.rule.condition.invalid",
      message: "An implement-conditional rule must declare a condition.",
      audience: "developer",
      required: "an ImplementCondition object",
      actual: String(condition),
    });
  } else {
    errors.push(...findImplementConditionIssues(condition));
  }

  if (output === undefined || typeof output !== "object" || output === null) {
    errors.push({
      code: "equipment.conditions.rule.output.missing",
      message: "An implement-conditional rule must declare an output.",
      audience: "developer",
      required: "a check or performance output",
      actual: String(output),
    });

    return errors;
  }

  const outputKind = (output as { readonly kind?: unknown }).kind;

  if (!(IMPLEMENT_CONDITIONAL_OUTPUT_KINDS as readonly unknown[]).includes(outputKind)) {
    errors.push({
      code: "equipment.conditions.rule.output.kind.invalid",
      message: "An implement-conditional rule's output must be \"check\" or \"performance\".",
      audience: "developer",
      required: [...IMPLEMENT_CONDITIONAL_OUTPUT_KINDS],
      actual: String(outputKind),
    });

    return errors;
  }

  if (outputKind === "check") {
    const checkOutput = output as CheckModifierConditionalOutput;

    if (!isValidCheckScopeSelector(checkOutput.scope)) {
      errors.push({
        code: "equipment.conditions.rule.output.scope.invalid",
        message: "A check output must name a known check scope selector.",
        audience: "developer",
        required: "a valid CheckScopeSelector",
        actual: JSON.stringify(checkOutput.scope),
      });
    }

    if (!Number.isFinite(checkOutput.amount)) {
      errors.push({
        code: "equipment.conditions.rule.output.amount.invalid",
        message: "A check output's amount must be a finite number.",
        audience: "developer",
        required: "finite number",
        actual: String(checkOutput.amount),
      });
    }
  } else {
    const performanceOutput = output as PerformanceConditionalOutput;

    if (performanceOutput.slot !== "attack" && performanceOutput.slot !== "defense") {
      errors.push({
        code: "equipment.conditions.rule.output.slot.invalid",
        message: "A performance output's slot must be \"attack\" or \"defense\".",
        audience: "developer",
        required: ["attack", "defense"],
        actual: String(performanceOutput.slot),
      });
    }

    if (!Array.isArray(performanceOutput.effects) || performanceOutput.effects.length === 0) {
      errors.push({
        code: "equipment.conditions.rule.output.effects.empty",
        message: "A performance output must declare at least one Effect.",
        audience: "developer",
        required: "one or more Effects",
        actual: Array.isArray(performanceOutput.effects)
          ? "empty list"
          : String(performanceOutput.effects),
      });
    } else {
      for (const issue of findEffectsValidationIssues(performanceOutput.effects, "effects")) {
        errors.push({
          code: `equipment.conditions.rule.output.effects.${issue.type}`,
          message: `A performance output's Effect at ${issue.path} is malformed: ${issue.type}.`,
          audience: "developer",
          required: "a well-formed Effect",
          actual: issue.path,
        });
      }
    }
  }

  return errors;
}


/**
 * Every rule in one list, checked together — a duplicate id is only visible
 * across the whole list, the same reason `findImplementRequirementListIssues()`
 * exists beside its per-item counterpart.
 */
export function findImplementConditionalRuleListIssues(
  rules: readonly unknown[],
): readonly EngineError[] {
  const errors: EngineError[] = [];
  const ids = new Set<string>();

  for (const candidate of rules) {
    errors.push(...findImplementConditionalRuleIssues(candidate));

    const id = typeof candidate === "object" && candidate !== null
      ? (candidate as { readonly id?: unknown }).id
      : undefined;

    if (typeof id !== "string") continue;

    if (ids.has(id)) {
      errors.push({
        code: "equipment.conditions.rule.id.duplicate",
        message: `Rule id "${id}" is declared more than once.`,
        audience: "developer",
        required: "each rule id declared once",
        actual: id,
      });
    }

    ids.add(id);
  }

  return errors;
}


/* -------------------------------------------------------------------------- */
/* Matching                                                                   */
/* -------------------------------------------------------------------------- */

function resolutionMatchesFilters(
  condition: ImplementCondition,
  resolution: ImplementResolution,
): boolean {
  if (condition.familyIds !== undefined &&
    !resolution.families.some((family) => condition.familyIds!.includes(family))
  ) {
    return false;
  }

  if (condition.compatibility !== undefined &&
    !condition.compatibility.includes(resolution.compatibility)
  ) {
    return false;
  }

  if (condition.states !== undefined && !condition.states.includes(resolution.state)) {
    return false;
  }

  return true;
}


/**
 * Whether a condition is satisfied by a set of already-resolved implements.
 *
 * `role` first narrows WHICH resolutions are candidates at all; every other
 * field is then a filter on those candidates, combined by `match`. A
 * condition naming a role nothing selected has no candidates and is a
 * nonmatch — never an error, and never treated as vacuously true.
 */
export function matchesImplementCondition(
  condition: ImplementCondition,
  resolutions: readonly ImplementResolution[],
): boolean {
  const candidates = condition.role === undefined
    ? resolutions
    : resolutions.filter((resolution) => resolution.role === condition.role);

  if (candidates.length === 0) return false;

  return condition.match === "all"
    ? candidates.every((candidate) => resolutionMatchesFilters(condition, candidate))
    : candidates.some((candidate) => resolutionMatchesFilters(condition, candidate));
}


/* -------------------------------------------------------------------------- */
/* Sourced rules and projection                                              */
/* -------------------------------------------------------------------------- */

/**
 * One rule, paired with the content that declared it.
 *
 * Assembling this list is the CALLER's job — this file never looks up a
 * Trait, Technique or Skill. `character/actions/preparation.ts` builds one
 * for every applicable rule with a "check" output; a caller resolving Item
 * performance contributions builds one for every applicable "performance"
 * rule and hands it to `contributions.ts`.
 */
export interface SourcedImplementConditionalRule {
  readonly source: ContributionSourceRef;
  readonly rule: ImplementConditionalRule;
}


/**
 * Every "check"-output rule that matched, as ordinary CheckModifierContributions.
 *
 * The source is the rule's own — never the Item the condition matched
 * against — so a matched bonus stacks and traces exactly like any other
 * character-declared check modifier. A nonmatch contributes nothing; it does
 * not appear here at all, which is what keeps a nonmatch and a nothing-to-say
 * source indistinguishable, as they should be.
 */
export function collectMatchedCheckModifiers(
  rules: readonly SourcedImplementConditionalRule[],
  resolutions: readonly ImplementResolution[],
): readonly CheckModifierContribution[] {
  const contributions: CheckModifierContribution[] = [];

  for (const { source, rule } of rules) {
    if (rule.output.kind !== "check") continue;
    if (!matchesImplementCondition(rule.condition, resolutions)) continue;

    contributions.push({
      source,
      scope: rule.output.scope,
      amount: rule.output.amount,
      channel: rule.output.channel ?? "persistent",
    });
  }

  return contributions;
}


/**
 * Every "performance"-output rule that matches ONE resolved implement.
 *
 * Tests each rule against a single-element candidate set, so `role` still
 * narrows correctly (a rule naming a different role than this resolution's is
 * a nonmatch) and `match` is moot, as it is for any singleton set. Returned
 * grouped by slot so a caller merges each group into the matching half of an
 * `ItemPerformanceContribution` without sorting them itself.
 */
export function collectMatchedPerformanceEffects(
  rules: readonly SourcedImplementConditionalRule[],
  resolution: ImplementResolution,
): {
  readonly attack: readonly { readonly source: ContributionSourceRef; readonly effect: Effect }[];
  readonly defense: readonly { readonly source: ContributionSourceRef; readonly effect: Effect }[];
} {
  const attack: { readonly source: ContributionSourceRef; readonly effect: Effect }[] = [];
  const defense: { readonly source: ContributionSourceRef; readonly effect: Effect }[] = [];

  for (const { source, rule } of rules) {
    if (rule.output.kind !== "performance") continue;
    if (!matchesImplementCondition(rule.condition, [resolution])) continue;

    const bucket = rule.output.slot === "attack" ? attack : defense;

    for (const effect of rule.output.effects) {
      bucket.push({ source, effect });
    }
  }

  return { attack, defense };
}
