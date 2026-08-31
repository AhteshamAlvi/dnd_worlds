/*
 * Resolving Anatomical Points and evaluating what a hit did to one.
 *
 * Two halves. The first derives point instances from current Anatomy, which is
 * bookkeeping. The second is the part that decides outcomes, and it has one
 * rule worth stating plainly: the four categories are evaluated INDEPENDENTLY
 * against the same final damage number. Nothing here is an else-branch of
 * anything else. A Human Neck hit for one point of damage destroys its
 * Critical structure, fails its Joint, and reaches Fatal, all at once, because
 * all three thresholds are 1 on a 2-BP part.
 */

import { getBodyPartChildren } from "../anatomy/resolution";
import {
  createBodyPartDefinitionMap,
  matchesBodyPartSelector,
  selectBodyParts,
} from "../selectors";
import {
  CRITICAL_TIER_FRACTIONS,
  FATAL_FRACTION,
  JOINT_FAILURE_FRACTION,
  WEAK_DAMAGE_MULTIPLIER,
} from "./types";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "../anatomy/types";
import type {
  AnatomicalPointCategory,
  CriticalOutcome,
  CriticalPointId,
  CriticalPointInstance,
  ResolvedCriticalPoints,
  SpecialPointDefinition,
} from "./types";


/* -------------------------------------------------------------------------- */
/* Deriving instances from anatomy                                            */
/* -------------------------------------------------------------------------- */

export function createPointId(
  definitionId: string,
  hostPartId: BodyPartId,
): CriticalPointId {
  return `${definitionId}:${hostPartId}`;
}


/*
 * Which BodyPart a Joint governs.
 *
 * Returns undefined when the designation matches nothing — a Wrist on an Arm
 * whose Hand has been severed designates nothing, and a Joint with no
 * designated part has no threshold to fail against.
 */
function resolveJointDesignation(
  anatomy: Anatomy,
  bodyPartDefinitions: readonly BodyPartDefinition[],
  definition: SpecialPointDefinition,
  hostPartId: BodyPartId,
): BodyPartId | undefined {
  const designation = definition.jointDesignation;

  if (designation === undefined) return undefined;

  if (designation.kind === "self" || designation.kind === "host") {
    return hostPartId;
  }

  const definitionsById = createBodyPartDefinitionMap(bodyPartDefinitions);

  for (const child of getBodyPartChildren(anatomy, hostPartId)) {
    const childDefinition = definitionsById.get(child.type);

    if (childDefinition === undefined) continue;

    if (
      matchesBodyPartSelector(child, childDefinition, designation.selector)
    ) {
      return child.id;
    }
  }

  return undefined;
}


/*
 * Resolves one definition against the current Anatomy.
 *
 * A definition matching no BodyParts produces no instances, which is the right
 * answer rather than an error: a creature without Arms does not have Shoulders.
 */
export function resolveSpecialPointDefinition(
  anatomy: Anatomy,
  bodyPartDefinitions: readonly BodyPartDefinition[],
  definition: SpecialPointDefinition,
): readonly CriticalPointInstance[] {
  const matches = selectBodyParts(
    anatomy,
    bodyPartDefinitions,
    definition.placement.selector,
  );

  return matches.map((part) => {
    const designatedPartId = resolveJointDesignation(
      anatomy,
      bodyPartDefinitions,
      definition,
      part.id,
    );

    return {
      id: createPointId(definition.id, part.id),
      definitionId: definition.id,
      categories: definition.categories,
      hostPartId: part.id,
      ...(designatedPartId !== undefined ? { designatedPartId } : {}),
      weakMultiplier: definition.weakMultiplier ?? WEAK_DAMAGE_MULTIPLIER,
    };
  });
}


/*
 * Resolves every Anatomical Point present in the supplied Anatomy.
 *
 * Pass the current RESOLVED Anatomy so temporary anatomy participates: a
 * transformation adding arm-3 gains a Shoulder, an Elbow and a Wrist for it,
 * and loses them again when it ends.
 */
export function resolveCriticalPoints(
  anatomy: Anatomy,
  bodyPartDefinitions: readonly BodyPartDefinition[],
  definitions: readonly SpecialPointDefinition[],
): ResolvedCriticalPoints {
  const points = definitions.flatMap((definition) =>
    resolveSpecialPointDefinition(anatomy, bodyPartDefinitions, definition),
  );

  const byId: Record<CriticalPointId, CriticalPointInstance> = {};

  for (const point of points) {
    byId[point.id] = point;
  }

  return { points, byId };
}


export function getCriticalPoint(
  points: ResolvedCriticalPoints,
  pointId: CriticalPointId,
): CriticalPointInstance | undefined {
  return points.byId[pointId];
}


export function hasCategory(
  point: CriticalPointInstance,
  category: AnatomicalPointCategory,
): boolean {
  return point.categories.includes(category);
}


/* -------------------------------------------------------------------------- */
/* Evaluating a hit                                                           */
/* -------------------------------------------------------------------------- */

/*
 * Thresholds always round UP.
 *
 * A threshold is a MINIMUM REQUIRED amount of damage, so rounding it down
 * would silently make every point easier to break than its percentage says.
 * ceil is not a rounding preference here; it is what "at least" means.
 */
export function resolveThreshold(
  maximumBP: number,
  fraction: number,
): number {
  return Math.ceil(maximumBP * fraction);
}


/*
 * The Weak multiplier, applied to post-mitigation damage BEFORE rounding.
 *
 * Order matters and is fixed: multiply, then round, then apply, then compare
 * against thresholds. Rounding first would let 3 x 1.5 and 3.4 x 1.5 land on
 * different sides of a threshold for no reason a player could follow.
 */
export function applyWeakMultiplier(
  point: CriticalPointInstance,
  postMitigationDamage: number,
): number {
  return hasCategory(point, "weak")
    ? postMitigationDamage * point.weakMultiplier
    : postMitigationDamage;
}


/*
 * Evaluates the Critical tiers against one hit.
 *
 * Only the highest tier reached applies. On small anatomy several tiers
 * collapse onto the same integer — a 4-BP Lower Body needs 2 for both the 30%
 * and 50% tiers — and that is intended rather than a rounding artefact: a part
 * with little structure has little room between "hurt" and "ruined".
 */
export function evaluateCritical(
  point: CriticalPointInstance,
  containingMaximumBP: number,
  finalDamage: number,
): CriticalOutcome {
  const thresholds = {
    minor: resolveThreshold(containingMaximumBP, CRITICAL_TIER_FRACTIONS.minor),
    major: resolveThreshold(containingMaximumBP, CRITICAL_TIER_FRACTIONS.major),
    destruction: resolveThreshold(
      containingMaximumBP,
      CRITICAL_TIER_FRACTIONS.destruction,
    ),
  };

  if (!hasCategory(point, "critical")) {
    return {
      tier: "none",
      injuryChance: "none",
      destroyed: false,
      thresholds,
    };
  }

  if (finalDamage >= thresholds.destruction) {
    return {
      tier: "destruction",
      injuryChance: "guaranteed",
      destroyed: true,
      thresholds,
    };
  }

  if (finalDamage >= thresholds.major) {
    return {
      tier: "major",
      injuryChance: "one-half",
      destroyed: false,
      thresholds,
    };
  }

  if (finalDamage >= thresholds.minor) {
    return {
      tier: "minor",
      injuryChance: "one-third",
      destroyed: false,
      thresholds,
    };
  }

  return { tier: "none", injuryChance: "none", destroyed: false, thresholds };
}


/*
 * Whether a hit reached the Fatal threshold.
 *
 * Half the containing BodyPart's Maximum BP, which makes targeted attacks far
 * deadlier than attrition and is meant to: a Brain hit for 4 kills a character
 * whose Head still has 4 of its 8 BP left. Destroying a brain is death, and it
 * should not require destroying the skull around it first.
 */
export function evaluateFatal(
  point: CriticalPointInstance,
  containingMaximumBP: number,
  finalDamage: number,
): { readonly fatal: boolean; readonly threshold: number } {
  const threshold = resolveThreshold(containingMaximumBP, FATAL_FRACTION);

  return {
    fatal: hasCategory(point, "fatal") && finalDamage >= threshold,
    threshold,
  };
}


/*
 * Whether a hit failed a Joint, measured against the DESIGNATED part.
 *
 * Not the host. A Wrist is hosted by the Arm and designates the Hand, so its
 * threshold is 30% of the Hand's 4 Maximum BP — 2 — rather than 30% of the
 * Arm's 14. Reading the threshold off the host would make small extremities
 * absurdly durable when reached through a large limb.
 */
export function evaluateJoint(
  point: CriticalPointInstance,
  designatedMaximumBP: number,
  finalDamage: number,
): { readonly failed: boolean; readonly threshold: number } {
  const threshold = resolveThreshold(
    designatedMaximumBP,
    JOINT_FAILURE_FRACTION,
  );

  return {
    failed: hasCategory(point, "joint") && finalDamage >= threshold,
    threshold,
  };
}
