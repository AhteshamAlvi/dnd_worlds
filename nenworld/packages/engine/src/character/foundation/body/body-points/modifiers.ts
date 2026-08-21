/*
 * Body Point modifier resolution.
 *
 * BP modifiers are data-driven effects applied to selected BodyPart instances.
 *
 * There are currently two modifier stages:
 *
 * adjust-base-bp
 * → additive adjustment applied after morphology and before Constitution.
 *
 * multiply-bp
 * → true multiplier applied after Constitution.
 *
 * This module determines which modifiers apply to a BodyPart and collapses
 * them into their resolved additive and multiplicative values.
 *
 * Morphology, Constitution scaling, final BP calculation, rounding, damage,
 * and destruction are handled elsewhere.
 */

import type {
  BodyPart,
  BodyPartId,
} from "../anatomy/types";
import {
  matchesBodyPartSelector,
} from "../selectors";
import type {
  BodyPointModifier,
  ResolvedBodyPointModifiers,
} from "./types";


/*
 * Neutral resolved BP modifiers.
 *
 * Adding 0 changes nothing.
 * Multiplying by 1 changes nothing.
 */
export const NEUTRAL_BODY_POINT_MODIFIERS:
  ResolvedBodyPointModifiers = {
    additiveBaseBP: 0,
    multiplier: 1,
  };


/*
 * Returns true when one BodyPointModifier applies to the supplied BodyPart.
 *
 * Selector behavior is owned centrally by body/selectors.ts.
 */
export function bodyPointModifierAppliesToPart(
  modifier: BodyPointModifier,
  part: BodyPart,
): boolean {
  return matchesBodyPartSelector(
    part,
    modifier.selector,
  );
}


/*
 * Returns every BP modifier that applies to one BodyPart.
 *
 * Modifier order is preserved for diagnostics and tracing even though the
 * current additive and multiplicative stages are mathematically order
 * independent within their respective stages.
 */
export function getApplicableBodyPointModifiers(
  part: BodyPart,
  modifiers: readonly BodyPointModifier[],
): readonly BodyPointModifier[] {
  return modifiers.filter(
    (modifier) =>
      bodyPointModifierAppliesToPart(
        modifier,
        part,
      ),
  );
}


/*
 * Resolves a collection of already-applicable BP modifiers.
 *
 * adjust-base-bp operations are summed.
 *
 * multiply-bp operations are multiplied.
 *
 * Example:
 *
 * +4 Base BP
 * +2 Base BP
 * ×1.5 BP
 * ×2 BP
 *
 * resolves to:
 *
 * additiveBaseBP = 6
 * multiplier     = 3
 *
 * The stages themselves remain separate because additive Base BP must be
 * applied before Constitution while true multipliers apply afterward.
 */
export function combineBodyPointModifiers(
  modifiers: readonly BodyPointModifier[],
): ResolvedBodyPointModifiers {
  let additiveBaseBP = 0;
  let multiplier = 1;

  for (const modifier of modifiers) {
    switch (modifier.operation.kind) {
      case "adjust-base-bp":
        additiveBaseBP +=
          modifier.operation.amount;
        break;

      case "multiply-bp":
        multiplier *=
          modifier.operation.multiplier;
        break;
    }
  }

  return {
    additiveBaseBP,
    multiplier,
  };
}


/*
 * Resolves all BP modifiers applicable to one BodyPart.
 *
 * With no matching modifiers, the neutral result is:
 *
 * additiveBaseBP = 0
 * multiplier     = 1
 */
export function resolveBodyPointModifiers(
  part: BodyPart,
  modifiers: readonly BodyPointModifier[],
): ResolvedBodyPointModifiers {
  return combineBodyPointModifiers(
    getApplicableBodyPointModifiers(
      part,
      modifiers,
    ),
  );
}


/*
 * Resolves BP modifiers for several BodyParts at once.
 *
 * The returned map is keyed by BodyPartId so callers can efficiently combine
 * modifier results with morphology and BP resolution.
 */
export function resolveBodyPointModifiersByPart(
  parts: readonly BodyPart[],
  modifiers: readonly BodyPointModifier[],
): ReadonlyMap<
  BodyPartId,
  ResolvedBodyPointModifiers
> {
  return new Map(
    parts.map(
      (part) => [
        part.id,
        resolveBodyPointModifiers(
          part,
          modifiers,
        ),
      ],
    ),
  );
}