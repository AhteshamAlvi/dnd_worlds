/*
 * A real body to place Aura on, without four suites building one each.
 *
 * Aura density is not a number that can be asserted against a placeholder:
 * internal Aura divides by litres of Volume and surface Aura by square metres
 * of skin, so every one of these tests needs the actual Human Standard
 * anatomy, resolved through the actual measurement pipeline. Three suites had
 * already grown their own copy of this before a fourth was needed.
 *
 * Working numbers, standard human at Scale 1:
 *
 *   whole body   60.00 L    16,900 cm2  (1.69 m2)
 *   one Arm       2.37 L     1,183 cm2  (0.1183 m2)
 */

import { BODY_PART_DEFINITIONS } from "../../character/foundation/body/anatomy/body-parts";
import { STANDARD_HUMANOID_ANATOMY } from "../../character/foundation/body/anatomy/standard-humanoid";
import { resolveBodyMeasurements } from "../../character/foundation/body/measurements/resolution";
import {
  morphologyTargetsForAnatomy,
  resolveMorphology,
} from "../../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../../character/foundation/body/types";
import type { CharacterStats } from "../../character/foundation/attributes/stats";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "../../character/foundation/body/anatomy/types";
import type { BodyMorphology } from "../../character/foundation/body/types";
import type { AuraAccessInput } from "../../character/foundation/aura/types";
import type { AuraTransitionContext } from "../../character/foundation/aura/budget";

export const AURA_BODY_DEFINITIONS = Object.values(
  BODY_PART_DEFINITIONS,
) as readonly BodyPartDefinition[];

const NEUTRAL_SOURCE = { global: NEUTRAL_MORPHOLOGY, local: {} };

export function auraTestMorphology(
  anatomy: Anatomy,
): Readonly<Record<BodyPartId, BodyMorphology>> {
  return resolveMorphology(
    {
      species: NEUTRAL_SOURCE,
      age: NEUTRAL_SOURCE,
      character: NEUTRAL_SOURCE,
      individual: {},
      strengthDevelopmentMuscularity: 1,
      effectLayers: [],
    },
    morphologyTargetsForAnatomy(anatomy),
  );
}

export function auraTestMeasurements(
  anatomy: Anatomy = STANDARD_HUMANOID_ANATOMY,
  effectiveScale = 1,
) {
  return resolveBodyMeasurements(
    anatomy,
    AURA_BODY_DEFINITIONS,
    auraTestMorphology(anatomy),
    effectiveScale,
  );
}

/*
 * All-10 except the scores the case under test actually depends on.
 *
 * A CharacterStats rather than bare Attributes, because that is what the Aura
 * domain takes: STR is derived from the body, and Stamina — round((CON + VIT)
 * / 2) — is read off the same physically-resolved block Control reads DEX from.
 */
export function auraTestAttributes(
  overrides: Partial<CharacterStats> = {},
): CharacterStats {
  return {
    str: 10,
    agi: 10, dex: 10, con: 10, vit: 10,
    int: 10, wis: 10, per: 10, spi: 10, cha: 10,
    ...overrides,
  };
}

/** The ordinary unawakened state: a real pool, no deliberate access. */
export const UNAWAKENED: AuraAccessInput = {
  awakened: false,
  effectiveTenMastery: 0,
};

/** Awakened with nothing contained yet. */
export const UNCONTAINED: AuraAccessInput = {
  awakened: true,
  effectiveTenMastery: 0,
};

/** Awakened with Ten learned, which is Ten running. */
export const WITH_TEN: AuraAccessInput = {
  awakened: true,
  effectiveTenMastery: 1,
};

export interface AuraContextOptions {
  readonly attributes?: Partial<CharacterStats>;
  readonly access?: AuraAccessInput;
  readonly anatomy?: Anatomy;
  readonly effectiveScale?: number;
}

export function auraContext(
  options: AuraContextOptions = {},
): AuraTransitionContext {
  const anatomy = options.anatomy ?? STANDARD_HUMANOID_ANATOMY;

  return {
    attributes: auraTestAttributes(options.attributes),
    anatomy,
    bodyMeasurements: auraTestMeasurements(
      anatomy,
      options.effectiveScale ?? 1,
    ),
    access: options.access ?? UNAWAKENED,
  };
}
