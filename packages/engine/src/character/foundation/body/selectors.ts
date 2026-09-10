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

import { BODY_PART_STATES } from "./anatomy/types";
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
  | "tag-mode-without-tags"

  /*
   * The selector is not an object at all, or one of its filters is not a list.
   *
   * Distinct from "empty-<kind>-filter", which says a list exists and holds
   * nothing. `ids: 42` is not an empty filter — it is a caller who did not
   * write a filter — and reporting the two the same way would send an author
   * to add an id when the field needs replacing.
   */
  | "malformed-selector"
  | "malformed-filter"

  /*
   * The closed-vocabulary and exclusivity faults.
   *
   * Each of these was ACCEPTED and then quietly reinterpreted by matching,
   * which is worse than being refused: `{ all: true, ids: ["arm"] }` reads as
   * "every part, and also these" and selects everything; a tagMode of "bogus"
   * falls past the `=== "all"` branch and behaves as "any", so a selector
   * meaning "has all these tags" silently becomes "has any of them"; and a
   * state of "bogus" matches no real BodyPart state, so a filter that looks
   * restrictive selects nothing at all.
   *
   * All three are the same shape of bug — content that validates and then
   * means something the author did not write — which is the class this whole
   * barrier exists to remove.
   */
  | "all-with-filters"
  | "invalid-all"
  | "invalid-tag-mode"
  | "invalid-state";


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
  candidate: unknown,
  kind:
    | "id"
    | "type"
    | "tag",
): readonly BodyPartSelectorValidationIssue[] {
  const issues:
    BodyPartSelectorValidationIssue[] = [];

  /*
   * Guarded before `.length` is read, which is where `ids: 42` used to throw.
   * A filter that is not a list is a different fault from an empty one and
   * says so, because the fixes are different.
   */
  if (!Array.isArray(candidate)) {
    return [
      {
        code: "malformed-filter",
        message:
          `BodyPart selector ${kind} filter must be a list of identifiers.`,
      },
    ];
  }

  const values: readonly unknown[] = candidate;

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
    new Set<unknown>();

  for (const value of values) {
    if (typeof value !== "string" || !isValidIdentifier(value)) {
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
  candidate: unknown,
): BodyPartSelectorValidationResult {
  const issues:
    BodyPartSelectorValidationIssue[] = [];

  /*
   * `unknown`, because this is a SHARED boundary and both of its callers reach
   * it from registration.
   *
   * An Injury's `applicability.bodyParts` and an Anatomical Point's
   * `placement.selector` are both host-authored, and both used to arrive here
   * typed as BodyPartSelector on nothing more than a caller's cast. Every
   * filter below was then iterated or measured without being checked, so
   * `{ ids: 42 }` threw on `.length` and `{ states: {} }` threw on iteration —
   * from inside the function whose whole job is to say a selector is wrong.
   *
   * Guarding at each call site instead would be two copies of this, and the
   * copies would be what drift.
   */
  if (typeof candidate !== "object" || candidate === null) {
    return createValidationResult([
      {
        code: "malformed-selector",
        message: "BodyPart selector must be an object.",
      },
    ]);
  }

  const selector = candidate as Record<string, unknown>;

  /*
   * The FILTER FIELDS, named once so exclusivity and presence ask about the
   * same list. A field added to the selector and not to this list would be
   * silently permitted beside `all: true`.
   */
  const FILTER_FIELDS = ["ids", "types", "tags", "tagMode", "states"] as const;

  if (selector["all"] === true) {
    /*
     * `all` is exclusive by TYPE — AllBodyPartsSelector declares every filter
     * as `never` — and was never exclusive in practice, because host content
     * does not go through the type. "Everything, and also these arms" is not a
     * narrowing; matching returns true on the first line and the filters are
     * dead text the author believed was doing something.
     */
    const alsoFiltered = FILTER_FIELDS.filter(
      (field) => selector[field] !== undefined,
    );

    if (alsoFiltered.length > 0) {
      issues.push({
        code: "all-with-filters",
        message:
          `BodyPart selector "all" cannot be combined with ${alsoFiltered.join(", ")}.`,
      });
    }

    return createValidationResult(
      issues,
    );
  }

  /*
   * Present on a filtered selector, it must be exactly `false`.
   *
   * FilteredBodyPartSelector declares `all?: false`, so anything else is a
   * value the type forbids — and `all: "no"` or `all: 0` would be read by
   * matching as "not everything", which is right by accident rather than by
   * the author having said so.
   */
  if (selector["all"] !== undefined && selector["all"] !== false) {
    issues.push({
      code: "invalid-all",
      message:
        `BodyPart selector "all" must be true or false; it is ${String(selector["all"])}.`,
    });
  }

  const hasIds =
    selector["ids"] !== undefined;

  const hasTypes =
    selector["types"] !== undefined;

  const hasTags =
    selector["tags"] !== undefined;

  const hasStates =
    selector["states"] !== undefined;

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

  if (hasIds) {
    issues.push(
      ...validateIdentifierFilter(
        selector["ids"],
        "id",
      ),
    );
  }

  if (hasTypes) {
    issues.push(
      ...validateIdentifierFilter(
        selector["types"],
        "type",
      ),
    );
  }

  if (hasTags) {
    issues.push(
      ...validateIdentifierFilter(
        selector["tags"],
        "tag",
      ),
    );
  }

  if (hasStates) {
    const states = selector["states"];

    if (!Array.isArray(states)) {
      issues.push({
        code: "malformed-filter",
        message:
          "BodyPart selector state filter must be a list of states.",
      });
    } else if (states.length === 0) {
      issues.push({
        code: "empty-state-filter",
        message:
          "BodyPart selector state filter must not be empty.",
      });
    } else {
      const seenStates = new Set<unknown>();

      for (const state of states) {
        /*
         * Checked against the VOCABULARY, not merely for being a non-empty
         * string. A state of "bogus" is not a narrow filter — it matches no
         * BodyPart that can exist, so a selector carrying one selects nothing
         * and looks like content that was simply never satisfied.
         *
         * Reported before the duplicate check, so two bogus states produce one
         * complaint each rather than one about repetition.
         */
        if (!(BODY_PART_STATES as readonly unknown[]).includes(state)) {
          issues.push({
            code: "invalid-state",
            message:
              `BodyPart selector contains ${String(state)}, which is not a BodyPart state.`,
          });

          continue;
        }

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
  }

  /*
   * Asked last, and only about the two fields' PRESENCE, so it says nothing
   * that depends on either being well formed. A tagMode beside a malformed tag
   * filter is a second complaint about a field already being replaced.
   */
  const tagMode = selector["tagMode"];

  if (tagMode !== undefined) {
    if (!hasTags) {
      issues.push({
        code: "tag-mode-without-tags",
        message:
          "BodyPart selector tagMode may only be provided when a tag filter exists.",
      });
    }

    /*
     * A closed vocabulary, checked rather than assumed. matchesBodyPartSelector
     * asks `tagMode === "all"` and treats everything else as "any", so an
     * unrecognised mode does not fail — it silently loosens the selector from
     * "has all these tags" to "has any of them", which is the difference
     * between a Wing-and-Left filter and a Wing-or-Left one.
     */
    if (tagMode !== "all" && tagMode !== "any") {
      issues.push({
        code: "invalid-tag-mode",
        message:
          `BodyPart selector tagMode must be "all" or "any"; it is ${String(tagMode)}.`,
      });
    }
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