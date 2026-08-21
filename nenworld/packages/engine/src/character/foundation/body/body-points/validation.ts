/*
 * Body Point validation.
 *
 * This module validates data used by the Body Point derivation pipeline:
 *
 * - morphology results;
 * - BP modifier operations;
 * - Constitution input;
 * - compatibility between Resolved Anatomy and Resolved Morphology;
 * - derived Base-BP viability.
 *
 * Structural Anatomy validation belongs to anatomy/validation.ts.
 *
 * BodyPartSelector validation belongs to body/selectors.ts.
 */

import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "../anatomy/types";
import {
  createBodyPartDefinitionMap,
} from "../selectors";
import {
  resolveBodyPointModifiers,
} from "./modifiers";
import type {
  BodyPointModifier,
  ResolvedBodyPartMorphology,
  ResolvedMorphology,
} from "./types";


/*
 * Stable machine-readable Body Point validation categories.
 */
export type BodyPointValidationIssueCode =
  | "invalid-constitution"
  | "invalid-additive-base-bp"
  | "invalid-bp-multiplier"
  | "invalid-morphology-context"
  | "duplicate-morphology-part"
  | "missing-morphology-part"
  | "unexpected-morphology-part"
  | "morphology-type-mismatch"
  | "invalid-template-base-bp"
  | "invalid-morphology-factor"
  | "invalid-morphology-multiplier"
  | "invalid-morphology-adjusted-base-bp"
  | "invalid-resolved-base-bp";


/*
 * One BP-domain validation failure.
 */
export interface BodyPointValidationIssue {
  readonly code:
    BodyPointValidationIssueCode;

  readonly message: string;

  readonly partId?: BodyPartId;
}


/*
 * Result returned by Body Point validation.
 */
export interface BodyPointValidationResult {
  readonly valid: boolean;
  readonly issues:
    readonly BodyPointValidationIssue[];
}


/*
 * Creates a validation result from collected issues.
 */
function createValidationResult(
  issues:
    readonly BodyPointValidationIssue[],
): BodyPointValidationResult {
  return {
    valid: issues.length === 0,
    issues,
  };
}


/*
 * A morphology multiplier/factor must remain finite and greater than 0.
 *
 * Values below 1 are valid and represent morphology that reduces Base BP.
 */
function isValidPositiveFactor(
  value: number,
): boolean {
  return (
    Number.isFinite(value) &&
    value > 0
  );
}


/*
 * Validates one BodyPointModifier's operation.
 *
 * Selector validity is intentionally not duplicated here. The shared selector
 * layer owns selector validation.
 *
 * Additive Base-BP adjustments may be positive, zero, or negative, but they
 * must be finite.
 *
 * True multipliers must be finite and greater than 0.
 */
export function validateBodyPointModifier(
  modifier: BodyPointModifier,
): BodyPointValidationResult {
  const issues:
    BodyPointValidationIssue[] = [];

  switch (modifier.operation.kind) {
    case "adjust-base-bp": {
      if (
        !Number.isFinite(
          modifier.operation.amount,
        )
      ) {
        issues.push({
          code:
            "invalid-additive-base-bp",
          message:
            "adjust-base-bp amount must be finite.",
        });
      }

      break;
    }

    case "multiply-bp": {
      if (
        !Number.isFinite(
          modifier.operation.multiplier,
        ) ||
        modifier.operation.multiplier <= 0
      ) {
        issues.push({
          code:
            "invalid-bp-multiplier",
          message:
            "multiply-bp multiplier must be finite and greater than 0.",
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
 * Validates a collection of BodyPointModifiers.
 */
export function validateBodyPointModifiers(
  modifiers:
    readonly BodyPointModifier[],
): BodyPointValidationResult {
  const issues:
    BodyPointValidationIssue[] = [];

  for (const modifier of modifiers) {
    issues.push(
      ...validateBodyPointModifier(
        modifier,
      ).issues,
    );
  }

  return createValidationResult(
    issues,
  );
}


/*
 * Validates the character-wide morphology context.
 */
function validateMorphologyContext(
  morphology: ResolvedMorphology,
): readonly BodyPointValidationIssue[] {
  const issues:
    BodyPointValidationIssue[] = [];

  const {
    heightRatio,
    buildMassFactor,
    expectedMassKg,
    residualMassRatio,
    residualMassFactor,
  } = morphology.context;

  const contextValues: readonly [
    string,
    number,
  ][] = [
    [
      "heightRatio",
      heightRatio,
    ],
    [
      "buildMassFactor",
      buildMassFactor,
    ],
    [
      "expectedMassKg",
      expectedMassKg,
    ],
    [
      "residualMassRatio",
      residualMassRatio,
    ],
    [
      "residualMassFactor",
      residualMassFactor,
    ],
  ];

  for (
    const [
      name,
      value,
    ] of contextValues
  ) {
    if (!isValidPositiveFactor(value)) {
      issues.push({
        code:
          "invalid-morphology-context",
        message:
          `Morphology context "${name}" must be finite and greater than 0.`,
      });
    }
  }

  return issues;
}


/*
 * Validates one BodyPart's resolved morphology result.
 */
function validateResolvedBodyPartMorphology(
  morphology:
    ResolvedBodyPartMorphology,
): readonly BodyPointValidationIssue[] {
  const issues:
    BodyPointValidationIssue[] = [];

  if (
    !Number.isFinite(
      morphology.templateBaseBP,
    ) ||
    morphology.templateBaseBP <= 0
  ) {
    issues.push({
      code:
        "invalid-template-base-bp",
      message:
        `BodyPart "${morphology.partId}" has invalid template Base BP.`,
      partId:
        morphology.partId,
    });
  }

  const factors:
    readonly [string, number][] = [
      [
        "height",
        morphology.factors.height,
      ],
      [
        "mass",
        morphology.factors.mass,
      ],
      [
        "muscularity",
        morphology.factors.muscularity,
      ],
      [
        "adiposity",
        morphology.factors.adiposity,
      ],
    ];

  for (
    const [
      name,
      value,
    ] of factors
  ) {
    if (!isValidPositiveFactor(value)) {
      issues.push({
        code:
          "invalid-morphology-factor",
        message:
          `BodyPart "${morphology.partId}" has invalid ${name} morphology factor.`,
        partId:
          morphology.partId,
      });
    }
  }

  if (
    !isValidPositiveFactor(
      morphology.factors
        .combinedMultiplier,
    )
  ) {
    issues.push({
      code:
        "invalid-morphology-multiplier",
      message:
        `BodyPart "${morphology.partId}" has invalid combined morphology multiplier.`,
      partId:
        morphology.partId,
    });
  }

  if (
    !Number.isFinite(
      morphology
        .morphologyAdjustedBaseBP,
    ) ||
    morphology
      .morphologyAdjustedBaseBP <= 0
  ) {
    issues.push({
      code:
        "invalid-morphology-adjusted-base-bp",
      message:
        `BodyPart "${morphology.partId}" has invalid morphology-adjusted Base BP.`,
      partId:
        morphology.partId,
    });
  }

  return issues;
}


/*
 * Validates a complete ResolvedMorphology result by itself.
 */
export function validateResolvedMorphology(
  morphology: ResolvedMorphology,
): BodyPointValidationResult {
  const issues:
    BodyPointValidationIssue[] = [];

  issues.push(
    ...validateMorphologyContext(
      morphology,
    ),
  );

  const seenPartIds =
    new Set<BodyPartId>();

  for (
    const part of morphology.parts
  ) {
    if (
      seenPartIds.has(
        part.partId,
      )
    ) {
      issues.push({
        code:
          "duplicate-morphology-part",
        message:
          `Resolved morphology contains duplicate BodyPart "${part.partId}".`,
        partId:
          part.partId,
      });
    } else {
      seenPartIds.add(
        part.partId,
      );
    }

    issues.push(
      ...validateResolvedBodyPartMorphology(
        part,
      ),
    );
  }

  return createValidationResult(
    issues,
  );
}


/*
 * Validates that ResolvedMorphology describes exactly the supplied Anatomy.
 *
 * Every BodyPart must have exactly one morphology result.
 *
 * Morphology results for BodyParts that no longer exist in the resolved
 * Anatomy are invalid.
 */
function validateMorphologyCoverage(
  anatomy: Anatomy,
  morphology: ResolvedMorphology,
): readonly BodyPointValidationIssue[] {
  const issues:
    BodyPointValidationIssue[] = [];

  const anatomyById =
    new Map(
      anatomy.parts.map(
        (part) => [
          part.id,
          part,
        ],
      ),
    );

  const morphologyById =
    new Map(
      morphology.parts.map(
        (part) => [
          part.partId,
          part,
        ],
      ),
    );

  for (
    const part of anatomy.parts
  ) {
    const partMorphology =
      morphologyById.get(
        part.id,
      );

    if (
      partMorphology === undefined
    ) {
      issues.push({
        code:
          "missing-morphology-part",
        message:
          `BodyPart "${part.id}" is missing resolved morphology.`,
        partId:
          part.id,
      });

      continue;
    }

    if (
      partMorphology.type !==
      part.type
    ) {
      issues.push({
        code:
          "morphology-type-mismatch",
        message:
          `BodyPart "${part.id}" has morphology type "${partMorphology.type}" but Anatomy type "${part.type}".`,
        partId:
          part.id,
      });
    }
  }

  for (
    const part of morphology.parts
  ) {
    if (
      !anatomyById.has(
        part.partId,
      )
    ) {
      issues.push({
        code:
          "unexpected-morphology-part",
        message:
          `Resolved morphology references BodyPart "${part.partId}" that is not present in Anatomy.`,
        partId:
          part.partId,
      });
    }
  }

  return issues;
}


/*
 * Validates everything specifically required before resolving Body Points.
 *
 * Anatomy itself is assumed to have already passed anatomy/validation.ts.
 *
 * This function checks:
 *
 * - Constitution is finite;
 * - BP modifier operations are valid;
 * - morphology is internally valid;
 * - morphology exactly matches the current Anatomy;
 * - the final additive Base-BP stage remains greater than 0 for every part.
 */
export function validateBodyPointResolution(
  anatomy: Anatomy,
  morphology: ResolvedMorphology,
  constitution: number,
  bodyPartDefinitions:
    readonly BodyPartDefinition[],
  modifiers:
    readonly BodyPointModifier[] = [],
): BodyPointValidationResult {
  const issues:
    BodyPointValidationIssue[] = [];

  if (!Number.isFinite(constitution)) {
    issues.push({
      code:
        "invalid-constitution",
      message:
        "Constitution must be finite for Body Point resolution.",
    });
  }

  issues.push(
    ...validateBodyPointModifiers(
      modifiers,
    ).issues,
  );

  issues.push(
    ...validateResolvedMorphology(
      morphology,
    ).issues,
  );

  issues.push(
    ...validateMorphologyCoverage(
      anatomy,
      morphology,
    ),
  );

  /*
   * Validate the combined Base-BP stage for every BodyPart for which valid
   * morphology exists.
   *
   * Individual negative additive modifiers are legal, but their final combined
   * effect may not reduce an existing BodyPart's resolved Base BP to zero or
   * below.
   */
  const morphologyById =
    new Map(
      morphology.parts.map(
        (part) => [
          part.partId,
          part,
        ],
      ),
    );

  const definitionsByType =
    createBodyPartDefinitionMap(
      bodyPartDefinitions,
    );

  for (
    const part of anatomy.parts
  ) {
    const partMorphology =
      morphologyById.get(
        part.id,
      );

    if (
      partMorphology === undefined
    ) {
      continue;
    }

    const partDefinition =
      definitionsByType.get(
        part.type,
      );

    if (partDefinition === undefined) {
      throw new Error(
        `Cannot validate BP resolution for BodyPart "${part.id}": ` +
        `unknown BodyPartDefinition "${part.type}".`,
      );
    }

    const resolvedModifiers =
      resolveBodyPointModifiers(
        part,
        partDefinition,
        modifiers,
      );

    const resolvedBaseBP =
      partMorphology
        .morphologyAdjustedBaseBP +
      resolvedModifiers
        .additiveBaseBP;

    if (
      !Number.isFinite(
        resolvedBaseBP,
      ) ||
      resolvedBaseBP <= 0
    ) {
      issues.push({
        code:
          "invalid-resolved-base-bp",
        message:
          `BodyPart "${part.id}" resolves to Base BP ${resolvedBaseBP}; resolved Base BP must remain finite and greater than 0.`,
        partId:
          part.id,
      });
    }
  }

  return createValidationResult(
    issues,
  );
}