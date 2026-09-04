import { describe, expect, it } from "vitest";

import {
  findCheckRequestIssues,
  matchesCheckScope,
  resolveCheck,
  resolveFixedCheck,
  resolveOpposedCheck,
  type CheckRequest,
  type CheckScope,
} from "../gameplay/checks";

const ACTIVE_SIGHT_DETECTION: CheckScope = {
  kind: "detection",
  mode: "active",
  sense: "sight",
  phenomenon: "physical",
  subject: "entity",
};

function detectionCheck(
  roll: number,
  per: number,
  wis: number,
): CheckRequest {
  return {
    scope: ACTIVE_SIGHT_DETECTION,
    dice: { advantage: 0, rolls: [roll] },
    baseContributions: [
      { id: "per", amount: per },
      { id: "wis", amount: wis },
    ],
    modifiers: [],
  };
}

describe("gameplay checks", () => {
  it("resolves signed advantage pools", () => {
    const result = resolveCheck({
      ...detectionCheck(7, 2, 1),
      dice: { advantage: 2, rolls: [7, 16, 11] },
    });

    expect(result.dice.retainedRoll).toBe(16);
    expect(result.dice.mode).toBe("highest");
    expect(result.total).toBe(19);
  });

  it("matches broad sensory modifier selectors directionally", () => {
    expect(
      matchesCheckScope(
        {
          kind: "detection",
          mode: { kind: "specific", mode: "active" },
          sense: { kind: "all-physical" },
        },
        ACTIVE_SIGHT_DETECTION,
      ),
    ).toBe(true);

    expect(
      matchesCheckScope(
        {
          kind: "detection",
          sense: { kind: "specific", sense: "extrasensory" },
        },
        ACTIVE_SIGHT_DETECTION,
      ),
    ).toBe(false);
  });

  it("applies only modifiers whose selectors match the concrete scope", () => {
    const result = resolveCheck({
      ...detectionCheck(10, 3, 2),
      modifiers: [
        {
          source: { type: "trait", id: "keen-eyes" },
          scope: {
            kind: "detection",
            sense: { kind: "specific", sense: "sight" },
          },
          amount: 4,
          channel: "persistent",
        },
        {
          source: { type: "item", id: "ear-trumpet" },
          scope: {
            kind: "detection",
            sense: { kind: "specific", sense: "hearing" },
          },
          amount: 9,
          channel: "persistent",
        },
      ],
    });

    expect(result.baseModifierTotal).toBe(5);
    expect(result.situationalModifierTotal).toBe(4);
    expect(result.total).toBe(19);
    expect(result.applicableModifiers.map((modifier) => modifier.source.id))
      .toEqual(["keen-eyes"]);
  });

  it("lets fixed checks choose their tie policy", () => {
    const succeeds = resolveFixedCheck({
      check: detectionCheck(10, 2, 1),
      difficulty: 13,
    });
    const fails = resolveFixedCheck({
      check: detectionCheck(10, 2, 1),
      difficulty: 13,
      tiePolicy: "fails",
    });

    expect(succeeds.margin).toBe(0);
    expect(succeeds.success).toBe(true);
    expect(fails.success).toBe(false);
  });

  it("preserves both sides and explicit tie ownership in opposed checks", () => {
    const result = resolveOpposedCheck({
      initiator: detectionCheck(10, 2, 1),
      opponent: {
        scope: {
          kind: "concealment",
          mode: "active",
          sense: "sight",
          phenomenon: "physical",
          subject: "entity",
        },
        dice: { advantage: 0, rolls: [11] },
        baseContributions: [
          { id: "dex", amount: 1 },
          { id: "wis", amount: 1 },
        ],
        modifiers: [],
      },
      tiesFavor: "opponent",
    });

    expect(result.initiator.total).toBe(13);
    expect(result.opponent.total).toBe(13);
    expect(result.margin).toBe(0);
    expect(result.winner).toBe("opponent");
  });

  it("reports malformed supplied dice without generating randomness", () => {
    const issues = findCheckRequestIssues({
      ...detectionCheck(20, 0, 0),
      dice: { advantage: 1, rolls: [20] },
    });

    expect(issues).toContainEqual({
      type: "roll-count-invalid",
      path: "check.dice.rolls",
      expected: 2,
      actual: 1,
    });
  });
});

