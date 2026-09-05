/*
 * Information bands — how much a margin actually told you.
 *
 * Every mechanic in the sensory domain ends here, so the boundaries are worth
 * pinning exhaustively rather than by sampling: an off-by-one at any threshold
 * silently changes what four different resolvers reveal.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_INFORMATION_THRESHOLDS,
  INFORMATION_BANDS,
  compareInformationBands,
  highestInformationBand,
  resolveInformationBand,
  type InformationBand,
} from "../character/foundation/senses/information";
import {
  findInformationOverrideIssues,
  isValidInformationThresholds,
} from "../character/foundation/senses/validation";

const { minimal, partial, substantial, full } = DEFAULT_INFORMATION_THRESHOLDS;


describe("the default thresholds", () => {
  it("ascends 1 / 5 / 10 / 15", () => {
    expect(DEFAULT_INFORMATION_THRESHOLDS).toEqual({
      minimal: 1,
      partial: 5,
      substantial: 10,
      full: 15,
    });
  });

  it("orders the five bands from none to full", () => {
    expect(INFORMATION_BANDS).toEqual([
      "none",
      "minimal",
      "partial",
      "substantial",
      "full",
    ]);
  });
});


describe("every band boundary", () => {
  const CASES: readonly (readonly [number, InformationBand])[] = [
    [-10, "none"],
    [-1, "none"],
    [0, "none"],
    [minimal, "minimal"],
    [minimal + 1, "minimal"],
    [partial - 1, "minimal"],
    [partial, "partial"],
    [substantial - 1, "partial"],
    [substantial, "substantial"],
    [full - 1, "substantial"],
    [full, "full"],
    [100, "full"],
  ];

  it.each(CASES)("resolves a margin of %i to %s", (margin, band) => {
    expect(resolveInformationBand(margin)).toBe(band);
  });

  it("puts each threshold exactly on the lower edge of its band", () => {
    for (const [name, value] of Object.entries(DEFAULT_INFORMATION_THRESHOLDS)) {
      expect(resolveInformationBand(value)).toBe(name);
      expect(resolveInformationBand(value)).not.toBe(
        resolveInformationBand(value - 1),
      );
    }
  });
});


describe("custom thresholds", () => {
  it("replaces the default ladder wholesale", () => {
    const thresholds = { minimal: 2, partial: 4, substantial: 6, full: 8 };

    expect(resolveInformationBand(1, { thresholds })).toBe("none");
    expect(resolveInformationBand(2, { thresholds })).toBe("minimal");
    expect(resolveInformationBand(7, { thresholds })).toBe("substantial");
    expect(resolveInformationBand(8, { thresholds })).toBe("full");
  });
});


describe("shift", () => {
  it("promotes by the given number of bands", () => {
    expect(resolveInformationBand(1)).toBe("minimal");
    expect(resolveInformationBand(1, { shift: 1 })).toBe("partial");
    expect(resolveInformationBand(1, { shift: 2 })).toBe("substantial");
  });

  it("demotes on a negative shift", () => {
    expect(resolveInformationBand(12)).toBe("substantial");
    expect(resolveInformationBand(12, { shift: -2 })).toBe("minimal");
  });

  it("can demote a perceived margin all the way to none", () => {
    expect(resolveInformationBand(1, { shift: -1 })).toBe("none");
  });

  it("clamps at full rather than running off the top", () => {
    expect(resolveInformationBand(20, { shift: 5 })).toBe("full");
    expect(resolveInformationBand(1, { shift: 99 })).toBe("full");
  });

  it("clamps at none rather than running off the bottom", () => {
    expect(resolveInformationBand(-5, { shift: -3 })).toBe("none");
    expect(resolveInformationBand(20, { shift: -99 })).toBe("none");
  });
});


describe("floor and cap", () => {
  it("raises a band up to the floor", () => {
    expect(resolveInformationBand(0, { floor: "partial" })).toBe("partial");
  });

  it("leaves a band already above the floor alone", () => {
    expect(resolveInformationBand(15, { floor: "partial" })).toBe("full");
  });

  it("lowers a band down to the cap", () => {
    expect(resolveInformationBand(20, { cap: "minimal" })).toBe("minimal");
  });

  it("leaves a band already below the cap alone", () => {
    expect(resolveInformationBand(1, { cap: "substantial" })).toBe("minimal");
  });

  it("applies the floor and cap after the shift", () => {
    expect(resolveInformationBand(1, { shift: 3, cap: "partial" })).toBe("partial");
    expect(resolveInformationBand(20, { shift: -4, floor: "minimal" })).toBe("minimal");
  });
});


describe("comparing bands", () => {
  it("orders any two bands", () => {
    expect(compareInformationBands("full", "none")).toBeGreaterThan(0);
    expect(compareInformationBands("none", "minimal")).toBeLessThan(0);
    expect(compareInformationBands("partial", "partial")).toBe(0);
  });

  it("picks the highest of a set", () => {
    expect(highestInformationBand(["minimal", "substantial", "none"]))
      .toBe("substantial");
  });

  it("returns none for an empty set", () => {
    expect(highestInformationBand([])).toBe("none");
  });
});


describe("override validation", () => {
  it("accepts a strictly ascending threshold ladder", () => {
    expect(isValidInformationThresholds(DEFAULT_INFORMATION_THRESHOLDS)).toBe(true);
  });

  it("rejects a ladder that does not ascend", () => {
    expect(isValidInformationThresholds({
      minimal: 5,
      partial: 5,
      substantial: 10,
      full: 15,
    })).toBe(false);
  });

  it("rejects a non-finite threshold", () => {
    expect(isValidInformationThresholds({
      minimal: Number.NaN,
      partial: 5,
      substantial: 10,
      full: 15,
    })).toBe(false);
  });

  it("reports a bad ladder on the override", () => {
    const issues = findInformationOverrideIssues({
      thresholds: { minimal: 10, partial: 5, substantial: 10, full: 15 },
    });

    expect(issues.map((issue) => issue.type)).toEqual(["thresholds-invalid"]);
    expect(issues[0]!.path).toBe("information.thresholds");
  });

  it("reports an unknown floor or cap band", () => {
    const issues = findInformationOverrideIssues({
      floor: "excellent" as InformationBand,
      cap: "none",
    });

    expect(issues.map((issue) => issue.path)).toEqual(["information.floor"]);
  });

  it("accepts an empty override", () => {
    expect(findInformationOverrideIssues({})).toEqual([]);
  });
});
