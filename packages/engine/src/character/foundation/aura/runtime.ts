/*
 * Aura's side of the runtime protocol.
 *
 * The reference migration for a domain that owns a SPENDABLE RESOURCE. Nen,
 * Combat and Items will all eventually need Aura paid on their behalf, and
 * none of them may reach into the pool to take it — they raise a cost request
 * and Aura decides, which is what stops four domains each carrying a partial
 * copy of the expenditure rules.
 *
 *
 * WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT
 *
 * It adds nothing to the arithmetic. `spendActionAura` already validated
 * affordability before deducting, already committed physical and deliberate
 * cost together, already returned a fresh state and already refused to touch
 * the input — the protocol described that function accurately before the
 * protocol existed. What was missing was the TYPED surface: a way for a domain
 * that is not Aura to ask for that behaviour, and a shared shape for the answer.
 *
 * So no formula, threshold or balance figure moves here. `prepare` calls the
 * existing transition against THE STATE IT IS HANDED and returns the resulting
 * state; `commit` turns that into an outcome and an event.
 *
 * Two things about that are corrections to how this file first worked, and
 * both were wrong in the same direction — a handler keeping state of its own:
 *
 *   - It closed over one starting state and prepared every cost against it, so
 *     two 60-Aura costs both validated against a 100-Aura pool. Preparing
 *     against the draft is what makes costs cumulative.
 *   - It published the result through a `committedState()` side channel rather
 *     than returning it, which meant the authoritative Aura state lived
 *     somewhere the coordinator could not see and the type system could not
 *     check. The returned state is now the only answer.
 *
 * And a third, which survived the first two fixes. It closed over ONE
 * character's context — their Attributes, their Aura access, their Control
 * multiplier — so once states became owner-keyed, two characters had separate
 * pools that were both charged using the first one's body. Separate pools and
 * a shared calculation is arguably worse than a shared pool, because the
 * numbers look individual and are not. Context is now resolved per owner from
 * `request.to`, with a missing one refusing the operation rather than falling
 * back to anybody else's.
 */

import type { EngineResult } from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";
import type {
  CostCommitResult,
  CostHandler,
  PreparedCost,
} from "../../../runtime/coordinator";
import type { RuntimeEvent } from "../../../runtime/events";
import { ownerKey, type RuntimeOwnerRef } from "../../../runtime/domains";
import type {
  QuantitativeRequest,
  RuntimeRequest,
} from "../../../runtime/requests";
import type { GameTimestamp } from "../../../time/types";

import type { AuraTransitionContext } from "./budget";
import type { CharacterAuraState } from "./state";
import { spendActionAura, type AuraStateTransition } from "./transitions";


/** The one cost kind Aura currently answers. */
export const AURA_ACTION_COST = "aura.action-cost";


/**
 * A domain asking Aura to pay for an action.
 *
 * `requested` is the requester's own estimate, reported back against what Aura
 * actually charged. The AUTHORITATIVE figure is whatever the expenditure rules
 * produce from the load: a requester that disagrees does not win, it is simply
 * told. Exertion load is relative to the actor and must be supplied, because
 * Aura may never infer whether a blow was strenuous for the body that threw it.
 */
export interface AuraCostRequest extends QuantitativeRequest {
  readonly kind: typeof AURA_ACTION_COST;

  readonly exertionLoad?: number;
  readonly baseAuraCost?: number;
  readonly requiredOutput?: number;
}


export interface AuraSpentEvent extends Omit<RuntimeEvent, "sequence"> {
  readonly kind: "aura-spent";
  readonly domain: "aura";
}


interface PreparedAuraCost {
  readonly transition: AuraStateTransition;
  readonly request: AuraCostRequest;
}


/**
 * How a caller supplies each Aura owner's resolution context.
 *
 * A lookup rather than a map so a host may resolve lazily from whatever it
 * already holds. It must be a pure read: returning a different context for the
 * same owner within one operation would make the answer depend on call order,
 * and mutating anything inside it would be the state side channel the returned
 * draft exists to replace.
 *
 * `undefined` means "this engine does not know that character", which refuses
 * the operation. It must never mean "use somebody else's".
 */
export type AuraContextLookup = (
  owner: RuntimeOwnerRef,
) => AuraTransitionContext | undefined;


/**
 * Aura as a cost handler.
 *
 * Stateless in both senses that matter: it holds no pool, and it holds no
 * single character's context. The pool arrives with each call and leaves in the
 * return value; the context is looked up from the owner the request names. One
 * handler serves every Aura owner in an operation, because there is one Aura
 * mechanic and it applies to everybody — what differs is whose body it is
 * applied to.
 */
export function createAuraCostHandler(
  contextForOwner: AuraContextLookup,
): CostHandler {
  return {
    domain: "aura",

    /*
     * Pure. It reads the state it is handed, returns the state that paying
     * would produce, and writes nothing anywhere — so the coordinator can
     * discard the whole attempt and Aura is exactly where it was.
     */
    prepare(
      request: RuntimeRequest,
      state: unknown,
    ): EngineResult<PreparedCost> {
      const auraRequest = request as AuraCostRequest;
      const current = state as CharacterAuraState;

      /*
       * THIS owner's context. Falling back to a default here would charge
       * Killua's pool using Gon's Attributes and report a confident figure.
       */
      const context = contextForOwner(request.to);

      if (context === undefined) {
        const root = createTraceNode({
          id: "aura.transition.action",
          label: "Spend Aura on an action",
          inputs: { owner: { value: ownerKey(request.to) } },
        });

        root.output = false;

        return {
          success: false,
          trace: { root },
          warnings: [],
          errors: [{
            code: "aura.runtime.context.missing",
            message:
              `No Aura resolution context was supplied for "${ownerKey(request.to)}".`,
            audience: "developer",
            required: "an AuraTransitionContext for this owner",
            actual: "absent",
          }],
        };
      }

      /*
       * The existing transition IS the validation. Re-deriving affordability
       * here would be a second opinion about the same question, free to drift
       * from the one that actually charges.
       */
      const attempt = spendActionAura(current, context, {
        ...(auraRequest.exertionLoad === undefined
          ? {}
          : { exertionLoad: auraRequest.exertionLoad }),
        ...(auraRequest.baseAuraCost === undefined
          ? {}
          : { baseAuraCost: auraRequest.baseAuraCost }),
        ...(auraRequest.requiredOutput === undefined
          ? {}
          : { requiredOutput: auraRequest.requiredOutput }),
      });

      if (!attempt.success) {
        return {
          success: false,
          trace: attempt.trace,
          warnings: attempt.warnings,
          errors: attempt.errors,
        };
      }

      const prepared: PreparedAuraCost = {
        transition: attempt.payload,
        request: auraRequest,
      };

      return {
        success: true,
        payload: {
          requestId: request.requestId,
          owner: request.to,
          nextState: attempt.payload.state,
          actual: -attempt.payload.currentChange,
          prepared,
        },
        trace: attempt.trace,
        warnings: attempt.warnings,
      };
    },

    commit(cost: PreparedCost): CostCommitResult {
      const { transition, request } = cost.prepared as PreparedAuraCost;

      const actual = -transition.currentChange;

      const event: AuraSpentEvent = {
        kind: "aura-spent",
        domain: "aura",
        operationId: request.operationId,
        occurredAt: request.occurredAt,
        source: request.from,
        target: request.to,
        change: { requested: request.requested, actual },
      };

      return {
        outcome: {
          requestId: cost.requestId,
          requested: request.requested,
          actual,
        },
        events: [event],
      };
    },
  };
}


/**
 * Build a well-formed Aura cost request.
 *
 * A helper rather than a bare object literal so the operation id and timestamp
 * cannot be forgotten: an event naming no operation is a fact with nothing to
 * attach it to.
 */
export function auraCostRequest(input: {
  readonly requestId: string;
  readonly operationId: string;
  readonly occurredAt: GameTimestamp;
  readonly from: RuntimeOwnerRef;

  /** Whose Aura. The owner this cost is priced and charged against. */
  readonly to: RuntimeOwnerRef;

  readonly requested: number;
  readonly exertionLoad?: number;
  readonly baseAuraCost?: number;
  readonly requiredOutput?: number;
}): AuraCostRequest {
  return {
    requestId: input.requestId,
    kind: AURA_ACTION_COST,
    phase: "cost",
    operationId: input.operationId,
    occurredAt: input.occurredAt,
    from: input.from,
    to: input.to,
    requested: input.requested,
    allowPartial: false,
    ...(input.exertionLoad === undefined
      ? {}
      : { exertionLoad: input.exertionLoad }),
    ...(input.baseAuraCost === undefined
      ? {}
      : { baseAuraCost: input.baseAuraCost }),
    ...(input.requiredOutput === undefined
      ? {}
      : { requiredOutput: input.requiredOutput }),
  };
}
