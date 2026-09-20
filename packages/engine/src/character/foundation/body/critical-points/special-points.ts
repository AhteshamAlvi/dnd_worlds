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
import { validateSpecialPointDefinition } from "./validation";
import type {
  CriticalPointTypeId,
  SensoryAnatomicalPointData,
  SpecialPointDefinition,
} from "./types";


/* -------------------------------------------------------------------------- */
/* Human sensory calibration                                                  */
/* -------------------------------------------------------------------------- */

/*
 * How much of its host each Human sensory organ occupies.
 *
 * CALIBRATION CONSTANTS, gathered here on purpose. They are the one place in
 * the sensory system where a number was chosen rather than derived, so they
 * are stated once, beside the anatomy they describe, and never re-derived in
 * Gyō, in the coating, or in a test. Retuning an eye is editing one line here.
 *
 * Host fractions rather than absolute areas, because a Giant's eye is a
 * Giant-sized eye: fractions scale with the body for free, and an absolute
 * figure would make a ten-metre Giant see through Human-sized eyes.
 *
 * Against the reference Human — Head 1,183 cm2, Hand 422.5 cm2 — these resolve
 * to:
 *
 *   Eye (each)          1.183 cm2     exposed anterior eyeball
 *   Ear (each)         11.830 cm2     external auricle
 *   Olfactory organs    4.732 cm2     olfactory epithelium
 *   Tongue             23.660 cm2     dorsal lingual surface
 *   Palm (each)       105.625 cm2     palmar surface, fingers excluded
 *
 * leaving a tactile remainder of 1,128.582 cm2 on the Head, 316.875 cm2 on
 * each Hand, and the whole of every other part.
 */
export const HUMAN_SENSORY_FOOTPRINT_FRACTIONS = {
  eye: 0.0010,
  ear: 0.0100,
  olfactory: 0.0040,
  tongue: 0.0200,
  palm: 0.2500,
} as const;


/*
 * How finely each Human tactile region discriminates, relative to plain skin.
 *
 * A weight, not a bonus: Touch's score is shared across the whole network and
 * these decide how much of it each region is responsible for. Four is the palm
 * against ordinary skin, which is the right order for two-point discrimination
 * on a hand versus a back.
 */
export const HUMAN_TACTILE_SENSITIVITIES = {
  skin: 1,
  palm: 4,
} as const;


/** The distributed network every Human tactile surface belongs to. */
export const HUMAN_TOUCH_NETWORK_ID = "whole-body-touch";


function tactileSurface(
  sensitivity: number,
  focus: SensoryAnatomicalPointData["focus"],
  footprint: SensoryAnatomicalPointData["footprint"],
): SensoryAnatomicalPointData {
  return {
    footprint,
    focus,
    functions: [{
      senseId: "touch",
      contribution: {
        kind: "network-weight",
        networkId: HUMAN_TOUCH_NETWORK_ID,
        sensitivity,
      },
    }],
  };
}


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
    categories: ["critical", "weak", "sensory"],
    placement: { kind: "per-part", selector: { types: ["head"] } },
    sensory: {
      footprint: {
        kind: "host-surface-fraction",
        fraction: HUMAN_SENSORY_FOOTPRINT_FRACTIONS.eye,
      },
      focus: { kind: "local", cluster: "facial-eyes" },
      functions: [
        { senseId: "sight", contribution: { kind: "fixed", amount: 0.50 } },
      ],
    },
  },

  "right-eye": {
    id: "right-eye",
    name: "Right Eye",
    description: "A soft, exposed sensory structure.",
    categories: ["critical", "weak", "sensory"],
    placement: { kind: "per-part", selector: { types: ["head"] } },
    sensory: {
      footprint: {
        kind: "host-surface-fraction",
        fraction: HUMAN_SENSORY_FOOTPRINT_FRACTIONS.eye,
      },
      focus: { kind: "local", cluster: "facial-eyes" },
      functions: [
        { senseId: "sight", contribution: { kind: "fixed", amount: 0.50 } },
      ],
    },
  },

  jaw: {
    id: "jaw",
    name: "Jaw",
    description: "A vulnerable region of the skull. Damage lands on the Head.",
    categories: ["weak"],
    placement: { kind: "per-part", selector: { types: ["head"] } },
  },

  /*
   * ONE definition per paired organ, exactly as the Eyes are, and for the same
   * reason: side is presentational. Two Ear definitions hosted by one Head
   * would be indistinguishable to anything that had to pick one, and a
   * three-eared Species would need a third definition rather than a third
   * instance.
   *
   * Both Ears sit in one `cranial-hearing` cluster, so Sensory Gyō may
   * concentrate into one ear, the other, or both — and an ear on a DIFFERENT
   * Head resolves a different cluster identity and cannot join them.
   */
  "left-ear": {
    id: "left-ear",
    name: "Left Ear",
    description: "An external auricle and the auditory structures behind it.",
    categories: ["sensory"],
    placement: { kind: "per-part", selector: { types: ["head"] } },
    sensory: {
      footprint: {
        kind: "host-surface-fraction",
        fraction: HUMAN_SENSORY_FOOTPRINT_FRACTIONS.ear,
      },
      focus: { kind: "local", cluster: "cranial-hearing" },
      functions: [
        { senseId: "hearing", contribution: { kind: "fixed", amount: 0.50 } },
      ],
    },
  },

  "right-ear": {
    id: "right-ear",
    name: "Right Ear",
    description: "An external auricle and the auditory structures behind it.",
    categories: ["sensory"],
    placement: { kind: "per-part", selector: { types: ["head"] } },
    sensory: {
      footprint: {
        kind: "host-surface-fraction",
        fraction: HUMAN_SENSORY_FOOTPRINT_FRACTIONS.ear,
      },
      focus: { kind: "local", cluster: "cranial-hearing" },
      functions: [
        { senseId: "hearing", contribution: { kind: "fixed", amount: 0.50 } },
      ],
    },
  },

  /*
   * Unpaired, so one point carrying the whole 1.00. Losing it is total
   * anosmia, which is what losing your olfactory epithelium is.
   */
  "olfactory-organs": {
    id: "olfactory-organs",
    name: "Olfactory Organs",
    description: "The olfactory epithelium and the nasal passages serving it.",
    categories: ["sensory"],
    placement: { kind: "per-part", selector: { types: ["head"] } },
    sensory: {
      footprint: {
        kind: "host-surface-fraction",
        fraction: HUMAN_SENSORY_FOOTPRINT_FRACTIONS.olfactory,
      },
      focus: { kind: "local", cluster: "nasal-olfaction" },
      functions: [
        { senseId: "smell", contribution: { kind: "fixed", amount: 1.00 } },
      ],
    },
  },

  tongue: {
    id: "tongue",
    name: "Tongue",
    description: "The dorsal lingual surface and its taste receptors.",
    categories: ["sensory"],
    placement: { kind: "per-part", selector: { types: ["head"] } },
    sensory: {
      footprint: {
        kind: "host-surface-fraction",
        fraction: HUMAN_SENSORY_FOOTPRINT_FRACTIONS.tongue,
      },
      focus: { kind: "local", cluster: "oral-taste" },
      functions: [
        { senseId: "taste", contribution: { kind: "fixed", amount: 1.00 } },
      ],
    },
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

  /* ---- Tactile ------------------------------------------------------- */

  /*
   * Skin, as anatomy.
   *
   * Placed on EVERY part, because that is what skin is, and given the host
   * remainder as its footprint, because skin is specifically whatever surface
   * is not another organ. On a Head it is everything the eyes, ears, nose and
   * tongue did not take; on a Hand it is everything outside the palm; on a
   * Leg it is the whole leg.
   *
   * Its contribution is a NETWORK WEIGHT rather than a fixed share, which is
   * the only honest way to say what a skin does. A Human has thirteen of these
   * instances and none of them is worth 1/13 of Touch — a torso is worth far
   * more than a foot — so each is weighted by its own resolved area times its
   * sensitivity and normalized against the members that are actually present.
   * Lose an arm and the remaining surface redistributes rather than the
   * character simply feeling less.
   */
  "tactile-surface": {
    id: "tactile-surface",
    name: "Tactile Surface",
    description:
      "The skin of one Body Part, outside any more specialized organ on it.",
    categories: ["sensory"],
    placement: { kind: "per-part", selector: { all: true } },
    sensory: tactileSurface(
      HUMAN_TACTILE_SENSITIVITIES.skin,
      { kind: "distributed", network: HUMAN_TOUCH_NETWORK_ID, selection: "all-active" },
      { kind: "host-remainder" },
    ),
  },

  /*
   * The palm is the exception that proves the network.
   *
   * It is a MEMBER of the whole-body touch network — its weight feeds the same
   * shared Touch score — and its focus is nonetheless LOCAL, because a
   * character can deliberately concentrate into their hands and cannot
   * deliberately concentrate into three-quarters of their skin. Contribution
   * and focus are separate fields for exactly this case.
   *
   * The cluster is authored as one name and resolves per Hand, since cluster
   * identity is (host BodyPart, Sense, cluster). Two hands are two clusters
   * without either of them being called "left".
   *
   * Its area is CARVED OUT of the Hand's tactile surface rather than added
   * beside it: the Hand's remainder is what is left after this fraction, so
   * palm area is never counted twice.
   */
  palm: {
    id: "palm",
    name: "Palm",
    description: "The palmar surface of a Hand, far more sensitive than skin.",
    categories: ["sensory"],
    placement: { kind: "per-part", selector: { types: ["hand"] } },
    sensory: tactileSurface(
      HUMAN_TACTILE_SENSITIVITIES.palm,
      { kind: "local", cluster: "palm" },
      {
        kind: "host-surface-fraction",
        fraction: HUMAN_SENSORY_FOOTPRINT_FRACTIONS.palm,
      },
    ),
  },
} as const satisfies Record<string, SpecialPointDefinition>;

/**
 * One Anatomical Point definition's shape.
 *
 * A thin wrapper over validateSpecialPointDefinition(), which already owns
 * every rule — the placement selector, the requirement that a point declare at
 * least one category, and the pairing of `jointDesignation` with Joint points.
 * Wrapped rather than reimplemented, so the registry and the resolver cannot
 * disagree about what a valid point is.
 *
 * The guard in front of it is not ceremony: that validator takes a typed
 * definition and reads `definition.placement.selector`, which throws on a
 * definition that has no placement — and a definition arriving from a host is
 * exactly where that happens.
 */
export function findAnatomicalPointDefinitionStructuralIssues(
  definition: unknown,
): readonly string[] {
  if (typeof definition !== "object" || definition === null) return [];

  const point = definition as Partial<SpecialPointDefinition>;

  if (typeof point.placement !== "object" || point.placement === null) {
    return ["needs a placement."];
  }

  /*
   * The selector too, and one level deeper than looks necessary: the point
   * validator hands `placement.selector` straight to validateBodyPartSelector,
   * which reads a field off it. A placement that is an object with nothing in
   * it satisfies the check above and throws on the line after.
   */
  const selector = (point.placement as { readonly selector?: unknown }).selector;

  if (typeof selector !== "object" || selector === null) {
    return ["needs a placement selector."];
  }

  if (!Array.isArray(point.categories)) {
    return ["needs a list of categories."];
  }

  return validateSpecialPointDefinition(point as SpecialPointDefinition)
    .issues
    .map((issue) =>
      issue.message.replace(/^Anatomical Point "[^"]*" /, "")
    );
}


const SPECIAL_POINT_REGISTRY = createRegistry<SpecialPointDefinition>(
  "Special Point",
  SPECIAL_POINT_DEFINITIONS,
  findAnatomicalPointDefinitionStructuralIssues,
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


/**
 * What can be wrong with the Anatomical Point catalog itself.
 *
 * These domains had no catalog check while they had no rules to check. They
 * have real shape validators now, and the registry runs the same one over
 * AUTHORED content that the barrier runs over registered content — so this is
 * how the engine's own catalog is held to the rules it imposes on a host.
 */
export function findSpecialPointCatalogIssues(): readonly string[] {
  return SPECIAL_POINT_REGISTRY.findCatalogIssues();
}
