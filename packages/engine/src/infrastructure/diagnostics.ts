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