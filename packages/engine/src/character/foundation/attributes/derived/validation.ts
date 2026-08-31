/*
 * Derived Attribute validation.
 *
 * Derived Attributes are resolved character-facing values calculated from
 * Base Attributes.
 *
 * Because Derived Attributes are rounded during resolution, every resolved
 * Derived Attribute must be a finite whole number.
 */

import {
  DERIVED_ATTRIBUTE_NAMES,
  type DerivedAttributeName,
  type DerivedAttributes,
} from "./types";

import type {
  EngineError,
} from "../../../../infrastructure/diagnostics";

import type {
  EngineResult,
  NonEmptyArray,
} from "../../../../infrastructure/result";

import {
  createTraceNode,
  type TraceNodeInput,
} from "../../../../infrastructure/trace";


/**
 * Validates a single resolved Derived Attribute value.
 */
export function validateDerivedAttributeValue(
  name: DerivedAttributeName,
  value: number,
): EngineResult<number> {
  const errors: EngineError[] = [];

  collectDerivedAttributeErrors(
    name,
    value,
    errors,
  );

  return finishValidation(value, errors, {
    id: `attributes.derived.${name}.validate`,
    label: `Validate derived attribute: ${name}`,
    formula: "value is finite and a whole number",
    inputs: {
      name: { value: name },
      value: {
        value:
          Number.isFinite(value)
            ? value
            : String(value),
      },
    },
  });
}


/**
 * Validates the complete resolved Derived Attribute set.
 */
export function validateDerivedAttributes(
  attributes: DerivedAttributes,
): EngineResult<DerivedAttributes> {
  const errors: EngineError[] = [];

  const inputs: Record<string, { value: number | string }> = {};

  for (const name of DERIVED_ATTRIBUTE_NAMES) {
    collectDerivedAttributeErrors(name, attributes[name], errors);

    inputs[name] = { value: safeNumber(attributes[name]) };
  }

  return finishValidation(attributes, errors, {
    id: "attributes.derived.validate",
    label: "Validate Derived Attributes",
    formula:
      "all Derived Attribute values are finite whole numbers",
    inputs,
  });
}


/**
 * Collects validation errors for one Derived Attribute.
 */
function collectDerivedAttributeErrors(
  name: DerivedAttributeName,
  value: number,
  errors: EngineError[],
): void {
  if (!Number.isFinite(value)) {
    errors.push({
      code: `attributes.derived.${name}.non-finite`,
      message:
        `Derived Attribute "${name}" must be finite.`,
      audience: "developer",
      required: "finite whole number",
      actual: String(value),
    });

    return;
  }

  if (!Number.isInteger(value)) {
    errors.push({
      code: `attributes.derived.${name}.non-integer`,
      message:
        `Derived Attribute "${name}" must be a whole number.`,
      audience: "developer",
      required: "finite whole number",
      actual: value,
    });
  }
}


/**
 * Converts non-finite numbers into strings so they can safely appear in
 * diagnostic trace data.
 */
function safeNumber(
  value: number,
): number | string {
  return Number.isFinite(value)
    ? value
    : String(value);
}


/**
 * Produces the engine's standard validation result.
 */
function finishValidation<T>(
  value: T,
  errors: EngineError[],
  traceInput: TraceNodeInput,
): EngineResult<T> {
  const trace = {
    root: createTraceNode({
      ...traceInput,
      output: errors.length === 0,
    }),
  };

  if (errors.length > 0) {
    return {
      success: false,
      trace,
      warnings: [],
      errors:
        errors as NonEmptyArray<EngineError>,
    };
  }

  return {
    success: true,
    payload: value,
    trace,
    warnings: [],
  };
}