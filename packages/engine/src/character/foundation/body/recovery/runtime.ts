/*
 * Body recovery's side of the runtime protocol.
 *
 * The reference migration for a domain that must ASK ANOTHER DOMAIN to change
 * something it does not own. Recovery heals anatomy — which is Body's — and
 * discovers along the way that an Injury is fully healed. The Injury is not
 * Body's: it lives on Character status, and Body removing it directly would
 * be the boundary violation the whole request mechanism exists to prevent.
 *
 *
 * THIS BOUNDARY WAS ALREADY RIGHT
 *
 * `resolveRecovery` has always reported healed Injuries as
 * `RecoveredInjuryRemoval[]` and left the removing to Character status. That
 * is not something this phase fixed; it is the reason recovery was chosen as
 * the reference. What the protocol adds is the TYPED REQUEST — the same fact,
 * addressed to a named owner, carrying an operation id, so that a coordinator
 * can route it and a log can attribute it.
 *
 * Nothing about recovery rates, ceilings, Injury rules, Body Points or
 * anatomical ownership changes here. This file converts an existing report
 * into an existing protocol shape and does no arithmetic at all.
 *
 *
 * WHY REMOVAL IS A REQUEST AND NOT AN EVENT
 *
 * An event says something HAS happened. At the moment recovery finishes, the
 * Injury has not been removed — Character status has not been asked yet, and
 * when it is asked it may have its own reasons to keep the entry. So the fact
 * that is true here is "this Injury healed to its ceiling", and the removal is
 * work for somebody else: a request, resolved into an event only once the
 * owner has acted.
 */

import type { RuntimeEvent } from "../../../../runtime/events";
import type { RuntimeRequest } from "../../../../runtime/requests";
import type { GameTimestamp } from "../../../../time/types";

import type {
  RecoveredInjuryRemoval,
  ResolveRecoveryOutcome,
} from "./types";


export const INJURY_REMOVAL_REQUEST = "character-status.remove-injury";


/**
 * Body asking Character status to drop a fully healed Injury.
 *
 * NOT quantitative, and it no longer pretends to be. It briefly carried
 * `requested: 1` — "one Injury, I suppose" — because the shared base demanded a
 * number, which meant every consumer had to know that this particular 1 meant
 * nothing. A field a request has to lie about is a field on the wrong type, so
 * amounts moved to `QuantitativeRequest` and this carries the two ids it
 * actually needs.
 */
export interface InjuryRemovalRequest extends RuntimeRequest {
  readonly kind: typeof INJURY_REMOVAL_REQUEST;
  readonly characterInjuryId: string;
  readonly injuryId: string;
}


export interface AnatomyRecoveredEvent extends Omit<RuntimeEvent, "sequence"> {
  readonly kind: "anatomy-recovered";
  readonly domain: "body";
}


/**
 * Turn a completed recovery pass into protocol shapes.
 *
 * Takes the OUTCOME rather than the inputs, so it cannot be mistaken for a
 * second way to run recovery. There is one recovery calculation and this is
 * not it.
 */
export function recoveryRequests(
  outcome: ResolveRecoveryOutcome,
  context: {
    readonly operationId: string;
    readonly occurredAt: GameTimestamp;
    readonly subjectId: string;
  },
): readonly InjuryRemovalRequest[] {
  /*
   * Ordered by the Injury's own id, never by the order recovery happened to
   * walk the anatomy in. Two characters healing the same set of Injuries must
   * produce the same request list.
   */
  const removals = [...outcome.removedInjuries].sort(
    (left: RecoveredInjuryRemoval, right: RecoveredInjuryRemoval) =>
      left.characterInjuryId.localeCompare(right.characterInjuryId),
  );

  return removals.map((removal) => ({
    requestId: `${context.operationId}:remove-injury:${removal.characterInjuryId}`,
    kind: INJURY_REMOVAL_REQUEST,
    phase: "effect" as const,
    operationId: context.operationId,
    occurredAt: context.occurredAt,
    from: { domain: "body" as const, id: context.subjectId },
    to: { domain: "character-status" as const, id: context.subjectId },
    characterInjuryId: removal.characterInjuryId,
    injuryId: removal.injuryId,
  }));
}


/**
 * The fact recovery itself established: anatomy healed.
 *
 * Requested against actual, summed across the parts. A recovery ceiling is
 * exactly where the two differ — a body whose tick was worth 12 BP and which
 * an untreated Injury capped at 5 has recovered 5, and reporting only the 5
 * makes the cap invisible to everything downstream.
 *
 * Both figures come from the pass that already ran. Nothing is recomputed
 * here, and no rate, ceiling or Injury rule is consulted.
 */
export function recoveryEvent(
  outcome: ResolveRecoveryOutcome,
  context: {
    readonly operationId: string;
    readonly occurredAt: GameTimestamp;
    readonly subjectId: string;
  },
): AnatomyRecoveredEvent {
  let requested = 0;
  let actual = 0;

  for (const part of outcome.parts) {
    requested += part.bpRequested;
    actual += part.bpRestored;
  }

  return {
    kind: "anatomy-recovered",
    domain: "body",
    operationId: context.operationId,
    occurredAt: context.occurredAt,
    target: { domain: "body" as const, id: context.subjectId },
    change: { requested, actual },
  };
}
