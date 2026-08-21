/*
 * Critical Point resolution.
 *
 * Critical Points are derived from the character's current resolved Anatomy.
 * They are not normally stored as persistent character state.
 *
 * Resolution uses reusable SpecialPointDefinitions:
 *
 * per-part
 * → create one point for every matching BodyPart.
 *
 * shared
 * → create one point spanning all matching BodyParts.
 *
 * body-part-self
 * → create one point for every matching BodyPart, with the BodyPart itself
 *   serving as the special target.
 *
 * This module also exposes the Body-level consequences already defined for
 * special targets:
 *
 * Critical
 * → failure of the associated BP-bearing host is fatal.
 *
 * Semicritical
 * → successful targeting creates an Injury opportunity.
 *
 * Joint
 * → penetrating BP damage is multiplied and successful targeting creates an
 *   Injury opportunity.
 *
 * Combat targeting difficulty and Injury selection are deliberately outside
 * this module.
 */

import type {
  Anatomy,
  BodyPart,
  BodyPartId,
} from "../anatomy/types";
import {
  matchesBodyPartSelector,
} from "../selectors";
import type {
  ResolvedBodyPoints,
} from "../body-points/types";
import type {
  CriticalPointId,
  CriticalPointInstance,
  CriticalPointTypeId,
  ResolvedCriticalPoint,
  ResolvedCriticalPoints,
  ResolvedJointPoint,
  SpecialPointDefinition,
} from "./types";


/*
 * Creates a deterministic instance ID for a point attached to one BodyPart.
 *
 * Examples:
 *
 * brain:head-1
 * shoulder:arm-1
 * elbow:arm-3
 */
function createPerPartPointId(
  definitionId: CriticalPointTypeId,
  partId: BodyPartId,
): CriticalPointId {
  return `${definitionId}:${partId}`;
}


/*
 * Creates a deterministic ID for one shared point spanning several hosts.
 *
 * Host IDs are sorted for ID stability. The resolved hostPartIds themselves
 * retain Anatomy order.
 */
function createSharedPointId(
  definitionId: CriticalPointTypeId,
  hostPartIds: readonly BodyPartId[],
): CriticalPointId {
  const stableHostIds = [
    ...hostPartIds,
  ].sort();

  return (
    `${definitionId}:shared:` +
    stableHostIds.join(",")
  );
}


/*
 * Returns every BodyPart matched by a Special Point placement selector.
 */
function getPlacementMatches(
  anatomy: Anatomy,
  definition: SpecialPointDefinition,
): readonly BodyPart[] {
  return anatomy.parts.filter(
    (part) =>
      matchesBodyPartSelector(
        part,
        definition.placement.selector,
      ),
  );
}


/*
 * Creates one resolved point instance from one definition and one or more
 * concrete host BodyParts.
 */
function createResolvedPoint(
  definition: SpecialPointDefinition,
  id: CriticalPointId,
  hostPartIds: readonly BodyPartId[],
): CriticalPointInstance {
  switch (definition.category) {
    case "critical":
      return {
        id,
        definitionId:
          definition.id,

        category: "critical",

        hostPartIds,

        failureConsequence:
          "death",
      };

    case "semicritical":
      return {
        id,
        definitionId:
          definition.id,

        category:
          "semicritical",

        hostPartIds,

        injuryOpportunity:
          true,
      };

    case "joint":
      return {
        id,
        definitionId:
          definition.id,

        category:
          "joint",

        hostPartIds,

        damageMultiplier:
          definition.damageMultiplier,

        injuryOpportunity:
          true,
      };
  }
}


/*
 * Resolves one reusable SpecialPointDefinition against the current Anatomy.
 *
 * A definition that matches no BodyParts produces no instances.
 *
 * This is intentional. A creature that does not possess anatomy matching a
 * particular definition simply does not possess that special target.
 */
export function resolveSpecialPointDefinition(
  anatomy: Anatomy,
  definition: SpecialPointDefinition,
): readonly CriticalPointInstance[] {
  const matches =
    getPlacementMatches(
      anatomy,
      definition,
    );

  if (matches.length === 0) {
    return [];
  }

  switch (definition.placement.kind) {
    case "per-part":
    case "body-part-self":
      return matches.map(
        (part) =>
          createResolvedPoint(
            definition,
            createPerPartPointId(
              definition.id,
              part.id,
            ),
            [part.id],
          ),
      );

    case "shared": {
      const hostPartIds =
        matches.map(
          (part) => part.id,
        );

      return [
        createResolvedPoint(
          definition,
          createSharedPointId(
            definition.id,
            hostPartIds,
          ),
          hostPartIds,
        ),
      ];
    }
  }
}


/*
 * Resolves every Special Point currently present in the supplied Anatomy.
 *
 * The supplied Anatomy should be the current Resolved Anatomy so temporary
 * anatomical changes automatically create or remove corresponding points.
 *
 * Example:
 *
 * temporary mutation adds:
 *
 * arm-3
 * hand-3
 *
 * Resolution automatically creates:
 *
 * shoulder:arm-3
 * elbow:arm-3
 * wrist:hand-3
 */
export function resolveCriticalPoints(
  anatomy: Anatomy,
  definitions:
    readonly SpecialPointDefinition[],
): ResolvedCriticalPoints {
  const points =
    definitions.flatMap(
      (definition) =>
        resolveSpecialPointDefinition(
          anatomy,
          definition,
        ),
    );

  return {
    points,
  };
}


/*
 * Finds one resolved special target by its instance ID.
 */
export function getCriticalPoint(
  resolved: ResolvedCriticalPoints,
  pointId: CriticalPointId,
): CriticalPointInstance | undefined {
  return resolved.points.find(
    (point) =>
      point.id === pointId,
  );
}


/*
 * Returns the concrete BodyParts hosting one resolved point.
 *
 * Missing host references indicate invalid resolved data and are simply omitted
 * here. critical-points/validation.ts detects them explicitly.
 */
export function getCriticalPointHosts(
  anatomy: Anatomy,
  point: CriticalPointInstance,
): readonly BodyPart[] {
  const partsById =
    new Map(
      anatomy.parts.map(
        (part) => [
          part.id,
          part,
        ],
      ),
    );

  return point.hostPartIds.flatMap(
    (partId) => {
      const part =
        partsById.get(partId);

      return part === undefined
        ? []
        : [part];
    },
  );
}


/*
 * Type guard for lethal Critical Points.
 */
export function isCriticalPoint(
  point: CriticalPointInstance,
): point is ResolvedCriticalPoint {
  return point.category === "critical";
}


/*
 * Type guard for Joint points.
 */
export function isJointPoint(
  point: CriticalPointInstance,
): point is ResolvedJointPoint {
  return point.category === "joint";
}


/*
 * Returns whether a successfully targeted special point creates an Injury
 * opportunity for the GM.
 *
 * Semicritical → yes
 * Joint        → yes
 * Critical     → no inherent Injury opportunity from this system
 *
 * Critical hits may still lead to Injuries through future Injury rules; they
 * simply do not receive the automatic special-target opportunity defined for
 * Semicritical and Joint points.
 */
export function createsInjuryOpportunity(
  point: CriticalPointInstance,
): boolean {
  return (
    point.category ===
      "semicritical" ||
    point.category === "joint"
  );
}


/*
 * Applies a Joint's BP damage multiplier to already-penetrating damage.
 *
 * This function does not calculate defense, soak, armor, Aura, accuracy, or
 * targeting difficulty.
 *
 * Combat first determines penetrating damage.
 * Body then applies the Joint multiplier.
 *
 * Example:
 *
 * penetrating damage = 4
 * Shoulder multiplier = 2
 *
 * BP damage = 8
 */
export function applyJointDamageMultiplier(
  point: ResolvedJointPoint,
  penetratingDamage: number,
): number {
  return (
    penetratingDamage *
    point.damageMultiplier
  );
}


/*
 * Returns the one BP-bearing host of a Critical or Joint point.
 *
 * Current Critical and Joint mechanics require exactly one host:
 *
 * Brain    → Head
 * Heart    → Upper Body
 * Neck     → Neck
 *
 * Shoulder → Arm
 * Elbow    → Arm
 * Wrist    → Hand
 *
 * Hip      → Leg
 * Knee     → Leg
 * Ankle    → Foot
 *
 * Semicritical points may span several hosts, such as Spine.
 *
 * Invalid host counts are rejected by critical-points/validation.ts.
 */
export function getSinglePointHostId(
  point:
    | ResolvedCriticalPoint
    | ResolvedJointPoint,
): BodyPartId {
  const [hostId] =
    point.hostPartIds;

  if (
    hostId === undefined ||
    point.hostPartIds.length !== 1
  ) {
    throw new Error(
      `Special Point "${point.id}" requires exactly one host BodyPart.`,
    );
  }

  return hostId;
}


/*
 * Finds Critical Points whose associated BP-bearing host has reached physical
 * destruction.
 *
 * A Critical Point does NOT cause death from merely taking some damage.
 *
 * Instead:
 *
 * Brain
 * → Head Current BP reaches 0
 * → fatal Critical failure
 *
 * Heart
 * → Upper Body Current BP reaches 0
 * → fatal Critical failure
 *
 * Neck
 * → Neck Current BP reaches 0
 * → fatal Critical failure
 *
 * IMPORTANT:
 *
 * This must be evaluated against the Critical Point set that existed when the
 * damage was applied, BEFORE destroyed BodyParts are permanently removed from
 * Anatomy.
 *
 * Otherwise removing a destroyed Head would also remove the derived Brain
 * point before its fatal failure could be observed.
 */
export function getFatalCriticalFailures(
  criticalPoints:
    ResolvedCriticalPoints,
  bodyPoints:
    ResolvedBodyPoints,
): readonly ResolvedCriticalPoint[] {
  const bpByPartId =
    new Map(
      bodyPoints.parts.map(
        (part) => [
          part.partId,
          part,
        ],
      ),
    );

  return criticalPoints.points
    .filter(isCriticalPoint)
    .filter(
      (point) => {
        const hostId =
          getSinglePointHostId(
            point,
          );

        const hostBP =
          bpByPartId.get(hostId);

        if (hostBP === undefined) {
          return false;
        }

        return hostBP.destroyed;
      },
    );
}