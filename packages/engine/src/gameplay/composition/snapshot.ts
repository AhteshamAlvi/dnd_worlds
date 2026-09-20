/*
 * One immutable record of what a pending decision was decided against.
 *
 *
 * WHY THE SNAPSHOT EXISTS AT ALL
 *
 * An action is not instantaneous. It is proposed, it may wait for a Reaction,
 * it is adjudicated, and only then is it settled — and the world does not hold
 * still in between. The target steps behind a wall, the archer's quiver runs
 * out, the torch goes out, a Nen state drops. Every one of those changes a
 * fact the proposal was computed from.
 *
 * There are exactly two things a system can do about that, and only one of
 * them is honest. It can silently recompute against the new world, which
 * produces an outcome nobody proposed and nobody authorized — the shot that
 * was in range when you clicked and out of range when it resolved, quietly
 * resolved as a miss. Or it can record what it bound, notice the change, and
 * refuse. This does the second.
 *
 * So `stateBinding` is not bookkeeping. It is the mechanism by which a stale
 * settlement becomes a REFUSAL rather than a wrong answer.
 *
 *
 * WHY IT BINDS FINGERPRINTS AND NOT COPIES
 *
 * Positions and environment bands are bound by digest rather than by stored
 * value, so a host does not have to invent a revision string for every
 * coordinate it reports, and so a changed fact is detected structurally rather
 * than by a host remembering to bump a counter it does not benefit from.
 * Owners the host DOES version — a character, an inventory, a registry — bind
 * by the host's own revision, because those have identities the host is
 * already tracking and re-fingerprinting them here would mean holding a copy
 * of state this engine does not own.
 *
 *
 * WHAT IT IS NOT
 *
 * It is orchestration state, and every projector in this domain takes a
 * NARROWER input than this. Range projection gets distances, threat projection
 * gets a threat declaration, sensory composition gets contributions and a
 * step. None of them receives the snapshot, because a projector handed
 * everything is a projector whose real dependencies are invisible, and the
 * first one to reach for an unrelated field makes the dependency graph a lie.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import type { GameTimestamp } from "../../time/types";
import { findActorIssues, type ActorRef } from "../../actions/identity";
import {
  findPositionIssues,
  isValidSpatialContextId,
  type Distance,
  type SpatialContextId,
  type SpatialFacts,
  type SpatialPosition,
} from "../../spatial";
import type { TargetRef } from "../../targeting";
import {
  findActionEnvironmentIssues,
  type ActionEnvironmentSnapshot,
} from "./environment";
import {
  findActionPhaseRefIssues,
  type ActionPhaseRef,
} from "./phases";
import {
  findSensoryEmissionAdjustmentIssues,
  type ActionProjectionAdjustment,
} from "./contributions";
import { digestOf } from "./digest";


/**
 * One versioned thing the decision depended on.
 *
 * `owner` is an opaque key the host and engine both use consistently —
 * `actor:gon`, `item:quiver-3`, `registry:item`. It is never parsed.
 */
export interface StateRevisionRef {
  readonly owner: string;
  readonly revision: string;
}


export interface ActionStateBinding {
  readonly boundAt: GameTimestamp;

  /** Owners the host versions itself. */
  readonly revisions: readonly StateRevisionRef[];
}


/** Where everyone is, and what the host says about the space between them. */
export interface ActionSpatialSnapshot {
  readonly contextId: SpatialContextId;
  readonly origin?: SpatialPosition;
  readonly targetPositions?: readonly SpatialPosition[];

  /** The separation the host measured, when it measured one. */
  readonly separation?: Distance;

  /** Line of effect, cover, obstruction — see spatial/facts.ts. */
  readonly facts?: SpatialFacts;
}


/** Who is being acted on, as the proposal declared them. */
export interface PreparedTargetRef {
  readonly target: TargetRef;
  readonly position?: SpatialPosition;
}


/**
 * What is actually being used, and what it is being used with.
 *
 * `implement` is the Item, Skill or improvisation supplying the mechanic;
 * `consumables` are the things a use spends — ammunition being the case this
 * was built for. Both are bound, because an arrow fired from a quiver that
 * emptied in between is exactly the stale settlement this refuses.
 */
export interface PreparedActionImplementation {
  readonly implement: ContributionSourceRef;
  readonly consumables?: readonly ContributionSourceRef[];
}


export interface PreparedParticipantRef {
  readonly actor: ActorRef;
  readonly position?: SpatialPosition;
}


export interface PreparedActionSnapshot {
  /** The concrete attempt, and the preview it belongs to. */
  readonly actionId: string;
  readonly proposalId: string;

  readonly phase: ActionPhaseRef;
  readonly declaredAt: GameTimestamp;

  readonly actor: PreparedParticipantRef;
  readonly targets: readonly PreparedTargetRef[];

  readonly implementation: PreparedActionImplementation;

  readonly stateBinding: ActionStateBinding;

  readonly spatial: ActionSpatialSnapshot;
  readonly environment: ActionEnvironmentSnapshot;

  readonly adjustments: readonly ActionProjectionAdjustment[];
}


export function findPreparedActionSnapshotIssues(
  snapshot: PreparedActionSnapshot,
  path = "snapshot",
): readonly EngineError[] {
  const errors: EngineError[] = [];

  for (const [field, value] of [
    ["actionId", snapshot?.actionId],
    ["proposalId", snapshot?.proposalId],
  ] as const) {
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push({
        code: `composition.snapshot.${field}.missing`,
        message: "A prepared snapshot must identify the attempt it belongs to.",
        audience: "developer",
        subject: { kind: "field", id: `${path}.${field}` },
        required: "non-empty id",
        actual: describeDiagnosticValue(value),
      });
    }
  }

  errors.push(...findActionPhaseRefIssues(snapshot?.phase, `${path}.phase`));

  if (!Number.isFinite(snapshot?.declaredAt)) {
    errors.push({
      code: "composition.snapshot.declared-at.invalid",
      message: "A prepared snapshot must be declared at a finite time.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.declaredAt` },
      required: "finite timestamp",
      actual: describeDiagnosticValue(snapshot?.declaredAt),
    });
  }

  errors.push(...findActorIssues(snapshot?.actor?.actor ?? ({} as ActorRef)));

  if (snapshot?.actor?.position !== undefined) {
    errors.push(...findPositionIssues(snapshot.actor.position));
  }

  if (!Array.isArray(snapshot?.targets)) {
    errors.push({
      code: "composition.snapshot.targets.invalid",
      message: "A prepared snapshot must carry its declared targets as a list.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.targets` },
      required: "array",
      actual: describeDiagnosticValue(snapshot?.targets),
    });
  } else {
    snapshot.targets.forEach((entry, index) => {
      if (entry?.position !== undefined) {
        errors.push(...findPositionIssues(entry.position));
      }

      if (entry?.target === undefined) {
        errors.push({
          code: "composition.snapshot.target.missing",
          message: "A prepared target must name what is being targeted.",
          audience: "developer",
          subject: { kind: "field", id: `${path}.targets[${index}].target` },
          required: "a target reference",
          actual: describeDiagnosticValue(entry?.target),
        });
      }
    });
  }

  const implement = snapshot?.implementation?.implement;

  if (
    typeof implement?.type !== "string" ||
    implement.type.trim().length === 0 ||
    typeof implement.id !== "string" ||
    implement.id.trim().length === 0
  ) {
    errors.push({
      code: "composition.snapshot.implementation.missing",
      message: "A prepared snapshot must name what supplies the mechanic.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.implementation.implement` },
      required: "a contribution source with a type and an id",
      actual: describeDiagnosticValue(implement),
    });
  }

  errors.push(
    ...findActionStateBindingIssues(
      snapshot?.stateBinding,
      `${path}.stateBinding`,
    ),
  );

  if (!isValidSpatialContextId(snapshot?.spatial?.contextId)) {
    errors.push({
      code: "composition.snapshot.spatial.context.invalid",
      message: "A prepared snapshot must name the space it happens in.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.spatial.contextId` },
      required: "a valid spatial context id",
      actual: describeDiagnosticValue(snapshot?.spatial?.contextId),
    });
  }

  if (snapshot?.spatial?.origin !== undefined) {
    errors.push(...findPositionIssues(snapshot.spatial.origin));
  }

  for (const position of snapshot?.spatial?.targetPositions ?? []) {
    errors.push(...findPositionIssues(position));
  }

  errors.push(
    ...findActionEnvironmentIssues(
      snapshot?.environment ?? {},
      `${path}.environment`,
    ),
  );

  if (!Array.isArray(snapshot?.adjustments)) {
    errors.push({
      code: "composition.snapshot.adjustments.invalid",
      message: "A prepared snapshot must carry its adjustments as a list.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.adjustments` },
      required: "array",
      actual: describeDiagnosticValue(snapshot?.adjustments),
    });
  } else {
    snapshot.adjustments.forEach((adjustment, index) => {
      errors.push(
        ...findSensoryEmissionAdjustmentIssues(
          adjustment,
          `${path}.adjustments[${index}]`,
        ),
      );
    });
  }

  return errors;
}


export function findActionStateBindingIssues(
  binding: ActionStateBinding,
  path = "stateBinding",
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!Number.isFinite(binding?.boundAt)) {
    errors.push({
      code: "composition.binding.bound-at.invalid",
      message: "A state binding must record a finite time it was taken at.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.boundAt` },
      required: "finite timestamp",
      actual: describeDiagnosticValue(binding?.boundAt),
    });
  }

  if (!Array.isArray(binding?.revisions)) {
    errors.push({
      code: "composition.binding.revisions.invalid",
      message: "A state binding must carry its bound revisions as a list.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.revisions` },
      required: "array",
      actual: describeDiagnosticValue(binding?.revisions),
    });

    return errors;
  }

  const seen = new Set<string>();

  binding.revisions.forEach((entry, index) => {
    if (typeof entry?.owner !== "string" || entry.owner.trim().length === 0) {
      errors.push({
        code: "composition.binding.owner.missing",
        message: "A bound revision must name what it versions.",
        audience: "developer",
        subject: { kind: "field", id: `${path}.revisions[${index}].owner` },
        required: "non-empty owner key",
        actual: describeDiagnosticValue(entry?.owner),
      });

      return;
    }

    if (
      typeof entry.revision !== "string" ||
      entry.revision.trim().length === 0
    ) {
      errors.push({
        code: "composition.binding.revision.missing",
        message: "A bound revision must carry the version it bound.",
        audience: "developer",
        subject: { kind: "field", id: `${path}.revisions[${index}].revision` },
        required: "non-empty revision",
        actual: describeDiagnosticValue(entry.revision),
      });
    }

    /*
     * Two revisions of one owner is a contradiction rather than a duplicate:
     * the caller has bound one thing to two versions, and any staleness answer
     * would depend on which one happened to be compared first.
     */
    if (seen.has(entry.owner)) {
      errors.push({
        code: "composition.binding.owner.duplicate",
        message: "One owner was bound to two revisions.",
        audience: "developer",
        subject: { kind: "field", id: `${path}.revisions[${index}].owner` },
        required: "one revision per owner",
        actual: entry.owner,
      });
    }

    seen.add(entry.owner);
  });

  return errors;
}


/*
 * The owner keys this domain fingerprints for itself.
 *
 * Named constants rather than inline strings so the binding side and the
 * staleness side can never spell them differently — which would produce a
 * binding that is compared against nothing and therefore never stale.
 */
export const SPATIAL_BINDING_OWNER = "composition:spatial";
export const ENVIRONMENT_BINDING_OWNER = "composition:environment";
export const IMPLEMENTATION_BINDING_OWNER = "composition:implementation";
export const TARGETS_BINDING_OWNER = "composition:targets";


/**
 * The revisions this domain derives from the snapshot's own bound facts.
 *
 * These sit alongside whatever the host bound, so a moved target or a
 * darkened room is detected without the host versioning either.
 */
export function derivedStateRevisions(
  snapshot: PreparedActionSnapshot,
): readonly StateRevisionRef[] {
  return [
    { owner: SPATIAL_BINDING_OWNER, revision: digestOf(snapshot.spatial) },
    {
      owner: ENVIRONMENT_BINDING_OWNER,
      revision: digestOf(snapshot.environment),
    },
    {
      owner: IMPLEMENTATION_BINDING_OWNER,
      revision: digestOf(snapshot.implementation),
    },
    { owner: TARGETS_BINDING_OWNER, revision: digestOf(snapshot.targets) },
  ];
}


/** One bound fact that no longer holds. */
export interface StaleBinding {
  readonly owner: string;
  readonly bound: string;
  readonly current: string;
}


/**
 * Which bound facts changed, comparing what was bound against what is true now.
 *
 * Only BOUND owners are compared. An owner present now but never bound is not
 * stale — it is state the decision did not depend on, and treating it as
 * stale would make every settlement fail the moment anything anywhere moved.
 *
 * An owner that was bound and is now ABSENT is stale, and this is the
 * direction that matters: a quiver that emptied, a scene that was torn down
 * and a target that left are all "the thing I decided against is gone", and
 * silently treating a missing fact as unchanged is the exact recompute this
 * whole mechanism exists to refuse.
 */
export function findStaleBindings(
  snapshot: PreparedActionSnapshot,
  current: readonly StateRevisionRef[],
): readonly StaleBinding[] {
  const now = new Map(current.map((entry) => [entry.owner, entry.revision]));

  const bound = [
    ...snapshot.stateBinding.revisions,
    ...derivedStateRevisions(snapshot),
  ];

  const stale: StaleBinding[] = [];

  for (const entry of bound) {
    const observed = now.get(entry.owner);

    if (observed === entry.revision) continue;

    stale.push({
      owner: entry.owner,
      bound: entry.revision,
      current: observed ?? "absent",
    });
  }

  return stale;
}


/**
 * Whether this snapshot may still be settled.
 *
 * A convenience over `findStaleBindings`, kept beside it rather than
 * reimplemented by callers, so "is it stale" and "what changed" can never
 * disagree.
 */
export function isSettlementStale(
  snapshot: PreparedActionSnapshot,
  current: readonly StateRevisionRef[],
): boolean {
  return findStaleBindings(snapshot, current).length > 0;
}
