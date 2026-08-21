/*
 * Core Anatomy-domain value shapes.
 *
 * Anatomy represents the body parts a character physically possesses and the
 * structural relationships between those parts.
 *
 * BodyPartDefinition describes a reusable kind of body part.
 * BodyPart represents one actual persistent instance on a character.
 *
 * Anatomy is intentionally data-driven. The engine does not maintain a closed
 * list of valid body-part types such as "arm", "leg", "wing", or "tail".
 * New anatomy should be representable through data without requiring new
 * engine code.
 */


/*
 * Stable identifier for one actual body-part instance.
 *
 * Examples:
 *
 * "head-1"
 * "arm-1"
 * "arm-3"
 * "wing-2"
 */
export type BodyPartId = string;


/*
 * Identifier for a reusable body-part definition.
 *
 * Examples:
 *
 * "head"
 * "arm"
 * "leg"
 * "wing"
 */
export type BodyPartTypeId = string;


/*
 * Generic classification attached to a body-part definition.
 *
 * Tags allow systems to target groups of otherwise different body-part types.
 *
 * Examples:
 *
 * "limb"
 * "upper-limb"
 * "lower-limb"
 * "extremity"
 * "locomotor"
 * "left"
 */
export type BodyPartTag = string;


/*
 * Optional identifier describing where a child is attached to its parent.
 *
 * Attachment sites are opaque data identifiers. The Body engine does not
 * assign hardcoded mechanical meaning to names such as "left-shoulder" or
 * "distal".
 */
export type BodyAttachmentSiteId = string;


/*
 * Describes how strongly a body-part type responds to each universal
 * morphology dimension.
 *
 * A sensitivity of:
 *
 * 0
 * → the morphology dimension does not affect the part.
 *
 * 1
 * → the part receives the full standard effect.
 *
 * Values between or beyond those numbers may be used by unusual anatomy.
 *
 * The actual morphology equations belong to body-points/morphology.ts.
 */
export interface MorphologySensitivity {
  readonly height: number;
  readonly mass: number;
  readonly muscularity: number;
  readonly adiposity: number;
}


/*
 * Reusable mechanical definition of a kind of body part.
 *
 * Definitions are content data and are not copied into every character's
 * persistent Anatomy. A BodyPart instance references one of these definitions
 * through its `type`.
 *
 * baseBP is the part's reference Body Point value before morphology, training,
 * Constitution scaling, or other modifiers.
 */
export interface BodyPartDefinition {
  readonly id: BodyPartTypeId;

  readonly tags: readonly BodyPartTag[];

  readonly baseBP: number;

  readonly morphologySensitivity: MorphologySensitivity;
}


/*
 * Structural attachment of one body-part instance to another.
 *
 * Each BodyPart may have at most one structural parent. Children are derived
 * from these parent references rather than stored redundantly.
 *
 * `site` is optional descriptive data and is not interpreted by the generic
 * Anatomy engine.
 */
export interface BodyPartAttachment {
  readonly parentId: BodyPartId;
  readonly site?: BodyAttachmentSiteId;
}


/*
 * One actual physical body-part instance possessed by a character.
 *
 * `id`
 * → uniquely identifies this particular physical instance.
 *
 * `type`
 * → references the reusable BodyPartDefinition describing what kind of part
 *   this is.
 *
 * `name`
 * → optional display-level name. Mechanical logic must not depend upon it.
 *
 * `attachment`
 * → null for an anatomical root, otherwise identifies the structural parent.
 *
 * `damage`
 * → persistent accumulated BP damage. Maximum and Current BP are derived
 *   later by the Body Point system and are not stored here.
 *
 * Reaching 0 Current BP destroys the part. Damage application is responsible
 * for converting that destruction into a permanent anatomy removal; Anatomy
 * resolution itself remains a pure derivation.
 */
export interface BodyPart {
  readonly id: BodyPartId;
  readonly type: BodyPartTypeId;

  readonly name?: string;

  readonly attachment: BodyPartAttachment | null;

  readonly damage: number;
}


/*
 * Persistent physical anatomy owned by a character.
 *
 * The collection is structurally a directed acyclic forest:
 *
 * - every BodyPart has zero or one parent;
 * - any BodyPart may have zero or more children;
 * - multiple anatomical roots are permitted;
 * - cycles and dangling parent references are invalid.
 *
 * Those invariants are enforced by anatomy/validation.ts rather than by these
 * value types.
 */
export interface Anatomy {
  readonly parts: readonly BodyPart[];
}