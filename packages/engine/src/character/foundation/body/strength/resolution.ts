/*
 * Resolving a body's Strength.
 *
 *   MuscularityForceFactor = 2^((Muscularity - 1) x MuscularityForceSensitivity)
 *
 *   IntrinsicMaxSP = StructuralCapacity
 *                  x MuscularityForceFactor
 *                  x intrinsicPhysicalForce
 *                  x intrinsic force modifiers
 *
 *   TotalIntrinsicBodySP = sum of IntrinsicMaxSP
 *
 * The force factor is EXPONENTIAL where the structural factor is linear, and
 * that gap is the whole reason the two are separate fields.
 *
 * Strength doubles per displayed point, by definition. Structural Capacity
 * responds to Muscularity only linearly, because muscle is real tissue and a
 * body cannot double its cross-section per Strength point without becoming
 * absurd. Route Strength through the structural response alone and reaching
 * STR 14 demands a Muscularity that makes a Human weigh several tonnes — the
 * density blowup that killed an earlier version of this model.
 *
 * Splitting them fixes it honestly rather than by fudging a constant: a
 * muscular body is somewhat larger and much more capable, which is roughly
 * what training actually does. Structure grows linearly, force grows
 * exponentially, and Mass follows structure rather than force.
 *
 * At neutral Muscularity both factors are 1, so a neutral Human's Intrinsic
 * Max SP equals its reference Structural Capacity exactly — 100. The whole
 * calibration rests on that identity.
 *
 * Damage does not appear here. Ordinary damage lowers how much of a part's
 * force is CURRENTLY usable, which is a separate quantity; it does not lower
 * the part's intrinsic capability. Only actually leaving the body does that,
 * and only in resolved mode.
 */

import { createBodyPartDefinitionMap } from "../selectors";
import { resolvePartStructuralCapacity } from "../structure/resolution";
import { NEUTRAL_MORPHOLOGY } from "../types";
import {
  resolveDisplayedStrength,
  resolveNormalizedBodySP,
  resolveReferenceFormAnatomicalCapacity,
  resolveStrengthPosition,
} from "./normalization";
import type { BodyMorphology } from "../types";
import type { BodyResolutionOptions } from "../resolution-mode";
import type {
  BodyPartDefinition,
  BodyPartId,
  BodyPartMorphologySensitivity,
  BodyPartTypeId,
} from "../anatomy/types";
import type {
  ResolvedBodyStrength,
  ResolvedPartStrength,
  StrengthPhysicalContext,
  StrengthResolutionInput,
} from "./types";


/*
 * How much more force Muscularity lets this part produce.
 *
 *   2^((Muscularity - 1) x MuscularityForceSensitivity)
 *
 * Strictly positive for every finite input, which is why this sensitivity
 * needs only to be non-negative while the structural one must stay within
 * [0, 1]: this expression cannot cross zero, and that one can.
 */
export function resolveMuscularityForceFactor(
  morphology: BodyMorphology,
  sensitivity: BodyPartMorphologySensitivity,
): number {
  return 2 ** ((morphology.muscularity - 1) * sensitivity.muscularityForce);
}


/*
 * Resolves one BodyPart's intrinsic maximum Strength Points.
 *
 * `intrinsicPhysicalForce` is the authored baseline: 1 for an ordinary
 * force-producing part, 0 for real structure that generates none of its own.
 * Multiplying by it is the entire mechanism by which inert anatomy is excluded
 * from Strength — no flag, no filter, just arithmetic that lands on zero.
 */
export function resolvePartIntrinsicMaxSP(
  partId: BodyPartId,
  definition: BodyPartDefinition,
  morphology: BodyMorphology,
  effectiveScale: number,
  intrinsicForceModifier: number,
): ResolvedPartStrength {
  const { structuralCapacity } = resolvePartStructuralCapacity(
    partId,
    definition.reference.structuralCapacity,
    definition.sensitivity,
    morphology,
    effectiveScale,
  );

  const muscularityForceFactor = resolveMuscularityForceFactor(
    morphology,
    definition.sensitivity,
  );

  const intrinsicPhysicalForce = definition.reference.intrinsicPhysicalForce;

  return {
    partId,

    structuralCapacity,
    muscularityForceFactor,
    intrinsicPhysicalForce,

    intrinsicMaxSP:
      structuralCapacity *
      muscularityForceFactor *
      intrinsicPhysicalForce *
      intrinsicForceModifier,
  };
}


/*
 * The (partId, type) pairs that participate in the numerator, per mode.
 *
 * This one function is the entire behavioural difference between Base and
 * Resolved, which is deliberate — it keeps the promise that there is one
 * algorithm with mode-selected sources rather than two implementations that
 * will eventually disagree.
 *
 * Base mode walks the intact Base Reference Form and treats every part of it
 * as present, ignoring instance state, damage, suppression and temporary
 * transformation alike. Permanent Strength advancement is priced against this,
 * so that losing an arm never makes the next point of Strength cheaper or
 * dearer.
 *
 * Resolved mode walks the anatomy the character actually has, and honours
 * state: suppressed and archived-removed parts contribute nothing.
 */
function participatingParts(
  input: StrengthResolutionInput,
  mode: BodyResolutionOptions["mode"],
): readonly { readonly id: BodyPartId; readonly type: BodyPartTypeId }[] {
  if (mode === "base") {
    return input.referenceForm.parts.map((part) => ({
      id: part.id,
      type: part.type,
    }));
  }

  return input.anatomy.parts
    .filter((part) => part.state === "active")
    .map((part) => ({ id: part.id, type: part.type }));
}


/*
 * Resolves a body's Strength in one mode.
 *
 * The denominator is the same in both modes on purpose. It describes what the
 * form is supposed to contain, and damage does not answer that question.
 */
export function resolveBodyStrength(
  input: StrengthResolutionInput,
  options: BodyResolutionOptions,
): ResolvedBodyStrength {
  const definitionsById = createBodyPartDefinitionMap(input.definitions);

  const context: StrengthPhysicalContext =
    options.mode === "base"
      ? input.base
      : input.resolved ?? input.base;

  const parts: ResolvedPartStrength[] = [];
  const byPartId: Record<BodyPartId, ResolvedPartStrength> = {};

  for (const participant of participatingParts(input, options.mode)) {
    const definition = definitionsById.get(participant.type);

    /*
     * Same convention as the other physical resolvers: anatomy and Reference
     * Form are assumed validated, so an unknown type is an invalid engine
     * state rather than an input to tolerate.
     */
    if (definition === undefined) {
      throw new Error(
        `Cannot resolve Strength for BodyPart "${participant.id}": ` +
        `unknown BodyPartDefinition "${participant.type}".`,
      );
    }

    const resolved = resolvePartIntrinsicMaxSP(
      participant.id,
      definition,
      context.morphologyByPartId[participant.id] ?? NEUTRAL_MORPHOLOGY,
      context.effectiveScale,
      context.intrinsicForceModifierByPartId?.[participant.id] ?? 1,
    );

    parts.push(resolved);
    byPartId[participant.id] = resolved;
  }

  const totalIntrinsicBodySP = parts.reduce(
    (total, part) => total + part.intrinsicMaxSP,
    0,
  );

  const referenceFormAnatomicalCapacity =
    resolveReferenceFormAnatomicalCapacity(
      input.referenceForm,
      input.definitions,
    );

  const normalizedBodySP = resolveNormalizedBodySP(
    totalIntrinsicBodySP,
    referenceFormAnatomicalCapacity,
  );

  const strengthPosition = resolveStrengthPosition(normalizedBodySP);

  return {
    mode: options.mode,

    parts,
    byPartId,

    totalIntrinsicBodySP,
    referenceFormAnatomicalCapacity,
    normalizedBodySP,
    strengthPosition,

    displayedStrength: resolveDisplayedStrength(strengthPosition),
  };
}
