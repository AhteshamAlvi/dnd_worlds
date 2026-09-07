/*
 * Events: facts that have already happened.
 *
 * An event never instructs anybody to do anything. It reports that something
 * DID occur, after it occurred, to whoever is reading — a log, a narration, a
 * UI, a Foundry module, a replay tool.
 *
 *
 * STATE IS AUTHORITATIVE; EVENTS EXPLAIN
 *
 * The returned state is the answer. Events are the account of how it got
 * there, and nothing in the engine rebuilds state by folding them. This is the
 * opposite of event sourcing and it is a deliberate choice: a fold has to be
 * kept in step with the calculation forever, and the day the two disagree the
 * sheet and the log both look plausible while one of them is wrong.
 *
 * So an event may be dropped, batched, filtered or ignored with no
 * consequence for correctness. That is what makes it safe to emit generously.
 *
 *
 * REQUESTED VERSUS ACTUAL
 *
 * An event carries both figures whenever they differ, because "spent 40 Aura"
 * and "tried to spend 60 and could only spend 40" are different facts and only
 * one of them is true. Resistance, immunity, caps and empty pools all show up
 * here as an `actual` below `requested` — never as a failure, because the
 * operation genuinely happened and genuinely accomplished less than it asked.
 */

import type { GameTimestamp } from "../time/types";

import type { RuntimeActorRef, RuntimeDomain } from "./domains";


/**
 * A requested figure against the one that actually landed.
 *
 * Present on an event only when the two can differ. An event reporting a fact
 * with no magnitude — a shutdown, an expiry — carries no change.
 */
export interface RuntimeValueChange {
  readonly requested: number;
  readonly actual: number;
}


/**
 * Everything every event carries.
 *
 * Domains extend this with their own `kind` and their own fields. The base is
 * what makes a mixed list of events from four domains sortable, filterable and
 * attributable without knowing any of their kinds.
 */
export interface RuntimeEvent {
  /** Discriminator. Domains own their own kind strings. */
  readonly kind: string;

  /** The operation this fact belongs to. */
  readonly operationId: string;

  /** When it happened, in game time. */
  readonly occurredAt: GameTimestamp;

  /** Which state owner produced it. */
  readonly domain: RuntimeDomain;

  /**
   * Position within the operation.
   *
   * Assigned by the coordinator in resolution order, not by the caller. Two
   * events at one timestamp are still ordered, and that order is stable across
   * runs — which is what lets a replay compare event streams at all.
   */
  readonly sequence: number;

  /** What caused it, when there is a meaningful actor. */
  readonly source?: RuntimeActorRef;

  /** What it happened to, when that differs from the source. */
  readonly target?: RuntimeActorRef;

  /** Present when the operation asked for more than it got. */
  readonly change?: RuntimeValueChange;
}


/** True when the operation accomplished less than it asked for. */
export function wasReduced(event: RuntimeEvent): boolean {
  return (
    event.change !== undefined && event.change.actual < event.change.requested
  );
}


/** True when nothing at all landed — a full prevention, resist or immunity. */
export function wasPrevented(event: RuntimeEvent): boolean {
  return (
    event.change !== undefined &&
    event.change.requested > 0 &&
    event.change.actual === 0
  );
}


/*
 * The order events are reported in.
 *
 * Sequence first, because the coordinator already assigned it in resolution
 * order. The rest are tie-breaks for events assembled outside a coordinated
 * operation, and they end on a string comparison so that two callers who built
 * the same set of events differently still read them the same way.
 */
export function compareRuntimeEvents(
  left: RuntimeEvent,
  right: RuntimeEvent,
): number {
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  if (left.occurredAt !== right.occurredAt) {
    return left.occurredAt - right.occurredAt;
  }
  if (left.domain !== right.domain) {
    return left.domain.localeCompare(right.domain);
  }

  return left.kind.localeCompare(right.kind);
}
