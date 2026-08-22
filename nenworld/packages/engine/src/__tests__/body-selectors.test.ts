/*
 * Tests the shared BodyPart selector layer: validation rules, matching
 * across all/ids/types/tags/tagMode with dimension intersection, and —
 * most importantly — the regression this domain exists to prevent: tag
 * selection must read BodyPartDefinition.tags, not anything stored on
 * BodyPart itself. Proven three ways, through every consumer that resolves
 * a selector: selectBodyParts directly, a BodyPointModifier, and a
 * SpecialPointDefinition placement.
 */

import { describe, expect, it } from "vitest";

import {
  createBodyPartDefinitionMap,
  matchesBodyPartSelector,
  selectBodyParts,
  validateBodyPartSelector,
} from "../character/foundation/body/selectors";
import type { BodyPartSelector } from "../character/foundation/body/selectors";
import { createAnatomy } from "../character/foundation/body/anatomy/creation";
import type {
  Anatomy,
  BodyPartDefinition,
} from "../character/foundation/body/anatomy/types";
import { resolveBodyPointModifiersByPart } from "../character/foundation/body/body-points/modifiers";
import type { BodyPointModifier } from "../character/foundation/body/body-points/types";
import { resolveCriticalPoints } from "../character/foundation/body/critical-points/resolution";
import type { SpecialPointDefinition } from "../character/foundation/body/critical-points/types";

const NEUTRAL_SENSITIVITY = {
  height: 0,
  mass: 0,
  muscularity: 0,
  adiposity: 0,
};

const DEFINITIONS: readonly BodyPartDefinition[] = [
  { id: "arm", name: "Arm", description: "Test arm.", tags: ["limb", "left"], baseBP: 10, morphologySensitivity: NEUTRAL_SENSITIVITY },
  { id: "leg", name: "Leg", description: "Test leg.", tags: ["limb", "right"], baseBP: 10, morphologySensitivity: NEUTRAL_SENSITIVITY },
  { id: "head", name: "Head", description: "Test head.", tags: ["core"], baseBP: 10, morphologySensitivity: NEUTRAL_SENSITIVITY },
];

const ANATOMY: Anatomy = createAnatomy([
  { id: "arm-1", type: "arm", attachment: null },
  { id: "leg-1", type: "leg", attachment: null },
  { id: "head-1", type: "head", attachment: null },
]);

describe("validateBodyPartSelector", () => {
  it("accepts { all: true }", () => {
    expect(validateBodyPartSelector({ all: true }).valid).toBe(true);
  });

  it("rejects a selector with no filters at all", () => {
    const result = validateBodyPartSelector({});
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "empty-selector")).toBe(true);
  });

  it("rejects an empty ids/types/tags array", () => {
    expect(validateBodyPartSelector({ ids: [] }).issues.map((i) => i.code)).toContain(
      "empty-id-filter",
    );
    expect(validateBodyPartSelector({ types: [] }).issues.map((i) => i.code)).toContain(
      "empty-type-filter",
    );
    expect(validateBodyPartSelector({ tags: [] }).issues.map((i) => i.code)).toContain(
      "empty-tag-filter",
    );
  });

  it("rejects duplicates within one filter dimension", () => {
    const result = validateBodyPartSelector({ types: ["arm", "arm"] });
    expect(result.issues.some((i) => i.code === "duplicate-type")).toBe(true);
  });

  it("rejects tagMode supplied without a tags filter", () => {
    const result = validateBodyPartSelector({ types: ["arm"], tagMode: "any" });
    expect(result.issues.some((i) => i.code === "tag-mode-without-tags")).toBe(true);
  });

  it("accepts a well-formed multi-dimension filtered selector", () => {
    const result = validateBodyPartSelector({
      types: ["arm"],
      tags: ["limb"],
      tagMode: "all",
    });
    expect(result.valid).toBe(true);
  });
});

describe("matchesBodyPartSelector / selectBodyParts", () => {
  it("all matches everything", () => {
    expect(selectBodyParts(ANATOMY, DEFINITIONS, { all: true })).toHaveLength(3);
  });

  it("ids matches by BodyPart instance id", () => {
    const result = selectBodyParts(ANATOMY, DEFINITIONS, { ids: ["arm-1"] });
    expect(result.map((p) => p.id)).toEqual(["arm-1"]);
  });

  it("types matches by BodyPart.type", () => {
    const result = selectBodyParts(ANATOMY, DEFINITIONS, { types: ["leg"] });
    expect(result.map((p) => p.id)).toEqual(["leg-1"]);
  });

  it("tags with tagMode 'all' requires every listed tag", () => {
    const result = selectBodyParts(ANATOMY, DEFINITIONS, {
      tags: ["limb", "left"],
      tagMode: "all",
    });
    expect(result.map((p) => p.id)).toEqual(["arm-1"]);
  });

  it("tagMode defaults to 'all', requiring every listed tag on one definition", () => {
    // Neither "arm" (tags: limb, left) nor "leg" (tags: limb, right) carries
    // both "left" and "right", so an unspecified tagMode matches nothing here.
    const result = selectBodyParts(ANATOMY, DEFINITIONS, { tags: ["left", "right"] });
    expect(result).toEqual([]);
  });

  it("tagMode 'any' requires at least one listed tag", () => {
    const result = selectBodyParts(ANATOMY, DEFINITIONS, {
      tags: ["left", "right"],
      tagMode: "any",
    });
    expect(result.map((p) => p.id).sort()).toEqual(["arm-1", "leg-1"]);
  });

  it("intersects multiple filter dimensions", () => {
    const result = selectBodyParts(ANATOMY, DEFINITIONS, {
      types: ["arm", "leg"],
      tags: ["right"],
    });
    expect(result.map((p) => p.id)).toEqual(["leg-1"]);
  });

  it("throws when a BodyPart references an unknown definition", () => {
    const badAnatomy: Anatomy = createAnatomy([
      { id: "ghost-1", type: "wing", attachment: null },
    ]);

    expect(() => selectBodyParts(badAnatomy, DEFINITIONS, { all: true })).toThrow();
  });

  it("createBodyPartDefinitionMap looks up by type id", () => {
    const map = createBodyPartDefinitionMap(DEFINITIONS);
    expect(map.get("arm")?.id).toBe("arm");
    expect(map.get("nonexistent")).toBeUndefined();
  });
});

describe("tag selection regression: reads BodyPartDefinition.tags, not BodyPart", () => {
  // BodyPart itself carries only id/type/name/attachment/damage — no tags at
  // all — so if any of these three consumers resolved tags from `part`
  // instead of `definition`, they would either throw or silently match
  // nothing. All three must correctly select arm-1 and leg-1 (both "limb"),
  // excluding head-1.
  const tagSelector: BodyPartSelector = { tags: ["limb"] };

  it("directly through selectBodyParts", () => {
    const result = selectBodyParts(ANATOMY, DEFINITIONS, tagSelector);
    expect(result.map((p) => p.id).sort()).toEqual(["arm-1", "leg-1"]);
  });

  it("through matchesBodyPartSelector called with the correct definition per part", () => {
    for (const part of ANATOMY.parts) {
      const definition = DEFINITIONS.find((d) => d.id === part.type)!;
      const matches = matchesBodyPartSelector(part, definition, tagSelector);
      expect(matches).toBe(part.type === "arm" || part.type === "leg");
    }
  });

  it("through a BodyPointModifier resolved by resolveBodyPointModifiersByPart", () => {
    const modifier: BodyPointModifier = {
      selector: tagSelector,
      operation: { kind: "adjust-base-bp", amount: 3 },
    };

    const resolved = resolveBodyPointModifiersByPart(ANATOMY.parts, DEFINITIONS, [modifier]);

    expect(resolved.get("arm-1")?.additiveBaseBP).toBe(3);
    expect(resolved.get("leg-1")?.additiveBaseBP).toBe(3);
    expect(resolved.get("head-1")?.additiveBaseBP).toBe(0);
  });

  it("through a SpecialPointDefinition placement selector resolved by resolveCriticalPoints", () => {
    const definition: SpecialPointDefinition = {
      id: "limb-marker",
      name: "Limb Marker",
      description: "Test marker.",
      category: "semicritical",
      placement: { kind: "per-part", selector: tagSelector },
    };

    const resolved = resolveCriticalPoints(ANATOMY, DEFINITIONS, [definition]);

    expect(resolved.points.map((p) => p.id).sort()).toEqual([
      "limb-marker:arm-1",
      "limb-marker:leg-1",
    ]);
  });
});
