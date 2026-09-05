/*
 * Injury resolution — what an Injury currently contributes, and whether it
 * currently applies at all.
 *
 * Two independent questions live here:
 *
 * - EFFECTS. Every Injury on the character is "in force" the moment it is
 *   recorded — there is no expiry field (see types.ts) — but a
 *   treatment-required Injury adds its untreated/treated Effects on top of
 *   whatever it always contributes. collectInjuryEffectSources answers this,
 *   and runs BEFORE Body/Anatomy resolves: Injury Effects are part of what
 *   produces the resolved Body in the first place, so this function cannot
 *   ask whether the Injury is currently MANIFESTED without creating a cycle.
 *
 * - MANIFESTATION. Once Anatomy has resolved, resolveInjuryManifestation asks
 *   the other question: does the current form actually express every
 *   anatomical identity this Injury occupies, and does the Injury's own
 *   applicability fit the anatomy standing there right now? A Dragon's
 *   fractured wing is dormant as a Human and active again as an Angel,
 *   without the record ever changing. This is a downstream question a
 *   caller asks about an already-resolved character, not a precondition for
 *   resolving one.
 */

import {
  contributesNothing,
  sourceContributions,
} from "../../../rules/content";
import type { RuleEffectSource } from "../../../rules/resolution";

import {
  createBodyPartDefinitionMap,
} from "../selectors";
import type {
  Anatomy,
  BodyPart,
  BodyPartDefinition,
} from "../anatomy/types";
import {
  resolveCriticalPoints,
} from "../critical-points/resolution";
import type {
  SpecialPointDefinition,
} from "../critical-points/types";

import { getInjuryDefinition } from "./definitions";
import type { CharacterInjury, CharacterInjuryId } from "./types";
import { findInjuryLocationApplicabilityIssues } from "./validation";


/* -------------------------------------------------------------------------- */
/* Effect collection                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The Effect sources contributed by a character's current injuries.
 *
 * Every listed Injury is active — types.ts has no expiry field, so "on the
 * character" is "in force" — but a treatment-required Injury adds its
 * untreated or treated Effects on top of whatever it always contributes:
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

    if (contributesNothing(definition, effects)) continue;

    sources.push({
      source: { type: "injury", id: injury.injuryId },
      effects,
      ...sourceContributions(definition),
    });
  }

  return sources;
}


/* -------------------------------------------------------------------------- */
/* Manifestation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Which Injuries the current form actually expresses.
 *
 * Validity is a fact about the sheet and is checked once, by validation.ts.
 * Manifestation changes every time a character transforms, and is what
 * decides whether an Injury's effects apply right now.
 *
 * An Injury manifests when the current form expresses EVERY identity it
 * occupies and the anatomy standing there can host it. A Dragon's fractured
 * wing is dormant as a Human and active again as an Angel, without the
 * record ever changing.
 */
export function resolveInjuryManifestation(
  anatomy: Anatomy,
  bodyPartDefinitions: readonly BodyPartDefinition[],
  specialPointDefinitions: readonly SpecialPointDefinition[],
  injuries: readonly CharacterInjury[],
): {
  readonly active: readonly CharacterInjuryId[];
  readonly dormant: readonly CharacterInjuryId[];
} {
  const active: CharacterInjuryId[] = [];
  const dormant: CharacterInjuryId[] = [];

  const definitionsByType = createBodyPartDefinitionMap(bodyPartDefinitions);

  /* Only ACTIVE anatomy manifests. A suppressed or destroyed limb is not
   * expressing anything, whatever the form says it should have. */
  const manifested = new Map(
    anatomy.parts
      .filter((part) => part.state === "active")
      .map((part) => [part.continuityKey, part] as const),
  );

  const criticalPoints = resolveCriticalPoints(
    anatomy,
    bodyPartDefinitions,
    specialPointDefinitions,
  );

  for (const injury of injuries) {
    const definition = getInjuryDefinition(injury.injuryId);

    if (definition === undefined) {
      dormant.push(injury.id);

      continue;
    }

    const parts = injury.location.continuityKeys.map((key) =>
      manifested.get(key),
    );

    if (parts.some((part) => part === undefined)) {
      dormant.push(injury.id);

      continue;
    }

    const resolvedParts = parts as readonly BodyPart[];

    const hostPartIds = resolvedParts.map((part) => part.id);

    const hosted = new Set(
      criticalPoints.points
        .filter((point) => hostPartIds.includes(point.hostPartId))
        .map((point) => point.definitionId),
    );

    /*
     * The Injury's own applicability decides whether it makes sense HERE.
     * Continuity says which anatomy corresponds; it does not say that a wing
     * fracture means anything on a limb that has no such structure.
     */
    const fits =
      findInjuryLocationApplicabilityIssues(
        injury,
        resolvedParts,
        definition,
        definitionsByType,
        specialPointDefinitions,
        hosted,
      ).length === 0;

    if (fits) active.push(injury.id);
    else dormant.push(injury.id);
  }

  return { active, dormant };
}
