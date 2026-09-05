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
 * Which Reference Form a slot belongs to.
 *
 * Slots are namespaced by form because a destroyed Human Arm must never
 * silently match a Dragon foreleg. Equivalence between forms is a
 * transformation's business to declare explicitly, and generic Body resolution
 * must never infer it from a shared BodyPart type or a similar name.
 */
export type ReferenceFormId = string;


/*
 * Which intended anatomical POSITION a part occupies — "left-arm", not "arm"
 * and not "arm-1".
 *
 * This is the third identity, and it exists because the other two cannot do
 * its job. A BodyPartTypeId says what KIND of thing a part is, and several
 * parts share one: left-upper-arm, right-upper-arm, left-lower-arm and
 * right-lower-arm may all be "arm". A BodyPartId says which physical INSTANCE
 * is there right now, and instances die and are replaced.
 *
 * A slot is what survives both. It is the thing a Reference Form expects, the
 * thing an archived record points back at, and the thing this character's own
 * local morphology belongs to — so a regenerated Arm comes back with THEIR
 * arm's length and bulk rather than the species default.
 *
 * Unique within a Reference Form, and only within one.
 */
export type ReferenceAnatomySlotId = string;


/*
 * A slot identity that is unique across every form a character might take.
 *
 * "HumanForm:left-arm", "DragonForm:left-foreleg". Always built with
 * anatomySlotKey rather than by hand, so the separator never drifts.
 */
export type AnatomySlotKey = string & { readonly __anatomySlotKey: unique symbol };


/*
 * A persistent anatomical identity, independent of any one form.
 *
 * The THIRD namespace, and the one that survives everything the other two
 * cannot:
 *
 *   slotId         where anatomy sits inside ONE Reference Form
 *   BodyPartId     which physical instance is standing there right now
 *   ContinuityKey  what that anatomy IS, across forms and regenerations
 *
 * A Human right arm, a Wolf front-right leg and a Troll right arm are three
 * slots in three forms and one identity: "upper-limb:right". That identity is
 * what this character's own morphology, damage, recovery and Injuries belong
 * to — so a limb that is severed, regrown, or carried through a
 * transformation comes back as theirs rather than as a species default.
 *
 * Continuity is AUTHORED, never inferred. Two forms correspond because their
 * definitions say so, and never because two slots share a name, a BodyPart
 * type, or a slot id that happens to match.
 */
export type ContinuityKey = string & { readonly __continuityKey: unique symbol };


/*
 * The only sanctioned way to build one, so that the brand cannot be forged by
 * a cast at a call site and every continuity key in the engine has been through
 * one place.
 */
export function continuityKey(value: string): ContinuityKey {
  return value as ContinuityKey;
}


export function anatomySlotKey(
  referenceFormId: ReferenceFormId,
  referenceSlotId: ReferenceAnatomySlotId,
): AnatomySlotKey {
  return `${referenceFormId}:${referenceSlotId}` as AnatomySlotKey;
}


/*
 * Optional identifier describing where a child is attached to its parent.
 *
 * Attachment sites are opaque data identifiers. The Body engine does not
 * assign hardcoded mechanical meaning to names such as "left-shoulder" or
 * "distal".
 */
export type BodyAttachmentSiteId = string;


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
 * A definition carries no Body Point value of its own. Body Points resolve
 * from `reference.structuralCapacity` through the Structural Capacity
 * subsystem, so durability and force now come from one physical number
 * instead of two independently authored ones that could drift apart.
 */
export interface BodyPartDefinition {
  readonly id: BodyPartTypeId;

  readonly name: string;
  readonly description: string;

  readonly tags: readonly BodyPartTag[];

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
 * There is no adiposity MASS sensitivity, and its absence is the interesting
 * part of this type. Fat cannot add volume to a body without weighing
 * something, so asking a definition to answer "how much larger does adiposity
 * make this part" AND, separately, "how much heavier" invites the two answers
 * to drift apart — which they had, badly: the Human table gave adiposity a
 * whole-body size response of 0.171 and a mass response of 0.092, so a body
 * could become visibly obese while barely gaining weight. Adiposity mass is
 * now derived from the volume adiposity adds, times the Species' soft-tissue
 * density. One question, one answer, and mass follows from physics.
 *
 * Muscularity keeps its own mass sensitivity, because Muscularity genuinely
 * does not work that way: it is denser tissue developing INSIDE the volume
 * that already exists, not new volume appearing. It is deliberately split
 * across three separate responses:
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
 * `referenceFormId` / `referenceSlotId`
 * → which intended anatomical position this instance occupies.
 *
 *   Carried by the INSTANCE rather than looked up, because an instance can
 *   outlive its slot's presence in the current form: a severed Arm keeps
 *   pointing at HumanForm:left-arm even after a mutation removes that slot
 *   from the body plan, which is exactly what makes the archive restorable if
 *   the slot ever returns.
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
 * `integrity`
 * → how much of this part's structure remains, as a fraction of its Maximum
 *   BP. 1 is undamaged.
 *
 *   Stored as a FRACTION rather than as absolute damage, for one decisive
 *   reason: Maximum BP is derived, so it changes whenever Scale, Muscularity,
 *   Build or CON changes. A character storing "7 damage" who grows, trains or
 *   ages silently gains or loses health. A character storing "0.5 integrity"
 *   does not — growing from Max BP 14 to 28 turns 7/14 into 14/28, which is
 *   the same wound on a bigger body. Max BP changing is neither healing nor
 *   harm, and integrity is what makes the engine able to say so.
 *
 *   Invariant: 0 < integrity <= 1. Zero is not a legal stored value. A part
 *   with nothing left is not a damaged part, it is a destroyed one, and
 *   destruction is a `state` transition to "archived-removed" rather than a
 *   number reaching a threshold. That distinction is what stops a rounding
 *   result from ever destroying a limb, and what stops a later Maximum BP
 *   increase from resurrecting one.
 *
 *   There is deliberately no separate banked-progress companion field. A
 *   whole-numbered BP model needs one because a recovery tick can restore
 *   less than a whole point; continuous integrity has nowhere for a leftover
 *   fraction to go missing to, so there is nothing left to bank.
 */
export interface BodyPart {
  readonly id: BodyPartId;
  readonly type: BodyPartTypeId;

  readonly name?: string;

  readonly attachment: BodyPartAttachment | null;

  readonly referenceFormId: ReferenceFormId;
  readonly referenceSlotId: ReferenceAnatomySlotId;

  /*
   * What this instance persistently IS, across forms and regenerations.
   *
   * Copied from the Reference Form slot it was instantiated into. It is what
   * persistent state — individual morphology, integrity, Injuries — is keyed
   * by, so none of it is lost when this particular instance is not.
   */
  readonly continuityKey: ContinuityKey;

  readonly state: BodyPartState;

  readonly integrity: number;
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
/*
 * A complete anatomical blueprint: what parts a body of this kind has, how
 * they connect, and what each one persistently is.
 *
 * Enough to INSTANTIATE anatomy from, which is the whole reason it carries
 * attachment geometry. A form that only listed slots and types could say what
 * a body was supposed to contain and could not build one, so every body plan
 * had to be hand-authored a second time as a parallel tree — two structures
 * describing one thing, free to drift.
 *
 * It owns topology and geometry, and deliberately nothing else. Morphology,
 * damage, recovery and Injuries all belong to the CHARACTER, keyed by
 * continuity identity, so that the same form can be worn by any number of
 * different bodies.
 */
export interface ReferenceForm {
  readonly id: ReferenceFormId;

  readonly parts: readonly ReferenceFormPart[];
}


/*
 * One BodyPart the Reference Form expects, independent of whether the
 * character currently possesses it.
 */
/*
 * How one Reference Form slot connects to its parent.
 *
 * The same geometry BodyPartAttachment carries, expressed between SLOTS rather
 * than between instances — a blueprint connects positions, and the instances
 * standing in them do not exist yet.
 */
export interface ReferenceFormAttachment {
  readonly parentSlotId: ReferenceAnatomySlotId;
  readonly site?: BodyAttachmentSiteId;

  /** Where on the PARENT's 0..1 longitudinal axis this connection sits. */
  readonly parentPosition: number;

  /** Where on the CHILD's own 0..1 longitudinal axis it sits. */
  readonly childPosition: number;
}


export interface ReferenceFormPart {
  /*
   * The anatomical position, not an instance. A Reference Form describes
   * intent, and intent has no instances — a form expects a left arm whether or
   * not the character currently has one, has lost one, or has three.
   */
  readonly slotId: ReferenceAnatomySlotId;

  readonly type: BodyPartTypeId;

  /*
   * What anatomy in this position persistently IS.
   *
   * The one field that makes forms comparable. A Wolf's front-right leg and a
   * Human's right arm are the same identity said twice, and only because both
   * definitions say "upper-limb:right" — never because anything about their
   * slot ids, types or names looks alike.
   */
  readonly continuityKey: ContinuityKey;

  /** Presentational only, exactly as BodyPart.name is. */
  readonly name?: string;

  readonly attachment: ReferenceFormAttachment | null;
}
