/*
 * Age resolution, and the Human curve it drives.
 */

import { describe, expect, it } from "vitest";

import { HUMAN_AGE_PROFILE } from "../character/foundation/body/age/human-age-profile";
import { resolveAge } from "../character/foundation/body/age/resolution";
import { findAgeProfileIssues } from "../character/foundation/body/age/validation";
import { resolveEffectiveScale } from "../character/foundation/body/scale";
import type { SpeciesAgeProfile } from "../character/foundation/body/age/types";

const REFERENCE_HEIGHT_CM = 165;

const SIMPLE: SpeciesAgeProfile = {
  interpolation: "linear",
  anchors: [
    { age: 0, scale: 0.3, morphology: { muscularity: 0.4 }, lifeStage: "Young" },
    { age: 10, scale: 0.7, morphology: { muscularity: 0.7 } },
    { age: 20, scale: 1.0, morphology: { muscularity: 1.0 }, lifeStage: "Adult" },
  ],
};


describe("age interpolation", () => {
  it("returns authored values exactly at anchors", () => {
    expect(resolveAge(SIMPLE, 0).scale).toBeCloseTo(0.3, 10);
    expect(resolveAge(SIMPLE, 10).scale).toBeCloseTo(0.7, 10);
    expect(resolveAge(SIMPLE, 20).scale).toBeCloseTo(1.0, 10);
  });

  it("interpolates linearly between anchors", () => {
    expect(resolveAge(SIMPLE, 5).scale).toBeCloseTo(0.5, 10);
    expect(resolveAge(SIMPLE, 15).scale).toBeCloseTo(0.85, 10);
    expect(resolveAge(SIMPLE, 5).globalMorphology.muscularity).toBeCloseTo(0.55, 10);
  });

  /*
   * Holding at the ends is what makes "stops growing" and "does not senesce"
   * expressible without a flag: the last anchor simply continues forever.
   */
  it("holds at the first anchor below the authored range", () => {
    expect(resolveAge(SIMPLE, -5).scale).toBeCloseTo(0.3, 10);
  });

  it("holds at the last anchor above the authored range", () => {
    expect(resolveAge(SIMPLE, 500).scale).toBeCloseTo(1.0, 10);
  });

  it("leaves unauthored dimensions neutral", () => {
    const resolved = resolveAge(SIMPLE, 10).globalMorphology;

    expect(resolved.length).toBeCloseTo(1, 10);
    expect(resolved.bulk).toBeCloseTo(1, 10);
    expect(resolved.adiposity).toBeCloseTo(1, 10);
  });

  /*
   * A life stage names the span starting at an anchor, so it comes from the
   * anchor already passed. A 19-year-old is not four-fifths of an adult.
   */
  it("reports the life stage already reached, not the one approaching", () => {
    expect(resolveAge(SIMPLE, 19).lifeStage).toBe("Young");
    expect(resolveAge(SIMPLE, 20).lifeStage).toBe("Adult");
  });

  /*
   * Missing data must not silently make someone a child.
   */
  it("treats an unknown age or absent profile as a mature adult", () => {
    expect(resolveAge(SIMPLE, undefined).scale).toBe(1);
    expect(resolveAge(undefined, 5).scale).toBe(1);
    expect(resolveAge(undefined, 5).globalMorphology.muscularity).toBe(1);
  });
});


describe("effective scale", () => {
  /*
   * A character 10% larger than normal for their age, still well short of
   * mature size. The three factors answer different questions and none of them
   * can stand in for another.
   */
  it("multiplies Species, Age and Character scale", () => {
    expect(resolveEffectiveScale(1.0, 0.75, 1.1)).toBeCloseTo(0.825, 10);
  });

  it("makes a mature Giant ten times a Human", () => {
    expect(resolveEffectiveScale(10, 1, 1)).toBeCloseTo(10, 10);
  });
});


describe("the Human age curve", () => {
  it("is a valid profile", () => {
    expect(findAgeProfileIssues(HUMAN_AGE_PROFILE)).toEqual([]);
  });

  /*
   * Height is Scale x 165 by construction, so these check the authored curve
   * against real human growth: 50 cm at birth, 116 at six, 165 at twenty, and
   * about 5 cm given back by eighty.
   */
  it.each([
    [0, 50],
    [2, 86],
    [6, 116],
    [12, 140],
    [16, 160],
    [20, 165],
    [40, 165],
    [60, 163],
    [80, 160],
  ])("stands %i-year-olds at about %i cm", (age, expectedCm) => {
    const height = resolveAge(HUMAN_AGE_PROFILE, age).scale * REFERENCE_HEIGHT_CM;

    expect(height).toBeGreaterThan(expectedCm - 1);
    expect(height).toBeLessThan(expectedCm + 1);
  });

  it("reaches mature size at twenty and holds it through forty", () => {
    expect(resolveAge(HUMAN_AGE_PROFILE, 20).scale).toBe(1);
    expect(resolveAge(HUMAN_AGE_PROFILE, 30).scale).toBe(1);
    expect(resolveAge(HUMAN_AGE_PROFILE, 40).scale).toBe(1);
  });

  /*
   * Muscularity peaks in adulthood and recedes afterwards. Because Muscularity
   * drives Structural Capacity, this is what makes the elderly measurably
   * weaker without any rule saying so.
   */
  it("builds muscularity to adulthood and loses it again", () => {
    const at = (age: number): number =>
      resolveAge(HUMAN_AGE_PROFILE, age).globalMorphology.muscularity;

    expect(at(6)).toBeLessThan(at(12));
    expect(at(12)).toBeLessThan(at(16));
    expect(at(16)).toBeLessThan(at(20));
    expect(at(20)).toBe(1);
    expect(at(60)).toBeLessThan(at(40));
    expect(at(80)).toBeLessThan(at(60));
  });

  /*
   * Children are proportionally stockier than a lean adult and lean out
   * through adolescence, so bulk falls monotonically toward maturity.
   */
  it("leans children out toward adult proportions", () => {
    const bulk = (age: number): number =>
      resolveAge(HUMAN_AGE_PROFILE, age).globalMorphology.bulk;

    expect(bulk(0)).toBeGreaterThan(bulk(2));
    expect(bulk(2)).toBeGreaterThan(bulk(6));
    expect(bulk(6)).toBeGreaterThan(bulk(12));
    expect(bulk(12)).toBeGreaterThan(bulk(16));
    expect(bulk(16)).toBeGreaterThan(bulk(20));
    expect(bulk(20)).toBe(1);
  });

  it("puts weight back on through middle age as fat rather than muscle", () => {
    const adult = resolveAge(HUMAN_AGE_PROFILE, 20).globalMorphology;
    const middle = resolveAge(HUMAN_AGE_PROFILE, 40).globalMorphology;
    const elder = resolveAge(HUMAN_AGE_PROFILE, 60).globalMorphology;

    expect(middle.adiposity).toBeGreaterThan(adult.adiposity);
    expect(elder.adiposity).toBeGreaterThan(middle.adiposity);
    expect(elder.muscularity).toBeLessThan(middle.muscularity);
  });

  it("names every life stage it passes through", () => {
    expect(resolveAge(HUMAN_AGE_PROFILE, 1).lifeStage).toBe("Infant");
    expect(resolveAge(HUMAN_AGE_PROFILE, 8).lifeStage).toBe("Child");
    expect(resolveAge(HUMAN_AGE_PROFILE, 25).lifeStage).toBe("Adult");
    expect(resolveAge(HUMAN_AGE_PROFILE, 200).lifeStage).toBe("Venerable");
  });
});


describe("age profile validation", () => {
  const anchor = { age: 0, scale: 1 };

  it("rejects a profile with no anchors", () => {
    const issues = findAgeProfileIssues({ interpolation: "linear", anchors: [] });

    expect(issues.map((issue) => issue.code)).toEqual(["empty-age-profile"]);
  });

  it("rejects anchors that do not ascend", () => {
    const issues = findAgeProfileIssues({
      interpolation: "linear",
      anchors: [{ age: 10, scale: 1 }, { age: 5, scale: 1 }],
    });

    expect(issues.map((issue) => issue.code)).toContain("unordered-anchor-ages");
  });

  it("rejects two anchors at the same age", () => {
    const issues = findAgeProfileIssues({
      interpolation: "linear",
      anchors: [anchor, { age: 0, scale: 0.5 }],
    });

    expect(issues.map((issue) => issue.code)).toContain("duplicate-anchor-age");
  });

  it("rejects negative and non-finite ages", () => {
    const issues = findAgeProfileIssues({
      interpolation: "linear",
      anchors: [{ age: -1, scale: 1 }, { age: Number.NaN, scale: 1 }],
    });

    expect(
      issues.filter((issue) => issue.code === "invalid-anchor-age"),
    ).toHaveLength(2);
  });

  it("rejects a scale of zero or less", () => {
    const issues = findAgeProfileIssues({
      interpolation: "linear",
      anchors: [{ age: 0, scale: 0 }],
    });

    expect(issues.map((issue) => issue.code)).toContain("invalid-anchor-scale");
  });

  it("rejects morphology that is not a positive multiplier", () => {
    const issues = findAgeProfileIssues({
      interpolation: "linear",
      anchors: [{ age: 0, scale: 1, morphology: { bulk: 0 } }],
    });

    expect(issues.map((issue) => issue.code)).toContain(
      "invalid-anchor-morphology",
    );
  });

  it("rejects invalid local morphology as readily as global", () => {
    const issues = findAgeProfileIssues({
      interpolation: "linear",
      anchors: [
        { age: 0, scale: 1, localMorphology: { "arm-1": { length: -2 } } },
      ],
    });

    expect(issues.map((issue) => issue.code)).toContain(
      "invalid-anchor-morphology",
    );
  });
});
