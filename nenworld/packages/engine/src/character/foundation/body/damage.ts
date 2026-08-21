/*
 * Body damage orchestration — the pipeline that turns "this target took this
 * much penetrating damage" into updated persistent Anatomy.
 *
 * This is the seam between Body and the future Combat layer. Combat's own
 * header comment (combat/index.ts) says it "consumes a resolved character
 * rather than owning any part of one" — this pipeline *produces* new
 * persistent Body state, so it belongs here, not there. Combat's only
 * contribution is two primitives, passed in as plain parameters: which
 * target was hit, and how much penetrating damage got through.
 *
 * Pipeline (locked order):
 *
 * 1. resolve current Anatomy (stored + temporary modifications)
 * 2. resolve current Critical/Semicritical/Joint instances
 * 3. receive target + penetrating damage
 * 4. apply the Joint multiplier, if the target is a Joint
 * 5. apply BP damage to the target's host BodyPart
 * 6. resolve Body Points
 * 7. expose an Injury opportunity if the target was Semicritical or Joint
 * 8. check fatal Critical failure using the step-2 point set — BEFORE removal
 * 9. determine which BodyParts reached 0 Current BP
 * 10. permanently remove destroyed BodyParts from stored Anatomy (cascades
 *     through structural descendants automatically via removeBodyPart)
 * 11. (cascade is automatic, see 10)
 * 12. return the new persistent Anatomy for the caller to store
 *
 * Step 8 evaluating against the pre-removal point set is not incidental: a
 * Head that reaches 0 BP and is then removed before the Brain's fatal
 * failure is checked would silently lose that failure, because the removed
 * Head can no longer host a Brain point. See body-damage.test.ts's
 * fatal-ordering regression.
 *
 * Damage is applied to two separate Anatomy trees on purpose: the resolved
 * tree (which may include temporary-only parts) feeds Body Point resolution,
 * while the stored tree feeds persistence. applyBodyPartDamage is a no-op
 * against a tree that doesn't contain the target id, so a temporary-only
 * target takes damage for this resolution but persists nothing — matching
 * the rule that temporary Anatomy modifications never mutate stored Anatomy.
 *
 * Nothing here touches any BodyPart other than the resolved host: that is
 * the entire "no damage spill" guarantee (a Joint hit doesn't also damage
 * its attached limb's other parts, a destroyed part's descendants don't
 * inherit its damage), and it falls out of removeBodyPart's existing cascade
 * behavior already being correct.
 *
 * This is the one Body function that takes caller-supplied, potentially
 * invalid input across a domain boundary (an unknown target id, an
 * ambiguous shared host, a bad damage number) rather than being fed only by
 * other, already-validated Body code — so unlike the rest of Body, it
 * reports failures as an EngineResult instead of throwing, matching the
 * house convention for public entry points (see aura/distribution.ts).
 */

import type { EngineResult } from "../../../infrastructure/result";
import { createTraceNode } from "../../../infrastructure/trace";

import {
  applyBodyPartDamage,
  removeBodyPart,
} from "./anatomy/modification";
import type { AnatomyModification } from "./anatomy/modification";
import { resolveAnatomy } from "./anatomy/resolution";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "./anatomy/types";
import { resolveMorphology } from "./body-points/morphology";
import { resolveBodyPoints } from "./body-points/resolution";
import type {
  BodyPointModifier,
  ResolvedBodyPoints,
} from "./body-points/types";
import {
  applyJointDamageMultiplier,
  createsInjuryOpportunity,
  getCriticalPoint,
  getFatalCriticalFailures,
  isJointPoint,
  resolveCriticalPoints,
} from "./critical-points/resolution";
import type {
  CriticalPointId,
  CriticalPointInstance,
  ResolvedCriticalPoint,
  ResolvedCriticalPoints,
  SpecialPointDefinition,
} from "./critical-points/types";
import type { Body } from "./types";

// What Combat says was hit. A "special-point" target whose resolved point
// spans more than one host (e.g. Spine → Upper Body + Lower Body) requires
// the caller to say which host was actually struck via `hostPartId`, rather
// than this module inventing a rule for which host "wins" by default.
export type BodyDamageTarget =
  | { readonly kind: "body-part"; readonly partId: BodyPartId }
  | {
      readonly kind: "special-point";
      readonly pointId: CriticalPointId;
      readonly hostPartId?: BodyPartId;
    };

export interface BodyDamageInput {
  readonly body: Body;
  readonly constitution: number;

  readonly bodyPartDefinitions: readonly BodyPartDefinition[];
  readonly specialPointDefinitions: readonly SpecialPointDefinition[];

  readonly target: BodyDamageTarget;
  readonly penetratingDamage: number;

  readonly bodyPointModifiers?: readonly BodyPointModifier[];
  readonly temporaryAnatomyModifications?: readonly AnatomyModification[];
}

export interface BodyDamageOutcome {
  // New persistent state — the caller stores this back onto Body.anatomy.
  readonly anatomy: Anatomy;

  readonly hostPartId: BodyPartId;
  readonly damageMultiplier: number;
  readonly appliedDamage: number;

  readonly injuryOpportunity: boolean;

  readonly fatalCriticalFailures: readonly ResolvedCriticalPoint[];

  // Directly reached 0 Current BP.
  readonly destroyedPartIds: readonly BodyPartId[];
  // destroyedPartIds plus every structural descendant removed by cascade.
  readonly removedPartIds: readonly BodyPartId[];

  readonly bodyPointsAfterDamage: ResolvedBodyPoints;
  readonly criticalPointsBeforeRemoval: ResolvedCriticalPoints;
}

type HostResolution =
  | {
      readonly ok: true;
      readonly hostPartId: BodyPartId;
      readonly point: CriticalPointInstance | undefined;
    }
  | { readonly ok: false; readonly code: string; readonly message: string };

function resolveDamageHost(
  target: BodyDamageTarget,
  resolvedAnatomy: Anatomy,
  criticalPoints: ResolvedCriticalPoints,
): HostResolution {
  if (target.kind === "body-part") {
    const exists = resolvedAnatomy.parts.some(
      (part) => part.id === target.partId,
    );

    if (!exists) {
      return {
        ok: false,
        code: "body.damage.target.unknown",
        message: `No BodyPart "${target.partId}" exists in the current resolved Anatomy.`,
      };
    }

    return { ok: true, hostPartId: target.partId, point: undefined };
  }

  const point = getCriticalPoint(criticalPoints, target.pointId);

  if (point === undefined) {
    return {
      ok: false,
      code: "body.damage.target.unknown",
      message: `No Special Point "${target.pointId}" exists in the current resolved Critical Points.`,
    };
  }

  if (point.hostPartIds.length === 0) {
    return {
      ok: false,
      code: "body.damage.host.missing",
      message: `Special Point "${point.id}" has no host BodyPart to damage.`,
    };
  }

  if (point.hostPartIds.length === 1) {
    const [onlyHost] = point.hostPartIds;

    if (onlyHost === undefined) {
      return {
        ok: false,
        code: "body.damage.host.missing",
        message: `Special Point "${point.id}" has no host BodyPart to damage.`,
      };
    }

    if (
      target.hostPartId !== undefined &&
      target.hostPartId !== onlyHost
    ) {
      return {
        ok: false,
        code: "body.damage.target.invalid_host",
        message: `Special Point "${point.id}" is not hosted by "${target.hostPartId}".`,
      };
    }

    return { ok: true, hostPartId: onlyHost, point };
  }

  // More than one host (e.g. Spine) — the caller must disambiguate.
  if (target.hostPartId === undefined) {
    return {
      ok: false,
      code: "body.damage.target.ambiguous_host",
      message: `Special Point "${point.id}" spans multiple hosts (${point.hostPartIds.join(", ")}); a hostPartId is required.`,
    };
  }

  if (!point.hostPartIds.includes(target.hostPartId)) {
    return {
      ok: false,
      code: "body.damage.target.invalid_host",
      message: `Special Point "${point.id}" is not hosted by "${target.hostPartId}".`,
    };
  }

  return { ok: true, hostPartId: target.hostPartId, point };
}

export function applyBodyDamage(
  input: BodyDamageInput,
): EngineResult<BodyDamageOutcome> {
  const temporaryAnatomyModifications =
    input.temporaryAnatomyModifications ?? [];
  const bodyPointModifiers = input.bodyPointModifiers ?? [];

  const traceNode = createTraceNode({
    id: "body.damage",
    label: "Body damage application",

    formula: "appliedDamage = penetratingDamage × jointMultiplier",

    inputs: {
      target: { value: input.target },
      penetratingDamage: { value: input.penetratingDamage },
      constitution: { value: input.constitution },
    },
  });

  if (
    !Number.isFinite(input.penetratingDamage) ||
    input.penetratingDamage < 0
  ) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "body.damage.penetrating_damage.invalid",
          message:
            "Penetrating damage must be a finite number greater than or equal to 0.",
          audience: "developer",
          required: "finite number >= 0",
          actual: Number.isFinite(input.penetratingDamage)
            ? input.penetratingDamage
            : String(input.penetratingDamage),
        },
      ],
    };
  }

  const resolvedAnatomy = resolveAnatomy(
    input.body.anatomy,
    temporaryAnatomyModifications,
  );

  const criticalPoints = resolveCriticalPoints(
    resolvedAnatomy,
    input.bodyPartDefinitions,
    input.specialPointDefinitions,
  );

  const hostResolution = resolveDamageHost(
    input.target,
    resolvedAnatomy,
    criticalPoints,
  );

  if (!hostResolution.ok) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: hostResolution.code,
          message: hostResolution.message,
          audience: "developer",
        },
      ],
    };
  }

  const { hostPartId, point } = hostResolution;

  const damageMultiplier =
    point !== undefined && isJointPoint(point) ? point.damageMultiplier : 1;

  const appliedDamage =
    point !== undefined && isJointPoint(point)
      ? applyJointDamageMultiplier(point, input.penetratingDamage)
      : input.penetratingDamage;

  const damagedResolvedAnatomy = applyBodyPartDamage(
    resolvedAnatomy,
    hostPartId,
    appliedDamage,
  );

  const damagedStoredAnatomy = applyBodyPartDamage(
    input.body.anatomy,
    hostPartId,
    appliedDamage,
  );

  const morphology = resolveMorphology(
    input.body,
    damagedResolvedAnatomy,
    input.bodyPartDefinitions,
  );

  const bodyPoints = resolveBodyPoints(
    damagedResolvedAnatomy,
    morphology,
    input.constitution,
    input.bodyPartDefinitions,
    bodyPointModifiers,
  );

  const injuryOpportunity =
    point !== undefined && createsInjuryOpportunity(point);

  // Evaluated against the step-2 (pre-damage, pre-removal) point set — see
  // the file header on why this ordering is load-bearing.
  const fatalCriticalFailures = getFatalCriticalFailures(
    criticalPoints,
    bodyPoints,
  );

  const destroyedPartIds = bodyPoints.destroyedPartIds;

  const idsBeforeRemoval = new Set(
    damagedStoredAnatomy.parts.map((part) => part.id),
  );

  const anatomy = destroyedPartIds.reduce(
    (current, partId) => removeBodyPart(current, partId),
    damagedStoredAnatomy,
  );

  const idsAfterRemoval = new Set(anatomy.parts.map((part) => part.id));

  const removedPartIds = [...idsBeforeRemoval].filter(
    (id) => !idsAfterRemoval.has(id),
  );

  const outcome: BodyDamageOutcome = {
    anatomy,

    hostPartId,
    damageMultiplier,
    appliedDamage,

    injuryOpportunity,

    fatalCriticalFailures,

    destroyedPartIds,
    removedPartIds,

    bodyPointsAfterDamage: bodyPoints,
    criticalPointsBeforeRemoval: criticalPoints,
  };

  traceNode.output = {
    hostPartId: outcome.hostPartId,
    damageMultiplier: outcome.damageMultiplier,
    appliedDamage: outcome.appliedDamage,
    destroyedPartIds: [...outcome.destroyedPartIds],
    removedPartIds: [...outcome.removedPartIds],
    fatal: outcome.fatalCriticalFailures.length > 0,
  };

  return {
    success: true,
    payload: outcome,
    trace: { root: traceNode },
    warnings: [],
  };
}
