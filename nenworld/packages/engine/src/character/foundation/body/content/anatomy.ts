/*
 * Standard humanoid starting Anatomy content.
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
 * (see content/body-part-definitions.ts).
 *
 * Every part starts at zero stored damage via createBodyPart.
 */

import { createAnatomy } from "../anatomy/creation";
import type { BodyPartCreationSpec } from "../anatomy/creation";
import type { Anatomy } from "../anatomy/types";

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
    attachment: { parentId: "upper-body-1" },
  },
  {
    id: "head-1",
    type: "head",
    name: "Head",
    attachment: { parentId: "neck-1" },
  },
  {
    id: "lower-body-1",
    type: "lower-body",
    name: "Lower Body",
    attachment: { parentId: "upper-body-1" },
  },
  {
    id: "arm-1",
    type: "arm",
    name: "Left Arm",
    attachment: { parentId: "upper-body-1" },
  },
  {
    id: "hand-1",
    type: "hand",
    name: "Left Hand",
    attachment: { parentId: "arm-1" },
  },
  {
    id: "arm-2",
    type: "arm",
    name: "Right Arm",
    attachment: { parentId: "upper-body-1" },
  },
  {
    id: "hand-2",
    type: "hand",
    name: "Right Hand",
    attachment: { parentId: "arm-2" },
  },
  {
    id: "leg-1",
    type: "leg",
    name: "Left Leg",
    attachment: { parentId: "lower-body-1" },
  },
  {
    id: "foot-1",
    type: "foot",
    name: "Left Foot",
    attachment: { parentId: "leg-1" },
  },
  {
    id: "leg-2",
    type: "leg",
    name: "Right Leg",
    attachment: { parentId: "lower-body-1" },
  },
  {
    id: "foot-2",
    type: "foot",
    name: "Right Foot",
    attachment: { parentId: "leg-2" },
  },
] as const satisfies readonly BodyPartCreationSpec[];

export const STANDARD_HUMANOID_ANATOMY: Anatomy = createAnatomy(
  STANDARD_HUMANOID_BODY_PART_SPECS,
);
