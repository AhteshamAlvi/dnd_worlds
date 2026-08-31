/*
 * Stature — how far this individual's size and build sit from what is ordinary
 * for their own kind, at their own age.
 *
 * The question this subsystem answers is not "how tall is this character" but
 * "is this a height a member of this Species can simply have?". Those are
 * different questions, and only the second one has a rule attached: a Human of
 * 210 cm is not merely tall, they are outside what an ordinary Human body
 * does, and something has to explain it.
 *
 *
 * WHY A RATIO AND NOT CENTIMETRES
 *
 * A band authored in absolute centimetres is wrong twice over. A Giant is 16.5
 * m and perfectly ordinary; a Human six-year-old is 116 cm and equally
 * ordinary. Any fixed cm band flags one of them, and widening it until it
 * flags neither stops meaning anything at all.
 *
 * The quantity that is species-neutral AND age-neutral is the ratio of this
 * body to the ordinary body of its kind at its age:
 *
 *   heightRatio = this character's height / an ordinary same-age member's
 *
 * A Human band of 0.89 to 1.20 is 147-198 cm for an adult, 131-176 cm for a
 * twelve-year-old, and — authored identically on a Giant — 14.7 m to 19.8 m.
 * One number, no per-age or per-Species special cases.
 *
 *
 * WHAT EACH BAND ACTUALLY MEASURES
 *
 * The two bands deliberately isolate different morphology:
 *
 *   height  responds to Character Scale and Length
 *   mass    responds to Bulk and Adiposity
 *
 * Muscularity is excluded from both. It cannot change Height at all, and for
 * Mass its exclusion is the entire point: Strength advancement buys
 * Muscularity, and a character who has bought their way to STR 13 weighs 105
 * kg on a 165 cm frame. That is a trained body, not a medical condition, and
 * flagging it would make the engine's own progression system generate
 * characters the engine rejects. The Mass band therefore measures build the
 * way a doctor means it and not the way BMI does — fat and bulk, not muscle.
 * The STR cap is what bounds muscular mass, and it already exists.
 */

import type { BodyMorphology } from "../types";
import type { Anatomy, BodyPartDefinition } from "../anatomy/types";
import type { MorphologyResolutionInput } from "../morphology/types";


/*
 * The ordinary range for one dimension, as a ratio to the species-and-age norm.
 *
 * Both ends are inclusive. `1` must always lie inside the band, because 1 IS
 * the ordinary member of the Species at that age — a band excluding it would
 * declare every normal member of the Species exceptional. Enforced in
 * validation.
 */
export interface StatureBand {
  readonly min: number;
  readonly max: number;
}


/*
 * A Species' authored ordinary ranges.
 *
 * This belongs to the Species and nowhere else. It is the mechanical form of a
 * sentence every setting already has an opinion about — "how big do these
 * people get?" — and two Species sharing anatomy can disagree about it
 * completely.
 */
export interface SpeciesStatureBands {
  readonly height: StatureBand;
  readonly mass: StatureBand;
}


/*
 * Where a dimension falls relative to its band.
 *
 * "within" is the ordinary case. The two outside values are kept distinct
 * rather than collapsed into one "outside", because a Trait that explains
 * unusual height does not explain unusual shortness, and the justification
 * check has to be able to tell them apart.
 */
export type StatureDeviation = "below" | "within" | "above";


/*
 * One tier, deliberately.
 *
 * A body is either something its Species ordinarily produces, or it is not.
 * There is no middle tier for "unusual but allowed": a grading like that reads
 * as a warning nobody acts on, and the rule here is not advisory. Outside the
 * band is reachable — it is simply not reachable without a Trait or Condition
 * that says so.
 */
export type StatureStanding = "ordinary" | "exceptional";


export interface StatureDimensionAssessment {
  /** The resolved value: centimetres for height, kilograms for mass. */
  readonly resolved: number;

  /** What an ordinary member of this Species at this age resolves to. */
  readonly ordinary: number;

  readonly ratio: number;

  readonly band: StatureBand;

  readonly deviation: StatureDeviation;
  readonly standing: StatureStanding;
}


/*
 * The whole assessment.
 *
 * `standing` is exceptional when EITHER dimension is. A character can be an
 * ordinary height and an impossible mass, and that still needs explaining.
 */
export interface StatureAssessment {
  readonly height: StatureDimensionAssessment;
  readonly mass: StatureDimensionAssessment;

  readonly standing: StatureStanding;
}


/*
 * A Trait or Condition that licenses one specific deviation.
 *
 * Deliberately not a Trait reference. Body does not import identity, does not
 * know what a Trait is, and must not grow a list of which ones grant height.
 * Whatever layer owns Traits and Conditions builds these from its own content
 * and hands them over; Body only checks that the deviation in front of it is
 * covered.
 */
export interface StatureJustification {
  /** The Trait or Condition granting this. Carried for diagnostics only. */
  readonly sourceId: string;

  readonly dimension: "height" | "mass";
  readonly deviation: Exclude<StatureDeviation, "within">;
}


/*
 * What the assessor needs.
 *
 * `anatomy` is the BASE body's intact anatomy. The assessor forces every part
 * active before measuring, so a caller cannot accidentally classify an
 * amputee as abnormally short: losing a leg is damage, not stature, and the
 * base body is defined as the intact form regardless of current instance
 * state.
 *
 * Scale arrives as its three separate contributions rather than as one
 * Effective Scale, because the norm is precisely "this body with Character
 * Scale set back to 1" and a pre-multiplied Effective Scale cannot be taken
 * apart again.
 *
 * `morphology` is the full layer stack rather than resolved per-part values,
 * for the same reason: the norm is this stack with the character's own
 * contributions neutralised, which needs the layers still separable.
 */
export interface StatureAssessmentInput {
  readonly anatomy: Anatomy;
  readonly definitions: readonly BodyPartDefinition[];

  readonly morphology: MorphologyResolutionInput;

  readonly speciesStandardScale: number;
  readonly ageScale: number;
  readonly characterScale: number;

  readonly bands: SpeciesStatureBands;
}


/*
 * The morphology dimensions each band's norm neutralises.
 *
 * Exported so the tests can assert the split rather than restate it, and so
 * the reason muscularity appears in neither list stays visible at the point
 * the lists are used.
 */
export const HEIGHT_NORM_NEUTRALISED_DIMENSIONS = [
  "length",
] as const satisfies readonly (keyof BodyMorphology)[];

export const MASS_NORM_NEUTRALISED_DIMENSIONS = [
  "bulk",
  "adiposity",
] as const satisfies readonly (keyof BodyMorphology)[];
