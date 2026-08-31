/*
 * Body Point validation.
 *
 * Much smaller than it used to be, because most of what it used to check no
 * longer exists. The old BP system authored its own Base BP and computed its
 * own morphology, so it needed validation for both; BP now consumes Structural
 * Capacity and morphology factors that morphology/validation.ts and
 * structure/validation.ts have already vetted. Re-checking them here would be
 * a second opinion on a settled question.
 *
 * What is left is what only BP knows: that Constitution is a usable number,
 * that destruction-resistance modifiers are usable multipliers, and that
 * stored integrity is a legal fraction.
 */

import { createBodyPartDefinitionMap } from "../selectors";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "../anatomy/types";
import type { BodyPointModifier } from "./types";


export type BodyPointValidationIssueCode =
  | "invalid-constitution"
  | "invalid-destruction-resistance"
  | "unknown-body-part-definition"
  | "invalid-integrity"
  | "destroyed-part-carries-integrity";


export interface BodyPointValidationIssue {
  readonly code: BodyPointValidationIssueCode;
  readonly message: string;

  readonly partId?: BodyPartId;
}


export interface BodyPointValidationResult {
  readonly valid: boolean;
  readonly issues: readonly BodyPointValidationIssue[];
}


function createValidationResult(
  issues: readonly BodyPointValidationIssue[],
): BodyPointValidationResult {
  return {
    valid: issues.length === 0,
    issues,
  };
}


/*
 * A destruction-resistance multiplier must be finite and above zero.
 *
 * Zero is rejected rather than treated as "indestructible in reverse": it
 * would drive Maximum BP to zero, and the floor in roundMaximumBP would then
 * quietly rescue it to 1, turning an authoring error into a body part that
 * silently ignores the effect placed on it.
 */
export function validateBodyPointModifier(
  modifier: BodyPointModifier,
): BodyPointValidationResult {
  const { multiplier } = modifier.operation;

  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return createValidationResult([
      {
        code: "invalid-destruction-resistance",
        message:
          `Destruction-resistance multiplier must be finite and greater ` +
          `than 0; got ${multiplier}.`,
      },
    ]);
  }

  return createValidationResult([]);
}


export function validateBodyPointModifiers(
  modifiers: readonly BodyPointModifier[],
): BodyPointValidationResult {
  return createValidationResult(
    modifiers.flatMap(
      (modifier) => validateBodyPointModifier(modifier).issues,
    ),
  );
}


/*
 * Validates everything BP resolution assumes about its inputs.
 *
 * The integrity rules are the interesting ones, and they are two halves of the
 * same invariant:
 *
 *   an active part must carry integrity in (0, 1]
 *   a departed part must carry no integrity at all
 *
 * Integrity of exactly 0 on an active part is rejected rather than clamped,
 * because it is the state the whole integrity model exists to make
 * unrepresentable. A part with nothing left is destroyed, and destruction is a
 * transition to "archived-removed" performed by damage application — never a
 * number that happens to reach a threshold. Allowing a stored 0 would
 * reintroduce exactly the bug the model was built to prevent: a part that is
 * dead by arithmetic, and that a later Maximum BP increase brings back.
 */
export function validateBodyPointResolution(
  anatomy: Anatomy,
  constitution: number,
  definitions: readonly BodyPartDefinition[],
  modifiers: readonly BodyPointModifier[] = [],
): BodyPointValidationResult {
  const issues: BodyPointValidationIssue[] = [];

  if (!Number.isFinite(constitution)) {
    issues.push({
      code: "invalid-constitution",
      message: `Constitution must be a finite number; got ${constitution}.`,
    });
  }

  issues.push(...validateBodyPointModifiers(modifiers).issues);

  const definitionsById = createBodyPartDefinitionMap(definitions);

  for (const part of anatomy.parts) {
    if (!definitionsById.has(part.type)) {
      issues.push({
        code: "unknown-body-part-definition",
        partId: part.id,
        message:
          `BodyPart "${part.id}" references unknown BodyPartDefinition ` +
          `"${part.type}".`,
      });
    }

    if (part.state !== "active") {
      /*
       * A departed part keeps no integrity. Its structure is not damaged, it
       * is absent, and storing a fraction for it would invite a restoration
       * mechanic to read it as "how hurt was this when we lost it" — a
       * question the archive record does not answer.
       */
      if (part.integrity !== 0) {
        issues.push({
          code: "destroyed-part-carries-integrity",
          partId: part.id,
          message:
            `BodyPart "${part.id}" is ${part.state} and must carry integrity ` +
            `0; got ${part.integrity}.`,
        });
      }

      continue;
    }

    if (
      !Number.isFinite(part.integrity) ||
      part.integrity <= 0 ||
      part.integrity > 1
    ) {
      issues.push({
        code: "invalid-integrity",
        partId: part.id,
        message:
          `BodyPart "${part.id}" has integrity ${part.integrity}; an active ` +
          `BodyPart must carry integrity within (0, 1]. Zero is reserved for ` +
          `destruction, which is an anatomy state transition.`,
      });
    }
  }

  return createValidationResult(issues);
}
