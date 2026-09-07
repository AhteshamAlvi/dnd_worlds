/*
 * When an action may be taken, and what kind of time it is being taken in.
 *
 *
 * WHY THIS IS NOT A COMBAT CONCEPT
 *
 * Structured time — turns, an Action economy, initiative — is Combat's to
 * schedule, but "this capability is usable as a Reaction" is a property of the
 * capability and is true whether or not a Combat is running. If the flag lived
 * in Combat, then a Skill's own definition could not state it, and every
 * non-Combat consumer would have to ask a Combat module a question that has
 * nothing to do with Combat.
 *
 * So the vocabulary lives here and Combat consumes it. `actions/` never
 * imports Combat; architecture.test.ts enforces that.
 *
 * The execution context is the other half: the same intent can be attempted
 * inside structured time or outside it, and only the structured case has an
 * Action economy to pay. An unstructured context carries no timing at all,
 * rather than a default one, because "which of your two Actions was that"
 * has no answer while nobody is taking turns.
 */

import type { EngineError } from "../infrastructure/diagnostics";


export const ACTION_TIMINGS = ["action", "reaction"] as const;

export type ActionTiming = typeof ACTION_TIMINGS[number];


export function isActionTiming(value: unknown): value is ActionTiming {
  return typeof value === "string" &&
    (ACTION_TIMINGS as readonly string[]).includes(value);
}


export interface UnstructuredExecutionContext {
  readonly kind: "unstructured";
}


export interface StructuredExecutionContext {
  readonly kind: "structured";
  readonly timing: ActionTiming;
}


export type ExecutionContext =
  | UnstructuredExecutionContext
  | StructuredExecutionContext;


export const UNSTRUCTURED_EXECUTION: UnstructuredExecutionContext = {
  kind: "unstructured",
};


export function isStructuredExecution(
  context: ExecutionContext,
): context is StructuredExecutionContext {
  return context.kind === "structured";
}


export function findExecutionContextIssues(
  context: ExecutionContext,
): readonly EngineError[] {
  if (context.kind === "unstructured") return [];

  if (context.kind === "structured") {
    if (!isActionTiming(context.timing)) {
      return [{
        code: "actions.timing.invalid",
        message: "A structured execution context must state a known timing.",
        audience: "developer",
        required: [...ACTION_TIMINGS],
        actual: String(context.timing),
      }];
    }

    return [];
  }

  return [{
    code: "actions.execution-context.kind.invalid",
    message: "An execution context must be structured or unstructured.",
    audience: "developer",
    required: ["structured", "unstructured"],
    actual: String((context as { kind?: unknown }).kind),
  }];
}


export function findAllowedTimingsIssues(
  timings: readonly ActionTiming[],
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (timings.length === 0) {
    /*
     * A capability usable at no timing is unusable in structured time, which
     * is a coherent thing to say only by accident. An author who means "never
     * inside Combat" should say so with an empty list on purpose, so this is a
     * warning-shaped situation rather than an error — but an EMPTY list that
     * also contains junk is worth catching, so the loop below still runs.
     */
    return errors;
  }

  const seen = new Set<string>();

  for (const timing of timings) {
    if (!isActionTiming(timing)) {
      errors.push({
        code: "actions.timing.invalid",
        message: `"${String(timing)}" is not a known Action timing.`,
        audience: "developer",
        required: [...ACTION_TIMINGS],
        actual: String(timing),
      });

      continue;
    }

    if (seen.has(timing)) {
      errors.push({
        code: "actions.timing.duplicate",
        message: `Timing "${timing}" is allowed more than once.`,
        audience: "developer",
        required: "each timing at most once",
        actual: timing,
      });
    }

    seen.add(timing);
  }

  return errors;
}
