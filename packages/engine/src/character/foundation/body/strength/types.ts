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
  ReferenceForm,
} from "../anatomy/types";


/*
 * The physical context one resolution mode sees.
 *
 * Split out from the rest of the input because Base and Resolved will
 * eventually see DIFFERENT contexts — a transformation that doubles a
 * character's Scale for a minute changes the resolved body and not the base
 * one. Until the Body Effect vocabulary exists both Effect sets are empty, so
 * the two contexts are the same body and `resolved` may simply be omitted.
 */
export interface StrengthPhysicalContext {
  readonly morphologyByPartId: Readonly<Record<BodyPartId, BodyMorphology>>;

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
  readonly intrinsicForceModifierByPartId?: Readonly<Record<BodyPartId, number>>;
}


/*
 * Everything Strength resolution needs about a body.
 *
 * `anatomy` is what the character currently has; `referenceForm` is what their
 * form is supposed to have. Both are required, and they are genuinely
 * different inputs — the numerator comes from one and the denominator from the
 * other, which is the entire reason amputation lowers Strength rather than
 * cancelling itself out.
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
export interface ResolvedBodyStrength {
  readonly mode: BodyResolutionMode;

  readonly parts: readonly ResolvedPartStrength[];

  readonly byPartId: Readonly<Record<BodyPartId, ResolvedPartStrength>>;

  readonly totalIntrinsicBodySP: number;

  readonly referenceFormAnatomicalCapacity: number;

  readonly normalizedBodySP: number;

  readonly strengthPosition: number | null;

  readonly displayedStrength: number;
}
