/*
 * The awakening arithmetic, pinned.
 *
 * Two numbers do most of the work in this phase — the chance a forced opening
 * survives, and how badly it goes when it does not — and both are the kind of
 * figure a player will dispute at the table. So they are tested at the exact
 * values the rules quote, on both sides of every boundary, and for the
 * properties that make them safe to rely on: pure, deterministic, and
 * independent of anything that is happening around the character.
 */

import { describe, expect, it } from "vitest";

import {
  ABRUPT_MAXIMUM_PROBABILITY,
  ABRUPT_MINIMUM_PROBABILITY,
  AWAKENING_DEATH_BANDS,
  DANGER_WEIGHTS,
  INSTINCTIVE_AWAKENING_MINIMUM_SPI,
  REAWAKENING_HURDLE_MULTIPLIERS,
  STANDARD_AWAKENING_ATTRIBUTES,
  STANDARD_AWAKENING_THRESHOLDS,
  deriveAbruptAwakeningOdds,
  deriveAbruptReawakeningOdds,
  deriveAwakeningDangerScore,
  deriveAwakeningDeathChance,
  deriveAwakeningFailureSeverity,
  reawakeningStandardDuration,
} from "../character/foundation/nen/awakening/calculations";
import { NEN_REAWAKENING_HURDLES } from "../character/foundation/nen/awakening/types";
import type { Attributes } from "../character/foundation/attributes/types";

const BASE: Attributes = {
  agi: 10, dex: 10, con: 10, vit: 10, int: 10,
  wis: 10, per: 10, spi: 10, cha: 10,
};

/** Exactly on every standard threshold, and nothing above it. */
const AT_THRESHOLD: Attributes = { ...BASE, ...STANDARD_AWAKENING_THRESHOLDS };

function withShortfall(partial: Partial<Attributes>): Attributes {
  return { ...AT_THRESHOLD, ...partial };
}


describe("abrupt success probability", () => {
  /*
   * The anchor the whole curve is built around. A character who was ready
   * anyway succeeds three times in five, which is why the base odds are 1.5
   * rather than 1 — even money would make being ready worth nothing.
   */
  it("is exactly 60% at the standard thresholds", () => {
    const odds = deriveAbruptAwakeningOdds(AT_THRESHOLD);

    expect(odds.attributeOdds).toBe(1.5);
    expect(odds.odds).toBe(1.5);
    expect(odds.probability).toBe(0.6);
    expect(odds.clamped).toBe(false);
  });

  it("multiplies by 1.25 for each point of CON, VIT, PER or WIS above", () => {
    for (const attribute of ["con", "vit", "per", "wis"] as const) {
      const one = deriveAbruptAwakeningOdds(withShortfall({
        [attribute]: STANDARD_AWAKENING_THRESHOLDS[attribute] + 1,
      }));

      expect(one.attributeOdds).toBeCloseTo(1.5 * 1.25, 12);
    }
  });

  it("multiplies by 1.75 for each point of SPI above", () => {
    const one = deriveAbruptAwakeningOdds(withShortfall({
      spi: STANDARD_AWAKENING_THRESHOLDS.spi + 1,
    }));

    expect(one.attributeOdds).toBeCloseTo(1.5 * 1.75, 12);
  });

  /*
   * The exponents are SIGNED, which is the whole reason abrupt awakening can
   * be attempted below the thresholds at all: falling short DIVIDES the odds
   * rather than refusing the attempt.
   */
  it("divides rather than refusing below a threshold", () => {
    const short = deriveAbruptAwakeningOdds(withShortfall({ con: 12 }));

    expect(short.attributeOdds).toBeCloseTo(1.5 / 1.25, 12);
    expect(short.probability).toBeLessThan(0.6);
    expect(short.probability).toBeGreaterThan(ABRUPT_MINIMUM_PROBABILITY);
  });

  it("clamps a hopeless attempt up to 1% rather than to zero", () => {
    const hopeless = deriveAbruptAwakeningOdds(
      { ...BASE, con: 1, vit: 1, per: 1, wis: 1, spi: 1 },
    );

    expect(hopeless.rawProbability).toBeLessThan(ABRUPT_MINIMUM_PROBABILITY);
    expect(hopeless.probability).toBe(ABRUPT_MINIMUM_PROBABILITY);
    expect(hopeless.clamped).toBe(true);
  });

  it("clamps a certain attempt down to 99% rather than to one", () => {
    const overwhelming = deriveAbruptAwakeningOdds(
      { ...BASE, con: 30, vit: 30, per: 30, wis: 30, spi: 30 },
    );

    expect(overwhelming.rawProbability)
      .toBeGreaterThan(ABRUPT_MAXIMUM_PROBABILITY);
    expect(overwhelming.probability).toBe(ABRUPT_MAXIMUM_PROBABILITY);
    expect(overwhelming.clamped).toBe(true);
  });

  /*
   * The hurdle multiplies the ODDS, before the conversion. Applying it to the
   * probability instead would push a 60% attempt to 120%, and clamping that
   * would quietly make every strong reawakening the same number.
   */
  it("applies a hurdle multiplier to the odds, not to the probability", () => {
    const doubled = deriveAbruptAwakeningOdds(AT_THRESHOLD, 2);

    expect(doubled.odds).toBe(3);
    expect(doubled.probability).toBe(0.75);
    expect(doubled.probability).not.toBe(Math.min(0.99, 0.6 * 2));
  });

  it("is deterministic and combat-independent", () => {
    const first = deriveAbruptAwakeningOdds(AT_THRESHOLD);
    const second = deriveAbruptAwakeningOdds({ ...AT_THRESHOLD });

    expect(second).toEqual(first);

    /* Nothing outside the five Attributes can move it. */
    const noisy = deriveAbruptAwakeningOdds({
      ...AT_THRESHOLD, agi: 30, dex: 1, int: 30, cha: 1,
    });

    expect(noisy.probability).toBe(first.probability);
  });

  it("never rolls", () => {
    const source = deriveAbruptAwakeningOdds.toString();

    expect(source).not.toContain("Math.random");
  });
});


describe("Danger Score", () => {
  it("is zero at or above every threshold", () => {
    expect(deriveAwakeningDangerScore(AT_THRESHOLD)).toBe(0);
    expect(deriveAwakeningDangerScore({
      ...AT_THRESHOLD, con: 30, vit: 30, per: 30, wis: 30, spi: 30,
    })).toBe(0);
  });

  it("weighs each shortfall by its own weight", () => {
    for (const attribute of STANDARD_AWAKENING_ATTRIBUTES) {
      const oneShort = withShortfall({
        [attribute]: STANDARD_AWAKENING_THRESHOLDS[attribute] - 1,
      });

      expect(deriveAwakeningDangerScore(oneShort))
        .toBeCloseTo(DANGER_WEIGHTS[attribute], 12);
    }
  });

  it("weighs CON and VIT double, and SPI at one and a half", () => {
    expect(DANGER_WEIGHTS.con).toBe(2);
    expect(DANGER_WEIGHTS.vit).toBe(2);
    expect(DANGER_WEIGHTS.per).toBe(1);
    expect(DANGER_WEIGHTS.wis).toBe(1);
    expect(DANGER_WEIGHTS.spi).toBe(1.5);
  });

  it("adds shortfalls together", () => {
    /* CON 11 (2 short x2 = 4) + SPI 14 (2 short x1.5 = 3) = 7. */
    expect(deriveAwakeningDangerScore(withShortfall({ con: 11, spi: 14 })))
      .toBeCloseTo(7, 12);
  });

  /*
   * Margin does not offset shortfall. A character with superb CON and dreadful
   * VIT is in danger from the VIT, and the CON does not buy it back.
   */
  it("never lets a margin cancel a shortfall", () => {
    const lopsided = withShortfall({ con: 30, vit: 8 });

    expect(deriveAwakeningDangerScore(lopsided))
      .toBeCloseTo(2 * (13 - 8), 12);
  });
});


describe("the death table", () => {
  /*
   * Bands are HALF-OPEN upwards: `upTo` is inclusive and the next band starts
   * immediately above it, which is what "(0, 2]" means. Getting this wrong in
   * the obvious direction would let a character at exactly the thresholds die
   * of a failure, which the rule forbids outright.
   */
  const BOUNDARIES: readonly (readonly [number, number])[] = [
    [0, 0],
    [2, 0.05],
    [4, 0.15],
    [6, 0.30],
    [8, 0.50],
    [10, 0.70],
  ];

  it("matches the published table on every boundary", () => {
    for (const [danger, chance] of BOUNDARIES) {
      expect([danger, deriveAwakeningDeathChance(danger)])
        .toEqual([danger, chance]);
    }
  });

  it("moves to the next band immediately across every boundary", () => {
    const bands = [...AWAKENING_DEATH_BANDS];

    for (const [index, [danger]] of BOUNDARIES.entries()) {
      const next = bands[index + 1]!.deathChance;

      expect([danger, deriveAwakeningDeathChance(danger + 1e-9)])
        .toEqual([danger, next]);
    }
  });

  it("caps at 85% past ten", () => {
    expect(deriveAwakeningDeathChance(10 + 1e-9)).toBe(0.85);
    expect(deriveAwakeningDeathChance(40)).toBe(0.85);
    expect(deriveAwakeningDeathChance(4000)).toBe(0.85);
  });

  /*
   * The rule that makes being ready worth something even when you are unlucky:
   * at or above every threshold a failure can still maim, and cannot kill.
   */
  it("cannot kill a character who met every threshold", () => {
    const severity = deriveAwakeningFailureSeverity(AT_THRESHOLD);

    expect(severity.dangerScore).toBe(0);
    expect(severity.deathChance).toBe(0);
    expect(severity.survivable).toBe(true);
  });

  /*
   * Severity is derived from the Attributes, NOT from the success probability.
   * A character can easily be unlikely to succeed and in no danger at all.
   */
  it("is independent of the success probability", () => {
    const unlikely = { ...AT_THRESHOLD, spi: 10 };
    const likely = { ...AT_THRESHOLD, con: 20, vit: 20, per: 20, wis: 20 };

    expect(deriveAbruptAwakeningOdds(unlikely).probability).toBeLessThan(0.6);
    expect(deriveAwakeningFailureSeverity(likely).deathChance).toBe(0);

    /* Above every threshold but SPI: still unlikely, still unkillable. */
    const both = { ...AT_THRESHOLD, con: 20, vit: 20, per: 20, wis: 20 };

    expect(deriveAwakeningFailureSeverity(both).survivable).toBe(true);
  });
});


describe("reawakening hurdles", () => {
  it("publishes both multipliers for every hurdle", () => {
    for (const hurdle of NEN_REAWAKENING_HURDLES) {
      expect(REAWAKENING_HURDLE_MULTIPLIERS[hurdle]).toBeDefined();
    }
  });

  it("matches the published table", () => {
    expect(REAWAKENING_HURDLE_MULTIPLIERS).toEqual({
      ideal: { standardDurationMultiplier: 0.10, abruptOddsMultiplier: 2.00 },
      minor: { standardDurationMultiplier: 0.25, abruptOddsMultiplier: 1.75 },
      moderate: { standardDurationMultiplier: 0.50, abruptOddsMultiplier: 1.50 },
      severe: { standardDurationMultiplier: 1.00, abruptOddsMultiplier: 1.25 },
      critical: { standardDurationMultiplier: 2.00, abruptOddsMultiplier: 1.00 },
      catastrophic: {
        standardDurationMultiplier: 4.00,
        abruptOddsMultiplier: 0.50,
      },
    });
  });

  /*
   * The two tables pull OPPOSITE ways, which is easy to get backwards: a
   * hurdle lengthens standard training and shortens abrupt odds.
   */
  it("pulls the two routes in opposite directions", () => {
    const ideal = REAWAKENING_HURDLE_MULTIPLIERS.ideal;
    const catastrophic = REAWAKENING_HURDLE_MULTIPLIERS.catastrophic;

    expect(ideal.standardDurationMultiplier)
      .toBeLessThan(catastrophic.standardDurationMultiplier);
    expect(ideal.abruptOddsMultiplier)
      .toBeGreaterThan(catastrophic.abruptOddsMultiplier);
  });

  it("makes an ideal standard reawakening exactly a tenth of the base", () => {
    expect(reawakeningStandardDuration(500, "ideal")).toBe(50);
    expect(reawakeningStandardDuration(1, "ideal")).toBe(0.1);
    expect(reawakeningStandardDuration(0, "ideal")).toBe(0);
  });

  it("makes an ideal threshold abrupt reawakening exactly 75%", () => {
    const odds = deriveAbruptReawakeningOdds(AT_THRESHOLD, "ideal");

    expect(odds.odds).toBe(3);
    expect(odds.probability).toBe(0.75);
  });

  it("leaves a critical hurdle's abrupt odds unchanged at 60%", () => {
    expect(deriveAbruptReawakeningOdds(AT_THRESHOLD, "critical").probability)
      .toBe(0.6);
  });

  it("halves a catastrophic hurdle's odds", () => {
    const odds = deriveAbruptReawakeningOdds(AT_THRESHOLD, "catastrophic");

    expect(odds.odds).toBe(0.75);
    expect(odds.probability).toBeCloseTo(0.75 / 1.75, 12);
  });
});


describe("the thresholds themselves", () => {
  it("are the five the rules name", () => {
    expect(STANDARD_AWAKENING_THRESHOLDS).toEqual({
      con: 13, vit: 13, per: 13, wis: 13, spi: 16,
    });
  });

  /*
   * A GATE, not a trigger. SPI 20 makes an instinctive awakening possible and
   * causes none of it; there is no rarity roll a high-SPI character passes in
   * the background.
   */
  it("gate an instinctive awakening at SPI 20", () => {
    expect(INSTINCTIVE_AWAKENING_MINIMUM_SPI).toBe(20);
  });
});
