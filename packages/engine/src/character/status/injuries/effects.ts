/*
 * What a manifested Injury contributes.
 *
 * The content half of Injury resolution, and the reason it is up here rather
 * than under foundation/body/injuries/: reading an Injury's Effects means
 * reading the rules vocabulary, and nothing under foundation/ may import the
 * layer sitting on top of it.
 *
 * The division of labour, end to end:
 *
 *   foundation/body/injuries/resolution.ts   WHICH Injuries are in force
 *                                            (manifestation — anatomy)
 *   here                                     WHAT those Injuries contribute
 *                                            (Effects — content)
 *   character/rules/resolution.ts            what the Effects then DO
 *
 * Each step reads only what it owns, and the middle one never decides the
 * first: this file is HANDED the manifested Injuries. It structurally cannot
 * work manifestation out for itself — that needs a resolved Anatomy, and
 * Injury Effects are part of what produces the resolved Body in the first
 * place. character/resolution.ts breaks that circle by resolving a
 * preliminary Body first; see its phased-resolution header.
 */

import {
  contributesNothing,
  sourceContributions,
} from "../../rules/content";
import type { RuleEffectSource } from "../../rules/resolution";

import type {
  CharacterInjury,
} from "../../foundation/body/injuries/types";

import { getInjuryDefinition } from "./definitions";

/**
 * The Effect sources contributed by the Injuries that are CURRENTLY IN FORCE.
 *
 * The caller supplies the MANIFESTED Injuries, never the whole stored list.
 * Passing every stored Injury is what used to make a Dragon's wing fracture go
 * on penalising its owner while they were human.
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
 *
 * Unknown ids contribute nothing rather than throwing, matching the Condition
 * collector: validation reports them, and a half-resolved sheet is more useful
 * to look at than an exception.
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
