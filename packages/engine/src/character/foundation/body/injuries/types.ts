/*
 * Injuries — persistent anatomical status entries.
 *
 * An Injury is a lasting physical consequence attached to a character's
 * actual Anatomy. It lives under Body rather than under status/ because it
 * genuinely is anatomical: an Injury has BodyPart applicability, continuity
 * locations, optional Special Point locations, BP recovery ceilings, and
 * treatment rules — exactly Body's subject matter.
 *
 * An Injury is anatomical AND authored content, and those two halves live in
 * two places on purpose:
 *
 *   foundation/body/injuries/   ANATOMY. Locations, applicability, treatment
 *                               state, recovery ceilings, manifestation, and
 *                               the anatomical validation of all of it.
 *                               AnatomicalInjuryDefinition is declared here.
 *
 *   character/status/injuries/  CONTENT. The Effects an Injury contributes,
 *                               the extra ones treatment state adds, and the
 *                               authored catalog. InjuryDefinition extends
 *                               AnatomicalInjuryDefinition there and adds
 *                               them.
 *
 * Foundation must not name `Effect` or `EffectfulDefinition`: the Effect union
 * spans every domain, so a Foundation type mentioning it makes Foundation
 * depend on the rules layer sitting on top of it. Splitting the interface is
 * what keeps Recovery and manifestation down here — they are anatomical — while
 * the Effects go up where they belong.
 *
 * Unlike a general Condition, every Injury is anatomical:
 *
 *   AnatomicalInjuryDefinition
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
 * An Injury is located by CONTINUITY KEY — the persistent anatomical identity
 * — and never by BodyPart instance id. That is what lets an Injury outlive the
 * tissue it is on: a broken arm is still broken after the arm is regrown into
 * a new instance, and is still the same Injury when the character is a wolf
 * and that identity is a foreleg. See InjuryLocation below.
 *
 * Continuity keys are local to the character that owns the Injury.
 * "upper-limb:left" therefore means that identity within this character's
 * Body; it does not need to be globally unique across every character.
 *
 * Most Injuries name one identity, but a location may name several because
 * some anatomical targets span more than one.
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
 * The continuity keys remain the anatomical hosts. The optional Special Point
 * definition ID preserves the more precise anatomical context.
 *
 * BodyPart instances still appear one step later, in APPLICABILITY: whether an
 * Injury fits is judged against the concrete BodyPart currently manifesting
 * the identity, which is a different question from where the Injury is.
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
 * - AnatomicalInjuryDefinition;
 * - anatomical applicability;
 * - recovery requirements and ceilings;
 * - treatment state;
 * - CharacterInjury;
 * - concrete Injury locations.
 *
 * resolution.ts owns MANIFESTATION — whether the current form expresses an
 * Injury's anatomy at all.
 * validation.ts owns intrinsic and anatomical-applicability validation.
 *
 * Injury EFFECT COLLECTION and the authored CATALOG are neither here nor in
 * resolution.ts. Both are content questions, and both live in
 * character/status/injuries/ — effects.ts and definitions.ts respectively.
 * Foundation receives the anatomical definitions it needs through its inputs
 * and never looks a definition up for itself.
 *
 * This file does NOT determine:
 *
 * - whether an attack causes an Injury opportunity;
 * - Body Point damage;
 * - BodyPart destruction;
 * - Anatomical Point resolution;
 * - healing or recovery mechanics beyond the ceiling an Injury declares;
 * - bleeding or other secondary Conditions.
 */

import {
  type NonEmptyArray,
} from "../../../../infrastructure/result";

import type {
  Definition,
} from "../../../../infrastructure/registry";

import type {
  ContinuityKey,
} from "../anatomy/types";

import type {
  BodyPartSelector,
} from "../selectors";

import type {
  SpecialPointDefinitionId,
} from "../critical-points/types";


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
 * The ANATOMICAL half of an authored Injury — everything Body needs, and
 * nothing Body may not see.
 *
 * An Injury is two things at once, and this is the half that is physics:
 *
 *   ANATOMICAL   where the Injury may sit, whether it needs treatment, and
 *                what ceiling it puts on natural recovery. Body reads all of
 *                it, and none of it is content-system vocabulary.
 *
 *   CONTENT      what the Injury DOES — its Effects, and the extra Effects
 *                treatment state adds. That is the rules vocabulary, and it
 *                lives above Foundation in character/status/injuries/, where
 *                InjuryDefinition extends this interface and adds them.
 *
 * The split is what removed the last foundation/ -> character/rules/ import.
 * `Effect` is a union over every domain — Body selectors, check scopes,
 * Attribute keys, Action capacities — so a Foundation type that named it
 * forced Foundation to depend on the layer sitting on top of it. Splitting the
 * interface rather than moving the Injury domain keeps Recovery and
 * manifestation where they belong (they are anatomical) while the Effects go
 * where they belong (they are content).
 *
 * Nothing in Body ever holds the full InjuryDefinition. Callers above
 * Foundation look one up in the registry and pass it down as an
 * AnatomicalInjuryDefinition, which it structurally is — so there is no
 * conversion, no second lookup, and no way for Body to read an Effect it was
 * handed.
 *
 * The SERIALIZED shape is unchanged. An authored definition still carries
 * applicability, recovery, effects and treatmentEffects in one object; only
 * the type that describes it is split, so no stored content needs migrating.
 */
export interface AnatomicalInjuryDefinition extends Definition {
  /** What anatomy this Injury is allowed to affect. */
  readonly applicability: InjuryApplicability;

  /**
   * Whether the Injury needs treatment and, if so, the ceiling it puts on
   * natural recovery until it is treated.
   */
  readonly recovery: InjuryRecovery;
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
 * recovery (foundation/body/recovery/) rather than being authored per Injury.
 */
export interface CharacterInjury {
  readonly id: CharacterInjuryId;

  readonly injuryId: InjuryId;

  readonly location: InjuryLocation;

  readonly treatmentStatus?: InjuryTreatmentStatus;
}


/* -------------------------------------------------------------------------- */
/* Definition lookup                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Indexes the anatomical Injury definitions a caller supplied, by id.
 *
 * Foundation is HANDED its definitions; it never looks one up in a catalog,
 * because the catalog is content and lives above it. This is the shared way to
 * turn the supplied array into the lookup every Body function actually wants,
 * so manifestation, validation and Recovery cannot disagree about what "the
 * definition for this Injury" means.
 *
 * Mirrors createBodyPartDefinitionMap, for the same reason and with the same
 * shape. A later duplicate id wins, matching that function; a catalog with
 * duplicate ids is a registry problem and is reported there.
 */
export function createInjuryDefinitionMap(
  definitions: readonly AnatomicalInjuryDefinition[],
): ReadonlyMap<InjuryId, AnatomicalInjuryDefinition> {
  return new Map(
    definitions.map((definition) => [definition.id, definition] as const),
  );
}
