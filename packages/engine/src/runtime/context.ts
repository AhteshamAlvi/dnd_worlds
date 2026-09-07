/*
 * The identity of one engine operation.
 *
 * Every state change the engine makes belongs to an operation, and every event
 * and request it produces names that operation. Without it a log is a pile of
 * facts in arrival order with nothing saying which attack, which activation or
 * which hour of sleep produced any of them.
 *
 *
 * WHY THE CALLER SUPPLIES BOTH FIELDS
 *
 * `operationId` is not generated here and `occurredAt` is not read from a
 * clock. Both are inputs, for the same reason dice are inputs: an engine that
 * invents either one cannot be replayed. Given the same state, context,
 * command and dice, this engine returns the same everything — and a generated
 * id or a clock read inside the calculation breaks that on the first attempt
 * to reproduce a session.
 *
 * It also keeps the ownership honest. Time owns the clock (see time/clock.ts),
 * and an operation that reached for the current instant itself would be a
 * second reader of the world's time, free to disagree with the first.
 */

import type { EngineError } from "../infrastructure/diagnostics";
import type { GameTimestamp } from "../time/types";


/**
 * What every coordinated operation is handed.
 *
 * Deliberately minimal. It identifies the operation and places it in time; it
 * carries no actor, no command and no rules, because those differ per domain
 * and this shape has to be the one thing every domain agrees on.
 */
export interface RuntimeOperationContext {
  /**
   * Stable across a replay of the same session.
   *
   * The engine never generates one. A host that has no natural id should
   * derive it from something it can reproduce — a sequence number, an event
   * log offset — and not from a random source or a wall clock.
   */
  readonly operationId: string;

  /** The game instant this operation happens at, supplied by the caller. */
  readonly occurredAt: GameTimestamp;
}


/**
 * Judge an operation context before anything reads it.
 *
 * An empty operation id is refused rather than defaulted, because a default
 * would collide with every other defaulted operation and quietly merge two
 * unrelated operations' events into one story.
 */
export function findOperationContextIssues(
  context: RuntimeOperationContext,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (
    typeof context.operationId !== "string" ||
    context.operationId.trim().length === 0
  ) {
    errors.push({
      code: "runtime.operation.id.invalid",
      message: "An operation must carry a non-empty, caller-supplied id.",
      audience: "developer",
      required: "non-empty string",
      actual: String(context.operationId),
    });
  }

  if (!Number.isFinite(context.occurredAt)) {
    errors.push({
      code: "runtime.operation.timestamp.invalid",
      message: "An operation must happen at a finite game timestamp.",
      audience: "developer",
      required: "finite GameTimestamp",
      actual: String(context.occurredAt),
    });
  }

  return errors;
}
