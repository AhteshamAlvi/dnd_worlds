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
 * `name`/`description` make this a Definition (see infrastructure/registry.ts)
 * so BodyPartDefinition content is registered and looked up the same way
 * every other catalog domain's content is — see anatomy/body-parts.ts.
 *
 * baseBP is the part's reference Body Point value before morphology, training,
 * Constitution scaling, or other modifiers.
 */
export interface BodyPartDefinition {
  readonly id: BodyPartTypeId;

  readonly name: string;
  readonly description: string;

  readonly tags: readonly BodyPartTag[];

  /**
   * TRANSITIONAL. The pre-refactor Body Point baseline.
   *
   * BP is being moved onto Structural Capacity (`reference.structuralCapacity`)
   * but that formula does not land until the Body Point rewrite. Until then BP
   * still resolves from this field, so it is kept alongside the new physical
   * reference data rather than replaced by it, and the two deliberately
   * disagree per part (Neck 4 vs 2, Leg 14 vs 16, ...).
   *
   * Delete together with `morphologySensitivity` once BP consumes SC.
   */
  readonly baseBP: number;

  /**
   * TRANSITIONAL. The pre-refactor generic morphology response.
   *
   * Superseded by `sensitivity`. Kept for the same reason as `baseBP`.
   */
  readonly morphologySensitivity: MorphologySensitivity;

  /** Physical reference values at Scale 1 with all morphology neutral. */
  readonly reference: BodyPartReference;

  /** How strongly this kind of part responds to each morphology dimension. */
  readonly sensitivity: BodyPartMorphologySensitivity;
}


/*
 * Physical reference values for one kind of body part.
 *
 * These describe the part as it exists in the Basic Human Standard: Effective
 * Scale 1.0, every morphology value 1.0, undamaged. Everything else in the
 * Body pipeline is expressed as a factor applied to these.
 *
 * Units are real physical units — centimetres, litres, kilograms — because a
 * body that reports 165 cm and 62 kg can be sanity-checked against reality in
 * a way that abstract "size points" cannot.
 *
 * `structuralCapacity` is the shared foundation beneath both durability and
 * force. It is not a Body Point value and not a Strength Point value; BP and
 * SP are each derived from it by different formulas.
 *
 * `intrinsicPhysicalForce` is the part's authored baseline capacity to produce
 * force, as a multiplier on its Structural Capacity:
 *
 *   1 → an ordinary force-producing part
 *   0 → real physical structure that generates no force of its own
 *
 * A bone spike, shell plate, or decorative horn therefore contributes Size,
 * Mass, Structural Capacity and Body Points while contributing no Strength
 * Points. This is why normalization needs no separate "force-contributing"
 * flag: parts that make no force contribute zero to the numerator on their
 * own arithmetic.
 *
 * Distinguish this authored baseline from the Effect-level
 * modifyBase/ResolvedIntrinsicPhysicalForce vocabulary, which modifies it.
 *
 * `heightContribution` is the fraction of this part's resolved Length that
 * counts as vertical extent. 0 means the part never contributes to Height —
 * an Arm is 55 cm long and contributes none of it. A Human Foot is 25 cm long
 * from ankle to toe but only 7 cm of that is height, hence 0.28.
 *
 * `heightAxisSign` says which way along that vertical extent the part's own
 * local coordinate runs. See the type below for why this is deliberately not
 * folded into `heightContribution` as a signed number.
 */
export interface BodyPartReference {
  readonly lengthCm: number;
  readonly sizeL: number;
  readonly massKg: number;

  readonly structuralCapacity: number;

  /** Default 1. Never negative. */
  readonly intrinsicPhysicalForce: number;

  /** 0 to 1. Zero means this part does not contribute to Height. */
  readonly heightContribution: number;

  /** Which way local coordinate 0 -> 1 travels vertically. */
  readonly heightAxisSign: HeightAxisSign;
}


/*
 * Which vertical direction a BodyPart's own longitudinal axis points.
 *
 *   +1  local coordinate 0 -> 1 moves UP
 *   -1  local coordinate 0 -> 1 moves DOWN
 *
 * Every Height-relevant BodyPart carries a normalized longitudinal coordinate
 * running 0 to 1 between its two anatomical ends, and which end is which is
 * authored per part type: a Leg runs hip (0) to ankle (1), an Upper Body runs
 * inferior (0) to superior (1). Those two run in opposite vertical directions,
 * so the axis alone cannot say how far up a traversal has travelled.
 *
 * This is kept separate from `heightContribution` rather than collapsed into
 * one signed number, despite the "one mechanism" principle applied to
 * heightContribution itself. They answer different questions: contribution is
 * "how much of this part's Length is vertical at all", orientation is "which
 * way does its axis point". A Foot contributing 0.28 downward and a Foot
 * contributing 0.28 upward are different anatomy, and a single -0.28 would
 * make an authoring typo indistinguishable from a deliberate inversion.
 *
 * Parts with heightContribution 0 still carry a sign. It is inert there, but a
 * total field costs nothing and means anatomy that later gains vertical extent
 * does not also have to gain a new field.
 */
export type HeightAxisSign = 1 | -1;


/*
 * How strongly one kind of body part responds to each morphology dimension.
 *
 * Each value is the fraction of a morphology deviation that reaches this
 * particular part. An Arm has `bulkSize: 1.00` and a Head has `bulkSize:
 * 0.15`, so a broadly-built character has substantially thicker arms and a
 * barely-larger skull.
 *
 * Muscularity is deliberately split across three separate responses:
 *
 *   muscularityMass       → how much heavier muscle makes the part
 *   muscularityStructural → how much more Structural Capacity it gains
 *   muscularityForce      → how much more force it can actually produce
 *
 * The third exists because Strength doubles per tier while Structural
 * Capacity responds only linearly. Without a separate force response, reaching
 * high Strength would demand physically absurd Muscularity and therefore
 * absurd Mass. Structural response stays linear; force response is exponential.
 *
 * `muscularityStructural` must lie in [0, 1]. Above 1 the structural factor
 * `1 + ((M - 1) * s)` can go negative at low Muscularity, which would produce
 * negative Structural Capacity, Body Points and Strength Points. Enforced in
 * validation, not by this type.
 *
 * `muscularityForce` need only be non-negative — its formula, 2^((M - 1) * s),
 * stays positive for every finite input.
 */
export interface BodyPartMorphologySensitivity {
  readonly bulkSize: number;
  readonly adipositySize: number;

  readonly muscularityMass: number;
  readonly adiposityMass: number;

  /** Must be within [0, 1]. See the note above. */
  readonly muscularityStructural: number;

  /** Must be >= 0. */
  readonly muscularityForce: number;
}


/*
 * Structural attachment of one body-part instance to another.
 *
 * Each BodyPart may have at most one structural parent. Children are derived
 * from these parent references rather than stored redundantly.
 *
 * `site` is optional descriptive data and is not interpreted by the generic
 * Anatomy engine. It names the joint — "shoulder", "hip", "wrist" — and stays
 * exactly that: semantic metadata. The numeric geometry lives in the
 * coordinate pair below and is deliberately separate, because two different
 * body plans can both attach at something called a "shoulder" while meeting at
 * quite different points along the torso.
 *
 * `parentPosition` and `childPosition` record where the connection sits on
 * each of the two parts, in their own normalized 0..1 longitudinal
 * coordinates. Both are recorded because the geometry is a constraint, not a
 * direction:
 *
 *   vertical position at parentPosition == vertical position at childPosition
 *
 * A connection adds no distance of its own; it only asserts that the two parts
 * meet. Recording both ends is what lets Height traverse a connection either
 * way round, so the answer does not depend on which of the two parts happened
 * to be authored as the parent.
 */
export interface BodyPartAttachment {
  readonly parentId: BodyPartId;
  readonly site?: BodyAttachmentSiteId;

  /** Where on the PARENT's 0..1 longitudinal axis this connection sits. */
  readonly parentPosition: number;

  /** Where on the CHILD's own 0..1 longitudinal axis it sits. */
  readonly childPosition: number;
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
 * `state`
 * → whether this part is currently physically present (see BodyPartState).
 *   Newly created anatomy is always "active".
 *
 *   This is instance state, not form definition. It answers "is this here
 *   right now", never "is this supposed to be here" — that second question
 *   belongs to the Reference Form, and damage must never answer it. A severed
 *   Arm becomes "archived-removed" while the Reference Form goes on expecting
 *   two Arms, which is exactly what makes amputation lower Strength instead of
 *   cancelling itself out.
 *
 * `damage`
 * → persistent accumulated BP damage. Maximum and Current BP are derived
 *   later by the Body Point system and are not stored here.
 *
 * Reaching 0 Current BP destroys the part. Damage application is responsible
 * for converting that destruction into a permanent anatomy removal; Anatomy
 * resolution itself remains a pure derivation.
 *
 * `recoveryProgress`
 * → fractional whole-BP recovery banked toward this part's next point of
 *   natural healing (see foundation/body/body-points/recovery.ts). BP itself
 *   stays whole-numbered; this is where the remainder between ticks lives.
 *   Invariant: 0 <= recoveryProgress < 1. Reaching full Current BP, or being
 *   blocked at an Injury's recovery cap, resets it to 0 — recovery is never
 *   banked while there is nowhere for it to go.
 */
export interface BodyPart {
  readonly id: BodyPartId;
  readonly type: BodyPartTypeId;

  readonly name?: string;

  readonly attachment: BodyPartAttachment | null;

  readonly state: BodyPartState;

  readonly damage: number;
  readonly recoveryProgress: number;
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

/*
 * The physical state of one body-part instance.
 *
 * "active"
 * → physically present. Contributes Size, Mass, Height, Structural Capacity,
 *   Body Points, Strength Points, Anatomical Points and connections.
 *
 * "suppressed"
 * → temporarily absent through a reversible effect. Contributes nothing to
 *   the current body, but its state is retained so it can return.
 *
 * "archived-removed"
 * → destroyed or severed. Contributes nothing, but its specification is kept
 *   so extraordinary regeneration can recreate this specific structure.
 *
 * Suppressed and archived-removed parts both leave the current body, and so
 * both reduce Strength the same way. They differ in what happens next: one is
 * expected back on its own, the other needs a mechanic to restore it.
 *
 * Note that none of these states change the Reference Form. What a body is
 * SUPPOSED to contain and what it CURRENTLY contains are separate questions;
 * damage answers only the second.
 *
 * What this state does and does not gate:
 *
 *   active            Length geometry, Size, Mass, Height, SC, SP
 *   suppressed        nothing
 *   archived-removed  nothing
 *
 * Damage is a separate axis. A part that is badly hurt, paralysed, or cut off
 * behind a destroyed Joint is still "active" and still weighs what it weighs —
 * it has not left the body. Only leaving the body zeroes these contributions.
 */
export type BodyPartState =
  | "active"
  | "suppressed"
  | "archived-removed";

export const BODY_PART_STATES = [
  "active",
  "suppressed",
  "archived-removed",
] as const satisfies readonly BodyPartState[];


/*
 * The anatomy a physical form is supposed to contain when intact.
 *
 * This is the normalization denominator, and it is deliberately NOT the set of
 * parts a character currently has. A Human who loses both Arms is still a
 * Human-shaped form that is supposed to have them: the Reference Form stays at
 * 100 Structural Capacity while the parts actually present now total 64, and
 * Strength falls accordingly.
 *
 * Were the denominator to shrink alongside the numerator, amputation would
 * cancel itself out and a limbless character would read as exactly as strong
 * as an intact one.
 *
 * A Reference Form changes only when the intended body plan changes — Species
 * anatomy, normal age development, permanent anatomy modification, or an
 * active form-replacing transformation. It never changes because of damage.
 */
export interface ReferenceForm {
  readonly parts: readonly ReferenceFormPart[];
}


/*
 * One BodyPart the Reference Form expects, independent of whether the
 * character currently possesses it.
 */
export interface ReferenceFormPart {
  readonly id: BodyPartId;
  readonly type: BodyPartTypeId;
}
