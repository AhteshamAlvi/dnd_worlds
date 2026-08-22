/*
 * Critical Point validation.
 *
 * This module validates:
 *
 * - reusable SpecialPointDefinitions;
 * - category-specific placement requirements;
 * - Joint damage multipliers;
 * - resolved Critical Point instances;
 * - host references against the current resolved Anatomy;
 * - consistency between definitions and resolved instances.
 *
 * Selector syntax itself belongs to body/selectors.ts.
 *
 * Combat targeting difficulty and Injury definitions are outside this module.
 */

import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "../anatomy/types";
import {
  validateBodyPartSelector,
} from "../selectors";
import {
  resolveCriticalPoints,
} from "./resolution";
import type {
  CriticalPointId,
  CriticalPointInstance,
  CriticalPointTypeId,
  ResolvedCriticalPoints,
  SpecialPointDefinition,
} from "./types";


/*
 * Stable machine-readable Critical Point validation categories.
 */
export type CriticalPointValidationIssueCode =
  | "duplicate-definition-id"
  | "invalid-definition-id"
  | "invalid-definition-name"
  | "invalid-definition-description"
  | "invalid-placement-selector"
  | "invalid-critical-placement"
  | "invalid-joint-placement"
  | "invalid-joint-damage-multiplier"
  | "duplicate-point-id"
  | "unknown-definition"
  | "category-mismatch"
  | "missing-host"
  | "duplicate-host"
  | "unknown-host"
  | "invalid-host-count"
  | "invalid-resolved-joint-multiplier"
  | "missing-resolved-point"
  | "unexpected-resolved-point"
  | "resolved-host-mismatch";


/*
 * One Critical Point validation failure.
 */
export interface CriticalPointValidationIssue {
  readonly code:
    CriticalPointValidationIssueCode;

  readonly message: string;

  readonly definitionId?:
    CriticalPointTypeId;

  readonly pointId?:
    CriticalPointId;

  readonly hostPartId?:
    BodyPartId;
}


/*
 * Validation result for Critical Point data.
 */
export interface CriticalPointValidationResult {
  readonly valid: boolean;

  readonly issues:
    readonly CriticalPointValidationIssue[];
}


/*
 * Creates a validation result from collected issues.
 */
function createValidationResult(
  issues:
    readonly CriticalPointValidationIssue[],
): CriticalPointValidationResult {
  return {
    valid: issues.length === 0,
    issues,
  };
}


/*
 * Returns true when an identifier contains usable content.
 */
function isValidIdentifier(
  value: string,
): boolean {
  return value.trim().length > 0;
}


/*
 * Validates one reusable SpecialPointDefinition.
 */
export function validateSpecialPointDefinition(
  definition: SpecialPointDefinition,
): CriticalPointValidationResult {
  const issues:
    CriticalPointValidationIssue[] = [];

  if (
    !isValidIdentifier(
      definition.id,
    )
  ) {
    issues.push({
      code:
        "invalid-definition-id",
      message:
        "Special Point definition id must be a non-empty identifier.",
      definitionId:
        definition.id,
    });
  }

  if (definition.name.trim().length === 0) {
    issues.push({
      code:
        "invalid-definition-name",
      message:
        `Special Point definition "${definition.id}" has an empty display name.`,
      definitionId:
        definition.id,
    });
  }

  if (definition.description.trim().length === 0) {
    issues.push({
      code:
        "invalid-definition-description",
      message:
        `Special Point definition "${definition.id}" needs a description.`,
      definitionId:
        definition.id,
    });
  }

  /*
   * Selector structure is owned by the shared Body selector layer.
   */
  const selectorResult =
    validateBodyPartSelector(
      definition.placement.selector,
    );

  if (!selectorResult.valid) {
    issues.push({
      code:
        "invalid-placement-selector",
      message:
        `Special Point definition "${definition.id}" has an invalid BodyPart selector.`,
      definitionId:
        definition.id,
    });
  }

  switch (definition.category) {
    case "critical": {
      /*
       * Fatal Critical failure is tied to one BP-bearing host.
       *
       * Shared placement would make it ambiguous whether one, some, or all
       * hosts must fail, so it is not supported by the current Critical model.
       */
      if (
        definition.placement.kind ===
        "shared"
      ) {
        issues.push({
          code:
            "invalid-critical-placement",
          message:
            `Critical Point definition "${definition.id}" cannot use shared placement because fatal failure requires one BP-bearing host.`,
          definitionId:
            definition.id,
        });
      }

      break;
    }

    case "semicritical":
      /*
       * Semicritical points may use any placement mode.
       *
       * Spine is the standard shared example.
       */
      break;

    case "joint": {
      /*
       * Every Joint corresponds to one specific physical host instance.
       *
       * Example:
       *
       * shoulder:arm-1
       * elbow:arm-1
       * wrist:hand-1
       */
      if (
        definition.placement.kind !==
        "per-part"
      ) {
        issues.push({
          code:
            "invalid-joint-placement",
          message:
            `Joint definition "${definition.id}" must use per-part placement.`,
          definitionId:
            definition.id,
        });
      }

      if (
        !Number.isFinite(
          definition.damageMultiplier,
        ) ||
        definition.damageMultiplier <= 0
      ) {
        issues.push({
          code:
            "invalid-joint-damage-multiplier",
          message:
            `Joint definition "${definition.id}" must have a finite damage multiplier greater than 0.`,
          definitionId:
            definition.id,
        });
      }

      break;
    }
  }

  return createValidationResult(
    issues,
  );
}


/*
 * Validates the reusable Special Point definition collection.
 */
export function validateSpecialPointDefinitions(
  definitions:
    readonly SpecialPointDefinition[],
): CriticalPointValidationResult {
  const issues:
    CriticalPointValidationIssue[] = [];

  const seenDefinitionIds =
    new Set<CriticalPointTypeId>();

  for (
    const definition of definitions
  ) {
    if (
      seenDefinitionIds.has(
        definition.id,
      )
    ) {
      issues.push({
        code:
          "duplicate-definition-id",
        message:
          `Duplicate Special Point definition id "${definition.id}".`,
        definitionId:
          definition.id,
      });
    } else {
      seenDefinitionIds.add(
        definition.id,
      );
    }

    issues.push(
      ...validateSpecialPointDefinition(
        definition,
      ).issues,
    );
  }

  return createValidationResult(
    issues,
  );
}


/*
 * Validates one resolved Special Point instance.
 */
function validateResolvedPoint(
  point: CriticalPointInstance,
  anatomyPartIds:
    ReadonlySet<BodyPartId>,
  definitionsById:
    ReadonlyMap<
      CriticalPointTypeId,
      SpecialPointDefinition
    >,
): readonly CriticalPointValidationIssue[] {
  const issues:
    CriticalPointValidationIssue[] = [];

  const definition =
    definitionsById.get(
      point.definitionId,
    );

  if (definition === undefined) {
    issues.push({
      code:
        "unknown-definition",
      message:
        `Resolved Special Point "${point.id}" references unknown definition "${point.definitionId}".`,
      pointId:
        point.id,
      definitionId:
        point.definitionId,
    });
  } else if (
    definition.category !==
    point.category
  ) {
    issues.push({
      code:
        "category-mismatch",
      message:
        `Resolved Special Point "${point.id}" has category "${point.category}" but definition "${definition.id}" has category "${definition.category}".`,
      pointId:
        point.id,
      definitionId:
        definition.id,
    });
  }

  if (
    point.hostPartIds.length === 0
  ) {
    issues.push({
      code:
        "missing-host",
      message:
        `Resolved Special Point "${point.id}" must reference at least one host BodyPart.`,
      pointId:
        point.id,
    });
  }

  const seenHosts =
    new Set<BodyPartId>();

  for (
    const hostPartId of
      point.hostPartIds
  ) {
    if (
      seenHosts.has(
        hostPartId,
      )
    ) {
      issues.push({
        code:
          "duplicate-host",
        message:
          `Resolved Special Point "${point.id}" contains duplicate host "${hostPartId}".`,
        pointId:
          point.id,
        hostPartId,
      });
    } else {
      seenHosts.add(
        hostPartId,
      );
    }

    if (
      !anatomyPartIds.has(
        hostPartId,
      )
    ) {
      issues.push({
        code:
          "unknown-host",
        message:
          `Resolved Special Point "${point.id}" references BodyPart "${hostPartId}" that does not exist in the current Anatomy.`,
        pointId:
          point.id,
        hostPartId,
      });
    }
  }

  /*
   * Current Critical and Joint mechanics require exactly one BP-bearing host.
   *
   * Semicritical points may span several hosts.
   */
  if (
    (
      point.category ===
        "critical" ||
      point.category === "joint"
    ) &&
    point.hostPartIds.length !== 1
  ) {
    issues.push({
      code:
        "invalid-host-count",
      message:
        `Resolved ${point.category} point "${point.id}" must reference exactly one host BodyPart.`,
      pointId:
        point.id,
    });
  }

  if (
    point.category === "joint" &&
    (
      !Number.isFinite(
        point.damageMultiplier,
      ) ||
      point.damageMultiplier <= 0
    )
  ) {
    issues.push({
      code:
        "invalid-resolved-joint-multiplier",
      message:
        `Resolved Joint "${point.id}" must have a finite damage multiplier greater than 0.`,
      pointId:
        point.id,
    });
  }

  return issues;
}


/*
 * Compares two host-ID collections without depending on ordering.
 *
 * Shared placements retain Anatomy ordering at runtime, but host identity is
 * what matters for validation.
 */
function haveSameHosts(
  left: readonly BodyPartId[],
  right: readonly BodyPartId[],
): boolean {
  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  const leftSet =
    new Set(left);

  if (
    leftSet.size !==
    left.length
  ) {
    return false;
  }

  return right.every(
    (id) =>
      leftSet.has(id),
  );
}


/*
 * Validates that the supplied resolved points are exactly what the definitions
 * should produce from the current Anatomy.
 *
 * This catches:
 *
 * - missing generated points;
 * - stale points belonging to removed anatomy;
 * - incorrect host assignments.
 */
function validateResolutionConsistency(
  anatomy: Anatomy,
  bodyPartDefinitions:
    readonly BodyPartDefinition[],
  definitions:
    readonly SpecialPointDefinition[],
  resolved:
    ResolvedCriticalPoints,
): readonly CriticalPointValidationIssue[] {
  const issues:
    CriticalPointValidationIssue[] = [];

  const expected =
    resolveCriticalPoints(
      anatomy,
      bodyPartDefinitions,
      definitions,
    );

  const expectedById =
    new Map(
      expected.points.map(
        (point) => [
          point.id,
          point,
        ],
      ),
    );

  const actualById =
    new Map(
      resolved.points.map(
        (point) => [
          point.id,
          point,
        ],
      ),
    );

  for (
    const expectedPoint of
      expected.points
  ) {
    const actualPoint =
      actualById.get(
        expectedPoint.id,
      );

    if (
      actualPoint === undefined
    ) {
      issues.push({
        code:
          "missing-resolved-point",
        message:
          `Expected Special Point "${expectedPoint.id}" is missing from resolved Critical Points.`,
        pointId:
          expectedPoint.id,
        definitionId:
          expectedPoint.definitionId,
      });

      continue;
    }

    if (
      !haveSameHosts(
        expectedPoint.hostPartIds,
        actualPoint.hostPartIds,
      )
    ) {
      issues.push({
        code:
          "resolved-host-mismatch",
        message:
          `Resolved Special Point "${actualPoint.id}" does not reference the hosts produced by its placement rule.`,
        pointId:
          actualPoint.id,
        definitionId:
          actualPoint.definitionId,
      });
    }
  }

  for (
    const actualPoint of
      resolved.points
  ) {
    if (
      !expectedById.has(
        actualPoint.id,
      )
    ) {
      issues.push({
        code:
          "unexpected-resolved-point",
        message:
          `Resolved Special Point "${actualPoint.id}" is not produced by the current Anatomy and definitions.`,
        pointId:
          actualPoint.id,
        definitionId:
          actualPoint.definitionId,
      });
    }
  }

  return issues;
}


/*
 * Validates a complete resolved Critical Point state.
 *
 * This assumes Anatomy itself has already passed anatomy/validation.ts.
 */
export function validateResolvedCriticalPoints(
  anatomy: Anatomy,
  bodyPartDefinitions:
    readonly BodyPartDefinition[],
  definitions:
    readonly SpecialPointDefinition[],
  resolved:
    ResolvedCriticalPoints,
): CriticalPointValidationResult {
  const issues:
    CriticalPointValidationIssue[] = [];

  const definitionsById =
    new Map<
      CriticalPointTypeId,
      SpecialPointDefinition
    >(
      definitions.map(
        (definition) => [
          definition.id,
          definition,
        ],
      ),
    );

  const anatomyPartIds =
    new Set<BodyPartId>(
      anatomy.parts.map(
        (part) => part.id,
      ),
    );

  const seenPointIds =
    new Set<CriticalPointId>();

  for (
    const point of resolved.points
  ) {
    if (
      seenPointIds.has(
        point.id,
      )
    ) {
      issues.push({
        code:
          "duplicate-point-id",
        message:
          `Duplicate resolved Special Point id "${point.id}".`,
        pointId:
          point.id,
      });
    } else {
      seenPointIds.add(
        point.id,
      );
    }

    issues.push(
      ...validateResolvedPoint(
        point,
        anatomyPartIds,
        definitionsById,
      ),
    );
  }

  issues.push(
    ...validateResolutionConsistency(
      anatomy,
      bodyPartDefinitions,
      definitions,
      resolved,
    ),
  );

  return createValidationResult(
    issues,
  );
}


/*
 * Convenience validator for the complete Critical Point data required by the
 * Body domain.
 *
 * It validates:
 *
 * 1. reusable definitions;
 * 2. resolved instances;
 * 3. consistency between definitions, Anatomy, and resolved instances.
 */
export function validateCriticalPointData(
  anatomy: Anatomy,
  bodyPartDefinitions:
    readonly BodyPartDefinition[],
  definitions:
    readonly SpecialPointDefinition[],
  resolved:
    ResolvedCriticalPoints,
): CriticalPointValidationResult {
  const definitionResult =
    validateSpecialPointDefinitions(
      definitions,
    );

  const resolvedResult =
    validateResolvedCriticalPoints(
      anatomy,
      bodyPartDefinitions,
      definitions,
      resolved,
    );

  return createValidationResult([
    ...definitionResult.issues,
    ...resolvedResult.issues,
  ]);
}