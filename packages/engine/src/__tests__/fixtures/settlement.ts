/*
 * Minimal owning domains, so settlement can be tested against a real
 * coordinator rather than a stub of one.
 *
 * Each owner is a single number — an Aura pool, a Body's remaining points —
 * which is enough to prove atomicity, cumulative pricing and rollback without
 * dragging the whole Body model into a settlement test.
 */

import { createTraceNode } from "../../infrastructure/trace";
import type { EngineResult } from "../../infrastructure/result";
import type {
  CostHandler,
  EffectHandler,
  PreparedCost,
} from "../../runtime/coordinator";
import type { RuntimeDomain } from "../../runtime/domains";
import { ownerKey } from "../../runtime/domains";
import type {
  QuantitativeRequest,
  RuntimeRequest,
} from "../../runtime/requests";


/** Spends from a numeric pool, refusing to overdraw it. */
export function poolCostHandler(domain: RuntimeDomain): CostHandler {
  return {
    domain,

    prepare(request: RuntimeRequest, state: unknown): EngineResult<PreparedCost> {
      const pool = state as number;
      const { requested } = request as QuantitativeRequest;

      const root = createTraceNode({
        id: `test.${domain}.prepare`,
        label: `Price a ${domain} cost`,
        inputs: { requested: { value: requested }, pool: { value: pool } },
        output: requested <= pool,
      });

      if (requested > pool) {
        return {
          success: false,
          trace: { root },
          warnings: [],
          errors: [{
            code: `test.${domain}.insufficient`,
            message: `Not enough ${domain}.`,
            audience: "player",
            required: String(requested),
            actual: String(pool),
          }],
        };
      }

      return {
        success: true,
        trace: { root },
        warnings: [],
        payload: {
          requestId: request.requestId,
          owner: request.to,
          nextState: pool - requested,
          actual: requested,
          prepared: requested,
        },
      };
    },

    commit(prepared: PreparedCost) {
      const amount = prepared.actual ?? 0;

      return {
        outcome: {
          requestId: prepared.requestId,
          requested: amount,
          actual: amount,
        },
        events: [],
      };
    },
  };
}


/** Subtracts an effect from a numeric pool, never below zero. */
export function poolEffectHandler(
  domain: RuntimeDomain,
  operationId: string,
  occurredAt: number,
): EffectHandler {
  return {
    domain,

    applyBatch(requests: readonly RuntimeRequest[], state: unknown) {
      const pool = state as number;

      let applied = 0;

      const outcomes = requests.map((request) => {
        const { requested } = request as QuantitativeRequest;
        const actual = Math.min(requested, pool - applied);

        applied += actual;

        return { requestId: request.requestId, requested, actual };
      });

      return {
        state: pool - applied,
        outcomes,
        events: requests.map((request) => ({
          kind: request.kind,
          domain,
          operationId,
          occurredAt,
        })),
      };
    },
  };
}


export function stateOf(states: Record<string, unknown>, domain: RuntimeDomain, id: string): number {
  return states[ownerKey({ domain, id })] as number;
}
