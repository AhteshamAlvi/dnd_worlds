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
  ContinuityKey,
  ReferenceAnatomySlotId,
  ReferenceForm,
} from "./types";


/*
 * Stable machine-readable categories for Anatomy validation failures.
 */
export type AnatomyValidationIssueCode =
  | "duplicate-body-part-definition-id"
  | "invalid-body-part-definition-id"
  | "invalid-body-part-definition-name"
  | "invalid-body-part-definition-description"
  | "duplicate-body-part-tag"
  | "invalid-body-part-tag"
  | "invalid-height-contribution"
  | "invalid-height-axis-sign"
  | "duplicate-body-part-id"
  | "invalid-body-part-id"
  | "unknown-body-part-type"
  | "invalid-body-part-name"
  | "invalid-integrity"
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

  if (!BODY_PART_STATES.includes(part.state)) {
    issues.push({
      code: "invalid-body-part-state",
      message:
        `BodyPart "${part.id}" has unknown physical presence state ` +
        `"${part.state}".`,
      partId: part.id,
    });
  }

  if (
    !Number.isFinite(part.integrity) ||
    part.integrity < 0 ||
    part.integrity > 1
  ) {
    issues.push({
      code: "invalid-integrity",
      message:
        `BodyPart "${part.id}" must have finite integrity within [0, 1]; ` +
        `got ${part.integrity}.`,
      partId: part.id,
    });
  } else if (part.state === "active" && part.integrity === 0) {
    /*
     * Zero integrity on an active part is the one combination the integrity
     * model exists to make unrepresentable. A part with nothing left is
     * destroyed, and destruction is a transition to "archived-removed" that
     * damage application performs deliberately — never a number arriving at a
     * threshold. Stored 0 would be a part that is dead by arithmetic, and that
     * a later Maximum BP increase would silently bring back to life.
     */
    issues.push({
      code: "invalid-integrity",
      message:
        `BodyPart "${part.id}" is active with integrity 0. Zero is reserved ` +
        `for destruction, which is a state transition to "archived-removed".`,
      partId: part.id,
    });
  } else if (part.state !== "active" && part.integrity !== 0) {
    issues.push({
      code: "invalid-integrity",
      message:
        `BodyPart "${part.id}" is ${part.state} and must carry integrity 0; ` +
        `got ${part.integrity}. A departed part is absent, not damaged.`,
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

/* -------------------------------------------------------------------------- */
/* Reference Form validation                                                  */
/* -------------------------------------------------------------------------- */

/*
 * Stable machine-readable categories for Reference Form failures.
 *
 * A form is a blueprint anatomy is instantiated FROM, so a malformed one does
 * not produce a wrong body — it produces a body that cannot be built. These
 * are checked at the form rather than at every character wearing it.
 */
export type ReferenceFormValidationIssueCode =
  | "invalid-reference-form-id"
  | "empty-reference-form"
  | "duplicate-slot-id"
  | "invalid-slot-id"
  | "unknown-body-part-type"
  | "invalid-continuity-key"
  | "duplicate-continuity-key"
  | "missing-parent-slot"
  | "self-parent-slot"
  | "invalid-attachment-site"
  | "invalid-attachment-position"
  | "attachment-cycle"
  | "missing-root";


export interface ReferenceFormValidationIssue {
  readonly code: ReferenceFormValidationIssueCode;
  readonly message: string;

  readonly slotId?: ReferenceAnatomySlotId;
  readonly continuityKey?: ContinuityKey;
}


export interface ReferenceFormValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ReferenceFormValidationIssue[];
}


/*
 * Validates one Reference Form as a complete anatomical blueprint.
 *
 * Cross-form reuse of a continuity key is not merely allowed, it is the entire
 * mechanism: a Wolf's foreleg and a Human's arm are supposed to say the same
 * identity. WITHIN one form it is rejected, because two slots claiming one
 * identity leaves every persistent value — morphology, integrity, an Injury —
 * with two places to land and no rule for choosing.
 */
export function validateReferenceForm(
  form: ReferenceForm,
  definitions: readonly BodyPartDefinition[],
): ReferenceFormValidationResult {
  const issues: ReferenceFormValidationIssue[] = [];

  if (!isValidIdentifier(form.id)) {
    issues.push({
      code: "invalid-reference-form-id",
      message: "A Reference Form must have a non-empty id.",
    });
  }

  if (form.parts.length === 0) {
    issues.push({
      code: "empty-reference-form",
      message:
        `Reference Form "${form.id}" declares no anatomy. A form with no ` +
        "parts cannot instantiate a body.",
    });

    return createReferenceFormValidationResult(issues);
  }

  const knownTypes = new Set(definitions.map((definition) => definition.id));

  const seenSlots = new Set<ReferenceAnatomySlotId>();
  const seenContinuity = new Set<ContinuityKey>();

  for (const part of form.parts) {
    if (!isValidIdentifier(part.slotId)) {
      issues.push({
        code: "invalid-slot-id",
        message: `Reference Form "${form.id}" has a slot with an empty id.`,
      });
    } else if (seenSlots.has(part.slotId)) {
      issues.push({
        code: "duplicate-slot-id",
        slotId: part.slotId,
        message:
          `Reference Form "${form.id}" declares slot "${part.slotId}" twice.`,
      });
    } else {
      seenSlots.add(part.slotId);
    }

    if (!knownTypes.has(part.type)) {
      issues.push({
        code: "unknown-body-part-type",
        slotId: part.slotId,
        message:
          `Reference Form "${form.id}" slot "${part.slotId}" references ` +
          `unknown BodyPartDefinition "${part.type}".`,
      });
    }

    if (!isValidIdentifier(part.continuityKey)) {
      issues.push({
        code: "invalid-continuity-key",
        slotId: part.slotId,
        message:
          `Reference Form "${form.id}" slot "${part.slotId}" has an empty ` +
          "continuity identity. Continuity is authored, never inferred.",
      });
    } else if (seenContinuity.has(part.continuityKey)) {
      issues.push({
        code: "duplicate-continuity-key",
        slotId: part.slotId,
        continuityKey: part.continuityKey,
        message:
          `Reference Form "${form.id}" gives continuity identity ` +
          `"${part.continuityKey}" to more than one slot. Persistent state — ` +
          "morphology, integrity, Injuries — would have two places to land " +
          "and no rule for choosing between them.",
      });
    } else {
      seenContinuity.add(part.continuityKey);
    }
  }

  let roots = 0;

  for (const part of form.parts) {
    if (part.attachment === null) {
      roots += 1;

      continue;
    }

    const { parentSlotId, site, parentPosition, childPosition } =
      part.attachment;

    if (parentSlotId === part.slotId) {
      issues.push({
        code: "self-parent-slot",
        slotId: part.slotId,
        message:
          `Reference Form "${form.id}" slot "${part.slotId}" is its own parent.`,
      });
    } else if (!seenSlots.has(parentSlotId)) {
      issues.push({
        code: "missing-parent-slot",
        slotId: part.slotId,
        message:
          `Reference Form "${form.id}" slot "${part.slotId}" attaches to ` +
          `"${parentSlotId}", which this form does not declare.`,
      });
    }

    if (site !== undefined && !isValidIdentifier(site)) {
      issues.push({
        code: "invalid-attachment-site",
        slotId: part.slotId,
        message:
          `Reference Form "${form.id}" slot "${part.slotId}" has an empty ` +
          "attachment-site identifier.",
      });
    }

    for (const position of [parentPosition, childPosition]) {
      if (!isValidAttachmentPosition(position)) {
        issues.push({
          code: "invalid-attachment-position",
          slotId: part.slotId,
          message:
            `Reference Form "${form.id}" slot "${part.slotId}" must have ` +
            "attachment positions within [0, 1].",
        });
      }
    }
  }

  if (roots === 0) {
    issues.push({
      code: "missing-root",
      message:
        `Reference Form "${form.id}" has no unattached slot. Anatomy is a ` +
        "forest, so at least one part must attach to nothing.",
    });
  }

  /*
   * Cycles, by walking each slot up to a root. Anatomy is a forest and Height
   * resolution depends on it: a cycle is two independent assertions about one
   * vertical coordinate, which needs a constraint solver rather than a walk.
   */
  const parentOf = new Map(
    form.parts.map(
      (part) => [part.slotId, part.attachment?.parentSlotId] as const,
    ),
  );

  for (const part of form.parts) {
    const seen = new Set<ReferenceAnatomySlotId>([part.slotId]);

    let current = parentOf.get(part.slotId);

    while (current !== undefined) {
      if (seen.has(current)) {
        issues.push({
          code: "attachment-cycle",
          slotId: part.slotId,
          message:
            `Reference Form "${form.id}" slot "${part.slotId}" is part of an ` +
            "attachment cycle.",
        });

        break;
      }

      seen.add(current);
      current = parentOf.get(current);
    }
  }

  return createReferenceFormValidationResult(issues);
}


function createReferenceFormValidationResult(
  issues: readonly ReferenceFormValidationIssue[],
): ReferenceFormValidationResult {
  return { valid: issues.length === 0, issues };
}
