/*
 * Tests the shared stage/severity/expiry vocabulary Conditions use — see
 * character/status/stage.ts. Injuries do NOT use this vocabulary (see
 * foundation/body/injuries/types.ts's own header for why); their
 * treatment-state effect resolution is covered separately in
 * injury-recovery.test.ts.
 *
 * The property under test throughout is that these are generic hooks, not
 * authored behavior: nothing here bakes in what a "worsening" Condition
 * actually does. A registered test Condition stands in for what the
 * Workbench will eventually author, the same way effects.test.ts stands in
 * for real Traits and Items.
 */

import { afterEach, describe, expect, it } from "vitest";

import { continuityKey } from "../character/foundation/body/anatomy/types";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import {
  collectStageEffects,
  findStagedEntryValidationIssues,
  findStageTrackIssues,
  getStageDefinition,
  isStageEntryActive,
  resolveStage,
} from "../character/status/stage";

import { collectConditionEffectSources } from "../character/status/resolution";
import { collectInjuryEffectSources } from "../character/status/resolution";

import { findConditionValidationIssues } from "../character/status/conditions";
import { findInjuryValidationIssues } from "../character/foundation/body/injuries";

import { validateCharacter } from "../character/validation";
import {
  createTestCharacter,
  resolveTestCharacter,
} from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});

const WORSENING_CONDITION = {
  stages: [
    {
      stage: 1,
      description: "Mild.",
      effects: [
        { type: "modifyResolvedAttribute" as const, attribute: "con" as const, amount: -1 },
      ],
    },
    {
      stage: 2,
      description: "Severe.",
      effects: [
        { type: "modifyResolvedAttribute" as const, attribute: "con" as const, amount: -4 },
      ],
    },
  ],
};

describe("stage primitives", () => {
  it("finds the authored definition for a given stage", () => {
    expect(getStageDefinition(WORSENING_CONDITION, 2)?.description).toBe(
      "Severe.",
    );
    expect(getStageDefinition(WORSENING_CONDITION, 9)).toBeUndefined();
  });

  // The one real design choice this file makes: later stages replace, they
  // do not accumulate on top of, earlier ones.
  it("applies only the current stage's effects, not every stage reached", () => {
    expect(collectStageEffects(WORSENING_CONDITION, undefined, 2)).toEqual([
      { type: "modifyResolvedAttribute", attribute: "con", amount: -4 },
    ]);
  });

  it("still includes the definition's own base effects at every stage", () => {
    const base = [
      { type: "grantTrait" as const, traitId: "always-present" },
    ];

    expect(collectStageEffects(WORSENING_CONDITION, base, 1)).toEqual([
      { type: "grantTrait", traitId: "always-present" },
      { type: "modifyResolvedAttribute", attribute: "con", amount: -1 },
    ]);
  });

  it("contributes only the base effects when no stage is selected", () => {
    const base = [{ type: "grantTrait" as const, traitId: "always-present" }];

    expect(collectStageEffects(WORSENING_CONDITION, base, undefined)).toEqual(
      base,
    );
  });

  describe("resolveStage", () => {
    it("defaults to the lowest authored stage when the entry does not say", () => {
      expect(resolveStage(WORSENING_CONDITION, {})).toBe(1);
    });

    // The default is "wherever the track actually starts," not a hardcoded
    // 1 — a track authored with no mild form has no stage 1 to fall back to.
    it("defaults to stage 2 for a track that starts at stage 2, not stage 1", () => {
      const startsAtTwo = {
        stages: [
          { stage: 2, effects: [{ type: "grantTrait" as const, traitId: "cursed" }] },
        ],
      };

      expect(resolveStage(startsAtTwo, {})).toBe(2);
      expect(collectStageEffects(startsAtTwo, undefined, resolveStage(startsAtTwo, {}))).toEqual(
        [{ type: "grantTrait", traitId: "cursed" }],
      );
    });

    it("uses the entry's own stage when given", () => {
      expect(resolveStage(WORSENING_CONDITION, { stage: 2 })).toBe(2);
    });

    it("resolves to no stage at all for content that never declared any", () => {
      expect(resolveStage({}, {})).toBeUndefined();
    });
  });

  describe("isStageEntryActive", () => {
    it("treats an entry with no duration set as active", () => {
      expect(isStageEntryActive({})).toBe(true);
    });

    it("treats a positive remaining duration as active", () => {
      expect(isStageEntryActive({ remainingDuration: 3 })).toBe(true);
    });

    it("treats zero or negative remaining duration as expired", () => {
      expect(isStageEntryActive({ remainingDuration: 0 })).toBe(false);
      expect(isStageEntryActive({ remainingDuration: -1 })).toBe(false);
    });
  });

  describe("findStageTrackIssues", () => {
    it("accepts a well-formed track", () => {
      expect(
        findStageTrackIssues("Condition", "worsening", WORSENING_CONDITION),
      ).toEqual([]);
    });

    it("rejects a non-positive or fractional stage number", () => {
      expect(
        findStageTrackIssues("Condition", "broken", {
          stages: [{ stage: 0 }],
        }),
      ).toEqual([expect.stringContaining("must be a positive integer")]);
    });

    it("rejects the same stage number defined twice", () => {
      expect(
        findStageTrackIssues("Condition", "doubled", {
          stages: [{ stage: 1 }, { stage: 1 }],
        }),
      ).toEqual([expect.stringContaining("more than once")]);
    });
  });

  describe("findStagedEntryValidationIssues", () => {
    it("accepts an entry with no lifecycle fields at all", () => {
      expect(
        findStagedEntryValidationIssues(WORSENING_CONDITION, {}),
      ).toEqual([]);
    });

    it("rejects a stage the content does not declare", () => {
      expect(
        findStagedEntryValidationIssues(WORSENING_CONDITION, { stage: 5 }),
      ).toEqual([{ type: "unknown-stage", stage: 5 }]);
    });

    it("does not judge an entry's stage against content with no stages declared", () => {
      // A stage number is meaningless without a track to place it on; it is
      // simply ignored rather than treated as an error.
      expect(
        findStagedEntryValidationIssues({}, { stage: 5 }),
      ).toEqual([]);
    });

    it("rejects a non-positive severity", () => {
      expect(
        findStagedEntryValidationIssues(WORSENING_CONDITION, { severity: 0 }),
      ).toEqual([{ type: "invalid-severity", severity: 0 }]);
    });

    it("rejects a non-finite remaining duration", () => {
      expect(
        findStagedEntryValidationIssues(WORSENING_CONDITION, {
          remainingDuration: Number.NaN,
        }),
      ).toEqual([
        { type: "invalid-duration", remainingDuration: Number.NaN },
      ]);
    });

    it("allows a negative remaining duration as meaningful expired state", () => {
      expect(
        findStagedEntryValidationIssues(WORSENING_CONDITION, {
          remainingDuration: -3,
        }),
      ).toEqual([]);
    });
  });
});

describe("status resolution respects stage and expiry", () => {
  it("applies the current stage's effects, not the definition's base effects alone", () => {
    registerDefinition("condition", {
      id: "worsening-flu",
      name: "Worsening Flu",
      description: "A test Condition.",
      ...WORSENING_CONDITION,
    });

    const mild = collectConditionEffectSources([
      { conditionId: "worsening-flu", stage: 1 },
    ]);
    const severe = collectConditionEffectSources([
      { conditionId: "worsening-flu", stage: 2 },
    ]);

    expect(mild[0]?.effects).toEqual([
      { type: "modifyResolvedAttribute", attribute: "con", amount: -1 },
    ]);
    expect(severe[0]?.effects).toEqual([
      { type: "modifyResolvedAttribute", attribute: "con", amount: -4 },
    ]);
  });

  it("defaults an unspecified stage to the first one", () => {
    registerDefinition("condition", {
      id: "worsening-flu",
      name: "Worsening Flu",
      description: "A test Condition.",
      ...WORSENING_CONDITION,
    });

    const sources = collectConditionEffectSources([
      { conditionId: "worsening-flu" },
    ]);

    expect(sources[0]?.effects).toEqual([
      { type: "modifyResolvedAttribute", attribute: "con", amount: -1 },
    ]);
  });

  it("excludes an expired Condition from active sources", () => {
    registerDefinition("condition", {
      id: "fading-curse",
      name: "Fading Curse",
      description: "A test Condition.",
      effects: [
        { type: "modifyResolvedAttribute", attribute: "wis", amount: -1 },
      ],
    });

    expect(
      collectConditionEffectSources([
        { conditionId: "fading-curse", remainingDuration: 0 },
      ]),
    ).toEqual([]);

    expect(
      collectConditionEffectSources([
        { conditionId: "fading-curse", remainingDuration: 1 },
      ]),
    ).toHaveLength(1);
  });

  it("adds a treatment-required injury's untreated effects on top of its base effects", () => {
    registerDefinition("injury", {
      id: "sprained-wrist",
      name: "Sprained Wrist",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["hand"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 0.5 },
      effects: [
        { type: "modifyResolvedAttribute", attribute: "dex", amount: -1 },
      ],
      treatmentEffects: {
        untreated: [
          { type: "modifyResolvedAttribute", attribute: "agi", amount: -1 },
        ],
        treated: [
          { type: "modifyResolvedAttribute", attribute: "agi", amount: 0 },
        ],
      },
    });

    const untreated = collectInjuryEffectSources([
      {
        id: "injury-1",
        injuryId: "sprained-wrist",
        location: { continuityKeys: [continuityKey("extremity:upper-left")] },
        treatmentStatus: "untreated",
      },
    ]);

    expect(untreated[0]?.effects).toEqual([
      { type: "modifyResolvedAttribute", attribute: "dex", amount: -1 },
      { type: "modifyResolvedAttribute", attribute: "agi", amount: -1 },
    ]);

    const treated = collectInjuryEffectSources([
      {
        id: "injury-1",
        injuryId: "sprained-wrist",
        location: { continuityKeys: [continuityKey("extremity:upper-left")] },
        treatmentStatus: "treated",
      },
    ]);

    expect(treated[0]?.effects).toEqual([
      { type: "modifyResolvedAttribute", attribute: "dex", amount: -1 },
      { type: "modifyResolvedAttribute", attribute: "agi", amount: 0 },
    ]);
  });

  it("contributes only the base effects for an injury that does not require treatment", () => {
    registerDefinition("injury", {
      id: "bruise",
      name: "Bruise",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["hand"] } },
      recovery: { treatmentRequired: false },
      effects: [
        { type: "modifyResolvedAttribute", attribute: "dex", amount: -1 },
      ],
    });

    const sources = collectInjuryEffectSources([
      {
        id: "injury-1",
        injuryId: "bruise",
        location: { continuityKeys: [continuityKey("extremity:upper-left")] },
      },
    ]);

    expect(sources[0]?.effects).toEqual([
      { type: "modifyResolvedAttribute", attribute: "dex", amount: -1 },
    ]);
  });
});

describe("lifecycle fields reach resolveCharacter and validateCharacter", () => {
  it("resolves a staged Condition's current-stage effects onto the character", () => {
    registerDefinition("condition", {
      id: "worsening-flu",
      name: "Worsening Flu",
      description: "A test Condition.",
      ...WORSENING_CONDITION,
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({
        attributes: { con: 12 },
        conditions: [{ conditionId: "worsening-flu", stage: 2 }],
      }),
    );

    expect(resolved.attributes.resolved.con).toBe(8);
  });

  it("reports an unknown stage as a character validation error", () => {
    registerDefinition("condition", {
      id: "worsening-flu",
      name: "Worsening Flu",
      description: "A test Condition.",
      ...WORSENING_CONDITION,
    });

    const result = validateCharacter(
      createTestCharacter({
        conditions: [{ conditionId: "worsening-flu", stage: 9 }],
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.map((error) => error.code)).toContain(
        "character.condition.lifecycle_invalid",
      );
    }
  });

  it("reports a missing injury treatment status as a character validation error", () => {
    registerDefinition("injury", {
      id: "broken-rib",
      name: "Broken Rib",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["upper-body"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 0.5 },
    });

    const result = validateCharacter(
      createTestCharacter({
        injuries: [
          {
            id: "injury-1",
            injuryId: "broken-rib",
            location: { continuityKeys: [continuityKey("torso:upper")] },
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.map((error) => error.code)).toContain(
        "character.injury.treatment_status_invalid",
      );
    }
  });

  it("accepts a well-formed staged Condition and a well-formed injury together", () => {
    registerDefinition("condition", {
      id: "worsening-flu",
      name: "Worsening Flu",
      description: "A test Condition.",
      ...WORSENING_CONDITION,
    });

    registerDefinition("injury", {
      id: "broken-rib",
      name: "Broken Rib",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["upper-body"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 0.5 },
    });

    const result = validateCharacter(
      createTestCharacter({
        conditions: [{ conditionId: "worsening-flu", stage: 1 }],
        injuries: [
          {
            id: "injury-1",
            injuryId: "broken-rib",
            location: { continuityKeys: [continuityKey("torso:upper")] },
            treatmentStatus: "untreated",
          },
        ],
      }),
    );

    expect(result.success).toBe(true);
  });
});

describe("domain-level lifecycle validation", () => {
  it("does not report a lifecycle issue twice for a duplicated entry", () => {
    const issues = findConditionValidationIssues([
      { conditionId: "prone", severity: -1 },
      { conditionId: "prone", severity: -1 },
    ]);

    const duplicates = issues.filter(
      (issue) => issue.type === "duplicate-condition",
    );
    const lifecycle = issues.filter(
      (issue) => issue.type === "invalid-condition-lifecycle",
    );

    expect(duplicates).toHaveLength(1);
    // Prone has no stages declared, so a severity is the only field to
    // trip — and only once, on the first occurrence.
    expect(lifecycle).toHaveLength(1);
  });

  it("does not judge the lifecycle of an unknown Condition", () => {
    const issues = findConditionValidationIssues([
      { conditionId: "not-real", severity: -1 },
    ]);

    expect(issues).toEqual([
      { type: "unknown-condition", conditionId: "not-real" },
    ]);
  });

  it("finds no injury issues for an empty list", () => {
    expect(findInjuryValidationIssues([])).toEqual([]);
  });
});
