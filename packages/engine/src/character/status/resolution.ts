/*
 * Status as rule sources.
 *
 * Conditions and Injuries do not apply themselves. This file decides which of
 * them are currently in force and hands their Effects to the shared rules
 * layer as ordinary sources, tagged so a resolved value can name what caused
 * it.
 *
 * There is no Effect application here on purpose. A Condition's -2 CON and an
 * Item's -2 CON are the same modifier arriving from different places, and the
 * moment status grows its own application path they stop being able to be
 * reasoned about together.
 *
 * Conditions and Injuries pick "currently in force" differently:
 *
 * - a Condition's "currently in force" accounts for expiry and stage — see
 *   status/stage.ts. An entry whose remainingDuration has run out
 *   contributes nothing; an entry on staged content contributes its current
 *   stage's effects, on top of whatever the definition always contributes.
 *   Severity still is not a multiplier: what stacking does to the numbers is
 *   left to the content itself.
 *
 * - an Injury has no expiry or stage track at all (see
 *   foundation/body/injuries/types.ts's own header for why). What decides
 *   whether it is in force is MANIFESTATION: an Injury applies while the
 *   current form expresses every anatomical identity it occupies, and is
 *   dormant otherwise. Manifestation is Body's question, so the caller
 *   resolves it (foundation/body/injuries/resolution.ts's
 *   resolveInjuryManifestation) and passes only the manifested Injuries in.
 *   Passing every stored Injury is what used to make a Dragon's wing fracture
 *   go on penalising its owner while they were human.
 *
 *   What varies on top of manifestation is treatment state: a
 *   treatment-required Injury adds its untreated/treated Effects on top of
 *   its always-on ones, per InjuryDefinition.treatmentEffects. Treatment only
 *   ever changes the Effects of an Injury that is already manifested — a
 *   dormant Injury contributes nothing whether or not it has been treated.
 *
 * ── Why Injury Effect collection lives here ─────────────────────────────
 *
 * Because it is a question about authored CONTENT, not about anatomy. An
 * Injury's location, applicability and manifestation are anatomical and stay
 * under foundation/body/injuries/; reading its Effects means reading the
 * rules vocabulary, and nothing under foundation/ may import the rules layer
 * that sits on top of it.
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

import { getInjuryDefinition } from "../foundation/body/injuries/definitions";
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
 * The Effect sources contributed by the Injuries that are CURRENTLY IN FORCE.
 *
 * The caller supplies the manifested Injuries, not every Injury on the sheet.
 * This function does not — and structurally cannot — decide manifestation for
 * itself: that needs a resolved Anatomy, and Injury Effects are part of what
 * produces the resolved Body in the first place. character/resolution.ts
 * breaks that circle by resolving a preliminary Body first; see its
 * phased-resolution header.
 *
 * A manifested treatment-required Injury adds its untreated or treated
 * Effects on top of whatever it always contributes:
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
  manifestedInjuries: readonly CharacterInjury[] = [],
): readonly RuleEffectSource[] {
  const sources: RuleEffectSource[] = [];

  for (const injury of manifestedInjuries) {
    const definition = getInjuryDefinition(injury.injuryId);

    if (definition === undefined) continue;

    const treatmentEffects = definition.recovery.treatmentRequired
      ? (injury.treatmentStatus === "treated"
          ? definition.treatmentEffects?.treated
          : definition.treatmentEffects?.untreated) ?? []
      : [];

    const effects = [...(definition.effects ?? []), ...treatmentEffects];

    if (contributesNothing(definition, effects)) continue;

    sources.push({
      source: { type: "injury", id: injury.injuryId },
      effects,
      ...sourceContributions(definition),
    });
  }

  return sources;
}

/**
 * Everything status contributes, in the order a sheet reads it.
 *
 * `manifestedInjuries` is the manifested subset, never the whole stored list
 * — see collectInjuryEffectSources.
 */
export function collectStatusEffectSources(
  conditions: readonly CharacterCondition[] = [],
  manifestedInjuries: readonly CharacterInjury[] = [],
): readonly RuleEffectSource[] {
  return [
    ...collectConditionEffectSources(conditions),
    ...collectInjuryEffectSources(manifestedInjuries),
  ];
}
