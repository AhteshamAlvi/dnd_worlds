/*
 * The Basic Human Standard, asserted directly against the authored content.
 *
 * This is the calibration gate for the whole physical model. Every later
 * subsystem — measurements, Structural Capacity, Body Points, Strength Points,
 * normalized STR — is expressed as factors applied to these reference numbers,
 * so if the table in anatomy/body-parts.ts is wrong then everything downstream
 * is wrong in a way that is very hard to see from the far end. A Giant would
 * still be ten times a Human; it would just be ten times the wrong Human.
 *
 * Deliberately arithmetic over authored data with no resolver involved. These
 * five totals can be checked before a single formula exists, which is exactly
 * what makes them a usable gate.
 */

import { describe, expect, it } from "vitest";

import {
  BODY_PART_DEFINITIONS,
  getBodyPartDefinition,
} from "../character/foundation/body/anatomy/body-parts";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import type { BodyPartDefinition } from "../character/foundation/body/anatomy/types";

const PARTS: readonly BodyPartDefinition[] = STANDARD_HUMANOID_ANATOMY.parts.map(
  (part) => {
    const definition = getBodyPartDefinition(part.type);

    if (definition === undefined) {
      throw new Error(
        `Standard humanoid anatomy references unknown BodyPart type "${part.type}".`,
      );
    }

    return definition;
  },
);

function sum(select: (definition: BodyPartDefinition) => number): number {
  return PARTS.reduce(
    (total, definition) => total + select(definition),
    0,
  );
}

const ALL_DEFINITIONS = Object.values(
  BODY_PART_DEFINITIONS,
) as readonly BodyPartDefinition[];


describe("Basic Human Standard reference totals", () => {
  it("has the twelve parts of the standard humanoid", () => {
    expect(PARTS).toHaveLength(12);
  });

  it("sums to 60.00 L of Size", () => {
    expect(sum((d) => d.reference.sizeL)).toBeCloseTo(60, 10);
  });

  it("sums to 62.00 kg of Mass", () => {
    expect(sum((d) => d.reference.massKg)).toBeCloseTo(62, 10);
  });

  it("sums to 100 Reference Structural Capacity", () => {
    expect(sum((d) => d.reference.structuralCapacity)).toBeCloseTo(100, 10);
  });

  /*
   * The whole-body Muscularity response used to calibrate Strength
   * advancement. A neutral Human's Structural Capacity is
   * 100 + 76.30 x (Muscularity - 1).
   */
  it("has a whole-body Muscularity structural response of 76.30", () => {
    expect(
      sum(
        (d) =>
          d.reference.structuralCapacity *
          d.sensitivity.muscularityStructural,
      ),
    ).toBeCloseTo(76.3, 10);
  });

  /*
   * Height is the greatest contiguous vertical path through the anatomy, which
   * for a Human runs Foot -> Leg -> Lower Body -> Upper Body -> Neck -> Head.
   *
   * Only the Foot contributes a fraction of its length: it is 25 cm from ankle
   * to toe, but lying flat, only 7 cm of that is height. Arms and Hands hang
   * alongside the path and contribute nothing, which is why heightContribution
   * exists as a number rather than a flag.
   */
  it("resolves to 165 cm through the vertical anatomy path", () => {
    const along = (typeId: string): number => {
      const definition = getBodyPartDefinition(typeId);

      if (definition === undefined) {
        throw new Error(`Unknown BodyPart type "${typeId}".`);
      }

      return (
        definition.reference.lengthCm *
        definition.reference.heightContribution
      );
    };

    expect(along("foot")).toBeCloseTo(7, 10);

    expect(
      along("foot") +
        along("leg") +
        along("lower-body") +
        along("upper-body") +
        along("neck") +
        along("head"),
    ).toBeCloseTo(165, 10);
  });

  it("excludes Arms and Hands from Height", () => {
    expect(getBodyPartDefinition("arm")?.reference.heightContribution).toBe(0);
    expect(getBodyPartDefinition("hand")?.reference.heightContribution).toBe(0);
  });
});


describe("Basic Human Standard sensitivity invariants", () => {
  /*
   * The Human calibration starts force response equal to structural response.
   * They are separate fields so other anatomy can diverge — a limb that is
   * structurally slight but produces disproportionate force is expressible —
   * but no Human part diverges yet.
   */
  it("starts Muscularity force response equal to structural response", () => {
    for (const definition of ALL_DEFINITIONS) {
      expect(definition.sensitivity.muscularityForce).toBe(
        definition.sensitivity.muscularityStructural,
      );
    }
  });

  /*
   * Above 1, the structural factor 1 + ((M - 1) x s) turns negative at low
   * Muscularity and drags Structural Capacity, Body Points and Strength Points
   * negative with it. Arms and Legs sit at exactly 1, on the boundary.
   */
  it("keeps Muscularity structural sensitivity within [0, 1]", () => {
    for (const definition of ALL_DEFINITIONS) {
      expect(
        definition.sensitivity.muscularityStructural,
      ).toBeGreaterThanOrEqual(0);
      expect(definition.sensitivity.muscularityStructural).toBeLessThanOrEqual(1);
    }
  });

  it("keeps Muscularity force sensitivity non-negative", () => {
    for (const definition of ALL_DEFINITIONS) {
      expect(definition.sensitivity.muscularityForce).toBeGreaterThanOrEqual(0);
    }
  });

  /*
   * Every ordinary Human part produces force in proportion to its structure.
   * A value of 0 is reserved for anatomy that is physically real but generates
   * no force of its own, which is how normalization avoids needing a separate
   * "force-contributing" flag.
   */
  it("gives every Human part an ordinary intrinsic physical force of 1", () => {
    for (const definition of ALL_DEFINITIONS) {
      expect(definition.reference.intrinsicPhysicalForce).toBe(1);
    }
  });
});
