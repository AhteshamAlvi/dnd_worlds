/*
 * What a selected Item contributes: typed attack, defense and special-effect
 * facts, sourced and graded, with no exclusive weapon or armor class.
 *
 *
 * FACTS, NOT A FORMULA
 *
 * This file answers "what does this concrete, selected Item bring" and stops
 * there. It does not decide whether an attack lands, what it does to a Body,
 * or how a defense reduces incoming harm — those are the "owning combat/body
 * formula" the header comment on `ItemAttackContribution` names, and this
 * ticket does not build it (there is no SP-to-BP damage model in the engine
 * yet for it to feed). What this file resolves is the fact itself: the
 * Effects an Item's attack or defense declares, sourced with full provenance,
 * alongside the compatibility grade the selection earned. A future formula
 * reads `ItemPerformanceContribution` the way `resolveItemUse()`'s callers
 * read `ItemUse` — as a finished, typed answer, not as something to derive
 * again.
 *
 *
 * THE RESOLVE ORDER, THREE STEPS IN
 *
 * Ticket 4.5's header fixes the whole chain: base Item contribution →
 * implement compatibility → character conditional modifiers (Ticket 4.7) →
 * future whole-Item enhancement → owning combat/body formula. This file now
 * owns the first three: the Item's own declared Effects, sourced to the Item;
 * the compatibility grade, attached beside them as metadata rather than a
 * multiplier (nothing in the Effect vocabulary carries one — see
 * equipment/types.ts's ItemInventoryMode header for the same constraint
 * applied to quantity); and any matched `"performance"`-output
 * `ImplementConditionalRule` (conditions.ts), appended as its OWN sourced
 * Effects rather than folded into the Item's. A future whole-Item enhancement
 * or the owning combat/body formula reads the finished bundle and decides
 * what each source's contribution is worth; this file only assembles it.
 *
 *
 * NO EXCLUSIVE CLASSES
 *
 * Nothing here asks whether an Item "is a weapon" or "is armor". An Item
 * that declares `attack` and one that declares `defense` are read by exactly
 * the same function, and one that declares both is read once for each without
 * either being special-cased — a glaive contributes an attack fact and a
 * defense fact from the same definition, and a shield may contribute defense
 * alone.
 */

import type { EngineResult } from "../../infrastructure/result";
import { engineFailure, engineSuccess } from "../../infrastructure/result";
import { createTraceNode, type TraceInputs } from "../../infrastructure/trace";
import {
  contributionSourceKey,
  type ContributionSourceRef,
} from "../../infrastructure/contribution-source";

import {
  resolveRuleEffects,
  type ResolvedRuleEffects,
  type RuleEffectSource,
} from "../rules/resolution";

import {
  findItemAttackContributionIssues,
  findItemDefenseContributionIssues,
  type ItemAttackContribution,
  type ItemDefenseContribution,
} from "./actions";
import {
  collectMatchedPerformanceEffects,
  type SourcedImplementConditionalRule,
} from "./conditions";
import { currentIntegrityBand, resolveIntegrityState, type ItemIntegrityState } from "./integrity";
import type { ImplementCompatibility, ImplementResolution } from "./implements";
import type { ItemDefinitionLookup } from "./validation";


/** One resolved half of a contribution — attack or defense — sourced. */
export interface ItemContributionFacts<TDeclared> {
  readonly declared: TDeclared;
  readonly effects: ResolvedRuleEffects;
}


/**
 * The current integrity band's own bearing on this contribution — Ticket 4.8.
 *
 * A SEPARATE bucket rather than folded into `attack`/`defense`, because a
 * band's Effects are a fact about the Item as a whole (a degraded blade is
 * worse at everything it does), not specific to one performance slot; a band
 * authored to affect only attack or only defense says so through its own
 * Effect's scope, not through which bucket carries it.
 */
export interface ItemIntegrityContribution {
  readonly state: ItemIntegrityState;
  readonly effects: ResolvedRuleEffects;
}


/**
 * Everything one selected Item contributes for the role it filled.
 *
 * `attack`/`defense` are independently present or absent, mirroring
 * `ItemDefinition` — an Item that declares neither contributes nothing here,
 * which is a legitimate, ordinary answer for most Items in an inventory.
 */
export interface ItemPerformanceContribution {
  readonly source: ContributionSourceRef;
  readonly role: string;
  readonly compatibility: ImplementCompatibility;

  readonly attack?: ItemContributionFacts<ItemAttackContribution>;
  readonly defense?: ItemContributionFacts<ItemDefenseContribution>;

  /** Present only for a durable Item — see `ItemIntegrityContribution`. */
  readonly integrity?: ItemIntegrityContribution;
}


/** Whether a contribution has anything in it at all. */
export function contributesNoPerformance(
  contribution: ItemPerformanceContribution,
): boolean {
  return contribution.attack === undefined && contribution.defense === undefined;
}


function traceOf(inputs: TraceInputs, output: string) {
  return {
    root: createTraceNode({
      id: "character.equipment.contributions",
      label: "Resolve Item Performance Contribution",
      formula:
        "base Item attack/defense facts, sourced and left ungraded numerically; the implement's compatibility travels beside them",
      inputs,
      output,
    }),
  };
}


/**
 * Resolve one selected implement's Item into its performance contribution.
 *
 * Pure. Reads the catalog through the supplied lookup — the same unbound
 * pattern `resolveEquipmentTransition()`/`resolveItemUse()` use — and commits
 * nothing. An Item declaring a structurally invalid `attack`/`defense` is an
 * authoring fault and is reported as an `EngineFailure`; a well-formed Item
 * that simply declares neither is an ordinary, contribution-less success.
 */
export function resolveItemPerformanceContribution(
  resolution: ImplementResolution,
  getItemDefinition: ItemDefinitionLookup,

  /**
   * Implement-conditional rules (Ticket 4.7) whose `"performance"` output may
   * apply to THIS resolution. Caller-supplied — this file never looks up a
   * Trait, Technique or Skill; see conditions.ts's header.
   */
  conditionalRules: readonly SourcedImplementConditionalRule[] = [],
): EngineResult<ItemPerformanceContribution> {
  const inputs: TraceInputs = {
    role: { value: resolution.role },
    itemId: { value: resolution.itemId },
    compatibility: { value: resolution.compatibility },
  };

  const definition = getItemDefinition(resolution.itemId);

  if (definition === undefined) {
    return engineFailure(traceOf(inputs, "item_unknown"), [{
      code: "equipment.contributions.item_unknown",
      message: `The resolved implement names Item "${resolution.itemId}", which no catalog defines.`,
      audience: "developer",
      required: "a known Item id",
      actual: resolution.itemId,
    }]);
  }

  const source: ContributionSourceRef = {
    type: "item",
    id: resolution.itemId,
    instanceId: resolution.item.entryId,
  };

  inputs["source"] = { value: contributionSourceKey(source) };

  const attackIssues = definition.attack === undefined
    ? []
    : findItemAttackContributionIssues(definition.attack);

  const defenseIssues = definition.defense === undefined
    ? []
    : findItemDefenseContributionIssues(definition.defense);

  const issues = [...attackIssues, ...defenseIssues];

  if (issues.length > 0) {
    return engineFailure(traceOf(inputs, "definition_invalid"), issues.map((issue) => ({
      ...issue,
      code: `equipment.contributions.${issue.code}`,
    })) as never);
  }

  const matched = collectMatchedPerformanceEffects(conditionalRules, resolution);

  /*
   * The Item's own Effects come first, as one source; each matched rule is
   * its OWN source right behind it, never folded into the Item's — a Trait's
   * bonus stacks and traces as the Trait's, not as something the sword did.
   */
  const attackSources: RuleEffectSource[] = [
    ...(definition.attack === undefined ? [] : [{ source, effects: definition.attack.effects ?? [] }]),
    ...matched.attack.map(({ source: ruleSource, effect }) => ({
      source: ruleSource,
      effects: [effect],
    })),
  ];

  const defenseSources: RuleEffectSource[] = [
    ...(definition.defense === undefined ? [] : [{ source, effects: definition.defense.effects ?? [] }]),
    ...matched.defense.map(({ source: ruleSource, effect }) => ({
      source: ruleSource,
      effects: [effect],
    })),
  ];

  const attack: ItemContributionFacts<ItemAttackContribution> | undefined =
    attackSources.length === 0 ? undefined : {
      declared: definition.attack ?? {},
      effects: resolveRuleEffects(attackSources),
    };

  const defense: ItemContributionFacts<ItemDefenseContribution> | undefined =
    defenseSources.length === 0 ? undefined : {
      declared: definition.defense ?? {},
      effects: resolveRuleEffects(defenseSources),
    };

  const integrity: ItemIntegrityContribution | undefined =
    definition.integrity === undefined ? undefined : (() => {
      const current = resolution.integrity ?? definition.integrity!.maximum;

      return {
        state: resolveIntegrityState(definition.integrity!, current),
        effects: resolveRuleEffects([{
          source,
          effects: currentIntegrityBand(definition.integrity!, current)?.effects ?? [],
        }]),
      };
    })();

  inputs["integrityState"] = { value: integrity?.state ?? "not-durable" };

  return engineSuccess({
    source,
    role: resolution.role,
    compatibility: resolution.compatibility,
    ...(attack === undefined ? {} : { attack }),
    ...(defense === undefined ? {} : { defense }),
    ...(integrity === undefined ? {} : { integrity }),
  }, traceOf(
    inputs,
    attack === undefined && defense === undefined ? "no-contribution" : "resolved",
  ));
}


/**
 * Resolve every selected implement's Item contribution in one pass.
 *
 * A caller already holding `ImplementResolution[]` — from
 * `character/actions/preparation.ts`'s `implementResolutions`, per Ticket 4.5
 * — calls this once rather than resolving each selection by hand. Order
 * follows the input order; contribution-less resolutions are included, so a
 * caller can see which roles contributed nothing without a second lookup.
 */
export function resolveItemPerformanceContributions(
  resolutions: readonly ImplementResolution[],
  getItemDefinition: ItemDefinitionLookup,
  conditionalRules: readonly SourcedImplementConditionalRule[] = [],
): EngineResult<readonly ItemPerformanceContribution[]> {
  const contributions: ItemPerformanceContribution[] = [];

  for (const resolution of resolutions) {
    const result = resolveItemPerformanceContribution(resolution, getItemDefinition, conditionalRules);

    if (!result.success) return result;

    contributions.push(result.payload);
  }

  return engineSuccess(contributions, {
    root: createTraceNode({
      id: "character.equipment.contributions.batch",
      label: "Resolve Item Performance Contributions",
      inputs: { count: { value: resolutions.length } },
      output: contributions.length,
    }),
  });
}
