/*
 * Failure construction for the sensory resolvers.
 *
 * These resolvers used to signal bad input by throwing RangeError, which made
 * "no dice were supplied" the one sensory problem a caller had to write a
 * try/catch for while every other invalid input came back as data. They now
 * return EngineResult like the rest of the engine, and this is the shared way
 * they build the failure branch.
 *
 * What still throws, deliberately: calling the PASSIVE resolver with a
 * non-passive request. That is not a caller supplying bad data, it is engine
 * code calling the wrong function, and turning it into a value would let a
 * mistake in the dispatch above it be handled as though the character had
 * simply failed to perceive something.
 */

import type { EngineError } from "../../../infrastructure/diagnostics";
import {
  engineFailure,
  type EngineFailure,
} from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";


export function sensoryFailure(
  traceId: string,
  label: string,
  error: EngineError,
): EngineFailure {
  return engineFailure(
    {
      root: createTraceNode({
        id: traceId,
        label,
        formula: "rejected before resolution",
        output: error.code,
      }),
    },
    [error],
  );
}


export function missingSensoryDiceError(
  what: string,
): EngineError {
  return {
    code: "character.senses.dice.missing",
    message: `${what} requires supplied d20 dice.`,
    audience: "developer",
    required: "CheckDiceInput",
    actual: "absent",
  };
}


export function mismatchedSensoryRouteError(
  expected: string,
  actual: string,
): EngineError {
  return {
    code: "character.senses.route.mismatch",
    message: "Detection and Concealment must describe the same sensory route.",
    audience: "developer",
    required: expected,
    actual,
  };
}
