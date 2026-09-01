/*
 * Strength — the shapes.
 *
 * The direction of the whole model is worth stating before the types, because
 * it is the reverse of what most systems do:
 *
 *   Body -> SC -> Intrinsic SP -> Normalized Body SP -> STR
 *
 * Strength is not an input a character sheet stores and the body obeys. It is
 * an output of the physics. Buying "+1 STR" does not write a number anywhere;
 * it solves for the Muscularity that doubles this body's normalized Strength
 * Points, persists that, and lets the displayed number fall out.
 *
 * There is no `forceContributing` flag anywhere in here, deliberately. Every
 * physically present part is in the sum, and anatomy that inherently produces
 * no force sets `intrinsicPhysicalForce: 0` and contributes zero by
 * arithmetic. A bone spike, shell plate or decorative horn therefore carries
 * Size, Mass, Structural Capacity and Body Points while carrying no Strength,
 * and a form loaded with inert structure reads as weaker — which is the
 * intended consequence, not a side effect to correct.
 */

import type { BodyResolutionMode } from "../resolution-mode";
import type { BodyMorphology } from "../types";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
  ReferenceAnatomySlotId,
  ReferenceForm,
} from "../anatomy/types";


/*
 * The physical context one resolution mode sees.
 *
 * Split out from the rest of the input because Base and Resolved see DIFFERENT
 * contexts — a transformation that doubles a character's Scale for a minute
 * changes the resolved body and not the base one. A caller with no
 * resolved-only Effects may still omit `resolved`, and the two contexts are
 * then the same body.
 */
export interface StrengthPhysicalContext {
  /*
   * Morphology for the intact Reference Form, keyed by SLOT id.
   *
   * This is the one that drives STR, in BOTH modes. The form's part list is
   * slot ids, so a map keyed by anything else silently misses and every slot
   * falls back to neutral morphology — which is a wrong Strength rather than
   * an error, and was exactly the bug this split exists to make impossible.
   */
  readonly morphologyBySlotId: Readonly<
    Record<ReferenceAnatomySlotId, BodyMorphology>
  >;

  /*
   * Morphology for the anatomy actually present, keyed by INSTANCE id.
   *
   * Required in resolved mode and unread in base mode, where the present set
   * IS the form. Optional for that reason: a base-mode caller has no instance
   * morphology to give and should not be made to invent one.
   *
   * Instance ids and slot ids are different namespaces even where they happen
   * to coincide — a regenerated limb occupies its old slot under a new id — so
   * these are two maps and never one.
   */
  readonly morphologyByPartId?: Readonly<Record<BodyPartId, BodyMorphology>>;

  readonly effectiveScale: number;

  /*
   * Per-part multipliers on intrinsic force production, over and above what
   * Scale and Muscularity already explain.
   *
   * Reserved for genuine physical force changes — unusual Species physiology,
   * supernatural force production, specific permanent physical effects. Skills,
   * techniques, manoeuvres, equipment leverage and action bonuses do NOT
   * belong here; they apply later, to action resolution, and folding them in
   * at this level would make a character permanently stronger for holding a
   * lever.
   *
   * Absent entries are 1.
   */
  readonly intrinsicForceModifierBySlotId?: Readonly<
    Record<ReferenceAnatomySlotId, number>
  >;
  readonly intrinsicForceModifierByPartId?: Readonly<Record<BodyPartId, number>>;
}


/*
 * Everything Strength resolution needs about a body.
 *
 * `anatomy` is what the character currently has; `referenceForm` is what their
 * form is supposed to have. Both are required, and they answer different
 * questions: the Reference Form alone produces STR, while current anatomy
 * produces the force actually available. Neither substitutes for the other.
 */
export interface StrengthResolutionInput {
  readonly anatomy: Anatomy;

  readonly referenceForm: ReferenceForm;

  readonly definitions: readonly BodyPartDefinition[];

  readonly base: StrengthPhysicalContext;

  /** Defaults to `base`. See StrengthPhysicalContext. */
  readonly resolved?: StrengthPhysicalContext;
}


/*
 * One BodyPart's contribution to the body's force.
 *
 * Every intermediate is kept rather than collapsed into the final number,
 * because Strength is the one value in this engine that nobody authored and
 * everybody will want to argue with. "Why is this character STR 11" has to be
 * answerable down to the part.
 */
export interface ResolvedPartStrength {
  readonly partId: BodyPartId;

  readonly structuralCapacity: number;

  readonly muscularityForceFactor: number;

  readonly intrinsicPhysicalForce: number;

  readonly intrinsicMaxSP: number;
}


/*
 * A body's resolved Strength.
 *
 * `strengthPosition` is the continuous, unclamped physical position and is
 * `null` only for a body that produces no force at all, where log2(0) has no
 * value. `displayedStrength` is always numeric — 0 in exactly that case, and
 * 1..30 otherwise. Derived Attributes sum STR directly and cannot take a null.
 */
/*
 * A body's Strength, in two clearly separated halves.
 *
 * THE FORM half drives STR. It is computed over every slot of the intact
 * Reference Form, so it answers "how strong is a body of this kind, built this
 * way" — a question about Scale, morphology and intrinsic force, and about
 * nothing that has happened to the character.
 *
 * THE PRESENT half is what the anatomy actually there can produce. It answers
 * "how much force does this character currently have available", which damage,
 * amputation, suppression and severance all change.
 *
 * Conflating those two was the old model's mistake. A Human who loses an Arm
 * has less total usable force; their remaining muscles did not drop a Strength
 * tier. STR describes the strength quality of the intact form; instance
 * history describes how much of that form is left to use.
 */
export interface ResolvedBodyStrength {
  readonly mode: BodyResolutionMode;

  /* ---- The form: what drives STR --------------------------------------- */

  readonly formParts: readonly ResolvedPartStrength[];

  readonly formByPartId: Readonly<Record<BodyPartId, ResolvedPartStrength>>;

  /** Sum over every slot of the intact Reference Form. */
  readonly referenceFormIntrinsicSP: number;

  readonly referenceFormAnatomicalCapacity: number;

  /*
   * Where Body stops. Turning this into a ladder position and a displayed
   * Stat belongs to foundation/attributes/strength.ts — those are facts about
   * the 1..30 ladder, not about physics.
   */
  readonly normalizedBodySP: number;

  /* ---- What is actually present: never touches STR ---------------------- */

  readonly presentParts: readonly ResolvedPartStrength[];

  readonly presentByPartId: Readonly<Record<BodyPartId, ResolvedPartStrength>>;

  /*
   * Sum over anatomy physically present. Equal to referenceFormIntrinsicSP on
   * an intact body, lower on a damaged one, and identical to it in base mode —
   * base mode ignores instance state by definition, so there is nothing for it
   * to differ from.
   */
  readonly presentIntrinsicSP: number;
}
