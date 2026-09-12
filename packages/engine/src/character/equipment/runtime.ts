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

import type { EngineResult } from "../../infrastructure/result";
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
  resolveItemIntegrityOperation,
  type ItemIntegrityOperation,
  type ItemIntegrityState,
} from "./integrity";
import type { InventoryItemRef } from "./references";
import type { ItemEquipmentState } from "./state";
import type { ItemDefinitionLookup } from "./validation";
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
}


export interface ItemIntegrityAppliedEvent extends Omit<RuntimeEvent, "sequence"> {
  readonly kind: "item-integrity-applied";
  readonly domain: "character";
  readonly entryId: string;
  readonly itemId: string;
  readonly stateBefore: ItemIntegrityState;
  readonly stateAfter: ItemIntegrityState;
}


/**
 * Item integrity as an effect handler for the `character` domain.
 *
 * Every request in the batch is applied, folded into one running Character
 * replacement, in the order the COORDINATOR hands the batch over — its own
 * canonical (kind, then requestId) order, not the caller's array order (see
 * `runtime/requests.ts`: batch member order is for the log only). Two
 * requests on different entries settle independently either way; two on the
 * SAME entry apply one after the other in that canonical order, which is
 * what makes the result depend only on WHAT was requested, never on the
 * order a caller happened to build the request list in.
 */
export function createCharacterIntegrityEffectHandler(
  getItemDefinition: ItemDefinitionLookup,
): EffectHandler {
  return {
    domain: "character",

    applyBatch(requests: readonly RuntimeRequest[], state: unknown): EffectBatchResult {
      let character = state as Character;
      const outcomes: RuntimeRequestOutcome[] = [];
      const events: ItemIntegrityAppliedEvent[] = [];

      for (const request of requests) {
        const req = request as ItemIntegrityRequest;

        const operation: ItemIntegrityOperation = req.kind === ITEM_STRESS_REQUEST
          ? { type: "stress", amount: req.requested }
          : { type: "repair", amount: req.requested };

        const resolvedResult = resolveCharacter(character);

        if (!resolvedResult.success) {
          outcomes.push({ requestId: req.requestId, requested: req.requested, actual: 0 });

          continue;
        }

        const resolution = resolveItemIntegrityOperation(
          {
            resolved: resolvedResult.payload,
            item: { characterId: character.id, entryId: req.entryId },
            operation,
          },
          getItemDefinition,
        );

        if (!resolution.success || resolution.payload.disposition !== "applied") {
          /*
           * Not durable, or a refused repair — a real, zero-effect outcome,
           * never a coordinator failure. The batch continues.
           */
          outcomes.push({ requestId: req.requestId, requested: req.requested, actual: 0 });

          continue;
        }

        const { change, nextCharacter } = resolution.payload;

        character = nextCharacter;

        const actual = Math.abs(change.integrityAfter - change.integrityBefore);

        outcomes.push({ requestId: req.requestId, requested: req.requested, actual });

        events.push({
          kind: "item-integrity-applied",
          domain: "character",
          operationId: req.operationId,
          occurredAt: req.occurredAt,
          source: req.from,
          target: req.to,
          entryId: req.entryId,
          itemId: change.itemId,
          stateBefore: change.stateBefore,
          stateAfter: change.stateAfter,
          change: { requested: req.requested, actual },
        });
      }

      return { state: character, outcomes, events };
    },
  };
}


/** Build a well-formed Item integrity request. */
export function itemIntegrityRequest(input: {
  readonly requestId: string;
  readonly operationId: string;
  readonly occurredAt: GameTimestamp;
  readonly from: RuntimeOwnerRef;
  readonly to: RuntimeOwnerRef;
  readonly operation: ItemIntegrityOperation;
  readonly entryId: string;
}): ItemIntegrityRequest {
  return {
    requestId: input.requestId,
    kind: input.operation.type === "stress" ? ITEM_STRESS_REQUEST : ITEM_REPAIR_REQUEST,
    phase: "effect",
    operationId: input.operationId,
    occurredAt: input.occurredAt,
    from: input.from,
    to: input.to,
    requested: Math.abs(input.operation.amount),
    entryId: input.entryId,
  };
}
