/*
 * Injury manifestation — whether an Injury currently applies at all.
 *
 * An Injury manifests when the current form actually expresses every
 * anatomical identity it occupies, and the anatomy standing there right now
 * can host it. A Dragon's fractured wing is dormant as a Human and active
 * again as an Angel, without the record ever changing.
 *
 * Manifestation is the gate on an Injury's EFFECTS, not merely a report about
 * them. character/resolution.ts resolves a preliminary Body from everything
 * that is not an Injury, asks this function which Injuries that anatomy
 * expresses, and only then collects Effects — from the manifested ones alone.
 * A dormant Injury contributes nothing while it is dormant and resumes
 * contributing the moment compatible anatomy returns.
 *
 * What an Injury contributes ONCE it manifests is a question about authored
 * content rather than about anatomy, so it lives with the other content
 * collectors in character/status/resolution.ts. That is also what keeps this
 * file — and everything else under foundation/ — from importing the rules
 * layer that sits on top of it.
 */

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
