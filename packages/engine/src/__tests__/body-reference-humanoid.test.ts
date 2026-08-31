/*
 * Tests the standard humanoid content end to end: a character at exactly
 * neutral morphology, Scale 1 and CON 10 must resolve to exactly 100 aggregate
 * Maximum BP. This is the headline regression for the whole Body foundation —
 * every other test exercises mechanics in isolation, but this one pins the
 * number every other number was calibrated against.
 *
 * That 100 surviving the move of BP onto Structural Capacity is worth more
 * than it looks. The per-part distribution genuinely changed, because the old
 * authored BP column and the reference SC column disagreed on five of eight
 * parts. Both summed to the same body, so the total is unmoved while the parts
 * beneath it are not.
 *
 * Also pins the standard Anatomy topology and the standard Critical Point
 * set, since both are content that could silently drift.
 */

import { describe, expect, it } from "vitest";

import { listDefinitions } from "../character/catalogs";
import { validateAnatomyData } from "../character/foundation/body/anatomy/validation";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import { STANDARD_BODY } from "../character/foundation/body/defaults";
import { resolveMorphology } from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import { resolveBodyPoints } from "../character/foundation/body/body-points/resolution";
import {
  resolveCriticalPoints,
} from "../character/foundation/body/critical-points/resolution";
import {
  validateCriticalPointData,
  validateSpecialPointDefinitions,
} from "../character/foundation/body/critical-points/validation";

const REFERENCE_CONSTITUTION = 10;

const BODY_PART_DEFINITIONS = listDefinitions("body-part");
const SPECIAL_POINT_DEFINITIONS = listDefinitions("special-point");

describe("STANDARD_BODY", () => {
  /*
   * There is nothing physical left to assert here, which is the point. Height,
   * Mass and build were stored fields and are now derived, so the standard body
   * is neutrality and an anatomy — and 165 cm / 62 kg fall out of the Basic
   * Human Standard rather than being restated.
   */
  it("sits exactly at neutral", () => {
    expect(STANDARD_BODY.characterScale).toBe(1);
    expect(STANDARD_BODY.globalMorphology).toEqual(NEUTRAL_MORPHOLOGY);
    expect(STANDARD_BODY.localMorphology).toEqual({});
    expect(STANDARD_BODY.strengthDevelopmentMuscularity).toBe(1);
    expect(STANDARD_BODY.anatomy).toBe(STANDARD_HUMANOID_ANATOMY);
  });
});

describe("standard humanoid Anatomy", () => {
  const ids = STANDARD_HUMANOID_ANATOMY.parts.map((part) => part.id);

  it("has exactly the expected 12 BodyPart instances", () => {
    expect(ids.sort()).toEqual(
      [
        "arm-1",
        "arm-2",
        "foot-1",
        "foot-2",
        "hand-1",
        "hand-2",
        "head-1",
        "leg-1",
        "leg-2",
        "lower-body-1",
        "neck-1",
        "upper-body-1",
      ].sort(),
    );
  });

  it("starts every part active and at full integrity", () => {
    for (const part of STANDARD_HUMANOID_ANATOMY.parts) {
      expect(part.state).toBe("active");
      expect(part.integrity).toBe(1);
    }
  });

  it("has upper-body-1 as the only root", () => {
    const roots = STANDARD_HUMANOID_ANATOMY.parts.filter(
      (part) => part.attachment === null,
    );

    expect(roots.map((part) => part.id)).toEqual(["upper-body-1"]);
  });

  it("uses the permanent Upper Body / Lower Body names, never Chest/Torso", () => {
    const upperBody = STANDARD_HUMANOID_ANATOMY.parts.find(
      (part) => part.id === "upper-body-1",
    );
    const lowerBody = STANDARD_HUMANOID_ANATOMY.parts.find(
      (part) => part.id === "lower-body-1",
    );

    expect(upperBody?.name).toBe("Upper Body");
    expect(lowerBody?.name).toBe("Lower Body");

    for (const part of STANDARD_HUMANOID_ANATOMY.parts) {
      expect(part.name).not.toMatch(/chest|torso/i);
    }
  });

  it("wires the locked topology", () => {
    const parentOf = (id: string) =>
      STANDARD_HUMANOID_ANATOMY.parts.find((part) => part.id === id)
        ?.attachment?.parentId;

    expect(parentOf("upper-body-1")).toBeUndefined();
    expect(parentOf("neck-1")).toBe("upper-body-1");
    expect(parentOf("head-1")).toBe("neck-1");
    expect(parentOf("lower-body-1")).toBe("upper-body-1");
    expect(parentOf("arm-1")).toBe("upper-body-1");
    expect(parentOf("arm-2")).toBe("upper-body-1");
    expect(parentOf("hand-1")).toBe("arm-1");
    expect(parentOf("hand-2")).toBe("arm-2");
    expect(parentOf("leg-1")).toBe("lower-body-1");
    expect(parentOf("leg-2")).toBe("lower-body-1");
    expect(parentOf("foot-1")).toBe("leg-1");
    expect(parentOf("foot-2")).toBe("leg-2");
  });

  it("passes Anatomy + definition validation", () => {
    const result = validateAnatomyData(
      STANDARD_HUMANOID_ANATOMY,
      BODY_PART_DEFINITIONS,
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });
});

describe("reference humanoid Body Points", () => {
  const neutralSource = { global: NEUTRAL_MORPHOLOGY, local: {} };

  const morphology = resolveMorphology(
    {
      species: neutralSource,
      age: neutralSource,
      character: {
        global: STANDARD_BODY.globalMorphology,
        local: STANDARD_BODY.localMorphology,
      },
      strengthDevelopmentMuscularity:
        STANDARD_BODY.strengthDevelopmentMuscularity,
      effectLayers: [],
    },
    STANDARD_BODY.anatomy.parts.map((part) => part.id),
  );

  const bodyPoints = resolveBodyPoints({
    anatomy: STANDARD_BODY.anatomy,
    definitions: BODY_PART_DEFINITIONS,
    morphologyByPartId: morphology,
    effectiveScale: STANDARD_BODY.characterScale,
    constitution: REFERENCE_CONSTITUTION,
  });

  const maximumBPByType = new Map<string, number[]>();
  for (const part of bodyPoints.parts) {
    const existing = maximumBPByType.get(part.type) ?? [];
    existing.push(part.maximumBP);
    maximumBPByType.set(part.type, existing);
  }

  /*
   * The per-part table CHANGED in this phase and the whole-body total did not.
   *
   * BP used to resolve from an authored `baseBP` column; it now resolves from
   * reference Structural Capacity, and the two disagreed on five of eight
   * parts — Neck was 4 and is 2, Upper Body was 8 and is 10, Hand was 5 and is
   * 4, Leg was 14 and is 16, Foot was 5 and is 4. Both columns summed to 100,
   * which is exactly why the drift was invisible and exactly why the aggregate
   * below is unchanged: same Human, redistributed.
   */
  it("resolves every part to the reference Structural Capacity table", () => {
    expect(maximumBPByType.get("head")).toEqual([8]);
    expect(maximumBPByType.get("neck")).toEqual([2]);
    expect(maximumBPByType.get("upper-body")).toEqual([10]);
    expect(maximumBPByType.get("lower-body")).toEqual([4]);
    expect(maximumBPByType.get("arm")).toEqual([14, 14]);
    expect(maximumBPByType.get("hand")).toEqual([4, 4]);
    expect(maximumBPByType.get("leg")).toEqual([16, 16]);
    expect(maximumBPByType.get("foot")).toEqual([4, 4]);
  });

  it("resolves to exactly 100 aggregate Maximum BP — the headline regression", () => {
    expect(bodyPoints.aggregateMaximumBP).toBe(100);
  });

  it("leaves an undamaged body at full Current BP on every part", () => {
    for (const part of bodyPoints.parts) {
      expect(part.integrity).toBe(1);
      expect(part.exactCurrentBP).toBe(part.maximumBP);
      expect(part.currentBP).toBe(part.maximumBP);
    }
  });
});

describe("standard Special Point content", () => {
  it("passes definition validation", () => {
    const result = validateSpecialPointDefinitions(
      SPECIAL_POINT_DEFINITIONS,
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("resolves to exactly the 27 expected instances over the standard Anatomy", () => {
    const resolved = resolveCriticalPoints(
      STANDARD_HUMANOID_ANATOMY,
      BODY_PART_DEFINITIONS,
      SPECIAL_POINT_DEFINITIONS,
    );

    /*
     * 20 instances became 27. The roster gained Eyes, a Jaw, Respiratory
     * Organs, an Abdominal Core, a Solar Plexus, a Gut and Armpits, and lost
     * Face, Upper Organs and Lower Organs.
     *
     * Note where the limb joints are hosted. A Wrist sits on the ARM and
     * designates the Hand, so damage lands on the Arm while the threshold is
     * read off the Hand — which is what "Connection: Arm -> Hand, Designated
     * BP: affected Hand" says. Hosting it on the Hand instead would make every
     * designation self-referential and the field pointless.
     */
    expect(resolved.points.map((point) => point.id).sort()).toEqual(
      [
        "abdominal-core:lower-body-1",
        "ankle:leg-1",
        "ankle:leg-2",
        "armpit:arm-1",
        "armpit:arm-2",
        "brain:head-1",
        "elbow:arm-1",
        "elbow:arm-2",
        "groin:lower-body-1",
        "gut:lower-body-1",
        "heart:upper-body-1",
        "hip:leg-1",
        "hip:leg-2",
        "jaw:head-1",
        "knee:leg-1",
        "knee:leg-2",
        "left-eye:head-1",
        "lower-spine:lower-body-1",
        "neck:neck-1",
        "respiratory-organs:upper-body-1",
        "right-eye:head-1",
        "shoulder:arm-1",
        "shoulder:arm-2",
        "solar-plexus:lower-body-1",
        "upper-spine:upper-body-1",
        "wrist:arm-1",
        "wrist:arm-2",
      ].sort(),
    );
  });

  it("passes full resolved-instance and consistency validation", () => {
    const resolved = resolveCriticalPoints(
      STANDARD_HUMANOID_ANATOMY,
      BODY_PART_DEFINITIONS,
      SPECIAL_POINT_DEFINITIONS,
    );

    const result = validateCriticalPointData(
      resolved,
      STANDARD_HUMANOID_ANATOMY,
      BODY_PART_DEFINITIONS,
      SPECIAL_POINT_DEFINITIONS,
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
