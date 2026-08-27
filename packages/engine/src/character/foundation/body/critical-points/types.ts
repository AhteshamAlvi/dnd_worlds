/*
 * Core Critical-Point-domain value shapes.
 *
 * Critical Points are special anatomical targets layered over resolved Anatomy.
 *
 * They are not ordinary BodyParts and normally do not possess independent BP.
 * Instead, they reference one or more actual BodyPart instances whose BP
 * represents the physical structure associated with the target.
 *
 * There are three categories:
 *
 * Critical
 * → failure of the associated BP-bearing structure is fatal.
 *
 * Semicritical
 * → a successful targeted hit deals normal BP damage to the applicable host
 *   and creates an Injury opportunity for the GM.
 *
 * Joint
 * → a successful targeted hit multiplies penetrating BP damage to its
 *   associated BodyPart and also creates an Injury opportunity.
 *
 * Critical Point instances are derived from resolved Anatomy rather than
 * normally being stored persistently on the character.
 */

import type {
  BodyPartId,
} from "../anatomy/types";
import type {
  BodyPartSelector,
} from "../selectors";


/*
 * Stable identifier for a reusable Critical Point definition.
 *
 * Examples:
 *
 * "brain"
 * "heart"
 * "face"
 * "shoulder"
 * "knee"
 */
export type CriticalPointTypeId = string;


/*
 * Stable identifier for one resolved Critical Point instance.
 *
 * Examples:
 *
 * "brain-head-1"
 * "shoulder-arm-1"
 * "shoulder-arm-3"
 * "wrist-hand-2"
 */
export type CriticalPointId = string;


/*
 * Alias used by domains that talk about "the Special Point a location
 * concerns" (e.g. status/injuries.ts) rather than about the Critical Point
 * mechanics themselves. Same id space as CriticalPointTypeId — Critical,
 * Semicritical, and Joint definitions all share one registry.
 */
export type SpecialPointDefinitionId = CriticalPointTypeId;


/*
 * The three mechanical classes of special anatomical target.
 */
export type CriticalPointCategory =
  | "critical"
  | "semicritical"
  | "joint";


/*
 * Creates one Critical Point instance for every BodyPart matched by the
 * selector.
 *
 * Examples:
 *
 * Shoulder
 * selector: every Arm
 *
 * Four Arms:
 *
 * shoulder-arm-1
 * shoulder-arm-2
 * shoulder-arm-3
 * shoulder-arm-4
 *
 * This is also appropriate for targets such as Brain or Heart when each
 * matching host should possess its own target instance.
 */
export interface PerPartCriticalPointPlacement {
  readonly kind: "per-part";
  readonly selector: BodyPartSelector;
}


/*
 * Creates one Critical Point instance whose hosts are all BodyParts matched by
 * the selector.
 *
 * This is used when one anatomical target spans several BodyPart regions.
 *
 * Example:
 *
 * Spine
 * → Upper Body + Lower Body
 */
export interface SharedCriticalPointPlacement {
  readonly kind: "shared";
  readonly selector: BodyPartSelector;
}


/*
 * Marks the matching BodyPart itself as the special target.
 *
 * The primary standard example is Neck:
 *
 * Neck is simultaneously:
 *
 * - an ordinary BP-bearing BodyPart;
 * - a Critical Point.
 *
 * It therefore does not require a separate internal target layered inside some
 * other BodyPart.
 */
export interface BodyPartSelfCriticalPointPlacement {
  readonly kind: "body-part-self";
  readonly selector: BodyPartSelector;
}


/*
 * Generic placement rule used to derive Critical Point instances from resolved
 * Anatomy.
 */
export type CriticalPointPlacement =
  | PerPartCriticalPointPlacement
  | SharedCriticalPointPlacement
  | BodyPartSelfCriticalPointPlacement;


/*
 * Fields shared by every reusable Critical Point definition.
 *
 * `name`/`description` make this a Definition (see infrastructure/registry.ts)
 * so Special Point content is registered and looked up the same way every
 * other catalog domain's content is — see critical-points/special-points.ts.
 * Mechanical behavior must still depend on IDs and category rather than
 * presentation text.
 */
interface CriticalPointDefinitionBase {
  readonly id: CriticalPointTypeId;
  readonly name: string;
  readonly description: string;

  readonly placement: CriticalPointPlacement;
}


/*
 * Critical target.
 *
 * A Critical Point does not mean that any amount of damage causes instant
 * death.
 *
 * Instead, the BP-bearing host associated with the Critical Point must reach
 * physical failure.
 *
 * Standard examples:
 *
 * Brain
 * → hosted by Head
 * → Head reaches 0 BP
 * → fatal failure
 *
 * Heart
 * → hosted by Upper Body
 * → Upper Body reaches 0 BP
 * → fatal failure
 *
 * Neck
 * → Neck is the host itself
 * → Neck reaches 0 BP
 * → fatal failure
 */
export interface CriticalPointDefinition
  extends CriticalPointDefinitionBase {
  readonly category: "critical";

  readonly failureConsequence: "death";
}


/*
 * Semicritical target.
 *
 * Successful targeted damage against a Semicritical Point creates an Injury
 * opportunity.
 *
 * The actual Injury is NOT defined here.
 *
 * Future injuries.ts owns:
 *
 * - which Injuries are appropriate;
 * - their mechanical consequences;
 * - any continuing damage;
 * - impairment;
 * - recovery.
 *
 * The GM may also choose No Injury.
 */
export interface SemicriticalPointDefinition
  extends CriticalPointDefinitionBase {
  readonly category: "semicritical";
}


/*
 * Joint target.
 *
 * Joint targets multiply penetrating BP damage applied to their associated
 * BodyPart.
 *
 * The multiplier applies after Combat has already resolved defenses such as
 * soak, armor, or Aura.
 *
 * A successful Joint hit also creates an Injury opportunity, but the actual
 * Injury belongs to injuries.ts.
 *
 * Standard examples:
 *
 * Shoulder → Arm  ×2
 * Elbow    → Arm  ×1.5
 * Wrist    → Hand ×2
 *
 * Hip      → Leg  ×2
 * Knee     → Leg  ×1.5
 * Ankle    → Foot ×2
 */
export interface JointPointDefinition
  extends CriticalPointDefinitionBase {
  readonly category: "joint";

  readonly damageMultiplier: number;
}


/*
 * Any reusable special anatomical target definition.
 */
export type SpecialPointDefinition =
  | CriticalPointDefinition
  | SemicriticalPointDefinition
  | JointPointDefinition;


/*
 * Fields shared by every resolved Critical Point instance.
 *
 * `hostPartIds` references actual BodyPart instances in the current resolved
 * Anatomy.
 *
 * It is plural because some special targets may span multiple BodyParts.
 *
 * Example:
 *
 * Spine
 * → [upper-body-1, lower-body-1]
 *
 * For per-part and body-part-self targets, this will normally contain exactly
 * one BodyPartId.
 */
interface CriticalPointInstanceBase {
  readonly id: CriticalPointId;
  readonly definitionId: CriticalPointTypeId;

  readonly hostPartIds: readonly BodyPartId[];
}


/*
 * Resolved Critical instance.
 *
 * The host's BP reaching physical failure produces fatal Critical failure.
 */
export interface ResolvedCriticalPoint
  extends CriticalPointInstanceBase {
  readonly category: "critical";

  readonly failureConsequence: "death";
}


/*
 * Resolved Semicritical instance.
 *
 * A successful targeted hit creates an Injury opportunity.
 *
 * `true` is literal because Injury opportunity is inherent to the
 * Semicritical category rather than optional definition data.
 */
export interface ResolvedSemicriticalPoint
  extends CriticalPointInstanceBase {
  readonly category: "semicritical";

  readonly injuryOpportunity: true;
}


/*
 * Resolved Joint instance.
 *
 * The host BodyPart receives:
 *
 * penetratingDamage × damageMultiplier
 *
 * Joint damage does not automatically spill into structurally connected
 * BodyParts.
 *
 * Example:
 *
 * Shoulder on arm-1
 * → Arm receives ×2 damage
 * → attached Hand receives no direct BP damage.
 */
export interface ResolvedJointPoint
  extends CriticalPointInstanceBase {
  readonly category: "joint";

  readonly damageMultiplier: number;

  readonly injuryOpportunity: true;
}


/*
 * Any resolved special anatomical target currently present on the character.
 */
export type CriticalPointInstance =
  | ResolvedCriticalPoint
  | ResolvedSemicriticalPoint
  | ResolvedJointPoint;


/*
 * Complete Critical Point state derived from the current resolved Anatomy.
 *
 * Definitions are resolved against Anatomy each time rather than permanently
 * storing Critical Point instances on the character.
 *
 * This allows temporary or unusual anatomy to participate automatically.
 *
 * Example:
 *
 * temporary transformation adds arm-3
 * → Shoulder and Elbow instances for arm-3 appear
 *
 * transformation ends
 * → those instances disappear when Critical Points are resolved again.
 */
export interface ResolvedCriticalPoints {
  readonly points:
    readonly CriticalPointInstance[];
}