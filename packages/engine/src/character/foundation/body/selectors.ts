/*
 * Shared BodyPart selector vocabulary and resolution.
 *
 * BodyPart selectors allow data-driven systems to target physical anatomy
 * without hardcoding specific body layouts.
 *
 * Selectors are shared by systems such as:
 *
 * - Body Point modifiers;
 * - Critical Point placement;
 * - future Anatomy effects;
 * - future Injury/body mechanics.
 *
 * A selector may target:
 *
 * - every BodyPart;
 * - exact BodyPart instance IDs;
 * - BodyPart definition/type IDs;
 * - BodyPart definition tags;
 * - BodyPart physical presence state.
 *
 * BodyPart instance identity comes from BodyPart.
 * Type and tag classification come from BodyPartDefinition.
 */

import type {
  Anatomy,
  BodyPart,
  BodyPartDefinition,
  BodyPartId,
  BodyPartState,
  BodyPartTag,
  BodyPartTypeId,
} from "./anatomy/types";


/*
 * Selects every BodyPart.
 *
 * `all` is intentionally exclusive with every filtered selector field.
 */
export interface AllBodyPartsSelector {
  readonly all: true;

  readonly ids?: never;
  readonly types?: never;
  readonly tags?: never;
  readonly tagMode?: never;
  readonly states?: never;
}


/*
 * Selects BodyParts using one or more filters.
 *
 * Filter dimensions intersect with each other.
 *
 * Example:
 *
 * {
 *   types: ["arm"],
 *   tags: ["left"]
 * }
 *
 * means:
 *
 * type is Arm
 * AND
 * definition has the "left" tag.
 *
 * Within one dimension:
 *
 * ids
 * → match any listed ID.
 *
 * types
 * → match any listed type.
 *
 * tags
 * → behavior is controlled by tagMode.
 *
 * tagMode defaults to "all".
 */
export interface FilteredBodyPartSelector {
  readonly all?: false;

  readonly ids?:
    readonly BodyPartId[];

  readonly types?:
    readonly BodyPartTypeId[];

  readonly tags?:
    readonly BodyPartTag[];

  readonly tagMode?:
    | "all"
    | "any";

  /*
   * Match any of the listed physical presence states.
   *
   * Absent means "do not filter on presence at all", not "active only".
   * Silently defaulting to active would be the wrong default for the systems
   * that most need this dimension: regeneration looks for archived-removed
   * parts, and a dispel looks for suppressed ones. The physical resolvers that
   * genuinely want only what is present say so explicitly.
   */
  readonly states?:
    readonly BodyPartState[];
}


/*
 * Generic BodyPart selector.
 *
 * Filtered selectors must contain at least one non-empty filter. That
 * requirement is enforced by validateBodyPartSelector().
 */
export type BodyPartSelector =
  | AllBodyPartsSelector
  | FilteredBodyPartSelector;


/*
 * Stable machine-readable selector validation failures.
 */
export type BodyPartSelectorValidationIssueCode =
  | "empty-selector"
  | "empty-id-filter"
  | "empty-type-filter"
  | "empty-tag-filter"
  | "invalid-id"
  | "invalid-type"
  | "invalid-tag"
  | "duplicate-id"
  | "duplicate-type"
  | "duplicate-tag"
  | "empty-state-filter"
  | "duplicate-state"
  | "tag-mode-without-tags";


/*
 * One selector validation failure.
 */
export interface BodyPartSelectorValidationIssue {
  readonly code:
    BodyPartSelectorValidationIssueCode;

  readonly message: string;
}


/*
 * Result returned by selector validation.
 */
export interface BodyPartSelectorValidationResult {
  readonly valid: boolean;

  readonly issues:
    readonly BodyPartSelectorValidationIssue[];
}


/*
 * Creates a validation result from collected issues.
 */
function createValidationResult(
  issues:
    readonly BodyPartSelectorValidationIssue[],
): BodyPartSelectorValidationResult {
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
 * Validates one identifier-array filter.
 */
function validateIdentifierFilter(
  values: readonly string[],
  kind:
    | "id"
    | "type"
    | "tag",
): readonly BodyPartSelectorValidationIssue[] {
  const issues:
    BodyPartSelectorValidationIssue[] = [];

  if (values.length === 0) {
    issues.push({
      code:
        kind === "id"
          ? "empty-id-filter"
          : kind === "type"
            ? "empty-type-filter"
            : "empty-tag-filter",

      message:
        `BodyPart selector ${kind} filter must not be empty.`,
    });

    return issues;
  }

  const seen =
    new Set<string>();

  for (const value of values) {
    if (!isValidIdentifier(value)) {
      issues.push({
        code:
          kind === "id"
            ? "invalid-id"
            : kind === "type"
              ? "invalid-type"
              : "invalid-tag",

        message:
          `BodyPart selector contains an invalid ${kind} identifier.`,
      });

      continue;
    }

    if (seen.has(value)) {
      issues.push({
        code:
          kind === "id"
            ? "duplicate-id"
            : kind === "type"
              ? "duplicate-type"
              : "duplicate-tag",

        message:
          `BodyPart selector contains duplicate ${kind} "${value}".`,
      });

      continue;
    }

    seen.add(value);
  }

  return issues;
}


/*
 * Validates one BodyPartSelector.
 *
 * Rules:
 *
 * all: true
 * → valid by itself and cannot contain filter fields by type.
 *
 * Filtered selector
 * → must contain at least one of ids, types, tags, or states.
 *
 * Present filter arrays
 * → must be non-empty.
 *
 * tagMode
 * → may only be provided when tags are also provided.
 */
export function validateBodyPartSelector(
  selector: BodyPartSelector,
): BodyPartSelectorValidationResult {
  const issues:
    BodyPartSelectorValidationIssue[] = [];

  if (selector.all === true) {
    return createValidationResult(
      issues,
    );
  }

  const hasIds =
    selector.ids !== undefined;

  const hasTypes =
    selector.types !== undefined;

  const hasTags =
    selector.tags !== undefined;

  const hasStates =
    selector.states !== undefined;

  if (
    !hasIds &&
    !hasTypes &&
    !hasTags &&
    !hasStates
  ) {
    issues.push({
      code: "empty-selector",
      message:
        "Filtered BodyPart selector must contain at least one of ids, types, tags, or states.",
    });
  }

  if (selector.ids !== undefined) {
    issues.push(
      ...validateIdentifierFilter(
        selector.ids,
        "id",
      ),
    );
  }

  if (selector.types !== undefined) {
    issues.push(
      ...validateIdentifierFilter(
        selector.types,
        "type",
      ),
    );
  }

  if (selector.tags !== undefined) {
    issues.push(
      ...validateIdentifierFilter(
        selector.tags,
        "tag",
      ),
    );
  }

  if (selector.states !== undefined) {
    if (selector.states.length === 0) {
      issues.push({
        code: "empty-state-filter",
        message:
          "BodyPart selector state filter must not be empty.",
      });
    }

    const seenStates = new Set<string>();

    for (const state of selector.states) {
      if (seenStates.has(state)) {
        issues.push({
          code: "duplicate-state",
          message:
            `BodyPart selector contains duplicate state "${state}".`,
        });

        continue;
      }

      seenStates.add(state);
    }
  }

  if (
    selector.tagMode !== undefined &&
    selector.tags === undefined
  ) {
    issues.push({
      code: "tag-mode-without-tags",
      message:
        "BodyPart selector tagMode may only be provided when a tag filter exists.",
    });
  }

  return createValidationResult(
    issues,
  );
}


/*
 * Returns whether one BodyPart satisfies a selector.
 *
 * `part`
 * supplies instance-specific information:
 *
 * - id;
 * - type.
 *
 * `definition`
 * supplies definition-level classification:
 *
 * - tags.
 *
 * Different filter dimensions intersect.
 *
 * Example:
 *
 * ids:   ["arm-1", "arm-2"]
 * types: ["arm"]
 * tags:  ["limb"]
 *
 * requires the BodyPart to satisfy all three dimensions.
 */
export function matchesBodyPartSelector(
  part: BodyPart,
  definition: BodyPartDefinition,
  selector: BodyPartSelector,
): boolean {
  if (selector.all === true) {
    return true;
  }

  if (
    selector.ids !== undefined &&
    !selector.ids.includes(part.id)
  ) {
    return false;
  }

  if (
    selector.types !== undefined &&
    !selector.types.includes(part.type)
  ) {
    return false;
  }

  if (
    selector.states !== undefined &&
    !selector.states.includes(part.state)
  ) {
    return false;
  }

  if (selector.tags !== undefined) {
    const tagMode =
      selector.tagMode ?? "all";

    if (tagMode === "all") {
      const hasAllTags =
        selector.tags.every(
          (tag) =>
            definition.tags.includes(
              tag,
            ),
        );

      if (!hasAllTags) {
        return false;
      }
    } else {
      const hasAnyTag =
        selector.tags.some(
          (tag) =>
            definition.tags.includes(
              tag,
            ),
        );

      if (!hasAnyTag) {
        return false;
      }
    }
  }

  return true;
}


/*
 * Creates a BodyPartDefinition lookup by type ID.
 *
 * Definition uniqueness belongs to anatomy/validation.ts.
 */
export function createBodyPartDefinitionMap(
  definitions:
    readonly BodyPartDefinition[],
): ReadonlyMap<
  BodyPartTypeId,
  BodyPartDefinition
> {
  return new Map(
    definitions.map(
      (definition) => [
        definition.id,
        definition,
      ],
    ),
  );
}


/*
 * Selects BodyParts from Anatomy using one shared selector.
 *
 * The supplied definitions provide tag information.
 *
 * Anatomy and definitions are assumed to have already passed Anatomy
 * validation. An unknown BodyPart type therefore represents an invalid engine
 * state and causes an error rather than silently failing tag matching.
 */
export function selectBodyParts(
  anatomy: Anatomy,
  definitions:
    readonly BodyPartDefinition[],
  selector: BodyPartSelector,
): readonly BodyPart[] {
  const definitionsById =
    createBodyPartDefinitionMap(
      definitions,
    );

  return anatomy.parts.filter(
    (part) => {
      const definition =
        definitionsById.get(
          part.type,
        );

      if (definition === undefined) {
        throw new Error(
          `Cannot evaluate BodyPart selector for "${part.id}": ` +
          `unknown BodyPartDefinition "${part.type}".`,
        );
      }

      return matchesBodyPartSelector(
        part,
        definition,
        selector,
      );
    },
  );
}