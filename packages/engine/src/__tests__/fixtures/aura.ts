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
import { withPassiveNen } from "../../character/nen/access";
import type { CharacterStats } from "../../character/foundation/attributes/stats";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "../../character/foundation/body/anatomy/types";
import type { BodyMorphology } from "../../character/foundation/body/types";
import type {
  AuraAccessInput,
  AuraAccessOverride,
} from "../../character/foundation/aura/types";
import type { AuraTransitionContext } from "../../character/foundation/aura/budget";
import type { DifferentialAuraAllocation } from "../../character/foundation/aura/state";
import type { AuraPlacement } from "../../character/foundation/aura/types";
import type { ContinuityKey } from "../../character/foundation/body/anatomy/types";

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

/*
 * The ordinary unawakened state: a real pool, no deliberate access.
 *
 * Built through the same projection production uses, so the pseudo-Chū
 * efficiency in these suites is Chū's own rather than a literal that would
 * keep agreeing with it until the day it changed.
 */
export const UNAWAKENED: AuraAccessInput = withPassiveNen({
  awakened: false,
  effectiveTenMastery: 0,
});

/** Awakened and reverted: half-open nodes, and no pseudo-Chū ever again. */
export const REVERTED: AuraAccessInput = withPassiveNen({
  awakened: false,
  previouslyAwakened: true,
  effectiveTenMastery: 0,
});

/** Awakened with nothing contained yet. */
export const UNCONTAINED: AuraAccessInput = withPassiveNen({
  awakened: true,
  effectiveTenMastery: 0,
});

/*
 * Awakened with Ten learned, which is Ten running.
 *
 * Built through the same projection production uses, because Ten's coating is
 * Ten's arithmetic and a literal here would be a third copy of it — one that
 * would keep agreeing with the resolver right up until the formula changed.
 *
 * Ten I: the 10% coating, and a residual leak of 2R an hour.
 */
export const WITH_TEN: AuraAccessInput = withPassiveNen({
  awakened: true,
  effectiveTenMastery: 1,
});

/*
 * Awakened with PERFECT containment: Ten X, the same coating, and no residual
 * leak at all.
 *
 * For suites about the solver, budgets or upkeep, where the pool should move
 * only by the thing under test. Ten I's 2R-an-hour residual is real and is
 * tested where Ten is the subject.
 */
export const WITH_PERFECT_TEN: AuraAccessInput = withPassiveNen({
  awakened: true,
  effectiveTenMastery: 10,
});

/** Awakened with Ten at a chosen rank, and optionally a chosen override. */
export function withTen(
  effectiveTenMastery: number,
  override?: AuraAccessOverride,
): AuraAccessInput {
  return withPassiveNen({
    awakened: true,
    effectiveTenMastery,
    ...(override === undefined ? {} : { override }),
  });
}

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


/*
 * An AUTHORIZED concentration, which is the only route to uneven Aura.
 *
 * A helper rather than a literal in five suites, because the authorization is
 * three bindings that must each match the allocation they are attached to —
 * and a test that got one wrong would be testing the refusal path while
 * appearing to test the success path. Building it from the allocation's own id
 * and source makes the matching case the easy one to write, and leaves the
 * mismatched cases to be written deliberately.
 *
 * `localized` coverage used to make a one-part placement free of all this.
 * Selecting a single identity is the most concentrated placement there is, so
 * it now comes through here like every other one.
 */
export const AURA_TEST_OWNER = "aura:test-subject";

export function concentratedAura(input: {
  readonly id: string;
  readonly placement: AuraPlacement;
  readonly aura: number;

  /** One entry is a single-part placement; several are a weighted spread. */
  readonly weights: readonly { readonly continuityKey: ContinuityKey; readonly weight: number }[];

  readonly source?: string;
  readonly owner?: string;
  readonly grantedBy?: string;
  readonly priority?: number;
}): DifferentialAuraAllocation {
  const source = input.source ?? `test:${input.id}`;

  return {
    id: input.id,
    coverage: "differential",
    placement: input.placement,
    aura: input.aura,
    weights: input.weights,
    source,
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    authorization: {
      allocationId: input.id,
      source,
      owner: input.owner ?? AURA_TEST_OWNER,
      grantedBy: input.grantedBy ?? "test:granting-mechanic",
    },
  };
}


/** The commonest case: everything on one identity. */
export function auraOnOnePart(input: {
  readonly id: string;
  readonly placement: AuraPlacement;
  readonly continuityKey: ContinuityKey;
  readonly aura: number;
  readonly source?: string;
  readonly owner?: string;
  readonly priority?: number;
}): DifferentialAuraAllocation {
  const { continuityKey: key, ...rest } = input;

  return concentratedAura({ ...rest, weights: [{ continuityKey: key, weight: 1 }] });
}
