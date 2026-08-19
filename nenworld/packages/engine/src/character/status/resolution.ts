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
 * "Currently in force" now accounts for expiry and stage — see
 * status/stage.ts. An entry whose remainingDuration has run out contributes
 * nothing; an entry on staged content contributes its current stage's
 * effects, on top of whatever the definition always contributes. Severity
 * still is not a multiplier: what stacking does to the numbers is left to
 * the content itself.
 */

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
  getInjuryDefinition,
  type CharacterInjury,
} from "./injuries";

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

    if (effects.length === 0) continue;

    sources.push({
      source: { type: "condition", id: condition.conditionId },
      effects,
    });
  }

  return sources;
}

/**
 * The Effect sources contributed by a character's current injuries.
 *
 * Severity is not a multiplier: what stacking does to an injury's numbers is
 * a Rulebook question that has not been answered, and guessing at it here
 * would put a rule in the engine that no one wrote. An expired injury
 * (healed, per remainingDuration) contributes nothing.
 */
export function collectInjuryEffectSources(
  injuries: readonly CharacterInjury[] = [],
): readonly RuleEffectSource[] {
  const sources: RuleEffectSource[] = [];

  for (const injury of injuries) {
    if (!isStageEntryActive(injury)) continue;

    const definition = getInjuryDefinition(injury.injuryId);

    if (definition === undefined) continue;

    const effects = collectStageEffects(
      definition,
      definition.effects,
      resolveStage(definition, injury),
    );

    if (effects.length === 0) continue;

    sources.push({
      source: { type: "injury", id: injury.injuryId },
      effects,
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
