/*
 * Accessibility and effectiveness — two questions about a BodyPart that must
 * never be answered with the same number.
 *
 *   ACCESSIBLE?    binary. Can this part be used at all right now?
 *   EFFECTIVE?     numerical. If it can be used, how well does it work?
 *
 * The distinction is easy to collapse and expensive to lose. A Hand at 3 of 4
 * BP behind a destroyed Shoulder works at 37.5% — it is not "37.5%
 * accessible", because there is no such state. It is accessible, and it is
 * weak. An arm frozen solid is not "0% effective"; it is unavailable, and its
 * effectiveness is simply not a question anyone needs to ask.
 *
 * Keeping them apart is what lets many unrelated things reach the same
 * conclusion without inventing a shared scale. A destroyed Joint, frostbite,
 * paralysis, restraint and a sealing effect all make a limb unusable, and they
 * have nothing else in common — no reason to agree on a percentage, and no
 * need to.
 *
 *
 * WHY JOINTS HAVE EXACTLY ONE THRESHOLD
 *
 * Critical Points have three tiers because a Critical Point is a structure
 * that can be progressively wrecked. A Joint is a connection: it holds or it
 * does not. Giving Joints their own 10% and 50% tiers would have been
 * redundant, because damage below the destruction threshold ALREADY matters —
 * it lands on the designated BodyPart as ordinary BP loss, and BP fraction is
 * already this engine's measure of how well a damaged part works.
 *
 * A Knee designating a 20 BP Leg fails at 6 damage. A hit for 5 leaves the Leg
 * at 15/20 and therefore at 75% effectiveness, with the Knee intact. Nothing
 * additional was needed to express "the leg is hurt but the knee holds".
 */

import {
  getBodyPartDescendants,
} from "./anatomy/resolution";
import { hasCategory } from "./critical-points/resolution";
import type { Anatomy, BodyPartId } from "./anatomy/types";
import type { ResolvedBodyPoints } from "./body-points/types";
import type {
  CriticalPointId,
  ResolvedCriticalPoints,
} from "./critical-points/types";


/*
 * What a destroyed Joint does to everything hanging off it.
 *
 * Applied AFTER BP fraction and multiplicatively, never additively and never
 * as a floor:
 *
 *   0.60 x 0.50 = 0.30        correct
 *   0.60 - 0.50 = 0.10        wrong
 *   max(0.60, 0.50) = 0.60    wrong
 *
 * Multiplication is what makes the penalty mean "half of whatever it had left"
 * rather than a flat deduction that would erase a healthy limb and barely
 * touch a ruined one.
 */
export const JOINT_DOWNSTREAM_EFFECTIVENESS_MULTIPLIER = 0.5;


/*
 * Something other than a Joint that makes a BodyPart unusable.
 *
 * Body does not know what a Condition is and must not learn. Frostbite,
 * paralysis, restraint, petrification and sealing are all the same shape from
 * here — a part id and a source to name in diagnostics — so whatever layer
 * owns that content builds these and passes them in.
 */
export interface InaccessibilitySource {
  readonly sourceId: string;
  readonly partId: BodyPartId;
}


export interface ResolvedPartCapability {
  readonly partId: BodyPartId;

  /** Binary. There is no partial accessibility. */
  readonly accessible: boolean;

  /** Point ids and source ids that made it inaccessible. Empty when usable. */
  readonly inaccessibleReasons: readonly string[];

  /** ExactCurrentBP / MaxBP — equivalently the stored integrity fraction. */
  readonly bpFraction: number;

  /** How many destroyed Joints sit upstream of this part. */
  readonly destroyedUpstreamJoints: number;

  /** bpFraction x 0.50^destroyedUpstreamJoints. */
  readonly effectiveness: number;
}


export interface ResolvedBodyCapability {
  readonly parts: readonly ResolvedPartCapability[];

  readonly byPartId: Readonly<Record<BodyPartId, ResolvedPartCapability>>;
}


export interface CapabilityResolutionInput {
  readonly anatomy: Anatomy;

  readonly points: ResolvedCriticalPoints;

  /*
   * Which Joint points are currently destroyed.
   *
   * Supplied rather than stored, for now. Persisting Anatomical Point state is
   * its own piece of work; until it exists, whoever holds that state passes it
   * here, exactly as morphology and effective scale are passed to Body Points.
   */
  readonly destroyedJointPointIds: readonly CriticalPointId[];

  readonly bodyPoints: ResolvedBodyPoints;

  readonly inaccessibility?: readonly InaccessibilitySource[];
}


/*
 * Resolves accessibility and effectiveness for every BodyPart.
 *
 * A destroyed Joint does two separate things, and the split is the point:
 *
 *   1. its DESIGNATED BodyPart becomes inaccessible
 *   2. every part DOWNSTREAM of that one takes x0.50 effectiveness
 *
 * So a destroyed Shoulder makes the Arm unusable and leaves the Hand usable at
 * half strength. That is deliberate rather than an oversight — a hand on a
 * dead arm can still grip, it just cannot do much — and it is why
 * inaccessibility does not cascade while the effectiveness penalty does.
 *
 * Penalties from several destroyed Joints stack multiplicatively, 0.50 each,
 * because two independent control failures on one pathway are two failures
 * rather than one worse one.
 */
export function resolveBodyCapability(
  input: CapabilityResolutionInput,
): ResolvedBodyCapability {
  const destroyed = new Set(input.destroyedJointPointIds);

  const inaccessibleReasons = new Map<BodyPartId, string[]>();
  const upstreamJointCount = new Map<BodyPartId, number>();

  const addReason = (partId: BodyPartId, reason: string): void => {
    const existing = inaccessibleReasons.get(partId);

    if (existing === undefined) {
      inaccessibleReasons.set(partId, [reason]);
      return;
    }

    existing.push(reason);
  };

  for (const point of input.points.points) {
    if (!destroyed.has(point.id)) continue;
    if (!hasCategory(point, "joint")) continue;

    const designatedPartId = point.designatedPartId;

    if (designatedPartId === undefined) continue;

    addReason(designatedPartId, point.id);

    for (const descendant of getBodyPartDescendants(
      input.anatomy,
      designatedPartId,
    )) {
      upstreamJointCount.set(
        descendant.id,
        (upstreamJointCount.get(descendant.id) ?? 0) + 1,
      );
    }
  }

  for (const source of input.inaccessibility ?? []) {
    addReason(source.partId, source.sourceId);
  }

  const parts: ResolvedPartCapability[] = [];
  const byPartId: Record<BodyPartId, ResolvedPartCapability> = {};

  for (const part of input.anatomy.parts) {
    const resolvedBP = input.bodyPoints.byPartId[part.id];

    /*
     * A part with no resolved Body Points is not active — suppressed, or
     * destroyed and archived. It has left the body, so it is unusable and its
     * effectiveness is zero rather than undefined: absent is not a degree of
     * present.
     */
    if (part.state !== "active" || resolvedBP === undefined) {
      const capability: ResolvedPartCapability = {
        partId: part.id,
        accessible: false,
        inaccessibleReasons: [
          `state:${part.state}`,
          ...(inaccessibleReasons.get(part.id) ?? []),
        ],
        bpFraction: 0,
        destroyedUpstreamJoints: 0,
        effectiveness: 0,
      };

      parts.push(capability);
      byPartId[part.id] = capability;

      continue;
    }

    const bpFraction = resolvedBP.exactCurrentBP / resolvedBP.maximumBP;

    const destroyedUpstreamJoints = upstreamJointCount.get(part.id) ?? 0;

    const reasons = inaccessibleReasons.get(part.id) ?? [];

    const capability: ResolvedPartCapability = {
      partId: part.id,
      accessible: reasons.length === 0,
      inaccessibleReasons: reasons,
      bpFraction,
      destroyedUpstreamJoints,
      effectiveness:
        bpFraction *
        Math.pow(
          JOINT_DOWNSTREAM_EFFECTIVENESS_MULTIPLIER,
          destroyedUpstreamJoints,
        ),
    };

    parts.push(capability);
    byPartId[part.id] = capability;
  }

  return { parts, byPartId };
}
