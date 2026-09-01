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
  ContinuityKey,
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
      /*
       * Named for the identity rather than for a BodyPart, because that is
       * what an Injury actually references. "Unknown" means this character's
       * body has never had such anatomy — NOT that it is currently missing,
       * which is dormancy and is not an error at all.
       *
       * Its sibling below is still body-part-shaped on purpose: applicability
       * is judged against the concrete BodyPart standing in the identity right
       * now, and a form can legitimately manifest one identity as an Arm and
       * another as a wing.
       */
      readonly type: "injury-continuity-unknown";
      readonly id: CharacterInjuryId;
      readonly injuryId: InjuryId;

      readonly continuityKey: ContinuityKey;
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
 * The anatomy the Special Point hosting check is resolved against.
 *
 * Every recorded part, whatever became of it.
 *
 * Anatomical Points resolve over ACTIVE anatomy, which is right for every
 * mechanic asking what a body can currently do — a sealed arm has no usable
 * Shoulder, and neither does a severed one. It is wrong for this question,
 * because this question is not about what works. There are two questions here
 * and only one of them is validation's:
 *
 *   IS THIS INJURY VALID?        does this anatomical position exist at all,
 *                                and does the Injury belong on it
 *
 *   IS IT CURRENTLY MANIFESTED?  is that position present and usable right now
 *
 * The first is a fact about the sheet and is what this file decides. The second
 * changes minute to minute — a limb is suppressed, severed, regenerated,
 * transformed away by a change of form — and an authored record must not become
 * illegal because of it. Telling a player to "point the Injury at the Special
 * Point's actual host BodyParts" while their arm is temporarily sealed would be
 * advice about data that is already correct.
 *
 * That applies to destruction too. Destroying a limb removes a current
 * anatomical manifestation; it does not erase the anatomical history the
 * archive exists to keep. An Injury on a destroyed arm may well stop applying —
 * superseded by the destruction, or simply dormant until the limb is
 * regenerated — but that is the Injury system's decision to make, not a
 * side effect of the instance leaving active anatomy.
 */
function withEveryRecordedPositionPresent(anatomy: Anatomy): Anatomy {
  if (anatomy.parts.every((part) => part.state === "active")) return anatomy;

  return {
    ...anatomy,
    parts: anatomy.parts.map((part) =>
      part.state === "active" ? part : { ...part, state: "active" as const },
    ),
  };
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
  knownContinuityKeys: ReadonlySet<ContinuityKey>,
  bodyPartDefinitions: readonly BodyPartDefinition[],
  specialPointDefinitions: readonly SpecialPointDefinition[],
  injuries: readonly CharacterInjury[],
): readonly RecoveryLocationValidationIssue[] {
  const issues: RecoveryLocationValidationIssue[] = [];

  const definitionsByType = createBodyPartDefinitionMap(bodyPartDefinitions);

  /*
   * The manifestation, by identity. An identity absent from this map is one
   * the current form does not express — dormant, not wrong.
   */
  const manifested = new Map(
    withEveryRecordedPositionPresent(anatomy).parts.map(
      (part) => [part.continuityKey, part] as const,
    ),
  );

  const criticalPoints = resolveCriticalPoints(
    withEveryRecordedPositionPresent(anatomy),
    bodyPartDefinitions,
    specialPointDefinitions,
  );

  for (const injury of injuries) {
    const definition = getInjuryDefinition(injury.injuryId);

    if (definition === undefined) continue;

    const continuityKeys = injury.location.continuityKeys;

    const resolvedParts: BodyPart[] = [];

    let dormant = false;

    for (const key of continuityKeys) {
      /*
       * VALIDITY. The identity has to be one this character's body knows —
       * from a form they can take, or from persistent state a previous form
       * left behind. An Injury on an identity nothing has ever had is a
       * genuine authoring error.
       */
      if (!knownContinuityKeys.has(key)) {
        issues.push({
          type: "injury-continuity-unknown",
          id: injury.id,
          injuryId: injury.injuryId,
          continuityKey: key,
        });

        continue;
      }

      const part = manifested.get(key);

      /*
       * MANIFESTATION. A valid identity the current form does not express is
       * dormant: no anatomy to check applicability against, and nothing wrong
       * to report. It comes back when a form that expresses it does.
       */
      if (part === undefined) {
        dormant = true;

        continue;
      }

      resolvedParts.push(part);
    }

    /*
     * Applicability and Special Point hosting are questions about the anatomy
     * an Injury is currently sitting on, so a dormant Injury is not asked
     * them. Asking would judge a Dragon's wing injury against a Human's
     * shoulders and reject a record that is perfectly correct.
     */
    if (dormant || resolvedParts.length === 0) continue;

    issues.push(
      ...findBodyPartApplicabilityIssues(
        injury,
        resolvedParts,
        definition.applicability.bodyParts,
        definitionsByType,
      ),
    );

    const hostPartIds = resolvedParts.map((part) => part.id);

    const hostedSpecialPointDefinitionIds = new Set(
      criticalPoints.points
        .filter((point) => hostPartIds.includes(point.hostPartId))
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


/*
 * Which Injuries the current form actually expresses.
 *
 * The other half of the split findRecoveryLocationIssues makes. Validity is a
 * fact about the sheet and is checked once; manifestation changes every time a
 * character transforms, and is what decides whether an Injury's effects apply
 * right now.
 *
 * An Injury manifests when the current form expresses EVERY identity it
 * occupies and the anatomy standing there can host it. A Dragon's fractured
 * wing is dormant as a Human and active again as an Angel, without the record
 * ever changing.
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
      findBodyPartApplicabilityIssues(
        injury,
        resolvedParts,
        definition.applicability.bodyParts,
        definitionsByType,
      ).length === 0 &&
      findSpecialPointApplicabilityIssues(
        injury,
        definition.applicability.specialPointDefinitionIds,
        specialPointDefinitions,
        hosted,
      ).length === 0;

    if (fits) active.push(injury.id);
    else dormant.push(injury.id);
  }

  return { active, dormant };
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
  knownContinuityKeys: ReadonlySet<ContinuityKey>,
  bodyPartDefinitions: readonly BodyPartDefinition[],
  specialPointDefinitions: readonly SpecialPointDefinition[],
  injuries: readonly CharacterInjury[],
): readonly RecoveryValidationIssue[] {
  return [
    ...findInjuryValidationIssues(injuries),
    ...findRecoveryLocationIssues(
      anatomy,
      knownContinuityKeys,
      bodyPartDefinitions,
      specialPointDefinitions,
      injuries,
    ),
  ];
}
