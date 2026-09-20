/*
 * Receivers — the specific anatomy or grant a cue actually arrived at.
 *
 * A Sense says what KIND of thing a creature can receive. A receiver says
 * WHICH of that creature's several organs did the receiving on this occasion:
 * the pair of eyes in its face, the eye in its palm, the tactile network over
 * its whole skin, or a grant that involves no anatomy at all.
 *
 *
 * AN EVENT NEVER NAMES THE RECEIVER
 *
 * This is the rule the whole file exists for. A torch emits light; it does not
 * emit "light into your left eye". Nothing that describes a cue is allowed to
 * pick which of the observer's organs catches it, because the emitter has no
 * way of knowing what organs the observer has — and a caller that had to name
 * one would be authoring the answer to the question the sensory domain is
 * supposed to resolve.
 *
 * So receivers are DERIVED, in routes.ts, from the observer's own resolved
 * profile plus whatever exposure and contact facts the caller supplied. A
 * receiver appearing in a request rather than in a result is a bug this
 * arrangement makes visible.
 *
 *
 * IDENTITY MUST NOT DEPEND ON ARRAY ORDER
 *
 * Two routes through the same pair of eyes must be the same route whether the
 * point ids arrived as [left, right] or [right, left]. A retained Concealment
 * rating, a prepared Reaction Gate and a best-route comparison all key on
 * receiver identity, and an order-sensitive key would make a Gate go stale
 * because a host iterated a map differently on the second call. Hence
 * `receiverKey`, which sorts.
 */

import {
  contributionSourceKey,
  type ContributionSourceRef,
} from "../../../infrastructure/contribution-source";
import type { CriticalPointId } from "../body/critical-points/types";


/*
 * A LOCAL cluster of Anatomical Points: the facial eyes, one hand's palm, the
 * pair of ears.
 *
 * `clusterKey` is the resolved cluster identity — host BodyPart, Sense and
 * authored cluster name — which is what makes "the eyes on this head"
 * different from "the eye on that hand" without either of them being
 * identified by a display name or a left/right string.
 */
export interface AnatomicalSensoryReceiver {
  readonly kind: "anatomical";
  readonly pointIds: readonly CriticalPointId[];
  readonly clusterKey: string;
}


/*
 * A DISTRIBUTED network: whole-body touch, a lateral line, a web.
 *
 * Its identity is the network plus the members currently active, because
 * losing an arm genuinely changes which network is doing the receiving — the
 * remaining members renormalize and the route is not the route it was.
 */
export interface DistributedSensoryReceiver {
  readonly kind: "distributed-network";
  readonly networkId: string;
  readonly pointIds: readonly CriticalPointId[];
}


/*
 * A GRANTED receiver: no anatomy at all.
 *
 * ESP from a Trait, a Condition or an Ability receives through nothing a
 * scalpel could reach, which is why it cannot be enhanced by Sensory Gyō and
 * why it cannot be destroyed by targeting a point. Identified by the grant's
 * own provenance, so two different grants of the same Sense stay two
 * receivers.
 */
export interface GrantedSensoryReceiver {
  readonly kind: "granted";
  readonly source: ContributionSourceRef;
}


export type SensoryReceiverRef =
  | AnatomicalSensoryReceiver
  | DistributedSensoryReceiver
  | GrantedSensoryReceiver;


export const SENSORY_RECEIVER_KINDS = [
  "anatomical",
  "distributed-network",
  "granted",
] as const;


function normalizedPointIds(
  pointIds: readonly CriticalPointId[],
): readonly CriticalPointId[] {
  return [...new Set(pointIds)].sort();
}


/**
 * One receiver's canonical key.
 *
 * Sorted and deduplicated, so the key answers "is this the same receiver"
 * rather than "did these two callers build their arrays the same way".
 */
export function receiverKey(receiver: SensoryReceiverRef): string {
  if (receiver.kind === "granted") {
    return `granted:${contributionSourceKey(receiver.source)}`;
  }

  const points = normalizedPointIds(receiver.pointIds).join(",");

  return receiver.kind === "anatomical"
    ? `anatomical:${receiver.clusterKey}:${points}`
    : `network:${receiver.networkId}:${points}`;
}


export function sameSensoryReceiver(
  left: SensoryReceiverRef,
  right: SensoryReceiverRef,
): boolean {
  return receiverKey(left) === receiverKey(right);
}


/**
 * A receiver with its point ids in canonical order.
 *
 * Used when a receiver is about to be STORED — in a retained Concealment
 * rating, a Reaction Gate binding, or a JSON round trip — so that the stored
 * form and a freshly derived one compare equal field by field and not only
 * through their keys.
 */
export function canonicalReceiver(
  receiver: SensoryReceiverRef,
): SensoryReceiverRef {
  if (receiver.kind === "granted") return receiver;

  const pointIds = normalizedPointIds(receiver.pointIds);

  return receiver.kind === "anatomical"
    ? { kind: "anatomical", clusterKey: receiver.clusterKey, pointIds }
    : { kind: "distributed-network", networkId: receiver.networkId, pointIds };
}


/**
 * Whether Sensory Gyō could ever target this receiver.
 *
 * Anatomy can be coated; a grant cannot. Stated once here so that the Gyō
 * projection does not have to branch on receiver kinds of its own, and so that
 * "nonanatomical ESP has no Gyō target" is one fact rather than a rule
 * repeated wherever Gyō is composed.
 */
export function isCoatableReceiver(receiver: SensoryReceiverRef): boolean {
  return receiver.kind !== "granted";
}


/** Every Anatomical Point this receiver receives through. Empty for a grant. */
export function receiverPointIds(
  receiver: SensoryReceiverRef,
): readonly CriticalPointId[] {
  return receiver.kind === "granted"
    ? []
    : normalizedPointIds(receiver.pointIds);
}


export function isSensoryReceiverRef(
  value: unknown,
): value is SensoryReceiverRef {
  if (typeof value !== "object" || value === null) return false;

  const receiver = value as Record<string, unknown>;

  if (receiver.kind === "granted") {
    const source = receiver.source as { type?: unknown; id?: unknown } | null;

    return typeof source === "object" && source !== null &&
      typeof source.type === "string" && typeof source.id === "string";
  }

  if (
    receiver.kind !== "anatomical" && receiver.kind !== "distributed-network"
  ) {
    return false;
  }

  if (
    !Array.isArray(receiver.pointIds) || receiver.pointIds.length === 0 ||
    receiver.pointIds.some(
      (one) => typeof one !== "string" || one.trim().length === 0,
    )
  ) {
    return false;
  }

  const name = receiver.kind === "anatomical"
    ? receiver.clusterKey
    : receiver.networkId;

  return typeof name === "string" && name.trim().length > 0;
}
