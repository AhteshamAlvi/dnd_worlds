/*
 * Structural validation for a set of *stored* attribute scores.
 *
 * This answers "is this well-formed enough to compute with", not "is this
 * character balanced". The result carries the trace either way, so a
 * rejection still shows which checks ran.
 *
 * The 1-30 ladder applies to authored values only. Base and Resolved scores
 * are derived, and a Trait or a Condition may legitimately drive one of them
 * outside the ladder — running this over a derived layer would report the
 * penalty working correctly as an error.
 */

import type { EngineError } from "../../../infrastructure/diagnostics";
import type { EngineResult, NonEmptyArray } from "../../../infrastructure/result";
import { createTraceNode, type EngineTrace } from "../../../infrastructure/trace";

import { ATTRIBUTE_KEYS, ATTRIBUTE_MAX, ATTRIBUTE_MIN } from "./base";
import type { Attributes } from "./types";

// Checks every stored attribute is a whole number inside the legal range.
export function validateAttributes(
  attributes: Attributes,
): EngineResult<Attributes> {
  const errors: EngineError[] = [];

  for (const key of ATTRIBUTE_KEYS) {
    const value = attributes[key];

    if (!Number.isInteger(value)) {
      errors.push({
        code: "character.attribute.not_integer",
        message: `${key.toUpperCase()} must be an integer.`,
        audience: "player",
        required: "integer",
        // A non-finite score would not survive JSON, so it is reported as
        // the string it prints as rather than dropped.
        actual: Number.isFinite(value) ? value : String(value),
        resolution: `Set ${key.toUpperCase()} to a whole number between ${ATTRIBUTE_MIN} and ${ATTRIBUTE_MAX}.`,
      });

      continue;
    }

    if (value < ATTRIBUTE_MIN || value > ATTRIBUTE_MAX) {
      errors.push({
        code: "character.attribute.out_of_range",
        message: `${key.toUpperCase()} must be between ${ATTRIBUTE_MIN} and ${ATTRIBUTE_MAX}.`,
        audience: "player",
        required: {
          min: ATTRIBUTE_MIN,
          max: ATTRIBUTE_MAX,
        },
        actual: value,
        resolution: `Set ${key.toUpperCase()} to a value between ${ATTRIBUTE_MIN} and ${ATTRIBUTE_MAX}.`,
      });
    }
  }

  // Records every attribute that was checked and whether the set passed.
  const trace: EngineTrace = {
    root: createTraceNode({
      id: "character.attributes.validate",
      label: "Validate attributes",
      formula: `each attribute is an integer in ${ATTRIBUTE_MIN}..${ATTRIBUTE_MAX}`,
      inputs: Object.fromEntries(
        ATTRIBUTE_KEYS.map((key) => [
          key,
          {
            value: Number.isFinite(attributes[key])
              ? attributes[key]
              : String(attributes[key]),
          },
        ]),
      ),
      output: errors.length === 0,
    }),
  };

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
    payload: attributes,
    trace,
    warnings: [],
  };
}
