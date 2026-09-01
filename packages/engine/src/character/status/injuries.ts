/*
 * Injuries — persistent anatomical status entries.
 *
 * An Injury is a lasting physical consequence attached to a character's
 * actual Anatomy.
 *
 * Injuries are mechanically EffectfulDefinitions, so they participate in the
 * same universal Effect system as other authored character content. Unlike a
 * general Condition, however, every Injury is anatomical:
 *
 *   InjuryDefinition
 *   -> declares what anatomy the Injury may affect
 *
 *   CharacterInjury
 *   -> records the exact anatomy that was actually injured
 *
 *
 * DEFINITIONS VS INSTANCES
 * ------------------------
 *
 * InjuryDefinition is reusable authored content.
 *
 * Example:
 *
 *   "broken-arm"
 *   -> may apply to BodyParts of type "arm"
 *
 * CharacterInjury is one concrete Injury currently carried by one character.
 *
 * Example:
 *
 *   injury-3
 *   -> broken-arm
 *   -> arm-2
 *
 * Multiple CharacterInjuries may reference the same InjuryDefinition.
 *
 * For example, a character may legitimately have:
 *
 *   injury-1 -> broken-arm -> arm-1
 *   injury-2 -> broken-arm -> arm-2
 *
 * Therefore injuryId is NOT unique within a character. CharacterInjury.id is
 * the identity of the concrete Injury instance.
 *
 *
 * ANATOMICAL LOCATION
 * -------------------
 *
 * BodyPart IDs are local to the character that owns the Injury.
 *
 * "arm-1" therefore means the arm-1 contained by this character's Body
 * Anatomy. It does not need to be globally unique across every character.
 *
 * Most Injuries affect one BodyPart, but a location may contain multiple
 * BodyPart IDs because some anatomical targets span multiple hosts.
 *
 * Example:
 *
 *   Spine
 *   -> Upper Body
 *   -> Lower Body
 *
 * A Special Point definition ID may also be stored when the Injury concerns
 * a more precise anatomical target such as:
 *
 *   shoulder
 *   elbow
 *   face
 *   spine
 *
 * The BodyPart IDs remain the concrete physical hosts. The optional Special
 * Point definition ID preserves the more precise anatomical context.
 *
 *
 * NO STAGES OR SEVERITY
 * ---------------------
 *
 * Injuries do not have a universal stage/severity track.
 *
 * Different mechanical states are authored as different entries when they
 * need to be mechanically distinct.
 *
 * Likewise, things such as Bleeding and Heavy Bleeding are Conditions rather
 * than Injury stages.
 *
 * An Injury remains stored on the character until another mechanic removes,
 * replaces, or otherwise resolves it.
 *
 *
 * DOMAIN BOUNDARY
 * ---------------
 *
 * This file owns:
 *
 * - Injury IDs;
 * - InjuryDefinition;
 * - anatomical applicability;
 * - CharacterInjury;
 * - concrete Injury locations;
 * - Injury registry access;
 * - intrinsic Injury validation.
 *
 * This file does NOT determine:
 *
 * - whether an attack causes an Injury opportunity;
 * - Body Point damage;
 * - BodyPart destruction;
 * - Anatomical Point resolution;
 * - whether a concrete location satisfies an InjuryDefinition against a
 *   resolved Body;
 * - healing or recovery mechanics;
 * - bleeding or other secondary Conditions.
 *
 * Body-aware applicability validation requires the owning character's Anatomy
 * and BodyPartDefinitions and belongs in the Body/Status integration layer.
 */

import {
  createRegistry,
} from "../../infrastructure/registry";

import type {
  NonEmptyArray,
} from "../../infrastructure/result";

import type {
  EffectfulDefinition,
} from "../rules/content";

import type {
  Effect,
} from "../rules/effects";

import type {
  BodyPartId,
  ContinuityKey,
} from "../foundation/body/anatomy/types";

import type {
  BodyPartSelector,
} from "../foundation/body/selectors";

import type {
  SpecialPointDefinitionId,
} from "../foundation/body/critical-points/types";


/* -------------------------------------------------------------------------- */
/* IDs                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * ID of reusable authored Injury content.
 *
 * Example:
 *
 *   "broken-arm"
 *   "shoulder-dislocation"
 *   "concussion"
 */
export type InjuryId = string;


/**
 * ID of one concrete Injury instance carried by one character.
 *
 * CharacterInjury IDs only need to be unique within that character's Injury
 * collection.
 */
export type CharacterInjuryId = string;


/* -------------------------------------------------------------------------- */
/* Anatomical applicability                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Declares where an InjuryDefinition is allowed to exist.
 *
 * Every Injury must have anatomical applicability.
 *
 * `bodyParts` constrains the BP-bearing BodyParts on which the Injury may
 * exist.
 *
 * `specialPointDefinitionIds` constrains the Injury to one or more more
 * precise anatomical targets such as Shoulder, Elbow, Face, or Spine.
 *
 * When both dimensions are present, BOTH must match.
 *
 * Examples:
 *
 *   Broken Arm:
 *
 *     bodyParts:
 *       types = ["arm"]
 *
 *
 *   Generic Fracture:
 *
 *     bodyParts:
 *       tags = ["bone-bearing"]
 *
 *
 *   Shoulder Dislocation:
 *
 *     bodyParts:
 *       types = ["arm"]
 *
 *     specialPointDefinitionIds:
 *       ["shoulder"]
 *
 *
 * At least one applicability dimension must be present.
 */
export type InjuryApplicability =
  | {
      readonly bodyParts: BodyPartSelector;
      readonly specialPointDefinitionIds?:
        NonEmptyArray<SpecialPointDefinitionId>;
    }
  | {
      readonly bodyParts?: BodyPartSelector;
      readonly specialPointDefinitionIds:
        NonEmptyArray<SpecialPointDefinitionId>;
    };


/* -------------------------------------------------------------------------- */
/* Treatment and recovery                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Where a treatment-required Injury currently stands.
 *
 * "untreated" is the starting state for every treatment-required Injury.
 * Successful treatment moves it to "treated" — see InjuryRecovery below for
 * what that changes and, just as importantly, what it does not.
 */
export type InjuryTreatmentStatus =
  | "untreated"
  | "treated";


/**
 * How an InjuryDefinition heals.
 *
 * `treatmentRequired: false`
 * → the Injury recovers on its own; a character carrying it has no
 *   treatmentStatus at all.
 *
 * `treatmentRequired: true`
 * → the Injury starts "untreated". While untreated, natural recovery on the
 *   BodyParts this Injury occupies may only restore Current BP up to
 *   `bpRecoveryCeilingFraction` of Maximum BP — recovery mechanics (not this
 *   file) are responsible for actually enforcing that ceiling. Successful
 *   treatment moves the Injury to "treated" and removes the ceiling.
 *
 * Treatment never restores BP or removes the Injury by itself. The Injury
 * remains on the character — recovering under whatever ceiling now applies —
 * until every BodyPart it occupies reaches Maximum BP.
 *
 * `bpRecoveryCeilingFraction` is a fraction of Maximum BP: 0 means the
 * occupied BodyParts cannot recover at all while untreated, 1 means the
 * Injury does not restrict recovery even before treatment (only its Effects
 * matter in that case).
 */
export type InjuryRecovery =
  | {
      readonly treatmentRequired: false;
    }
  | {
      readonly treatmentRequired: true;
      readonly bpRecoveryCeilingFraction: number;
    };


/* -------------------------------------------------------------------------- */
/* Injury definitions                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Reusable authored Injury content.
 *
 * Effects describe what the Injury mechanically does for as long as it is
 * active, regardless of treatment state.
 *
 * Applicability describes what anatomy the Injury is allowed to affect.
 *
 * Recovery describes whether the Injury needs treatment and, if so, the
 * recovery ceiling it imposes until treated.
 *
 * `treatmentEffects` adds Effects on top of the base `effects` depending on
 * treatment state — see status/resolution.ts for how the two combine.
 * Meaningful only for a treatment-required Injury: one that recovers without
 * treatment has no treatment state to key off, and normally authors only its
 * plain `effects`.
 */
export interface InjuryDefinition extends EffectfulDefinition {
  readonly applicability: InjuryApplicability;

  readonly recovery: InjuryRecovery;

  readonly treatmentEffects?: {
    readonly untreated?: readonly Effect[];
    readonly treated?: readonly Effect[];
  };
}


/* -------------------------------------------------------------------------- */
/* Character Injury location                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Concrete anatomical location of one Injury carried by one character.
 *
 * Located by CONTINUITY identity rather than by BodyPart instance, because an
 * Injury has to outlive the tissue it is on. A broken arm is still broken after
 * the arm is regrown into a new instance, and is still the same injury when the
 * character is a wolf and that identity is a foreleg.
 *
 * That split gives an Injury two separate states, and conflating them is the
 * mistake this shape exists to prevent:
 *
 *   VALID        the identity exists in this character's body at all
 *   MANIFESTED   the current form has anatomy for it, and the Injury's own
 *                applicability fits that anatomy
 *
 * An Injury whose identity the current form does not express is DORMANT — not
 * invalid, not healed, and not deleted. It returns when a form that expresses
 * that identity does.
 *
 * Most Injuries name one identity. Several are permitted for anatomical
 * targets that span more than one, such as the Spine.
 *
 * `specialPointDefinitionId` is optional because ordinary Injuries do not
 * concern a Special Point. When present it names the precise site, and is one
 * of the things that can keep an Injury dormant: a form whose corresponding
 * anatomy hosts no such point cannot express it.
 */
export interface InjuryLocation {
  readonly continuityKeys: NonEmptyArray<ContinuityKey>;

  readonly specialPointDefinitionId?: SpecialPointDefinitionId;
}


/* -------------------------------------------------------------------------- */
/* Character Injury                                                           */
/* -------------------------------------------------------------------------- */

/**
 * One concrete Injury currently carried by a character.
 *
 * This object is persistent character state and should be stored directly in
 * the character JSON.
 *
 * `id` identifies this Injury occurrence.
 *
 * `injuryId` identifies the reusable InjuryDefinition.
 *
 * `location` identifies the exact anatomy affected.
 *
 * `treatmentStatus` only applies to a treatment-required InjuryDefinition:
 *
 *   treatmentRequired = false
 *   -> treatmentStatus must be absent.
 *
 *   treatmentRequired = true
 *   -> treatmentStatus must be "untreated" or "treated".
 *
 * There is no `stage`, `severity`, or `remainingDuration` here. Injuries do
 * not use the shared status/stage.ts vocabulary — see this file's own header
 * for why — and this engine does not track a healing duration or a
 * `healingStartedAt`: how long recovery takes falls out of natural BP
 * recovery (mechanics/recovery/) rather than being authored per Injury.
 */
export interface CharacterInjury {
  readonly id: CharacterInjuryId;

  readonly injuryId: InjuryId;

  readonly location: InjuryLocation;

  readonly treatmentStatus?: InjuryTreatmentStatus;
}


/* -------------------------------------------------------------------------- */
/* Catalog                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Authored Injury catalog.
 *
 * The catalog intentionally remains empty until actual Injury content is
 * authored. Hosts may register their own definitions through the normal
 * content infrastructure.
 */
export const INJURY_DEFINITIONS = {} as const satisfies Record<
  string,
  InjuryDefinition
>;


const INJURY_REGISTRY = createRegistry<InjuryDefinition>(
  "Injury",
  INJURY_DEFINITIONS,
);


export type KnownInjuryId =
  keyof typeof INJURY_DEFINITIONS;


/**
 * Whether an InjuryDefinition exists for the supplied ID.
 */
export function isKnownInjuryId(
  injuryId: InjuryId,
): boolean {
  return INJURY_REGISTRY.isKnownId(injuryId);
}


/**
 * Return an InjuryDefinition when one is registered.
 */
export function getInjuryDefinition(
  injuryId: InjuryId,
): InjuryDefinition | undefined {
  return INJURY_REGISTRY.get(injuryId);
}


/* -------------------------------------------------------------------------- */
/* Character Injury validation                                                */
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
      readonly type: "invalid-injury-location";
      readonly id: CharacterInjuryId;
      readonly issue:
        | "no-body-parts"
        | "invalid-body-part-id"
        | "duplicate-body-part-id"
        | "invalid-special-point-definition-id";
      readonly bodyPartId?: BodyPartId;
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
 * - locations contain at least one BodyPart ID;
 * - BodyPart IDs inside one location are non-empty and unique;
 * - an optional Special Point definition ID is non-empty.
 *
 * This function deliberately does NOT determine:
 *
 * - whether a BodyPartId currently exists;
 * - whether a BodyPart matches the InjuryDefinition's BodyPartSelector;
 * - whether a Special Point exists on the selected BodyPart(s);
 * - whether the concrete location satisfies the definition's applicability.
 *
 * Those checks require the owning character's Anatomy and BodyPartDefinitions
 * and belong in Body-aware Injury validation.
 */
export function findInjuryValidationIssues(
  injuries: readonly CharacterInjury[],
): readonly InjuryValidationIssue[] {
  const issues: InjuryValidationIssue[] = [];

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

    const definition = getInjuryDefinition(injury.injuryId);

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

    const bodyPartIds =
      injury.location.continuityKeys as readonly string[];

    if (bodyPartIds.length === 0) {
      issues.push({
        type: "invalid-injury-location",
        id: injury.id,
        issue: "no-body-parts",
      });
    }


    const seenBodyPartIds =
      new Set<BodyPartId>();

    for (const bodyPartId of bodyPartIds) {
      if (bodyPartId.trim().length === 0) {
        issues.push({
          type: "invalid-injury-location",
          id: injury.id,
          issue: "invalid-body-part-id",
          bodyPartId,
        });
      }

      if (seenBodyPartIds.has(bodyPartId)) {
        issues.push({
          type: "invalid-injury-location",
          id: injury.id,
          issue: "duplicate-body-part-id",
          bodyPartId,
        });
      } else {
        seenBodyPartIds.add(bodyPartId);
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
 * Full contextual validation against actual BodyPartDefinitions belongs in
 * the Body-aware integration layer.
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
 * Validate the authored Injury catalog.
 *
 * Registry/content issues are checked first, followed by Injury-specific
 * anatomical applicability and recovery-contract rules.
 *
 * Whether selectors or Special Point references are compatible with a
 * particular character cannot be determined here because anatomy and
 * BodyPartDefinitions are character/body-plan dependent.
 */
export function findInjuryCatalogIssues(): readonly string[] {
  const issues = [
    ...INJURY_REGISTRY.findCatalogIssues(),
  ];


  for (const injury of INJURY_REGISTRY.all()) {
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
/* Registry export                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Exposed for the catalog index, which needs every registry in one map.
 */
export const injuryRegistry =
  INJURY_REGISTRY;