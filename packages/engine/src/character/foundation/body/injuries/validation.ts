/*
 * Injury validation — intrinsic shape, catalog content, and anatomical
 * applicability.
 *
 * Three layers, cheapest first:
 *
 * - INTRINSIC (findInjuryValidationIssues). Everything checkable without
 *   looking at a character's actual Anatomy: instance ids, whether the
 *   referenced InjuryDefinition exists, and whether treatmentStatus matches
 *   what that definition requires.
 *
 * - CATALOG, ANATOMICAL HALF (findAnatomicalInjuryCatalogIssues). Whether the
 *   supplied definitions are well-formed as ANATOMY — applicability declared,
 *   recovery fractions in range. Registry well-formedness and Effect validity
 *   are the catalog's own business and live in
 *   character/status/injuries/validation.ts, which calls this and adds them.
 *
 * - ANATOMICAL APPLICABILITY (findInjuryLocationIssues). Needs Body
 *   alongside the Injury: every continuity identity an Injury's location
 *   names is anatomy this character's body has actually had, the concrete
 *   BodyPart manifesting it satisfies the InjuryDefinition's authored
 *   BodyPart applicability, and a location's Special Point reference is a
 *   real, allowed, and actually hosted Special Point for that location.
 *
 * The vocabulary difference between the second and third layer is deliberate.
 * A LOCATION is a set of continuity keys — persistent anatomical identities
 * that outlive any one form. APPLICABILITY is judged against the concrete
 * BodyPart currently standing in one of those identities, so the issues it
 * raises are legitimately body-part-shaped.
 *
 * findBodyInjuryValidationIssues composes the character-facing layers into the
 * one function a caller judging a character's Injuries actually wants.
 *
 * Every function here is HANDED its AnatomicalInjuryDefinitions. Nothing in
 * this file looks a definition up: the authored catalog is content, it lives
 * above Foundation, and reaching for it is what used to make Foundation
 * import the rules layer. Callers above pass the full InjuryDefinitions down,
 * which structurally are anatomical ones.
 */

import {
  createBodyPartDefinitionMap,
  matchesBodyPartSelector,
} from "../selectors";
import type {
  Anatomy,
  BodyPart,
  BodyPartDefinition,
  BodyPartId,
  ContinuityKey,
} from "../anatomy/types";
import {
  resolveCriticalPoints,
} from "../critical-points/resolution";
import type {
  SpecialPointDefinition,
  SpecialPointDefinitionId,
} from "../critical-points/types";

import { createInjuryDefinitionMap } from "./types";
import type {
  AnatomicalInjuryDefinition,
  CharacterInjury,
  CharacterInjuryId,
  InjuryApplicability,
  InjuryId,
  InjuryRecovery,
} from "./types";


/* -------------------------------------------------------------------------- */
/* Intrinsic Injury validation                                                */
/* -------------------------------------------------------------------------- */

export type InjuryValidationIssue =
  | {
      readonly type: "invalid-injury-instance-id";
      readonly id: CharacterInjuryId;
    }
  | {
      readonly type: "duplicate-injury-instance-id";
      readonly id: CharacterInjuryId;
    }
  | {
      readonly type: "unknown-injury";
      readonly id: CharacterInjuryId;
      readonly injuryId: InjuryId;
    }
  | {
      /*
       * An Injury's location names CONTINUITY IDENTITIES, not BodyPart
       * instances — see InjuryLocation. That is what lets a wing fracture
       * survive a transformation: the identity persists while the instance
       * standing in it does not. The vocabulary here says so, because calling
       * these "BodyPart ids" is what made the two look interchangeable.
       *
       * Its sibling injury-body-part-not-applicable below is still
       * body-part-shaped, and correctly so: applicability is judged against
       * the concrete BodyPart currently manifesting the identity.
       */
      readonly type: "invalid-injury-location";
      readonly id: CharacterInjuryId;
      readonly issue:
        | "no-continuity-keys"
        | "invalid-continuity-key"
        | "duplicate-continuity-key"
        | "invalid-special-point-definition-id";
      readonly continuityKey?: ContinuityKey;
      readonly specialPointDefinitionId?: SpecialPointDefinitionId;
    }
  | {
      readonly type: "invalid-injury-treatment-status";
      readonly id: CharacterInjuryId;
      readonly injuryId: InjuryId;
      readonly issue:
        | "unexpected-treatment-status"
        | "missing-treatment-status"
        | "unknown-treatment-status";
    };


/**
 * Validate the intrinsic persistent shape of CharacterInjuries.
 *
 * This validates facts that can be checked without resolving the character's
 * Body:
 *
 * - every Injury instance has a non-empty ID;
 * - CharacterInjury IDs are unique;
 * - referenced InjuryDefinitions are known;
 * - treatmentStatus is present exactly when the definition requires
 *   treatment, and is one of the two known values when present;
 * - locations contain at least one continuity key;
 * - continuity keys inside one location are non-empty and unique;
 * - an optional Special Point definition ID is non-empty.
 *
 * This function deliberately does NOT determine:
 *
 * - whether a continuity key names anatomy this character has ever had;
 * - whether the current form manifests it;
 * - whether a BodyPart matches the InjuryDefinition's BodyPartSelector;
 * - whether a Special Point exists on the selected BodyPart(s);
 * - whether the concrete location satisfies the definition's applicability.
 *
 * Those checks require the owning character's Anatomy and BodyPartDefinitions
 * — see findInjuryLocationIssues below.
 */
export function findInjuryValidationIssues(
  injuries: readonly CharacterInjury[],
  injuryDefinitions: readonly AnatomicalInjuryDefinition[],
): readonly InjuryValidationIssue[] {
  const issues: InjuryValidationIssue[] = [];

  const injuryDefinitionsById = createInjuryDefinitionMap(injuryDefinitions);

  const seenInstanceIds =
    new Set<CharacterInjuryId>();


  for (const injury of injuries) {
    /* ---------------------------------------------------------------------- */
    /* Instance ID                                                            */
    /* ---------------------------------------------------------------------- */

    if (injury.id.trim().length === 0) {
      issues.push({
        type: "invalid-injury-instance-id",
        id: injury.id,
      });
    }

    if (seenInstanceIds.has(injury.id)) {
      issues.push({
        type: "duplicate-injury-instance-id",
        id: injury.id,
      });
    } else {
      seenInstanceIds.add(injury.id);
    }


    /* ---------------------------------------------------------------------- */
    /* Definition reference                                                   */
    /* ---------------------------------------------------------------------- */

    const definition = injuryDefinitionsById.get(injury.injuryId);

    if (definition === undefined) {
      issues.push({
        type: "unknown-injury",
        id: injury.id,
        injuryId: injury.injuryId,
      });
    } else {
      /* ------------------------------------------------------------------ */
      /* Treatment status                                                    */
      /* ------------------------------------------------------------------ */

      const treatmentRequired = definition.recovery.treatmentRequired;

      if (!treatmentRequired && injury.treatmentStatus !== undefined) {
        issues.push({
          type: "invalid-injury-treatment-status",
          id: injury.id,
          injuryId: injury.injuryId,
          issue: "unexpected-treatment-status",
        });
      }

      if (treatmentRequired && injury.treatmentStatus === undefined) {
        issues.push({
          type: "invalid-injury-treatment-status",
          id: injury.id,
          injuryId: injury.injuryId,
          issue: "missing-treatment-status",
        });
      }

      if (
        treatmentRequired &&
        injury.treatmentStatus !== undefined &&
        injury.treatmentStatus !== "untreated" &&
        injury.treatmentStatus !== "treated"
      ) {
        issues.push({
          type: "invalid-injury-treatment-status",
          id: injury.id,
          injuryId: injury.injuryId,
          issue: "unknown-treatment-status",
        });
      }
    }


    /* ---------------------------------------------------------------------- */
    /* Location                                                               */
    /* ---------------------------------------------------------------------- */

    const continuityKeys = injury.location.continuityKeys;

    if (continuityKeys.length === 0) {
      issues.push({
        type: "invalid-injury-location",
        id: injury.id,
        issue: "no-continuity-keys",
      });
    }


    const seenContinuityKeys = new Set<ContinuityKey>();

    for (const continuityKey of continuityKeys) {
      if (continuityKey.trim().length === 0) {
        issues.push({
          type: "invalid-injury-location",
          id: injury.id,
          issue: "invalid-continuity-key",
          continuityKey,
        });
      }

      if (seenContinuityKeys.has(continuityKey)) {
        issues.push({
          type: "invalid-injury-location",
          id: injury.id,
          issue: "duplicate-continuity-key",
          continuityKey,
        });
      } else {
        seenContinuityKeys.add(continuityKey);
      }
    }


    const specialPointDefinitionId =
      injury.location.specialPointDefinitionId;

    if (
      specialPointDefinitionId !== undefined &&
      specialPointDefinitionId.trim().length === 0
    ) {
      issues.push({
        type: "invalid-injury-location",
        id: injury.id,
        issue: "invalid-special-point-definition-id",
        specialPointDefinitionId,
      });
    }
  }


  return issues;
}


/* -------------------------------------------------------------------------- */
/* Catalog validation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Find structural problems in one InjuryDefinition's anatomical
 * applicability.
 *
 * BodyPartSelector owns its own selector semantics. This function therefore
 * only validates the Injury-specific wrapper around that selector.
 *
 * Full contextual validation against actual BodyPartDefinitions is
 * findInjuryLocationIssues's job.
 */
function findInjuryApplicabilityIssues(
  injuryId: InjuryId,
  applicability: InjuryApplicability,
): readonly string[] {
  const issues: string[] = [];


  const hasBodyPartApplicability =
    applicability.bodyParts !== undefined;

  const specialPointDefinitionIds =
    applicability.specialPointDefinitionIds;

  const hasSpecialPointApplicability =
    specialPointDefinitionIds !== undefined &&
    specialPointDefinitionIds.length > 0;


  if (
    !hasBodyPartApplicability &&
    !hasSpecialPointApplicability
  ) {
    issues.push(
      `Injury "${injuryId}" must declare anatomical applicability.`,
    );
  }


  if (specialPointDefinitionIds !== undefined) {
    if (specialPointDefinitionIds.length === 0) {
      issues.push(
        `Injury "${injuryId}" cannot declare an empty Special Point applicability list.`,
      );
    }


    const seenSpecialPointDefinitionIds =
      new Set<SpecialPointDefinitionId>();

    for (
      const specialPointDefinitionId
      of specialPointDefinitionIds
    ) {
      if (specialPointDefinitionId.trim().length === 0) {
        issues.push(
          `Injury "${injuryId}" contains an empty Special Point definition ID.`,
        );
      }

      if (
        seenSpecialPointDefinitionIds.has(
          specialPointDefinitionId,
        )
      ) {
        issues.push(
          `Injury "${injuryId}" contains duplicate Special Point definition ID "${specialPointDefinitionId}".`,
        );
      } else {
        seenSpecialPointDefinitionIds.add(
          specialPointDefinitionId,
        );
      }
    }
  }


  return issues;
}


/**
 * Find structural problems in one InjuryDefinition's recovery contract.
 *
 * A non-treatment-required Injury has nothing to check here — there is no
 * ceiling fraction to be malformed.
 */
function findInjuryRecoveryIssues(
  injuryId: InjuryId,
  recovery: InjuryRecovery,
): readonly string[] {
  if (!recovery.treatmentRequired) {
    return [];
  }

  const { bpRecoveryCeilingFraction } = recovery;

  if (
    !Number.isFinite(bpRecoveryCeilingFraction) ||
    bpRecoveryCeilingFraction < 0 ||
    bpRecoveryCeilingFraction > 1
  ) {
    return [
      `Injury "${injuryId}" has an invalid bpRecoveryCeilingFraction (must be a finite number between 0 and 1).`,
    ];
  }

  return [];
}


/**
 * Validate the ANATOMICAL half of authored Injury definitions.
 *
 * Applicability must name something, and a treatment-required Injury's
 * recovery ceiling must be a usable fraction. Both are Body's rules, so both
 * are checked here — over the definitions the caller supplies rather than over
 * a catalog this layer reaches for.
 *
 * Registry well-formedness (ids, duplicates) and Effect validity are the
 * catalog's own business and belong to character/status/injuries/validation.ts,
 * which calls this and adds them.
 *
 * Whether selectors or Special Point references are compatible with a
 * particular character cannot be determined here either, because anatomy and
 * BodyPartDefinitions are character/body-plan dependent — that is
 * findInjuryLocationIssues.
 */
export function findAnatomicalInjuryCatalogIssues(
  injuryDefinitions: readonly AnatomicalInjuryDefinition[],
): readonly string[] {
  const issues: string[] = [];


  for (const injury of injuryDefinitions) {
    issues.push(
      ...findInjuryApplicabilityIssues(
        injury.id,
        injury.applicability,
      ),
    );

    issues.push(
      ...findInjuryRecoveryIssues(
        injury.id,
        injury.recovery,
      ),
    );
  }


  return issues;
}


/* -------------------------------------------------------------------------- */
/* Anatomical applicability                                                   */
/* -------------------------------------------------------------------------- */

export type InjuryLocationValidationIssue =
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
): readonly InjuryLocationValidationIssue[] {
  if (bodyPartSelector === undefined) return [];

  const issues: InjuryLocationValidationIssue[] = [];

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
): readonly InjuryLocationValidationIssue[] {
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
 * Both applicability dimensions for one Injury against the anatomy it is
 * currently sitting on.
 *
 * Shared by findInjuryLocationIssues (which asks "is this recorded state
 * valid") and resolution.ts's resolveInjuryManifestation (which asks "does
 * this apply right now") — one implementation of "does this Injury fit this
 * anatomy" rather than two that could disagree.
 */
export function findInjuryLocationApplicabilityIssues(
  injury: CharacterInjury,
  resolvedParts: readonly BodyPart[],
  definition: {
    readonly applicability: InjuryApplicability;
  },
  definitionsByType: ReadonlyMap<string, BodyPartDefinition>,
  specialPointDefinitions: readonly SpecialPointDefinition[],
  hostedSpecialPointDefinitionIds: ReadonlySet<SpecialPointDefinitionId>,
): readonly InjuryLocationValidationIssue[] {
  return [
    ...findBodyPartApplicabilityIssues(
      injury,
      resolvedParts,
      definition.applicability.bodyParts,
      definitionsByType,
    ),
    ...findSpecialPointApplicabilityIssues(
      injury,
      definition.applicability.specialPointDefinitionIds,
      specialPointDefinitions,
      hostedSpecialPointDefinitionIds,
    ),
  ];
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
 * Unknown InjuryDefinitions are skipped — findInjuryValidationIssues already
 * reports those, and there is no applicability to check against a definition
 * that does not exist.
 */
export function findInjuryLocationIssues(
  anatomy: Anatomy,
  knownContinuityKeys: ReadonlySet<ContinuityKey>,
  bodyPartDefinitions: readonly BodyPartDefinition[],
  specialPointDefinitions: readonly SpecialPointDefinition[],
  injuries: readonly CharacterInjury[],
  injuryDefinitions: readonly AnatomicalInjuryDefinition[],
): readonly InjuryLocationValidationIssue[] {
  const issues: InjuryLocationValidationIssue[] = [];

  const definitionsByType = createBodyPartDefinitionMap(bodyPartDefinitions);
  const injuryDefinitionsById = createInjuryDefinitionMap(injuryDefinitions);

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
    const definition = injuryDefinitionsById.get(injury.injuryId);

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

    const hostPartIds = resolvedParts.map((part) => part.id);

    const hostedSpecialPointDefinitionIds = new Set(
      criticalPoints.points
        .filter((point) => hostPartIds.includes(point.hostPartId))
        .map((point) => point.definitionId),
    );

    issues.push(
      ...findInjuryLocationApplicabilityIssues(
        injury,
        resolvedParts,
        definition,
        definitionsByType,
        specialPointDefinitions,
        hostedSpecialPointDefinitionIds,
      ),
    );
  }

  return issues;
}


/* -------------------------------------------------------------------------- */
/* Combined Body-level Injury validation                                     */
/* -------------------------------------------------------------------------- */

export type BodyInjuryValidationIssue =
  | InjuryValidationIssue
  | InjuryLocationValidationIssue;

/*
 * Complete Body-level validation of a character's Injuries: intrinsic
 * validity, known continuity identities, BodyPart applicability, Special
 * Point validity and hosting.
 *
 * This is the function character/validation.ts calls — it supersedes calling
 * findInjuryValidationIssues directly, since it already includes it.
 *
 * Dormant Injuries are never reported invalid here — see
 * findInjuryLocationIssues's own comment for why dormancy and validity are
 * different questions.
 */
export function findBodyInjuryValidationIssues(
  anatomy: Anatomy,
  knownContinuityKeys: ReadonlySet<ContinuityKey>,
  bodyPartDefinitions: readonly BodyPartDefinition[],
  specialPointDefinitions: readonly SpecialPointDefinition[],
  injuries: readonly CharacterInjury[],
  injuryDefinitions: readonly AnatomicalInjuryDefinition[],
): readonly BodyInjuryValidationIssue[] {
  return [
    ...findInjuryValidationIssues(injuries, injuryDefinitions),
    ...findInjuryLocationIssues(
      anatomy,
      knownContinuityKeys,
      bodyPartDefinitions,
      specialPointDefinitions,
      injuries,
      injuryDefinitions,
    ),
  ];
}
