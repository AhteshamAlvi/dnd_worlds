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
 * - an Injury has no expiry or stage track at all (see status/injuries.ts's
 *   own header for why) — every Injury on the character is active until
 *   something removes it. What varies instead is treatment state: a
 *   treatment-required Injury adds its untreated/treated Effects on top of
 *   its always-on ones, per InjuryDefinition.treatmentEffects.
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
 * Every listed Injury is active — status/injuries.ts has no expiry field, so
 * "on the character" is "in force" — but a treatment-required Injury adds
 * its untreated or treated Effects on top of whatever it always contributes:
 *
 *   normal effects
 *   + untreated effects, while treatmentStatus is "untreated"
 *   + treated effects, while treatmentStatus is "treated"
 *
 * A treatment-required Injury with no treatmentStatus recorded (invalid
 * persistent state — see findInjuryValidationIssues) is treated as
 * untreated: that is the state every treatment-required Injury starts in,
 * and it is the more conservative reading for something that has not been
 * confirmed treated.
 *
 * An Injury that does not require treatment ignores treatmentEffects
 * entirely and contributes only its normal effects, per
 * InjuryDefinition.treatmentEffects's own doc comment.
 */
export function collectInjuryEffectSources(
  injuries: readonly CharacterInjury[] = [],
): readonly RuleEffectSource[] {
  const sources: RuleEffectSource[] = [];

  for (const injury of injuries) {
    const definition = getInjuryDefinition(injury.injuryId);

    if (definition === undefined) continue;

    const treatmentEffects = definition.recovery.treatmentRequired
      ? (injury.treatmentStatus === "treated"
          ? definition.treatmentEffects?.treated
          : definition.treatmentEffects?.untreated) ?? []
      : [];

    const effects = [...(definition.effects ?? []), ...treatmentEffects];

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
