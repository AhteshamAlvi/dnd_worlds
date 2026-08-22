/*
 * SpecialPointDefinition catalog — the reusable Critical, Semicritical, and
 * Joint targets a resolved Anatomy can carry.
 *
 * This is content, not mechanics — see anatomy/body-parts.ts's header for
 * the full rationale, which applies identically here. This catalog is
 * exposed as the "special-point" CatalogDomain in character/catalogs.ts.
 *
 * A homebrew Tail's "Tail Base" Joint is added the same way any of these
 * are: a custom definition registered at runtime (in this app, loaded from
 * worldbuilding/Vault/special-point-vault/*.json), referencing whatever
 * BodyPartTypeId the Tail's own custom BodyPartDefinition uses. No engine
 * mechanics change to support it.
 *
 * `CriticalPointTypeId "neck"` and `BodyPartTypeId "neck"` are separate id
 * spaces that deliberately coincide: Neck is both an ordinary BP-bearing
 * BodyPart and, via body-part-self placement, its own Critical Point.
 */

import { createRegistry } from "../../../../infrastructure/registry";
import type { CriticalPointTypeId, SpecialPointDefinition } from "./types";

export const SPECIAL_POINT_DEFINITIONS = {
  brain: {
    id: "brain",
    name: "Brain",
    description: "Hosted by the Head. Its destruction is fatal.",
    category: "critical",
    failureConsequence: "death",
    placement: {
      kind: "per-part",
      selector: { types: ["head"] },
    },
  },
  heart: {
    id: "heart",
    name: "Heart",
    description: "Hosted by the Upper Body. Its destruction is fatal.",
    category: "critical",
    failureConsequence: "death",
    placement: {
      kind: "per-part",
      selector: { types: ["upper-body"] },
    },
  },
  neck: {
    id: "neck",
    name: "Neck",
    description: "The Neck is both an ordinary BodyPart and this target.",
    category: "critical",
    failureConsequence: "death",
    placement: {
      kind: "body-part-self",
      selector: { types: ["neck"] },
    },
  },
  face: {
    id: "face",
    name: "Face",
    description: "A Semicritical target hosted by the Head.",
    category: "semicritical",
    placement: {
      kind: "per-part",
      selector: { types: ["head"] },
    },
  },
  "upper-organs": {
    id: "upper-organs",
    name: "Upper Organs",
    description: "A Semicritical target hosted by the Upper Body.",
    category: "semicritical",
    placement: {
      kind: "per-part",
      selector: { types: ["upper-body"] },
    },
  },
  "lower-organs": {
    id: "lower-organs",
    name: "Lower Organs",
    description: "A Semicritical target hosted by the Lower Body.",
    category: "semicritical",
    placement: {
      kind: "per-part",
      selector: { types: ["lower-body"] },
    },
  },
  groin: {
    id: "groin",
    name: "Groin",
    description: "A Semicritical target hosted by the Lower Body.",
    category: "semicritical",
    placement: {
      kind: "per-part",
      selector: { types: ["lower-body"] },
    },
  },
  spine: {
    id: "spine",
    name: "Spine",
    description:
      "A Semicritical target spanning the Upper Body and Lower Body.",
    category: "semicritical",
    placement: {
      kind: "shared",
      selector: { types: ["upper-body", "lower-body"] },
    },
  },
  shoulder: {
    id: "shoulder",
    name: "Shoulder",
    description: "A Joint hosted by the Arm.",
    category: "joint",
    damageMultiplier: 2,
    placement: {
      kind: "per-part",
      selector: { types: ["arm"] },
    },
  },
  elbow: {
    id: "elbow",
    name: "Elbow",
    description: "A Joint hosted by the Arm.",
    category: "joint",
    damageMultiplier: 1.5,
    placement: {
      kind: "per-part",
      selector: { types: ["arm"] },
    },
  },
  wrist: {
    id: "wrist",
    name: "Wrist",
    description: "A Joint hosted by the Hand.",
    category: "joint",
    damageMultiplier: 2,
    placement: {
      kind: "per-part",
      selector: { types: ["hand"] },
    },
  },
  hip: {
    id: "hip",
    name: "Hip",
    description: "A Joint hosted by the Leg.",
    category: "joint",
    damageMultiplier: 2,
    placement: {
      kind: "per-part",
      selector: { types: ["leg"] },
    },
  },
  knee: {
    id: "knee",
    name: "Knee",
    description: "A Joint hosted by the Leg.",
    category: "joint",
    damageMultiplier: 1.5,
    placement: {
      kind: "per-part",
      selector: { types: ["leg"] },
    },
  },
  ankle: {
    id: "ankle",
    name: "Ankle",
    description: "A Joint hosted by the Foot.",
    category: "joint",
    damageMultiplier: 2,
    placement: {
      kind: "per-part",
      selector: { types: ["foot"] },
    },
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
