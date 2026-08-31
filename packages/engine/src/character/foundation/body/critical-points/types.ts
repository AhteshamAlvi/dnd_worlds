/*
 * Anatomical Points — Species-defined targetable physical locations layered
 * over resolved Anatomy.
 *
 * A point may represent an internal structure (Brain, Heart), a vulnerable
 * region (Jaw, Solar Plexus), a physical connection (Shoulder, Wrist), or a
 * control pathway (Spine). Points do NOT maintain BP pools of their own:
 * damage aimed at a point lands on a containing or designated BodyPart, and
 * every consequence a point has is a threshold read against that BodyPart's
 * Maximum BP.
 *
 *
 * FOUR INDEPENDENT CATEGORIES
 *
 *   FATAL     ceil(containing MaxBP x 0.50) of final damage kills
 *   CRITICAL  10% / 30% / 50% of containing MaxBP, three injury tiers
 *   JOINT     ceil(designated MaxBP x 0.30) breaks the connection
 *   WEAK      multiplies final BP damage by 1.5
 *
 * They are FLAGS, not a discriminated union, and that is the central change
 * in this model. A point may carry any combination: the Human Neck is all
 * four at once, an Armpit is Joint and Weak, an Eye is Critical and Weak, and
 * one hit evaluates every category it carries independently. The previous
 * model made category an exclusive tag, which could not express any of that.
 *
 * The "semicritical" category is gone. It existed to mean "a hit here creates
 * an injury opportunity", which is now what the Critical tiers say with more
 * precision — a percentage of Max BP, and a stated chance rather than a bare
 * boolean.
 *
 * Joints no longer multiply damage either. A Shoulder used to double every
 * point of damage aimed at it; it now breaks at a threshold and multiplies
 * nothing. Where a joint really is a soft target the definition says so by
 * also being Weak, which is why the Armpit beside the Shoulder is x1.5 and
 * the Shoulder itself is not.
 */

import type {
  BodyPartId,
} from "../anatomy/types";
import type {
  BodyPartSelector,
} from "../selectors";


/*
 * Stable identifier for a reusable Anatomical Point definition.
 *
 * Examples: "brain", "heart", "left-eye", "shoulder", "knee".
 */
export type CriticalPointTypeId = string;


/*
 * Stable identifier for one resolved Anatomical Point instance.
 *
 * Examples: "brain:head-1", "shoulder:arm-1", "wrist:hand-2".
 */
export type CriticalPointId = string;


/*
 * Alias used by domains that talk about "the Special Point a location
 * concerns" (e.g. status/injuries.ts) rather than about point mechanics.
 * One id space, one registry.
 */
export type SpecialPointDefinitionId = CriticalPointTypeId;


/*
 * The four independent mechanical roles a point may carry.
 */
export type AnatomicalPointCategory =
  | "fatal"
  | "critical"
  | "joint"
  | "weak";

export const ANATOMICAL_POINT_CATEGORIES = [
  "fatal",
  "critical",
  "joint",
  "weak",
] as const satisfies readonly AnatomicalPointCategory[];

/** Retained name for the category union. */
export type CriticalPointCategory = AnatomicalPointCategory;


/*
 * Creates one point instance for every BodyPart matched by the selector.
 *
 * A Shoulder selecting every Arm on a four-armed body produces four
 * instances. Equally right for Brain or Heart, where each matching host
 * should own its own target.
 */
export interface PerPartCriticalPointPlacement {
  readonly kind: "per-part";
  readonly selector: BodyPartSelector;
}


/*
 * Marks the matching BodyPart itself as the target.
 *
 * The standard example is the Neck, which is simultaneously an ordinary
 * BP-bearing BodyPart and an Anatomical Point, and therefore needs no separate
 * internal target layered inside something else.
 */
export interface BodyPartSelfCriticalPointPlacement {
  readonly kind: "body-part-self";
  readonly selector: BodyPartSelector;
}


/*
 * How point instances are derived from resolved Anatomy.
 *
 * There is deliberately no "shared" placement spanning several hosts any more.
 * It had exactly one user — a Spine straddling Upper Body and Lower Body — and
 * it forced every consumer to answer an unanswerable question: when a target
 * spans two BodyParts, which one did the hit actually land on? Damage
 * application carried a disambiguation parameter purely to service it, and a
 * caller that forgot to supply one got an error instead of a result.
 *
 * The Spine is now two points, Upper and Lower, each hosted by one BodyPart.
 * Anatomy that genuinely spans regions authors one point per region, which
 * says the same thing without ever leaving the host ambiguous.
 */
export type CriticalPointPlacement =
  | PerPartCriticalPointPlacement
  | BodyPartSelfCriticalPointPlacement;


/*
 * The three Critical damage tiers, as fractions of the containing BodyPart's
 * Maximum BP.
 *
 * Thresholds are PERCENTAGES OF MAX BP. Keep them mentally separate from the
 * injury chances they produce, which are ordinary fractions: 30% of Max BP is
 * a threshold, 1/2 is a probability, and 1/3 is not 30%.
 */
export const CRITICAL_TIER_FRACTIONS = {
  minor: 0.10,
  major: 0.30,
  destruction: 0.50,
} as const;

/** Default Joint failure threshold, as a fraction of designated Max BP. */
export const JOINT_FAILURE_FRACTION = 0.30;

/** Default Fatal threshold, as a fraction of containing Max BP. */
export const FATAL_FRACTION = 0.50;

/** Default Weak multiplier on final BP damage. */
export const WEAK_DAMAGE_MULTIPLIER = 1.5;


/*
 * How likely a specialized Injury is, given the Critical tier reached.
 *
 * The engine returns the tier and never rolls. Every other subsystem here
 * answers questions and leaves resolution to its caller, and randomness is no
 * different — the Foundry module owns the dice.
 *
 * These ARE fractions rather than percentages, unlike the thresholds that
 * produce them.
 */
export type CriticalInjuryChance =
  | "none"
  | "one-third"
  | "one-half"
  | "guaranteed";


/*
 * What a Critical evaluation concluded.
 *
 * `destroyed` is true only at the highest tier, and it is what turns an
 * Anatomical Point into a persistent casualty rather than a passing event.
 */
export interface CriticalOutcome {
  readonly tier: "none" | "minor" | "major" | "destruction";
  readonly injuryChance: CriticalInjuryChance;
  readonly destroyed: boolean;

  /** Whole BP required to reach each tier, against the host's Maximum BP. */
  readonly thresholds: {
    readonly minor: number;
    readonly major: number;
    readonly destruction: number;
  };
}


/*
 * Fields shared by every reusable Anatomical Point definition.
 */
interface AnatomicalPointDefinitionBase {
  readonly id: CriticalPointTypeId;
  readonly name: string;
  readonly description: string;

  readonly placement: CriticalPointPlacement;
}


/*
 * A reusable Anatomical Point definition.
 *
 * `categories` is the whole mechanical identity. An empty list is meaningless
 * and rejected by validation: a point that is none of the four does nothing
 * that targeting an ordinary BodyPart would not already do.
 *
 * `jointDesignation` says which BodyPart a Joint's threshold is measured
 * against and which becomes inaccessible when it fails, and it is required for
 * Joint points and forbidden on everything else. It matters because it is
 * frequently NOT the host: a Wrist is hosted by the Arm but designates the
 * Hand, so its threshold is 30% of the Hand's 4 Max BP and not of the Arm's
 * 14.
 */
export interface AnatomicalPointDefinition
  extends AnatomicalPointDefinitionBase {
  readonly categories: readonly AnatomicalPointCategory[];

  /** Required for Joint points, forbidden otherwise. */
  readonly jointDesignation?: JointDesignation;

  /** Overrides WEAK_DAMAGE_MULTIPLIER for this point. */
  readonly weakMultiplier?: number;
}

/** Retained name. Every point definition is one type now. */
export type SpecialPointDefinition = AnatomicalPointDefinition;


/*
 * Which BodyPart a Joint governs.
 *
 * "self" designates the host itself — a Neck whose own failure breaks its own
 * connection. "child-of-host" designates the host's structural children
 * matched by the selector, which is how a Shoulder hosted by the Upper Body
 * designates the Arm hanging off it.
 */
export type JointDesignation =
  | { readonly kind: "self" }
  | { readonly kind: "host" }
  | { readonly kind: "child-of-host"; readonly selector: BodyPartSelector };


/*
 * One resolved Anatomical Point instance.
 *
 * `hostPartId` is singular now. Every point has exactly one host, because
 * shared placement is gone and with it the question of which host a hit
 * landed on.
 *
 * `designatedPartId` is present only for Joints, and may differ from the host.
 */
export interface CriticalPointInstance {
  readonly id: CriticalPointId;
  readonly definitionId: CriticalPointTypeId;

  readonly categories: readonly AnatomicalPointCategory[];

  readonly hostPartId: BodyPartId;

  readonly designatedPartId?: BodyPartId;

  readonly weakMultiplier: number;
}


/*
 * Complete Anatomical Point state derived from current resolved Anatomy.
 *
 * Derived rather than stored, so unusual or temporary anatomy participates
 * automatically: a transformation that adds arm-3 gains a Shoulder and an
 * Elbow for it, and loses them again when the transformation ends.
 *
 * Note that whether a point has been DESTROYED is persistent state and does
 * not live here — see body/types.ts. What anatomy a body has and what has
 * already happened to it are separate questions, the same way they are for
 * BodyParts.
 */
export interface ResolvedCriticalPoints {
  readonly points: readonly CriticalPointInstance[];

  readonly byId: Readonly<Record<CriticalPointId, CriticalPointInstance>>;
}
