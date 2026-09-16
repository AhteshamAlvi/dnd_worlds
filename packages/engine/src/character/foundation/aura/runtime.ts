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
import { costPriorityOf } from "../../../runtime/requests";
import type { GameTimestamp } from "../../../time/types";

import type { AuraTransitionContext } from "./budget";
import {
  auraFundingSucceeded,
  DEFAULT_AURA_SHORTFALL,
  permitsPartialAuraFunding,
  type AuraFundingOutcome,
  type AuraShortfallPolicy,
} from "./funding";
import type { CharacterAuraState } from "./state";
import { fundActionAura, type AuraStateTransition } from "./transitions";


/** The one cost kind Aura currently answers. */
export const AURA_ACTION_COST = "aura.action-cost";


/**
 * A domain asking Aura to pay for an action.
 *
 * `requested` is the requester's own estimate, reported back against what Aura
 * actually charged. The AUTHORITATIVE figure is whatever the expenditure rules
 * produce: a requester that disagrees does not win, it is simply told.
 *
 * `additionalPhysicalCostRate` is the application's own declared share of
 * Maximum Aura, and is absent for almost everything. Aura may never infer it —
 * not from an exertion tier, not from what the action looks like — because the
 * effort an action takes is charged by the hour through the activity the
 * character is in, and a second inferred charge here would bill it twice.
 */
export interface AuraCostRequest extends QuantitativeRequest {
  readonly kind: typeof AURA_ACTION_COST;

  readonly additionalPhysicalCostRate?: number;
  readonly baseAuraCost?: number;
  readonly requiredOutput?: number;

  /**
   * What to do when the reserve cannot meet the authoritative cost.
   *
   * Absent means `require-full`, which is what every cost did before policies
   * existed — so a caller that says nothing keeps the atomic refusal they
   * already relied on. `allowPartial` on the base request is DERIVED from this
   * rather than set beside it: two fields that can disagree about whether
   * partial payment is permitted is one field too many, and the coordinator
   * reads the base one.
   */
  readonly shortfall?: AuraShortfallPolicy;
}


/**
 * Where a cost came from, and what actually happened to it.
 *
 * Published through `CostCommitResult.detail`, so an operation's `resolve` can
 * read what the pool was really charged instead of subtracting two Aura states
 * and re-deriving Control — which is this domain's arithmetic being done
 * badly by somebody who does not own it.
 */
export interface AuraCostDetail {
  readonly funding: AuraFundingOutcome;

  /** Whether the mechanic that asked for this may proceed. */
  readonly succeeded: boolean;
}


export interface AuraSpentEvent extends Omit<RuntimeEvent, "sequence"> {
  readonly kind: "aura-spent";
  readonly domain: "aura";

  /** The complete funding record, so the log can be read without the state. */
  readonly ledger: AuraFundingOutcome;
}


/*
 * Assemble the ledger entry from the request and what the transition did.
 *
 * Kept out of `commit` so that the figures are derived in ONE place from the
 * transition's own result rather than reconstructed beside the event and again
 * beside the outcome. Every number here is read off the transition; none is
 * recomputed.
 *
 * A transition with no `funding` record paid in full through the ordinary
 * path — there was no shortfall to settle — so the entry is filled in from the
 * balance, with unmet demand at zero because there genuinely was none.
 */
/*
 * What actually left the reserve.
 *
 * Read off the settlement rather than recovered as `-currentChange`. The two
 * agree mathematically and NOT in binary floating point: the state's new
 * current is `old - spent`, so subtracting it back out at a reserve of 10,000
 * returns `spent` wrong in the twelfth decimal place — which was enough to
 * make a fully-funded cost look like an underpayment and fail an operation
 * that had done nothing wrong. The figure the settlement produced is the
 * figure, and it is bit-identical to the price when nothing was short.
 */
function auraChargedAmount(transition: AuraStateTransition): number {
  const funding = transition.funding;

  if (funding === undefined) return -transition.currentChange;

  return funding.cost.physical.cost + funding.settlement.funded;
}


/*
 * What the rules priced, as opposed to what the reserve met.
 *
 * Read off the transition's own funding record so that the handler and the
 * ledger quote one figure. A transition with no funding record had no
 * shortfall to settle and paid exactly what it was priced, so the amount that
 * left the pool IS the price.
 */
function authoritativeAuraCost(transition: AuraStateTransition): number {
  const funding = transition.funding;

  if (funding === undefined) return -transition.currentChange;

  return funding.cost.physical.cost + (funding.cost.deliberate?.finalCost ?? 0);
}


function auraFundingOutcome(
  request: AuraCostRequest,
  transition: AuraStateTransition,
): AuraFundingOutcome {
  const spent = auraChargedAmount(transition);
  const funding = transition.funding;

  const authoritativeCost = authoritativeAuraCost(transition);

  return {
    requestId: request.requestId,
    owner: ownerKey(request.to),
    /* Who asked. Provenance, so the ledger can say which mechanic spent this. */
    source: ownerKey(request.from),
    priority: costPriorityOf(request),
    policy: request.shortfall ?? DEFAULT_AURA_SHORTFALL,

    requested: request.requested,
    authoritativeCost,
    accessibleCapacity: funding?.accessibleCapacity ?? 0,

    funded: spent,

    /*
     * Zero, and not a guess. An action cost is Aura LEAVING the reserve;
     * Output commitment is a separate operation on the allocations, and
     * reporting a commitment here that no allocation records would put a
     * number in the ledger that nothing in the state agrees with.
     */
    committed: 0,

    controlDelta: funding?.controlDelta ?? 0,
    unmet: funding?.settlement.unmet ?? 0,
    usefulAura: funding?.usefulAura ?? null,
    status: funding?.settlement.status ?? "funded",
  };
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
       *
       * `fundActionAura` under `require-full` is the behaviour this handler
       * had before shortfall policies existed, so a request that declares
       * nothing is charged exactly as it always was.
       */
      const attempt = fundActionAura(
        current,
        context,
        {
          ...(auraRequest.additionalPhysicalCostRate === undefined
            ? {}
            : {
              additionalPhysicalCostRate:
                auraRequest.additionalPhysicalCostRate,
            }),
          ...(auraRequest.baseAuraCost === undefined
            ? {}
            : { baseAuraCost: auraRequest.baseAuraCost }),
          ...(auraRequest.requiredOutput === undefined
            ? {}
            : { requiredOutput: auraRequest.requiredOutput }),
        },
        auraRequest.shortfall ?? DEFAULT_AURA_SHORTFALL,
      );

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
          actual: auraChargedAmount(attempt.payload),

          /*
           * What the EXPENDITURE RULES priced, which is the figure full
           * payment is judged against. The requester's estimate is not
           * binding: a dexterous character asking to spend 10 is charged 0.6,
           * and that is a cost paid in full rather than an underpayment.
           */
          authoritative: authoritativeAuraCost(attempt.payload),

          prepared,
        },
        trace: attempt.trace,
        warnings: attempt.warnings,
      };
    },

    commit(cost: PreparedCost): CostCommitResult {
      const { transition, request } = cost.prepared as PreparedAuraCost;

      const actual = auraChargedAmount(transition);
      const funding = auraFundingOutcome(request, transition);

      /*
       * The event carries the whole ledger entry, not just the two figures the
       * generic outcome has room for. "Spent 4" and "asked for 10, priced at
       * 10, funded 4, 6 unmet, attempt failed below its minimum of 10" are the
       * same transaction, and only the second one can be read back later
       * without guessing.
       */
      const event: AuraSpentEvent = {
        kind: "aura-spent",
        domain: "aura",
        operationId: request.operationId,
        occurredAt: request.occurredAt,
        source: request.from,
        target: request.to,
        change: { requested: request.requested, actual },
        ledger: funding,
      };

      return {
        outcome: {
          requestId: cost.requestId,
          requested: request.requested,
          actual,
        },
        events: [event],
        detail: {
          funding,
          succeeded: auraFundingSucceeded(funding.status),
        } satisfies AuraCostDetail,
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
  readonly additionalPhysicalCostRate?: number;
  readonly baseAuraCost?: number;
  readonly requiredOutput?: number;

  /** Which costs this owner funds first. Higher resolves first. */
  readonly costPriority?: number;

  /** What to do on a shortage. Absent is the atomic `require-full`. */
  readonly shortfall?: AuraShortfallPolicy;
}): AuraCostRequest {
  const shortfall = input.shortfall ?? DEFAULT_AURA_SHORTFALL;

  return {
    requestId: input.requestId,
    kind: AURA_ACTION_COST,
    phase: "cost",
    operationId: input.operationId,
    occurredAt: input.occurredAt,
    from: input.from,
    to: input.to,
    requested: input.requested,
    shortfall,

    /*
     * DERIVED, never supplied. The coordinator enforces full payment from
     * `allowPartial`, and the policy is what actually decides whether a
     * partial payment is legal — so setting them independently would let a
     * request declare `scale` and still be refused for underpaying.
     */
    allowPartial: permitsPartialAuraFunding(shortfall),

    ...(input.costPriority === undefined
      ? {}
      : { costPriority: input.costPriority }),
    ...(input.additionalPhysicalCostRate === undefined
      ? {}
      : {
        additionalPhysicalCostRate: input.additionalPhysicalCostRate,
      }),
    ...(input.baseAuraCost === undefined
      ? {}
      : { baseAuraCost: input.baseAuraCost }),
    ...(input.requiredOutput === undefined
      ? {}
      : { requiredOutput: input.requiredOutput }),
  };
}
