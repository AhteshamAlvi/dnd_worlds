/*
 * Measurement validation — the preconditions the resolvers assume.
 *
 * anatomy/validation.ts already covers the per-field rules: coordinates within
 * [0, 1], a height contribution within [0, 1], an axis sign of exactly +/-1, a
 * known presence state, no parent cycles. This file covers the things that are
 * only visible once anatomy and definitions are looked at together, and that
 * Height in particular depends on being true.
 *
 * The split matters because the resolvers throw rather than degrade. Height
 * cannot return a sensible number for a cyclic geometry and must not invent
 * one, so the failure needs somewhere to be reported as an issue rather than
 * as an exception thrown at whoever happened to ask for a character sheet.
 */

import { createBodyPartDefinitionMap } from "../selectors";
import {
  DEFAULT_ADIPOSE_TISSUE_DENSITY_KG_PER_L,
  resolvePartMeasurements,
} from "./resolution";
import type { BodyMorphology } from "../types";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "../anatomy/types";


/*
 * Stable machine-readable categories for measurement-precondition failures.
 */
export type MeasurementValidationIssueCode =
  | "height-relevant-cycle"
  | "unknown-body-part-type"
  | "invalid-effective-scale"
  | "invalid-adipose-tissue-density"
  | "non-positive-resolved-mass";


/*
 * One measurement precondition failure.
 */
export interface MeasurementValidationIssue {
  readonly code: MeasurementValidationIssueCode;
  readonly message: string;

  readonly partId?: BodyPartId;
}


/*
 * Result returned by measurement validation.
 */
export interface MeasurementValidationResult {
  readonly valid: boolean;
  readonly issues: readonly MeasurementValidationIssue[];
}


function createValidationResult(
  issues: readonly MeasurementValidationIssue[],
): MeasurementValidationResult {
  return {
    valid: issues.length === 0,
    issues,
  };
}


/*
 * Rejects an Effective Scale that measurements cannot be resolved against.
 *
 * Scale multiplies every linear dimension and cubes into Size and Mass, so
 * zero collapses the entire body to a point and a negative value produces
 * negative mass. Neither is a body; both are upstream bugs.
 */
export function findEffectiveScaleIssues(
  effectiveScale: number,
): readonly MeasurementValidationIssue[] {
  if (
    !Number.isFinite(effectiveScale) ||
    effectiveScale <= 0
  ) {
    return [
      {
        code: "invalid-effective-scale",
        message:
          "Effective Scale must be a finite number greater than 0.",
      },
    ];
  }

  return [];
}


/*
 * Rejects Height-relevant anatomy that is not a forest.
 *
 * Height assigns each part a single vertical coordinate by propagating
 * connection constraints outward from an arbitrary origin. That only has a
 * unique answer when there is exactly one path between any two connected
 * parts. Two paths are two independent assertions about the same coordinate,
 * and satisfying both needs a cyclic-constraint solver rather than a
 * traversal.
 *
 * In practice anatomy/validation.ts already makes this unreachable, since
 * every BodyPart has at most one parent and parent cycles are rejected. The
 * check is here anyway because Height's correctness rests on it, and an
 * invariant that nothing checks is an invariant that quietly stops holding.
 *
 * Only active anatomy is considered: a suppressed part is not in the geometry,
 * so it cannot close a loop in it.
 */
export function findHeightRelevantCycleIssues(
  anatomy: Anatomy,
): readonly MeasurementValidationIssue[] {
  const activeIds = new Set<BodyPartId>();

  for (const part of anatomy.parts) {
    if (part.state === "active") activeIds.add(part.id);
  }

  /*
   * A forest has strictly fewer edges than nodes in every component. Counting
   * per component is what makes this precise rather than a global heuristic,
   * so a body that is genuinely two separate structures does not read as
   * cyclic just because it has two roots.
   */
  const componentOf = new Map<BodyPartId, BodyPartId>();

  const find = (id: BodyPartId): BodyPartId => {
    let root = id;

    for (;;) {
      const parent = componentOf.get(root);

      /*
       * Only ids known to be active are ever inserted or looked up, so an
       * absent entry cannot happen. Returning rather than retrying anyway,
       * because the obvious `?? root` spelling of this loop spins forever on
       * exactly that impossible case.
       */
      if (parent === undefined || parent === root) return root;

      root = parent;
    }
  };

  for (const id of activeIds) componentOf.set(id, id);

  const issues: MeasurementValidationIssue[] = [];

  for (const part of anatomy.parts) {
    if (!activeIds.has(part.id)) continue;

    const attachment = part.attachment;

    if (attachment === null) continue;
    if (!activeIds.has(attachment.parentId)) continue;

    const here = find(part.id);
    const there = find(attachment.parentId);

    if (here === there) {
      issues.push({
        code: "height-relevant-cycle",
        message:
          `BodyPart "${part.id}" closes a cycle in the Height-relevant anatomy, ` +
          "which has no unique vertical solution.",
        partId: part.id,
      });

      continue;
    }

    componentOf.set(here, there);
  }

  return issues;
}


/*
 * Validates that a body can have its measurements resolved at all.
 */
export function validateMeasurementInputs(
  anatomy: Anatomy,
  definitions: readonly BodyPartDefinition[],
  effectiveScale: number,
  morphologyByPartId: Readonly<Record<BodyPartId, BodyMorphology>> = {},
  adiposeTissueDensityKgPerL = DEFAULT_ADIPOSE_TISSUE_DENSITY_KG_PER_L,
): MeasurementValidationResult {
  const definitionsById = createBodyPartDefinitionMap(definitions);

  const issues: MeasurementValidationIssue[] = [
    ...findEffectiveScaleIssues(effectiveScale),
  ];

  if (
    !Number.isFinite(adiposeTissueDensityKgPerL) ||
    adiposeTissueDensityKgPerL <= 0
  ) {
    issues.push({
      code: "invalid-adipose-tissue-density",
      message:
        `Adipose tissue density must be finite and greater than 0 kg/L; ` +
        `got ${adiposeTissueDensityKgPerL}.`,
    });
  }

  for (const part of anatomy.parts) {
    if (part.state !== "active") continue;

    if (!definitionsById.has(part.type)) {
      issues.push({
        code: "unknown-body-part-type",
        message:
          `BodyPart "${part.id}" references unknown type "${part.type}", ` +
          "so its physical measurements cannot be resolved.",
        partId: part.id,
      });
    }
  }

  /*
   * Very low Adiposity removes soft tissue, and removing tissue can in
   * principle remove more mass than a part had. The formula subtracts
   * (1 - Adiposity) x volume x density from a part whose lean mass came from
   * its own reference density, so it goes negative only where a definition
   * claims a part is LESS dense than the soft tissue being taken out of it —
   * a physically incoherent authoring combination rather than a legal extreme.
   *
   * No Human part is anywhere near it: the least dense is Upper Body at 0.984
   * kg/L against 0.9 tissue, and its adiposity size sensitivity is 0.22, so
   * even Adiposity 0 leaves it at about 80% of its mass. This exists so that
   * unusual anatomy fails loudly at the point of authoring rather than
   * resolving to a body part that weighs less than nothing.
   */
  for (const part of anatomy.parts) {
    if (part.state !== "active") continue;

    const definition = definitionsById.get(part.type);

    if (definition === undefined) continue;

    const morphology = morphologyByPartId[part.id];

    if (morphology === undefined) continue;

    const resolved = resolvePartMeasurements(
      part.id,
      definition.reference,
      definition.sensitivity,
      morphology,
      effectiveScale,
      adiposeTissueDensityKgPerL,
    );

    if (!Number.isFinite(resolved.massKg) || resolved.massKg <= 0) {
      issues.push({
        code: "non-positive-resolved-mass",
        partId: part.id,
        message:
          `BodyPart "${part.id}" resolves to ${resolved.massKg} kg. Removing ` +
          `soft tissue at Adiposity ${morphology.adiposity} has taken more ` +
          `mass than the part has, which means its adiposity size sensitivity ` +
          `and the Species' adipose tissue density disagree with its own ` +
          `reference density.`,
      });
    }
  }

  issues.push(...findHeightRelevantCycleIssues(anatomy));

  return createValidationResult(issues);
}
