/*
 * Anatomical Point validation.
 *
 * Two questions, and they are genuinely different. Definition validation asks
 * whether authored content is coherent; resolved validation asks whether the
 * instances derived from it and the current anatomy agree with each other.
 *
 * The interesting rules are the ones about categories, because categories are
 * now flags rather than an exclusive tag and a definition can therefore be
 * self-contradictory in ways the old model could not express: a point that is
 * no category at all, a Joint with nothing to govern, or a designation on a
 * point that is not a Joint.
 */

import { getBodyPartChildren } from "../anatomy/resolution";
import { createBodyPartDefinitionMap, matchesBodyPartSelector } from "../selectors";
import { validateBodyPartSelector } from "../selectors";
import { ANATOMICAL_POINT_CATEGORIES } from "./types";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "../anatomy/types";
import type {
  CriticalPointId,
  CriticalPointTypeId,
  ResolvedCriticalPoints,
  SpecialPointDefinition,
} from "./types";


export type CriticalPointValidationIssueCode =
  | "invalid-special-point-id"
  | "invalid-special-point-name"
  | "invalid-special-point-description"
  | "invalid-special-point-selector"
  | "duplicate-special-point-id"
  | "no-categories"
  | "unknown-category"
  | "duplicate-category"
  | "joint-without-designation"
  | "designation-without-joint"
  | "invalid-weak-multiplier"
  | "weak-multiplier-without-weak"
  | "duplicate-point-instance-id"
  | "unknown-host-part"
  | "unknown-designated-part"
  | "joint-designates-nothing";


export interface CriticalPointValidationIssue {
  readonly code: CriticalPointValidationIssueCode;
  readonly message: string;

  readonly definitionId?: CriticalPointTypeId;
  readonly pointId?: CriticalPointId;
  readonly partId?: BodyPartId;
}


export interface CriticalPointValidationResult {
  readonly valid: boolean;
  readonly issues: readonly CriticalPointValidationIssue[];
}


function createValidationResult(
  issues: readonly CriticalPointValidationIssue[],
): CriticalPointValidationResult {
  return { valid: issues.length === 0, issues };
}


function isValidIdentifier(value: string): boolean {
  return value.trim().length > 0;
}


/*
 * Validates one authored definition.
 */
export function validateSpecialPointDefinition(
  definition: SpecialPointDefinition,
): CriticalPointValidationResult {
  const issues: CriticalPointValidationIssue[] = [];

  const flag = (
    code: CriticalPointValidationIssueCode,
    message: string,
  ): void => {
    issues.push({ code, message, definitionId: definition.id });
  };

  if (!isValidIdentifier(definition.id)) {
    flag(
      "invalid-special-point-id",
      "Anatomical Point id must be a non-empty identifier.",
    );
  }

  if (!isValidIdentifier(definition.name)) {
    flag(
      "invalid-special-point-name",
      `Anatomical Point "${definition.id}" needs a name.`,
    );
  }

  if (!isValidIdentifier(definition.description)) {
    flag(
      "invalid-special-point-description",
      `Anatomical Point "${definition.id}" needs a description.`,
    );
  }

  const selectorResult = validateBodyPartSelector(
    definition.placement.selector,
  );

  if (!selectorResult.valid) {
    flag(
      "invalid-special-point-selector",
      `Anatomical Point "${definition.id}" has an invalid placement selector.`,
    );
  }

  /*
   * A point with no categories is not a target, it is a label. It would resolve
   * into instances, appear in the roster, accept a hit, and then do precisely
   * nothing that hitting the BodyPart directly would not already have done.
   */
  if (definition.categories.length === 0) {
    flag(
      "no-categories",
      `Anatomical Point "${definition.id}" declares no categories. A point ` +
      `that is none of Fatal, Critical, Joint or Weak has no mechanical ` +
      `effect at all.`,
    );
  }

  const seen = new Set<string>();

  for (const category of definition.categories) {
    if (!ANATOMICAL_POINT_CATEGORIES.includes(category)) {
      flag(
        "unknown-category",
        `Anatomical Point "${definition.id}" declares unknown category ` +
        `"${category}".`,
      );

      continue;
    }

    if (seen.has(category)) {
      flag(
        "duplicate-category",
        `Anatomical Point "${definition.id}" declares category ` +
        `"${category}" twice.`,
      );
    }

    seen.add(category);
  }

  const isJoint = definition.categories.includes("joint");
  const isWeak = definition.categories.includes("weak");

  if (isJoint && definition.jointDesignation === undefined) {
    flag(
      "joint-without-designation",
      `Anatomical Point "${definition.id}" is a Joint but designates no ` +
      `BodyPart. A Joint threshold is a percentage of the designated part's ` +
      `Maximum BP, so without one there is nothing to fail against.`,
    );
  }

  if (!isJoint && definition.jointDesignation !== undefined) {
    flag(
      "designation-without-joint",
      `Anatomical Point "${definition.id}" carries a joint designation but ` +
      `is not a Joint.`,
    );
  }

  if (definition.weakMultiplier !== undefined) {
    if (
      !Number.isFinite(definition.weakMultiplier) ||
      definition.weakMultiplier <= 0
    ) {
      flag(
        "invalid-weak-multiplier",
        `Anatomical Point "${definition.id}" must have a finite Weak ` +
        `multiplier greater than 0; got ${definition.weakMultiplier}.`,
      );
    }

    if (!isWeak) {
      flag(
        "weak-multiplier-without-weak",
        `Anatomical Point "${definition.id}" sets a Weak multiplier but is ` +
        `not Weak, so the multiplier would never apply.`,
      );
    }
  }

  return createValidationResult(issues);
}


export function validateSpecialPointDefinitions(
  definitions: readonly SpecialPointDefinition[],
): CriticalPointValidationResult {
  const issues: CriticalPointValidationIssue[] = definitions.flatMap(
    (definition) => validateSpecialPointDefinition(definition).issues,
  );

  const seen = new Set<CriticalPointTypeId>();

  for (const definition of definitions) {
    if (seen.has(definition.id)) {
      issues.push({
        code: "duplicate-special-point-id",
        definitionId: definition.id,
        message: `Duplicate Anatomical Point definition id "${definition.id}".`,
      });
    }

    seen.add(definition.id);
  }

  return createValidationResult(issues);
}


/*
 * Validates instances against the anatomy they were derived from.
 */
export function validateResolvedCriticalPoints(
  points: ResolvedCriticalPoints,
  anatomy: Anatomy,
): CriticalPointValidationResult {
  const issues: CriticalPointValidationIssue[] = [];

  const partIds = new Set(anatomy.parts.map((part) => part.id));
  const seen = new Set<CriticalPointId>();

  for (const point of points.points) {
    if (seen.has(point.id)) {
      issues.push({
        code: "duplicate-point-instance-id",
        pointId: point.id,
        message: `Duplicate Anatomical Point instance id "${point.id}".`,
      });
    }

    seen.add(point.id);

    if (!partIds.has(point.hostPartId)) {
      issues.push({
        code: "unknown-host-part",
        pointId: point.id,
        partId: point.hostPartId,
        message:
          `Anatomical Point "${point.id}" is hosted by "${point.hostPartId}", ` +
          `which is not in the resolved Anatomy.`,
      });
    }

    if (
      point.designatedPartId !== undefined &&
      !partIds.has(point.designatedPartId)
    ) {
      issues.push({
        code: "unknown-designated-part",
        pointId: point.id,
        partId: point.designatedPartId,
        message:
          `Anatomical Point "${point.id}" designates ` +
          `"${point.designatedPartId}", which is not in the resolved Anatomy.`,
      });
    }
  }

  return createValidationResult(issues);
}


/*
 * Validates definitions and the instances they produce together.
 *
 * The one check that needs both: a Joint whose designation matched nothing.
 * That is not necessarily an error — a Wrist on an Arm whose Hand has been
 * severed genuinely governs nothing any more — so it is reported only when the
 * host still HAS a child the designation should have matched, which means the
 * selector and the anatomy disagree rather than the body being incomplete.
 */
export function validateCriticalPointData(
  points: ResolvedCriticalPoints,
  anatomy: Anatomy,
  bodyPartDefinitions: readonly BodyPartDefinition[],
  definitions: readonly SpecialPointDefinition[],
): CriticalPointValidationResult {
  const issues: CriticalPointValidationIssue[] = [
    ...validateSpecialPointDefinitions(definitions).issues,
    ...validateResolvedCriticalPoints(points, anatomy).issues,
  ];

  const definitionsById = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );

  const partDefinitionsById = createBodyPartDefinitionMap(bodyPartDefinitions);

  for (const point of points.points) {
    if (point.designatedPartId !== undefined) continue;

    const definition = definitionsById.get(point.definitionId);

    const designation = definition?.jointDesignation;

    if (designation?.kind !== "child-of-host") continue;

    const matchable = getBodyPartChildren(anatomy, point.hostPartId).some(
      (child) => {
        const childDefinition = partDefinitionsById.get(child.type);

        return (
          childDefinition !== undefined &&
          matchesBodyPartSelector(child, childDefinition, designation.selector)
        );
      },
    );

    if (matchable) {
      issues.push({
        code: "joint-designates-nothing",
        pointId: point.id,
        message:
          `Joint "${point.id}" designated no BodyPart even though its host ` +
          `has a matching child. Its designation selector and the anatomy ` +
          `disagree.`,
      });
    }
  }

  return createValidationResult(issues);
}
