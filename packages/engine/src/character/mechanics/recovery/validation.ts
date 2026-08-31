/*
 * Body/Status Recovery integration validation.
 *
 * status/injuries.ts already validates everything about a CharacterInjury
 * that can be checked without looking at a character's actual Anatomy —
 * instance ids, whether the referenced InjuryDefinition exists, and whether
 * treatmentStatus matches what that definition requires. This file adds
 * exactly the checks that need Body alongside Status:
 *
 * - every BodyPart id an Injury's location names actually exists;
 * - the concrete location satisfies the InjuryDefinition's authored
 *   BodyPart applicability;
 * - a location's Special Point reference is a real, allowed, and actually
 *   hosted Special Point for that location.
 *
 * It deliberately does not re-check anything status/injuries.ts already
 * covers — see findRecoveryValidationIssues, which composes the intrinsic
 * check with this file's Body-aware ones rather than duplicating it.
 */

import {
  createBodyPartDefinitionMap,
  matchesBodyPartSelector,
} from "../../foundation/body/selectors";
import type {
  Anatomy,
  BodyPart,
  BodyPartDefinition,
  BodyPartId,
} from "../../foundation/body/anatomy/types";
import {
  resolveCriticalPoints,
} from "../../foundation/body/critical-points/resolution";
import type {
  SpecialPointDefinition,
  SpecialPointDefinitionId,
} from "../../foundation/body/critical-points/types";

import {
  findInjuryValidationIssues,
  getInjuryDefinition,
  type CharacterInjury,
  type CharacterInjuryId,
  type InjuryApplicability,
  type InjuryId,
  type InjuryValidationIssue,
} from "../../status/injuries";


/* -------------------------------------------------------------------------- */
/* Body-aware location validation                                            */
/* -------------------------------------------------------------------------- */

export type RecoveryLocationValidationIssue =
  | {
      readonly type: "injury-body-part-unknown";
      readonly id: CharacterInjuryId;
      readonly injuryId: InjuryId;
      readonly bodyPartId: BodyPartId;
    }
  | {
      readonly type: "injury-body-part-not-applicable";
      readonly id: CharacterInjuryId;
      readonly injuryId: InjuryId;
      readonly bodyPartId: BodyPartId;
    }
  | {
      readonly type: "injury-special-point-missing";
      readonly id: CharacterInjuryId;
      readonly injuryId: InjuryId;
    }
  | {
      readonly type: "injury-special-point-unknown";
      readonly id: CharacterInjuryId;
      readonly injuryId: InjuryId;
      readonly specialPointDefinitionId: SpecialPointDefinitionId;
    }
  | {
      readonly type: "injury-special-point-not-applicable";
      readonly id: CharacterInjuryId;
      readonly injuryId: InjuryId;
      readonly specialPointDefinitionId: SpecialPointDefinitionId;
    }
  | {
      readonly type: "injury-special-point-not-hosted";
      readonly id: CharacterInjuryId;
      readonly injuryId: InjuryId;
      readonly specialPointDefinitionId: SpecialPointDefinitionId;
    };

/*
 * Checks the BodyPart-selector half of one Injury's applicability against
 * the concrete BodyParts its location names.
 */
function findBodyPartApplicabilityIssues(
  injury: CharacterInjury,
  resolvedParts: readonly BodyPart[],
  bodyPartSelector: InjuryApplicability["bodyParts"],
  definitionsByType: ReadonlyMap<string, BodyPartDefinition>,
): readonly RecoveryLocationValidationIssue[] {
  if (bodyPartSelector === undefined) return [];

  const issues: RecoveryLocationValidationIssue[] = [];

  for (const part of resolvedParts) {
    const partDefinition = definitionsByType.get(part.type);

    // An unknown BodyPartTypeId is intrinsic Anatomy invalidity, already
    // reported by anatomy/validation.ts — not this file's concern.
    if (partDefinition === undefined) continue;

    if (!matchesBodyPartSelector(part, partDefinition, bodyPartSelector)) {
      issues.push({
        type: "injury-body-part-not-applicable",
        id: injury.id,
        injuryId: injury.injuryId,
        bodyPartId: part.id,
      });
    }
  }

  return issues;
}

/*
 * Checks the Special Point half of one Injury's applicability against its
 * location's specialPointDefinitionId.
 */
function findSpecialPointApplicabilityIssues(
  injury: CharacterInjury,
  allowedSpecialPointDefinitionIds:
    | readonly SpecialPointDefinitionId[]
    | undefined,
  specialPointDefinitions: readonly SpecialPointDefinition[],
  hostedSpecialPointDefinitionIds: ReadonlySet<SpecialPointDefinitionId>,
): readonly RecoveryLocationValidationIssue[] {
  if (allowedSpecialPointDefinitionIds === undefined) return [];

  const specialPointDefinitionId = injury.location.specialPointDefinitionId;

  if (specialPointDefinitionId === undefined) {
    return [
      {
        type: "injury-special-point-missing",
        id: injury.id,
        injuryId: injury.injuryId,
      },
    ];
  }

  const isKnown = specialPointDefinitions.some(
    (definition) => definition.id === specialPointDefinitionId,
  );

  if (!isKnown) {
    return [
      {
        type: "injury-special-point-unknown",
        id: injury.id,
        injuryId: injury.injuryId,
        specialPointDefinitionId,
      },
    ];
  }

  if (!allowedSpecialPointDefinitionIds.includes(specialPointDefinitionId)) {
    return [
      {
        type: "injury-special-point-not-applicable",
        id: injury.id,
        injuryId: injury.injuryId,
        specialPointDefinitionId,
      },
    ];
  }

  if (!hostedSpecialPointDefinitionIds.has(specialPointDefinitionId)) {
    return [
      {
        type: "injury-special-point-not-hosted",
        id: injury.id,
        injuryId: injury.injuryId,
        specialPointDefinitionId,
      },
    ];
  }

  return [];
}

/*
 * Finds Body-aware problems with where a character's Injuries are located:
 * BodyPart ids that do not exist, locations that do not satisfy their
 * InjuryDefinition's applicability, and Special Point references that are
 * unknown, disallowed, or not actually hosted by the location's BodyParts.
 *
 * Unknown InjuryDefinitions are skipped — status/injuries.ts already reports
 * those, and there is no applicability to check against a definition that
 * does not exist.
 */
export function findRecoveryLocationIssues(
  anatomy: Anatomy,
  bodyPartDefinitions: readonly BodyPartDefinition[],
  specialPointDefinitions: readonly SpecialPointDefinition[],
  injuries: readonly CharacterInjury[],
): readonly RecoveryLocationValidationIssue[] {
  const issues: RecoveryLocationValidationIssue[] = [];

  const partsById = new Map(anatomy.parts.map((part) => [part.id, part]));
  const definitionsByType = createBodyPartDefinitionMap(bodyPartDefinitions);

  const criticalPoints = resolveCriticalPoints(
    anatomy,
    bodyPartDefinitions,
    specialPointDefinitions,
  );

  for (const injury of injuries) {
    const definition = getInjuryDefinition(injury.injuryId);

    if (definition === undefined) continue;

    const bodyPartIds = injury.location.bodyPartIds;

    const resolvedParts: BodyPart[] = [];

    for (const bodyPartId of bodyPartIds) {
      const part = partsById.get(bodyPartId);

      if (part === undefined) {
        issues.push({
          type: "injury-body-part-unknown",
          id: injury.id,
          injuryId: injury.injuryId,
          bodyPartId,
        });

        continue;
      }

      resolvedParts.push(part);
    }

    issues.push(
      ...findBodyPartApplicabilityIssues(
        injury,
        resolvedParts,
        definition.applicability.bodyParts,
        definitionsByType,
      ),
    );

    // Special Points actually hosted by one of this location's BodyParts —
    // used to confirm the referenced Special Point is not just known and
    // allowed, but genuinely present at this location.
    const hostedSpecialPointDefinitionIds = new Set(
      criticalPoints.points
        .filter((point) => bodyPartIds.includes(point.hostPartId))
        .map((point) => point.definitionId),
    );

    issues.push(
      ...findSpecialPointApplicabilityIssues(
        injury,
        definition.applicability.specialPointDefinitionIds,
        specialPointDefinitions,
        hostedSpecialPointDefinitionIds,
      ),
    );
  }

  return issues;
}


/* -------------------------------------------------------------------------- */
/* Combined Recovery validation                                              */
/* -------------------------------------------------------------------------- */

export type RecoveryValidationIssue =
  | InjuryValidationIssue
  | RecoveryLocationValidationIssue;

/*
 * Complete Recovery-relevant validation of a character's Injuries: the
 * intrinsic checks status/injuries.ts already owns, plus this file's
 * Body-aware location checks.
 *
 * This is the function character/validation.ts calls — it supersedes calling
 * findInjuryValidationIssues directly, since it already includes it.
 */
export function findRecoveryValidationIssues(
  anatomy: Anatomy,
  bodyPartDefinitions: readonly BodyPartDefinition[],
  specialPointDefinitions: readonly SpecialPointDefinition[],
  injuries: readonly CharacterInjury[],
): readonly RecoveryValidationIssue[] {
  return [
    ...findInjuryValidationIssues(injuries),
    ...findRecoveryLocationIssues(
      anatomy,
      bodyPartDefinitions,
      specialPointDefinitions,
      injuries,
    ),
  ];
}
