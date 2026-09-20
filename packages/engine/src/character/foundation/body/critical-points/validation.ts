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
  SensoryContribution,
  SensoryFocusMembership,
  SensoryPointFootprint,
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
  | "sensory-without-metadata"
  | "metadata-without-sensory"
  | "sensory-without-functions"
  | "invalid-sensory-sense"
  | "duplicate-sensory-sense"
  | "invalid-sensory-contribution"
  | "invalid-sensory-footprint"
  | "invalid-sensory-focus"
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
      `that is none of Fatal, Critical, Joint, Weak or Sensory has no ` +
      `mechanical effect at all.`,
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

  issues.push(...findSensoryDefinitionIssues(definition));

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


/*
 * The Sensory half of one definition's rules.
 *
 * Split out because it is the one part of a point definition with structure of
 * its own — three nested shapes, each with its own numeric invariants — and
 * inlining it would bury the damage-category rules it sits beside.
 *
 * What is deliberately NOT checked here: whether `senseId` names a registered
 * Sense. See AnatomicalSenseId in types.ts — proving that needs the Sense
 * registry, and the body foundation does not import it. Cross-catalog
 * validation at the composition boundary owns that question.
 */
function findSensoryDefinitionIssues(
  definition: SpecialPointDefinition,
): readonly CriticalPointValidationIssue[] {
  const issues: CriticalPointValidationIssue[] = [];

  const flag = (
    code: CriticalPointValidationIssueCode,
    message: string,
  ): void => {
    issues.push({ code, message, definitionId: definition.id });
  };

  const isSensory = definition.categories.includes("sensory");
  const data = definition.sensory;

  /*
   * The pairing rule, both ways. A Sensory point with no metadata claims to
   * produce a Sense and cannot say which; metadata on a point that is not
   * Sensory declares a footprint that would claim host surface for nothing.
   */
  if (isSensory && data === undefined) {
    flag(
      "sensory-without-metadata",
      `Anatomical Point "${definition.id}" is Sensory but carries no sensory ` +
      `metadata, so nothing can say which Sense it serves or how much ` +
      `surface it occupies.`,
    );

    return issues;
  }

  if (!isSensory && data !== undefined) {
    flag(
      "metadata-without-sensory",
      `Anatomical Point "${definition.id}" carries sensory metadata but is ` +
      `not a Sensory point, so none of it would ever apply.`,
    );

    return issues;
  }

  if (data === undefined) return issues;

  /* ---- functions --------------------------------------------------- */

  if (!Array.isArray(data.functions) || data.functions.length === 0) {
    flag(
      "sensory-without-functions",
      `Anatomical Point "${definition.id}" is Sensory but serves no Sense.`,
    );
  } else {
    const seenSenses = new Set<string>();

    for (const entry of data.functions) {
      const senseId = entry?.senseId;

      if (typeof senseId !== "string" || senseId.trim().length === 0) {
        flag(
          "invalid-sensory-sense",
          `Anatomical Point "${definition.id}" has a sensory function with ` +
          `no Sense id.`,
        );

        continue;
      }

      if (seenSenses.has(senseId)) {
        flag(
          "duplicate-sensory-sense",
          `Anatomical Point "${definition.id}" serves Sense "${senseId}" ` +
          `twice. One point contributes to one Sense once.`,
        );
      }

      seenSenses.add(senseId);

      issues.push(
        ...findContributionIssues(definition, senseId, entry.contribution),
      );
    }
  }

  issues.push(...findFootprintIssues(definition, data.footprint));
  issues.push(...findFocusIssues(definition, data.focus));

  return issues;
}


function findContributionIssues(
  definition: SpecialPointDefinition,
  senseId: string,
  contribution: SensoryContribution | undefined,
): readonly CriticalPointValidationIssue[] {
  const bad = (detail: string): CriticalPointValidationIssue => ({
    code: "invalid-sensory-contribution",
    definitionId: definition.id,
    message:
      `Anatomical Point "${definition.id}" contributes to "${senseId}" ` +
      `invalidly: ${detail}`,
  });

  if (typeof contribution !== "object" || contribution === null) {
    return [bad("it declares no contribution.")];
  }

  if (contribution.kind === "fixed") {
    return isPositiveFinite(contribution.amount)
      ? []
      : [bad("a fixed contribution must be a finite amount above zero.")];
  }

  if (contribution.kind === "network-weight") {
    const issues: CriticalPointValidationIssue[] = [];

    if (
      typeof contribution.networkId !== "string" ||
      contribution.networkId.trim().length === 0
    ) {
      issues.push(bad("a network contribution must name its network."));
    }

    if (!isPositiveFinite(contribution.sensitivity)) {
      issues.push(
        bad("a network sensitivity must be a finite amount above zero."),
      );
    }

    return issues;
  }

  return [bad("a contribution is either fixed or a network weight.")];
}


function findFootprintIssues(
  definition: SpecialPointDefinition,
  footprint: SensoryPointFootprint | undefined,
): readonly CriticalPointValidationIssue[] {
  const bad = (detail: string): CriticalPointValidationIssue => ({
    code: "invalid-sensory-footprint",
    definitionId: definition.id,
    message: `Anatomical Point "${definition.id}" footprint is invalid: ${detail}`,
  });

  if (typeof footprint !== "object" || footprint === null) {
    return [bad("a Sensory point must declare how much surface it occupies.")];
  }

  if (footprint.kind === "host-surface-fraction") {
    /*
     * Strictly below one. A point occupying its ENTIRE host leaves the host no
     * remainder to coat, which is expressible arithmetic and meaningless
     * anatomy — an eye is not a head.
     */
    return typeof footprint.fraction === "number" &&
        Number.isFinite(footprint.fraction) &&
        footprint.fraction > 0 && footprint.fraction < 1
      ? []
      : [bad("a host fraction must be above 0 and below 1.")];
  }

  if (footprint.kind === "absolute") {
    return isPositiveFinite(footprint.squareMetres)
      ? []
      : [bad("an absolute footprint must be a finite area above zero.")];
  }

  /*
   * `host-remainder` carries no fields, so there is nothing here to check.
   * Its one rule — at most one per host — is a fact about a resolved body
   * rather than about a definition, and lives in footprints.ts.
   */
  if (footprint.kind === "host-remainder") return [];

  return [
    bad("a footprint is a host fraction, an absolute area, or the remainder."),
  ];
}


function findFocusIssues(
  definition: SpecialPointDefinition,
  focus: SensoryFocusMembership | undefined,
): readonly CriticalPointValidationIssue[] {
  const bad = (detail: string): CriticalPointValidationIssue => ({
    code: "invalid-sensory-focus",
    definitionId: definition.id,
    message: `Anatomical Point "${definition.id}" focus is invalid: ${detail}`,
  });

  if (typeof focus !== "object" || focus === null) {
    return [bad("a Sensory point must declare its focus membership.")];
  }

  if (focus.kind === "local") {
    return typeof focus.cluster === "string" && focus.cluster.trim().length > 0
      ? []
      : [bad("a local focus must name its cluster.")];
  }

  if (focus.kind === "distributed") {
    const issues: CriticalPointValidationIssue[] = [];

    if (typeof focus.network !== "string" || focus.network.trim().length === 0) {
      issues.push(bad("a distributed focus must name its network."));
    }

    /*
     * The only selection there is. Written as a check rather than trusted to
     * the type, because a registered homebrew point arrives as JSON and an
     * unrecognised selection would otherwise resolve as "select nothing".
     */
    if (focus.selection !== "all-active") {
      issues.push(
        bad("a distributed focus selects all active members and nothing else."),
      );
    }

    return issues;
  }

  return [bad("a focus is either local or distributed.")];
}


function isPositiveFinite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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
