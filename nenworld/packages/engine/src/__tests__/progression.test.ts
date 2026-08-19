/*
 * Tests the progression currency: Level/XP, Stat Points, Growth Points.
 *
 * This is deliberately arithmetic-heavy. Every derived number here reaches a
 * player's sheet directly — "how many Stat Points do I have" is not a
 * question a GM wants explained by trust — so the tests pin exact values
 * from the curve, not just success/failure shape. The worked examples in
 * each file's own doc comment are the source; every number below was
 * independently re-derived from the documented formulas before being pinned,
 * so a wrong doc comment and a wrong test would not silently agree.
 *
 * levels.ts is the dependency root: stats.ts and growth.ts both convert
 * Lifetime XP to Level through it rather than deriving Level themselves, so
 * their post-cap tests lean on levels.ts's milestone thresholds rather than
 * recomputing them.
 */

import { describe, expect, it } from "vitest";

import {
  addExperience,
  canGainCharacterLevel,
  deriveCharacterLevelFromLifetimeXp,
  deriveExperienceProgress,
  deriveLifetimeXpThreshold,
  deriveNextCharacterLevel,
  derivePostCapMilestoneThreshold,
  derivePostCapMilestonesReached,
  deriveRawXpToNextLevel,
  deriveXpToNextLevel,
  isCharacterLevel,
  LEVEL_CAP_LIFETIME_XP,
  MAX_CHARACTER_LEVEL,
  MIN_CHARACTER_LEVEL,
  validateCharacterLevel,
  validateLifetimeXp,
} from "../character/progression/levels";

import {
  applyLimitedStatPointGrant,
  deriveNaturalStatPointsForLevel,
  deriveNaturalStatPointsForLifetimeXp,
  grantStatPoints,
  spendStatPoints,
  STARTING_STAT_ARRAY,
} from "../character/progression/stats";

import {
  deriveNaturalGrowthPointsForLevel,
  deriveNaturalGrowthPointsForLifetimeXp,
  grantGrowthPoints,
  spendGrowthPoints,
} from "../character/progression/growth";

import { TEST_ATTRIBUTES } from "./fixtures/character";

describe("levels", () => {
  it("bounds the normal Level range at 1 and 30", () => {
    expect(MIN_CHARACTER_LEVEL).toBe(1);
    expect(MAX_CHARACTER_LEVEL).toBe(30);
  });

  describe("isCharacterLevel", () => {
    it("accepts every integer in range", () => {
      expect(isCharacterLevel(1)).toBe(true);
      expect(isCharacterLevel(30)).toBe(true);
      expect(isCharacterLevel(15)).toBe(true);
    });

    it("rejects zero, negative, above-cap, fractional and non-finite values", () => {
      expect(isCharacterLevel(0)).toBe(false);
      expect(isCharacterLevel(-1)).toBe(false);
      expect(isCharacterLevel(31)).toBe(false);
      expect(isCharacterLevel(1.5)).toBe(false);
      expect(isCharacterLevel(Number.NaN)).toBe(false);
    });
  });

  describe("validateCharacterLevel", () => {
    it("accepts a Level in range", () => {
      expect(validateCharacterLevel(12).success).toBe(true);
    });

    it("rejects a non-integer with its own code", () => {
      const result = validateCharacterLevel(4.2);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]?.code).toBe("progression.levels.invalid");
      }
    });

    it("rejects an out-of-range Level with its own code", () => {
      const result = validateCharacterLevel(31);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]?.code).toBe("progression.levels.out_of_range");
      }
    });
  });

  describe("validateLifetimeXp", () => {
    it("accepts zero and positive integers", () => {
      expect(validateLifetimeXp(0).success).toBe(true);
      expect(validateLifetimeXp(3000).success).toBe(true);
    });

    it("rejects negative, fractional and non-finite XP", () => {
      for (const xp of [-1, 4.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        const result = validateLifetimeXp(xp);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors[0]?.code).toBe("progression.experience.invalid");
        }
      }
    });
  });

  describe("the XP curve", () => {
    // The formula continues past Level 30 on purpose — post-cap milestones
    // reuse it rather than inventing a second curve.
    it("computes the raw formula before rounding", () => {
      expect(deriveRawXpToNextLevel(1)).toBeCloseTo(5.7633, 3);
    });

    it("rounds the cost of each transition to one significant figure", () => {
      expect(deriveXpToNextLevel(1)).toBe(6);
      expect(deriveXpToNextLevel(10)).toBe(30);
      expect(deriveXpToNextLevel(20)).toBe(100);
      expect(deriveXpToNextLevel(29)).toBe(400);
    });

    it("sums already-rounded transition costs into Lifetime XP thresholds", () => {
      const at = (level: number) => {
        const result = deriveLifetimeXpThreshold(level);

        expect(result.success).toBe(true);
        return result.success ? result.payload : Number.NaN;
      };

      expect(at(5)).toBe(30);
      expect(at(10)).toBe(100);
      expect(at(15)).toBe(290);
      expect(at(20)).toBe(700);
      expect(at(25)).toBe(1500);
      expect(at(30)).toBe(3000);

      // The formula's whole reason for continuing past 30: milestones read
      // straight off it rather than a separate table.
      expect(at(35)).toBe(5400);
      expect(at(40)).toBe(9000);
    });

    it("agrees with the exported Level-30 constant", () => {
      const result = deriveLifetimeXpThreshold(30);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload).toBe(LEVEL_CAP_LIFETIME_XP);
      }

      expect(LEVEL_CAP_LIFETIME_XP).toBe(3000);
    });

    it("rejects a threshold Level below 1", () => {
      const result = deriveLifetimeXpThreshold(0);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]?.code).toBe(
          "progression.experience.threshold_level.invalid",
        );
      }
    });
  });

  describe("addExperience", () => {
    it("adds a positive award to the running total", () => {
      const result = addExperience(100, 50);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload).toBe(150);
      }
    });

    it("rejects a zero or negative award", () => {
      for (const amount of [0, -5]) {
        const result = addExperience(100, amount);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors[0]?.code).toBe(
            "progression.experience.add.invalid",
          );
        }
      }
    });

    it("propagates an invalid starting total rather than adding onto it", () => {
      const result = addExperience(-10, 50);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]?.code).toBe("progression.experience.invalid");
      }
    });
  });

  describe("deriveCharacterLevelFromLifetimeXp", () => {
    const levelAt = (xp: number) => {
      const result = deriveCharacterLevelFromLifetimeXp(xp);

      expect(result.success).toBe(true);
      return result.success ? result.payload : Number.NaN;
    };

    it("starts every character at Level 1 with no XP", () => {
      expect(levelAt(0)).toBe(1);
    });

    it("advances exactly at each threshold, not one XP early", () => {
      expect(levelAt(5)).toBe(1);
      expect(levelAt(6)).toBe(2);
    });

    it("reaches Level 30 at exactly the cap threshold", () => {
      expect(levelAt(2999)).toBe(29);
      expect(levelAt(3000)).toBe(30);
    });

    // The cap is real: XP keeps counting, Level does not.
    it("never reports a Level above 30, however much XP is supplied", () => {
      expect(levelAt(100_000)).toBe(30);
    });
  });

  describe("canGainCharacterLevel / deriveNextCharacterLevel", () => {
    it("allows advancing below the cap", () => {
      const canGain = canGainCharacterLevel(15);

      expect(canGain.success).toBe(true);
      if (canGain.success) expect(canGain.payload).toBe(true);

      const next = deriveNextCharacterLevel(15);

      expect(next.success).toBe(true);
      if (next.success) expect(next.payload).toBe(16);
    });

    it("refuses to advance past the cap", () => {
      const canGain = canGainCharacterLevel(30);

      expect(canGain.success).toBe(true);
      if (canGain.success) expect(canGain.payload).toBe(false);

      const next = deriveNextCharacterLevel(30);

      expect(next.success).toBe(false);
      if (!next.success) {
        expect(next.errors[0]?.code).toBe(
          "progression.levels.maximum_reached",
        );
      }
    });

    it("does not itself decide whether the character has enough XP", () => {
      // A Level 1 character with 0 XP can still "gain a Level" by this
      // function's own definition — it only checks the cap. Whether they
      // have earned it is deriveCharacterLevelFromLifetimeXp's question.
      const result = canGainCharacterLevel(1);

      expect(result.success).toBe(true);
      if (result.success) expect(result.payload).toBe(true);
    });
  });

  describe("post-cap milestones", () => {
    it("reuses the XP curve for milestone thresholds", () => {
      const at = (milestone: number) => {
        const result = derivePostCapMilestoneThreshold(milestone);

        expect(result.success).toBe(true);
        return result.success ? result.payload : Number.NaN;
      };

      expect(at(1)).toBe(5400);
      expect(at(2)).toBe(9000);
      expect(at(3)).toBe(13900);
    });

    it("rejects milestone 0 and negative milestones", () => {
      for (const milestone of [0, -1]) {
        const result = derivePostCapMilestoneThreshold(milestone);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors[0]?.code).toBe(
            "progression.experience.post_cap.milestone.invalid",
          );
        }
      }
    });

    it("reports zero milestones below the Level cap, including at exactly the cap", () => {
      const reachedAt = (xp: number) => {
        const result = derivePostCapMilestonesReached(xp);

        expect(result.success).toBe(true);
        return result.success ? result.payload : Number.NaN;
      };

      expect(reachedAt(0)).toBe(0);
      expect(reachedAt(2999)).toBe(0);

      // A freshly Level-30 character has not reached any post-cap milestone
      // yet — the cap threshold and the first milestone are different points.
      expect(reachedAt(3000)).toBe(0);
    });

    it("counts every milestone threshold reached, not just the first", () => {
      const reachedAt = (xp: number) => {
        const result = derivePostCapMilestonesReached(xp);

        expect(result.success).toBe(true);
        return result.success ? result.payload : Number.NaN;
      };

      expect(reachedAt(5399)).toBe(0);
      expect(reachedAt(5400)).toBe(1);
      expect(reachedAt(9000)).toBe(2);
      expect(reachedAt(13900)).toBe(3);
    });
  });

  describe("deriveExperienceProgress", () => {
    it("reports progress toward the next Level below the cap", () => {
      const result = deriveExperienceProgress(10);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.payload.level).toBe(2);
      expect(result.payload.currentLevelLifetimeXp).toBe(6);
      expect(result.payload.nextLevelLifetimeXp).toBe(13);
      expect(result.payload.xpIntoCurrentLevel).toBe(4);
      expect(result.payload.xpToNextLevel).toBe(3);
      expect(result.payload.atLevelCap).toBe(false);
      expect(result.payload.postCapMilestonesReached).toBe(0);
    });

    it("switches to post-cap reporting at the Level cap", () => {
      const result = deriveExperienceProgress(6000);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.payload.level).toBe(30);
      expect(result.payload.atLevelCap).toBe(true);
      expect(result.payload.nextLevelLifetimeXp).toBeNull();
      expect(result.payload.xpToNextLevel).toBeNull();
      expect(result.payload.xpBeyondLevelCap).toBe(6000 - LEVEL_CAP_LIFETIME_XP);
      expect(result.payload.postCapMilestonesReached).toBe(1);
      expect(result.payload.nextPostCapMilestoneLifetimeXp).toBe(9000);
    });

    it("propagates an invalid Lifetime XP rather than guessing a progress shape", () => {
      const result = deriveExperienceProgress(-5);

      expect(result.success).toBe(false);
    });
  });
});

describe("stat points", () => {
  it("assigns the documented Level 1 starting array", () => {
    expect(STARTING_STAT_ARRAY).toEqual([11, 11, 10, 10, 10, 10, 9, 9]);
  });

  describe("deriveNaturalStatPointsForLevel", () => {
    it("matches the documented curve", () => {
      const at = (level: number) => {
        const result = deriveNaturalStatPointsForLevel(level);

        expect(result.success).toBe(true);
        return result.success ? result.payload : Number.NaN;
      };

      expect(at(1)).toBe(2);
      expect(at(5)).toBe(10);
      expect(at(10)).toBe(20);
      expect(at(30)).toBe(60);
    });

    it("rejects an invalid Level rather than computing a nonsense total", () => {
      const result = deriveNaturalStatPointsForLevel(0);

      expect(result.success).toBe(false);
    });
  });

  describe("deriveNaturalStatPointsForLifetimeXp", () => {
    it("adds one Stat Point per post-cap milestone on top of the Level-30 total", () => {
      const at = (xp: number) => {
        const result = deriveNaturalStatPointsForLifetimeXp(xp);

        expect(result.success).toBe(true);
        return result.success ? result.payload : Number.NaN;
      };

      expect(at(0)).toBe(2);
      expect(at(LEVEL_CAP_LIFETIME_XP)).toBe(60);
      expect(at(5400)).toBe(61);
      expect(at(9000)).toBe(62);
    });
  });

  describe("grantStatPoints", () => {
    it("adds to the current balance", () => {
      const result = grantStatPoints(4, 3);

      expect(result.success).toBe(true);
      if (result.success) expect(result.payload).toBe(7);
    });

    it("rejects a negative current balance", () => {
      expect(grantStatPoints(-1, 1).success).toBe(false);
    });

    it("rejects a zero or negative grant", () => {
      expect(grantStatPoints(4, 0).success).toBe(false);
    });
  });

  describe("spendStatPoints", () => {
    it("raises the target Attribute and debits the balance", () => {
      const result = spendStatPoints(TEST_ATTRIBUTES, 5, "str", 2);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.payload.attributes.str).toBe(12);
      expect(result.payload.remainingStatPoints).toBe(3);
      expect(result.payload.previousScore).toBe(10);
      expect(result.payload.newScore).toBe(12);
    });

    it("does not mutate the Attributes object it was given", () => {
      spendStatPoints(TEST_ATTRIBUTES, 5, "str", 2);

      expect(TEST_ATTRIBUTES.str).toBe(10);
    });

    it("defaults to spending a single point", () => {
      const result = spendStatPoints(TEST_ATTRIBUTES, 5, "agi");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.spentStatPoints).toBe(1);
        expect(result.payload.attributes.agi).toBe(11);
      }
    });

    // SPI and CHA are rolled, not bought — this is the one rule ordinary Stat
    // Points cannot cross, which is why applyLimitedStatPointGrant exists as
    // a separate, explicitly-targeted path.
    it("refuses to spend on SPI or CHA", () => {
      for (const attribute of ["spi", "cha"] as const) {
        const result = spendStatPoints(TEST_ATTRIBUTES, 5, attribute);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors[0]?.code).toBe(
            "progression.stats.attribute.not_spendable",
          );
        }
      }
    });

    it("refuses to spend more points than the character has", () => {
      const result = spendStatPoints(TEST_ATTRIBUTES, 1, "str", 2);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]?.code).toBe(
          "progression.stats.points.insufficient",
        );
      }
    });

    it("refuses to spend past the Base Attribute cap", () => {
      const result = spendStatPoints(
        { ...TEST_ATTRIBUTES, str: 29 },
        5,
        "str",
        2,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]?.code).toBe(
          "progression.stats.attribute.cap_exceeded",
        );
      }
    });
  });

  describe("applyLimitedStatPointGrant", () => {
    it("permanently raises the targeted Attribute", () => {
      const result = applyLimitedStatPointGrant(TEST_ATTRIBUTES, {
        attribute: "con",
        amount: 2,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.attributes.con).toBe(12);
        expect(result.payload.previousScore).toBe(10);
      }
    });

    // The one thing ordinary Stat Points cannot do.
    it("can target SPI and CHA, unlike ordinary Stat Points", () => {
      const result = applyLimitedStatPointGrant(TEST_ATTRIBUTES, {
        attribute: "spi",
        amount: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) expect(result.payload.attributes.spi).toBe(11);
    });

    it("does not touch or require an ordinary Stat Point balance", () => {
      const result = applyLimitedStatPointGrant(TEST_ATTRIBUTES, {
        attribute: "str",
        amount: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload).not.toHaveProperty("remainingStatPoints");
      }
    });

    it("still refuses to exceed the Base Attribute cap", () => {
      const result = applyLimitedStatPointGrant(
        { ...TEST_ATTRIBUTES, str: 29 },
        { attribute: "str", amount: 2 },
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]?.code).toBe(
          "progression.stats.attribute.cap_exceeded",
        );
      }
    });

    it("rejects a zero or negative grant amount", () => {
      const result = applyLimitedStatPointGrant(TEST_ATTRIBUTES, {
        attribute: "str",
        amount: 0,
      });

      expect(result.success).toBe(false);
    });
  });
});

describe("growth points", () => {
  describe("deriveNaturalGrowthPointsForLevel", () => {
    it("matches the documented curve", () => {
      const at = (level: number) => {
        const result = deriveNaturalGrowthPointsForLevel(level);

        expect(result.success).toBe(true);
        return result.success ? result.payload : Number.NaN;
      };

      expect(at(1)).toBe(3);
      expect(at(10)).toBe(30);
      expect(at(20)).toBe(60);
      expect(at(30)).toBe(90);
    });
  });

  describe("deriveNaturalGrowthPointsForLifetimeXp", () => {
    it("adds three Growth Points per post-cap milestone on top of the Level-30 total", () => {
      const at = (xp: number) => {
        const result = deriveNaturalGrowthPointsForLifetimeXp(xp);

        expect(result.success).toBe(true);
        return result.success ? result.payload : Number.NaN;
      };

      expect(at(0)).toBe(3);
      expect(at(LEVEL_CAP_LIFETIME_XP)).toBe(90);
      expect(at(5400)).toBe(93);
      expect(at(9000)).toBe(96);
    });
  });

  describe("grantGrowthPoints", () => {
    it("adds to the current balance", () => {
      const result = grantGrowthPoints(10, 5);

      expect(result.success).toBe(true);
      if (result.success) expect(result.payload).toBe(15);
    });

    it("rejects a negative current balance or non-positive grant", () => {
      expect(grantGrowthPoints(-1, 1).success).toBe(false);
      expect(grantGrowthPoints(10, 0).success).toBe(false);
    });
  });

  describe("spendGrowthPoints", () => {
    it("debits the balance without knowing what was bought", () => {
      const result = spendGrowthPoints(10, 4);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.remainingGrowthPoints).toBe(6);
        expect(result.payload.spentGrowthPoints).toBe(4);
      }
    });

    it("refuses to spend more than the character has", () => {
      const result = spendGrowthPoints(3, 4);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0]?.code).toBe(
          "progression.growth.points.insufficient",
        );
      }
    });

    it("rejects a non-integer or negative expenditure", () => {
      expect(spendGrowthPoints(10, 1.5).success).toBe(false);
      expect(spendGrowthPoints(10, -1).success).toBe(false);
    });
  });
});
