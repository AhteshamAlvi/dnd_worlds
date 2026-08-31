/*
 * The Human Anatomical Point roster.
 *
 * Content, not mechanics — anatomy/body-parts.ts's header gives the full
 * rationale and it applies identically here. Exposed as the "special-point"
 * CatalogDomain in character/catalogs.ts, and a homebrew Tail's "Tail Base"
 * Joint is registered at runtime exactly as these are, with no engine change.
 *
 * `CriticalPointTypeId "neck"` and `BodyPartTypeId "neck"` are separate id
 * spaces that deliberately coincide: the Neck is both an ordinary BP-bearing
 * BodyPart and, through body-part-self placement, its own Anatomical Point.
 *
 *
 * THE THRESHOLDS THIS ROSTER PRODUCES
 *
 * Every number below is derived from the Basic Human Standard's Maximum BP —
 * Head 8, Neck 2, Upper Body 10, Lower Body 4, Arm 14, Hand 4, Leg 16, Foot 4
 * — and nothing here authors a threshold directly:
 *
 *   point              host         crit 10/30/50   joint 30%   fatal 50%
 *   Brain              Head 8           1 / 3 / 4           -           4
 *   Eye, Jaw           Head 8           1 / 3 / 4           -           -
 *   Neck               Neck 2           1 / 1 / 1           1           1
 *   Heart, Lungs       UpperBody 10     1 / 3 / 5           -           5
 *   Upper Spine        UpperBody 10     1 / 3 / 5           -           -
 *   Abdomen et al      LowerBody 4      1 / 2 / 2           -           -
 *   Shoulder, Elbow    -> Arm 14                -           5           -
 *   Wrist              -> Hand 4                -           2           -
 *   Hip, Knee          -> Leg 16                -           5           -
 *   Ankle              -> Foot 4                -           2           -
 *
 * The Neck is the extreme case and is meant to be: one point of final damage
 * reaches every threshold it has at once. Low Maximum BP means little room
 * between hurt and ruined, and a 2-BP throat is exactly the anatomy that
 * should behave that way.
 *
 *
 * WHAT CHANGED FROM THE PREVIOUS ROSTER
 *
 * Joints no longer multiply damage. Shoulder x2, Elbow x1.5, Wrist x2, Hip x2,
 * Knee x1.5 and Ankle x2 are gone; those points break at a threshold and
 * multiply nothing. Where a joint region really is soft the definition says so
 * by ALSO being Weak, which is why the Armpit is x1.5 and the Shoulder beside
 * it is not.
 *
 * The Spine was one point spanning Upper Body and Lower Body, and it was the
 * only user of a placement kind that forced every consumer to answer "which of
 * the two hosts did this hit land on". It is now Upper Spine and Lower Spine,
 * one host each. They are Critical rather than Joint: spinal failure means
 * paralysis, and paralysis is an Injury — which the guaranteed specialized
 * Injury at the destruction tier already delivers, without inventing a
 * multi-limb designation mechanic that would put the ambiguity straight back.
 *
 * Face, Upper Organs and Lower Organs are replaced by the specific structures
 * the Human roster names: Eyes, Jaw, Respiratory Organs, Abdominal Core, Solar
 * Plexus and Gut.
 */

import { createRegistry } from "../../../../infrastructure/registry";
import type { CriticalPointTypeId, SpecialPointDefinition } from "./types";

export const SPECIAL_POINT_DEFINITIONS = {
  /* ---- Head ---------------------------------------------------------- */

  brain: {
    id: "brain",
    name: "Brain",
    description: "The control structure inside the skull.",
    categories: ["fatal", "critical"],
    placement: { kind: "per-part", selector: { types: ["head"] } },
  },

  "left-eye": {
    id: "left-eye",
    name: "Left Eye",
    description: "A soft, exposed sensory structure.",
    categories: ["critical", "weak"],
    placement: { kind: "per-part", selector: { types: ["head"] } },
  },

  "right-eye": {
    id: "right-eye",
    name: "Right Eye",
    description: "A soft, exposed sensory structure.",
    categories: ["critical", "weak"],
    placement: { kind: "per-part", selector: { types: ["head"] } },
  },

  jaw: {
    id: "jaw",
    name: "Jaw",
    description: "A vulnerable region of the skull. Damage lands on the Head.",
    categories: ["weak"],
    placement: { kind: "per-part", selector: { types: ["head"] } },
  },

  /* ---- Neck ---------------------------------------------------------- */

  /*
   * The only point in the roster carrying all four categories, and the only
   * one placed on the BodyPart itself rather than inside a host.
   */
  neck: {
    id: "neck",
    name: "Neck",
    description:
      "The throat and its control pathway. Both a BodyPart and a point.",
    categories: ["fatal", "critical", "joint", "weak"],
    jointDesignation: { kind: "self" },
    placement: { kind: "body-part-self", selector: { types: ["neck"] } },
  },

  /* ---- Upper Body ---------------------------------------------------- */

  heart: {
    id: "heart",
    name: "Heart",
    description: "The circulatory structure within the chest.",
    categories: ["fatal", "critical"],
    placement: { kind: "per-part", selector: { types: ["upper-body"] } },
  },

  "respiratory-organs": {
    id: "respiratory-organs",
    name: "Respiratory Organs",
    description: "The lungs and airway structures within the chest.",
    categories: ["critical"],
    placement: { kind: "per-part", selector: { types: ["upper-body"] } },
  },

  "upper-spine": {
    id: "upper-spine",
    name: "Upper Spine",
    description:
      "The thoracic spinal column and the control pathway running through it.",
    categories: ["critical"],
    placement: { kind: "per-part", selector: { types: ["upper-body"] } },
  },

  /*
   * ONE definition per limb joint, placed on the LIMB rather than on the
   * torso, and this is not a stylistic choice.
   *
   * A "Left Shoulder" and a "Right Shoulder" hosted by the Upper Body cannot
   * say which Arm each governs: sides are presentational here, BodyPart.name
   * is documented as never mechanically load-bearing, and both definitions
   * would designate whichever Arm matched first. Placing the Shoulder on the
   * Arm gives shoulder:arm-1 and shoulder:arm-2 for free, correct for two arms
   * or for four, with no side data the model does not have.
   *
   * The Human roster's "Left Shoulder / Right Shoulder" describes the two
   * instances that arise on a two-armed body, not two definitions to author.
   */
  shoulder: {
    id: "shoulder",
    name: "Shoulder",
    description: "The connection between the Upper Body and an Arm.",
    categories: ["joint"],
    jointDesignation: { kind: "host" },
    placement: { kind: "per-part", selector: { types: ["arm"] } },
  },

  armpit: {
    id: "armpit",
    name: "Armpit",
    description: "The soft region beneath the shoulder connection.",
    categories: ["joint", "weak"],
    jointDesignation: { kind: "host" },
    placement: { kind: "per-part", selector: { types: ["arm"] } },
  },

  /* ---- Lower Body ---------------------------------------------------- */

  "abdominal-core": {
    id: "abdominal-core",
    name: "Abdominal Core",
    description: "The abdominal organ mass.",
    categories: ["critical"],
    placement: { kind: "per-part", selector: { types: ["lower-body"] } },
  },

  "solar-plexus": {
    id: "solar-plexus",
    name: "Solar Plexus",
    description: "The nerve cluster beneath the sternum.",
    categories: ["critical", "weak"],
    placement: { kind: "per-part", selector: { types: ["lower-body"] } },
  },

  gut: {
    id: "gut",
    name: "Gut",
    description: "The soft abdominal wall and the viscera behind it.",
    categories: ["critical", "weak"],
    placement: { kind: "per-part", selector: { types: ["lower-body"] } },
  },

  groin: {
    id: "groin",
    name: "Groin",
    description: "The unprotected region at the base of the Lower Body.",
    categories: ["critical", "weak"],
    placement: { kind: "per-part", selector: { types: ["lower-body"] } },
  },

  "lower-spine": {
    id: "lower-spine",
    name: "Lower Spine",
    description:
      "The lumbar spinal column and the control pathway running through it.",
    categories: ["critical"],
    placement: { kind: "per-part", selector: { types: ["lower-body"] } },
  },

  hip: {
    id: "hip",
    name: "Hip",
    description: "The connection between the Lower Body and a Leg.",
    categories: ["joint"],
    jointDesignation: { kind: "host" },
    placement: { kind: "per-part", selector: { types: ["leg"] } },
  },

  /* ---- Limbs --------------------------------------------------------- */

  /*
   * Elbow designates its own host Arm, Wrist designates the Hand hanging off
   * it. That asymmetry is the reason jointDesignation exists as a field: a
   * Wrist read against its host would take 30% of the Arm's 14 BP rather than
   * 30% of the Hand's 4, and small extremities would become absurdly durable
   * for being attached to something large.
   */
  elbow: {
    id: "elbow",
    name: "Elbow",
    description: "The mid-limb connection within an Arm.",
    categories: ["joint"],
    jointDesignation: { kind: "host" },
    placement: { kind: "per-part", selector: { types: ["arm"] } },
  },

  wrist: {
    id: "wrist",
    name: "Wrist",
    description: "The connection between an Arm and its Hand.",
    categories: ["joint"],
    jointDesignation: { kind: "child-of-host", selector: { types: ["hand"] } },
    placement: { kind: "per-part", selector: { types: ["arm"] } },
  },

  knee: {
    id: "knee",
    name: "Knee",
    description: "The mid-limb connection within a Leg.",
    categories: ["joint"],
    jointDesignation: { kind: "host" },
    placement: { kind: "per-part", selector: { types: ["leg"] } },
  },

  ankle: {
    id: "ankle",
    name: "Ankle",
    description: "The connection between a Leg and its Foot.",
    categories: ["joint"],
    jointDesignation: { kind: "child-of-host", selector: { types: ["foot"] } },
    placement: { kind: "per-part", selector: { types: ["leg"] } },
  },
} as const satisfies Record<string, SpecialPointDefinition>;

const SPECIAL_POINT_REGISTRY = createRegistry<SpecialPointDefinition>(
  "Special Point",
  SPECIAL_POINT_DEFINITIONS,
);

export type KnownSpecialPointTypeId = keyof typeof SPECIAL_POINT_DEFINITIONS;

export function isKnownSpecialPointTypeId(
  typeId: CriticalPointTypeId,
): boolean {
  return SPECIAL_POINT_REGISTRY.isKnownId(typeId);
}

export function getSpecialPointDefinition(
  typeId: CriticalPointTypeId,
): SpecialPointDefinition | undefined {
  return SPECIAL_POINT_REGISTRY.get(typeId);
}

export const specialPointRegistry = SPECIAL_POINT_REGISTRY;
