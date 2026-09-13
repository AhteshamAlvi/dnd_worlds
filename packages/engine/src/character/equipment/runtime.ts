/*
 * Item operations' side of the runtime protocol.
 *
 * `character` is a state OWNER (`runtime/domains.ts`) and, until this file,
 * had no cost handler of its own — every reference migration so far paid a
 * SEPARATE domain (Aura, Body) on a character's behalf. An Item operation is
 * different: what it changes IS the Character's own stored state — an
 * entry's `state` field, or its `quantity` — so the domain paying this cost
 * and the domain it is paid against are the same one.
 *
 *
 * WHY THIS IS A COST, NOT AN EFFECT
 *
 * A `CostHandler.prepare()` may refuse — it returns an `EngineResult`, and a
 * refusal rolls the whole coordinated operation back with nothing committed.
 * An `EffectHandler.applyBatch()` cannot: it always returns a state, because
 * an effect landing on the world is real even when it lands as zero (a
 * resist, an immunity, a cap).
 *
 * Ticket 4.4 needs the FIRST shape. Settlement must re-read the character as
 * they stand right now and re-run the same equip/unequip/use resolver
 * preparation already ran once — and if THAT run disagrees (the entry moved,
 * emptied, or a requirement stopped holding between preparation and
 * settlement), nothing may commit. That is exactly what a cost handler's
 * `prepare()` is for, and nothing about the mechanism requires the cost to be
 * a spendable resource — Aura and ammunition are the common case, not the
 * definition.
 *
 *
 * WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT
 *
 * No new resolution rule. `prepare()` calls `resolveCharacter()` and then the
 * SAME pure `resolveEquipmentTransition()` / `resolveItemUse()` preparation
 * already called once, against whatever Character the draft is currently
 * carrying for this owner — never against a copy this handler keeps. `commit()`
 * turns the already-computed replacement into an outcome and one event, and
 * attaches a "use" operation's resolved `useEffects` to that event, because
 * settlement is the one place they are produced and a caller needs them from
 * somewhere.
 */

import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../../infrastructure/result";
import type { EngineError } from "../../infrastructure/diagnostics";
import { createTraceNode } from "../../infrastructure/trace";
import type {
  CostCommitResult,
  CostHandler,
  EffectBatchResult,
  EffectHandler,
  PreparedCost,
} from "../../runtime/coordinator";
import type { RuntimeEvent } from "../../runtime/events";
import { ownerKey, type RuntimeOwnerRef } from "../../runtime/domains";
import type { QuantitativeRequest, RuntimeRequest, RuntimeRequestOutcome } from "../../runtime/requests";
import type { GameTimestamp } from "../../time/types";

import { resolveCharacter } from "../resolution";
import type { Character } from "../types";
import type { ResolvedRuleEffects } from "../rules/resolution";

import { resolveEquipmentTransition, type EquipmentTransition } from "./transitions";
import { resolveItemUse, type ItemUse } from "./use";
import {
  aggregateItemIntegrity,
  findItemIntegrityIssues,
  findItemIntegrityOperationIssues,
  permitsRepair,
  resolveEffectiveStress,
  withEntryIntegrity,
  type ItemIntegrityOperation,
  type ItemIntegrityState,
} from "./integrity";
import { findInventoryEntryOutcome, type InventoryItemRef } from "./references";
import type { ItemEquipmentState } from "./state";
import { resolveItemDefinition, type ItemDefinitionLookup } from "./validation";
import type { ItemOperation } from "./actions";


/** The one cost kind an Item operation settles through. */
export const ITEM_OPERATION_COST = "character.item-operation";


export interface ItemOperationCostRequest extends RuntimeRequest {
  readonly kind: typeof ITEM_OPERATION_COST;
  readonly operation: ItemOperation;
  readonly item: InventoryItemRef;

  /** Required for "equip" and "unequip". Ignored for "use". */
  readonly destination?: ItemEquipmentState;
}


export interface ItemOperationSettledEvent extends Omit<RuntimeEvent, "sequence"> {
  readonly kind: "item-operation-settled";
  readonly domain: "character";

  readonly operation: ItemOperation;
  readonly item: InventoryItemRef;
  readonly itemId: string;

  /** Present only for a settled "use" that declared useEffects. */
  readonly useEffects?: ResolvedRuleEffects;
}


interface PreparedItemOperation {
  readonly request: ItemOperationCostRequest;
  readonly itemId: string;
  readonly transition?: EquipmentTransition;
  readonly use?: ItemUse;
  readonly useEffects?: ResolvedRuleEffects;
}


function refusal(code: string, message: string, actual: string): {
  readonly code: string;
  readonly message: string;
  readonly audience: "gm";
  readonly required: string;
  readonly actual: string;
} {
  return {
    code,
    message,
    audience: "gm",
    required: "a currently valid, non-stale Item operation",
    actual,
  };
}


/**
 * Item operations as a cost handler for the `character` domain.
 *
 * Stateless: the Character it resolves against arrives with the call and
 * leaves in the returned state, exactly as the Aura reference handler is.
 * One handler serves every character in an operation, because there is one
 * Item-operation mechanic and it applies to everybody.
 *
 * `getItemDefinition` is the same unbound lookup resolveEquipmentTransition()
 * and resolveItemUse() already ask for — this handler calls neither the
 * catalog-bound wrapper in equipment/index.ts nor any lookup of its own, so a
 * host testing against an injected catalog gets the same behaviour a live
 * engine does.
 */
export function createCharacterItemOperationCostHandler(
  getItemDefinition: ItemDefinitionLookup,
): CostHandler {
  return {
    domain: "character",

    prepare(request: RuntimeRequest, state: unknown): EngineResult<PreparedCost> {
      const req = request as ItemOperationCostRequest;
      const character = state as Character;

      const resolvedResult = resolveCharacter(character);

      if (!resolvedResult.success) return resolvedResult;

      const { payload: resolved } = resolvedResult;

      if (req.operation === "use") {
        const result = resolveItemUse({ resolved, item: req.item }, getItemDefinition);

        if (!result.success) return result;

        const resolution = result.payload;

        if (resolution.disposition !== "executed") {
          const root = createTraceNode({
            id: "character.equipment.actions.settle",
            label: "Settle Item operation",
            inputs: { owner: { value: ownerKey(req.to) } },
            output: resolution.disposition,
          });

          return {
            success: false,
            trace: { root },
            warnings: [],
            errors: [refusal(
              "equipment.actions.use.stale",
              "This use could not be settled against the character's current state.",
              resolution.disposition,
            )],
          };
        }

        const prepared: PreparedItemOperation = {
          request: req,
          itemId: resolution.use.itemId,
          use: resolution.use,
          useEffects: resolution.effects,
        };

        return {
          success: true,
          payload: {
            requestId: request.requestId,
            owner: request.to,
            nextState: resolution.nextCharacter,
            prepared,
          },
          trace: result.trace,
          warnings: result.warnings,
        };
      }

      if (req.destination === undefined) {
        const root = createTraceNode({
          id: "character.equipment.actions.settle",
          label: "Settle Item operation",
          inputs: { owner: { value: ownerKey(req.to) } },
          output: "destination_missing",
        });

        return {
          success: false,
          trace: { root },
          warnings: [],
          errors: [{
            code: "equipment.actions.destination.missing",
            message: `An "${req.operation}" operation must declare a destination state.`,
            audience: "developer",
            required: "held, worn, or carried",
            actual: "absent",
          }],
        };
      }

      const result = resolveEquipmentTransition({
        resolved,
        item: req.item,
        destination: req.destination,
      }, getItemDefinition);

      if (!result.success) return result;

      const resolution = result.payload;

      if (resolution.disposition !== "available") {
        const root = createTraceNode({
          id: "character.equipment.actions.settle",
          label: "Settle Item operation",
          inputs: { owner: { value: ownerKey(req.to) } },
          output: resolution.disposition,
        });

        return {
          success: false,
          trace: { root },
          warnings: [],
          errors: [refusal(
            "equipment.actions.transition.stale",
            `This ${req.operation} could not be settled against the character's current state.`,
            resolution.disposition,
          )],
        };
      }

      const prepared: PreparedItemOperation = {
        request: req,
        itemId: resolution.transition.itemId,
        transition: resolution.transition,
      };

      return {
        success: true,
        payload: {
          requestId: request.requestId,
          owner: request.to,
          nextState: resolution.nextCharacter,
          prepared,
        },
        trace: result.trace,
        warnings: result.warnings,
      };
    },

    commit(cost: PreparedCost): CostCommitResult {
      const { request, itemId, useEffects } = cost.prepared as PreparedItemOperation;

      const event: ItemOperationSettledEvent = {
        kind: "item-operation-settled",
        domain: "character",
        operationId: request.operationId,
        occurredAt: request.occurredAt,
        source: request.from,
        target: request.to,
        operation: request.operation,
        item: request.item,
        itemId,
        ...(useEffects === undefined ? {} : { useEffects }),
      };

      return {
        outcome: { requestId: cost.requestId },
        events: [event],
      };
    },
  };
}


/**
 * Build a well-formed Item operation cost request.
 *
 * A helper rather than a bare literal so the operation id and timestamp
 * cannot be forgotten — the same reason `auraCostRequest()` exists.
 */
export function itemOperationCostRequest(input: {
  readonly requestId: string;
  readonly operationId: string;
  readonly occurredAt: GameTimestamp;
  readonly from: RuntimeOwnerRef;
  readonly to: RuntimeOwnerRef;
  readonly operation: ItemOperation;
  readonly item: InventoryItemRef;
  readonly destination?: ItemEquipmentState;
}): ItemOperationCostRequest {
  return {
    requestId: input.requestId,
    kind: ITEM_OPERATION_COST,
    phase: "cost",
    operationId: input.operationId,
    occurredAt: input.occurredAt,
    from: input.from,
    to: input.to,
    operation: input.operation,
    item: input.item,
    ...(input.destination === undefined ? {} : { destination: input.destination }),
  };
}


/* -------------------------------------------------------------------------- */
/* Integrity (Ticket 4.8): an EFFECT, not a cost                              */
/* -------------------------------------------------------------------------- */

/*
 * An EFFECT, deliberately, unlike the item-operation cost handler above.
 * Combat and environment stress arrive as the CONSEQUENCE of an action that
 * has already resolved — the attack that broke a sword still landed, at the
 * sword's pre-break performance, before the break itself is applied — and a
 * cost handler's whole reason to exist is that it may refuse and roll the
 * operation back, which is exactly wrong here: a stress request never fails
 * an operation, it settles what already happened. A repair whose Item
 * refuses it, or that would overshoot the maximum, is not an error either —
 * it is a real outcome with `actual` below `requested`, the same shape a
 * resisted or capped effect always takes.
 */

export const ITEM_STRESS_REQUEST = "item.stress";
export const ITEM_REPAIR_REQUEST = "item.repair";


export interface ItemIntegrityRequest extends QuantitativeRequest {
  readonly kind: typeof ITEM_STRESS_REQUEST | typeof ITEM_REPAIR_REQUEST;
  readonly entryId: string;

  /**
   * Protection a caller already resolved, carried through settlement.
   *
   * The runtime half of the seam integrity.ts describes. It used to stop at
   * the request builder: `itemIntegrityRequest()` took an operation with
   * `mitigation` on it, wrote `requested` and dropped the rest, and the effect
   * handler then rebuilt a bare `{ type: "stress", amount }` — so every
   * mitigation a caller offered survived exactly as far as the function that
   * was supposed to carry it. Present only on a stress request.
   */
  readonly mitigation?: number;
}


export interface ItemIntegrityAppliedEvent extends Omit<RuntimeEvent, "sequence"> {
  readonly kind: "item-integrity-applied";
  readonly domain: "character";
  readonly entryId: string;
  readonly itemId: string;
  readonly stateBefore: ItemIntegrityState;
  readonly stateAfter: ItemIntegrityState;

  /** Stress asked of this entry in the batch, and what mitigation removed. */
  readonly mitigated?: number;
}


interface PendingIntegrityRequest {
  readonly request: ItemIntegrityRequest;
  readonly operation: ItemIntegrityOperation;
}


/** Every request answered with "nothing happened", and nothing mutated. */
function nilOutcome(request: ItemIntegrityRequest): RuntimeRequestOutcome {
  return {
    requestId: request.requestId,
    ...(typeof request.requested === "number" ? { requested: request.requested } : {}),
    actual: 0,
  };
}


/**
 * The operation one request names, or nothing.
 *
 * EXHAUSTIVE, and that is the whole change. This read
 * `kind === ITEM_STRESS_REQUEST ? stress : repair`, so every request that was
 * not a stress became a repair — a request of kind `"item.shatter"`,
 * `"aura.spend"` or `undefined` routed to this handler mended the Item. The
 * handler is the last place a request's kind is read, so a fall-through here
 * is a fall-through nothing downstream can catch.
 *
 * The domain rules — a positive finite amount, mitigation only on stress —
 * stay with `findItemIntegrityOperationIssues()`, which the caller runs next.
 * What this function owns is the discriminant.
 */
function operationOf(request: ItemIntegrityRequest): ItemIntegrityOperation | undefined {
  if (request.kind === ITEM_STRESS_REQUEST) {
    return {
      type: "stress",
      amount: request.requested,
      ...(request.mitigation === undefined ? {} : { mitigation: request.mitigation }),
    };
  }

  if (request.kind === ITEM_REPAIR_REQUEST) {
    return { type: "repair", amount: request.requested };
  }

  return undefined;
}


/**
 * Item integrity as an effect handler for the `character` domain.
 *
 * SIMULTANEOUS, which is the whole of this handler's contract and was the
 * whole of its bug. It used to fold each request into a running Character and
 * re-resolve between them, so two stresses and a repair on one sword came out
 * differently depending on where the repair sat in the batch — and the batch's
 * order is the coordinator's `(kind, requestId)` sort, which means the answer
 * depended on what the requests happened to be CALLED.
 *
 * Requests in one batch describe one instant. So every one of them is
 * evaluated against the same pre-batch Character, grouped by entry, and
 * combined algebraically: total effective stress subtracted, total repair
 * added, the clamp applied once at the end. One replacement state per affected
 * entry, one final Character for the batch, and an outcome list sorted by
 * request id so that two permutations of one batch return byte-identical
 * results rather than merely equivalent ones.
 *
 * Nothing here can fail the operation. A stress consequence settles what has
 * already happened — the attack that broke the sword landed, at the sword's
 * pre-break performance — and a handler that could refuse would unwind the
 * action that caused it. An invalid request, a missing entry, a non-durable
 * Item or a refused repair is a real, zero-effect outcome, and it mutates
 * nothing.
 */
export function createCharacterIntegrityEffectHandler(
  getItemDefinition: ItemDefinitionLookup,
): EffectHandler {
  return {
    domain: "character",

    applyBatch(requests: readonly RuntimeRequest[], state: unknown): EffectBatchResult {
      const preBatch = state as Character;

      const actualByRequestId = new Map<string, RuntimeRequestOutcome>();
      const events: ItemIntegrityAppliedEvent[] = [];

      const typed = requests.map((request) => request as ItemIntegrityRequest);

      for (const request of typed) {
        actualByRequestId.set(request.requestId, nilOutcome(request));
      }

      const finish = (character: Character): EffectBatchResult => ({
        state: character,
        outcomes: [...actualByRequestId.values()].sort((left, right) =>
          left.requestId < right.requestId ? -1 : left.requestId > right.requestId ? 1 : 0,
        ),
        events: [...events].sort((left, right) =>
          left.entryId < right.entryId ? -1 : left.entryId > right.entryId ? 1 : 0,
        ),
      });

      /*
       * Resolved ONCE, from the pre-batch state. The old loop re-resolved
       * between requests, which is what made the running Character a thing at
       * all.
       */
      const resolvedResult = resolveCharacter(preBatch);

      if (!resolvedResult.success) return finish(preBatch);

      const pendingByEntry = new Map<string, PendingIntegrityRequest[]>();

      for (const request of typed) {
        /*
         * Everything about a request is proved BEFORE it is grouped, and a
         * refusal leaves the zero outcome already recorded for it standing —
         * so a malformed request settles nothing and, crucially, does not stop
         * the valid requests beside it in the same batch from settling.
         */
        const operation = operationOf(request);

        if (operation === undefined) continue;

        /*
         * Mitigation is protection against STRESS, and `operationOf()` does
         * not carry it onto a repair — so a repair request that arrived with
         * one would have had the field silently dropped and the repair
         * honoured. Asked of the REQUEST rather than the operation, because
         * the request is where the contradiction is still visible.
         */
        if (request.mitigation !== undefined && request.kind !== ITEM_STRESS_REQUEST) {
          continue;
        }

        if (findItemIntegrityOperationIssues(operation).length > 0) continue;

        if (typeof request.entryId !== "string" || request.entryId.trim().length === 0) {
          continue;
        }

        const pending = pendingByEntry.get(request.entryId) ?? [];

        pending.push({ request, operation });
        pendingByEntry.set(request.entryId, pending);
      }

      let character = preBatch;

      for (const entryId of [...pendingByEntry.keys()].sort()) {
        const pending = [...pendingByEntry.get(entryId)!].sort((left, right) =>
          left.request.requestId < right.request.requestId
            ? -1
            : left.request.requestId > right.request.requestId
              ? 1
              : 0,
        );

        const found = findInventoryEntryOutcome(preBatch.items, entryId);

        if (!found.ok) continue;

        const entry = found.entry;
        /*
         * The SAME shared boundary every other Item consumer goes through, so
         * an entry answered with a different definition settles nothing rather
         * than taking that Item's integrity policy. A refusal here leaves the
         * pre-recorded zero outcome standing and mutates nothing.
         */
        const lookup = resolveItemDefinition(getItemDefinition, entry.itemId);

        if (!lookup.ok) continue;

        const definition = lookup.definition;

        if (definition.integrity === undefined) continue;

        const policy = definition.integrity;

        if (findItemIntegrityIssues(policy).length > 0) continue;

        const before = entry.integrity ?? policy.maximum;

        /*
         * Every request's OWN effective figure, computed against the shared
         * pre-batch state. Mitigation applies per request — two blows on one
         * sword may be protected differently — while the subtraction from
         * integrity happens once, for the sum.
         */
        const stressed: { readonly requestId: string; readonly effective: number; readonly mitigated: number }[] = [];
        const repaired: { readonly requestId: string; readonly amount: number }[] = [];

        const repairPermitted = permitsRepair(policy, before);

        for (const { request, operation } of pending) {
          if (operation.type === "stress") {
            const stress = resolveEffectiveStress(definition.shuInteraction, operation);

            stressed.push({
              requestId: request.requestId,
              effective: stress.effective,
              mitigated: stress.mitigated,
            });

            continue;
          }

          if (!repairPermitted) continue;

          repaired.push({ requestId: request.requestId, amount: operation.amount });
        }

        const totals = {
          stress: stressed.reduce((sum, entryStress) => sum + entryStress.effective, 0),
          repair: repaired.reduce((sum, entryRepair) => sum + entryRepair.amount, 0),
        };

        const aggregate = aggregateItemIntegrity(policy, before, totals);

        /*
         * What each request is reported to have done, apportioned by SHARE of
         * its direction rather than by position. Paying requests out in order
         * until a clamp ran dry would put the ordering straight back into the
         * answer, which is the thing this handler exists to remove.
         */
        const stressShare = totals.stress === 0 ? 0 : aggregate.honouredStress / totals.stress;
        const repairShare = totals.repair === 0 ? 0 : aggregate.honouredRepair / totals.repair;

        for (const entryStress of stressed) {
          actualByRequestId.set(entryStress.requestId, {
            requestId: entryStress.requestId,
            requested: pending.find((candidate) => candidate.request.requestId === entryStress.requestId)!.request.requested,
            actual: entryStress.effective * stressShare,
          });
        }

        for (const entryRepair of repaired) {
          actualByRequestId.set(entryRepair.requestId, {
            requestId: entryRepair.requestId,
            requested: entryRepair.amount,
            actual: entryRepair.amount * repairShare,
          });
        }

        /*
         * At most ONE replacement per entry, and only when the figure actually
         * moved. A repair that would overshoot the maximum is a real outcome
         * with `actual` below `requested` — the same shape a resisted effect
         * takes — so it still reports, and still rewrites nothing.
         */
        if (aggregate.integrityAfter !== before) {
          character = withEntryIntegrity(character, entryId, aggregate.integrityAfter);
        }

        const first = pending[0]!.request;
        const mitigated = stressed.reduce((sum, entryStress) => sum + entryStress.mitigated, 0);

        events.push({
          kind: "item-integrity-applied",
          domain: "character",
          operationId: first.operationId,
          occurredAt: first.occurredAt,
          source: first.from,
          target: first.to,
          entryId,
          itemId: entry.itemId,
          stateBefore: aggregate.stateBefore,
          stateAfter: aggregate.stateAfter,
          ...(mitigated === 0 ? {} : { mitigated }),
          change: {
            requested: totals.stress + totals.repair + mitigated,
            actual: Math.abs(aggregate.integrityAfter - before),
          },
        });
      }

      return finish(character);
    },
  };
}


/**
 * Build a well-formed Item integrity request.
 *
 * VALIDATES and returns a result, for the reason `itemIntegrityConsequence()`
 * does: this builder chooses the request's kind from caller data, and it used
 * to choose with a ternary — so an operation whose `type` was anything but
 * `"stress"` became a repair. A host with an unrecognised word in hand got
 * free maintenance rather than a refusal, and nothing downstream could tell,
 * because the request it produced was perfectly well formed.
 *
 * It also carries `mitigation` through rather than discarding it, and no
 * longer normalises the amount with `Math.abs()`: a caller asking to repair
 * -5 has made a sign error, and turning it into a repair of 5 answers a
 * question nobody asked.
 */
export function itemIntegrityRequest(input: {
  readonly requestId: string;
  readonly operationId: string;
  readonly occurredAt: GameTimestamp;
  readonly from: RuntimeOwnerRef;
  readonly to: RuntimeOwnerRef;
  readonly operation: ItemIntegrityOperation;
  readonly entryId: string;
}): EngineResult<ItemIntegrityRequest> {
  const trace = (output: string) => ({
    root: createTraceNode({
      id: "character.equipment.integrity.request",
      label: "Build an Item integrity request",
      inputs: { operation: { value: String(input?.operation?.type) } },
      output,
    }),
  });

  const errors: EngineError[] = [...findItemIntegrityOperationIssues(input?.operation)];

  if (typeof input?.entryId !== "string" || input.entryId.trim().length === 0) {
    errors.push({
      code: "equipment.integrity.request.entry.invalid",
      message: "An Item integrity request must name the entry it settles against.",
      audience: "developer",
      required: "non-empty entry id",
      actual: String(input?.entryId),
    });
  }

  if (errors.length > 0) {
    return engineFailure(trace("invalid"), errors as NonEmptyArray<EngineError>);
  }

  const operation = input.operation;

  const mitigation = operation.type === "stress" ? operation.mitigation : undefined;

  return engineSuccess({
    requestId: input.requestId,
    kind: operation.type === "stress" ? ITEM_STRESS_REQUEST : ITEM_REPAIR_REQUEST,
    phase: "effect",
    operationId: input.operationId,
    occurredAt: input.occurredAt,
    from: input.from,
    to: input.to,
    requested: operation.amount,
    entryId: input.entryId,
    ...(mitigation === undefined ? {} : { mitigation }),
  }, trace(operation.type));
}
