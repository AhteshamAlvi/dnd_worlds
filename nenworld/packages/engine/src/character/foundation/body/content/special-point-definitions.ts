/*
 * Standard humanoid SpecialPointDefinition content — Critical, Semicritical,
 * and Joint targets layered over the standard humanoid Anatomy.
 *
 * `CriticalPointTypeId "neck"` and `BodyPartTypeId "neck"` are separate id
 * spaces that deliberately coincide: Neck is both an ordinary BP-bearing
 * BodyPart and, via body-part-self placement, its own Critical Point.
 *
 * Resolved over the standard humanoid Anatomy (content/anatomy.ts) this
 * produces exactly 20 instances: brain:head-1, heart:upper-body-1,
 * neck:neck-1, face:head-1, upper-organs:upper-body-1,
 * lower-organs:lower-body-1, groin:lower-body-1,
 * spine:shared:lower-body-1,upper-body-1, plus 12 joints (2 each of
 * shoulder/elbow/wrist/hip/knee/ankle) — see
 * body-reference-humanoid.test.ts.
 */

import type { SpecialPointDefinition } from "../critical-points/types";

export const STANDARD_SPECIAL_POINT_DEFINITIONS = [
  {
    id: "brain",
    name: "Brain",
    category: "critical",
    failureConsequence: "death",
    placement: {
      kind: "per-part",
      selector: { types: ["head"] },
    },
  },
  {
    id: "heart",
    name: "Heart",
    category: "critical",
    failureConsequence: "death",
    placement: {
      kind: "per-part",
      selector: { types: ["upper-body"] },
    },
  },
  {
    id: "neck",
    name: "Neck",
    category: "critical",
    failureConsequence: "death",
    placement: {
      kind: "body-part-self",
      selector: { types: ["neck"] },
    },
  },
  {
    id: "face",
    name: "Face",
    category: "semicritical",
    placement: {
      kind: "per-part",
      selector: { types: ["head"] },
    },
  },
  {
    id: "upper-organs",
    name: "Upper Organs",
    category: "semicritical",
    placement: {
      kind: "per-part",
      selector: { types: ["upper-body"] },
    },
  },
  {
    id: "lower-organs",
    name: "Lower Organs",
    category: "semicritical",
    placement: {
      kind: "per-part",
      selector: { types: ["lower-body"] },
    },
  },
  {
    id: "groin",
    name: "Groin",
    category: "semicritical",
    placement: {
      kind: "per-part",
      selector: { types: ["lower-body"] },
    },
  },
  {
    id: "spine",
    name: "Spine",
    category: "semicritical",
    placement: {
      kind: "shared",
      selector: { types: ["upper-body", "lower-body"] },
    },
  },
  {
    id: "shoulder",
    name: "Shoulder",
    category: "joint",
    damageMultiplier: 2,
    placement: {
      kind: "per-part",
      selector: { types: ["arm"] },
    },
  },
  {
    id: "elbow",
    name: "Elbow",
    category: "joint",
    damageMultiplier: 1.5,
    placement: {
      kind: "per-part",
      selector: { types: ["arm"] },
    },
  },
  {
    id: "wrist",
    name: "Wrist",
    category: "joint",
    damageMultiplier: 2,
    placement: {
      kind: "per-part",
      selector: { types: ["hand"] },
    },
  },
  {
    id: "hip",
    name: "Hip",
    category: "joint",
    damageMultiplier: 2,
    placement: {
      kind: "per-part",
      selector: { types: ["leg"] },
    },
  },
  {
    id: "knee",
    name: "Knee",
    category: "joint",
    damageMultiplier: 1.5,
    placement: {
      kind: "per-part",
      selector: { types: ["leg"] },
    },
  },
  {
    id: "ankle",
    name: "Ankle",
    category: "joint",
    damageMultiplier: 2,
    placement: {
      kind: "per-part",
      selector: { types: ["foot"] },
    },
  },
] as const satisfies readonly SpecialPointDefinition[];
