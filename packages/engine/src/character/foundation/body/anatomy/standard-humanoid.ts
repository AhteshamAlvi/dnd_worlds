/*
 * Standard humanoid starting Anatomy — a specific starting instance, not
 * reusable content the way BodyPartDefinition/SpecialPointDefinition are.
 *
 * A BodyPartDefinition is a *kind* of part a catalog lists ("here is what an
 * Arm is"); this is one specific *tree of instances* built from those kinds
 * ("here is a starting body with two Arms named arm-1 and arm-2"). There's
 * no existing "instance template" content mechanism in this engine to fold
 * it into the catalog system the way body-parts.ts and special-points.ts
 * are — catalogs are lists of interchangeable, individually-referenceable
 * definitions, not pre-wired trees. So this stays engine-side content,
 * distinct from both the mechanics files in this folder and from the two
 * catalog domains.
 *
 * Topology:
 *
 * Upper Body
 * ├── Neck
 * │   └── Head
 * ├── Lower Body
 * │   ├── Leg-1
 * │   │   └── Foot-1
 * │   └── Leg-2
 * │       └── Foot-2
 * ├── Arm-1
 * │   └── Hand-1
 * └── Arm-2
 *     └── Hand-2
 *
 * "Upper Body" and "Lower Body" are the permanent mechanical names — never
 * Chest/Torso. Left/Right in the display names are presentational only;
 * BodyPart.name is documented as never mechanically load-bearing, and every
 * arm/hand/leg/foot pair shares the same side-agnostic BodyPartDefinition
 * (see body-parts.ts).
 *
 * Every part starts at zero stored damage, and active, via createBodyPart.
 *
 *
 * THE AUTHORED GEOMETRY
 *
 * Each attachment records where the connection sits on both parts, in their
 * own 0..1 longitudinal coordinates. Together with each definition's
 * `heightAxisSign` this places the whole body on one vertical line, which is
 * what Height is measured from.
 *
 * The per-type axes (see body-parts.ts):
 *
 *   Foot        0 = ankle,           1 = distal      sign -1  contribution 0.28
 *   Leg         0 = hip,             1 = ankle       sign -1  contribution 1.0
 *   Lower Body  0 = pelvis/inferior, 1 = superior    sign +1  contribution 1.0
 *   Upper Body  0 = inferior,        1 = superior    sign +1  contribution 1.0
 *   Neck        0 = inferior,        1 = superior    sign +1  contribution 1.0
 *   Head        0 = inferior,        1 = superior    sign +1  contribution 1.0
 *   Arm / Hand  proximal to distal                            contribution 0
 *
 * Most connections are the ordinary "child hangs off the far end of its
 * parent" case and take creation.ts's (1, 0) default. Three do not, and those
 * three are the whole reason the coordinates exist:
 *
 *   Lower Body   (0, 1)   the torso pair meets inferior-to-superior, so the
 *                         Lower Body attaches by its TOP to the Upper Body's
 *                         BOTTOM — the reverse of the usual chain
 *   Legs         (0, 0)   both hips sit at the same pelvis coordinate, and a
 *                         Leg's own 0 is its hip
 *   Arms         (1, 0)   spelled out anyway, because the shoulder genuinely
 *                         is the top of the Upper Body rather than a default
 *
 * Taking the pelvis as the origin, that resolves to:
 *
 *   lower-body  0 -> 0     1 -> +18
 *   upper-body  0 -> +18   1 -> +49
 *   neck        1 -> +55   head 1 -> +77
 *   leg         0 -> 0     1 (ankle) -> -81
 *   foot        0 -> -81   1 (toe)   -> -88
 *
 *   max +77 - min -88 = 165 cm
 *
 * Both Legs share the same pelvis coordinate, so walking from one Foot across
 * the pelvis into the other Leg arrives back at -88 rather than stacking a
 * second 88 cm onto the total. That is the failure the signed model exists to
 * prevent: measured as an unsigned longest path, this body is 176 cm tall.
 */

import { createAnatomy, createReferenceForm } from "./creation";
import type { BodyPartCreationSpec } from "./creation";
import type { Anatomy, ReferenceForm } from "./types";

export const STANDARD_HUMANOID_BODY_PART_SPECS = [
  {
    id: "upper-body-1",
    type: "upper-body",
    name: "Upper Body",
    attachment: null,
  },
  {
    id: "neck-1",
    type: "neck",
    name: "Neck",
    attachment: {
      parentId: "upper-body-1",
      site: "neck",
      parentPosition: 1,
      childPosition: 0,
    },
  },
  {
    id: "head-1",
    type: "head",
    name: "Head",
    attachment: {
      parentId: "neck-1",
      site: "skull-base",
      parentPosition: 1,
      childPosition: 0,
    },
  },
  {
    id: "lower-body-1",
    type: "lower-body",
    name: "Lower Body",
    attachment: {
      parentId: "upper-body-1",
      site: "waist",
      parentPosition: 0,
      childPosition: 1,
    },
  },
  {
    id: "arm-1",
    type: "arm",
    name: "Left Arm",
    attachment: {
      parentId: "upper-body-1",
      site: "shoulder",
      parentPosition: 1,
      childPosition: 0,
    },
  },
  {
    id: "hand-1",
    type: "hand",
    name: "Left Hand",
    attachment: {
      parentId: "arm-1",
      site: "wrist",
      parentPosition: 1,
      childPosition: 0,
    },
  },
  {
    id: "arm-2",
    type: "arm",
    name: "Right Arm",
    attachment: {
      parentId: "upper-body-1",
      site: "shoulder",
      parentPosition: 1,
      childPosition: 0,
    },
  },
  {
    id: "hand-2",
    type: "hand",
    name: "Right Hand",
    attachment: {
      parentId: "arm-2",
      site: "wrist",
      parentPosition: 1,
      childPosition: 0,
    },
  },
  {
    id: "leg-1",
    type: "leg",
    name: "Left Leg",
    attachment: {
      parentId: "lower-body-1",
      site: "hip",
      parentPosition: 0,
      childPosition: 0,
    },
  },
  {
    id: "foot-1",
    type: "foot",
    name: "Left Foot",
    attachment: {
      parentId: "leg-1",
      site: "ankle",
      parentPosition: 1,
      childPosition: 0,
    },
  },
  {
    id: "leg-2",
    type: "leg",
    name: "Right Leg",
    attachment: {
      parentId: "lower-body-1",
      site: "hip",
      parentPosition: 0,
      childPosition: 0,
    },
  },
  {
    id: "foot-2",
    type: "foot",
    name: "Right Foot",
    attachment: {
      parentId: "leg-2",
      site: "ankle",
      parentPosition: 1,
      childPosition: 0,
    },
  },
] as const satisfies readonly BodyPartCreationSpec[];

/*
 * The Reference Form this body plan belongs to.
 *
 * Named rather than left as the default namespace, because slot keys are
 * form-scoped: "standard-humanoid:left-arm" cannot collide with a Dragon's
 * "dragon:left-foreleg" even though both forms have a slot called left
 * something. The anatomy and the Reference Form MUST share this id, or every
 * slot lookup silently misses.
 */
export const STANDARD_HUMANOID_FORM_ID = "standard-humanoid";

export const STANDARD_HUMANOID_ANATOMY: Anatomy = createAnatomy(
  STANDARD_HUMANOID_BODY_PART_SPECS,
  STANDARD_HUMANOID_FORM_ID,
);

/*
 * What a standard humanoid is SUPPOSED to have — the normalization
 * denominator, and deliberately not the same value as the anatomy above even
 * though it is built from the same specs. The two diverge the moment a
 * character is hurt: the Anatomy loses a severed Arm, the Reference Form goes
 * on expecting one.
 */
export const STANDARD_HUMANOID_REFERENCE_FORM: ReferenceForm =
  createReferenceForm(
    STANDARD_HUMANOID_BODY_PART_SPECS,
    STANDARD_HUMANOID_FORM_ID,
  );
