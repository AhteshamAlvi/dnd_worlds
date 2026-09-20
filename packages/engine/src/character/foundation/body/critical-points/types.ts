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
 * FIVE INDEPENDENT CATEGORIES
 *
 *   FATAL     ceil(containing MaxBP x 0.50) of final damage kills
 *   CRITICAL  10% / 30% / 50% of containing MaxBP, three injury tiers
 *   JOINT     ceil(designated MaxBP x 0.30) breaks the connection
 *   WEAK      multiplies final BP damage by 1.5
 *   SENSORY   produces a share of one or more Senses, and occupies surface
 *
 * They are FLAGS, not a discriminated union, and that is the central change
 * in this model. A point may carry any combination: the Human Neck is Fatal,
 * Critical, Joint and Weak at once, an Armpit is Joint and Weak, an Eye is
 * Critical, Weak and Sensory, an Ear is Sensory alone, and one hit evaluates
 * every damage category it carries independently. The previous model made
 * category an exclusive tag, which could not express any of that.
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
 * concerns" (e.g. injuries/types.ts) rather than about point mechanics.
 * One id space, one registry.
 */
export type SpecialPointDefinitionId = CriticalPointTypeId;


/*
 * The five independent mechanical roles a point may carry.
 *
 * SENSORY is the odd one out and deliberately so: the other four describe what
 * happens when something HITS the point, and Sensory describes what the point
 * DOES while nothing is happening to it. It is in the same list anyway because
 * the combination is the whole model — an Eye is Critical, Weak and Sensory at
 * once, and destroying it has to mean all three things.
 *
 * A point may be Sensory and nothing else. An Ear is not a damage category; it
 * is a place a creature hears from, and requiring it to also be Critical or
 * Weak in order to exist would be inventing a vulnerability nobody authored.
 */
export type AnatomicalPointCategory =
  | "fatal"
  | "critical"
  | "joint"
  | "weak"
  | "sensory";

export const ANATOMICAL_POINT_CATEGORIES = [
  "fatal",
  "critical",
  "joint",
  "weak",
  "sensory",
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


/* -------------------------------------------------------------------------- */
/* Sensory metadata                                                           */
/* -------------------------------------------------------------------------- */

/*
 * A Sense id, as the BODY is allowed to know it.
 *
 * A plain string alias, and that is the point. Body validation checks the
 * SHAPE of this field — non-empty, not duplicated within one point — and never
 * whether the Sense exists, because importing the Sense registry here would
 * make the body foundation depend on the sensory foundation at runtime for the
 * sake of a membership test.
 *
 * Existence is proved at the character/content composition boundary, which is
 * where both catalogs are in scope anyway. That is later than it could be and
 * earlier than it matters: nothing between the two points can act on a Sense
 * id, so an unknown one cannot do anything except fail to resolve.
 */
export type AnatomicalSenseId = string;


/*
 * How much of a Sense one point is responsible for.
 *
 *   fixed           a discrete organ's own share. Two Human Eyes are 0.50
 *                   each. Shares are NOT normalized and are NOT clamped: a
 *                   creature whose authored organs total 1.20 has unusually
 *                   good eyes, and flattening that to 1.00 would delete the
 *                   only thing the author was trying to say.
 *
 *   network-weight  a member of distributed anatomy, whose share is its
 *                   weight over the sum of the weights of the members that are
 *                   PRESENT. Skin is not 214 organs each worth 1/214 — it is
 *                   one surface, and losing an arm redistributes rather than
 *                   subtracts, which is what normalizing at resolution buys.
 */
export type SensoryContribution =
  | { readonly kind: "fixed"; readonly amount: number }
  | {
      readonly kind: "network-weight";
      readonly networkId: string;
      readonly sensitivity: number;
    };


/*
 * How much SURFACE the point occupies, for coating and Sensory Gyō.
 *
 *   host-surface-fraction  a share of the host BodyPart's resolved area.
 *                          Right for biological anatomy, because an eye on a
 *                          giant is a bigger eye.
 *   absolute               a fixed area in square metres. Right for an implant,
 *                          a gem or a construct's lens, which is the size it is
 *                          regardless of what it is bolted to.
 *   host-remainder         everything the host has left once every other point
 *                          has taken its share.
 *
 * Any of the three resolves to one positive number of square metres, and it
 * PARTITIONS the host rather than adding to it. A Palm's area is area the Hand
 * already had; a body does not grow when somebody notices it has palms.
 *
 *
 * WHY `host-remainder` HAS TO EXIST
 *
 * Because skin is a sense organ, and it is specifically the sense organ made
 * of whatever is not another sense organ. A tactile surface authored as a
 * fraction would be a number nobody can justify — 0.95 of a Head? 0.97? — and
 * every such number would silently leave a sliver of skin that feels nothing.
 *
 * Stating it as "the rest" makes the partition exact by construction instead
 * of by an author getting three decimal places right, and it keeps working
 * when a Species adds a seventh facial organ: the skin gives up exactly that
 * organ's area and nothing has to be retuned.
 *
 * At most ONE point per host may claim it. Two would each be handed the whole
 * remainder and the host's area would be counted twice, which resolution
 * refuses.
 */
export type SensoryPointFootprint =
  | { readonly kind: "host-surface-fraction"; readonly fraction: number }
  | { readonly kind: "absolute"; readonly squareMetres: number }
  | { readonly kind: "host-remainder" };


/*
 * Which group of points Sensory Gyō may concentrate into together.
 *
 *   local        a cluster within one host — the facial eyes, one hand's palm.
 *                Its resolved identity is (host BodyPart, Sense, cluster), so
 *                the same authored cluster name on two different Heads is two
 *                clusters and cannot be combined.
 *   distributed  a network spanning the body. `all-active` is the only
 *                selection there is: half a skin is not a thing a character
 *                can choose to concentrate into.
 */
export type SensoryFocusMembership =
  | { readonly kind: "local"; readonly cluster: string }
  | {
      readonly kind: "distributed";
      readonly network: string;
      readonly selection: "all-active";
    };


export interface AnatomicalPointSensoryFunction {
  readonly senseId: AnatomicalSenseId;
  readonly contribution: SensoryContribution;
}


/*
 * Everything a Sensory point carries.
 *
 * Required on a Sensory point and FORBIDDEN on every other point. A Sensory
 * category with no metadata is a point that claims to produce a Sense and
 * cannot say which one; metadata on a non-Sensory point is a footprint that
 * would silently claim host area for nothing.
 *
 * One footprint, however many Senses. A physical organ occupies one piece of
 * the creature's surface even when it does several jobs — an eye that sees
 * light and senses heat is one eye, and giving it two footprints would let a
 * multi-purpose organ quietly claim twice the body it has.
 */
export interface SensoryAnatomicalPointData {
  readonly footprint: SensoryPointFootprint;
  readonly focus: SensoryFocusMembership;
  readonly functions: readonly AnatomicalPointSensoryFunction[];
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

  /** Required for Sensory points, forbidden otherwise. */
  readonly sensory?: SensoryAnatomicalPointData;
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

  /*
   * Carried onto the instance rather than looked up from the definition by
   * every consumer.
   *
   * A resolved point is what the sensory domain and the coating boundary are
   * handed, and requiring each of them to also carry the definition catalog in
   * order to find out that this Eye contributes 0.50 of Sight would mean three
   * places holding a catalog for one field.
   */
  readonly sensory?: SensoryAnatomicalPointData;
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
