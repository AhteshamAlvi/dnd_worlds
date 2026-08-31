/*
 * The rule itself: outside the band is reachable, but not on your own.
 *
 * `assessStature` only describes a body. This file is where the description
 * becomes a rule, and it is deliberately the only part of the subsystem that
 * can refuse anything — the same split as Strength, where the resolvers answer
 * questions and only `advanceStrength` is a transaction.
 *
 * What it does NOT do is decide which Traits or Conditions grant what. Body
 * does not import identity and must never grow a list of height-granting
 * Traits. The layer that owns that content builds StatureJustifications from
 * it and passes them in; this file checks coverage and nothing else.
 */

import { createTraceNode } from "../../../../infrastructure/trace";
import type { EngineError } from "../../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../../infrastructure/result";
import type {
  StatureAssessment,
  StatureDimensionAssessment,
  StatureJustification,
} from "./types";


function describe(
  dimension: "height" | "mass",
  assessment: StatureDimensionAssessment,
): string {
  const unit = dimension === "height" ? "cm" : "kg";

  const direction = assessment.deviation === "below" ? "below" : "above";

  const bound =
    assessment.deviation === "below"
      ? assessment.band.min
      : assessment.band.max;

  return (
    `${assessment.resolved.toFixed(2)} ${unit} is ` +
    `${assessment.ratio.toFixed(4)} of the ordinary ` +
    `${assessment.ordinary.toFixed(2)} ${unit} for this Species at this age, ` +
    `${direction} the ordinary ${dimension} bound of ${bound}`
  );
}


function isCovered(
  dimension: "height" | "mass",
  assessment: StatureDimensionAssessment,
  justifications: readonly StatureJustification[],
): boolean {
  if (assessment.deviation === "within") return true;

  return justifications.some(
    (justification) =>
      justification.dimension === dimension &&
      justification.deviation === assessment.deviation,
  );
}


/*
 * Confirms every exceptional dimension is accounted for.
 *
 * Coverage is per dimension AND per direction. A Trait explaining unusual
 * height does not explain unusual shortness, and one explaining great mass
 * does not explain a body that is impossibly tall — so a character carrying
 * one justification and two deviations still fails, with an error naming the
 * one that is unexplained.
 *
 * An ordinary body needs no justifications and passes with an empty list.
 * Surplus justifications are not an error: a Trait that grants great height to
 * a character who has not used it is unremarkable, and refusing it would make
 * Traits interact with each other through this function.
 */
export function checkStatureJustified(
  assessment: StatureAssessment,
  justifications: readonly StatureJustification[],
): EngineResult<StatureAssessment> {
  const trace = {
    root: createTraceNode({
      id: "body.stature.justification",
      label: "Check stature against the Species ordinary bands",
      inputs: {
        heightRatio: { value: assessment.height.ratio },
        massRatio: { value: assessment.mass.ratio },
        justifications: { value: justifications.length },
      },
    }),
  };

  const errors: EngineError[] = [];

  const dimensions = [
    ["height", assessment.height],
    ["mass", assessment.mass],
  ] as const;

  for (const [dimension, dimensionAssessment] of dimensions) {
    if (isCovered(dimension, dimensionAssessment, justifications)) continue;

    errors.push({
      code: `body.stature.unjustified-${dimension}`,
      message:
        `This body's ${dimension} is outside what this Species ordinarily ` +
        `produces: ${describe(dimension, dimensionAssessment)}. A Trait or ` +
        `Condition granting it is required.`,
      audience: "gm",
      required: `${dimension} ratio within ` +
        `${dimensionAssessment.band.min}-${dimensionAssessment.band.max}`,
      actual: dimensionAssessment.ratio,
      resolution:
        `Add a Trait or Condition that grants ${dimensionAssessment.deviation}` +
        `-ordinary ${dimension}, or bring the body inside the band.`,
    });
  }

  if (errors.length > 0) {
    return {
      success: false,
      trace,
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  }

  return {
    success: true,
    payload: assessment,
    trace,
    warnings: [],
  };
}
