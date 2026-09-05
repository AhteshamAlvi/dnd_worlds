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
 * collectors in character/status/injuries/effects.ts. That is also what keeps
 * this file — and everything else under foundation/ — from importing the rules
 * layer that sits on top of it.
 *
 * The definitions arrive as a PARAMETER for the same reason. Looking one up
 * would mean importing the authored catalog, which is content; the caller
 * already holds it and passes the anatomical view of each definition down.
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

import { createInjuryDefinitionMap } from "./types";
import type {
  AnatomicalInjuryDefinition,
  CharacterInjury,
  CharacterInjuryId,
} from "./types";
import { findInjuryLocationApplicabilityIssues } from "./validation";


/* -------------------------------------------------------------------------- */
/* Manifestation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Which of a character's stored Injuries the current form expresses.
 *
 * Reported three ways, and the third is the one resolution actually runs on.
 *
 * `active` and `dormant` are CharacterInjuryIds, for display and diagnostics.
 * They are lossy: a sheet with two entries sharing an id — a validation error,
 * but resolution runs before and during validation and has to give one answer
 * either way — cannot be told apart by id. Selecting Injuries with
 * `active.includes(injury.id)` would then pull in a DORMANT entry that happens
 * to share an id with a manifested one, and comparing two passes by id could
 * call `["dup"]` and `["dup"]` equal while a different one of the two was
 * manifested each time.
 *
 * `manifestedByIndex` is positional: one entry per supplied Injury, in the
 * order supplied. It cannot conflate two entries whatever their ids, and it is
 * what makes the manifestation fixpoint in character/resolution.ts
 * deterministic on a sheet validation has not yet rejected.
 */
export interface InjuryManifestation {
  readonly active: readonly CharacterInjuryId[];
  readonly dormant: readonly CharacterInjuryId[];

  /**
   * Whether each supplied Injury manifests, positionally.
   *
   * Always the same length as the `injuries` argument. Index-aligned with it,
   * so `injuries.filter((_, i) => manifestedByIndex[i])` is the exact
   * manifested subset even when two entries share an id.
   */
  readonly manifestedByIndex: readonly boolean[];
}

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
  injuryDefinitions: readonly AnatomicalInjuryDefinition[],
): InjuryManifestation {
  const injuryDefinitionsById = createInjuryDefinitionMap(injuryDefinitions);

  const active: CharacterInjuryId[] = [];
  const dormant: CharacterInjuryId[] = [];
  const manifestedByIndex: boolean[] = [];

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
    const definition = injuryDefinitionsById.get(injury.injuryId);

    if (definition === undefined) {
      dormant.push(injury.id);
      manifestedByIndex.push(false);

      continue;
    }

    const parts = injury.location.continuityKeys.map((key) =>
      manifested.get(key),
    );

    if (parts.some((part) => part === undefined)) {
      dormant.push(injury.id);
      manifestedByIndex.push(false);

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

    manifestedByIndex.push(fits);
  }

  return { active, dormant, manifestedByIndex };
}
