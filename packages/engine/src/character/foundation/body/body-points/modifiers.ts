/*
 * Body Point modifier resolution.
 *
 * BP modifiers are data-driven effects applied to selected BodyPart instances.
 *
 * There is exactly one modifier operation — a destruction-resistance
 * multiplier — and this module only decides which modifiers reach which
 * BodyPart and multiplies them together.
 *
 * Structural Capacity, build, Constitution scaling, rounding, damage, and
 * destruction are all handled elsewhere.
 */

import type {
  BodyPart,
  BodyPartDefinition,
  BodyPartId,
} from "../anatomy/types";
import {
  createBodyPartDefinitionMap,
  matchesBodyPartSelector,
} from "../selectors";
import type {
  BodyPointModifier,
  ResolvedBodyPointModifiers,
} from "./types";


/*
 * Neutral resolved BP modifiers. Multiplying by 1 changes nothing.
 */
export const NEUTRAL_BODY_POINT_MODIFIERS:
  ResolvedBodyPointModifiers = {
    destructionResistance: 1,
  };


/*
 * Returns true when one BodyPointModifier applies to the supplied BodyPart.
 *
 * `definition` supplies the tag classification a selector may depend on —
 * see body/selectors.ts for why tags live there rather than on BodyPart.
 *
 * Selector behavior is owned centrally by body/selectors.ts.
 */
export function bodyPointModifierAppliesToPart(
  modifier: BodyPointModifier,
  part: BodyPart,
  definition: BodyPartDefinition,
): boolean {
  return matchesBodyPartSelector(
    part,
    definition,
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
  definition: BodyPartDefinition,
  modifiers: readonly BodyPointModifier[],
): readonly BodyPointModifier[] {
  return modifiers.filter(
    (modifier) =>
      bodyPointModifierAppliesToPart(
        modifier,
        part,
        definition,
      ),
  );
}


/*
 * Resolves a collection of already-applicable BP modifiers.
 *
 * Destruction resistances multiply, so x1.5 stone skin and x2 hardening make
 * a part three times as hard to destroy. There is only one stage now, which
 * is why there is nothing to say about ordering.
 */
export function combineBodyPointModifiers(
  modifiers: readonly BodyPointModifier[],
): ResolvedBodyPointModifiers {
  let destructionResistance = 1;

  for (const modifier of modifiers) {
    destructionResistance *= modifier.operation.multiplier;
  }

  return { destructionResistance };
}


/*
 * Resolves all BP modifiers applicable to one BodyPart.
 *
 * With no matching modifiers the neutral result is a resistance of 1.
 */
export function resolveBodyPointModifiers(
  part: BodyPart,
  definition: BodyPartDefinition,
  modifiers: readonly BodyPointModifier[],
): ResolvedBodyPointModifiers {
  return combineBodyPointModifiers(
    getApplicableBodyPointModifiers(
      part,
      definition,
      modifiers,
    ),
  );
}


/*
 * Resolves BP modifiers for several BodyParts at once.
 *
 * The returned map is keyed by BodyPartId so callers can efficiently combine
 * modifier results with morphology and BP resolution.
 *
 * The function assumes Anatomy and BodyPartDefinitions have already passed
 * validation. An unknown BodyPart type therefore represents an invalid engine
 * state and causes an error rather than silently skipping the part.
 */
export function resolveBodyPointModifiersByPart(
  parts: readonly BodyPart[],
  definitions: readonly BodyPartDefinition[],
  modifiers: readonly BodyPointModifier[],
): ReadonlyMap<
  BodyPartId,
  ResolvedBodyPointModifiers
> {
  const definitionsByType =
    createBodyPartDefinitionMap(
      definitions,
    );

  return new Map(
    parts.map(
      (part) => {
        const definition =
          definitionsByType.get(
            part.type,
          );

        if (definition === undefined) {
          throw new Error(
            `Cannot resolve BP modifiers for BodyPart "${part.id}": ` +
            `unknown BodyPartDefinition "${part.type}".`,
          );
        }

        return [
          part.id,
          resolveBodyPointModifiers(
            part,
            definition,
            modifiers,
          ),
        ] as const;
      },
    ),
  );
}