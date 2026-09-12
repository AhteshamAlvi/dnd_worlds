/*
 * What an action causes, in a form a GM can ask for without writing plumbing.
 *
 * A GM saying "and the ground gives way under the trap" should not have to
 * construct a RuntimeRequest — pick a requestId, name a phase, address an
 * owner, get the operation id right. Every one of those is a chance to build
 * something the coordinator refuses, and the person making the ruling is the
 * one least placed to debug it.
 *
 * So consequences are BUILT here, and each builder knows which of three places
 * its concept belongs:
 *
 *   runtime     the engine owns the state; it becomes a request
 *   host        the engine does not own the state; it comes back as work
 *   unresolved  nobody owns it yet; it comes back as an honest diagnostic
 *
 *
 * WHY THE HOST CHANNEL IS NOT A FAILURE
 *
 * The engine owns Bodies, Aura and Conditions. It does not own where anything
 * IS (spatial/ has said so since positions were introduced), what the floor is
 * made of, whether the door is still on its hinges, or what a guard now
 * believes. Those are the host's, and the honest answer is to hand the change
 * back as typed work rather than to claim a mutation that never happened.
 *
 * A consequence returning through the host channel is a SUCCESS. The engine
 * did its whole job: it decided the change was warranted and described it
 * precisely. Reporting that as an error would push hosts toward ignoring
 * errors, which is the opposite of the intent.
 */

import type { JsonValue } from "../infrastructure/json";
import type { EngineError } from "../infrastructure/diagnostics";
import type { RuntimeOwnerRef } from "../runtime/domains";
import type { RuntimeRequest, QuantitativeRequest } from "../runtime/requests";
import type { GameTimestamp } from "../time/types";
import type { TargetRef } from "../targeting";


/** Everything a builder needs in order to address a request correctly. */
export interface ConsequenceContext {
  readonly operationId: string;
  readonly occurredAt: GameTimestamp;

  /** Who is causing this. Usually the actor. */
  readonly from: RuntimeOwnerRef;
}


export interface HostFacingConsequence {
  readonly id: string;

  /** What kind of world change this is. The host owns these strings. */
  readonly kind: string;

  readonly summary: string;
  readonly subject?: TargetRef;

  /** Anything the host needs and the engine only carries. */
  readonly details?: JsonValue;
}


export type Consequence =
  | { readonly channel: "runtime"; readonly request: RuntimeRequest }
  | { readonly channel: "host"; readonly consequence: HostFacingConsequence }
  | { readonly channel: "unresolved"; readonly diagnostic: EngineError }
  | {
    readonly channel: "narrative";
    readonly id: string;
    readonly summary: string;
  }
  | {
    readonly channel: "subject";
    readonly operation: "add" | "remove";
    readonly subject: TargetRef;
    readonly reason?: string;
  };


function effectRequest(
  context: ConsequenceContext,
  requestId: string,
  kind: string,
  to: RuntimeOwnerRef,
  amount?: number,
): RuntimeRequest {
  const base: RuntimeRequest = {
    requestId,
    kind,
    phase: "effect",
    operationId: context.operationId,
    occurredAt: context.occurredAt,
    from: context.from,
    to,
  };

  if (amount === undefined) return base;

  const quantitative: QuantitativeRequest = { ...base, requested: amount };

  return quantitative;
}


/* ── Body ─────────────────────────────────────────────────────────────── */

/**
 * Damage denominated in Body Points, routed to the Body that owns them.
 *
 * BP is the denomination Body actually understands: applyBodyDamage() takes
 * BP, and every anatomical rule downstream is written in it.
 */
export function bodyDamageConsequence(
  context: ConsequenceContext,
  input: {
    readonly requestId: string;
    readonly bodyOwnerId: string;
    readonly bodyPoints: number;
  },
): Consequence {
  return {
    channel: "runtime",
    request: effectRequest(
      context,
      input.requestId,
      "body.damage",
      { domain: "body", id: input.bodyOwnerId },
      input.bodyPoints,
    ),
  };
}


/**
 * Damage denominated in Stamina Points, which nothing can currently route.
 *
 * There is no SP-to-BP conversion, and this is where somebody would invent
 * one. It is left unresolved on purpose: applyBodyDamage() takes BP, so an
 * SP figure passed to it would be silently reinterpreted at a rate nobody
 * chose, and the resulting injuries would look exactly like correctly
 * calculated ones. An explicit refusal is recoverable; a wrong exchange rate
 * buried in a damage log is not.
 */
export function staminaDamageConsequence(
  input: {
    readonly requestId: string;
    readonly bodyOwnerId: string;
    readonly staminaPoints: number;
  },
): Consequence {
  return {
    channel: "unresolved",
    diagnostic: {
      code: "actions.consequence.stamina-damage.unroutable",
      message:
        "SP-denominated damage cannot be applied: no SP-to-BP conversion exists.",
      audience: "gm",
      subject: { kind: "body", id: input.bodyOwnerId },
      required: "BP-denominated damage",
      actual: `${input.staminaPoints} SP`,
      resolution:
        "State the damage in Body Points, or record it narratively until an SP model exists.",
    },
  };
}


export function bodyRecoveryConsequence(
  context: ConsequenceContext,
  input: {
    readonly requestId: string;
    readonly bodyOwnerId: string;
    readonly bodyPoints: number;
  },
): Consequence {
  return {
    channel: "runtime",
    request: effectRequest(
      context,
      input.requestId,
      "body.recover",
      { domain: "body", id: input.bodyOwnerId },
      input.bodyPoints,
    ),
  };
}


/* ── Aura ─────────────────────────────────────────────────────────────── */

export function auraExpenditureConsequence(
  context: ConsequenceContext,
  input: {
    readonly requestId: string;
    readonly auraOwnerId: string;
    readonly amount: number;
  },
): Consequence {
  return {
    channel: "runtime",
    request: effectRequest(
      context,
      input.requestId,
      "aura.spend",
      { domain: "aura", id: input.auraOwnerId },
      input.amount,
    ),
  };
}


export function auraRestorationConsequence(
  context: ConsequenceContext,
  input: {
    readonly requestId: string;
    readonly auraOwnerId: string;
    readonly amount: number;
  },
): Consequence {
  return {
    channel: "runtime",
    request: effectRequest(
      context,
      input.requestId,
      "aura.restore",
      { domain: "aura", id: input.auraOwnerId },
      input.amount,
    ),
  };
}


/* ── Conditions ───────────────────────────────────────────────────────── */

export function conditionApplicationConsequence(
  context: ConsequenceContext,
  input: {
    readonly requestId: string;
    readonly characterId: string;
    readonly conditionId: string;
  },
): Consequence {
  return {
    channel: "runtime",
    request: {
      ...effectRequest(
        context,
        input.requestId,
        "condition.apply",
        { domain: "character-status", id: input.characterId },
      ),
      /* No amount: applying a Condition has nothing to count. */
    },
  };
}


export function conditionRemovalConsequence(
  context: ConsequenceContext,
  input: {
    readonly requestId: string;
    readonly characterId: string;
    readonly conditionId: string;
  },
): Consequence {
  return {
    channel: "runtime",
    request: effectRequest(
      context,
      input.requestId,
      "condition.remove",
      { domain: "character-status", id: input.characterId },
    ),
  };
}


/* ── Item integrity (Ticket 4.8) ─────────────────────────────────────────── */

/**
 * Stress or repair to one owned entry, denominated in the Item's own
 * integrity — routed to `character`, which owns its own entries' integrity
 * the same way it owns their equip state (Ticket 4.4). Generic here: this
 * file never imports the equipment domain, and `entryId` is carried as a
 * plain string because only `character/equipment/runtime.ts`'s effect
 * handler needs to know what it names.
 *
 * A settled miss still stresses the Item that swung — build this from the
 * SAME consequence list a hit would, and let the resolved entry's own policy
 * decide what a refused repair or a non-durable target means; this builder
 * never asks either question.
 */
export function itemIntegrityConsequence(
  context: ConsequenceContext,
  input: {
    readonly requestId: string;
    readonly characterId: string;
    readonly entryId: string;
    readonly operation: "stress" | "repair";
    readonly amount: number;
  },
): Consequence {
  const request: QuantitativeRequest & { readonly entryId: string } = {
    ...(effectRequest(
      context,
      input.requestId,
      input.operation === "stress" ? "item.stress" : "item.repair",
      { domain: "character", id: input.characterId },
      Math.abs(input.amount),
    ) as QuantitativeRequest),
    entryId: input.entryId,
  };

  return { channel: "runtime", request };
}


/* ── Things the engine does not own ───────────────────────────────────── */

/**
 * Movement and displacement.
 *
 * Host-facing, and not for want of trying: the engine has no position for
 * anything. spatial/ measures distances between positions the host supplies
 * and deliberately owns no occupancy model, so "he is thrown four metres back"
 * is a change to state that lives entirely on the other side of the boundary.
 */
export function displacementConsequence(
  input: {
    readonly id: string;
    readonly subject: TargetRef;
    readonly summary: string;
    readonly details?: JsonValue;
  },
): Consequence {
  return {
    channel: "host",
    consequence: {
      id: input.id,
      kind: "movement.displacement",
      summary: input.summary,
      subject: input.subject,
      ...(input.details === undefined ? {} : { details: input.details }),
    },
  };
}


/**
 * Something learned, noticed, or no longer hidden.
 *
 * The sensory domain resolves whether a cue was perceived; it holds no state
 * about what anyone currently believes. Whatever a host does with "the guard
 * heard that" is the host's.
 */
export function informationalConsequence(
  input: {
    readonly id: string;
    readonly summary: string;
    readonly subject?: TargetRef;
    readonly details?: JsonValue;
  },
): Consequence {
  return {
    channel: "host",
    consequence: {
      id: input.id,
      kind: "information.revealed",
      summary: input.summary,
      ...(input.subject === undefined ? {} : { subject: input.subject }),
      ...(input.details === undefined ? {} : { details: input.details }),
    },
  };
}


/**
 * A change to an object or to the terrain.
 *
 * There is no object durability model and no terrain model. Rather than
 * inventing either in order to look complete, the change is described and
 * handed back. The engine never claims to have destroyed a floor it has no
 * representation of.
 */
export function worldChangeConsequence(
  input: {
    readonly id: string;
    readonly kind: string;
    readonly summary: string;
    readonly subject?: TargetRef;
    readonly details?: JsonValue;
  },
): Consequence {
  return {
    channel: "host",
    consequence: {
      id: input.id,
      kind: input.kind,
      summary: input.summary,
      ...(input.subject === undefined ? {} : { subject: input.subject }),
      ...(input.details === undefined ? {} : { details: input.details }),
    },
  };
}


/* ── Bookkeeping ──────────────────────────────────────────────────────── */

/**
 * Someone the action turned out to affect, or turned out not to.
 *
 * Kept as its own channel rather than folded into the target list, because
 * declared targets and affected subjects are different facts and settlement
 * must not let one rewrite the other.
 */
export function affectedSubjectConsequence(
  input: {
    readonly operation: "add" | "remove";
    readonly subject: TargetRef;
    readonly reason?: string;
  },
): Consequence {
  return {
    channel: "subject",
    operation: input.operation,
    subject: input.subject,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
}


/** Something that happened and changes no state anybody models. */
export function narrativeConsequence(
  input: { readonly id: string; readonly summary: string },
): Consequence {
  return { channel: "narrative", id: input.id, summary: input.summary };
}
