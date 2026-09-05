/*
 * Status as rule sources.
 *
 * Conditions and injuries do not apply themselves. This file decides which of
 * them are currently in force and hands their Effects to the shared rules
 * layer as ordinary sources, tagged so a resolved value can name what caused
 * it.
 *
 * There is no Effect application here on purpose. A Condition's -2 CON and an
 * Item's -2 CON are the same modifier arriving from different places, and the
 * moment status grows its own application path they stop being able to be
 * reasoned about together.
 *
 * Conditions and injuries pick "currently in force" differently:
 *
 * - a Condition's "currently in force" accounts for expiry and stage — see
 *   status/stage.ts. An entry whose remainingDuration has run out
 *   contributes nothing; an entry on staged content contributes its current
 *   stage's effects, on top of whatever the definition always contributes.
 *   Severity still is not a multiplier: what stacking does to the numbers is
 *   left to the content itself.
 *
 * - an Injury has no expiry or stage track at all (see
 *   foundation/body/injuries/types.ts's own header for why) — every Injury
 *   on the character is active until something removes it. What varies
 *   instead is treatment state, which foundation/body/injuries/resolution.ts
 *   owns: a treatment-required Injury adds its untreated/treated Effects on
 *   top of its always-on ones, per InjuryDefinition.treatmentEffects.
 */

import {
  contributesNothing,
  sourceContributions,
} from "../rules/content";
import type { RuleEffectSource } from "../rules/resolution";

import {
  collectStageEffects,
  isStageEntryActive,
  resolveStage,
} from "./stage";

import {
  getConditionDefinition,
  type CharacterCondition,
} from "./conditions";

import {
  collectInjuryEffectSources,
} from "../foundation/body/injuries/resolution";
import type {
  CharacterInjury,
} from "../foundation/body/injuries/types";

/**
 * The Effect sources contributed by a character's active Conditions.
 *
 * Unknown ids contribute nothing rather than throwing: validation reports
 * them, and a half-resolved sheet is more useful to look at than an
 * exception. An expired Condition (remainingDuration at or below zero)
 * contributes nothing either, without being removed from the character —
 * that removal is the host's call, not this function's.
 */
export function collectConditionEffectSources(
  conditions: readonly CharacterCondition[] = [],
): readonly RuleEffectSource[] {
  const sources: RuleEffectSource[] = [];

  for (const condition of conditions) {
    if (!isStageEntryActive(condition)) continue;

    const definition = getConditionDefinition(condition.conditionId);

    if (definition === undefined) continue;

    const effects = collectStageEffects(
      definition,
      definition.effects,
      resolveStage(definition, condition),
    );

    if (contributesNothing(definition, effects)) continue;

    sources.push({
      source: { type: "condition", id: condition.conditionId },
      effects,
      ...sourceContributions(definition),
    });
  }

  return sources;
}

/**
 * Everything status contributes, in the order a sheet reads it.
 */
export function collectStatusEffectSources(
  conditions: readonly CharacterCondition[] = [],
  injuries: readonly CharacterInjury[] = [],
): readonly RuleEffectSource[] {
  return [
    ...collectConditionEffectSources(conditions),
    ...collectInjuryEffectSources(injuries),
  ];
}
