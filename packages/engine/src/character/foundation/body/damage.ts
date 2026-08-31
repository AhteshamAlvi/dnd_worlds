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
 * 5. resolve Body Points BEFORE the hit, for the host's Maximum and exact
 *    Current BP
 * 6. newExactBP = exactCurrentBP - appliedDamage
 * 7. if newExactBP <= 0 the host is DESTROYED; otherwise store the new
 *    integrity fraction
 * 8. check fatal Critical failure using the step-2 point set — BEFORE the
 *    destroyed part stops hosting its points
 * 9. archive the destroyed host and its structural descendants
 * 10. return the new persistent Anatomy for the caller to store
 *
 * Step 5 happening before the hit rather than after is the whole shape of the
 * new model. Damage is subtracted in exact BP and the result is divided back
 * into a fraction, so a hit is a transition between two known states rather
 * than a number accumulating against a moving Maximum.
 *
 * Step 7 is the only place a BodyPart can be destroyed. Destruction is a state
 * transition performed deliberately here, never a Current BP that rounded to
 * zero somewhere else — which is what makes a part at 0.3 exact BP survive
 * displaying 1, and what makes a later Maximum BP increase unable to
 * resurrect anything.
 *
 * Step 8 evaluating against the pre-archive point set is not incidental: a
 * Head that is destroyed and then archived before the Brain's fatal failure is
 * checked would silently lose that failure, because an archived Head no longer
 * hosts a Brain point. See body-damage.test.ts's fatal-ordering regression.
 *
 * Damage is applied to two separate Anatomy trees on purpose: the resolved
 * tree (which may include temporary-only parts) feeds Body Point resolution,
 * while the stored tree feeds persistence. Writing integrity is a no-op
 * against a tree that does not contain the target id, so a temporary-only
 * target takes damage for this resolution and persists nothing — matching the
 * rule that temporary Anatomy modifications never mutate stored Anatomy.
 *
 * Nothing here touches any BodyPart other than the resolved host and, on
 * destruction, its descendants. That is the entire "no damage spill"
 * guarantee: a Joint hit does not also damage its limb's other parts, and a
 * destroyed part's descendants are archived with it rather than inheriting
 * its damage.
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
  destroyBodyPart,
  setBodyPartIntegrity,
} from "./anatomy/modification";
import type { AnatomyModification } from "./anatomy/modification";
import { resolveAnatomy } from "./anatomy/resolution";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "./anatomy/types";
import { resolveBodyPoints } from "./body-points/resolution";
import type {
  BodyPointModifier,
  ResolvedBodyPoints,
} from "./body-points/types";
import {
  applyWeakMultiplier,
  evaluateCritical,
  evaluateFatal,
  evaluateJoint,
  getCriticalPoint,
  hasCategory,
  resolveCriticalPoints,
} from "./critical-points/resolution";
import type {
  CriticalPointId,
  CriticalPointInstance,
  CriticalOutcome,
  ResolvedCriticalPoints,
  SpecialPointDefinition,
} from "./critical-points/types";
import type { Body, BodyMorphology } from "./types";

// What Combat says was hit. A "special-point" target whose resolved point
// spans more than one host (e.g. Spine → Upper Body + Lower Body) requires
// the caller to say which host was actually struck via `hostPartId`, rather
// than this module inventing a rule for which host "wins" by default.
/*
 * What Combat says was hit.
 *
 * There is no host disambiguation any more. Shared placement is gone, so every
 * Anatomical Point has exactly one host, and "which of this point's hosts did
 * you actually strike" has stopped being a question a caller can get wrong.
 */
export type BodyDamageTarget =
  | { readonly kind: "body-part"; readonly partId: BodyPartId }
  | { readonly kind: "special-point"; readonly pointId: CriticalPointId };

export interface BodyDamageInput {
  readonly body: Body;
  readonly constitution: number;

  /*
   * The resolved physical context Body Points need, supplied rather than
   * derived, exactly as Strength resolution takes it.
   *
   * Body stores Character Scale and the character's own morphology, but
   * Effective Scale also needs Species Standard Scale and Age Scale, and
   * resolved morphology needs the Species and Age layers. Neither belongs to
   * Body, and Body must never grow a branch that asks what Species a character
   * is. Whoever assembles those layers passes the result down; Phase 8 makes
   * that assembly a production path instead of a caller's job.
   */
  readonly morphologyByPartId: Readonly<Record<BodyPartId, BodyMorphology>>;
  readonly effectiveScale: number;

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

  /** The Weak multiplier applied, or 1. */
  readonly weakMultiplier: number;

  /** Post-Weak, post-rounding. Every threshold below is read against this. */
  readonly appliedDamage: number;

  /*
   * The four categories, evaluated independently against that same number.
   * None is an else-branch of another: a Human Neck hit for 1 BP is Critical
   * destruction, Joint failure and Fatal simultaneously.
   */
  readonly critical: CriticalOutcome;

  readonly fatal: boolean;
  readonly fatalThreshold: number;

  /*
   * Which Fatal points actually fired. Usually the targeted one, but a
   * destroyed BodyPart takes every Fatal point it hosts with it — see the
   * note in applyBodyDamage.
   */
  readonly fatalPointIds: readonly CriticalPointId[];

  readonly jointFailed: boolean;
  readonly jointThreshold: number;
  readonly jointDesignatedPartId: BodyPartId | undefined;

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
      message: `No Anatomical Point "${target.pointId}" exists in the current resolved points.`,
    };
  }

  return { ok: true, hostPartId: point.hostPartId, point };
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

    formula: "appliedDamage = round(penetratingDamage x weakMultiplier)",

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

  /*
   * Body Points BEFORE the hit. The transition needs the host's Maximum BP and
   * its current exact BP, and both are derived — there is no way to subtract
   * damage from a fraction without first knowing what the fraction is of. Every
   * Anatomical Point threshold is read against these same pre-hit maxima, so a
   * hit cannot move the bar it is being measured against.
   */
  const bodyPointsBeforeDamage = resolveBodyPoints({
    anatomy: resolvedAnatomy,
    definitions: input.bodyPartDefinitions,
    morphologyByPartId: input.morphologyByPartId,
    effectiveScale: input.effectiveScale,
    constitution: input.constitution,
    modifiers: bodyPointModifiers,
  });

  const hostBP = bodyPointsBeforeDamage.byPartId[hostPartId];

  if (hostBP === undefined) {
    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: [
        {
          code: "body.damage.host.not_active",
          message:
            `BodyPart "${hostPartId}" has no Body Points because it is not ` +
            `active. A suppressed or already-destroyed part cannot be damaged.`,
          audience: "developer",
        },
      ],
    };
  }

  /*
   * Step 1 of the locked order: Weak multiplies, THEN the result is rounded.
   *
   * Rounding first would let two hits that differ only in a fraction land on
   * opposite sides of a threshold — 3 x 1.5 and 3.4 x 1.5 both round to 5 only
   * if the multiply happens first.
   */
  const weakMultiplier =
    point !== undefined && hasCategory(point, "weak")
      ? point.weakMultiplier
      : 1;

  const appliedDamage = Math.round(
    point !== undefined
      ? applyWeakMultiplier(point, input.penetratingDamage)
      : input.penetratingDamage,
  );

  const newExactBP = hostBP.exactCurrentBP - appliedDamage;

  /*
   * The one and only destruction test in the engine, and note that it is
   * against the EXACT value: a part left with 0.3 BP survives and displays 1.
   * BodyPart destruction is deliberately a separate event from Critical Point
   * destruction and from Joint failure — a Heart can be destroyed while the
   * Upper Body still has BP, and a Shoulder can fail while the Arm hangs on.
   */
  const destroyed = newExactBP <= 0;

  const writeOutcome = (anatomy: Anatomy): {
    readonly anatomy: Anatomy;
    readonly archivedPartIds: readonly BodyPartId[];
  } =>
    destroyed
      ? destroyBodyPart(anatomy, hostPartId)
      : {
          anatomy: setBodyPartIntegrity(
            anatomy,
            hostPartId,
            newExactBP / hostBP.maximumBP,
          ),
          archivedPartIds: [],
        };

  const damagedResolvedAnatomy = writeOutcome(resolvedAnatomy).anatomy;
  const storedOutcome = writeOutcome(input.body.anatomy);

  const bodyPoints = resolveBodyPoints({
    anatomy: damagedResolvedAnatomy,
    definitions: input.bodyPartDefinitions,
    morphologyByPartId: input.morphologyByPartId,
    effectiveScale: input.effectiveScale,
    constitution: input.constitution,
    modifiers: bodyPointModifiers,
  });

  /*
   * The three threshold evaluations. Independent by construction: each reads
   * the same appliedDamage and none consults the others' results.
   */
  const critical =
    point !== undefined
      ? evaluateCritical(point, hostBP.maximumBP, appliedDamage)
      : {
          tier: "none" as const,
          injuryChance: "none" as const,
          destroyed: false,
          thresholds: { minor: 0, major: 0, destruction: 0 },
        };

  const fatalOutcome =
    point !== undefined
      ? evaluateFatal(point, hostBP.maximumBP, appliedDamage)
      : { fatal: false, threshold: 0 };

  /*
   * A Joint reads its threshold against the DESIGNATED part, which is often
   * not the host: a Wrist sits on the Arm and governs the Hand, so 30% of 4
   * rather than 30% of 14.
   */
  const jointDesignatedPartId = point?.designatedPartId;

  const designatedBP =
    jointDesignatedPartId !== undefined
      ? bodyPointsBeforeDamage.byPartId[jointDesignatedPartId]
      : undefined;

  const jointOutcome =
    point !== undefined && designatedBP !== undefined
      ? evaluateJoint(point, designatedBP.maximumBP, appliedDamage)
      : { failed: false, threshold: 0 };

  /*
   * Fatal has two routes, and the spec only names one.
   *
   * The named route is the threshold: half the containing part's Maximum BP of
   * targeted damage against a Fatal point kills. That is what makes a Brain hit
   * for 4 lethal while the Head still holds 4 of its 8 BP.
   *
   * The second is an inference this engine makes deliberately. Destroying a
   * BodyPart outright destroys everything inside it, so a Head reduced to
   * nothing takes the Brain with it whether or not the attacker was aiming at
   * the Brain. Without this, decapitating a character with a plain body-part
   * hit would archive their Head and leave them alive, because no Fatal point
   * was ever targeted. The categories stay independent — this is destruction
   * propagating into its contents, not Fatal borrowing from Critical.
   */
  const fatalFromHostDestruction = destroyed
    ? criticalPoints.points.filter(
        (candidate) =>
          candidate.hostPartId === hostPartId && hasCategory(candidate, "fatal"),
      )
    : [];

  const fatalPointIds = [
    ...(fatalOutcome.fatal && point !== undefined ? [point.id] : []),
    ...fatalFromHostDestruction
      .filter((candidate) => candidate.id !== point?.id)
      .map((candidate) => candidate.id),
  ];

  const destroyedPartIds = destroyed ? [hostPartId] : [];

  const anatomy = storedOutcome.anatomy;

  const removedPartIds = storedOutcome.archivedPartIds;

  const outcome: BodyDamageOutcome = {
    anatomy,

    hostPartId,

    weakMultiplier,
    appliedDamage,

    critical,

    fatal: fatalPointIds.length > 0,
    fatalThreshold: fatalOutcome.threshold,
    fatalPointIds,

    jointFailed: jointOutcome.failed,
    jointThreshold: jointOutcome.threshold,
    jointDesignatedPartId,

    destroyedPartIds,
    removedPartIds,

    bodyPointsAfterDamage: bodyPoints,
    criticalPointsBeforeRemoval: criticalPoints,
  };

  traceNode.output = {
    hostPartId: outcome.hostPartId,
    weakMultiplier: outcome.weakMultiplier,
    appliedDamage: outcome.appliedDamage,
    criticalTier: outcome.critical.tier,
    jointFailed: outcome.jointFailed,
    destroyedPartIds: [...outcome.destroyedPartIds],
    removedPartIds: [...outcome.removedPartIds],
    fatal: outcome.fatal,
    fatalPointIds: [...outcome.fatalPointIds],
  };

  return {
    success: true,
    payload: outcome,
    trace: { root: traceNode },
    warnings: [],
  };
}
