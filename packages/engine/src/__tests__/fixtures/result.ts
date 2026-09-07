/*
 * Unwrapping EngineResult in tests.
 *
 * Since the check and sensory resolvers started returning EngineResult, every
 * assertion about a resolution has to get past the envelope first. Doing that
 * inline three times per test buries the assertion, and `if (!r.success)
 * throw` at every call site reads as defensive code rather than as a test
 * expectation.
 *
 * These two say what the test expects: this call succeeded and here is the
 * value, or this call failed and here are the codes. A wrong expectation
 * fails with the codes it actually got rather than with a type error.
 */

import type { EngineResult } from "../../infrastructure/result";


export function payloadOf<T>(result: EngineResult<T>): T {
  if (!result.success) {
    throw new Error(
      `Expected success, got failure: ${
        result.errors.map((error) => error.code).join(", ")
      }`,
    );
  }

  return result.payload;
}


export function errorCodesOf(
  result: EngineResult<unknown>,
): readonly string[] {
  if (result.success) {
    throw new Error("Expected failure, got success.");
  }

  return result.errors.map((error) => error.code);
}
