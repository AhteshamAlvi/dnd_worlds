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
 * THE BASE CARRIES ROUTING, AND NOTHING ELSE
 *
 * Only what every request genuinely shares: who asked, who decides, which
 * operation, when it takes effect, and what kind of thing it is. Anything a
 * particular request needs belongs on that request's own type.
 *
 * `requested` used to be on the base, and it was a mistake with a visible
 * symptom: removing a fully healed Injury is not a quantity, so it was
 * shipping `requested: 1` — a placeholder meaning "one Injury, I suppose" that
 * every consumer had to know to ignore. A field that some requests must lie
 * about is a field on the wrong type. Quantitative requests extend
 * `QuantitativeRequest` and carry it honestly; the rest do not carry it at all.
 *
 *
 * TWO PHASES, BECAUSE ATOMICITY NEEDS THEM
 *
 * COST requests are validated and applied against the transaction draft before
 * the operation is allowed to succeed, and are discarded whole if anything
 * later fails.
 *
 * EFFECT requests are produced after the attempt resolves, and are settled in
 * SIMULTANEOUS BATCHES — every effect landing on one owner at one instant is
 * calculated from the same pre-batch state. A resist, an immunity or a cap is
 * an `actual` of zero: a real outcome of a real operation, not a validation
 * failure, and emphatically not a refund of costs already paid.
 */

import type { EngineError } from "../infrastructure/diagnostics";
import type { GameTimestamp } from "../time/types";

import { isRuntimeDomain, type RuntimeDomain } from "./domains";


export const RUNTIME_REQUEST_PHASES = ["cost", "effect"] as const;

export type RuntimeRequestPhase = typeof RUNTIME_REQUEST_PHASES[number];


/**
 * Routing. Everything every request shares, and nothing else.
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

  /** Whether this is paid before the operation resolves, or applied after. */
  readonly phase: RuntimeRequestPhase;

  readonly operationId: string;
  readonly occurredAt: GameTimestamp;

  /**
   * When this takes effect, if not at the operation's own instant.
   *
   * Effects sharing an owner AND an effective time settle as one batch, all
   * calculated from the same pre-batch state. That is what stops two
   * simultaneous effects reading each other's results and making the answer
   * depend on which was listed first.
   */
  readonly effectiveAt?: GameTimestamp;

  /** Who is asking. */
  readonly from: RuntimeDomain;

  /** Who owns the state and therefore decides. */
  readonly to: RuntimeDomain;
}


/**
 * A request for an amount of something.
 *
 * Aura to spend, damage to deal, Actions to consume. NOT every request: a
 * removal, a suppression or a state change with no magnitude is a
 * `RuntimeRequest` and carries no numbers to misreport.
 */
export interface QuantitativeRequest extends RuntimeRequest {
  readonly requested: number;

  /**
   * Whether less than `requested` is an acceptable outcome for a COST.
   *
   * False by default and by policy: a half-paid cost is a mechanic nobody
   * designed. A mechanic that genuinely wants partial payment has to say so
   * here, and then report both figures.
   *
   * Effect requests ignore it — a reduced effect is always legitimate, because
   * resisting a blow is not the same as half-paying for one.
   */
  readonly allowPartial?: boolean;
}


export function isQuantitativeRequest(
  request: RuntimeRequest,
): request is QuantitativeRequest {
  return typeof (request as QuantitativeRequest).requested === "number";
}


/** What a domain did with a request. `actual` is absent when nothing is counted. */
export interface RuntimeRequestOutcome {
  readonly requestId: string;
  readonly requested?: number;
  readonly actual?: number;
}


/** When a request takes effect: its own instant, or the operation's. */
export function effectiveTimeOf(request: RuntimeRequest): GameTimestamp {
  return request.effectiveAt ?? request.occurredAt;
}


/**
 * Judge a request at the boundary, before it is routed anywhere.
 *
 * A request that names no operation, or names a DIFFERENT operation, is not a
 * request this operation may act on — the second case in particular is how a
 * stale request from an abandoned attempt would get replayed into a live one.
 */
export function findRequestIssues(
  request: RuntimeRequest,
  operationId: string,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (
    typeof request.requestId !== "string" ||
    request.requestId.trim().length === 0
  ) {
    errors.push({
      code: "runtime.request.id.invalid",
      message: "Every request must carry a non-empty id.",
      audience: "developer",
      required: "non-empty string",
      actual: String(request.requestId),
    });
  }

  if (typeof request.kind !== "string" || request.kind.trim().length === 0) {
    errors.push({
      code: "runtime.request.kind.invalid",
      message: "Every request must name its kind.",
      audience: "developer",
      required: "non-empty string",
      actual: String(request.kind),
    });
  }

  if (!(RUNTIME_REQUEST_PHASES as readonly string[]).includes(request.phase)) {
    errors.push({
      code: "runtime.request.phase.invalid",
      message: `A request phase must be one of: ${RUNTIME_REQUEST_PHASES.join(", ")}.`,
      audience: "developer",
      required: RUNTIME_REQUEST_PHASES.join(" | "),
      actual: String(request.phase),
    });
  }

  if (request.operationId !== operationId) {
    errors.push({
      code: "runtime.request.operation.mismatch",
      message:
        "A request belongs to a different operation than the one resolving it.",
      audience: "developer",
      required: operationId,
      actual: String(request.operationId),
    });
  }

  if (!isRuntimeDomain(request.from) || !isRuntimeDomain(request.to)) {
    errors.push({
      code: "runtime.request.domain.invalid",
      message: "A request must name a known source and target domain.",
      audience: "developer",
      required: "known RuntimeDomain",
      actual: `${String(request.from)} -> ${String(request.to)}`,
    });
  }

  if (!Number.isFinite(request.occurredAt)) {
    errors.push({
      code: "runtime.request.timestamp.invalid",
      message: "A request must happen at a finite game timestamp.",
      audience: "developer",
      required: "finite GameTimestamp",
      actual: String(request.occurredAt),
    });
  }

  if (
    request.effectiveAt !== undefined &&
    !Number.isFinite(request.effectiveAt)
  ) {
    errors.push({
      code: "runtime.request.effective-time.invalid",
      message: "A request's effective time must be a finite game timestamp.",
      audience: "developer",
      required: "finite GameTimestamp",
      actual: String(request.effectiveAt),
    });
  }

  if (isQuantitativeRequest(request)) {
    const { requested } = request;

    /*
     * Negative is refused rather than treated as a refund. A request to spend
     * -40 Aura is a caller with a sign error, and honouring it would be the
     * one place in the engine where asking to pay grants a resource.
     */
    if (!Number.isFinite(requested) || requested < 0) {
      errors.push({
        code: "runtime.request.amount.invalid",
        message: "A quantitative request must ask for a finite, non-negative amount.",
        audience: "developer",
        required: "finite number >= 0",
        actual: String(requested),
      });
    }
  }

  return errors;
}


/*
 * The order requests are REPORTED and dispatched in.
 *
 * Never the caller's array order. Note what this does and does not decide: it
 * fixes the order of a log and the order batches are handed over, and it must
 * NOT decide a mechanical result — effects landing on one owner at one instant
 * are settled together from one pre-state precisely so that this comparison
 * cannot change the answer.
 *
 * Ends on the request id, which is unique within an operation, so the
 * comparison is total and two callers who assembled the same requests
 * differently order them identically.
 */
export function compareRuntimeRequests(
  left: RuntimeRequest,
  right: RuntimeRequest,
): number {
  if (left.phase !== right.phase) return left.phase === "cost" ? -1 : 1;

  const leftTime = effectiveTimeOf(left);
  const rightTime = effectiveTimeOf(right);

  if (leftTime !== rightTime) return leftTime - rightTime;
  if (left.to !== right.to) return left.to.localeCompare(right.to);
  if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);

  return left.requestId.localeCompare(right.requestId);
}


/** A copy in resolution order, leaving the caller's array untouched. */
export function orderRuntimeRequests(
  requests: readonly RuntimeRequest[],
): readonly RuntimeRequest[] {
  return [...requests].sort(compareRuntimeRequests);
}


/**
 * Effects that must settle together: one owner, one instant.
 *
 * Returned in deterministic batch order, with each batch's members in
 * deterministic order too — but the members' ORDER within a batch is for the
 * log only, since the owner is handed all of them and one pre-state.
 */
export function groupSimultaneousRequests(
  requests: readonly RuntimeRequest[],
): readonly { readonly to: RuntimeDomain; readonly effectiveAt: GameTimestamp; readonly requests: readonly RuntimeRequest[] }[] {
  const batches = new Map<string, RuntimeRequest[]>();

  for (const request of orderRuntimeRequests(requests)) {
    const key = `${effectiveTimeOf(request)}|${request.to}`;
    const existing = batches.get(key);

    if (existing === undefined) batches.set(key, [request]);
    else existing.push(request);
  }

  return [...batches.values()].map((members) => ({
    to: members[0]!.to,
    effectiveAt: effectiveTimeOf(members[0]!),
    requests: members,
  })).sort((left, right) =>
    left.effectiveAt !== right.effectiveAt
      ? left.effectiveAt - right.effectiveAt
      : left.to.localeCompare(right.to)
  );
}
