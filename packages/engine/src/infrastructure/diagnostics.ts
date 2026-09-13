/*
 * Warning and EngineError — the two diagnostic shapes the engine emits.
 *
 * Diagnostics describe validation, rule-enforcement, or engine-state
 * information. They are not tactical advice.
 *
 * They live in their own module so trace.ts and result.ts can both use
 * them without depending on each other.
 */

import type { JsonValue } from "./json";

// Controls who is allowed to see a diagnostic.
// Intended hierarchy:
// developer -> sees everything
// gm        -> sees gm + player diagnostics
// player    -> sees player diagnostics only
export type DiagnosticAudience =
    | "player"
    | "gm"
    | "developer";

// What a diagnostic concerns, allowing a UI to associate it with an entity.
export interface DiagnosticSubject {
    kind: string;
    id: string;
}

// A non-blocking diagnostic.
// The operation may still complete successfully.
export interface Warning {
    code: string;
    message: string;
    audience: DiagnosticAudience;
    subject?: DiagnosticSubject;
}

// A blocking diagnostic explaining why an operation could not complete.
export interface EngineError {
    code: string;
    message: string;
    audience: DiagnosticAudience;
    subject?: DiagnosticSubject;

    required?: JsonValue;
    actual?: JsonValue;

    // Optional diagnostic/debug guidance.
    // This should not be treated as automatic tactical advice to players.
    resolution?: string;
}
/**
 * Describe an untrusted value for a diagnostic, without ever asking it.
 *
 * `String(value)` invokes the value's own `toString`/`Symbol.toPrimitive`, and
 * a hostile value can refuse: `Object.create(null)` has no prototype and
 * therefore no `toString`, so coercing one throws "Cannot convert object to
 * primitive value". That turned validators whose entire contract is "returns
 * diagnostics, never throws" into functions that threw while BUILDING the
 * diagnostic explaining why the input was bad.
 *
 * A prototype-less object is not an exotic curiosity. `JSON.parse` with a
 * reviver, a deserialized payload and several library idioms all produce them,
 * which is exactly the provenance of the data these validators exist to judge.
 *
 * So nothing here calls a method the value supplies. Primitives are returned
 * as themselves where JSON allows it; objects are described by
 * `Object.prototype.toString.call`, which reads an internal slot rather than
 * consulting the object. The whole thing is wrapped as a last resort, because
 * a sufficiently adversarial Proxy can throw from a property read too.
 */
export function describeDiagnosticValue(value: unknown): JsonValue {
    try {
        if (value === null) return null;

        switch (typeof value) {
            case "string":
            case "boolean":
                return value;

            case "number":
                // NaN and the infinities are not JSON values.
                return Number.isFinite(value) ? value : `number(${value})`;

            case "undefined":
                return "undefined";

            case "bigint":
                return `bigint(${value.toString()})`;

            case "symbol":
                return "symbol";

            case "function":
                return "function";

            default:
                return Array.isArray(value)
                    ? `array(${value.length})`
                    : Object.prototype.toString.call(value);
        }
    } catch {
        return "[unrepresentable value]";
    }
}
