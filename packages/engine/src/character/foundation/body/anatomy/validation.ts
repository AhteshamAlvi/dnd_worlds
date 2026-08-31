/*
 * Anatomy validation.
 *
 * This module validates reusable BodyPart definitions and the structural
 * integrity of a character's Anatomy.
 *
 * Anatomy is data-driven, so validation enforces generic structural rules
 * rather than assumptions about particular species or body plans.
 *
 * This module does NOT enforce rules such as:
 *
 * - a humanoid must have exactly two arms;
 * - an arm must attach to an upper body;
 * - a hand must attach to an arm;
 * - every creature must possess a head;
 *
 * Those are content/body-plan concerns rather than universal Anatomy rules.
 *
 * Body Point failure is also not validated here. Whether stored damage has
 * destroyed a BodyPart depends upon its resolved Maximum BP and belongs to the
 * Body Point damage-resolution pipeline.
 */

import { BODY_PART_STATES } from "./types";
import type {
  Anatomy,
  BodyPart,
  BodyPartDefinition,
  BodyPartId,
  BodyPartTypeId,
} from "./types";


/*
 * Stable machine-readable categories for Anatomy validation failures.
 */
export type AnatomyValidationIssueCode =
  | "duplicate-body-part-definition-id"
  | "invalid-body-part-definition-id"
  | "invalid-body-part-definition-name"
  | "invalid-body-part-definition-description"
  | "invalid-base-bp"
  | "duplicate-body-part-tag"
  | "invalid-body-part-tag"
  | "invalid-morphology-sensitivity"
  | "invalid-height-contribution"
  | "invalid-height-axis-sign"
  | "duplicate-body-part-id"
  | "invalid-body-part-id"
  | "unknown-body-part-type"
  | "invalid-body-part-name"
  | "invalid-damage"
  | "invalid-recovery-progress"
  | "banked-recovery-progress-at-full-bp"
  | "missing-parent"
  | "self-parent"
  | "invalid-attachment-site"
  | "invalid-attachment-position"
  | "invalid-body-part-state"
  | "attachment-cycle";


/*
 * One structural or definition-level Anatomy validation failure.
 *
 * `partId` identifies a BodyPart instance when the issue concerns persistent
 * Anatomy.
 *
 * `definitionId` identifies a reusable BodyPartDefinition when the issue
 * concerns definition data.
 */
export interface AnatomyValidationIssue {
  readonly code: AnatomyValidationIssueCode;
  readonly message: string;

  readonly partId?: BodyPartId;
  readonly definitionId?: BodyPartTypeId;
}


/*
 * Result returned by Anatomy validation.
 */
export interface AnatomyValidationResult {
  readonly valid: boolean;
  readonly issues: readonly AnatomyValidationIssue[];
}


/*
 * Creates a validation result from a collected issue list.
 */
function createValidationResult(
  issues: readonly AnatomyValidationIssue[],
): AnatomyValidationResult {
  return {
    valid: issues.length === 0,
    issues,
  };
}


/*
 * Returns true when a string identifier contains usable content.
 */
function isValidIdentifier(
  value: string,
): boolean {
  return value.trim().length > 0;
}


/*
 * Returns true when a morphology sensitivity is a valid generic sensitivity.
 *
 * Zero means the morphology dimension does not affect the part.
 * Values greater than one are intentionally permitted for unusually sensitive
 * anatomy.
 *
 * Negative sensitivities are rejected because sensitivity represents the
 * magnitude with which a morphology dimension affects the part.
 */
function isValidSensitivity(
  value: number,
): boolean {
  return (
    Number.isFinite(value) &&
    value >= 0
  );
}


/*
 * Returns true when a longitudinal connection coordinate is usable.
 *
 * Coordinates are normalized positions along a BodyPart's own axis, so they
 * are bounded at both ends. A value outside [0, 1] would place a joint off the
 * end of the part it is supposed to sit on.
 */
function isValidAttachmentPosition(
  value: number,
): boolean {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}


/*
 * Validates one reusable BodyPartDefinition.
 */
export function validateBodyPartDefinition(
  definition: BodyPartDefinition,
): AnatomyValidationResult {
  const issues: AnatomyValidationIssue[] = [];

  if (!isValidIdentifier(definition.id)) {
    issues.push({
      code: "invalid-body-part-definition-id",
      message:
        "BodyPartDefinition id must be a non-empty identifier.",
      definitionId: definition.id,
    });
  }

  if (definition.name.trim().length === 0) {
    issues.push({
      code: "invalid-body-part-definition-name",
      message:
        `BodyPartDefinition "${definition.id}" needs a name.`,
      definitionId: definition.id,
    });
  }

  if (definition.description.trim().length === 0) {
    issues.push({
      code: "invalid-body-part-definition-description",
      message:
        `BodyPartDefinition "${definition.id}" needs a description.`,
      definitionId: definition.id,
    });
  }

  if (
    !Number.isFinite(definition.baseBP) ||
    definition.baseBP <= 0
  ) {
    issues.push({
      code: "invalid-base-bp",
      message:
        `BodyPartDefinition "${definition.id}" must have finite Base BP greater than 0.`,
      definitionId: definition.id,
    });
  }

  const seenTags = new Set<string>();

  for (const tag of definition.tags) {
    if (!isValidIdentifier(tag)) {
      issues.push({
        code: "invalid-body-part-tag",
        message:
          `BodyPartDefinition "${definition.id}" contains an empty body-part tag.`,
        definitionId: definition.id,
      });

      continue;
    }

    if (seenTags.has(tag)) {
      issues.push({
        code: "duplicate-body-part-tag",
        message:
          `BodyPartDefinition "${definition.id}" contains duplicate tag "${tag}".`,
        definitionId: definition.id,
      });

      continue;
    }

    seenTags.add(tag);
  }

  const sensitivities = definition.morphologySensitivity;

  if (!isValidSensitivity(sensitivities.height)) {
    issues.push({
      code: "invalid-morphology-sensitivity",
      message:
        `BodyPartDefinition "${definition.id}" has invalid height sensitivity.`,
      definitionId: definition.id,
    });
  }

  if (!isValidSensitivity(sensitivities.mass)) {
    issues.push({
      code: "invalid-morphology-sensitivity",
      message:
        `BodyPartDefinition "${definition.id}" has invalid mass sensitivity.`,
      definitionId: definition.id,
    });
  }

  if (!isValidSensitivity(sensitivities.muscularity)) {
    issues.push({
      code: "invalid-morphology-sensitivity",
      message:
        `BodyPartDefinition "${definition.id}" has invalid muscularity sensitivity.`,
      definitionId: definition.id,
    });
  }

  if (!isValidSensitivity(sensitivities.adiposity)) {
    issues.push({
      code: "invalid-morphology-sensitivity",
      message:
        `BodyPartDefinition "${definition.id}" has invalid adiposity sensitivity.`,
      definitionId: definition.id,
    });
  }

  const reference = definition.reference;

  /*
   * heightContribution is a fraction of the part's own Length, so it cannot
   * exceed 1: a part cannot be taller than it is long. Negative values are
   * rejected here rather than reinterpreted as an inverted axis — inversion is
   * heightAxisSign's job, and letting either field express it would make the
   * pair ambiguous.
   */
  if (
    !Number.isFinite(reference.heightContribution) ||
    reference.heightContribution < 0 ||
    reference.heightContribution > 1
  ) {
    issues.push({
      code: "invalid-height-contribution",
      message:
        `BodyPartDefinition "${definition.id}" must have a height contribution within [0, 1].`,
      definitionId: definition.id,
    });
  }

  if (
    reference.heightAxisSign !== 1 &&
    reference.heightAxisSign !== -1
  ) {
    issues.push({
      code: "invalid-height-axis-sign",
      message:
        `BodyPartDefinition "${definition.id}" must have a height axis sign of exactly 1 or -1.`,
      definitionId: definition.id,
    });
  }

  return createValidationResult(issues);
}


/*
 * Validates a complete reusable BodyPartDefinition collection.
 *
 * In addition to validating each definition individually, definition IDs must
 * be unique across the collection.
 */
export function validateBodyPartDefinitions(
  definitions: readonly BodyPartDefinition[],
): AnatomyValidationResult {
  const issues: AnatomyValidationIssue[] = [];
  const seenIds = new Set<BodyPartTypeId>();

  for (const definition of definitions) {
    if (seenIds.has(definition.id)) {
      issues.push({
        code: "duplicate-body-part-definition-id",
        message:
          `Duplicate BodyPartDefinition id "${definition.id}".`,
        definitionId: definition.id,
      });
    } else {
      seenIds.add(definition.id);
    }

    issues.push(
      ...validateBodyPartDefinition(definition).issues,
    );
  }

  return createValidationResult(issues);
}


/*
 * Validates the persistent state stored on one BodyPart instance.
 *
 * Structural relationships such as whether the parent exists or whether an
 * attachment participates in a cycle are validated at the Anatomy level.
 */
function validateBodyPartState(
  part: BodyPart,
  knownDefinitionIds: ReadonlySet<BodyPartTypeId>,
): readonly AnatomyValidationIssue[] {
  const issues: AnatomyValidationIssue[] = [];

  if (!isValidIdentifier(part.id)) {
    issues.push({
      code: "invalid-body-part-id",
      message:
        "BodyPart id must be a non-empty identifier.",
      partId: part.id,
    });
  }

  if (!knownDefinitionIds.has(part.type)) {
    issues.push({
      code: "unknown-body-part-type",
      message:
        `BodyPart "${part.id}" references unknown type "${part.type}".`,
      partId: part.id,
      definitionId: part.type,
    });
  }

  if (
    part.name !== undefined &&
    part.name.trim().length === 0
  ) {
    issues.push({
      code: "invalid-body-part-name",
      message:
        `BodyPart "${part.id}" has an empty display name.`,
      partId: part.id,
    });
  }

  if (
    !Number.isFinite(part.damage) ||
    part.damage < 0
  ) {
    issues.push({
      code: "invalid-damage",
      message:
        `BodyPart "${part.id}" must have finite stored damage greater than or equal to 0.`,
      partId: part.id,
    });
  }

  if (
    !Number.isFinite(part.recoveryProgress) ||
    part.recoveryProgress < 0 ||
    part.recoveryProgress >= 1
  ) {
    issues.push({
      code: "invalid-recovery-progress",
      message:
        `BodyPart "${part.id}" must have finite recovery progress in the range [0, 1).`,
      partId: part.id,
    });
  } else if (
    part.damage === 0 &&
    part.recoveryProgress !== 0
  ) {
    /*
     * A BodyPart at full Current BP has nowhere for banked recovery to go —
     * body-points/recovery.ts always resets progress to 0 there. Progress
     * surviving anyway means something upstream (hand-edited state, a bad
     * migration) put it there, not a mechanic this engine runs.
     */
    issues.push({
      code: "banked-recovery-progress-at-full-bp",
      message:
        `BodyPart "${part.id}" is undamaged but still carries banked recovery progress.`,
      partId: part.id,
    });
  }

  if (!BODY_PART_STATES.includes(part.state)) {
    issues.push({
      code: "invalid-body-part-state",
      message:
        `BodyPart "${part.id}" has unknown physical state "${String(part.state)}".`,
      partId: part.id,
    });
  }

  if (part.attachment !== null) {
    if (
      part.attachment.site !== undefined &&
      !isValidIdentifier(part.attachment.site)
    ) {
      issues.push({
        code: "invalid-attachment-site",
        message:
          `BodyPart "${part.id}" has an empty attachment-site identifier.`,
        partId: part.id,
      });
    }

    /*
     * Both connection coordinates are required and must land on the 0..1
     * longitudinal axis they index into. This is deliberately strict rather
     * than defaulted: pre-refactor Body JSON has no coordinates at all, and it
     * should fail loudly here instead of silently acquiring a body plan nobody
     * authored. The creation helpers supply defaults for anatomy being built
     * from a spec; stored anatomy is always explicit.
     */
    if (!isValidAttachmentPosition(part.attachment.parentPosition)) {
      issues.push({
        code: "invalid-attachment-position",
        message:
          `BodyPart "${part.id}" must have a parent attachment position within [0, 1].`,
        partId: part.id,
      });
    }

    if (!isValidAttachmentPosition(part.attachment.childPosition)) {
      issues.push({
        code: "invalid-attachment-position",
        message:
          `BodyPart "${part.id}" must have a child attachment position within [0, 1].`,
        partId: part.id,
      });
    }
  }

  return issues;
}


/*
 * Finds structural attachment cycles.
 *
 * Anatomy is required to form a directed acyclic forest. Every BodyPart may
 * have at most one parent, so cycle detection can walk the single parent chain
 * of each part.
 *
 * Dangling parent references are ignored here because they are reported
 * separately as "missing-parent".
 */
function findAttachmentCycleIssues(
  anatomy: Anatomy,
): readonly AnatomyValidationIssue[] {
  const issues: AnatomyValidationIssue[] = [];

  const partsById = new Map<BodyPartId, BodyPart>();

  for (const part of anatomy.parts) {
    /*
     * Duplicate IDs are reported elsewhere. Preserve the first instance here
     * so malformed duplicate data does not make cycle detection unstable.
     */
    if (!partsById.has(part.id)) {
      partsById.set(
        part.id,
        part,
      );
    }
  }

  /*
   * Parts that have already been fully proven acyclic do not need to be walked
   * again.
   */
  const resolved = new Set<BodyPartId>();

  /*
   * Avoid reporting the same cycle repeatedly when several parts eventually
   * enter it.
   */
  const reportedCycles = new Set<string>();

  for (const start of anatomy.parts) {
    if (resolved.has(start.id)) {
      continue;
    }

    const path: BodyPartId[] = [];
    const pathIndexes = new Map<BodyPartId, number>();

    let current: BodyPart | undefined = start;

    while (current !== undefined) {
      if (resolved.has(current.id)) {
        break;
      }

      const existingIndex = pathIndexes.get(
        current.id,
      );

      if (existingIndex !== undefined) {
        const cycle = path.slice(existingIndex);

        /*
         * Normalize the cycle only for duplicate-report suppression. The exact
         * traversal ordering is not mechanically important.
         */
        const normalizedCycle = [
          ...cycle,
        ]
          .sort()
          .join("|");

        if (!reportedCycles.has(normalizedCycle)) {
          reportedCycles.add(normalizedCycle);

          for (const partId of cycle) {
            issues.push({
              code: "attachment-cycle",
              message:
                `BodyPart "${partId}" participates in an anatomical attachment cycle.`,
              partId,
            });
          }
        }

        break;
      }

      pathIndexes.set(
        current.id,
        path.length,
      );

      path.push(current.id);

      if (current.attachment === null) {
        break;
      }

      current = partsById.get(
        current.attachment.parentId,
      );
    }

    for (const partId of path) {
      resolved.add(partId);
    }
  }

  return issues;
}


/*
 * Validates one complete Anatomy against the available BodyPartDefinitions.
 *
 * Universal structural rules:
 *
 * - BodyPart IDs must be unique;
 * - every BodyPart type must reference a known definition;
 * - physical presence state must be one of the three known states;
 * - an attachment's two longitudinal coordinates must both fall in [0, 1];
 * - damage must be finite and non-negative;
 * - recovery progress must be finite and fall within [0, 1), and an
 *   undamaged part must not still be carrying any;
 * - every non-root parent must exist;
 * - a BodyPart cannot parent itself;
 * - attachment relationships cannot contain cycles.
 *
 * Multiple anatomical roots are valid.
 *
 * Empty Anatomy is also structurally valid. A character whose entire physical
 * body has been destroyed may therefore resolve to zero remaining BodyParts.
 */
export function validateAnatomy(
  anatomy: Anatomy,
  definitions: readonly BodyPartDefinition[],
): AnatomyValidationResult {
  const issues: AnatomyValidationIssue[] = [];

  const knownDefinitionIds = new Set<BodyPartTypeId>(
    definitions.map(
      (definition) => definition.id,
    ),
  );

  const seenPartIds = new Set<BodyPartId>();

  for (const part of anatomy.parts) {
    if (seenPartIds.has(part.id)) {
      issues.push({
        code: "duplicate-body-part-id",
        message:
          `Duplicate BodyPart id "${part.id}".`,
        partId: part.id,
      });
    } else {
      seenPartIds.add(part.id);
    }

    issues.push(
      ...validateBodyPartState(
        part,
        knownDefinitionIds,
      ),
    );
  }

  /*
   * Parent validation is performed after collecting all instance IDs because
   * input order has no structural meaning. A child may appear before its
   * parent in Anatomy.parts.
   */
  for (const part of anatomy.parts) {
    if (part.attachment === null) {
      continue;
    }

    const parentId =
      part.attachment.parentId;

    if (parentId === part.id) {
      issues.push({
        code: "self-parent",
        message:
          `BodyPart "${part.id}" cannot be structurally attached to itself.`,
        partId: part.id,
      });

      continue;
    }

    if (!seenPartIds.has(parentId)) {
      issues.push({
        code: "missing-parent",
        message:
          `BodyPart "${part.id}" references nonexistent parent "${parentId}".`,
        partId: part.id,
      });
    }
  }

  issues.push(
    ...findAttachmentCycleIssues(anatomy),
  );

  return createValidationResult(issues);
}


/*
 * Convenience validator for the complete Anatomy data required by the Body
 * domain.
 *
 * This validates both the reusable definition collection and the character's
 * Anatomy against those definitions.
 */
export function validateAnatomyData(
  anatomy: Anatomy,
  definitions: readonly BodyPartDefinition[],
): AnatomyValidationResult {
  const definitionResult =
    validateBodyPartDefinitions(definitions);

  const anatomyResult =
    validateAnatomy(
      anatomy,
      definitions,
    );

  return createValidationResult([
    ...definitionResult.issues,
    ...anatomyResult.issues,
  ]);
}