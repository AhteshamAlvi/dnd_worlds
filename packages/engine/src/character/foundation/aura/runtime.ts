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
 * existing transition and keeps its result; `commit` hands back the state that
 * was already computed. The two phases exist because atomicity across several
 * domains needs them — the Aura must be known payable before the Action is
 * spent, and the Action before the Aura — and because they see ONE calculation
 * rather than two, committing cannot disagree with what was validated.
 */

import type { EngineResult } from "../../../infrastructure/result";
import type {
  CostCommitResult,
  CostHandler,
  PreparedCost,
} from "../../../runtime/coordinator";
import type { RuntimeEvent } from "../../../runtime/events";
import type { RuntimeDomain } from "../../../runtime/domains";
import type { RuntimeRequest } from "../../../runtime/requests";
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
export interface AuraCostRequest extends RuntimeRequest {
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
 * Aura as a cost handler, plus the state it has committed.
 *
 * The committed state is read back from the handler rather than pushed through
 * a callback, because a callback fires during the coordinator's commit pass and
 * makes the order of side effects part of the protocol. Reading afterwards
 * keeps the handler's only externally visible behaviour a value.
 */
export interface AuraCostHandler {
  readonly handler: CostHandler;

  /** The Aura state after commitment, or the original if nothing committed. */
  committedState(): CharacterAuraState;
}


export function createAuraCostHandler(
  state: CharacterAuraState,
  context: AuraTransitionContext,
): AuraCostHandler {
  let committed = state;

  const handler: CostHandler = {
    domain: "aura",

    prepare(request: RuntimeRequest): EngineResult<PreparedCost> {
      const auraRequest = request as AuraCostRequest;

      /*
       * The existing transition IS the validation. Re-deriving affordability
       * here would be a second opinion about the same question, free to drift
       * from the one that actually charges.
       */
      const attempt = spendActionAura(state, context, {
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
          domain: "aura",
          actual: -attempt.payload.currentChange,
          prepared,
        },
        trace: attempt.trace,
        warnings: attempt.warnings,
      };
    },

    commit(cost: PreparedCost): CostCommitResult {
      const { transition, request } = cost.prepared as PreparedAuraCost;

      committed = transition.state;

      const actual = -transition.currentChange;

      const event: AuraSpentEvent = {
        kind: "aura-spent",
        domain: "aura",
        operationId: request.operationId,
        occurredAt: request.occurredAt,
        source: { domain: request.from, id: request.sourceId ?? "" },
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

  return { handler, committedState: () => committed };
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
  readonly from: RuntimeDomain;
  readonly requested: number;
  readonly sourceId?: string;
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
    to: "aura",
    requested: input.requested,
    allowPartial: false,
    ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
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
