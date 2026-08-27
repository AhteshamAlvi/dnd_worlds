/*
 * EngineResult<T> — the envelope every engine entry point returns.
 *
 * A discriminated union on `success`, so the payload is only reachable once
 * the caller has checked it. Both branches carry the trace, so a failure
 * still explains how far the calculation got before it stopped.
 */

import type { EngineTrace } from "./trace";
import type { EngineError, Warning } from "./diagnostics";

// An array the type system guarantees holds at least one element.
export type NonEmptyArray<T> = [T, ...T[]];

// The call completed; the payload is present.
export interface EngineSuccess<T> {
    success: true;
    payload: T;

    trace: EngineTrace;
    warnings: Warning[];
}

// The call stopped; at least one error explains why, and there is no payload.
export interface EngineFailure {
    success: false;

    trace: EngineTrace;
    warnings: Warning[];
    errors: NonEmptyArray<EngineError>;
}

// What every engine entry point returns; check `success` to narrow it.
export type EngineResult<T> =
    | EngineSuccess<T>
    | EngineFailure;