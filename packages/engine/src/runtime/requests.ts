/*
 * Requests: typed work for the domain that owns the state.
 *
 * A request is how one domain asks another to change something. Nen does not
 * subtract Aura; it requests an Aura expenditure and Aura decides. Combat does
 * not edit Body Points; it requests damage and Body decides. The receiving
 * domain applies its own rule and reports what actually happened.
 *
 * That indirection is the entire mechanism behind "a domain cannot mutate
 * state it does not own". Without it, every domain that needs Aura ends up
 * containing a little bit of the Aura rules, and the fourth copy is the one
 * that disagrees.
 *
 *
 * TWO PHASES, BECAUSE ATOMICITY NEEDS THEM
 *
 * COST requests are gathered and validated BEFORE anything commits, then
 * committed together or not at all. A character who cannot pay the Aura must
 * not have already spent the Action.
 *
 * EFFECT requests are produced AFTER the attempt resolves, and each target
 * applies its own rules to it. A resist, an immunity or a cap is an `actual`
 * of zero — a real outcome of a real operation, not a validation failure, and
 * emphatically not a refund of costs already paid.
 *
 * The lifecycle a cost handler implements is prepare-then-commit for exactly
 * this reason: "validate every cost, then commit every cost" is unimplementable
 * if the only entry point a domain offers both validates and applies in one
 * call. See coordinator.ts.
 */

import type { GameTimestamp } from "../time/types";

import type { RuntimeDomain } from "./domains";


export const RUNTIME_REQUEST_PHASES = ["cost", "effect"] as const;

export type RuntimeRequestPhase = typeof RUNTIME_REQUEST_PHASES[number];


/**
 * Everything every request carries.
 *
 * Domains extend this with their own `kind` and any fields their rule needs.
 */
export interface RuntimeRequest {
  /**
   * Unique within the operation.
   *
   * Identity, not content. Two genuinely separate 10-damage requests to one
   * target are legitimate and must both be honoured; the same request arriving
   * twice is a routing bug or a cycle, and is refused. Distinguishing those
   * two cases is only possible if identity is explicit, which is why this is
   * supplied rather than hashed from the fields.
   */
  readonly requestId: string;

  /** Discriminator. The receiving domain owns its own kind strings. */
  readonly kind: string;

  /** Whether this is paid before commitment, or applied after resolution. */
  readonly phase: RuntimeRequestPhase;

  readonly operationId: string;
  readonly occurredAt: GameTimestamp;

  /** Who is asking. */
  readonly from: RuntimeDomain;

  /** Who owns the state and therefore decides. */
  readonly to: RuntimeDomain;

  readonly sourceId?: string;
  readonly targetId?: string;

  /** How much is being asked for. */
  readonly requested: number;

  /**
   * Whether less than `requested` is an acceptable outcome for a COST.
   *
   * False by default and by policy: a half-paid cost is a mechanic nobody
   * designed. A mechanic that genuinely wants partial payment has to say so
   * here, and then report both figures.
   *
   * Effect requests ignore this — a reduced effect is always legitimate,
   * because resisting a blow is not the same as half-paying for one.
   */
  readonly allowPartial?: boolean;
}


/** What a domain did with a request. */
export interface RuntimeRequestOutcome {
  readonly requestId: string;
  readonly requested: number;
  readonly actual: number;
}


/*
 * The order requests are resolved in.
 *
 * Never the caller's array order. Costs before effects, then by owning domain,
 * then kind, then target, and finally by request id — which is stable and
 * unique, so the comparison is total and two callers who assembled the same
 * requests in different orders resolve them identically.
 */
export function compareRuntimeRequests(
  left: RuntimeRequest,
  right: RuntimeRequest,
): number {
  if (left.phase !== right.phase) return left.phase === "cost" ? -1 : 1;
  if (left.to !== right.to) return left.to.localeCompare(right.to);
  if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);

  const leftTarget = left.targetId ?? "";
  const rightTarget = right.targetId ?? "";

  if (leftTarget !== rightTarget) return leftTarget.localeCompare(rightTarget);

  return left.requestId.localeCompare(right.requestId);
}


/** A copy in resolution order, leaving the caller's array untouched. */
export function orderRuntimeRequests(
  requests: readonly RuntimeRequest[],
): readonly RuntimeRequest[] {
  return [...requests].sort(compareRuntimeRequests);
}
