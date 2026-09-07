/*
 * The shape every state-changing operation returns.
 *
 *   TransitionResult<TState, TChange>
 *     = EngineResult<TransitionOutcome<TState, TChange>>
 *
 * Deliberately built ON the existing EngineResult rather than beside it. A
 * second top-level success/failure envelope would mean every caller checking
 * two different shapes and every helper written twice, and the engine already
 * has one that carries a trace through both branches.
 *
 *
 * WHAT EACH FIELD MEANS, AND WHY THEY ARE NOT INTERCHANGEABLE
 *
 *   state     the new authoritative value. THE answer.
 *   events    facts that already happened. Explanatory, never authoritative.
 *   requests  typed work another owner must resolve. Not yet done.
 *   changes   what this operation asked for against what it got.
 *   trace     how it was calculated. On the EngineResult, both branches.
 *   errors    why it could not BEGIN. Failure branch only.
 *   warnings  non-fatal concerns, through the existing infrastructure.
 *
 * The distinction that does the most work is errors versus events. An error
 * means nothing happened: no cost committed, no effect applied, every input
 * unchanged. A failed attack is NOT an error — it is a successful transition
 * containing a failed-check event, because the swing happened, the Action is
 * gone and the Aura is spent. Collapsing those two would either refund
 * everything a miss cost or make a validation bug look like bad luck.
 *
 *
 * GENERIC OVER STATE AND CHANGES ONLY
 *
 * The ticket's sketch was generic over events and requests too. That cannot be
 * routed: if each domain has its own unrelated event and request types, the
 * coordinator has no supertype to dispatch on and every domain needs bespoke
 * plumbing. Events and requests are therefore a shared discriminated base that
 * domains EXTEND — `RuntimeEvent` and `RuntimeRequest` — which keeps them
 * typed per domain while remaining routable in a mixed list.
 */

import type { EngineResult } from "../infrastructure/result";

import type { RuntimeEvent } from "./events";
import type { RuntimeRequest } from "./requests";


export interface TransitionOutcome<TState, TChange> {
  /** The new authoritative state. */
  readonly state: TState;

  /** What already happened, in deterministic order. */
  readonly events: readonly RuntimeEvent[];

  /** What another owner still has to resolve. */
  readonly requests: readonly RuntimeRequest[];

  /** Requested against actual, in whatever shape the domain needs. */
  readonly changes: TChange;
}


/**
 * A state-changing operation's result.
 *
 * A failure carries NO outcome, so there is no partially-updated state for a
 * caller to store back by mistake. The caller keeps the input state it already
 * had, which the operation has not touched.
 */
export type TransitionResult<TState, TChange> = EngineResult<
  TransitionOutcome<TState, TChange>
>;


/*
 * Not everything is a transition.
 *
 * A pure calculation — Speed to metres, a Derived Attribute, an Aura Control
 * multiplier — changes no state, owes no events and has nothing to request. It
 * returns its value, or an EngineResult when its input can be malformed.
 * Wrapping those in a transition would add an empty event list and an unchanged
 * state to several hundred call sites and teach readers that the shape means
 * nothing.
 *
 * The test is whether the operation OWNS state that differs afterwards.
 */


/** Assemble an outcome with its events already in order. */
export function transitionOutcome<TState, TChange>(
  state: TState,
  changes: TChange,
  events: readonly RuntimeEvent[] = [],
  requests: readonly RuntimeRequest[] = [],
): TransitionOutcome<TState, TChange> {
  return {
    state,
    changes,
    events: [...events].sort((left, right) => left.sequence - right.sequence),
    requests: [...requests],
  };
}
